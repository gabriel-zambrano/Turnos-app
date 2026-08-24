import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { esRutaPublica, RUTAS_DE_SISTEMA, RUTAS_PUBLICAS } from './rutas-publicas'

// ═══════════════════════════════════════════════════════════════════════════
// Resiliencia del middleware — caída del 24/08/2026
//
// LO QUE PASÓ
//
//   16:17:23 → 16:22:21, cinco minutos de 504 MIDDLEWARE_INVOCATION_TIMEOUT
//   en /dashboard, /nueva-cita, / y —tres veces— /sw.js. En los dos dominios.
//   Se normalizó solo.
//
//   El log de Vercel del request np26k-1787599367700 mostró:
//     External APIs: No outgoing requests
//     Memory Used:   234 MB
//     Response finished in 25.0s
//
//   Cero requests salientes: no se colgó esperando a Supabase. Se colgó antes.
//
// LOS DOS DEFECTOS QUE ESTOS TESTS FIJAN
//
//   1. El middleware calculaba `isPublic` y llamaba a Supabase igual. El
//      portal del paciente, la reserva y la firma —que entran por token, sin
//      login— dependían de Auth sin usarla.
//
//   2. El matcher solo excluía _next/static, _next/image y favicon.ico. El
//      service worker, el manifest y los iconos del PWA atravesaban el
//      middleware. En una ventana sana de 3 segundos, 8 de 13 invocaciones
//      eran archivos estáticos.
// ═══════════════════════════════════════════════════════════════════════════

/** El matcher real, leído del archivo: no se transcribe. */
function matcherDelMiddleware(): RegExp {
  const src = readFileSync(join(process.cwd(), 'src', 'middleware.ts'), 'utf8')
  const m = src.match(/matcher:\s*\[\s*'([^']+)'/)
  if (!m) throw new Error('No se pudo extraer el matcher de src/middleware.ts')
  return new RegExp('^' + m[1].replace(/\\\\/g, '\\') + '$')
}

/** true = el request PASA por el middleware. */
function pasaPorMiddleware(pathname: string): boolean {
  return matcherDelMiddleware().test(pathname)
}

describe('Matcher · los estáticos no llegan al middleware', () => {
  const NO_DEBEN_PASAR = [
    '/sw.js',
    '/manifest.json',
    '/offline.html',
    '/robots.txt',
    '/sitemap.xml',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/favicon.ico',
    '/_next/static/chunks/main.js',
    '/_next/image',
  ]

  it.each(NO_DEBEN_PASAR)('%s NO invoca el middleware', (p) => {
    expect(
      pasaPorMiddleware(p),
      `${p} sigue atravesando el middleware. Cada invocación evitable es un ` +
      `arranque en frío menos y una llamada a Supabase menos.`
    ).toBe(false)
  })

  it('los tres que fallaron el 24/08 quedaron excluidos', () => {
    // /sw.js dio 504 tres veces ese día. Es el caso emblemático: un service
    // worker agotando el timeout de autenticación.
    expect(pasaPorMiddleware('/sw.js')).toBe(false)
    expect(pasaPorMiddleware('/manifest.json')).toBe(false)
    expect(pasaPorMiddleware('/icons/icon-192.png')).toBe(false)
  })
})

describe('Matcher · las rutas de la app SÍ siguen protegidas', () => {
  // El riesgo de excluir de más es peor que el de excluir de menos: una ruta
  // privada fuera del matcher se queda sin verificación de sesión.
  const DEBEN_PASAR = [
    '/', '/dashboard', '/agenda', '/pacientes', '/pacientes/abc-123',
    '/finanzas', '/configuracion', '/equipo', '/bi', '/facturas',
    '/login', '/paciente/token-abc', '/reserva/clinica', '/firmar/tok',
    '/api/paciente/tok', '/api/equipo/invitar',
  ]

  it.each(DEBEN_PASAR)('%s sigue pasando por el middleware', (p) => {
    expect(pasaPorMiddleware(p), `${p} quedó FUERA del matcher`).toBe(true)
  })

  it('una ruta de la app que parezca archivo no se excluye por accidente', () => {
    // Por eso la exclusión es por nombre y no por extensión genérica.
    expect(pasaPorMiddleware('/pacientes/informe.json')).toBe(true)
    expect(pasaPorMiddleware('/dashboard/sw.js.tsx')).toBe(true)
  })
})

