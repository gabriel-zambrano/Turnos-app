'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { PageHeader, Badge, Spinner } from '@/components/UI'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'
import { normalizarTelefono } from '@/lib/constants'

interface LogDB { 
  id: string
  tipo_mensaje: string
  estado_envio: string
  mensaje_preview: string | null
  enviado_en: string | null
  citas: { fecha_hora: string; pacientes: { nombre: string } | null } | null 
}

export default function Recordatorios() {
  const supabase = createClient()
  const { tenant, loading: tenantLoading } = useTenantContext()
  
  const [activeTab, setActiveTab] = useState<'historial' | 'inactivos'>('historial')
  const [logs, setLogs] = useState<LogDB[]>([])
  const [inactivePacs, setInactivePacs] = useState<any[]>([])
  
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingInactivos, setLoadingInactivos] = useState(false)

  useEffect(() => { 
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check) 
  }, [])

  const load = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    const { data } = await supabase
      .from('recordatorios_log')
      .select('*, citas(fecha_hora, pacientes(nombre))')
      .order('creado_en', { ascending: false })
      .limit(50)
    
    if (data) setLogs(data as LogDB[])
    setLoading(false)
  }, [tenant])

  const loadInactivos = useCallback(async () => {
    if (!tenant) return
    setLoadingInactivos(true)
    try {
      // 1. Fetch patients with Ortodoncia or Implante
      const { data: pacs } = await supabase
        .from('pacientes')
        .select('id, nombre, telefono, ultimo_tratamiento, creado_en, token')
        .eq('tenant_id', tenant.id)
        .in('ultimo_tratamiento', ['Ortodoncia', 'Implante'])

      // 2. Fetch all completed/attended appointments
      const { data: appointments } = await supabase
        .from('citas')
        .select('paciente_id, fecha_hora, estado')
        .eq('tenant_id', tenant.id)
        .in('estado', ['confirmado', 'asistio'])

      if (pacs) {
        const sesentaDiasAgo = new Date()
        sesentaDiasAgo.setDate(sesentaDiasAgo.getDate() - 60)
        
        const rawAppointments = appointments || []

        const computed = pacs.filter(p => {
          const pacCitas = rawAppointments.filter(c => c.paciente_id === p.id)
          if (pacCitas.length === 0) return true
          
          const latestCita = pacCitas.reduce((latest, c) => {
            const cDate = new Date(c.fecha_hora)
            return cDate > latest ? cDate : latest
          }, new Date(0))
          
          return latestCita < sesentaDiasAgo
        }).map(p => {
          const pacCitas = rawAppointments.filter(c => c.paciente_id === p.id)
          const latestCita = pacCitas.reduce((latest, c) => {
            const cDate = new Date(c.fecha_hora)
            return cDate > latest ? cDate : latest
          }, new Date(0))
          
          const daysInactive = latestCita.getTime() === 0
            ? Math.round((Date.now() - new Date(p.creado_en).getTime()) / (1000 * 60 * 60 * 24))
            : Math.round((Date.now() - latestCita.getTime()) / (1000 * 60 * 60 * 24))

          return {
            ...p,
            daysInactive,
            lastCitaDate: latestCita.getTime() === 0 ? null : latestCita.toLocaleDateString('es-AR')
          }
        }).sort((a, b) => b.daysInactive - a.daysInactive)

        setInactivePacs(computed)
      }
    } catch (err) {
      console.error('Error cargando inactivos:', err)
    } finally {
      setLoadingInactivos(false)
    }
  }, [tenant])

  useEffect(() => {
    if (tenant) {
      if (activeTab === 'historial') load()
      else if (activeTab === 'inactivos') loadInactivos()
    }
  }, [tenant, activeTab, load, loadInactivos])

  const reactivarPaciente = (p: any) => {
    if (!tenant) return
    const clinicName = tenant.nombre || 'DentalDesk'
    const text = `Hola ${p.nombre}, hace ${p.daysInactive} días no realizas tu control de ${p.ultimo_tratamiento}. Es muy importante para el éxito de tu tratamiento retomar los controles periódicos. ¿Te gustaría agendar un turno esta semana? - ${clinicName}`
    const num = normalizarTelefono(p.telefono)
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const primaryColor = tenant?.primaryColor || '#0a1e3d'
  const secondaryColor = tenant?.secondaryColor || '#185FA5'
  const accentColor = tenant?.accentColor || '#138A6B'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex: 1, background: 'transparent', paddingBottom: isMobile ? 80 : 0, minWidth: 0, overflowX: 'hidden' }}>
        <PageHeader title="Recordatorios & Reactivación" />
        <div style={{ padding: isMobile ? '0.75rem' : '1.75rem 2rem', maxWidth: 1100 }}>
          
          {/* Tab Selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', borderBottom: '1px solid var(--border-light, #dde5ef)', paddingBottom: 10 }}>
            <button
              onClick={() => setActiveTab('historial')}
              style={{
                background: 'none', border: 'none',
                padding: '8px 16px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                color: activeTab === 'historial' ? secondaryColor : 'var(--text-muted, #8fa3bc)',
                borderBottom: activeTab === 'historial' ? `3px solid ${secondaryColor}` : '3px solid transparent',
                transition: 'all 0.2s ease'
              }}
            >
              Log de Envíos
            </button>
            <button
              onClick={() => setActiveTab('inactivos')}
              style={{
                background: 'none', border: 'none',
                padding: '8px 16px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                color: activeTab === 'inactivos' ? secondaryColor : 'var(--text-muted, #8fa3bc)',
                borderBottom: activeTab === 'inactivos' ? `3px solid ${secondaryColor}` : '3px solid transparent',
                transition: 'all 0.2s ease',
                display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              <span>Pacientes Inactivos</span>
              {inactivePacs.length > 0 && activeTab !== 'inactivos' && (
                <span style={{ fontSize: 10, background: '#DC2626', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>
                  {inactivePacs.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'historial' ? (
            <>
              <div style={{ background: '#fff', border: '0.5px solid #e8e8e8', borderRadius: 16, padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Cron automático</div>
                <p style={{ fontSize: 13, color: '#666', lineHeight: 1.7, margin: 0 }}>Cada mañana a las <strong>8:00 AM</strong> se envían WhatsApp personalizados a pacientes con citas en las próximas 24 horas. Si el paciente responde <strong>SI</strong>, la cita se confirma automáticamente.</p>
                <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', background: '#f8f8f8', borderRadius: 10, fontSize: 12, color: '#888', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                  Cron: 0 8 * * * → supabase/functions/enviar-recordatorios
                </div>
              </div>
              
              {loading ? <Spinner /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {logs.length === 0 && <div style={{ textAlign: 'center', color: '#ccc', padding: '2rem', fontSize: 13 }}>Sin envíos registrados aún.</div>}
                  {logs.map(l => {
                    const nombre = l.citas?.pacientes?.nombre ?? '—'
                    const hora = l.enviado_en ? new Date(l.enviado_en).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
                    const enviado = l.estado_envio === 'enviado'
                    return (
                      <div key={l.id} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 12, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: enviado ? '#1D9E75' : '#D85A30' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</div>
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{l.tipo_mensaje} · {hora}</div>
                          {l.mensaje_preview && <div style={{ fontSize: 11, color: '#999', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.mensaje_preview}</div>}
                        </div>
                        <Badge bg={enviado ? '#E1F5EE' : '#FAECE7'} color={enviado ? '#085041' : '#712B13'}>{l.estado_envio}</Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ background: '#fff', border: '0.5px solid #e8e8e8', borderRadius: 16, padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Reactivación de Ortodoncia & Implantes</div>
                <p style={{ fontSize: 13, color: '#666', lineHeight: 1.7, margin: 0 }}>
                  Listado de pacientes con tratamientos activos críticos que <strong>llevan más de 60 días sin asistir</strong> a un control. Se recomienda enviarles un mensaje personalizado para reactivar su tratamiento.
                </p>
              </div>

              {loadingInactivos ? <Spinner /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {inactivePacs.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#ccc', padding: '3rem 2rem', background: '#fff', border: '1px dashed #ddd', borderRadius: 16, fontSize: 13 }}>
                      🎉 ¡Excelente! No hay pacientes inactivos de Ortodoncia o Implantes en este momento.
                    </div>
                  )}
                  {inactivePacs.map(p => {
                    const isUrgent = p.daysInactive >= 90
                    return (
                      <div
                        key={p.id}
                        style={{
                          background: '#fff',
                          border: '1.5px solid var(--border-light, #dde5ef)',
                          borderRadius: 14,
                          padding: '1.1rem 1.4rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 14,
                          boxShadow: '0 2px 10px rgba(10,30,61,0.02)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 38, height: 38, borderRadius: '50%',
                            background: isUrgent ? '#FEE2E2' : '#FEF3C7',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16, fontWeight: 700,
                            color: isUrgent ? '#EF4444' : '#F59E0B'
                          }}>
                            👤
                          </div>
                          <div>
                            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-dark, #0a1e3d)' }}>{p.nombre}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted, #8fa3bc)', marginTop: 2 }}>
                              Tratamiento: <strong>{p.ultimo_tratamiento}</strong> · Último control: <strong>{p.lastCitaDate || 'Nunca'}</strong>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: 20,
                            background: isUrgent ? '#FEE2E2' : '#FEF3C7',
                            color: isUrgent ? '#B91C1C' : '#B45309'
                          }}>
                            {isUrgent ? `🚨 Urgente: ${p.daysInactive} días inactivo` : `⚠️ Alta: ${p.daysInactive} días inactivo`}
                          </span>
                          
                          <button
                            onClick={() => reactivarPaciente(p)}
                            style={{
                              background: '#25D366',
                              border: 'none',
                              color: '#fff',
                              padding: '6px 14px',
                              borderRadius: 8,
                              fontSize: 12.5,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              fontFamily: 'DM Sans, sans-serif',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#20ba5a'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#25D366'}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.66.986 3.288 1.488 4.905 1.489 5.5.003 9.975-4.47 9.979-9.967.002-2.662-1.033-5.166-2.915-7.05C16.734 1.744 14.236.703 11.58.701c-5.503 0-9.98 4.47-9.985 9.969-.001 1.776.48 3.5 1.391 5.01L1.93 21.72l6.147-1.611-.43-.255z"/></svg>
                            Reactivar
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

        </div>
      </main>
    </div>
  )
}
