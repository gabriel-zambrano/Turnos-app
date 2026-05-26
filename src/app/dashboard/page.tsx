'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import Link from 'next/link'
import { Badge, Toast, PageHeader, FilterBar, Spinner, MetricCard, inputCss, selectCss, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss } from '@/components/UI'
import { TRAT_STYLE, ESTADO_STYLE, hoyISO, normalizarTelefono, TRATAMIENTOS } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'
import type { EstadoCita } from '@/types'
import { NuevaCitaModal } from '@/components/NuevaCitaModal'
import { triggerConfetti } from '@/lib/confetti'

interface Cita { id:string; nombre:string; hora:string; tratamiento:string; estado:EstadoCita; telefono:string; precio_cobrado?:number|null; valor?:number|null; paciente_id?:string }
interface CitaMañana extends Cita { token:string|null; fecha_hora:string }
interface LogItem { id:string; paciente:string; canal:string; estado:string; hora:string }
const FILTROS = [{k:'todas',l:'Todas'},{k:'pendiente',l:'Pendientes'},{k:'confirmado',l:'Confirmadas'},{k:'asistio',l:'Asistieron'}]

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
  const [logFiltro, setLogFiltro] = useState<'todos'|'enviado'|'fallido'>('todos')
  const [mostrarMañana, setMostrarMañana] = useState(false)
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const [toast, setToast] = useState<{msg:string;tipo:string}|null>(null)
  const [hoy, setHoy] = useState('')
  const [ahora, setAhora] = useState(() => new Date())

  // States for Quick Actions
  const [modalPaciente, setModalPaciente] = useState(false)
  const [modalCobro, setModalCobro] = useState(false)

  const [modalNuevaCita, setModalNuevaCita] = useState(false)

  // Nuevo Paciente States
  const [pacNombre, setPacNombre] = useState('')
  const [pacTelefono, setPacTelefono] = useState('+54911')
  const [pacEmail, setPacEmail] = useState('')
  const [pacNacimiento, setPacNacimiento] = useState('')
  const [pacTratamiento, setPacTratamiento] = useState('Consulta')

  // Registrar Cobro States
  const [cobConcepto, setCobConcepto] = useState('')
  const [cobMonto, setCobMonto] = useState<number | ''>('')
  const [cobFecha, setCobFecha] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const [cobCitaId, setCobCitaId] = useState<string | null>(null)

  const [guardandoAccion, setGuardandoAccion] = useState(false)

  // Heatmap & KPI metrics states
  const [selectedDate, setSelectedDate] = useState(() => hoyISO())
  const [weeklyRevenue, setWeeklyRevenue] = useState(0)
  const [weeklyCancellations, setWeeklyCancellations] = useState(0)
  const [confirmationRateChange, setConfirmationRateChange] = useState(0)
  const [heatmapData, setHeatmapData] = useState<{ dateStr: string; dayName: string; dayNum: string; count: number }[]>([])

  async function guardarNuevoPaciente() {
    if (!pacNombre.trim()) return msg('El nombre es obligatorio', 'error')
    if (!pacTelefono.startsWith('+')) return msg('El teléfono debe empezar con +', 'error')
    if (!tenant) return
    setGuardandoAccion(true)
    const token = crypto.randomUUID()
    const { error } = await supabase.from('pacientes').insert({
      nombre: pacNombre.trim(),
      telefono: pacTelefono.trim(),
      email: pacEmail.trim() || null,
      fecha_nacimiento: pacNacimiento || null,
      ultimo_tratamiento: pacTratamiento,
      token,
      tenant_id: tenant.id
    })
    setGuardandoAccion(false)
    if (error) {
      msg('Error al guardar: ' + error.message, 'error')
    } else {
      setModalPaciente(false)
      setPacNombre('')
      setPacTelefono('+54911')
      setPacEmail('')
      setPacNacimiento('')
      setPacTratamiento('Consulta')
      msg('Paciente agregado correctamente ✓')
      load()
    }
  }

  async function guardarRegistrarCobro() {
    if (!cobConcepto.trim() || cobMonto === '' || Number(cobMonto) <= 0) {
      return msg('Completá concepto y monto', 'error')
    }
    if (!tenant) return
    setGuardandoAccion(true)
    
    // 1. Insert manual income record
    const { error: errorIngreso } = await supabase.from('ingresos_manuales').insert({
      fecha: cobFecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }),
      concepto: cobConcepto.trim(),
      monto: Number(cobMonto),
      tenant_id: tenant.id
    })

    // 2. If linked to appointment, update precio_cobrado
    let errorCita = null
    if (cobCitaId) {
      const { error: errCita } = await supabase
        .from('citas')
        .update({
          precio_cobrado: Number(cobMonto),
          estado: 'asistio'
        })
        .eq('id', cobCitaId)
      errorCita = errCita
    }

    setGuardandoAccion(false)
    if (errorIngreso || errorCita) {
      msg('Error al registrar cobro: ' + (errorIngreso?.message || errorCita?.message), 'error')
    } else {
      setModalCobro(false)
      setCobConcepto('')
      setCobMonto('')
      setCobCitaId(null)
      setCobFecha(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))
      msg('Cobro registrado correctamente ✓')
      triggerConfetti()
      load()
    }
  }

  useEffect(()=>{
    setHoy(new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'}))
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('nueva') === 'true') {
        setModalNuevaCita(true)
        const newUrl = window.location.pathname
        window.history.replaceState({}, '', newUrl)
      }
    }
  },[])

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  function msg(m:string,tipo='ok'){setToast({msg:m,tipo});setTimeout(()=>setToast(null),3500)}

  const getMonday = (d: Date) => {
    const date = new Date(d)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(date.setDate(diff))
  }

  const load = useCallback(async()=>{
    if (!tenant) return
    setLoading(true)
    
    // Dates for 28-day window (Monday of last week to Sunday of next week)
    const nowLocal = new Date()
    const currentMon = getMonday(nowLocal)
    const prevMon = new Date(currentMon)
    prevMon.setDate(currentMon.getDate() - 7)
    const nextSun = new Date(currentMon)
    nextSun.setDate(currentMon.getDate() + 13)

    const prevMonISO = prevMon.toISOString().split('T')[0]
    const nextSunISO = nextSun.toISOString().split('T')[0]

    // Fetch treatments for price fallbacks
    const { data: tratsData } = await supabase.from('tratamientos').select('nombre, precio_base').eq('tenant_id', tenant.id)
    const priceMap: Record<string, number> = {
      'Consulta': 50000,
      'Limpieza': 70000,
      'Ortodoncia': 120000,
      'Blanqueamiento': 150000,
      'Extracción': 80000,
      'Caries': 60000,
      'Implante': 450000,
      'Cirugia': 300000,
      'Endodoncia': 140000,
      'Otro': 50000
    }
    if (tratsData) {
      tratsData.forEach(t => {
        if (t.precio_base) priceMap[t.nombre] = t.precio_base
      })
    }

    // Fetch appointments in range
    const { data: rawCitas, error } = await supabase
      .from('citas')
      .select('id, tipo_tratamiento, estado, fecha_hora, valor, precio_cobrado, paciente_id, pacientes(nombre, telefono, token)')
      .eq('tenant_id', tenant.id)
      .gte('fecha_hora', `${prevMonISO}T00:00:00-03:00`)
      .lte('fecha_hora', `${nextSunISO}T23:59:59-03:00`)
      .order('fecha_hora', { ascending: true })

    if (error) {
      msg('Error: ' + error.message, 'error')
      setLoading(false)
      return
    }

    const allCitas = rawCitas || []
    const toLocalDateStr = (isoStr: string) => {
      return new Date(isoStr).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    }

    // Active list for selectedDate
    const filteredCitas = allCitas.filter(c => toLocalDateStr(c.fecha_hora) === selectedDate)
    setCitas(filteredCitas.map(c => {
      const pac = Array.isArray(c.pacientes) ? c.pacientes[0] : c.pacientes
      return {
        id: c.id,
        nombre: pac?.nombre ?? '—',
        telefono: pac?.telefono ?? '—',
        hora: new Date(c.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }),
        tratamiento: c.tipo_tratamiento,
        estado: c.estado as EstadoCita,
        precio_cobrado: c.precio_cobrado,
        valor: c.valor,
        paciente_id: c.paciente_id
      }
    }))

    // Tomorrow list
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowISO = tomorrow.toISOString().split('T')[0]
    const tomorrowCitas = allCitas.filter(c => toLocalDateStr(c.fecha_hora) === tomorrowISO)
    setCitasMañana(tomorrowCitas.map(c => {
      const pac = Array.isArray(c.pacientes) ? c.pacientes[0] : c.pacientes
      return {
        id: c.id,
        nombre: pac?.nombre ?? '—',
        telefono: pac?.telefono ?? '—',
        hora: new Date(c.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }),
        tratamiento: c.tipo_tratamiento,
        estado: c.estado as EstadoCita,
        token: pac?.token ?? null,
        fecha_hora: c.fecha_hora
      }
    }))

    // Current week calculations
    const currentMonTime = new Date(currentMon.setHours(0,0,0,0)).getTime()
    const currentSunTime = new Date(currentMon.getTime() + 7 * 86400000 - 1000).getTime()
    const citasCurrentWeek = allCitas.filter(c => {
      const t = new Date(c.fecha_hora).getTime()
      return t >= currentMonTime && t <= currentSunTime
    })

    let rev = 0
    citasCurrentWeek.forEach(c => {
      if (c.estado !== 'cancelado') {
        rev += c.precio_cobrado ?? c.valor ?? priceMap[c.tipo_tratamiento] ?? 50000
      }
    })
    setWeeklyRevenue(rev)

    const cancels = citasCurrentWeek.filter(c => c.estado === 'cancelado').length
    setWeeklyCancellations(cancels)

    const currentWeekTotal = citasCurrentWeek.length
    const currentWeekConf = citasCurrentWeek.filter(c => c.estado === 'confirmado' || c.estado === 'asistio').length
    const currentWeekRate = currentWeekTotal > 0 ? (currentWeekConf / currentWeekTotal) * 100 : 0

    // Previous week confirmation rate
    const prevMonTime = new Date(prevMon.setHours(0,0,0,0)).getTime()
    const prevSunTime = new Date(prevMonTime + 7 * 86400000 - 1000).getTime()
    const citasPrevWeek = allCitas.filter(c => {
      const t = new Date(c.fecha_hora).getTime()
      return t >= prevMonTime && t <= prevSunTime
    })
    const prevWeekTotal = citasPrevWeek.length
    const prevWeekConf = citasPrevWeek.filter(c => c.estado === 'confirmado' || c.estado === 'asistio').length
    const prevWeekRate = prevWeekTotal > 0 ? (prevWeekConf / prevWeekTotal) * 100 : 0

    setConfirmationRateChange(Math.round(currentWeekRate - prevWeekRate))

    // Heatmap data
    const hData = []
    const weekDaysShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      const dISO = d.toISOString().split('T')[0]
      const count = allCitas.filter(c => toLocalDateStr(c.fecha_hora) === dISO && c.estado !== 'cancelado').length
      hData.push({
        dateStr: dISO,
        dayName: weekDaysShort[d.getDay()],
        dayNum: String(d.getDate()),
        count
      })
    }
    setHeatmapData(hData)

    setLoading(false)
  },[tenant, selectedDate])

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

  const getSaludo = () => {
    const hrs = ahora.getHours()
    if (hrs < 12) return '¡Buenos días'
    if (hrs < 20) return '¡Buenas tardes'
    return '¡Buenas noches'
  }

  const parseTimeToMin = (tStr: string) => {
    const [h, m] = tStr.split(':').map(Number)
    return h * 60 + m
  }

  // Workload counts by treatment
  const desgloseTratamientos = citas.reduce((acc, c) => {
    acc[c.tratamiento] = (acc[c.tratamiento] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Find next up patient today (must be in the future relative to ahora)
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes()
  const upcomingCitas = citas
    .filter(c => parseTimeToMin(c.hora) > ahoraMin)
    .sort((a, b) => parseTimeToMin(a.hora) - parseTimeToMin(b.hora))
  
  const nextCita = upcomingCitas[0] || null
  const minDiff = nextCita ? parseTimeToMin(nextCita.hora) - ahoraMin : 0
  const tiempoRestante = minDiff < 60 ? `en ${minDiff} min` : `en ${Math.floor(minDiff/60)}h ${minDiff%60}m`

  // Horario blocks
  const bM = citas.filter(c => { const m = parseTimeToMin(c.hora); return m >= 8*60 && m < 12*60 }).length
  const bMD = citas.filter(c => { const m = parseTimeToMin(c.hora); return m >= 12*60 && m < 16*60 }).length
  const bT = citas.filter(c => { const m = parseTimeToMin(c.hora); return m >= 16*60 && m < 20*60 }).length
  const bMax = Math.max(bM, bMD, bT, 1)

  const logsFiltrados = logFiltro === 'todos' ? logs : logs.filter(l => l.estado === logFiltro)

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

  if (!authChecked || tenantLoading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-page,#f0f4f8)',fontFamily:'DM Sans, sans-serif'}}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span style={{fontSize:13,color:'#8fa3bc',fontWeight:500}}>Cargando...</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const primaryColor = tenant?.primaryColor || '#0a1e3d'
  const secondaryColor = tenant?.secondaryColor || '#185FA5'
  const accentColor = tenant?.accentColor || '#138A6B'

  return (
    <div style={{display:'flex',minHeight:'100vh',fontFamily:'DM Sans, sans-serif'}}>
      <Sidebar pendientes={pend}/>
      <main style={{marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)',flex:1,background:'transparent',paddingBottom:isMobile?90:0,minWidth:0,overflowX:'hidden'}}>
        <PageHeader title="Dashboard" sub={hoy}
          right={<span style={{fontSize:isMobile?11:12,padding:'5px 12px',borderRadius:6,fontWeight:700,background:`${accentColor}20`,color:accentColor}}>Tasa: {tasa}%</span>}
        />
        <div style={{padding:isMobile?'1rem':'1.75rem 2rem',maxWidth:1100}}>
          
          {/* Welcome Banner, Workload Distribution and Quick Actions */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.7fr 1fr 1.3fr',
            gap: 16,
            marginBottom: '1.5rem'
          }}>
            {/* Greeting Card */}
            <div className="glass-container" style={{
              padding: '1.4rem 1.6rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
              background: `linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.6))`
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: `linear-gradient(180deg, ${secondaryColor}, ${accentColor})` }}/>
              <div>
                <h2 style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800, color: primaryColor, marginBottom: 6 }}>
                  {getSaludo()}, {tenant?.nombre.split(' ')[0] || 'Doctor'}!
                </h2>
                <p style={{ fontSize: 13, color: '#687e96', lineHeight: 1.4 }}>
                  {citas.length > 0 
                    ? `Hoy tenés ${citas.length} turnos agendados en total.`
                    : 'No tenés citas agendadas para el día de hoy.'
                  }
                </p>
              </div>
              
              {citas.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(desgloseTratamientos).map(([trat, count]) => {
                    const tc = TRAT_STYLE[trat] || TRAT_STYLE.Consulta
                    return (
                      <span key={trat} style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 20,
                        background: tc.bg,
                        color: tc.color,
                        border: `1px solid ${tc.dot}20`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: tc.dot }}/>
                        {trat}: {count}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Peak Hours Visualizer Chart */}
            <div className="glass-container" style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7a8f9d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Distribución Horaria
              </div>
              
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 75, gap: 10, padding: '0 8px' }}>
                {/* Block 1 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: '100%',
                    height: `${(bM / bMax) * 50}px`,
                    background: `linear-gradient(180deg, ${secondaryColor}, ${secondaryColor}66)`,
                    borderRadius: '4px 4px 0 0',
                    minHeight: bM > 0 ? 4 : 0,
                    transition: 'height 0.3s ease'
                  }}/>
                  <span style={{ fontSize: 9, fontWeight: 700, color: primaryColor }}>Mañana</span>
                </div>
                {/* Block 2 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: '100%',
                    height: `${(bMD / bMax) * 50}px`,
                    background: `linear-gradient(180deg, ${accentColor}, ${accentColor}66)`,
                    borderRadius: '4px 4px 0 0',
                    minHeight: bMD > 0 ? 4 : 0,
                    transition: 'height 0.3s ease'
                  }}/>
                  <span style={{ fontSize: 9, fontWeight: 700, color: primaryColor }}>Tarde</span>
                </div>
                {/* Block 3 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: '100%',
                    height: `${(bT / bMax) * 50}px`,
                    background: `linear-gradient(180deg, ${primaryColor}, ${primaryColor}66)`,
                    borderRadius: '4px 4px 0 0',
                    minHeight: bT > 0 ? 4 : 0,
                    transition: 'height 0.3s ease'
                  }}/>
                  <span style={{ fontSize: 9, fontWeight: 700, color: primaryColor }}>Noche</span>
                </div>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="glass-container" style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7a8f9d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Acciones Rápidas
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>
                
                {/* Agendar Turno */}
                <button onClick={() => setModalNuevaCita(true)} style={{ textDecoration: 'none', background: 'none', border: 'none', padding: 0, width: '100%', cursor: 'pointer' }}>
                  <div className="quick-action-btn" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 4px',
                    borderRadius: 12,
                    background: `${secondaryColor}10`,
                    border: `1px solid ${secondaryColor}25`,
                    color: secondaryColor,
                    cursor: 'pointer',
                    height: '100%',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                    gap: 6
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                      <line x1="12" y1="14" x2="12" y2="20" />
                      <line x1="9" y1="17" x2="15" y2="17" />
                    </svg>
                    <span style={{ fontSize: 10.5, fontWeight: 700 }}>Agendar Turno</span>
                  </div>
                </button>

                {/* Nuevo Paciente */}
                <div onClick={() => {
                  setPacNombre('')
                  setPacTelefono('+54911')
                  setPacEmail('')
                  setPacNacimiento('')
                  setPacTratamiento('Consulta')
                  setModalPaciente(true)
                }} className="quick-action-btn" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 4px',
                  borderRadius: 12,
                  background: `${primaryColor}10`,
                  border: `1px solid ${primaryColor}25`,
                  color: primaryColor,
                  cursor: 'pointer',
                  height: '100%',
                  boxSizing: 'border-box',
                  textAlign: 'center',
                  gap: 6
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="16" y1="11" x2="22" y2="11" />
                  </svg>
                  <span style={{ fontSize: 10.5, fontWeight: 700 }}>Nuevo Paciente</span>
                </div>

                {/* Registrar Cobro */}
                <div onClick={() => {
                  setCobConcepto('')
                  setCobMonto('')
                  setCobFecha(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))
                  setModalCobro(true)
                }} className="quick-action-btn" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 4px',
                  borderRadius: 12,
                  background: `${accentColor}10`,
                  border: `1px solid ${accentColor}25`,
                  color: accentColor,
                  cursor: 'pointer',
                  height: '100%',
                  boxSizing: 'border-box',
                  textAlign: 'center',
                  gap: 6
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                  <span style={{ fontSize: 10.5, fontWeight: 700 }}>Registrar Cobro</span>
                </div>

                {/* Ver Agenda */}
                <Link href="/agenda" style={{ textDecoration: 'none' }}>
                  <div className="quick-action-btn" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 4px',
                    borderRadius: 12,
                    background: '#f0f4f8',
                    border: '1px solid #dde5ef',
                    color: '#687e96',
                    cursor: 'pointer',
                    height: '100%',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                    gap: 6
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span style={{ fontSize: 10.5, fontWeight: 700 }}>Ver Agenda</span>
                  </div>
                </Link>

              </div>
            </div>
          </div>

          {/* 7-Day Heatmap (Workload Density Calendar Selector) */}
          <div className="glass-container" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: primaryColor }}>Carga de Turnos (Próximos 7 días)</span>
              <span style={{ fontSize: 11, color: '#8fa3bc' }}>Haz clic para ver la agenda de ese día</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
              {heatmapData.map(d => {
                const isSelected = selectedDate === d.dateStr
                const isToday = hoyISO() === d.dateStr
                
                // Color density scale
                let bg = 'transparent'
                let border = '1px solid var(--border-light, #dde5ef)'
                let text = 'var(--text-dark, #0a1e3d)'
                
                if (d.count > 0) {
                  if (d.count <= 2) {
                    bg = `${secondaryColor}15`
                    border = `1px solid ${secondaryColor}30`
                    text = secondaryColor
                  } else if (d.count <= 5) {
                    bg = `${secondaryColor}35`
                    border = `1px solid ${secondaryColor}60`
                    text = primaryColor
                  } else {
                    bg = secondaryColor
                    border = `1px solid ${secondaryColor}`
                    text = '#fff'
                  }
                }
                
                if (isSelected) {
                  border = `2.5px solid ${accentColor}`
                }

                return (
                  <button
                    key={d.dateStr}
                    onClick={() => setSelectedDate(d.dateStr)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      padding: '8px 4px',
                      borderRadius: 12,
                      background: bg,
                      border: border,
                      color: text,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', opacity: d.count > 5 ? 0.9 : 0.6 }}>{d.dayName}</span>
                    <span style={{ fontSize: 16, fontWeight: 800 }}>{d.dayNum}</span>
                    {d.count > 0 && (
                      <span style={{ 
                        fontSize: 9, 
                        fontWeight: 700, 
                        background: d.count > 5 ? '#fff' : secondaryColor, 
                        color: d.count > 5 ? secondaryColor : '#fff',
                        padding: '1px 5px', 
                        borderRadius: 8,
                        marginTop: 2
                      }}>
                        {d.count}
                      </span>
                    )}
                    {isToday && !isSelected && (
                      <span style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: '50%', background: accentColor }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(4,1fr)',gap:12,marginBottom:'1.5rem'}}>
            <MetricCard label="Citas del día" value={loading?'…':citas.length} sub={`Confirmadas: ${conf}`} accent={primaryColor}/>
            <MetricCard label="Revenue estimado sem" value={loading?'…':`$${weeklyRevenue.toLocaleString('es-AR')}`} sub="Esta semana (Lun-Dom)" accent={accentColor}/>
            <MetricCard label="Cancelaciones sem" value={loading?'…':weeklyCancellations} sub="Esta semana" accent={secondaryColor}/>
            <MetricCard label="Variación tasa sem" value={loading?'…':(confirmationRateChange >= 0 ? `+${confirmationRateChange}%` : `${confirmationRateChange}%`)} sub="vs semana anterior" accent={confirmationRateChange>=0?accentColor:'#D85A30'}/>
          </div>

          {/* Next Up Patient Alert */}
          {nextCita && (
            <div className="glass-container progress-glow" style={{
              padding: '0.9rem 1.25rem',
              marginBottom: '1.5rem',
              background: `linear-gradient(135deg, ${accentColor}06, ${secondaryColor}06)`,
              border: `1px solid ${secondaryColor}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              '--glow-color': `${secondaryColor}10`
            } as React.CSSProperties}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Pulsing Dot */}
                <span className="pulse-indicator" style={{ display: 'flex', position: 'relative', width: 8, height: 8 }}>
                  <span style={{ animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite', position: 'absolute', display: 'inline-flex', height: '100%', width: '100%', borderRadius: '50%', background: accentColor, opacity: 0.75 }}></span>
                  <span style={{ position: 'relative', display: 'inline-flex', borderRadius: '50%', height: 8, width: 8, background: accentColor }}></span>
                </span>
                <div style={{ fontSize: 13, fontWeight: 500, color: primaryColor }}>
                  Próxima cita en agenda: <strong style={{ fontWeight: 700 }}>{nextCita.nombre}</strong> a las <strong style={{ color: secondaryColor }}>{nextCita.hora} hs</strong> ({nextCita.tratamiento})
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, background: `${accentColor}15`, padding: '3px 8px', borderRadius: 20 }}>
                  {tiempoRestante}
                </span>
                {nextCita.telefono && (
                  <button onClick={() => {
                    const txt = encodeURIComponent(`Hola ${nextCita.nombre}, te recordamos tu turno hoy a las ${nextCita.hora}hs.`)
                    window.open(`https://wa.me/${normalizarTelefono(nextCita.telefono)}?text=${txt}`, '_blank')
                  }} className="btn-premium" style={{
                    background: '#25D366',
                    border: 'none',
                    borderRadius: 8,
                    padding: '4px 10px',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    WhatsApp
                  </button>
                )}
              </div>
            </div>
          )}

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
                <span style={{fontWeight:700,fontSize:14,color:primaryColor}}>
                  {selectedDate === hoyISO() ? 'Citas de hoy' : `Citas del ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
                </span>
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
                          
                          {c.estado === 'pendiente' && (
                            <>
                              <button onClick={()=>confirmar(c.id)} className="btn-premium" style={{fontSize:11,padding:'4px 10px',borderRadius:7,border:`1.5px solid ${accentColor}`,background:`${accentColor}18`,color:accentColor,cursor:'pointer',fontWeight:600,fontFamily:'DM Sans, sans-serif',whiteSpace:'nowrap'}}>
                                Confirmar
                              </button>
                              {c.telefono && (
                                <button onClick={()=>{
                                  const txt=encodeURIComponent(`Hola ${c.nombre}, te recordamos tu turno hoy a las ${c.hora}hs. ¡Te esperamos!`)
                                  window.open(`https://wa.me/${normalizarTelefono(c.telefono)}?text=${txt}`,'_blank')
                                }} className="btn-premium" title="Enviar recordatorio WhatsApp" style={{fontSize:11,padding:'4px 8px',borderRadius:7,border:'none',background:'#25D36618',color:'#128C7E',cursor:'pointer',fontFamily:'DM Sans, sans-serif',display:'flex',alignItems:'center',gap:3}}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.66.986 3.288 1.488 4.905 1.489 5.5.003 9.975-4.47 9.979-9.967.002-2.662-1.033-5.166-2.915-7.05C16.734 1.744 14.236.703 11.58.701c-5.503 0-9.98 4.47-9.985 9.969-.001 1.776.48 3.5 1.391 5.01L1.93 21.72l6.147-1.611-.43-.255z"/></svg>
                                </button>
                              )}
                            </>
                          )}

                          {c.estado === 'confirmado' && (
                            <button 
                              onClick={async () => {
                                await supabase.from('citas').update({ estado: 'asistio' }).eq('id', c.id)
                                setCitas(p => p.map(x => x.id === c.id ? { ...x, estado: 'asistio' as EstadoCita } : x))
                                msg('Cita marcada como Asistió ✓')
                                triggerConfetti()
                              }}
                              className="btn-premium" 
                              style={{fontSize:11,padding:'4px 10px',borderRadius:7,border:`1.5px solid ${accentColor}`,background:`${accentColor}18`,color:accentColor,cursor:'pointer',fontWeight:600,fontFamily:'DM Sans, sans-serif',whiteSpace:'nowrap'}}
                            >
                              ✓ Asistió
                            </button>
                          )}

                          {c.estado === 'asistio' && !c.precio_cobrado && (
                            <button 
                              onClick={() => {
                                setCobConcepto(`Pago ${c.tratamiento} — ${c.nombre}`)
                                setCobMonto(c.valor || '')
                                setCobCitaId(c.id)
                                setCobFecha(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))
                                setModalCobro(true)
                              }}
                              className="btn-premium" 
                              style={{fontSize:11,padding:'4px 10px',borderRadius:7,border:`1.5px solid ${accentColor}`,background:`${accentColor}18`,color:accentColor,cursor:'pointer',fontWeight:600,fontFamily:'DM Sans, sans-serif',whiteSpace:'nowrap'}}
                            >
                              💰 Cobrar
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
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <span style={{fontWeight:600,fontSize:14,color:primaryColor}}>Log de envíos</span>
                <div style={{display:'flex',gap:4}}>
                  {(['todos', 'enviado', 'fallido'] as const).map(f => (
                    <button key={f} onClick={() => setLogFiltro(f)} style={{
                      fontSize: 10,
                      padding: '3px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: 'none',
                      background: logFiltro === f ? primaryColor : '#f0f4f8',
                      color: logFiltro === f ? '#fff' : '#8fa3bc',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      fontFamily: 'DM Sans, sans-serif'
                    }}>
                      {f === 'todos' ? 'Todos' : f === 'enviado' ? 'Ok' : 'Err'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="glass-container" style={{borderRadius:14,overflow:'hidden',background:'rgba(255,255,255,0.7)'}}>
                {logsFiltrados.length===0
                  ?<div style={{padding:'2rem',textAlign:'center',color:'#ccc',fontSize:13}}>Sin envíos aún</div>
                  :logsFiltrados.slice(0,8).map((l,i)=>(
                    <div key={l.id} style={{display:'flex',alignItems:'center',gap:10,padding:'0.75rem 1rem',borderBottom:i<Math.min(logsFiltrados.length,8)-1?'0.5px solid rgba(56,138,221,0.08)':'none'}}>
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

      {modalNuevaCita && (
        <NuevaCitaModal
          onClose={() => setModalNuevaCita(false)}
          onSuccess={() => { setModalNuevaCita(false); load() }}
        />
      )}

      {/* Modal - Nuevo Paciente */}
      {modalPaciente && (
        <div style={overlayCss(isMobile)} onClick={() => setModalPaciente(false)}>
          <div style={modalCss(isMobile)} onClick={e => e.stopPropagation()}>
            <div style={modalTitleCss}>Nuevo paciente</div>
            
            <div style={groupCss}>
              <label style={labelCss}>Nombre completo *</label>
              <input style={inputCss} value={pacNombre} onChange={e => setPacNombre(e.target.value)} placeholder="Ej: María González" autoFocus />
            </div>
            
            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Teléfono *</label>
                <input style={inputCss} value={pacTelefono} onChange={e => setPacTelefono(e.target.value)} placeholder="+5491123456789" />
                <span style={{ fontSize: 11, color: '#aaa', marginTop: 3, display: 'block' }}>Debe empezar con +</span>
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Email</label>
                <input type="email" style={inputCss} value={pacEmail} onChange={e => setPacEmail(e.target.value)} placeholder="paciente@email.com" />
              </div>
            </div>
            
            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Fecha de nacimiento</label>
                <input type="date" style={inputCss} value={pacNacimiento} onChange={e => setPacNacimiento(e.target.value)} />
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Tratamiento</label>
                <select style={selectCss} value={pacTratamiento} onChange={e => setPacTratamiento(e.target.value)}>
                  {TRATAMIENTOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            
            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModalPaciente(false)} disabled={guardandoAccion}>Cancelar</button>
              <button style={{ ...btnDarkCss, opacity: guardandoAccion ? 0.6 : 1 }} onClick={guardarNuevoPaciente} disabled={guardandoAccion}>
                {guardandoAccion ? 'Guardando...' : 'Agregar paciente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Registrar Cobro */}
      {modalCobro && (
        <div style={overlayCss(isMobile)} onClick={() => setModalCobro(false)}>
          <div style={modalCss(isMobile)} onClick={e => e.stopPropagation()}>
            <div style={modalTitleCss}>Registrar cobro</div>
            
            <div style={groupCss}>
              <label style={labelCss}>Concepto *</label>
              <input style={inputCss} value={cobConcepto} onChange={e => setCobConcepto(e.target.value)} placeholder="Ej: Pago consulta — Juan P." autoFocus />
            </div>
            
            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Monto ($) *</label>
                <input type="number" style={inputCss} value={cobMonto} onChange={e => setCobMonto(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Fecha</label>
                <input type="date" style={inputCss} value={cobFecha} onChange={e => setCobFecha(e.target.value)} />
              </div>
            </div>
            
            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModalCobro(false)} disabled={guardandoAccion}>Cancelar</button>
              <button style={{ ...btnDarkCss, opacity: guardandoAccion ? 0.6 : 1 }} onClick={guardarRegistrarCobro} disabled={guardandoAccion}>
                {guardandoAccion ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  )
}