describe('Corto-circuito · lo público no toca Supabase', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'middleware.ts'), 'utf8')

  it('el middleware retorna antes de llamar a updateSession si la ruta es pública', () => {
    const iPublic = src.indexOf('if (isPublic)')
    const iUpdate = src.indexOf('await updateSession(')
    expect(iPublic, 'no existe el corto-circuito de ruta pública').toBeGreaterThan(-1)
    expect(iUpdate, 'no se encontró la llamada a updateSession').toBeGreaterThan(-1)
    expect(
      iPublic,
      'updateSession se llama ANTES del chequeo de ruta pública. Ese era ' +
      'exactamente el defecto del 24/08: el código calculaba isPublic y lo ignoraba.'
    ).toBeLessThan(iUpdate)
  })

  it('las rutas de cara al paciente son públicas y por lo tanto no dependen de Auth', () => {
    // Ninguna de estas tiene login: se entra con un token en la URL.
    for (const p of ['/paciente/tok', '/t/abc', '/agendar/x/y', '/reserva/clinica', '/firmar/tok']) {
      expect(esRutaPublica(p), `${p} debería ser pública`).toBe(true)
    }
  })

  it('las rutas privadas NO son públicas — el corto-circuito no las alcanza', () => {
    for (const p of ['/dashboard', '/agenda', '/pacientes', '/finanzas', '/equipo', '/configuracion']) {
      expect(esRutaPublica(p), `${p} quedó marcada como pública`).toBe(false)
    }
  })

  it('toda RUTA_DE_SISTEMA está excluida del matcher o es pública', () => {
    // Las dos barreras tienen que coincidir. Si una ruta de sistema pasa por el
    // middleware Y no es pública, termina redirigida al login.
    for (const p of RUTAS_DE_SISTEMA) {
      const ejemplo = p.endsWith('/') ? `${p}algo.png` : p
      const coherente = !pasaPorMiddleware(ejemplo) || esRutaPublica(ejemplo)
      expect(coherente, `${ejemplo}: pasa por el middleware y no es pública`).toBe(true)
    }
  })
})

describe('Timeout · Auth lento no cuelga el middleware', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  /** Reproduce el race de updateSession sin levantar Supabase. */
  function conTimeout(getUser: () => Promise<{ data: { user: unknown } }>, ms = 3000) {
    return Promise.race([
      getUser().then(({ data }) => data.user),
      new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
    ]).catch(() => null)
  }

  it('con Auth sano devuelve el usuario', async () => {
    const p = conTimeout(async () => ({ data: { user: { id: 'u1' } } }))
    await vi.advanceTimersByTimeAsync(0)
    expect(await p).toEqual({ id: 'u1' })
  })

  it('con Auth colgado resuelve en null a los 3s, no espera 25', async () => {
    const p = conTimeout(() => new Promise(() => {}))   // nunca resuelve
    await vi.advanceTimersByTimeAsync(3000)
    expect(await p).toBeNull()
  })

  it('con Auth que falla resuelve en null, no propaga la excepción', async () => {
    const p = conTimeout(async () => { throw new Error('ECONNRESET') })
    await vi.advanceTimersByTimeAsync(0)
    expect(await p).toBeNull()
  })

  it('a los 2.9s todavía espera — el límite no es prematuro', async () => {
    let resuelto = false
    const p = conTimeout(() => new Promise(() => {})).then(v => { resuelto = true; return v })
    await vi.advanceTimersByTimeAsync(2900)
    expect(resuelto, 'cortó antes de tiempo').toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    await p
    expect(resuelto).toBe(true)
  })

  it('el archivo real usa Promise.race con 3000ms', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'supabase', 'middleware.ts'), 'utf8')
    expect(src).toMatch(/Promise\.race/)
    expect(src).toMatch(/TIMEOUT_MS\s*=\s*3000/)
    expect(src, 'falta el .catch: una excepción de red volvería a propagarse')
      .toMatch(/\.catch\(/)
  })
})

describe('Cobertura del propio análisis', () => {
  it('el matcher se pudo extraer del archivo', () => {
    expect(matcherDelMiddleware().source.length).toBeGreaterThan(20)
  })

  it('las listas de rutas no están vacías', () => {
    expect(RUTAS_PUBLICAS.length).toBeGreaterThan(5)
    expect(RUTAS_DE_SISTEMA.length).toBeGreaterThan(3)
  })

  it('el detector distingue pasar de no pasar', () => {
    expect(pasaPorMiddleware('/dashboard')).toBe(true)
    expect(pasaPorMiddleware('/sw.js')).toBe(false)
  })
})
