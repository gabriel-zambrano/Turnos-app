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

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''

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

  // Fuente preferida: tabla admin_users (columnas: id, email, creado_en).
  // Se busca por id y también por email, porque las filas existentes pueden
  // haberse cargado de cualquiera de las dos formas.
  let esAdmin = false

  const { data: porId } = await supabaseAdmin
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (porId) esAdmin = true

  if (!esAdmin && user.email) {
    const { data: porEmail } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .eq('email', user.email)
      .maybeSingle()
    if (porEmail) esAdmin = true
  }

  // Último recurso: el email configurado por entorno.
  if (!esAdmin && ADMIN_EMAIL && user.email) {
    esAdmin = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  }

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

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.res

  const { nombre, subdominio, plan, custom_domain } = await req.json()

  if (!nombre || !subdominio) {
    return NextResponse.json({ error: 'Faltan nombre y subdominio' }, { status: 400 })
  }

  const PLANES_VALIDOS = ['starter', 'pro', 'business']
  if (plan && !PLANES_VALIDOS.includes(plan)) {
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
  }

  // La función crear_tenant es SECURITY DEFINER: su EXECUTE queda revocado para
  // anon/authenticated y solo se invoca desde acá, con service-role y tras
  // verificar que quien llama es admin.
  const { data, error } = await supabaseAdmin.rpc('crear_tenant', {
    p_nombre: nombre,
    p_subdominio: String(subdominio).toLowerCase().replace(/[^a-z0-9-]/g, ''),
    p_plan: plan || 'starter',
    p_custom_domain: custom_domain || null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, tenantId: data })
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
