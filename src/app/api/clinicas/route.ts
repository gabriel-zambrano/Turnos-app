import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createCookieClient } from '@/lib/supabase/server'

// Subdominios que no se pueden entregar a una clínica porque colisionan con
// rutas/infraestructura real de la app (o con nombres ambiguos/ofensivos obvios).
const SUBDOMINIOS_RESERVADOS = new Set([
  'www', 'api', 'app', 'admin', 'auth', 'login', 'logout', 'registro',
  'dashboard', 'agenda', 'paciente', 'pacientes', 'mail', 'ftp', 'static',
  'assets', 'cdn', 'blog', 'help', 'soporte', 'support', 'status', 'docs',
  'test', 'staging', 'dev', 'localhost', 'billing', 'facturacion'
])

const PLANES_VALIDOS = new Set(['starter', 'pro', 'business'])

export async function POST(req: NextRequest) {
  try {
    const supabase = createCookieClient()

    // Get currently authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { nombre, subdominio, plan, primaryColor, secondaryColor, accentColor, direccion, telefono } = await req.json()

    if (!nombre || !subdominio) {
      return NextResponse.json({ error: 'Faltan datos requeridos (nombre y subdominio)' }, { status: 400 })
    }

    const cleanNombre = String(nombre).trim().slice(0, 120)
    if (!cleanNombre) {
      return NextResponse.json({ error: 'El nombre de la clínica no puede estar vacío' }, { status: 400 })
    }

    // Clean up subdomain: lowercase, no spaces, only alphanumeric and dashes
    const cleanSubdomain = String(subdominio).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63)
    if (!cleanSubdomain || cleanSubdomain.length < 3) {
      return NextResponse.json({ error: 'El subdominio debe tener al menos 3 caracteres (solo letras, números y guiones)' }, { status: 400 })
    }
    if (SUBDOMINIOS_RESERVADOS.has(cleanSubdomain)) {
      return NextResponse.json({ error: 'Ese subdominio está reservado, elegí otro' }, { status: 400 })
    }

    const cleanPlan = PLANES_VALIDOS.has(plan) ? plan : 'pro'

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Check if subdomain is already taken. Esto es una validación "amable" para dar
    // un mensaje de error claro de entrada — la garantía real contra dos clínicas
    // creadas al mismo instante con el mismo subdominio la da el índice único de
    // la base (ver supabase_migration_perf_3_unique_subdominio.sql), que se
    // atrapa más abajo si igualmente llega a chocar.
    const { data: existingTenant } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('subdominio_generico', cleanSubdomain)
      .maybeSingle()

    if (existingTenant) {
      return NextResponse.json({ error: 'El subdominio ya está registrado por otro consultorio' }, { status: 400 })
    }

    // Create the tenant record
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        nombre: cleanNombre,
        // `subdominio_generico` es la columna que lee el resto de la app (middleware,
        // TenantContext) para resolver el tenant por hostname. `subdominio` es una
        // columna legada de un esquema anterior que sigue existiendo con NOT NULL
        // — la completamos con el mismo valor para no romper el insert, aunque hoy
        // ningún otro lugar del código la lee.
        subdominio_generico: cleanSubdomain,
        subdominio: cleanSubdomain,
        activo: true,
        plan: cleanPlan, // Default to pro trial (same as registration wizard)
        primarycolor: primaryColor || '#0a1e3d',
        secondarycolor: secondaryColor || '#185FA5',
        accentcolor: accentColor || '#138A6B',
        direccion: direccion || '',
        telefono: telefono || '',
        subscription_status: 'trial',
        next_payment_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select('id')
      .single()

    if (tenantError || !tenant) {
      // Código 23505 = violación de constraint único en Postgres. Puede pasar si dos
      // requests llegaron casi al mismo tiempo con el mismo subdominio (la validación
      // de arriba no lo cubre del todo por ser "check-then-insert").
      if ((tenantError as any)?.code === '23505') {
        return NextResponse.json({ error: 'El subdominio ya está registrado por otro consultorio' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Error al crear clínica: ' + (tenantError?.message || 'Error desconocido') }, { status: 500 })
    }

    // Link the user to the newly created tenant
    const { error: linkError } = await supabaseAdmin
      .from('tenant_users')
      .insert({
        tenant_id: tenant.id,
        user_id: user.id,
        role: 'owner'
      })

    if (linkError) {
      // Rollback tenant creation if linking fails
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
      return NextResponse.json({ error: 'Error al vincular el usuario: ' + linkError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, tenantId: tenant.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
