// ─────────────────────────────────────────────────────────────
// Configuración de PLATAFORMA (no de una clínica en particular).
//
// Objetivo: que el sistema se pueda replicar y renombrar sin tocar código.
// Todo lo que identifica a la plataforma vive acá y sale de variables de
// entorno. Los datos de cada consultorio (nombre, dirección, teléfono, colores)
// NO van acá: salen de la tabla `tenants` vía TenantContext.
//
// Regla: si un valor cambia al instalar el sistema para otro dueño, va acá.
//        Si cambia por clínica, va en el tenant.
// ─────────────────────────────────────────────────────────────

/** Nombre comercial del producto. */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'DentalDesk'

/** URL pública de la app, sin barra final. */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')

/**
 * Dominio verificado en Resend desde el que salen los emails.
 * Debe estar verificado en el panel de Resend o los envíos fallan.
 */
export const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'example.com'

/** Casilla remitente para notificaciones de turnos. */
export const EMAIL_FROM_TURNOS = process.env.EMAIL_FROM_TURNOS || `turnos@${EMAIL_DOMAIN}`

/** Casilla remitente para recordatorios automáticos. */
export const EMAIL_FROM_RECORDATORIOS =
  process.env.EMAIL_FROM_RECORDATORIOS || `recordatorios@${EMAIL_DOMAIN}`

/** Email del super-admin de la plataforma (acceso al panel /admin). */
export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''

/**
 * Arma el remitente de un email mostrando el nombre de la clínica pero
 * enviando desde el dominio de la plataforma.
 *   remitente('Consultorio López') -> "Consultorio López <turnos@midominio.com>"
 */
export function remitente(nombreClinica: string | undefined | null, casilla = EMAIL_FROM_TURNOS): string {
  const nombre = (nombreClinica || APP_NAME).replace(/[<>]/g, '').trim()
  return `${nombre} <${casilla}>`
}

/**
 * URL pública de una clínica concreta.
 *
 * `APP_URL` es el dominio de la **plataforma**, no el del consultorio. Usarlo
 * en los mails que se le mandan a un paciente lo lleva al sitio equivocado:
 * el paciente del Dr. X termina en el dominio de otra clínica. Cuando el
 * consultorio tiene dominio propio, los links tienen que salir por ahí.
 */
export function urlDeClinica(clinica: { custom_domain?: string | null } | null | undefined): string {
  const dominio = clinica?.custom_domain?.trim()
  if (!dominio) return APP_URL
  return `https://${dominio.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
}
