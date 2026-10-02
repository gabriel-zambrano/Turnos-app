import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { storagePathFromUrl, BUCKET_FOTOS } from '@/lib/storage'
import { FIDELIZACION_HABILITADA } from '@/lib/fidelizacion-flag'
import { VERSION_CONSENTIMIENTO_DATOS, TEXTO_CONSENTIMIENTO_DATOS } from '@/lib/consentimiento-datos'
import crypto from 'crypto'

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
  const cleanToken = (token || '').trim()
  if (!cleanToken || !UUID_REGEX.test(cleanToken)) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
  }

  let pac: any = null
  // 1. Consulta estándar por token (sin token_expira, que se consulta aparte de forma tolerante)
  const pacRes = await supabaseAdmin
    .from('pacientes')
    .select('id, nombre, telefono, tenant_id, dni_cuit, alergias, antecedentes, consentimiento_datos_en, consentimiento_datos_ver, progreso_plan_porcentaje, puntos_saldo_cache, recomendaciones')
    .eq('token', cleanToken)
    .maybeSingle()

  if (pacRes.data) {
    pac = pacRes.data
  } else if (pacRes.error) {
    // Si falló por alguna columna que no existe en el esquema actual, fallback a columnas esenciales
    console.warn('[api/paciente] fallback select en pacientes:', pacRes.error.message)
    const fallback = await supabaseAdmin
      .from('pacientes')
      .select('id, nombre, telefono, tenant_id, dni_cuit, alergias, antecedentes')
      .eq('token', cleanToken)
      .maybeSingle()

    if (fallback.data) {
      pac = {
        ...fallback.data,
        consentimiento_datos_en: null,
        consentimiento_datos_ver: null,
        progreso_plan_porcentaje: 0,
        puntos_saldo_cache: 0,
        recomendaciones: null,
      }
    } else {
      const fallbackMin = await supabaseAdmin
        .from('pacientes')
        .select('id, nombre, telefono, tenant_id')
        .eq('token', cleanToken)
        .maybeSingle()

      if (fallbackMin.data) {
        pac = {
          ...fallbackMin.data,
          dni_cuit: null,
          alergias: null,
          antecedentes: null,
          consentimiento_datos_en: null,
          consentimiento_datos_ver: null,
          progreso_plan_porcentaje: 0,
          puntos_saldo_cache: 0,
          recomendaciones: null,
        }
      }
    }
  }

  // 2. Si no se encontró por token y el string es un UUID válido, intentar por id (retrocompatibilidad)
  if (!pac && UUID_REGEX.test(cleanToken)) {
    const pacPorId = await supabaseAdmin
      .from('pacientes')
      .select('id, nombre, telefono, tenant_id, dni_cuit, alergias, antecedentes, consentimiento_datos_en, consentimiento_datos_ver, progreso_plan_porcentaje, puntos_saldo_cache, recomendaciones')
      .eq('id', cleanToken)
      .maybeSingle()

    if (pacPorId.data) {
      pac = pacPorId.data
    } else {
      const fallbackId = await supabaseAdmin
        .from('pacientes')
        .select('id, nombre, telefono, tenant_id')
        .eq('id', cleanToken)
        .maybeSingle()
      if (fallbackId.data) {
        pac = {
          ...fallbackId.data,
          dni_cuit: null,
          alergias: null,
          antecedentes: null,
          consentimiento_datos_en: null,
          consentimiento_datos_ver: null,
          progreso_plan_porcentaje: 0,
          puntos_saldo_cache: 0,
          recomendaciones: null,
        }
      }
    }
  }

  if (!pac) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 })
  }

  // ── Expiración del token (consulta tolerante y aislada) ──
  // Se consulta aparte para que si la columna token_expira no existe en la base,
  // el portal siga funcionando sin tumbar el acceso.
  try {
    const { data: expData } = await supabaseAdmin
      .from('pacientes')
      .select('token_expira')
      .eq('id', pac.id)
      .maybeSingle()

    if (expData?.token_expira && new Date(expData.token_expira).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Este enlace ha expirado. Solicitá uno nuevo a tu consultorio.' }, { status: 410 })
    }
  } catch {
    // Si la columna no existe en la base, se trata como "sin vencimiento"
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

  let consentimientoFirmado: any = null
  try {
    const { data: cf } = await supabaseAdmin
      .from('consentimientos_firmados')
      .select('id, titulo, firmado_en, hash_sha256')
      .eq('paciente_id', pac.id)
      .eq('estado', 'firmado')
      .order('firmado_en', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (cf) {
      consentimientoFirmado = cf
    }
  } catch (err) {
    console.error('Error fetching signed consent')
  }

  const res = NextResponse.json({
    paciente: {
      id: pac.id,
      nombre: pac.nombre,
      telefono: pac.telefono,
      dni_cuit: pac.dni_cuit || null,
      alergias: pac.alergias || null,
      antecedentes: pac.antecedentes || null,
      consentimiento_datos_en: pac.consentimiento_datos_en || null,
      consentimiento_datos_ver: pac.consentimiento_datos_ver || null,
      progreso_plan_porcentaje: pac.progreso_plan_porcentaje || 0,
      // Saldo del ledger de fidelización (única fuente de verdad). El portal lo
      // muestra tal cual: no debe recalcularse a partir de las asistencias, o el
      // paciente vería un número distinto al de la ficha del odontólogo.
      //
      // Con el flag apagado el campo NO se emite. Ocultarlo solo en la UI
      // dejaría el saldo viajando en el JSON, visible para cualquiera que abra
      // las herramientas del navegador: la baja tiene que ser en el servidor.
      ...(FIDELIZACION_HABILITADA ? { puntos: pac.puntos_saldo_cache || 0 } : {}),
      recomendaciones: pac.recomendaciones || null
    },
    consentimientoFirmado,
    turnos: citas || [],
    historial: historial || [],
    pastTurnos: pastCitas || [],
    fotos,
    feedbackPendiente,
    // `logoUrl` explícito: la columna de la base se llama `logourl`, todo en
    // minúscula, y acá se hacía spread de la fila cruda. El portal pedía
    // `tenant.logoUrl` en camelCase y recibía undefined, así que el logo de la
    // clínica NUNCA apareció en la pantalla del paciente.
    //
    // Las otras dos superficies sí lo mapeaban —`/api/reserva/[clinica]` L57 y
    // `TenantContext` L173—, y por eso el defecto pasó desapercibido: se veía
    // bien en todos lados menos en el portal.
    tenant: { id: tid, ...registry, logoUrl: (registry as any).logourl || null }
  })

  // Evitar que el contenido clínico quede cacheado por intermediarios o se indexe.
  res.headers.set('Cache-Control', 'no-store, max-age=0')
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(`paciente-anamnesis:${ip}`, 10, 60 * 1000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Esperá un momento.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const { token } = params
    const cleanToken = (token || '').trim()
    if (!cleanToken || !UUID_REGEX.test(cleanToken)) {
      return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
    }

    // 1. Buscar paciente por token
    let pac: any = null
    const { data: pacPorToken, error: pacErr } = await supabaseAdmin
      .from('pacientes')
      .select('id, nombre, tenant_id, dni_cuit')
      .eq('token', cleanToken)
      .maybeSingle()

    if (!pacErr && pacPorToken) {
      pac = pacPorToken
    } else if (UUID_REGEX.test(cleanToken)) {
      // Intentar por ID si el enlace usa UUID del paciente
      const { data: pacPorId, error: pacIdErr } = await supabaseAdmin
        .from('pacientes')
        .select('id, nombre, tenant_id, dni_cuit')
        .eq('id', cleanToken)
        .maybeSingle()

      if (!pacIdErr && pacPorId) {
        pac = pacPorId
      }
    }

    // Si aún no se encontró, intentar select mínimo por si dni_cuit diera algún error en select
    if (!pac) {
      const { data: pacMin } = await supabaseAdmin
        .from('pacientes')
        .select('id, nombre, tenant_id')
        .eq('token', cleanToken)
        .maybeSingle()

      if (pacMin) {
        pac = pacMin
      } else if (UUID_REGEX.test(cleanToken)) {
        const { data: pacMinId } = await supabaseAdmin
          .from('pacientes')
          .select('id, nombre, tenant_id')
          .eq('id', cleanToken)
          .maybeSingle()
        if (pacMinId) {
          pac = pacMinId
        }
      }
    }

    if (!pac) {
      return NextResponse.json({ error: 'Paciente no encontrado o enlace inválido' }, { status: 404 })
    }

    // ── Expiración del token (consulta tolerante y aislada) ──
    try {
      const { data: expData } = await supabaseAdmin
        .from('pacientes')
        .select('token_expira')
        .eq('id', pac.id)
        .maybeSingle()

      if (expData?.token_expira && new Date(expData.token_expira).getTime() < Date.now()) {
        return NextResponse.json({ error: 'Este enlace ha expirado. Solicitá uno nuevo a tu consultorio.' }, { status: 410 })
      }
    } catch {
      // Si la columna token_expira no existe, el enlace no expira
    }

    const body = await req.json()
    const {
      dni,
      alergias,
      antecedentes,
      medicacionHabitual,
      contactoEmergencia,
      aceptaConsentimiento,
      firmaPng,
    } = body

    if (!dni || typeof dni !== 'string' || !dni.trim()) {
      return NextResponse.json({ error: 'El número de DNI / Documento es obligatorio.' }, { status: 400 })
    }

    if (!aceptaConsentimiento) {
      return NextResponse.json({ error: 'Debes aceptar la declaración jurada y el consentimiento legal para continuar.' }, { status: 400 })
    }

    if (!firmaPng || typeof firmaPng !== 'string' || !firmaPng.startsWith('data:image/png;base64,')) {
      return NextResponse.json({ error: 'La firma manuscrita digital es obligatoria.' }, { status: 400 })
    }

    const firmadoEn = new Date().toISOString()
    const fechaLegible = new Date(firmadoEn).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
    const dniTrimmed = dni.trim()

    // Preparar resumen consolidado de antecedentes y contacto
    const antPartes: string[] = []
    if (antecedentes && typeof antecedentes === 'string' && antecedentes.trim()) {
      antPartes.push(antecedentes.trim())
    }
    if (medicacionHabitual && typeof medicacionHabitual === 'string' && medicacionHabitual.trim()) {
      antPartes.push(`Medicación: ${medicacionHabitual.trim()}`)
    }
    if (contactoEmergencia && typeof contactoEmergencia === 'string' && contactoEmergencia.trim()) {
      antPartes.push(`Emergencia: ${contactoEmergencia.trim()}`)
    }
    const antecedentesFinal = antPartes.length > 0 ? antPartes.join(' | ') : 'Ninguno'
    const alergiasFinal = (alergias && typeof alergias === 'string' && alergias.trim()) ? alergias.trim() : 'Ninguna'

    // Snapshot inalterable para validez legal (Ley 25.326 y 26.529)
    const contenidoSnapshot = `
DECLARACIÓN JURADA DE SALUD Y CONSENTIMIENTO INFORMADO DE TRATAMIENTO DE DATOS
(Leyes Nacionales 25.326 de Protección de Datos Personales y 26.529 de Derechos del Paciente)

PACIENTE: ${pac.nombre}
DOCUMENTO (DNI/CUIT): ${dniTrimmed}
FECHA Y HORA: ${fechaLegible}
MODALIDAD: Firma digital remota (Portal del Paciente)

--- 1. ANAMNESIS Y ANTECEDENTES DE SALUD DECLARADOS ---
• Alergias conocidas:
${alergiasFinal}

• Condiciones médicas / Antecedentes sistémicos:
${(antecedentes && typeof antecedentes === 'string' && antecedentes.trim()) ? antecedentes.trim() : 'Ninguno manifestado'}

• Medicación habitual:
${(medicacionHabitual && typeof medicacionHabitual === 'string' && medicacionHabitual.trim()) ? medicacionHabitual.trim() : 'No declara'}

• Contacto de emergencia:
${(contactoEmergencia && typeof contactoEmergencia === 'string' && contactoEmergencia.trim()) ? contactoEmergencia.trim() : 'No especificado'}

--- 2. DECLARACIÓN JURADA DE SALUD (LEY 26.529) ---
Declaro bajo juramento que toda la información brindada sobre mi estado de salud general, antecedentes patológicos, intervenciones previas, alergias y medicación habitual es fidedigna, completa y actualizada al día de la fecha. Me comprometo a informar al profesional actuante cualquier cambio en mi condición de salud o medicación antes del inicio de cualquier tratamiento.

--- 3. CONSENTIMIENTO PARA EL TRATAMIENTO DE DATOS DE SALUD (LEY 25.326) ---
${TEXTO_CONSENTIMIENTO_DATOS}

El titular declara haber sido debidamente informado sobre los alcances del tratamiento de sus datos sensibles de salud conforme a los artículos 7, 8 y concordantes de la Ley 25.326, prestando su consentimiento expreso, libre e informado mediante firma electrónica.
`.trim()

    // Huella criptográfica SHA-256 para integridad de la firma (Ley 25.506)
    const hashSha256 = crypto
      .createHash('sha256')
      .update(`${contenidoSnapshot}|${dniTrimmed}|${firmadoEn}|${firmaPng}`)
      .digest('hex')

    // 1. Actualizar ficha del paciente con degradación progresiva para máxima resiliencia
    let updatePacErr: any = null
    const resUpdate1 = await supabaseAdmin
      .from('pacientes')
      .update({
        dni_cuit: dniTrimmed,
        alergias: alergiasFinal,
        antecedentes: antecedentesFinal,
        consentimiento_datos_en: firmadoEn,
        consentimiento_datos_ver: VERSION_CONSENTIMIENTO_DATOS,
        consentimiento_datos_ip: ip,
        consentimiento_datos_origen: 'paciente'
      })
      .eq('id', pac.id)

    if (resUpdate1.error) {
      console.warn('Fallback update 1 sin IP/origen en pacientes:', resUpdate1.error.message)
      const resUpdate2 = await supabaseAdmin
        .from('pacientes')
        .update({
          dni_cuit: dniTrimmed,
          alergias: alergiasFinal,
          antecedentes: antecedentesFinal,
          consentimiento_datos_en: firmadoEn,
          consentimiento_datos_ver: VERSION_CONSENTIMIENTO_DATOS,
        })
        .eq('id', pac.id)

      if (resUpdate2.error) {
        console.warn('Fallback update 2 solo datos clínicos en pacientes:', resUpdate2.error.message)
        const resUpdate3 = await supabaseAdmin
          .from('pacientes')
          .update({
            dni_cuit: dniTrimmed,
            alergias: alergiasFinal,
            antecedentes: antecedentesFinal,
          })
          .eq('id', pac.id)

        if (resUpdate3.error) {
          console.warn('Fallback update 3 sin dni_cuit:', resUpdate3.error.message)
          const resUpdate4 = await supabaseAdmin
            .from('pacientes')
            .update({
              alergias: alergiasFinal,
              antecedentes: antecedentesFinal,
            })
            .eq('id', pac.id)

          updatePacErr = resUpdate4.error
        }
      }
    }

    if (updatePacErr) {
      console.error('Error updating paciente anamnesis:', updatePacErr)
      return NextResponse.json({ error: 'No se pudo guardar la información de salud.' }, { status: 500 })
    }

    // 2. Registrar consentimiento firmado inalterable
    let cfData: any = null
    try {
      const tenantIdFinal = pac.tenant_id || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || '2845c423-affa-4ca2-9c5f-f4ec8e35701a'
      const { data, error: cfErr } = await supabaseAdmin
        .from('consentimientos_firmados')
        .insert({
          tenant_id: tenantIdFinal,
          paciente_id: pac.id,
          titulo: 'Declaración Jurada de Salud y Consentimiento Digital',
          contenido_snapshot: contenidoSnapshot,
          contexto: 'remota',
          estado: 'firmado',
          firmante_nombre: pac.nombre,
          firmante_doc: dniTrimmed,
          firma_png: firmaPng,
          hash_sha256: hashSha256,
          ip_firma: ip,
          user_agent: req.headers.get('user-agent') || null,
          solicitado_en: firmadoEn,
          firmado_en: firmadoEn
        })
        .select('id, titulo, firmado_en, hash_sha256')
        .single()

      if (cfErr) {
        console.error('Error inserting consentimiento firmado:', cfErr)
      } else {
        cfData = data
      }
    } catch (err) {
      console.error('Exception inserting consentimiento firmado:', err)
    }

    return NextResponse.json({
      success: true,
      paciente: {
        dni_cuit: dniTrimmed,
        alergias: alergiasFinal,
        antecedentes: antecedentesFinal,
        consentimiento_datos_en: firmadoEn,
        consentimiento_datos_ver: VERSION_CONSENTIMIENTO_DATOS,
      },
      consentimiento: cfData || null,
    })
  } catch (err: any) {
    console.error('POST /api/paciente/[token] error:', err?.message || err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
