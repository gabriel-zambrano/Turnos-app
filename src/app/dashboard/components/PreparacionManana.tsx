'use client'

// ─────────────────────────────────────────────────────────────
// Preparación para mañana.
//
// Cuántos turnos hay al día siguiente y el botón que dispara los recordatorios.
// Es lo último que mira el consultorio antes de cerrar.
// ─────────────────────────────────────────────────────────────

interface Props {
  cantidadTurnos: number
  enviando: boolean
  onEnviarRecordatorios: () => void
  primaryColor: string
  secondaryColor: string
}

export function PreparacionManana({
  cantidadTurnos,
  enviando,
  onEnviarRecordatorios,
  primaryColor,
  secondaryColor,
}: Props) {
  // Sin turnos no hay a quién avisarle, así que el botón queda inerte.
  const deshabilitado = enviando || cantidadTurnos === 0

  return (
    <div
      className="glass-container"
      style={{
        padding: '1.25rem 1.4rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
        color: '#fff',
        borderRadius: 16,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Preparación para mañana
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{cantidadTurnos}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>
          {cantidadTurnos === 1 ? 'turno agendado' : 'turnos agendados'} para el próximo día.
        </div>
      </div>

      <button
        onClick={onEnviarRecordatorios}
        disabled={deshabilitado}
        className="btn-premium"
        style={{
          marginTop: 12, width: '100%', padding: '0.75rem', borderRadius: 10, border: 'none',
          background: deshabilitado ? 'rgba(255,255,255,0.2)' : '#fff',
          color: deshabilitado ? 'rgba(255,255,255,0.5)' : primaryColor,
          fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, cursor: deshabilitado ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif',
        }}
      >
        {enviando
          ? <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>Enviando...</>
          : <>📧 Enviar recordatorios</>
        }
      </button>
    </div>
  )
}
