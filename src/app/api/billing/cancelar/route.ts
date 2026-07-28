import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────
// Baja de la suscripción.
//
// Cobrar por débito automático sin ofrecer una forma clara de darse de baja es
// un problema de defensa del consumidor, no solo de experiencia. Hasta ahora la
// única salida era escribirle a soporte.
//
// La baja corta el débito en MercadoPago pero **no borra nada**: la clínica
// conserva el acceso hasta el final del período que ya pagó, y sus datos quedan
// intactos. Son historias clínicas: no se tocan por una baja comercial.
// ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { tenantId } = await req.json()
    if (!tenantId) {
      return NextResponse.json({ error: 'Falta el consultorio' }, { status: 400 })
    }

    // Solo alguien de esta clínica puede darla de baja.
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: membresia } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    // Dar de baja el servicio es una decisión del titular, no de cualquier
    // integrante del equipo.
    if (!membresia || !['owner', 'admin'].includes(membresia.role)) {
      return NextResponse.json(
        { error: 'Solo el responsable del consultorio puede dar de baja la suscripción.' },
        { status: 403 }
      )
    }

    const supabaseAdmin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('mp_preapproval_id, next_payment_date')
      .eq('id', tenantId)
      .maybeSingle()

    // Cortar el débito en MercadoPago. Si falla, no se marca nada como
    // cancelado: sería peor decirle a la clínica que se dio de baja y que le
    // sigan llegando los cobros.
    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (tenant?.mp_preapproval_id && mpToken && !tenant.mp_preapproval_id.startsWith('mock-')) {
      const res = await fetch(`https://api.mercadopago.com/preapproval/${tenant.mp_preapproval_id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${mpToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      })

      if (!res.ok) {
        const detalle = await res.text().catch(() => '')
        console.error('MercadoPago rechazó la cancelación:', res.status, detalle)
        return NextResponse.json(
          { error: 'No pudimos cancelar el débito automático. Escribinos y lo resolvemos a mano.' },
          { status: 502 }
        )
      }
    }

    // El acceso se mantiene hasta el fin del período pago. Si no hay fecha
    // registrada se deja un mes de margen: ante la duda, a favor del cliente.
    const finDePeriodo = tenant?.next_payment_date
      ? new Date(tenant.next_payment_date).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        subscription_status: 'cancelled',
        next_payment_date: finDePeriodo,
      })
      .eq('id', tenantId)

    if (error) {
      console.error('Error registrando la baja:', error.message)
      return NextResponse.json({ error: 'La baja se procesó en MercadoPago pero no pudimos registrarla. Escribinos.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      accesoHasta: finDePeriodo,
      mensaje: 'Tu suscripción quedó dada de baja. No se te va a cobrar de nuevo.',
    })
  } catch (err: any) {
    console.error('Error al cancelar la suscripción:', err?.message || err)
    return NextResponse.json({ error: 'No pudimos procesar la baja.' }, { status: 500 })
  }
}
