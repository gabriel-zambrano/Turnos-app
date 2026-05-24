import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}
function pct(a: number, b: number) {
  return b === 0 ? 0 : Math.round((a / b) * 100)
}
function diff(hoy: number, prom: number) {
  if (prom === 0) return { val: 0, up: true }
  const d = Math.round(((hoy - prom) / prom) * 100)
  return { val: Math.abs(d), up: d >= 0 }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const resend = new Resend(process.env.RESEND_API_KEY!)

  try {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const manana = new Date(hoy)
    manana.setDate(manana.getDate() + 1)
    const hace7 = new Date(hoy)
    hace7.setDate(hace7.getDate() - 7)

    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, nombre, feature_bi')
      .eq('activo', true)
      .eq('feature_bi', true)

    const { data: doctores } = await supabase
      .from('perfil_doctor')
      .select('tenant_id, nombre, clinica')

    if (!tenants) {
      return NextResponse.json({ error: 'No tenants active for BI' }, { status: 200 })
    }

    const fechaFormateada = new Date().toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })

    const resultados = []

    for (const tenant of tenants) {
      // 1. Obtener email del admin para este tenant
      const { data: emailData } = await supabase
        .rpc('get_tenant_admin_email', { tid: tenant.id })

      const email = emailData as string | null
      if (!email) continue

      // 2. Consultar citas filtrando estrictamente por tenant_id
      const { data: citasHoy } = await supabase
        .from('citas')
        .select('estado, valor, saldo, no_show, tipo_tratamiento')
        .eq('tenant_id', tenant.id)
        .gte('fecha_hora', hoy.toISOString())
        .lt('fecha_hora', manana.toISOString())

      const { data: citasSemana } = await supabase
        .from('citas')
        .select('estado, valor, fecha_hora, no_show')
        .eq('tenant_id', tenant.id)
        .gte('fecha_hora', hace7.toISOString())
        .lt('fecha_hora', hoy.toISOString())

      const citasHoyArr = citasHoy || []
      const citasSemanaArr = citasSemana || []

      const totalHoy = citasHoyArr.length
      const completadasHoy = citasHoyArr.filter(c => c.estado === 'completado').length
      const noShowsHoy = citasHoyArr.filter(c => c.no_show).length
      const ingresosHoy = citasHoyArr.reduce((s, c) => s + (c.valor ?? 0), 0)
      const saldoHoy = citasHoyArr.reduce((s, c) => s + (c.saldo ?? 0), 0)
      const asistenciaHoy = pct(completadasHoy, totalHoy)

      const promDiario = {
        citas: Math.round(citasSemanaArr.length / 7),
        ingresos: citasSemanaArr.reduce((s, c) => s + (c.valor ?? 0), 0) / 7,
        asistencia: pct(
          citasSemanaArr.filter(c => c.estado === 'completado').length,
          citasSemanaArr.length
        )
      }

      const tratMap: Record<string, number> = {}
      citasHoyArr.forEach(c => {
        if (c.tipo_tratamiento) {
          tratMap[c.tipo_tratamiento] = (tratMap[c.tipo_tratamiento] ?? 0) + 1
        }
      })
      const topTrat = Object.entries(tratMap).sort((a, b) => b[1] - a[1])[0]

      const insights: { emoji: string; texto: string }[] = []
      const dIngresos = diff(ingresosHoy, promDiario.ingresos)
      const dCitas = diff(totalHoy, promDiario.citas)
      const dAsistencia = diff(asistenciaHoy, promDiario.asistencia)

      if (dIngresos.val > 0) insights.push({ emoji: dIngresos.up ? '📈' : '📉', texto: `Facturación ${dIngresos.up ? '+' : '-'}${dIngresos.val}% vs promedio semanal` })
      if (dCitas.val > 0) insights.push({ emoji: dCitas.up ? '🗓️' : '⚠️', texto: `${dCitas.up ? 'Más' : 'Menos'} citas que el promedio (${dCitas.val}% de diferencia)` })
      if (noShowsHoy > 0) insights.push({ emoji: '🚨', texto: `${noShowsHoy} inasistencia${noShowsHoy > 1 ? 's' : ''} hoy` })
      if (asistenciaHoy >= 90) insights.push({ emoji: '⭐', texto: `Excelente tasa de asistencia: ${asistenciaHoy}%` })
      if (saldoHoy > 0) insights.push({ emoji: '💳', texto: `Saldo pendiente del día: ${fmt(saldoHoy)}` })
      if (topTrat) insights.push({ emoji: '🦷', texto: `Tratamiento más frecuente: ${topTrat[0]} (${topTrat[1]} citas)` })

      const doctor = doctores?.find(d => d.tenant_id === tenant.id)

      const html = generateEmail({
        fecha: fechaFormateada,
        totalHoy, completadasHoy, noShowsHoy,
        ingresosHoy, saldoHoy, asistenciaHoy,
        promDiario, insights, dIngresos, dCitas, dAsistencia,
      })

      const displayFromName = doctor?.clinica || tenant.nombre || 'DentalDesk'
      const fromEmail = `${displayFromName} <onboarding@resend.dev>`

      const { error } = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `📊 Briefing del ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} — ${doctor?.clinica ?? tenant.nombre}`,
        html,
      })

      resultados.push({ tenant: tenant.nombre, email, ok: !error, error: error?.message })
    }

    return NextResponse.json({ ok: true, resultados })  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function generateEmail(d: {
  fecha: string
  totalHoy: number
  completadasHoy: number
  noShowsHoy: number
  ingresosHoy: number
  saldoHoy: number
  asistenciaHoy: number
  promDiario: { citas: number; ingresos: number; asistencia: number }
  insights: { emoji: string; texto: string }[]
  dIngresos: { val: number; up: boolean }
  dCitas: { val: number; up: boolean }
  dAsistencia: { val: number; up: boolean }
}) {
  const { fecha, totalHoy, completadasHoy, noShowsHoy, ingresosHoy, saldoHoy, asistenciaHoy, promDiario, insights, dIngresos, dCitas, dAsistencia } = d

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f1a;">
<tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

  <tr><td style="background:#0d1b2e;border:1px solid #1e3a5f;border-radius:16px 16px 0 0;padding:32px 36px 24px;">
    <div style="font-size:11px;font-weight:600;color:#3b82f6;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px;">Daily Briefing</div>
    <div style="font-size:22px;font-weight:700;color:#f1f5f9;">Resumen del día</div>
    <div style="font-size:13px;color:#64748b;margin-top:4px;">${fecha}</div>
  </td></tr>

  <tr><td style="background:#0d1421;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;padding:24px 36px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="33%" style="padding-right:8px;">
          <div style="background:#0a1628;border:1px solid #1e3a5f;border-radius:12px;padding:16px;">
            <div style="font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Facturación</div>
            <div style="font-size:22px;font-weight:700;color:#f1f5f9;">${fmt(ingresosHoy)}</div>
            <div style="font-size:11px;color:${dIngresos.up ? '#10b981' : '#ef4444'};margin-top:4px;">${dIngresos.up ? '↑' : '↓'} ${dIngresos.val}% vs promedio</div>
          </div>
        </td>
        <td width="33%" style="padding:0 4px;">
          <div style="background:#0a1628;border:1px solid #1e3a5f;border-radius:12px;padding:16px;">
            <div style="font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Asistencia</div>
            <div style="font-size:22px;font-weight:700;color:${asistenciaHoy >= 80 ? '#10b981' : '#f59e0b'};">${asistenciaHoy}%</div>
            <div style="font-size:11px;color:${dAsistencia.up ? '#10b981' : '#ef4444'};margin-top:4px;">${dAsistencia.up ? '↑' : '↓'} ${dAsistencia.val}% vs promedio</div>
          </div>
        </td>
        <td width="33%" style="padding-left:8px;">
          <div style="background:#0a1628;border:1px solid #1e3a5f;border-radius:12px;padding:16px;">
            <div style="font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Citas</div>
            <div style="font-size:22px;font-weight:700;color:#f1f5f9;">${totalHoy}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">${completadasHoy} ok · ${noShowsHoy} no-show</div>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="background:#0d1421;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;padding:0 36px 24px;">
    <div style="border:1px solid #1e3a5f;border-radius:12px;overflow:hidden;">
      <div style="background:#0a1628;padding:12px 16px;border-bottom:1px solid #1e3a5f;">
        <span style="font-size:11px;font-weight:600;color:#3b82f6;text-transform:uppercase;letter-spacing:0.08em;">Comparativa semanal</span>
      </div>
      <table width="100%">
        <tr style="border-bottom:1px solid #1e2d40;">
          <td style="padding:12px 16px;font-size:12px;color:#64748b;">Promedio diario de citas</td>
          <td align="right" style="padding:12px 16px;font-size:12px;font-weight:600;color:#f1f5f9;">${promDiario.citas}</td>
        </tr>
        <tr style="border-bottom:1px solid #1e2d40;">
          <td style="padding:12px 16px;font-size:12px;color:#64748b;">Promedio ingresos/día</td>
          <td align="right" style="padding:12px 16px;font-size:12px;font-weight:600;color:#f1f5f9;">${fmt(promDiario.ingresos)}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;font-size:12px;color:#64748b;">Promedio asistencia</td>
          <td align="right" style="padding:12px 16px;font-size:12px;font-weight:600;color:#f1f5f9;">${promDiario.asistencia}%</td>
        </tr>
      </table>
    </div>
  </td></tr>

  ${insights.length > 0 ? `
  <tr><td style="background:#0d1421;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;padding:0 36px 24px;">
    <div style="border:1px solid #1e3a5f;border-radius:12px;overflow:hidden;">
      <div style="background:#0a1628;padding:12px 16px;border-bottom:1px solid #1e3a5f;">
        <span style="font-size:11px;font-weight:600;color:#3b82f6;text-transform:uppercase;letter-spacing:0.08em;">Insights</span>
      </div>
      ${insights.map(ins => `
      <div style="padding:12px 16px;border-bottom:1px solid #1e2d40;">
        <span style="font-size:14px;">${ins.emoji}</span>
        <span style="font-size:13px;color:#94a3b8;margin-left:8px;">${ins.texto}</span>
      </div>`).join('')}
    </div>
  </td></tr>` : ''}

  ${saldoHoy > 0 ? `
  <tr><td style="background:#0d1421;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;padding:0 36px 24px;">
    <div style="background:#1a0a0a;border:1px solid #7f1d1d;border-radius:12px;padding:16px 20px;">
      <div style="font-size:12px;font-weight:600;color:#fca5a5;margin-bottom:4px;">⚠️ Saldo pendiente de cobro</div>
      <div style="font-size:20px;font-weight:700;color:#ef4444;">${fmt(saldoHoy)}</div>
    </div>
  </td></tr>` : ''}

  <tr><td style="background:#0d1b2e;border:1px solid #1e3a5f;border-radius:0 0 16px 16px;padding:20px 36px;text-align:center;">
    <div style="font-size:11px;color:#334155;">Generado por <span style="color:#3b82f6;font-weight:600;">DentalDesk</span> · No responder este correo</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}
