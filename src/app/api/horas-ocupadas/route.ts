import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get('fecha')
  const tenantId = req.nextUrl.searchParams.get('tenant_id')
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }

  let q = supabaseAdmin
    .from('citas')
    .select('fecha_hora')
    .gte('fecha_hora', `${fecha}T00:00:00`)
    .lte('fecha_hora', `${fecha}T23:59:59`)
    .not('estado', 'eq', 'cancelado')

  if (tenantId) {
    q = q.eq('tenant_id', tenantId)
  }

  const { data } = await q

  const ocupadas = (data || []).map(c => {
    const dt = new Date(c.fecha_hora)
    const ar = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
    return String(ar.getHours()).padStart(2,'0') + ':' + String(ar.getMinutes()).padStart(2,'0')
  })

  return NextResponse.json({ ocupadas })
}
