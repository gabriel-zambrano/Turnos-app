'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, BtnPrimary, BtnSm, Spinner, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss, btnRedCss, selectCss, textareaCss, inputCss } from '@/components/UI'
import { TRAT_STYLE, ESTADO_STYLE, TRATAMIENTOS, ESTADOS, DURACIONES, horasDisponibles, hoyISO } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import type { EstadoCita, TipoTratamiento } from '@/types'

interface CitaDB { id:string; paciente_id:string; fecha_hora:string; tipo_tratamiento:string; estado:string; notas:string|null; duracion_minutos:number; pacientes:{nombre:string;telefono:string}|null }
interface Cita   { id:string; paciente_id:string; nombre:string; telefono:string; hora:string; fecha:string; tratamiento:string; estado:EstadoCita; duracion:number; notas:string; minutos:number }
interface PacMin { id:string; nombre:string; telefono:string }

function toCita(c: CitaDB): Cita {
  const dt = new Date(c.fecha_hora)
  const ar = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const h = ar.getHours(), m = ar.getMinutes()
  return {
    id:c.id, paciente_id:c.paciente_id,
    nombre:c.pacientes?.nombre??'—', telefono:c.pacientes?.telefono??'—',
    hora:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,
    fecha:dt.toISOString().split('T')[0],
    tratamiento:c.tipo_tratamiento, estado:c.estado as EstadoCita,
    duracion:c.duracion_minutos, notas:c.notas??'',
    minutos: h * 60 + m
  }
}

function getFechaSemana(base: string): string[] {
  const d = new Date(base + 'T12:00:00')
  const dia = d.getDay()
  const lunes = new Date(d)
  lunes.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1))
  return Array.from({length:6}, (_,i) => {
    const f = new Date(lunes)
    f.setDate(lunes.getDate() + i)
    return f.toISOString().split('T')[0]
  })
}

const DIAS_LABEL = ['Lun','Mar','Mié','Jue','Vie','Sáb']
const HORA_INICIO = 8
const HORA_FIN = 20
const SLOT_H = 48 // px por hora

