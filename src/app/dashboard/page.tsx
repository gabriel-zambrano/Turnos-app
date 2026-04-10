'use client'
import { useAuth } from '@/hooks/useAuth'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, FilterBar, Spinner, MetricCard } from '@/components/UI'
import { TRAT_STYLE, ESTADO_STYLE, hoyISO } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import type { EstadoCita } from '@/types'

interface Cita { id:string; nombre:string; hora:string; tratamiento:string; estado:EstadoCita; telefono:string }
interface LogItem { id:string; paciente:string; canal:string; estado:string; hora:string }
const FILTROS = [{k:'todas',l:'Todas'},{k:'pendiente',l:'Pendientes'},{k:'confirmado',l:'Confirmadas'}]

export default function Dashboard() {
  useAuth()
  const [citas, setCitas] = useState<Cita[]>([])
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
  const [toast, setToast] = useState<{msg:string;tipo:string}|null>(null)
  const [hoy, setHoy] = useState('')

  useEffect(()=>{
    setHoy(new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'}))
  },[])

  function msg(m:string,tipo='ok'){setToast({msg:m,tipo});setTimeout(()=>setToast(null),3500)}

  const load = useCallback(async()=>{
    setLoading(true)
    const {data} = await supabase.from('citas').select('id,tipo_tratamiento,estado,fecha_hora,pacientes(nombre,telefono)').gte('fecha_hora',`${hoyISO()}T00:00:00`).lte('fecha_hora',`${hoyISO()}T23:59:59`).order('fecha_hora',{ascending:true})
    if(data){
      setCitas((data as any[]).map(c=>({
        id:c.id, nombre:c.pacientes?.nombre??'—', telefono:c.pacientes?.telefono??'—',
        hora:new Date(c.fecha_hora).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}),
        tratamiento:c.tipo_tratamiento, estado:c.estado,
      })))
    }
    setLoading(false)
  },[])

  useEffect(()=>{load()},[load])

  const loadLogs = useCallback(async()=>{
    const {data} = await supabase.from('logs_envios').select('id,paciente,canal,estado,hora').order('created_at',{ascending:false}).limit(20)
    if(data) setLogs(data)
  },[])

  useEffect(()=>{loadLogs()},[loadLogs])

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
    setEnviando(true)
    try {
      const pendientes = citas.filter(c=>c.estado==='pendiente')
      const res = await fetch('/api/recordatorios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({citas:pendientes.map(c=>({id:c.id,nombre:c.nombre,telefono:c.telefono,hora:c.hora,tratamiento:c.tratamiento}))})})
      if(!res.ok) throw new Error('Error del servidor')
      const {enviados,fallidos} = await res.json()
      const horaActual = new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})
      const registros = [...enviados.map((nombre:string)=>({paciente:nombre,canal:'WhatsApp',estado:'enviado',hora:horaActual})),...fallidos.map((nombre:string)=>({paciente:nombre,canal:'WhatsApp',estado:'fallido',hora:horaActual}))]
      if(registros.length>0){ await supabase.from('logs_envios').insert(registros); await loadLogs() }
      msg(`${enviados.length} recordatorios enviados`)
    } catch(e){ msg('Error al enviar recordatorios','error') }
    finally { setEnviando(false) }
  }

  return (
    <div style={{display:'flex',minHeight:'100vh',fontFamily:'DM Sans, sans-serif'}}>
      <Sidebar pendientes={pend}/>
      <main style={{marginLeft:isMobile?0:240,flex:1,background:'transparent',paddingBottom:isMobile?80:0,minWidth:0,overflowX:'hidden'}}>
        <PageHeader title="Dashboard" sub={hoy}
          right={<span style={{fontSize:isMobile?11:12,padding:'5px 12px',borderRadius:6,fontWeight:500,background:tasa>=85?'#E1F5EE':'#FAEEDA',color:tasa>=85?'#085041':'#633806'}}>Tasa: {tasa}%</span>}
        />
        <div style={{padding:isMobile?'1rem':'1.75rem 2rem',maxWidth:1100}}>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(4,1fr)',gap:12,marginBottom:'1.5rem'}}>
            <MetricCard label="Citas hoy"        value={loading?'…':citas.length} sub="Total agendadas"     accent="#0f1e2b"/>
            <MetricCard label="Confirmadas"       value={loading?'…':conf}         sub={`${tasa}% de tasa`} accent="#1D9E75"/>
            <MetricCard label="Pendientes"        value={loading?'…':pend}         sub="Sin confirmar"       accent="#EF9F27"/>
            <MetricCard label="Tasa confirmación" value={loading?'…':`${tasa}%`}   sub="Objetivo: 85%"      accent={tasa>=85?'#1D9E75':'#D85A30'}/>
          </div>
          <div style={{background:'#fff',border:'0.5px solid #e8e8e8',borderRadius:16,padding:isMobile?'1rem':'1.1rem 1.4rem',marginBottom:'1.5rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:500}}>Progreso del día</span>
              <span style={{fontSize:13,color:'#888'}}>{conf} de {citas.length}</span>
            </div>
            <div style={{height:8,background:'#f0f0ee',borderRadius:4,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${tasa}%`,background:tasa>=85?'#1D9E75':'#EF9F27',borderRadius:4,transition:'width .5s ease'}}/>
            </div>
            <div style={{fontSize:11,color:'#aaa',marginTop:5}}>Objetivo: 85%</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 300px',gap:16,alignItems:'start'}}>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:isMobile?'flex-start':'center',flexDirection:isMobile?'column':'row',gap:isMobile?8:0,marginBottom:12}}>
                <span style={{fontWeight:600,fontSize:14}}>Citas de hoy</span>
                <FilterBar options={FILTROS} active={filtro} onChange={setFiltro}/>
              </div>
              {loading?<Spinner/>:(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {lista.map(c=>{
                    const tc=TRAT_STYLE[c.tratamiento]||TRAT_STYLE.Consulta
                    const es=ESTADO_STYLE[c.estado]||ESTADO_STYLE.pendiente
                    return(
                      <div key={c.id} style={{background:'#fff',border:'0.5px solid #e5e5e5',borderRadius:12,padding:isMobile?'0.75rem':'0.85rem 1rem',display:'flex',alignItems:isMobile?'flex-start':'center',flexWrap:isMobile?'wrap':'nowrap',gap:isMobile?8:14}}>
                        <div style={{fontSize:13,fontWeight:700,color:'#0f1e2b',minWidth:40,textAlign:'center'}}>{c.hora}</div>
                        <div style={{width:8,height:8,borderRadius:'50%',background:tc.dot,flexShrink:0,marginTop:isMobile?4:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre}</div>
                          <div style={{marginTop:3}}><Badge bg={tc.bg} color={tc.color}>{c.tratamiento}</Badge></div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8,width:isMobile?'100%':'auto',justifyContent:isMobile?'flex-end':'flex-start'}}>
                          <Badge bg={es.bg} color={es.color}>{es.label}</Badge>
                          {c.estado==='pendiente'&&(
                            <button onClick={()=>confirmar(c.id)} style={{fontSize:11,padding:'4px 10px',borderRadius:7,border:'0.5px solid #1D9E75',background:'#E1F5EE',color:'#085041',cursor:'pointer',fontWeight:500,fontFamily:'DM Sans, sans-serif',whiteSpace:'nowrap'}}>
                              Confirmar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {lista.length===0&&<div style={{textAlign:'center',color:'#ccc',padding:'2rem',fontSize:13}}>Sin citas para hoy</div>}
                </div>
              )}
              <button onClick={enviarMasivo} disabled={enviando||pend===0} style={{marginTop:16,width:'100%',padding:'0.8rem',borderRadius:12,border:'none',background:enviando||pend===0?'#e5e5e5':'#0f1e2b',color:enviando||pend===0?'#aaa':'#fff',fontWeight:600,fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',gap:8,cursor:enviando||pend===0?'not-allowed':'pointer',fontFamily:'DM Sans, sans-serif'}}>
                {enviando
                  ?<><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Enviando...</>
                  :<><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>{isMobile?`Enviar (${pend})`:`Enviar recordatorios (${pend} pendientes)`}</>
                }
              </button>
            </div>
            <div style={{marginTop:isMobile?8:0}}>
              <div style={{fontWeight:600,fontSize:14,marginBottom:12}}>Log de envíos</div>
              <div style={{background:'#fff',border:'0.5px solid #e8e8e8',borderRadius:14,overflow:'hidden'}}>
                {logs.length===0
                  ?<div style={{padding:'2rem',textAlign:'center',color:'#ccc',fontSize:13}}>Sin envíos aún</div>
                  :logs.slice(0,8).map((l,i)=>(
                    <div key={l.id} style={{display:'flex',alignItems:'center',gap:10,padding:'0.75rem 1rem',borderBottom:i<Math.min(logs.length,8)-1?'0.5px solid #f0f0ee':'none'}}>
                      <div style={{width:7,height:7,borderRadius:'50%',flexShrink:0,background:l.estado==='enviado'?'#1D9E75':'#D85A30'}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.paciente}</div>
                        <div style={{fontSize:11,color:'#aaa'}}>{l.canal} · {l.hora}</div>
                      </div>
                      <Badge bg={l.estado==='enviado'?'#E1F5EE':'#FAECE7'} color={l.estado==='enviado'?'#085041':'#712B13'}>{l.estado}</Badge>
                    </div>
                  ))
                }
              </div>
              <div style={{display:'flex',gap:8,marginTop:10}}>
                <div style={{flex:1,background:'#E1F5EE',borderRadius:10,padding:'0.7rem',textAlign:'center'}}><div style={{fontSize:20,fontWeight:700,color:'#085041'}}>{logOk}</div><div style={{fontSize:11,color:'#1D9E75'}}>Enviados</div></div>
                <div style={{flex:1,background:'#FAECE7',borderRadius:10,padding:'0.7rem',textAlign:'center'}}><div style={{fontSize:20,fontWeight:700,color:'#712B13'}}>{logFail}</div><div style={{fontSize:11,color:'#D85A30'}}>Fallidos</div></div>
              </div>
            </div>
          </div>
        </div>
      </main>
      {toast&&<Toast msg={toast.msg} tipo={toast.tipo}/>}
    </div>
  )
}
