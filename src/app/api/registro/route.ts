import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { baseSubdominioDesdeNombre } from '@/lib/subdominio'
import { APP_NAME, APP_URL, remitente } from '@/lib/config'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    // Freno de abuso: máximo 5 registros por IP cada 15 minutos.
    const ip = getClientIp(req)
    const rl = rateLimit(`registro:${ip}`, 5, 15 * 60 * 1000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const { email, password, nombreProfesional, nombreConsultorio, direccion, telefono, primaryColor, secondaryColor, accentColor } = await req.json()

    if (!email || !password || !nombreProfesional || !nombreConsultorio) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
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

    // Subdominio de la clínica. `tenants.subdominio` es NOT NULL sin default:
    // si no lo mandamos, el INSERT falla y el alta se rompe entera.
    // Generamos uno a partir del nombre y le agregamos sufijo si ya existe.
    const base = baseSubdominioDesdeNombre(nombreConsultorio)
    let subdominio = base
    for (let i = 0; i < 25; i++) {
      const { data: ocupado } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('subdominio_generico', subdominio)
        .maybeSingle()
      if (!ocupado) break
      subdominio = `${base}-${i + 2}`
    }

    // 2. Create Tenant (con fallback robusto si no se han corrido las migraciones de suscripciones)
    let tenantData = null
    let tenantError = null

    const trialData = {
      nombre: nombreConsultorio,
      subdominio,
      subdominio_generico: subdominio,
      direccion,
      telefono,
      primarycolor: primaryColor,
      secondarycolor: secondaryColor,
      accentcolor: accentColor,
      plan: 'pro',
      subscription_status: 'trial',
      next_payment_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      feature_bi: true,
      activo: true
    }

    const { data: d1, error: e1 } = await supabaseAdmin
      .from('tenants')
      .insert(trialData)
      .select('id')
      .single()

    if (e1 && (e1.message?.includes('column') || e1.code === '42703')) {
      // Fallback si no existen las columnas de MercadoPago
      console.warn('Esquema antiguo detectado. Registrando con plan starter estándar.')
      const { data: d2, error: e2 } = await supabaseAdmin
        .from('tenants')
        .insert({
          nombre: nombreConsultorio,
          subdominio,
          subdominio_generico: subdominio,
          direccion,
          telefono,
          primarycolor: primaryColor,
          secondarycolor: secondaryColor,
          accentcolor: accentColor,
          plan: 'starter',
          activo: true
        })
        .select('id')
        .single()
      tenantData = d2
      tenantError = e2
    } else {
      tenantData = d1
      tenantError = e1
    }

    if (tenantError || !tenantData) {
      // Rollback user if tenant creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: 'Error creando consultorio: ' + (tenantError?.message || 'Error desconocido') }, { status: 500 })
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

    // 4. Enviar email de bienvenida (no bloqueante)
    if (email && process.env.RESEND_API_KEY) {
      try {
        const resendClient = new Resend(process.env.RESEND_API_KEY)
        await resendClient.emails.send({
          from: remitente(APP_NAME),
          to: email,
          subject: '👋 ¡Bienvenido a DentalDesk! Tu consultorio está listo',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f4f7fb; padding: 32px 16px;">
              <div style="background: #fff; border-radius: 16px; padding: 32px; border: 1px solid #e8edf2;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <div style="font-size: 40px; margin-bottom: 12px;">🚀</div>
                  <h1 style="font-size: 20px; font-weight: 700; color: #0a1e3d; margin: 0;">¡Bienvenido a DentalDesk!</h1>
                  <p style="font-size: 14px; color: #4a6080; margin: 6px 0 0;">Hola <strong>${nombreProfesional}</strong>, estamos felices de tenerte.</p>
                </div>
                
                <p style="font-size: 14px; color: #4a6080; line-height: 1.5;">
                  Tu consultorio <strong>${nombreConsultorio}</strong> ha sido creado exitosamente. Hemos activado un <strong>Trial Pro de 14 días gratis</strong> para que pruebes todas las características sin límites.
                </p>
                
                <div style="background: #f4f7fb; border-radius: 12px; padding: 20px; margin: 24px 0;">
                  <h3 style="font-size: 13px; font-weight: 700; color: #0a1e3d; margin-top: 0; margin-bottom: 10px;">Tus primeros pasos:</h3>
                  <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #4a6080; display: flex; flex-direction: column; gap: 8px;">
                    <li>Configurá tus tratamientos y precios en el panel.</li>
                    <li>Agendá tus primeros turnos desde el calendario interactivo.</li>
                    <li>Personalizá los colores y logo de tu portal en Configuración.</li>
                  </ul>
                </div>

                <div style="text-align: center; margin: 24px 0;">
                  <a href="${APP_URL}/login" style="display: inline-block; background: #185FA5; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                    Ingresar al Panel
                  </a>
                </div>

                <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
                  Si tenés alguna duda o necesitas ayuda para configurar tu cuenta, respondé a este email.
                </p>
              </div>
            </div>
          `
        })
      } catch (emailErr) {
        console.error('Error enviando email de bienvenida:', emailErr)
      }
    }

    return NextResponse.json({ ok: true, tenantId })

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
