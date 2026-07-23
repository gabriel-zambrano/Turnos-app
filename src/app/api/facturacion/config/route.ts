import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Obtener configuración de facturación para el tenant actual
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId')

    if (!tenantId) {
      return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Verificar pertenencia al tenant
    const { data: membership } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No autorizado para este consultorio' }, { status: 403 })
    }

    const { data: config, error } = await supabase
      .from('arca_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ config: config || null })
  } catch (err: any) {
    console.error('Error en GET /api/facturacion/config:', err?.message || err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// POST: Guardar o actualizar configuración de facturación
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      tenantId, cuit, condicionIva, puntoVenta, alicuotaIva, activo,
      razonSocial, domicilioComercial, ingresosBrutos, inicioActividades,
    } = body

    if (!tenantId || !cuit || !condicionIva || !puntoVenta) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 })
    }

    // Validaciones de datos fiscales
    const cleanCuit = String(cuit).replace(/-/g, '')
    if (!/^\d{11}$/.test(cleanCuit)) {
      return NextResponse.json({ error: 'El CUIT debe contener exactamente 11 dígitos numéricos' }, { status: 400 })
    }
    if (!['Monotributista', 'Responsable Inscripto', 'Exento'].includes(condicionIva)) {
      return NextResponse.json({ error: 'Condición de IVA inválida' }, { status: 400 })
    }
    const pv = Number(puntoVenta)
    if (!Number.isInteger(pv) || pv < 1 || pv > 99999) {
      return NextResponse.json({ error: 'Punto de venta inválido (debe ser un entero entre 1 y 99999)' }, { status: 400 })
    }
    const alicuota = alicuotaIva !== undefined ? Number(alicuotaIva) : 10.5
    if (![0, 10.5, 21].includes(alicuota)) {
      return NextResponse.json({ error: 'Alícuota de IVA inválida (0, 10.5 o 21)' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Verificar pertenencia al tenant y que sea admin/owner para cambiar configuraciones
    const { data: membership } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single()

    if (!membership || (membership.role !== 'admin' && membership.role !== 'owner')) {
      return NextResponse.json({ error: 'Permisos insuficientes para modificar configuración' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('arca_config')
      .upsert({
        tenant_id: tenantId,
        cuit: cleanCuit,
        condicion_iva: condicionIva,
        punto_venta: pv,
        alicuota_iva: alicuota,
        razon_social: razonSocial || null,
        domicilio_comercial: domicilioComercial || null,
        ingresos_brutos: ingresosBrutos || 'EXENTO',
        inicio_actividades: inicioActividades || null,
        activo: activo ?? true,
        actualizado_en: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, config: data })
  } catch (err: any) {
    console.error('Error en POST /api/facturacion/config:', err?.message || err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
