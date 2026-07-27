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

interface Props {
  primaryColor: string
  secondaryColor: string
  accentColor: string
  onAgendarTurno: () => void
  onNuevoPaciente: () => void
  onRegistrarCobro: () => void
}

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
  color,
  onClick,
  href,
  fondo,
  borde,
  children,
}: {
  etiqueta: string
  color: string
  onClick?: () => void
  href?: string
  fondo?: string
  borde?: string
  children: React.ReactNode
}) {
  const contenido = (
    <div className="quick-action-btn" style={estiloBoton(color, fondo, borde)}>
      {children}
      <span style={{ fontSize: 10.5, fontWeight: 700 }}>{etiqueta}</span>
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

export function AccionesRapidas({
  primaryColor,
  secondaryColor,
  accentColor,
  onAgendarTurno,
  onNuevoPaciente,
  onRegistrarCobro,
}: Props) {
  return (
    <div className="glass-container" style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7a8f9d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Acciones Rápidas
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>

        <Accion etiqueta="Agendar Turno" color={secondaryColor} onClick={onAgendarTurno}>
          <svg {...svgProps}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="12" y1="14" x2="12" y2="20" />
            <line x1="9" y1="17" x2="15" y2="17" />
          </svg>
        </Accion>

        <Accion etiqueta="Nuevo Paciente" color={primaryColor} onClick={onNuevoPaciente}>
          <svg {...svgProps}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="16" y1="11" x2="22" y2="11" />
          </svg>
        </Accion>

        <Accion etiqueta="Registrar Cobro" color={accentColor} onClick={onRegistrarCobro}>
          <svg {...svgProps}>
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </Accion>

        <Accion etiqueta="Ver Agenda" color="#687e96" href="/agenda" fondo="#f0f4f8" borde="1px solid #dde5ef">
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
