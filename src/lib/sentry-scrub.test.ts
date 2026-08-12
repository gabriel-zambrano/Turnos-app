import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  sanitizarPath,
  sanitizarQuery,
  sanitizarUrl,
  sanitizarHeaders,
  sanitizarDatos,
  beforeSend,
  beforeBreadcrumb,
} from './sentry-scrub'

// ─────────────────────────────────────────────────────────────
// P0-03 · Sentry deja de recibir secretos y PII.
//
// Los secretos de este sistema viajan en el path de la URL, y con
// `tracesSampleRate: 1` cada request generaba un evento con esa URL. Estos
// tests verifican que el saneo tapa las cuatro vías por las que se filtraban:
// la URL del request, los headers, el cuerpo y los breadcrumbs.
//
// Son funciones puras: ni red, ni SDK de Sentry, ni base.
// ─────────────────────────────────────────────────────────────

const TOKEN = '8f3a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8'
const RAIZ = join(__dirname, '..', '..')

describe('sanitizarPath — el segmento que es una credencial', () => {
  it('tapa el token del portal del paciente', () => {
    expect(sanitizarPath(`/paciente/${TOKEN}`)).toBe('/paciente/[redacted]')
  })

  it('tapa el token en la API del portal', () => {
    expect(sanitizarPath(`/api/paciente/${TOKEN}`)).toBe('/api/paciente/[redacted]')
  })

  it('conserva el sufijo de la ruta, que es lo que sirve para agrupar', () => {
    expect(sanitizarPath(`/api/paciente/${TOKEN}/estado`)).toBe('/api/paciente/[redacted]/estado')
    expect(sanitizarPath(`/api/paciente/${TOKEN}/feedback`)).toBe('/api/paciente/[redacted]/feedback')
  })

  it('tapa el token de firma de consentimiento', () => {
    expect(sanitizarPath(`/firmar/${TOKEN}`)).toBe('/firmar/[redacted]')
    expect(sanitizarPath(`/api/consentimientos/firmar/${TOKEN}`))
      .toBe('/api/consentimientos/firmar/[redacted]')
  })

  it('tapa el código corto del turno', () => {
    expect(sanitizarPath('/t/K3M9QPX7RB4T')).toBe('/t/[redacted]')
  })

  it('tapa el formato viejo /agendar/<token>/<cita>', () => {
    expect(sanitizarPath(`/agendar/${TOKEN}/${TOKEN}`)).toBe('/agendar/[redacted]/[uuid]')
  })

  it('no confunde /api/paciente con /paciente', () => {
    // El prefijo más largo tiene que evaluarse primero o queda "/api[redacted]".
    expect(sanitizarPath(`/api/paciente/${TOKEN}`)).not.toContain('/api/[redacted]')
  })

  it('tapa cualquier UUID suelto en otras rutas', () => {
    expect(sanitizarPath(`/api/facturacion/pdf/${TOKEN}`)).toBe('/api/facturacion/pdf/[uuid]')
  })

  it('deja intactas las rutas sin secretos', () => {
    expect(sanitizarPath('/dashboard')).toBe('/dashboard')
    expect(sanitizarPath('/api/facturacion/emitir')).toBe('/api/facturacion/emitir')
    expect(sanitizarPath('/pacientes')).toBe('/pacientes')
  })

  it('no toca /pacientes, que es la pantalla privada y no lleva token', () => {
    // El mismo tipo de confusión de prefijo que ya había mordido en
    // rutas-publicas.ts: /paciente (portal) vs /pacientes (listado interno).
    expect(sanitizarPath('/pacientes')).toBe('/pacientes')
  })
})

describe('sanitizarQuery — valores sensibles', () => {
  it('tapa el token del cron', () => {
    expect(sanitizarQuery('?token=abc123secreto')).toBe('?token=[redacted]')
  })

  it('tapa el código corto del enlace de turno', () => {
    expect(sanitizarQuery('?c=K3M9QPX7RB4T')).toBe('?c=[redacted]')
  })

  it('conserva las claves y los valores que no son secretos', () => {
    expect(sanitizarQuery('?fecha=2026-08-08&tenant_id=abc'))
      .toBe('?fecha=2026-08-08&tenant_id=abc')
  })

  it('tapa solo lo sensible en una query mixta', () => {
    expect(sanitizarQuery('?fecha=2026-08-08&token=secreto&cita=5'))
      .toBe('?fecha=2026-08-08&token=[redacted]&cita=5')
  })

  it('tapa apikey, access_token y secret', () => {
    expect(sanitizarQuery('?apikey=x&access_token=y&secret=z'))
      .toBe('?apikey=[redacted]&access_token=[redacted]&secret=[redacted]')
  })
})

