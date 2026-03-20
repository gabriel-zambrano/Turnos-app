'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, FilterBar, BtnPrimary, BtnSm, DataTable, TR, TD, Spinner, MetricCard, inputCss, selectCss, textareaCss, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss, btnRedCss } from '@/components/UI'
import { TRAT_STYLE, ESTADO_STYLE, TRATAMIENTOS, ESTADOS, DURACIONES, horasDisponibles, hoyISO } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import type { EstadoCita, TipoTratamiento } from '@/types'

interface CitaDB { id:string; paciente_id:string; fecha_hora:string; tipo_tratamiento:string; estado:string; notas:string|null; duracion_minutos:number; pacientes:{nombre:string;telefono:string}|null }
interface Cita   { id:string; paciente_id:string; nombre:string; telefono:string; hora:string; fecha:string; tratamiento:string; estado:EstadoCita; duracion:number; notas:string }
interface PacMin { id:string; nombre:string; telefono:string }

function toCita(c: CitaDB): Cita {
  const dt = new Date(c.fecha_hora)
  return { id:c.id, paciente_id:c.paciente_id, nombre:c.pacientes?.nombre??'—', telefono:c.pacientes?.telefono??'—', hora:dt.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}), fecha:dt.toISOString().split('T')[0], tratamiento:c.tipo_tratamiento, estado:c.estado as EstadoCita, duracion:c.duracion_minutos, notas:c.notas??'' }
}

const FILTROS = [{k:'todas',l:'Todas'},{k:'pendiente',l:'Pendientes'},{k:'confirmado',l:'Confirmadas'},{k:'asistio',l:'Asistió'},{k:'cancelado',l:'Cancelado'}]

