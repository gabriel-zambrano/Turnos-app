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
