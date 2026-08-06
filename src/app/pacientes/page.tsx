'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Badge, Toast, PageHeader, BtnPrimary, BtnSm, DataTable, TR, TD, SkeletonLista, MetricCard, inputCss, selectCss, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss, btnRedCss } from '@/components/UI'
import { TRAT_STYLE, AVATAR_COLORS, TRATAMIENTOS, calcEdad, initials, normalizarTelefono } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { urlPublicaDeClinica } from '@/lib/config'
import { useTenantContext } from '@/components/TenantContext'
import { ImportarPacientesModal } from '@/components/ImportarPacientesModal'
import { registrarConsentimiento, TEXTO_CONSENTIMIENTO_DATOS } from '@/lib/consentimiento-datos'

interface PacDB { id:string; nombre:string; telefono:string; email:string|null; fecha_nacimiento:string|null; ultimo_tratamiento:string|null; creado_en:string; token:string|null; alergias:string|null; antecedentes:string|null; progreso_plan_porcentaje:number|null }
interface Pac { id:string; nombre:string; telefono:string; email:string; nacimiento:string; tratamiento:string; alta:string; token:string|null; alergias:string; antecedentes:string; progresoPlan:number; tieneTurnosFuturos?:boolean }
function toPac(p: PacDB): Pac {
  return { id:p.id, nombre:p.nombre, telefono:p.telefono, email:p.email??'', nacimiento:p.fecha_nacimiento??'', tratamiento:p.ultimo_tratamiento??'Consulta', alta:p.creado_en?.split('T')[0]??'', token:p.token??null, alergias:p.alergias??'', antecedentes:p.antecedentes??'', progresoPlan:p.progreso_plan_porcentaje??0 }
}

