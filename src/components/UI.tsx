'use client'
import React, { useEffect, useState } from 'react'

export const DARK = 'var(--text-dark, #0a1e3d)'
export const BLUE = '#185FA5'
export const BLUE_LIGHT = '#378ADD'
 
export function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const check = () => setM(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return m
}
 
export const inputCss: React.CSSProperties = {
  padding: '0.65rem 0.85rem', minHeight: 40, border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 9,
  fontSize: 13.5, fontFamily: 'inherit', color: 'var(--text-dark, #0a1e3d)',
  background: 'var(--bg-input, #ffffff)', outline: 'none', width: '100%',
  boxShadow: '0 1px 2px rgba(10,30,61,0.02)',
}
export const selectCss: React.CSSProperties = { ...inputCss }
export const textareaCss: React.CSSProperties = { ...inputCss, resize: 'vertical', minHeight: 80 }
export const overlayCss = (isMobile = false): React.CSSProperties => ({
  position: 'fixed', inset: 0, background: 'var(--bg-overlay, rgba(10,25,47,0.45))', zIndex: 1100,
  display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
  padding: isMobile ? 0 : '1rem', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
})
export const modalCss = (isMobile = false): React.CSSProperties => ({
  background: 'var(--bg-modal, #ffffff)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
  borderRadius: isMobile ? '20px 20px 0 0' : 16, padding: '1.75rem',
  width: '100%', maxWidth: isMobile ? '100vw' : 540, maxHeight: isMobile ? '90dvh' : '90vh', overflowY: 'auto',
  border: '1px solid var(--border-light, rgba(15,30,61,0.08))',
  boxShadow: '0 20px 50px -10px rgba(10,30,61,0.22), 0 0 1px rgba(0,0,0,0.1)',
})
export const modalTitleCss: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: DARK, marginBottom: '1.25rem', letterSpacing: '-0.02em' }
export const footerCss: React.CSSProperties = { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }
export const groupCss: React.CSSProperties = { marginBottom: '0.85rem' }
export const labelCss: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted-darker, #4a6080)', display: 'block', marginBottom: 5, letterSpacing: '0.01em' }
/**
 * Grilla de dos columnas para formularios.
 *
 * `--grid-2` la define globals.css: dos columnas en escritorio, una sola
 * debajo de 768px. Va por variable CSS y no por JS para que la resuelva el
 * navegador, sin listener de `resize` ni parpadeo de hidratación.
 * El fallback `1fr 1fr` cubre el caso de que la variable no esté cargada.
 */
