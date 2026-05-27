'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'

const supabase = createClient()

// Local fallbacks
const DEFAULT_TRAT_DURACION: Record<string, number> = {
  'Consulta': 20,
  'Ortodoncia': 60,
  'Blanqueamiento': 60,
  'Limpieza': 40,
  'Extracción': 40,
  'Caries': 40,
  'Implante': 80,
  'Otro': 20,
}

const DEFAULT_TRATAMIENTOS = Object.keys(DEFAULT_TRAT_DURACION)

const HORAS = [
  '08:00','08:20','08:40','09:00','09:20','09:40',
  '10:00','10:20','10:40','11:00','11:20','11:40',
  '12:00','12:20','12:40','13:00','13:20','13:40',
  '14:00','14:20','14:40','15:00','15:20','15:40',
  '16:00','16:20','16:40','17:00','17:20','17:40',
  '18:00','18:20','18:40','19:00','19:20','19:40',
  '20:00','20:20','20:40'
]

const DURACIONES = [
  { label: '20 min', value: 20 },
  { label: '40 min', value: 40 },
  { label: '60 min', value: 60 },
  { label: '80 min', value: 80 },
  { label: '120 min', value: 120 },
]

interface Paciente { id: string; nombre: string; telefono: string; email: string }
interface TratamientoDB { nombre: string; duracion_default: number | null; precio_base: number | null }

interface Props {
  onClose: () => void
  onSuccess?: () => void
  /** Pre-fill a date (YYYY-MM-DD) and/or hour (HH:MM) when opening from agenda */
  defaultFecha?: string
  defaultHora?: string
}

