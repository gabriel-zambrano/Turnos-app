'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Toast, Spinner, PageHeader } from '@/components/UI'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'
import { triggerConfetti } from '@/lib/confetti'

interface Tratamiento  { id: string; nombre: string; precio_base: number | null }
interface CostoFijo    { id: string; nombre: string; monto: number; activo: boolean }
interface MetaMensual  { id: string; mes: number; anio: number; meta_ingresos: number }
interface IngresoManual { id: string; fecha: string; concepto: string; monto: number }
interface EgresoManual  { id: string; fecha: string; concepto: string; monto: number }
interface CitaAsistida { id: string; fecha_hora: string; tipo_tratamiento: string; precio_cobrado: number | null; sena: number | null; valor: number | null; pacientes: { nombre: string; telefono: string } | null }

const inputSt: React.CSSProperties = {
  fontSize: 13, padding: '7px 10px', borderRadius: 8,
  border: '1px solid #e2e8f0', fontFamily: 'DM Sans, sans-serif',
  color: '#0a1e3d', width: '100%', boxSizing: 'border-box', outline: 'none',
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}
function diasEnMes(mes: number, anio: number) { return new Date(anio, mes, 0).getDate() }
function hoyAR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}
function diasRestantes(mes: number, anio: number) {
  const ar = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return Math.max(1, diasEnMes(mes, anio) - ar.getDate() + 1)
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function FinanzasPage() {
  const supabase = createClient()
  const { tenant, loading: tenantLoading } = useTenantContext()
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; tipo: string } | null>(null)
  
  const now = new Date()
  const mesActual  = now.getMonth() + 1
  const anioActual = now.getFullYear()

  const [tab, setTab] = useState<'resumen' | 'caja' | 'deudores'>('resumen')
  const [fechaCaja, setFechaCaja] = useState(hoyAR())

  const [tratamientos, setTratamientos]   = useState<Tratamiento[]>([])
  const [costos, setCostos]               = useState<CostoFijo[]>([])
  const [meta, setMeta]                   = useState<MetaMensual | null>(null)
  const [manuales, setManuales]           = useState<IngresoManual[]>([])
  const [egresos, setEgresos]             = useState<EgresoManual[]>([])
  const [citasMes, setCitasMes]           = useState<CitaAsistida[]>([])
  const [deudores, setDeudores]           = useState<CitaAsistida[]>([])

  const [modalMeta, setModalMeta]       = useState(false)
  const [modalCosto, setModalCosto]     = useState(false)
  const [modalIngreso, setModalIngreso] = useState(false)
  const [modalEgreso, setModalEgreso]   = useState(false)
  
  const [fMeta, setFMeta]               = useState<number | ''>('')
  const [fCostoNombre, setFCostoNombre] = useState('')
  const [fCostoMonto, setFCostoMonto]   = useState<number | ''>('')
  const [fConcepto, setFConcepto]       = useState('')
  const [fMonto, setFMonto]             = useState<number | ''>('')
  const [fFecha, setFFecha]             = useState(hoyAR())
  const [saving, setSaving]             = useState(false)
  
  const [editandoPrecio, setEditandoPrecio] = useState<string | null>(null)
  const [precioEdit, setPrecioEdit]       = useState<number | ''>('')
  const [hasTriggeredConfetti, setHasTriggeredConfetti] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.replace('/login')
    })
  }, [])
  
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
 
  function msg(m: string, tipo = 'ok') { setToast({ msg: m, tipo }); setTimeout(() => setToast(null), 3500) }

  const load = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    const totalDias = diasEnMes(mesActual, anioActual)
    const inicioMes = `${anioActual}-${String(mesActual).padStart(2,'0')}-01T00:00:00`
    const finMes    = `${anioActual}-${String(mesActual).padStart(2,'0')}-${String(totalDias).padStart(2,'0')}T23:59:59`
    const inicioFecha = `${anioActual}-${String(mesActual).padStart(2,'0')}-01`
    const finFecha    = `${anioActual}-${String(mesActual).padStart(2,'0')}-${String(totalDias).padStart(2,'0')}`

    const [resTrat, resCostos, resMeta, resManuales, resEgresos, resCitas, resDeudas] = await Promise.all([
      supabase.from('tratamientos').select('id, nombre, precio_base').eq('tenant_id', tenant.id).eq('activo', true),
      supabase.from('costos_fijos').select('*').eq('tenant_id', tenant.id).order('nombre'),
      supabase.from('meta_mensual').select('*').eq('tenant_id', tenant.id).eq('mes', mesActual).eq('anio', anioActual).maybeSingle(),
      supabase.from('ingresos_manuales').select('*').eq('tenant_id', tenant.id).gte('fecha', inicioFecha).lte('fecha', finFecha).order('fecha', { ascending: false }),
      supabase.from('egresos_manuales').select('*').eq('tenant_id', tenant.id).gte('fecha', inicioFecha).lte('fecha', finFecha).order('fecha', { ascending: false }),
      supabase.from('citas').select('id, fecha_hora, tipo_tratamiento, precio_cobrado, valor, sena, pacientes(nombre, telefono)').eq('tenant_id', tenant.id).in('estado', ['confirmado', 'asistio']).gte('fecha_hora', inicioMes).lte('fecha_hora', finMes).order('fecha_hora', { ascending: false }),
      supabase.from('citas').select('id, fecha_hora, tipo_tratamiento, precio_cobrado, valor, sena, pacientes(nombre, telefono)').eq('tenant_id', tenant.id).in('estado', ['confirmado', 'asistio']).order('fecha_hora', { ascending: false })
    ])
    
    if (resTrat.data)    setTratamientos(resTrat.data)
    if (resCostos.data)  setCostos(resCostos.data)
    if (resMeta.data)    setMeta(resMeta.data)
    if (resManuales.data) setManuales(resManuales.data)
    if (resEgresos.data) setEgresos(resEgresos.data)
    if (resCitas.data)   setCitasMes(resCitas.data as unknown as CitaAsistida[])
    
    if (resDeudas.data) {
      // Filtrar pacientes con deuda
      const conDeuda = (resDeudas.data as unknown as CitaAsistida[]).filter(c => {
        const v = c.valor ?? 0;
        const cobrado = (c.sena ?? 0) + (c.precio_cobrado ?? 0);
        return v > cobrado;
      });
      setDeudores(conDeuda)
    }

    setLoading(false)
  }, [mesActual, anioActual, tenant])

  useEffect(() => { if (tenant) load() }, [load, tenant])

  // ── Cálculos Globales ────────────────────────────────────────────────────────
  const precioMap     = useMemo(() => Object.fromEntries(tratamientos.map(t => [t.nombre, t.precio_base || 0])), [tratamientos])
  const getPrecio = useCallback((c: CitaAsistida) => c.precio_cobrado ?? c.valor ?? precioMap[c.tipo_tratamiento] ?? 0, [precioMap])
  const getDeuda = useCallback((c: CitaAsistida) => {
    const v = c.valor ?? 0;
    const cobrado = (c.sena ?? 0) + (c.precio_cobrado ?? 0);
    return Math.max(0, v - cobrado);
  }, []);

  const totalCostos   = costos.filter(c => c.activo).reduce((s, c) => s + c.monto, 0)
  const metaIngresos  = meta?.meta_ingresos || 0

  const totalCitasMes = citasMes.reduce((s, c) => s + (getPrecio(c)), 0)
  const totalManualMes = manuales.reduce((s, m) => s + m.monto, 0)
  const totalMes      = totalCitasMes + totalManualMes

  const restante        = Math.max(0, metaIngresos - totalMes)
  const diasRest        = diasRestantes(mesActual, anioActual)
  const objetivoDiario  = diasRest > 0 && restante > 0 ? restante / diasRest : 0
  const breakEvenDiario = totalCostos / diasEnMes(mesActual, anioActual)
  const progreso        = metaIngresos > 0 ? Math.min(100, (totalMes / metaIngresos) * 100) : 0
  const gananciaActual  = totalMes - totalCostos
 
  useEffect(() => {
    if (metaIngresos > 0 && totalMes >= metaIngresos) {
      if (!hasTriggeredConfetti) {
        triggerConfetti()
        setHasTriggeredConfetti(true)
      }
    } else {
      setHasTriggeredConfetti(false)
    }
  }, [totalMes, metaIngresos, hasTriggeredConfetti])

  // ── Acciones ───────────────────────────────────────────────────────────────
  async function guardarPrecioCita(id: string, precio: number) {
    await supabase.from('citas').update({ precio_cobrado: precio }).eq('id', id)
    setEditandoPrecio(null)
    msg('Precio actualizado ✓')
    load()
  }

  async function saldarDeuda(c: CitaAsistida) {
    if (!confirm(`¿Saldar la deuda de ${fmt(getDeuda(c))}?`)) return;
    const v = c.valor ?? 0;
    const s = c.sena ?? 0;
    const nuevoCobrado = v - s; // El cobrado pasa a ser el total menos la seña
    await supabase.from('citas').update({ precio_cobrado: nuevoCobrado }).eq('id', c.id)
    msg('Deuda saldada ✓')
    load()
  }

  async function guardarMeta() {
    if (fMeta === '' || Number(fMeta) < 0) return msg('Ingresá una meta válida', 'error')
    if (!tenant) return
    setSaving(true)
    if (meta) {
      await supabase.from('meta_mensual').update({ meta_ingresos: fMeta, updated_at: new Date().toISOString() }).eq('id', meta.id)
    } else {
      await supabase.from('meta_mensual').insert({ mes: mesActual, anio: anioActual, meta_ingresos: fMeta, tenant_id: tenant.id })
    }
    setSaving(false); setModalMeta(false); msg('Meta actualizada ✓'); load()
  }

  async function agregarCosto() {
    if (!fCostoNombre.trim() || fCostoMonto === '' || Number(fCostoMonto) <= 0) return msg('Completá nombre y monto', 'error')
    if (!tenant) return
    setSaving(true)
    await supabase.from('costos_fijos').insert({ nombre: fCostoNombre.trim(), monto: fCostoMonto, activo: true, tenant_id: tenant.id })
    setSaving(false); setModalCosto(false); setFCostoNombre(''); setFCostoMonto(''); msg('Costo agregado ✓'); load()
  }
  async function toggleCosto(id: string, activo: boolean) {
    await supabase.from('costos_fijos').update({ activo: !activo }).eq('id', id); load()
  }
  async function eliminarCosto(id: string) {
    await supabase.from('costos_fijos').delete().eq('id', id); msg('Costo eliminado'); load()
  }

  async function agregarIngreso() {
    if (!fConcepto.trim() || fMonto === '' || Number(fMonto) <= 0) return msg('Completá concepto y monto', 'error')
    if (!tenant) return
    setSaving(true)
    await supabase.from('ingresos_manuales').insert({ fecha: fFecha, concepto: fConcepto.trim(), monto: fMonto, tenant_id: tenant.id })
    setSaving(false); setModalIngreso(false); setFConcepto(''); setFMonto(''); setFFecha(hoyAR()); msg('Ingreso registrado ✓'); load()
  }
  async function eliminarIngreso(id: string) {
    await supabase.from('ingresos_manuales').delete().eq('id', id); msg('Ingreso eliminado'); load()
  }

  async function agregarEgreso() {
    if (!fConcepto.trim() || fMonto === '' || Number(fMonto) <= 0) return msg('Completá concepto y monto', 'error')
    if (!tenant) return
    setSaving(true)
    await supabase.from('egresos_manuales').insert({ fecha: fFecha, concepto: fConcepto.trim(), monto: fMonto, tenant_id: tenant.id })
    setSaving(false); setModalEgreso(false); setFConcepto(''); setFMonto(''); setFFecha(hoyAR()); msg('Egreso registrado ✓'); load()
  }
  async function eliminarEgreso(id: string) {
    await supabase.from('egresos_manuales').delete().eq('id', id); msg('Egreso eliminado'); load()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (tenantLoading || loading) return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner /></main>
    </div>
  )

  const tabBtn = (t: typeof tab) => ({
    padding: '0.45rem 1rem', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
    background: tab === t ? '#0f1e2b' : 'transparent',
    color: tab === t ? '#fff' : '#64748b',
    transition: 'all 0.15s'
  })

  // Data para Caja Diaria
  const citasDia = citasMes.filter(c => c.fecha_hora.startsWith(fechaCaja))
  const ingresosDia = manuales.filter(m => m.fecha === fechaCaja)
  const egresosDia = egresos.filter(e => e.fecha === fechaCaja)
  
  const totalCitasDia = citasDia.reduce((s, c) => s + getPrecio(c), 0)
  const totalIngresosDia = ingresosDia.reduce((s, m) => s + m.monto, 0)
  const totalEgresosDia = egresosDia.reduce((s, m) => s + m.monto, 0)
  const cajaDia = (totalCitasDia + totalIngresosDia) - totalEgresosDia

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'DM Sans, sans-serif', background:'#f4f7fb' }}>
      <Sidebar />
      <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex:1, paddingBottom: isMobile ? 80 : 0, minWidth:0, overflowX:'hidden' }}>
        <PageHeader
          title="Finanzas Operativas"
          sub={`${MESES[mesActual - 1]} ${anioActual}`}
          right={
            <button onClick={() => { setFMeta(metaIngresos || ''); setModalMeta(true) }}
              style={{ fontSize:12, padding:'6px 14px', borderRadius:8, border:'0.5px solid #138A6B', background:'#E1F5EE', color:'#085041', cursor:'pointer', fontWeight:600, fontFamily:'DM Sans, sans-serif' }}>
              {metaIngresos > 0 ? `Meta: ${fmt(metaIngresos)}` : '+ Fijar meta mensual'}
            </button>
          }
        />

        <div style={{ padding: isMobile ? '1rem' : '1.75rem 2rem', maxWidth:1100, margin:'0 auto' }}>
          
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: '1.5rem', width: 'fit-content' }}>
            <button onClick={() => setTab('resumen')} style={tabBtn('resumen')}>Resumen Mensual</button>
            <button onClick={() => setTab('caja')} style={tabBtn('caja')}>Caja Diaria</button>
            <button onClick={() => setTab('deudores')} style={tabBtn('deudores')}>Deudores <span style={{background:'#ef4444', color:'#fff', padding:'2px 6px', borderRadius:10, fontSize:10, marginLeft:6}}>{deudores.length}</span></button>
          </div>

          {tab === 'resumen' && (
            <>
              {/* KPI Cards */}
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap:12, marginBottom:'1.5rem' }}>
                {[
                  { label:'Facturado en el mes', value: fmt(totalMes),  sub:`${citasMes.length} citas atendidas`,                                      accent:'#1D9E75' },
                  { label:'Costos Fijos',      value: fmt(totalCostos),   sub:`${costos.filter(c=>c.activo).length} ítems activos`,                     accent:'#D85A30' },
                  { label:'Meta mensual',      value: metaIngresos > 0 ? fmt(metaIngresos) : '—', sub: metaIngresos > 0 ? `${Math.round(progreso)}% completado` : 'Sin meta definida', accent:'#378ADD' },
                  { label:'Objetivo del día',  value: restante === 0 && metaIngresos > 0 ? '✓ Cumplida' : objetivoDiario > 0 ? fmt(objetivoDiario) : '—', sub: diasRest > 0 ? `Quedan ${diasRest} días` : 'Último día del mes', accent: restante === 0 && metaIngresos > 0 ? '#1D9E75' : '#EF9F27' },
                ].map(({ label, value, sub, accent }) => (
                  <div key={label} style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:14, padding:'1rem 1.1rem' }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>{label}</div>
                    <div style={{ fontSize: isMobile ? 15 : 19, fontWeight:700, color:accent }}>{value}</div>
                    <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Barra de progreso mensual */}
              {metaIngresos > 0 && (
                <div style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:16, padding:'1.1rem 1.4rem', marginBottom:'1.5rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>Progreso mensual</span>
                    <span style={{ fontSize:13, color:'#888' }}>{fmt(totalMes)} de {fmt(metaIngresos)}</span>
                  </div>
                  <div style={{ height:10, background:'#f0f0ee', borderRadius:5, overflow:'hidden', marginBottom:6 }}>
                    <div style={{ height:'100%', width:`${progreso}%`, background: progreso >= 100 ? '#1D9E75' : progreso >= 60 ? '#EF9F27' : '#D85A30', borderRadius:5, transition:'width .5s ease' }} />
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#aaa' }}>
                    <span>{Math.round(progreso)}% completado</span>
                    {restante > 0 && <span>Faltan {fmt(restante)}</span>}
                  </div>
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap:16, alignItems:'start' }}>
                {/* Punto de equilibrio */}
                <div style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:16, padding:'1.25rem' }}>
                  <div style={{ fontWeight:700, fontSize:15, color:'#0a1e3d', marginBottom:14 }}>Punto de equilibrio</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
                    <div style={{ background:'#FAECE7', borderRadius:10, padding:'0.85rem', textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'#D85A30', fontWeight:700, marginBottom:4, textTransform:'uppercase' }}>Costos fijos</div>
                      <div style={{ fontSize:16, fontWeight:700, color:'#712B13' }}>{fmt(totalCostos)}</div>
                      <div style={{ fontSize:10, color:'#D85A30', marginTop:2 }}>{fmt(breakEvenDiario)}/día</div>
                    </div>
                    <div style={{ background:'#E6F1FB', borderRadius:10, padding:'0.85rem', textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'#378ADD', fontWeight:700, marginBottom:4, textTransform:'uppercase' }}>Meta mensual</div>
                      <div style={{ fontSize:16, fontWeight:700, color:'#0C447C' }}>{metaIngresos > 0 ? fmt(metaIngresos) : '—'}</div>
                      <div style={{ fontSize:10, color:'#378ADD', marginTop:2 }}>{metaIngresos > 0 ? `${fmt(metaIngresos / diasEnMes(mesActual, anioActual))}/día` : 'Sin definir'}</div>
                    </div>
                    <div style={{ background: gananciaActual >= 0 ? '#E1F5EE' : '#FAEEDA', borderRadius:10, padding:'0.85rem', textAlign:'center' }}>
                      <div style={{ fontSize:10, color: gananciaActual >= 0 ? '#085041' : '#633806', fontWeight:700, marginBottom:4, textTransform:'uppercase' }}>{gananciaActual >= 0 ? 'Ganancia' : 'Déficit'}</div>
                      <div style={{ fontSize:16, fontWeight:700, color: gananciaActual >= 0 ? '#1D9E75' : '#EF9F27' }}>{fmt(Math.abs(gananciaActual))}</div>
                      <div style={{ fontSize:10, color: gananciaActual >= 0 ? '#1D9E75' : '#EF9F27', marginTop:2 }}>{gananciaActual >= 0 ? 'sobre costos' : 'bajo costos'}</div>
                    </div>
                  </div>
                  {metaIngresos > 0 && restante > 0 && (
                    <div style={{ background:'#f8fafc', borderRadius:10, padding:'0.85rem 1rem', fontSize:13, color:'#0a1e3d', lineHeight:1.6 }}>
                      Para cumplir la meta necesitás facturar{' '}
                      <strong style={{ color:'#378ADD' }}>{fmt(objetivoDiario)}/día</strong>{' '}
                      durante los próximos <strong>{diasRest} días</strong>.
                      {totalCostos > 0 && <span style={{ color:'#94a3b8' }}>{' '}(Break-even: {fmt(breakEvenDiario)}/día para cubrir costos fijos)</span>}
                    </div>
                  )}
                  {restante === 0 && metaIngresos > 0 && (
                    <div style={{ background:'#E1F5EE', borderRadius:10, padding:'0.85rem 1rem', fontSize:14, color:'#085041', fontWeight:700, textAlign:'center' }}>
                      🎉 ¡Meta del mes cumplida!
                    </div>
                  )}
                </div>

                {/* Costos fijos */}
                <div style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:16, padding:'1.25rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontWeight:700, fontSize:15, color:'#0a1e3d' }}>Costos fijos</div>
                    <button onClick={() => setModalCosto(true)}
                      style={{ fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:8, border:'none', background:'#138A6B', color:'#fff', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                      + Agregar
                    </button>
                  </div>
                  {costos.length === 0
                    ? <div style={{ textAlign:'center', color:'#ccc', padding:'1.5rem', fontSize:13 }}>Sin costos registrados</div>
                    : costos.map((c, i) => (
                      <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom: i < costos.length - 1 ? '0.5px solid #f0f0f0' : 'none', opacity: c.activo ? 1 : 0.45 }}>
                        <input type="checkbox" checked={c.activo} onChange={() => toggleCosto(c.id, c.activo)} style={{ accentColor:'#138A6B', flexShrink:0, cursor:'pointer' }} />
                        <div style={{ flex:1, fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nombre}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:'#D85A30', flexShrink:0 }}>{fmt(c.monto)}</div>
                        <button onClick={() => eliminarCosto(c.id)} style={{ fontSize:12, padding:'2px 8px', borderRadius:6, border:'0.5px solid #e2e8f0', background:'#fff', color:'#D85A30', cursor:'pointer', fontFamily:'DM Sans, sans-serif', flexShrink:0 }}>×</button>
                      </div>
                    ))
                  }
                  {costos.length > 0 && (
                    <div style={{ borderTop:'1px solid #f0f0ee', paddingTop:10, marginTop:6, display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:13, fontWeight:600 }}>Total mensual</span>
                      <span style={{ fontSize:15, fontWeight:700, color:'#D85A30' }}>{fmt(totalCostos)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === 'caja' && (
            <div style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:16, padding:'1.25rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
                <div style={{ fontWeight:700, fontSize:18, color:'#0a1e3d' }}>Control de Caja</div>
                <div style={{ display:'flex', gap:10 }}>
                  <input type="date" value={fechaCaja} onChange={e => setFechaCaja(e.target.value)} style={{ ...inputSt, width: 'auto', padding: '5px 10px' }} />
                  <button onClick={() => { setFFecha(fechaCaja); setModalIngreso(true) }} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'none', background:'#10b981', color:'#fff', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>+ Ingreso</button>
                  <button onClick={() => { setFFecha(fechaCaja); setModalEgreso(true) }} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'none', background:'#ef4444', color:'#fff', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>- Egreso</button>
                </div>
              </div>

              {/* Ingresos List */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#10b981', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8, borderBottom:'1px solid #f0f0f0', paddingBottom:4 }}>Ingresos (+ {fmt(totalCitasDia + totalIngresosDia)})</div>
                {citasDia.length === 0 && ingresosDia.length === 0 && <div style={{ fontSize:13, color:'#94a3b8', padding:'8px 0' }}>Sin ingresos en este día</div>}
                
                {citasDia.map(c => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'0.5px solid #f0f0f0' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{c.pacientes?.nombre || 'Paciente'} <span style={{fontWeight:400, color:'#888'}}>({c.tipo_tratamiento})</span></div>
                      <div style={{ fontSize:11, color:'#aaa' }}>Turno Asistido</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      {editandoPrecio === c.id ? (
                        <>
                          <input type="number" autoFocus defaultValue={getPrecio(c)} onChange={e => setPrecioEdit(e.target.value === '' ? '' : Number(e.target.value))} style={{ width:90, fontSize:13, padding:'4px 8px', borderRadius:7, border:'1px solid #1D9E75', fontFamily:'DM Sans, sans-serif', textAlign:'right' }} />
                          <button onClick={() => precioEdit !== '' && guardarPrecioCita(c.id, precioEdit as number)} style={{ fontSize:11, padding:'4px 8px', borderRadius:6, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>✓</button>
                          <button onClick={() => setEditandoPrecio(null)} style={{ fontSize:11, padding:'4px 8px', borderRadius:6, border:'0.5px solid #e2e8f0', background:'#fff', color:'#888', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>×</button>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize:14, fontWeight:700, color: c.precio_cobrado !== null ? '#378ADD' : '#1D9E75' }}>{fmt(getPrecio(c))}</div>
                          <button onClick={() => { setEditandoPrecio(c.id); setPrecioEdit(getPrecio(c)) }} style={{ fontSize:11, padding:'2px 7px', borderRadius:5, border:'0.5px solid #e2e8f0', background:'#fff', color:'#94a3b8', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>✎</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                
                {ingresosDia.map(m => (
                  <div key={m.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'0.5px solid #f0f0f0' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{m.concepto}</div>
                      <div style={{ fontSize:11, color:'#aaa' }}>Ingreso Manual</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#378ADD' }}>{fmt(m.monto)}</div>
                      <button onClick={() => eliminarIngreso(m.id)} style={{ fontSize:12, padding:'2px 8px', borderRadius:6, border:'0.5px solid #e2e8f0', background:'#fff', color:'#D85A30', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>×</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Egresos List */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#ef4444', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8, borderBottom:'1px solid #f0f0f0', paddingBottom:4 }}>Egresos (- {fmt(totalEgresosDia)})</div>
                {egresosDia.length === 0 && <div style={{ fontSize:13, color:'#94a3b8', padding:'8px 0' }}>Sin egresos en este día</div>}
                
                {egresosDia.map(e => (
                  <div key={e.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'0.5px solid #f0f0f0' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{e.concepto}</div>
                      <div style={{ fontSize:11, color:'#aaa' }}>Gasto Diario</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#ef4444' }}>{fmt(e.monto)}</div>
                      <button onClick={() => eliminarEgreso(e.id)} style={{ fontSize:12, padding:'2px 8px', borderRadius:6, border:'0.5px solid #e2e8f0', background:'#fff', color:'#D85A30', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>×</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Balance */}
              <div style={{ background: cajaDia >= 0 ? '#ecfdf5' : '#fef2f2', padding: '1rem', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${cajaDia >= 0 ? '#10b981' : '#ef4444'}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: cajaDia >= 0 ? '#065f46' : '#991b1b' }}>CAJA FINAL DEL DÍA</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: cajaDia >= 0 ? '#10b981' : '#ef4444' }}>{fmt(cajaDia)}</div>
              </div>
            </div>
          )}

          {tab === 'deudores' && (
            <div style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:16, padding:'1.25rem' }}>
              <div style={{ fontWeight:700, fontSize:18, color:'#0a1e3d', marginBottom:16 }}>Pacientes con Saldo Pendiente</div>
              
              {deudores.length === 0 ? (
                <div style={{ textAlign:'center', color:'#94a3b8', padding:'3rem 1rem' }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>🎉</div>
                  <div style={{ fontSize:15, fontWeight:600, color:'#0f1e2b' }}>¡Excelente!</div>
                  <div style={{ fontSize:13 }}>No hay pacientes con deudas registradas.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
                  {deudores.map(c => {
                    const deuda = getDeuda(c)
                    const pac = c.pacientes
                    const mensaje = encodeURIComponent(`Hola ${pac?.nombre}, te escribo del consultorio para recordarte que quedó un saldo pendiente de ${fmt(deuda)} por tu tratamiento de ${c.tipo_tratamiento}. Por favor, avisame cómo lo vas a saldar. ¡Gracias!`)
                    const wpUrl = pac?.telefono ? `https://wa.me/${pac.telefono.replace(/\D/g, '')}?text=${mensaje}` : null

                    return (
                      <div key={c.id} style={{ display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', padding:'1rem', borderRadius:12, border:'1px solid #e2e8f0', background:'#f8fafc', gap:10 }}>
                        <div style={{ display: 'flex', flexDirection:'column', gap:4 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:'#0f1e2b' }}>{pac?.nombre}</div>
                          <div style={{ fontSize:12, color:'#64748b' }}>Tratamiento: <strong>{c.tipo_tratamiento}</strong> ({new Date(c.fecha_hora).toLocaleDateString('es-AR')})</div>
                          <div style={{ fontSize:12, color:'#64748b' }}>Costo Total: {fmt(c.valor ?? 0)} · Abonado: {fmt((c.sena ?? 0) + (c.precio_cobrado ?? 0))}</div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                          <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:11, fontWeight:700, color:'#ef4444', textTransform:'uppercase' }}>Deuda</div>
                            <div style={{ fontSize:18, fontWeight:800, color:'#ef4444' }}>{fmt(deuda)}</div>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                            {wpUrl && (
                              <a href={wpUrl} target="_blank" rel="noreferrer" style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, background:'#25D366', color:'#fff', textDecoration:'none', textAlign:'center' }}>
                                Reclamar
                              </a>
                            )}
                            <button onClick={() => saldarDeuda(c)} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#0f1e2b', cursor:'pointer' }}>
                              Saldar Deuda
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Modals */}
      {modalMeta && (
        <div onClick={() => setModalMeta(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'1.5rem', width:'100%', maxWidth:360, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a1e3d', marginBottom:'1rem' }}>Meta mensual — {MESES[mesActual - 1]}</div>
            <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Ingresos objetivo ($)</div>
            <input type="number" style={inputSt} value={fMeta} onChange={e => setFMeta(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Ej: 500000" autoFocus />
            <div style={{ display:'flex', gap:8, marginTop:'1.25rem', justifyContent:'flex-end' }}>
              <button onClick={() => setModalMeta(false)} style={{ fontSize:13, padding:'7px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>Cancelar</button>
              <button onClick={guardarMeta} disabled={saving} style={{ fontSize:13, fontWeight:600, padding:'7px 18px', borderRadius:8, border:'none', background: saving ? '#e2e8f0' : '#138A6B', color: saving ? '#94a3b8' : '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCosto && (
        <div onClick={() => setModalCosto(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'1.5rem', width:'100%', maxWidth:360, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a1e3d', marginBottom:'1rem' }}>Nuevo costo fijo</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Nombre *</div>
                <input style={inputSt} value={fCostoNombre} onChange={e => setFCostoNombre(e.target.value)} placeholder="Ej: Alquiler consultorio" autoFocus />
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Monto mensual ($) *</div>
                <input type="number" style={inputSt} value={fCostoMonto} onChange={e => setFCostoMonto(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Ej: 150000" />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:'1.25rem', justifyContent:'flex-end' }}>
              <button onClick={() => setModalCosto(false)} style={{ fontSize:13, padding:'7px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>Cancelar</button>
              <button onClick={agregarCosto} disabled={saving} style={{ fontSize:13, fontWeight:600, padding:'7px 18px', borderRadius:8, border:'none', background: saving ? '#e2e8f0' : '#138A6B', color: saving ? '#94a3b8' : '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}>
                {saving ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalIngreso && (
        <div onClick={() => setModalIngreso(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'1.5rem', width:'100%', maxWidth:360, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a1e3d', marginBottom:'1rem' }}>Registrar ingreso manual</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Concepto *</div>
                <input style={inputSt} value={fConcepto} onChange={e => setFConcepto(e.target.value)} placeholder="Ej: Pago efectivo extra" autoFocus />
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Monto ($) *</div>
                <input type="number" style={inputSt} value={fMonto} onChange={e => setFMonto(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Fecha</div>
                <input type="date" style={inputSt} value={fFecha} onChange={e => setFFecha(e.target.value)} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:'1.25rem', justifyContent:'flex-end' }}>
              <button onClick={() => setModalIngreso(false)} style={{ fontSize:13, padding:'7px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>Cancelar</button>
              <button onClick={agregarIngreso} disabled={saving} style={{ fontSize:13, fontWeight:600, padding:'7px 18px', borderRadius:8, border:'none', background: saving ? '#e2e8f0' : '#138A6B', color: saving ? '#94a3b8' : '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}>
                {saving ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEgreso && (
        <div onClick={() => setModalEgreso(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'1.5rem', width:'100%', maxWidth:360, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a1e3d', marginBottom:'1rem' }}>Registrar Gasto / Egreso</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Concepto *</div>
                <input style={inputSt} value={fConcepto} onChange={e => setFConcepto(e.target.value)} placeholder="Ej: Compra de guantes" autoFocus />
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Monto ($) *</div>
                <input type="number" style={inputSt} value={fMonto} onChange={e => setFMonto(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Fecha</div>
                <input type="date" style={inputSt} value={fFecha} onChange={e => setFFecha(e.target.value)} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:'1.25rem', justifyContent:'flex-end' }}>
              <button onClick={() => setModalEgreso(false)} style={{ fontSize:13, padding:'7px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>Cancelar</button>
              <button onClick={agregarEgreso} disabled={saving} style={{ fontSize:13, fontWeight:600, padding:'7px 18px', borderRadius:8, border:'none', background: saving ? '#e2e8f0' : '#ef4444', color: saving ? '#94a3b8' : '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}>
                {saving ? 'Guardando...' : 'Registrar Gasto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  )
}
