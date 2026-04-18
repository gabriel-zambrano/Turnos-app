import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { updateSession } from './lib/supabase/middleware'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function middleware(req: NextRequest) {
  const hostname = req.headers.get('host') || ''
  const { pathname } = req.nextUrl

  // Rutas sin restricción
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/paciente') ||
    pathname.startsWith('/auth')
  ) {
    return NextResponse.next()
  }

  // Resolver tenant por hostname
  let tenantId: string | null = null

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

  // Refrescar sesión de Supabase Auth
  const response = NextResponse.next()
  const { response: updatedResponse, user } = await updateSession(req, response)

  // Inyectar tenant en headers
  if (tenantId) {
    updatedResponse.headers.set('x-tenant-id', tenantId)
  }

  // Proteger /login y /admin
  if (pathname.startsWith('/login') || pathname.startsWith('/admin')) {
    if (!user) {
      const loginUrl = new URL('/login', req.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return updatedResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
