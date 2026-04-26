'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from '@/components/Sidebar'
import { useIsMobile } from '@/components/UI'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid, Legend
} from 'recharts'

interface Cita {
  id: string
  fecha_hora: string
  tipo_tratamiento: string
  estado: string
  valor: number | null
  sena: number | null
  saldo: number | null
  costo_insumos: number | null
  no_show: boolean | null
  duracion_minutos: number
}
interface CitaFact {
  fecha_hora: string
  tipo_tratamiento: string
  valor: number
  medio_pago: string | null
  estado: string
}

const COLORES = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']
const ESTADOS_COLOR: Record<string, string> = {
  completado: '#10b981', confirmado: '#6366f1',
  pendiente: '#f59e0b', cancelado: '#ef4444'
}

function fmt(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}
function pct(a: number, b: number) {
  return b === 0 ? 0 : Math.round((a / b) * 100)
}
function mesLabel(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}
function semanaLabel(fecha: string) {
  const d = new Date(fecha)
  const diff = d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1)
  const lunes = new Date(new Date(fecha).setDate(diff))
  return lunes.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

interface KPIProps {
  label: string; value: string; sub: string
  color?: string; trend?: number
}
function KPI({ label, value, sub, color, trend }: KPIProps) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '1.25rem 1.5rem',
      border: '1px solid #e8edf2', display: 'flex', flexDirection: 'column', gap: 6,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: isMobile ? 22 : 30, fontWeight: 700, color: color ?? '#0f1e2b', lineHeight: 1 }}>{value}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {trend !== undefined && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
            background: trend >= 0 ? '#d1fae5' : '#fee2e2',
            color: trend >= 0 ? '#065f46' : '#991b1b'
          }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</span>
      </div>
    </div>
  )
}

interface CardProps { title: string; children: React.ReactNode; height?: number }
function Card({ title, children, height }: CardProps) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '1.25rem 1.5rem',
      border: '1px solid #e8edf2', boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1e2b', marginBottom: '1rem' }}>{title}</div>
      <div style={{ height: height ?? 200 }}>{children}</div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e8edf2', borderRadius: 10, padding: '0.6rem 0.9rem', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#0f1e2b' }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color ?? '#64748b' }}>{p.name}: {typeof p.value === 'number' && p.value > 1000 ? fmt(p.value) : p.value}</div>
      ))}
    </div>
  )
}

