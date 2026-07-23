import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// Parte un texto en líneas que entran en maxWidth
function wrap(text: string, font: any, size: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') { out.push(''); continue }
    let line = ''
    for (const word of paragraph.split(' ')) {
      const test = line ? line + ' ' + word : word
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        out.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) out.push(line)
  }
  return out
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: c } = await supabase
      .from('consentimientos_firmados')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()

    if (!c) return NextResponse.json({ error: 'Consentimiento no encontrado' }, { status: 404 })
    if (c.estado !== 'firmado') return NextResponse.json({ error: 'El consentimiento aún no fue firmado' }, { status: 400 })

    const [{ data: tenant }, { data: paciente }] = await Promise.all([
      supabase.from('tenants').select('nombre, direccion').eq('id', c.tenant_id).maybeSingle(),
      c.paciente_id ? supabase.from('pacientes').select('nombre').eq('id', c.paciente_id).maybeSingle() : Promise.resolve({ data: null }),
    ])

    const pdf = await PDFDocument.create()
    let page = pdf.addPage([595.28, 841.89])
    const { width, height } = page.getSize()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const ink = rgb(0.1, 0.1, 0.12), gray = rgb(0.4, 0.45, 0.5), linec = rgb(0.8, 0.83, 0.86)
    const M = 48
    const maxW = width - 2 * M

    let y = height - M

    // Encabezado
    page.drawText(tenant?.nombre || 'Consultorio', { x: M, y, size: 15, font: bold, color: ink })
    y -= 18
    if (tenant?.direccion) { page.drawText(tenant.direccion, { x: M, y, size: 9, font, color: gray }); y -= 14 }
    y -= 6
    page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: linec })
    y -= 26

    // Título
    for (const l of wrap(c.titulo, bold, 14, maxW)) { page.drawText(l, { x: M, y, size: 14, font: bold, color: ink }); y -= 20 }
    y -= 8

    // Paciente
    if (paciente?.nombre || c.firmante_nombre) {
      page.drawText(`Paciente: ${paciente?.nombre || c.firmante_nombre}`, { x: M, y, size: 10, font, color: ink }); y -= 16
    }
    y -= 6

    // Cuerpo del consentimiento (texto exacto firmado)
    const bodyLines = wrap(c.contenido_snapshot, font, 11, maxW)
    for (const l of bodyLines) {
      if (y < 220) { page = pdf.addPage([595.28, 841.89]); y = height - M }
      page.drawText(l, { x: M, y, size: 11, font, color: ink })
      y -= 16
    }

    // Bloque de firma
    y -= 20
    if (y < 220) { page = pdf.addPage([595.28, 841.89]); y = height - M }
    page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 0.7, color: linec })
    y -= 24

    // Imagen de la firma
    if (c.firma_png) {
      try {
        const png = await pdf.embedPng(Buffer.from(String(c.firma_png).split(',')[1], 'base64'))
        const w = 180, h = (png.height / png.width) * w
        page.drawImage(png, { x: M, y: y - h, width: w, height: Math.min(h, 90) })
        y -= Math.min(h, 90) + 6
      } catch {}
    }
    page.drawText('Firma del paciente', { x: M, y, size: 8, font, color: gray })
    y -= 22

    const fFirma = c.firmado_en ? new Date(c.firmado_en).toLocaleString('es-AR') : '-'
    page.drawText(`Firmado por: ${c.firmante_nombre || '-'}${c.firmante_doc ? '  ·  Doc: ' + c.firmante_doc : ''}`, { x: M, y, size: 9, font, color: ink }); y -= 14
    page.drawText(`Fecha y hora: ${fFirma}   ·   Modalidad: ${c.contexto === 'remota' ? 'Firma remota' : 'Firma presencial'}`, { x: M, y, size: 9, font, color: ink }); y -= 14

    // Datos de integridad (validez legal)
    y -= 8
    page.drawText('Verificación de integridad (Ley 26.529):', { x: M, y, size: 8, font: bold, color: gray }); y -= 12
    page.drawText(`Huella SHA-256: ${c.hash_sha256 || '-'}`, { x: M, y, size: 7, font, color: gray }); y -= 11
    page.drawText(`IP de firma: ${c.ip_firma || '-'}`, { x: M, y, size: 7, font, color: gray }); y -= 11
    page.drawText('Este documento fue firmado electrónicamente y su contenido no puede alterarse sin invalidar la huella.', { x: M, y, size: 7, font, color: gray })

    const bytes = await pdf.save()
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Consentimiento_${params.id.slice(0, 8)}.pdf"`,
      },
    })
  } catch (err: any) {
    console.error('GET /api/consentimientos/pdf:', err?.message || err)
    return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 500 })
  }
}
