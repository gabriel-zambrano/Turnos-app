import { NextRequest, NextResponse } from 'next/server'

export async function middleware(req: NextRequest) {
  console.log('MIDDLEWARE EJECUTADO:', req.nextUrl.pathname)
  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
