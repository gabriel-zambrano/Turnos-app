import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { APP_NAME, EMAIL_DOMAIN } from '@/lib/config'

// ─────────────────────────────────────────────────────────────
// Archivo de calendario para que el paciente agende su turno de un toque.
//
// En el teléfono, abrir un .ics lanza directamente la app de calendario
// (Calendario en iOS, Google Calendar en Android) con el evento precargado.
//
// Los datos se leen de la base a partir del token del paciente y NO del
// querystring. La versión anterior recibía fecha, hora y tratamiento por la
// URL: cualquiera podía armar un turno inventado, y el link quedaba viejo si
// el turno se reprogramaba. Ahora el link es estable y siempre refleja lo
// que está agendado.
// ─────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Escapa los caracteres que el formato iCalendar exige escapar. */
function esc(v: string): string {
  return (v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** AAAAMMDDTHHMMSSZ, que es como iCalendar espera las fechas en UTC. */
function fmt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = (searchParams.get('token') || '').trim()
  const citaId = (searchParams.get('cita') || '').trim()

  if (!token || !citaId) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  // 1. El token identifica al paciente. Sin token válido no se devuelve nada.
  const { data: paciente } = await supabaseAdmin
    .from('pacientes')
    .select('id, nombre, tenant_id, token_expira')
    .eq('token', token)
    .maybeSingle()

  if (!paciente) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 })
  }
  if (paciente.token_expira && new Date(paciente.token_expira).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Link vencido' }, { status: 410 })
  }

  // 2. La cita tiene que ser de ESE paciente, o no hay nada que devolver.
  const { data: cita } = await supabaseAdmin
    .from('citas')
    .select('id, fecha_hora, tipo_tratamiento, duracion_minutos, estado')
    .eq('id', citaId)
    .eq('paciente_id', paciente.id)
    .maybeSingle()

  if (!cita) {
    return NextResponse.json({ error: 'Turno no encontrado' }, { status: 404 })
  }
  if (cita.estado === 'cancelado') {
    return NextResponse.json({ error: 'Este turno fue cancelado' }, { status: 410 })
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('nombre, direccion')
    .eq('id', paciente.tenant_id)
    .maybeSingle()

  const clinica = tenant?.nombre || APP_NAME
  const direccion = tenant?.direccion || ''
  const tratamiento = cita.tipo_tratamiento || 'Consulta'

  const inicio = new Date(cita.fecha_hora)
  const fin = new Date(inicio.getTime() + (cita.duracion_minutos || 30) * 60000)

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${esc(APP_NAME)}//Turnos//ES`,
    'CALSCALE:GREGORIAN',
    // UID estable por cita: si el paciente vuelve a agregar el turno, o la
    // clínica lo reprograma y él toca el link otra vez, el calendario
    // ACTUALIZA el evento en vez de duplicarlo. Con el UID aleatorio de
    // antes, cada toque le dejaba un turno más en la agenda.
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:cita-${cita.id}@${EMAIL_DOMAIN}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(inicio)}`,
    `DTEND:${fmt(fin)}`,
    `SUMMARY:Turno en ${esc(clinica)} - ${esc(tratamiento)}`,
    `DESCRIPTION:${esc(`Turno en ${clinica}`)}\\nTratamiento: ${esc(tratamiento)}`,
    ...(direccion ? [`LOCATION:${esc(direccion)}`] : []),
    'STATUS:CONFIRMED',
    // Aviso del propio calendario del paciente, un día antes. Es gratis para
    // la clínica y no depende de que el recordatorio por WhatsApp llegue.
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`Mañana tenés turno en ${clinica}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="turno.ics"',
      'Cache-Control': 'no-store',
    },
  })
}
