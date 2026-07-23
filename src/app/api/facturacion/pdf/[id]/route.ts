import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'

// Nombre legible del comprobante según su código ARCA
const TIPO_LABEL: Record<number, { nombre: string; letra: string }> = {
  1: { nombre: 'FACTURA', letra: 'A' },
  6: { nombre: 'FACTURA', letra: 'B' },
  11: { nombre: 'FACTURA', letra: 'C' },
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

    // RLS limita esta lectura a facturas del tenant del usuario
    const { data: factura } = await supabase
      .from('facturas')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()

    if (!factura) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    const [{ data: config }, { data: tenant }] = await Promise.all([
      supabase.from('arca_config').select('*').eq('tenant_id', factura.tenant_id).maybeSingle(),
      supabase.from('tenants').select('nombre, direccion, telefono').eq('id', factura.tenant_id).maybeSingle(),
    ])

    const tipo = TIPO_LABEL[factura.tipo_comprobante] || { nombre: 'COMPROBANTE', letra: 'C' }
    const cuitEmisor = config?.cuit || ''
    const ptoVta = String(factura.punto_venta).padStart(5, '0')
    const nroCbte = String(factura.nro_comprobante).padStart(8, '0')
    const fecha = new Date(factura.creada_en)
    const fechaStr = fecha.toLocaleDateString('es-AR')
    const fechaISO = fecha.toISOString().split('T')[0]

    // ── QR según RG 4892 ──
    const qrPayload = {
      ver: 1,
      fecha: fechaISO,
      cuit: Number(String(cuitEmisor).replace(/\D/g, '')) || 0,
      ptoVta: factura.punto_venta,
      tipoCmp: factura.tipo_comprobante,
      nroCmp: factura.nro_comprobante,
      importe: Number(factura.monto),
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: DOC_TIPO_ARCA[factura.paciente_doc_tipo] ?? 99,
      nroDocRec: Number(String(factura.paciente_doc_nro).replace(/\D/g, '')) || 0,
      tipoCodAut: 'E',
      codAut: Number(String(factura.cae).replace(/\D/g, '')) || 0,
    }
    const qrUrl = 'https://www.afip.gob.ar/fe/qr/?p=' + Buffer.from(JSON.stringify(qrPayload)).toString('base64')
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 220 })
    const qrPngBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64')

    // ── Construcción del PDF ──
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595.28, 841.89]) // A4 en puntos
    const { width, height } = page.getSize()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const qrImg = await pdf.embedPng(qrPngBytes)

    const navy = rgb(0.04, 0.12, 0.24)
    const gray = rgb(0.4, 0.45, 0.5)
    const line = rgb(0.8, 0.83, 0.86)
    const M = 40

    const text = (s: string, x: number, y: number, size = 10, f = font, color = navy) =>
      page.drawText(s, { x, y, size, font: f, color })

    // Marco superior con la letra del comprobante
    page.drawRectangle({ x: M, y: height - 110, width: width - 2 * M, height: 70, borderColor: line, borderWidth: 1 })
    page.drawLine({ start: { x: width / 2, y: height - 40 }, end: { x: width / 2, y: height - 110 }, thickness: 1, color: line })
    page.drawRectangle({ x: width / 2 - 22, y: height - 82, width: 44, height: 44, color: navy })
    text(tipo.letra, width / 2 - 8, height - 74, 26, bold, rgb(1, 1, 1))
    text(`COD. ${String(factura.tipo_comprobante).padStart(3, '0')}`, width / 2 - 18, height - 100, 8, font, gray)

    // Emisor (izquierda)
    text(tenant?.nombre || 'Consultorio', M + 12, height - 58, 15, bold)
    text(tipo.nombre, M + 12, height - 78, 11, bold, gray)
    if (tenant?.direccion) text(tenant.direccion, M + 12, height - 94, 8, font, gray)

    // Datos del comprobante (derecha)
    const rx = width / 2 + 12
    text(`Punto de Venta: ${ptoVta}`, rx, height - 56, 9)
    text(`Comp. Nro: ${nroCbte}`, rx, height - 70, 9)
    text(`Fecha de Emisión: ${fechaStr}`, rx, height - 84, 9)
    text(`CUIT: ${fmtCuit(cuitEmisor)}`, rx, height - 98, 9)

    // Condición fiscal del emisor
    let y = height - 130
    text(`Condición frente al IVA: ${config?.condicion_iva || '-'}`, M, y, 9, font, gray)

    // Datos del receptor
    y -= 24
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: width - M, y: y + 8 }, thickness: 0.5, color: line })
    text('Cliente', M, y - 6, 9, bold)
    text(`Nombre / Razón Social: ${factura.paciente_nombre}`, M, y - 22, 9)
    text(`${factura.paciente_doc_tipo}: ${factura.paciente_doc_nro}`, M, y - 36, 9)

    // Detalle
    y -= 70
    page.drawRectangle({ x: M, y: y, width: width - 2 * M, height: 20, color: rgb(0.95, 0.96, 0.97) })
    text('Descripción', M + 8, y + 6, 9, bold, gray)
    text('Importe', width - M - 90, y + 6, 9, bold, gray)
    y -= 22
    text('Servicios profesionales odontológicos', M + 8, y, 9)
    text(fmtMoney(factura.monto), width - M - 90, y, 9)

    // Totales
    y -= 40
    text('Importe Total:', width - M - 200, y, 12, bold)
    text(fmtMoney(factura.monto), width - M - 90, y, 12, bold)

    // Bloque CAE + QR
    y -= 70
    page.drawImage(qrImg, { x: M, y: y - 40, width: 90, height: 90 })
    text(`CAE N°: ${factura.cae}`, M + 105, y + 30, 10, bold)
    text(`Fecha de Vto. de CAE: ${new Date(factura.cae_expira).toLocaleDateString('es-AR')}`, M + 105, y + 14, 9)
    if (factura.simulada) {
      text('COMPROBANTE SIMULADO — SIN VALIDEZ FISCAL', M + 105, y - 8, 10, bold, rgb(0.7, 0.2, 0.1))
    }

    // Marca de agua diagonal para simuladas
    if (factura.simulada) {
      page.drawText('SIMULADO', {
        x: 120, y: 420, size: 70, font: bold,
        color: rgb(0.85, 0.3, 0.2), opacity: 0.12, rotate: { type: 'degrees', angle: 35 } as any,
      })
    }

    // Pie
    text('Documento generado electrónicamente.', M, 40, 8, font, gray)

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
