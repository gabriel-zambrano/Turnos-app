import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { tenantId, email } = await req.json()
    if (!tenantId || !email) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    // ── Autorización: el usuario debe estar logueado y pertenecer al tenant ──
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No autorizado para este consultorio' }, { status: 403 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN

    if (!mpAccessToken) {
      // Modo simulado SOLO fuera de producción.
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Pasarela de pago no configurada' }, { status: 500 })
      }
      console.warn('MERCADOPAGO_ACCESS_TOKEN no configurado. Modo simulado.')
      return NextResponse.json({
        checkoutUrl: `${appUrl}/configuracion?billing=success-mock&preapproval_id=mock-preapp-${tenantId}`
      })
    }

    const response = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpAccessToken}`
      },
      body: JSON.stringify({
        reason: 'DentalDesk Pro - Facturación Mensual',
        external_reference: tenantId,
        payer_email: email,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 3500,
          currency_id: 'ARS'
        },
        back_url: `${appUrl}/configuracion?billing=success`,
        status: 'pending'
      })
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message || 'Error al conectar con MercadoPago')
    }

    return NextResponse.json({ checkoutUrl: data.init_point })
  } catch (err: any) {
    console.error('Error in MercadoPago Checkout:', err?.message || err)
    return NextResponse.json({ error: 'Error al iniciar el pago' }, { status: 500 })
  }
}