describe('sanitizarUrl — absolutas y relativas', () => {
  it('sanea una URL absoluta conservando el origen', () => {
    expect(sanitizarUrl(`https://app.ejemplo.com/paciente/${TOKEN}`))
      .toBe('https://app.ejemplo.com/paciente/[redacted]')
  })

  it('sanea una URL relativa (breadcrumbs de fetch)', () => {
    expect(sanitizarUrl(`/api/paciente/${TOKEN}`)).toBe('/api/paciente/[redacted]')
  })

  it('sanea path y query a la vez', () => {
    expect(sanitizarUrl(`/api/ics?token=${TOKEN}&cita=${TOKEN}`))
      .toBe('/api/ics?token=[redacted]&cita=[uuid]')
  })

  it('CRON_SECRET no sobrevive en la llamada interna', () => {
    // Era el caso concreto: el span http.client de /api/cron.
    expect(sanitizarUrl('https://app.ejemplo.com/api/send-recordatorios?token=SUPERSECRETO'))
      .toBe('https://app.ejemplo.com/api/send-recordatorios?token=[redacted]')
  })

  it('ante una URL no parseable no la deja pasar en crudo', () => {
    expect(sanitizarUrl('http://[[[malformada')).toBe('[redacted]')
  })

  it('tolera valores vacíos sin romper', () => {
    expect(sanitizarUrl('')).toBe('')
  })
})

describe('sanitizarHeaders — cookies y credenciales', () => {
  it('elimina la cookie de sesión de Supabase', () => {
    const limpio = sanitizarHeaders({
      cookie: 'sb-lbaqbhpjjhhzplijxilp-auth-token=eyJhbGciOi...',
      'content-type': 'application/json',
    })
    expect(limpio).not.toHaveProperty('cookie')
    expect(limpio).toHaveProperty('content-type')
  })

  it('elimina el header Authorization', () => {
    expect(sanitizarHeaders({ authorization: 'Bearer SUPERSECRETO' }))
      .not.toHaveProperty('authorization')
  })

  it('es indiferente a mayúsculas', () => {
    const limpio = sanitizarHeaders({ Cookie: 'x', Authorization: 'Bearer y' })
    expect(Object.keys(limpio || {})).toEqual([])
  })

  it('elimina las firmas de webhook', () => {
    const limpio = sanitizarHeaders({ 'x-signature': 'ts=1,v1=abc', 'svix-signature': 'v1,xxx' })
    expect(Object.keys(limpio || {})).toEqual([])
  })

  it('elimina los headers de IP', () => {
    const limpio = sanitizarHeaders({
      'x-forwarded-for': '190.1.2.3', 'x-real-ip': '190.1.2.3', 'cf-connecting-ip': '190.1.2.3',
      'user-agent': 'Mozilla/5.0',
    })
    expect(Object.keys(limpio || {})).toEqual(['user-agent'])
  })
})

describe('sanitizarDatos — cuerpo del request', () => {
  it('tapa la firma manuscrita del consentimiento', () => {
    const r = sanitizarDatos({ firmaPng: 'data:image/png;base64,iVBOR...', firmanteNombre: 'x' }) as any
    expect(r.firmaPng).toBe('[redacted]')
  })

  it('tapa datos clínicos', () => {
    const r = sanitizarDatos({ alergias: 'penicilina', antecedentes: 'diabetes', notas: 'x' }) as any
    expect(r.alergias).toBe('[redacted]')
    expect(r.antecedentes).toBe('[redacted]')
    expect(r.notas).toBe('[redacted]')
  })

  it('tapa documento, email y teléfono', () => {
    const r = sanitizarDatos({ pacienteDocNro: '20111222', email: 'a@b.com', telefono: '+54911' }) as any
    expect(r.pacienteDocNro).toBe('[redacted]')
    expect(r.email).toBe('[redacted]')
    expect(r.telefono).toBe('[redacted]')
  })

  it('conserva lo que sirve para diagnosticar', () => {
    const r = sanitizarDatos({ tenantId: 'abc', citaId: 'def', tipoComprobante: 11 }) as any
    expect(r.tenantId).toBe('abc')
    expect(r.citaId).toBe('def')
    expect(r.tipoComprobante).toBe(11)
  })

  it('funciona en objetos anidados y arrays', () => {
    const r = sanitizarDatos({ paciente: { email: 'a@b.com', id: '1' }, items: [{ notas: 'x' }] }) as any
    expect(r.paciente.email).toBe('[redacted]')
    expect(r.paciente.id).toBe('1')
    expect(r.items[0].notas).toBe('[redacted]')
  })

  it('no se cuelga con estructuras cíclicas', () => {
    const ciclico: any = { a: 1 }
    ciclico.self = ciclico
    expect(() => sanitizarDatos(ciclico)).not.toThrow()
  })
})

