import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret no configurado' }, { status: 500 })
  }

  // Verificar firma de Resend
  const svixId        = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Headers de firma faltantes' }, { status: 400 })
  }

  const body = await req.text()

  let event: any
  try {
    const wh = new Webhook(secret)
    event = wh.verify(body, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
  } catch {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  const { type, data } = event
  const emailId = data?.email_id as string | undefined

  if (!emailId) {
    return NextResponse.json({ ok: true, msg: 'Sin email_id, ignorado' })
  }

  // Mapear evento a estado
  const estadoMap: Record<string, string> = {
    'email.delivered': 'entregado',
    'email.opened':    'abierto',
    'email.bounced':   'rebotado',
    'email.complained': 'spam',
  }

  const estadoEntrega = estadoMap[type]
  if (!estadoEntrega) {
    return NextResponse.json({ ok: true, msg: `Evento ${type} ignorado` })
  }

  // Actualizar recordatorios_log por resend_email_id
  const update: Record<string, any> = { estado_entrega: estadoEntrega }
  if (type === 'email.opened') {
    update.abierto_en = new Date().toISOString()
  }

  const { error } = await supabaseAdmin
    .from('recordatorios_log')
    .update(update)
    .eq('resend_email_id', emailId)

  if (error) {
    console.error('Error actualizando log:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`Webhook ${type} procesado para email_id ${emailId}`)
  return NextResponse.json({ ok: true, type, emailId })
}
