import { NextResponse } from 'next/server'
import { APP_URL } from '@/lib/config'
import { esCron, headerDeCron } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('CRON_SECRET no configurado')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // El disparador debe autenticarse con `Authorization: Bearer <CRON_SECRET>`,
  // que es el formato que Vercel Cron envía solo.
  //
  // Antes también se aceptaba `?token=<CRON_SECRET>` "para disparadores
  // simples". Se quitó: un query string queda en los access logs, en el Referer
  // y en las trazas de Sentry, y con este secreto se dispara el envío de
  // recordatorios de todas las clínicas.
  if (!esCron(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const base = APP_URL

  // El secreto viaja en el header, no en la URL. Antes esta línea era
  //   fetch(`${base}/api/send-recordatorios?token=${secret}`)
  // y publicaba CRON_SECRET dos veces por corrida: en el span http.client de
  // la traza de esta ruta, y en la transacción entrante de la otra.
  const res = await fetch(`${base}/api/send-recordatorios`, {
    method: 'POST',
    headers: headerDeCron(secret),
  })

  const data = await res.json()
  return NextResponse.json(data)
}
