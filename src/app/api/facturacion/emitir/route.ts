import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  CONDICIONES_VENTA, sumarMontos, desagregarIva,
  condicionVentaDominante, agruparPagos,
  desglosarFacturable, pagosFacturables, FORMAS_PAGO_FACTURABLES_DEFAULT,
} from '@/lib/pagos'

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
      condicionVenta,
      // El usuario confirmó facturar aunque el cobro no entre en el criterio
      // de medios facturables de la clínica (ej: paciente que pagó en efectivo
      // pero necesita el comprobante para el reintegro de la obra social).
      forzarNoFacturable,
    } = body

    // Condición de venta elegida a mano. Si la cita tiene pagos cargados,
    // más abajo la sobreescribe la condición dominante de esos pagos.
    let condVenta = (CONDICIONES_VENTA as readonly string[]).includes(condicionVenta) ? condicionVenta : 'Contado'

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
    //
    // El monto SIEMPRE se recalcula acá desde la base. Nunca se toma del body:
    // el cliente no puede inflar ni desinflar el importe de un comprobante fiscal.
    let monto = 0
    let concepto = 'Servicios profesionales odontológicos'
    let pacienteId: string | null = null
    let itemsFactura: { orden: number; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[] = []
    let pagosFactura: { forma_pago: string; monto: number }[] = []

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

      pacienteId = cita.paciente_id

      // Renglones de tratamiento de esta cita (caries + ortodoncia + limpieza…)
      const { data: items } = await supabase
        .from('tratamiento_items')
        .select('orden, descripcion, cantidad, precio_unitario, subtotal')
        .eq('cita_id', citaId)
        .eq('tenant_id', tenantId)
        .order('orden', { ascending: true })

      if (items && items.length > 0) {
        itemsFactura = items.map((i, idx) => ({
          orden: i.orden ?? idx,
          descripcion: i.descripcion,
          cantidad: Number(i.cantidad),
          precio_unitario: Number(i.precio_unitario),
          // `subtotal` es una columna GENERATED: ya viene calculada y redondeada por Postgres.
          subtotal: Number(i.subtotal),
        }))
        // Suma en centavos enteros: el total tiene que cuadrar exacto contra
        // la columna de subtotales del PDF y contra ImpNeto + ImpIVA de ARCA.
        monto = sumarMontos(itemsFactura.map(i => i.subtotal))
        concepto = itemsFactura.map(i => i.descripcion).join(' + ')
      } else {
        // Cita vieja sin detalle cargado: se comporta igual que antes.
        monto = cita.precio_cobrado ?? cita.valor ?? 0
        concepto = cita.tipo_tratamiento || concepto
        itemsFactura = [{ orden: 0, descripcion: concepto, cantidad: 1, precio_unitario: monto, subtotal: monto }]
      }

      // Desglose real de formas de pago (informativo; ARCA acepta una sola
      // condición de venta, que se deriva del medio con el que más se pagó).
      const { data: pagos } = await supabase
        .from('pagos')
        .select('forma_pago, monto, requiere_factura')
        .eq('cita_id', citaId)
        .eq('tenant_id', tenantId)

      if (pagos && pagos.length > 0) {
        const todos = pagos.map(p => ({
          forma_pago: p.forma_pago,
          monto: Number(p.monto),
          // Manda la decisión que se tomó al cobrar, no el medio de pago.
          requiere_factura: p.requiere_factura,
        }))

        // Criterio de la clínica sobre qué medios de pago factura.
        const formasOk: string[] = arcaConfig.formas_pago_facturables ?? FORMAS_PAGO_FACTURABLES_DEFAULT
        const desglose = desglosarFacturable(todos, formasOk)

        if (desglose.nadaFacturable && !forzarNoFacturable) {
          return NextResponse.json({
            error: `Este cobro se hizo con ${desglose.formasNoFacturables.join(' y ')}, que esta clínica no factura. Confirmá si querés emitirla igual.`,
            requiereConfirmacion: true,
            desglose,
          }, { status: 409 })
        }

        if (desglose.esParcial && !forzarNoFacturable) {
          // Se factura solo la porción facturable. El detalle por tratamiento
          // no puede mantenerse: los renglones suman el total del turno y
          // dejarían un comprobante cuyos ítems no cuadran contra el importe.
          // Se reemplaza por un renglón único de pago parcial.
          monto = desglose.facturable
          const tratamientos = itemsFactura.map(i => i.descripcion).join(' + ')
          concepto = `Pago parcial — ${tratamientos}`
          itemsFactura = [{ orden: 0, descripcion: concepto, cantidad: 1, precio_unitario: monto, subtotal: monto }]
        }

        // El desglose impreso y la condición de venta salen SOLO de los pagos
        // que se están facturando: el comprobante no puede declarar un medio
        // de pago por el que no se emitió.
        const facturados = forzarNoFacturable ? todos : pagosFacturables(todos, formasOk)
        pagosFactura = agruparPagos(facturados.length > 0 ? facturados : todos)
        condVenta = condicionVentaDominante(pagosFactura)
      }
    } else {
      const { data: ingreso } = await supabase
        .from('ingresos_manuales')
        .select('monto, concepto, forma_pago, requiere_factura')
        .eq('id', ingresoManualId)
        .eq('tenant_id', tenantId)
        .single()

      if (!ingreso) {
        return NextResponse.json({ error: 'Ingreso manual no encontrado' }, { status: 404 })
      }

      // Los ingresos sueltos también respetan la marca: antes se facturaban
      // siempre, sin importar cómo había entrado la plata.
      if (ingreso.requiere_factura === false && !forzarNoFacturable) {
        return NextResponse.json({
          error: `Este ingreso se cobró en ${ingreso.forma_pago || 'un medio que no facturás'} y quedó marcado como no facturable. Confirmá si querés emitirla igual.`,
          requiereConfirmacion: true,
          desglose: { total: Number(ingreso.monto), facturable: 0, noFacturable: Number(ingreso.monto),
            formasNoFacturables: ingreso.forma_pago ? [ingreso.forma_pago] : [], esParcial: false, nadaFacturable: true },
        }, { status: 409 })
      }

      if (ingreso.forma_pago) {
        pagosFactura = [{ forma_pago: ingreso.forma_pago, monto: Number(ingreso.monto) }]
        condVenta = condicionVentaDominante(pagosFactura)
      }

      monto = Number(ingreso.monto)
      concepto = ingreso.concepto || 'Ingreso de caja'
      itemsFactura = [{ orden: 0, descripcion: concepto, cantidad: 1, precio_unitario: monto, subtotal: monto }]
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
          access_token: process.env.ARCA_SDK_TOKEN, // token de la plataforma AfipSDK
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

        // Se desagrega en centavos enteros y el IVA sale por diferencia:
        // garantiza ImpTotal == ImpNeto + ImpIVA al centavo (ARCA error 10048).
        const { neto: impNeto, iva: impIva, total: impTotal } =
          desagregarIva(monto, desagregaIva ? Number(alicuota) : 0)

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

    // 7. Registrar la factura junto con su detalle, en UNA transacción.
    //
    // Va por RPC y no por tres INSERT sueltos: si el segundo fallara quedaría
    // una factura con CAE autorizado por ARCA y sin renglones, y `facturas`
    // no tiene política de UPDATE para poder repararla después.
    const { data: factura, error: insertError } = await supabase
      .rpc('emitir_factura_con_detalle', {
        p_tenant_id: tenantId,
        p_cita_id: citaId || null,
        p_ingreso_manual_id: ingresoManualId || null,
        p_tipo_comprobante: cbteTipo,
        p_punto_venta: puntoVenta,
        p_nro_comprobante: nroComprobante,
        p_cae: cae,
        p_cae_expira: caeExpira,
        p_monto: monto,
        p_paciente_nombre: pacienteNombre,
        p_paciente_doc_tipo: pacienteDocTipo,
        p_paciente_doc_nro: pacienteDocNro || '0',
        p_concepto: concepto.slice(0, 500),
        p_condicion_venta: condVenta,
        p_simulada: esSimulada,
        p_items: itemsFactura,
        p_pagos: pagosFactura,
      })
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
