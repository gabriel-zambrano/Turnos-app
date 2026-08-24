import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from './lib/supabase/middleware'
import { esRutaPublica } from './lib/rutas-publicas'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 0. Unificar el dominio en la versión sin www.
  //
  // La gente comparte links con y sin www indistintamente, y los que se pegan
  // en redes sociales suelen llevarlo. Si las dos versiones responden, además,
  // se rompen las sesiones (la cookie de una no sirve en la otra) y Google ve
  // contenido duplicado. Con esto, cualquier link con www termina en el mismo
  // lugar, conservando la ruta y los parámetros de campaña.
  const host = req.headers.get('host') || ''
  if (host.startsWith('www.')) {
    const destino = req.nextUrl.clone()
    destino.host = host.slice(4)
    return NextResponse.redirect(destino, 308)
  }

  const isPublic = esRutaPublica(pathname)

  // 1. Si la ruta es pública, NO se toca Supabase.
  //
  // ─────────────────────────────────────────────────────────────────────────
  // Esto era el defecto que causó la caída del 24/08/2026.
  //
  // `isPublic` se calculaba —igual que ahora— y después se llamaba a
  // `updateSession()` de todos modos, incondicionalmente. El resultado se
  // usaba recién dos líneas más abajo. O sea: el middleware ya sabía que
  // `/sw.js` no necesitaba sesión, y le pedía una a Supabase igual.
  //
  // Consecuencias medidas en los logs de Vercel de ese día:
  //
  //   · El portal del paciente, la reserva online y la firma de
  //     consentimientos dependían de Supabase Auth sin usarla. Ninguna de las
  //     tres tiene login: entran con un token en la URL.
  //   · `/sw.js` devolvió 504 tres veces. Un service worker agotando el
  //     timeout de autenticación.
  //   · En una ventana sana de 3 segundos, 8 de 13 invocaciones del
  //     middleware eran archivos estáticos.
  //
  // Cada invocación evitada es también un arranque en frío menos que pagar,
  // que es la otra hipótesis de esa caída.
  // ─────────────────────────────────────────────────────────────────────────
  if (isPublic) {
    return NextResponse.next()
  }

  // 2. Ruta privada: refrescar la sesión y exigirla.
  const response = NextResponse.next()
  const { response: updatedResponse, user } = await updateSession(req, response)

  if (!user) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  // Nota: la resolución de tenant por hostname vive en TenantContext (cliente).
  // Antes se hacía también acá con 1-2 consultas a Supabase por request, pero el
  // resultado (header x-tenant-id) no lo leía nadie: era latencia pura en cada
  // navegación. Eliminado para acelerar el TTFB de toda la app.
  return updatedResponse
}

export const config = {
  // ───────────────────────────────────────────────────────────────────────────
  // Qué NO pasa por el middleware.
  //
  // Antes sólo se excluían `_next/static`, `_next/image` y `favicon.ico`. Todo
  // lo demás —el service worker, el manifest, los iconos del PWA, cualquier
  // imagen— atravesaba el middleware y podía disparar una invocación completa.
  //
  // `esRutaPublica` ya los marcaba como rutas de sistema que "nunca deben pasar
  // por una barrera" (ver RUTAS_DE_SISTEMA en lib/rutas-publicas.ts). El
  // matcher no lo reflejaba. Ahora sí.
  //
  // Se excluyen por nombre, no por extensión genérica: una ruta de la app puede
  // terminar en algo que parezca un archivo, y excluirla por accidente la
  // dejaría sin protección de sesión. La lista es explícita a propósito.
  // ───────────────────────────────────────────────────────────────────────────
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|offline\\.html|robots\\.txt|sitemap\\.xml|icons/).*)',
  ],
}
