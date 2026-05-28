import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { updateSession } from './lib/supabase/middleware'

export async function middleware(req: NextRequest) {
  const hostname = req.headers.get('host') || ''
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
    '/legal'
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

  // 3. Resolver tenant por hostname (instanciando el cliente admin dentro del handler)
  let tenantId: string | null = null

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: byCustomDomain } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('custom_domain', hostname)
    .single()

  if (byCustomDomain) {
    tenantId = byCustomDomain.id
  } else {
    const subdomain = hostname.split('.')[0]
    const { data: bySubdomain } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('subdominio_generico', subdomain)
      .single()
    if (bySubdomain) tenantId = bySubdomain.id
  }

  // Inyectar tenant en headers
  if (tenantId) {
    updatedResponse.headers.set('x-tenant-id', tenantId)
  }

  return updatedResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
