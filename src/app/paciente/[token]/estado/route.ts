import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ESTADOS_VALIDOS = ['confirmado', 'cancelado'] as const

type Estado = (typeof ESTADOS_VALIDOS)[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  const { citaId, estado } = await req.json()

  if (!UUID_REGEX.test(token) || !UUID_REGEX.test(citaId)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const { data: pac } = await supabaseAdmin
    .from('pacientes')
    .select('id')
    .eq('token', token)
    .single()

  if (!pac) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data: cita } = await supabaseAdmin
    .from('citas')
    .select('id')
    .eq('id', citaId)
    .eq('paciente_id', pac.id)
    .single()

  if (!cita) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  }

  await supabaseAdmin
    .from('citas')
    .update({ estado })
    .eq('id', citaId)
    .eq('paciente_id', pac.id)

  return NextResponse.json({ ok: true })
}
