// ─────────────────────────────────────────────────────────────
// Sanitización de lo que se le manda a Sentry.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// Los secretos de este sistema viajan en el path de la URL:
//
//   /paciente/<token>      → abre la historia clínica completa
//   /firmar/<token>        → permite firmar un consentimiento
//   /t/<codigo>            → el turno
//
// Con `tracesSampleRate: 1` cada request generaba un evento con su URL, así que
// Sentry terminaba siendo un repositorio de credenciales de acceso a datos de
// salud. Una sola visita de un paciente a su portal produce cuatro eventos con
// el token: el pageload del navegador, el breadcrumb y el span del fetch, y la
// transacción del servidor.
//
// QUÉ SE CONSERVA
// Sanear de más deja Sentry inútil y garantiza que alguien lo apague. Sigue
// llegando todo lo que sirve para diagnosticar:
//   · mensaje de error y stack trace completos;
//   · la ruta NORMALIZADA (/paciente/[redacted]), que es lo que agrupa;
//   · método HTTP y status;
//   · release y environment;
//   · user.id (un UUID de Supabase, sin email ni IP);
//   · los tags que se seteen a propósito (ej. tenant_id).
//
// QUÉ SE PIERDE, A SABIENDAS
//   · La IP del cliente. No se puede geolocalizar ni correlacionar por origen.
//   · El valor concreto del token. Ya no se puede reproducir el request exacto
//     de un paciente pegando su URL; hay que buscarlo por paciente en la app.
//   · El cuerpo de los requests con datos clínicos.
//
// Son funciones puras y sin dependencias del SDK: se testean solas, sin red.
// ─────────────────────────────────────────────────────────────

/**
 * Prefijos de ruta cuyo segmento siguiente ES una credencial.
 *
 * Ordenados de más largo a más corto: `/api/paciente` tiene que evaluarse
 * antes que `/paciente` para que no quede `/api[redacted]`.
 */
const PREFIJOS_CON_SECRETO = [
  '/api/consentimientos/firmar',
  '/api/paciente',
  '/paciente',
  '/agendar',
  '/firmar',
  '/t',
] as const

/** Parámetros de query cuyo VALOR nunca debe salir del servidor. */
const PARAMS_SENSIBLES = [
  'token', 'c', 'secret', 'key', 'apikey', 'api_key',
  'access_token', 'refresh_token', 'preapproval_id',
  'password', 'signature', 'code',
]

/**
 * Headers que se eliminan enteros.
 *
 * `cookie` es el más importante: con `sendDefaultPii: true` llevaba la sesión
 * de Supabase (`sb-<ref>-auth-token`), que es peor que un token de portal —
 * es la sesión de un usuario del consultorio.
 */
const HEADERS_A_ELIMINAR = [
  'cookie', 'set-cookie', 'authorization', 'proxy-authorization',
  'x-signature', 'svix-signature', 'svix-id', 'svix-timestamp',
  'apikey', 'x-api-key',
  'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip',
]

/** Campos de body que no deben registrarse nunca. */
const CAMPOS_SENSIBLES = [
  'firmapng', 'firma_png', 'firma',
  'token', 'secret', 'password', 'apikey', 'api_key',
  'firmantedoc', 'firmante_doc', 'pacientedocnro', 'paciente_doc_nro',
  'dni_cuit', 'dni', 'cuit',
  'alergias', 'antecedentes', 'notas', 'recomendaciones',
  'email', 'telefono', 'nombre',
]

const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * Misma expresión, sin la bandera `g`.
 *
 * `RegExp.test()` sobre una expresión global es CON ESTADO: avanza `lastIndex`
 * entre llamadas y devuelve falsos negativos alternados. Para consultar "¿hay
 * un UUID acá?" hace falta una versión sin `g`.
 */
const RE_UUID_TEST = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const REDACTADO = '[redacted]'

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Sanea el path: reemplaza el segmento-credencial y cualquier UUID suelto.
 *
 * Se trabaja por FORMA DE RUTA y no por lista de valores prohibidos. Una lista
 * de valores se queda vieja apenas se emite un token nuevo; la forma de la ruta
 * no cambia.
 */
