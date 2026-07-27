import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

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

  // 1. Definir rutas públicas
  const publicPrefixes = [
    '/_next/',
    '/favicon',
    // Archivos de la PWA: si el middleware los mandara al login, el navegador
    // no podría instalar la app ni registrar el service worker.
    '/manifest.json',
    '/sw.js',
    '/offline.html',
    '/icons/',
    '/api/',
    '/paciente',
    '/auth',
    '/login',
    '/registro',
    '/legal',
    '/precios',
    '/reserva'
  ]

  const isPublic = publicPrefixes.some(prefix => pathname.startsWith(prefix)) || pathname === '/'

  // Refrescar sesión de Supabase Auth
  const response = NextResponse.next()
  const { response: updatedResponse, user } = await updateSession(req, response)

  // 2. Proteger rutas privadas server-side si no hay sesión activa
  if (!isPublic && !user) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
