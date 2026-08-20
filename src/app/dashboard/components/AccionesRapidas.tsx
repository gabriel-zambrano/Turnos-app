'use client'

// ─────────────────────────────────────────────────────────────
// Acciones rápidas del dashboard.
//
// Las cuatro cosas que el consultorio hace todo el día: agendar, dar de alta un
// paciente, registrar un cobro y abrir la agenda. Antes eran cuatro bloques de
// JSX casi idénticos copiados uno debajo del otro; ahora la forma del botón
// está escrita una sola vez.
// ─────────────────────────────────────────────────────────────

import Link from 'next/link'
import { useState } from 'react'
import { useBloqueoScroll } from '@/components/UI'

interface Props {
  primaryColor: string
  secondaryColor: string
  accentColor: string
  onAgendarTurno: () => void
  onNuevoPaciente: () => void
  onRegistrarCobro: () => void
  /**
   * `tarjeta` es el bloque de siempre, para escritorio.
   *
   * `flotante` es para el celular: la tarjeta ocupaba una pantalla entera
   * para cuatro botones y empujaba las citas del día muy abajo. Pasa a ser
   * un botón flotante al alcance del pulgar, que despliega las mismas
   * acciones en una hoja inferior.
   */
  modo?: 'tarjeta' | 'flotante'
}

/** Alto de la barra de navegación flotante (16px de margen + 66px). */
const ALTO_NAV_MOVIL = 82

function estiloBoton(color: string, fondo?: string, borde?: string): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 4px',
    borderRadius: 12,
    background: fondo ?? `${color}10`,
    border: borde ?? `1px solid ${color}25`,
    color,
    cursor: 'pointer',
    height: '100%',
    boxSizing: 'border-box',
    textAlign: 'center',
    gap: 6,
  }
}

function Accion({
  etiqueta,
  descripcion,
  color,
  onClick,
  href,
  fondo,
  borde,
  children,
}: {
  etiqueta: string
  descripcion?: string
  color: string
  onClick?: () => void
  href?: string
  fondo?: string
  borde?: string
  children: React.ReactNode
}) {
  const contenido = (
    <div className="quick-action-btn" style={{
      ...estiloBoton(color, fondo, borde),
      padding: descripcion ? '12px 6px' : '8px 4px',
    }}>
      {children}
      <span style={{ fontSize: 10.5, fontWeight: 700 }}>{etiqueta}</span>
      {descripcion && (
        <span style={{ fontSize: 8.5, opacity: 0.7, fontWeight: 500, display: 'block', marginTop: 2, lineHeight: 1.2 }}>
          {descripcion}
        </span>
      )}
    </div>
  )

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none' }}>{contenido}</Link>
  }

  return (
    <button
      onClick={onClick}
      style={{ background: 'none', border: 'none', padding: 0, width: '100%', cursor: 'pointer', textAlign: 'inherit' }}
    >
      {contenido}
    </button>
  )
}

const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Los iconos, definidos una sola vez para las dos presentaciones. */
const ICONOS = {
  agendar: (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="14" x2="12" y2="20" /><line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  ),
  paciente: (
    <svg {...svgProps}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" />
    </svg>
  ),
  cobro: (
    <svg {...svgProps}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  agenda: (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
}

/**
 * Botón flotante para el celular. Vive encima de la barra de navegación,
 * en la zona donde llega el pulgar sin reacomodar la mano.
 */
function AccionesFlotantes({ primaryColor, secondaryColor, accentColor, onAgendarTurno, onNuevoPaciente, onRegistrarCobro }: Props) {
  const [abierto, setAbierto] = useState(false)
  useBloqueoScroll(abierto)

  const acciones = [
    { etiqueta: 'Agendar turno', color: secondaryColor, icono: ICONOS.agendar, onClick: onAgendarTurno },
    { etiqueta: 'Nuevo paciente', color: primaryColor, icono: ICONOS.paciente, onClick: onNuevoPaciente },
    { etiqueta: 'Registrar cobro', color: accentColor, icono: ICONOS.cobro, onClick: onRegistrarCobro },
  ]

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        aria-label="Acciones rápidas"
        style={{
          position: 'fixed', right: 20, bottom: ALTO_NAV_MOVIL + 16, zIndex: 999,
          width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
          color: '#fff', fontSize: 30, fontWeight: 300, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(10,30,61,0.28)',
          transition: 'transform 0.15s ease',
        }}
      >
        <span style={{ marginTop: -3 }}>+</span>
      </button>

      {abierto && (
        <div
          onClick={() => setAbierto(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(10,30,61,0.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: 'var(--bg-modal, #fff)',
              borderRadius: '20px 20px 0 0', padding: '1.25rem 1.25rem 1.75rem',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--border-color, #e2e8f0)', margin: '0 auto 1.25rem' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {acciones.map(a => (
                <button
                  key={a.etiqueta}
                  onClick={() => { setAbierto(false); a.onClick() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                    padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                    background: `${a.color}10`, border: `1px solid ${a.color}25`,
                    color: a.color, fontSize: 14.5, fontWeight: 700,
                    fontFamily: 'DM Sans, sans-serif', textAlign: 'left',
                  }}
                >
                  {a.icono}
                  {a.etiqueta}
                </button>
              ))}

              <Link
                href="/agenda"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '14px 16px', borderRadius: 12, textDecoration: 'none',
                  background: '#f0f4f8', border: '1px solid #dde5ef',
                  color: '#687e96', fontSize: 14.5, fontWeight: 700,
                  boxSizing: 'border-box',
                }}
              >
                {ICONOS.agenda}
                Ver agenda
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function AccionesRapidas(props: Props) {
  const {
    primaryColor,
    secondaryColor,
    accentColor,
    onAgendarTurno,
    onNuevoPaciente,
    onRegistrarCobro,
    modo = 'tarjeta',
  } = props

  if (modo === 'flotante') return <AccionesFlotantes {...props} />

  return (
    <div className="glass-container" style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7a8f9d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Acciones Rápidas
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>

        <Accion etiqueta="Agendar Turno" descripcion="Citas en agenda" color={secondaryColor} onClick={onAgendarTurno}>
          <svg {...svgProps}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="12" y1="14" x2="12" y2="20" />
            <line x1="9" y1="17" x2="15" y2="17" />
          </svg>
        </Accion>

        <Accion etiqueta="Nuevo Paciente" descripcion="Alta en base" color={primaryColor} onClick={onNuevoPaciente}>
          <svg {...svgProps}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="16" y1="11" x2="22" y2="11" />
          </svg>
        </Accion>

        <Accion etiqueta="Registrar Cobro" descripcion="Ingresos y facturas" color={accentColor} onClick={onRegistrarCobro}>
          <svg {...svgProps}>
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </Accion>

        <Accion etiqueta="Ver Agenda" descripcion="Calendario completo" color="#687e96" href="/agenda" fondo="#f0f4f8" borde="1px solid #dde5ef">
          <svg {...svgProps}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </Accion>

      </div>
    </div>
  )
}
