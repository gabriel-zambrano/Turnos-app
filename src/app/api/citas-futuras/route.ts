import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const pacienteId = req.nextUrl.searchParams.get('paciente_id')
  if (!pacienteId || !/^[0-9a-f-]{36}$/i.test(pacienteId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const hoyISO = new Date().toISOString()

  const { data } = await supabase
    .from('citas')
    .select('id, fecha_hora')
    .eq('paciente_id', pacienteId)
    .gte('fecha_hora', hoyISO)
    .not('estado', 'eq', 'cancelado')
    .order('fecha_hora', { ascending: true })
    .limit(1)

  return NextResponse.json({ citas: data || [] })
}
