'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Toast, Spinner, PageHeader } from '@/components/UI'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'

interface Paciente {
  id: string
  nombre: string
  telefono: string
  fecha_nacimiento: string | null
}

interface Cita {
  id: string
  fecha_hora: string
  estado: string
  paciente_id: string
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function CRMPage() {
  const supabase = createClient()
  const { tenant, loading: tenantLoading } = useTenantContext()
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; tipo: string } | null>(null)
  
  const [tab, setTab] = useState<'cumples' | 'reactivacion'>('cumples')

  const [cumpleaneros, setCumpleaneros] = useState<Paciente[]>([])
  const [inactivos, setInactivos] = useState<(Paciente & { ultima_visita: string })[]>([])

  const now = new Date()
  const mesActual = now.getMonth() + 1 // 1-12
  
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

  const load = useCallback(async () => {
    if (!tenant) return
    setLoading(true)

    // Traemos pacientes y citas
    const [resPac, resCitas] = await Promise.all([
      supabase.from('pacientes').select('id, nombre, telefono, fecha_nacimiento').eq('tenant_id', tenant.id),
      supabase.from('citas').select('id, fecha_hora, estado, paciente_id').eq('tenant_id', tenant.id).order('fecha_hora', { ascending: false })
    ])

    if (resPac.data) {
      const pacientes = resPac.data as Paciente[]
      const citas = (resCitas.data || []) as Cita[]

      // 1. Cumpleaños del mes actual
      const cumples = pacientes.filter(p => {
        if (!p.fecha_nacimiento) return false
        // Asume formato YYYY-MM-DD
        const [y, m, d] = p.fecha_nacimiento.split('-')
        return parseInt(m, 10) === mesActual
      }).sort((a, b) => {
        const dA = parseInt(a.fecha_nacimiento!.split('-')[2], 10)
        const dB = parseInt(b.fecha_nacimiento!.split('-')[2], 10)
        return dA - dB
      })
      setCumpleaneros(cumples)

      // 2. Pacientes Inactivos (> 6 meses)
      const ahoraIso = now.toISOString()
      const seisMesesAtras = new Date()
      seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6)
      const seisMesesAtrasIso = seisMesesAtras.toISOString()

      const mapCitas = new Map<string, Cita[]>()
      citas.forEach(c => {
        if (!mapCitas.has(c.paciente_id)) mapCitas.set(c.paciente_id, [])
        mapCitas.get(c.paciente_id)!.push(c)
      })

      const listInactivos: (Paciente & { ultima_visita: string })[] = []
      
      pacientes.forEach(p => {
        const citasPac = mapCitas.get(p.id) || []
        // Tiene cita futura?
        const tieneFutura = citasPac.some(c => c.fecha_hora > ahoraIso && ['pendiente', 'confirmado'].includes(c.estado))
        if (tieneFutura) return // Si tiene turno, no está inactivo

        // Buscar la cita pasada más reciente que haya asistido/completado
        const citasPasadas = citasPac.filter(c => c.fecha_hora <= ahoraIso && ['asistio', 'completado'].includes(c.estado))
        if (citasPasadas.length > 0) {
          const ultimaCita = citasPasadas[0] // Ya están ordenadas desc en la query
          if (ultimaCita.fecha_hora < seisMesesAtrasIso) {
            listInactivos.push({
              ...p,
              ultima_visita: ultimaCita.fecha_hora
            })
          }
        }
      })

      setInactivos(listInactivos)
    }

    setLoading(false)
  }, [tenant, mesActual])

  useEffect(() => { if (tenant) load() }, [load, tenant])

  if (tenantLoading || loading) return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner /></main>
    </div>
  )

  const tabBtn = (t: typeof tab) => ({
    padding: '0.45rem 1.25rem', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
    background: tab === t ? '#0f1e2b' : 'transparent',
    color: tab === t ? '#fff' : '#64748b',
    transition: 'all 0.15s'
  })

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'DM Sans, sans-serif', background:'#f4f7fb' }}>
      <Sidebar />
      <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex:1, paddingBottom: isMobile ? 80 : 0, minWidth:0, overflowX:'hidden' }}>
        <PageHeader title="CRM y Fidelización" sub="Retención Inteligente" />

        <div style={{ padding: isMobile ? '1rem' : '1.75rem 2rem', maxWidth:900, margin:'0 auto' }}>
          
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: '1.5rem', width: 'fit-content' }}>
            <button onClick={() => setTab('cumples')} style={tabBtn('cumples')}>
              🎉 Cumpleaños <span style={{background:'#3b82f6', color:'#fff', padding:'2px 6px', borderRadius:10, fontSize:10, marginLeft:6}}>{cumpleaneros.length}</span>
            </button>
            <button onClick={() => setTab('reactivacion')} style={tabBtn('reactivacion')}>
              ⏰ Reactivación <span style={{background:'#ef4444', color:'#fff', padding:'2px 6px', borderRadius:10, fontSize:10, marginLeft:6}}>{inactivos.length}</span>
            </button>
          </div>

          {tab === 'cumples' && (
            <div style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:16, padding:'1.25rem' }}>
              <div style={{ fontWeight:700, fontSize:18, color:'#0a1e3d', marginBottom:16 }}>Cumpleañeros de {MESES[mesActual - 1]}</div>
              <p style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>Sorprendé a tus pacientes enviándoles un saludo cálido o un pequeño descuento para que vuelvan a sonreír.</p>

              {cumpleaneros.length === 0 ? (
                <div style={{ textAlign:'center', color:'#94a3b8', padding:'3rem 1rem' }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>🎂</div>
                  <div style={{ fontSize:15, fontWeight:600, color:'#0f1e2b' }}>No hay cumpleaños este mes</div>
                  <div style={{ fontSize:13 }}>Buscamos en la base, pero nadie cumple en {MESES[mesActual - 1]}.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {cumpleaneros.map(p => {
                    const d = parseInt(p.fecha_nacimiento!.split('-')[2], 10)
                    const m = parseInt(p.fecha_nacimiento!.split('-')[1], 10)
                    const diaTexto = `${d} de ${MESES[m - 1]}`
                    const isHoy = d === now.getDate() && m === mesActual

                    const mensaje = encodeURIComponent(`¡Hola ${p.nombre}! Feliz cumpleaños te deseamos de todo el consultorio 🥳. ¡Esperamos que pases un día hermoso!`)
                    const wpUrl = p.telefono ? `https://wa.me/${p.telefono.replace(/\D/g, '')}?text=${mensaje}` : null

                    return (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem', borderRadius:12, border: isHoy ? '1px solid #3b82f6' : '1px solid #e2e8f0', background: isHoy ? '#eff6ff' : '#f8fafc' }}>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700, color:'#0f1e2b' }}>{p.nombre} {isHoy && '🎈'}</div>
                          <div style={{ fontSize:12, color: isHoy ? '#2563eb' : '#64748b', fontWeight: isHoy ? 600 : 400 }}>{isHoy ? 'Cumple hoy!' : `Cumple el ${diaTexto}`}</div>
                        </div>
                        {wpUrl ? (
                          <a href={wpUrl} target="_blank" rel="noreferrer" style={{ fontSize:12, fontWeight:600, padding:'6px 14px', borderRadius:8, background:'#25D366', color:'#fff', textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            Saludar
                          </a>
                        ) : (
                          <span style={{ fontSize:11, color:'#94a3b8' }}>Sin teléfono</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'reactivacion' && (
            <div style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:16, padding:'1.25rem' }}>
              <div style={{ fontWeight:700, fontSize:18, color:'#0a1e3d', marginBottom:16 }}>Reactivación de Pacientes (Inactivos)</div>
              <p style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>Estos pacientes vinieron por última vez hace más de 6 meses y no tienen nuevos turnos agendados. ¡Ideal para invitar a un control!</p>

              {inactivos.length === 0 ? (
                <div style={{ textAlign:'center', color:'#94a3b8', padding:'3rem 1rem' }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>✨</div>
                  <div style={{ fontSize:15, fontWeight:600, color:'#0f1e2b' }}>Agenda súper activa</div>
                  <div style={{ fontSize:13 }}>No hay pacientes inactivos desde hace más de 6 meses.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {inactivos.map(p => {
                    const ultimaVisitaStr = new Date(p.ultima_visita).toLocaleDateString('es-AR', { year:'numeric', month:'short' })
                    const mensaje = encodeURIComponent(`¡Hola ${p.nombre}! ¿Cómo estás? Te escribimos del consultorio porque notamos que hace un tiempito no nos vemos (última visita: ${ultimaVisitaStr}). Recordá que es súper importante hacer un control y limpieza dental cada 6 meses para prevenir problemas. ¿Querés que te agende un turno para estos días?`)
                    const wpUrl = p.telefono ? `https://wa.me/${p.telefono.replace(/\D/g, '')}?text=${mensaje}` : null

                    return (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem', borderRadius:12, border:'1px solid #e2e8f0', background:'#f8fafc' }}>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700, color:'#0f1e2b' }}>{p.nombre}</div>
                          <div style={{ fontSize:12, color:'#ef4444', fontWeight:600 }}>Última visita: {ultimaVisitaStr}</div>
                        </div>
                        {wpUrl ? (
                          <a href={wpUrl} target="_blank" rel="noreferrer" style={{ fontSize:12, fontWeight:600, padding:'6px 14px', borderRadius:8, background:'#25D366', color:'#fff', textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
                            Invitar
                          </a>
                        ) : (
                          <span style={{ fontSize:11, color:'#94a3b8' }}>Sin teléfono</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </main>
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  )
}