export function sanitizarPath(path: string): string {
  let limpio = path

  for (const prefijo of PREFIJOS_CON_SECRETO) {
    // Solo el segmento inmediatamente posterior. `/api/paciente/<t>/estado`
    // conserva el `/estado`, que es justamente lo que sirve para agrupar.
    const re = new RegExp('^' + escaparRegex(prefijo) + '/[^/?#]+', 'i')
    if (re.test(limpio)) {
      limpio = limpio.replace(re, prefijo + '/' + REDACTADO)
      break
    }
  }

  // Cualquier UUID que haya quedado en otra posición (ids de cita, de factura,
  // de consentimiento). No son credenciales, pero son identificadores directos
  // de datos clínicos y no hacen falta para diagnosticar.
  return limpio.replace(RE_UUID, '[uuid]')
}

/**
 * Sanea un query string, conservando las claves y tapando los valores.
 *
 * Dos pasadas, y la segunda importa tanto como la primera:
 *   1. Los parámetros de la lista de sensibles se tapan enteros.
 *   2. En CUALQUIER otro valor se reemplazan los UUID. `/api/ics?cita=<uuid>`
 *      no lleva un secreto, pero sí el identificador directo de un turno de un
 *      paciente. Generalizar por forma —un UUID es un UUID— evita tener que
 *      acordarse de sumar cada parámetro nuevo a la lista.
 */
export function sanitizarQuery(query: string): string {
  if (!query) return query
  const sinInterrogante = query.charAt(0) === '?' ? query.slice(1) : query
  if (!sinInterrogante) return query

  const partes = sinInterrogante.split('&').map(par => {
    const i = par.indexOf('=')
    if (i < 0) return par.replace(RE_UUID, '[uuid]')
    const clave = par.slice(0, i)
    if (PARAMS_SENSIBLES.indexOf(clave.toLowerCase()) >= 0) {
      return clave + '=' + REDACTADO
    }
    return clave + '=' + par.slice(i + 1).replace(RE_UUID, '[uuid]')
  })

  return (query.charAt(0) === '?' ? '?' : '') + partes.join('&')
}

/**
 * Sanea una URL completa o un path relativo.
 *
 * Acepta las dos formas porque Sentry las mezcla: `request.url` suele venir
 * absoluta y los breadcrumbs de fetch, relativos.
 */
export function sanitizarUrl(url: string): string {
  if (!url || typeof url !== 'string') return url

  try {
    const esAbsoluta = /^[a-z][a-z0-9+.-]*:\/\//i.test(url)
    const base = 'http://interno.local'
    const u = new URL(url, base)

    const path = sanitizarPath(u.pathname)
    const query = sanitizarQuery(u.search)

    return esAbsoluta
      ? u.origin + path + query + u.hash
      : path + query + u.hash
  } catch {
    // URL no parseable: no la dejamos pasar en crudo.
    return REDACTADO
  }
}

/**
 * Sanea el valor de UN tag.
 *
 * Interviene **solo si hay algo concreto que tapar** —un UUID o un parámetro
 * sensible— y no por las buenas. La diferencia importa: el tag `transaction`
 * vale `/paciente/:token`, que ya está normalizado y es lo que agrupa los
 * eventos en el panel. Pasarlo por el saneador a ciegas lo convertiría en
 * `/paciente/[redacted]` y perderíamos la agrupación sin ganar nada, porque ahí
 * no hay ningún secreto.
 */
export function sanitizarValorDeTag(valor: unknown): unknown {
  if (typeof valor !== 'string' || !valor) return valor

  const tieneUuid = RE_UUID_TEST.test(valor)
  const tieneParamSensible = PARAMS_SENSIBLES.some(
    p => new RegExp('[?&]' + p + '=', 'i').test(valor)
  )
  if (!tieneUuid && !tieneParamSensible) return valor

  const pareceUrl = /^https?:\/\//i.test(valor) || valor.charAt(0) === '/'
  return pareceUrl ? sanitizarUrl(valor) : valor.replace(RE_UUID, '[uuid]')
}

