// ─────────────────────────────────────────────────────────────
// Qué partes de la app puede ver alguien sin cuenta.
//
// Una sola lista, porque hay dos barreras que tienen que coincidir:
//   1. El middleware, que manda al login si no hay sesión.
//   2. El gate de suscripción, que bloquea si la clínica no pagó.
//
// Estaban duplicadas y se desincronizaron: la página de reserva era pública
// para el middleware pero no para el gate, así que un paciente que entraba por
// el link de Instagram veía "Tu suscripción está vencida" —la pantalla de
// facturación del consultorio— en vez de poder pedir turno.
//
// Regla: si una ruta la usa alguien que NO es del consultorio, va acá.
// ─────────────────────────────────────────────────────────────

/** Rutas de cara al paciente o a un visitante. */
export const RUTAS_PUBLICAS = [
  // Acceso y alta de clínicas
  '/login',
  '/registro',
  '/auth',
  '/recuperar-password',
  // De cara al paciente
  '/paciente',   // portal del paciente (por token)
  '/reserva',    // agendamiento online
  '/firmar',     // firma remota de consentimientos
  // Institucional
  '/legal',
  '/precios',
] as const

/** Archivos que sirve el sitio y que nunca deben pasar por una barrera. */
export const RUTAS_DE_SISTEMA = [
  '/_next/',
  '/favicon',
  '/manifest.json',
  '/sw.js',
  '/offline.html',
  '/icons/',
  '/api/',
] as const

/**
 * Coincidencia por segmento, no por texto.
 *
 * Con un `startsWith` pelado, el prefijo `/paciente` (portal público) también
 * matcheaba `/pacientes` —el listado privado del consultorio—, que quedaba sin
 * el redirect al login. Los datos seguían protegidos por RLS, pero la página se
 * renderizaba igual. Se compara el segmento completo.
 */
function coincide(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(prefijo + '/')
}

/** ¿Se puede entrar sin sesión iniciada? (lo usa el middleware) */
export function esRutaPublica(pathname: string): boolean {
  if (pathname === '/') return true
  return (
    RUTAS_DE_SISTEMA.some(p => pathname.startsWith(p)) ||
    RUTAS_PUBLICAS.some(p => coincide(pathname, p))
  )
}

/**
 * ¿Se puede entrar aunque la suscripción esté vencida?
 *
 * Todo lo público, más Configuración: el odontólogo con la suscripción caída
 * tiene que poder entrar justamente a pagarla.
 */
export function esRutaSinSuscripcion(pathname: string): boolean {
  return esRutaPublica(pathname) || coincide(pathname, '/configuracion')
}