export default function Pacientes() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { tenant, loading: tenantLoading } = useTenantContext()
  const [rows, setRows] = useState<Pac[]>([])
  const [isMobile, setIsMobile] = useState(false)
  useEffect(()=>{ const check = () => setIsMobile(window.innerWidth < 768); check(); window.addEventListener('resize', check); return () => window.removeEventListener('resize', check) },[])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState<'nuevo'|'editar'|'borrar'|'importar'|null>(null)
  const [sel, setSel] = useState<Pac|null>(null)
  const [busq, setBusq] = useState('')
  const [toast, setToast] = useState<{msg:string;tipo:string}|null>(null)
  const [fNombre, setFNombre] = useState('')
  const [fTelefono, setFTelefono] = useState('+54911')
  const [fEmail, setFEmail] = useState('')
  const [fNacimiento, setFNacimiento] = useState('')
  const [fTratamiento, setFTratamiento] = useState('Consulta')

  // Clinical fields states
  const [fAlergias, setFAlergias] = useState('')
  const [fAntecedentes, setFAntecedentes] = useState('')
  const [fProgresoPlan, setFProgresoPlan] = useState<number>(0)
  // Consentimiento de datos de salud: nunca viene tildado por defecto.
  const [fConsentimiento, setFConsentimiento] = useState(false)

  function msg(m:string, tipo='ok') { setToast({msg:m,tipo}); setTimeout(()=>setToast(null),3500) }

  const load = useCallback(async()=>{
    if (!tenant) return
    setLoading(true)
    const {data: pacData, error: pacError} = await supabase.from('pacientes').select('*').eq('tenant_id', tenant.id).order('creado_en',{ascending:false})
    const {data: citasData, error: citasError} = await supabase.from('citas').select('paciente_id, fecha_hora, estado').eq('tenant_id', tenant.id)

    if (pacError) {
      msg('Error al cargar pacientes: ' + pacError.message, 'error')
    } else {
      const citasMap: Record<string, any[]> = {}
      if (citasData) {
        citasData.forEach(c => {
          if (!citasMap[c.paciente_id]) citasMap[c.paciente_id] = []
          citasMap[c.paciente_id].push(c)
        })
      }
      const mappedPacs = (pacData as PacDB[]).map(p => {
        const pac = toPac(p)
        const pacCitas = citasMap[p.id] || []
        const tieneTurnosFuturos = pacCitas.some(c => {
          const isFuture = new Date(c.fecha_hora) >= new Date()
          const isCancelled = c.estado === 'cancelado' || c.estado === 'ausente'
          return isFuture && !isCancelled
        })
        return {
          ...pac,
          tieneTurnosFuturos
        }
      })
      setRows(mappedPacs)
    }
    setLoading(false)
  },[tenant])

  useEffect(()=>{if (tenant) load()},[load, tenant])

  const filtrados = rows.filter(p =>
    p.nombre.toLowerCase().includes(busq.toLowerCase()) ||
    p.telefono.includes(busq) ||
    p.email.toLowerCase().includes(busq.toLowerCase())
  )

  function openNuevo() { setFNombre(''); setFTelefono('+54911'); setFEmail(''); setFNacimiento(''); setFTratamiento('Consulta'); setFAlergias(''); setFAntecedentes(''); setFProgresoPlan(0); setFConsentimiento(false); setSel(null); setModal('nuevo') }
  function openEditar(p:Pac) { setFNombre(p.nombre); setFTelefono(p.telefono); setFEmail(p.email); setFNacimiento(p.nacimiento); setFTratamiento(p.tratamiento); setFAlergias(p.alergias); setFAntecedentes(p.antecedentes); setFProgresoPlan(p.progresoPlan); setSel(p); setModal('editar') }

  async function saveNuevo() {
    if(!fNombre.trim()) return msg('El nombre es obligatorio','error')
    if(!fTelefono.startsWith('+')) return msg('El teléfono debe empezar con +','error')
    // Los datos de salud son datos sensibles: sin consentimiento no se cargan.
    if(!fConsentimiento) return msg('Falta el consentimiento del paciente para tratar sus datos','error')
    if(!tenant) return
    setSaving(true)
    const token = crypto.randomUUID()
    const {error} = await supabase.from('pacientes').insert({
      ...registrarConsentimiento(true, 'consultorio'),
      nombre:fNombre.trim(),
      telefono:fTelefono.trim(),
      email:fEmail.trim()||null,
      fecha_nacimiento:fNacimiento||null,
      ultimo_tratamiento:fTratamiento,
      token,
      tenant_id:tenant.id,
      alergias:fAlergias.trim()||null,
      antecedentes:fAntecedentes.trim()||null,
      progreso_plan_porcentaje:fProgresoPlan
    })
    setSaving(false)
    if(error) return msg('Error al guardar: '+error.message,'error')
    setModal(null); msg('Paciente agregado correctamente ✓'); load()
  }

  async function saveEditar() {
    if(!sel||!fNombre.trim()) return msg('El nombre es obligatorio','error')
    setSaving(true)
    const {error} = await supabase.from('pacientes').update({
      nombre:fNombre.trim(),
      telefono:fTelefono.trim(),
      email:fEmail.trim()||null,
      fecha_nacimiento:fNacimiento||null,
      ultimo_tratamiento:fTratamiento,
      alergias:fAlergias.trim()||null,
      antecedentes:fAntecedentes.trim()||null,
      progreso_plan_porcentaje:fProgresoPlan
    }).eq('id',sel.id)
    setSaving(false)
    if(error) return msg('Error al actualizar: '+error.message,'error')
    setModal(null); msg('Paciente actualizado ✓'); load()
  }

  async function saveBorrar() {
    if(!sel) return
    setSaving(true)
    const {error} = await supabase.from('pacientes').delete().eq('id',sel.id)
    setSaving(false)
    if(error) return msg('Error al eliminar: '+error.message,'error')
    setModal(null); msg('Paciente eliminado'); load()
  }

  return (
    <AppShell>
        <PageHeader title="Pacientes"
          right={(<>
            {/* Las dos versiones se pintan siempre y el CSS elige cuál se ve.
                Con `isMobile` el teléfono cargaba con la barra de escritorio
                —buscador de 240px incluido— y la cambiaba un instante después. */}
            <div className="solo-movil" style={{display:'flex',gap:8}}>
              <button onClick={()=>setModal('importar')} style={{padding:'6px 12px',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',color:'#475569',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>Importar</button>
              <button onClick={openNuevo} style={{padding:'6px 14px',borderRadius:8,border:'none',background:'#0f1e2b',color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'DM Sans, sans-serif'}}>+ Nuevo</button>
            </div>
            <div className="solo-escritorio" style={{display:'flex',gap:12,alignItems:'center'}}>
              <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar..." style={{...inputCss,width:240,padding:'0.5rem 0.85rem',fontSize:13}}/>
              <button onClick={()=>setModal('importar')} style={{padding:'0.5rem 0.85rem',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',color:'#475569',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'DM Sans, sans-serif',display:'flex',alignItems:'center',gap:6}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Importar
              </button>
              {tenant&&<a href={`/api/pacientes/exportar?tenantId=${tenant.id}`} title="Exportar todos los datos a Excel" style={{padding:'0.5rem 0.85rem',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',color:'#475569',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'DM Sans, sans-serif',display:'flex',alignItems:'center',gap:6,textDecoration:'none'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Exportar
              </a>}
              <BtnPrimary onClick={openNuevo}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Nuevo
              </BtnPrimary>
            </div>
          </>)}
        />
        <div className="app-content" style={{maxWidth:1100}}>
          {/* El buscador se pinta siempre y lo esconde el CSS en escritorio,
              donde ya hay uno en el encabezado. Con `isMobile` el teléfono
              cargaba sin buscador y lo veía aparecer un instante después. */}
          <input className="solo-movil" value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar nombre, teléfono o email..." style={{...inputCss,fontSize:13,padding:'0.5rem 0.75rem',marginBottom:'0.75rem',width:'100%'}}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:'1.5rem'}}>
            <MetricCard label="Total pacientes" value={loading?'…':rows.length} accent="#1D9E75"/>
            <MetricCard label="Resultado búsqueda" value={loading?'…':filtrados.length} accent="#378ADD"/>
          </div>
          {tenantLoading || loading?<SkeletonLista filas={6}/>:isMobile?(
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {filtrados.map((p,i)=>{
                const color=AVATAR_COLORS[i%AVATAR_COLORS.length]
                const tc=TRAT_STYLE[p.tratamiento]||TRAT_STYLE.Consulta
                return(
                  <div key={p.id} style={{background:'#fff',borderRadius:12,padding:'1rem',boxShadow:'0 1px 4px rgba(0,0,0,0.07)',display:'flex',flexDirection:'column',gap:8}}>
                    <div onClick={() => router.push(`/pacientes/${p.id}`)} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                      <div style={{width:40,height:40,borderRadius:'50%',background:color+'22',border:`1.5px solid ${color}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color,flexShrink:0}}>{initials(p.nombre)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:15,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text-dark)'}}>{p.nombre}</div>
                        <div style={{fontSize:12,color:'var(--text-muted)'}}>{p.telefono}</div>
                        <div style={{marginTop:4}}>
                          {p.tieneTurnosFuturos ? (
                            <span style={{ fontSize: 11, background: '#E1F5EE', color: '#085041', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>📅 Turno programado</span>
                          ) : (
                            <span style={{ fontSize: 11, background: '#FAEEDA', color: '#633806', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>⚠️ Sin turnos</span>
                          )}
                        </div>
                      </div>
                      <Badge bg={tc.bg} color={tc.color}>{p.tratamiento}</Badge>
                    </div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      <BtnSm variant="edit" onClick={()=>openEditar(p)}>Editar</BtnSm>
                      <BtnSm variant="delete" onClick={()=>{setSel(p);setModal('borrar')}}>Eliminar</BtnSm>
                      {p.token
                        ?<BtnSm variant="edit" onClick={()=>{const url=`${urlPublicaDeClinica(tenant)}/paciente/${p.token}`;const txt=encodeURIComponent(`Hola ${p.nombre},\n\nTe compartimos el link para ver y gestionar tu turno con *${tenant?.nombre || 'DentalDesk'}*:\n${url}\n\n_${tenant?.nombre || 'DentalDesk'} - ${tenant?.direccion || ''}_`);window.open(`https://wa.me/${normalizarTelefono(p.telefono??'')}?text=${txt}`,'_blank')}}>WhatsApp</BtnSm>
                        :<BtnSm variant="edit" onClick={async()=>{if(!tenant)return;const tok=crypto.randomUUID();await supabase.from('pacientes').update({token:tok}).eq('id',p.id);msg('Link generado ✓');load()}}>Generar link</BtnSm>
                      }
                    </div>
                  </div>
                )
              })}
              {filtrados.length===0&&<div style={{textAlign:'center',color:'#aaa',padding:'2rem'}}>No hay pacientes.</div>}
            </div>
          ):(
            <DataTable headers={['Paciente','Contacto','Edad','Tratamiento','Alta','']} empty={filtrados.length===0} emptyMsg="No hay pacientes.">
              {filtrados.map((p,i)=>{
                const color=AVATAR_COLORS[i%AVATAR_COLORS.length]
                const tc=TRAT_STYLE[p.tratamiento]||TRAT_STYLE.Consulta
                return(
                  <TR key={p.id}>
                    <TD first>
                      <div onClick={() => router.push(`/pacientes/${p.id}`)} style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}>
                        <div style={{width:36,height:36,borderRadius:'50%',background:color+'22',border:`1.5px solid ${color}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color,flexShrink:0}}>{initials(p.nombre)}</div>
                        <div>
                          <div style={{fontWeight:600,fontSize:14,color:'var(--text-dark)',textDecoration:'underline'}}>{p.nombre}</div>
                          <div style={{display:'flex',gap:6,alignItems:'center',marginTop:4}}>
                            <span style={{fontSize:11,color:'var(--text-muted, #aaa)'}}>Alta: {p.alta}</span>
                            {p.tieneTurnosFuturos ? (
                              <span style={{ fontSize: 10, background: '#E1F5EE', color: '#085041', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>📅 Turno programado</span>
                            ) : (
                              <span style={{ fontSize: 10, background: '#FAEEDA', color: '#633806', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>⚠️ Sin turnos</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD><div style={{fontSize:13}}>{p.telefono}</div><div style={{fontSize:12,color:'#aaa'}}>{p.email||'—'}</div></TD>
                    <TD muted>{calcEdad(p.nacimiento)}</TD>
                    <TD><Badge bg={tc.bg} color={tc.color}>{p.tratamiento}</Badge></TD>
                    <TD muted>{p.alta}</TD>
                    <TD><div style={{display:'flex',gap:6}}>
                      <BtnSm variant="edit" onClick={()=>openEditar(p)}>Editar</BtnSm>
                      <BtnSm variant="delete" onClick={()=>{setSel(p);setModal('borrar')}}>Eliminar</BtnSm>
                      {p.token
                        ?<BtnSm variant="edit" onClick={()=>{const url=`${urlPublicaDeClinica(tenant)}/paciente/${p.token}`;const txt=encodeURIComponent(`Hola ${p.nombre},\n\nTe compartimos el link para ver y gestionar tu turno con *${tenant?.nombre || 'DentalDesk'}*:\n${url}\n\n_${tenant?.nombre || 'DentalDesk'} - ${tenant?.direccion || ''}_`);window.open(`https://wa.me/${normalizarTelefono(p.telefono??'')}?text=${txt}`,'_blank')}}>WhatsApp</BtnSm>
                        :<BtnSm variant="edit" onClick={async()=>{if(!tenant)return;const tok=crypto.randomUUID();await supabase.from('pacientes').update({token:tok}).eq('id',p.id);msg('Link generado ✓');load()}}>Generar link</BtnSm>
                      }
                    </div></TD>
                  </TR>
                )
              })}
            </DataTable>
          )}
        </div>
      {modal==='nuevo'&&<div style={overlayCss(isMobile)} onClick={()=>setModal(null)}><div style={modalCss(isMobile)} onClick={e=>e.stopPropagation()}><div style={modalTitleCss}>Nuevo paciente</div><div style={groupCss}><label style={labelCss}>Nombre completo *</label><input style={inputCss} value={fNombre} onChange={e=>setFNombre(e.target.value)} placeholder="Ej: María González" autoFocus/></div><div style={grid2Css}><div style={groupCss}><label style={labelCss}>Teléfono *</label><input style={inputCss} value={fTelefono} onChange={e=>setFTelefono(e.target.value)} placeholder="+5491123456789"/><span style={{fontSize:11,color:'#aaa',marginTop:3,display:'block'}}>Debe empezar con +</span></div><div style={groupCss}><label style={labelCss}>Email</label><input type="email" style={inputCss} value={fEmail} onChange={e=>setFEmail(e.target.value)} placeholder="paciente@email.com"/></div></div><div style={grid2Css}><div style={groupCss}><label style={labelCss}>Fecha de nacimiento</label><input type="date" style={inputCss} value={fNacimiento} onChange={e=>setFNacimiento(e.target.value)}/></div><div style={groupCss}><label style={labelCss}>Tratamiento</label><select style={selectCss} value={fTratamiento} onChange={e=>setFTratamiento(e.target.value)}>{TRATAMIENTOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div></div><div style={grid2Css}><div style={groupCss}><label style={labelCss}>Alergias</label><input style={inputCss} value={fAlergias} onChange={e=>setFAlergias(e.target.value)} placeholder="Ej: Penicilina, látex..."/></div><div style={groupCss}><label style={labelCss}>Progreso del Plan (%)</label><input type="number" min="0" max="100" style={inputCss} value={fProgresoPlan} onChange={e=>setFProgresoPlan(Number(e.target.value))}/></div></div><div style={groupCss}><label style={labelCss}>Antecedentes Médicos</label><textarea style={{...inputCss,height:50,resize:'vertical'}} value={fAntecedentes} onChange={e=>setFAntecedentes(e.target.value)} placeholder="Hipertensión, diabetes, etc..."/></div><div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:12,padding:'14px',marginBottom:'0.85rem'}}><label style={{display:'flex',gap:10,alignItems:'flex-start',cursor:'pointer'}}><input type="checkbox" checked={fConsentimiento} onChange={e=>setFConsentimiento(e.target.checked)} style={{marginTop:3,width:17,height:17,flexShrink:0,cursor:'pointer'}}/><span style={{fontSize:12.5,color:'#4a6080',lineHeight:1.5}}><strong style={{color:'#0a1e3d'}}>El paciente presta su consentimiento</strong> para el registro y tratamiento de sus datos de salud (Ley 25.326). Queda asentada la fecha y la versión del texto.<details style={{marginTop:6}}><summary style={{cursor:'pointer',color:'#185FA5',fontWeight:600}}>Ver el texto</summary><span style={{display:'block',whiteSpace:'pre-line',marginTop:6,fontSize:12,color:'#64748b'}}>{TEXTO_CONSENTIMIENTO_DATOS}</span></details></span></label></div><div style={footerCss}><button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button><button style={{...btnDarkCss,opacity:(saving||!fConsentimiento)?0.6:1}} onClick={saveNuevo} disabled={saving||!fConsentimiento}>{saving?'Guardando...':'Agregar paciente'}</button></div></div></div>}
      {modal==='editar'&&<div style={overlayCss(isMobile)} onClick={()=>setModal(null)}><div style={modalCss(isMobile)} onClick={e=>e.stopPropagation()}><div style={modalTitleCss}>Editar paciente</div><div style={groupCss}><label style={labelCss}>Nombre completo *</label><input style={inputCss} value={fNombre} onChange={e=>setFNombre(e.target.value)} autoFocus/></div><div style={grid2Css}><div style={groupCss}><label style={labelCss}>Teléfono *</label><input style={inputCss} value={fTelefono} onChange={e=>setFTelefono(e.target.value)}/></div><div style={groupCss}><label style={labelCss}>Email</label><input type="email" style={inputCss} value={fEmail} onChange={e=>setFEmail(e.target.value)}/></div></div><div style={grid2Css}><div style={groupCss}><label style={labelCss}>Fecha de nacimiento</label><input type="date" style={inputCss} value={fNacimiento} onChange={e=>setFNacimiento(e.target.value)}/></div><div style={groupCss}><label style={labelCss}>Tratamiento</label><select style={selectCss} value={fTratamiento} onChange={e=>setFTratamiento(e.target.value)}>{TRATAMIENTOS.map(t=><option key={t} value={t}>{t}</option>)}</select></div></div><div style={grid2Css}><div style={groupCss}><label style={labelCss}>Alergias</label><input style={inputCss} value={fAlergias} onChange={e=>setFAlergias(e.target.value)} placeholder="Ej: Penicilina, látex..."/></div><div style={groupCss}><label style={labelCss}>Progreso del Plan (%)</label><input type="number" min="0" max="100" style={inputCss} value={fProgresoPlan} onChange={e=>setFProgresoPlan(Number(e.target.value))}/></div></div><div style={groupCss}><label style={labelCss}>Antecedentes Médicos</label><textarea style={{...inputCss,height:50,resize:'vertical'}} value={fAntecedentes} onChange={e=>setFAntecedentes(e.target.value)} placeholder="Hipertensión, diabetes, etc..."/></div><div style={footerCss}><button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button><button style={{...btnDarkCss,opacity:saving?0.6:1}} onClick={saveEditar} disabled={saving}>{saving?'Guardando...':'Guardar cambios'}</button></div></div></div>}
      {modal==='borrar'&&<div style={overlayCss(isMobile)} onClick={()=>setModal(null)}><div style={{...modalCss(isMobile),maxWidth:380}} onClick={e=>e.stopPropagation()}><div style={modalTitleCss}>Eliminar paciente</div><p style={{fontSize:14,color:'#666',marginBottom:'1.5rem'}}>Vas a eliminar a <strong>{sel?.nombre}</strong>. Esta acción no se puede deshacer.</p><div style={footerCss}><button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button><button style={{...btnRedCss,opacity:saving?0.6:1}} onClick={saveBorrar} disabled={saving}>{saving?'Eliminando...':'Sí, eliminar'}</button></div></div></div>}
      {modal==='importar'&&tenant&&<ImportarPacientesModal tenantId={tenant.id} onClose={()=>setModal(null)} onDone={(m)=>{msg(m);load()}}/>}

      {toast&&<Toast msg={toast.msg} tipo={toast.tipo} isMobile={isMobile}/>}
    </AppShell>
  )
}
