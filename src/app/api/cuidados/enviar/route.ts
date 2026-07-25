import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { remitente, EMAIL_FROM_RECORDATORIOS } from '@/lib/config'

export async function POST(req: Request) {
  try {
    const { tenantId, pacienteId, tratamientoId } = await req.json()
    if (!tenantId || !pacienteId || !tratamientoId) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: membership } = await supabase
      .from('tenant_users').select('role').eq('user_id', user.id).eq('tenant_id', tenantId).single()
    if (!membership) return NextResponse.json({ error: 'No autorizado para este consultorio' }, { status: 403 })

    const [{ data: paciente }, { data: tratamiento }, { data: tenant }] = await Promise.all([
      supabase.from('pacientes').select('nombre, email').eq('id', pacienteId).eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('tratamientos').select('nombre, cuidados_posteriores').eq('id', tratamientoId).eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('tenants').select('nombre, direccion, logoUrl, accentColor').eq('id', tenantId).maybeSingle(),
    ])

    if (!paciente) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
    if (!paciente.email) return NextResponse.json({ error: 'El paciente no tiene email cargado' }, { status: 400 })
    if (!tratamiento) return NextResponse.json({ error: 'Tratamiento no encontrado' }, { status: 404 })
    if (!tratamiento.cuidados_posteriores?.trim()) {
      return NextResponse.json({ error: `El tratamiento "${tratamiento.nombre}" no tiene cuidados posteriores cargados. Cargalos en Precios.` }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email no configurado (falta RESEND_API_KEY)' }, { status: 500 })
    }

    const clinica = (tenant as any)?.nombre || 'tu consultorio'
    const accent = (tenant as any)?.accentColor || '#1D9E75'
    const logo = (tenant as any)?.logoUrl || (tenant as any)?.logourl || ''
    const direccion = (tenant as any)?.direccion || ''

    // Párrafos del instructivo (respeta saltos de línea del texto cargado)
    const parrafos = tratamiento.cuidados_posteriores
      .split(/\n{2,}/)
      .map((p: string, i: number, arr: string[]) =>
        `<p style="color:#334155;font-size:14.5px;line-height:1.6;margin:${i === 0 ? '14px' : '16px'} 0 ${i === arr.length - 1 ? '14px' : '16px'}">${p.replace(/\n/g, '<br/>')}</p>`)
      .join('')

    const resend = new Resend(process.env.RESEND_API_KEY)
    const fromEmail = remitente(clinica, EMAIL_FROM_RECORDATORIOS)

    const html = `
      <div style="background:#eef2f6;padding:24px 12px;margin:0">
        <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(10,30,61,0.08)">
          <div style="background:${accent};padding:26px 32px;text-align:center">
            ${logo
              ? `<img src="${logo}" alt="${clinica}" style="max-height:52px;margin:0 auto 6px;display:block" /><div style="font-size:13px;color:rgba(255,255,255,0.9)">Cuidados posteriores a tu tratamiento</div>`
              : `<div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.2px">${clinica}</div><div style="font-size:13px;color:rgba(255,255,255,0.9);margin-top:2px">Cuidados posteriores a tu tratamiento</div>`}
          </div>
          <div style="padding:28px 32px">
            <div style="display:inline-block;background:${accent}1a;color:${accent};font-size:12px;font-weight:700;padding:5px 12px;border-radius:20px;margin-bottom:16px">🦷 ${tratamiento.nombre}</div>
            <p style="color:#0a1e3d;font-size:16px;font-weight:600;margin:0 0 4px">Hola ${paciente.nombre},</p>
            <p style="color:#475569;font-size:14.5px;line-height:1.6;margin:0 0 20px">Gracias por tu visita. Para cuidar el resultado de tu tratamiento, seguí estas indicaciones:</p>
            <div style="border-left:3px solid ${accent};background:#f8fafc;border-radius:0 12px 12px 0;padding:4px 20px;margin:0 0 8px">
              ${parrafos}
            </div>
            <div style="background:#fffbeb;border-radius:12px;padding:14px 18px;margin:22px 0 4px">
              <p style="color:#92400e;font-size:13.5px;line-height:1.5;margin:0">¿Dudas o molestias? Escribinos y te ayudamos. 💬</p>
            </div>
          </div>
          <div style="border-top:1px solid #eef2f6;padding:18px 32px;text-align:center">
            <div style="font-size:13px;font-weight:600;color:#0a1e3d">${clinica}</div>
            ${direccion ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px">${direccion}</div>` : ''}
          </div>
        </div>
      </div>
    `

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: paciente.email,
      subject: `Cuidados posteriores — ${tratamiento.nombre}`,
      html,
    })

    if (emailError) return NextResponse.json({ error: `No se pudo enviar: ${emailError.message}` }, { status: 502 })

    return NextResponse.json({ success: true, id: emailResult?.id, email: paciente.email })
  } catch (err: any) {
    console.error('POST /api/cuidados/enviar:', err?.message || err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
