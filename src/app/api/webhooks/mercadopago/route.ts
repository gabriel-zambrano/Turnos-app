import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  // Inicializamos Supabase con la Service Role Key para evadir RLS al actualizar los planes del SaaS
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

    // Simulación local para pruebas de desarrollo
    if (preapprovalId.startsWith('mock-preapp-')) {
      tenantId = preapprovalId.replace('mock-preapp-', '')
      status = 'authorized'
      nextPaymentDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 días en el futuro
    } else {
      const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
      if (!mpAccessToken) {
        return NextResponse.json({ error: 'MERCADOPAGO_ACCESS_TOKEN no configurado en producción' }, { status: 500 })
      }

      // Consultar el detalle de la suscripción directamente a MercadoPago
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
        headers: {
          'Authorization': `Bearer ${mpAccessToken}`
        }
      })

      if (!mpRes.ok) {
        throw new Error('Error al consultar preapproval en MercadoPago')
      }

      const preapproval = await mpRes.json()
      tenantId = preapproval.external_reference // Nuestro tenant_id inyectado
      status = preapproval.status // 'authorized', 'paused', 'cancelled', etc.
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
          feature_bi: isAuthorized // Habilitar automáticamente el módulo de Business Intelligence
        })
        .eq('id', tenantId)

      if (error) {
        throw new Error(`Error en base de datos: ${error.message}`)
      }
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('Error in MercadoPago Webhook:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