export const grid2Css: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'var(--grid-2, 1fr 1fr)', gap: '1rem' }
export const btnDarkCss: React.CSSProperties = { minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.55rem 1.15rem', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'linear-gradient(180deg, #185FA5 0%, #0a1e3d 100%)', color: '#fff', fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(10,30,61,0.15), inset 0 1px 0 rgba(255,255,255,0.18)', transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)' }
export const btnLightCss: React.CSSProperties = { minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.55rem 1.15rem', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color, #e2e8f0)', background: 'var(--bg-input, #ffffff)', color: 'var(--text-muted-darker, #4a6080)', fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)' }
export const btnRedCss: React.CSSProperties = { minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.55rem 1.15rem', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.05)', background: 'linear-gradient(180deg, #E05A32 0%, #B83A14 100%)', color: '#fff', fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(184, 58, 20, 0.2), inset 0 1px 0 rgba(255,255,255,0.2)', transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)' }

/**
 * Bloquea el scroll del fondo mientras hay un modal abierto.
 *
 * En el celular, al deslizar sobre un modal el fondo se movía por detrás y
 * se perdía la posición de la lista al cerrarlo.
 *
 * No alcanza con `overflow: hidden` en el body: Safari en iOS lo ignora.
 * Hay que fijar el body con `position: fixed` compensando el scroll actual
 * en `top`, y restaurar la posición al cerrar — si no, cerrar un modal te
 * manda al principio de la página.
 */
export function useBloqueoScroll(activo: boolean) {
  React.useEffect(() => {
    if (!activo) return

    const y = window.scrollY
    const previo = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    }

    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${y}px`
    document.body.style.width = '100%'

    return () => {
      document.body.style.overflow = previo.overflow
      document.body.style.position = previo.position
      document.body.style.top = previo.top
      document.body.style.width = previo.width
      window.scrollTo(0, y)
    }
  }, [activo])
}

export function Badge({ bg, color, dot = false, children }: { bg: string; color: string; dot?: boolean; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 11.5,
      fontWeight: 600,
      padding: '2.5px 8px',
      borderRadius: 6,
      background: bg,
      color,
      whiteSpace: 'nowrap',
      border: `1px solid ${color}20`,
      letterSpacing: '0.01em',
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />}
      {children}
    </span>
  )
}

/**
 * El aviso flotante de "guardado ✓".
 */
export function Toast({ msg, tipo }: { msg: string; tipo: string; isMobile?: boolean }) {
  const isOk = tipo === 'ok'
  return (
    <div className="app-toast dropdown-fade-in" style={{
      padding: '8px 16px',
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      zIndex: 2000,
      background: isOk ? '#0a1e3d' : '#991B1B',
      color: '#fff',
      whiteSpace: 'nowrap',
      boxShadow: '0 10px 25px rgba(10,30,61,0.2), 0 2px 6px rgba(0,0,0,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{ fontSize: 13 }}>{isOk ? '✓' : '⚠️'}</span>
      <span>{msg}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Skeletons
//
// Un spinner centrado deja la pantalla vacía y hace sentir la espera más larga
// de lo que es. El skeleton mantiene la forma de lo que se está por ver, así
// que la página no "salta" cuando llegan los datos.
// ─────────────────────────────────────────────────────────────

/** Bloque gris con pulso. Sirve para armar cualquier skeleton. */
export function SkeletonBox({ w = '100%', h = 16, r = 8, mb = 0 }: { w?: number | string; h?: number; r?: number; mb?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: w,
        height: h,
        borderRadius: r,
        marginBottom: mb,
        background: 'var(--border-light, #e6ecf4)',
        animation: 'skeleton-pulse 1.4s ease-in-out infinite',
      }}
    />
  )
}

/** Skeleton de una grilla de tarjetas de métricas (KPIs del dashboard). */
export function SkeletonKPIs({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="glass-card" style={{ padding: '1.25rem' }}>
          <SkeletonBox w="55%" h={11} mb={14} />
          <SkeletonBox w="70%" h={26} r={10} mb={10} />
          <SkeletonBox w="40%" h={10} />
        </div>
      ))}
    </div>
  )
}

/** Skeleton de un listado (turnos del día, pacientes, facturas). */
export function SkeletonLista({ filas = 5, conAvatar = true }: { filas?: number; conAvatar?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px' }}>
          {conAvatar && <SkeletonBox w={38} h={38} r={19} />}
          <div style={{ flex: 1 }}>
            {/* Ancho variable para que no parezca una tabla de Excel. */}
            <SkeletonBox w={`${52 + ((i * 13) % 26)}%`} h={13} mb={9} />
            <SkeletonBox w={`${30 + ((i * 9) % 18)}%`} h={10} />
          </div>
          <SkeletonBox w={64} h={22} r={11} />
        </div>
      ))}
    </div>
  )
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#8fa3bc', fontSize: 14 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite', marginRight: 8 }}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Cargando...
    </div>
  )
}

export function ProgressRing({ percentage, size = 38, strokeWidth = 3.5, color }: { percentage: number; size?: number; strokeWidth?: number; color: string }) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="var(--border-lighter, rgba(56, 138, 221, 0.06))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.35s ease' }}
        />
      </svg>
      <span style={{ position: 'absolute', fontSize: 9.5, fontWeight: 700, color: 'var(--text-dark, #0a1e3d)' }}>
        {percentage}%
      </span>
    </div>
  )
}

export function MetricCard({ label, value, sub, accent, right }: { label: string; value: string | number; sub?: string; accent: string; right?: React.ReactNode }) {
  return (
    <div className="glass-card" style={{ 
      padding: '1.2rem 1.35rem', 
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
      '--card-accent': accent,
      '--card-accent-alpha': `${accent}15`
    } as React.CSSProperties}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: `linear-gradient(90deg, ${accent}, ${accent}55)` }}/>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted-darker, #64748b)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 8 }}>{label}</div>
          <div className="kpi-numeral" style={{
            fontSize: 'clamp(22px, 5.2vw, 30px)',
            fontWeight: 700, color: DARK, lineHeight: 1.15, letterSpacing: '-0.03em',
            overflowWrap: 'anywhere',
          }}>{value}</div>
        </div>
        {right && <div style={{ flexShrink: 0, marginTop: 2 }}>{right}</div>}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted, #8fa3bc)', marginTop: 8, fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      background: 'var(--bg-header, rgba(255,255,255,0.90))',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-light, rgba(15,30,61,0.08))',
      padding: isMobile ? '0 1rem' : '0 2rem',
      minHeight: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      gap: 12
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: isMobile ? 15 : 16.5, fontWeight: 700, color: DARK, letterSpacing: '-0.02em' }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--text-muted, #8fa3bc)', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{sub}</div>}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  )
}
 
export function FilterBar({ options, active, onChange }: { options: { k: string; l: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div style={{
      display: 'inline-flex',
      gap: 3,
      padding: 3,
      background: 'rgba(15, 30, 61, 0.04)',
      borderRadius: 10,
      border: '1px solid var(--border-light, rgba(15,30,61,0.06))',
      flexWrap: 'wrap',
    }}>
      {options.map(o => {
        const isActive = active === o.k
        return (
          <button
            key={o.k}
            onClick={() => onChange(o.k)}
            style={{
              fontSize: 12.5,
              padding: '5px 13px',
              borderRadius: 7,
              cursor: 'pointer',
              fontWeight: isActive ? 600 : 500,
              fontFamily: 'inherit',
              border: 'none',
              background: isActive ? '#ffffff' : 'transparent',
              color: isActive ? DARK : 'var(--text-muted-darker, #64748b)',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08), 0 1px 1px rgba(0,0,0,0.04)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {o.l}
          </button>
        )
      })}
    </div>
  )
}

export function BtnPrimary({ onClick, children, disabled }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <button disabled={disabled} onClick={onClick} style={{ ...btnDarkCss, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>{children}</button>
}

export function BtnSm({ onClick, variant, children }: { onClick?: () => void; variant: 'edit' | 'delete'; children: React.ReactNode }) {
  const s = variant === 'edit'
    ? { border: '1px solid var(--border-color, #e2e8f0)', background: 'var(--bg-input, #ffffff)', color: 'var(--text-muted-darker, #4a6080)' }
    : { border: '1px solid rgba(216,90,48,0.25)', background: '#faece7', color: '#D85A30' }
  return <button onClick={onClick} style={{ ...s, padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, transition: 'all 0.15s ease' }}>{children}</button>
}

export function DataTable({ headers, empty, emptyMsg = 'Sin resultados', children }: { headers: string[]; empty: boolean; emptyMsg?: string; children?: React.ReactNode }) {
  return (
    <div className="glass-card" style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--table-header-bg, #f8fafc)' }}>
              {headers.map((h, i) => (
                <th
                  key={h}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-muted-darker, #4a6080)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: i === 0 ? '0.85rem 1rem 0.85rem 1.5rem' : '0.85rem 1rem',
                    textAlign: 'left',
                    borderBottom: '1px solid var(--border-light, rgba(15,30,61,0.08))',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{empty ? <tr><td colSpan={headers.length} style={{ textAlign: 'center', color: 'var(--text-muted, #aab8c8)', padding: '2.5rem', fontSize: 13 }}>{emptyMsg}</td></tr> : children}</tbody>
        </table>
      </div>
    </div>
  )
}

export function TR({ children }: { children: React.ReactNode }) {
  return <tr style={{ borderBottom: '1px solid var(--border-lighter, rgba(15,30,61,0.04))', transition: 'background-color 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(24,95,165,0.02)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>{children}</tr>
}

export function TD({ children, first, muted }: { children?: React.ReactNode; first?: boolean; muted?: boolean }) {
  return <td style={{ padding: first ? '0.85rem 1rem 0.85rem 1.5rem' : '0.85rem 1rem', fontSize: 13.5, color: muted ? 'var(--text-muted, #8fa3bc)' : DARK, verticalAlign: 'middle' }}>{children}</td>
}
