'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from '@/components/Sidebar'
import { PageHeader } from '@/components/UI'
import { AVATAR_COLORS, initials, normalizarTelefono } from '@/lib/constants'

interface PacienteAlerta {
  id: string
  nombre: string
  telefono: string
  email: string | null
  token: string | null
  ultimo_turno: string | null
  tratamiento: string
  motivo: 'ortodoncia_vencida' | 'limpieza_vencida' | 'sin_turno'
  diasDesde: number
}

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const c = () => setM(window.innerWidth < 768)
    c(); window.addEventListener('resize', c)
    return () => window.removeEventListener('resize', c)
  }, [])
  return m
}

const GRUPOS = {
  ortodoncia_vencida: { label: 'Ajuste ortodoncia vencido', color: '#7F77DD', bg: '#EEEDFE', desc: 'Más de 30 días sin ajuste', emoji: '🦷' },
  limpieza_vencida:   { label: 'Limpieza pendiente',        color: '#085041', bg: '#E1F5EE', desc: 'Más de 6 meses sin limpieza', emoji: '✨' },
  sin_turno:          { label: 'Sin turno agendado',        color: '#633806', bg: '#FAEEDA', desc: 'No tienen turno futuro',      emoji: '📅' },
  feedback:           { label: 'Feedback post-visita',      color: '#0D9488', bg: '#F0FDFA', desc: 'Respuestas de pacientes',     emoji: '💬' }
}

