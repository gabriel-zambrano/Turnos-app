import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'

// ─────────────────────────────────────────────────────────────
// API del panel de super-admin (gestión de clínicas).
//
// Antes el panel leía la tabla `tenants` directo desde el navegador y su única
// protección era comparar el email en el cliente: cualquiera con sesión podía
// saltearlo y consultar la base. Ahora la verificación es SERVER-SIDE y las
// lecturas van con service-role, lo que permite cerrar la política permisiva
// de `tenants` sin romper el panel.
// ─────────────────────────────────────────────────────────────

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'studioandbrand@gmail.com'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Verifica que quien llama tenga sesión y sea super-admin. */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, res: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  // 1) Tabla admin_users (fuente preferida). 2) Fallback al email configurado.
  const { data: adminRow } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const esAdmin = !!adminRow || user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()

  if (!esAdmin) {
    return { ok: false, res: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) }
  }

  return { ok: true }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.res

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .order('creado_en', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tenants: data || [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.res

  const { id, activo } = await req.json()

  if (!id || typeof activo !== 'boolean') {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ activo })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
