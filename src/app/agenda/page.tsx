'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, BtnPrimary, BtnSm, Spinner, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss, btnRedCss, selectCss, textareaCss, inputCss } from '@/components/UI'
import { TRAT_STYLE, ESTADO_STYLE, TRATAMIENTOS, ESTADOS, DURACIONES, horasDisponibles, hoyISO, normalizarTelefono } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import type { EstadoCita, TipoTratamiento } from '@/types'
import { useTenantContext } from '@/components/TenantContext'

interface CitaDB { id:string; paciente_id:string; fecha_hora:string; tipo_tratamiento:string; estado:string; notas:string|null; duracion_minutos:number; valor:number|null; sena:number|null; medio_pago:string|null; pacientes:{nombre:string;telefono:string;token:string}|null }
interface Cita   { id:string; paciente_id:string; nombre:string; telefono:string; token:string; hora:string; fecha:string; tratamiento:string; estado:EstadoCita; duracion:number; notas:string; minutos:number; valor:number|null; sena:number|null; medio_pago:string|null }
const MEDIOS_PAGO = ['Efectivo','Transferencia','TDC 1 pago','TDC 3 cuotas s/i','Obra social','Sin cobrar']
interface PacMin  { id:string; nombre:string; telefono:string }
interface TratDB  { nombre:string; precio_base:number|null; duracion_default:number|null }

interface CitaPos extends Cita {
  colIndex?: number
  totalCols?: number
}

function toCita(c: CitaDB): Cita {
  const dt = new Date(c.fecha_hora)
  const ar = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const h = ar.getHours(), m = ar.getMinutes()
  return {
    id:c.id, paciente_id:c.paciente_id,
    nombre:c.pacientes?.nombre??'—', telefono:c.pacientes?.telefono??'—', token:c.pacientes?.token??'',
    hora:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,
    fecha:dt.toISOString().split('T')[0],
    tratamiento:c.tipo_tratamiento, estado:c.estado as EstadoCita,
    duracion:c.duracion_minutos, notas:c.notas??'',
    minutos: h * 60 + m, valor:c.valor??null, sena:c.sena??null, medio_pago:c.medio_pago??null
  }
}

function calcularPosicionCitas(citasDia: Cita[]): CitaPos[] {
  const citasSorted = [...citasDia].sort((a, b) => a.minutos - b.minutos)
  const result: CitaPos[] = citasSorted.map(c => ({ ...c }))

  // Find connected components (clusters of overlapping events)
  const clusters: CitaPos[][] = []
  result.forEach(c => {
    const matchingClusters: number[] = []
    clusters.forEach((cluster, idx) => {
      const overlaps = cluster.some(item => 
        c.minutos < item.minutos + item.duracion && 
        item.minutos < c.minutos + c.duracion
      )
      if (overlaps) {
        matchingClusters.push(idx)
      }
    })
    
    if (matchingClusters.length === 0) {
      clusters.push([c])
    } else if (matchingClusters.length === 1) {
      clusters[matchingClusters[0]].push(c)
    } else {
      // Merge all matching clusters
      const newCluster = [c]
      for (let i = matchingClusters.length - 1; i >= 0; i--) {
        const idx = matchingClusters[i]
        newCluster.push(...clusters[idx])
        clusters.splice(idx, 1)
      }
      clusters.push(newCluster)
    }
  })

  // Assign columns for each cluster
  clusters.forEach(cluster => {
    // Sort cluster by minutes then by duration descending to lay out longest first
    cluster.sort((a, b) => a.minutos - b.minutos || b.duracion - a.duracion)
    
    const cols: CitaPos[][] = []
    cluster.forEach(c => {
      let colIdx = 0
      while (true) {
        if (!cols[colIdx]) {
          cols[colIdx] = [c]
          break
        }
        const overlaps = cols[colIdx].some(item => 
          c.minutos < item.minutos + item.duracion && 
          item.minutos < c.minutos + c.duracion
        )
        if (!overlaps) {
          cols[colIdx].push(c)
          break
        }
        colIdx++
      }
      c.colIndex = colIdx
    })
    const totalCols = cols.length
    cluster.forEach(c => {
      c.totalCols = totalCols
    })
  })

  return result
}

function parseFechaLocal(base: string): Date {
  const [y, m, d] = base.split('-').map(Number)
  return new Date(y, m - 1, d)

}
function dateToISO(d: Date): string {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}
function getFechaSemana(base: string): string[] {
  const d = parseFechaLocal(base)
  const dia = d.getDay()
  const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (dia === 0 ? 6 : dia - 1))
  return Array.from({length:6}, (_,i) => {
    const f = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i)
    return dateToISO(f)
  })
}

const DIAS_LABEL   = ['Lun','Mar','Mié','Jue','Vie','Sáb']
const DIAS_STRIP   = ['L','M','X','J','V','S','D']
const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function proximoSlot(): { hora: string; fecha: string } {
  const now = new Date()
  const ar  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const totalMin  = ar.getHours() * 60 + ar.getMinutes()
  const nextMin   = Math.ceil(totalMin / 20) * 20
  const slotH     = Math.floor(nextMin / 60)
  const slotM     = nextMin % 60
  if (slotH >= 20) {
    const nextDay = new Date(ar.getFullYear(), ar.getMonth(), ar.getDate() + 1)
    return { hora: '09:00', fecha: dateToISO(nextDay) }
  }
  if (slotH < 8) return { hora: '08:00', fecha: dateToISO(ar) }
  return { hora: `${String(slotH).padStart(2,'0')}:${String(slotM).padStart(2,'0')}`, fecha: dateToISO(ar) }
}

