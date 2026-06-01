'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { triggerConfetti } from '@/lib/confetti'

interface Turno {
  id: string
  fecha_hora: string
  tipo_tratamiento: string
  estado: string
  duracion_minutos: number
  notes: string | null
}

interface Paciente {
  id: string
  nombre: string
  telefono: string
  alergias?: string | null
  antecedentes?: string | null
  progreso_plan_porcentaje?: number
  puntos?: number
  recomendaciones?: string | null
}


interface TenantBranding {
  id: string
  nombre: string
  direccion: string
  telefono: string
  logoUrl?: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  whatsappTemplate: string
}

const ESTADO_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pendiente:  { bg: '#FFF3CD', color: '#856404', label: 'Pendiente' },
  confirmado: { bg: '#D1E7DD', color: '#0A3622', label: 'Confirmado' },
  cancelado:  { bg: '#F8D7DA', color: '#58151C', label: 'Cancelado' },
  completado: { bg: '#E2E3E5', color: '#41464B', label: 'Completado' },
}

function formatFecha(fechaHora: string) {
  const dt = new Date(fechaHora)
  const ar = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const hora = String(ar.getHours()).padStart(2,'0') + ':' + String(ar.getMinutes()).padStart(2,'0')
  return {
    dia: dias[ar.getDay()],
    fecha: ar.getDate() + ' de ' + meses[ar.getMonth()],
    hora,
    full: dias[ar.getDay()] + ' ' + ar.getDate() + ' de ' + meses[ar.getMonth()] + ' a las ' + hora + 'hs'
  }
}

