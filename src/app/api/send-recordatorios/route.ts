import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { TENANT_REGISTRY } from '@/components/TenantContext'

export const dynamic = 'force-dynamic'

const DEFAULT_TENANT_ID = '2845c423-affa-4ca2-9c5f-f4ec8e35701a'

export async function POST(req: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Determinar el/los tenant(s) a procesar
  let bodyTenantId: string | null = null
  try {
    const body = await req.json()
    bodyTenantId = body?.tenantId || null
  } catch (e) {
    // El request body puede estar vacío (ej. en invocaciones cron automáticas)
  }

  let tenantsToProcess: { id: string; nombre: string }[] = []

  if (bodyTenantId) {
    // Si viene en el body, procesamos solo ese tenant
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('id, nombre')
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
    const { data: activeTenants } = await supabase
      .from('tenants')
      .select('id, nombre')
      .eq('activo', true)

    if (activeTenants && activeTenants.length > 0) {
      tenantsToProcess = activeTenants
    } else {
      // Fallback al tenant por defecto
      tenantsToProcess = [{ id: DEFAULT_TENANT_ID, nombre: 'Dr. Walter Benegas' }]
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

  // 3. Procesar citas aisladas para cada tenant
  for (const tenant of tenantsToProcess) {
    // Obtener branding estático o crear un fallback
    const brandingRegistry = TENANT_REGISTRY[tenant.id] || {
      nombre: tenant.nombre || 'Consultorio Dental',
      direccion: 'Dirección del consultorio',
      telefono: '',
      logoUrl: undefined,
      primaryColor: '#0a1e3d',
      secondaryColor: '#185FA5',
      accentColor: '#138A6B'
    }

    const branding = {
      id: tenant.id,
      ...brandingRegistry
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

    const resultados = await Promise.allSettled(
      citas.map(async (cita: any) => {
        const paciente = cita.pacientes
        if (!paciente?.email) return { skip: true }

        const fecha = new Date(cita.fecha_hora)
        const horaAR = fecha.toLocaleString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          weekday: 'long', day: '2-digit', month: 'long',
          hour: '2-digit', minute: '2-digit'
        })

        const displayFromName = branding.nombre || 'DentalDesk'
        const fromEmail = `${displayFromName} <recordatorios@walterbenegas.com.ar>`

        const { data: emailResult, error: emailError } = await resend.emails.send({
          from: fromEmail,
          to: paciente.email,
          subject: `Recordatorio de turno — ${horaAR}`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
              <h2 style="color:${branding.accentColor || '#1D9E75'};margin-bottom:8px">Recordatorio de turno</h2>
              <p style="color:#333;font-size:15px">Hola <strong>${paciente.nombre}</strong>,</p>
              <p style="color:#333;font-size:15px">Te recordamos que tenés un turno programado:</p>
              <div style="background:#f4f6f8;border-radius:12px;padding:16px 20px;margin:20px 0">
                <p style="margin:0;font-size:14px;color:#666">📅 <strong style="color:#333">${horaAR}</strong></p>
                <p style="margin:8px 0 0;font-size:14px;color:#666">🦷 Tratamiento: <strong style="color:#333">${cita.tipo_tratamiento}</strong></p>
                <p style="margin:8px 0 0;font-size:14px;color:#666">📍 ${branding.nombre} ${branding.direccion ? `— ${branding.direccion}` : ''}</p>
              </div>
              ${paciente.token ? `
              <div style="text-align:center;margin:24px 0;display:flex;gap:12px;justify-content:center">
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/paciente/${paciente.token}" style="display:inline-block;background:${branding.accentColor || '#1D9E75'};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">✓ Confirmar turno</a>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/paciente/${paciente.token}" style="display:inline-block;background:#f4f6f8;color:#555;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver mi turno</a>
              </div>` : ''}
              <p style="color:#888;font-size:13px">Si necesitás cancelar o reprogramar, podés hacerlo desde el link de arriba.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
              <p style="color:#aaa;font-size:12px;text-align:center">Este es un mensaje automático de ${branding.nombre}. Por favor no respondas este email.</p>
            </div>
          `
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
        return { ok: true, paciente: paciente.nombre }
      })
    )

    const enviados = resultados.filter(r => r.status === 'fulfilled').length
    const fallidos = resultados.filter(r => r.status === 'rejected').length

    totalEnviados += enviados
    totalFallidos += fallidos
  }

  return NextResponse.json({ enviados: totalEnviados, fallidos: totalFallidos })
}