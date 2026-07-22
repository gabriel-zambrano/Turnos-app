// ─────────────────────────────────────────────────────────────
// Generación de subdominios para clínicas nuevas.
//
// La tabla `tenants` tiene dos columnas:
//   · subdominio            -> NOT NULL (legado, se mantiene por compatibilidad)
//   · subdominio_generico   -> el que usa el middleware para resolver por host,
//                              con índice único parcial (WHERE NOT NULL)
// Ambas se completan con el mismo valor al dar de alta.
// ─────────────────────────────────────────────────────────────

// Subdominios que no se pueden entregar porque colisionan con rutas o
// infraestructura de la app (o son nombres ambiguos).
export const SUBDOMINIOS_RESERVADOS = new Set([
  'www', 'api', 'app', 'admin', 'auth', 'login', 'logout', 'registro',
  'dashboard', 'agenda', 'paciente', 'pacientes', 'mail', 'ftp', 'static',
  'assets', 'cdn', 'blog', 'help', 'soporte', 'support', 'status', 'docs',
  'test', 'staging', 'dev', 'localhost', 'billing', 'facturacion',
])

// Marcas diacríticas combinantes (lo que queda tras normalize('NFD')).
const DIACRITICOS = /[̀-ͯ]/g

/**
 * Convierte el nombre de una clínica en un candidato a subdominio:
 * sin acentos, minúsculas, solo letras, números y guiones.
 */
export function slugifySubdominio(nombre: string): string {
  return (nombre || '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

/** Un subdominio es usable si tiene al menos 3 caracteres y no está reservado. */
export function esSubdominioValido(slug: string): boolean {
  return !!slug && slug.length >= 3 && !SUBDOMINIOS_RESERVADOS.has(slug)
}

/**
 * Devuelve una base de subdominio siempre usable a partir del nombre de la
 * clínica, aplicando fallbacks si el nombre no da un slug válido.
 */
export function baseSubdominioDesdeNombre(nombre: string): string {
  const slug = slugifySubdominio(nombre)
  if (!slug || slug.length < 3) return 'clinica'
  if (SUBDOMINIOS_RESERVADOS.has(slug)) return `${slug}-clinica`
  return slug
}
