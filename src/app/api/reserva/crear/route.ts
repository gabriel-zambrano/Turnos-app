import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { normalizarTelefono, duracionPorDefecto } from '@/lib/constants'
import { registrarConsentimiento } from '@/lib/consentimiento-datos'
import { APP_URL, remitente } from '@/lib/config'
import {
  validarReserva,
  fechaHoraISO,
  MENSAJE_RECHAZO,
  MINUTOS_POR_SLOT,
  OFFSET_AR,
  type Ocupacion,
} from '@/lib/reserva'

// ─────────────────────────────────────────────────────────────
// Alta de turno pedida por el paciente desde la página pública.
//
// El turno entra siempre como 'pendiente': lo pide el paciente, lo confirma el
// consultorio. Nunca se da por confirmado solo.
//
// La disponibilidad se vuelve a validar acá aunque el front ya haya filtrado,
// porque entre que el paciente ve la grilla y aprieta el botón puede haberse
// ocupado el horario (o alguien puede llamar a la API directo).
// ─────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_NOMBRE = 80
const MAX_NOTAS = 300

export async function POST(req: NextRequest) {
  try {
    // Tope agresivo: sin esto, un bot llena la agenda del consultorio.
    const ip = getClientIp(req)
    const rl = rateLimit(`reserva-crear:${ip}`, 5, 60 * 60 * 1000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Ya pediste varios turnos desde esta conexión. Si necesitás otro, llamá al consultorio.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const body = await req.json()
    const clinica = String(body.clinica || '').toLowerCase()
    const nombre = String(body.nombre || '').trim().slice(0, MAX_NOMBRE)
    const telefonoRaw = String(body.telefono || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const tratamiento = String(body.tratamiento || 'Consulta').trim()
    const fecha = String(body.fecha || '')
    const hora = String(body.hora || '')
    const notas = String(body.notas || '').trim().slice(0, MAX_NOTAS)

    if (!/^[a-z0-9-]{2,60}$/.test(clinica)) {
      return NextResponse.json({ error: 'Consultorio inválido' }, { status: 400 })
    }
    if (nombre.length < 3) {
      return NextResponse.json({ error: 'Poné tu nombre y apellido.' }, { status: 400 })
    }
    if (telefonoRaw.replace(/\D/g, '').length < 8) {
      return NextResponse.json({ error: 'El teléfono no parece válido.' }, { status: 400 })
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'El email no parece válido.' }, { status: 400 })
    }
    // Pedir turno implica dejar datos de salud, así que el consentimiento se
    // presta acá mismo. Sin tildar, no se crea nada.
    if (body.consentimiento !== true) {
      return NextResponse.json(
        { error: 'Necesitamos tu consentimiento para registrar tus datos.' },
        { status: 400 }
      )
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, nombre, direccion, activo')
      .or(`subdominio_generico.eq.${clinica},subdominio.eq.${clinica}`)
      .maybeSingle()

    if (!tenant || tenant.activo === false) {
      return NextResponse.json({ error: 'Consultorio no encontrado' }, { status: 404 })
    }

    // Duración según el tratamiento configurado por la clínica.
    const { data: trat } = await supabaseAdmin
      .from('tratamientos')
      .select('duracion_default')
      .eq('tenant_id', tenant.id)
      .eq('nombre', tratamiento)
      .maybeSingle()

    // Si la clínica no le cargó duración al tratamiento, cae al valor por
    // defecto del sistema (ej: Blanqueamiento 80 min, porque va con limpieza).
    const duracion = trat?.duracion_default || duracionPorDefecto(tratamiento)

    // Mismo criterio que la consulta de disponibilidad: huso de Argentina
    // explícito y los cancelados se descartan acá, no en la query.
    const { data: citasDelDia, error: errCitas } = await supabaseAdmin
      .from('citas')
      .select('fecha_hora, duracion_minutos, estado')
      .eq('tenant_id', tenant.id)
      .gte('fecha_hora', `${fecha}T00:00:00${OFFSET_AR}`)
      .lte('fecha_hora', `${fecha}T23:59:59${OFFSET_AR}`)

    if (errCitas) {
      console.error('Error consultando la agenda al reservar:', errCitas.message)
      return NextResponse.json({ error: 'No pudimos verificar la disponibilidad. Probá de nuevo.' }, { status: 503 })
    }

    const ocupados: Ocupacion[] = (citasDelDia || [])
      .filter(c => (c.estado || '').toLowerCase() !== 'cancelado')
      .map(c => ({
        fechaHora: c.fecha_hora,
        duracionMinutos: c.duracion_minutos || MINUTOS_POR_SLOT,
      }))

    const rechazo = validarReserva(fecha, hora, duracion, ocupados)
    if (rechazo) {
      return NextResponse.json({ error: MENSAJE_RECHAZO[rechazo], motivo: rechazo }, { status: 409 })
    }

    // ── Paciente: se reusa si ya existe por teléfono en esta clínica ──
    const telefono = normalizarTelefono(telefonoRaw)

    const { data: existentes } = await supabaseAdmin
      .from('pacientes')
      .select('id, nombre, telefono, token')
      .eq('tenant_id', tenant.id)

    const yaEsta = (existentes || []).find(
      p => p.telefono && normalizarTelefono(p.telefono) === telefono
    )

    let pacienteId = yaEsta?.id
    let pacienteToken = yaEsta?.token

    if (!pacienteId) {
      const token = crypto.randomUUID()
      const { data: nuevo, error: errPac } = await supabaseAdmin
        .from('pacientes')
        .insert({
          tenant_id: tenant.id,
          nombre,
          telefono: telefonoRaw,
          email: email || null,
          ultimo_tratamiento: tratamiento,
          token,
          ...registrarConsentimiento(true, 'paciente', ip),
        })
        .select('id, token')
        .single()

      if (errPac || !nuevo) {
        console.error('Error creando paciente desde reserva online:', errPac?.message)
        return NextResponse.json({ error: 'No pudimos registrar tus datos. Probá de nuevo.' }, { status: 500 })
      }
      pacienteId = nuevo.id
      pacienteToken = nuevo.token
    }

    const { error: errCita } = await supabaseAdmin.from('citas').insert({
      tenant_id: tenant.id,
      paciente_id: pacienteId,
      tipo_tratamiento: tratamiento,
      fecha_hora: fechaHoraISO(fecha, hora),
      estado: 'pendiente',
      duracion_minutos: duracion,
      notas: notas ? `Pedido online: ${notas}` : 'Pedido online por el paciente',
    })

    if (errCita) {
      console.error('Error creando cita desde reserva online:', errCita.message)
      return NextResponse.json({ error: 'No pudimos guardar el turno. Probá de nuevo.' }, { status: 500 })
    }

    // Confirmación por email, sin bloquear la respuesta si falla.
    if (email && process.env.RESEND_API_KEY) {
      try {
        const fechaLinda = new Date(fechaHoraISO(fecha, hora)).toLocaleDateString('es-AR', {
          weekday: 'long', day: 'numeric', month: 'long',
          timeZone: 'America/Argentina/Buenos_Aires',
        })
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: remitente(tenant.nombre),
          to: email,
          subject: `Pedido de turno recibido — ${tenant.nombre}`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0f1e2b">
              <h2 style="margin:0 0 8px">Recibimos tu pedido de turno</h2>
              <p style="color:#475569;line-height:1.6;margin:0 0 20px">
                Hola ${nombre.split(' ')[0]}, tomamos tu solicitud. El consultorio la revisa y te confirma a la brevedad.
              </p>
              <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:20px">
                <div style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Tu pedido</div>
                <div style="font-size:16px;font-weight:700">${fechaLinda} a las ${hora} hs</div>
                <div style="color:#475569;margin-top:4px">${tratamiento}</div>
                ${tenant.direccion ? `<div style="color:#475569;margin-top:4px">📍 ${tenant.direccion}</div>` : ''}
              </div>
              ${pacienteToken ? `<p style="margin:0 0 8px"><a href="${APP_URL}/paciente/${pacienteToken}" style="color:#185FA5">Ver mi portal de paciente</a></p>` : ''}
              <p style="color:#94a3b8;font-size:12px;margin-top:24px">
                Este turno todavía no está confirmado. Si necesitás cambiarlo, respondé este email o llamá al consultorio.
              </p>
            </div>
          `,
        })
      } catch (emailErr) {
        console.error('Error enviando confirmación de reserva:', emailErr)
      }
    }

    return NextResponse.json({
      ok: true,
      mensaje: 'Recibimos tu pedido. El consultorio te confirma a la brevedad.',
      portalUrl: pacienteToken ? `${APP_URL}/paciente/${pacienteToken}` : null,
    })
  } catch (err: any) {
    console.error('Error en reserva online:', err?.message || err)
    return NextResponse.json({ error: 'No pudimos procesar el pedido.' }, { status: 500 })
  }
}
