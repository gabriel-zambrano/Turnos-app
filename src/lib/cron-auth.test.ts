import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { esCron, headerDeCron, tokenDeAuthorization, comparacionSegura } from './cron-auth'

// ─────────────────────────────────────────────────────────────
// P0-03 · CRON_SECRET deja de viajar en la URL.
//
// El patrón que se elimina:
//
//   /api/cron  →  fetch(`${base}/api/send-recordatorios?token=${secret}`)
//
// Ese único fetch publicaba el secreto en dos lugares por corrida: el span
// http.client de la traza de /api/cron y la transacción entrante de
// /api/send-recordatorios. Además quedaba en los access logs de Vercel y en
// cualquier proxy intermedio.
//
// Con CRON_SECRET se dispara el envío de recordatorios y las campañas de
// WhatsApp de TODAS las clínicas, así que no es un secreto de segundo orden.
// ─────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, '..', '..')
const SECRETO = 'secreto-de-prueba-32-caracteres!!'

/** Request mínimo: solo lo que esCron necesita. */
function reqCon(headers: Record<string, string>) {
  const normalizados: Record<string, string> = {}
  for (const k of Object.keys(headers)) normalizados[k.toLowerCase()] = headers[k]
  return { headers: { get: (n: string) => normalizados[n.toLowerCase()] ?? null } }
}

const secretoOriginal = process.env.CRON_SECRET

