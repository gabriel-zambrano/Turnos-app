import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'
import { remitente, EMAIL_FROM_RECORDATORIOS , urlDeClinica } from '@/lib/config'
import { emitirEnlaceTurno } from '@/lib/turno-publico'
import { esCron } from '@/lib/cron-auth'
import { generarEmailRecordatorioHtml } from '@/lib/email-templates'


export const dynamic = 'force-dynamic'

// Los envíos ya no salen todos a la vez (ver TANDA_TAM más abajo), así que el
// endpoint tarda más. Con el default de Vercel una clínica con muchos turnos
// se cortaba a la mitad.
export const maxDuration = 60

const DEFAULT_TENANT_ID = '2845c423-affa-4ca2-9c5f-f4ec8e35701a'

// Resend limita a 10 solicitudes por segundo POR EQUIPO — no por clave ni por
// dominio. `Promise.allSettled` sobre todas las citas disparaba los envíos en
// paralelo: con más de diez turnos mañana, del onceavo en adelante volvían con
// 429 y esos pacientes no recibían nada. Se registraba 'fallido' y nadie lo
// miraba.
//
// Cinco por tanda deja margen para el resto de los envíos del sistema
// (confirmaciones, facturas, briefing) que comparten la misma cuota.
const TANDA_TAM = 5
const PAUSA_MS = 1100

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

