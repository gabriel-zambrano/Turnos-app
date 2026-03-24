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
  return { dia: dias[ar.getDay()], fecha: `${ar.getDate()} de ${meses[ar.getMonth()]}`, hora }
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

export default function PacientePage() {
  const { token } = useParams<{ token: string }>()
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui' }}>
      <div style={{ color:'#888' }}>Cargando tus turnos...</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🦷</div>
        <div style={{ fontSize:18, fontWeight:600, color:'#222' }}>Link no válido</div>
        <div style={{ color:'#888', marginTop:8 }}>Contactate con el consultorio para obtener tu link.</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#f8f8f8', fontFamily:'system-ui', padding:'2rem 1rem' }}>
      <div style={{ maxWidth:480, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🦷</div>
          <div style={{ fontSize:22, fontWeight:700, color:'#222' }}>Hola, {paciente?.nombre}</div>
          <div style={{ color:'#888', fontSize:14, marginTop:4 }}>Tus próximos turnos</div>
        </div>
        {turnos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', background:'#fff', borderRadius:12, color:'#888' }}>
            No tenés turnos próximos agendados.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {turnos.map(t => {
              const { dia, fecha, hora } = formatFecha(t.fecha_hora)
              const est = ESTADO_STYLE[t.estado] || ESTADO_STYLE.pendiente
              return (
                <div key={t.id} style={{ background:'#fff', borderRadius:12, padding:'1.25rem', boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div>
                      <div style={{ fontSize:13, color:'#888', fontWeight:500 }}>{dia}</div>
                      <div style={{ fontSize:17, fontWeight:700, color:'#222', marginTop:2 }}>{fecha} · {hora}hs</div>
                      <div style={{ fontSize:14, color:'#555', marginTop:4 }}>🦷 {t.tipo_tratamiento} · {t.duracion_minutos} min</div>
                      {t.notas && <div style={{ fontSize:13, color:'#888', marginTop:4 }}>📝 {t.notas}</div>}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
                      <span style={{ background:est.bg, color:est.color, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap' }}>{est.label}</span>
                      <button onClick={() => generateICS(t, paciente!)} style={{ fontSize:11, padding:'4px 10px', borderRadius:8, border:'1px solid #e2e8ed', background:'#fff', cursor:'pointer', color:'#555', whiteSpace:'nowrap' }}>📅 Agendar</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ textAlign:'center', marginTop:'2rem', fontSize:12, color:'#bbb' }}>
          Consultorio Odontológico · Dr. Walter Benegas
        </div>
      </div>
    </div>
  )
}
