// ─────────────────────────────────────────────────────────────
// Service worker de DentalDesk.
//
// Objetivo: que el sistema se pueda instalar en el celular y que, si se corta
// la conexión, el odontólogo vea una pantalla decente en vez del dinosaurio del
// navegador.
//
// Regla de oro: ESTO ES UNA APP DE SALUD. No se cachea nada que pueda contener
// datos de pacientes. Concretamente:
//   - nada de /api/            (respuestas con datos clínicos)
//   - nada de /paciente/ ni /firmar/  (portales con datos personales)
//   - nada que no sea GET
//   - nada de otro origen (Supabase, Resend, etc.)
//
// Solo se cachean los assets estáticos del propio sitio. Para la navegación se
// usa network-first: siempre gana la versión del servidor, y el caché es
// únicamente la red de contención cuando no hay internet.
// ─────────────────────────────────────────────────────────────

const VERSION = 'v1'
const CACHE_ESTATICO = `dentaldesk-estatico-${VERSION}`
const OFFLINE_URL = '/offline.html'

const PRECARGA = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// Rutas que nunca se guardan en caché, porque pueden traer datos de pacientes.
const NUNCA_CACHEAR = ['/api/', '/paciente/', '/firmar/', '/auth/']

function esSensible(url) {
  return NUNCA_CACHEAR.some(prefijo => url.pathname.startsWith(prefijo))
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_ESTATICO)
      .then(cache => cache.addAll(PRECARGA))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(
        nombres
          .filter(n => n.startsWith('dentaldesk-') && n !== CACHE_ESTATICO)
          .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (esSensible(url)) return

  // Navegación: primero la red; si no hay, la pantalla de offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  // Assets estáticos: se sirven del caché si están, y se refrescan de fondo.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(cacheado => {
        const red = fetch(req).then(res => {
          if (res && res.status === 200) {
            const copia = res.clone()
            caches.open(CACHE_ESTATICO).then(c => c.put(req, copia))
          }
          return res
        }).catch(() => cacheado)
        return cacheado || red
      })
    )
  }
})