// Columnas de `tenants` tal como existen en la base: PostgREST distingue
// mayúsculas y estas están todas en minúscula. Pedirlas en camelCase devolvía
// error 42703, `activeTenants` quedaba null, y el código caía al tenant por
// defecto SIN branding y sin dominio propio — anulando en silencio el arreglo
// de `urlDeClinica` documentado más abajo.
const COLUMNAS_TENANT =
  'id, nombre, direccion, telefono, custom_domain, logourl, primarycolor, secondarycolor, accentcolor, whatsapptemplate'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Antes este endpoint no verificaba nada: cualquiera en internet podía
  // llamarlo y disparar el envío de recordatorios (sin token, sin sesión,
  // sin nada). Ahora acepta dos caminos válidos:
  //   a) El cron diario, que manda `Authorization: Bearer <CRON_SECRET>` —
  //      puede procesar todas las clínicas activas.
  //   b) Un usuario logueado desde el dashboard, que solo puede procesar
  //      la clínica a la que pertenece (se verifica más abajo).
  //
  // El camino (a) recibía el secreto por `?token=`. Se cambió al header: un
  // query string queda registrado en los access logs, en el Referer y en las
  // trazas de Sentry, y este secreto habilita el envío para TODAS las clínicas.
  const isCron = esCron(req)

  // 1. Determinar el/los tenant(s) a procesar
  let bodyTenantId: string | null = null
  try {
    const body = await req.json()
    bodyTenantId = body?.tenantId || null
  } catch (e) {
    // El request body puede estar vacío (ej. en invocaciones cron automáticas)
  }

  if (!isCron) {
    // No es el cron: exigimos un usuario logueado que pertenezca al tenant pedido.
    const supabaseServer = createSupabaseServerClient()
    const { data: { user } } = await supabaseServer.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    if (!bodyTenantId) {
      // Sin token de cron, no se puede pedir "procesar todas las clínicas".
      return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })
    }
    const { data: membership } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', bodyTenantId)
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'No autorizado para esta clínica' }, { status: 403 })
    }
  }

  let tenantsToProcess: { id: string; nombre: string }[] = []

  if (bodyTenantId) {
    // Si viene en el body, procesamos solo ese tenant
    const { data: tenantData } = await supabase
      .from('tenants')
      .select(COLUMNAS_TENANT)
      .eq('id', bodyTenantId)
      .single()

    if (tenantData) {
      tenantsToProcess = [tenantData]
    } else {
      // Fallback si no se encuentra en BD (puede ser un ID estático)
      tenantsToProcess = [{ id: bodyTenantId, nombre: 'DentalDesk' }]
    }
  } else {
    // Si es una invocación global (cron), buscamos todos los tenants activos
    const { data: activeTenants, error: errorTenants } = await supabase
      .from('tenants')
      .select(COLUMNAS_TENANT)
      .eq('activo', true)

    if (activeTenants && activeTenants.length > 0) {
      tenantsToProcess = activeTenants
    } else {
      // Este fallback existía en silencio: antes el `select` fallaba SIEMPRE por
      // el camelCase y nadie se enteraba, porque el error ni se desestructuraba.
      // Con una sola clínica pasaba desapercibido (el ID por defecto ES esa
      // clínica); con dos, la segunda se quedaba sin recordatorios.
      //
      // Se conserva para no dejar al consultorio sin avisos ante un fallo
      // transitorio de la base, pero ahora grita.
      console.error(
        '[recordatorios] No se pudo listar tenants activos; usando DEFAULT_TENANT_ID. ' +
        'SOLO se procesará esa clínica. Error: ' + (errorTenants?.message ?? 'consulta vacía')
      )
      tenantsToProcess = [{ id: DEFAULT_TENANT_ID, nombre: '' }]
    }
  }

  // 2. Calcular rango de fechas para mañana (Zona Horaria Argentina)
  const ahora = new Date()
  const manana = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  manana.setDate(manana.getDate() + 1)
  const desdeISO = new Date(manana.getFullYear(), manana.getMonth(), manana.getDate(), 3, 0, 0).toISOString()
  const hastaISO = new Date(manana.getFullYear(), manana.getMonth(), manana.getDate() + 1, 2, 59, 59).toISOString()

  let totalEnviados = 0
  let totalFallidos = 0
  let totalOmitidos = 0

  // 3. Procesar citas aisladas para cada tenant
  for (const tenant of tenantsToProcess) {
    // Obtener branding estático o crear un fallback
    // Los links del recordatorio salen por el dominio del consultorio. Antes
    // usaban NEXT_PUBLIC_APP_URL, que es el de la plataforma: el paciente
    // terminaba en el sitio de otra clínica, con su token de portal a cuestas.
    const urlClinica = urlDeClinica(tenant as any)

    const branding = {
      id: tenant.id,
      nombre: tenant.nombre || 'Consultorio Dental',
      direccion: (tenant as any).direccion || '',
      telefono: (tenant as any).telefono || '',
      logoUrl: (tenant as any).logourl || undefined,
      primaryColor: (tenant as any).primarycolor || '#0a1e3d',
      secondaryColor: (tenant as any).secondarycolor || '#185FA5',
      accentColor: (tenant as any).accentcolor || '#138A6B'
    }

    // Consultar citas de mañana exclusivas de este tenant
    const { data: citas, error } = await supabase
      .from('citas')
      .select('id, fecha_hora, tipo_tratamiento, pacientes(nombre, email, token)')
      .eq('tenant_id', tenant.id)
      .in('estado', ['pendiente', 'confirmado'])
      .gte('fecha_hora', desdeISO)
      .lte('fecha_hora', hastaISO)

    if (error) {
      console.error(`Error al obtener citas para tenant ${tenant.id}:`, error.message)
      continue
    }

    if (!citas || citas.length === 0) {
      continue
    }

    const enviarUna = async (cita: any): Promise<'enviado' | 'omitido'> => {
        const paciente = cita.pacientes

        // Un paciente sin email no recibe nada. Antes esto devolvía
        // `{ skip: true }`, que `Promise.allSettled` reporta como `fulfilled`,
        // y el conteo lo sumaba como ENVIADO. Encima no escribía fila en
        // `recordatorios_log`, así que el salto no dejaba rastro en ninguna
        // parte: la respuesta decía "enviados: 12" habiendo salido 9, y la
        // métrica de recordatorios por cita daba 1.00 porque solo promediaba
        // las citas que SÍ habían generado una fila.
        //
        // Son 25 de 222 pacientes — 1 de cada 9 — y sesgados hacia los de
        // ortodoncia, que vuelven todos los meses. Ahora queda registrado.
        if (!paciente?.email) {
          await supabase.from('recordatorios_log').insert({
            cita_id: cita.id,
            tipo_mensaje: 'email',
            estado_envio: 'omitido',
            error_detalle: 'paciente sin email',
            mensaje_preview: `Sin email: ${paciente?.nombre ?? 'paciente sin ficha'}`,
            enviado_en: new Date().toISOString(),
            tenant_id: tenant.id
          })
          return 'omitido'
        }

        const fecha = new Date(cita.fecha_hora)
        const horaAR = fecha.toLocaleString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          weekday: 'long', day: '2-digit', month: 'long',
          hour: '2-digit', minute: '2-digit'
        })

        // Un solo botón, al enlace corto: desde ahí el paciente confirma,
        // agenda y pide reprogramar. Antes eran dos, y el segundo ("Ver mi
        // turno") apuntaba al mismo lugar que el primero.
        const codigo = await emitirEnlaceTurno(cita.id)
        const enlaceTurno = codigo
          ? `${urlClinica}/t/${codigo}`
          : paciente.token
            ? `${urlClinica}/paciente/${paciente.token}`
            : ''

        const displayFromName = branding.nombre || 'DentalDesk'
        const fromEmail = remitente(displayFromName, EMAIL_FROM_RECORDATORIOS)

        const emailHtml = generarEmailRecordatorioHtml({
          nombrePaciente: paciente.nombre,
          fechaHoraTexto: horaAR,
          tratamiento: cita.tipo_tratamiento,
          clinicaNombre: branding.nombre,
          clinicaDireccion: branding.direccion || undefined,
          clinicaTelefono: branding.telefono || undefined,
          clinicaLogoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor || '#0F4C5C',
          secondaryColor: branding.secondaryColor || '#185FA5',
          accentColor: branding.accentColor || '#138A6B',
          enlaceTurno: enlaceTurno || undefined,
        })

        const { data: emailResult, error: emailError } = await resend.emails.send({
          from: fromEmail,
          to: paciente.email,
          subject: `Recordatorio de turno — ${horaAR}`,
          html: emailHtml,
        })

        const resendId = emailResult?.id ?? null
        await supabase.from('recordatorios_log').insert({
          cita_id: cita.id,
          tipo_mensaje: 'email',
          estado_envio: emailError ? 'fallido' : 'enviado',
          mensaje_preview: `Recordatorio turno ${horaAR}`,
          enviado_en: new Date().toISOString(),
          resend_email_id: resendId,
          tenant_id: tenant.id
        })

        if (emailError) throw new Error(emailError.message)
        return 'enviado'
    }

    // En tandas, no todos de golpe: Resend corta en 10 solicitudes por segundo
    // y `Promise.allSettled` sobre todas las citas las disparaba juntas. Con
    // más de diez turnos, del onceavo en adelante volvía 429 y esos pacientes
    // se quedaban sin aviso.
    for (let i = 0; i < citas.length; i += TANDA_TAM) {
      const tanda = citas.slice(i, i + TANDA_TAM)
      const resultados = await Promise.allSettled(tanda.map(enviarUna))

      for (const r of resultados) {
        if (r.status === 'rejected') totalFallidos++
        else if (r.value === 'omitido') totalOmitidos++
        else totalEnviados++
      }

      if (i + TANDA_TAM < citas.length) await dormir(PAUSA_MS)
    }
  }

  // `omitidos` se informa aparte a propósito. Sumarlo a `enviados` es
  // exactamente el defecto que esta corrección elimina.
  return NextResponse.json({
    enviados: totalEnviados,
    fallidos: totalFallidos,
    omitidos: totalOmitidos,
  })
}