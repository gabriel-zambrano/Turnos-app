'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, FilterBar, SkeletonLista, SkeletonKPIs, MetricCard, useBloqueoScroll, inputCss, selectCss, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss } from '@/components/UI'
import { TRAT_STYLE, ESTADO_STYLE, hoyISO, normalizarTelefono, nombreParaSaludo, TRATAMIENTOS } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { urlPublicaDeClinica } from '@/lib/config'
import { useTenantContext } from '@/components/TenantContext'
import type { EstadoCita } from '@/types'
import dynamic from 'next/dynamic'
import { triggerConfetti } from '@/lib/confetti'
import { FORMAS_PAGO, FORMAS_PAGO_FACTURABLES_DEFAULT, sugerirRequiereFactura } from '@/lib/pagos'
import { registrarPago, formasFacturablesDe } from '@/lib/registrar-pago'
import { registrarInasistenciaAction, aprobarAsistenciaAction } from '@/app/actions/fidelizacion'
import { HeatmapSemanal } from './components/HeatmapSemanal'
import { AccionesRapidas } from './components/AccionesRapidas'
import { PreparacionManana } from './components/PreparacionManana'
import { AvisoPedidosOnline } from '@/components/AvisoPedidosOnline'
import { ChecklistBienvenida } from '@/components/ChecklistBienvenida'

// Lazy-load: el modal solo se descarga cuando el usuario lo abre, no en la carga inicial.
const NuevaCitaModal = dynamic(() => import('@/components/NuevaCitaModal').then(m => m.NuevaCitaModal), { ssr: false })

interface Cita { id:string; nombre:string; hora:string; tratamiento:string; estado:EstadoCita; telefono:string; precio_cobrado?:number|null; valor?:number|null; paciente_id?:string; token?:string|null; fecha_hora?:string }
interface CitaMañana extends Cita { token:string|null; fecha_hora:string }
interface LogItem { id:string; paciente:string; canal:string; estado:string; hora:string }
const FILTROS = [{k:'todas',l:'Todas'},{k:'pendiente',l:'Pendientes'},{k:'confirmado',l:'Confirmadas'},{k:'asistio',l:'Asistieron'}]