beforeEach(() => { process.env.CRON_SECRET = SECRETO })
afterEach(() => {
  if (secretoOriginal === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = secretoOriginal
})

describe('tokenDeAuthorization', () => {
  it('extrae el token de un header Bearer', () => {
    expect(tokenDeAuthorization('Bearer abc123')).toBe('abc123')
  })

  it('es indiferente a mayúsculas en el esquema', () => {
    expect(tokenDeAuthorization('bearer abc123')).toBe('abc123')
  })

  it('devuelve vacío si el header falta o no es Bearer', () => {
    expect(tokenDeAuthorization(null)).toBe('')
    expect(tokenDeAuthorization('')).toBe('')
    expect(tokenDeAuthorization('Basic dXNlcjpwYXNz')).toBe('')
    expect(tokenDeAuthorization('abc123')).toBe('')
  })
})

describe('comparacionSegura', () => {
  it('acepta valores idénticos', () => {
    expect(comparacionSegura('abc', 'abc')).toBe(true)
  })

  it('rechaza valores distintos', () => {
    expect(comparacionSegura('abc', 'abd')).toBe(false)
  })

  it('rechaza longitudes distintas sin explotar', () => {
    // timingSafeEqual lanza si los buffers miden distinto.
    expect(() => comparacionSegura('abc', 'abcdef')).not.toThrow()
    expect(comparacionSegura('abc', 'abcdef')).toBe(false)
  })

  it('rechaza valores vacíos', () => {
    expect(comparacionSegura('', '')).toBe(true)
    expect(comparacionSegura('abc', '')).toBe(false)
  })
})

describe('esCron — el endpoint sigue rechazando lo que debe', () => {
  it('acepta el header correcto: el cron sigue funcionando', () => {
    expect(esCron(reqCon({ Authorization: `Bearer ${SECRETO}` }))).toBe(true)
  })

  it('rechaza un request sin credenciales', () => {
    expect(esCron(reqCon({}))).toBe(false)
  })

  it('rechaza un secreto incorrecto', () => {
    expect(esCron(reqCon({ Authorization: 'Bearer otro-secreto-distinto!!!' }))).toBe(false)
  })

  it('rechaza el secreto por query param: ya no es un camino válido', () => {
    // Aunque el valor sea correcto, si no viene en el header no se acepta.
    expect(esCron(reqCon({ 'x-token': SECRETO }))).toBe(false)
  })

  it('rechaza un Bearer vacío', () => {
    expect(esCron(reqCon({ Authorization: 'Bearer ' }))).toBe(false)
  })

  it('falla cerrado si CRON_SECRET no está configurado', () => {
    delete process.env.CRON_SECRET
    expect(esCron(reqCon({ Authorization: 'Bearer lo-que-sea' }))).toBe(false)
  })

  it('no se deja engañar por un secreto que es prefijo del real', () => {
    expect(esCron(reqCon({ Authorization: `Bearer ${SECRETO.slice(0, 10)}` }))).toBe(false)
  })
})

describe('headerDeCron', () => {
  it('arma el header que espera el receptor', () => {
    expect(headerDeCron(SECRETO)).toEqual({ Authorization: `Bearer ${SECRETO}` })
  })

  it('lo que produce es aceptado por esCron: ida y vuelta cerrada', () => {
    const h = headerDeCron(SECRETO)
    expect(esCron(reqCon(h))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// Guardas sobre el código fuente.
// ─────────────────────────────────────────────────────────────

const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')
const sinComentarios = (t: string) =>
  t.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

describe('CRON_SECRET no aparece en ninguna URL', () => {
  it('/api/cron llama a send-recordatorios con header, no con query param', () => {
    const codigo = sinComentarios(leer('src/app/api/cron/route.ts'))
    expect(codigo).not.toMatch(/token=\$\{/)
    expect(codigo).toMatch(/headers:\s*headerDeCron\(/)
  })

  it('ninguna ruta arma una URL con el secreto adentro', () => {
    const rutas = [
      'src/app/api/cron/route.ts',
      'src/app/api/send-recordatorios/route.ts',
      'src/app/api/crm-campanas/route.ts',
      'src/app/api/daily-briefing/route.ts',
    ]
    for (const r of rutas) {
      const codigo = sinComentarios(leer(r))
      expect(codigo, `${r} no debe construir URLs con el secreto`)
        .not.toMatch(/[?&]token=\$\{/)
    }
  })

  it('ninguna ruta de cron lee el secreto desde la query string', () => {
    const rutas = [
      'src/app/api/cron/route.ts',
      'src/app/api/send-recordatorios/route.ts',
      'src/app/api/crm-campanas/route.ts',
      'src/app/api/daily-briefing/route.ts',
    ]
    for (const r of rutas) {
      const codigo = sinComentarios(leer(r))
      expect(codigo, `${r} no debe leer el secreto de searchParams`)
        .not.toMatch(/searchParams\.get\(\s*['"]token['"]\s*\)/)
    }
  })

  it('las cuatro rutas de cron validan con el helper compartido', () => {
    const rutas = [
      'src/app/api/cron/route.ts',
      'src/app/api/send-recordatorios/route.ts',
      'src/app/api/crm-campanas/route.ts',
      'src/app/api/daily-briefing/route.ts',
    ]
    for (const r of rutas) {
      expect(leer(r), `${r} debe usar esCron()`).toMatch(/esCron\(/)
    }
  })

  it('ninguna compara el secreto con === (comparación no constante)', () => {
    const rutas = [
      'src/app/api/cron/route.ts',
      'src/app/api/crm-campanas/route.ts',
      'src/app/api/daily-briefing/route.ts',
    ]
    for (const r of rutas) {
      const codigo = sinComentarios(leer(r))
      expect(codigo, `${r} debe delegar la comparación en cron-auth`)
        .not.toMatch(/===\s*`Bearer \$\{/)
    }
  })
})

describe('los callers legítimos siguen funcionando', () => {
  it('el dashboard sigue llamando a send-recordatorios con sesión, sin secreto', () => {
    // Este caller no usa CRON_SECRET: se autentica con la cookie de sesión y
    // manda tenantId en el body. No debe haberse tocado.
    const dash = leer('src/app/dashboard/page.tsx')
    expect(dash).toMatch(/fetch\('\/api\/send-recordatorios'/)
    expect(dash).not.toMatch(/send-recordatorios\?token=/)
  })

  it('send-recordatorios conserva el camino de usuario logueado', () => {
    const codigo = leer('src/app/api/send-recordatorios/route.ts')
    expect(codigo).toMatch(/auth\.getUser\(\)/)
    expect(codigo).toMatch(/tenant_users/)
  })

  it('vercel.json sigue apuntando a las tres rutas de cron', () => {
    // Vercel Cron manda `Authorization: Bearer $CRON_SECRET` solo, que es
    // exactamente lo que ahora exigen las tres.
    const vercel = JSON.parse(leer('vercel.json'))
    const paths = vercel.crons.map((c: { path: string }) => c.path).sort()
    // Ordenados alfabéticamente: 'crm' < 'cron' porque 'm' < 'n'.
    expect(paths).toEqual(['/api/crm-campanas', '/api/cron', '/api/daily-briefing'])
  })
})
