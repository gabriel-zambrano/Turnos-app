import { describe, it, expect } from 'vitest'
import { turnosSinCerrar, ahoraEnArgentina } from './turnos-sin-cerrar'

const t = (id: string, fecha: string, hora: string, estado: string) => ({ id, fecha, hora, estado })

describe('turnosSinCerrar', () => {
  const turnos = [
    t('a', '2026-10-01', '09:00', 'pendiente'),
    t('b', '2026-10-01', '10:00', 'confirmado'),
    t('c', '2026-10-01', '11:00', 'asistio'),
    t('d', '2026-10-01', '12:00', 'cancelado'),
    t('e', '2026-10-02', '09:00', 'pendiente'),   // en el futuro respecto del corte
    t('f', '2026-09-30', '18:00', 'confirmado'),
  ]

  it('devuelve solo los abiertos que ya pasaron, del más viejo al más nuevo', () => {
    expect(turnosSinCerrar(turnos, '2026-10-01 15:30').map(x => x.id)).toEqual(['f', 'a', 'b'])
  })
  it('un turno de ahora mismo todavía no cuenta como pasado', () => {
    expect(turnosSinCerrar([t('x', '2026-10-01', '15:30', 'pendiente')], '2026-10-01 15:30')).toEqual([])
  })
  it('acepta el corte con T o con espacio', () => {
    expect(turnosSinCerrar(turnos, '2026-10-01T09:30').map(x => x.id)).toEqual(['f', 'a'])
  })
  it('ignora segundos en la hora del turno', () => {
    expect(turnosSinCerrar([t('y', '2026-10-01', '09:00:00', 'pendiente')], '2026-10-01 10:00').map(x => x.id)).toEqual(['y'])
  })
})

describe('ahoraEnArgentina', () => {
  it('convierte a la hora de Buenos Aires (UTC-3)', () => {
    expect(ahoraEnArgentina(new Date('2026-10-01T18:00:00Z'))).toBe('2026-10-01 15:00')
  })
})
