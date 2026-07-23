import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Códigos de tipo de documento según ARCA
const DOC_TIPO_ARCA: Record<string, number> = {
  DNI: 96,
  CUIT: 80,
  CUIL: 86,
  Pasaporte: 94,
  'Sin Identificar': 99,
}

// Id de alícuota IVA según tabla de ARCA
const ALICUOTA_ID: Record<string, number> = {
  '0': 3,     // 0%
  '10.5': 4,  // 10,5%
  '21': 5,    // 21%
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      tenantId,
      citaId,
      ingresoManualId,
      pacienteDocTipo,
      pacienteDocNro,
      pacienteNombre,
      tipoComprobante, // 11=Factura C, 6=Factura B, 1=Factura A
    } = body

    if (!tenantId || !pacienteDocTipo || !pacienteNombre || !tipoComprobante) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 })
    }
    if (!citaId && !ingresoManualId) {
      return NextResponse.json({ error: 'Debe indicarse una cita o un ingreso manual a facturar' }, { status: 400 })
    }
    if (![1, 6, 11].includes(Number(tipoComprobante))) {
      return NextResponse.json({ error: 'Tipo de comprobante inválido' }, { status: 400 })
    }
    if (!(pacienteDocTipo in DOC_TIPO_ARCA)) {
      return NextResponse.json({ error: 'Tipo de documento inválido' }, { status: 400 })
    }
    if (pacienteDocTipo !== 'Sin Identificar' && !pacienteDocNro) {
      return NextResponse.json({ error: 'Falta el número de documento del paciente' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // 1. Verificar pertenencia al tenant
    const { data: membership } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No autorizado para este consultorio' }, { status: 403 })
    }

    // 2. Obtener configuración fiscal de la clínica
    const { data: arcaConfig } = await supabase
      .from('arca_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .maybeSingle()

    if (!arcaConfig) {
      return NextResponse.json({ error: 'La clínica no tiene la facturación electrónica activa o configurada' }, { status: 400 })
    }

    // 3. Verificar si ya fue facturado
    const facturaExistenteQuery = supabase
      .from('facturas')
      .select('id, nro_comprobante')
      .eq('tenant_id', tenantId)
      .eq('estado', 'emitida')

    if (citaId) {
      const { data: existingFactura } = await facturaExistenteQuery.eq('cita_id', citaId).maybeSingle()
      if (existingFactura) {
        return NextResponse.json({ error: `Esta cita ya fue facturada (Factura Nro: ${existingFactura.nro_comprobante})` }, { status: 400 })
      }
    } else {
      const { data: existingFactura } = await facturaExistenteQuery.eq('ingreso_manual_id', ingresoManualId).maybeSingle()
      if (existingFactura) {
        return NextResponse.json({ error: `Este ingreso manual ya fue facturado (Factura Nro: ${existingFactura.nro_comprobante})` }, { status: 400 })
      }
    }

    // 4. Obtener monto y detalles del servicio a facturar (siempre dentro del tenant)
    let monto = 0
    let pacienteId: string | null = null

    if (citaId) {
      const { data: cita } = await supabase
        .from('citas')
        .select('valor, precio_cobrado, sena, tipo_tratamiento, paciente_id')
        .eq('id', citaId)
        .eq('tenant_id', tenantId)
        .single()

      if (!cita) {
        return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
      }

      monto = cita.precio_cobrado ?? cita.valor ?? 0
      pacienteId = cita.paciente_id
    } else {
      const { data: ingreso } = await supabase
        .from('ingresos_manuales')
        .select('monto, concepto')
        .eq('id', ingresoManualId)
        .eq('tenant_id', tenantId)
        .single()

      if (!ingreso) {
        return NextResponse.json({ error: 'Ingreso manual no encontrado' }, { status: 404 })
      }

      monto = ingreso.monto
    }

    if (monto <= 0) {
      return NextResponse.json({ error: 'El monto a facturar debe ser mayor a cero' }, { status: 400 })
    }

    // 5. Actualizar información fiscal del paciente
    if (pacienteId && pacienteDocTipo !== 'Sin Identificar') {
      await supabase
        .from('pacientes')
        .update({
          dni_cuit: pacienteDocNro,
          tipo_documento: pacienteDocTipo,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', pacienteId)
        .eq('tenant_id', tenantId)
    }

    // 6. Modo de emisión: lo decide el SERVIDOR según haya credenciales de plataforma.
    //    Sin credenciales → simulación (CAE ficticio, factura marcada como simulada).
    const esSimulada = !process.env.ARCA_CERT || !process.env.ARCA_PRIVATE_KEY || !process.env.ARCA_CUIT

    const puntoVenta = arcaConfig.punto_venta
    const cbteTipo = Number(tipoComprobante)

    let nroComprobante: number
    let cae: string
    let caeExpira: string

    if (esSimulada) {
      // ── MODO SIMULACIÓN ──
      const { data: lastFactura } = await supabase
        .from('facturas')
        .select('nro_comprobante')
        .eq('tenant_id', tenantId)
        .eq('punto_venta', puntoVenta)
        .eq('tipo_comprobante', cbteTipo)
        .order('nro_comprobante', { ascending: false })
        .limit(1)
        .maybeSingle()

      nroComprobante = lastFactura ? lastFactura.nro_comprobante + 1 : 1
      cae = '74' + Math.floor(100000000000 + Math.random() * 900000000000) // CAE ficticio de 14 dígitos
      caeExpira = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    } else {
      // ── MODO CONEXIÓN REAL A ARCA ──
      try {
        const Afip = require('@afipsdk/afip.js')

        // Esquema de delegación: el certificado es de la PLATAFORMA, pero el CUIT
        // emisor es el de la CLÍNICA (que delegó wsfe a la plataforma en ARCA).
        const cuitClinica = Number(String(arcaConfig.cuit).replace(/-/g, ''))

        // Normaliza \n escapados (cómodos de pegar como variable de entorno) a saltos reales
        const cert = String(process.env.ARCA_CERT).replace(/\\n/g, '\n')
        const key = String(process.env.ARCA_PRIVATE_KEY).replace(/\\n/g, '\n')

        const afip = new Afip({
          CUIT: cuitClinica,
          cert,
          key,
          production: process.env.ARCA_PRODUCTION === 'true',
        })

        // Consultar último comprobante autorizado para esta clínica
        const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, cbteTipo)
        nroComprobante = Number(lastVoucher) + 1

        // Mapeo de documento del receptor
        const docTipoArca = DOC_TIPO_ARCA[pacienteDocTipo]
        const docNroArca = docTipoArca === 99 ? 0 : Number(String(pacienteDocNro).replace(/[-.]/g, ''))

        // Condición IVA del receptor (RG 5616, obligatorio):
        // Factura A → 1 (Responsable Inscripto); B y C → 5 (Consumidor Final)
        const condicionIvaReceptor = cbteTipo === 1 ? 1 : 5

        // Importes: Factura C no desagrega IVA; A/B usan la alícuota configurada
        const alicuota = String(arcaConfig.alicuota_iva ?? 10.5)
        const alicuotaId = ALICUOTA_ID[alicuota] ?? 4
        const desagregaIva = cbteTipo !== 11 && alicuota !== '0'

        const impTotal = Math.round(monto * 100) / 100
        const impNeto = desagregaIva
          ? Math.round((impTotal / (1 + Number(alicuota) / 100)) * 100) / 100
          : impTotal
        const impIva = Math.round((impTotal - impNeto) * 100) / 100 // cuadra exacto contra el total

        const hoy = new Date().toISOString().split('T')[0].replace(/-/g, '') // AAAAMMDD

        const invoiceData: Record<string, unknown> = {
          CantReg: 1,
          PtoVta: puntoVenta,
          CbteTipo: cbteTipo,
          Concepto: 2, // Servicios (tratamiento odontológico)
          DocTipo: docTipoArca,
          DocNro: docNroArca,
          CbteDesde: nroComprobante,
          CbteHasta: nroComprobante,
          CbteFch: hoy,
          FchServDesde: hoy,
          FchServHasta: hoy,
          FchVtoPago: hoy,
          ImpTotal: impTotal,
          ImpTotConc: 0,
          ImpNeto: impNeto,
          ImpOpEx: 0,
          ImpIVA: desagregaIva ? impIva : 0,
          ImpTrib: 0,
          MonId: 'PES',
          MonCotiz: 1,
          CondicionIVAReceptorId: condicionIvaReceptor,
        }

        if (desagregaIva) {
          invoiceData.Iva = [
            {
              Id: alicuotaId,
              BaseImp: impNeto,
              Importe: impIva,
            },
          ]
        }

        const arcaRes = await afip.ElectronicBilling.createVoucher(invoiceData)
        cae = arcaRes.CAE
        // ARCA devuelve AAAAMMDD → normalizamos a AAAA-MM-DD para la columna DATE
        const v = String(arcaRes.CAEFchVto)
        caeExpira = v.includes('-') ? v : `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
      } catch (sdkErr: any) {
        console.error('Error de comunicación con ARCA SDK:', sdkErr)
        return NextResponse.json({
          error: `Error de ARCA: ${sdkErr.message || 'No se pudo autorizar el comprobante. Por favor intente más tarde.'}`,
        }, { status: 502 })
      }
    }

    // 7. Registrar la factura
    const { data: factura, error: insertError } = await supabase
      .from('facturas')
      .insert({
        tenant_id: tenantId,
        cita_id: citaId || null,
        ingreso_manual_id: ingresoManualId || null,
        tipo_comprobante: cbteTipo,
        punto_venta: puntoVenta,
        nro_comprobante: nroComprobante,
        cae,
        cae_expira: caeExpira,
        monto,
        paciente_nombre: pacienteNombre,
        paciente_doc_tipo: pacienteDocTipo,
        paciente_doc_nro: pacienteDocNro || '0',
        estado: 'emitida',
        simulada: esSimulada,
      })
      .select()
      .single()

    if (insertError) {
      // 23505 = violación del índice único de numeración (emisión concurrente)
      if ((insertError as any).code === '23505') {
        return NextResponse.json({ error: 'Otra factura se emitió al mismo tiempo. Reintentá en unos segundos.' }, { status: 409 })
      }
      const prefijo = esSimulada
        ? 'Error al registrar factura'
        : `Factura autorizada por ARCA (CAE: ${cae}) pero falló el registro local`
      return NextResponse.json({ error: `${prefijo}: ${insertError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      simulado: esSimulada,
      factura,
    })
  } catch (err: any) {
    console.error('Error en POST /api/facturacion/emitir:', err?.message || err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
