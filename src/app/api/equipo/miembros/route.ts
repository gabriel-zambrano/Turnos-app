import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'
import { cuposDelPlan } from '@/lib/planes'

// ─────────────────────────────────────────────────────────────
// Gestión del equipo de una clínica.
//
// Antes esto se hacía desde el navegador contra `tenant_users`, y no andaba:
// la política RLS de esa tabla solo deja leer la fila propia (así que el
// listado mostraba un solo miembro) y no tiene política de DELETE (así que el
// botón de eliminar fallaba en silencio). Además los emails viven en
// auth.users, inaccesible desde el cliente.
//
// Todo se resuelve acá con service-role, verificando permisos server-side.
// ─────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Membresia = { user_id: string; role: string }

/** Devuelve la membresía del usuario logueado en ese tenant, o null. */
async function membresiaDelLlamante(tenantId: string) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, membresia: null }

  const { data: membresia } = await supabaseAdmin
    .from('tenant_users')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle()

  return { user, membresia: (membresia as Membresia | null) ?? null }
}

/** GET ?tenantId=... → miembros del equipo con su email. */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId')
  if (!tenantId) {
    return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })
  }

  const { user, membresia } = await membresiaDelLlamante(tenantId)
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!membresia) return NextResponse.json({ error: 'No pertenecés a esta clínica' }, { status: 403 })

  const { data: filas, error } = await supabaseAdmin
    .from('tenant_users')
    .select('id, user_id, role, creado_en')
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resolvemos los emails desde auth.users (solo accesible con service-role).
  const { data: usuarios } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailPorUsuario = new Map((usuarios?.users || []).map((u: any) => [u.id, u.email as string]))

  const miembros = (filas || []).map((f: any) => ({
    id: f.id,
    user_id: f.user_id,
    role: f.role,
    creado_en: f.creado_en,
    email: emailPorUsuario.get(f.user_id) || null,
    es_vos: f.user_id === user.id,
  }))

  // Datos de cupo, para que la UI muestre cuánto queda.
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .maybeSingle()

  const plan = (tenant as any)?.plan || null
  const cupos = cuposDelPlan(plan)

  return NextResponse.json({
    miembros,
    plan,
    cupos: Number.isFinite(cupos) ? cupos : null, // null = ilimitado
    usados: miembros.length,
  })
}

/** DELETE { tenantId, userId } → quita a un miembro del equipo. */
export async function DELETE(req: NextRequest) {
  const { tenantId, userId } = await req.json()

  if (!tenantId || !userId) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const { user, membresia } = await membresiaDelLlamante(tenantId)
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!membresia || (membresia.role !== 'owner' && membresia.role !== 'admin')) {
    return NextResponse.json({ error: 'No tenés permisos para gestionar el equipo' }, { status: 403 })
  }

  // Guarda 1: no podés sacarte a vos mismo (evita quedarte afuera de tu clínica).
  if (userId === user.id) {
    return NextResponse.json(
      { error: 'No podés quitarte a vos mismo. Pedile a otro administrador que lo haga.' },
      { status: 400 }
    )
  }

  const { data: objetivo } = await supabaseAdmin
    .from('tenant_users')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!objetivo) {
    return NextResponse.json({ error: 'Ese miembro no pertenece a la clínica' }, { status: 404 })
  }

  // Guarda 2: la clínica no puede quedarse sin ningún responsable.
  if ((objetivo as any).role === 'owner' || (objetivo as any).role === 'admin') {
    const { data: responsables } = await supabaseAdmin
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .in('role', ['owner', 'admin'])

    if ((responsables || []).length <= 1) {
      return NextResponse.json(
        { error: 'No se puede quitar al único responsable de la clínica.' },
        { status: 400 }
      )
    }
  }

  const { error } = await supabaseAdmin
    .from('tenant_users')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
