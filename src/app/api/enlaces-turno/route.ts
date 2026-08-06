import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'
import { emitirEnlaceTurno } from '@/lib/turno-publico'

// ─────────────────────────────────────────────────────────────
// Emite los códigos cortos de un puñado de citas, para el consultorio.
//
// Va en lote y no de a uno por un motivo de navegador: el botón de WhatsApp
// del dashboard abre una ventana con window.open, y una ventana abierta
// DESPUÉS de un await ya no cuenta como gesto del usuario — el bloqueador de
// pop-ups la mata. Así que los códigos se piden cuando carga la lista y el
// click queda sincrónico.
//
// La emisión es idempotente: pedir el código de una cita que ya lo tiene
// devuelve el mismo, así que llamar a esto en cada carga no genera links
// nuevos ni invalida el que el paciente ya tiene en su chat.
// ─────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tope por pedido. Un día de agenda no llega ni cerca. */
const MAX_CITAS = 100

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { citaIds } = await req.json().catch(() => ({ citaIds: null }))
  if (!Array.isArray(citaIds) || citaIds.length === 0) {
    return NextResponse.json({ error: 'Faltan citas' }, { status: 400 })
  }
  const ids: string[] = citaIds.filter((id: unknown) => typeof id === 'string' && UUID_REGEX.test(id))
  if (ids.length === 0 || ids.length > MAX_CITAS) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  // Solo citas de clínicas donde el usuario es miembro. Sin este filtro,
  // cualquier profesional logueado podría emitir el enlace de acceso al turno
  // de un paciente de otro consultorio pasando su id.
  const { data: membresias } = await supabaseAdmin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)

  const tenants = (membresias || []).map(m => m.tenant_id)
  if (tenants.length === 0) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { data: citas, error } = await supabaseAdmin
    .from('citas')
    .select('id')
    .in('id', ids)
    .in('tenant_id', tenants)

  if (error) {
    console.error('[api/enlaces-turno] no se pudieron leer las citas:', error.message)
    return NextResponse.json({ error: 'No se pudo emitir' }, { status: 500 })
  }

  const codigos: Record<string, string> = {}
  for (const cita of citas || []) {
    const codigo = await emitirEnlaceTurno(cita.id)
    if (codigo) codigos[cita.id] = codigo
  }

  return NextResponse.json({ codigos })
}
