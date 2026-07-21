// ─────────────────────────────────────────────────────────────
// Rate limiter simple en memoria (por instancia serverless).
//
// Nota: en Vercel cada instancia tiene su propia memoria, así que
// esto NO es un límite global perfecto. Aun así frena de forma
// efectiva el abuso automatizado (fuerza bruta de tokens, registro
// masivo) sin infraestructura extra. Si el tráfico crece, migrar a
// un store compartido (Upstash Redis / Vercel KV) manteniendo esta
// misma interfaz.
// ─────────────────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number }

const store = new Map<string, Bucket>()

// Limpieza perezosa para que el Map no crezca sin límite.
function sweep(now: number) {
  if (store.size < 5000) return
  const expired: string[] = []
  store.forEach((bucket, key) => {
    if (bucket.resetAt <= now) expired.push(key)
  })
  expired.forEach((key) => store.delete(key))
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
  retryAfterSec: number
}

/**
 * Devuelve si la clave `key` está dentro del límite de `limit`
 * solicitudes por ventana de `windowMs` milisegundos.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const bucket = store.get(key)

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return { ok: true, remaining: limit - 1, resetAt, retryAfterSec: 0 }
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count += 1
  return {
    ok: true,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
    retryAfterSec: 0,
  }
}

/**
 * Extrae la IP del cliente de los headers habituales de Vercel/proxies.
 * Cae a 'unknown' si no encuentra ninguna (todas las 'unknown' comparten
 * bucket, lo cual es el comportamiento seguro).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}