function getFechaSemana7(base: string): string[] {
  const d = parseFechaLocal(base)
  const dia = d.getDay()
  const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (dia === 0 ? 6 : dia - 1))
  return Array.from({length: 7}, (_, i) => {
    const f = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i)
    return dateToISO(f)
  })
}

function WeekStrip({ fechas, fechaActiva, fechasConCitas, onSelect, hoy }: {
  fechas: string[]
  fechaActiva: string
  fechasConCitas: Set<string>
  onSelect: (f: string) => void
  hoy: string
}) {
  const esSemanaCurrent = fechas.includes(hoy)
  return (
    <div style={{
      height: 64, display: 'flex', alignItems: 'center',
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(56,138,221,0.10)',
      position: 'sticky', top: 56, zIndex: 49,
    }}>
      {fechas.map((f, i) => {
        const activo    = f === fechaActiva
        const esHoy     = f === hoy
        const tieneCita = fechasConCitas.has(f)
        const d         = parseFechaLocal(f)
        const numDia    = d.getDate()
        const mes       = MESES_CORTOS[d.getMonth()]
        return (
          <button key={f} onClick={() => onSelect(f)} style={{
            flex: 1, height: 64, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
          }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: activo ? '#0a1e3d' : '#aab8c8', lineHeight: 1, marginBottom: 3 }}>
              {DIAS_STRIP[i]}
            </span>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: activo ? '#0a1e3d' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: 14,
                fontWeight: activo || esHoy ? 700 : 400,
                color: activo ? '#fff' : esHoy ? '#0a1e3d' : '#333',
                lineHeight: 1,
              }}>{numDia}</span>
            </div>
            <span style={{
              fontSize: 9, color: '#aab8c8', lineHeight: 1, marginTop: 2,
              visibility: esSemanaCurrent ? 'hidden' : 'visible',
            }}>{mes}</span>
            <div style={{
              width: 4, height: 4, borderRadius: '50%',
              background: tieneCita ? '#388ADD' : 'transparent',
              marginTop: 2,
            }} />
          </button>
        )
      })}
    </div>
  )
}

