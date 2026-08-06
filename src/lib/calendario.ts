// ─────────────────────────────────────────────────────────────
// Armado de eventos de calendario para el paciente.
//
// Dos formatos, porque no hay uno que funcione en todos lados:
//
//   · .ics  — el estándar. Lo entienden Calendario de iOS, Outlook y
//             Google Calendar de escritorio. En Android, tocarlo abre un
//             descargador y a veces se pierde en la carpeta de descargas.
//   · URL de Google Calendar — no descarga nada, es una página web. Funciona
//             en cualquier navegador embebido (el de WhatsApp incluido), que
//             es justamente donde el .ics falla.
//
// Las dos salen de la misma estructura para que no se puedan desincronizar:
// si el turno se reprograma, cambian las dos o ninguna.
// ─────────────────────────────────────────────────────────────

export interface EventoCalendario {
  /** Identificador estable del evento. Ver la nota sobre UID más abajo. */
  uid: string
  titulo: string
  descripcion?: string
  ubicacion?: string
  inicio: Date
  /** Duración en minutos. Si no viene o es inválida, 30. */
  duracionMinutos?: number
  /** Nombre del producto que genera el archivo (va en el PRODID del .ics). */
  producto?: string
  /** Texto del aviso que el propio calendario del paciente muestra un día antes. */
  recordatorio?: string
}

/** Escapa los caracteres que el formato iCalendar exige escapar. */
export function escaparIcs(v: string): string {
  return (v || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** AAAAMMDDTHHMMSSZ, que es como iCalendar espera las fechas en UTC. */
export function fechaIcs(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function fin(evento: EventoCalendario): Date {
  const min = Number(evento.duracionMinutos)
  const duracion = Number.isFinite(min) && min > 0 ? min : 30
  return new Date(evento.inicio.getTime() + duracion * 60000)
}

/**
 * Contenido del archivo .ics.
 *
 * Las líneas se unen con CRLF y no con \n: el RFC 5545 lo exige y Outlook es
 * el que se pone quisquilloso si no está.
 */
export function construirIcs(evento: EventoCalendario, ahora: Date = new Date()): string {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${escaparIcs(evento.producto || 'Turnos')}//Turnos//ES`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // UID estable por cita: si el paciente vuelve a agregar el turno, o la
    // clínica lo reprograma y él toca el link otra vez, el calendario
    // ACTUALIZA el evento en vez de duplicarlo. Con un UID aleatorio, cada
    // toque le dejaba un turno más en la agenda.
    `UID:${evento.uid}`,
    `DTSTAMP:${fechaIcs(ahora)}`,
    `DTSTART:${fechaIcs(evento.inicio)}`,
    `DTEND:${fechaIcs(fin(evento))}`,
    `SUMMARY:${escaparIcs(evento.titulo)}`,
    ...(evento.descripcion ? [`DESCRIPTION:${escaparIcs(evento.descripcion)}`] : []),
    ...(evento.ubicacion ? [`LOCATION:${escaparIcs(evento.ubicacion)}`] : []),
    'STATUS:CONFIRMED',
  ]

  if (evento.recordatorio) {
    // Aviso del propio calendario del paciente, un día antes. Es gratis para
    // la clínica y no depende de que el recordatorio por WhatsApp llegue.
    lineas.push(
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escaparIcs(evento.recordatorio)}`,
      'END:VALARM',
    )
  }

  lineas.push('END:VEVENT', 'END:VCALENDAR')
  return lineas.join('\r\n')
}

/**
 * URL del formulario de alta de Google Calendar con el evento precargado.
 *
 * Google usa su propio formato de fechas: AAAAMMDDTHHMMSSZ separadas por
 * barra doble, sin los guiones ni los dos puntos del ISO.
 */
export function urlGoogleCalendar(evento: EventoCalendario): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: evento.titulo,
    dates: `${fechaIcs(evento.inicio)}/${fechaIcs(fin(evento))}`,
  })
  if (evento.descripcion) params.set('details', evento.descripcion)
  if (evento.ubicacion) params.set('location', evento.ubicacion)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
