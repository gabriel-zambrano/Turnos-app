import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const pacienteId = req.nextUrl.searchParams.get('paciente_id')
  if (!pacienteId || !/^[0-9a-f-]{36}$/i.test(pacienteId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const hoyISO = new Date().toISOString()

  const { data } = await supabaseAdmin
    .from('citas')
    .select('id, fecha_hora')
    .eq('paciente_id', pacienteId)
    .gte('fecha_hora', hoyISO)
    .not('estado', 'eq', 'cancelado')
    .order('fecha_hora', { ascending: true })
    .limit(1)

  return NextResponse.json({ citas: data || [] })
}
