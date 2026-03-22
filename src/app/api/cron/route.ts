import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://turnos-app-delta.vercel.app'
  const token = process.env.CRON_SECRET

  const res = await fetch(`${base}/api/send-recordatorios?token=${token}`, {
    method: 'POST'
  })

  const data = await res.json()
  return NextResponse.json(data)
}