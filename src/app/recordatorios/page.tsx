'use client'
import { useAuth } from '@/hooks/useAuth'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { PageHeader, Badge, Spinner } from '@/components/UI'
import { supabase } from '@/lib/supabase'

interface LogDB { id:string; tipo_mensaje:string; estado_envio:string; mensaje_preview:string|null; enviado_en:string|null; citas:{fecha_hora:string;pacientes:{nombre:string}|null}|null }

export default function Recordatorios() {
  const { loading, authed } = useAuth()
  if (loading) return null
  if (!authed) return null
  const [logs, setLogs] = useState<LogDB[]>([])
  const [isMobile, setIsMobile] = useState(false)
  useEffect(()=>{ const check = () => setIsMobile(window.innerWidth < 768); check(); window.addEventListener('resize', check); return () => window.removeEventListener('resize', check) },[])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async()=>{
    setLoading(true)
    const {data} = await supabase.from('recordatorios_log').select('*, citas(fecha_hora, pacientes(nombre))').order('creado_en',{ascending:false}).limit(50)
    if(data) setLogs(data as LogDB[])
    setLoading(false)
  },[])

  useEffect(()=>{load()},[load])

  return (
    <div style={{display:'flex',minHeight:'100vh',fontFamily:'DM Sans, sans-serif'}}>
      <Sidebar/>
      <main style={{marginLeft:isMobile?0:240,flex:1,background:'transparent',paddingBottom:isMobile?80:0,minWidth:0,overflowX:'hidden'}}>
        <PageHeader title="Recordatorios"/>
        <div style={{padding:isMobile?'0.75rem':'1.75rem 2rem',maxWidth:1100}}>
          <div style={{background:'#fff',border:'0.5px solid #e8e8e8',borderRadius:16,padding:'1.25rem',marginBottom:'1.5rem'}}>
            <div style={{fontWeight:600,fontSize:15,marginBottom:6}}>Cron automático</div>
            <p style={{fontSize:13,color:'#666',lineHeight:1.7,margin:0}}>Cada mañana a las <strong>8:00 AM</strong> se envían WhatsApp personalizados a pacientes con citas en las próximas 24 horas. Si el paciente responde <strong>SI</strong>, la cita se confirma automáticamente.</p>
            <div style={{marginTop:'1rem',padding:'0.85rem 1rem',background:'#f8f8f8',borderRadius:10,fontSize:12,color:'#888',fontFamily:'monospace',overflowX:'auto',whiteSpace:'nowrap'}}>
              Cron: 0 8 * * * → supabase/functions/enviar-recordatorios
            </div>
          </div>
          {loading ? <Spinner/> : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {logs.length===0 && <div style={{textAlign:'center',color:'#ccc',padding:'2rem',fontSize:13}}>Sin envíos registrados aún.</div>}
              {logs.map(l=>{
                const nombre = l.citas?.pacientes?.nombre??'—'
                const hora = l.enviado_en ? new Date(l.enviado_en).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'
                const enviado = l.estado_envio==='enviado'
                return (
                  <div key={l.id} style={{background:'#fff',border:'0.5px solid #e5e5e5',borderRadius:12,padding:'0.85rem 1rem',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                    <div style={{width:7,height:7,borderRadius:'50%',flexShrink:0,background:enviado?'#1D9E75':'#D85A30'}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nombre}</div>
                      <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{l.tipo_mensaje} · {hora}</div>
                      {l.mensaje_preview && <div style={{fontSize:11,color:'#999',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.mensaje_preview}</div>}
                    </div>
                    <Badge bg={enviado?'#E1F5EE':'#FAECE7'} color={enviado?'#085041':'#712B13'}>{l.estado_envio}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
