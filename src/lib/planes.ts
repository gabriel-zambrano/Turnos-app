// ─────────────────────────────────────────────────────────────
// Cupos de usuarios por plan.
//
// Modelo de cobro elegido: cada plan incluye una cantidad de usuarios. Para
// sumar más gente, la clínica sube de plan (no hay cargo por usuario suelto).
// Es el modelo estándar del rubro y evita tener que modificar el monto de la
// suscripción en MercadoPago cada vez que el equipo cambia.
// ─────────────────────────────────────────────────────────────

export const PLANES = ['starter', 'pro', 'business'] as const
export type Plan = (typeof PLANES)[number]

/** Usuarios incluidos en cada plan (Infinity = sin límite). */
export const CUPOS_POR_PLAN: Record<Plan, number> = {
  starter: 1,
  pro: 3,
  business: Number.POSITIVE_INFINITY,
}

const PLAN_POR_DEFECTO: Plan = 'starter'

export function esPlanValido(plan?: string | null): plan is Plan {
  return !!plan && (PLANES as readonly string[]).includes(plan.toLowerCase())
}

/** Cupos del plan. Ante un plan desconocido o vacío, aplica el más restrictivo. */
export function cuposDelPlan(plan?: string | null): number {
  if (!esPlanValido(plan)) return CUPOS_POR_PLAN[PLAN_POR_DEFECTO]
  return CUPOS_POR_PLAN[plan.toLowerCase() as Plan]
}

/** ¿La clínica puede sumar un usuario más con el plan que tiene? */
export function puedeSumarUsuario(plan: string | null | undefined, usuariosActuales: number): boolean {
  return usuariosActuales < cuposDelPlan(plan)
}

/** Texto para mostrar el uso de cupos, ej: "2 de 3" o "5 usuarios". */
export function textoCupos(plan: string | null | undefined, usuariosActuales: number): string {
  const cupos = cuposDelPlan(plan)
  if (!Number.isFinite(cupos)) return `${usuariosActuales} usuario${usuariosActuales === 1 ? '' : 's'}`
  return `${usuariosActuales} de ${cupos}`
}
