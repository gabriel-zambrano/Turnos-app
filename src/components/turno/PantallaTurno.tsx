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
const AMBAR = '#EF9F27'

export const marco: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
  background: '#f4f7fb',
  fontFamily: 'DM Sans, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
}

export const tarjeta: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: '#fff',
  borderRadius: 24,
  padding: '2rem 1.5rem',
  border: '1px solid rgba(15, 30, 61, 0.08)',
  boxShadow: '0 12px 35px rgba(10, 37, 64, 0.05)',
  textAlign: 'center',
}

// 50px de alto mínimo: es lo cómodo para un pulgar. Por eso los botones no
// comparten fila aunque entrarían — en un teléfono chico quedarían de 140px
// con el texto cortado.
const boton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 50,
  padding: '13px 16px',
  borderRadius: 14,
  fontSize: 15,
  fontWeight: 700,
  fontFamily: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
}

export function PantallaError({ mensaje }: { mensaje: string }) {
  return (
    <main style={marco}>
      <div style={tarjeta}>
        {/* Ámbar y no rojo, igual que en el portal: el que mira es el paciente
            y no hay nada que pueda hacer con una alarma. */}
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(239,159,39,0.10)', color: AMBAR, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 7 12 12 15 14" /></svg>
        </div>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: TEXTO, margin: 0, letterSpacing: '-0.01em' }}>
          No pudimos abrir tu turno
        </h1>
        <p style={{ color: SUAVE, marginTop: 10, fontSize: 14.5, lineHeight: 1.6 }}>{mensaje}</p>
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
  const clinica = turno.clinica || 'tu consultorio'
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
        <div style={{ fontSize: 11.5, fontWeight: 700, color: SUAVE, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
          {clinica}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 }}>
          {countdown ? (
            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: 'rgba(15,76,92,0.08)', color: ACENTO, fontSize: 12, fontWeight: 700 }}>
              ⏱️ {countdown}
            </span>
          ) : null}
          {confirmado ? (
            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: VERDE_BG, color: VERDE, fontSize: 12, fontWeight: 700 }}>
              ✓ Confirmado
            </span>
          ) : (
            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: 'rgba(239,159,39,0.12)', color: AMBAR, fontSize: 12, fontWeight: 700 }}>
              Pendiente
            </span>
          )}
        </div>

        <div style={{ margin: '1.25rem 0 0.25rem', fontSize: 15, color: SUAVE, fontWeight: 600, textTransform: 'capitalize' }}>
          {dia} {fecha}
        </div>
        <div className="kpi-numeral" style={{ fontSize: 48, fontWeight: 700, color: TEXTO, lineHeight: 1.05, letterSpacing: '-0.03em', fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace" }}>
          {hora}
        </div>
        <div style={{ display: 'inline-block', marginTop: 12, padding: '5px 14px', borderRadius: 20, background: 'rgba(15,76,92,0.08)', color: ACENTO, fontSize: 13.5, fontWeight: 700 }}>
          {turno.tratamiento}
        </div>
        {turno.direccion ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13.5, color: SUAVE, lineHeight: 1.5 }}>📍 {turno.direccion}</div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(turno.direccion)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, color: ACENTO, fontWeight: 600, textDecoration: 'none' }}
            >
              Cómo llegar en Google Maps &rarr;
            </a>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: '1.75rem' }}>
          {/* Confirmar va primero cuando hace falta: es lo que el consultorio
              necesita del paciente. Una vez confirmado desaparece el botón y
              queda el acuse, para que agendar pase a ser la acción principal. */}
          {confirmado ? (
            <div style={{ ...boton, background: 'rgba(19,138,107,0.09)', color: VERDE, cursor: 'default' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Turno confirmado
            </div>
          ) : confirmar ? (
            <form action={confirmar} style={{ margin: 0 }}>
              <button type="submit" style={{ ...boton, background: VERDE, color: '#fff' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Confirmar turno
              </button>
            </form>
          ) : null}

          {/* Google primero entre las dos de calendario: es una página web y
              funciona en cualquier navegador embebido, sin descargar nada.
              `target="_blank"` para saltar al navegador del sistema, donde la
              sesión de Google ya está iniciada. */}
          <a href={urlGoogleCalendar(evento)} target="_blank" rel="noopener noreferrer"
             style={{ ...boton, background: confirmado ? TEXTO : '#fff', color: confirmado ? '#fff' : TEXTO, borderColor: confirmado ? 'transparent' : 'rgba(10,30,61,0.10)' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            Google Calendar
          </a>

          <a href={urlIcs} style={{ ...boton, background: '#fff', color: TEXTO, borderColor: 'rgba(10,30,61,0.10)' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Apple Calendar / Outlook
          </a>
        </div>

        <p style={{ marginTop: 16, fontSize: 12.5, color: SUAVE, lineHeight: 1.55 }}>
          Si usás iPhone, elegí la segunda opción de calendario.
        </p>

        {urlReprogramar ? (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(10,30,61,0.06)' }}>
            <a href={urlReprogramar} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 13.5, color: SUAVE, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Necesito reprogramar
            </a>
          </div>
        ) : null}
      </div>
    </main>
  )
}
