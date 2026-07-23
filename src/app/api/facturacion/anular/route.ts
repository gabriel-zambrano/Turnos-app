import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

const DOC_TIPO_ARCA: Record<string, number> = {
  DNI: 96, CUIT: 80, CUIL: 86, Pasaporte: 94, 'Sin Identificar': 99,
}
const ALICUOTA_ID: Record<string, number> = { '0': 3, '10.5': 4, '21': 5 }

// Factura → Nota de Crédito del mismo tipo (ARCA)
const NC_DE_FACTURA: Record<number, number> = {
  1: 3,   // Factura A → Nota de Crédito A
  6: 8,   // Factura B → Nota de Crédito B
  11: 13, // Factura C → Nota de Crédito C
}

export async function POST(req: Request) {
  try {
    const { tenantId, facturaId } = await req.json()

    if (!tenantId || !facturaId) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Permiso: debe pertenecer al tenant y ser admin/owner para anular
    const { data: membership } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No autorizado para este consultorio' }, { status: 403 })
    }
    if (membership.role !== 'admin' && membership.role !== 'owner') {
      return NextResponse.json({ error: 'Solo un administrador puede anular comprobantes' }, { status: 403 })
    }

    // Factura original a anular
    const { data: original } = await supabase
      .from('facturas')
      .select('*')
      .eq('id', facturaId)
      .eq('tenant_id', tenantId)
      .eq('estado', 'emitida')
      .maybeSingle()

    if (!original) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    const ncTipo = NC_DE_FACTURA[original.tipo_comprobante]
    if (!ncTipo) {
      return NextResponse.json({ error: 'Este comprobante no admite nota de crédito' }, { status: 400 })
    }
    if (original.anula_factura_id) {
      return NextResponse.json({ error: 'Una nota de crédito no se puede anular' }, { status: 400 })
    }

    // ¿Ya fue anulada?
    const { data: ncExistente } = await supabase
      .from('facturas')
      .select('id, nro_comprobante')
      .eq('tenant_id', tenantId)
      .eq('anula_factura_id', facturaId)
      .eq('estado', 'emitida')
      .maybeSingle()

    if (ncExistente) {
      return NextResponse.json({ error: `Esta factura ya fue anulada (Nota de Crédito N°: ${ncExistente.nro_comprobante})` }, { status: 400 })
    }

    // Config fiscal
    const { data: arcaConfig } = await supabase
      .from('arca_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .maybeSingle()

    if (!arcaConfig) {
      return NextResponse.json({ error: 'La clínica no tiene la facturación electrónica configurada' }, { status: 400 })
    }

    const esSimulada = !process.env.ARCA_CERT || !process.env.ARCA_PRIVATE_KEY || !process.env.ARCA_CUIT
    const puntoVenta = original.punto_venta
    const monto = Number(original.monto)

    let nroComprobante: number
    let cae: string
    let caeExpira: string

    if (esSimulada) {
      const { data: last } = await supabase
        .from('facturas')
        .select('nro_comprobante')
        .eq('tenant_id', tenantId)
        .eq('punto_venta', puntoVenta)
        .eq('tipo_comprobante', ncTipo)
        .order('nro_comprobante', { ascending: false })
        .limit(1)
        .maybeSingle()

      nroComprobante = last ? last.nro_comprobante + 1 : 1
      cae = '74' + Math.floor(100000000000 + Math.random() * 900000000000)
      caeExpira = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    } else {
      try {
        const Afip = require('@afipsdk/afip.js')
        const cert = String(process.env.ARCA_CERT).replace(/\\n/g, '\n')
        const key = String(process.env.ARCA_PRIVATE_KEY).replace(/\\n/g, '\n')
        const cuitClinica = Number(String(arcaConfig.cuit).replace(/-/g, ''))

        const afip = new Afip({
          CUIT: cuitClinica,
          cert,
          key,
          production: process.env.ARCA_PRODUCTION === 'true',
          access_token: process.env.ARCA_SDK_TOKEN,
        })

        const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, ncTipo)
        nroComprobante = Number(lastVoucher) + 1

        const docTipoArca = DOC_TIPO_ARCA[original.paciente_doc_tipo] ?? 99
        const docNroArca = docTipoArca === 99 ? 0 : Number(String(original.paciente_doc_nro).replace(/[-.]/g, ''))
        const condicionIvaReceptor = ncTipo === 3 ? 1 : 5

        const alicuota = String(arcaConfig.alicuota_iva ?? 10.5)
        const alicuotaId = ALICUOTA_ID[alicuota] ?? 4
        const desagregaIva = ncTipo !== 13 && alicuota !== '0'

        const impTotal = Math.round(monto * 100) / 100
        const impNeto = desagregaIva ? Math.round((impTotal / (1 + Number(alicuota) / 100)) * 100) / 100 : impTotal
        const impIva = Math.round((impTotal - impNeto) * 100) / 100
        const hoy = new Date().toISOString().split('T')[0].replace(/-/g, '')

        const ncData: Record<string, unknown> = {
          CantReg: 1,
          PtoVta: puntoVenta,
          CbteTipo: ncTipo,
          Concepto: 2,
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
          // Comprobante asociado: la factura original que se está anulando
          CbtesAsoc: [
            {
              Tipo: original.tipo_comprobante,
              PtoVta: original.punto_venta,
              Nro: original.nro_comprobante,
            },
          ],
        }

        if (desagregaIva) {
          ncData.Iva = [{ Id: alicuotaId, BaseImp: impNeto, Importe: impIva }]
        }

        const arcaRes = await afip.ElectronicBilling.createVoucher(ncData)
        cae = arcaRes.CAE
        const v = String(arcaRes.CAEFchVto)
        caeExpira = v.includes('-') ? v : `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
      } catch (sdkErr: any) {
        console.error('Error de ARCA (anulación):', sdkErr)
        return NextResponse.json({ error: `Error de ARCA: ${sdkErr.message || 'No se pudo emitir la nota de crédito.'}` }, { status: 502 })
      }
    }

    const { data: nc, error: insertError } = await supabase
      .from('facturas')
      .insert({
        tenant_id: tenantId,
        cita_id: original.cita_id,
        ingreso_manual_id: original.ingreso_manual_id,
        tipo_comprobante: ncTipo,
        punto_venta: puntoVenta,
        nro_comprobante: nroComprobante,
        cae,
        cae_expira: caeExpira,
        monto,
        paciente_nombre: original.paciente_nombre,
        paciente_doc_tipo: original.paciente_doc_tipo,
        paciente_doc_nro: original.paciente_doc_nro,
        concepto: `Anula comprobante N°${String(original.punto_venta).padStart(4, '0')}-${String(original.nro_comprobante).padStart(8, '0')}`,
        estado: 'emitida',
        simulada: esSimulada,
        anula_factura_id: original.id,
      })
      .select()
      .single()

    if (insertError) {
      if ((insertError as any).code === '23505') {
        return NextResponse.json({ error: 'Se generó otra numeración al mismo tiempo. Reintentá en unos segundos.' }, { status: 409 })
      }
      const prefijo = esSimulada
        ? 'Error al registrar la nota de crédito'
        : `Nota de crédito autorizada por ARCA (CAE: ${cae}) pero falló el registro local`
      return NextResponse.json({ error: `${prefijo}: ${insertError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, simulado: esSimulada, notaCredito: nc })
  } catch (err: any) {
    console.error('Error en POST /api/facturacion/anular:', err?.message || err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
