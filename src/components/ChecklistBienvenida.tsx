'use client'

// ─────────────────────────────────────────────────────────────
// Primeros pasos de una clínica nueva.
//
// Al terminar el registro, el consultorio caía en un dashboard vacío: sin
// pacientes, sin turnos y sin ninguna indicación de por dónde empezar. El
// wizard ya mandaba a /dashboard?welcome=true, pero nadie leía ese parámetro.
//
// Los pasos se calculan mirando los datos reales, no una lista guardada: si la
// clínica ya cargó sus tratamientos, ese paso aparece cumplido aunque lo haya
// hecho antes de ver esto. Cuando están los tres, el bloque desaparece solo y
// no vuelve nunca.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'

interface Paso {
  id: string
  titulo: string
  detalle: string
  href: string
  cta: string
  hecho: boolean
}

const OCULTAR = 'checklist_bienvenida_oculto'

export function ChecklistBienvenida() {
  const supabase = useMemo(() => createClient(), [])
  const { tenant } = useTenantContext()
  const [pasos, setPasos] = useState<Paso[] | null>(null)
  const [oculto, setOculto] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOculto(localStorage.getItem(OCULTAR) === '1')
    }
  }, [])

  useEffect(() => {
    if (!tenant?.id || oculto) return
    let vigente = true

    async function medir() {
      const [tratamientos, pacientes, citas] = await Promise.all([
        supabase.from('tratamientos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id),
        supabase.from('pacientes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id),
        supabase.from('citas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant!.id),
      ])
      if (!vigente) return

      // El perfil se da por completo cuando tiene lo que sale en los mails y en
      // el portal del paciente: dirección y teléfono.
      const perfilListo = !!(tenant!.direccion && tenant!.telefono)

      setPasos([
        {
          id: 'perfil',
          titulo: 'Completá los datos del consultorio',
          detalle: 'Dirección, teléfono y logo. Es lo que ven tus pacientes en los mails y en el portal.',
          href: '/configuracion',
          cta: 'Ir a Configuración',
          hecho: perfilListo,
        },
        {
          id: 'tratamientos',
          titulo: 'Cargá tus tratamientos y precios',
          detalle: 'Definen la duración de cada turno y el monto que se cobra.',
          href: '/admin/tratamientos',
          cta: 'Cargar tratamientos',
          hecho: (tratamientos.count ?? 0) > 0,
        },
        {
          id: 'primer-turno',
          titulo: 'Agendá tu primer turno',
          detalle: (pacientes.count ?? 0) > 0
            ? 'Ya tenés pacientes cargados. Agendales el primer turno desde la agenda.'
            : 'Cargá un paciente y agendale un turno para ver el sistema funcionando.',
          href: '/agenda',
          cta: 'Ir a la agenda',
          hecho: (citas.count ?? 0) > 0,
        },
      ])
    }

    medir()
    return () => { vigente = false }
  }, [tenant?.id, tenant?.direccion, tenant?.telefono, oculto, supabase])

  if (oculto || !pasos) return null

  const completos = pasos.filter(p => p.hecho).length

  // Todo listo: se guarda para no volver a consultarlo en cada carga.
  if (completos === pasos.length) {
    if (typeof window !== 'undefined') localStorage.setItem(OCULTAR, '1')
    return null
  }

  const acento = tenant?.accentColor || '#138A6B'

  function ocultar() {
    localStorage.setItem(OCULTAR, '1')
    setOculto(true)
  }

  return (
    <div className="glass-card" style={{ padding: 0, marginBottom: 18, overflow: 'hidden', borderLeft: `3px solid ${acento}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 18px 13px', borderBottom: '1px solid var(--border-light, #eef2f7)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-dark, #0a1e3d)' }}>
            Primeros pasos
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted, #8fa3bc)', marginTop: 2 }}>
            {completos} de {pasos.length} listos · dejá el consultorio andando en unos minutos
          </div>
        </div>
        <button
          onClick={ocultar}
          title="No mostrar más"
          style={{ background: 'none', border: 'none', color: '#8fa3bc', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
        >
          Ocultar
        </button>
      </div>

      <div>
        {pasos.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 13, padding: '13px 18px', flexWrap: 'wrap',
              borderTop: i === 0 ? 'none' : '1px solid var(--border-light, #f1f5f9)',
              opacity: p.hecho ? 0.55 : 1,
            }}
          >
            <span style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              background: p.hecho ? acento : 'transparent',
              border: p.hecho ? 'none' : '2px solid var(--border-color, #dde5ef)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800,
            }}>
              {p.hecho ? '✓' : ''}
            </span>

            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: 'var(--text-dark, #0a1e3d)',
                textDecoration: p.hecho ? 'line-through' : 'none',
              }}>
                {p.titulo}
              </div>
              {!p.hecho && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted, #8fa3bc)', marginTop: 2, lineHeight: 1.45 }}>
                  {p.detalle}
                </div>
              )}
            </div>

            {!p.hecho && (
              <Link
                href={p.href}
                className="btn-premium"
                style={{
                  padding: '8px 15px', borderRadius: 9, background: acento, color: '#fff',
                  fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 'auto',
                }}
              >
                {p.cta}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
