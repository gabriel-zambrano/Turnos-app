import { describe, it, expect } from 'vitest'
import {
  isSubscriptionActive,
  estadoSuscripcion,
  diasRestantes,
  SUBSCRIPTION_GRACE_DAYS,
} from './subscription'

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

describe('estadoSuscripcion', () => {
  it('clasifica un trial vigente', () => {
    expect(estadoSuscripcion('trial', dias(5), AHORA)).toBe('trial')
  })

  it('clasifica una suscripción paga vigente', () => {
    expect(estadoSuscripcion('authorized', dias(20), AHORA)).toBe('activa')
  })

  it('clasifica como vencida cuando pasó la gracia', () => {
    expect(estadoSuscripcion('trial', dias(-10), AHORA)).toBe('vencida')
  })

  it('clasifica como vencida un estado cancelado', () => {
    expect(estadoSuscripcion('cancelled', dias(30), AHORA)).toBe('vencida')
  })

  it('marca sin_datos a los tenants heredados', () => {
    expect(estadoSuscripcion(null, null, AHORA)).toBe('sin_datos')
  })

  it('usa el mismo criterio que el gate de la app', () => {
    // Si el gate lo deja pasar, no puede figurar como vencida.
    const casos: Array<[string | null, string | null]> = [
      ['trial', dias(3)],
      ['authorized', dias(-1)],
      ['cancelled', dias(30)],
      [null, null],
    ]
    for (const [st, fecha] of casos) {
      const activo = isSubscriptionActive(st, fecha, AHORA)
      const estado = estadoSuscripcion(st, fecha, AHORA)
      expect(estado === 'vencida').toBe(!activo)
    }
  })
})

describe('diasRestantes', () => {
  it('cuenta los días que faltan', () => {
    expect(diasRestantes(dias(7), AHORA)).toBe(7)
  })

  it('devuelve negativo si ya venció', () => {
    expect(diasRestantes(dias(-3), AHORA)).toBe(-3)
  })

  it('devuelve null sin fecha o con fecha inválida', () => {
    expect(diasRestantes(null, AHORA)).toBeNull()
    expect(diasRestantes('no-es-fecha', AHORA)).toBeNull()
  })
})

describe('datos incompletos: nunca cortar por no saber', () => {
  it('sin estado ni fecha, se considera activa', () => {
    // Es el caso de un visitante anónimo: la vista pública no expone el estado
    // de suscripción. Tratar ese hueco como "cortado" le mostraba al paciente
    // la pantalla de facturación de una clínica que estaba al día.
    expect(isSubscriptionActive(undefined, undefined)).toBe(true)
    expect(isSubscriptionActive(null, null)).toBe(true)
  })

  it("'authorized' sin fecha de próximo pago sigue activa", () => {
    expect(isSubscriptionActive('authorized', null)).toBe(true)
  })

  it("pero 'inactive' explícito sí corta", () => {
    // Por eso importa no rellenar el hueco con 'inactive'.
    expect(isSubscriptionActive('inactive', null)).toBe(false)
  })
})
