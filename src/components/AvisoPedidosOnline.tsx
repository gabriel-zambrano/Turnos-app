'use client'

// ─────────────────────────────────────────────────────────────
// Turnos pedidos por el link público que siguen sin confirmar.
//
// El turno online entra como 'pendiente' y ahí se queda hasta que alguien del
// consultorio lo mire. Un contador no alcanza: para decidir hay que ver quién
// pidió y para cuándo, así que se listan y se pueden resolver desde acá mismo.
//
// Estética: no es una alerta de error, es trabajo pendiente. Por eso una
// tarjeta clara con un borde de acento en vez de un bloque amarillo, que
// competía con el resto del panel y cansaba la vista.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'
import { initials, AVATAR_COLORS } from '@/lib/constants'

interface Pedido {
  id: string
  fecha_hora: string
  tipo_tratamiento: string
  sena: number | null
  pacientes: { nombre: string; telefono: string } | null
}

const TZ = 'America/Argentina/Buenos_Aires'

/** "mar 28 jul" — el día, para la columna de la izquierda. */
function diaCorto(fechaHora: string): string {
  return new Date(fechaHora)
    .toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })
    .replace(/\./g, '')
}

function horaCorta(fechaHora: string): string {
  return new Date(fechaHora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

export function AvisoPedidosOnline() {
  const supabase = useMemo(() => createClient(), [])
  const { tenant } = useTenantContext()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [saliendo, setSaliendo] = useState<string | null>(null)

  const acento = tenant?.accentColor || '#138A6B'

  const cargar = useCallback(async () => {
    if (!tenant?.id) return
    // Solo los futuros: un pedido de la semana pasada que nadie confirmó ya no
    // se puede resolver, y avisarlo es ruido.
    const { data } = await supabase
      .from('citas')
      .select('id, fecha_hora, tipo_tratamiento, sena, pacientes(nombre, telefono)')
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
    if (error) return
    // Se desvanece antes de desaparecer: el salto seco hace dudar de si se
    // confirmó el turno correcto.
    setSaliendo(citaId)
    setTimeout(() => {
      setPedidos(p => p.filter(x => x.id !== citaId))
      setSaliendo(null)
    }, 260)
  }

  if (pedidos.length === 0) return null

  return (
    <div
      className="glass-card"
      style={{
        padding: 0,
        marginBottom: 18,
        overflow: 'hidden',
        borderLeft: `3px solid ${acento}`,
      }}
    >
      {/* Encabezado */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '14px 18px 12px',
        borderBottom: '1px solid var(--border-light, #eef2f7)',
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: `${acento}18`, color: acento,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark, #0a1e3d)', lineHeight: 1.3 }}>
            Turnos pedidos desde la web
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #8fa3bc)', marginTop: 1 }}>
            Esperan tu confirmación
          </div>
        </div>

        <span style={{
          background: acento, color: '#fff', fontSize: 12, fontWeight: 800,
          minWidth: 22, height: 22, borderRadius: 11, padding: '0 7px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {pedidos.length}
        </span>
      </div>

      {/* Pedidos */}
      <div>
        {pedidos.map((p, i) => {
          const nombre = p.pacientes?.nombre || 'Paciente sin nombre'
          const color = AVATAR_COLORS[i % AVATAR_COLORS.length]
          const tel = p.pacientes?.telefono
          const yendose = saliendo === p.id

          return (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap',
                padding: '13px 18px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border-light, #f1f5f9)',
                opacity: yendose ? 0 : 1,
                transform: yendose ? 'translateX(10px)' : 'none',
                transition: 'opacity .25s ease, transform .25s ease',
              }}
            >
              {/* Cuándo */}
              <div style={{
                flexShrink: 0, textAlign: 'center', minWidth: 62,
                background: `${acento}0f`, borderRadius: 10, padding: '7px 9px',
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: acento, lineHeight: 1.1 }}>
                  {horaCorta(p.fecha_hora)}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted, #8fa3bc)', textTransform: 'capitalize', marginTop: 2 }}>
                  {diaCorto(p.fecha_hora)}
                </div>
              </div>

              {/* Quién */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 170 }}>
                <span style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: color, color: '#fff',
                  fontSize: 11.5, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {initials(nombre)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: 'var(--text-dark, #0a1e3d)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {nombre}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted, #8fa3bc)', marginTop: 1 }}>
                    {p.tipo_tratamiento}
                    {p.sena && p.sena > 0 && (
                      <> · <span style={{ color: '#B45309', fontWeight: 600 }}>
                        seña ${Number(p.sena).toLocaleString('es-AR')}
                      </span></>
                    )}
                  </div>
                </div>
              </div>

              {/* Qué hacer */}
              <div style={{ display: 'flex', gap: 7, marginLeft: 'auto' }}>
                {tel && (
                  <a
                    href={`https://wa.me/${tel.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    title={`Escribirle a ${nombre}`}
                    className="btn-premium"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 34, height: 34, borderRadius: 9,
                      border: '1px solid var(--border-color, #dde5ef)',
                      color: '#25D366', textDecoration: 'none', flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.7 1-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.2-.6-.4M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2" />
                    </svg>
                  </a>
                )}
                <button
                  onClick={() => confirmar(p.id)}
                  disabled={confirmando === p.id}
                  className="btn-premium"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 34, padding: '0 14px', borderRadius: 9, border: 'none',
                    background: acento, color: '#fff',
                    fontSize: 13, fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
                    cursor: confirmando === p.id ? 'default' : 'pointer',
                    opacity: confirmando === p.id ? 0.65 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {confirmando === p.id ? 'Confirmando…' : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Confirmar
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <Link
        href="/agenda"
        style={{
          display: 'block', padding: '11px 18px',
          borderTop: '1px solid var(--border-light, #f1f5f9)',
          fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted, #8fa3bc)',
          textDecoration: 'none',
        }}
      >
        Ver todo en la agenda →
      </Link>
    </div>
  )
}
