'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

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
  const dias = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado']
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const hora = String(ar.getHours()).padStart(2,'0') + ':' + String(ar.getMinutes()).padStart(2,'0')
  return {
    dia: dias[ar.getDay()],
    fecha: ar.getDate() + ' de ' + meses[ar.getMonth()],
    hora,
    full: dias[ar.getDay()] + ' ' + ar.getDate() + ' de ' + meses[ar.getMonth()] + ' a las ' + hora + 'hs'
  }
}

function generateICS(t: Turno) {
  const start = new Date(t.fecha_hora)
  const end = new Date(start.getTime() + t.duracion_minutos * 60000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DentalDesk//ES',
    'BEGIN:VEVENT',
    'UID:' + t.id + '@dentaldesk',
    'DTSTAMP:' + fmt(new Date()),
    'DTSTART:' + fmt(start),
    'DTEND:' + fmt(end),
    'SUMMARY:Turno odontologico - Dr. Walter Benegas',
    'DESCRIPTION:Tratamiento: ' + t.tipo_tratamiento + (t.notas ? ' Notas: ' + t.notas : ''),
    'LOCATION:Consultorio Odontologico Dr. Walter Benegas',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio turno odontologico',
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

function compartirWhatsApp(t: Turno, paciente: Paciente, token: string) {
  const { dia, fecha, hora } = formatFecha(t.fecha_hora)
  const msg = encodeURIComponent(
    `Hola ${paciente.nombre} 👋\n\n` +
    `Te recordamos tu turno con el *Dr. Walter Benegas*:\n\n` +
    `📅 ${dia} ${fecha} a las *${hora}hs*\n` +
    `🦷 ${t.tipo_tratamiento}\n\n` +
    `Podés confirmar o cancelar tu turno acá:\n` +
    `👉 https://turnos.walterbenegas.com.ar/paciente/${token}\n\n` +
    `_Consultorio Dr. Walter Benegas — Palermo, CABA_`
  )
  window.open('https://wa.me/?text=' + msg, '_blank')
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
        <div style={{ fontSize:18, fontWeight:600, color:'#0a1e3d' }}>Link no valido</div>
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
          <div style={{ color:'#8fa3bc', fontSize:14, marginTop:4 }}>Tus proximos turnos</div>
        </div>

        {turnos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', background:'rgba(255,255,255,0.7)', backdropFilter:'blur(20px)', borderRadius:16, border:'1px solid rgba(255,255,255,0.8)', color:'#8fa3bc' }}>
            No tenes turnos proximos agendados.
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
                      <div style={{ fontSize:17, fontWeight:700, color:'#0a1e3d', marginTop:2 }}>{fecha} - {hora}hs</div>
                      <div style={{ fontSize:14, color:'#4a6080', marginTop:4 }}>🦷 {t.tipo_tratamiento} - {t.duracion_minutos} min</div>
                      {t.notas && <div style={{ fontSize:13, color:'#8fa3bc', marginTop:4 }}>📝 {t.notas}</div>}
                    </div>
                    <span style={{ background:est.bg, color:est.color, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap' }}>{est.label}</span>
                  </div>

                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button
                      onClick={() => compartirWhatsApp(t, paciente!, token)}
                      style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:12, padding:'8px 12px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#25D366,#128C7E)', color:'#fff', cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui' }}
                    >
                      Compartir por WhatsApp
                    </button>
                    <button
                      onClick={() => generateICS(t)}
                      style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:12, padding:'8px 12px', borderRadius:10, border:'1px solid rgba(56,138,221,0.25)', background:'rgba(232,240,252,0.8)', color:'#185FA5', cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui' }}
                    >
                      📅 Agendar
                    </button>
                  </div>

                  {t.estado === 'pendiente' && (
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      <button onClick={() => cambiarEstado(t.id, 'confirmado')} disabled={accion?.id===t.id} style={{ flex:1, fontSize:12, padding:'8px', borderRadius:10, border:'none', background:'#D1E7DD', color:'#0A3622', cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui' }}>
                        {accion?.id===t.id&&accion.tipo==='confirmado'?'...':'Confirmar turno'}
                      </button>
                      <button onClick={() => cambiarEstado(t.id, 'cancelado')} disabled={accion?.id===t.id} style={{ flex:1, fontSize:12, padding:'8px', borderRadius:10, border:'none', background:'#F8D7DA', color:'#58151C', cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, system-ui' }}>
                        {accion?.id===t.id&&accion.tipo==='cancelado'?'...':'Cancelar turno'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ textAlign:'center', marginTop:'2rem', fontSize:12, color:'#c5d4e8' }}>
          Consultorio Odontologico - Dr. Walter Benegas
        </div>
      </div>
    </div>
  )
}