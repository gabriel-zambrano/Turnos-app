import { describe, it, expect } from 'vitest'
import { normalizarTelefono, initials, horasDisponibles, calcEdad } from './constants'

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
