'use client'
import type { TenantBranding } from '@/components/TenantContext'
import { urlPublicaDeClinica } from '@/lib/config'

// Pestaña extraída de la Ficha del paciente (page.tsx) sin cambios de
// comportamiento: el JSX es el mismo; lo que usaba de la página llega por props.

export interface TabConsentimientosProps {
  consentimientos: any[]
  abrirModalConsent: () => void
  tenant: TenantBranding | null
  showMsg: (m: string, tipo?: string) => void
}

export function TabConsentimientos({ consentimientos, abrirModalConsent, tenant, showMsg }: TabConsentimientosProps) {
  return (
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 15, color: 'var(--text-dark, #0a1e3d)', fontWeight: 700, margin: 0 }}>Consentimientos informados</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Firma digital del paciente, presencial o por link.</p>
          </div>
          <button onClick={abrirModalConsent} style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--success)', color: 'var(--success-contrast)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            + Nuevo consentimiento
          </button>
        </div>

        {consentimientos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: 13 }}>
            Este paciente todavía no tiene consentimientos.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {consentimientos.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-light, rgba(56,138,221,0.12))' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {c.estado === 'firmado'
                      ? `Firmado ${c.firmado_en ? new Date(c.firmado_en).toLocaleDateString('es-AR') : ''} · ${c.contexto === 'remota' ? 'remoto' : 'presencial'}`
                      : 'Pendiente de firma'}
                  </div>
                </div>
                {c.estado === 'firmado' ? (
                  <span style={{ fontSize: 12.5, background: 'var(--success-soft)', color: 'var(--success-text)', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>Firmado</span>
                ) : (
                  <button
                    onClick={() => { const l = `${urlPublicaDeClinica(tenant)}/firmar/${c.token_firma}`; navigator.clipboard?.writeText(l); showMsg('Link copiado ✓') }}
                    style={{ fontSize: 12.5, padding: '4px 9px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}
                  >Copiar link</button>
                )}
                {c.estado === 'firmado' && (
                  <a href={`/api/consentimientos/pdf/${c.id}`} target="_blank" rel="noopener noreferrer" title="Ver PDF" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success-text)', textDecoration: 'none', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
  )
}