export default function Agenda() {
  const [citas,   setCitas]   = useState<Cita[]>([])
  const [pacs,    setPacs]    = useState<PacMin[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [modal,   setModal]   = useState<'nueva'|'editar'|'borrar'|null>(null)
  const [sel,     setSel]     = useState<Cita|null>(null)
  const [filtro,  setFiltro]  = useState('todas')
  const [fecha,   setFecha]   = useState(hoyISO())
  const [toast,   setToast]   = useState<{msg:string;tipo:string}|null>(null)

  const [fPac,   setFPac]   = useState('')
  const [fHora,  setFHora]  = useState('09:00')
  const [fTrat,  setFTrat]  = useState('Consulta')
  const [fEst,   setFEst]   = useState<EstadoCita>('pendiente')
  const [fDur,   setFDur]   = useState(30)
  const [fNotas, setFNotas] = useState('')

  function msg(m:string,tipo='ok'){setToast({msg:m,tipo});setTimeout(()=>setToast(null),3500)}

  const loadCitas = useCallback(async()=>{
    setLoading(true)
    const {data,error} = await supabase.from('citas').select('*, pacientes(nombre,telefono)').gte('fecha_hora',`${fecha}T00:00:00`).lte('fecha_hora',`${fecha}T23:59:59`).order('fecha_hora',{ascending:true})
    if(error) msg('Error: '+error.message,'error')
    else setCitas((data as CitaDB[]).map(toCita))
    setLoading(false)
  },[fecha])

  const loadPacs = useCallback(async()=>{
    const {data} = await supabase.from('pacientes').select('id,nombre,telefono').order('nombre')
    if(data) setPacs(data as PacMin[])
  },[])

  useEffect(()=>{loadCitas()},[loadCitas])
  useEffect(()=>{loadPacs()},[loadPacs])

  const lista = filtro==='todas'?citas:citas.filter(c=>c.estado===filtro)
  const conf  = citas.filter(c=>c.estado==='confirmado').length
  const pend  = citas.filter(c=>c.estado==='pendiente').length
  const tasa  = citas.length>0?Math.round(conf/citas.length*100):0

  function openNueva(){setFPac('');setFHora('09:00');setFTrat('Consulta');setFEst('pendiente');setFDur(30);setFNotas('');setSel(null);setModal('nueva')}
  function openEditar(c:Cita){setSel(c);setFHora(c.hora);setFTrat(c.tratamiento);setFEst(c.estado);setFDur(c.duracion);setFNotas(c.notas);setModal('editar')}

  async function saveNueva(){
    if(!fPac) return msg('Seleccioná un paciente','error')
    setSaving(true)
    const {error} = await supabase.from('citas').insert({paciente_id:fPac,fecha_hora:`${fecha}T${fHora}:00`,tipo_tratamiento:fTrat,estado:fEst,duracion_minutos:fDur,notas:fNotas||null})
    setSaving(false)
    if(error) return msg('Error: '+error.message,'error')
    setModal(null);msg('Cita agendada ✓');loadCitas()
  }

  async function saveEditar(){
    if(!sel) return
    setSaving(true)
    const {error} = await supabase.from('citas').update({fecha_hora:`${fecha}T${fHora}:00`,tipo_tratamiento:fTrat as TipoTratamiento,estado:fEst,duracion_minutos:fDur,notas:fNotas||null}).eq('id',sel.id)
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

  return (
    <div style={{display:'flex',minHeight:'100vh',fontFamily:'DM Sans, sans-serif'}}>
      <Sidebar pendientes={pend}/>
      <main style={{marginLeft:240,flex:1,background:'#f4f6f8'}}>
        <PageHeader title="Agenda"
          right={
            <div style={{display:'flex',gap:12,alignItems:'center'}}>
              <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{...inputCss,width:160,padding:'0.5rem 0.75rem',fontSize:13}}/>
              <BtnPrimary onClick={openNueva}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nueva cita
              </BtnPrimary>
            </div>
          }/>

        <div style={{padding:'1.75rem 2rem',maxWidth:1100}}>
          <div style={{display:'flex',gap:12,marginBottom:'1.5rem',flexWrap:'wrap'}}>
            <MetricCard label="Total del día"    value={loading?'…':citas.length} accent="#0f1e2b"/>
            <MetricCard label="Confirmadas"       value={loading?'…':conf}         accent="#1D9E75"/>
            <MetricCard label="Pendientes"        value={loading?'…':pend}         accent="#EF9F27"/>
            <MetricCard label="Tasa confirmación" value={loading?'…':`${tasa}%`}   accent={tasa>=85?'#1D9E75':'#D85A30'}/>
          </div>
          <FilterBar options={FILTROS} active={filtro} onChange={setFiltro}/>
          {loading?<Spinner/>:(
            <DataTable headers={['Hora','Paciente','Tratamiento','Duración','Estado','Acciones']} empty={lista.length===0} emptyMsg="Sin citas para este día. Usá + Nueva cita.">
              {lista.map(c=>{
                const tc=TRAT_STYLE[c.tratamiento]||TRAT_STYLE.Consulta
                const es=ESTADO_STYLE[c.estado]||ESTADO_STYLE.pendiente
                return(
                  <TR key={c.id}>
                    <TD first><div style={{fontWeight:700,fontSize:16,color:'#0f1e2b'}}>{c.hora}</div></TD>
                    <TD><div style={{fontWeight:500,fontSize:14}}>{c.nombre}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>{c.telefono}</div></TD>
                    <TD><Badge bg={tc.bg} color={tc.color}>{c.tratamiento}</Badge></TD>
                    <TD muted>{c.duracion} min</TD>
                    <TD>
                      <select value={c.estado} onChange={e=>cambiarEstado(c.id,e.target.value as EstadoCita)} style={{fontSize:12,padding:'4px 8px',borderRadius:7,border:`1px solid ${es.color}33`,background:es.bg,color:es.color,fontFamily:'DM Sans, sans-serif',outline:'none',cursor:'pointer'}}>
                        {ESTADOS.map(est=><option key={est} value={est}>{est.charAt(0).toUpperCase()+est.slice(1)}</option>)}
                      </select>
                    </TD>
                    <TD>
                      <div style={{display:'flex',gap:6}}>
                        <BtnSm variant="edit"   onClick={()=>openEditar(c)}>Editar</BtnSm>
                        <BtnSm variant="delete" onClick={()=>{setSel(c);setModal('borrar')}}>Eliminar</BtnSm>
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </DataTable>
          )}
        </div>
      </main>

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
              {pacs.length===0&&<span style={{fontSize:11,color:'#D85A30',marginTop:4,display:'block'}}>No hay pacientes. Primero cargalos en Pacientes.</span>}
            </div>
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Horario *</label><select style={selectCss} value={fHora} onChange={e=>setFHora(e.target.value)}>{horasDisponibles().map(h=><option key={h} value={h}>{h}</option>)}</select></div>
              <div style={groupCss}><label style={labelCss}>Duración</label><select style={selectCss} value={fDur} onChange={e=>setFDur(Number(e.target.value))}>{DURACIONES.map(d=><option key={d} value={d}>{d} min</option>)}</select></div>
            </div>
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Tratamiento</label><select style={selectCss} value={fTrat} onChange={e=>setFTrat(e.target.value)}>{TRATAMIENTOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
              <div style={groupCss}><label style={labelCss}>Estado</label><select style={selectCss} value={fEst} onChange={e=>setFEst(e.target.value as EstadoCita)}>{ESTADOS.map(est=><option key={est} value={est}>{est.charAt(0).toUpperCase()+est.slice(1)}</option>)}</select></div>
            </div>
            <div style={groupCss}><label style={labelCss}>Notas</label><textarea style={textareaCss} value={fNotas} onChange={e=>setFNotas(e.target.value)} placeholder="Observaciones..."/></div>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{...btnDarkCss,opacity:saving?.6:1}} onClick={saveNueva} disabled={saving}>{saving?'Guardando...':'Agendar cita'}</button>
            </div>
          </div>
        </div>
      )}

      {modal==='editar'&&(
        <div style={overlayCss} onClick={()=>setModal(null)}>
          <div style={modalCss} onClick={e=>e.stopPropagation()}>
            <div style={modalTitleCss}>Editar cita — {sel?.nombre}</div>
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Horario</label><select style={selectCss} value={fHora} onChange={e=>setFHora(e.target.value)}>{horasDisponibles().map(h=><option key={h} value={h}>{h}</option>)}</select></div>
              <div style={groupCss}><label style={labelCss}>Duración</label><select style={selectCss} value={fDur} onChange={e=>setFDur(Number(e.target.value))}>{DURACIONES.map(d=><option key={d} value={d}>{d} min</option>)}</select></div>
            </div>
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Tratamiento</label><select style={selectCss} value={fTrat} onChange={e=>setFTrat(e.target.value)}>{TRATAMIENTOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
              <div style={groupCss}><label style={labelCss}>Estado</label><select style={selectCss} value={fEst} onChange={e=>setFEst(e.target.value as EstadoCita)}>{ESTADOS.map(est=><option key={est} value={est}>{est.charAt(0).toUpperCase()+est.slice(1)}</option>)}</select></div>
            </div>
            <div style={groupCss}><label style={labelCss}>Notas</label><textarea style={textareaCss} value={fNotas} onChange={e=>setFNotas(e.target.value)}/></div>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{...btnDarkCss,opacity:saving?.6:1}} onClick={saveEditar} disabled={saving}>{saving?'Guardando...':'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}

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
