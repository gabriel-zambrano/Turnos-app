import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Usamos el cliente de admin para poder invitar usuarios
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { email, role } = await req.json()

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

    // 2. Obtener el tenant_id del owner
    const { data: ownerTenant } = await supabaseAdmin
      .from('tenant_users')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .single()

    if (!ownerTenant || (ownerTenant.role !== 'owner' && ownerTenant.role !== 'admin')) {
      return NextResponse.json({ error: 'No tienes permisos para invitar al equipo' }, { status: 403 })
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
            role: role || 'staff'
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
          role: role || 'staff'
        })
        
      if (linkError) throw linkError
    }

    return NextResponse.json({ success: true, message: 'Invitación enviada' })
    
  } catch (error: any) {
    console.error('Error invitando:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
