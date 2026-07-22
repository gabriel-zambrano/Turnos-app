// ─────────────────────────────────────────────────────────────
// Regla de negocio: ¿la suscripción de una clínica está activa?
//
// Diseño defensivo para el lanzamiento: preferimos NO bloquear por error a un
// cliente legítimo (bloquear a un odontólogo en medio de la jornada es mucho
// peor que dejar pasar un caso raro). Por eso solo cortamos cuando hay una
// señal CLARA de corte:
//   1. Un estado explícitamente cancelado/pausado/rechazado, o
//   2. El fin de período (trial o pago) venció hace más que el período de gracia.
//
// Tenants heredados sin estado ni fecha (creados antes de las columnas de
// suscripción) se consideran activos: no los dejamos afuera.
// ─────────────────────────────────────────────────────────────

// Días de gracia tras la fecha de próximo pago, para no cortarle el acceso a
// un cliente que pagó pero cuyo webhook de renovación todavía no llegó.
export const SUBSCRIPTION_GRACE_DAYS = 2

const BLOCKED_STATUSES = ['cancelled', 'canceled', 'paused', 'inactive', 'rejected', 'suspended']

export function isSubscriptionActive(
  status?: string | null,
  nextPaymentDate?: string | null,
  now: number = Date.now()
): boolean {
  // 1. Estado explícitamente cortado.
  if (status && BLOCKED_STATUSES.includes(status.toLowerCase())) {
    return false
  }

  // 2. Fin de período vencido más allá de la gracia.
  if (nextPaymentDate) {
    const fin = new Date(nextPaymentDate).getTime()
    if (!Number.isNaN(fin)) {
      const graceMs = SUBSCRIPTION_GRACE_DAYS * 24 * 60 * 60 * 1000
      if (fin + graceMs < now) return false
    }
  }

  return true
}

export type EstadoSuscripcion = 'trial' | 'activa' | 'vencida' | 'sin_datos'

/**
 * Clasifica el estado comercial de una clínica, para mostrarlo en el panel.
 * Se apoya en isSubscriptionActive para que el corte sea el mismo criterio que
 * usa el gate de la app (una sola fuente de verdad).
 */
export function estadoSuscripcion(
  status?: string | null,
  nextPaymentDate?: string | null,
  now: number = Date.now()
): EstadoSuscripcion {
  if (!isSubscriptionActive(status, nextPaymentDate, now)) return 'vencida'
  if (!status && !nextPaymentDate) return 'sin_datos'
  if (status && status.toLowerCase() === 'trial') return 'trial'
  return 'activa'
}

/**
 * Días que faltan para el próximo pago o fin de trial.
 * Negativo = ya venció. null = no hay fecha cargada.
 */
export function diasRestantes(
  nextPaymentDate?: string | null,
  now: number = Date.now()
): number | null {
  if (!nextPaymentDate) return null
  const fin = new Date(nextPaymentDate).getTime()
  if (Number.isNaN(fin)) return null
  return Math.ceil((fin - now) / (24 * 60 * 60 * 1000))
}
