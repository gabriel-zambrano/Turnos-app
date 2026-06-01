'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, BtnPrimary, BtnSm, Spinner, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss, btnRedCss, selectCss, textareaCss, inputCss } from '@/components/UI'
import { TRAT_STYLE, ESTADO_STYLE, TRATAMIENTOS, ESTADOS, DURACIONES, horasDisponibles, hoyISO, normalizarTelefono } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import type { EstadoCita, TipoTratamiento } from '@/types'
import { useTenantContext } from '@/components/TenantContext'
import { triggerConfetti } from '@/lib/confetti'
import { NuevaCitaModal } from '@/components/NuevaCitaModal'

interface CitaDB { id:string; paciente_id:string; fecha_hora:string; tipo_tratamiento:string; estado:string; notas:string|null; duracion_minutos:number; valor:number|null; sena:number|null; medio_pago:string|null; precio_cobrado:number|null; pacientes:{nombre:string;telefono:string;token:string}|null }
interface Cita   { id:string; paciente_id:string; nombre:string; telefono:string; token:string; hora:string; fecha:string; tratamiento:string; estado:EstadoCita; duracion:number; notas:string; minutos:number; valor:number|null; sena:number|null; medio_pago:string|null; precio_cobrado:number|null }
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
    minutos: h * 60 + m, valor:c.valor??null, sena:c.sena??null, medio_pago:c.medio_pago??null, precio_cobrado:c.precio_cobrado??null
  }
}

