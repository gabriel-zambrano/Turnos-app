'use client'
import React from 'react'

// ── Tokens ────────────────────────────────────────
export const DARK = '#0f1e2b'

// ── Shared styles ─────────────────────────────────
export const inputCss: React.CSSProperties = {
  padding: '0.6rem 0.85rem',
  border: '0.5px solid #ddd',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'DM Sans, sans-serif',
  color: '#1a1a1a',
  background: '#fff',
  outline: 'none',
  width: '100%',
}
export const selectCss: React.CSSProperties = { ...inputCss }
export const textareaCss: React.CSSProperties = { ...inputCss, resize: 'vertical', minHeight: 80 }

// ── Modal ─────────────────────────────────────────
export const overlayCss: React.CSSProperties = {
  position: 'fixed', inset: 0, // @ts-ignore
  'data-overlay': '',
  background: 'rgba(15,30,43,0.5)',
  zIndex: 200,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '1rem',
}
export const modalCss: React.CSSProperties = {
  background: '#fff', borderRadius: 16, padding: '1.75rem',
  width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto',
}
export const modalTitleCss: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: DARK, marginBottom: '1.25rem' }
export const footerCss: React.CSSProperties = { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }
export const groupCss: React.CSSProperties = { marginBottom: '0.85rem' }
export const labelCss: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 5 }
export const grid2Css: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }

// ── Button styles ─────────────────────────────────
export const btnDarkCss: React.CSSProperties  = { padding: '0.55rem 1.1rem', borderRadius: 8, fontSize: 13.5, fontWeight: 500, cursor: 'pointer', border: 'none', background: DARK, color: '#fff', fontFamily: 'DM Sans, sans-serif' }
export const btnLightCss: React.CSSProperties = { padding: '0.55rem 1.1rem', borderRadius: 8, fontSize: 13.5, fontWeight: 500, cursor: 'pointer', border: '0.5px solid #ddd', background: 'transparent', color: '#666', fontFamily: 'DM Sans, sans-serif' }
export const btnRedCss: React.CSSProperties   = { padding: '0.55rem 1.1rem', borderRadius: 8, fontSize: 13.5, fontWeight: 500, cursor: 'pointer', border: 'none', background: '#D85A30', color: '#fff', fontFamily: 'DM Sans, sans-serif' }

// ── Components ────────────────────────────────────

export function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 6, background: bg, color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export function Toast({ msg, tipo }: { msg: string; tipo: string }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 999, background: tipo === 'ok' ? DARK : '#D85A30', color: '#fff', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
      {msg}
    </div>
  )
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#aaa', fontSize: 14 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite', marginRight: 8 }}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Cargando...
    </div>
  )
}

export function MetricCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e8e8', borderRadius: 16, padding: '1.1rem 1.3rem', flex: 1, minWidth: 130, borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: DARK, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e5', padding: '0 2rem', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: DARK }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: '#aaa', textTransform: 'capitalize' }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function FilterBar({ options, active, onChange }: { options: { k: string; l: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
      {options.map(o => (
        <button key={o.k} onClick={() => onChange(o.k)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 500, fontFamily: 'DM Sans, sans-serif', border: active === o.k ? `1.5px solid ${DARK}` : '0.5px solid #ddd', background: active === o.k ? DARK : '#fff', color: active === o.k ? '#fff' : '#666' }}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

export function BtnPrimary({ onClick, children, disabled }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{ ...btnDarkCss, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {children}
    </button>
  )
}

export function BtnSm({ onClick, variant, children }: { onClick?: () => void; variant: 'edit' | 'delete'; children: React.ReactNode }) {
  const s = variant === 'edit'
    ? { border: '0.5px solid #ddd', background: '#fff', color: '#444' }
    : { border: '0.5px solid #f5c4b3', background: '#FAECE7', color: '#D85A30' }
  return (
    <button onClick={onClick} style={{ ...s, padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
      {children}
    </button>
  )
}

export function DataTable({ headers, empty, emptyMsg = 'Sin resultados', children }: { headers: string[]; empty: boolean; emptyMsg?: string; children?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e8e8', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={h} style={{ fontSize: 11, fontWeight: 600, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase', padding: i === 0 ? '0.75rem 1rem 0.75rem 1.5rem' : '0.75rem 1rem', textAlign: 'left', borderBottom: '0.5px solid #eee' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empty
              ? <tr><td colSpan={headers.length} style={{ textAlign: 'center', color: '#ccc', padding: '2.5rem', fontSize: 13 }}>{emptyMsg}</td></tr>
              : children
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function TR({ children }: { children: React.ReactNode }) {
  return <tr style={{ borderBottom: '0.5px solid #f5f5f5' }}>{children}</tr>
}

export function TD({ children, first, muted }: { children?: React.ReactNode; first?: boolean; muted?: boolean }) {
  return (
    <td style={{ padding: first ? '0.9rem 1rem 0.9rem 1.5rem' : '0.9rem 1rem', fontSize: 13.5, color: muted ? '#888' : '#1a1a1a', verticalAlign: 'middle' }}>
      {children}
    </td>
  )
}
