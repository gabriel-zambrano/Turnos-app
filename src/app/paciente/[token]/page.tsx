'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Turno {
  id: string
  fecha_hora: string
  tipo_tratamiento: string
  estado: string
  duracion_minutos: number
  notas: string | null
}

interface Paciente {
  id: string
  nombre: string
  telefono: string
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
  const hora = `${String(ar.getHours()).padStart(2,'0')}:${String(ar.getMinutes()).padStart(2,'0')}`
  return { dia: dias[ar.getDay()], fecha: `${ar.getDate()} de ${meses[ar.getMonth()]}`, hora, full: `${dias[ar.getDay()]} ${ar.getDate()} de ${meses[ar.getMonth()]} a las ${hora}hs` }
}

function generateICS(t: Turno, paciente: Paciente) {
  const start = new Date(t.fecha_hora)
  const end = new Date(start.getTime() + t.duracion_minutos * 60000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DentalDesk//ES',
    'BEGIN:VEVENT',
    `UID:${t.id}@dentaldesk`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Turno odontológico - Dr. Walter Benegas`,
    `DESCRIPTION:Tratamiento: ${t.tipo_tratamiento}${t.notas ? '\nNotas: ' + t.notas : ''}`,
    'LOCATION:Consultorio Odontológico Dr. Walter Benegas',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio turno odontológico',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `turno-${t.fecha_hora.split('T')[0]}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

function compartirWhatsApp(t: Turno, paciente: Paciente) {
  const { full } = formatFecha(t.fecha_hora)
  const msg = encodeURIComponent(
    `📅 *Recordatorio de turno*\n\n` +
    `Hola ${paciente.nombre}, te comparto los datos de tu turno:\n\n` +
    `🦷 *Tratamiento:* ${t.tipo_tratamiento}\n` +
    `📆 *Fecha:* ${full}\n` +
    `⏱ *Duración:* ${t.duracion_minutos} minutos\n` +
    `${t.notas ? `📝 *Notas:* ${t.notas}\n` : ''}` +
    `\n_Consultorio Odontológico Dr. Walter Benegas_`
  )
  window.open(`https://wa.me/?text=${msg}`, '_blank')
}

export default function PacientePage() {
  const { token } = useParams<{ token: string }>()
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [accion, setAccion] = useState<{id:string, tipo:'confirmado'|'cancelado'} | null>(null)

  async function cambiarEstado(citaId: string, nuevoEstado: 'confirmado' | 'cancelado') {
    setAccion({ id: citaId, tipo: nuevoEstado })
    await supabase.from('citas').update({ estado: nuevoEstado }).eq('id', citaId)
    setTurnos(prev => prev.map(t => t.id === citaId ? { ...t, estado: nuevoEstado } : t))
    setAccion(null)
  }

  useEffect(() => {
    async function load() {
      const { data: pac } = await supabase
        .from('pacientes')
        .select('id, nombre, telefono')
        .eq('token', token)
        .single()
      if (!pac) { setError(true); setLoading(false); return }
      setPaciente(pac)
      const hoy = new Date().toISOString()
      const { data: citas } = await supabase
        .from('citas')
        .select('id, fecha_hora, tipo_tratamiento, estado, duracion_minutos, notas')
        .eq('paciente_id', pac.id)
        .gte('fecha_hora', hoy)
        .order('fecha_hora', { ascending: true })
      setTurnos(citas || [])
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans, system-ui' }}>
      <div style={{ color:'#8fa3bc' }}>Cargando tus turnos...</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans, system-ui' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🦷</div>
        <div style={{ fontSize:18, fontWeight:600, color:'#0a1e3d' }}>Link no válido</div>
        <div style={{ color:'#8fa3bc', marginTop:8 }}>Contactate con el consultorio para obtener tu link.</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', fontFamily:'DM Sans, system-ui', padding:'2rem 1rem' }}>
      <div style={{ maxWidth:480, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🦷</div>
          <div style={{ fontSize:22, fontWeight:700, color:'#0a1e3d' }}>Hola, {paciente?.nombre}</div>
          <div style={{ color:'#8fa3bc', fontSize:14, marginTop:4 }}>Tus próximos turnos</div>
        </div>

        {turnos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', background:'rgba(255,255,255,0.7)', backdropFilter:'blur(20px)', borderRadius:16, border:'1px solid rgba(255,255,255,0.8)', color:'#8fa3bc' }}>
            No tenés turnos próximos agendados.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {turnos.map(t => {
              const { dia, fecha, hora } = formatFecha(t.fecha_hora)
              const est = ESTADO_STYLE[t.estado] || ESTADO_STYLE.pendiente
              return (
                <div key={t.id} style={{ background:'rgba(255,255,255,0.7)', backdropFilter:'blur(20px)', borderRadius:16, padding:'1.25rem', border:'1px solid rgba(255,255,255,0.8)', boxShadow:'0 4px 24px rgba(56,138,221,0.08)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:13, color:'#8fa3bc', fontWeight:500 }}>{dia}</div>
                      <div style={{ fontSize:17, fontWeight:700, color:'#0a1e3d', marginTop:2 }}>{fecha} · {hora}hs</div>
                      <div style={{ fontSize:14, color:'#4a6080', marginTop:4 }}>🦷 {t.tipo_tratamiento} · {t.duracion_minutos} min</div>
                      {t.notas && <div style={{ fontSize:13, color:'#8fa3bc', marginTop:4 }}>📝 {t.notas}</div>}
                    </div>
                    <span style={{ background:est.bg, color:est.color, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap' }}>{est.label}</span>
                  </div>

                  {/* Botones acción */}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {/* WhatsApp — compartir turno */}
                    <button
                      onClick={() => compartirWhatsApp(t, paciente!)}
                      style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:12, padding:'8px 12px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#25D366,#128C7E)', color:'#fff', cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Compartir por WhatsApp
                    </button>

                    {/* Agendar en calendario */}
                    <button
                      onClick={() => generateICS(t, paciente!)}
                      style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:12, padding:'8px 12px', borderRadius:10, border:'1px solid rgba(56,138,221,0.25)', background:'rgba(232,240,252,0.8)', color:'#185FA5', cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      Agendar
                    </button>
                  </div>

                  {/* Confirmar / Cancelar */}
                  {t.estado === 'pendiente' && (
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      <button onClick={() => cambiarEstado(t.id, 'confirmado')} disabled={accion?.id===t.id} style={{ flex:1, fontSize:12, padding:'8px', borderRadius:10, border:'none', background:'#D1E7DD', color:'#0A3622', cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui' }}>
                        {accion?.id===t.id&&accion.tipo==='confirmado'?'...':'✓ Confirmar turno'}
                      </button>
                      <button onClick={() => cambiarEstado(t.id, 'cancelado')} disabled={accion?.id===t.id} style={{ flex:1, fontSize:12, padding:'8px', borderRadius:10, border:'none', background:'#F8D7DA', color:'#58151C', cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui' }}>
                        {accion?.id===t.id&&accion.tipo==='cancelado'?'...':'✗ Cancelar turno'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ textAlign:'center', marginTop:'2rem', fontSize:12, color:'#c5d4e8' }}>
          Consultorio Odontológico · Dr. Walter Benegas
        </div>
      </div>
    </div>
  )
}
