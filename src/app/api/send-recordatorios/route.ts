import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const ahora = new Date()
  const manana = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  manana.setDate(manana.getDate() + 1)
  const desdeISO = new Date(manana.getFullYear(), manana.getMonth(), manana.getDate(), 0, 0, 0).toISOString()
  const hastaISO = new Date(manana.getFullYear(), manana.getMonth(), manana.getDate(), 23, 59, 59).toISOString()

  const { data: citas, error } = await supabase
    .from('citas')
    .select('id, fecha_hora, tipo_tratamiento, pacientes(nombre, email)')
    .eq('estado', 'pendiente')
    .gte('fecha_hora', desdeISO)
    .lte('fecha_hora', hastaISO)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!citas || citas.length === 0) return NextResponse.json({ enviados: 0 })

  const resultados = await Promise.allSettled(
    citas.map(async (cita: any) => {
      const paciente = cita.pacientes
      if (!paciente?.email) return { skip: true }

      const fecha = new Date(cita.fecha_hora)
      const horaAR = fecha.toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        weekday: 'long', day: '2-digit', month: 'long',
        hour: '2-digit', minute: '2-digit'
      })

      const { error: emailError } = await resend.emails.send({
        from: 'DentalDesk <recordatorios@walterbenegas.com.ar>',
        to: paciente.email,
        subject: `Recordatorio de turno — ${horaAR}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
            <h2 style="color:#1D9E75;margin-bottom:8px">Recordatorio de turno</h2>
            <p style="color:#333;font-size:15px">Hola <strong>${paciente.nombre}</strong>,</p>
            <p style="color:#333;font-size:15px">Te recordamos que tenés un turno programado:</p>
            <div style="background:#f4f6f8;border-radius:12px;padding:16px 20px;margin:20px 0">
              <p style="margin:0;font-size:14px;color:#666">📅 <strong style="color:#333">${horaAR}</strong></p>
              <p style="margin:8px 0 0;font-size:14px;color:#666">🦷 Tratamiento: <strong style="color:#333">${cita.tipo_tratamiento}</strong></p>
              <p style="margin:8px 0 0;font-size:14px;color:#666">📍 Od. Walter Benegas — Odontología General</p>
            </div>
            <p style="color:#888;font-size:13px">Si necesitás cancelar o reprogramar, comunicate con el consultorio.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
            <p style="color:#aaa;font-size:12px;text-align:center">Este es un mensaje automático. Por favor no respondas este email.</p>
          </div>
        `
      })

      await supabase.from('recordatorios_log').insert({
        cita_id: cita.id,
        tipo_mensaje: 'email',
        estado_envio: emailError ? 'fallido' : 'enviado',
        mensaje_preview: `Recordatorio turno ${horaAR}`,
        enviado_en: new Date().toISOString()
      })

      if (emailError) throw new Error(emailError.message)
      return { ok: true, paciente: paciente.nombre }
    })
  )

  const enviados = resultados.filter(r => r.status === 'fulfilled').length
  const fallidos = resultados.filter(r => r.status === 'rejected').length

  return NextResponse.json({ enviados, fallidos })
}