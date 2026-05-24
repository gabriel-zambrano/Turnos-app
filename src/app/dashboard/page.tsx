'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, FilterBar, Spinner, MetricCard } from '@/components/UI'
import { TRAT_STYLE, ESTADO_STYLE, hoyISO, normalizarTelefono } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'
import type { EstadoCita } from '@/types'

interface Cita { id:string; nombre:string; hora:string; tratamiento:string; estado:EstadoCita; telefono:string }
interface CitaMañana extends Cita { token:string|null; fecha_hora:string }
interface LogItem { id:string; paciente:string; canal:string; estado:string; hora:string }
const FILTROS = [{k:'todas',l:'Todas'},{k:'pendiente',l:'Pendientes'},{k:'confirmado',l:'Confirmadas'}]

export default function Dashboard() {
  const [authChecked, setAuthChecked] = useState(false)
  const supabase = createClient()
  const { tenant, loading: tenantLoading } = useTenantContext()
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.replace('/login')
      else setAuthChecked(true)
    })
  }, [])
  const [citas, setCitas] = useState<Cita[]>([])
  const [citasMañana, setCitasMañana] = useState<CitaMañana[]>([])
  const [isMobile, setIsMobile] = useState(false)
  useEffect(()=>{
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  },[])
  const [logs, setLogs] = useState<LogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [filtro, setFiltro] = useState('todas')
  const [mostrarMañana, setMostrarMañana] = useState(false)
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const [toast, setToast] = useState<{msg:string;tipo:string}|null>(null)
  const [hoy, setHoy] = useState('')

  useEffect(()=>{
    setHoy(new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'}))
  },[])

  function msg(m:string,tipo='ok'){setToast({msg:m,tipo});setTimeout(()=>setToast(null),3500)}

  const load = useCallback(async()=>{
    if (!tenant) return
    setLoading(true)
    const man = new Date(new Date().toLocaleString('en-US',{timeZone:'America/Argentina/Buenos_Aires'}))
    man.setDate(man.getDate()+1)
    const manISO = man.getFullYear()+'-'+String(man.getMonth()+1).padStart(2,'0')+'-'+String(man.getDate()).padStart(2,'0')
    const [resHoy, resMan] = await Promise.all([
      supabase.from('citas').select('id,tipo_tratamiento,estado,fecha_hora,pacientes(nombre,telefono)').eq('tenant_id', tenant.id).gte('fecha_hora',`${hoyISO()}T00:00:00`).lte('fecha_hora',`${hoyISO()}T23:59:59`).order('fecha_hora',{ascending:true}),
      supabase.from('citas').select('id,tipo_tratamiento,estado,fecha_hora,pacientes(nombre,telefono,token)').eq('tenant_id', tenant.id).gte('fecha_hora',`${manISO}T00:00:00-03:00`).lte('fecha_hora',`${manISO}T23:59:59-03:00`).order('fecha_hora',{ascending:true}),
    ])
    if(resHoy.data){
      setCitas((resHoy.data as any[]).map(c=>({
        id:c.id, nombre:c.pacientes?.nombre??'—', telefono:c.pacientes?.telefono??'—',
        hora:new Date(c.fecha_hora).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}),
        tratamiento:c.tipo_tratamiento, estado:c.estado,
      })))
    }
    if(resMan.data){
      setCitasMañana((resMan.data as any[]).map(c=>({
        id:c.id, nombre:c.pacientes?.nombre??'—', telefono:c.pacientes?.telefono??'—',
        hora:new Date(c.fecha_hora).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Argentina/Buenos_Aires'}),
        tratamiento:c.tipo_tratamiento, estado:c.estado,
        token:c.pacientes?.token??null, fecha_hora:c.fecha_hora,
      })))
    }
    setLoading(false)
  },[tenant])

  useEffect(()=>{if (tenant) load()},[load, tenant])

  const loadLogs = useCallback(async()=>{
    if (!tenant) return
    const {data} = await supabase.from('logs_envios').select('id,paciente,canal,estado,hora').eq('tenant_id', tenant.id).order('created_at',{ascending:false}).limit(20)
    if(data) setLogs(data)
  },[tenant])

  useEffect(()=>{if (tenant) loadLogs()},[loadLogs, tenant])

  const conf    = citas.filter(c=>c.estado==='confirmado').length
  const pend    = citas.filter(c=>c.estado==='pendiente').length
  const tasa    = citas.length>0?Math.round(conf/citas.length*100):0
  const lista   = filtro==='todas'?citas:citas.filter(c=>c.estado===filtro)
  const logOk   = logs.filter(l=>l.estado==='enviado').length
  const logFail = logs.filter(l=>l.estado==='fallido').length

  async function confirmar(id:string){
    await supabase.from('citas').update({estado:'confirmado'}).eq('id',id)
    setCitas(p=>p.map(c=>c.id===id?{...c,estado:'confirmado' as EstadoCita}:c))
    msg('Cita confirmada ✓')
  }

  async function enviarMasivo(){
    if (!tenant) return
    setEnviando(true)
    try {
      const pendientes = citas.filter(c=>c.estado==='pendiente')
      const res = await fetch('/api/recordatorios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({citas:pendientes.map(c=>({id:c.id,nombre:c.nombre,telefono:c.telefono,hora:c.hora,tratamiento:c.tratamiento})), tenantId: tenant.id})})
      if(!res.ok) throw new Error('Error del servidor')
      const {enviados,fallidos} = await res.json()
      const horaActual = new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})
      const registros = [...enviados.map((nombre:string)=>({paciente:nombre,canal:'Email',estado:'enviado',hora:horaActual,tenant_id:tenant.id})),...fallidos.map((nombre:string)=>({paciente:nombre,canal:'Email',estado:'fallido',hora:horaActual,tenant_id:tenant.id}))]
      if(registros.length>0){ await supabase.from('logs_envios').insert(registros); await loadLogs() }
      msg(`${enviados.length} recordatorios enviados`)
    } catch(e){ msg('Error al enviar recordatorios','error') }
    finally { setEnviando(false) }
  }

  async function enviarEmailsMañana() {
    if (citasMañana.length === 0 || !tenant) return
    setEnviandoEmail(true)
    try {
      const res = await fetch('/api/send-recordatorios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: tenant.id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error del servidor')
      const horaActual = new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})
      const registros = citasMañana.map(c => ({
        paciente: c.nombre,
        canal: 'Email',
        estado: 'enviado',
        hora: horaActual,
        tenant_id: tenant.id
      }))
      if (registros.length > 0) {
        await supabase.from('logs_envios').insert(registros)
        await loadLogs()
      }
      msg(`📧 ${data.enviados ?? 0} emails enviados para mañana`)
    } catch(e: any) {
      msg('Error al enviar emails', 'error')
    } finally {
      setEnviandoEmail(false)
    }
  }

  if (!authChecked || tenantLoading) return null

  const primaryColor = tenant?.primaryColor || '#0a1e3d'
  const secondaryColor = tenant?.secondaryColor || '#185FA5'
  const accentColor = tenant?.accentColor || '#138A6B'

  return (
    <div style={{display:'flex',minHeight:'100vh',fontFamily:'DM Sans, sans-serif'}}>
      <Sidebar pendientes={pend}/>
      <main style={{marginLeft:isMobile?0:240,flex:1,background:'transparent',paddingBottom:isMobile?90:0,minWidth:0,overflowX:'hidden'}}>
        <PageHeader title="Dashboard" sub={hoy}
          right={<span style={{fontSize:isMobile?11:12,padding:'5px 12px',borderRadius:6,fontWeight:700,background:`${accentColor}20`,color:accentColor}}>Tasa: {tasa}%</span>}
        />
        <div style={{padding:isMobile?'1rem':'1.75rem 2rem',maxWidth:1100}}>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(4,1fr)',gap:12,marginBottom:'1.5rem'}}>
            <MetricCard label="Citas hoy"        value={loading?'…':citas.length} sub="Total agendadas"     accent={primaryColor}/>
            <MetricCard label="Confirmadas"       value={loading?'…':conf}         sub={`${tasa}% de tasa`} accent={accentColor}/>
            <MetricCard label="Pendientes"        value={loading?'…':pend}         sub="Sin confirmar"       accent={secondaryColor}/>
            <MetricCard label="Tasa confirmación" value={loading?'…':`${tasa}%`}   sub="Objetivo: 85%"      accent={tasa>=85?accentColor:'#D85A30'}/>
          </div>
          <div className="glass-container progress-glow" style={{padding:isMobile?'1rem':'1.1rem 1.4rem',marginBottom:'1.5rem', '--glow-color': `${tasa >= 85 ? accentColor : '#EF9F27'}25` } as React.CSSProperties}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:600,color:primaryColor}}>Progreso del día</span>
              <span style={{fontSize:13,color:'#8fa3bc',fontWeight:600}}>{conf} de {citas.length}</span>
            </div>
            <div style={{height:8,background:'#f0f0ee',borderRadius:4,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${tasa}%`,background:tasa>=85?accentColor:secondaryColor,borderRadius:4,transition:'width .5s ease'}}/>
            </div>
            <div style={{fontSize:11,color:'#8fa3bc',marginTop:5}}>Objetivo: 85%</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 300px',gap:16,alignItems:'start'}}>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:isMobile?'flex-start':'center',flexDirection:isMobile?'column':'row',gap:isMobile?8:0,marginBottom:12}}>
                <span style={{fontWeight:700,fontSize:14,color:primaryColor}}>Citas de hoy</span>
                <FilterBar options={FILTROS} active={filtro} onChange={setFiltro}/>
              </div>
              {loading?<Spinner/>:(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {lista.map(c=>{
                    const tc=TRAT_STYLE[c.tratamiento]||TRAT_STYLE.Consulta
                    const es=ESTADO_STYLE[c.estado]||ESTADO_STYLE.pendiente
                    return(
                      <div key={c.id} className="interactive-item" style={{background:'rgba(255,255,255,0.7)',border:'0.5px solid rgba(56,138,221,0.12)',borderRadius:12,padding:isMobile?'0.75rem':'0.85rem 1rem',display:'flex',alignItems:isMobile?'flex-start':'center',flexWrap:isMobile?'wrap':'nowrap',gap:isMobile?8:14}}>
                        <div style={{fontSize:13,fontWeight:700,color:primaryColor,minWidth:40,textAlign:'center'}}>{c.hora}</div>
                        <div style={{width:8,height:8,borderRadius:'50%',background:tc.dot,flexShrink:0,marginTop:isMobile?4:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:14,color:primaryColor,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre}</div>
                          <div style={{marginTop:3}}><Badge bg={tc.bg} color={tc.color}>{c.tratamiento}</Badge></div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8,width:isMobile?'100%':'auto',justifyContent:isMobile?'flex-end':'flex-start'}}>
                          <Badge bg={es.bg} color={es.color}>{es.label}</Badge>
                          {c.estado==='pendiente'&&(
                            <button onClick={()=>confirmar(c.id)} className="btn-premium" style={{fontSize:11,padding:'4px 10px',borderRadius:7,border:`1.5px solid ${accentColor}`,background:`${accentColor}18`,color:accentColor,cursor:'pointer',fontWeight:600,fontFamily:'DM Sans, sans-serif',whiteSpace:'nowrap'}}>
                              Confirmar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {lista.length===0&&(
                    <div style={{textAlign:'center',padding:'3rem 2rem',background:'rgba(255,255,255,0.6)',backdropFilter:'blur(20px)',borderRadius:16,border:'1px dashed rgba(56,138,221,0.2)',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={`${secondaryColor}60`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                        <line x1="8" y1="14" x2="16" y2="14" />
                        <line x1="8" y1="18" x2="12" y2="18" />
                      </svg>
                      <div style={{fontWeight:600,fontSize:14,color:primaryColor}}>No hay citas programadas</div>
                      <div style={{fontSize:12,color:'#8fa3bc'}}>Para hoy no registrás turnos agendados.</div>
                    </div>
                  )}
                </div>
              )}
              <button onClick={enviarMasivo} disabled={enviando||pend===0} className="btn-premium" style={{marginTop:16,width:'100%',padding:'0.8rem',borderRadius:12,border:'none',background:enviando||pend===0?'#e5e5e5':`linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,color:enviando||pend===0?'#aaa':'#fff',fontWeight:600,fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',gap:8,cursor:enviando||pend===0?'not-allowed':'pointer',fontFamily:'DM Sans, sans-serif',boxShadow: enviando||pend===0?'none':`0 4px 14px ${secondaryColor}30`}}>
                {enviando
                  ?<><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Enviando...</>
                  :<><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>{isMobile?`Enviar (${pend})`:`Enviar recordatorios (${pend} pendientes)`}</>
                }
              </button>
            </div>
            <div style={{marginTop:isMobile?8:0}}>
              <div style={{fontWeight:600,fontSize:14,marginBottom:12,color:primaryColor}}>Log de envíos</div>
              <div className="glass-container" style={{borderRadius:14,overflow:'hidden',background:'rgba(255,255,255,0.7)'}}>
                {logs.length===0
                  ?<div style={{padding:'2rem',textAlign:'center',color:'#ccc',fontSize:13}}>Sin envíos aún</div>
                  :logs.slice(0,8).map((l,i)=>(
                    <div key={l.id} style={{display:'flex',alignItems:'center',gap:10,padding:'0.75rem 1rem',borderBottom:i<Math.min(logs.length,8)-1?'0.5px solid rgba(56,138,221,0.08)':'none'}}>
                      <div style={{width:7,height:7,borderRadius:'50%',flexShrink:0,background:l.estado==='enviado'?accentColor:'#D85A30'}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,color:primaryColor,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.paciente}</div>
                        <div style={{fontSize:11,color:'#aaa'}}>{l.canal} · {l.hora}</div>
                      </div>
                      <Badge bg={l.estado==='enviado'?'#E1F5EE':'#FAECE7'} color={l.estado==='enviado'?'#085041':'#712B13'}>{l.estado}</Badge>
                    </div>
                  ))
                }
              </div>
              <div style={{display:'flex',gap:8,marginTop:10}}>
                <div className="interactive-item" style={{flex:1,background:`${accentColor}12`,backdropFilter:'blur(10px)',borderRadius:10,padding:'0.7rem',textAlign:'center',border:`1px solid ${accentColor}20`}}><div style={{fontSize:20,fontWeight:700,color:accentColor}}>{logOk}</div><div style={{fontSize:11,color:accentColor,fontWeight:600}}>Enviados</div></div>
                <div className="interactive-item" style={{flex:1,background:'rgba(250,236,231,0.75)',backdropFilter:'blur(10px)',borderRadius:10,padding:'0.7rem',textAlign:'center',border:'1px solid rgba(216,90,48,0.15)'}}><div style={{fontSize:20,fontWeight:700,color:'#712B13'}}>{logFail}</div><div style={{fontSize:11,color:'#D85A30',fontWeight:600}}>Fallidos</div></div>
              </div>
            </div>
          </div>
          <div style={{marginTop:32,borderTop:'1px solid rgba(56,138,221,0.12)',paddingTop:24}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:mostrarMañana?16:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontWeight:700,fontSize:15,color:primaryColor}}>Turnos de mañana</span>
                <span style={{fontSize:12,fontWeight:700,padding:'2px 10px',borderRadius:20,background:`${accentColor}20`,color:accentColor}}>{citasMañana.length}</span>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={enviarEmailsMañana} disabled={enviandoEmail||citasMañana.length===0} className="btn-premium" style={{fontSize:12,fontWeight:600,padding:'5px 14px',borderRadius:8,border:'none',background:enviandoEmail||citasMañana.length===0?'#e5e5e5':primaryColor,color:enviandoEmail||citasMañana.length===0?'#aaa':'#fff',cursor:enviandoEmail||citasMañana.length===0?'not-allowed':'pointer',fontFamily:'DM Sans, sans-serif',display:'flex',alignItems:'center',gap:6,boxShadow: enviandoEmail||citasMañana.length===0?'none':`0 2px 8px ${secondaryColor}25`}}>
                  {enviandoEmail
                    ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Enviando...</>
                    : <>📧 Emails ({citasMañana.length})</>
                  }
                </button>
                <button onClick={()=>setMostrarMañana(v=>!v)} className="btn-premium" style={{fontSize:12,fontWeight:600,padding:'5px 14px',borderRadius:8,border:'0.5px solid rgba(56,138,221,0.2)',background:'#fff',color:primaryColor,cursor:'pointer',fontFamily:'DM Sans, sans-serif',display:'flex',alignItems:'center',gap:5}}>
                  {mostrarMañana?'Ocultar ▲':'Ver turnos ▼'}
                </button>
              </div>
            </div>
            {mostrarMañana&&(
              loading?<Spinner/>:citasMañana.length===0
                ?<div style={{textAlign:'center',padding:'2.5rem 1.5rem',background:'rgba(255,255,255,0.7)',backdropFilter:'blur(20px)',border:'1px dashed rgba(56,138,221,0.15)',borderRadius:12,color:'#8fa3bc',fontSize:13}}>Sin turnos para mañana</div>
                :<div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(3,1fr)',gap:12}}>
                  {citasMañana.map(c=>{
                    const ar=new Date(new Date(c.fecha_hora).toLocaleString('en-US',{timeZone:'America/Argentina/Buenos_Aires'}))
                    const DIAS=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
                    const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
                    return(
                      <div key={c.id} className="interactive-item" style={{background:'rgba(255,255,255,0.7)',borderRadius:12,padding:16,border:'1px solid rgba(255,255,255,0.85)',display:'flex',flexDirection:'column',gap:8}}>
                        <div style={{fontSize:22,fontWeight:700,color:accentColor,lineHeight:1}}>{c.hora}</div>
                        <div style={{fontWeight:600,fontSize:14,color:primaryColor,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre}</div>
                        <div style={{fontSize:13,color:'#8fa3bc'}}>{c.tratamiento}</div>
                        {c.token&&(
                          <button onClick={()=>{
                            const ar=new Date(new Date(c.fecha_hora).toLocaleString('en-US',{timeZone:'America/Argentina/Buenos_Aires'}))
                            const DIAS=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
                            const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
                            const diaSemana=DIAS[ar.getDay()]
                            const fechaTexto=ar.getDate()+' de '+MESES[ar.getMonth()]
                            const horaTexto=String(ar.getHours()).padStart(2,'0')+':'+String(ar.getMinutes()).padStart(2,'0')
                            let msgText = tenant?.whatsappTemplate || ''
                            msgText = msgText
                              .replace(/{nombre_paciente}/g, c.nombre)
                              .replace(/{nombre_clinica}/g, tenant?.nombre || 'DentalDesk')
                              .replace(/{dia_semana}/g, diaSemana)
                              .replace(/{fecha}/g, fechaTexto)
                              .replace(/{hora}/g, horaTexto)
                              .replace(/{tratamiento}/g, c.tratamiento)
                              .replace(/{link}/g, `${window.location.origin}/paciente/${c.token}`)
                            const txt = encodeURIComponent(msgText)
                            window.open(`https://wa.me/${normalizarTelefono(c.telefono)}?text=${txt}`,'_blank')
                          }} className="btn-premium" style={{marginTop:'auto',width:'100%',padding:'7px 0',borderRadius:8,border:'none',background:'#25D366',color:'#fff',fontWeight:600,fontSize:12,cursor:'pointer',fontFamily:'DM Sans, sans-serif',boxShadow: '0 2px 6px rgba(37,211,102,0.15)'}}>
                            Enviar WhatsApp
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
            )}
          </div>
        </div>
      </main>
      {toast&&<Toast msg={toast.msg} tipo={toast.tipo}/>}
    </div>
  )
}
