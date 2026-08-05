import { describe, it, expect, afterEach, vi } from 'vitest'
import { normalizarTelefono, initials, horasDisponibles, calcEdad, hoyISO, nombreParaSaludo } from './constants'

describe('normalizarTelefono', () => {
  it('deja intacto un número que ya empieza con 549', () => {
    expect(normalizarTelefono('5491122334455')).toBe('5491122334455')
  })

  it('convierte un número local con 0 inicial a formato 549', () => {
    expect(normalizarTelefono('01122334455')).toBe('5491122334455')
  })

  it('antepone 549 a un número sin prefijo', () => {
    expect(normalizarTelefono('1122334455')).toBe('5491122334455')
  })

  it('descarta caracteres no numéricos (espacios, +, guiones)', () => {
    expect(normalizarTelefono('+54 9 11 2233-4455')).toBe('5491122334455')
  })
})

describe('initials', () => {
  it('toma la inicial de las dos primeras palabras en mayúscula', () => {
    expect(initials('walter benegas')).toBe('WB')
  })

  it('ignora la tercera palabra en adelante', () => {
    expect(initials('juan carlos perez')).toBe('JC')
  })
})

describe('horasDisponibles', () => {
  it('genera slots de 20 min entre 08:00 y 19:40', () => {
    const h = horasDisponibles()
    expect(h[0]).toBe('08:00')
    expect(h).toContain('12:20')
    expect(h[h.length - 1]).toBe('19:40')
    // 12 horas (8..19) * 3 slots = 36
    expect(h.length).toBe(36)
  })
})

describe('calcEdad', () => {
  it('devuelve guion para fecha vacía', () => {
    expect(calcEdad('')).toBe('—')
  })

  it('calcula una edad plausible para una fecha conocida', () => {
    const hace30 = new Date()
    hace30.setFullYear(hace30.getFullYear() - 30)
    const iso = hace30.toISOString().split('T')[0]
    expect(calcEdad(iso)).toBe('30 años')
  })
})

describe('hoyISO — la fecha del consultorio, no la de UTC', () => {
  afterEach(() => { vi.useRealTimers() })

  function congelar(utc: string) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(utc))
  }

  it('durante el día coincide con la fecha local', () => {
    congelar('2026-08-05T15:00:00Z') // 12:00 en Argentina
    expect(hoyISO()).toBe('2026-08-05')
  })

  it('a la noche NO se adelanta al día siguiente', () => {
    // 23:30 del 5 de agosto en Argentina, pero ya 6 de agosto en UTC.
    // Con toISOString() la agenda abría en mañana y el dashboard mostraba
    // los turnos del día equivocado, justo cuando se cierra el consultorio.
    congelar('2026-08-06T02:30:00Z')
    expect(hoyISO()).toBe('2026-08-05')
  })

  it('cambia de día a la medianoche local, no a las 21', () => {
    congelar('2026-08-06T02:59:00Z') // 23:59 del 5 en Argentina
    expect(hoyISO()).toBe('2026-08-05')
    vi.setSystemTime(new Date('2026-08-06T03:01:00Z')) // 00:01 del 6
    expect(hoyISO()).toBe('2026-08-06')
  })
})

describe('nombreParaSaludo', () => {
  it('descarta el prefijo genérico de la clínica', () => {
    // El caso real: saludaba con "¡Buenas tardes, Consultorio!"
    expect(nombreParaSaludo('Consultorio Dr. Walter Benegas')).toBe('Dr. Walter')
    expect(nombreParaSaludo('Clínica Dental Sonrisas')).toBe('Dental')
    expect(nombreParaSaludo('Centro Odontológico Norte')).toBe('Odontológico')
  })

  it('conserva el tratamiento junto al nombre de pila', () => {
    expect(nombreParaSaludo('Dra. Ana Pérez')).toBe('Dra. Ana')
    expect(nombreParaSaludo('Dr Juan Gómez')).toBe('Dr Juan')
  })

  it('usa el primer nombre cuando no hay tratamiento', () => {
    expect(nombreParaSaludo('Walter Benegas')).toBe('Walter')
  })

  it('cae a un saludo genérico si no hay nombre', () => {
    expect(nombreParaSaludo('')).toBe('Doctor')
    expect(nombreParaSaludo(null)).toBe('Doctor')
    expect(nombreParaSaludo(undefined)).toBe('Doctor')
    expect(nombreParaSaludo('Consultorio')).toBe('Consultorio')
  })
})
