import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { email, password, nombreProfesional, nombreConsultorio, direccion, telefono, primaryColor, secondaryColor, accentColor } = await req.json()

    if (!email || !password || !nombreProfesional || !nombreConsultorio) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. Create User in Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for this flow, or send email if preferred
      user_metadata: { name: nombreProfesional }
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const userId = authData.user.id

    // 2. Create Tenant
    const { data: tenantData, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        nombre: nombreConsultorio,
        direccion,
        telefono,
        primaryColor,
        secondaryColor,
        accentColor,
        plan: 'starter',
        activo: true
      })
      .select('id')
      .single()

    if (tenantError) {
      // Rollback user if tenant creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: 'Error creando consultorio: ' + tenantError.message }, { status: 500 })
    }

    const tenantId = tenantData.id

    // 3. Link User to Tenant
    const { error: linkError } = await supabaseAdmin
      .from('tenant_users')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        role: 'owner'
      })

    if (linkError) {
      return NextResponse.json({ error: 'Error vinculando usuario: ' + linkError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, tenantId })

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
