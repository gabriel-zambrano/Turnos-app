import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 1. Definir rutas públicas
  const publicPrefixes = [
    '/_next/',
    '/favicon',
    '/api/',
    '/paciente',
    '/auth',
    '/login',
    '/registro',
    '/legal',
    '/precios'
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
