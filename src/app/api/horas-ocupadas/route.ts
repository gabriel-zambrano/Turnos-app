import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL || 'https://turnos-app-delta.vercel.app',
  'http://localhost:3000'
]

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin') || ''

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
  }

  const fecha = req.nextUrl.searchParams.get('fecha')
  const tenantId = req.nextUrl.searchParams.get('tenant_id')

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }

  // tenant_id ahora es OBLIGATORIO: sin él se filtraban horarios de TODOS los consultorios.
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return NextResponse.json({ error: 'tenant_id requerido o inválido' }, { status: 400 })
  }

  const { data } = await supabaseAdmin
    .from('citas')
    .select('fecha_hora')
    .eq('tenant_id', tenantId)
    .gte('fecha_hora', `${fecha}T00:00:00`)
    .lte('fecha_hora', `${fecha}T23:59:59`)
    .not('estado', 'eq', 'cancelado')

  const ocupadas = (data || []).map(c => {
    const dt = new Date(c.fecha_hora)
    const ar = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
    return String(ar.getHours()).padStart(2, '0') + ':' + String(ar.getMinutes()).padStart(2, '0')
  })

  const headers = new Headers()
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
  }

  return NextResponse.json({ ocupadas }, { headers })
}
