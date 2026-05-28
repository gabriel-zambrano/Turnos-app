import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { tenantId, email } = await req.json()
    if (!tenantId || !email) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN

    // Si no hay credenciales configuradas, devolvemos un enlace sandbox simulado para no bloquear
    if (!mpAccessToken) {
      console.warn('MERCADOPAGO_ACCESS_TOKEN no configurado. Utilizando modo simulado.')
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
          transaction_amount: 3500, // Precio de la suscripción (AR$)
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

    // Retornamos el init_point de MercadoPago para la redirección
    return NextResponse.json({ checkoutUrl: data.init_point })
  } catch (err: any) {
    console.error('Error in MercadoPago Checkout:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
