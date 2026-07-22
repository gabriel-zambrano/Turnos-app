import { describe, it, expect } from 'vitest'
import { isSubscriptionActive, SUBSCRIPTION_GRACE_DAYS } from './subscription'

const AHORA = new Date('2026-07-22T12:00:00Z').getTime()
const dias = (n: number) => new Date(AHORA + n * 24 * 60 * 60 * 1000).toISOString()

describe('isSubscriptionActive', () => {
  it('trial vigente (fecha futura) → activo', () => {
    expect(isSubscriptionActive('trial', dias(10), AHORA)).toBe(true)
  })

  it('pago vigente (authorized, fecha futura) → activo', () => {
    expect(isSubscriptionActive('authorized', dias(20), AHORA)).toBe(true)
  })

  it('trial vencido más allá de la gracia → inactivo', () => {
    expect(isSubscriptionActive('trial', dias(-(SUBSCRIPTION_GRACE_DAYS + 1)), AHORA)).toBe(false)
  })

  it('pago vencido pero DENTRO de la gracia → sigue activo', () => {
    expect(isSubscriptionActive('authorized', dias(-1), AHORA)).toBe(true)
  })

  it('estado cancelado → inactivo aunque la fecha sea futura', () => {
    expect(isSubscriptionActive('cancelled', dias(30), AHORA)).toBe(false)
  })

  it('estado pausado/suspendido → inactivo', () => {
    expect(isSubscriptionActive('paused', dias(30), AHORA)).toBe(false)
    expect(isSubscriptionActive('suspended', null, AHORA)).toBe(false)
  })

  it('es case-insensitive en el estado', () => {
    expect(isSubscriptionActive('CANCELLED', dias(30), AHORA)).toBe(false)
  })

  it('tenant heredado sin estado ni fecha → activo (no lo bloqueamos)', () => {
    expect(isSubscriptionActive(null, null, AHORA)).toBe(true)
    expect(isSubscriptionActive(undefined, undefined, AHORA)).toBe(true)
  })

  it('estado activo pero fecha inválida → no corta por la fecha', () => {
    expect(isSubscriptionActive('authorized', 'no-es-fecha', AHORA)).toBe(true)
  })

  it('justo en el límite de la gracia sigue activo', () => {
    // fin + gracia == ahora  →  no es "< ahora", sigue activo
    const fin = dias(-SUBSCRIPTION_GRACE_DAYS)
    expect(isSubscriptionActive('authorized', fin, AHORA)).toBe(true)
  })
})
