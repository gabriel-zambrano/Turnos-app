import { describe, it, expect } from 'vitest'
import { citasPendientesDeAprobar } from './citas-para-aprobar'

const citas = [
  { id: 'a', estado: 'pendiente', precio_cobrado: null },
  { id: 'b', estado: 'confirmado', precio_cobrado: null },
  { id: 'c', estado: 'asistio', precio_cobrado: null },
  { id: 'd', estado: 'asistio', precio_cobrado: 85000 },
  { id: 'e', estado: 'cancelado', precio_cobrado: null },
  { id: 'f', estado: 'ausente', precio_cobrado: null },
  { id: 'g', estado: 'asistio', precio_cobrado: '85000.00' },
]

describe('citasPendientesDeAprobar con fidelización apagada', () => {
  const ids = (h = [] as { cita_id: string; tipo_movimiento: string }[]) =>
    citasPendientesDeAprobar(citas, h, false).map(c => c.id)

  it('ofrece abiertos y asistidos sin cobro', () => {
    expect(ids()).toEqual(['a', 'b', 'c'])
  })

  it('un turno asistido y cobrado no vuelve a la lista aunque no tenga movimiento de puntos', () => {
    // Es el caso que hacía crecer la lista sin fin tras apagar los puntos.
    expect(ids()).not.toContain('d')
    expect(ids()).not.toContain('g')
  })

  it('ignora el historial de puntos', () => {
    expect(ids([{ cita_id: 'a', tipo_movimiento: 'gasto_tratamiento' }])).toEqual(['a', 'b', 'c'])
  })

  it('no ofrece cancelados ni ausentes', () => {
    expect(ids()).not.toContain('e')
    expect(ids()).not.toContain('f')
  })
})

describe('citasPendientesDeAprobar con fidelización encendida', () => {
  it('conserva la regla anterior basada en movimientos de puntos', () => {
    const r = citasPendientesDeAprobar(citas, [{ cita_id: 'c', tipo_movimiento: 'gasto_tratamiento' }], true)
    expect(r.map(c => c.id)).toEqual(['a', 'b', 'd', 'g'])
  })
})
