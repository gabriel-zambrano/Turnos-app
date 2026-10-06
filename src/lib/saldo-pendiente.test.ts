import { describe, it, expect } from 'vitest'
import { saldoPendiente, deudaDeCita } from './saldo-pendiente'

describe('deudaDeCita', () => {
  it('valor menos seña menos cobrado', () => {
    expect(deudaDeCita({ estado: 'asistio', valor: 85000, sena: 10000, precio_cobrado: 50000 })).toBe(25000)
  })
  it('nunca negativa (cobrado de más)', () => {
    expect(deudaDeCita({ estado: 'asistio', valor: 85000, precio_cobrado: 90000 })).toBe(0)
  })
  it('acepta números como texto (así vienen de la base)', () => {
    expect(deudaDeCita({ estado: 'asistio', valor: '85000.00', precio_cobrado: '75000.00' })).toBe(10000)
  })
})

describe('saldoPendiente', () => {
  it('suma solo turnos asistidos con deuda', () => {
    const citas = [
      { estado: 'asistio', valor: 85000, precio_cobrado: 85000 },   // pagado
      { estado: 'asistio', valor: 85000, precio_cobrado: 60000 },   // debe 25000
      { estado: 'asistio', valor: 45000, precio_cobrado: null },    // debe 45000
      { estado: 'confirmado', valor: 85000, precio_cobrado: null }, // futuro: no es deuda
      { estado: 'cancelado', valor: 85000, precio_cobrado: null },
    ]
    expect(saldoPendiente(citas)).toEqual({ monto: 70000, turnos: 2 })
  })
  it('sin turnos, sin saldo', () => {
    expect(saldoPendiente([])).toEqual({ monto: 0, turnos: 0 })
  })
})