export default function SeguimientoPage() {
  const supabase = createClient()
  const isMobile = useIsMobile()
  const [alertas, setAlertas] = useState<PacienteAlerta[]>([])
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'ortodoncia_vencida' | 'limpieza_vencida' | 'sin_turno' | 'feedback'>('todos')

  function msg(t: string) { setToast(t); setTimeout(() => setToast(null), 3000) }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const hoy = new Date()
    const hoyISO = hoy.toISOString()

    // Traer todos los pacientes con sus citas
    const { data: pacientes } = await supabase
      .from('pacientes')
      .select('id, nombre, telefono, email, token, ultimo_tratamiento')

    if (!pacientes) { setLoading(false); return }

    // Traer todas las citas completadas y futuras
    const { data: citas } = await supabase
      .from('citas')
      .select('paciente_id, fecha_hora, tipo_tratamiento, estado')
      .order('fecha_hora', { ascending: false })

    const nuevasAlertas: PacienteAlerta[] = []

    for (const p of pacientes) {
      const citasPaciente = (citas || []).filter(c => c.paciente_id === p.id)
      const citasFuturas  = citasPaciente.filter(c => c.fecha_hora > hoyISO && c.estado !== 'cancelado')
      const citasPasadas  = citasPaciente.filter(c => c.fecha_hora <= hoyISO && c.estado === 'asistio')

      // Sin turno futuro
      if (citasFuturas.length === 0) {
        const ultima = citasPasadas[0]
        const diasDesde = ultima
          ? Math.floor((hoy.getTime() - new Date(ultima.fecha_hora).getTime()) / 86400000)
          : 9999
        nuevasAlertas.push({
          ...p, tratamiento: p.ultimo_tratamiento || 'Consulta',
          ultimo_turno: ultima?.fecha_hora || null,
          motivo: 'sin_turno', diasDesde
        })
        continue
      }

      // Ortodoncia vencida (último turno hace +30 días)
      if (p.ultimo_tratamiento === 'Ortodoncia') {
        const ultimaOrto = citasPasadas.find(c => c.tipo_tratamiento === 'Ortodoncia')
        if (ultimaOrto) {
          const dias = Math.floor((hoy.getTime() - new Date(ultimaOrto.fecha_hora).getTime()) / 86400000)
          if (dias > 30) {
            nuevasAlertas.push({
              ...p, tratamiento: 'Ortodoncia',
              ultimo_turno: ultimaOrto.fecha_hora,
              motivo: 'ortodoncia_vencida', diasDesde: dias
            })
            continue
          }
        }
      }

      // Limpieza vencida (+180 días)
      const ultimaLimpieza = citasPasadas.find(c => c.tipo_tratamiento === 'Limpieza')
      if (ultimaLimpieza) {
        const dias = Math.floor((hoy.getTime() - new Date(ultimaLimpieza.fecha_hora).getTime()) / 86400000)
        if (dias > 180) {
          nuevasAlertas.push({
            ...p, tratamiento: 'Limpieza',
            ultimo_turno: ultimaLimpieza.fecha_hora,
            motivo: 'limpieza_vencida', diasDesde: dias
          })
        }
      }
    }

    // Ordenar por días desde el último turno (más urgente primero)
    nuevasAlertas.sort((a, b) => b.diasDesde - a.diasDesde)
    setAlertas(nuevasAlertas)

    // Fetch feedbacks safely
    let loadedFeedbacks: any[] = []
    try {
      const { data: feedbacksRes, error: fErr } = await supabase
        .from('feedback_post_visita')
        .select('*, pacientes(nombre, telefono)')
        .order('creado_en', { ascending: false })
      if (!fErr && feedbacksRes) {
        loadedFeedbacks = feedbacksRes
      }
    } catch (e) {
      console.error("Error loading feedbacks:", e)
    }
    setFeedbacks(loadedFeedbacks)
    setLoading(false)
  }

  function mensajeWA(p: PacienteAlerta) {
    const link = p.token ? `${window.location.origin}/paciente/${p.token}` : ''
    const footer = `\n\nRecorda que los turnos no cancelados con mas de 48hs de anticipacion o no asistidos deben ser abonados.\n\n_Consultorio Dr. Walter Benegas - Av. Santa Fe 3329 1 B - Palermo, CABA_`
    if (p.motivo === 'ortodoncia_vencida')
      return `Hola ${p.nombre},\n\nTe escribimos del consultorio del *Dr. Walter Benegas*. Notamos que ya pasaron ${p.diasDesde} dias desde tu ultimo ajuste de ortodoncia.\n\nQueres coordinar un turno?\n${link}${footer}`
    if (p.motivo === 'limpieza_vencida')
      return `Hola ${p.nombre},\n\nTe escribimos del consultorio del *Dr. Walter Benegas*. Ya pasaron mas de 6 meses desde tu ultima limpieza dental.\n\nQueres sacar un turno?\n${link}${footer}`
    return `Hola ${p.nombre},\n\nTe escribimos del consultorio del *Dr. Walter Benegas*. Queriamos recordarte que podes sacar turno cuando quieras.\n\n${link}${footer}`
  }

  function enviarWA(p: PacienteAlerta) {
    const txt = encodeURIComponent(mensajeWA(p))
    const num = normalizarTelefono(p.telefono ?? '')
    window.open(`https://wa.me/${num}?text=${txt}`, '_blank')
    msg(`WhatsApp abierto para ${p.nombre}`)
  }

  const filtrados = filtro === 'todos' ? alertas : alertas.filter(a => a.motivo === filtro as any)
  const conteos = {
    ortodoncia_vencida: alertas.filter(a => a.motivo === 'ortodoncia_vencida').length,
    limpieza_vencida:   alertas.filter(a => a.motivo === 'limpieza_vencida').length,
    sin_turno:          alertas.filter(a => a.motivo === 'sin_turno').length,
    feedback:           feedbacks.length
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'DM Sans, sans-serif' }}>
      <Sidebar/>
      <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex:1, background:'transparent', minWidth:0, paddingBottom:isMobile?80:0 }}>
        <PageHeader title="Seguimiento"/>
        <div style={{ padding: isMobile?'1rem':'1.5rem 2rem' }}>

          {/* Tarjetas resumen */}
          <div style={{ display:'grid', gridTemplateColumns:isMobile?'1fr':'repeat(4,1fr)', gap:12, marginBottom:24 }}>
            {(Object.entries(GRUPOS) as any[]).map(([key, g]: any) => (
              <div key={key} onClick={() => setFiltro(filtro===key?'todos':key as any)}
                style={{ background:'#fff', borderRadius:12, padding:'1rem 1.25rem', border:`2px solid ${filtro===key?g.color:'#e2e8ed'}`, cursor:'pointer', transition:'border 0.15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:11, color:'#888', fontWeight:500, marginBottom:4 }}>{g.emoji} {g.label}</div>
                    <div style={{ fontSize:28, fontWeight:700, color:g.color }}>{conteos[key as keyof typeof conteos]}</div>
                    <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>{g.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Lista */}
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #e2e8ed', overflow:'hidden' }}>
            <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid #e2e8ed', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a' }}>
                {filtro==='todos' 
                  ? `Todos los pacientes (${alertas.length})` 
                  : filtro==='feedback'
                  ? `Feedbacks Recibidos (${feedbacks.length})`
                  : `${GRUPOS[filtro].label} (${filtrados.length})`}
              </div>
              {filtro!=='todos' && filtro!=='feedback' && filtrados.length > 0 && (
                <button onClick={() => { filtrados.forEach(p => enviarWA(p)) }}
                  style={{ fontSize:12, padding:'6px 14px', borderRadius:8, border:'none', background:'#25D366', color:'#fff', cursor:'pointer', fontWeight:600 }}>
                  WhatsApp a todos ({filtrados.length})
                </button>
              )}
            </div>

            {loading ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'#aaa' }}>Cargando...</div>
            ) : filtro === 'feedback' ? (
              feedbacks.length === 0 ? (
                <div style={{ padding:'3rem', textAlign:'center', color:'#aaa' }}>🎉 No se han recibido feedbacks todavía</div>
              ) : (
                <div>
                  {feedbacks.map(f => (
                    <div key={f.id} style={{ 
                      display:'flex', 
                      flexDirection: 'column', 
                      gap: 8, 
                      padding:'1.25rem', 
                      borderBottom:'1px solid #f4f6f8',
                      background: f.dolor >= 4 ? '#FEF2F2' : 'transparent' 
                    }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:36, height:36, borderRadius:'50%', background: f.dolor >= 4 ? '#FEE2E2' : '#E6FFFA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color: f.dolor >= 4 ? '#EF4444' : '#0D9488' }}>
                            {initials(f.pacientes?.nombre || 'P')}
                          </div>
                          <div>
                            <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a', display:'flex', alignItems:'center', gap:6 }}>
                              {f.pacientes?.nombre}
                              {f.dolor >= 4 && (
                                <span style={{ fontSize:11, color:'#DC2626', background:'#FEE2E2', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>
                                  ⚠️ Dolor Alto
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize:12, color:'#888', marginTop:1 }}>
                              Recibido el {new Date(f.creado_en).toLocaleDateString('es-AR')}
                            </div>
                          </div>
                        </div>
                        
                        {/* Metrics: Dolor & Satisfacción */}
                        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                          <div style={{ textAlign:'right' }}>
                            <span style={{ fontSize:11, color:'#888', display:'block' }}>Dolor</span>
                            <span style={{ fontSize:14, fontWeight:700, color: f.dolor >= 4 ? '#EF4444' : f.dolor >= 3 ? '#F59E0B' : '#10B981' }}>
                              {f.dolor === 5 ? '😩 Alto (5/5)' : f.dolor === 3 ? '😐 Medio (3/5)' : '😊 Leve (1/5)'}
                            </span>
                          </div>
                          <div style={{ textAlign:'right', borderLeft:'1px solid #e2e8ed', paddingLeft:12 }}>
                            <span style={{ fontSize:11, color:'#888', display:'block' }}>Satisfacción</span>
                            <span style={{ fontSize:14, fontWeight:700, color:'#F59E0B' }}>
                              {'★'.repeat(f.satisfaccion)}{'☆'.repeat(5 - f.satisfaccion)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Comentario */}
                      {f.comentario && (
                        <div style={{ 
                          fontSize:13, 
                          color:'#4a5568', 
                          background: f.dolor >= 4 ? 'rgba(239, 68, 68, 0.04)' : '#f7fafc', 
                          padding:'8px 12px', 
                          borderRadius:10, 
                          border: '1px solid ' + (f.dolor >= 4 ? '#FCA5A5' : '#e2e8ed'),
                          fontStyle:'italic',
                          marginLeft: 46
                        }}>
                          "{f.comentario}"
                        </div>
                      )}

                      {/* WhatsApp trigger button */}
                      <div style={{ display:'flex', justifyContent:'flex-end', marginTop: 4 }}>
                        <button 
                          onClick={() => {
                            const num = normalizarTelefono(f.pacientes?.telefono || '')
                            const text = f.dolor >= 4 
                              ? `Hola ${f.pacientes?.nombre}, nos ponemos en contacto desde el consultorio del Dr. Walter Benegas porque vimos que estás con algunas molestias importantes tras tu última visita. ¿Cómo te encuentras?`
                              : `Hola ${f.pacientes?.nombre}, te escribimos del consultorio del Dr. Walter Benegas para agradecerte por tu feedback sobre la atención y saludarte. ¿Cómo te encuentras?`
                            window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank')
                          }}
                          style={{ 
                            fontSize:12, 
                            padding:'5px 12px', 
                            borderRadius:6, 
                            border:'none', 
                            background:'#25D366', 
                            color:'#fff', 
                            cursor:'pointer', 
                            fontWeight:700,
                            display:'flex',
                            alignItems:'center',
                            gap:4
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.66.986 3.288 1.488 4.905 1.489 5.5.003 9.975-4.47 9.979-9.967.002-2.662-1.033-5.166-2.915-7.05C16.734 1.744 14.236.703 11.58.701c-5.503 0-9.98 4.47-9.985 9.969-.001 1.776.48 3.5 1.391 5.01L1.93 21.72l6.147-1.611-.43-.255z"/></svg>
                          Contactar paciente
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : filtrados.length === 0 ? (
              <div style={{ padding:'3rem', textAlign:'center', color:'#aaa' }}>🎉 No hay pacientes en esta categoría</div>
            ) : (
              <div>
                {filtrados.map((p, i) => {
                  const color = AVATAR_COLORS[i % AVATAR_COLORS.length]
                  const g = GRUPOS[p.motivo]
                  const diasText = p.diasDesde === 9999 ? 'Nunca asistió' : `Hace ${p.diasDesde} días`
                  return (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'0.9rem 1.25rem', borderBottom:'1px solid #f4f6f8' }}>
                      <div style={{ width:36, height:36, borderRadius:'50%', background:color+'22', border:`1.5px solid ${color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color, flexShrink:0 }}>
                        {initials(p.nombre)}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:14, color:'#1a1a1a' }}>{p.nombre}</div>
                        <div style={{ fontSize:12, color:'#aaa' }}>{diasText} · <span style={{ background:g.bg, color:g.color, padding:'1px 7px', borderRadius:10, fontSize:11, fontWeight:600 }}>{g.label}</span></div>
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <button onClick={() => enviarWA(p)}
                          style={{ fontSize:12, padding:'6px 12px', borderRadius:8, border:'none', background:'#25D366', color:'#fff', cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
                          WhatsApp
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        {toast && (
          <div style={{ position:'fixed', bottom:isMobile?80:24, left:'50%', transform:'translateX(-50%)', background:'#1a1a1a', color:'#fff', padding:'10px 20px', borderRadius:10, fontSize:13, zIndex:999 }}>
            {toast}
          </div>
        )}
      </main>
    </div>
  )
}
