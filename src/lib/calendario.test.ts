import { describe, it, expect } from 'vitest'
import { construirIcs, urlGoogleCalendar, escaparIcs, fechaIcs, EventoCalendario } from './calendario'

const BASE: EventoCalendario = {
  uid: 'cita-abc@dentaldesk.test',
  titulo: 'Turno en Consultorio Benegas - Limpieza',
  descripcion: 'Turno en Consultorio Benegas\nTratamiento: Limpieza',
  ubicacion: 'Av. Siempreviva 742, Piso 3',
  inicio: new Date('2026-08-20T13:30:00.000Z'),
  duracionMinutos: 45,
  producto: 'DentalDesk',
  recordatorio: 'Mañana tenés turno en Consultorio Benegas',
}

describe('fechaIcs', () => {
  it('usa el formato UTC que espera iCalendar', () => {
    expect(fechaIcs(new Date('2026-08-20T13:30:00.000Z'))).toBe('20260820T133000Z')
  })

  it('convierte a UTC en vez de tomar la hora local', () => {
    // Un turno a las 10:30 de Argentina son las 13:30 UTC. Si esto se rompe,
    // el evento le entra al paciente tres horas corrido.
    expect(fechaIcs(new Date('2026-08-20T10:30:00-03:00'))).toBe('20260820T133000Z')
  })
})

describe('escaparIcs', () => {
  it('escapa lo que el formato exige', () => {
    // Una dirección con coma es el caso real: sin escapar, la coma corta el
    // valor y el calendario muestra la dirección a la mitad.
    expect(escaparIcs('Av. Siempreviva 742, Piso 3')).toBe('Av. Siempreviva 742\\, Piso 3')
    expect(escaparIcs('a;b')).toBe('a\\;b')
    expect(escaparIcs('linea1\nlinea2')).toBe('linea1\\nlinea2')
    expect(escaparIcs('c:\\temp')).toBe('c:\\\\temp')
  })

  it('tolera vacío', () => {
    expect(escaparIcs('')).toBe('')
    expect(escaparIcs(undefined as any)).toBe('')
  })
})

describe('construirIcs', () => {
  const ics = construirIcs(BASE, new Date('2026-08-06T12:00:00.000Z'))

  it('abre y cierra el calendario', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
  })

  it('separa las líneas con CRLF', () => {
    // El RFC 5545 lo exige y Outlook es el que se planta si no está.
    expect(ics.includes('\r\n')).toBe(true)
    expect(/[^\r]\n/.test(ics)).toBe(false)
  })

  it('calcula el fin a partir de la duración', () => {
    expect(ics).toContain('DTSTART:20260820T133000Z')
    expect(ics).toContain('DTEND:20260820T141500Z')
  })

  it('cae en 30 minutos si la duración no sirve', () => {
    for (const duracion of [undefined, 0, -10, NaN]) {
      const salida = construirIcs({ ...BASE, duracionMinutos: duracion as any })
      expect(salida).toContain('DTEND:20260820T140000Z')
    }
  })

  it('mantiene el UID que le pasan', () => {
    // Es lo que hace que volver a tocar el link ACTUALICE el evento en vez de
    // dejarle un turno duplicado en la agenda al paciente.
    expect(ics).toContain('UID:cita-abc@dentaldesk.test')
  })

  it('incluye el aviso de un día antes', () => {
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:-P1D')
  })

  it('omite el aviso, la ubicación y la descripción si no vienen', () => {
    const minimo = construirIcs({ uid: 'x', titulo: 'Turno', inicio: BASE.inicio })
    expect(minimo).not.toContain('VALARM')
    expect(minimo).not.toContain('LOCATION')
    expect(minimo).not.toContain('DESCRIPTION')
  })

  it('escapa la dirección dentro del archivo', () => {
    expect(ics).toContain('LOCATION:Av. Siempreviva 742\\, Piso 3')
  })
})

describe('urlGoogleCalendar', () => {
  const url = new URL(urlGoogleCalendar(BASE))

  it('apunta al formulario de alta de Google', () => {
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
  })

  it('manda el rango con el separador de Google', () => {
    expect(url.searchParams.get('dates')).toBe('20260820T133000Z/20260820T141500Z')
  })

  it('lleva el título, el detalle y la dirección sin escapar de iCalendar', () => {
    // Acá NO va el escapado del .ics: Google recibe texto plano por
    // querystring, y una coma escapada le llegaría como "742\, Piso 3".
    expect(url.searchParams.get('text')).toBe(BASE.titulo)
    expect(url.searchParams.get('location')).toBe('Av. Siempreviva 742, Piso 3')
    expect(url.searchParams.get('details')).toContain('Tratamiento: Limpieza')
  })

  it('omite los opcionales que no vienen', () => {
    const simple = new URL(urlGoogleCalendar({ uid: 'x', titulo: 'Turno', inicio: BASE.inicio }))
    expect(simple.searchParams.has('location')).toBe(false)
    expect(simple.searchParams.has('details')).toBe(false)
  })

  it('describe el mismo evento que el .ics', () => {
    // Las dos vías salen de la misma estructura justamente para que no se
    // puedan desincronizar cuando un turno se reprograma.
    const ics = construirIcs(BASE)
    expect(ics).toContain(`DTSTART:${url.searchParams.get('dates')!.split('/')[0]}`)
    expect(ics).toContain(`DTEND:${url.searchParams.get('dates')!.split('/')[1]}`)
  })
})
