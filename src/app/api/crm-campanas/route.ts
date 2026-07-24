import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enviarWhatsApp, whatsappConfigurado } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TPL_CUMPLE = process.env.WHATSAPP_TPL_CUMPLE || 'crm_cumpleanos'
const TPL_RECALL = process.env.WHATSAPP_TPL_RECALL || 'crm_recall'
const TPL_REACT = process.env.WHATSAPP_TPL_REACT || 'crm_reactivacion'
const MAX_POR_TENANT = 60 // tope de envíos por clínica por corrida

function hoyAR() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  const authHeader = req.headers.get('authorization') || ''
  const tokenParam = new URL(req.url).searchParams.get('token')
  if (authHeader !== `Bearer ${secret}` && tokenParam !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  if (!whatsappConfigurado()) {
    return NextResponse.json({ ok: false, motivo: 'WhatsApp no configurado; no se envió nada.' })
  }

  const ahora = hoyAR()
  const anio = ahora.getFullYear()
  const mesKey = `${anio}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  const ahoraIso = new Date().toISOString()

  // Clínicas con al menos una campaña activa
  const { data: campanas } = await admin
    .from('crm_campanas')
    .select('tenant_id, cumples_activo, recall_activo, reactivacion_activo')
    .or('cumples_activo.eq.true,recall_activo.eq.true,reactivacion_activo.eq.true')

  let totalEnviados = 0
  const resumen: Record<string, number> = {}

  for (const camp of campanas || []) {
    const tenantId = camp.tenant_id
    const { data: tenant } = await admin.from('tenants').select('nombre').eq('id', tenantId).maybeSingle()
    const clinica = tenant?.nombre || 'tu consultorio'

    const [{ data: pacientes }, { data: citas }, { data: trats }, { data: enviosPrevios }] = await Promise.all([
      admin.from('pacientes').select('id, nombre, telefono, fecha_nacimiento').eq('tenant_id', tenantId),
      admin.from('citas').select('fecha_hora, estado, paciente_id, tipo_tratamiento').eq('tenant_id', tenantId),
      admin.from('tratamientos').select('nombre, meses_control').eq('tenant_id', tenantId).not('meses_control', 'is', null),
      admin.from('crm_envios').select('paciente_id, tipo, clave_dedupe').eq('tenant_id', tenantId),
    ])

    const yaEnviado = new Set((enviosPrevios || []).map(e => `${e.paciente_id}|${e.tipo}|${e.clave_dedupe}`))
    const citasPorPac = new Map<string, any[]>()
    ;(citas || []).forEach(c => {
      if (!citasPorPac.has(c.paciente_id)) citasPorPac.set(c.paciente_id, [])
      citasPorPac.get(c.paciente_id)!.push(c)
    })
    const intervalos = new Map<string, number>()
    ;(trats || []).forEach((t: any) => intervalos.set(t.nombre.toLowerCase().trim(), t.meses_control))

    // Construir la lista de candidatos (tipo, paciente, variables, clave)
    type Cand = { pac: any; tipo: string; clave: string; plantilla: string; vars: string[] }
    const candidatos: Cand[] = []

    for (const p of pacientes || []) {
      if (!p.telefono) continue
      const citasPac = citasPorPac.get(p.id) || []
      const tieneFutura = citasPac.some(c => c.fecha_hora > ahoraIso && ['pendiente', 'confirmado'].includes(c.estado))

      // 1. Cumpleaños de hoy
      if (camp.cumples_activo && p.fecha_nacimiento) {
        const [, m, d] = String(p.fecha_nacimiento).split('-')
        if (parseInt(m, 10) === ahora.getMonth() + 1 && parseInt(d, 10) === ahora.getDate()) {
          const clave = `cumple:${anio}`
          if (!yaEnviado.has(`${p.id}|cumple|${clave}`)) {
            candidatos.push({ pac: p, tipo: 'cumple', clave, plantilla: TPL_CUMPLE, vars: [p.nombre, clinica] })
          }
        }
      }

      if (tieneFutura) continue // con turno agendado no mandamos recall ni reactivación

      // 2. Recall clínico vencido
      if (camp.recall_activo && intervalos.size) {
        let venció: { trat: string } | null = null
        for (const c of citasPac) {
          if (!c.tipo_tratamiento) continue
          if (!(c.fecha_hora <= ahoraIso && ['asistio', 'completado'].includes(c.estado))) continue
          const meses = intervalos.get(c.tipo_tratamiento.toLowerCase().trim())
          if (!meses) continue
          const vence = new Date(c.fecha_hora); vence.setMonth(vence.getMonth() + meses)
          if (vence <= ahora) { venció = { trat: c.tipo_tratamiento }; break }
        }
        if (venció) {
          const clave = `recall:${mesKey}`
          if (!yaEnviado.has(`${p.id}|recall|${clave}`)) {
            candidatos.push({ pac: p, tipo: 'recall', clave, plantilla: TPL_RECALL, vars: [p.nombre, venció.trat, clinica] })
            continue
          }
        }
      }

      // 3. Reactivación (última visita > 6 meses, sin turno)
      if (camp.reactivacion_activo) {
        const pasadas = citasPac.filter(c => c.fecha_hora <= ahoraIso && ['asistio', 'completado'].includes(c.estado))
          .sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora))
        if (pasadas.length) {
          const seisMeses = new Date(); seisMeses.setMonth(seisMeses.getMonth() - 6)
          if (new Date(pasadas[0].fecha_hora) < seisMeses) {
            const clave = `react:${mesKey}`
            if (!yaEnviado.has(`${p.id}|reactivacion|${clave}`)) {
              candidatos.push({ pac: p, tipo: 'reactivacion', clave, plantilla: TPL_REACT, vars: [p.nombre, clinica] })
            }
          }
        }
      }
    }

    // Enviar (con tope) y registrar
    for (const cand of candidatos.slice(0, MAX_POR_TENANT)) {
      const r = await enviarWhatsApp({ telefono: cand.pac.telefono, plantilla: cand.plantilla, variables: cand.vars })
      await admin.from('crm_envios').insert({
        tenant_id: tenantId,
        paciente_id: cand.pac.id,
        tipo: cand.tipo,
        canal: 'whatsapp',
        estado: r.ok ? 'enviado' : 'error',
        detalle: r.ok ? r.id : r.error,
        clave_dedupe: cand.clave,
      })
      if (r.ok) { totalEnviados++; resumen[cand.tipo] = (resumen[cand.tipo] || 0) + 1 }
    }
  }

  return NextResponse.json({ ok: true, totalEnviados, resumen })
}
