import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { fecha } = await req.json()
  if (!fecha) return NextResponse.json({ error: 'fecha requerida (YYYY-MM-DD)' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const nextDay = new Date(new Date(fecha).getTime() + 86400000).toISOString().split('T')[0]

  const { data: citas, error } = await supabase
    .from('citas')
    .select('id, fecha_hora, tipo_tratamiento, duracion_minutos, notas, pacientes(nombre, email, telefono)')
    .gte('fecha_hora', `${fecha}T03:00:00Z`)
    .lte('fecha_hora', `${nextDay}T02:59:59Z`)
    .in('estado', ['pendiente', 'confirmado'])

  if (error) console.error('ERROR FETCHING CITAS:', error)

  if (!citas || citas.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0, mensaje: 'Sin citas para esa fecha' })
  }

  const resultados = await Promise.all(citas.map(async (cita: any) => {
    const paciente = cita.pacientes
    if (!paciente?.email) return { nombre: paciente?.nombre, skipped: 'sin email' }

    const fechaHora = new Date(cita.fecha_hora)
    const fechaLabel = fechaHora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
    const hora = fechaHora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })

    const { error } = await resend.emails.send({
      from: 'Consultorio Dr. Benegas <turnos@walterbenegas.com.ar>',
      to: paciente.email,
      subject: `📅 Recordatorio — Mañana tenés turno a las ${hora}hs`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f4f7fb; padding: 32px 16px;">
          <div style="background: #fff; border-radius: 16px; padding: 32px; border: 1px solid #e8edf2;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="font-size: 40px; margin-bottom: 12px;">📅</div>
              <h1 style="font-size: 20px; font-weight: 700; color: #0f1e2b; margin: 0;">Recordatorio de turno</h1>
              <p style="font-size: 14px; color: #94a3b8; margin: 6px 0 0;">Te recordamos que mañana tenés turno con el Dr. Walter Benegas.</p>
            </div>
            <div style="background: #f4f7fb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding-bottom: 12px;">
                  <span style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Fecha y hora</span><br/>
                  <span style="font-size: 15px; font-weight: 600; color: #0f1e2b;">${fechaLabel} a las ${hora}hs</span>
                </td></tr>
                <tr><td style="padding-bottom: 12px;">
                  <span style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Tratamiento</span><br/>
                  <span style="font-size: 15px; font-weight: 600; color: #0f1e2b;">${cita.tipo_tratamiento}</span>
                </td></tr>
                <tr><td>
                  <span style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Lugar</span><br/>
                  <span style="font-size: 15px; font-weight: 600; color: #0f1e2b;">Av. Santa Fe 3329 1° B, Palermo, CABA</span>
                </td></tr>
              </table>
            </div>
            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
              Si necesitás cancelar o reprogramar, respondé este email o llamanos.
            </p>
          </div>
        </div>
      `
    })

    return { nombre: paciente.nombre, email: paciente.email, enviado: !error, error: error?.message }
  }))

  const enviados = resultados.filter((r: any) => r.enviado).length
  return NextResponse.json({ ok: true, enviados, total: citas.length, detalle: resultados })
}
