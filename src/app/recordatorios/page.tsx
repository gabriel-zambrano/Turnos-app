'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { PageHeader, Badge, DataTable, TR, TD, Spinner } from '@/components/UI'
import { supabase } from '@/lib/supabase'

interface LogDB { id:string; tipo_mensaje:string; estado_envio:string; mensaje_preview:string|null; enviado_en:string|null; citas:{fecha_hora:string;pacientes:{nombre:string}|null}|null }

export default function Recordatorios() {
  const [logs,    setLogs]    = useState<LogDB[]>([])
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
      <main style={{marginLeft:240,flex:1,background:'#f4f6f8'}}>
        <PageHeader title="Recordatorios"/>
        <div style={{padding:'1.75rem 2rem',maxWidth:1100}}>
          <div style={{background:'#fff',border:'0.5px solid #e8e8e8',borderRadius:16,padding:'1.25rem 1.5rem',marginBottom:'1.5rem'}}>
            <div style={{fontWeight:600,fontSize:15,marginBottom:6}}>Cron automático</div>
            <p style={{fontSize:13,color:'#666',lineHeight:1.7}}>Cada mañana a las <strong>8:00 AM</strong> se envían WhatsApp personalizados a pacientes con citas en las próximas 24 horas. Si el paciente responde <strong>SI</strong>, la cita se confirma automáticamente.</p>
            <div style={{marginTop:'1rem',padding:'0.85rem 1rem',background:'#f8f8f8',borderRadius:10,fontSize:12,color:'#888',fontFamily:'monospace'}}>
              Cron: 0 8 * * * → supabase/functions/enviar-recordatorios
            </div>
          </div>
          {loading?<Spinner/>:(
            <DataTable headers={['Paciente','Canal','Estado','Enviado','Vista previa']} empty={logs.length===0} emptyMsg="Sin envíos registrados aún.">
              {logs.map(l=>{
                const nombre=l.citas?.pacientes?.nombre??'—'
                const hora=l.enviado_en?new Date(l.enviado_en).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'
                return(
                  <TR key={l.id}>
                    <TD first><div style={{fontWeight:500}}>{nombre}</div></TD>
                    <TD>{l.tipo_mensaje}</TD>
                    <TD><Badge bg={l.estado_envio==='enviado'?'#E1F5EE':'#FAECE7'} color={l.estado_envio==='enviado'?'#085041':'#712B13'}>{l.estado_envio}</Badge></TD>
                    <TD muted>{hora}</TD>
                    <TD muted>{l.mensaje_preview?.slice(0,60)??'—'}</TD>
                  </TR>
                )
              })}
            </DataTable>
          )}
        </div>
      </main>
    </div>
  )
}
