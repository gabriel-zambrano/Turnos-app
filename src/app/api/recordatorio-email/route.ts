import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ahora = new Date()
  const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000)
  const en2h  = new Date(ahora.getTime() + 2  * 60 * 60 * 1000)

  // Ventana de 10 minutos alrededor de cada horario objetivo
  const ventana = 10 * 60 * 1000

  async function buscarCitas(objetivo: Date) {
    const desde = new Date(objetivo.getTime() - ventana).toISOString()
    const hasta = new Date(objetivo.getTime() + ventana).toISOString()
    const { data } = await supabase
      .from('citas')
      .select('id, fecha_hora, tipo_tratamiento, duracion_minutos, notas, pacientes(nombre, email, telefono)')
      .gte('fecha_hora', desde)
      .lte('fecha_hora', hasta)
      .in('estado', ['pendiente', 'confirmado'])
    return data || []
  }

  async function enviarRecordatorio(cita: any, tipo: '24h' | '2h') {
    const paciente = cita.pacientes
    if (!paciente?.email) return { skipped: true }

    const fechaHora = new Date(cita.fecha_hora)
    const fecha = fechaHora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
    const hora = fechaHora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })

    const emoji = tipo === '24h' ? '📅' : '⏰'
    const asunto = tipo === '24h'
      ? `📅 Recordatorio — Mañana tenés turno a las ${hora}hs`
      : `⏰ Tu turno es en 2 horas — ${hora}hs`

    const mensaje = tipo === '24h'
      ? `Te recordamos que mañana tenés turno con el Dr. Walter Benegas.`
      : `Tu turno es en 2 horas. ¡No te olvides!`

    const { error } = await resend.emails.send({
      from: 'Consultorio Dr. Benegas <turnos@walterbenegas.com.ar>',
      to: paciente.email,
      subject: asunto,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f4f7fb; padding: 32px 16px;">
          <div style="background: #fff; border-radius: 16px; padding: 32px; border: 1px solid #e8edf2;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="font-size: 40px; margin-bottom: 12px;">${emoji}</div>
              <h1 style="font-size: 20px; font-weight: 700; color: #0f1e2b; margin: 0;">Recordatorio de turno</h1>
              <p style="font-size: 14px; color: #94a3b8; margin: 6px 0 0;">${mensaje}</p>
            </div>

            <div style="background: #f4f7fb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding-bottom: 12px;">
                  <span style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Fecha y hora</span><br/>
                  <span style="font-size: 15px; font-weight: 600; color: #0f1e2b;">${fecha} a las ${hora}hs</span>
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

    return { email: paciente.email, error }
  }

  const citas24h = await buscarCitas(en24h)
  const citas2h  = await buscarCitas(en2h)

  const resultados24h = await Promise.all(citas24h.map((c: any) => enviarRecordatorio(c, '24h')))
  const resultados2h  = await Promise.all(citas2h.map((c: any)  => enviarRecordatorio(c, '2h')))

  return NextResponse.json({
    ok: true,
    recordatorios24h: resultados24h.length,
    recordatorios2h: resultados2h.length,
  })
}
