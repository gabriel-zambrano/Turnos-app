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

interface Paciente { id:string; nombre:string; telefono:string; email:string }

export default function NuevaCita() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente|null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [creandoPaciente, setCreandoPaciente] = useState(false)
  const [nuevoPaciente, setNuevoPaciente] = useState({nombre:'',telefono:'',email:''})
  const [tratamiento, setTratamiento] = useState('Consulta')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [horasOcupadas, setHorasOcupadas] = useState<string[]>([])
  const [cargandoHoras, setCargandoHoras] = useState(false)
  const [notas, setNotas] = useState('')
  const [sena, setSena] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const [error, setError] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const hoyMin = new Date().toISOString().split('T')[0]

  // Buscar pacientes
  useEffect(() => {
    if (query.length < 2) { setPacientes([]); setShowDropdown(false); return }
    const timeout = setTimeout(async () => {
      const { data } = await supabase.from('pacientes').select('id,nombre,telefono,email').ilike('nombre',`%${query}%`).limit(6)
      if (data) { setPacientes(data); setShowDropdown(true) }
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  // Cargar horas ocupadas cuando cambia la fecha
  useEffect(() => {
    if (!fecha) { setHorasOcupadas([]); return }
    setCargandoHoras(true)
    setHora('')
    const fetchOcupadas = async () => {
      const { data } = await supabase
        .from('citas')
        .select('fecha_hora')
        .gte('fecha_hora', `${fecha}T00:00:00`)
        .lte('fecha_hora', `${fecha}T23:59:59`)
        .not('estado', 'eq', 'cancelado')
      if (data) {
        const ocupadas = data.map(c => {
          const dt = new Date(c.fecha_hora)
          const ar = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
          return String(ar.getHours()).padStart(2,'0') + ':' + String(ar.getMinutes()).padStart(2,'0')
        })
        setHorasOcupadas(ocupadas)
      }
      setCargandoHoras(false)
    }
    fetchOcupadas()
  }, [fecha])

  function seleccionarPaciente(p: Paciente) {
    setPacienteSeleccionado(p); setQuery(p.nombre); setShowDropdown(false); setCreandoPaciente(false)
  }

  function limpiarPaciente() {
    setPacienteSeleccionado(null); setQuery(''); setCreandoPaciente(false)
    setNuevoPaciente({nombre:'',telefono:'',email:''})
  }

  function iniciarCreacion() {
    setShowDropdown(false); setCreandoPaciente(true)
    setNuevoPaciente({nombre:query, telefono:'', email:''})
  }

  async function crearPaciente() {
    if (!nuevoPaciente.nombre) { setError('Ingresá el nombre del paciente'); return }
    if (!nuevoPaciente.telefono) { setError('Ingresá el teléfono'); return }
    setError('')
    const { data, error: err } = await supabase.from('pacientes').insert({
      nombre: nuevoPaciente.nombre,
      telefono: nuevoPaciente.telefono,
      email: nuevoPaciente.email || null,
    }).select().single()
    if (err || !data) { setError('Error al crear paciente'); return }
    seleccionarPaciente(data)
  }

  async function guardar() {
    if (!pacienteSeleccionado) { setError('Seleccioná o creá un paciente'); return }
    if (!fecha) { setError('Elegí una fecha'); return }
    if (!hora) { setError('Elegí un horario'); return }
    setGuardando(true); setError('')
    const fechaHora = `${fecha}T${hora}:00-03:00`
    const { error: err } = await supabase.from('citas').insert({
      paciente_id: pacienteSeleccionado.id,
      tipo_tratamiento: tratamiento,
      fecha_hora: fechaHora,
      estado: 'pendiente',
      notas: notas || null,
      duracion_minutos: 30,
      sena: sena ? parseFloat(sena) : null,
    })
    if (err) { setError('Error al guardar. Intentá de nuevo.'); setGuardando(false); return }
    setGuardando(false); setExito(true)
    setTimeout(() => {
      setExito(false); setPacienteSeleccionado(null); setQuery(''); setFecha(''); setHora('')
      setNotas(''); setTratamiento('Consulta'); setSena(''); setCreandoPaciente(false)
      setNuevoPaciente({nombre:'',telefono:'',email:''}); setHorasOcupadas([])
    }, 2000)
  }

  const inputStyle = {width:'100%',border:'none',background:'#f4f7fb',borderRadius:10,padding:'0.85rem 1rem',fontSize:15,color:'#0f1e2b',fontFamily:'DM Sans, sans-serif',outline:'none',boxSizing:'border-box' as const}
  const labelStyle = {fontSize:11,fontWeight:600 as const,color:'#aaa',textTransform:'uppercase' as const,letterSpacing:1,marginBottom:10,display:'block' as const}
  const cardStyle = {background:'#fff',borderRadius:16,padding:'1rem',border:'0.5px solid #e8e8e8'}

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

        {/* Paciente */}
        <div style={cardStyle}>
          <label style={labelStyle}>Paciente</label>
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
            ) : creandoPaciente ? (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontSize:12,fontWeight:600,color:'#0f1e2b',marginBottom:4}}>Nuevo paciente</div>
                <input value={nuevoPaciente.nombre} onChange={e=>setNuevoPaciente(p=>({...p,nombre:e.target.value}))} placeholder="Nombre completo *" style={inputStyle}/>
                <input value={nuevoPaciente.telefono} onChange={e=>setNuevoPaciente(p=>({...p,telefono:e.target.value}))} placeholder="Teléfono *" type="tel" style={inputStyle}/>
                <input value={nuevoPaciente.email} onChange={e=>setNuevoPaciente(p=>({...p,email:e.target.value}))} placeholder="Email (opcional)" type="email" style={inputStyle}/>
                <div style={{display:'flex',gap:8,marginTop:4}}>
                  <button onClick={()=>{setCreandoPaciente(false);setQuery('')}} style={{flex:1,padding:'0.7rem',borderRadius:10,border:'0.5px solid #e8e8e8',background:'#f4f7fb',color:'#666',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>Cancelar</button>
                  <button onClick={crearPaciente} style={{flex:2,padding:'0.7rem',borderRadius:10,border:'none',background:'#0f1e2b',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>Crear y seleccionar</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#f4f7fb',borderRadius:10,padding:'0 12px'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por nombre..." style={{flex:1,border:'none',background:'transparent',padding:'0.85rem 0',fontSize:15,outline:'none',color:'#0f1e2b',fontFamily:'DM Sans, sans-serif'}}/>
                </div>
                {showDropdown && (
                  <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:'#fff',borderRadius:12,border:'0.5px solid #e8e8e8',boxShadow:'0 8px 24px rgba(0,0,0,0.08)',zIndex:20,overflow:'hidden'}}>
                    {pacientes.map((p) => (
                      <div key={p.id} onClick={()=>seleccionarPaciente(p)} style={{display:'flex',alignItems:'center',gap:10,padding:'0.75rem 1rem',cursor:'pointer',borderBottom:'0.5px solid #f0f0ee',background:'#fff'}}
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
                    <div onClick={iniciarCreacion} style={{display:'flex',alignItems:'center',gap:10,padding:'0.75rem 1rem',cursor:'pointer',background:'#f4f7fb'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='#eef2f7')}
                      onMouseLeave={e=>(e.currentTarget.style.background='#f4f7fb')}
                    >
                      <div style={{width:32,height:32,borderRadius:'50%',background:'#E1F5EE',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </div>
                      <div style={{fontSize:14,fontWeight:600,color:'#1D9E75'}}>Crear nuevo paciente</div>
                    </div>
                  </div>
                )}
                {query.length >= 2 && !showDropdown && (
                  <button onClick={iniciarCreacion} style={{marginTop:8,width:'100%',padding:'0.75rem',borderRadius:10,border:'0.5px dashed #1D9E75',background:'#E1F5EE',color:'#085041',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'DM Sans, sans-serif',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Crear "{query}" como nuevo paciente
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tratamiento */}
        <div style={cardStyle}>
          <label style={labelStyle}>Tratamiento</label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {TRATAMIENTOS.map(t => (
              <button key={t} onClick={()=>setTratamiento(t)} style={{padding:'0.6rem 0.4rem',borderRadius:10,border:'0.5px solid',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'DM Sans, sans-serif',background:tratamiento===t?'#0f1e2b':'#f4f7fb',color:tratamiento===t?'#fff':'#555',borderColor:tratamiento===t?'#0f1e2b':'#e8e8e8'}}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Fecha */}
        <div style={cardStyle}>
          <label style={labelStyle}>Fecha</label>
          <input type="date" min={hoyMin} value={fecha} onChange={e=>setFecha(e.target.value)} style={inputStyle}/>
        </div>

        {/* Hora */}
        <div style={cardStyle}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <label style={{...labelStyle,marginBottom:0}}>Horario</label>
            {fecha && (
              <div style={{display:'flex',alignItems:'center',gap:12,fontSize:11,color:'#aaa'}}>
                <span style={{display:'flex',alignItems:'center',gap:4}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:'#e8e8e8',display:'inline-block'}}/>
                  Ocupado
                </span>
                <span style={{display:'flex',alignItems:'center',gap:4}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:'#0f1e2b',display:'inline-block'}}/>
                  Libre
                </span>
              </div>
            )}
          </div>
          {!fecha ? (
            <div style={{textAlign:'center',padding:'1.5rem',color:'#ccc',fontSize:13}}>Seleccioná una fecha primero</div>
          ) : cargandoHoras ? (
            <div style={{textAlign:'center',padding:'1.5rem',color:'#aaa',fontSize:13}}>Cargando disponibilidad...</div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,maxHeight:200,overflowY:'auto'}}>
              {HORAS.map(h => {
                const ocupado = horasOcupadas.includes(h)
                const seleccionado = hora === h
                return (
                  <button
                    key={h}
                    onClick={()=>!ocupado && setHora(h)}
                    disabled={ocupado}
                    title={ocupado ? 'Horario ocupado' : ''}
                    style={{
                      padding:'0.6rem 0',borderRadius:8,border:'0.5px solid',fontSize:13,fontWeight:500,
                      fontFamily:'DM Sans, sans-serif',transition:'all 0.1s',
                      cursor: ocupado ? 'not-allowed' : 'pointer',
                      background: ocupado ? '#f0f0f0' : seleccionado ? '#0f1e2b' : '#f4f7fb',
                      color: ocupado ? '#ccc' : seleccionado ? '#fff' : '#555',
                      borderColor: ocupado ? '#e8e8e8' : seleccionado ? '#0f1e2b' : '#e8e8e8',
                      textDecoration: ocupado ? 'line-through' : 'none',
                    }}
                  >
                    {h}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Seña */}
        <div style={cardStyle}>
          <label style={labelStyle}>Seña <span style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>(opcional)</span></label>
          <div style={{display:'flex',alignItems:'center',background:'#f4f7fb',borderRadius:10,padding:'0 1rem'}}>
            <span style={{fontSize:15,color:'#aaa',fontWeight:500,marginRight:6}}>$</span>
            <input type="number" value={sena} onChange={e=>setSena(e.target.value)} placeholder="0" min="0" style={{...inputStyle,background:'transparent',padding:'0.85rem 0'}}/>
          </div>
        </div>

        {/* Notas */}
        <div style={cardStyle}>
          <label style={labelStyle}>Notas <span style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>(opcional)</span></label>
          <textarea value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Indicaciones, observaciones..." rows={3} style={{...inputStyle,resize:'none'}}/>
        </div>

        {error && (
          <div style={{background:'#FAECE7',borderRadius:10,padding:'0.75rem 1rem',fontSize:13,color:'#D85A30',display:'flex',alignItems:'center',gap:8}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        <button onClick={guardar} disabled={guardando} style={{width:'100%',padding:'1rem',borderRadius:14,border:'none',background:guardando?'#e5e5e5':'#0f1e2b',color:guardando?'#aaa':'#fff',fontWeight:700,fontSize:16,cursor:guardando?'not-allowed':'pointer',fontFamily:'DM Sans, sans-serif',display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:'2rem'}}>
          {guardando
            ?<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Guardando...</>
            :<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Agendar turno</>
          }
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
