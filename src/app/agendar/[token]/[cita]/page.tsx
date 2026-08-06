import type { Metadata } from 'next'
import { urlGoogleCalendar } from '@/lib/calendario'
import { leerTurnoPublico, MENSAJE_POR_MOTIVO } from '@/lib/turno-publico'

// ─────────────────────────────────────────────────────────────
// "Agregar el turno al calendario", en una sola pantalla.
//
// Por qué existe, si el portal ya tiene el botón: el paciente recibe el
// recordatorio por WhatsApp y lo abre ahí mismo, dentro del navegador
// embebido. Ese navegador no maneja descargas, así que un link directo al
// .ics puesto en el mensaje no hace nada en buena parte de los teléfonos.
// Esta pantalla ofrece las dos vías —Google Calendar, que es una página web y
// funciona siempre, y el .ics para Apple y Outlook— y deja que el teléfono
// elija la que sabe abrir.
//
// Es un Server Component a propósito: cero JavaScript en el cliente. Dentro
// del navegador de WhatsApp, con la conexión del paciente, la diferencia entre
// esto y el portal completo es abrir al instante o quedarse en un spinner.
// ─────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Agregar turno al calendario',
  // El enlace se comparte por WhatsApp: no queremos que un buscador lo indexe
  // ni que quede en un historial público.
  robots: { index: false, follow: false },
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Fecha y hora en horario de Argentina, que es el del consultorio. */
function formatear(iso: string) {
  const d = new Date(iso)
  const ar = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const hh = String(ar.getHours()).padStart(2, '0')
  const mm = String(ar.getMinutes()).padStart(2, '0')
  return {
    dia: DIAS[ar.getDay()],
    fecha: `${ar.getDate()} de ${MESES[ar.getMonth()]}`,
    hora: `${hh}:${mm}`,
  }
}

const COLOR_TEXTO = '#0a1e3d'
const COLOR_SUAVE = '#64748b'
const COLOR_ACENTO = '#185FA5'

const marco: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
  background: '#FAF9F6',
  fontFamily: 'DM Sans, system-ui, sans-serif',
}

const tarjeta: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: '#fff',
  borderRadius: 28,
  padding: '2rem 1.5rem',
  border: '1px solid rgba(10,30,61,0.05)',
  boxShadow: '0 20px 45px rgba(10,30,61,0.06)',
  textAlign: 'center',
}

const boton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  width: '100%',
  boxSizing: 'border-box',
  // 48px es el mínimo cómodo para un pulgar. Es el motivo de que estos dos
  // botones no compartan fila aunque entrarían: en un teléfono chico quedarían
  // de 140px y con el texto cortado.
  minHeight: 50,
  padding: '13px 16px',
  borderRadius: 14,
  fontSize: 15,
  fontWeight: 700,
  textDecoration: 'none',
}

export default async function AgendarPage({
  params,
}: {
  params: { token: string; cita: string }
}) {
  const res = await leerTurnoPublico(params.token, params.cita)

  if (!res.ok) {
    if (res.motivo === 'base') {
      console.error('[agendar] no se pudo leer el turno:', res.detalle)
    }
    return (
      <main style={marco}>
        <div style={tarjeta}>
          {/* Ámbar y no rojo, por lo mismo que en el portal: el que mira es el
              paciente y no hay nada que pueda hacer con una alarma. */}
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(239,159,39,0.10)', color: '#EF9F27', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 7 12 12 15 14" /></svg>
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: COLOR_TEXTO, margin: 0, letterSpacing: '-0.01em' }}>
            No pudimos abrir tu turno
          </h1>
          <p style={{ color: COLOR_SUAVE, marginTop: 10, fontSize: 14.5, lineHeight: 1.6 }}>
            {MENSAJE_POR_MOTIVO[res.motivo]}
          </p>
        </div>
      </main>
    )
  }

  const { turno } = res
  const { dia, fecha, hora } = formatear(turno.fechaHora)
  const clinica = turno.clinica || 'tu consultorio'

  const evento = {
    uid: `cita-${turno.citaId}`,
    titulo: `Turno en ${clinica} - ${turno.tratamiento}`,
    descripcion: `Turno en ${clinica}\nTratamiento: ${turno.tratamiento}`,
    ubicacion: turno.direccion || undefined,
    inicio: new Date(turno.fechaHora),
    duracionMinutos: turno.duracionMinutos,
  }

  return (
    <main style={marco}>
      <div style={tarjeta}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: COLOR_SUAVE, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
          {clinica}
        </div>

        <div style={{ margin: '1.5rem 0 0.35rem', fontSize: 15, color: COLOR_SUAVE, fontWeight: 600, textTransform: 'capitalize' }}>
          {dia} {fecha}
        </div>
        <div className="kpi-numeral" style={{ fontSize: 46, fontWeight: 600, color: COLOR_TEXTO, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
          {hora}
        </div>
        <div style={{ display: 'inline-block', marginTop: 12, padding: '5px 14px', borderRadius: 20, background: 'rgba(24,95,165,0.08)', color: COLOR_ACENTO, fontSize: 13.5, fontWeight: 700 }}>
          {turno.tratamiento}
        </div>
        {turno.direccion ? (
          <div style={{ marginTop: 14, fontSize: 13.5, color: COLOR_SUAVE, lineHeight: 1.5 }}>{turno.direccion}</div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: '1.75rem' }}>
          {/* Google primero: es el que funciona en cualquier navegador, sin
              descargar nada. `target="_blank"` porque desde el navegador de
              WhatsApp conviene que salte al navegador del sistema, donde la
              sesión de Google ya está iniciada. */}
          <a
            href={urlGoogleCalendar(evento)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...boton, background: COLOR_TEXTO, color: '#fff', border: '1px solid transparent' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            Google Calendar
          </a>

          <a
            href={`/api/ics?cita=${encodeURIComponent(turno.citaId)}&token=${encodeURIComponent(params.token)}`}
            style={{ ...boton, background: '#fff', color: COLOR_TEXTO, border: '1px solid rgba(10,30,61,0.10)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Apple Calendar / Outlook
          </a>
        </div>

        <p style={{ marginTop: 18, fontSize: 12.5, color: COLOR_SUAVE, lineHeight: 1.55 }}>
          Si usás iPhone, elegí la segunda opción.
        </p>
      </div>
    </main>
  )
}