function AgendaHeaderMobile({ fecha, vista, esHoy, onPrev, onNext, onVista, onNueva, onHoy }: {
  fecha: string; vista: 'semana'|'dia'; esHoy: boolean
  onPrev: ()=>void; onNext: ()=>void; onVista: (v:'semana'|'dia')=>void
  onNueva: ()=>void; onHoy: ()=>void
}) {
  const d = parseFechaLocal(fecha)
  const diaNum    = d.getDate()
  const diaNombre = d.toLocaleDateString('es-AR', { weekday: 'short' })

  const btnFlecha: React.CSSProperties = {
    width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', background: 'transparent', fontSize: 22, color: '#0a1e3d',
    cursor: 'pointer', borderRadius: 12, flexShrink: 0, fontFamily: 'DM Sans, sans-serif',
  }

  return (
    <header style={{
      height: 56, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4,
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(56,138,221,0.10)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>

      <button onClick={onPrev} style={btnFlecha}>‹</button>

      <button onClick={onHoy} style={{
        flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', background: 'transparent', cursor: 'pointer', gap: 6,
        fontFamily: 'DM Sans, sans-serif',
      }}>
        {esHoy ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#138A6B' }}>Hoy</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#0a1e3d', lineHeight: 1 }}>{diaNum}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 400, color: '#8fa3bc', textTransform: 'capitalize' }}>{diaNombre}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#0a1e3d', lineHeight: 1 }}>{diaNum}</span>
          </>
        )}
      </button>

      <button onClick={onNext} style={btnFlecha}>›</button>

      <div style={{display:'flex',background:'#f0f4f8',borderRadius:8,overflow:'hidden',marginRight:4,height:32,border:'0.5px solid #dde5ef',flexShrink:0}}>
        {(['semana','dia'] as const).map(v=>(
          <button key={v} onClick={()=>onVista(v)} style={{padding:'0 10px',fontSize:11,border:'none',cursor:'pointer',background:vista===v?'#0a1e3d':'transparent',color:vista===v?'#fff':'#687e96',fontWeight:700,fontFamily:'DM Sans, sans-serif'}}>{v==='semana'?'Sem':'Día'}</button>
        ))}
      </div>

      <button onClick={onNueva} style={{
        width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', background: '#0a1e3d', color: '#fff',
        borderRadius: 12, fontSize: 22, cursor: 'pointer', flexShrink: 0,
        fontFamily: 'DM Sans, sans-serif',
      }}>+</button>

    </header>
  )
}
const HORA_INICIO = 8
const HORA_FIN = 20
const SLOT_H = 48 // px por hora

export default function Agenda() {
  const supabase = createClient()
  const { tenant, loading: tenantLoading } = useTenantContext()
  const [citas,   setCitas]   = useState<Cita[]>([])
  const [pacs,    setPacs]    = useState<PacMin[]>([])
  const [tratamientosDB, setTratamientosDB] = useState<TratDB[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [sobreturnoAgenda, setSobreturnoAgenda] = useState<string|null>(null)
  const [modal,   setModal]   = useState<'nueva'|'editar'|'borrar'|'detalle'|'bloqueo'|'menu'|null>(null)
  const [sel,     setSel]     = useState<Cita|null>(null)
  const [fecha,   setFecha]   = useState(hoyISO())
  const [toast,   setToast]   = useState<{msg:string;tipo:string}|null>(null)
  const [menuPos, setMenuPos] = useState<{x:number;y:number;f:string;h:string}|null>(null)
  const [bloqueos, setBloqueos] = useState<{id:string;fecha:string;hora_inicio:string;hora_fin:string;motivo:string|null}[]>([])
  const [fBloqDesde, setFBloqDesde] = useState("08:00")
  const [fBloqHasta, setFBloqHasta] = useState("12:00")
  const [fBloqMotivo, setFBloqMotivo] = useState("")
  const [fBloqFecha, setFBloqFecha] = useState("")
  const [vista,   setVista]   = useState<'semana'|'dia'>('semana')
  const [isMobile, setIsMobile] = useState(false)
  const [draggedCitaId, setDraggedCitaId] = useState<string | null>(null)
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const touchStart = useRef<{x:number; y:number} | null>(null)
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setAhora(new Date()), 60_000); return () => clearInterval(id) }, [])
  useEffect(()=>{
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  },[])

  const [fPac,   setFPac]   = useState('')
  const [fHora,  setFHora]  = useState('09:00')
  const [fFecha, setFFecha] = useState(hoyISO())
  const [fTrat,  setFTrat]  = useState('Consulta')
  const [fEst,   setFEst]   = useState<EstadoCita>('pendiente')
  const [fDur,   setFDur]   = useState(30)
  const [fNotas,    setFNotas]    = useState('')
  const [fValor,    setFValor]    = useState<number|''>('')
  const [fSena,     setFSena]     = useState<number|''>('')
  const [fDescuento,setFDescuento]= useState<number|''>('')
  const [fMedioPago, setFMedioPago] = useState('')

  function msg(m:string,tipo='ok'){setToast({msg:m,tipo});setTimeout(()=>setToast(null),3500)}

  const semana = getFechaSemana(fecha)
  const desdeISO = semana[0] + 'T00:00:00'
  const hastaISO = semana[5] + 'T23:59:59'

  const loadCitas = useCallback(async()=>{
    if (!tenant) return
    setLoading(true)
    const desde = vista==='semana' ? semana[0]+'T00:00:00' : fecha+'T00:00:00'
    const hasta = vista==='semana' ? semana[5]+'T23:59:59' : fecha+'T23:59:59'
    const {data,error} = await supabase.from('citas').select('*, pacientes(nombre,telefono,token)').eq('tenant_id', tenant.id).gte('fecha_hora',desde).lte('fecha_hora',hasta).order('fecha_hora',{ascending:true})
    if(error) msg('Error: '+error.message,'error')
    else setCitas((data as CitaDB[]).map(toCita))
    setLoading(false)
  },[fecha, vista, tenant])

  const loadPacs = useCallback(async()=>{
    if (!tenant) return
    const {data} = await supabase.from('pacientes').select('id,nombre,telefono').eq('tenant_id', tenant.id).order('nombre')
    if(data) setPacs(data as PacMin[])
  },[tenant])

  const loadTratamientos = useCallback(async()=>{
    if (!tenant) return
    const {data} = await supabase.from('tratamientos').select('nombre,precio_base,duracion_default').eq('tenant_id', tenant.id).eq('activo',true).order('nombre')
    if(data) setTratamientosDB(data as TratDB[])
  },[tenant])

  useEffect(()=>{if (tenant) { loadCitas();loadBloqueos(semana[0],semana[5]) }},[loadCitas, tenant])
  useEffect(()=>{if (tenant) loadPacs()},[loadPacs, tenant])
  useEffect(()=>{if (tenant) loadTratamientos()},[loadTratamientos, tenant])
  useEffect(()=>{
    if(!menuPos) return
    const handler = () => setMenuPos(null)
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  },[menuPos])

  function openNueva(f?:string, h?:string){
    setFPac('');setFHora(h||'09:00');setFFecha(f||fecha);setFTrat('Consulta');setFEst('pendiente');setFDur(30);setFNotas('');setFValor('');setFSena('');setFDescuento('');setFMedioPago('');setSel(null);setSobreturnoAgenda(null);setModal('nueva')
  }
  function openEditar(c:Cita){setSel(c);setFHora(c.hora);setFFecha(c.fecha);setFTrat(c.tratamiento);setFEst(c.estado);setFDur(c.duracion);setFNotas(c.notas);setFValor(c.valor??'');setFSena(c.sena??'');setFDescuento('');setFMedioPago(c.medio_pago??'');setModal('editar')}

  function onChangeTrat(nombre: string) {
    setFTrat(nombre)
    const t = tratamientosDB.find(t => t.nombre === nombre)
    if(t) {
      if(t.duracion_default) setFDur(t.duracion_default)
      if(t.precio_base != null) setFValor(t.precio_base)
    }
  }

 async function saveNueva(forzar = false){
    if(!fPac) return msg('Seleccioná un paciente','error')

    // Colisión de horario
    const resHoras = await fetch(`/api/horas-ocupadas?fecha=${fFecha}`)
    const { ocupadas } = await resHoras.json()
    if(ocupadas.includes(fHora) && !forzar){
      setSobreturnoAgenda(fHora)
      return
    }

    setSobreturnoAgenda(null)
    setSaving(true)
    const {error} = await supabase.from('citas').insert({paciente_id:fPac,fecha_hora:`${fFecha}T${fHora}:00-03:00`,tipo_tratamiento:fTrat,estado:fEst,duracion_minutos:fDur,notas:fNotas||null,valor:fValor||null,sena:fSena||null,medio_pago:fMedioPago||null,tenant_id:tenant?.id})
    setSaving(false)
    if(error) return msg('Error: '+error.message,'error')
    setModal(null);msg('Cita agendada ✓');loadCitas()
  }

  async function saveEditar(){
    if(!sel) return
    setSaving(true)
    const {error} = await supabase.from('citas').update({fecha_hora:`${fFecha}T${fHora}:00-03:00`,tipo_tratamiento:fTrat as TipoTratamiento,estado:fEst,duracion_minutos:fDur,notas:fNotas||null,valor:fValor||null,sena:fSena||null,medio_pago:fMedioPago||null}).eq('id',sel.id)
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

  async function moverCita(citaId: string, nuevaFecha: string, nuevaHora: string) {
    const citaOrig = citas.find(c => c.id === citaId)
    if (!citaOrig) return
    if (citaOrig.fecha === nuevaFecha && citaOrig.hora === nuevaHora) return

    const backupCitas = [...citas]
    const [h, m] = nuevaHora.split(':').map(Number)
    
    // Update local state optimistically
    setCitas(prev => prev.map(c => {
      if (c.id === citaId) {
        return {
          ...c,
          fecha: nuevaFecha,
          hora: nuevaHora,
          minutos: h * 60 + m
        }
      }
      return c
    }))

    const nuevaFechaHora = `${nuevaFecha}T${nuevaHora}:00-03:00`
    const { error } = await supabase
      .from('citas')
      .update({ fecha_hora: nuevaFechaHora })
      .eq('id', citaId)

    if (error) {
      setCitas(backupCitas)
      return msg('Error al mover cita: ' + error.message, 'error')
    }

    msg('Cita reprogramada ✓')
    loadCitas()
  }

  function handleDragStart(e: React.DragEvent, c: Cita) {
    setDraggedCitaId(c.id)
    e.dataTransfer.setData('text/plain', c.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  async function handleDrop(e: React.DragEvent, targetFecha: string) {
    e.preventDefault()
    setDragOverDay(null)
    const citaId = e.dataTransfer.getData('text/plain') || draggedCitaId
    if (!citaId) return

    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const minTot = Math.max(0, Math.floor(y / SLOT_H * 60 / 20) * 20)
    const h = Math.floor(minTot / 60) + HORA_INICIO
    const m = minTot % 60
    const targetHora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

    if (h >= HORA_FIN) return

    setDraggedCitaId(null)
    await moverCita(citaId, targetFecha, targetHora)
  }

  const loadBloqueos = async (desde: string, hasta: string) => {
    if (!tenant) return
    const {data} = await supabase.from("bloqueos").select("*").eq('tenant_id', tenant.id).gte("fecha", desde).lte("fecha", hasta)
    if (data) setBloqueos(data)
  }

  async function saveBloqueo() {
    if (!tenant) return
    if (!fBloqFecha) return msg("Seleccioná una fecha", "error")
    if (fBloqDesde >= fBloqHasta) return msg("La hora de fin debe ser mayor al inicio", "error")
    setSaving(true)
    const {error} = await supabase.from("bloqueos").insert({fecha:fBloqFecha, hora_inicio:fBloqDesde, hora_fin:fBloqHasta, motivo:fBloqMotivo||null, tenant_id:tenant.id})
    setSaving(false)
    if (error) return msg("Error: "+error.message, "error")
    setModal(null); msg("Horario bloqueado ✓"); loadBloqueos(semana[0], semana[5])
  }

  async function deletBloqueo(id: string) {
    await supabase.from("bloqueos").delete().eq("id", id)
    setBloqueos(p => p.filter(b => b.id !== id))
    msg("Bloqueo eliminado")
  }

  const horas = Array.from({length: HORA_FIN - HORA_INICIO}, (_,i) => HORA_INICIO + i)
  const totalH = (HORA_FIN - HORA_INICIO) * SLOT_H

  function citasDelDia(f: string){ return calcularPosicionCitas(citas.filter(c => c.fecha === f)) }

  function citaTop(c: Cita){ return (c.minutos - HORA_INICIO * 60) / 60 * SLOT_H }
  function citaHeight(c: Cita){ return Math.max(c.duracion / 60 * SLOT_H, isMobile ? 44 : 22) }

  const hoy = hoyISO()
  const semana7 = getFechaSemana7(fecha)
  const fechasConCitas = new Set(citas.map(c => c.fecha))
  const ahoraTop = (ahora.getHours() * 60 + ahora.getMinutes() - HORA_INICIO * 60) / 60 * SLOT_H

  return (
    <div style={{display:'flex',minHeight:'100vh',fontFamily:'DM Sans, sans-serif'}}>
      <Sidebar pendientes={citas.filter(c=>c.estado==='pendiente').length}/>
      <main style={{marginLeft:isMobile?0:240,flex:1,background:'transparent',minWidth:0,paddingBottom:isMobile?64:0}}>
        {isMobile
          ? <>
              <AgendaHeaderMobile
                fecha={fecha} vista={vista} esHoy={fecha===hoy}
                onPrev={()=>{ const d=parseFechaLocal(fecha); d.setDate(d.getDate()-7); setFecha(dateToISO(d)) }}
                onNext={()=>{ const d=parseFechaLocal(fecha); d.setDate(d.getDate()+7); setFecha(dateToISO(d)) }}
                onVista={setVista}
                onNueva={()=>{const s=proximoSlot();openNueva(s.fecha,s.hora)}}
                onHoy={()=>setFecha(hoyISO())}
              />
              <WeekStrip fechas={semana7} fechaActiva={fecha} fechasConCitas={fechasConCitas} onSelect={setFecha} hoy={hoy} />
            </>
          : <PageHeader title="Agenda"
              right={
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <button onClick={()=>{const d=new Date(fecha);d.setDate(d.getDate()-(vista==='semana'?7:1));setFecha(d.toISOString().split('T')[0])}} style={{background:'#fff',border:'1px solid #e2e8ed',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:16}}>‹</button>
                    <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{...inputCss,width:150,padding:'0.5rem 0.75rem',fontSize:13}}/>
                    <button onClick={()=>{const d=new Date(fecha);d.setDate(d.getDate()+(vista==='semana'?7:1));setFecha(d.toISOString().split('T')[0])}} style={{background:'#fff',border:'1px solid #e2e8ed',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:16}}>›</button>
                    <button onClick={()=>setFecha(hoyISO())} style={{background:'#fff',border:'1px solid #e2e8ed',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:12,color:'#555'}}>Hoy</button>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
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
                </div>
              }/>
        }

        <div style={{padding: isMobile ? 0 : '1.5rem 2rem'}}>
          {tenantLoading || loading ? <Spinner/> : (
            <div style={{
              background:'#fff',
              border:isMobile?'none':'1px solid #e2e8ed',
              borderRadius:isMobile?0:16,
              overflowX: isMobile && vista === 'semana' ? 'auto' : 'hidden',
              WebkitOverflowScrolling: 'touch',
              width: '100%'
            }}>
              <div style={{
                minWidth: isMobile && vista === 'semana' ? '960px' : 'auto'
              }}>

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
                <div style={{display:'grid',gridTemplateColumns:`64px repeat(${vista==='semana'?6:1}, 1fr)`,overflowY:'auto',overflowX:'hidden',maxHeight:isMobile?'calc(100vh - 184px)':'calc(100vh - 220px)'}}>

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
                    <div key={f} 
                      style={{
                        position:'relative',
                        height:totalH,
                        borderRight:'1px solid #f0f0f0',
                        cursor:'pointer',
                        background: dragOverDay === f ? 'rgba(56, 138, 221, 0.08)' : 'transparent',
                        transition: 'background 0.2s ease',
                      }}
                      onDragOver={e => {
                        e.preventDefault()
                        if (dragOverDay !== f) setDragOverDay(f)
                      }}
                      onDragLeave={() => {
                        if (dragOverDay === f) setDragOverDay(null)
                      }}
                      onDrop={e => handleDrop(e, f)}
                      onTouchStart={e=>{
                        touchStart.current = {x:e.touches[0].clientX, y:e.touches[0].clientY}
                      }}
                      onTouchEnd={e=>{
                        if(!touchStart.current) return
                        const dx = Math.abs(e.changedTouches[0].clientX - touchStart.current.x)
                        const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y)
                        touchStart.current = null
                        if(dx > 8 || dy > 8) return
                        e.preventDefault()
                        e.stopPropagation()
                        if((e.target as HTMLElement).closest('[data-cita]')) return
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const y = e.changedTouches[0].clientY - rect.top
                        const minTot = Math.floor(y / SLOT_H * 60 / 20) * 20
                        const h = Math.floor(minTot/60) + HORA_INICIO
                        const m = minTot % 60
                        const hStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
                        setMenuPos({x:e.changedTouches[0].clientX, y:e.changedTouches[0].clientY, f, h:hStr})
                      }}
                      onClick={e=>{
                        if((e.target as HTMLElement).closest('[data-cita]')) return
                        e.stopPropagation()
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const y = e.clientY - rect.top
                        const minTot = Math.floor(y / SLOT_H * 60 / 20) * 20
                        const h = Math.floor(minTot/60) + HORA_INICIO
                        const m = minTot % 60
                        const hStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
                        setMenuPos({x:e.clientX, y:e.clientY, f, h:hStr})
                      }}>
                      {/* Líneas de hora */}
                      {horas.map(h=>(
                        <div key={h} style={{position:'absolute',top:(h-HORA_INICIO)*SLOT_H,left:0,right:0,height:SLOT_H,borderTop:'1px solid #f5f5f5'}}/>
                      ))}
                      {/* Slots ocupados */}
                      {(()=>{
                        const mins = new Set<number>()
                        citasF.forEach(c=>{ for(let m=c.minutos;m<c.minutos+c.duracion;m+=30) mins.add(m) })
                        return Array.from({length:(HORA_FIN-HORA_INICIO)*2},(_,i)=>{
                          const minTot = HORA_INICIO*60+i*30
                          return mins.has(minTot)
                            ? <div key={i} style={{position:'absolute',top:i*(SLOT_H/2),left:0,right:0,height:SLOT_H/2,background:'rgba(0,0,0,0.04)',pointerEvents:'none'}}/>
                            : null
                        })
                      })()}
                      {/* Hora actual */}
                      {f===hoy&&ahoraTop>=0&&ahoraTop<=totalH&&(
                        <div style={{position:'absolute',top:ahoraTop,left:0,right:0,height:2,background:'#ef4444',zIndex:5,pointerEvents:'none'}}>
                          <div style={{position:'absolute',left:-3,top:-3,width:8,height:8,borderRadius:'50%',background:'#ef4444'}}/>
                        </div>
                      )}
                      {/* Bloqueos */}
                      {bloqueos.filter(b=>b.fecha===f).map(b=>{
                        const [bh,bm] = b.hora_inicio.split(':').map(Number)
                        const [eh,em] = b.hora_fin.split(':').map(Number)
                        const top = (bh - HORA_INICIO + bm/60) * SLOT_H
                        const height = ((eh + em/60) - (bh + bm/60)) * SLOT_H
                        return (
                          <div key={b.id} onClick={e=>{e.stopPropagation();if(confirm('¿Eliminar este bloqueo?'))deletBloqueo(b.id)}}
                            style={{position:'absolute',top,left:2,right:2,height:Math.max(height-2,18),background:'repeating-linear-gradient(45deg,#e0e0e0,#e0e0e0 4px,#f0f0f0 4px,#f0f0f0 8px)',borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',padding:'0 8px',zIndex:1}}>
                            <span style={{fontSize:10,fontWeight:600,color:'#888'}}>🚫 {b.motivo||'Bloqueado'} {b.hora_inicio.slice(0,5)}–{b.hora_fin.slice(0,5)}</span>
                          </div>
                        )
                      })}
                      {/* Citas */}
                      {citasF.map(c=>{
                        const tc = TRAT_STYLE[c.tratamiento]||TRAT_STYLE.Consulta
                        const es = ESTADO_STYLE[c.estado]||ESTADO_STYLE.pendiente
                        const isDragging = draggedCitaId === c.id
                        const isOrtodoncia = c.tratamiento === 'Ortodoncia'
                        const isSobreturno = c.totalCols && c.totalCols > 1

                        const colWidth = 100 / (c.totalCols || 1)
                        const leftOffset = (c.colIndex || 0) * colWidth
                        const cardLeft = `calc(${leftOffset}% + 2px)`
                        const cardWidth = `calc(${colWidth}% - 4px)`

                        return(
                          <div key={c.id} data-cita="1"
                            onClick={e=>{e.stopPropagation();setSel(c);setModal('detalle')}}
                            draggable
                            onDragStart={e => handleDragStart(e, c)}
                            onDragEnd={() => setDraggedCitaId(null)}
                            className={`agenda-card-interactive ${isOrtodoncia ? 'glow-card-ortodoncia' : ''}`}
                            style={{
                              position:'absolute',
                              top:citaTop(c)+2,
                              left: cardLeft,
                              width: cardWidth,
                              height:citaHeight(c)-4,
                              background:isOrtodoncia ? undefined : tc.bg,
                              borderLeft: isSobreturno ? `4px solid #EF9F27` : `4px solid ${tc.dot}`,
                              borderTop: isSobreturno ? '1px dashed #EF9F27' : '1px solid rgba(0,0,0,0.03)',
                              borderRight: isSobreturno ? '1px dashed #EF9F27' : '1px solid rgba(0,0,0,0.03)',
                              borderBottom: isSobreturno ? '1px dashed #EF9F27' : '1px solid rgba(0,0,0,0.03)',
                              borderRadius:8,
                              padding:'4px 8px',
                              overflow:'hidden',
                              cursor:'pointer',
                              zIndex: isSobreturno ? 2 : 1,
                              boxShadow: isOrtodoncia ? undefined : '0 2px 6px rgba(10,30,61,0.05)',
                              opacity: isDragging ? 0.4 : 1,
                              ['--hover-glow' as any]: `${tc.dot}35`,
                            } as React.CSSProperties}>
                            
                            {isSobreturno && (
                              <span style={{
                                position: 'absolute',
                                top: 2,
                                right: 2,
                                background: '#EF9F27',
                                color: '#fff',
                                fontSize: '8px',
                                fontWeight: 800,
                                padding: '1px 3px',
                                borderRadius: 4,
                                textTransform: 'uppercase',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                zIndex: 10
                              }}>
                                ST
                              </span>
                            )}

                            {isMobile ? (
                              <>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                  <span style={{fontSize:10,fontWeight:800,color:isSobreturno ? '#B45309' : tc.color,lineHeight:1}}>{c.hora}</span>
                                  {!isSobreturno && <span style={{width:6,height:6,borderRadius:'50%',background:es.color,flexShrink:0}}/>}
                                </div>
                                <div style={{fontSize:12,fontWeight:700,color:isSobreturno ? '#78350F' : tc.color,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:2}}>{c.nombre}</div>
                                {citaHeight(c)>64&&<div style={{fontSize:9,color:tc.color,opacity:0.8,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.tratamiento}</div>}
                              </>
                            ) : (
                              <>
                                <div style={{fontSize:11.5,fontWeight:700,color:isSobreturno ? '#78350F' : tc.color,lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                  {c.hora} · {c.nombre}
                                </div>
                                {citaHeight(c)>30&&<div style={{fontSize:9.5,color:tc.color,opacity:0.85,marginTop:1,fontWeight:500}}>{c.tratamiento} · {c.duracion} min{c.valor?` · $${c.valor}`:''}</div>}
                                {citaHeight(c)>48&&<div style={{marginTop:4}}><Badge bg={es.bg} color={es.color}>{es.label}</Badge></div>}
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Modal detalle */}
      {modal==='detalle'&&sel&&(
        <div style={overlayCss(isMobile)} onClick={()=>setModal(null)}>
          <div style={{...modalCss(isMobile),maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={modalTitleCss}>{sel.nombre}</div>
            <div style={{fontSize:14,color:'#555',lineHeight:2}}>
              <div>📅 <strong>{sel.fecha}</strong> a las <strong>{sel.hora}</strong></div>
              <div>🦷 {sel.tratamiento} · {sel.duracion} min</div>
{sel.valor!=null&&<div>💰 Valor: <strong>${sel.valor}</strong>{sel.sena?<> · Seña: <strong>${sel.sena}</strong> · Saldo: <strong>${sel.valor-sel.sena}</strong></>:null}</div>}
              {sel.medio_pago&&<div>💳 Medio de pago: <strong>{sel.medio_pago}</strong></div>}
              <div>📞 <a href={`tel:${sel.telefono}`} style={{color:'#185FA5',textDecoration:'none'}}>{sel.telefono}</a></div>
              {sel.notas&&<div>📝 {sel.notas}</div>}
            </div>
            <div style={{margin:'12px 0'}}>
              <label style={labelCss}>Estado</label>
              <select value={sel.estado} onChange={e=>{cambiarEstado(sel.id,e.target.value as EstadoCita);setSel({...sel,estado:e.target.value as EstadoCita})}} style={selectCss}>
                {ESTADOS.map(est=><option key={est} value={est}>{est.charAt(0).toUpperCase()+est.slice(1)}</option>)}
              </select>
            </div>
            {sel.token&&(
              <button style={{...btnLightCss,width:'100%',marginTop:8,gap:6,color:'#128C7E',borderColor:'rgba(18,140,126,0.3)'}} onClick={()=>{
                const num = normalizarTelefono(sel.telefono)
                const d   = parseFechaLocal(sel.fecha)
                const fechaLarga = d.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})
                let msgText = tenant?.whatsappTemplate || ''
                msgText = msgText
                  .replace(/{nombre_paciente}/g, sel.nombre)
                  .replace(/{nombre_clinica}/g, tenant?.nombre || 'DentalDesk')
                  .replace(/{dia_semana}/g, d.toLocaleDateString('es-AR',{weekday:'long'}))
                  .replace(/{fecha}/g, d.toLocaleDateString('es-AR',{day:'numeric',month:'long'}))
                  .replace(/{hora}/g, sel.hora)
                  .replace(/{tratamiento}/g, sel.tratamiento)
                  .replace(/{link}/g, `${window.location.origin}/paciente/${sel.token}`)
                const txt = encodeURIComponent(msgText)
                window.open(`https://wa.me/${num}?text=${txt}`,'_blank')
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.116 1.522 5.849L0 24l6.335-1.505A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.371l-.358-.214-3.759.893.952-3.653-.234-.374A9.818 9.818 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
                Enviar por WhatsApp
              </button>
            )}
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>{setModal(null);setTimeout(()=>{setSel(sel);setModal('borrar')},50)}}>Eliminar</button>
              <button style={btnDarkCss} onClick={()=>{setModal(null);setTimeout(()=>openEditar(sel),50)}}>Editar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nueva */}
      {modal==='nueva'&&(
        <div style={overlayCss(isMobile)} onClick={()=>setModal(null)}>
          <div style={modalCss(isMobile)} onClick={e=>e.stopPropagation()}>
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
              <div style={groupCss}><label style={labelCss}>Tratamiento</label><select style={selectCss} value={fTrat} onChange={e=>onChangeTrat(e.target.value)}>{(tratamientosDB.length?tratamientosDB.map(t=>t.nombre):TRATAMIENTOS).map(t=><option key={t} value={t}>{t}</option>)}</select></div>
              <div style={groupCss}><label style={labelCss}>Duración</label><select style={selectCss} value={fDur} onChange={e=>setFDur(Number(e.target.value))}>{DURACIONES.map(d=><option key={d} value={d}>{d} min</option>)}</select></div>
            </div>
            <div style={groupCss}><label style={labelCss}>Estado</label><select style={selectCss} value={fEst} onChange={e=>setFEst(e.target.value as EstadoCita)}>{ESTADOS.map(est=><option key={est} value={est}>{est.charAt(0).toUpperCase()+est.slice(1)}</option>)}</select></div>
            <div style={groupCss}><label style={labelCss}>Notas</label><textarea style={textareaCss} value={fNotas} onChange={e=>setFNotas(e.target.value)} placeholder="Observaciones..."/></div>
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Valor ($)</label><input type="number" style={{...selectCss}} value={fValor} onChange={e=>setFValor(e.target.value===''?'':Number(e.target.value))} placeholder="0"/></div>
              <div style={groupCss}><label style={labelCss}>Seña ($)</label><input type="number" style={{...selectCss}} value={fSena} onChange={e=>setFSena(e.target.value===''?'':Number(e.target.value))} placeholder="0"/></div>
            </div>
            {(fValor!==''||fSena!=='')&&<div style={{fontSize:13,color:'#888',padding:'0.25rem 0'}}>Saldo: <strong style={{color:'#222'}}>${(Number(fValor)||0)-(Number(fSena)||0)}</strong></div>}
            <div style={groupCss}><label style={labelCss}>Medio de pago</label><select style={selectCss} value={fMedioPago} onChange={e=>setFMedioPago(e.target.value)}><option value="">— Sin especificar —</option>{MEDIOS_PAGO.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button>
              {sobreturnoAgenda && (
              <div style={{background:'#FFF3E0',borderRadius:10,padding:'0.75rem',border:'0.5px solid #FFB74D',marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:600,color:'#92400E',marginBottom:6}}>Las {sobreturnoAgenda}hs ya está ocupado — ¿Sobreturno?</div>
                <div style={{display:'flex',gap:8}}>
                  <button style={btnLightCss} onClick={()=>setSobreturnoAgenda(null)}>Cancelar</button>
                  <button style={{...btnDarkCss,background:'#F97316'}} onClick={()=>{setSobreturnoAgenda(null);saveNueva(true)}}>Confirmar sobreturno</button>
                </div>
              </div>
            )}

              <button style={{...btnDarkCss,opacity:saving?.6:1}} onClick={()=>saveNueva()} disabled={saving}>{saving?'Guardando...':'Agendar cita'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {modal==='editar'&&(
        <div style={overlayCss(isMobile)} onClick={()=>setModal(null)}>
          <div style={modalCss(isMobile)} onClick={e=>e.stopPropagation()}>
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
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Valor ($)</label><input type="number" style={{...selectCss}} value={fValor} onChange={e=>setFValor(e.target.value===''?'':Number(e.target.value))} placeholder="0"/></div>
              <div style={groupCss}><label style={labelCss}>Seña ($)</label><input type="number" style={{...selectCss}} value={fSena} onChange={e=>setFSena(e.target.value===''?'':Number(e.target.value))} placeholder="0"/></div>
            </div>
            {(fValor!==''||fSena!=='')&&<div style={{fontSize:13,color:'#888',padding:'0.25rem 0'}}>Saldo: <strong style={{color:'#222'}}>${(Number(fValor)||0)-(Number(fSena)||0)}</strong></div>}
            <div style={groupCss}><label style={labelCss}>Medio de pago</label><select style={selectCss} value={fMedioPago} onChange={e=>setFMedioPago(e.target.value)}><option value="">— Sin especificar —</option>{MEDIOS_PAGO.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{...btnDarkCss,opacity:saving?.6:1}} onClick={saveEditar} disabled={saving}>{saving?'Guardando...':'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal borrar */}
      {modal==='borrar'&&(
        <div style={overlayCss(isMobile)} onClick={()=>setModal(null)}>
          <div style={{...modalCss(isMobile),maxWidth:380}} onClick={e=>e.stopPropagation()}>
            <div style={modalTitleCss}>Eliminar cita</div>
            <p style={{fontSize:14,color:'#666',marginBottom:'1.5rem'}}>Vas a eliminar la cita de <strong>{sel?.nombre}</strong> a las <strong>{sel?.hora}</strong>.</p>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{...btnRedCss,opacity:saving?.6:1}} onClick={saveBorrar} disabled={saving}>{saving?'Eliminando...':'Sí, eliminar'}</button>
            </div>
          </div>
        </div>
      )}
{/* Menu flotante slot */}
     {menuPos&&(()=>{
        const MENU_W = 188, MENU_H = 96
        const safeX = Math.max(8, Math.min(menuPos.x, window.innerWidth  - MENU_W - 8))
        const safeY = Math.max(64, Math.min(menuPos.y, window.innerHeight - MENU_H - (isMobile ? 72 : 8)))
        return(
        <div style={{position:'fixed',top:safeY,left:safeX,zIndex:1000,background:'#fff',borderRadius:10,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',padding:'0.5rem',display:'flex',flexDirection:'column',gap:4,minWidth:180}} onClick={e=>e.stopPropagation()}>
          <button style={{padding:'0.6rem 1rem',borderRadius:7,border:'none',background:'#f5f5f5',cursor:'pointer',textAlign:'left',fontSize:13,fontWeight:500}} onClick={()=>{setMenuPos(null);openNueva(menuPos.f,menuPos.h)}}>📅 Nueva cita</button>
          <button style={{padding:'0.6rem 1rem',borderRadius:7,border:'none',background:'#f5f5f5',cursor:'pointer',textAlign:'left',fontSize:13,fontWeight:500}} onClick={()=>{setMenuPos(null);setFBloqFecha(menuPos.f);setFBloqDesde(menuPos.h);setFBloqHasta(menuPos.h>='12:00'?'20:00':'12:00');setFBloqMotivo('');setModal('bloqueo')}}>🚫 Bloquear horario</button>
        </div>
        )
      })()}
      {/* Modal bloqueo */}
      {modal==='bloqueo'&&(
        <div style={overlayCss(isMobile)} onClick={()=>setModal(null)}>
          <div style={{...modalCss(isMobile),maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={modalTitleCss}>Bloquear horario</div>
            <div style={groupCss}><label style={labelCss}>Fecha</label><input type="date" style={{...selectCss}} value={fBloqFecha} onChange={e=>setFBloqFecha(e.target.value)}/></div>
            <div style={grid2Css}>
              <div style={groupCss}><label style={labelCss}>Desde</label><input type="time" style={{...selectCss}} value={fBloqDesde} onChange={e=>setFBloqDesde(e.target.value)}/></div>
              <div style={groupCss}><label style={labelCss}>Hasta</label><input type="time" style={{...selectCss}} value={fBloqHasta} onChange={e=>setFBloqHasta(e.target.value)}/></div>
            </div>
            <div style={groupCss}><label style={labelCss}>Motivo (opcional)</label><input type="text" style={{...selectCss}} value={fBloqMotivo} onChange={e=>setFBloqMotivo(e.target.value)} placeholder="Ej: Almuerzo, Reunión..."/></div>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{...btnDarkCss,opacity:saving?0.6:1}} onClick={saveBloqueo} disabled={saving}>{saving?'Guardando...':'Bloquear'}</button>
            </div>
          </div>
        </div>
      )}
      {toast&&<Toast msg={toast.msg} tipo={toast.tipo} isMobile={isMobile}/>}
    </div>
  )
}
