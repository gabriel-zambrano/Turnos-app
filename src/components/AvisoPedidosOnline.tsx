'use client'

// ─────────────────────────────────────────────────────────────
// Aviso de turnos pedidos por el link público que siguen sin confirmar.
//
// El turno online entra como 'pendiente' y ahí se queda hasta que alguien del
// consultorio lo mire. Si nadie avisa, el paciente queda esperando y el turno
// se pierde. Esta barra aparece en el dashboard y en la agenda mientras haya
// pedidos sin resolver.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'

export function AvisoPedidosOnline() {
  const supabase = useMemo(() => createClient(), [])
  const { tenant } = useTenantContext()
  const [cantidad, setCantidad] = useState(0)

  useEffect(() => {
    if (!tenant?.id) return
    let vigente = true

    async function contar() {
      // Solo los que todavía no pasaron: un pedido de la semana pasada que
      // nadie confirmó ya no se puede resolver, y avisarlo es solo ruido.
      const { count } = await supabase
        .from('citas')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant!.id)
        .eq('origen', 'online')
        .eq('estado', 'pendiente')
        .gte('fecha_hora', new Date().toISOString())

      if (vigente) setCantidad(count ?? 0)
    }

    contar()
    // Refresco suave: el consultorio suele dejar la pantalla abierta todo el día.
    const id = setInterval(contar, 2 * 60 * 1000)
    return () => { vigente = false; clearInterval(id) }
  }, [tenant?.id, supabase])

  if (cantidad === 0) return null

  return (
    <Link
      href="/agenda"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
        background: '#FFF3CD', border: '1px solid #ffe08a', borderRadius: 12,
        padding: '12px 16px', marginBottom: 16,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>🔔</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#633806' }}>
          {cantidad === 1
            ? 'Tenés 1 turno pedido por la web sin confirmar'
            : `Tenés ${cantidad} turnos pedidos por la web sin confirmar`}
        </div>
        <div style={{ fontSize: 12.5, color: '#856404', marginTop: 2 }}>
          El paciente está esperando tu confirmación.
        </div>
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#633806', whiteSpace: 'nowrap' }}>
        Ver agenda →
      </span>
    </Link>
  )
}
