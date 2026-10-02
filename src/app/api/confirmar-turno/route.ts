import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'
import { APP_NAME, remitente, urlDeClinica } from '@/lib/config'

import { generarEmailConfirmacionHtml } from '@/lib/email-templates'

const resend = new Resend(process.env.RESEND_API_KEY)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { nombre, email, token, fecha, hora, tratamiento, duracion, notas, tenantId } = await req.json()

  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

  // El usuario solo puede enviar confirmaciones con el branding de una clínica
  // a la que efectivamente pertenece. Sin esta verificación, cualquier usuario
  // autenticado podría suplantar el branding de otro consultorio.
  if (tenantId) {
    const { data: membership } = await supabaseAdmin
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'No autorizado para esta clínica' }, { status: 403 })
    }
  }

  // Resolver branding del tenant
  const tid = tenantId || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || ''
  let registry: { nombre: string; direccion: string; telefono: string; logourl?: string | null; custom_domain?: string | null } = {
    nombre: APP_NAME,
    direccion: '',
    telefono: '',
  }
  if (tid) {
    const { data: dbTenant } = await supabaseAdmin.from('tenants').select('nombre, direccion, telefono, logourl, custom_domain').eq('id', tid).single()
    if (dbTenant) {
      registry = { ...registry, ...dbTenant }
    }
  }

  // Los links que recibe el paciente salen por el dominio de SU consultorio.
  // Con APP_URL —el dominio de la plataforma— terminaba en el sitio de otra
  // clínica, y encima llevando su token de portal.
  const baseUrl = urlDeClinica(registry)

  // Google Calendar
  const fechaInicio = `${fecha.replace(/-/g, '')}T${hora.replace(':', '')}00-0300`
  const fechaFin = new Date(`${fecha}T${hora}:00-03:00`)
  fechaFin.setMinutes(fechaFin.getMinutes() + (duracion || 30))
  const fechaFinStr = fechaFin.toISOString().replace(/[-:]/g, '').split('.')[0] + '-0300'
  const googleLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Turno+${encodeURIComponent(registry.nombre)}+-+${encodeURIComponent(tratamiento)}&dates=${fechaInicio}/${fechaFinStr}&details=${encodeURIComponent(`Turno con ${registry.nombre}\nTratamiento: ${tratamiento}\n${notas ? 'Notas: ' + notas : ''}`)}&location=${encodeURIComponent(registry.direccion)}`

  // Outlook
  const outlookLink = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(`Turno ${registry.nombre} - ${tratamiento}`)}&startdt=${fecha}T${hora}:00&enddt=${fechaFin.toISOString()}&body=${encodeURIComponent(`Turno con ${registry.nombre}\nTratamiento: ${tratamiento}`)}&location=${encodeURIComponent(registry.direccion)}`

  // iCal / Apple Calendar
  const icsLink = `${baseUrl}/api/ics?fecha=${fecha}&hora=${encodeURIComponent(hora)}&tratamiento=${encodeURIComponent(tratamiento)}&duracion=${duracion || 30}&notas=${encodeURIComponent(notas || '')}&clinica=${encodeURIComponent(registry.nombre || '')}&direccion=${encodeURIComponent(registry.direccion || '')}`

  const portalUrl = token ? `${baseUrl}/paciente/${token}` : undefined

  const emailHtml = generarEmailConfirmacionHtml({
    nombrePaciente: nombre,
    fecha,
    hora,
    tratamiento,
    duracionMinutos: duracion,
    clinicaNombre: registry.nombre,
    clinicaDireccion: registry.direccion,
    clinicaTelefono: registry.telefono,
    clinicaLogoUrl: registry.logourl || undefined,
    googleCalendarUrl: googleLink,
    icsCalendarUrl: icsLink,
    outlookCalendarUrl: outlookLink,
    portalUrl,
    notas,
  })

  const { error } = await resend.emails.send({
    from: remitente(registry.nombre),
    to: email,
    subject: `✅ Turno confirmado — ${fecha} a las ${hora}hs`,
    html: emailHtml,
  })

  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
