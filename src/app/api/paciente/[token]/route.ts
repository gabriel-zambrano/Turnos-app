import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TENANT_REGISTRY } from '@/components/TenantContext'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  if (!token || !UUID_REGEX.test(token)) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
  }
  let pac: any = null
  const pacRes = await supabaseAdmin
    .from('pacientes')
    .select('id, nombre, telefono, tenant_id, alergias, antecedentes, progreso_plan_porcentaje')
    .eq('token', token)
    .single()
  
  if (pacRes.error) {
    const fallback = await supabaseAdmin
      .from('pacientes')
      .select('id, nombre, telefono, tenant_id')
      .eq('token', token)
      .single()
    if (fallback.error || !fallback.data) {
      return NextResponse.json({ error: 'Link inválido' }, { status: 404 })
    }
    pac = {
      ...fallback.data,
      alergias: null,
      antecedentes: null,
      progreso_plan_porcentaje: 0
    }
  } else {
    pac = pacRes.data
  }

  const tid = pac.tenant_id || '2845c423-affa-4ca2-9c5f-f4ec8e35701a'
  const registry = TENANT_REGISTRY[tid] || {
    nombre: 'Consultorio Dental',
    direccion: 'Dirección del consultorio',
    telefono: '',
    primaryColor: '#0a1e3d',
    secondaryColor: '#185FA5',
    accentColor: '#138A6B'
  }

  const ahora = new Date().toISOString()
  const { data: citas } = await supabaseAdmin
    .from('citas')
    .select('id, fecha_hora, tipo_tratamiento, estado, duracion_minutos, notas')
    .eq('paciente_id', pac.id)
    .gte('fecha_hora', ahora)
    .order('fecha_hora', { ascending: true })

  const { data: historial } = await supabaseAdmin
    .from('historial_dental')
    .select('id, diente, estado, notas, creado_en')
    .eq('paciente_id', pac.id)
    .order('creado_en', { ascending: false })

  const { data: pastCitas } = await supabaseAdmin
    .from('citas')
    .select('id, fecha_hora, tipo_tratamiento, estado, duracion_minutos, notas')
    .eq('paciente_id', pac.id)
    .lt('fecha_hora', ahora)
    .order('fecha_hora', { ascending: false })

  return NextResponse.json({
    paciente: { 
      id: pac.id, 
      nombre: pac.nombre, 
      telefono: pac.telefono,
      alergias: pac.alergias || null,
      antecedentes: pac.antecedentes || null,
      progreso_plan_porcentaje: pac.progreso_plan_porcentaje || 0
    },
    turnos: citas || [],
    historial: historial || [],
    pastTurnos: pastCitas || [],
    tenant: {
      id: tid,
      ...registry
    }
  })
}
