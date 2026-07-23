import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function calcularHash(contenido: string, doc: string, fechaISO: string, firmaPng: string) {
  return crypto.createHash('sha256').update(`${contenido}|${doc}|${fechaISO}|${firmaPng}`).digest('hex')
}

// GET público: datos del consentimiento a firmar (texto + clínica)
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req)
  const rl = rateLimit(`consent:${ip}`, 30, 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const { token } = params
  if (!token || !UUID_REGEX.test(token)) return NextResponse.json({ error: 'Link inválido' }, { status: 400 })

  const { data: c } = await supabaseAdmin
    .from('consentimientos_firmados')
    .select('id, titulo, contenido_snapshot, estado, firmante_nombre, tenant_id')
    .eq('token_firma', token)
    .single()

  if (!c) return NextResponse.json({ error: 'Link inválido' }, { status: 404 })

  const { data: tenant } = await supabaseAdmin
    .from('tenants').select('nombre').eq('id', c.tenant_id).single()

  return NextResponse.json({
    titulo: c.titulo,
    contenido: c.contenido_snapshot,
    estado: c.estado,
    firmanteNombre: c.firmante_nombre,
    clinica: tenant?.nombre || 'Consultorio',
  })
}

// POST público: registra la firma remota
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ip = getClientIp(req)
  const rl = rateLimit(`consent-sign:${ip}`, 10, 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const { token } = params
  if (!token || !UUID_REGEX.test(token)) return NextResponse.json({ error: 'Link inválido' }, { status: 400 })

  const { firmaPng, firmanteNombre, firmanteDoc } = await req.json()
  if (!firmaPng) return NextResponse.json({ error: 'Falta la firma' }, { status: 400 })

  const { data: c } = await supabaseAdmin
    .from('consentimientos_firmados')
    .select('id, contenido_snapshot, estado')
    .eq('token_firma', token)
    .single()

  if (!c) return NextResponse.json({ error: 'Link inválido' }, { status: 404 })
  if (c.estado === 'firmado') return NextResponse.json({ error: 'Este consentimiento ya fue firmado' }, { status: 400 })

  const firmadoEn = new Date().toISOString()
  const hash = calcularHash(c.contenido_snapshot, firmanteDoc || '', firmadoEn, firmaPng)

  const { error } = await supabaseAdmin
    .from('consentimientos_firmados')
    .update({
      firma_png: firmaPng,
      firmante_nombre: firmanteNombre || null,
      firmante_doc: firmanteDoc || null,
      estado: 'firmado',
      firmado_en: firmadoEn,
      ip_firma: ip,
      user_agent: req.headers.get('user-agent') || null,
      hash_sha256: hash,
    })
    .eq('token_firma', token)
    .eq('estado', 'pendiente') // evita doble firma por carrera

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
