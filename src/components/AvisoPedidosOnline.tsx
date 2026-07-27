'use client'

// ─────────────────────────────────────────────────────────────
// Turnos pedidos por el link público que siguen sin confirmar.
//
// El turno online entra como 'pendiente' y ahí se queda hasta que alguien del
// consultorio lo mire. Un contador no alcanza: para decidir hay que ver quién
// pidió y para cuándo, así que se listan y se pueden resolver desde acá mismo.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'

interface Pedido {
  id: string
  fecha_hora: string
  tipo_tratamiento: string
  sena: number | null
  notas: string | null
  pacientes: { nombre: string; telefono: string } | null
}

/** "mar 28/07 · 10:00" — corto, para que entre en una línea en el celular. */
function cuando(fechaHora: string): string {
  const d = new Date(fechaHora)
  const dia = d.toLocaleDateString('es-AR', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).replace('.', '')
  const hora = d.toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  return `${dia} · ${hora}`
}

export function AvisoPedidosOnline() {
  const supabase = useMemo(() => createClient(), [])
  const { tenant } = useTenantContext()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!tenant?.id) return
    // Solo los futuros: un pedido de la semana pasada que nadie confirmó ya no
    // se puede resolver, y avisarlo es ruido.
    const { data } = await supabase
      .from('citas')
      .select('id, fecha_hora, tipo_tratamiento, sena, notas, pacientes(nombre, telefono)')
      .eq('tenant_id', tenant.id)
      .eq('origen', 'online')
      .eq('estado', 'pendiente')
      .gte('fecha_hora', new Date().toISOString())
      .order('fecha_hora')
      .limit(5)

    setPedidos((data as any) || [])
  }, [tenant?.id, supabase])

  useEffect(() => {
    cargar()
    // El consultorio suele dejar la pantalla abierta todo el día.
    const id = setInterval(cargar, 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [cargar])

  async function confirmar(citaId: string) {
    setConfirmando(citaId)
    const { error } = await supabase.from('citas').update({ estado: 'confirmado' }).eq('id', citaId)
    setConfirmando(null)
    if (!error) setPedidos(p => p.filter(x => x.id !== citaId))
  }

  if (pedidos.length === 0) return null

  return (
    <div style={{ background: '#FFF3CD', border: '1px solid #ffe08a', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>🔔</span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: '#633806' }}>
          {pedidos.length === 1
            ? 'Un paciente pidió turno por la web'
            : `${pedidos.length} pacientes pidieron turno por la web`}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pedidos.map(p => (
          <div
            key={p.id}
            style={{
              background: 'rgba(255,255,255,0.75)', borderRadius: 10, padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1e2b' }}>
                {p.pacientes?.nombre || 'Paciente sin nombre'}
              </div>
              <div style={{ fontSize: 12.5, color: '#856404', marginTop: 2 }}>
                {cuando(p.fecha_hora)} · {p.tipo_tratamiento}
                {p.pacientes?.telefono ? ` · ${p.pacientes.telefono}` : ''}
              </div>
              {p.sena && p.sena > 0 && (
                <div style={{ fontSize: 11.5, color: '#856404', marginTop: 2 }}>
                  Debe abonar ${Number(p.sena).toLocaleString('es-AR')} de seña
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {p.pacientes?.telefono && (
                <a
                  href={`https://wa.me/${p.pacientes.telefono.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #ffe08a', color: '#633806', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  WhatsApp
                </a>
              )}
              <button
                onClick={() => confirmar(p.id)}
                disabled={confirmando === p.id}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none', background: '#138A6B', color: '#fff',
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  opacity: confirmando === p.id ? 0.6 : 1,
                }}
              >
                {confirmando === p.id ? 'Confirmando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/agenda"
        style={{ display: 'inline-block', marginTop: 10, fontSize: 12.5, fontWeight: 700, color: '#633806', textDecoration: 'none' }}
      >
        Ver todo en la agenda →
      </Link>
    </div>
  )
}
