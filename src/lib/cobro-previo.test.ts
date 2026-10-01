import { describe, it, expect } from 'vitest'
import { requiereConfirmarPagoExtra, textoPagoPrevio, formatoPesos, cobradoDeCita } from './cobro-previo'

describe('requiereConfirmarPagoExtra', () => {
  it('pide confirmación si el turno ya tiene cobros', () => {
    expect(requiereConfirmarPagoExtra(85000, false)).toBe(true)
  })
  it('no pide confirmación si no hay cobros previos', () => {
    expect(requiereConfirmarPagoExtra(0, false)).toBe(false)
  })
  it('deja pasar una vez confirmado', () => {
    expect(requiereConfirmarPagoExtra(85000, true)).toBe(false)
  })
})

describe('textos', () => {
  it('usa el formato de moneda de la app', () => {
    expect(formatoPesos(85000)).toBe('$ 85.000')
    expect(textoPagoPrevio(85000)).toBe('Este turno ya tiene $ 85.000 cobrados. ¿Querés registrar otro pago?')
  })
})

describe('cobradoDeCita', () => {
  function fake(rows: { monto: number | string }[] | null, error: { message: string } | null = null) {
    const q: any = { select: () => q, eq: () => q, then: (r: any) => r({ data: rows, error }) }
    return { from: () => q } as any
  }
  it('suma los pagos del turno', async () => {
    expect(await cobradoDeCita(fake([{ monto: 85000 }, { monto: '10000.00' }]), 't', 'c')).toEqual({ total: 95000, error: null })
  })
  it('devuelve el error sin inventar un total', async () => {
    expect(await cobradoDeCita(fake(null, { message: 'x' }), 't', 'c')).toEqual({ total: 0, error: 'x' })
  })
})
