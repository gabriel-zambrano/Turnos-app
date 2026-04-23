import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  if (!token || !UUID_REGEX.test(token)) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
  }
  const { data: pac } = await supabaseAdmin
    .from('pacientes')
    .select('id, nombre, telefono')
    .eq('token', token)
    .single()
  if (!pac) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 })
  }
  const hoy = new Date().toISOString().split('T')[0] + 'T00:00:00-03:00'
  const { data: citas } = await supabaseAdmin
    .from('citas')
    .select('id, fecha_hora, tipo_tratamiento, estado, duracion_minutos, notas')
    .eq('paciente_id', pac.id)
    .gte('fecha_hora', hoy)
    .order('fecha_hora', { ascending: true })
  return NextResponse.json({
    paciente: { id: pac.id, nombre: pac.nombre, telefono: pac.telefono },
    turnos: citas || [],
  })
}
