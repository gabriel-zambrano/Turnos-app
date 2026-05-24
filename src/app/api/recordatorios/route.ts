import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TENANT_REGISTRY } from '@/components/TenantContext'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { citas, tenantId } = await req.json()

  if (!citas || !Array.isArray(citas) || citas.length === 0) {
    return NextResponse.json({ enviados: [], fallidos: [] })
  }

  const tid = tenantId || '2845c423-affa-4ca2-9c5f-f4ec8e35701a'
  const registry = TENANT_REGISTRY[tid] || {
    nombre: 'DentalDesk',
    direccion: 'Dirección del consultorio',
    telefono: '',
  }

  const ids = citas.map((c: any) => c.id)

  // Buscar emails en Supabase usando los IDs que manda el dashboard, filtrando por tenant_id por seguridad
  const { data: citasDB, error: dbError } = await supabaseAdmin
    .from('citas')
    .select('id, fecha_hora, tipo_tratamiento, pacientes(nombre, email, token)')
    .eq('tenant_id', tid)
    .in('id', ids)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  const enviados: string[] = []
  const fallidos: string[] = []

  await Promise.all((citasDB || []).map(async (cita: any) => {
    const paciente = cita.pacientes
    const citaLocal = citas.find((c: any) => c.id === cita.id)
    const nombre = paciente?.nombre || citaLocal?.nombre || '—'
    const hora = citaLocal?.hora ?? new Date(cita.fecha_hora).toLocaleTimeString('es-AR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires'
    })

    if (!paciente?.email) {
      fallidos.push(nombre)
      return
    }

    const fechaHora = new Date(cita.fecha_hora)
    const fechaLabel = fechaHora.toLocaleDateString('es-AR', {
      weekday: 'long', day: 'numeric', month: 'long',
      timeZone: 'America/Argentina/Buenos_Aires'
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://walterbenegas.com.ar'

    const linkConfirmar = paciente.token
      ? `<div style="text-align:center;margin:24px 0">
           <a href="${appUrl}/paciente/${paciente.token}"
              style="display:inline-block;background:#1D9E75;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
             ✓ Confirmar turno
           </a>
         </div>`
      : ''

    const { error } = await resend.emails.send({
      from: `${registry.nombre} <turnos@walterbenegas.com.ar>`,
      to: paciente.email,
      subject: `📅 Recordatorio — Hoy tenés turno a las ${hora}hs`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f4f7fb;padding:32px 16px">
          <div style="background:#fff;border-radius:16px;padding:32px;border:1px solid #e8edf2">
            <div style="text-align:center;margin-bottom:24px">
              <div style="font-size:40px;margin-bottom:12px">⏰</div>
              <h1 style="font-size:20px;font-weight:700;color:#0f1e2b;margin:0">Recordatorio de turno</h1>
              <p style="font-size:14px;color:#94a3b8;margin:6px 0 0">
                Hola <strong>${nombre}</strong>, hoy tenés turno con ${registry.nombre}.
              </p>
            </div>
            <div style="background:#f4f7fb;border-radius:12px;padding:20px;margin-bottom:24px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding-bottom:12px">
                  <span style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Fecha y hora</span><br/>
                  <span style="font-size:15px;font-weight:600;color:#0f1e2b">${fechaLabel} a las ${hora}hs</span>
                </td></tr>
                <tr><td style="padding-bottom:12px">
                  <span style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Tratamiento</span><br/>
                  <span style="font-size:15px;font-weight:600;color:#0f1e2b">${cita.tipo_tratamiento}</span>
                </td></tr>
                <tr><td>
                  <span style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">Lugar</span><br/>
                  <span style="font-size:15px;font-weight:600;color:#0f1e2b">${registry.direccion}</span>
                </td></tr>
              </table>
            </div>
            ${linkConfirmar}
            <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0">
              Si necesitás cancelar o reprogramar, respondé este email o llamanos.
            </p>
          </div>
        </div>
      `
    })

    if (error) {
      console.error(`Error enviando a ${paciente.email}:`, error.message)
      fallidos.push(nombre)
    } else {
      enviados.push(nombre)
    }
  }))

  return NextResponse.json({ enviados, fallidos })
}
