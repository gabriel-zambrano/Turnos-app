import { urlGoogleCalendar } from '@/lib/calendario'
import type { TurnoPublico } from '@/lib/turno-publico'

// ─────────────────────────────────────────────────────────────
// La pantalla que abre el paciente desde el link de WhatsApp.
//
// Resuelve las tres cosas que puede querer hacer —agendarlo, confirmarlo,
// reprogramarlo— para que el mensaje lleve UN solo enlace. Antes iban dos, y
// WhatsApp solo previsualiza el primero: el segundo quedaba como noventa
// caracteres de UUID colgando debajo del texto.
//
// Server Component, sin JavaScript en el cliente. Confirmar es un <form> con
// server action: funciona igual dentro del navegador embebido de WhatsApp, que
// es donde esto se abre casi siempre.
// ─────────────────────────────────────────────────────────────

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Fecha y hora en horario de Argentina, que es el del consultorio. */
export function formatearTurno(iso: string) {
  const d = new Date(iso)
  const ar = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return {
    dia: DIAS[ar.getDay()],
    fecha: `${ar.getDate()} de ${MESES[ar.getMonth()]}`,
    corta: `${ar.getDate()}/${ar.getMonth() + 1}`,
    hora: `${String(ar.getHours()).padStart(2, '0')}:${String(ar.getMinutes()).padStart(2, '0')}`,
  }
}

/** Countdown amigable para la tarjeta tipo Apple Wallet */
export function calcularCountdown(fechaHoraIso: string): string | null {
  const dt = new Date(fechaHoraIso).getTime()
  const now = Date.now()
  const diffMs = dt - now
  if (diffMs < 0) return null
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays === 0) {
    if (diffHours === 0) {
      const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)))
      return `En ${diffMins} min`
    }
    return `Hoy (en ${diffHours} h)`
  }
  if (diffDays === 1) return 'Mañana'
  if (diffDays < 7) return `En ${diffDays} días`
  const weeks = Math.floor(diffDays / 7)
  return `En ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`
}

const TEXTO = '#0A2540'
const SUAVE = '#64748b'
const ACENTO = '#0F4C5C'
const VERDE = '#0F5145'
const VERDE_BG = '#E0F2F1'
const AMBAR = '#D97706'
const AMBAR_BG = '#FEF3C7'

export const marco: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem 1.25rem',
  background: 'radial-gradient(ellipse at 50% -10%, rgba(15, 76, 92, 0.08) 0%, rgba(244, 247, 251, 0.95) 45%, #EEF3F9 100%)',
  fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
}

export const tarjeta: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: '#ffffff',
  borderRadius: 24,
  padding: '2.25rem 1.75rem',
  border: '1px solid rgba(15, 76, 92, 0.08)',
  boxShadow: '0 20px 45px -12px rgba(10, 37, 64, 0.08), 0 4px 12px rgba(10, 37, 64, 0.03)',
  textAlign: 'center',
  position: 'relative',
  overflow: 'hidden',
}

// 50px de alto mínimo: es lo cómodo para un pulgar. Por eso los botones no
// comparten fila aunque entrarían — en un teléfono chico quedarían de 140px
// con el texto cortado.
const boton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 50,
  padding: '13px 18px',
  borderRadius: 14,
  fontSize: 14.5,
  fontWeight: 700,
  fontFamily: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
}

export function PantallaError({ mensaje }: { mensaje: string }) {
  return (
    <main style={marco}>
      <div style={tarjeta}>
        {/* Ámbar y no rojo, igual que en el portal: el que mira es el paciente
            y no hay nada que pueda hacer con una alarma. */}
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(217,119,6,0.10)', color: AMBAR, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', boxShadow: '0 4px 12px rgba(217,119,6,0.12)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 7 12 12 15 14" /></svg>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: TEXTO, margin: 0, letterSpacing: '-0.02em' }}>
          No pudimos abrir tu turno
        </h1>
        <p style={{ color: SUAVE, marginTop: 10, fontSize: 14.5, lineHeight: 1.6 }}>{mensaje}</p>
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(10,37,64,0.06)' }}>
          <span style={{ fontSize: 12.5, color: SUAVE, fontWeight: 500 }}>
            Por favor comunicate con la clínica para solicitar un enlace actualizado.
          </span>
        </div>
      </div>
    </main>
  )
}

