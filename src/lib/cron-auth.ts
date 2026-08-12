// ─────────────────────────────────────────────────────────────
// Autenticación de los endpoints internos (cron y tareas programadas).
//
// POR QUÉ EXISTE
// El secreto viajaba en la query string. Tres rutas lo aceptaban así, y
// `/api/cron` además lo ARMABA de esa forma para llamar a otra ruta:
//
//   fetch(`${base}/api/send-recordatorios?token=${secret}`)
//
// Un query string queda registrado en los access logs de Vercel, en cualquier
// proxy intermedio, en el header `Referer` y —con la configuración de Sentry
// que había— en las trazas. Ese único `fetch` publicaba CRON_SECRET en dos
// lugares por corrida: el span `http.client` de la traza de `/api/cron` y la
// transacción entrante de `/api/send-recordatorios`.
//
// Con CRON_SECRET se puede disparar el envío de recordatorios de TODAS las
// clínicas, así que no es un secreto menor.
//
// Ahora va siempre en el header `Authorization: Bearer <secret>`, que es lo que
// Vercel Cron ya usaba para llamar a `/api/cron`. No es un formato nuevo: es el
// que el sistema ya hablaba en la mitad del camino.
// ─────────────────────────────────────────────────────────────

import crypto from 'crypto'

/**
 * Comparación en tiempo constante.
 *
 * `timingSafeEqual` explota si los buffers miden distinto, así que la longitud
 * se chequea antes. No es la defensa principal —el jitter de red tapa la
 * diferencia de timing— pero es el mismo criterio que ya usa la verificación de
 * firma de MercadoPago y no cuesta nada mantenerlo parejo.
 */
export function comparacionSegura(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  try {
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

/**
 * Extrae el token de un header `Authorization: Bearer <token>`.
 * Devuelve '' si el header falta o no tiene ese formato.
 */
export function tokenDeAuthorization(header: string | null | undefined): string {
  if (!header) return ''
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m ? m[1].trim() : ''
}

/**
 * ¿Este request viene del cron con la credencial correcta?
 *
 * Solo acepta el header. Deliberadamente NO acepta `?token=`: era el patrón que
 * esta corrección elimina, y dejar la puerta abierta "por compatibilidad"
 * significa no haber cerrado nada.
 *
 * Devuelve false si CRON_SECRET no está configurado: sin secreto no hay
 * autorización posible. Falla cerrado.
 */
export function esCron(req: { headers: { get(name: string): string | null } }): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const recibido = tokenDeAuthorization(req.headers.get('authorization'))
  if (!recibido) return false
  return comparacionSegura(recibido, secret)
}

/** El header con el que una ruta interna llama a otra. */
export function headerDeCron(secret: string): Record<string, string> {
  return { Authorization: `Bearer ${secret}` }
}
