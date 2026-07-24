import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

// Exporta todos los datos del consultorio en un Excel multi-hoja (portabilidad).
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId')
    if (!tenantId) return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })

    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: membership } = await supabase
      .from('tenant_users').select('role').eq('user_id', user.id).eq('tenant_id', tenantId).single()
    if (!membership) return NextResponse.json({ error: 'No autorizado para este consultorio' }, { status: 403 })
    if (membership.role !== 'admin' && membership.role !== 'owner') {
      return NextResponse.json({ error: 'Solo un administrador puede exportar los datos del consultorio' }, { status: 403 })
    }

    // Traer datos (RLS ya limita al tenant; filtramos igual por claridad)
    const [pacRes, citasRes, factRes, tenantRes] = await Promise.all([
      supabase.from('pacientes').select('*').eq('tenant_id', tenantId).order('nombre'),
      supabase.from('citas').select('fecha_hora, tipo_tratamiento, estado, precio_cobrado, valor, sena, pacientes(nombre)').eq('tenant_id', tenantId).order('fecha_hora', { ascending: false }),
      supabase.from('facturas').select('creada_en, tipo_comprobante, punto_venta, nro_comprobante, monto, cae, estado, simulada, paciente_nombre, paciente_doc_nro').eq('tenant_id', tenantId).order('creada_en', { ascending: false }),
      supabase.from('tenants').select('nombre').eq('id', tenantId).maybeSingle(),
    ])

    const TIPO = { 1: 'Factura A', 6: 'Factura B', 11: 'Factura C', 3: 'NC A', 8: 'NC B', 13: 'NC C' } as Record<number, string>

    // Hoja Pacientes
    const pacientes = (pacRes.data || []).map((p: any) => ({
      Nombre: p.nombre,
      Teléfono: p.telefono,
      Email: p.email || '',
      'Fecha nacimiento': p.fecha_nacimiento || '',
      'DNI/CUIT': p.dni_cuit || '',
      'Tipo doc': p.tipo_documento || '',
      Alergias: p.alergias || '',
      Antecedentes: p.antecedentes || '',
      'Último tratamiento': p.ultimo_tratamiento || '',
      'Alta': p.creado_en ? String(p.creado_en).split('T')[0] : '',
    }))

    // Hoja Turnos
    const turnos = (citasRes.data || []).map((c: any) => ({
      Fecha: c.fecha_hora ? new Date(c.fecha_hora).toLocaleString('es-AR') : '',
      Paciente: c.pacientes?.nombre || '',
      Tratamiento: c.tipo_tratamiento || '',
      Estado: c.estado || '',
      'Precio cobrado': c.precio_cobrado ?? c.valor ?? '',
      Seña: c.sena ?? '',
    }))

    // Hoja Facturas
    const facturas = (factRes.data || []).map((f: any) => ({
      Fecha: f.creada_en ? new Date(f.creada_en).toLocaleDateString('es-AR') : '',
      Comprobante: `${TIPO[f.tipo_comprobante] || f.tipo_comprobante} N°${String(f.punto_venta).padStart(4, '0')}-${String(f.nro_comprobante).padStart(8, '0')}`,
      Paciente: f.paciente_nombre || '',
      'Doc.': f.paciente_doc_nro || '',
      Monto: f.monto,
      CAE: f.cae || '',
      Estado: f.simulada ? 'Simulada' : f.estado,
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pacientes.length ? pacientes : [{ Nombre: '' }]), 'Pacientes')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(turnos.length ? turnos : [{ Fecha: '' }]), 'Turnos')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(facturas.length ? facturas : [{ Fecha: '' }]), 'Facturas')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const fecha = new Date().toISOString().split('T')[0]
    const nombreClinica = (tenantRes.data?.nombre || 'consultorio').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)

    return new NextResponse(Buffer.from(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="DentalDesk_${nombreClinica}_${fecha}.xlsx"`,
      },
    })
  } catch (err: any) {
    console.error('GET /api/pacientes/exportar:', err?.message || err)
    return NextResponse.json({ error: 'No se pudo generar la exportación' }, { status: 500 })
  }
}
