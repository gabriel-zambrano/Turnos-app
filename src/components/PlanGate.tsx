'use client'

// ─────────────────────────────────────────────────────────────
// Cartel de "esta función no está en tu plan".
//
// Se muestra en lugar del módulo cuando la clínica no tiene la feature
// habilitada. No es un candado hostil: explica qué incluye y lleva a la página
// de precios, que es donde se decide el upgrade.
// ─────────────────────────────────────────────────────────────

import Link from 'next/link'

interface PlanGateProps {
  emoji: string
  titulo: string
  descripcion: string
  incluye: string[]
  /** Plan mínimo que habilita la función, para nombrarlo en el CTA. */
  planSugerido: string
}

export function PlanGate({ emoji, titulo, descripcion, incluye, planSugerido }: PlanGateProps) {
  return (
    <div style={{
      maxWidth: 480,
      width: '100%',
      margin: '0 auto',
      background: 'rgba(255, 255, 255, 0.7)',
      backdropFilter: 'blur(20px)',
      borderRadius: 24,
      padding: '3rem 2rem',
      border: '1px solid rgba(255, 255, 255, 0.8)',
      boxShadow: '0 10px 40px rgba(15,30,43,0.06)',
      textAlign: 'center'
    }}>
      <div style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 36,
        margin: '0 auto 1.5rem',
        boxShadow: '0 8px 16px rgba(99,102,241,0.1)'
      }}>
        {emoji}
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f1e2b', marginBottom: '0.75rem' }}>{titulo}</h2>
      <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5, marginBottom: '2rem' }}>{descripcion}</p>

      <div style={{
        background: '#f8fafc',
        borderRadius: 16,
        padding: '1.25rem',
        textAlign: 'left',
        marginBottom: '2rem',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
          Qué incluye
        </div>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 13, color: '#475569', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {incluye.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      </div>

      <Link
        href="/precios"
        style={{
          display: 'block',
          width: '100%',
          background: '#0f1e2b',
          color: '#fff',
          padding: '12px',
          borderRadius: 12,
          fontWeight: 700,
          fontSize: 14,
          textDecoration: 'none'
        }}
      >
        Ver plan {planSugerido}
      </Link>
    </div>
  )
}
