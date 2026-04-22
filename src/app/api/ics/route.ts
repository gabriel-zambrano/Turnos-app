import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') || ''
  const hora = searchParams.get('hora') || ''
  const tratamiento = searchParams.get('tratamiento') || ''
  const duracion = parseInt(searchParams.get('duracion') || '30')
  const notas = searchParams.get('notas') || ''

  const inicio = new Date(`${fecha}T${hora}:00-03:00`)
  const fin = new Date(inicio.getTime() + duracion * 60000)

  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DentalDesk//Turnos//ES',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@walterbenegas.com.ar`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(inicio)}`,
    `DTEND:${fmt(fin)}`,
    `SUMMARY:Turno Dr. Benegas - ${tratamiento}`,
    `DESCRIPTION:Turno con el Dr. Walter Benegas\\nTratamiento: ${tratamiento}${notas ? '\\nNotas: ' + notas : ''}`,
    'LOCATION:Palermo\\, CABA',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="turno-benegas.ics"`,
    },
  })
}
