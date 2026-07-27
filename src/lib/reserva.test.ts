import { describe, it, expect } from 'vitest'
import {
  slotsDelDia,
  slotsLibres,
  validarReserva,
  esDiaHabil,
  esFechaValida,
  esHoraValida,
  fechaHoraISO,
  MINUTOS_POR_SLOT,
} from './reserva'

// Referencia fija para que los tests no dependan de cuándo se corren.
// Martes 28/07/2026, 09:00 de Argentina.
const AHORA = new Date('2026-07-28T09:00:00-03:00')
const MARTES = '2026-07-28'
const MIERCOLES = '2026-07-29'
const SABADO = '2026-08-01'
const DOMINGO = '2026-08-02'

/** Blanqueamiento: 1 h 20, porque va acompañado de una limpieza dental. */
const BLANQUEAMIENTO = 80

describe('slotsDelDia', () => {
  it('arranca a las 08:00 y el último slot es 19:40', () => {
    const slots = slotsDelDia()
    expect(slots[0]).toBe('08:00')
    expect(slots[slots.length - 1]).toBe('19:40')
  })

  it('abre un slot cada 20 minutos', () => {
    expect(slotsDelDia().slice(0, 4)).toEqual(['08:00', '08:20', '08:40', '09:00'])
    expect(MINUTOS_POR_SLOT).toBe(20)
  })
})

describe('esDiaHabil', () => {
  it('se atiende de lunes a viernes', () => {
    expect(esDiaHabil('2026-07-27')).toBe(true) // lunes
    expect(esDiaHabil(MARTES)).toBe(true)
    expect(esDiaHabil(MIERCOLES)).toBe(true)
    expect(esDiaHabil('2026-07-30')).toBe(true) // jueves
    expect(esDiaHabil('2026-07-31')).toBe(true) // viernes
  })

  it('los fines de semana no', () => {
    expect(esDiaHabil(SABADO)).toBe(false)
    expect(esDiaHabil(DOMINGO)).toBe(false)
  })
})

describe('esFechaValida / esHoraValida', () => {
  it('rechaza formatos que no son ISO', () => {
    expect(esFechaValida('28/07/2026')).toBe(false)
    expect(esFechaValida('')).toBe(false)
  })

  it('rechaza horarios fuera de la grilla', () => {
    expect(esHoraValida('07:00')).toBe(false)
    expect(esHoraValida('09:15')).toBe(false)
    expect(esHoraValida('20:00')).toBe(false)
    expect(esHoraValida('09:20')).toBe(true)
  })
})

describe('slotsLibres', () => {
  it('un turno de 20 minutos bloquea solo su horario', () => {
    const libres = slotsLibres(
      MIERCOLES,
      [{ fechaHora: fechaHoraISO(MIERCOLES, '10:00'), duracionMinutos: 20 }],
      20,
      AHORA
    )
    expect(libres).not.toContain('10:00')
    expect(libres).toContain('10:20')
  })

  it('un turno largo bloquea todos los slots que pisa', () => {
    const libres = slotsLibres(
      MIERCOLES,
      [{ fechaHora: fechaHoraISO(MIERCOLES, '10:00'), duracionMinutos: 60 }],
      20,
      AHORA
    )
    expect(libres).not.toContain('10:00')
    expect(libres).not.toContain('10:20')
    expect(libres).not.toContain('10:40')
    expect(libres).toContain('11:00')
  })

  it('si el turno pedido es largo, no puede empezar justo antes de uno ocupado', () => {
    const libres = slotsLibres(
      MIERCOLES,
      [{ fechaHora: fechaHoraISO(MIERCOLES, '11:00'), duracionMinutos: 20 }],
      60,
      AHORA
    )
    // Empezar 10:20 con 60 min terminaría 11:20 y pisaría el de las 11:00.
    expect(libres).not.toContain('10:20')
    expect(libres).not.toContain('10:40')
  })

  it('no ofrece turnos que terminen después del cierre', () => {
    const libres = slotsLibres(MIERCOLES, [], 60, AHORA)
    expect(libres).not.toContain('19:40')
    expect(libres).toContain('19:00')
  })

  it('respeta la anticipación mínima de 2 horas', () => {
    const libres = slotsLibres(MARTES, [], 20, AHORA)
    expect(libres).not.toContain('09:20')
    expect(libres).not.toContain('10:40')
    expect(libres).toContain('11:00')
  })

  it('los fines de semana no hay nada disponible', () => {
    expect(slotsLibres(SABADO, [], 20, AHORA)).toEqual([])
    expect(slotsLibres(DOMINGO, [], 20, AHORA)).toEqual([])
  })

  it('no ofrece nada más allá del tope de 60 días', () => {
    expect(slotsLibres('2026-12-01', [], 20, AHORA)).toEqual([])
  })
})

