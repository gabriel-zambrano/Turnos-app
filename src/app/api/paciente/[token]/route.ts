import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'


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

  const tid = pac.tenant_id || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || ''
  
  let registry = {
    nombre: 'Consultorio Dental',
    direccion: 'Dirección del consultorio',
    telefono: '',
    primaryColor: '#0a1e3d',
    secondaryColor: '#185FA5',
    accentColor: '#138A6B'
  }
  
  if (tid) {
    const { data: dbTenant } = await supabaseAdmin.from('tenants').select('*').eq('id', tid).single()
    if (dbTenant) {
      registry = { ...registry, ...dbTenant }
    }
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

  // Query progress photos safely
  let fotos: any[] = []
  try {
    const { data: fotosRes, error: fotosErr } = await supabaseAdmin
      .from('paciente_fotos')
      .select('id, url, tipo, creado_en')
      .eq('paciente_id', pac.id)
      .order('creado_en', { ascending: true })
    if (!fotosErr && fotosRes) {
      fotos = fotosRes
    }
  } catch (err) {
    console.error('Error fetching progress photos:', err)
  }

  // Check for pending post-visit feedback (last 48 hours) safely
  let feedbackPendiente: any = null
  try {
    const { data: pastCitas48h } = await supabaseAdmin
      .from('citas')
      .select('id, fecha_hora, tipo_tratamiento, estado')
      .eq('paciente_id', pac.id)
      .eq('estado', 'asistio')
      .order('fecha_hora', { ascending: false })
      .limit(1)

    if (pastCitas48h && pastCitas48h.length > 0) {
      const latestCita = pastCitas48h[0]
      const citaTime = new Date(latestCita.fecha_hora).getTime()
      const nowTime = new Date().getTime()
      const hoursDiff = (nowTime - citaTime) / 3600000

      if (hoursDiff <= 48) {
        const { data: existingFeedback, error: feedbackErr } = await supabaseAdmin
          .from('feedback_post_visita')
          .select('id')
          .eq('cita_id', latestCita.id)
          .limit(1)

        if (!feedbackErr && (!existingFeedback || existingFeedback.length === 0)) {
          feedbackPendiente = {
            cita_id: latestCita.id,
            fecha_hora: latestCita.fecha_hora,
            tipo_tratamiento: latestCita.tipo_tratamiento
          }
        }
      }
    }
  } catch (err) {
    console.error('Error checking pending feedback:', err)
  }

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
    fotos,
    feedbackPendiente,
    tenant: {
      id: tid,
      ...registry
    }
  })
}
