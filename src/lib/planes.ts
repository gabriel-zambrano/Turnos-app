// ─────────────────────────────────────────────────────────────
// Planes: cupos de usuarios, precios y features incluidas.
//
// Esta es la ÚNICA fuente de verdad de la grilla comercial. El checkout, el
// webhook de MercadoPago, la página de precios y los gates de la app leen
// todos de acá; no hay montos ni listas de features duplicadas en otro lado.
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

// ─────────────────────────────────────────────────────────────
// Precios (ARS, mensual)
//
// Anclaje: una consulta odontológica particular ronda los $40.000, así que
// todos los planes tienen que quedar por debajo de ese número — el argumento
// de venta es "cuesta menos que una consulta; si te evita un solo ausente, ya
// se pagó".
//
// El Precio Fundador es para las primeras clínicas y queda congelado para
// ellas. Los que entren después pagan el precio regular.
//
// ⚠️ Inflación: revisar esta grilla cada 3 meses. Con precios fijos en pesos,
// en un año se licúa a la mitad en términos reales.
// ─────────────────────────────────────────────────────────────

export const PRECIOS_REGULARES: Record<Plan, number> = {
  starter: 16900,
  pro: 29900,
  business: 49900,
}

export const PRECIOS_FUNDADOR: Record<Plan, number> = {
  starter: 12900,
  pro: 24900,
  business: 39900,
}

/** Cuántas clínicas acceden al Precio Fundador. */
export const CUPO_FUNDADORES = 20

/** Precio mensual en ARS. Ante un plan desconocido, cae al más barato. */
export function precioDelPlan(plan: string | null | undefined, fundador = false): number {
  const grilla = fundador ? PRECIOS_FUNDADOR : PRECIOS_REGULARES
  if (!esPlanValido(plan)) return grilla[PLAN_POR_DEFECTO]
  return grilla[plan.toLowerCase() as Plan]
}

/** Formatea un precio para mostrar, ej: "$29.900". */
export function precioFormateado(monto: number): string {
  return `$${monto.toLocaleString('es-AR')}`
}

// ─────────────────────────────────────────────────────────────
// Features por plan
//
// Los recordatorios van en Pro y no en Starter a propósito: son el feature que
// reduce el ausentismo, o sea el que le genera plata al odontólogo. Si se
// regala en Starter, nadie sube de plan.
// ─────────────────────────────────────────────────────────────

export interface FeaturesPlan {
  /** Analítica / BI del consultorio. */
  bi: boolean
  /** Campañas y recordatorios por WhatsApp. */
  whatsapp: boolean
  /** Recordatorios automáticos de turno por email. */
  recordatorios: boolean
}

export const FEATURES_POR_PLAN: Record<Plan, FeaturesPlan> = {
  starter:  { bi: false, whatsapp: false, recordatorios: false },
  pro:      { bi: false, whatsapp: true,  recordatorios: true  },
  business: { bi: true,  whatsapp: true,  recordatorios: true  },
}

/** Durante el trial se muestra todo, para que el cliente vea el valor completo. */
export const FEATURES_TRIAL: FeaturesPlan = FEATURES_POR_PLAN.business

/**
 * Features que corresponden al plan. Si la clínica está en trial, se le dan
 * todas: el objetivo de los 14 días es que pruebe el producto entero.
 */
export function featuresDelPlan(plan: string | null | undefined, enTrial = false): FeaturesPlan {
  if (enTrial) return { ...FEATURES_TRIAL }
  if (!esPlanValido(plan)) return { ...FEATURES_POR_PLAN[PLAN_POR_DEFECTO] }
  return { ...FEATURES_POR_PLAN[plan.toLowerCase() as Plan] }
}

/**
 * Feature efectiva = la del plan, O el flag guardado en la clínica.
 *
 * Las columnas `feature_*` de `tenants` funcionan como concesión manual: sirven
 * para grandfatherear a un cliente que ya tenía algo o para habilitarlo desde
 * el panel de admin. **Solo suman, nunca quitan** — así una clínica que hoy usa
 * una función no la pierde de un día para el otro por un cambio de grilla.
 */
export function featureHabilitada(
  feature: keyof FeaturesPlan,
  plan: string | null | undefined,
  concesionManual?: boolean | null,
  enTrial = false
): boolean {
  return featuresDelPlan(plan, enTrial)[feature] || concesionManual === true
}