export default function Agenda() {
  const [citas,   setCitas]   = useState<Cita[]>([])
  const [pacs,    setPacs]    = useState<PacMin[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [modal,   setModal]   = useState<'nueva'|'editar'|'borrar'|'detalle'|null>(null)
  const [sel,     setSel]     = useState<Cita|null>(null)
  const [fecha,   setFecha]   = useState(hoyISO())
  const [toast,   setToast]   = useState<{msg:string;tipo:string}|null>(null)
  const [vista,   setVista]   = useState<'semana'|'dia'>('semana')

  const [fPac,   setFPac]   = useState('')
  const [fHora,  setFHora]  = useState('09:00')
  const [fFecha, setFFecha] = useState(hoyISO())
  const [fTrat,  setFTrat]  = useState('Consulta')
  const [fEst,   setFEst]   = useState<EstadoCita>('pendiente')
  const [fDur,   setFDur]   = useState(30)
  const [fNotas, setFNotas] = useState('')

  function msg(m:string,tipo='ok'){setToast({msg:m,tipo});setTimeout(()=>setToast(null),3500)}

  const semana = getFechaSemana(fecha)
  const desdeISO = semana[0] + 'T00:00:00'
  const hastaISO = semana[5] + 'T23:59:59'

  const loadCitas = useCallback(async()=>{
    setLoading(true)
    const desde = vista==='semana' ? semana[0]+'T00:00:00' : fecha+'T00:00:00'
    const hasta = vista==='semana' ? semana[5]+'T23:59:59' : fecha+'T23:59:59'
    const {data,error} = await supabase.from('citas').select('*, pacientes(nombre,telefono)').gte('fecha_hora',desde).lte('fecha_hora',hasta).order('fecha_hora',{ascending:true})
    if(error) msg('Error: '+error.message,'error')
    else setCitas((data as CitaDB[]).map(toCita))
    setLoading(false)
  },[fecha, vista])

  const loadPacs = useCallback(async()=>{
    const {data} = await supabase.from('pacientes').select('id,nombre,telefono').order('nombre')
    if(data) setPacs(data as PacMin[])
  },[])

  useEffect(()=>{loadCitas()},[loadCitas])
  useEffect(()=>{loadPacs()},[loadPacs])

  function openNueva(f?:string, h?:string){
    setFPac('');setFHora(h||'09:00');setFFecha(f||fecha);setFTrat('Consulta');setFEst('pendiente');setFDur(30);setFNotas('');setSel(null);setModal('nueva')
  }
  function openEditar(c:Cita){setSel(c);setFHora(c.hora);setFFecha(c.fecha);setFTrat(c.tratamiento);setFEst(c.estado);setFDur(c.duracion);setFNotas(c.notas);setModal('editar')}

  async function saveNueva(){
    if(!fPac) return msg('Seleccioná un paciente','error')
    setSaving(true)
    const {error} = await supabase.from('citas').insert({paciente_id:fPac,fecha_hora:`${fFecha}T${fHora}:00-03:00`,tipo_tratamiento:fTrat,estado:fEst,duracion_minutos:fDur,notas:fNotas||null})
    setSaving(false)
    if(error) return msg('Error: '+error.message,'error')
    setModal(null);msg('Cita agendada ✓');loadCitas()
  }

  async function saveEditar(){
    if(!sel) return
    setSaving(true)
    const {error} = await supabase.from('citas').update({fecha_hora:`${fFecha}T${fHora}:00-03:00`,tipo_tratamiento:fTrat as TipoTratamiento,estado:fEst,duracion_minutos:fDur,notas:fNotas||null}).eq('id',sel.id)
    setSaving(false)
    if(error) return msg('Error: '+error.message,'error')
    setModal(null);msg('Cita actualizada ✓');loadCitas()
  }

  async function saveBorrar(){
    if(!sel) return
    setSaving(true)
    const {error} = await supabase.from('citas').delete().eq('id',sel.id)
    setSaving(false)
    if(error) return msg('Error: '+error.message,'error')
    setModal(null);msg('Cita eliminada');loadCitas()
  }

  async function cambiarEstado(id:string,estado:EstadoCita){
    await supabase.from('citas').update({estado}).eq('id',id)
    setCitas(p=>p.map(c=>c.id===id?{...c,estado}:c))
    msg('Estado actualizado')
  }

  const horas = Array.from({length: HORA_FIN - HORA_INICIO}, (_,i) => HORA_INICIO + i)
  const totalH = (HORA_FIN - HORA_INICIO) * SLOT_H

  function citasDelDia(f: string){ return citas.filter(c => c.fecha === f) }

  function citaTop(c: Cita){ return (c.minutos - HORA_INICIO * 60) / 60 * SLOT_H }
  function citaHeight(c: Cita){ return Math.max(c.duracion / 60 * SLOT_H, 22) }

  const hoy = hoyISO()

  return (
    <div style={{display:'flex',minHeight:'100vh',fontFamily:'DM Sans, sans-serif'}}>
      <Sidebar pendientes={citas.filter(c=>c.estado==='pendiente').length}/>
      <main style={{marginLeft:240,flex:1,background:'#f4f6f8',minWidth:0}}>
        <PageHeader title="Agenda"
          right={
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              {/* Navegación semana */}
              <button onClick={()=>{const d=new Date(fecha);d.setDate(d.getDate()-7);setFecha(d.toISOString().split('T')[0])}} style={{background:'#fff',border:'1px solid #e2e8ed',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:16}}>‹</button>
              <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{...inputCss,width:150,padding:'0.5rem 0.75rem',fontSize:13}}/>
              <button onClick={()=>{const d=new Date(fecha);d.setDate(d.getDate()+7);setFecha(d.toISOString().split('T')[0])}} style={{background:'#fff',border:'1px solid #e2e8ed',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:16}}>›</button>
              <button onClick={()=>setFecha(hoyISO())} style={{background:'#fff',border:'1px solid #e2e8ed',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:12,color:'#555'}}>Hoy</button>
              {/* Toggle vista */}
              <div style={{display:'flex',background:'#fff',border:'1px solid #e2e8ed',borderRadius:8,overflow:'hidden'}}>
                {(['semana','dia'] as const).map(v=>(
                  <button key={v} onClick={()=>setVista(v)} style={{padding:'6px 14px',fontSize:12,border:'none',cursor:'pointer',background:vista===v?'#0f1e2b':'transparent',color:vista===v?'#fff':'#555',fontFamily:'DM Sans, sans-serif'}}>{v==='semana'?'Semana':'Día'}</button>
                ))}
              </div>
              <BtnPrimary onClick={()=>openNueva()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nueva cita
              </BtnPrimary>
            </div>
          }/>

        <div style={{padding:'1.5rem 2rem'}}>
          {loading ? <Spinner/> : (
            <div style={{background:'#fff',border:'1px solid #e2e8ed',borderRadius:16,overflow:'hidden'}}>

              {/* Header días */}
              <div style={{display:'grid',gridTemplateColumns:`64px repeat(${vista==='semana'?6:1}, 1fr)`,borderBottom:'1px solid #e2e8ed'}}>
                <div style={{padding:'12px 0',borderRight:'1px solid #e2e8ed'}}/>
                {(vista==='semana'?semana:[fecha]).map((f,i)=>{
                  const esHoy = f===hoy
                  const d = new Date(f+'T12:00:00')
                  const numDia = d.getDate()
                  const label = vista==='semana' ? DIAS_LABEL[i] : ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()]
                  return(
                    <div key={f} style={{padding:'10px 0',textAlign:'center',borderRight:'1px solid #f0f0f0'}}>
                      <div style={{fontSize:11,color:'#999',textTransform:'uppercase',letterSpacing:1}}>{label}</div>
                      <div style={{width:32,height:32,borderRadius:'50%',background:esHoy?'#0f1e2b':'transparent',color:esHoy?'#fff':'#1a1a1a',fontWeight:700,fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',margin:'4px auto 0'}}>{numDia}</div>
                    </div>
                  )
                })}
              </div>

              {/* Grid horario */}
              <div style={{display:'grid',gridTemplateColumns:`64px repeat(${vista==='semana'?6:1}, 1fr)`,overflowY:'auto',maxHeight:'calc(100vh - 220px)'}}>

                {/* Columna horas */}
                <div style={{borderRight:'1px solid #e2e8ed',position:'relative',height:totalH}}>
                  {horas.map(h=>(
                    <div key={h} style={{position:'absolute',top:(h-HORA_INICIO)*SLOT_H,left:0,right:0,height:SLOT_H,borderTop:'1px solid #f0f0f0',paddingTop:4}}>
                      <span style={{fontSize:10,color:'#bbb',paddingLeft:8}}>{String(h).padStart(2,'0')}:00</span>
                    </div>
                  ))}
                </div>

                {/* Columnas días */}
                {(vista==='semana'?semana:[fecha]).map((f)=>{
                  const citasF = citasDelDia(f)
                  return(
                    <div key={f} style={{position:'relative',height:totalH,borderRight:'1px solid #f0f0f0',cursor:'pointer'}}
                      onClick={e=>{
                        if((e.target as HTMLElement).closest('[data-cita]')) return
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const y = e.clientY - rect.top
                        const minTot = Math.floor(y / SLOT_H * 60 / 30) * 30
                        const h = Math.floor(minTot/60) + HORA_INICIO
                        const m = minTot % 60
                        openNueva(f, `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
                      }}>
                      {/* Líneas de hora */}
                      {horas.map(h=>(
                        <div key={h} style={{position:'absolute',top:(h-HORA_INICIO)*SLOT_H,left:0,right:0,height:SLOT_H,borderTop:'1px solid #f5f5f5'}}/>
                      ))}
                      {/* Citas */}
                      {citasF.map(c=>{
                        const tc = TRAT_STYLE[c.tratamiento]||TRAT_STYLE.Consulta
                        const es = ESTADO_STYLE[c.estado]||ESTADO_STYLE.pendiente
                        return(
                          <div key={c.id} data-cita="1"
                            onClick={e=>{e.stopPropagation();setSel(c);setModal('detalle')}}
                            style={{
                              position:'absolute',
                              top:citaTop(c)+2,
                              left:3, right:3,
                              height:citaHeight(c)-4,
                              background:tc.bg,
                              borderLeft:`3px solid ${tc.dot}`,
                              borderRadius:6,
                              padding:'3px 6px',
                              overflow:'hidden',
                              cursor:'pointer',
                              zIndex:1,
                              boxShadow:'0 1px 3px rgba(0,0,0,0.08)'
                            }}>
                            <div style={{fontSize:11,fontWeight:700,color:tc.color,lineHeight:1.2}}>{c.hora} · {c.nombre}</div>
                            {citaHeight(c)>30&&<div style={{fontSize:10,color:tc.color,opacity:0.8,marginTop:1}}>{c.tratamiento} · {c.duracion}min</div>}
                            {citaHeight(c)>44&&<div style={{fontSize:10,marginTop:2}}><span style={{background:es.bg,color:es.color,padding:'1px 5px',borderRadius:4}}>{es.label}</span></div>}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal detalle */}
      {modal==='detalle'&&sel&&(
        <div style={overlayCss} onClick={()=>setModal(null)}>
          <div style={{...modalCss,maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={modalTitleCss}>{sel.nombre}</div>
            <div style={{fontSize:14,color:'#555',lineHeight:2}}>
              <div>📅 <strong>{sel.fecha}</strong> a las <strong>{sel.hora}</strong></div>
              <div>🦷 {sel.tratamiento} · {sel.duracion} min</div>
              <div>📞 {sel.telefono}</div>
              {sel.notas&&<div>📝 {sel.notas}</div>}
            </div>
            <div style={{margin:'12px 0'}}>
              <label style={labelCss}>Estado</label>
              <select value={sel.estado} onChange={e=>{cambiarEstado(sel.id,e.target.value as EstadoCita);setSel({...sel,estado:e.target.value as EstadoCita})}} style={selectCss}>
                {ESTADOS.map(est=><option key={est} value={est}>{est.charAt(0).toUpperCase()+est.slice(1)}</option>)}
              </select>
            </div>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>{setModal(null);setTimeout(()=>{setSel(sel);setModal('borrar')},50)}}>Eliminar</button>
              <button style={btnDarkCss} onClick={()=>{setModal(null);setTimeout(()=>openEditar(sel),50)}}>Editar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nueva */}
      {modal==='nueva'&&(
        <div style={overlayCss} onClick={()=>setModal(null)}>
          <div style={modalCss} onClick={e=>e.stopPropagation()}>
            <div style={modalTitleCss}>Nueva cita</div>
            <div style={groupCss}>
              <label style={labelCss}>Paciente *</label>
              <select style={selectCss} value={fPac} onChange={e=>setFPac(e.target.value)}>
                <option value="">— Seleccionar paciente —</option>
                {pacs.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Fecha</label><input type="date" style={{...selectCss}} value={fFecha} onChange={e=>setFFecha(e.target.value)}/></div>
              <div style={groupCss}><label style={labelCss}>Horario</label><select style={selectCss} value={fHora} onChange={e=>setFHora(e.target.value)}>{horasDisponibles().map(h=><option key={h} value={h}>{h}</option>)}</select></div>
            </div>
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Tratamiento</label><select style={selectCss} value={fTrat} onChange={e=>setFTrat(e.target.value)}>{TRATAMIENTOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
              <div style={groupCss}><label style={labelCss}>Duración</label><select style={selectCss} value={fDur} onChange={e=>setFDur(Number(e.target.value))}>{DURACIONES.map(d=><option key={d} value={d}>{d} min</option>)}</select></div>
            </div>
            <div style={groupCss}><label style={labelCss}>Estado</label><select style={selectCss} value={fEst} onChange={e=>setFEst(e.target.value as EstadoCita)}>{ESTADOS.map(est=><option key={est} value={est}>{est.charAt(0).toUpperCase()+est.slice(1)}</option>)}</select></div>
            <div style={groupCss}><label style={labelCss}>Notas</label><textarea style={textareaCss} value={fNotas} onChange={e=>setFNotas(e.target.value)} placeholder="Observaciones..."/></div>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{...btnDarkCss,opacity:saving?.6:1}} onClick={saveNueva} disabled={saving}>{saving?'Guardando...':'Agendar cita'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {modal==='editar'&&(
        <div style={overlayCss} onClick={()=>setModal(null)}>
          <div style={modalCss} onClick={e=>e.stopPropagation()}>
            <div style={modalTitleCss}>Editar cita — {sel?.nombre}</div>
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Fecha</label><input type="date" style={{...selectCss}} value={fFecha} onChange={e=>setFFecha(e.target.value)}/></div>
              <div style={groupCss}><label style={labelCss}>Horario</label><select style={selectCss} value={fHora} onChange={e=>setFHora(e.target.value)}>{horasDisponibles().map(h=><option key={h} value={h}>{h}</option>)}</select></div>
            </div>
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Tratamiento</label><select style={selectCss} value={fTrat} onChange={e=>setFTrat(e.target.value)}>{TRATAMIENTOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
              <div style={groupCss}><label style={labelCss}>Duración</label><select style={selectCss} value={fDur} onChange={e=>setFDur(Number(e.target.value))}>{DURACIONES.map(d=><option key={d} value={d}>{d} min</option>)}</select></div>
            </div>
            <div style={groupCss}><label style={labelCss}>Estado</label><select style={selectCss} value={fEst} onChange={e=>setFEst(e.target.value as EstadoCita)}>{ESTADOS.map(est=><option key={est} value={est}>{est.charAt(0).toUpperCase()+est.slice(1)}</option>)}</select></div>
            <div style={groupCss}><label style={labelCss}>Notas</label><textarea style={textareaCss} value={fNotas} onChange={e=>setFNotas(e.target.value)}/></div>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{...btnDarkCss,opacity:saving?.6:1}} onClick={saveEditar} disabled={saving}>{saving?'Guardando...':'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal borrar */}
      {modal==='borrar'&&(
        <div style={overlayCss} onClick={()=>setModal(null)}>
          <div style={{...modalCss,maxWidth:380}} onClick={e=>e.stopPropagation()}>
            <div style={modalTitleCss}>Eliminar cita</div>
            <p style={{fontSize:14,color:'#666',marginBottom:'1.5rem'}}>Vas a eliminar la cita de <strong>{sel?.nombre}</strong> a las <strong>{sel?.hora}</strong>.</p>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{...btnRedCss,opacity:saving?.6:1}} onClick={saveBorrar} disabled={saving}>{saving?'Eliminando...':'Sí, eliminar'}</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<Toast msg={toast.msg} tipo={toast.tipo}/>}
    </div>
  )
}