/**
 * Sanea el diccionario de tags del evento.
 *
 * Este campo faltaba, y era el de peor consecuencia: Sentry indexa `url` como
 * tag, así que el token quedaba no solo almacenado sino **agregable y
 * buscable** desde la pantalla de tags del issue.
 */
export function sanitizarTags(
  tags: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!tags || typeof tags !== 'object') return tags
  const limpio: Record<string, unknown> = {}
  for (const clave of Object.keys(tags)) {
    limpio[clave] = sanitizarValorDeTag(tags[clave])
  }
  return limpio
}

/** Elimina headers sensibles. Devuelve un objeto nuevo. */
export function sanitizarHeaders(
  headers: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!headers || typeof headers !== 'object') return headers
  const limpio: Record<string, unknown> = {}
  for (const clave of Object.keys(headers)) {
    if (HEADERS_A_ELIMINAR.indexOf(clave.toLowerCase()) >= 0) continue
    limpio[clave] = headers[clave]
  }
  return limpio
}

/**
 * Tapa los campos sensibles de un objeto, recursivamente.
 *
 * Tope de profundidad para no colgarse con estructuras cíclicas: un evento de
 * Sentry no debería tener más de 6 niveles útiles.
 */
export function sanitizarDatos(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 6) return REDACTADO
  if (valor === null || valor === undefined) return valor

  if (Array.isArray(valor)) {
    return valor.map(v => sanitizarDatos(v, profundidad + 1))
  }

  if (typeof valor === 'object') {
    const entrada = valor as Record<string, unknown>
    const limpio: Record<string, unknown> = {}
    for (const clave of Object.keys(entrada)) {
      limpio[clave] = CAMPOS_SENSIBLES.indexOf(clave.toLowerCase()) >= 0
        ? REDACTADO
        : sanitizarDatos(entrada[clave], profundidad + 1)
    }
    return limpio
  }

  return valor
}

// ─────────────────────────────────────────────────────────────
// Hooks del SDK. Tipados laxos a propósito: el shape de los eventos cambia
// entre versiones de @sentry/nextjs y no queremos que una actualización menor
// rompa el build justo en el código que protege los secretos.
// ─────────────────────────────────────────────────────────────

type EventoSentry = Record<string, any>

