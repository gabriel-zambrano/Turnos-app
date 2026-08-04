import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'

// Letra y nombre del comprobante según su código ARCA
const TIPO_LABEL: Record<number, { nombre: string; letra: string; cod: string }> = {
  1: { nombre: 'FACTURA', letra: 'A', cod: '001' },
  6: { nombre: 'FACTURA', letra: 'B', cod: '006' },
  11: { nombre: 'FACTURA', letra: 'C', cod: '011' },
  3: { nombre: 'NOTA DE CRÉDITO', letra: 'A', cod: '003' },
  8: { nombre: 'NOTA DE CRÉDITO', letra: 'B', cod: '008' },
  13: { nombre: 'NOTA DE CRÉDITO', letra: 'C', cod: '013' },
}

const DOC_TIPO_ARCA: Record<string, number> = {
  DNI: 96, CUIT: 80, CUIL: 86, Pasaporte: 94, 'Sin Identificar': 99,
}

function fmtMoney(n: number) {
  return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtCuit(c: string) {
  const s = String(c).replace(/\D/g, '')
  return s.length === 11 ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : c
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: factura } = await supabase
      .from('facturas')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()

    if (!factura) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    const [{ data: config }, { data: tenant }, { data: items }, { data: pagos }] = await Promise.all([
      supabase.from('arca_config').select('*').eq('tenant_id', factura.tenant_id).maybeSingle(),
      supabase.from('tenants').select('nombre, direccion, telefono').eq('id', factura.tenant_id).maybeSingle(),
      supabase.from('factura_items').select('*').eq('factura_id', params.id).order('orden', { ascending: true }),
      supabase.from('factura_pagos').select('*').eq('factura_id', params.id),
    ])

    // Facturas emitidas antes de esta funcionalidad no tienen detalle:
    // se dibujan como un único renglón, igual que siempre.
    const renglones = (items && items.length > 0)
      ? items.map(i => ({
          descripcion: String(i.descripcion || ''),
          cantidad: Number(i.cantidad ?? 1),
          precio_unitario: Number(i.precio_unitario ?? 0),
          subtotal: Number(i.subtotal ?? 0),
        }))
      : [{
          descripcion: String(factura.concepto || 'Servicios profesionales odontológicos'),
          cantidad: 1,
          precio_unitario: Number(factura.monto),
          subtotal: Number(factura.monto),
        }]

    // Si es nota de crédito, traer el comprobante que anula para citarlo
    let comprobanteAsociado: string | null = null
    if (factura.anula_factura_id) {
      const { data: orig } = await supabase
        .from('facturas')
        .select('tipo_comprobante, punto_venta, nro_comprobante')
        .eq('id', factura.anula_factura_id)
        .maybeSingle()
      if (orig) {
        const l = ({ 1: 'A', 6: 'B', 11: 'C' } as Record<number, string>)[orig.tipo_comprobante] || 'C'
        comprobanteAsociado = `Factura ${l} N° ${String(orig.punto_venta).padStart(4, '0')}-${String(orig.nro_comprobante).padStart(8, '0')}`
      }
    }

    const tipo = TIPO_LABEL[factura.tipo_comprobante] || { nombre: 'FACTURA', letra: 'C', cod: '011' }
    const cuitEmisor = config?.cuit || ''
    const razonSocial = config?.razon_social || tenant?.nombre || 'Consultorio'
    const domicilio = config?.domicilio_comercial || tenant?.direccion || '-'
    const ingresosBrutos = config?.ingresos_brutos || 'EXENTO'
    const inicioAct = config?.inicio_actividades || '-'
    const condIvaEmisor = config?.condicion_iva === 'Monotributista'
      ? 'Responsable Monotributo'
      : (config?.condicion_iva || 'Responsable Monotributo')

    const ptoVta = String(factura.punto_venta).padStart(5, '0')
    const nroCbte = String(factura.nro_comprobante).padStart(8, '0')
    const fecha = new Date(factura.creada_en)
    const fechaStr = fecha.toLocaleDateString('es-AR')
    const fechaISO = fecha.toISOString().split('T')[0]

    // Receptor
    const esConsumidorFinal = factura.paciente_doc_tipo === 'Sin Identificar' || !factura.paciente_doc_nro || factura.paciente_doc_nro === '0'
    const receptorNombre = esConsumidorFinal ? 'CONSUMIDOR FINAL' : factura.paciente_nombre
    const receptorDocLabel = esConsumidorFinal ? 'Nro. Documento' : factura.paciente_doc_tipo
    const receptorDocNro = esConsumidorFinal ? '0' : factura.paciente_doc_nro

    // ── QR según RG 4892 ──
    const qrPayload = {
      ver: 1, fecha: fechaISO,
      cuit: Number(String(cuitEmisor).replace(/\D/g, '')) || 0,
      ptoVta: factura.punto_venta, tipoCmp: factura.tipo_comprobante, nroCmp: factura.nro_comprobante,
      importe: Number(factura.monto), moneda: 'PES', ctz: 1,
      tipoDocRec: DOC_TIPO_ARCA[factura.paciente_doc_tipo] ?? 99,
      nroDocRec: Number(String(factura.paciente_doc_nro).replace(/\D/g, '')) || 0,
      tipoCodAut: 'E', codAut: Number(String(factura.cae).replace(/\D/g, '')) || 0,
    }
    const qrUrl = 'https://www.afip.gob.ar/fe/qr/?p=' + Buffer.from(JSON.stringify(qrPayload)).toString('base64')
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 240 })
    const qrPng = await (await PDFDocument.create()).embedPng(Buffer.from(qrDataUrl.split(',')[1], 'base64')).catch(() => null)

    // ── PDF ──
    const pdf = await PDFDocument.create()
    // `let` y no `const`: con muchos renglones el detalle se corta en páginas
    // y los helpers de dibujo tienen que escribir en la página actual.
    let page = pdf.addPage([595.28, 841.89]) // A4
    const { width, height } = page.getSize()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const qrImg = qrPng ? await pdf.embedPng(Buffer.from(qrDataUrl.split(',')[1], 'base64')) : null

    const ink = rgb(0.1, 0.1, 0.12)
    const gray = rgb(0.35, 0.4, 0.45)
    const linec = rgb(0.7, 0.73, 0.77)
    const M = 34
    const R = width - M

    const t = (s: string, x: number, y: number, size = 9, f = font, color = ink) =>
      page.drawText(s ?? '', { x, y, size, font: f, color })
    const hline = (y: number, x1 = M, x2 = R, c = linec, w = 0.7) =>
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: w, color: c })
    const vline = (x: number, y1: number, y2: number, c = linec, w = 0.7) =>
      page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: w, color: c })

    let y = height - M

    // ── Encabezado con recuadro y letra grande al medio ──
    t('ORIGINAL', width / 2 - 20, y - 4, 8, font, gray)
    const boxTop = y - 14
    const boxH = 74
    page.drawRectangle({ x: M, y: boxTop - boxH, width: R - M, height: boxH, borderColor: linec, borderWidth: 0.7 })
    // Caja central con la letra
    const cx = width / 2
    vline(cx, boxTop, boxTop - boxH)
    page.drawRectangle({ x: cx - 24, y: boxTop - 46, width: 48, height: 46, borderColor: linec, borderWidth: 0.7, color: rgb(1, 1, 1) })
    t(tipo.letra, cx - 9, boxTop - 36, 30, bold)
    t(`COD. ${tipo.cod}`, cx - 17, boxTop - 60, 8, font, gray)

    // Lado izquierdo: emisor
    t(razonSocial, M + 10, boxTop - 22, 15, bold)
    t(tipo.nombre, M + 10, boxTop - 44, 12, bold, gray)

    // Lado derecho: numeración y fecha
    const rx = cx + 12
    t('Punto de Venta: ' + ptoVta, rx, boxTop - 16, 9, bold)
    t('Comp. Nro: ' + nroCbte, rx + 140, boxTop - 16, 9, bold)
    t('Fecha de Emisión: ' + fechaStr, rx, boxTop - 34, 9)
    t('CUIT: ' + fmtCuit(cuitEmisor), rx, boxTop - 50, 9)

    // ── Datos fiscales del emisor ──
    y = boxTop - boxH - 16
    t('Razón Social: ' + razonSocial, M, y, 9)
    t('Ingresos Brutos: ' + ingresosBrutos, cx + 12, y, 9)
    y -= 14
    t('Domicilio Comercial: ' + domicilio, M, y, 9) // fila completa (puede ser largo)
    y -= 14
    t('Condición frente al IVA: ' + condIvaEmisor, M, y, 9)
    t('Fecha de Inicio de Actividades: ' + inicioAct, cx + 12, y, 9)

    // ── Período facturado ──
    y -= 18
    hline(y + 8)
    t(`Período Facturado Desde: ${fechaStr}  Hasta: ${fechaStr}`, M, y - 4, 9)
    t('Fecha de Vto. para el pago: ' + fechaStr, cx + 12, y - 4, 9)
    y -= 12
    hline(y - 2)

    // ── Datos del receptor ──
    y -= 16
    t(`${receptorDocLabel}: ${receptorDocNro}`, M, y, 9)
    t('Apellido y Nombre / Razón Social: ' + receptorNombre, cx - 80, y, 9)
    y -= 14
    t('Condición frente al IVA: Consumidor Final', M, y, 9)
    y -= 14
    t('Condición de venta: ' + (factura.condicion_venta || 'Contado'), M, y, 9)

    // Comprobante asociado (solo en notas de crédito)
    if (comprobanteAsociado) {
      y -= 14
      t('Comprobante asociado: ' + comprobanteAsociado, M, y, 9, bold)
    }

    // ── Tabla de ítems ──
    const cols = { desc: M + 4, cant: R - 210, punit: R - 150, sub: R - 70 }

    const cabeceraTabla = () => {
      page.drawRectangle({ x: M, y: y - 4, width: R - M, height: 18, color: rgb(0.93, 0.94, 0.96) })
      t('Producto / Servicio', cols.desc, y, 8, bold, gray)
      t('Cantidad', cols.cant, y, 8, bold, gray)
      t('Precio Unit.', cols.punit, y, 8, bold, gray)
      t('Subtotal', cols.sub, y, 8, bold, gray)
      y -= 22
    }

    /** Reserva espacio; si no entra, abre una página nueva y repite la cabecera. */
    const asegurarEspacio = (alto: number, conCabecera = false) => {
      if (y - alto > 110) return
      page = pdf.addPage([595.28, 841.89])
      y = height - M - 20
      if (conCabecera) cabeceraTabla()
    }

    y -= 22
    cabeceraTabla()

    for (const r of renglones) {
      asegurarEspacio(18, true)
      // 58 caracteres es lo que entra antes de pisar la columna Cantidad
      t(r.descripcion.slice(0, 58), cols.desc, y, 9)
      t(r.cantidad.toLocaleString('es-AR', { minimumFractionDigits: 2 }), cols.cant, y, 9)
      t(fmtMoney(r.precio_unitario), cols.punit, y, 9)
      t(fmtMoney(r.subtotal), cols.sub, y, 9)
      y -= 16
    }
    y += 6
    hline(y)

    // ── Totales ──
    asegurarEspacio(70)
    y -= 20
    t('Subtotal:', R - 200, y, 10)
    t(fmtMoney(factura.monto), R - 90, y, 10)
    y -= 16
    t('Importe Otros Tributos:', R - 200, y, 10)
    t(fmtMoney(0), R - 90, y, 10)
    y -= 18
    t('Importe Total:', R - 200, y, 12, bold)
    t(fmtMoney(factura.monto), R - 90, y, 12, bold)

    // ── Desglose de formas de pago (INFORMATIVO, no fiscal) ──
    // La condición de venta declarada ante ARCA es una sola (arriba). Esto es
    // el detalle real de cómo se cobró, para el paciente y para la caja.
    if (pagos && pagos.length > 1) {
      asegurarEspacio(30 + pagos.length * 14)
      y -= 26
      t('Detalle de formas de pago', M, y, 9, bold, gray)
      y -= 6
      hline(y, M, M + 240)
      for (const p of pagos) {
        y -= 14
        t(String(p.forma_pago), M + 4, y, 9)
        t(fmtMoney(Number(p.monto)), M + 160, y, 9)
      }
      y -= 6
    }

    // ── Bloque QR + CAE ──
    asegurarEspacio(70)
    y -= 50
    if (qrImg) page.drawImage(qrImg, { x: M, y: y - 44, width: 88, height: 88 })
    t('CAE N°: ' + factura.cae, M + 104, y + 24, 11, bold)
    t('Fecha de Vto. de CAE: ' + new Date(factura.cae_expira).toLocaleDateString('es-AR'), M + 104, y + 8, 9)
    t(factura.simulada ? 'COMPROBANTE DE PRUEBA — SIN VALIDEZ FISCAL' : 'Comprobante Autorizado', M + 104, y - 12, 10, bold,
      factura.simulada ? rgb(0.7, 0.2, 0.1) : rgb(0.1, 0.45, 0.2))

    // Marca de agua para simuladas
    if (factura.simulada) {
      page.drawText('SIMULADO', {
        x: 120, y: 430, size: 72, font: bold,
        color: rgb(0.85, 0.3, 0.2), opacity: 0.1, rotate: { type: 'degrees', angle: 35 } as any,
      })
    }

    // Pie en todas las páginas (el detalle largo puede ocupar más de una)
    const paginas = pdf.getPages()
    paginas.forEach((p, i) => {
      p.drawText('Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación.',
        { x: M, y: 40, size: 7, font, color: gray })
      p.drawText(`Pág. ${i + 1}/${paginas.length}`, { x: R - 50, y: 40, size: 7, font, color: gray })
    })

    const bytes = await pdf.save()
    const nombreArchivo = `Factura_${tipo.letra}_${ptoVta}-${nroCbte}.pdf`

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nombreArchivo}"`,
      },
    })
  } catch (err: any) {
    console.error('Error en GET /api/facturacion/pdf:', err?.message || err)
    return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 500 })
  }
}