function obtenerSaludo() {
  const hora = new Date().getHours()
  if (hora >= 6 && hora < 12) return 'Buenos días'
  if (hora >= 12 && hora < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

function generateICS(t: Turno, tenant: TenantBranding | null) {
  const start = new Date(t.fecha_hora)
  const end = new Date(start.getTime() + t.duracion_minutos * 60000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'
  
  const doctorName = tenant?.nombre || 'Dr. Walter Benegas'
  const locationName = tenant?.direccion || 'Consultorio Odontológico'

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DentalDesk//ES',
    'BEGIN:VEVENT',
    'UID:' + t.id + '@dentaldesk',
    'DTSTAMP:' + fmt(new Date()),
    'DTSTART:' + fmt(start),
    'DTEND:' + fmt(end),
    'SUMMARY:Turno odontológico - ' + doctorName,
    'DESCRIPTION:Tratamiento: ' + t.tipo_tratamiento + (t.notes ? ' Notas: ' + t.notes : ''),
    'LOCATION:' + locationName,
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio turno odontológico',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')
  const dataUrl = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics)
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = 'turno-' + t.fecha_hora.split('T')[0] + '.ics'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export default function PacientePage() {
  const { token } = useParams<{ token: string }>()
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [tenant, setTenant] = useState<TenantBranding | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [accion, setAccion] = useState<{id:string, tipo:'confirmado'|'cancelado'} | null>(null)
  const [reproConfirm, setReproConfirm] = useState<Turno | null>(null)
  
  const [pastTurnos, setPastTurnos] = useState<any[]>([])
  const [fotos, setFotos] = useState<any[]>([])
  const [feedbackPendiente, setFeedbackPendiente] = useState<any>(null)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [dolor, setDolor] = useState<number>(3)
  const [satisfaccion, setSatisfaccion] = useState<number>(5)
  const [comentario, setComentario] = useState<string>('')
  const [sendingFeedback, setSendingFeedback] = useState(false)

  async function cambiarEstado(citaId: string, nuevoEstado: 'confirmado' | 'cancelado') {
    setAccion({ id: citaId, tipo: nuevoEstado })
    await fetch(`/api/paciente/${token}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citaId, estado: nuevoEstado }),
    })
    setTurnos(prev => prev.map(t => t.id === citaId ? { ...t, estado: nuevoEstado } : t))
    setAccion(null)
  }

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/paciente/${token}`)
      if (!res.ok) { setError(true); setLoading(false); return }
      const data = await res.json()
      setPaciente(data.paciente)
      setTurnos(data.turnos)
      setPastTurnos(data.pastTurnos || [])
      setFotos(data.fotos || [])
      setFeedbackPendiente(data.feedbackPendiente || null)
      if (data.feedbackPendiente) {
        setShowFeedbackModal(true)
      }
      setTenant(data.tenant)
      setLoading(false)
    }
    load()
  }, [token])

  async function enviarFeedback() {
    if (!feedbackPendiente) return
    setSendingFeedback(true)
    try {
      const res = await fetch(`/api/paciente/${token}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dolor,
          satisfaccion,
          comentario,
          citaId: feedbackPendiente.cita_id
        })
      })
      if (res.ok) {
        setFeedbackPendiente(null)
        setShowFeedbackModal(false)
        triggerConfetti()
      } else {
        const d = await res.json()
        alert('Error: ' + d.error)
      }
    } catch (e) {
      console.error(e)
      alert('Error de conexión')
    }
    setSendingFeedback(false)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection: 'column', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans, system-ui', background: '#f8fafc' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(24, 95, 165, 0.08)', borderTopColor: '#185FA5', animation: 'spin 1s cubic-bezier(0.68, -0.55, 0.27, 1.55) infinite' }} />
        <div style={{ color:'#64748b', fontSize:14, fontWeight:600, letterSpacing: '0.02em', animation: 'pulse 1.5s ease-in-out infinite' }}>
          Cargando portal de paciente...
        </div>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
      `}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans, system-ui', background:'#f8fafc' }}>
      <div style={{ textAlign:'center', maxWidth:380, padding:'2.5rem 2rem', background:'#fff', borderRadius:24, boxShadow:'0 10px 30px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)' }}>
        <div style={{ fontSize:48, marginBottom:20, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
        </div>
        <div style={{ fontSize:19, fontWeight:800, color:'#0a1e3d', letterSpacing: '-0.01em' }}>Enlace de turno no válido</div>
        <div style={{ color:'#64748b', marginTop:10, fontSize:14, lineHeight:1.6 }}>Por favor ponte en contacto con tu consultorio para que te envíe un nuevo enlace de acceso.</div>
      </div>
    </div>
  )

  const primaryColor = tenant?.primaryColor || '#0a1e3d'
  const secondaryColor = tenant?.secondaryColor || '#185FA5'
  const accentColor = tenant?.accentColor || '#138A6B'

  const isOrtodoncia = (paciente?.progreso_plan_porcentaje && paciente.progreso_plan_porcentaje > 0) || 
                       pastTurnos.some(t => t.tipo_tratamiento.toLowerCase().includes('ortodoncia')) || 
                       turnos.some(t => t.tipo_tratamiento.toLowerCase().includes('ortodoncia'))
  const isPrimeraVez = pastTurnos.length === 0

  const getMesesTranscurridos = () => {
    if (pastTurnos.length === 0) return 1
    const firstCita = new Date(pastTurnos[pastTurnos.length - 1].fecha_hora)
    const now = new Date()
    const diffYears = now.getFullYear() - firstCita.getFullYear()
    const diffMonths = now.getMonth() - firstCita.getMonth()
    return Math.max(1, diffYears * 12 + diffMonths)
  }

  const getEstimadoMesesRestantes = () => {
    const pct = paciente?.progreso_plan_porcentaje || 0
    if (pct <= 0) return null
    if (pct >= 100) return 'Tratamiento completado'
    const elapsed = getMesesTranscurridos()
    const remaining = Math.max(1, Math.round(elapsed * (100 - pct) / pct))
    return `~${remaining} meses estimados restantes`
  }

  return (
    <div style={{ minHeight:'100vh', fontFamily:'DM Sans, system-ui', padding:'2.5rem 1.25rem', background: 'var(--portal-bg)', transition: 'background-color 0.3s ease' }}>
      <div style={{ maxWidth:480, margin:'0 auto' }}>
        
        {/* Logo de la Clínica */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.nombre || 'Logo clínica'} style={{ height: 56, objectFit: 'contain', borderRadius: 12 }} />
          ) : (
            <div style={{ fontSize: 16, fontWeight: 800, color: primaryColor, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {tenant?.nombre || 'DentalDesk'}
            </div>
          )}
        </div>

        {/* Encabezado Paciente */}
        <div style={{ textAlign:'center', marginBottom:'2.5rem' }}>
          <div style={{ 
            width: 72, 
            height: 72, 
            borderRadius: '24px', 
            background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})`, 
            color: '#fff', 
            fontSize: 30, 
            fontWeight: 800, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 16px', 
            boxShadow: `0 10px 25px ${secondaryColor}25`,
            transform: 'rotate(-4deg)',
            transition: 'transform 0.3s'
          }} 
          onMouseEnter={e => e.currentTarget.style.transform = 'rotate(0deg)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'rotate(-4deg)'}
          >
            {paciente?.nombre ? paciente.nombre.charAt(0).toUpperCase() : 'M'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            {obtenerSaludo()},
          </div>
          <h1 style={{ fontSize:23, fontWeight:800, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em', margin:0 }}>{paciente?.nombre}</h1>
          <div style={{ display: 'inline-block', padding: '4px 12px', background: `${secondaryColor}10`, color: secondaryColor, fontSize: 13, fontWeight: 700, borderRadius: 20, marginTop: 8 }}>
            {paciente?.progreso_plan_porcentaje && paciente.progreso_plan_porcentaje > 0 
              ? `${turnos[0]?.tipo_tratamiento || pastTurnos[0]?.tipo_tratamiento || 'Ortodoncia'} activa · ${getMesesTranscurridos()} meses`
              : 'Consulta General'}
          </div>
        </div>

        {/* Tarjeta de Puntos VIP */}
        {paciente && (
          <div className="patient-card" style={{ 
            padding: '1.25rem', 
            borderRadius: 20, 
            background: 'var(--portal-card-bg)', 
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            borderLeft: `4px solid #EAB308`
          }}>
            <div style={{ 
              width: 44, 
              height: 44, 
              borderRadius: '50%', 
              background: 'rgba(234, 179, 8, 0.1)', 
              color: '#EAB308', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              flexShrink: 0 
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Puntos acumulados</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em' }}>
                  {(() => {
                    const pastNonCanceled = pastTurnos.filter(pt => pt.estado !== 'cancelado')
                    const quantityAsistio = pastNonCanceled.filter(pt => pt.estado === 'asistio' || pt.estado === 'completado').length
                    return (paciente.puntos || 0) + (quantityAsistio * 100)
                  })()}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#EAB308', textTransform: 'uppercase', letterSpacing: '0.02em' }}>puntos vip</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                ¡Seguí asistiendo a tus citas para sumar más y canjearlos por premios!
              </div>
            </div>
          </div>
        )}

        {/* Indicaciones / Recomendaciones del Doctor */}
        {paciente?.recomendaciones && (
          <div className="patient-card" style={{ 
            padding: '1.25rem', 
            borderRadius: 20, 
            background: 'var(--portal-card-bg)', 
            marginBottom: 28,
            borderLeft: `4px solid ${accentColor}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ 
                width: 28, 
                height: 28, 
                borderRadius: '50%', 
                background: `${accentColor}12`, 
                color: accentColor, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Indicaciones de tu Odontólogo
              </span>
            </div>
            <p style={{ color: 'var(--portal-text-secondary)', fontSize: 13.5, lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
              "{paciente.recomendaciones}"
            </p>
          </div>
        )}

        {/* Progreso del tratamiento */}

        {isOrtodoncia && paciente && (paciente.progreso_plan_porcentaje || 0) > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progreso del tratamiento</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--portal-text-primary)' }}>{paciente.progreso_plan_porcentaje}%</span>
            </div>
            <div style={{
              height: 10,
              background: `${secondaryColor}10`,
              borderRadius: 6,
              overflow: 'hidden',
              marginBottom: 8,
              border: '1px solid rgba(0,0,0,0.01)'
            }}>
              <div style={{
                height: '100%',
                width: `${paciente.progreso_plan_porcentaje}%`,
                background: `linear-gradient(90deg, ${secondaryColor}, ${accentColor})`,
                borderRadius: 6,
                boxShadow: `0 2px 6px ${accentColor}25`
              }} />
            </div>
            <div style={{ fontSize:13, color:'var(--portal-text-secondary)', fontWeight:500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {getEstimadoMesesRestantes()}
            </div>
          </div>
        )}

        {/* Banner de Feedback Pendiente */}
        {feedbackPendiente && !showFeedbackModal && (
          <div 
            onClick={() => setShowFeedbackModal(true)}
            style={{ 
              background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})`, 
              color: '#fff', 
              borderRadius: 22, 
              padding: '1.25rem', 
              marginBottom: 24, 
              cursor: 'pointer',
              boxShadow: `0 8px 24px ${secondaryColor}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              transition: 'transform 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.015)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>Control Post-Visita</div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>¿Cómo te sientes tras tu turno de {feedbackPendiente.tipo_tratamiento}?</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Ayúdanos a cuidarte respondiendo 3 breves preguntas.</div>
            </div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.4))' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
        )}

        {/* Próximo turno */}
        {turnos.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize:15, fontWeight:800, color:'var(--portal-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom:12 }}>Próximo turno</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {turnos.map(t => {
                const { dia, fecha, hora } = formatFecha(t.fecha_hora)
                return (
                  <div key={t.id} className="patient-card" style={{ borderRadius:22, padding:'1.5rem', background: 'var(--portal-card-bg)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                      <div>
                        <div style={{ fontSize:18, fontWeight:800, color: 'var(--portal-text-primary)', letterSpacing: '-0.01em' }}>{dia} {fecha} · {hora} hs</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
                          <span style={{ fontSize:14, fontWeight:600, color: 'var(--portal-text-secondary)' }}>{t.tipo_tratamiento}</span>
                          <span style={{ fontSize:14, color:'var(--portal-text-muted)' }}>· {t.duracion_minutos} min</span>
                        </div>
                      </div>
                    </div>

                    {t.estado === 'pendiente' ? (
                      <div style={{ display:'flex', flexDirection: 'column', gap:10 }}>
                        <div style={{ display:'flex', gap:10 }}>
                          <button
                            onClick={() => cambiarEstado(t.id, 'confirmado')}
                            disabled={accion?.id===t.id}
                            style={{ 
                              flex:1, 
                              fontSize:14, 
                              padding:'12px', 
                              borderRadius:14, 
                              border:'none', 
                              background: accentColor, 
                              color: '#fff', 
                              cursor:'pointer', 
                              fontWeight:700, 
                              fontFamily:'DM Sans, system-ui', 
                              boxShadow: `0 4px 12px ${accentColor}30`, 
                              transition:'all 0.2s ease-in-out' 
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.transform = 'translateY(-1px)'
                              e.currentTarget.style.boxShadow = `0 6px 16px ${accentColor}45`
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.transform = 'none'
                              e.currentTarget.style.boxShadow = `0 4px 12px ${accentColor}30`
                            }}
                          >
                            {accion?.id===t.id ? 'Confirmando...' : 'Confirmar Turno'}
                          </button>
                          <button
                            onClick={() => setReproConfirm(t)}
                            disabled={accion?.id===t.id}
                            style={{ 
                              flex:1, 
                              fontSize:14, 
                              padding:'12px', 
                              borderRadius:14, 
                              border:`1px solid ${secondaryColor}20`, 
                              background: `${secondaryColor}0a`, 
                              color: secondaryColor, 
                              cursor:'pointer', 
                              fontWeight:600, 
                              fontFamily:'DM Sans, system-ui', 
                              transition:'all 0.2s' 
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = `${secondaryColor}12`
                              e.currentTarget.style.borderColor = `${secondaryColor}40`
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = `${secondaryColor}0a`
                              e.currentTarget.style.borderColor = `${secondaryColor}20`
                            }}
                          >
                            Reprogramar
                          </button>
                        </div>
                        <button
                          onClick={() => generateICS(t, tenant)}
                          style={{ 
                            width:'100%', 
                            fontSize:13, 
                            padding:'11px', 
                            borderRadius:14, 
                            border:'1px solid var(--portal-card-border)', 
                            background: 'transparent', 
                            color: 'var(--portal-text-secondary)', 
                            cursor:'pointer', 
                            fontWeight:600, 
                            fontFamily:'DM Sans, system-ui', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: 8, 
                            transition: 'all 0.2s' 
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(10,30,61,0.02)'
                            e.currentTarget.style.borderColor = 'rgba(10,30,61,0.1)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.borderColor = 'var(--portal-card-border)'
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          Agregar a mi calendario
                        </button>
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection: 'column', gap:10 }}>
                        <div style={{ display:'flex', gap:10 }}>
                          <div
                            style={{ 
                              flex:1, 
                              fontSize:14, 
                              padding:'12px', 
                              borderRadius:14, 
                              background: `${accentColor}10`, 
                              border: `1px solid ${accentColor}25`, 
                              color: accentColor, 
                              fontWeight:700, 
                              fontFamily:'DM Sans, system-ui', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              gap: 6 
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Turno Confirmado
                          </div>
                          <button
                            onClick={() => setReproConfirm(t)}
                            style={{ 
                              flex:1, 
                              fontSize:14, 
                              padding:'12px', 
                              borderRadius:14, 
                              border:`1px solid ${secondaryColor}20`, 
                              background: `${secondaryColor}0a`, 
                              color: secondaryColor, 
                              cursor:'pointer', 
                              fontWeight:600, 
                              fontFamily:'DM Sans, system-ui', 
                              transition:'all 0.2s' 
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = `${secondaryColor}12`
                              e.currentTarget.style.borderColor = `${secondaryColor}40`
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = `${secondaryColor}0a`
                              e.currentTarget.style.borderColor = `${secondaryColor}20`
                            }}
                          >
                            Reprogramar
                          </button>
                        </div>
                        <button
                          onClick={() => generateICS(t, tenant)}
                          style={{ 
                            width:'100%', 
                            fontSize:13, 
                            padding:'11px', 
                            borderRadius:14, 
                            border:'1px solid var(--portal-card-border)', 
                            background: 'transparent', 
                            color: 'var(--portal-text-secondary)', 
                            cursor:'pointer', 
                            fontWeight:600, 
                            fontFamily:'DM Sans, system-ui', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: 8, 
                            transition: 'all 0.2s' 
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(10,30,61,0.02)'
                            e.currentTarget.style.borderColor = 'rgba(10,30,61,0.1)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.borderColor = 'var(--portal-card-border)'
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          Agregar a mi calendario
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        {isOrtodoncia && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 28 }}>
            
            <div className="patient-card" style={{ padding: '16px', borderRadius: 18, borderLeft: `4px solid ${secondaryColor}`, background: 'var(--portal-card-bg)' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em' }}>
                {pastTurnos.filter(pt => pt.estado === 'asistio' || pt.estado === 'completado').length}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>
                Visitas totales
              </div>
            </div>
            
            <div className="patient-card" style={{ padding: '16px', borderRadius: 18, borderLeft: `4px solid ${accentColor}`, background: 'var(--portal-card-bg)' }}>
              {(() => {
                const pastNonCanceled = pastTurnos.filter(pt => pt.estado !== 'cancelado')
                const attendedCount = pastNonCanceled.filter(pt => pt.estado === 'asistio' || pt.estado === 'completado').length
                const adherence = pastNonCanceled.length > 0 ? Math.round((attendedCount / pastNonCanceled.length) * 100) : 100
                return (
                  <>
                    <div style={{ fontSize: 26, fontWeight: 800, color: accentColor, letterSpacing: '-0.02em' }}>{adherence}%</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>Adherencia</div>
                  </>
                )
              })()}
            </div>
            
            <div className="patient-card" style={{ padding: '16px', borderRadius: 18, borderLeft: `4px solid ${primaryColor}`, background: 'var(--portal-card-bg)' }}>
              {(() => {
                const pct = paciente?.progreso_plan_porcentaje || 0
                const elapsed = getMesesTranscurridos()
                const remaining = pct > 0 ? Math.max(1, Math.round(elapsed * (100 - pct) / pct)) : 0
                return (
                  <>
                    <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em' }}>{remaining}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>Meses restantes</div>
                  </>
                )
              })()}
            </div>
            
            <div className="patient-card" style={{ padding: '16px', borderRadius: 18, borderLeft: '4px solid #94a3b8', background: 'var(--portal-card-bg)' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em' }}>{fotos.length}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>Fotos</div>
            </div>
          </div>
        )}

        {/* Adherence microcopy (no emojis) */}
        {isOrtodoncia && (() => {
          const pastNonCanceled = pastTurnos.filter(pt => pt.estado !== 'cancelado')
          const attendedCount = pastNonCanceled.filter(pt => pt.estado === 'asistio' || pt.estado === 'completado').length
          const adherence = pastNonCanceled.length > 0 ? Math.round((attendedCount / pastNonCanceled.length) * 100) : 100
          let message = 'Sos de los pacientes más constantes'
          if (adherence < 80) message = 'A seguir mejorando la regularidad'
          else if (adherence < 90) message = 'Excelente constancia en tus visitas'
          return (
            <div style={{ marginBottom: 28, padding: '12px', background: `${accentColor}0e`, borderRadius: 14, fontSize: 13, fontWeight: 600, color: accentColor, textAlign: 'center', border: `1px solid ${accentColor}20` }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 6 }}><polyline points="20 6 9 17 4 12"/></svg>
              {message}
            </div>
          )
        })()}

        {/* Últimas visitas */}
        {pastTurnos.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize:15, fontWeight:800, color:'var(--portal-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom:12 }}>Últimas visitas</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pastTurnos.slice(-3).reverse().map(pt => (
                <div key={pt.id} className="patient-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius:18, padding:'1rem 1.25rem', background: 'var(--portal-card-bg)' }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color: 'var(--portal-text-primary)' }}>{pt.tipo_tratamiento}</div>
                    <div style={{ fontSize:13, color:'var(--portal-text-muted)', marginTop:3 }}>{formatFecha(pt.fecha_hora).fecha}</div>
                  </div>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${accentColor}12`, color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fotos de progreso */}
        {isOrtodoncia && fotos.length > 0 && (
          <div style={{ marginBottom: 28 }}>
             <h3 style={{ fontSize:15, fontWeight:800, color:'var(--portal-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom:12 }}>Fotos del proceso</h3>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
               {fotos.length >= 2 && (
                 <div className="patient-card" style={{ borderRadius:20, padding:'1.25rem', background: 'var(--portal-card-bg)' }}>
                   <div style={{ display:'flex', gap:12 }}>
                     <div style={{ flex:1, textAlign:'center' }}>
                       <div style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:800, marginBottom:8, letterSpacing: '0.04em' }}>ANTES</div>
                       <img src={fotos[0].url} alt="Antes" style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', borderRadius:12, boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }} />
                     </div>
                     <div style={{ flex:1, textAlign:'center' }}>
                       <div style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:800, marginBottom:8, letterSpacing: '0.04em' }}>DESPUÉS</div>
                       <img src={fotos[fotos.length-1].url} alt="Después" style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', borderRadius:12, boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }} />
                     </div>
                   </div>
                 </div>
               )}
             </div>
          </div>
        )}

        {/* Engagement para Pacientes No Ortodoncia / Primera Vez */}
        {!isOrtodoncia && (
          <div style={{ marginBottom: 28 }}>
            {isPrimeraVez && (
              <div style={{ marginBottom: 20, textAlign: 'center' }}>
                <div style={{ display: 'inline-block', padding: '6px 14px', background: `${accentColor}12`, color: accentColor, borderRadius: 20, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  ¡Hola, te esperamos!
                </div>
                <p style={{ color: 'var(--portal-text-secondary)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  Conocé por qué nuestros pacientes nos eligen cada día.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Reviews */}
              <div className="patient-card" style={{ padding: '16px', borderRadius: 18, background: 'var(--portal-card-bg)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text-primary)' }}>4.9 en Google Reviews</div>
                  <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                    Atención cien por ciento personalizada y calidez humana. Priorizamos tu comodidad.
                  </div>
                </div>
              </div>

              {/* Turnos Inmediatos */}
              <div className="patient-card" style={{ padding: '16px', borderRadius: 18, background: 'var(--portal-card-bg)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: `${accentColor}12`, color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text-primary)' }}>Turnos inmediatos</div>
                  <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                    Sabemos que tu tiempo vale. Ofrecemos disponibilidad rápida y sin largas esperas.
                  </div>
                </div>
              </div>

              {/* Ubicación */}
              <div className="patient-card" style={{ padding: '16px', borderRadius: 18, background: 'var(--portal-card-bg)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: `${secondaryColor}12`, color: secondaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text-primary)' }}>Ubicación premium</div>
                  <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                    {tenant?.direccion || 'Av. Santa Fe 3329 1 B, Palermo.'} A pasos de la estación de Subte Línea D.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ textAlign:'center', marginTop:'3rem', fontSize:12, color:'var(--portal-text-muted)', fontWeight:600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {tenant?.nombre || 'Dr. Walter Benegas'} {tenant?.direccion ? `— ${tenant.direccion}` : ''}
        </div>
      </div>

      {/* Modal / Bottom Sheet Cuestionario Post-Visita */}
      {showFeedbackModal && feedbackPendiente && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,30,61,0.5)', backdropFilter:'blur(10px)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'0 0 env(safe-area-inset-bottom,0)' }} onClick={() => setShowFeedbackModal(false)}>
          <div style={{ background:'var(--portal-card-bg,#fff)', borderRadius:'28px 28px 0 0', padding:'1.75rem 1.5rem 2.25rem', width:'100%', maxWidth:480, boxShadow:'0 -12px 40px rgba(10,30,61,0.12)', borderTop:'1px solid var(--portal-card-border)' }} onClick={e=>e.stopPropagation()}>
            <div style={{ width:40, height:4, borderRadius:4, background:'#e2e8f0', margin:'0 auto 1.25rem' }}/>
            
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={{ fontSize:19, fontWeight:800, color:'var(--portal-text-primary)', letterSpacing: '-0.02em', marginBottom:4 }}>Cuestionario de Control</div>
              <div style={{ fontSize:13, color:'var(--portal-text-secondary)', lineHeight:1.5 }}>
                Queremos saber cómo estás tras tu cita de <strong>{feedbackPendiente.tipo_tratamiento}</strong>.
              </div>
            </div>

            {/* Dolor Selector */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-primary)', display: 'block', marginBottom: 12, textAlign:'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ¿Sentís alguna molestia o dolor?
              </label>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 300, margin: '0 auto', gap: 10 }}>
                {[
                  {
                    value: 1,
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
                    label: 'Sin dolor'
                  },
                  {
                    value: 3,
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
                    label: 'Molestia'
                  },
                  {
                    value: 5,
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
                    label: 'Dolor'
                  }
                ].map(item => {
                  const selected = dolor === item.value
                  return (
                    <button
                      key={item.value}
                      onClick={() => setDolor(item.value)}
                      style={{
                        flex: 1, 
                        padding: '12px 6px', 
                        borderRadius: 16,
                        border: '2px solid ' + (selected ? accentColor : 'var(--portal-card-border)'),
                        background: selected ? `${accentColor}12` : 'transparent',
                        color: selected ? accentColor : 'var(--portal-text-muted)',
                        cursor: 'pointer', 
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        gap: 6
                      }}
                    >
                      {item.icon}
                      <span style={{ fontSize: 10, fontWeight: 800 }}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Satisfacción Selector */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-primary)', display: 'block', marginBottom: 10, textAlign:'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ¿Cómo calificarías la atención?
              </label>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
                {[1, 2, 3, 4, 5].map(val => {
                  const active = val <= satisfaccion
                  return (
                    <button
                      key={val}
                      onClick={() => setSatisfaccion(val)}
                      style={{
                        background: 'transparent', 
                        border: 'none', 
                        cursor: 'pointer', 
                        padding: 4,
                        transition: 'transform 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill={active ? "#F59E0B" : "none"} stroke={active ? "#F59E0B" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Comentarios */}
            <div style={{ marginBottom: 26 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-primary)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Comentario o duda adicional
              </label>
              <textarea
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                placeholder="Contanos si tenés inflamación, dudas sobre la medicación o cualquier comentario..."
                style={{
                  width: '100%', 
                  height: 80, 
                  padding: '12px 14px', 
                  borderRadius: 14, 
                  border: '1px solid var(--portal-card-border)',
                  background: 'rgba(255, 255, 255, 0.4)', 
                  color: 'var(--portal-text-primary)', 
                  fontFamily: 'inherit', 
                  fontSize: 14,
                  resize: 'none', 
                  outline: 'none',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)'
                }}
              />
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowFeedbackModal(false)}
                disabled={sendingFeedback}
                style={{
                  flex: 1, 
                  padding: '13px', 
                  borderRadius: 14, 
                  border: '1px solid var(--portal-card-border)',
                  background: 'transparent', 
                  color: 'var(--portal-text-secondary)',
                  fontSize: 13, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontFamily: 'DM Sans, system-ui',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Omitir por ahora
              </button>
              <button
                onClick={enviarFeedback}
                disabled={sendingFeedback}
                style={{
                  flex: 1.5, 
                  padding: '13px', 
                  borderRadius: 14, 
                  border: 'none',
                  background: secondaryColor, 
                  color: '#fff',
                  fontSize: 13, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontFamily: 'DM Sans, system-ui',
                  boxShadow: `0 4px 14px ${secondaryColor}30`, 
                  opacity: sendingFeedback ? 0.6 : 1,
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'none'}
              >
                {sendingFeedback ? 'Enviando...' : 'Enviar Respuestas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule confirmation modal sheet */}
      {reproConfirm && (
        <div style={{position:'fixed',inset:0,background:'rgba(10,30,61,0.5)',backdropFilter:'blur(10px)',zIndex:9999,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 0 env(safe-area-inset-bottom,0)'}}>
          <div style={{background:'var(--portal-card-bg,#fff)',borderRadius:'28px 28px 0 0',padding:'1.75rem 1.5rem 2.25rem',width:'100%',maxWidth:480,boxShadow:'0 -12px 40px rgba(10,30,61,0.12)'}}>
            <div style={{width:40,height:4,borderRadius:4,background:'#e2e8f0',margin:'0 auto 1.5rem'}}/>
            <div style={{textAlign:'center',marginBottom:24}}>
              <div style={{width:54,height:54,borderRadius:'50%',background:`${secondaryColor}12`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={secondaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
              </div>
              <div style={{fontSize:18,fontWeight:800,color:'var(--portal-text-primary)',letterSpacing: '-0.02em', marginBottom:6}}>Reprogramar o Cancelar</div>
              <div style={{fontSize:14,color:'var(--portal-text-secondary)',lineHeight:1.6,padding:'0 12px'}}>
                Para reprogramar o cancelar tu turno, comunícate con nosotros vía WhatsApp o llamada para coordinar un nuevo horario.
              </div>
            </div>
            
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {/* WhatsApp template link to clinic's phone */}
              {tenant?.telefono && (
                <a
                  href={`https://wa.me/${tenant.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Hola! Me contacto para reprogramar o cancelar mi turno del día ${formatFecha(reproConfirm.fecha_hora).fecha} a las ${formatFecha(reproConfirm.fecha_hora).hora} hs (Tratamiento: ${reproConfirm.tipo_tratamiento}). Mi nombre es ${paciente?.nombre}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    textDecoration: 'none', 
                    display:'flex', 
                    alignItems:'center', 
                    justifyContent:'center', 
                    gap:8, 
                    fontSize:14, 
                    padding:'14px', 
                    borderRadius:14, 
                    border:'none', 
                    background:'linear-gradient(135deg,#25D366,#128C7E)', 
                    color:'#fff', 
                    cursor:'pointer', 
                    fontWeight:700, 
                    fontFamily:'DM Sans, system-ui', 
                    boxShadow: '0 4px 14px rgba(37,211,102,0.2)', 
                    transition:'transform 0.2s'
                  }}
                  onMouseEnter={e=>e.currentTarget.style.transform='scale(1.015)'}
                  onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.66.986 3.288 1.488 4.905 1.489 5.5.003 9.975-4.47 9.979-9.967.002-2.662-1.033-5.166-2.915-7.05C16.734 1.744 14.236.703 11.58.701c-5.503 0-9.98 4.47-9.985 9.969-.001 1.776.48 3.5 1.391 5.01L1.93 21.72l6.147-1.611-.43-.255z"/></svg>
                  Enviar WhatsApp al Consultorio
                </a>
              )}
              
              {/* Direct call to clinic */}
              {tenant?.telefono && (
                <a
                  href={`tel:${tenant.telefono.replace(/\s/g, '')}`}
                  style={{
                    textDecoration: 'none', 
                    display:'flex', 
                    alignItems:'center', 
                    justifyContent:'center', 
                    gap:8, 
                    fontSize:14, 
                    padding:'14px', 
                    borderRadius:14, 
                    border:`1px solid ${secondaryColor}25`, 
                    background:`${secondaryColor}0a`, 
                    color: secondaryColor, 
                    cursor:'pointer', 
                    fontWeight:700, 
                    fontFamily:'DM Sans, system-ui', 
                    transition:'transform 0.2s'
                  }}
                  onMouseEnter={e=>e.currentTarget.style.transform='scale(1.015)'}
                  onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                >
                  📞 Llamar al Consultorio
                </a>
              )}

              <button
                onClick={() => setReproConfirm(null)}
                style={{
                  marginTop: 6, 
                  padding:'13px', 
                  borderRadius:14, 
                  border:'1px solid var(--portal-card-border)', 
                  background:'transparent', 
                  color:'var(--portal-text-secondary)', 
                  fontSize:13, 
                  fontWeight:700, 
                  cursor:'pointer', 
                  fontFamily:'DM Sans, system-ui',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,0.02)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        :root {
          --portal-bg: #FAF9F6;
          --portal-card-bg: rgba(255, 255, 255, 0.88);
          --portal-card-border: rgba(10, 30, 61, 0.05);
          --portal-text-primary: ${primaryColor};
          --portal-text-secondary: #4a5568;
          --portal-text-muted: #8a99ad;
          --portal-shadow: rgba(10, 30, 61, 0.02);
        }
        body {
          background-color: var(--portal-bg) !important;
          color: var(--portal-text-primary) !important;
          background-image: 
            radial-gradient(at 0% 0%, ${secondaryColor}0f 0px, transparent 50%),
            radial-gradient(at 100% 100%, ${accentColor}0f 0px, transparent 50%);
          background-attachment: fixed;
          transition: background-color 0.3s, color 0.3s;
        }
        .patient-card {
          background: var(--portal-card-bg) !important;
          border: 1px solid var(--portal-card-border) !important;
          box-shadow: 0 10px 30px rgba(10, 30, 61, 0.02), 0 1px 3px rgba(10, 30, 61, 0.01) !important;
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .patient-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 35px rgba(10, 30, 61, 0.05) !important;
          border-color: ${secondaryColor}20 !important;
        }
      `}</style>
    </div>
  )
}