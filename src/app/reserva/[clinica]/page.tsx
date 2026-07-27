'use client'

// ─────────────────────────────────────────────────────────────
// Página pública de reserva de turnos.
//
// La usa un paciente sin cuenta, casi siempre desde el celular y muchas veces
// fuera del horario del consultorio. Tres pasos cortos: cuándo, qué y quién.
// Nada de registro ni contraseñas.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface ClinicaPublica {
  nombre: string
  direccion: string
  telefono: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  accentColor: string
}

interface TratamientoPublico {
  nombre: string
  duracion: number
}

// Tres semanas hábiles de lunes a viernes.
const DIAS_A_MOSTRAR = 15

/** Próximos días hábiles (lunes a viernes), en formato ISO, arrancando mañana. */
function proximosDias(): { iso: string; dia: string; num: string; mes: string }[] {
  const out: { iso: string; dia: string; num: string; mes: string }[] = []
  const cursor = new Date()
  cursor.setDate(cursor.getDate() + 1)

  while (out.length < DIAS_A_MOSTRAR) {
    const dia = cursor.getDay()
    if (dia !== 0 && dia !== 6) {
      const iso = cursor.toISOString().split('T')[0]
      out.push({
        iso,
        dia: cursor.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
        num: String(cursor.getDate()),
        mes: cursor.toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''),
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

export default function ReservaPublica() {
  const params = useParams()
  const clinicaSlug = String(params?.clinica || '')

  const [clinica, setClinica] = useState<ClinicaPublica | null>(null)
  const [tratamientos, setTratamientos] = useState<TratamientoPublico[]>([])
  const [noExiste, setNoExiste] = useState(false)

  const [dias] = useState(proximosDias)
  const [fecha, setFecha] = useState<string>('')
  const [tratamiento, setTratamiento] = useState<string>('Consulta')
  const [hora, setHora] = useState<string>('')
  const [libres, setLibres] = useState<string[]>([])
  const [cargandoSlots, setCargandoSlots] = useState(false)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')
  // Consentimiento de datos de salud (Ley 25.326). Nunca tildado por defecto.
  const [consentimiento, setConsentimiento] = useState(false)

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<{ mensaje: string; portalUrl: string | null } | null>(null)

  // Datos del consultorio
  useEffect(() => {
    if (!clinicaSlug) return
    fetch(`/api/reserva/${clinicaSlug}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => {
        setClinica(d.clinica)
        setTratamientos(d.tratamientos?.length ? d.tratamientos : [{ nombre: 'Consulta', duracion: 20 }])
        setTratamiento(d.tratamientos?.[0]?.nombre || 'Consulta')
      })
      .catch(() => setNoExiste(true))
  }, [clinicaSlug])

  const duracion = tratamientos.find(t => t.nombre === tratamiento)?.duracion || 20

  // Horarios libres de la fecha elegida
  const cargarSlots = useCallback(async () => {
    if (!fecha || !clinicaSlug) return
    setCargandoSlots(true)
    setHora('')
    try {
      const r = await fetch(`/api/reserva/${clinicaSlug}?fecha=${fecha}&duracion=${duracion}`)
      const d = await r.json()
      setLibres(d.libres || [])
    } catch {
      setLibres([])
    }
    setCargandoSlots(false)
  }, [fecha, clinicaSlug, duracion])

  useEffect(() => { cargarSlots() }, [cargarSlots])

  const enviar = async () => {
    setError(null)
    setEnviando(true)
    try {
      const r = await fetch('/api/reserva/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinica: clinicaSlug, nombre, telefono, email, tratamiento, fecha, hora, notas, consentimiento }),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(d.error || 'No pudimos guardar el turno.')
        // Si el horario se ocupó mientras completaba, refrescamos la grilla.
        if (d.motivo === 'ocupado') cargarSlots()
        setEnviando(false)
        return
      }
      setListo({ mensaje: d.mensaje, portalUrl: d.portalUrl })
    } catch {
      setError('No pudimos conectar. Revisá tu conexión e intentá de nuevo.')
    }
    setEnviando(false)
  }

  if (noExiste) {
    return (
      <Marco>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f1e2b', marginBottom: 8 }}>No encontramos este consultorio</h1>
        <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Revisá el link que te pasaron. Si el problema sigue, comunicate directamente con el consultorio.
        </p>
      </Marco>
    )
  }

  if (!clinica) {
    return <Marco><p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Cargando…</p></Marco>
  }

  const acento = clinica.secondaryColor

  if (listo) {
    return (
      <Marco>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 20px' }}>✓</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f1e2b', marginBottom: 10 }}>Pedido enviado</h1>
          <p style={{ color: '#475569', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>{listo.mensaje}</p>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px', textAlign: 'left', marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Tu pedido</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1e2b' }}>{fecha} · {hora} hs</div>
            <div style={{ fontSize: 14, color: '#475569', marginTop: 2 }}>{tratamiento}</div>
          </div>
          {listo.portalUrl && (
            <a href={listo.portalUrl} style={{ display: 'block', background: acento, color: '#fff', padding: '13px', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Ver mi portal de paciente
            </a>
          )}
        </div>
      </Marco>
    )
  }

  const puedeEnviar = fecha && hora && nombre.trim().length >= 3 && telefono.replace(/\D/g, '').length >= 8 && consentimiento && !enviando

  return (
    <Marco>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        {clinica.logoUrl
          ? <img src={clinica.logoUrl} alt={clinica.nombre} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'contain' }} />
          : <div style={{ width: 52, height: 52, borderRadius: 12, background: acento, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>
              {clinica.nombre.charAt(0)}
            </div>}
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: '#0f1e2b', margin: 0 }}>{clinica.nombre}</h1>
          {clinica.direccion && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{clinica.direccion}</div>}
        </div>
      </div>

      <Paso numero="1" titulo="¿Qué necesitás?" />
      <select
        value={tratamiento}
        onChange={e => setTratamiento(e.target.value)}
        style={{ ...inputSt, marginBottom: 28 }}
      >
        {tratamientos.map(t => <option key={t.nombre} value={t.nombre}>{t.nombre} · {t.duracion} min</option>)}
      </select>

      <Paso numero="2" titulo="Elegí el día" />
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 20, WebkitOverflowScrolling: 'touch' }}>
        {dias.map(d => {
          const sel = fecha === d.iso
          return (
            <button
              key={d.iso}
              onClick={() => setFecha(d.iso)}
              style={{
                flexShrink: 0, width: 62, padding: '10px 0', borderRadius: 12, cursor: 'pointer',
                border: sel ? `2px solid ${acento}` : '1px solid #e2e8f0',
                background: sel ? `${acento}12` : '#fff',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>{d.dia}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: sel ? acento : '#0f1e2b', lineHeight: 1.2 }}>{d.num}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.mes}</div>
            </button>
          )
        })}
      </div>

      {fecha && (
        <div style={{ marginBottom: 28 }}>
          {cargandoSlots
            ? <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Buscando horarios…</p>
            : libres.length === 0
              ? <p style={{ fontSize: 14, color: '#64748b', margin: 0, background: '#f8fafc', padding: 14, borderRadius: 12 }}>
                  No quedan horarios ese día. Probá con otra fecha.
                </p>
              : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 8 }}>
                  {libres.map(h => {
                    const sel = hora === h
                    return (
                      <button
                        key={h}
                        onClick={() => setHora(h)}
                        style={{
                          padding: '11px 0', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700,
                          border: sel ? `2px solid ${acento}` : '1px solid #e2e8f0',
                          background: sel ? acento : '#fff',
                          color: sel ? '#fff' : '#0f1e2b',
                          fontFamily: 'inherit',
                        }}
                      >
                        {h}
                      </button>
                    )
                  })}
                </div>}
        </div>
      )}

      <Paso numero="3" titulo="Tus datos" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        <input style={inputSt} placeholder="Nombre y apellido" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input style={inputSt} placeholder="Teléfono / WhatsApp" inputMode="tel" value={telefono} onChange={e => setTelefono(e.target.value)} />
        <input style={inputSt} placeholder="Email (opcional, para la confirmación)" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} />
        <textarea style={{ ...inputSt, minHeight: 76, resize: 'vertical' }} placeholder="¿Algo que el odontólogo deba saber? (opcional)" value={notas} onChange={e => setNotas(e.target.value)} />
      </div>

      <label style={{ display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 20 }}>
        <input
          type="checkbox"
          checked={consentimiento}
          onChange={e => setConsentimiento(e.target.checked)}
          style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }}
        />
        <span style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
          Autorizo a <strong>{clinica.nombre}</strong> a registrar y tratar mis datos
          personales y de salud para brindarme atención odontológica y gestionar mis
          turnos. Puedo pedir acceder a ellos, corregirlos o eliminarlos cuando quiera.
        </span>
      </label>

      {error && (
        <div style={{ background: '#FAECE7', color: '#712B13', padding: '12px 14px', borderRadius: 12, fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <button
        onClick={enviar}
        disabled={!puedeEnviar}
        style={{
          width: '100%', padding: '15px', borderRadius: 14, border: 'none', fontSize: 15, fontWeight: 800,
          fontFamily: 'inherit',
          background: puedeEnviar ? acento : '#e2e8f0',
          color: puedeEnviar ? '#fff' : '#94a3b8',
          cursor: puedeEnviar ? 'pointer' : 'not-allowed',
        }}
      >
        {enviando ? 'Enviando…' : 'Pedir turno'}
      </button>

      <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
        El turno queda pendiente hasta que el consultorio lo confirme.
        {clinica.telefono && <> ¿Urgente? Llamá al {clinica.telefono}.</>}
      </p>
    </Marco>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fb', fontFamily: 'DM Sans, system-ui, sans-serif', padding: '32px 16px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', background: '#fff', borderRadius: 22, padding: '28px 24px', boxShadow: '0 10px 40px rgba(15,30,43,0.07)' }}>
        {children}
      </div>
    </div>
  )
}

function Paso({ numero, titulo }: { numero: string; titulo: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#0f1e2b', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{numero}</span>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f1e2b', margin: 0 }}>{titulo}</h2>
    </div>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%',
  padding: '13px 14px',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  fontSize: 15,
  fontFamily: 'inherit',
  color: '#0f1e2b',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}
