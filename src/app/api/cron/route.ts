import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('CRON_SECRET no configurado')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // El disparador externo debe autenticarse. Aceptamos el secreto por header
  // Authorization: Bearer <CRON_SECRET> (formato de Vercel Cron) o por
  // ?token=<CRON_SECRET> para compatibilidad con disparadores simples.
  const authHeader = req.headers.get('authorization') || ''
  const url = new URL(req.url)
  const tokenParam = url.searchParams.get('token')

  const isAuthorized =
    authHeader === `Bearer ${secret}` || tokenParam === secret

  if (!isAuthorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://turnos-app-delta.vercel.app'

  const res = await fetch(`${base}/api/send-recordatorios?token=${secret}`, {
    method: 'POST',
  })

  const data = await res.json()
  return NextResponse.json(data)
}
