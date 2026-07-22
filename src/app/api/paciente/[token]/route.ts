import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { storagePathFromUrl, BUCKET_FOTOS } from '@/lib/storage'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  // El portal es público (sin login) y expone datos clínicos. Limitamos por IP
  // para que nadie pueda barrer tokens por fuerza bruta: 30 accesos por minuto
  // es holgado para un paciente real y corta cualquier escaneo automatizado.
  const ip = getClientIp(req)
  const rl = rateLimit(`paciente:${ip}`, 30, 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Esperá un momento.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  const { token } = params
  if (!token || !UUID_REGEX.test(token)) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
  }

  let pac: any = null
  const pacRes = await supabaseAdmin
    .from('pacientes')
    // token_expira: añadir la columna con la migración incluida en los fixes.
    .select('id, nombre, telefono, tenant_id, alergias, antecedentes, progreso_plan_porcentaje, puntos, recomendaciones, token_expira')
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
      progreso_plan_porcentaje: 0,
      puntos: 0,
      recomendaciones: null,
      token_expira: null
    }
  } else {
    pac = pacRes.data
  }

  // ── Expiración del token ──
  // Si el token tiene fecha de expiración y ya pasó, se rechaza el acceso.
  if (pac.token_expira && new Date(pac.token_expira).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Este enlace ha expirado. Solicitá uno nuevo a tu consultorio.' }, { status: 410 })
  }

  const tid = pac.tenant_id || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || ''

  let registry = {
    nombre: 'Consultorio Dental',
    direccion: '',
    telefono: '',
    primaryColor: '#0a1e3d',
    secondaryColor: '#185FA5',
    accentColor: '#138A6B'
  }

  if (tid) {
    const { data: dbTenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tid)
      .single()
    if (dbTenant) {
      // Nunca exponer al paciente campos internos de facturación/suscripción.
      const SENSITIVE = [
        'mp_preapproval_id', 'subscription_status', 'plan', 'next_payment_date',
        'feature_bi', 'custom_domain', 'subdominio_generico', 'activo', 'created_at'
      ]
      const safeTenant = Object.fromEntries(
        Object.entries(dbTenant).filter(([k]) => !SENSITIVE.includes(k))
      )
      registry = { ...registry, ...safeTenant }
    }
  }

  const ahora = new Date().toISOString()

  // IMPORTANTE: NO devolvemos el campo `notas` de las citas: son notas internas del
  // profesional y no deben mostrarse al paciente.
  const { data: citas } = await supabaseAdmin
    .from('citas')
    .select('id, fecha_hora, tipo_tratamiento, estado, duracion_minutos')
    .eq('paciente_id', pac.id)
    .gte('fecha_hora', ahora)
    .order('fecha_hora', { ascending: true })

  const { data: historial } = await supabaseAdmin
    .from('historial_dental')
    .select('id, diente, estado, creado_en')
    .eq('paciente_id', pac.id)
    .order('creado_en', { ascending: false })

  const { data: pastCitas } = await supabaseAdmin
    .from('citas')
    .select('id, fecha_hora, tipo_tratamiento, estado, duracion_minutos')
    .eq('paciente_id', pac.id)
    .lt('fecha_hora', ahora)
    .order('fecha_hora', { ascending: false })

  let fotos: any[] = []
  try {
    const { data: fotosRes, error: fotosErr } = await supabaseAdmin
      .from('paciente_fotos')
      .select('id, url, tipo, creado_en')
      .eq('paciente_id', pac.id)
      .order('creado_en', { ascending: true })
    if (!fotosErr && fotosRes) {
      // El bucket es privado. El portal del paciente no tiene sesión, así que
      // las URLs las firma el servidor con service-role y vencen en 1 hora.
      fotos = await Promise.all(
        fotosRes.map(async (f: any) => {
          const ruta = storagePathFromUrl(f.url)
          if (!ruta) return f
          const { data: firmada } = await supabaseAdmin.storage
            .from(BUCKET_FOTOS)
            .createSignedUrl(ruta, 3600)
          return firmada?.signedUrl ? { ...f, url: firmada.signedUrl } : f
        })
      )
    }
  } catch (err) {
    console.error('Error fetching progress photos')
  }

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
      const hoursDiff = (Date.now() - citaTime) / 3600000

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
    console.error('Error checking pending feedback')
  }

  const res = NextResponse.json({
    paciente: {
      id: pac.id,
      nombre: pac.nombre,
      telefono: pac.telefono,
      alergias: pac.alergias || null,
      antecedentes: pac.antecedentes || null,
      progreso_plan_porcentaje: pac.progreso_plan_porcentaje || 0,
      puntos: pac.puntos || 0,
      recomendaciones: pac.recomendaciones || null
    },
    turnos: citas || [],
    historial: historial || [],
    pastTurnos: pastCitas || [],
    fotos,
    feedbackPendiente,
    tenant: { id: tid, ...registry }
  })

  // Evitar que el contenido clínico quede cacheado por intermediarios o se indexe.
  res.headers.set('Cache-Control', 'no-store, max-age=0')
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}