describe('validarReserva', () => {
  it('acepta un turno libre y con anticipación suficiente', () => {
    expect(validarReserva(MIERCOLES, '10:00', 20, [], AHORA)).toBeNull()
  })

  it('rechaza con el motivo correcto', () => {
    expect(validarReserva('nope', '10:00', 20, [], AHORA)).toBe('fecha_invalida')
    expect(validarReserva(MIERCOLES, '07:00', 20, [], AHORA)).toBe('hora_invalida')
    expect(validarReserva(DOMINGO, '10:00', 20, [], AHORA)).toBe('dia_no_habil')
    expect(validarReserva(MARTES, '09:20', 20, [], AHORA)).toBe('muy_pronto')
    expect(validarReserva('2026-12-01', '10:00', 20, [], AHORA)).toBe('muy_lejos')
  })

  it('rechaza un horario que ya está tomado', () => {
    const motivo = validarReserva(
      MIERCOLES,
      '10:00',
      20,
      [{ fechaHora: fechaHoraISO(MIERCOLES, '10:00'), duracionMinutos: 20 }],
      AHORA
    )
    expect(motivo).toBe('ocupado')
  })

  it('detecta la superposición aunque el horario exacto esté libre', () => {
    // Alguien tomó 10:00 por 60 minutos; pedir 10:40 tiene que fallar.
    const motivo = validarReserva(
      MIERCOLES,
      '10:40',
      20,
      [{ fechaHora: fechaHoraISO(MIERCOLES, '10:00'), duracionMinutos: 60 }],
      AHORA
    )
    expect(motivo).toBe('ocupado')
  })
})

describe('blanqueamiento (80 min, va con limpieza dental)', () => {
  it('bloquea los cuatro slots que ocupa', () => {
    const libres = slotsLibres(
      MIERCOLES,
      [{ fechaHora: fechaHoraISO(MIERCOLES, '10:00'), duracionMinutos: BLANQUEAMIENTO }],
      20,
      AHORA
    )
    expect(libres).not.toContain('10:00')
    expect(libres).not.toContain('10:20')
    expect(libres).not.toContain('10:40')
    expect(libres).not.toContain('11:00')
    expect(libres).toContain('11:20')
  })

  it('el último horario posible es 18:40, para terminar a las 20:00', () => {
    const libres = slotsLibres(MIERCOLES, [], BLANQUEAMIENTO, AHORA)
    expect(libres).toContain('18:40')
    expect(libres).not.toContain('19:00')
  })

  it('no entra si deja menos de 80 minutos libres antes de otro turno', () => {
    const ocupados = [{ fechaHora: fechaHoraISO(MIERCOLES, '11:00'), duracionMinutos: 20 }]
    const libres = slotsLibres(MIERCOLES, ocupados, BLANQUEAMIENTO, AHORA)
    // Arrancar 10:00 terminaría 11:20 y pisaría el turno de las 11:00.
    expect(libres).not.toContain('10:00')
    expect(libres).not.toContain('10:20')
    // 09:40 termina exactamente a las 11:00: entra justo.
    expect(libres).toContain('09:40')
  })

  it('validarReserva rechaza un blanqueamiento que se pasa del cierre', () => {
    expect(validarReserva(MIERCOLES, '19:00', BLANQUEAMIENTO, [], AHORA)).toBe('ocupado')
    expect(validarReserva(MIERCOLES, '18:40', BLANQUEAMIENTO, [], AHORA)).toBeNull()
  })
})

describe('horario del consultorio', () => {
  it('atiende de 8 a 20', () => {
    const libres = slotsLibres(MIERCOLES, [], 20, AHORA)
    expect(libres[0]).toBe('08:00')
    expect(libres[libres.length - 1]).toBe('19:40')
  })
})
