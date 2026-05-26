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

function compartirWhatsApp(t: Turno, paciente: Paciente, token: string, tenant: TenantBranding | null) {
  const { dia, fecha, hora } = formatFecha(t.fecha_hora)
  
  const doctorName = tenant?.nombre || 'Dr. Walter Benegas'
  const address = tenant?.direccion || 'Av. Santa Fe 3329 1° B, Palermo, CABA'
  const template = tenant?.whatsappTemplate || `Hola {nombre_paciente},\n\nTe recordamos tu turno con el *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n\nConfirma o cancela tu turno acá:\n{link}\n\nRecordá que los turnos no cancelados con más de 48hs de anticipación o no asistidos deben ser abonados.\n\n_{nombre_clinica} - {direccion}_`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://turnos-app-delta.vercel.app'
  const link = `${appUrl}/paciente/${token}`

  const msgText = template
    .replace(/{nombre_paciente}/g, paciente.nombre)
    .replace(/{dia_semana}/g, dia)
    .replace(/{fecha}/g, fecha)
    .replace(/{hora}/g, hora)
    .replace(/{tratamiento}/g, t.tipo_tratamiento)
    .replace(/{link}/g, link)
    .replace(/{nombre_doctor}/g, doctorName)
    .replace(/{nombre_clinica}/g, doctorName)
    .replace(/{direccion}/g, address)

  const msg = encodeURIComponent(msgText)
  window.open('https://wa.me/?text=' + msg, '_blank')
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
  
  // Tabs and History states
  const [activeTab, setActiveTab] = useState<'turnos' | 'historial' | 'plan' | 'fotos'>('turnos')
  const [historial, setHistorial] = useState<any[]>([])
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
      setHistorial(data.historial || [])
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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans, system-ui' }}>
      <div style={{ color:'#8fa3bc', display:'flex', alignItems:'center', gap:10, fontSize:15, fontWeight:500 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        Cargando tus turnos...
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans, system-ui', background:'#f8fafc' }}>
      <div style={{ textAlign:'center', maxWidth:360, padding:'2rem', background:'#fff', borderRadius:24, boxShadow:'0 10px 30px rgba(0,0,0,0.05)' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔍</div>
        <div style={{ fontSize:18, fontWeight:700, color:'#0a1e3d' }}>Enlace de turno no válido</div>
        <div style={{ color:'#8fa3bc', marginTop:8, fontSize:14, lineHeight:1.5 }}>Por favor ponte en contacto con tu odontólogo para que te envíe un nuevo enlace de gestión.</div>
      </div>
    </div>
  )

  const primaryColor = tenant?.primaryColor || '#0a1e3d'
  const secondaryColor = tenant?.secondaryColor || '#185FA5'
  const accentColor = tenant?.accentColor || '#138A6B'

  return (
    <div style={{ minHeight:'100vh', fontFamily:'DM Sans, system-ui', padding:'2.5rem 1.25rem', background: 'var(--portal-bg)', transition: 'background-color 0.3s ease' }}>
      <div style={{ maxWidth:480, margin:'0 auto' }}>
        
        {/* Encabezado */}
        <div style={{ textAlign:'center', marginBottom:'2.5rem' }}>
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.nombre} style={{ height: 60, margin: '0 auto 16px', display: 'block', objectFit: 'contain' }} />
          ) : (
            <div style={{ fontSize:44, marginBottom:8, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.06))' }}>🦷</div>
          )}
          <h1 style={{ fontSize:22, fontWeight:800, color: 'var(--portal-text-primary)', letterSpacing: '-0.5px', margin:0 }}>Hola, {paciente?.nombre}</h1>
          <p style={{ color:'var(--portal-text-muted)', fontSize:14, marginTop:6, fontWeight:500 }}>Gestiona tus próximos turnos programados</p>
        </div>

        {/* Banner de Feedback Pendiente */}
        {feedbackPendiente && !showFeedbackModal && (
          <div 
            onClick={() => setShowFeedbackModal(true)}
            style={{ 
              background: `linear-gradient(135deg, ${secondaryColor}, ${primaryColor})`, 
              color: '#fff', 
              borderRadius: 20, 
              padding: '1.25rem', 
              marginBottom: 20, 
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(24, 95, 165, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              transition: 'transform 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>Control Post-Visita</div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3 }}>¿Cómo te sientes tras tu turno de {feedbackPendiente.tipo_tratamiento}?</div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>Ayúdanos a cuidarte respondiendo 3 breves preguntas.</div>
            </div>
            <span style={{ fontSize: 24 }}>💬</span>
          </div>
        )}

        {/* Ficha Clínica Viva Stats Panel */}
        <div className="patient-card" style={{ borderRadius:20, padding:'1.25rem', marginBottom:20, border:'1px solid var(--portal-card-border)', background:'var(--portal-card-bg)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--portal-card-border)', paddingBottom:12, marginBottom:12 }}>
            <div>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--portal-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Tratamiento Activo</span>
              <div style={{ fontSize:15, fontWeight:800, color:'var(--portal-text-primary)', marginTop:2 }}>
                {paciente?.progreso_plan_porcentaje && paciente.progreso_plan_porcentaje > 0 
                  ? (turnos[0]?.tipo_tratamiento || pastTurnos[0]?.tipo_tratamiento || 'Ortodoncia')
                  : 'Consulta / Control'}
              </div>
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:accentColor, background:'rgba(19,138,107,0.08)', padding:'4px 10px', borderRadius:20 }}>
              {paciente?.progreso_plan_porcentaje && paciente.progreso_plan_porcentaje > 0 ? 'Activo' : 'Básico'}
            </span>
          </div>
          
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
            <div style={{ textAlign:'center', borderRight:'1px solid var(--portal-card-border)' }}>
              <span style={{ fontSize:20, fontWeight:800, color:secondaryColor }}>{pastTurnos.filter(pt => pt.estado === 'asistio' || pt.estado === 'completado').length}</span>
              <div style={{ fontSize:9.5, fontWeight:600, color:'var(--portal-text-muted)', marginTop:2, textTransform:'uppercase', letterSpacing:'0.02em' }}>Visitas</div>
            </div>
            
            <div style={{ textAlign:'center', borderRight:'1px solid var(--portal-card-border)' }}>
              {(() => {
                const pastNonCanceled = pastTurnos.filter(pt => pt.estado !== 'cancelado')
                const attendedCount = pastNonCanceled.filter(pt => pt.estado === 'asistio' || pt.estado === 'completado').length
                const adherence = pastNonCanceled.length > 0 
                  ? Math.round((attendedCount / pastNonCanceled.length) * 100) 
                  : 100
                return (
                  <span style={{ fontSize:20, fontWeight:800, color:adherence >= 80 ? '#10B981' : '#F59E0B' }}>
                    {adherence}%
                  </span>
                )
              })()}
              <div style={{ fontSize:9.5, fontWeight:600, color:'var(--portal-text-muted)', marginTop:2, textTransform:'uppercase', letterSpacing:'0.02em' }}>Adherencia</div>
            </div>
            
            <div style={{ textAlign:'center' }}>
              <span style={{ fontSize:20, fontWeight:800, color:accentColor }}>{fotos.length}</span>
              <div style={{ fontSize:9.5, fontWeight:600, color:'var(--portal-text-muted)', marginTop:2, textTransform:'uppercase', letterSpacing:'0.02em' }}>Fotos</div>
            </div>
          </div>
        </div>

        {/* Tabs switcher */}
        <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--portal-card-bg)', borderRadius: 14, marginBottom: 20, border: '1px solid var(--portal-card-border)', boxShadow: '0 2px 8px var(--portal-shadow)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {[
            { id: 'turnos', label: '📅 Turnos' },
            { id: 'historial', label: '🦷 Historial' },
            { id: 'plan', label: '📊 Mi Plan' },
            { id: 'fotos', label: '📸 Fotos' }
          ].map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10, border: 'none',
                  background: active ? secondaryColor : 'transparent',
                  color: active ? '#fff' : 'var(--portal-text-secondary)',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'DM Sans, system-ui', transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Panel: Turnos */}
        {activeTab === 'turnos' && (
          <>
            {turnos.length === 0 ? (
              <div className="patient-card" style={{ textAlign:'center', padding:'3rem 2rem', borderRadius:20, color:'var(--portal-text-muted)', fontSize:14 }}>
                No tienes turnos próximos programados en este momento.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {turnos.map(t => {
                  const { dia, fecha, hora } = formatFecha(t.fecha_hora)
                  const est = ESTADO_STYLE[t.estado] || ESTADO_STYLE.pendiente
                  return (
                    <div key={t.id} className="patient-card" style={{ borderRadius:20, padding:'1.5rem', border:'1px solid var(--portal-card-border)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                        <div>
                          <div style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>{dia}</div>
                          <div style={{ fontSize:18, fontWeight:800, color: 'var(--portal-text-primary)', marginTop:3 }}>{fecha}</div>
                          <div style={{ fontSize:20, fontWeight:800, color: secondaryColor, marginTop:2 }}>{hora} hs</div>
                          
                          <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:12, background:'rgba(24,95,165,0.06)', padding:'6px 12px', borderRadius:10 }}>
                            <span style={{ fontSize:13, fontWeight:600, color: secondaryColor }}>🦷 {t.tipo_tratamiento}</span>
                            <span style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:500 }}>· {t.duracion_minutos} min</span>
                          </div>
                          
                          {t.notes && (
                            <div style={{ fontSize:13, color:'var(--portal-text-secondary)', marginTop:12, paddingLeft:10, borderLeft:`2.5px solid ${secondaryColor}`, fontStyle:'italic' }}>
                              {t.notes}
                            </div>
                          )}
                        </div>
                        <span style={{ background:est.bg, color:est.color, fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20, textTransform:'uppercase', letterSpacing:'0.04em' }}>{est.label}</span>
                      </div>

                      <div style={{ display:'flex', gap:10, marginTop:16 }}>
                        <button
                          onClick={() => compartirWhatsApp(t, paciente!, token, tenant)}
                          style={{ flex:1.8, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:13, padding:'10px 14px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#25D366,#128C7E)', color:'#fff', cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui', boxShadow: '0 4px 12px rgba(37,211,102,0.15)', transition:'transform 0.2s' }}
                          onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'}
                          onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.66.986 3.288 1.488 4.905 1.489 5.5.003 9.975-4.47 9.979-9.967.002-2.662-1.033-5.166-2.915-7.05C16.734 1.744 14.236.703 11.58.701c-5.503 0-9.98 4.47-9.985 9.969-.001 1.776.48 3.5 1.391 5.01L1.93 21.72l6.147-1.611-.43-.255z"/></svg>
                          Enviar WhatsApp
                        </button>
                        <button
                          onClick={() => generateICS(t, tenant)}
                          style={{ flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:13, padding:'10px 14px', borderRadius:12, border:`1px solid ${secondaryColor}25`, background:`rgba(232,240,252,0.8)`, color: secondaryColor, cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui', transition:'transform 0.2s' }}
                          onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'}
                          onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                        >
                          📅 Agendar
                        </button>
                      </div>

                      {t.estado === 'pendiente' && (
                        <div style={{ display:'flex', gap:10, marginTop:10 }}>
                          <button
                            onClick={() => cambiarEstado(t.id, 'confirmado')}
                            disabled={accion?.id===t.id}
                            style={{ flex:1, fontSize:13, padding:'11px', borderRadius:12, border:'none', background: '#D1E7DD', color: '#0A3622', cursor:'pointer', fontWeight:700, fontFamily:'DM Sans, system-ui', boxShadow: '0 3px 10px rgba(10,54,34,0.06)', transition:'transform 0.2s' }}
                            onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'}
                            onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                          >
                            {accion?.id===t.id&&accion.tipo==='confirmado'?'...':'Confirmar asistencia'}
                          </button>
                          <button
                            onClick={() => setReproConfirm(t)}
                            disabled={accion?.id===t.id}
                            style={{ flex:1, fontSize:13, padding:'11px', borderRadius:12, border:'none', background: 'rgba(24,95,165,0.06)', color: secondaryColor, cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui', transition:'transform 0.2s' }}
                            onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'}
                            onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                          >
                            {accion?.id===t.id&&accion.tipo==='cancelado'?'...':'Reprogramar'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Tab Panel: Historial */}
        {activeTab === 'historial' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {pastTurnos.length === 0 && historial.length === 0 ? (
              <div className="patient-card" style={{ textAlign:'center', padding:'3rem 2rem', borderRadius:20, color:'var(--portal-text-muted)', fontSize:14 }}>
                No hay tratamientos o visitas anteriores registradas.
              </div>
            ) : (
              <>
                {/* Past appointments */}
                {pastTurnos.length > 0 && (
                  <div>
                    <h3 style={{ fontSize:14, fontWeight:800, color:'var(--portal-text-primary)', marginBottom:10 }}>Visitas Anteriores</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {pastTurnos.map(pt => (
                        <div key={pt.id} className="patient-card" style={{ borderRadius:18, padding:'1.25rem', border:'1px solid var(--portal-card-border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:700 }}>{formatFecha(pt.fecha_hora).full}</div>
                              <div style={{ fontSize:14, fontWeight:800, color: 'var(--portal-text-primary)', marginTop:3 }}>🦷 {pt.tipo_tratamiento}</div>
                            </div>
                            <span style={{ fontSize:10, fontWeight:700, color:'#0A3622', background:'#D1E7DD', padding:'2px 8px', borderRadius:20, textTransform:'uppercase' }}>Atendido</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Historial dental logs */}
                {historial.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <h3 style={{ fontSize:14, fontWeight:800, color:'var(--portal-text-primary)', marginBottom:10 }}>Evolución Dental</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {historial.map(h => (
                        <div key={h.id} className="patient-card" style={{ borderRadius:18, padding:'1.25rem', borderLeft:`4px solid ${secondaryColor}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight:800, fontSize:13.5, color: 'var(--portal-text-primary)' }}>Pieza {h.diente}</span>
                            <span style={{ fontSize:11, fontWeight:700, color: secondaryColor, background:'rgba(24,95,165,0.06)', padding:'2px 8px', borderRadius:8 }}>{h.estado}</span>
                          </div>
                          {h.notas && <div style={{ fontSize:12.5, color:'var(--portal-text-secondary)', marginTop:6, fontStyle:'italic' }}>"{h.notas}"</div>}
                          <div style={{ fontSize:10.5, color:'var(--portal-text-muted)', marginTop:6, fontWeight:500 }}>Registrado el {new Date(h.creado_en).toLocaleDateString('es-AR')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab Panel: Plan de Tratamiento */}
        {activeTab === 'plan' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Progress indicator */}
            <div className="patient-card" style={{ borderRadius:20, padding:'1.5rem', display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:13.5, fontWeight:800, color: 'var(--portal-text-primary)' }}>Avance del Plan Activo</span>
                <span style={{ fontSize:16, fontWeight:800, color: secondaryColor }}>{paciente?.progreso_plan_porcentaje || 0}%</span>
              </div>
              <div style={{ height:10, background:'rgba(24,95,165,0.06)', borderRadius:5, overflow:'hidden', position: 'relative' }}>
                <div style={{ height:'100%', width:`${paciente?.progreso_plan_porcentaje || 0}%`, background:`linear-gradient(90deg, ${secondaryColor}, ${accentColor})`, borderRadius:5, transition:'width 0.5s ease-out' }} />
              </div>
              <div style={{ fontSize:12, color:'var(--portal-text-muted)', textAlign:'center', marginTop:2, fontWeight:500 }}>Estimación basada en las fases completadas de tu plan clínico.</div>
            </div>

            {/* Recommendations / Allergies */}
            <div className="patient-card" style={{ borderRadius:20, padding:'1.5rem', display:'flex', flexDirection:'column', gap:14 }}>
              <h3 style={{ fontSize:14, fontWeight:800, color:'var(--portal-text-primary)', margin:0 }}>Indicaciones Clínicas</h3>
              
              <div>
                <span style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Alergias / Restricciones</span>
                {paciente?.alergias ? (
                  <div style={{ fontSize:13.5, color:'#DC2626', fontWeight:700, marginTop:4, background:'#FEE2E2', padding:'8px 12px', borderRadius:10 }}>⚠️ {paciente.alergias}</div>
                ) : (
                  <div style={{ fontSize:13, color:'var(--portal-text-secondary)', marginTop:4 }}>Ninguna alergia registrada.</div>
                )}
              </div>

              <div style={{ borderTop:'1px solid var(--portal-card-border)', paddingTop:12 }}>
                <span style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Antecedentes Relevantes</span>
                <div style={{ fontSize:13, color:'var(--portal-text-primary)', marginTop:4, lineHeight:1.4 }}>{paciente?.antecedentes || 'Sin antecedentes médicos registrados.'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Panel: Fotos de Progreso */}
        {activeTab === 'fotos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {fotos.length === 0 ? (
              <div className="patient-card" style={{ textAlign:'center', padding:'3rem 2rem', borderRadius:20, color:'var(--portal-text-muted)', fontSize:14 }}>
                📸 Tu odontólogo irá subiendo fotos de tu progreso en cada etapa para que puedas ver tu evolución aquí.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                {/* Visual before/after showcase card if there are multiple photos */}
                {fotos.length >= 2 && (
                  <div className="patient-card" style={{ borderRadius:20, padding:'1.25rem', border:'1px solid var(--portal-card-border)' }}>
                    <div style={{ fontSize:14, fontWeight:800, color:'var(--portal-text-primary)', display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
                      ✨ Comparativa de Evolución (Antes y Después)
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                      <div style={{ flex:1, textAlign:'center' }}>
                        <div style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:700, marginBottom:4 }}>INICIO ({new Date(fotos[0].creado_en).toLocaleDateString('es-AR')})</div>
                        <img src={fotos[0].url} alt="Antes" style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', borderRadius:12, border:'1px solid var(--portal-card-border)' }} />
                      </div>
                      <div style={{ flex:1, textAlign:'center' }}>
                        <div style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:700, marginBottom:4 }}>ACTUAL ({new Date(fotos[fotos.length-1].creado_en).toLocaleDateString('es-AR')})</div>
                        <img src={fotos[fotos.length-1].url} alt="Después" style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', borderRadius:12, border:'1px solid var(--portal-card-border)' }} />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* List of all stages */}
                <h3 style={{ fontSize:14, fontWeight:800, color:'var(--portal-text-primary)', margin:'6px 0 0' }}>Línea de Tiempo de Fotos</h3>
                {fotos.map((f, idx) => (
                  <div key={f.id} className="patient-card" style={{ borderRadius:20, overflow:'hidden', border:'1px solid var(--portal-card-border)' }}>
                    <img src={f.url} alt={f.etapa || 'Progreso'} style={{ width:'100%', maxHeight:320, objectFit:'cover' }} />
                    <div style={{ padding:'1.25rem' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <span style={{ fontSize:13, fontWeight:800, color: secondaryColor, background:'rgba(24,95,165,0.06)', padding:'2px 8px', borderRadius:8 }}>
                          {f.etapa || `Etapa ${idx + 1}`}
                        </span>
                        <span style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:500 }}>
                          {new Date(f.creado_en).toLocaleDateString('es-AR')}
                        </span>
                      </div>
                      {f.descripcion && (
                        <p style={{ fontSize:13.5, color:'var(--portal-text-secondary)', margin:0, lineHeight:1.4 }}>
                          {f.descripcion}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign:'center', marginTop:'2.5rem', fontSize:12, color:'var(--portal-text-muted)', fontWeight:500 }}>
          {tenant?.nombre || 'Dr. Walter Benegas'} {tenant?.direccion ? `— ${tenant.direccion}` : ''}
        </div>
      </div>

      {/* Modal / Bottom Sheet Cuestionario Post-Visita */}
      {showFeedbackModal && feedbackPendiente && (
        <div style={{ position:'fixed', inset:0, background:'rgba(10,30,61,0.55)', backdropFilter:'blur(6px)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'0 0 env(safe-area-inset-bottom,0)' }} onClick={() => setShowFeedbackModal(false)}>
          <div style={{ background:'var(--portal-card-bg,#fff)', borderRadius:'24px 24px 0 0', padding:'1.75rem 1.5rem 2rem', width:'100%', maxWidth:480, boxShadow:'0 -12px 40px rgba(10,30,61,0.18)', borderTop:'1px solid var(--portal-card-border)' }} onClick={e=>e.stopPropagation()}>
            <div style={{ width:40, height:4, borderRadius:4, background:'#e2e8f0', margin:'0 auto 1.25rem' }}/>
            
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--portal-text-primary,#0a1e3d)', marginBottom:4 }}>Cuestionario de Control</div>
              <div style={{ fontSize:13, color:'var(--portal-text-secondary,#4a6080)' }}>
                Queremos saber cómo estás tras tu cita de <strong>{feedbackPendiente.tipo_tratamiento}</strong>.
              </div>
            </div>

            {/* Dolor Selector */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-primary)', display: 'block', marginBottom: 10, textAlign:'center' }}>
                ¿Sentís alguna molestia o dolor?
              </label>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 280, margin: '0 auto', gap: 10 }}>
                {[
                  { value: 1, emoji: '😊', label: 'Sin dolor' },
                  { value: 3, emoji: '😐', label: 'Molestia' },
                  { value: 5, emoji: '😩', label: 'Dolor' }
                ].map(item => {
                  const selected = dolor === item.value
                  return (
                    <button
                      key={item.value}
                      onClick={() => setDolor(item.value)}
                      style={{
                        flex: 1, padding: '12px 8px', borderRadius: 14, border: '2px solid ' + (selected ? secondaryColor : 'var(--portal-card-border)'),
                        background: selected ? 'rgba(24,95,165,0.06)' : 'transparent',
                        cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
                      }}
                    >
                      <span style={{ fontSize: 28 }}>{item.emoji}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: selected ? secondaryColor : 'var(--portal-text-muted)' }}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Satisfacción Selector */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-primary)', display: 'block', marginBottom: 8, textAlign:'center' }}>
                ¿Cómo calificarías tu satisfacción con la atención?
              </label>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                {[1, 2, 3, 4, 5].map(val => {
                  const active = val <= satisfaccion
                  return (
                    <button
                      key={val}
                      onClick={() => setSatisfaccion(val)}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 26, padding: 2,
                        color: active ? '#F59E0B' : '#E2E8F0', transition: 'transform 0.1s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      ★
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Comentarios */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-primary)', display: 'block', marginBottom: 6 }}>
                Comentario o duda adicional
              </label>
              <textarea
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                placeholder="Escribe aquí si tienes inflamación, dudas sobre la medicación o cualquier comentario..."
                style={{
                  width: '100%', height: 74, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--portal-card-border)',
                  background: 'var(--portal-card-bg)', color: 'var(--portal-text-primary)', fontFamily: 'inherit', fontSize: 13,
                  resize: 'none', outline: 'none'
                }}
              />
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowFeedbackModal(false)}
                disabled={sendingFeedback}
                style={{
                  flex: 1, padding: '13px', borderRadius: 14, border: '1px solid #e2e8f0',
                  background: 'var(--portal-card-bg,#fff)', color: 'var(--portal-text-secondary,#4a6080)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui'
                }}
              >
                Omitir por ahora
              </button>
              <button
                onClick={enviarFeedback}
                disabled={sendingFeedback}
                style={{
                  flex: 1.5, padding: '13px', borderRadius: 14, border: 'none',
                  background: secondaryColor, color: '#fff',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                  boxShadow: '0 4px 14px rgba(24,95,165,0.25)', opacity: sendingFeedback ? 0.6 : 1
                }}
              >
                {sendingFeedback ? 'Enviando...' : 'Enviar Respuestas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule confirmation modal sheet */}
      {reproConfirm && (
        <div style={{position:'fixed',inset:0,background:'rgba(10,30,61,0.55)',backdropFilter:'blur(6px)',zIndex:9999,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 0 env(safe-area-inset-bottom,0)'}}>
          <div style={{background:'var(--portal-card-bg,#fff)',borderRadius:'24px 24px 0 0',padding:'1.75rem 1.5rem 2rem',width:'100%',maxWidth:480,boxShadow:'0 -12px 40px rgba(10,30,61,0.18)'}}>
            <div style={{width:40,height:4,borderRadius:4,background:'#e2e8f0',margin:'0 auto 1.5rem'}}/>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:`${secondaryColor}15`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={secondaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
              </div>
              <div style={{fontSize:18,fontWeight:800,color:'var(--portal-text-primary,#0a1e3d)',marginBottom:6}}>Reprogramar o Cancelar</div>
              <div style={{fontSize:14,color:'var(--portal-text-secondary,#4a6080)',lineHeight:1.5,padding:'0 12px'}}>
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
                    textDecoration: 'none', display:'flex', alignItems:'center', justifyContent:'center', gap:8, 
                    fontSize:14, padding:'14px', borderRadius:14, border:'none', 
                    background:'linear-gradient(135deg,#25D366,#128C7E)', color:'#fff', 
                    cursor:'pointer', fontWeight:700, fontFamily:'DM Sans, system-ui', 
                    boxShadow: '0 4px 14px rgba(37,211,102,0.25)', transition:'transform 0.2s'
                  }}
                  onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'}
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
                    textDecoration: 'none', display:'flex', alignItems:'center', justifyContent:'center', gap:8, 
                    fontSize:14, padding:'14px', borderRadius:14, border:`1px solid ${secondaryColor}25`, 
                    background:`rgba(232,240,252,0.8)`, color: secondaryColor, 
                    cursor:'pointer', fontWeight:700, fontFamily:'DM Sans, system-ui', transition:'transform 0.2s'
                  }}
                  onMouseEnter={e=>e.currentTarget.style.transform='scale(1.02)'}
                  onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                >
                  📞 Llamar al Consultorio
                </a>
              )}

              <button
                onClick={() => setReproConfirm(null)}
                style={{
                  marginTop: 6, padding:'13px', borderRadius:14, border:'1px solid #e2e8f0', 
                  background:'var(--portal-card-bg,#fff)', color:'var(--portal-text-secondary,#4a6080)', 
                  fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans, system-ui'
                }}
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        :root {
          --portal-bg: #f8fafc;
          --portal-card-bg: rgba(255, 255, 255, 0.75);
          --portal-card-border: rgba(255, 255, 255, 0.9);
          --portal-text-primary: ${primaryColor};
          --portal-text-secondary: #4a6080;
          --portal-text-muted: #8fa3bc;
          --portal-shadow: rgba(24, 95, 165, 0.04);
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --portal-bg: #070e17;
            --portal-card-bg: rgba(15, 30, 48, 0.75);
            --portal-card-border: rgba(255, 255, 255, 0.08);
            --portal-text-primary: #f0f4f9;
            --portal-text-secondary: #aab8c8;
            --portal-text-muted: #7fa2c4;
            --portal-shadow: rgba(0, 0, 0, 0.4);
          }
        }
        body {
          background-color: var(--portal-bg) !important;
          color: var(--portal-text-primary) !important;
          transition: background-color 0.3s, color 0.3s;
        }
        .patient-card {
          background: var(--portal-card-bg) !important;
          border: 1px solid var(--portal-card-border) !important;
          box-shadow: 0 8px 32px var(--portal-shadow) !important;
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          transition: transform 0.2s;
        }
        .patient-card:hover {
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  )
}