describe('beforeSend — el evento completo', () => {
  it('sanea URL, headers, cookies y cuerpo de una sola pasada', () => {
    const evento = beforeSend({
      message: 'Error al cargar el portal',
      transaction: `/paciente/${TOKEN}`,
      request: {
        url: `https://app.ejemplo.com/api/paciente/${TOKEN}?c=ABC`,
        query_string: 'c=ABC',
        headers: { cookie: 'sb-x-auth-token=y', authorization: 'Bearer z', 'user-agent': 'M' },
        cookies: { 'sb-x-auth-token': 'y' },
        data: { alergias: 'penicilina' },
      },
      user: { id: 'uuid-usuario', email: 'doc@clinica.com', ip_address: '190.1.2.3' },
    }) as any

    expect(evento.request.url).toBe('https://app.ejemplo.com/api/paciente/[redacted]?c=[redacted]')
    expect(evento.transaction).toBe('/paciente/[redacted]')
    expect(evento.request.query_string).toBe('c=[redacted]')
    expect(evento.request.headers).not.toHaveProperty('cookie')
    expect(evento.request.headers).not.toHaveProperty('authorization')
    expect(evento.request).not.toHaveProperty('cookies')
    expect(evento.request.data.alergias).toBe('[redacted]')
  })

  it('conserva lo útil para debugging', () => {
    const evento = beforeSend({
      message: 'Boom',
      exception: { values: [{ type: 'TypeError', value: 'x is not a function' }] },
      release: 'v1.2.3',
      environment: 'production',
      tags: { tenant_id: 'abc-123' },
      request: { url: '/api/facturacion/emitir', method: 'POST', headers: { 'user-agent': 'M' } },
      user: { id: 'uuid-usuario' },
    }) as any

    expect(evento.message).toBe('Boom')
    expect(evento.exception.values[0].type).toBe('TypeError')
    expect(evento.release).toBe('v1.2.3')
    expect(evento.tags.tenant_id).toBe('abc-123')
    expect(evento.request.method).toBe('POST')
    expect(evento.request.headers['user-agent']).toBe('M')
    // El id del usuario se conserva; email e IP no.
    expect(evento.user.id).toBe('uuid-usuario')
  })

  it('elimina email e IP del usuario aun si el SDK los adjuntó', () => {
    const evento = beforeSend({
      user: { id: 'u1', email: 'doc@clinica.com', ip_address: '190.1.2.3', username: 'doc' },
    }) as any
    expect(evento.user.id).toBe('u1')
    expect(evento.user).not.toHaveProperty('email')
    expect(evento.user).not.toHaveProperty('ip_address')
    expect(evento.user).not.toHaveProperty('username')
  })

  it('sanea los spans: es donde viajaba CRON_SECRET', () => {
    const evento = beforeSend({
      transaction: '/api/cron',
      spans: [{
        op: 'http.client',
        description: 'POST https://app.ejemplo.com/api/send-recordatorios?token=SUPERSECRETO',
        data: { 'http.url': 'https://app.ejemplo.com/api/send-recordatorios?token=SUPERSECRETO' },
      }],
    }) as any
    expect(evento.spans[0].description).not.toContain('SUPERSECRETO')
    expect(evento.spans[0].description).toContain('[redacted]')
  })

  it('sanea los breadcrumbs embebidos en el evento', () => {
    const evento = beforeSend({
      breadcrumbs: [{ category: 'fetch', data: { url: `/api/paciente/${TOKEN}` } }],
    }) as any
    expect(evento.breadcrumbs[0].data.url).toBe('/api/paciente/[redacted]')
  })

  it('falla cerrado: ante un evento que rompe el saneo, lo descarta', () => {
    const trampa: any = {}
    Object.defineProperty(trampa, 'request', {
      get() { throw new Error('boom') },
      enumerable: true,
    })
    // Preferimos perder un reporte a filtrar un token.
    expect(beforeSend(trampa)).toBeNull()
  })

  it('tolera null y eventos vacíos', () => {
    expect(beforeSend(null)).toBeNull()
    expect(beforeSend({})).toEqual({})
  })
})

