import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

const TENANT_REGISTRY: Record<string, { nombre: string; direccion: string; telefono: string }> = {
  '2845c423-affa-4ca2-9c5f-f4ec8e35701a': {
    nombre: 'Dr. Walter Benegas',
    direccion: 'Av. Santa Fe 3329 1° B, Palermo, CABA',
    telefono: '+5491123972395',
  }
}

export async function POST(req: NextRequest) {
  const { nombre, email, fecha, hora, tratamiento, duracion, notas, tenantId } = await req.json()

  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://turnos-app-delta.vercel.app'

  // Resolver branding del tenant
  const tid = tenantId || '2845c423-affa-4ca2-9c5f-f4ec8e35701a'
  const registry = TENANT_REGISTRY[tid] || {
    nombre: 'DentalDesk',
    direccion: 'Dirección del consultorio',
    telefono: '',
  }

  // Google Calendar
  const fechaInicio = `${fecha.replace(/-/g, '')}T${hora.replace(':', '')}00-0300`
  const fechaFin = new Date(`${fecha}T${hora}:00-03:00`)
  fechaFin.setMinutes(fechaFin.getMinutes() + (duracion || 30))
  const fechaFinStr = fechaFin.toISOString().replace(/[-:]/g, '').split('.')[0] + '-0300'
  const googleLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Turno+${encodeURIComponent(registry.nombre)}+-+${encodeURIComponent(tratamiento)}&dates=${fechaInicio}/${fechaFinStr}&details=${encodeURIComponent(`Turno con ${registry.nombre}\nTratamiento: ${tratamiento}\n${notas ? 'Notas: ' + notas : ''}`)}&location=${encodeURIComponent(registry.direccion)}`

  // Outlook
  const outlookLink = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(`Turno ${registry.nombre} - ${tratamiento}`)}&startdt=${fecha}T${hora}:00&enddt=${fechaFin.toISOString()}&body=${encodeURIComponent(`Turno con ${registry.nombre}\nTratamiento: ${tratamiento}`)}&location=${encodeURIComponent(registry.direccion)}`

  // iCal / Apple Calendar
  const icsLink = `${baseUrl}/api/ics?fecha=${fecha}&hora=${encodeURIComponent(hora)}&tratamiento=${encodeURIComponent(tratamiento)}&duracion=${duracion || 30}&notas=${encodeURIComponent(notas || '')}`

  const { error } = await resend.emails.send({
    from: `${registry.nombre} <turnos@walterbenegas.com.ar>`,
    to: email,
    subject: `✅ Turno confirmado — ${fecha} a las ${hora}hs`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f4f7fb; padding: 32px 16px;">
        <div style="background: #fff; border-radius: 16px; padding: 32px; border: 1px solid #e8edf2;">
          
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 56px; height: 56px; background: #E1F5EE; border-radius: 50%; margin: 0 auto 12px; line-height: 56px; font-size: 28px;">🦷</div>
            <h1 style="font-size: 20px; font-weight: 700; color: #0f1e2b; margin: 0;">Tu turno está confirmado</h1>
            <p style="font-size: 14px; color: #94a3b8; margin: 6px 0 0;">${registry.nombre}</p>
          </div>

          <div style="background: #f4f7fb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom: 12px;">
                  <span style="font-size: 18px;">📅</span>
                  <span style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-top: 4px;">Fecha y hora</span>
                  <span style="font-size: 15px; font-weight: 600; color: #0f1e2b;">${fecha} a las ${hora}hs</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom: 12px;">
                  <span style="font-size: 18px;">🩺</span>
                  <span style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-top: 4px;">Tratamiento</span>
                  <span style="font-size: 15px; font-weight: 600; color: #0f1e2b;">${tratamiento}</span>
                </td>
              </tr>
              <tr>
                <td>
                  <span style="font-size: 18px;">📍</span>
                  <span style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-top: 4px;">Lugar</span>
                  <span style="font-size: 15px; font-weight: 600; color: #0f1e2b;">${registry.direccion}</span>
                </td>
              </tr>
              ${notas ? `<tr><td style="padding-top: 12px;"><span style="font-size: 18px;">📝</span><span style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-top: 4px;">Notas</span><span style="font-size: 14px; color: #0f1e2b;">${notas}</span></td></tr>` : ''}
            </table>
          </div>

          <p style="font-size: 13px; font-weight: 600; color: #0f1e2b; text-align: center; margin-bottom: 12px;">Guardá tu turno en el calendario:</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
            <tr>
              <td style="padding-bottom: 8px;">
                <a href="${googleLink}" target="_blank" style="display: block; text-align: center; background: #4285F4; color: #fff; text-decoration: none; padding: 12px; border-radius: 10px; font-weight: 600; font-size: 14px;">
                  📆 Google Calendar
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 8px;">
                <a href="${icsLink}" target="_blank" style="display: block; text-align: center; background: #0f1e2b; color: #fff; text-decoration: none; padding: 12px; border-radius: 10px; font-weight: 600; font-size: 14px;">
                  🍎 Apple Calendar / iCal
                </a>
              </td>
            </tr>
            <tr>
              <td>
                <a href="${outlookLink}" target="_blank" style="display: block; text-align: center; background: #0078D4; color: #fff; text-decoration: none; padding: 12px; border-radius: 10px; font-weight: 600; font-size: 14px;">
                  📧 Outlook Calendar
                </a>
              </td>
            </tr>
          </table>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
            Si necesitás cancelar o reprogramar, respondé este email o llamanos.
          </p>
        </div>
      </div>
    `
  })

  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
