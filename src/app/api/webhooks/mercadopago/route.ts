import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * Verifica la firma x-signature de MercadoPago.
 * MP envía: x-signature: "ts=<ts>,v1=<hash>" y x-request-id.
 * El manifest firmado es: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * HMAC-SHA256 con MERCADOPAGO_WEBHOOK_SECRET (clave secreta del webhook en el panel de MP).
 */
function verifyMpSignature(req: Request, dataId: string): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (!secret) {
    // En producción la firma es obligatoria. Si no hay secreto configurado, rechazamos.
    console.error('MERCADOPAGO_WEBHOOK_SECRET no configurado')
    return false
  }

  const xSignature = req.headers.get('x-signature') || ''
  const xRequestId = req.headers.get('x-request-id') || ''

  const parts = Object.fromEntries(
    xSignature.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k?.trim(), v?.trim()]
    })
  ) as { ts?: string; v1?: string }

  if (!parts.ts || !parts.v1 || !dataId) return false

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  // Comparación en tiempo constante para evitar timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const body = await req.json()
    const preapprovalId = body.data?.id || body.id

    if (!preapprovalId) {
      return NextResponse.json({ error: 'ID de notificación inválido' }, { status: 400 })
    }

    let tenantId = ''
    let status = 'inactive'
    let nextPaymentDate: string | null = null

    // ── Ruta de simulación: SOLO en entornos que NO son producción ──
    const isMock = preapprovalId.startsWith('mock-preapp-')
    if (isMock) {
      if (process.env.NODE_ENV === 'production') {
        // En producción nunca aceptamos IDs simulados.
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
      }
      tenantId = preapprovalId.replace('mock-preapp-', '')
      status = 'authorized'
      nextPaymentDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    } else {
      // ── Verificación de firma obligatoria para webhooks reales ──
      if (!verifyMpSignature(req, String(preapprovalId))) {
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
      }

      const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
      if (!mpAccessToken) {
        return NextResponse.json({ error: 'MERCADOPAGO_ACCESS_TOKEN no configurado en producción' }, { status: 500 })
      }

      // Consultamos el estado real a MercadoPago (nunca confiamos en el body para el status)
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
        headers: { 'Authorization': `Bearer ${mpAccessToken}` }
      })

      if (!mpRes.ok) {
        throw new Error('Error al consultar preapproval en MercadoPago')
      }

      const preapproval = await mpRes.json()
      tenantId = preapproval.external_reference
      status = preapproval.status
      nextPaymentDate = preapproval.next_payment_date || null
    }

    if (tenantId) {
      const isAuthorized = status === 'authorized'

      const { error } = await supabaseAdmin
        .from('tenants')
        .update({
          plan: isAuthorized ? 'pro' : 'starter',
          subscription_status: status,
          next_payment_date: nextPaymentDate,
          mp_preapproval_id: preapprovalId,
          feature_bi: isAuthorized
        })
        .eq('id', tenantId)

      if (error) {
        throw new Error(`Error en base de datos: ${error.message}`)
      }
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('Error in MercadoPago Webhook:', err?.message || err)
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 })
  }
}
