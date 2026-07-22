import { NextRequest, NextResponse } from 'next/server'
import { APP_NAME, EMAIL_DOMAIN } from '@/lib/config'

/** Escapa los caracteres que el formato iCalendar exige escapar. */
function esc(v: string): string {
  return (v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') || ''
  const hora = searchParams.get('hora') || ''
  const tratamiento = searchParams.get('tratamiento') || ''
  const duracion = parseInt(searchParams.get('duracion') || '30')
  const notas = searchParams.get('notas') || ''
  // Datos de la clínica: llegan por querystring desde quien arma el link.
  // Sin ellos cae al nombre de la plataforma, nunca a una clínica concreta.
  const clinica = searchParams.get('clinica') || APP_NAME
  const direccion = searchParams.get('direccion') || ''

  const inicio = new Date(`${fecha}T${hora}:00-03:00`)
  const fin = new Date(inicio.getTime() + duracion * 60000)

  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${esc(APP_NAME)}//Turnos//ES`,
    'BEGIN:VEVENT',
    `UID:${Date.now()}@${EMAIL_DOMAIN}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(inicio)}`,
    `DTEND:${fmt(fin)}`,
    `SUMMARY:Turno ${esc(clinica)} - ${esc(tratamiento)}`,
    `DESCRIPTION:Turno en ${esc(clinica)}\\nTratamiento: ${esc(tratamiento)}${notas ? '\\nNotas: ' + esc(notas) : ''}`,
    ...(direccion ? [`LOCATION:${esc(direccion)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="turno.ics"',
    },
  })
}
