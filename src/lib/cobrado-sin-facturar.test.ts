import { describe, it, expect } from 'vitest'
import { cobradoSinFacturar } from './cobrado-sin-facturar'

describe('cobradoSinFacturar', () => {
  const citas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const pagos = {
    a: [{ monto: 85000, requiere_factura: true }],                                       // pendiente
    b: [{ monto: 85000, requiere_factura: true }],                                       // ya facturada
    c: [{ monto: 50000, requiere_factura: false }, { monto: 35000, requiere_factura: true }], // solo la parte facturable
  }

  it('cuenta turnos con cobro para facturar y sin factura, sumando solo la parte facturable', () => {
    expect(cobradoSinFacturar(citas, pagos, [], [{ cita_id: 'b' }])).toEqual({ cantidad: 2, monto: 120000 })
  })
  it('ignora turnos sin pagos o con pagos que no se facturan', () => {
    expect(cobradoSinFacturar([{ id: 'x' }, { id: 'y' }], { y: [{ monto: 10, requiere_factura: false }] }, [], [])).toEqual({ cantidad: 0, monto: 0 })
  })
  it('incluye ingresos manuales marcados para facturar y sin factura', () => {
    const manuales = [
      { id: 'm1', monto: 105000, requiere_factura: true },
      { id: 'm2', monto: 20000, requiere_factura: true },
      { id: 'm3', monto: 5000, requiere_factura: false },
    ]
    expect(cobradoSinFacturar([], {}, manuales, [{ ingreso_manual_id: 'm2' }])).toEqual({ cantidad: 1, monto: 105000 })
  })
})