describe('beforeBreadcrumb', () => {
  it('sanea la URL de un breadcrumb de fetch', () => {
    const b = beforeBreadcrumb({ category: 'fetch', data: { url: `/api/paciente/${TOKEN}` } }) as any
    expect(b.data.url).toBe('/api/paciente/[redacted]')
  })

  it('sanea la navegación entre páginas del portal', () => {
    const b = beforeBreadcrumb({
      category: 'navigation',
      data: { from: `/paciente/${TOKEN}`, to: `/paciente/${TOKEN}#turnos` },
    }) as any
    expect(b.data.from).toBe('/paciente/[redacted]')
    expect(b.data.to).toContain('/paciente/[redacted]')
  })

  it('sanea la URL cuando viene dentro del mensaje', () => {
    const b = beforeBreadcrumb({
      category: 'fetch',
      message: `GET /api/paciente/${TOKEN}`,
    }) as any
    expect(b.message).not.toContain(TOKEN)
  })

  it('tolera null', () => {
    expect(beforeBreadcrumb(null)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────
// REGRESIÓN CON DATOS REALES DE PRODUCCIÓN
//
// Estas estructuras salieron tal cual del issue JAVASCRIPT-NEXTJS-9 del
// 11/08/2026. Se conservan textuales a propósito: la primera versión del
// saneador pasaba todos los tests sintéticos y aun así dejaba pasar el token
// por `tags.url` y la IP por `user.id`. Los datos inventados no encontraron
// esos dos huecos; los reales, sí.
// ─────────────────────────────────────────────────────────────

const TOKEN_REAL = '95c42d2b-8997-4572-882f-652b28047465'
const IP_REAL = '201.216.219.225'
const DOMINIO = 'https://turnos.walterbenegas.com.ar'

describe('regresión · formas reales de producción', () => {
  it('breadcrumb navigation: from y to', () => {
    const b = beforeBreadcrumb({
      type: 'navigation', category: 'navigation', level: 'info',
      data: { from: `/paciente/${TOKEN_REAL}`, to: `/paciente/${TOKEN_REAL}` },
    }) as any
    expect(b.data.from).toBe('/paciente/[redacted]')
    expect(b.data.to).toBe('/paciente/[redacted]')
    expect(JSON.stringify(b)).not.toContain(TOKEN_REAL)
  })

  it('breadcrumb fetch a /api/paciente', () => {
    const b = beforeBreadcrumb({
      type: 'http', category: 'fetch', level: 'error',
      data: { __span: '8030546e68bd4077', method: 'GET', url: `/api/paciente/${TOKEN_REAL}` },
    }) as any
    expect(b.data.url).toBe('/api/paciente/[redacted]')
    expect(b.data.method).toBe('GET')
    expect(JSON.stringify(b)).not.toContain(TOKEN_REAL)
  })

  it('tags.url — el hueco que encontró la evidencia real', () => {
    // Sentry indexa `url` como tag. Sin esto, el token quedaba buscable desde
    // la pantalla de tags del issue: así se contaron los 4 tokens expuestos.
    const e = beforeSend({
      tags: { url: `${DOMINIO}/paciente/${TOKEN_REAL}`, transaction: '/paciente/:token' },
    }) as any
    expect(e.tags.url).toBe(`${DOMINIO}/paciente/[redacted]`)
    expect(JSON.stringify(e)).not.toContain(TOKEN_REAL)
  })

  it('tags.transaction se conserva: ahí no hay secreto y es lo que agrupa', () => {
    const e = beforeSend({ tags: { transaction: '/paciente/:token' } }) as any
    expect(e.tags.transaction).toBe('/paciente/:token')
  })

  it('event.transaction normalizado se conserva igual que el tag', () => {
    // El evento JAVASCRIPT-NEXTJS-G salió con `/paciente/[redacted]` porque este
    // campo se saneaba sin la guarda. No protegía nada —`:token` no es un
    // secreto— y de paso degradaba el tag, que Sentry deriva de acá.
    const e = beforeSend({ transaction: '/paciente/:token' }) as any
    expect(e.transaction).toBe('/paciente/:token')
  })

  it('pero si transaction trae un UUID resuelto, SÍ se sanea', () => {
    const e = beforeSend({ transaction: `/paciente/${TOKEN_REAL}` }) as any
    expect(e.transaction).toBe('/paciente/[redacted]')
    expect(JSON.stringify(e)).not.toContain(TOKEN_REAL)
  })

  it('el environment se resuelve con la variable que Next expone al cliente', () => {
    // Sin `NEXT_PUBLIC_VERCEL_ENV`, en el navegador `VERCEL_ENV` es undefined y
    // cae a NODE_ENV='production': los eventos de preview llegaban rotulados
    // como producción y se mezclaban con los reales.
    const compartida = readFileSync(join(RAIZ, 'src/lib/sentry-config.ts'), 'utf8')
    const sinComentarios = compartida.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(sinComentarios).toMatch(/NEXT_PUBLIC_VERCEL_ENV/)
    // Y tiene que ir PRIMERO en la cadena de fallback.
    const orden = sinComentarios.indexOf('NEXT_PUBLIC_VERCEL_ENV')
    const ordenVercelEnv = sinComentarios.indexOf('process.env.VERCEL_ENV')
    expect(orden).toBeLessThan(ordenVercelEnv)
  })

  it('tags sin secretos quedan intactos', () => {
    const e = beforeSend({
      tags: { browser: 'Mobile Safari 26.5.2', os: 'iOS 18.7', environment: 'vercel-production' },
    }) as any
    expect(e.tags).toEqual({
      browser: 'Mobile Safari 26.5.2', os: 'iOS 18.7', environment: 'vercel-production',
    })
  })

  it('user.id con formato ip: — el segundo hueco', () => {
    // Sin sesión, Sentry usa la IP como identificador. Conservar `id` a ciegas
    // dejaba pasar la IP justo en el portal del paciente.
    const e = beforeSend({ user: { id: `ip:${IP_REAL}`, ip_address: IP_REAL } }) as any
    expect(e.user).not.toHaveProperty('id')
    expect(e.user).not.toHaveProperty('ip_address')
    expect(JSON.stringify(e)).not.toContain(IP_REAL)
  })

  it('user.id con UUID de usuario autenticado SE CONSERVA', () => {
    // Es lo que permite seguir a un odontólogo entre eventos. No es PII por sí
    // solo y sin él Sentry pierde buena parte de su utilidad.
    const uuid = '7f3c1a20-5b9e-4d61-8a2f-11c9e0d4b7a3'
    const e = beforeSend({ user: { id: uuid } }) as any
    expect(e.user.id).toBe(uuid)
  })

  it('evento completo: ningún campo conserva el token ni la IP', () => {
    const e = beforeSend({
      message: 'Load failed',
      transaction: '/paciente/:token',
      tags: {
        transaction: '/paciente/:token',
        url: `${DOMINIO}/paciente/${TOKEN_REAL}`,
        browser: 'Mobile Safari 26.5.2',
        environment: 'vercel-production',
      },
      user: { id: `ip:${IP_REAL}`, ip_address: IP_REAL },
      request: { url: `${DOMINIO}/paciente/${TOKEN_REAL}` },
      breadcrumbs: [
        { type: 'navigation', category: 'navigation',
          data: { from: `/paciente/${TOKEN_REAL}`, to: `/paciente/${TOKEN_REAL}` } },
        { type: 'http', category: 'fetch',
          data: { __span: '8030546e68bd4077', method: 'GET', url: `/api/paciente/${TOKEN_REAL}` } },
      ],
    }) as any

    const serializado = JSON.stringify(e)
    expect(serializado, 'el token no debe sobrevivir en NINGÚN campo').not.toContain(TOKEN_REAL)
    expect(serializado, 'la IP no debe sobrevivir en NINGÚN campo').not.toContain(IP_REAL)
    // Y lo que sirve para diagnosticar sigue ahí.
    expect(e.message).toBe('Load failed')
    expect(e.tags.browser).toBe('Mobile Safari 26.5.2')
    expect(e.tags.environment).toBe('vercel-production')
  })
})

// ─────────────────────────────────────────────────────────────
// Guardas sobre la configuración. Leen los archivos y fallan si alguien
// revierte el cambio, que es como estas cosas vuelven.
// ─────────────────────────────────────────────────────────────

const CONFIGS = [
  'sentry.server.config.ts',
  'sentry.edge.config.ts',
  'src/instrumentation-client.ts',
]

describe('configuración de Sentry', () => {
  it('sendDefaultPii está desactivado', () => {
    const compartida = readFileSync(join(RAIZ, 'src/lib/sentry-config.ts'), 'utf8')
    expect(compartida).toMatch(/sendDefaultPii:\s*false/)
    expect(compartida).not.toMatch(/sendDefaultPii:\s*true/)
  })

  it('ningún archivo de configuración vuelve a activar sendDefaultPii', () => {
    for (const c of [...CONFIGS, 'src/lib/sentry-config.ts']) {
      const texto = readFileSync(join(RAIZ, c), 'utf8')
      const sinComentarios = texto.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
      expect(sinComentarios, `${c} no debe activar sendDefaultPii`)
        .not.toMatch(/sendDefaultPii:\s*true/)
    }
  })

  it('los tres entornos usan la misma configuración compartida', () => {
    for (const c of CONFIGS) {
      const texto = readFileSync(join(RAIZ, c), 'utf8')
      expect(texto, `${c} debe importar la config compartida`).toMatch(/sentry-config/)
      // Si alguno vuelve a declarar sus propias opciones, divergen.
      const sinComentarios = texto.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
      expect(sinComentarios, `${c} no debe declarar tracesSampleRate por su cuenta`)
        .not.toMatch(/tracesSampleRate:/)
    }
  })

  it('los tres hooks de saneo están conectados', () => {
    const compartida = readFileSync(join(RAIZ, 'src/lib/sentry-config.ts'), 'utf8')
    expect(compartida).toMatch(/beforeSend/)
    expect(compartida).toMatch(/beforeSendTransaction/)
    expect(compartida).toMatch(/beforeBreadcrumb/)
  })

  it('el sampling en producción no es 1', () => {
    const compartida = readFileSync(join(RAIZ, 'src/lib/sentry-config.ts'), 'utf8')
    const sinComentarios = compartida.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(sinComentarios).not.toMatch(/tracesSampleRate:\s*1\s*,/)
    expect(sinComentarios).toMatch(/tracesSampleRate:/)
  })

  it('los logs no se mandan en producción', () => {
    const compartida = readFileSync(join(RAIZ, 'src/lib/sentry-config.ts'), 'utf8')
    const sinComentarios = compartida.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(sinComentarios).not.toMatch(/enableLogs:\s*true/)
  })
})

// ─────────────────────────────────────────────────────────────
// Guarda de cobertura: si aparece una ruta nueva con un secreto en el path,
// el saneador tiene que conocerla. Sin esto, la protección envejece sola.
// ─────────────────────────────────────────────────────────────

function archivosFuente(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'node_modules' || entrada === '.next') continue
      archivosFuente(ruta, acumulado)
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

describe('cobertura del saneador', () => {
  it('toda ruta con [token] o [codigo] en el path está cubierta', () => {
    const rutas = archivosFuente(join(RAIZ, 'src/app'))
      .filter(f => /\[(token|codigo)\]/.test(f))
      .map(f => {
        const rel = f.replace(join(RAIZ, 'src/app'), '')
        return rel.replace(/\/(route|page)\.tsx?$/, '').replace(/\/\[(token|codigo)\].*$/, '')
      })

    const sinCubrir = Array.from(new Set(rutas)).filter(prefijo => {
      const ejemplo = `${prefijo}/${TOKEN}`
      return sanitizarPath(ejemplo).indexOf('[redacted]') < 0
    })

    expect(
      sinCubrir,
      'Estas rutas llevan una credencial en el path y el saneador no las ' +
      'reconoce. Agregalas a PREFIJOS_CON_SECRETO en sentry-scrub.ts:\n' +
      sinCubrir.join('\n')
    ).toEqual([])
  })
})