/** Sanea un evento (error o transacción). */
function limpiarEvento(evento: EventoSentry): EventoSentry {
  if (evento.request) {
    const req = evento.request as Record<string, any>
    if (typeof req.url === 'string') req.url = sanitizarUrl(req.url)
    if (typeof req.query_string === 'string') {
      req.query_string = sanitizarQuery(req.query_string)
    } else if (req.query_string && typeof req.query_string === 'object') {
      req.query_string = sanitizarDatos(req.query_string)
    }
    req.headers = sanitizarHeaders(req.headers)
    // Las cookies no se sanean: se eliminan. No hay ninguna que sirva para
    // diagnosticar y sí varias que abren sesión.
    delete req.cookies
    if (req.data !== undefined) req.data = sanitizarDatos(req.data)
  }

  // El nombre de la transacción. Next suele normalizarlo (`/paciente/:token`),
  // pero cuando la ruta se resuelve dinámicamente puede traer el valor real.
  //
  // Se usa la misma guarda que en los tags: si no hay un UUID ni un parámetro
  // sensible, se deja como está. `/paciente/:token` no es un secreto y es lo que
  // se lee en el panel; convertirlo en `/paciente/[redacted]` no protegía nada y
  // empeoraba la legibilidad. Sentry además deriva el tag `transaction` de este
  // campo, así que saneándolo de más se degradaban los dos a la vez.
  if (typeof evento.transaction === 'string') {
    evento.transaction = sanitizarValorDeTag(evento.transaction) as string
  }

  // Spans de transacción: los http.client llevan la URL en `description`.
  // Es la vía por la que se filtraba CRON_SECRET en la traza de /api/cron.
  if (Array.isArray(evento.spans)) {
    evento.spans = evento.spans.map((span: Record<string, any>) => {
      if (span && typeof span.description === 'string') {
        span.description = sanitizarUrl(span.description)
      }
      if (span && span.data) span.data = sanitizarDatos(span.data)
      return span
    })
  }

  if (evento.contexts && evento.contexts.trace && evento.contexts.trace.data) {
    evento.contexts.trace.data = sanitizarDatos(evento.contexts.trace.data)
  }

  // Los tags. Sentry indexa `url` acá, así que sin este paso el token quedaba
  // almacenado y además buscable desde la pantalla de tags del issue.
  if (evento.tags) {
    evento.tags = sanitizarTags(evento.tags as Record<string, unknown>)
  }

  // user.id (UUID de Supabase) se conserva: es lo que permite seguir a un
  // usuario entre eventos. Email e IP no aportan al diagnóstico.
  if (evento.user) {
    delete evento.user.ip_address
    delete evento.user.email
    delete evento.user.username

    // Cuando NO hay sesión —que es el caso del portal del paciente— Sentry usa
    // la IP como identificador y la guarda con el formato `ip:190.1.2.3`.
    // Conservar `id` a ciegas dejaba pasar la IP por la puerta de al lado
    // justo en las pantallas donde más importa. Se elimina solo esa forma; un
    // UUID de usuario autenticado se conserva.
    if (typeof evento.user.id === 'string' && /^ip:/i.test(evento.user.id)) {
      delete evento.user.id
    }
  }

  if (Array.isArray(evento.breadcrumbs)) {
    evento.breadcrumbs = evento.breadcrumbs
      .map((b: Record<string, any>) => limpiarBreadcrumb(b))
      .filter(Boolean)
  }

  return evento
}

/** Sanea un breadcrumb. Los de fetch y navegación llevan la URL en `data`. */
function limpiarBreadcrumb(breadcrumb: EventoSentry): EventoSentry {
  if (breadcrumb && breadcrumb.data) {
    const data = breadcrumb.data as Record<string, any>
    if (typeof data.url === 'string') data.url = sanitizarUrl(data.url)
    if (typeof data.to === 'string') data.to = sanitizarUrl(data.to)
    if (typeof data.from === 'string') data.from = sanitizarUrl(data.from)
    breadcrumb.data = sanitizarDatos(data)
  }
  if (breadcrumb && typeof breadcrumb.message === 'string') {
    // Los breadcrumbs de fetch traen "GET /api/paciente/<token>" en el mensaje.
    breadcrumb.message = breadcrumb.message.replace(
      /(https?:\/\/[^\s]+|\/[^\s]*)/g,
      (m: string) => sanitizarUrl(m)
    )
  }
  return breadcrumb
}

/**
 * `beforeSend` / `beforeSendTransaction`.
 *
 * Ante cualquier error de saneo devuelve `null`, que descarta el evento.
 * Falla cerrado: preferimos perder un reporte a filtrar un token.
 *
 * La firma es genérica y preserva el tipo de entrada a propósito. El SDK espera
 * `(event: ErrorEvent) => ErrorEvent | null` en un hook y
 * `(event: TransactionEvent) => TransactionEvent | null` en el otro; con `T` la
 * misma función sirve para los dos sin que este archivo tenga que importar
 * tipos de `@sentry/*`. Así el saneador se testea aislado, sin el SDK.
 */
export function beforeSend<T extends object>(evento: T | null): T | null {
  if (!evento) return evento
  try {
    return limpiarEvento(evento as EventoSentry) as T
  } catch {
    return null
  }
}

/** `beforeBreadcrumb`. Misma política: ante la duda, se descarta. */
export function beforeBreadcrumb<T extends object>(breadcrumb: T | null): T | null {
  if (!breadcrumb) return breadcrumb
  try {
    return limpiarBreadcrumb(breadcrumb as EventoSentry) as T
  } catch {
    return null
  }
}