export function PantallaTurno({
  turno,
  urlIcs,
  confirmar,
  yaConfirmo,
}: {
  turno: TurnoPublico
  /** Ruta al .ics. Se pasa desde afuera porque cambia según cómo se entró. */
  urlIcs: string
  /** Server action del formulario de confirmar. Si falta, no se muestra. */
  confirmar?: (formData: FormData) => Promise<void>
  /** True justo después de confirmar, para acusar recibo. */
  yaConfirmo?: boolean
}) {
  const { dia, fecha, hora } = formatearTurno(turno.fechaHora)
  const countdown = calcularCountdown(turno.fechaHora)
  const clinica = turno.clinica || 'Consultorio Odontológico'
  const confirmado = turno.estado === 'confirmado' || yaConfirmo

  const evento = {
    uid: `cita-${turno.citaId}`,
    titulo: `Turno en ${clinica} - ${turno.tratamiento}`,
    descripcion: `Turno en ${clinica}\nTratamiento: ${turno.tratamiento}`,
    ubicacion: turno.direccion || undefined,
    inicio: new Date(turno.fechaHora),
    duracionMinutos: turno.duracionMinutos,
  }

  // Reprogramar abre WhatsApp con el mensaje escrito, igual que en el portal:
  // no hay reprogramación automática porque el hueco lo decide el consultorio.
  const telefono = turno.telefono.replace(/\D/g, '')
  const urlReprogramar = telefono
    ? `https://wa.me/${telefono}?text=${encodeURIComponent(
        `Hola! Me contacto para reprogramar mi turno del ${fecha} a las ${hora} hs (${turno.tratamiento}). Mi nombre es ${turno.pacienteNombre}.`
      )}`
    : null

  return (
    <main style={marco}>
      <div style={tarjeta}>
        {/* Cabecera de la clínica con insignia de pase digital */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid rgba(10,37,64,0.06)', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: ACENTO, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: ACENTO }} />
            {clinica}
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: SUAVE, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(10,37,64,0.04)', padding: '2px 8px', borderRadius: 10 }}>
            Pase Digital
          </span>
        </div>

        {/* Badges de estado con animación en vivo */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {countdown ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 20, background: 'rgba(15,76,92,0.08)', color: ACENTO, fontSize: 12, fontWeight: 700 }}>
              ⏱️ {countdown}
            </span>
          ) : null}

          {confirmado ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 20, background: VERDE_BG, color: VERDE, fontSize: 12, fontWeight: 700, border: '1px solid rgba(16,185,129,0.2)' }}>
              <span className="pulse-dot-green" />
              Confirmado
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 20, background: AMBAR_BG, color: AMBAR, fontSize: 12, fontWeight: 700, border: '1px solid rgba(245,158,11,0.2)' }}>
              <span className="pulse-dot-amber" />
              Pendiente de confirmación
            </span>
          )}
        </div>

        {/* Bloque de Fecha y Hora estilo Apple Wallet */}
        <div style={{ margin: '0.75rem 0 0.25rem', fontSize: 15, color: SUAVE, fontWeight: 600, textTransform: 'capitalize', letterSpacing: '-0.01em' }}>
          {dia}, {fecha}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, margin: '4px 0 10px' }}>
          <span className="kpi-numeral" style={{ fontSize: 52, fontWeight: 800, color: TEXTO, lineHeight: 1, letterSpacing: '-0.03em', fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace" }}>
            {hora}
          </span>
          <span style={{ fontSize: 20, fontWeight: 700, color: SUAVE }}>hs</span>
        </div>

        {/* Chip de Tratamiento */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '6px 0 14px', padding: '6px 14px', borderRadius: 20, background: 'rgba(15,76,92,0.07)', color: ACENTO, fontSize: 13.5, fontWeight: 700, border: '1px solid rgba(15,76,92,0.12)' }}>
          <span>🦷</span>
          <span>{turno.tratamiento}</span>
          <span style={{ opacity: 0.6, fontSize: 12 }}>· {turno.duracionMinutos} min</span>
        </div>

        {/* Tarjeta de Ubicación con enlace directo */}
        {turno.direccion ? (
          <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(10,37,64,0.02)', borderRadius: 14, border: '1px solid rgba(10,37,64,0.05)', textAlign: 'left' }}>
            <div style={{ fontSize: 12.5, color: TEXTO, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📍</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{turno.direccion}</span>
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(turno.direccion)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 12, color: ACENTO, fontWeight: 700, textDecoration: 'none' }}
            >
              Abrir ubicación en Google Maps &rarr;
            </a>
          </div>
        ) : null}

        {/* Botones de Acción */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: '1.5rem' }}>
          {confirmado ? (
            <div style={{ ...boton, background: 'rgba(15,81,69,0.08)', color: VERDE, border: '1px solid rgba(15,81,69,0.18)', cursor: 'default' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Turno confirmado
            </div>
          ) : confirmar ? (
            <form action={confirmar} style={{ margin: 0 }}>
              <button
                type="submit"
                style={{
                  ...boton,
                  background: `linear-gradient(135deg, ${ACENTO}, ${VERDE})`,
                  color: '#ffffff',
                  boxShadow: '0 8px 20px rgba(15,76,92,0.25)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Confirmar mi turno
              </button>
            </form>
          ) : null}

          {/* Opciones de Calendario */}
          <a
            href={urlGoogleCalendar(evento)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...boton,
              background: confirmado ? TEXTO : '#ffffff',
              color: confirmado ? '#ffffff' : TEXTO,
              borderColor: confirmado ? 'transparent' : 'rgba(10,37,64,0.12)',
              boxShadow: '0 2px 6px rgba(10,37,64,0.03)',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            Agregar a Google Calendar
          </a>

          <a
            href={urlIcs}
            style={{
              ...boton,
              background: '#ffffff',
              color: TEXTO,
              borderColor: 'rgba(10,37,64,0.12)',
              boxShadow: '0 2px 6px rgba(10,37,64,0.03)',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Apple Calendar / Outlook
          </a>
        </div>

        {/* Reprogramar */}
        {urlReprogramar ? (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(10,37,64,0.06)' }}>
            <a
              href={urlReprogramar}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 13,
                color: SUAVE,
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color 0.2s',
              }}
            >
              <span>💬</span>
              <span>¿Necesitás reprogramar? Contactanos por WhatsApp</span>
            </a>
          </div>
        ) : null}

        {/* Pie de seguridad */}
        <div style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', letterSpacing: '0.02em' }}>
          🔒 Enlace seguro y exclusivo · DentalDesk
        </div>
      </div>
    </main>
  )
}

