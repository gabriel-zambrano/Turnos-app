import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { puedeSumarUsuario, cuposDelPlan } from '@/lib/planes'
import { validarInvitacion } from '@/lib/roles-equipo'

// Usamos el cliente de admin para poder invitar usuarios
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { email, role, tenantId } = await req.json()

    if (!tenantId) {
      return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })
    }

    // 1. Verificar sesión del admin/owner que está invitando
    const cookieStore = cookies()
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            cookie: cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')
          }
        }
      }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // 2. Verificar que el usuario sea owner/admin de ESTA clínica puntual — antes esto
    // buscaba "una" fila de tenant_users del usuario con .single(), lo cual rompe (o
    // elige la clínica equivocada) para usuarios que pertenecen a más de una clínica.
    const { data: ownerTenant } = await supabaseAdmin
      .from('tenant_users')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    // ── R-2 · Validación de rol, ANTES de cualquier efecto ──
    //
    // Va acá y no más abajo a propósito: si valida después de
    // `inviteUserByEmail`, el mail ya salió y el usuario ya existe en Auth.
    // Un rechazo posterior deja basura que nadie limpia.
    //
    // Reemplaza la guarda anterior —que sólo miraba si el que invita era
    // owner o admin— sumando dos cosas que faltaban: que el rol pedido exista
    // y que un admin no pueda otorgar owner.
    //
    // La decisión vive en src/lib/roles-equipo.ts para poder probarla sin
    // mockear Supabase. Revertir R-2 es volver a las 3 líneas anteriores.
    // El chequeo de pertenencia va aparte y primero: si `ownerTenant` es null,
    // el tenantId del body no es de este usuario. `validarInvitacion` también
    // lo contempla —falla cerrado— pero acá se separa para que TypeScript
    // pueda estrechar el tipo en los dos `insert` de más abajo.
    if (!ownerTenant) {
      return NextResponse.json(
        { error: 'No tenés permisos para invitar al equipo de esta clínica' },
        { status: 403 }
      )
    }

    const decision = validarInvitacion(ownerTenant.role, role)
    if (!decision.ok) {
      return NextResponse.json({ error: decision.error }, { status: decision.status })
    }
    const rolAsignado = decision.rol

    // 2b. Verificar el cupo de usuarios que incluye el plan.
    const { data: tenantPlan } = await supabaseAdmin
      .from('tenants')
      .select('plan')
      .eq('id', tenantId)
      .maybeSingle()

    const { count: usuariosActuales } = await supabaseAdmin
      .from('tenant_users')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    const plan = (tenantPlan as any)?.plan || null
    if (!puedeSumarUsuario(plan, usuariosActuales ?? 0)) {
      const cupos = cuposDelPlan(plan)
      return NextResponse.json(
        {
          error: `Tu plan incluye ${cupos} usuario${cupos === 1 ? '' : 's'} y ya lo estás usando por completo. Cambiá de plan para sumar más gente al equipo.`,
          motivo: 'cupo_lleno',
        },
        { status: 409 }
      )
    }

    // 3. Invitar al usuario a través de Supabase Auth
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
    
    if (inviteError) {
      // Si el usuario ya existe, Supabase devuelve error, entonces simplemente lo buscamos
      if (inviteError.status === 422 || inviteError.message.includes('already registered')) {
        // Obtenemos el usuario existente
        const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()
        if (listError) throw listError

        const existingUser = existingUsers.users.find(u => u.email === email)
        if (!existingUser) throw new Error("No se pudo encontrar al usuario existente")

        // Vincular al tenant actual
        const { error: linkError } = await supabaseAdmin
          .from('tenant_users')
          .insert({
            tenant_id: ownerTenant.tenant_id,
            user_id: existingUser.id,
            role: rolAsignado          // R-2 · validado arriba, nunca el crudo del body
          })

        if (linkError) {
          if (linkError.code === '23505') {
            return NextResponse.json({ error: 'El usuario ya pertenece a este consultorio' }, { status: 400 })
          }
          throw linkError
        }

        return NextResponse.json({ success: true, message: 'Usuario vinculado exitosamente' })
      }
      throw inviteError
    }

    // 4. Vincular el nuevo usuario invitado al tenant actual
    if (inviteData?.user) {
      const { error: linkError } = await supabaseAdmin
        .from('tenant_users')
        .insert({
          tenant_id: ownerTenant.tenant_id,
          user_id: inviteData.user.id,
          role: rolAsignado          // R-2 · validado arriba, nunca el crudo del body
        })
        
      if (linkError) throw linkError
    }

    return NextResponse.json({ success: true, message: 'Invitación enviada' })
    
  } catch (error: any) {
    console.error('Error invitando:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
