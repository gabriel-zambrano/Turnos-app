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
      .map((p: string) => `<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 14px">${p.replace(/\n/g, '<br/>')}</p>`)
      .join('')

    const resend = new Resend(process.env.RESEND_API_KEY)
    const fromEmail = remitente(clinica, EMAIL_FROM_RECORDATORIOS)

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: paciente.email,
      subject: `Cuidados posteriores — ${tratamiento.nombre}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
          ${logo ? `<img src="${logo}" alt="${clinica}" style="max-height:60px;margin-bottom:20px;display:block" />` : ''}
          <h2 style="color:${accent};margin-bottom:8px">Cuidados posteriores a tu ${tratamiento.nombre.toLowerCase()}</h2>
          <p style="color:#333;font-size:15px">Hola <strong>${paciente.nombre}</strong>,</p>
          <p style="color:#333;font-size:15px;margin-bottom:20px">Te dejamos las indicaciones para cuidar el resultado de tu tratamiento:</p>
          <div style="background:#f4f6f8;border-radius:12px;padding:18px 20px;margin:0 0 20px">
            ${parrafos}
          </div>
          <p style="color:#333;font-size:14px">Ante cualquier duda o molestia, no dudes en escribirnos.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#aaa;font-size:12px;text-align:center">Mensaje enviado por ${clinica}${direccion ? ` — ${direccion}` : ''}.</p>
        </div>
      `,
    })

    if (emailError) return NextResponse.json({ error: `No se pudo enviar: ${emailError.message}` }, { status: 502 })

    return NextResponse.json({ success: true, id: emailResult?.id, email: paciente.email })
  } catch (err: any) {
    console.error('POST /api/cuidados/enviar:', err?.message || err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