function calcularPosicionCitas(citasDia: Cita[]): CitaPos[] {
  const citasSorted = [...citasDia].sort((a, b) => a.minutos - b.minutos)
  const result: CitaPos[] = citasSorted.map(c => ({ ...c }))

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
      const newCluster = [c]
      for (let i = matchingClusters.length - 1; i >= 0; i--) {
        const idx = matchingClusters[i]
        newCluster.push(...clusters[idx])
        clusters.splice(idx, 1)
      }
      clusters.push(newCluster)
    }
  })

  clusters.forEach(cluster => {
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

function formatFechaPropuesta(fechaStr: string) {
  const dt = new Date(fechaStr + 'T12:00:00')
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const diaS = dias[dt.getDay()]
  const diaN = dt.getDate()
  const mesS = meses[dt.getMonth()]
  return `${diaS} ${diaN} de ${mesS}`
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
      background: 'var(--bg-header, rgba(255,255,255,0.95))',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-light, rgba(56,138,221,0.10))',
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
            <span style={{ fontSize: 10, fontWeight: 500, color: activo ? 'var(--text-dark, #0a1e3d)' : 'var(--text-muted, #aab8c8)', lineHeight: 1, marginBottom: 3 }}>
              {DIAS_STRIP[i]}
            </span>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: activo ? 'var(--text-dark, #0a1e3d)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: activo ? '0 2px 6px rgba(10,30,61,0.15)' : 'none',
            }}>
              <span style={{
                fontSize: 14,
                fontWeight: activo || esHoy ? 700 : 400,
                color: activo ? 'var(--bg-app, #fff)' : esHoy ? '#10B981' : 'var(--text-dark, #333)',
                lineHeight: 1,
              }}>{numDia}</span>
            </div>
            <span style={{
              fontSize: 9, color: 'var(--text-muted, #aab8c8)', lineHeight: 1, marginTop: 2,
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

function AgendaHeaderMobile({ fecha, vista, esHoy, onPrev, onNext, onVista, onNueva, onBloqueo, onHoy }: {
  fecha: string; vista: 'semana'|'dia'|'lista'; esHoy: boolean
  onPrev: ()=>void; onNext: ()=>void; onVista: (v:'semana'|'dia'|'lista')=>void
  onNueva: ()=>void; onBloqueo: ()=>void; onHoy: ()=>void
}) {
  const d = parseFechaLocal(fecha)
  const diaNum    = d.getDate()
  const diaNombre = d.toLocaleDateString('es-AR', { weekday: 'short' })

  const btnFlecha: React.CSSProperties = {
    width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid var(--border-light, rgba(56,138,221,0.10))',
    background: 'var(--bg-card, rgba(255,255,255,0.6))',
    color: 'var(--text-dark, #0a1e3d)',
    cursor: 'pointer', borderRadius: 10, flexShrink: 0,
    fontFamily: 'DM Sans, sans-serif',
  }

  return (
    <header style={{
      height: 56, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6,
      background: 'var(--bg-header, rgba(255,255,255,0.92))',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-light, rgba(56,138,221,0.10))',
      position: 'sticky', top: 0, zIndex: 50,
    }}>

      <button onClick={onPrev} style={btnFlecha} aria-label="Semana Anterior">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>

      <button onClick={onHoy} style={{
        flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', background: 'transparent', cursor: 'pointer', gap: 6,
        fontFamily: 'DM Sans, sans-serif',
      }}>
        {esHoy ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#10B981' }}>Hoy</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-dark, #0a1e3d)', lineHeight: 1 }}>{diaNum}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted, #8fa3bc)', textTransform: 'capitalize' }}>{diaNombre}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-dark, #0a1e3d)', lineHeight: 1 }}>{diaNum}</span>
          </>
        )}
      </button>

      <button onClick={onNext} style={btnFlecha} aria-label="Semana Siguiente">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <div style={{display:'flex',background:'var(--bg-input, #f0f4f8)',borderRadius:8,overflow:'hidden',marginRight:4,height:32,border:'0.5px solid var(--border-color, #dde5ef)',flexShrink:0}}>
        {(['semana','dia','lista'] as const).map(v=>(
          <button key={v} onClick={()=>onVista(v)} style={{padding:'0 8px',fontSize:11,border:'none',cursor:'pointer',background:vista===v?'var(--text-dark, #0a1e3d)':'transparent',color:vista===v?'var(--bg-app, #fff)':'var(--text-muted, #687e96)',fontWeight:700,fontFamily:'DM Sans, sans-serif'}}>{v==='semana'?'Sem':v==='dia'?'Día':'Lista'}</button>
        ))}
      </div>

      <button onClick={onBloqueo} style={{
        width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border-color, rgba(239,68,68,0.15))',
        background: 'var(--bg-card, #fff)',
        color: '#ef4444',
        borderRadius: 10, fontSize: 16, cursor: 'pointer', flexShrink: 0,
        fontFamily: 'DM Sans, sans-serif',
        boxShadow: '0 2px 6px rgba(239,68,68,0.05)',
      }} aria-label="Bloquear Horario" title="Bloquear Horario">🚫</button>

      <button onClick={onNueva} style={{
        width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', background: 'var(--text-dark, #0a1e3d)', color: 'var(--bg-app, #fff)',
        borderRadius: 10, fontSize: 20, cursor: 'pointer', flexShrink: 0,
        fontFamily: 'DM Sans, sans-serif',
        boxShadow: '0 2px 6px rgba(10,30,61,0.15)',
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
  const [modal,   setModal]   = useState<'nueva'|'editar'|'borrar'|'detalle'|'bloqueo'|'menu'|'cobrar'|null>(null)
  const [sel,     setSel]     = useState<Cita|null>(null)
  const [fecha,   setFecha]   = useState(hoyISO())
  const [toast,   setToast]   = useState<{msg:string;tipo:string}|null>(null)
  const [menuPos, setMenuPos] = useState<{x:number;y:number;f:string;h:string}|null>(null)
  const [bloqueos, setBloqueos] = useState<{id:string;fecha:string;hora_inicio:string;hora_fin:string;motivo:string|null}[]>([])
  const [fBloqDesde, setFBloqDesde] = useState("08:00")
  const [fBloqHasta, setFBloqHasta] = useState("12:00")
  const [fBloqMotivo, setFBloqMotivo] = useState("")
  const [fBloqFecha, setFBloqFecha] = useState("")
  const [vista,   setVista]   = useState<'semana'|'dia'|'lista'>('semana')
  const [isMobile, setIsMobile] = useState(false)
  const [draggedCitaId, setDraggedCitaId] = useState<string | null>(null)
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const touchStart = useRef<{x:number; y:number} | null>(null)
  const [hoverSlot, setHoverSlot] = useState<{ f: string, top: number, timeStr: string } | null>(null)
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setAhora(new Date()), 60_000); return () => clearInterval(id) }, [])
  
  // Swipe Gestures States & Handlers
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (vista === 'semana') return
    touchStartX.current = e.targetTouches[0].clientX
    touchEndX.current = null
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (vista === 'semana') return
    touchEndX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    if (vista === 'semana' || touchStartX.current === null || touchEndX.current === null) return
    const diffX = touchStartX.current - touchEndX.current
    const minSwipeDistance = 50

    if (Math.abs(diffX) > minSwipeDistance) {
      const d = parseFechaLocal(fecha)
      if (diffX > 0) {
        // Swipe left -> Next day
        d.setDate(d.getDate() + 1)
      } else {
        // Swipe right -> Previous day
        d.setDate(d.getDate() - 1)
      }
      setFecha(dateToISO(d))
    }
    touchStartX.current = null
    touchEndX.current = null
  }

  // Express Billing States
  const [cobConcepto, setCobConcepto] = useState('')
  const [cobMonto, setCobMonto] = useState<number | ''>('')
  const [cobFecha, setCobFecha] = useState('')
  const [guardandoCobro, setGuardandoCobro] = useState(false)

  // Pre-agendamiento States
  const [propuestaProximaCita, setPropuestaProximaCita] = useState<Cita | null>(null)
  const [guardandoPropuesta, setGuardandoPropuesta] = useState(false)

  function openCobroExpress(c: Cita) {
    setSel(c)
    setCobConcepto(`Pago ${c.tratamiento} — ${c.nombre}`)
    setCobMonto(c.valor ?? '')
    setCobFecha(c.fecha)
    setModal('cobrar')
  }

  async function guardarCobroExpress() {
    if (!cobConcepto.trim() || cobMonto === '' || Number(cobMonto) <= 0) {
      return msg('Completá concepto y monto', 'error')
    }
    if (!tenant || !sel) return
    setGuardandoCobro(true)
    
    // 1. Insert manual income record
    const { error: insError } = await supabase.from('ingresos_manuales').insert({
      fecha: cobFecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }),
      concepto: cobConcepto.trim(),
      monto: Number(cobMonto),
      tenant_id: tenant.id
    })

    // 2. Update price_cobrado on appointment
    const { error: updError } = await supabase.from('citas').update({
      precio_cobrado: Number(cobMonto),
      estado: 'asistio'
    }).eq('id', sel.id)

    setGuardandoCobro(false)

    if (insError || updError) {
      msg('Error al registrar cobro: ' + (insError?.message || updError?.message), 'error')
    } else {
      setModal(null)
      msg('Cobro registrado correctamente ✓')
      triggerConfetti()
      loadCitas()
      setPropuestaProximaCita(sel)
    }
  }

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
    if(fEst === 'asistio') triggerConfetti()
    setModal(null);msg('Cita agendada ✓');loadCitas()
  }

  async function saveEditar(){
    if(!sel) return
    setSaving(true)
    const {error} = await supabase.from('citas').update({fecha_hora:`${fFecha}T${fHora}:00-03:00`,tipo_tratamiento:fTrat as TipoTratamiento,estado:fEst,duracion_minutos:fDur,notas:fNotas||null,valor:fValor||null,sena:fSena||null,medio_pago:fMedioPago||null}).eq('id',sel.id)
    setSaving(false)
    if(error) return msg('Error: '+error.message,'error')
    if(fEst === 'asistio') {
      triggerConfetti()
      const updatedCita: Cita = {
        ...sel,
        fecha: fFecha,
        hora: fHora,
        tratamiento: fTrat,
        estado: 'asistio',
        duracion: fDur,
        notas: fNotas
      }
      setPropuestaProximaCita(updatedCita)
    }
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
    if(estado === 'asistio') {
      triggerConfetti()
      const cita = citas.find(c => c.id === id)
      if (cita) {
        setPropuestaProximaCita(cita)
      }
    }
  }

  const [whatsappCita, setWhatsappCita] = useState<{ telefono: string; mensajeWA: string } | null>(null)

  async function agendarPropuesta(fechaDest: string) {
    if (!tenant || !propuestaProximaCita) return
    setGuardandoPropuesta(true)
    const { error } = await supabase.from('citas').insert({
      paciente_id: propuestaProximaCita.paciente_id,
      fecha_hora: `${fechaDest}T${propuestaProximaCita.hora}:00-03:00`,
      tipo_tratamiento: propuestaProximaCita.tratamiento,
      estado: 'pendiente',
      duracion_minutos: propuestaProximaCita.duracion,
      notas: null,
      valor: propuestaProximaCita.valor ?? null,
      sena: null,
      medio_pago: null,
      tenant_id: tenant.id
    })
    setGuardandoPropuesta(false)
    if (error) {
      msg('Error al agendar propuesta: ' + error.message, 'error')
    } else {
      msg('Próxima cita pre-agendada con éxito ✓')
      const waMsg = `Hola *${propuestaProximaCita.nombre.trim().split(' ')[0]}* 👋\nTe confirmamos tu próximo turno de *${propuestaProximaCita.tratamiento}* para el *${fechaDest.split('-').reverse().join('/')}* a las *${propuestaProximaCita.hora} hs*.\n\n🗓️ Podés sumarlo a tu calendario haciendo clic aquí:\nhttps://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Turno Odontológico - ${propuestaProximaCita.tratamiento}`)}&dates=${new Date(`${fechaDest}T${propuestaProximaCita.hora}:00-03:00`).toISOString().replace(/-|:|\.\d\d\d/g, '')}/${new Date(new Date(`${fechaDest}T${propuestaProximaCita.hora}:00-03:00`).getTime() + propuestaProximaCita.duracion * 60000).toISOString().replace(/-|:|\.\d\d\d/g, '')}&details=${encodeURIComponent(`Turno para ${propuestaProximaCita.tratamiento}.`)}`
      
      setWhatsappCita({
        telefono: propuestaProximaCita.telefono,
        mensajeWA: waMsg
      })
      setPropuestaProximaCita(null)
      loadCitas()
    }
  }

  async function moverCita(citaId: string, nuevaFecha: string, nuevaHora: string) {
    const citaOrig = citas.find(c => c.id === citaId)
    if (!citaOrig) return
    if (citaOrig.fecha === nuevaFecha && citaOrig.hora === nuevaHora) return

    const backupCitas = [...citas]
    const [h, m] = nuevaHora.split(':').map(Number)
    
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
      <main style={{marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)',flex:1,background:'transparent',minWidth:0,paddingBottom:isMobile?64:0}}>
        {isMobile
          ? <>
              <AgendaHeaderMobile
                fecha={fecha} vista={vista} esHoy={fecha===hoy}
                onPrev={()=>{ const d=parseFechaLocal(fecha); d.setDate(d.getDate()-7); setFecha(dateToISO(d)) }}
                onNext={()=>{ const d=parseFechaLocal(fecha); d.setDate(d.getDate()+7); setFecha(dateToISO(d)) }}
                onVista={setVista}
                onNueva={()=>{const s=proximoSlot();openNueva(s.fecha,s.hora)}}
                onBloqueo={()=>{setFBloqFecha(fecha);setFBloqDesde('08:00');setFBloqHasta('12:00');setFBloqMotivo('');setModal('bloqueo')}}
                onHoy={()=>setFecha(hoyISO())}
              />
              <WeekStrip fechas={semana7} fechaActiva={fecha} fechasConCitas={fechasConCitas} onSelect={setFecha} hoy={hoy} />
            </>
          : <PageHeader title="Agenda"
              right={
                <div style={{display:'flex',gap:12,alignItems:'center'}}>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <button onClick={()=>{const d=new Date(fecha);d.setDate(d.getDate()-(vista==='semana'?7:1));setFecha(d.toISOString().split('T')[0])}} 
                      style={{
                        background:'var(--bg-card, #fff)',
                        border:'1px solid var(--border-color, #e2e8ed)',
                        borderRadius:8,
                        width: 36,
                        height: 36,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor:'pointer',
                        color: 'var(--text-dark)'
                      }}
                      className="quick-action-btn"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} 
                      style={{
                        ...inputCss,
                        width:150,
                        height: 36,
                        padding:'0 0.75rem',
                        fontSize:13,
                        background: 'var(--bg-card, #fff)',
                        borderColor: 'var(--border-color, #e2e8ed)',
                        color: 'var(--text-dark)'
                      }}
                    />
                    <button onClick={()=>{const d=new Date(fecha);d.setDate(d.getDate()+(vista==='semana'?7:1));setFecha(d.toISOString().split('T')[0])}} 
                      style={{
                        background:'var(--bg-card, #fff)',
                        border:'1px solid var(--border-color, #e2e8ed)',
                        borderRadius:8,
                        width: 36,
                        height: 36,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor:'pointer',
                        color: 'var(--text-dark)'
                      }}
                      className="quick-action-btn"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    <button onClick={()=>setFecha(hoyISO())} 
                      style={{
                        background:'var(--bg-card, #fff)',
                        border:'1px solid var(--border-color, #e2e8ed)',
                        borderRadius:8,
                        height: 36,
                        padding:'0 14px',
                        cursor:'pointer',
                        fontSize:12,
                        fontWeight: 600,
                        color:'var(--text-dark, #555)'
                      }}
                      className="quick-action-btn"
                    >
                      Hoy
                    </button>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <div style={{display:'flex',background:'var(--bg-input, rgba(0,0,0,0.05))',border:'1px solid var(--border-color, #e2e8ed)',borderRadius:8,overflow:'hidden',padding: 2, height: 36}}>
                      {(['semana','dia'] as const).map(v=>(
                        <button key={v} onClick={()=>setVista(v)} 
                          style={{
                            padding:'0 14px',
                            fontSize:12,
                            border:'none',
                            borderRadius: 6,
                            cursor:'pointer',
                            background:vista===v?'var(--text-dark, #0f1e2b)':'transparent',
                            color:vista===v?'var(--bg-app, #fff)':'var(--text-muted, #555)',
                            fontWeight:600,
                            fontFamily:'DM Sans, sans-serif'
                          }}
                        >
                          {v==='semana'?'Semana':'Día'}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        setFBloqFecha(fecha);
                        setFBloqDesde("08:00");
                        setFBloqHasta("12:00");
                        setFBloqMotivo("");
                        setModal('bloqueo');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        height: 36,
                        padding: '0 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 8,
                        border: '1px solid var(--border-color, #e2e8ed)',
                        background: 'var(--bg-card, #fff)',
                        color: 'var(--text-dark, #333)',
                        cursor: 'pointer',
                        fontFamily: 'DM Sans, sans-serif',
                        transition: 'all 0.2s ease',
                      }}
                      className="quick-action-btn"
                    >
                      <span style={{color: '#ef4444'}}>🚫</span> Bloquear
                    </button>
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
            <div 
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                background:'var(--bg-container, #fff)',
                border:isMobile?'none':'1px solid var(--border-color, #e2e8ed)',
                borderRadius:isMobile?0:16,
                overflowX: isMobile && vista === 'semana' ? 'auto' : 'hidden',
                WebkitOverflowScrolling: 'touch',
                width: '100%',
                boxShadow: isMobile ? 'none' : '0 4px 20px rgba(10,30,61,0.02)'
              }}
            >
              {vista === 'lista' ? (
                <div style={{
                  padding: isMobile ? '1.5rem 1rem' : '2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  maxWidth: 680,
                  margin: '0 auto',
                  width: '100%'
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', marginBottom: 4 }}>
                    Citas del {parseFechaLocal(fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  {citasDelDia(fecha).length === 0 ? (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '4rem 1rem', 
                      color: 'var(--text-muted)', 
                      fontSize: 14,
                      background: 'var(--bg-card, rgba(255,255,255,0.4))',
                      borderRadius: 16,
                      border: '1px dashed var(--border-light)'
                    }}>
                      🚫 No hay citas agendadas para este día.
                    </div>
                  ) : (
                    citasDelDia(fecha).map(c => {
                      const tc = TRAT_STYLE[c.tratamiento]||TRAT_STYLE.Consulta
                      const es = ESTADO_STYLE[c.estado]||ESTADO_STYLE.pendiente
                      const isSobreturno = c.totalCols && c.totalCols > 1
                      return (
                        <div key={c.id} onClick={() => { setSel(c); setModal('detalle') }}
                          style={{
                            background: 'var(--bg-card, rgba(255,255,255,0.7))',
                            backdropFilter: 'blur(10px)',
                            borderRadius: 14,
                            border: '1px solid var(--border-light)',
                            borderLeft: `5px solid ${isSobreturno ? '#EF9F27' : `var(--trat-${c.tratamiento}-border, ${tc.dot})`}`,
                            padding: '16px 18px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                            boxShadow: '0 2px 10px rgba(10,30,61,0.02)',
                            cursor: 'pointer',
                            position: 'relative'
                          }}
                          className={`agenda-card-interactive ${isSobreturno ? 'sobreturno-card' : ''}`}
                        >
                          {isSobreturno && (
                            <span style={{
                              position: 'absolute',
                              top: 12,
                              right: 16,
                              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                              color: '#fff',
                              fontSize: '8px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: 4,
                              textTransform: 'uppercase',
                              boxShadow: '0 1px 3px rgba(245, 158, 11, 0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 2,
                            }}>
                              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                              SOBRETURNO
                            </span>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: isSobreturno ? '#78350F' : `var(--trat-${c.tratamiento}-color, ${tc.color})` }}>
                              ⏱️ {c.hora} hs
                            </span>
                            {!isSobreturno && (
                              <Badge bg={`var(--est-${c.estado}-bg, ${es.bg})`} color={`var(--est-${c.estado}-color, ${es.color})`}>
                                {es.label}
                              </Badge>
                            )}
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-dark)' }}>{c.nombre}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>🦷 {c.tratamiento}</span>
                            <span>•</span>
                            <span>⏱️ {c.duracion} min</span>
                            {c.valor && (
                              <>
                                <span>•</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-dark)' }}>💰 ${c.valor}</span>
                              </>
                            )}
                          </div>
                          {c.notas && (
                            <div style={{ 
                              fontSize: 12, 
                              color: 'var(--text-muted)', 
                              fontStyle: 'italic', 
                              background: 'var(--bg-input, rgba(0,0,0,0.02))', 
                              padding: '8px 12px', 
                              borderRadius: 10, 
                              border: '1px solid var(--border-lighter)',
                              marginTop: 4 
                            }}>
                              📝 {c.notas}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              ) : (
                <div style={{
                  minWidth: isMobile && vista === 'semana' ? '960px' : 'auto'
                }}>

                  {/* Header días */}
                  <div style={{display:'grid',gridTemplateColumns:`64px repeat(${vista==='semana'?6:1}, 1fr)`,borderBottom:'1px solid var(--border-color, #e2e8ed)',background:'var(--bg-header, rgba(255,255,255,0.4))',backdropFilter:'blur(8px)'}}>
                    <div style={{padding:'12px 0',borderRight:'1px solid var(--border-color, #e2e8ed)'}}/>
                    {(vista==='semana'?semana:[fecha]).map((f,i)=>{
                    const esHoy = f===hoy
                    const d = new Date(f+'T12:00:00')
                    const numDia = d.getDate()
                    const label = vista==='semana' ? DIAS_LABEL[i] : ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()]
                    return(
                      <div key={f} 
                        style={{
                          padding:'12px 0',
                          textAlign:'center',
                          borderRight:'1px solid var(--border-lighter, #f0f0f0)',
                          display:'flex',
                          flexDirection:'column',
                          alignItems:'center',
                          justifyContent:'center',
                          background: esHoy ? 'rgba(56, 138, 221, 0.04)' : 'transparent',
                          transition: 'background 0.2s ease',
                        }}
                      >
                        <div style={{fontSize:10,fontWeight:600,color:'var(--text-muted, #999)',textTransform:'uppercase',letterSpacing:1.5}}>{label}</div>
                        <div style={{
                          width:34,
                          height:34,
                          borderRadius:'50%',
                          background:esHoy?'linear-gradient(135deg, var(--text-dark, #0f1e2b), #185FA5)':'transparent',
                          color:esHoy?'#fff':'var(--text-dark, #1a1a1a)',
                          fontWeight:700,
                          fontSize:15,
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'center',
                          margin:'6px auto 0',
                          boxShadow: esHoy ? '0 4px 10px rgba(24, 95, 165, 0.25)' : 'none',
                          position: 'relative'
                        }}>
                          {numDia}
                          {esHoy && (
                            <span style={{
                              position:'absolute',
                              bottom:-8,
                              width:5,
                              height:5,
                              borderRadius:'50%',
                              background:'#10B981',
                              boxShadow: '0 0 8px #10B981',
                            }}/>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Grid horario */}
                <div style={{display:'grid',gridTemplateColumns:`64px repeat(${vista==='semana'?6:1}, 1fr)`,overflowY:'auto',overflowX:'hidden',maxHeight:isMobile?'calc(100vh - 184px)':'calc(100vh - 220px)'}}>

                  {/* Columna horas */}
                  <div style={{borderRight:'1px solid var(--border-color, #e2e8ed)',position:'relative',height:totalH}}>
                    {horas.map(h=>(
                      <div key={h} style={{position:'absolute',top:(h-HORA_INICIO)*SLOT_H,left:0,right:0,height:SLOT_H,borderTop:'1px solid var(--border-lighter, #f0f0f0)',paddingTop:4}}>
                        <span style={{fontSize:10,fontWeight:500,color:'var(--text-muted, #bbb)',paddingLeft:8}}>{String(h).padStart(2,'0')}:00</span>
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
                        borderRight:'1px solid var(--border-lighter, #f0f0f0)',
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
                      onMouseMove={e => {
                        if (isMobile) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        const y = e.clientY - rect.top
                        const minTot = Math.max(0, Math.floor(y / SLOT_H * 60 / 20) * 20)
                        const top = (minTot / 60) * SLOT_H
                        const h = Math.floor(minTot / 60) + HORA_INICIO
                        const m = minTot % 60
                        const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
                        setHoverSlot({ f, top, timeStr })
                      }}
                      onMouseLeave={() => {
                        setHoverSlot(null)
                      }}
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
                        if (isMobile) {
                          openNueva(f, hStr)
                        } else {
                          setMenuPos({x:e.changedTouches[0].clientX, y:e.changedTouches[0].clientY, f, h:hStr})
                        }
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
                        if (isMobile) {
                          openNueva(f, hStr)
                        } else {
                          setMenuPos({x:e.clientX, y:e.clientY, f, h:hStr})
                        }
                      }}>
                      {/* Línea de guía de hover */}
                      {hoverSlot && hoverSlot.f === f && (
                        <div style={{
                          position: 'absolute',
                          top: hoverSlot.top,
                          left: 0,
                          right: 0,
                          height: 1,
                          borderTop: '1.5px dashed var(--text-muted, #185FA5)',
                          background: 'rgba(24, 95, 165, 0.02)',
                          zIndex: 6,
                          pointerEvents: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFFecha(hoverSlot.f)
                              setFHora(hoverSlot.timeStr)
                              setFTrat('Consulta')
                              setFEst('pendiente')
                              setFDur(30)
                              setFNotas('')
                              setFValor('')
                              setFSena('')
                              setFMedioPago('Efectivo')
                              setSel(null)
                              setModal('nueva')
                            }}
                            style={{
                              pointerEvents: 'auto',
                              cursor: 'pointer',
                              background: 'var(--text-dark, #0a1e3d)',
                              color: 'var(--bg-app, #fff)',
                              border: 'none',
                              borderRadius: '50%',
                              width: 22,
                              height: 22,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 14,
                              fontWeight: 'bold',
                              boxShadow: '0 3px 8px rgba(10,30,61,0.25)',
                              transform: 'translateY(-11px)',
                              transition: 'all 0.2s ease',
                            }}
                            className="quick-action-btn"
                            title={`Agendar a las ${hoverSlot.timeStr}`}
                          >
                            +
                          </button>
                        </div>
                      )}
                      {/* Líneas de hora */}
                      {horas.map(h=>(
                        <div key={h} style={{position:'absolute',top:(h-HORA_INICIO)*SLOT_H,left:0,right:0,height:SLOT_H,borderTop:'1px dashed var(--border-lighter, #f5f5f5)'}}/>
                      ))}
                      {/* Slots ocupados */}
                      {(()=>{
                        const mins = new Set<number>()
                        citasF.forEach(c=>{ for(let m=c.minutos;m<c.minutos+c.duracion;m+=30) mins.add(m) })
                        return Array.from({length:(HORA_FIN-HORA_INICIO)*2},(_,i)=>{
                          const minTot = HORA_INICIO*60+i*30
                          return mins.has(minTot)
                            ? <div key={i} style={{position:'absolute',top:(minTot-HORA_INICIO*60)/60*SLOT_H,left:0,right:0,height:SLOT_H/2,background:'rgba(240, 244, 248, 0.25)'}}/>
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
                            style={{position:'absolute',top,left:2,right:2,height:Math.max(height-2,18),background:'repeating-linear-gradient(45deg, var(--border-light, #e0e0e0), var(--border-light, #e0e0e0) 4px, var(--bg-card, #f0f0f0) 4px, var(--bg-card, #f0f0f0) 8px)',borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',padding:'0 8px',zIndex:1}}>
                            <span style={{fontSize:10,fontWeight:600,color:'var(--text-muted, #888)'}}>🚫 {b.motivo||'Bloqueado'} {b.hora_inicio.slice(0,5)}–{b.hora_fin.slice(0,5)}</span>
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
                        const hCard = citaHeight(c) - 4

                        const bgVar = isOrtodoncia ? undefined : `var(--trat-${c.tratamiento}-bg, ${tc.bg})`
                        const colorVar = isSobreturno ? 'var(--text-dark)' : `var(--trat-${c.tratamiento}-color, ${tc.color})`
                        const borderLeftColor = isSobreturno ? '#EF9F27' : `var(--trat-${c.tratamiento}-border, ${tc.dot})`

                        return(
                          <div key={c.id} data-cita="1"
                            onClick={e=>{e.stopPropagation();setSel(c);setModal('detalle')}}
                            draggable
                            onDragStart={e => handleDragStart(e, c)}
                            onDragEnd={() => setDraggedCitaId(null)}
                            className={`agenda-card-interactive ${isOrtodoncia ? 'glow-card-ortodoncia' : ''} ${isSobreturno ? 'sobreturno-card' : ''}`}
                            style={{
                              position:'absolute',
                              top:citaTop(c)+2,
                              left: cardLeft,
                              width: cardWidth,
                              height:hCard,
                              background: isOrtodoncia ? undefined : bgVar,
                              borderLeft: `4px solid ${borderLeftColor}`,
                              borderTop: isSobreturno ? undefined : '1px solid var(--border-light, rgba(0,0,0,0.03))',
                              borderRight: isSobreturno ? undefined : '1px solid var(--border-light, rgba(0,0,0,0.03))',
                              borderBottom: isSobreturno ? undefined : '1px solid var(--border-light, rgba(0,0,0,0.03))',
                              borderRadius:12,
                              padding:isMobile ? (isSobreturno ? '2px 4px' : '4px 6px') : '5px 8px',
                              overflow:'hidden',
                              cursor:'pointer',
                              zIndex: isSobreturno ? 2 : 1,
                              boxShadow: isOrtodoncia ? undefined : '0 2px 6px rgba(10,30,61,0.04)',
                              opacity: isDragging ? 0.4 : 1,
                              ['--hover-glow' as any]: isSobreturno ? 'rgba(239, 159, 39, 0.25)' : `var(--trat-${c.tratamiento}-border, ${tc.dot})35`,
                            } as React.CSSProperties}>
                            
                            {!isMobile && isSobreturno && (
                              <span style={{
                                position: 'absolute',
                                top: 2,
                                right: 2,
                                background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                                color: '#fff',
                                fontSize: '7.5px',
                                fontWeight: 800,
                                padding: '1px 4px',
                                borderRadius: 4,
                                textTransform: 'uppercase',
                                boxShadow: '0 1px 3px rgba(245, 158, 11, 0.3)',
                                zIndex: 10,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2,
                              }}>
                                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                                SOBRETURNO
                              </span>
                            )}

                            {isMobile ? (
                              <>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                  <span style={{fontSize:10,fontWeight:800,color:isSobreturno ? '#B45309' : colorVar,lineHeight:1}}>{c.hora}</span>
                                  <span style={{
                                    width:6,
                                    height:6,
                                    borderRadius:'50%',
                                    background:`var(--est-${c.estado}-color, ${es.color})`,
                                    boxShadow: `0 0 4px var(--est-${c.estado}-color, ${es.color})`,
                                    flexShrink:0
                                  }}/>
                                </div>
                                <div style={{
                                  fontSize: isMobile ? (isSobreturno ? 10.5 : 12) : 12,
                                  fontWeight: 700,
                                  color: isSobreturno ? '#78350F' : colorVar,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: isMobile && isSobreturno && hCard < 50 ? 1 : 2,
                                  WebkitBoxOrient: 'vertical',
                                  whiteSpace: isMobile && isSobreturno && hCard < 50 ? 'nowrap' : 'normal',
                                  lineHeight: 1.1,
                                  marginTop: 2
                                }}>{c.nombre}</div>
                                {hCard>60&&<div style={{fontSize:9.5,color:colorVar,opacity:0.8,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>🦷 {c.tratamiento}</div>}
                              </>
                            ) : (
                              <>
                                {hCard <= 30 ? (
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    color: isSobreturno ? '#78350F' : colorVar,
                                    height: '100%',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}>
                                    <span style={{fontWeight: 800, opacity: 0.85}}>{c.hora}</span>
                                    <span style={{opacity: 0.5}}>•</span>
                                    <span style={{textOverflow: 'ellipsis', overflow: 'hidden'}}>{c.nombre}</span>
                                    <span style={{opacity: 0.5}}>•</span>
                                    <span style={{fontSize: 9, fontWeight: 500, opacity: 0.8}}>{c.tratamiento}</span>
                                  </div>
                                ) : hCard <= 48 ? (
                                  <>
                                    <div style={{fontSize: 11, fontWeight: 700, color: isSobreturno ? '#78350F' : colorVar, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2}}>
                                      <span style={{fontWeight: 800, marginRight: 4}}>{c.hora}</span>
                                      {c.nombre}
                                    </div>
                                    <div style={{fontSize: 9, color: isSobreturno ? '#B45309' : colorVar, opacity: 0.8, marginTop: 1, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                      <span>{c.tratamiento}</span>
                                      <span>•</span>
                                      <span>{c.duracion}m</span>
                                      {c.valor && (
                                        <>
                                          <span>•</span>
                                          <span style={{fontWeight: 600}}>${c.valor}</span>
                                        </>
                                      )}
                                    </div>
                                    
                                    {/* Action Buttons for 60-min cards (which are height 44px on desktop/mobile) */}
                                    {hCard >= 44 && (c.estado === 'pendiente' || c.estado === 'confirmado') && (
                                      <div style={{marginTop: 5, display: 'flex', gap: 4, width: '100%', position: 'relative', zIndex: 10}} onClick={e => e.stopPropagation()}>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); cambiarEstado(c.id, 'asistio') }}
                                          style={{ flex: 1, border: 'none', background: '#E1F5EE', color: '#085041', borderRadius: 6, padding: '2px 4px', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s' }}
                                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                        >
                                          ✓ Asistió
                                        </button>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); cambiarEstado(c.id, 'cancelado') }}
                                          style={{ flex: 1, border: 'none', background: '#FAECE7', color: '#712B13', borderRadius: 6, padding: '2px 4px', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s' }}
                                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                        >
                                          ✗ Faltó
                                        </button>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div style={{fontSize: 11.5, fontWeight: 700, color: isSobreturno ? '#78350F' : colorVar, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                      <div style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                        <span style={{fontWeight: 800, marginRight: 4}}>{c.hora}</span>
                                        {c.nombre}
                                      </div>
                                      <span style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: `var(--est-${c.estado}-color, ${es.color})`,
                                        boxShadow: `0 0 6px var(--est-${c.estado}-color, ${es.color})`,
                                        flexShrink: 0
                                      }}/>
                                    </div>
                                    <div style={{fontSize: 9.5, color: isSobreturno ? '#B45309' : colorVar, opacity: 0.85, marginTop: 2, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap'}}>
                                      <span style={{display: 'flex', alignItems: 'center', gap: 2}}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
                                        {c.tratamiento}
                                      </span>
                                      <span>•</span>
                                      <span>{c.duracion} min</span>
                                      {c.valor && (
                                        <>
                                          <span>•</span>
                                          <span style={{fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1}}>
                                            💰 ${c.valor}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                    
                                    {/* Action Buttons or Badge for large cards */}
                                    <div style={{marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between', width: '100%'}}>
                                      {(c.estado === 'pendiente' || c.estado === 'confirmado') ? (
                                        <div style={{display: 'flex', gap: 4, width: '100%', position: 'relative', zIndex: 10}} onClick={e => e.stopPropagation()}>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); cambiarEstado(c.id, 'asistio') }}
                                            style={{ flex: 1, border: 'none', background: '#E1F5EE', color: '#085041', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, transition: 'transform 0.1s' }}
                                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                          >
                                            ✓ Asistió
                                          </button>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); cambiarEstado(c.id, 'cancelado') }}
                                            style={{ flex: 1, border: 'none', background: '#FAECE7', color: '#712B13', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, transition: 'transform 0.1s' }}
                                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                          >
                                            ✗ Faltó
                                          </button>
                                        </div>
                                      ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', width: '100%', position: 'relative', zIndex: 10 }}>
                                          <Badge bg={`var(--est-${c.estado}-bg, ${es.bg})`} color={`var(--est-${c.estado}-color, ${es.color})`}>
                                            {es.label}
                                          </Badge>
                                          {c.estado === 'asistio' && !c.precio_cobrado && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                openCobroExpress(c)
                                              }}
                                              style={{ border: 'none', background: '#138A6B', color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, transition: 'transform 0.1s' }}
                                              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
                                              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                            >
                                              💰 Cobrar
                                            </button>
                                          )}
                                          {hCard > 68 && c.notas && (
                                            <span style={{fontSize: 8.5, color: isSobreturno ? '#B45309' : colorVar, opacity: 0.6, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%'}} title={c.notas}>
                                              📝 {c.notas}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
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
              )
            }
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
                let msgText = tenant?.whatsappTemplate || ''
                msgText = msgText.replace(/\\n/g, '\n')
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
              {sel.estado==='asistio'&&!sel.precio_cobrado&&(
                <button style={{...btnDarkCss,background:'#138A6B',borderColor:'#138A6B',color:'#fff'}} onClick={()=>openCobroExpress(sel)}>💰 Cobrar</button>
              )}
              <button style={btnDarkCss} onClick={()=>{setModal(null);setTimeout(()=>openEditar(sel),50)}}>Editar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nueva (Unified slide-in drawer component) */}
      {modal==='nueva'&&(
        <NuevaCitaModal
          onClose={()=>setModal(null)}
          onSuccess={()=>{loadCitas()}}
          defaultFecha={fFecha}
          defaultHora={fHora}
        />
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
      {menuPos&&(()=> {
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
      {/* Modal cobrar */}
      {modal==='cobrar'&&sel&&(
        <div style={overlayCss(isMobile)} onClick={()=>setModal(null)}>
          <div style={{...modalCss(isMobile),maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={modalTitleCss}>Registrar cobro</div>
            <div style={groupCss}>
              <label style={labelCss}>Concepto</label>
              <input type="text" style={{...selectCss}} value={cobConcepto} onChange={e=>setCobConcepto(e.target.value)}/>
            </div>
            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Monto ($)</label>
                <input type="number" style={{...selectCss}} value={cobMonto} onChange={e=>setCobMonto(e.target.value===''?'':Number(e.target.value))} placeholder="0"/>
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Fecha</label>
                <input type="date" style={{...selectCss}} value={cobFecha} onChange={e=>setCobFecha(e.target.value)}/>
              </div>
            </div>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={()=>setModal(null)} disabled={guardandoCobro}>Cancelar</button>
              <button style={{...btnDarkCss,opacity:guardandoCobro?0.6:1}} onClick={guardarCobroExpress} disabled={guardandoCobro}>
                {guardandoCobro?'Registrando...':'Confirmar cobro'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Pre-agendamiento */}
      {propuestaProximaCita && (
        <div style={overlayCss(isMobile)} onClick={() => setPropuestaProximaCita(null)}>
          <div style={{...modalCss(isMobile), maxWidth: 440, padding: '24px 20px'}} onClick={e => e.stopPropagation()}>
            <div style={{...modalTitleCss, textAlign: 'center', marginBottom: 12}}>
              🔄 Pre-agendar Próxima Visita
            </div>
            
            <p style={{fontSize: 14, color: 'var(--text-dark, #0a1e3d)', textAlign: 'center', marginBottom: 20, lineHeight: 1.5}}>
              ¿Querés pre-agendar el próximo control para <strong>{propuestaProximaCita.nombre}</strong>?
              <br />
              <span style={{fontSize: 12, color: 'var(--text-muted, #8fa3bc)'}}>
                Tratamiento: {propuestaProximaCita.tratamiento} ({propuestaProximaCita.duracion} min)
              </span>
            </p>

            {/* Opciones de un click */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20}}>
              {(() => {
                const date3Weeks = new Date(propuestaProximaCita.fecha + 'T12:00:00')
                date3Weeks.setDate(date3Weeks.getDate() + 21)
                const fFecha3 = date3Weeks.toISOString().split('T')[0]

                const date4Weeks = new Date(propuestaProximaCita.fecha + 'T12:00:00')
                date4Weeks.setDate(date4Weeks.getDate() + 28)
                const fFecha4 = date4Weeks.toISOString().split('T')[0]

                return (
                  <>
                    <button
                      onClick={() => agendarPropuesta(fFecha3)}
                      disabled={guardandoPropuesta}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        border: `1px solid ${tenant?.secondaryColor || '#185FA5'}40`,
                        background: `linear-gradient(135deg, ${(tenant?.secondaryColor || '#185FA5')}08, ${(tenant?.secondaryColor || '#185FA5')}18)`,
                        color: tenant?.secondaryColor || '#185FA5',
                        fontWeight: 700,
                        fontSize: 13.5,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'transform 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.01)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <span>📅 En 3 semanas</span>
                      <span style={{fontSize: 12, opacity: 0.9}}>{formatFechaPropuesta(fFecha3)} · {propuestaProximaCita.hora}hs</span>
                    </button>

                    <button
                      onClick={() => agendarPropuesta(fFecha4)}
                      disabled={guardandoPropuesta}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        border: `1px solid ${tenant?.secondaryColor || '#185FA5'}40`,
                        background: `linear-gradient(135deg, ${(tenant?.secondaryColor || '#185FA5')}08, ${(tenant?.secondaryColor || '#185FA5')}18)`,
                        color: tenant?.secondaryColor || '#185FA5',
                        fontWeight: 700,
                        fontSize: 13.5,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'transform 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.01)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <span>📅 En 4 semanas</span>
                      <span style={{fontSize: 12, opacity: 0.9}}>{formatFechaPropuesta(fFecha4)} · {propuestaProximaCita.hora}hs</span>
                    </button>
                  </>
                )
              })()}
            </div>

            <div style={{...footerCss, justifyContent: 'center'}}>
              <button
                style={{...btnLightCss, width: '100%', padding: '12px'}}
                onClick={() => setPropuestaProximaCita(null)}
                disabled={guardandoPropuesta}
              >
                No pre-agendar próximo control
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: WhatsApp Confirmation */}
      {whatsappCita && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,61,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: 16 }}>
          <div className="slide-up" style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 360, overflow: 'hidden', boxShadow: '0 20px 40px rgba(10,30,61,0.15)', padding: '2rem 1.5rem', textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#E1F5EE', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, color: '#0a1e3d' }}>¡Turno agendado!</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: 14, color: '#4a6080', lineHeight: 1.5 }}>
              ¿Querés enviarle un mensaje por WhatsApp al paciente para que lo sume a su calendario?
            </p>
            
            <a
              href={`https://wa.me/${whatsappCita.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappCita.mensajeWA)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
                padding: '0.8rem 1rem', borderRadius: 12, border: 'none', background: '#25D366', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', boxShadow: '0 4px 12px rgba(37,211,102,0.25)', textDecoration: 'none', marginBottom: 12
              }}
              onClick={() => setWhatsappCita(null)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Enviar WhatsApp
            </a>
            <button 
              onClick={() => setWhatsappCita(null)}
              style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: 12, border: 'none', background: '#f4f7fb', color: '#687e96', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {toast&&<Toast msg={toast.msg} tipo={toast.tipo} isMobile={isMobile}/>}
    </div>
  )
}
