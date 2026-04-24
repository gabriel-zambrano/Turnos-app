'use client'
import React, { useEffect, useState } from 'react'

export const DARK = '#0a1e3d'
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
  padding: '0.75rem 0.85rem', minHeight: 44, border: '1px solid #dde5ef', borderRadius: 10,
  fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: '#0a1e3d',
  background: 'rgba(255,255,255,0.8)', outline: 'none', width: '100%',
}
export const selectCss: React.CSSProperties = { ...inputCss }
export const textareaCss: React.CSSProperties = { ...inputCss, resize: 'vertical', minHeight: 80 }
export const overlayCss = (isMobile = false): React.CSSProperties => ({
  position: 'fixed', inset: 0, background: 'rgba(10,30,61,0.45)', zIndex: 200,
  display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
  padding: isMobile ? 0 : '1rem', backdropFilter: 'blur(4px)',
})
export const modalCss = (isMobile = false): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)',
  borderRadius: isMobile ? '20px 20px 0 0' : 16, padding: '1.75rem',
  width: '100%', maxWidth: isMobile ? '100vw' : 540, maxHeight: isMobile ? '90dvh' : '90vh', overflowY: 'auto',
  border: '1px solid rgba(56,138,221,0.2)',
})
export const modalTitleCss: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: DARK, marginBottom: '1.25rem' }
export const footerCss: React.CSSProperties = { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }
export const groupCss: React.CSSProperties = { marginBottom: '0.85rem' }
export const labelCss: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#4a6080', display: 'block', marginBottom: 5 }
export const grid2Css: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }
export const btnDarkCss: React.CSSProperties = { minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.55rem 1.1rem', borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg, #0a1e3d, #185FA5)', color: '#fff', fontFamily: 'DM Sans, sans-serif' }
export const btnLightCss: React.CSSProperties = { minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.55rem 1.1rem', borderRadius: 9, fontSize: 13.5, fontWeight: 500, cursor: 'pointer', border: '1px solid #dde5ef', background: 'rgba(255,255,255,0.8)', color: '#4a6080', fontFamily: 'DM Sans, sans-serif' }
export const btnRedCss: React.CSSProperties = { minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.55rem 1.1rem', borderRadius: 9, fontSize: 13.5, fontWeight: 500, cursor: 'pointer', border: 'none', background: '#D85A30', color: '#fff', fontFamily: 'DM Sans, sans-serif' }

export function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 6, background: bg, color, whiteSpace: 'nowrap' }}>{children}</span>
}

export function Toast({ msg, tipo, isMobile }: { msg: string; tipo: string; isMobile?: boolean }) {
  return <div style={{ position: 'fixed', bottom: isMobile ? 80 : 24, left: '50%', transform: 'translateX(-50%)', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 999, background: tipo === 'ok' ? 'linear-gradient(135deg,#0a1e3d,#185FA5)' : '#D85A30', color: '#fff', whiteSpace: 'nowrap', boxShadow: '0 4px 24px rgba(24,95,165,0.25)' }}>{msg}</div>
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

export function MetricCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className="glass-card" style={{ padding: '1rem 1.1rem', minWidth: 0 }}>
      <div style={{ height: 3, borderRadius: 2, background: accent, marginBottom: 10 }}/>
      <div style={{ fontSize: 10, color: '#8fa3bc', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: DARK, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aab8c8', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const isMobile = useIsMobile()
  return (
    <div style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(56,138,221,0.12)', padding: isMobile ? '0 1rem' : '0 2rem', minHeight: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, color: DARK }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: '#8fa3bc', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  )
}

export function FilterBar({ options, active, onChange }: { options: { k: string; l: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button key={o.k} onClick={() => onChange(o.k)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 500, fontFamily: 'DM Sans, sans-serif', border: active === o.k ? '1px solid rgba(56,138,221,0.35)' : '1px solid #dde5ef', background: active === o.k ? 'linear-gradient(135deg,#e8f0fc,#dbeeff)' : 'rgba(255,255,255,0.8)', color: active === o.k ? BLUE : '#8fa3bc' }}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

export function BtnPrimary({ onClick, children, disabled }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <button disabled={disabled} onClick={onClick} style={{ ...btnDarkCss, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>{children}</button>
}

export function BtnSm({ onClick, variant, children }: { onClick?: () => void; variant: 'edit' | 'delete'; children: React.ReactNode }) {
  const s = variant === 'edit'
    ? { border: '1px solid #dde5ef', background: 'rgba(255,255,255,0.8)', color: '#4a6080' }
    : { border: '1px solid rgba(216,90,48,0.25)', background: '#faece7', color: '#D85A30' }
  return <button onClick={onClick} style={{ ...s, padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>{children}</button>
}

export function DataTable({ headers, empty, emptyMsg = 'Sin resultados', children }: { headers: string[]; empty: boolean; emptyMsg?: string; children?: React.ReactNode }) {
  return (
    <div className="glass-card" style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'linear-gradient(135deg,rgba(232,240,252,0.8),rgba(219,238,255,0.6))' }}>
              {headers.map((h, i) => <th key={h} style={{ fontSize: 11, fontWeight: 600, color: BLUE, letterSpacing: '0.06em', textTransform: 'uppercase', padding: i === 0 ? '0.75rem 1rem 0.75rem 1.5rem' : '0.75rem 1rem', textAlign: 'left', borderBottom: '1px solid rgba(56,138,221,0.12)', whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>{empty ? <tr><td colSpan={headers.length} style={{ textAlign: 'center', color: '#aab8c8', padding: '2.5rem', fontSize: 13 }}>{emptyMsg}</td></tr> : children}</tbody>
        </table>
      </div>
    </div>
  )
}

export function TR({ children }: { children: React.ReactNode }) {
  return <tr style={{ borderBottom: '1px solid rgba(56,138,221,0.06)' }}>{children}</tr>
}

export function TD({ children, first, muted }: { children?: React.ReactNode; first?: boolean; muted?: boolean }) {
  return <td style={{ padding: first ? '0.9rem 1rem 0.9rem 1.5rem' : '0.9rem 1rem', fontSize: 13.5, color: muted ? '#8fa3bc' : DARK, verticalAlign: 'middle' }}>{children}</td>
}
