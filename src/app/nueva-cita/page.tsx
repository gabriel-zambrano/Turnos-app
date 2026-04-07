'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const TRATAMIENTOS = [
  'Consulta', 'Ortodoncia', 'Blanqueamiento', 'Limpieza', 
  'Extracción', 'Endodoncia', 'Implante', 'Prótesis', 'Otro'
]

const HORAS = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00'
]

interface Paciente {
  id: string
  nombre: string
  telefono: string
  email: string
}

export default function NuevaCita() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [tratamiento, setTratamiento] = useState('Consulta')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const [error, setError] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const hoyMin = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (query.length < 2) { setPacientes([]); setShowDropdown(false); return }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('pacientes')
        .select('id, nombre, telefono, email')
        .ilike('nombre', `%${query}%`)
        .limit(6)
      if (data) { setPacientes(data); setShowDropdown(true) }
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  function seleccionarPaciente(p: Paciente) {
    setPacienteSeleccionado(p)
    setQuery(p.nombre)
    setShowDropdown(false)
  }

  function limpiarPaciente() {
    setPacienteSeleccionado(null)
    setQuery('')
  }

  async function guardar() {
    if (!pacienteSeleccionado) { setError('Seleccioná un paciente'); return }
    if (!fecha) { setError('Elegí una fecha'); return }
    if (!hora) { setError('Elegí un horario'); return }

    setGuardando(true)
    setError('')

    const fechaHora = `${fecha}T${hora}:00-03:00`

    const { error: err } = await supabase.from('citas').insert({
      paciente_id: pacienteSeleccionado.id,
      tipo_tratamiento: tratamiento,
      fecha_hora: fechaHora,
      estado: 'pendiente',
      notas: notas || null,
      duracion_minutos: 30,
    })

    if (err) {
      setError('Error al guardar. Intentá de nuevo.')
      setGuardando(false)
      return
    }

    setGuardando(false)
    setExito(true)
    setTimeout(() => {
      setExito(false)
      setPacienteSeleccionado(null)
      setQuery('')
      setFecha('')
      setHora('')
      setNotas('')
      setTratamiento('Consulta')
    }, 2000)
  }

  if (exito) return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#f4f7fb',fontFamily:'DM Sans, sans-serif',padding:'2rem'}}>
      <div style={{width:64,height:64,borderRadius:'50%',background:'#E1F5EE',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style={{fontSize:20,fontWeight:700,color:'#0f1e2b',marginBottom:6}}>¡Turno agendado!</div>
      <div style={{fontSize:14,color:'#888'}}>Se guardó correctamente</div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#f4f7fb',fontFamily:'DM Sans, sans-serif'}}>
      <div style={{background:'#fff',borderBottom:'0.5px solid #e8e8e8',padding:'1rem 1.25rem',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10}}>
        <button onClick={()=>router.back()} style={{background:'none',border:'none',cursor:'pointer',padding:4,display:'flex',alignItems:'center',color:'#666'}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <div style={{fontWeight:700,fontSize:16,color:'#0f1e2b'}}>Nueva cita</div>
          <div style={{fontSize:12,color:'#aaa'}}>Consultorio Dr. Walter Benegas</div>
        </div>
      </div>

      <div style={{padding:'1.25rem',maxWidth:500,margin:'0 auto',display:'flex',flexDirection:'column',gap:16}}>

        <div style={{background:'#fff',borderRadius:16,padding:'1rem',border:'0.5px solid #e8e8e8'}}>
          <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Paciente</div>
          <div style={{position:'relative'}} ref={dropdownRef}>
            {pacienteSeleccionado ? (
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'0.75rem',background:'#f4f7fb',borderRadius:10}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'#0f1e2b',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:14,fontWeight:700,flexShrink:0}}>
                  {pacienteSeleccionado.nombre.charAt(0).toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14,color:'#0f1e2b'}}>{pacienteSeleccionado.nombre}</div>
                  <div style={{fontSize:12,color:'#aaa'}}>{pacienteSeleccionado.telefono}</div>
                </div>
                <button onClick={limpiarPaciente} style={{background:'none',border:'none',cursor:'pointer',color:'#ccc',padding:4}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ) : (
              <>
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#f4f7fb',borderRadius:10,padding:'0 12px'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    value={query}
                    onChange={e=>setQuery(e.target.value)}
                    placeholder="Buscar por nombre..."
                    style={{flex:1,border:'none',background:'transparent',padding:'0.85rem 0',fontSize:15,outline:'none',color:'#0f1e2b',fontFamily:'DM Sans, sans-serif'}}
                  />
                </div>
                {showDropdown && pacientes.length > 0 && (
                  <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:'#fff',borderRadius:12,border:'0.5px solid #e8e8e8',boxShadow:'0 8px 24px rgba(0,0,0,0.08)',zIndex:20,overflow:'hidden'}}>
                    {pacientes.map((p,i) => (
                      <div key={p.id} onClick={()=>seleccionarPaciente(p)} style={{display:'flex',alignItems:'center',gap:10,padding:'0.75rem 1rem',cursor:'pointer',borderBottom:i<pacientes.length-1?'0.5px solid #f0f0ee':'none',background:'#fff'}}
                        onMouseEnter={e=>(e.currentTarget.style.background='#f4f7fb')}
                        onMouseLeave={e=>(e.currentTarget.style.background='#fff')}
                      >
                        <div style={{width:32,height:32,borderRadius:'50%',background:'#e8eef4',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#0f1e2b',flexShrink:0}}>
                          {p.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{fontSize:14,fontWeight:500,color:'#0f1e2b'}}>{p.nombre}</div>
                          <div style={{fontSize:12,color:'#aaa'}}>{p.telefono}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showDropdown && pacientes.length === 0 && query.length >= 2 && (
                  <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:'#fff',borderRadius:12,border:'0.5px solid #e8e8e8',padding:'1rem',textAlign:'center',fontSize:13,color:'#aaa',zIndex:20}}>
                    No se encontraron pacientes
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{background:'#fff',borderRadius:16,padding:'1rem',border:'0.5px solid #e8e8e8'}}>
          <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Tratamiento</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {TRATAMIENTOS.map(t => (
              <button key={t} onClick={()=>setTratamiento(t)} style={{
                padding:'0.6rem 0.4rem',borderRadius:10,border:'0.5px solid',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'DM Sans, sans-serif',
                background: tratamiento===t ? '#0f1e2b' : '#f4f7fb',
                color: tratamiento===t ? '#fff' : '#555',
                borderColor: tratamiento===t ? '#0f1e2b' : '#e8e8e8',
              }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{background:'#fff',borderRadius:16,padding:'1rem',border:'0.5px solid #e8e8e8'}}>
          <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Fecha</div>
          <input
            type="date"
            min={hoyMin}
            value={fecha}
            onChange={e=>setFecha(e.target.value)}
            style={{width:'100%',border:'none',background:'#f4f7fb',borderRadius:10,padding:'0.85rem 1rem',fontSize:15,color:'#0f1e2b',fontFamily:'DM Sans, sans-serif',outline:'none',boxSizing:'border-box'}}
          />
        </div>

        <div style={{background:'#fff',borderRadius:16,padding:'1rem',border:'0.5px solid #e8e8e8'}}>
          <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Horario</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,maxHeight:180,overflowY:'auto'}}>
            {HORAS.map(h => (
              <button key={h} onClick={()=>setHora(h)} style={{
                padding:'0.6rem 0',borderRadius:8,border:'0.5px solid',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'DM Sans, sans-serif',
                background: hora===h ? '#0f1e2b' : '#f4f7fb',
                color: hora===h ? '#fff' : '#555',
                borderColor: hora===h ? '#0f1e2b' : '#e8e8e8',
              }}>
                {h}
              </button>
            ))}
          </div>
        </div>

        <div style={{background:'#fff',borderRadius:16,padding:'1rem',border:'0.5px solid #e8e8e8'}}>
          <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Notas <span style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>(opcional)</span></div>
          <textarea
            value={notas}
            onChange={e=>setNotas(e.target.value)}
            placeholder="Indicaciones, observaciones..."
            rows={3}
            style={{width:'100%',border:'none',background:'#f4f7fb',borderRadius:10,padding:'0.85rem 1rem',fontSize:14,color:'#0f1e2b',fontFamily:'DM Sans, sans-serif',outline:'none',resize:'none',boxSizing:'border-box'}}
          />
        </div>

        {error && (
          <div style={{background:'#FAECE7',borderRadius:10,padding:'0.75rem 1rem',fontSize:13,color:'#D85A30',display:'flex',alignItems:'center',gap:8}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        <button
          onClick={guardar}
          disabled={guardando}
          style={{
            width:'100%',padding:'1rem',borderRadius:14,border:'none',
            background: guardando ? '#e5e5e5' : '#0f1e2b',
            color: guardando ? '#aaa' : '#fff',
            fontWeight:700,fontSize:16,cursor:guardando?'not-allowed':'pointer',
            fontFamily:'DM Sans, sans-serif',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8,
            marginBottom:'2rem'
          }}
        >
          {guardando ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Guardando...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Agendar turno
            </>
          )}
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  )
}