export function NuevaCitaModal({ onClose, onSuccess, defaultFecha, defaultHora }: Props) {
  const { tenant } = useTenantContext()
  const [query, setQuery] = useState('')
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [creandoPaciente, setCreandoPaciente] = useState(false)
  const [nuevoPaciente, setNuevoPaciente] = useState({ nombre: '', telefono: '', email: '' })
  
  // Dynamic treatments loaded from DB
  const [tratamientos, setTratamientos] = useState<string[]>(DEFAULT_TRATAMIENTOS)
  const [tratDuraciones, setTratDuraciones] = useState<Record<string, number>>(DEFAULT_TRAT_DURACION)
  const [tratPrecios, setTratPrecios] = useState<Record<string, number>>({})
  
  const [tratamiento, setTratamiento] = useState('Consulta')
  const [fecha, setFecha] = useState(defaultFecha || '')
  const [hora, setHora] = useState(defaultHora || '')
  const [horasOcupadas, setHorasOcupadas] = useState<string[]>([])
  const [cargandoHoras, setCargandoHoras] = useState(false)
  const [notas, setNotas] = useState('')
  const [duracion, setDuracion] = useState(DEFAULT_TRAT_DURACION['Consulta'])
  const [sena, setSena] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const [error, setError] = useState('')
  const [colisionPaciente, setColisionPaciente] = useState<{ nombre: string; fecha: string } | null>(null)
  const [confirmarSobreturno, setConfirmarSobreturno] = useState<string | null>(null)
  const [esSobreturno, setEsSobreturno] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const hoyMin = new Date().toISOString().split('T')[0]

  const primaryColor = tenant?.primaryColor || '#0a1e3d'
  const secondaryColor = tenant?.secondaryColor || '#185FA5'
  const accentColor = tenant?.accentColor || '#138A6B'

  // Fetch treatments from database dynamically
  useEffect(() => {
    if (!tenant) return
    supabase.from('tratamientos')
      .select('nombre, duracion_default, precio_base')
      .eq('tenant_id', tenant.id)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => {
        if (data && data.length > 0) {
          const list = data.map(t => t.nombre)
          const durMap: Record<string, number> = {}
          const priceMap: Record<string, number> = {}
          data.forEach(t => {
            durMap[t.nombre] = t.duracion_default || 20
            if (t.precio_base) priceMap[t.nombre] = t.precio_base
          })
          setTratamientos(list)
          setTratDuraciones(durMap)
          setTratPrecios(priceMap)
        }
      })
  }, [tenant])

  // Auto-duration and price hint when treatment changes
  useEffect(() => {
    const defaultDur = tratDuraciones[tratamiento] ?? 20
    setDuracion(defaultDur)
  }, [tratamiento, tratDuraciones])

  // Patient search
  useEffect(() => {
    if (query.length < 2 || !tenant) { setPacientes([]); setShowDropdown(false); return }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('pacientes')
        .select('id,nombre,telefono,email')
        .eq('tenant_id', tenant.id)
        .ilike('nombre', `%${query}%`)
        .limit(6)
      if (data) { setPacientes(data); setShowDropdown(true) }
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, tenant])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load occupied hours when date changes — non-blocking
  useEffect(() => {
    if (!fecha || !tenant) { setHorasOcupadas([]); return }
    setCargandoHoras(true)
    setEsSobreturno(false)
    fetch(`/api/horas-ocupadas?fecha=${fecha}&tenant_id=${tenant.id}`)
      .then(r => r.ok ? r.json() : { ocupadas: [] })
      .then(data => setHorasOcupadas(data.ocupadas || []))
      .finally(() => setCargandoHoras(false))
  }, [fecha, tenant])

  // Pre-fill default values
  useEffect(() => {
    if (defaultFecha) setFecha(defaultFecha)
    if (defaultHora) setHora(defaultHora)
  }, [defaultFecha, defaultHora])

  function seleccionarPaciente(p: Paciente) {
    setPacienteSeleccionado(p); setQuery(p.nombre); setShowDropdown(false); setCreandoPaciente(false)
  }

  function limpiarPaciente() {
    setPacienteSeleccionado(null); setQuery(''); setCreandoPaciente(false)
    setNuevoPaciente({ nombre: '', telefono: '', email: '' })
  }

  function iniciarCreacion() {
    setShowDropdown(false); setCreandoPaciente(true)
    setNuevoPaciente({ nombre: query, telefono: '', email: '' })
  }

  async function crearPaciente() {
    const { data: existe } = await supabase
      .from('pacientes')
      .select('id,nombre')
      .or(`email.eq.${nuevoPaciente.email},telefono.eq.${nuevoPaciente.telefono}`)
      .limit(1)
    if (existe && existe.length > 0) {
      setError(`⚠️ Ya existe un paciente con ese email o teléfono: ${existe[0].nombre}`)
      return
    }
    if (!nuevoPaciente.nombre) { setError('Ingresá el nombre del paciente'); return }
    if (!nuevoPaciente.telefono) { setError('Ingresá el teléfono'); return }
    if (!tenant) return
    setError('')
    const { data, error: err } = await supabase
      .from('pacientes')
      .insert({ nombre: nuevoPaciente.nombre, telefono: nuevoPaciente.telefono, email: nuevoPaciente.email || null, tenant_id: tenant.id })
      .select()
      .single()
    if (err || !data) { setError('Error al crear paciente'); return }
    seleccionarPaciente(data)
  }

  async function guardar(forzar = false) {
    if (!pacienteSeleccionado) { setError('Seleccioná o creá un paciente'); return }
    if (!fecha) { setError('Elegí una fecha'); return }
    if (!hora) { setError('Elegí un horario'); return }
    setError('')

    if (horasOcupadas.includes(hora) && !esSobreturno) {
      setError('⚠️ Ese horario ya está ocupado. Tocá el horario para activar sobreturno.')
      return
    }

    if (!forzar) {
      const res = await fetch(`/api/citas-futuras?paciente_id=${pacienteSeleccionado.id}`)
      const { citas: citasFuturas } = await res.json()
      if (citasFuturas && citasFuturas.length > 0) {
        const dt = new Date(citasFuturas[0].fecha_hora)
        const ar = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
        const fechaLabel = ar.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
        const horaLabel = String(ar.getHours()).padStart(2, '0') + ':' + String(ar.getMinutes()).padStart(2, '0')
        setColisionPaciente({ nombre: pacienteSeleccionado.nombre, fecha: `${fechaLabel} a las ${horaLabel}hs` })
        return
      }
    }

    setColisionPaciente(null)
    setGuardando(true)
    const fechaHora = `${fecha}T${hora}:00-03:00`
    
    // Get treatment price
    const valorTrat = tratPrecios[tratamiento] || null

    const { error: err } = await supabase.from('citas').insert({
      paciente_id: pacienteSeleccionado.id,
      tipo_tratamiento: tratamiento,
      fecha_hora: fechaHora,
      estado: 'pendiente',
      notas: notas || null,
      duracion_minutos: duracion,
      sena: sena ? parseFloat(sena) : null,
      valor: valorTrat,
      tenant_id: tenant?.id,
    })
    if (err) { setError('Error al guardar. Intentá de nuevo.'); setGuardando(false); return }

    setGuardando(false)
    setExito(true)

    if (pacienteSeleccionado.email) {
      fetch('/api/confirmar-turno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: pacienteSeleccionado.nombre,
          email: pacienteSeleccionado.email,
          fecha, hora, tratamiento, duracion,
          notas: notas || null,
          tenantId: tenant?.id
        })
      })
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', border: '1px solid var(--border-color, #dde5ef)', background: '#fff', borderRadius: 10,
    padding: '0.75rem 1rem', fontSize: 14, color: 'var(--text-dark, #0a1e3d)',
    fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box',
    boxShadow: '0 1px 2px rgba(10,30,61,0.02)'
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted-darker, #4a6080)', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 8, display: 'block',
  }
  const card: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.72)', borderRadius: 14, padding: '1.25rem', border: '1px solid var(--border-light, rgba(56,138,221,0.08))',
    boxShadow: '0 2px 8px rgba(10,30,61,0.015)'
  }

  return (
    <>
      <style>{`
        @keyframes slideInFromRight {
          0% { transform: translateX(100%); }
          100% { transform: translateX(0); }
        }
        @keyframes fadeInBackdrop {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .slide-in-drawer {
          animation: slideInFromRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .fade-in-backdrop {
          animation: fadeInBackdrop 0.25s ease-out forwards;
        }
        @keyframes spin { to { transform: rotate(360deg) } }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fade-in-backdrop"
        style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,61,0.4)', backdropFilter: 'blur(5px)', zIndex: 1000 }}
      />

      {/* Modal drawer */}
      <div className="slide-in-drawer" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 480,
        background: 'var(--bg-modal, rgba(255,255,255,0.95))', backdropFilter: 'blur(20px)', zIndex: 1001, display: 'flex', flexDirection: 'column',
        fontFamily: 'DM Sans, sans-serif', borderLeft: '1px solid var(--border-light, rgba(56,138,221,0.15))',
        boxShadow: '-8px 0 32px rgba(10,30,61,0.12)',
      }}>
        {/* Header */}
        <div style={{ background: 'var(--bg-header, rgba(255,255,255,0.92))', borderBottom: '1px solid var(--border-light, rgba(56,138,221,0.08))', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: primaryColor }}>Nueva cita</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #8fa3bc)', marginTop: 2 }}>{tenant?.nombre}</div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg-input, rgba(0,0,0,0.03))', border: 'none', cursor: 'pointer', color: '#8fa3bc', padding: 8, borderRadius: '50%', display: 'flex', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Scrollable Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {/* Success state */}
          {exito ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', gap: 20, minHeight: '60vh' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(29,158,117,0.15)' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: primaryColor, marginBottom: 8 }}>¡Turno agendado correctamente!</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted, #8fa3bc)', fontWeight: 500 }}>
                  Paciente: <strong style={{ color: primaryColor }}>{pacienteSeleccionado?.nombre}</strong> <br/>
                  Fecha: <strong style={{ color: secondaryColor }}>{fecha} a las {hora} hs</strong> ({tratamiento})
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 360, marginTop: 12 }}>
                <button
                  onClick={() => { setExito(false); limpiarPaciente(); setFecha(''); setHora(''); setNotas(''); setSena(''); setTratamiento('Consulta'); setHorasOcupadas([]); setEsSobreturno(false); }}
                  style={{ flex: 1, padding: '0.8rem 1rem', borderRadius: 12, border: '1px solid var(--border-color, #dde5ef)', background: '#fff', color: primaryColor, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', boxShadow: '0 2px 6px rgba(10,30,61,0.02)', transition: 'background-color 0.2s' }}
                >
                  + Otra cita
                </button>
                <button
                  onClick={() => { onSuccess?.(); onClose() }}
                  style={{ flex: 1, padding: '0.8rem 1rem', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${secondaryColor}, ${primaryColor})`, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', boxShadow: `0 4px 12px ${secondaryColor}25` }}
                >
                  Ir a agenda
                </button>
              </div>
              
              {pacienteSeleccionado?.telefono && (
                <a
                  href={`https://wa.me/${pacienteSeleccionado.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Hola *${pacienteSeleccionado.nombre.trim().split(' ')[0]}* 👋\nTe confirmamos tu turno de *${tratamiento}* para el *${fecha.split('-').reverse().join('/')}* a las *${hora} hs*.\n\n🗓️ Podés sumarlo a tu calendario haciendo clic aquí:\nhttps://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Turno Odontológico - ${tratamiento}`)}&dates=${new Date(`${fecha}T${hora}:00-03:00`).toISOString().replace(/-|:|\.\d\d\d/g, '')}/${new Date(new Date(`${fecha}T${hora}:00-03:00`).getTime() + duracion * 60000).toISOString().replace(/-|:|\.\d\d\d/g, '')}&details=${encodeURIComponent(`Turno para ${tratamiento}.`)}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginTop: 12, width: '100%', maxWidth: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '0.8rem 1rem', borderRadius: 12, border: 'none', background: '#25D366', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', boxShadow: '0 4px 12px rgba(37,211,102,0.25)', textDecoration: 'none'
                  }}
                  onClick={() => {
                    // Optional: auto-close modal when WhatsApp is opened
                    // onSuccess?.(); onClose(); 
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Confirmar por WhatsApp
                </a>
              )}
            </div>
          ) : (
            /* Form */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Paciente */}
              <div style={card}>
                <label style={lbl}>Paciente</label>
                <div style={{ position: 'relative' }} ref={dropdownRef}>
                  {pacienteSeleccionado ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 0.85rem', background: 'var(--bg-input, #f4f7fb)', borderRadius: 10, border: '1px solid var(--border-light, rgba(56,138,221,0.08))' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg, ${secondaryColor}, ${primaryColor})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                        {pacienteSeleccionado.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: primaryColor }}>{pacienteSeleccionado.nombre}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted, #8fa3bc)' }}>{pacienteSeleccionado.telefono}</div>
                      </div>
                      <button onClick={limpiarPaciente} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #c5d4e8)', padding: 4, display: 'flex', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.color = '#d85a30'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted, #c5d4e8)'}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : creandoPaciente ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: primaryColor, marginBottom: 2 }}>Nuevo paciente</div>
                      <input value={nuevoPaciente.nombre} onChange={e => setNuevoPaciente(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre completo *" style={inp}/>
                      <input value={nuevoPaciente.telefono} onChange={e => setNuevoPaciente(p => ({ ...p, telefono: e.target.value }))} placeholder="Teléfono (ej: +54911...)*" type="tel" style={inp}/>
                      <input value={nuevoPaciente.email} onChange={e => setNuevoPaciente(p => ({ ...p, email: e.target.value }))} placeholder="Email (opcional)" type="email" style={inp}/>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button onClick={() => { setCreandoPaciente(false); setQuery('') }} style={{ flex: 1, padding: '0.6rem 0.8rem', borderRadius: 10, border: '1px solid var(--border-color, #dde5ef)', background: '#fff', color: '#687e96', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancelar</button>
                        <button onClick={crearPaciente} style={{ flex: 2, padding: '0.6rem 0.8rem', borderRadius: 10, border: 'none', background: primaryColor, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Crear y seleccionar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-input, #f4f7fb)', borderRadius: 10, padding: '0 12px', border: '1px solid var(--border-color, #dde5ef)' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted, #8fa3bc)" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre..." style={{ flex: 1, border: 'none', background: 'transparent', padding: '0.75rem 0', fontSize: 14, outline: 'none', color: primaryColor, fontFamily: 'DM Sans, sans-serif' }}/>
                      </div>
                      {showDropdown && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', borderRadius: 12, border: '1px solid var(--border-light, rgba(56,138,221,0.12))', boxShadow: '0 8px 24px rgba(10,30,61,0.08)', zIndex: 20, overflow: 'hidden' }}>
                          {pacientes.map(p => (
                            <div key={p.id} onClick={() => seleccionarPaciente(p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem', cursor: 'pointer', borderBottom: '0.5px solid var(--border-lighter, #f0f0ee)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-input, #f4f7fb)')}
                              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                            >
                              <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${secondaryColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: secondaryColor, flexShrink: 0 }}>
                                {p.nombre.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: primaryColor }}>{p.nombre}</div>
                                <div style={{ fontSize: 11.5, color: 'var(--text-muted, #8fa3bc)' }}>{p.telefono}</div>
                              </div>
                            </div>
                          ))}
                          <div onClick={iniciarCreacion} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem', cursor: 'pointer', background: 'var(--bg-input, #f4f7fb)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#eef2f7')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input, #f4f7fb)')}
                          >
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1D9E75' }}>Crear nuevo paciente</div>
                          </div>
                        </div>
                      )}
                      {query.length >= 2 && !showDropdown && (
                        <button onClick={iniciarCreacion} style={{ marginTop: 8, width: '100%', padding: '0.65rem', borderRadius: 10, border: '1.5px dashed #1D9E75', background: '#E1F5EE', color: '#085041', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Crear "{query}" como nuevo paciente
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Tratamiento */}
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={lbl}>Tratamiento</label>
                  {tratPrecios[tratamiento] && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, background: `${accentColor}12`, padding: '2px 8px', borderRadius: 12 }}>
                      Valor base: ${tratPrecios[tratamiento]}
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                  {tratamientos.map(t => {
                    const isSelected = tratamiento === t
                    return (
                      <button key={t} onClick={() => setTratamiento(t)} style={{ padding: '0.55rem 0.3rem', borderRadius: 8, border: '1px solid', fontSize: 11, fontWeight: isSelected ? 700 : 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: isSelected ? secondaryColor : 'var(--bg-input, #f4f7fb)', color: isSelected ? '#fff' : 'var(--text-muted-darker, #4a6080)', borderColor: isSelected ? secondaryColor : 'var(--border-color, #dde5ef)', boxShadow: isSelected ? `0 2px 6px ${secondaryColor}20` : 'none', transition: 'all 0.15s' }}>
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Fecha + Duración (row) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div style={card}>
                  <label style={lbl}>Fecha</label>
                  <input type="date" min={hoyMin} value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...inp, fontSize: 13 }}/>
                </div>
                <div style={card}>
                  <label style={lbl}>Duración</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {DURACIONES.map(d => {
                      const isSelected = duracion === d.value
                      return (
                        <button key={d.value} onClick={() => setDuracion(d.value)} style={{ flex: 1, padding: '0.4rem 0', borderRadius: 8, border: '1px solid', fontSize: 10.5, fontWeight: isSelected ? 700 : 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textTransform: 'lowercase', background: isSelected ? primaryColor : 'var(--bg-input, #f4f7fb)', color: isSelected ? '#fff' : 'var(--text-muted-darker, #4a6080)', borderColor: isSelected ? primaryColor : 'var(--border-color, #dde5ef)', transition: 'all 0.15s' }}>
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Hora */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ ...lbl, marginBottom: 0 }}>Horario</label>
                  {cargandoHoras && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted, #8fa3bc)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      Cargando slots...
                    </span>
                  )}
                </div>
                {!fecha ? (
                  <div style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--text-muted, #aab8c8)', fontSize: 13, border: '1px dashed var(--border-light, rgba(56,138,221,0.15))', borderRadius: 10 }}>Selecciona una fecha primero</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, maxHeight: 160, overflowY: 'auto', paddingRight: 2 }}>
                    {HORAS.map(h => {
                      const ocupado = horasOcupadas.includes(h)
                      const seleccionado = hora === h
                      return (
                        <button key={h} onClick={() => { if (ocupado) { setConfirmarSobreturno(h); return } setHora(h) }} style={{
                          padding: '0.55rem 0', borderRadius: 8, border: '1px solid', fontSize: 12, fontWeight: seleccionado || (ocupado && hora === h) ? 700 : 500,
                          fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', position: 'relative', transition: 'all 0.1s',
                          background: ocupado && hora === h ? '#FAEEDA' : ocupado ? 'var(--bg-input, #f4f7fb)' : seleccionado ? secondaryColor : '#fff',
                          color: ocupado && hora === h ? '#633806' : ocupado ? 'var(--text-muted, #c5d4e8)' : seleccionado ? '#fff' : 'var(--text-dark, #0a1e3d)',
                          borderColor: ocupado && hora === h ? '#BA7517' : ocupado ? 'var(--border-lighter, rgba(0,0,0,0.02))' : seleccionado ? secondaryColor : 'var(--border-color, #dde5ef)',
                          textDecoration: ocupado && hora !== h ? 'line-through' : 'none',
                        }}>
                          {h}
                          {ocupado && hora === h && (
                            <span style={{ position: 'absolute', top: -5, right: -4, background: '#BA7517', color: '#fff', fontSize: 8, fontWeight: 700, padding: '1px 4.5px', borderRadius: 10, boxShadow: '0 1px 3px rgba(186,117,23,0.3)' }}>ST</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Seña */}
              <div style={card}>
                <label style={lbl}>Seña <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted, #8fa3bc)' }}>(opcional)</span></label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid var(--border-color, #dde5ef)', borderRadius: 10, padding: '0 1rem', boxShadow: '0 1px 2px rgba(10,30,61,0.01)' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-muted, #8fa3bc)', fontWeight: 600, marginRight: 6 }}>$</span>
                  <input type="number" value={sena} onChange={e => setSena(e.target.value)} placeholder="0" min="0" style={{ ...inp, border: 'none', background: 'transparent', padding: '0.65rem 0', boxShadow: 'none' }}/>
                </div>
              </div>

              {/* Notas */}
              <div style={card}>
                <label style={lbl}>Notas <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted, #8fa3bc)' }}>(opcional)</span></label>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Indicaciones, observaciones..." rows={2} style={{ ...inp, resize: 'none' }}/>
              </div>

              {/* Sobreturno alert */}
              {confirmarSobreturno && (
                <div style={{ background: '#FAEEDA', borderRadius: 12, padding: '1rem', border: '1px solid #EF9F27', boxShadow: '0 4px 12px rgba(239,159,39,0.1)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#633806', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ⚠️ Horario Ocupado ({confirmarSobreturno} hs)
                  </div>
                  <div style={{ fontSize: 12, color: '#78350F', marginBottom: 12, lineHeight: 1.4 }}>El consultorio ya tiene un paciente reservado en este horario. ¿Deseas forzar el turno como un sobreturno?</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setConfirmarSobreturno(null)} style={{ flex: 1, padding: '0.55rem 0.8rem', borderRadius: 10, border: '1px solid var(--border-color, #dde5ef)', background: '#fff', color: '#687e96', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancelar</button>
                    <button onClick={() => { setHora(confirmarSobreturno); setEsSobreturno(true); setConfirmarSobreturno(null) }} style={{ flex: 2, padding: '0.55rem 0.8rem', borderRadius: 10, border: 'none', background: '#BA7517', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', boxShadow: '0 2px 6px rgba(186,117,23,0.2)' }}>Confirmar sobreturno</button>
                  </div>
                </div>
              )}

              {/* Colisión paciente */}
              {colisionPaciente && (
                <div style={{ background: '#FFF8E1', borderRadius: 12, padding: '1rem', border: '1px solid #FFD54F', boxShadow: '0 4px 12px rgba(255,213,79,0.1)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ⚠️ Turno duplicado detectado
                  </div>
                  <div style={{ fontSize: 12, color: '#B45309', marginBottom: 12, lineHeight: 1.4 }}><strong style={{ color: '#92400E' }}>{colisionPaciente.nombre}</strong> ya posee un turno futuro reservado para el <strong style={{ color: '#92400E' }}>{colisionPaciente.fecha}</strong>.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setColisionPaciente(null)} style={{ flex: 1, padding: '0.55rem 0.8rem', borderRadius: 10, border: '1px solid var(--border-color, #dde5ef)', background: '#fff', color: '#687e96', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancelar</button>
                    <button onClick={() => guardar(true)} style={{ flex: 2, padding: '0.55rem 0.8rem', borderRadius: 10, border: 'none', background: primaryColor, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Agendar de todos modos</button>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ background: '#FAECE7', borderRadius: 10, padding: '0.75rem 1rem', fontSize: 13, color: '#D85A30', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(216,90,48,0.15)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={() => guardar()}
                disabled={guardando}
                style={{ width: '100%', padding: '0.9rem', borderRadius: 14, border: 'none', background: guardando ? '#e5e5e5' : esSobreturno ? '#BA7517' : `linear-gradient(135deg, ${secondaryColor}, ${primaryColor})`, color: guardando ? '#aaa' : '#fff', fontWeight: 700, fontSize: 14.5, cursor: guardando ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: '2rem', boxShadow: guardando ? 'none' : `0 4px 16px ${secondaryColor}25`, transition: 'all 0.2s' }}
              >
                {guardando
                  ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Guardando...</>
                  : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>{esSobreturno ? 'Agendar sobreturno' : 'Agendar turno'}</>
                }
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
