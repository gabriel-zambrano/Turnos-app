import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'
import { esAdminDePlataforma } from '@/lib/admin'

// ─────────────────────────────────────────────────────────────
// API del panel de super-admin (gestión de clínicas).
//
// Antes el panel leía la tabla `tenants` directo desde el navegador y su única
// protección era comparar el email en el cliente: cualquiera con sesión podía
// saltearlo y consultar la base. Ahora la verificación es SERVER-SIDE y las
// lecturas van con service-role, lo que permite cerrar la política permisiva
// de `tenants` sin romper el panel.
// ─────────────────────────────────────────────────────────────

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

  const esAdmin = await esAdminDePlataforma(user.id, user.email)

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

  const tenants = data || []

  // Adjuntamos el email del titular de cada clínica para poder contactarlo
  // desde el panel. Se resuelve tenant_users(owner) -> auth.users.
  try {
    const ids = tenants.map((t: any) => t.id)
    if (ids.length > 0) {
      const { data: miembros } = await supabaseAdmin
        .from('tenant_users')
        .select('tenant_id, user_id, role')
        .in('tenant_id', ids)

      const { data: usuarios } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })
      const emailPorUsuario = new Map(
        (usuarios?.users || []).map((u: any) => [u.id, u.email as string])
      )

      // Preferimos el owner; si no hay, cualquier miembro sirve como contacto.
      const contactoPorTenant = new Map<string, string>()
      for (const m of miembros || []) {
        const email = emailPorUsuario.get((m as any).user_id)
        if (!email) continue
        const esOwner = (m as any).role === 'owner'
        if (esOwner || !contactoPorTenant.has((m as any).tenant_id)) {
          contactoPorTenant.set((m as any).tenant_id, email)
        }
      }

      for (const t of tenants as any[]) {
        t.owner_email = contactoPorTenant.get(t.id) || null
      }
    }
  } catch {
    // Si falla la resolución de emails, devolvemos igual las clínicas.
  }

  return NextResponse.json({ tenants })
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