export default function Dashboard() {
  // Nota: no hace falta re-verificar la sesión acá — el middleware (src/middleware.ts)
  // ya bloquea el acceso a /dashboard server-side si no hay sesión activa, antes de
  // que este componente llegue a montarse. Repetirlo acá solo agregaba un viaje de
  // red extra en cada carga.
  const supabase = useMemo(() => createClient(), [])
  const { tenant, loading: tenantLoading } = useTenantContext()
  const [citas, setCitas] = useState<Cita[]>([])
  const [citasMañana, setCitasMañana] = useState<CitaMañana[]>([])
  /** Código corto del link de cada cita, por id. Ver el fetch en la carga. */
  const [codigosEnlace, setCodigosEnlace] = useState<Record<string, string>>({})
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
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const [toast, setToast] = useState<{msg:string;tipo:string}|null>(null)
  const [hoy, setHoy] = useState('')
  const [ahora, setAhora] = useState(() => new Date())

  // States for Quick Actions
  const [modalPaciente, setModalPaciente] = useState(false)
  const [modalCobro, setModalCobro] = useState(false)

  const [modalNuevaCita, setModalNuevaCita] = useState(false)
  // Con un modal abierto, el fondo no se mueve al deslizar en el celular
  useBloqueoScroll(modalPaciente || modalCobro || modalNuevaCita)

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
  const [cobPacienteId, setCobPacienteId] = useState<string | null>(null)
  const [cobForma, setCobForma] = useState<string>(FORMAS_PAGO[0])
  const [cobFactura, setCobFactura] = useState(false)
  const [formasFacturables, setFormasFacturables] = useState<string[]>(FORMAS_PAGO_FACTURABLES_DEFAULT)

  const [guardandoAccion, setGuardandoAccion] = useState(false)

  // Heatmap & KPI metrics states
  const [selectedDate, setSelectedDate] = useState(() => hoyISO())
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
    
    // Cobro ligado a una cita: entra por `pagos` para que quede la forma de
    // pago y la intención de facturar. Escribir `precio_cobrado` a mano hacía
    // que el cobro esquivara el criterio de facturación de la clínica.
    let errorIngreso: { message: string } | null = null
    let errorCita: { message: string } | null = null

    if (!cobCitaId) {
      const { error } = await supabase.from('ingresos_manuales').insert({
        fecha: cobFecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }),
        concepto: cobConcepto.trim(),
        monto: Number(cobMonto),
        tenant_id: tenant.id,
        forma_pago: cobForma,
        requiere_factura: cobFactura,
      })
      errorIngreso = error
    }

    if (cobCitaId) {
      const { error: errPago } = await registrarPago(supabase, {
        tenantId: tenant.id,
        pacienteId: cobPacienteId!,
        citaId: cobCitaId,
        formaPago: cobForma,
        monto: Number(cobMonto),
        requiereFactura: cobFactura,
        origen: 'cobro_rapido',
        nota: cobConcepto.trim(),
      })

      if (errPago) {
        errorCita = { message: errPago }
      } else {
        const resAprobar = await aprobarAsistenciaAction(cobCitaId)
        if (!resAprobar.success) {
          errorCita = { message: resAprobar.error }
        }
      }
    }

    setGuardandoAccion(false)
    if (errorIngreso || errorCita) {
      msg('Error al registrar cobro: ' + (errorIngreso?.message || errorCita?.message), 'error')
    } else {
      setModalCobro(false)
      setCobConcepto('')
      setCobMonto('')
      setCobCitaId(null)
      setCobPacienteId(null)
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

  // Criterio de medios facturables de la clínica, para pre-marcar el check.
  useEffect(() => {
    if (!tenant) return
    formasFacturablesDe(supabase, tenant.id).then(setFormasFacturables)
  }, [tenant, supabase])

  const load = useCallback(async()=>{
    if (!tenant) return
    setLoading(true)
    
    // Ventana de 7 dias: hoy y los proximos seis.
    //
    // Antes eran 28 (desde el lunes de la semana pasada), porque hacian falta
    // los datos de la semana anterior para la variacion de tasa de
    // confirmacion. Al mover esa metrica a Analitica, el pasado dejo de
    // usarse: la unica ventana que se consulta es la que se muestra.
    //
    // La fecha se calcula en hora de Argentina, no en UTC. Con la ventana
    // vieja el detalle daba igual porque el borde inferior estaba una semana
    // en el pasado; ahora empieza hoy, y `toISOString()` después de las 21 hs
    // locales ya devuelve la fecha de mañana — los turnos del día habrían
    // desaparecido del dashboard cada noche.
    const fechaAR = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

    const desde = new Date()
    desde.setDate(desde.getDate() - 1) // margen de un día por bordes de huso
    const hasta = new Date()
    hasta.setDate(hasta.getDate() + 7)

    const desdeISO = fechaAR(desde)
    const hastaISO = fechaAR(hasta)

    // Fetch appointments in range
    const { data: rawCitas, error } = await supabase
      .from('citas')
      .select('id, tipo_tratamiento, estado, fecha_hora, valor, precio_cobrado, paciente_id, pacientes(nombre, telefono, token)')
      .eq('tenant_id', tenant.id)
      .gte('fecha_hora', `${desdeISO}T00:00:00-03:00`)
      .lte('fecha_hora', `${hastaISO}T23:59:59-03:00`)
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
        token: pac?.token ?? null,
        fecha_hora: c.fecha_hora,
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

    // Los códigos cortos de los links se piden acá y no al tocar el botón de
    // WhatsApp: window.open despues de un await ya no cuenta como gesto del
    // usuario y el bloqueador de pop-ups la mata. Pedirlos ahora deja el click
    // sincrónico. Emitirlos es idempotente, así que esto no genera links
    // nuevos en cada carga.
    if (tomorrowCitas.length > 0) {
      fetch('/api/enlaces-turno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citaIds: tomorrowCitas.map(c => c.id) }),
      })
        .then(r => (r.ok ? r.json() : { codigos: {} }))
        .then(d => setCodigosEnlace(d.codigos || {}))
        .catch(() => {})
    }

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

    // Las metricas semanales (revenue estimado, cancelaciones y variacion de
    // tasa de confirmacion) se movieron a Analitica: son tendencias, no
    // operacion del dia. Con eso se fueron tambien la consulta de precios de
    // tratamientos y las tres semanas de citas que hacian falta para
    // calcularlas.

    // Heatmap data
    const hData = []
    const weekDaysShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      // En hora local: se compara contra fechas convertidas a Argentina, y
      // en UTC las columnas del heatmap se corrían un día cada noche.
      const dISO = fechaAR(d)
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
  // Métricas operativas del día: se derivan de las citas que ya están en
  // memoria, sin ninguna consulta extra.
  const citasCobradas = citas.filter(c => (c.precio_cobrado ?? 0) > 0).length
  const cobradoHoy    = citas.reduce((s, c) => s + (c.precio_cobrado ?? 0), 0)
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



  const logsFiltrados = logFiltro === 'todos' ? logs : logs.filter(l => l.estado === logFiltro)

  async function confirmar(id:string){
    await supabase.from('citas').update({estado:'confirmado'}).eq('id',id)
    setCitas(p=>p.map(c=>c.id===id?{...c,estado:'confirmado' as EstadoCita}:c))
    msg('Cita confirmada ✓')
  }

  const enviarRecordatorioWhatsApp = (cita: any) => {
    if (!tenant) return
    const num = normalizarTelefono(cita.telefono)
    // La plantilla por defecto lleva UN solo link, y va al final.
    //
    // WhatsApp previsualiza únicamente la primera URL del mensaje: con dos, la
    // segunda queda como noventa caracteres de texto suelto compitiendo con lo
    // que importa. Y esa tarjeta de vista previa es, en la práctica, el botón
    // que el paciente toca.
    const rawTemplate = (tenant.whatsappTemplate || `Hola {nombre_paciente}, te esperamos el *{dia_semana} {fecha} a las {hora}hs* en {nombre_clinica}.\n\n{tratamiento} · {direccion}\n\nConfirmá y agendá tu turno acá:\n{link}`).replace(/\\n/g, '\n')
    
    let dia = ''
    let fecha = ''
    let hora = cita.hora
    if (cita.fecha_hora) {
      const dt = new Date(cita.fecha_hora)
      const ar = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
      const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
      const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
      dia = dias[ar.getDay()]
      fecha = ar.getDate() + ' de ' + meses[ar.getMonth()]
      hora = String(ar.getHours()).padStart(2,'0') + ':' + String(ar.getMinutes()).padStart(2,'0')
    } else {
      const dt = new Date(selectedDate + 'T' + cita.hora + ':00-03:00')
      const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
      const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
      dia = dias[dt.getDay()]
      fecha = dt.getDate() + ' de ' + meses[dt.getMonth()]
    }

    const appUrl = urlPublicaDeClinica(tenant)
    const linkPortal = cita.token ? `${appUrl}/paciente/${cita.token}` : ''

    // {link} es el enlace corto del turno: confirmar, agendar y reprogramar,
    // todo ahí. Si el código todavía no se emitió —la migración no corrió, o
    // el fetch de la carga falló—, cae al portal, que es lo que había antes.
    const codigo = codigosEnlace[cita.id]
    const link = codigo ? `${appUrl}/t/${codigo}` : linkPortal

    const msgText = rawTemplate
      .replace(/{nombre_paciente}/g, cita.nombre)
      .replace(/{nombre_clinica}/g, tenant.nombre || 'DentalDesk')
      .replace(/{dia_semana}/g, dia)
      .replace(/{fecha}/g, fecha)
      .replace(/{hora}/g, hora)
      .replace(/{tratamiento}/g, cita.tratamiento)
      // Alias de {link}, por si quedó en alguna plantilla guardada. Desde que
      // el enlace corto resuelve las tres acciones, no hay dos links que dar.
      .replace(/{link_calendario}/g, link)
      .replace(/{link_portal}/g, linkPortal)
      .replace(/{link}/g, link)
      .replace(/{direccion}/g, tenant.direccion || '')

    const txt = encodeURIComponent(msgText)
    window.open(`https://wa.me/${num}?text=${txt}`, '_blank')
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

  if (tenantLoading) return (
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
          
          <ChecklistBienvenida />
          <AvisoPedidosOnline />

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
                  {getSaludo()}, {nombreParaSaludo(tenant?.nombre)}!
                </h2>
                <p style={{ fontSize: 13, color: '#687e96', lineHeight: 1.4 }}>
                  {/* No se desglosa por estado: los turnos también pueden estar
                      atendidos, cancelados o ausentes, y "2 confirmados y 3
                      pendientes" sobre 10 daba a entender un desglose completo
                      que no cerraba. Se dice el total y lo accionable. */}
                  {citas.length > 0
                    ? `Hoy tenés ${citas.length} ${citas.length === 1 ? 'turno agendado' : 'turnos agendados'}.` +
                      (pend > 0 ? ` ${pend} ${pend === 1 ? 'espera tu confirmación' : 'esperan tu confirmación'}.` : '')
                    : 'No tenés citas agendadas para el día de hoy.'
                  }
                </p>
              </div>

              {/* Próximo paciente, dentro del saludo.
                  Antes era un banner suelto debajo de las métricas que repetía
                  lo que ya estaba en la lista de turnos. Acá queda junto al
                  contexto del día, que es donde se lo busca: quién sigue. */}
              {nextCita && (
                <div style={{
                  marginTop: 14,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${accentColor}0d, ${secondaryColor}0d)`,
                  border: `1px solid ${secondaryColor}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span className="pulse-indicator" style={{ display: 'flex', position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
                      <span style={{ animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite', position: 'absolute', display: 'inline-flex', height: '100%', width: '100%', borderRadius: '50%', background: accentColor, opacity: 0.75 }}/>
                      <span style={{ position: 'relative', display: 'inline-flex', borderRadius: '50%', height: 8, width: 8, background: accentColor }}/>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8fa3bc', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Sigue · {tiempoRestante}
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: primaryColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nextCita.nombre}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#687e96' }}>
                        {nextCita.hora} hs · {nextCita.tratamiento}
                      </div>
                    </div>
                  </div>
                  {nextCita.telefono && (
                    <button onClick={() => enviarRecordatorioWhatsApp(nextCita)} className="btn-premium" style={{
                      background: '#25D366', border: 'none', borderRadius: 8, padding: '7px 12px',
                      color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                      minHeight: 36, flexShrink: 0,
                    }}>
                      WhatsApp
                    </button>
                  )}
                </div>
              )}
              
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

            <PreparacionManana
              compacto={isMobile}
              cantidadTurnos={citasMañana.length}
              enviando={enviandoEmail}
              onEnviarRecordatorios={enviarEmailsMañana}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
            />

            <AccionesRapidas
              modo={isMobile ? 'flotante' : 'tarjeta'}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              accentColor={accentColor}
              onAgendarTurno={() => setModalNuevaCita(true)}
              onNuevoPaciente={() => {
                setPacNombre('')
                setPacTelefono('+54911')
                setPacEmail('')
                setPacNacimiento('')
                setPacTratamiento('Consulta')
                setModalPaciente(true)
              }}
              onRegistrarCobro={() => {
                setCobConcepto('')
                setCobMonto('')
                setCobFecha(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))
                setModalCobro(true)
              }}
            />
          </div>

          {/* Carga de turnos de la semana; también elige el día que se muestra abajo. */}
          <HeatmapSemanal
            dias={heatmapData}
            fechaSeleccionada={selectedDate}
            onSeleccionar={setSelectedDate}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            accentColor={accentColor}
          />

          <div style={{marginBottom:'1.5rem'}}>
            {/* Solo métricas del día. Las semanales viven en Analítica: acá
                estorbaban lo operativo, que es lo que se mira entre paciente
                y paciente. */}
            {/* auto-fit: en el celular entran dos por fila y la tercera baja.
                Con tres columnas fijas cada tarjeta quedaba en ~110px y el
                importe de "Cobrado hoy" se cortaba a la mitad. */}
            {loading ? <SkeletonKPIs cantidad={3}/> : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:12}}>
                <MetricCard label="Citas del día" value={citas.length} sub={`Confirmadas: ${conf}`} accent={primaryColor}/>
                <MetricCard label="Cobrado hoy" value={`$${cobradoHoy.toLocaleString('es-AR')}`} sub={`${citasCobradas} de ${citas.length} turnos`} accent={accentColor}/>
                <MetricCard label="Pendientes de cobro" value={citas.length - citasCobradas} sub="Turnos de hoy sin cobrar" accent={citas.length - citasCobradas > 0 ? '#EF9F27' : accentColor}/>
              </div>
            )}
          </div>

          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 300px',gap:16,alignItems:'start'}}>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:isMobile?'flex-start':'center',flexDirection:isMobile?'column':'row',gap:isMobile?8:0,marginBottom:12}}>
                <span style={{fontWeight:700,fontSize:14,color:primaryColor}}>
                  {selectedDate === hoyISO() ? 'Citas de hoy' : `Citas del ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
                </span>
                <FilterBar options={FILTROS} active={filtro} onChange={setFiltro}/>
              </div>
              {loading?<SkeletonLista filas={4}/>:(
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {lista.map(c=>{
                    const tc=TRAT_STYLE[c.tratamiento]||TRAT_STYLE.Consulta
                    const es=ESTADO_STYLE[c.estado]||ESTADO_STYLE.pendiente
                    // Cuando la fila ofrece una acción, el botón ya dice en qué
                    // estado está: repetirlo en una etiqueta solo gastaba ancho
                    // y empujaba las acciones a una segunda línea en el celular.
                    const cobrado = c.estado==='asistio' && !!c.precio_cobrado
                    const tieneAccion = c.estado==='pendiente' || c.estado==='confirmado' || (c.estado==='asistio' && !c.precio_cobrado)
                    return(
                      <div key={c.id} className="interactive-item" style={{background:'rgba(255,255,255,0.7)',border:'0.5px solid rgba(56,138,221,0.12)',borderRadius:12,padding:isMobile?'0.75rem':'0.85rem 1rem',display:'flex',alignItems:isMobile?'flex-start':'center',flexWrap:isMobile?'wrap':'nowrap',gap:isMobile?8:14}}>
                        <div style={{fontSize:13,fontWeight:700,color:primaryColor,minWidth:40,textAlign:'center'}}>{c.hora}</div>
                        <div style={{width:8,height:8,borderRadius:'50%',background:tc.dot,flexShrink:0,marginTop:isMobile?4:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                           <div style={{fontWeight:600,fontSize:14,color:primaryColor,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre}</div>
                          <div style={{marginTop:3}}><Badge bg={tc.bg} color={tc.color}>{c.tratamiento}</Badge></div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8,width:isMobile?'100%':'auto',justifyContent:isMobile?'flex-end':'flex-start'}}>
                          {/* Cobrado: en vez de repetir "Asistió", se muestra
                              cuánto entró, que es el dato que falta a esa altura. */}
                          {cobrado && (
                            <span style={{fontSize:11.5,fontWeight:700,color:'#138A6B',background:'rgba(19,138,107,0.1)',padding:'3px 9px',borderRadius:20,whiteSpace:'nowrap'}}>
                              ✓ ${Number(c.precio_cobrado).toLocaleString('es-AR')}
                            </span>
                          )}

                          {!tieneAccion && !cobrado && <Badge bg={es.bg} color={es.color}>{es.label}</Badge>}

                          {c.estado === 'pendiente' && (
                            <>
                              <button onClick={()=>confirmar(c.id)} className="btn-premium" style={{fontSize:11,padding:'4px 10px',borderRadius:7,border:`1.5px solid ${accentColor}`,background:`${accentColor}18`,color:accentColor,cursor:'pointer',fontWeight:600,fontFamily:'DM Sans, sans-serif',whiteSpace:'nowrap'}}>
                                Confirmar
                              </button>
                              {c.telefono && (
                                <button onClick={()=>enviarRecordatorioWhatsApp(c)} className="btn-premium" title="Enviar recordatorio WhatsApp" style={{fontSize:11,padding:'4px 8px',borderRadius:7,border:'none',background:'#25D36618',color:'#128C7E',cursor:'pointer',fontFamily:'DM Sans, sans-serif',display:'flex',alignItems:'center',gap:3}}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.66.986 3.288 1.488 4.905 1.489 5.5.003 9.975-4.47 9.979-9.967.002-2.662-1.033-5.166-2.915-7.05C16.734 1.744 14.236.703 11.58.701c-5.503 0-9.98 4.47-9.985 9.969-.001 1.776.48 3.5 1.391 5.01L1.93 21.72l6.147-1.611-.43-.255z"/></svg>
                                </button>
                              )}
                            </>
                          )}

                          {c.estado === 'confirmado' && (
                            <button 
                              onClick={async () => {
                                if (!c.precio_cobrado) {
                                  setCobConcepto(`Pago ${c.tratamiento} — ${c.nombre}`)
                                  setCobMonto(c.valor || '')
                                  setCobCitaId(c.id)
                                  setCobPacienteId(c.paciente_id ?? null)
                                  setCobForma(FORMAS_PAGO[0])
                                  setCobFactura(sugerirRequiereFactura(FORMAS_PAGO[0], formasFacturables))
                                  setCobFecha(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))
                                  setModalCobro(true)
                                  msg('Ingresá el cobro para procesar los puntos.')
                                } else {
                                  const res = await aprobarAsistenciaAction(c.id)
                                  if (!res.success) {
                                    msg('Error al procesar puntos: ' + res.error, 'error')
                                  } else {
                                    setCitas(p => p.map(x => x.id === c.id ? { ...x, estado: 'asistio' as EstadoCita } : x))
                                    msg('Cita marcada como Asistió ✓')
                                    triggerConfetti()
                                  }
                                }
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
                                setCobPacienteId(c.paciente_id ?? null)
                                setCobForma(FORMAS_PAGO[0])
                                setCobFactura(sugerirRequiereFactura(FORMAS_PAGO[0], formasFacturables))
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

            {/* Sin forma de pago este cobro esquivaba el criterio de
                facturación y se facturaba entero. */}
            <div style={groupCss}>
              <label style={labelCss}>Forma de pago</label>
              <select style={selectCss} value={cobForma}
                onChange={e => { setCobForma(e.target.value); setCobFactura(sugerirRequiereFactura(e.target.value, formasFacturables)) }}>
                {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <label style={{display:'flex', alignItems:'center', gap:10, cursor:'pointer',
              padding:'10px 12px', borderRadius:9, marginBottom:'0.85rem',
              background: cobFactura ? 'rgba(29,158,117,0.08)' : 'var(--bg-input, #f8fafc)',
              border:`1px solid ${cobFactura ? 'rgba(29,158,117,0.3)' : 'var(--border-color, #e2e8ed)'}`}}>
              <input type="checkbox" checked={cobFactura} onChange={e => setCobFactura(e.target.checked)}
                style={{width:18, height:18, accentColor:'#1D9E75', cursor:'pointer'}}/>
              <span style={{fontSize:13.5, color:'var(--text-dark, #0a1e3d)', fontWeight:500}}>
                Facturar este cobro
                <span style={{display:'block', fontSize:11.5, color:'var(--text-muted-darker, #4a6080)', fontWeight:400, marginTop:2}}>
                  {sugerirRequiereFactura(cobForma, formasFacturables)
                    ? `${cobForma} se factura según tu configuración`
                    : `${cobForma} no se factura, salvo que el paciente lo pida`}
                </span>
              </span>
            </label>
            <div style={{display:'none'}}>
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

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} isMobile={isMobile} />}
    </div>
  )
}