export default function BiPage() {
  const supabase = createClient()
  const [citas, setCitas] = useState<Cita[]>([])
  const [loading, setLoading] = useState(true)
  const [rango, setRango] = useState<'30' | '90' | '365'>('90')
  const [tab, setTab] = useState<'overview' | 'tratamientos' | 'financiero' | 'facturacion'>('overview')
  const [mesFact, setMesFact] = useState(() => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0') })
  const [citasFact, setCitasFact] = useState<CitaFact[]>([])
  const [loadingFact, setLoadingFact] = useState(false)
  const isMobile = useIsMobile()
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.replace('/login')
    })
  }, [])

  useEffect(() => {
    if (tab !== 'facturacion') return
    async function loadFact() {
      setLoadingFact(true)
      const [y, m] = mesFact.split('-').map(Number)
      const ultimoDia = new Date(y, m, 0).getDate()
      const { data } = await supabase
        .from('citas')
        .select('fecha_hora,tipo_tratamiento,valor,medio_pago,estado')
        .gte('fecha_hora', `${mesFact}-01T00:00:00-03:00`)
        .lte('fecha_hora', `${mesFact}-${String(ultimoDia).padStart(2,'0')}T23:59:59-03:00`)
        .neq('estado', 'cancelado')
        .gt('valor', 0)
        .order('fecha_hora', { ascending: true })
      setCitasFact((data as CitaFact[]) ?? [])
      setLoadingFact(false)
    }
    loadFact()
  }, [tab, mesFact])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const desde = new Date()
      desde.setDate(desde.getDate() - parseInt(rango))
      const { data } = await supabase
        .from('citas')
        .select('id,fecha_hora,tipo_tratamiento,estado,valor,sena,saldo,costo_insumos,no_show,duracion_minutos')
        .gte('fecha_hora', desde.toISOString())
        .order('fecha_hora', { ascending: true })
      setCitas((data as Cita[]) ?? [])
      setLoading(false)
    }
    load()
  }, [rango])

  // ── Métricas ─────────────────────────────────────────────
  const total = citas.length
  const completadas = citas.filter(c => c.estado === 'confirmado').length
  const canceladas = citas.filter(c => c.estado === 'cancelado').length
  const noShows = citas.filter(c => c.no_show).length
  const ingresos = citas.reduce((s, c) => s + (c.valor ?? 0), 0)
  const saldoPendiente = citas.reduce((s, c) => s + (c.saldo ?? 0), 0)
  const costos = citas.reduce((s, c) => s + (c.costo_insumos ?? 0), 0)
  const gananciaNeta = ingresos - costos
  const tasaConversion = pct(completadas, total)
  const tasaNoShow = pct(noShows, total)
  const tasaCancelacion = pct(canceladas, total)
  const ticketPromedio = completadas > 0 ? ingresos / completadas : 0

  // ── Por estado ───────────────────────────────────────────
  const porEstado = ['confirmado', 'pendiente', 'cancelado'].map(e => ({
    name: e.charAt(0).toUpperCase() + e.slice(1),
    value: citas.filter(c => c.estado === e).length,
    color: ESTADOS_COLOR[e]
  })).filter(e => e.value > 0)

  // ── Por tratamiento ──────────────────────────────────────
  const tratMap: Record<string, { citas: number; ingresos: number; costos: number }> = {}
  citas.forEach(c => {
    if (!tratMap[c.tipo_tratamiento]) tratMap[c.tipo_tratamiento] = { citas: 0, ingresos: 0, costos: 0 }
    tratMap[c.tipo_tratamiento].citas++
    tratMap[c.tipo_tratamiento].ingresos += c.valor ?? 0
    tratMap[c.tipo_tratamiento].costos += c.costo_insumos ?? 0
  })
  const porTratamiento = Object.entries(tratMap)
    .map(([name, d]) => ({ name, ...d, margen: d.ingresos > 0 ? Math.round(((d.ingresos - d.costos) / d.ingresos) * 100) : 0 }))
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 7)

  // ── Por semana ───────────────────────────────────────────
  const semMap: Record<string, { citas: number; ingresos: number }> = {}
  citas.forEach(c => {
    const k = semanaLabel(c.fecha_hora)
    if (!semMap[k]) semMap[k] = { citas: 0, ingresos: 0 }
    semMap[k].citas++
    semMap[k].ingresos += c.valor ?? 0
  })
  const porSemana = Object.entries(semMap).map(([semana, d]) => ({ semana, ...d }))

  // ── Por mes ──────────────────────────────────────────────
  const mesMap: Record<string, { ingresos: number; citas: number; completadas: number }> = {}
  citas.forEach(c => {
    const k = mesLabel(c.fecha_hora)
    if (!mesMap[k]) mesMap[k] = { ingresos: 0, citas: 0, completadas: 0 }
    mesMap[k].ingresos += c.valor ?? 0
    mesMap[k].citas++
    if (c.estado === 'confirmado') mesMap[k].completadas++
  })
  const porMes = Object.entries(mesMap).map(([mes, d]) => ({ mes, ...d }))

  // ── Styles ───────────────────────────────────────────────
  const tabBtn = (t: typeof tab) => ({
    padding: isMobile ? '0.45rem 0.5rem' : '0.45rem 1rem', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: isMobile ? 12 : 13, fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
    background: tab === t ? '#0f1e2b' : 'transparent',
    color: tab === t ? '#fff' : '#64748b',
    transition: 'all 0.15s'
  } as React.CSSProperties)

  const rangoBtn = (r: typeof rango) => ({
    padding: '0.35rem 0.8rem', borderRadius: 7, border: '1px solid #e2e8f0', cursor: 'pointer',
    fontSize: 12, fontWeight: 500, fontFamily: 'DM Sans, sans-serif',
    background: rango === r ? '#0f1e2b' : '#fff',
    color: rango === r ? '#fff' : '#64748b',
  } as React.CSSProperties)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f4f7fb', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: isMobile ? '1rem' : '2rem', marginLeft: isMobile ? 0 : 240, minWidth: 0, overflowY: 'auto', paddingBottom: 80 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f1e2b' }}>Analítica del consultorio</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Métricas en tiempo real · actualizado ahora</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(['30', '90', '365'] as const).map(r => (
              <button key={r} onClick={() => setRango(r)} style={rangoBtn(r)}>
                {r === '30' ? '30 días' : r === '90' ? '3 meses' : '1 año'}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: '1.5rem', width: '100%' }}>
          {(['overview', 'tratamientos', 'financiero', 'facturacion'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ ...tabBtn(t), flex: 1, minWidth: 0 }}>
              {t === 'overview' ? 'Resumen' : t === 'tratamientos' ? 'Tratamientos' : t === 'financiero' ? 'Financiero' : 'Facturacion'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '5rem', gap: 12 }}>
            <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <span style={{ fontSize: 13, color: '#94a3b8' }}>Cargando métricas...</span>
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <>
                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: '1.25rem' }}>
                  <KPI label="Ingresos totales" value={fmt(ingresos)} sub="período seleccionado" color="#0f1e2b" />
                  <KPI label="Ganancia neta" value={fmt(gananciaNeta)} sub="descontando insumos" color={gananciaNeta >= 0 ? '#059669' : '#dc2626'} />
                  <KPI label="Ticket promedio" value={fmt(ticketPromedio)} sub="por cita completada" />
                  <KPI label="Saldo pendiente" value={fmt(saldoPendiente)} sub="por cobrar" color={saldoPendiente > 0 ? '#dc2626' : '#059669'} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: '1.5rem' }}>
                  <KPI label="Tasa de conversión" value={`${tasaConversion}%`} sub={`${completadas} completadas`} color={tasaConversion >= 70 ? '#059669' : '#d97706'} />
                  <KPI label="No-shows" value={`${tasaNoShow}%`} sub={`${noShows} inasistencias`} color={tasaNoShow > 10 ? '#dc2626' : '#64748b'} />
                  <KPI label="Cancelaciones" value={`${tasaCancelacion}%`} sub={`${canceladas} canceladas`} color={tasaCancelacion > 15 ? '#dc2626' : '#64748b'} />
                  <KPI label="Total citas" value={String(total)} sub="en el período" />
                </div>

                {/* Gráficos */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
                  <Card title="Citas por semana">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={porSemana} barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="citas" name="Citas" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>

                  <Card title="Estado de citas">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={porEstado} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} innerRadius={36}
                          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                          labelLine={false}>
                          {porEstado.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Card>
                </div>

                <Card title="Ingresos mensuales" height={220}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={porMes}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </>
            )}

            {tab === 'tratamientos' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
                  <Card title="Citas por tratamiento" height={260}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={porTratamiento} layout="vertical" barSize={14}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={isMobile ? 80 : 110} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="citas" name="Citas" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>

                  <Card title="Ingresos por tratamiento" height={260}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={porTratamiento} layout="vertical" barSize={14}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={isMobile ? 80 : 110} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>

                {/* Tabla de rentabilidad */}
                <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8edf2', overflow: 'visible', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 600, color: '#0f1e2b' }}>
                    Rentabilidad por tratamiento
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Tratamiento', 'Citas', 'Ingresos', 'Costos', 'Margen'].map(h => (
                          <th key={h} style={{ padding: '0.75rem 1.25rem', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {porTratamiento.map((t, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.85rem 1.25rem', fontWeight: 500, color: '#0f1e2b' }}>{t.name}</td>
                          <td style={{ padding: '0.85rem 1.25rem', color: '#64748b' }}>{t.citas}</td>
                          <td style={{ padding: '0.85rem 1.25rem', color: '#0f1e2b', fontWeight: 500 }}>{fmt(t.ingresos)}</td>
                          <td style={{ padding: '0.85rem 1.25rem', color: '#64748b' }}>{fmt(t.costos)}</td>
                          <td style={{ padding: '0.85rem 1.25rem' }}>
                            <span style={{
                              padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                              background: t.margen >= 60 ? '#d1fae5' : t.margen >= 30 ? '#fef3c7' : '#fee2e2',
                              color: t.margen >= 60 ? '#065f46' : t.margen >= 30 ? '#92400e' : '#991b1b'
                            }}>
                              {t.margen}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </>
            )}

            {tab === 'facturacion' && (() => {
              const totalFact = citasFact.reduce((s, c) => s + c.valor, 0)
              const subtotales: Record<string, number> = {}
              citasFact.forEach(c => {
                const mp = c.medio_pago ?? 'Sin especificar'
                subtotales[mp] = (subtotales[mp] ?? 0) + c.valor
              })
              function exportarCSV() {
                const headers = ['Fecha','Tratamiento','Monto','Medio de pago']
                const rows = citasFact.map(c => [
                  new Date(c.fecha_hora).toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric'}),
                  c.tipo_tratamiento,
                  c.valor,
                  c.medio_pago ?? ''
                ])
                const csv = [headers,...rows].map(r=>r.join(',')).join('\n')
                const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'})
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href=url; a.download=`facturacion-${mesFact}.csv`; a.click()
                URL.revokeObjectURL(url)
              }
              return (
                <>
                  {/* Filtro mes */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.25rem',flexWrap:'wrap',gap:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <label style={{fontSize:13,fontWeight:600,color:'#64748b'}}>Mes:</label>
                      <input type="month" value={mesFact} onChange={e=>setMesFact(e.target.value)} style={{fontSize:13,padding:'5px 10px',borderRadius:8,border:'1px solid #e2e8f0',fontFamily:'DM Sans, sans-serif',color:'#0f1e2b'}}/>
                    </div>
                    <button onClick={exportarCSV} disabled={citasFact.length===0} style={{fontSize:12,fontWeight:600,padding:'6px 16px',borderRadius:8,border:'none',background:citasFact.length===0?'#e2e8f0':'#0f1e2b',color:citasFact.length===0?'#94a3b8':'#fff',cursor:citasFact.length===0?'not-allowed':'pointer',fontFamily:'DM Sans, sans-serif'}}>
                      Exportar CSV
                    </button>
                  </div>
                  {loadingFact ? (
                    <div style={{display:'flex',justifyContent:'center',paddingTop:'3rem'}}>
                      <div style={{width:32,height:32,border:'3px solid #e2e8f0',borderTopColor:'#6366f1',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
                    </div>
                  ) : (
                    <div style={{background:'#fff',borderRadius:16,border:'1px solid #e8edf2',boxShadow:'0 1px 4px rgba(0,0,0,0.04)',overflow:'hidden'}}>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                          <thead>
                            <tr style={{background:'#f8fafc'}}>
                              {['Fecha','Tratamiento','Monto','Medio de pago'].map(h=>(
                                <th key={h} style={{padding:'0.75rem 1.25rem',textAlign:'left',fontWeight:600,color:'#64748b',fontSize:11,textTransform:'uppercase',letterSpacing:'0.05em'}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {citasFact.length === 0 ? (
                              <tr><td colSpan={4} style={{padding:'2rem',textAlign:'center',color:'#94a3b8',fontSize:13}}>Sin citas facturadas en este mes</td></tr>
                            ) : citasFact.map((c, i) => (
                              <tr key={i} style={{borderTop:'1px solid #f1f5f9'}}>
                                <td style={{padding:'0.75rem 1.25rem',color:'#64748b',whiteSpace:'nowrap'}}>{new Date(c.fecha_hora).toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric'})}</td>
                                <td style={{padding:'0.75rem 1.25rem',fontWeight:500,color:'#0f1e2b'}}>{c.tipo_tratamiento}</td>
                                <td style={{padding:'0.75rem 1.25rem',fontWeight:600,color:'#059669'}}>{fmt(c.valor)}</td>
                                <td style={{padding:'0.75rem 1.25rem',color:'#64748b'}}>{c.medio_pago ?? <span style={{color:'#cbd5e1'}}>—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                          {citasFact.length > 0 && (
                            <tfoot>
                              <tr style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc'}}>
                                <td colSpan={2} style={{padding:'0.85rem 1.25rem',fontWeight:700,color:'#0f1e2b',fontSize:13}}>Total del mes</td>
                                <td style={{padding:'0.85rem 1.25rem',fontWeight:700,color:'#059669',fontSize:14}}>{fmt(totalFact)}</td>
                                <td style={{padding:'0.85rem 1.25rem'}}>
                                  <div style={{display:'flex',flexDirection:'column',gap:2}}>
                                    {Object.entries(subtotales).sort((a,b)=>b[1]-a[1]).map(([mp,sub])=>(
                                      <span key={mp} style={{fontSize:11,color:'#64748b'}}>{mp}: <strong style={{color:'#0f1e2b'}}>{fmt(sub)}</strong></span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {tab === 'financiero' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: '1.5rem' }}>
                  <KPI label="Ingresos brutos" value={fmt(ingresos)} sub="período completo" />
                  <KPI label="Costos insumos" value={fmt(costos)} sub="gastos operativos" color="#dc2626" />
                  <KPI label="Ganancia neta" value={fmt(gananciaNeta)} sub="margen real" color={gananciaNeta >= 0 ? '#059669' : '#dc2626'} />
                  <KPI label="Margen neto" value={`${ingresos > 0 ? Math.round((gananciaNeta / ingresos) * 100) : 0}%`} sub="rentabilidad" color="#6366f1" />
                </div>

                <Card title="Ingresos vs Citas por mes" height={240}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porMes}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="ingresos" name="Ingresos" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="citas" name="Citas" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </>
            )}
          </>
        )}
      </main>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  )
}
