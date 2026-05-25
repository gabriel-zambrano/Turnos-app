'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, BtnPrimary, BtnSm, Spinner, inputCss, selectCss, textareaCss, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss, btnRedCss } from '@/components/UI'
import { initials } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'

interface Paciente {
  id: string
  nombre: string
  telefono: string
  email: string | null
  fecha_nacimiento: string | null
  ultimo_tratamiento: string | null
  creado_en: string
}

interface HistorialLog {
  id: string
  paciente_id: string
  diente: number
  estado: string
  notas: string | null
  creado_en: string
}

const DIENTES_SUPERIORES = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const DIENTES_INFERIORES = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

const ESTADOS_INFO: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  Sano:       { label: 'Sano', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', icon: '🟢' },
  Caries:     { label: 'Caries', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', icon: '🔴' },
  Corona:     { label: 'Corona', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', icon: '👑' },
  Endodoncia: { label: 'Endodoncia', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', icon: '⚡' },
  Implante:   { label: 'Implante', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', icon: '🔩' },
  Ausente:    { label: 'Ausente', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)', icon: '❌' },
}

const ToothSVG = ({ num, estado }: { num: number; estado: string }) => {
  const isUpper = num < 30
  
  // Determinar tipo de diente según el sistema FDI
  const unit = num % 10
  const isAnterior = unit <= 3
  const isPremolar = unit === 4 || unit === 5
  
  let dPath = ""
  if (isAnterior) {
    // Incisivo / Canino
    dPath = "M 11,2 C 11,1 13,0 16,0 C 19,0 21,1 21,2 L 20,12 C 19,16 18,19 16,30 C 14,19 13,16 12,12 Z"
  } else if (isPremolar) {
    // Premolar
    dPath = "M 9,3 C 9,1 12,0 16,1 C 20,0 23,1 23,3 L 22,12 C 21,15 20,17 19,23 L 18,30 C 18,31 17,31 16.5,25 L 15.5,25 C 15,31 14,31 14,30 L 13,23 C 12,17 11,15 10,12 Z"
  } else {
    // Molar
    dPath = "M 7,4 C 7,1 11,0 16,1 C 21,0 25,1 25,4 L 24,12 C 23,15 22,17 21.5,23 L 21,31 C 21,32 20,32 19,25 L 16.5,31 C 16,32 15,32 14.5,25 L 12,31 C 11,32 11,32 10.5,23 C 10,17 9,15 8,12 Z"
  }

  // Estilos del vector del diente
  let strokeColor = "var(--text-dark, #0a1e3d)"
  let fillColor = "none"
  let strokeWidth = 1.5

  if (estado === 'Sano') {
    strokeColor = "#10b981"
    fillColor = "rgba(16, 185, 129, 0.05)"
  } else if (estado === 'Caries') {
    strokeColor = "#ef4444"
    fillColor = "rgba(239, 68, 68, 0.15)"
    strokeWidth = 2
  } else if (estado === 'Corona') {
    strokeColor = "#f59e0b"
    fillColor = "rgba(245, 158, 11, 0.2)"
    strokeWidth = 2
  } else if (estado === 'Endodoncia') {
    strokeColor = "#3b82f6"
    fillColor = "rgba(59, 130, 246, 0.1)"
    strokeWidth = 2
  } else if (estado === 'Implante') {
    strokeColor = "#8b5cf6"
    fillColor = "rgba(139, 92, 246, 0.1)"
    strokeWidth = 2
  } else if (estado === 'Ausente') {
    strokeColor = "rgba(100, 116, 139, 0.3)"
    fillColor = "rgba(100, 116, 139, 0.05)"
  }

  return (
    <svg 
      width="32" 
      height="32" 
      viewBox="0 0 32 32" 
      style={{ 
        transform: isUpper ? 'scaleY(-1)' : 'none', 
        transformOrigin: 'center',
        overflow: 'visible'
      }}
    >
      {/* Silueta principal */}
      <path 
        d={dPath} 
        fill={fillColor} 
        stroke={strokeColor} 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />

      {/* Renders visuales de tratamiento */}
      {estado === 'Caries' && (
        <circle cx="16" cy="6" r="3.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
      )}

      {estado === 'Endodoncia' && (
        <path d="M 16,8 L 16,24" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
      )}

      {estado === 'Implante' && (
        <g stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round">
          <path d="M 12,16 L 20,16" />
          <path d="M 13,19 L 19,19" />
          <path d="M 13,22 L 19,22" />
          <path d="M 14,25 L 18,25" />
          <path d="M 15,28 L 17,28" />
        </g>
      )}

      {estado === 'Corona' && (
        <path 
          d={isAnterior ? "M 11,2 C 11,1 13,0 16,0 C 19,0 21,1 21,2 L 20,8 C 18,9 14,9 12,8 Z" : "M 7,4 C 7,1 11,0 16,1 C 21,0 25,1 25,4 L 24,9 C 22,10 10,10 8,9 Z"} 
          fill="#f59e0b" 
          opacity="0.85"
        />
      )}

      {estado === 'Ausente' && (
        <g stroke="#64748b" strokeWidth="2.5" strokeLinecap="round">
          <line x1="4" y1="4" x2="28" y2="28" />
          <line x1="28" y1="4" x2="4" y2="28" />
        </g>
      )}
    </svg>
  )
}

export default function PacienteDetalle() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { tenant, loading: tenantLoading } = useTenantContext()

  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [historial, setHistorial] = useState<HistorialLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: string } | null>(null)

  // Pieza dental seleccionada actualmente para visualización o edición
  const [dienteSel, setDienteSel] = useState<number | null>(null)
  const [nuevoEstado, setNuevoEstado] = useState<string>('Sano')
  const [notasEstado, setNotasEstado] = useState<string>('')
  const [modalRegistro, setModalRegistro] = useState(false)

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function showMsg(m: string, tipo = 'ok') {
    setToast({ msg: m, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  const loadData = useCallback(async () => {
    if (!tenant || !id) return
    setLoading(true)
    try {
      // 1. Cargar datos del paciente
      const { data: pacData, error: pacError } = await supabase
        .from('pacientes')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .single()

      if (pacError) throw pacError
      setPaciente(pacData as Paciente)

      // 2. Cargar historial dental
      const { data: histData, error: histError } = await supabase
        .from('historial_dental')
        .select('*')
        .eq('paciente_id', id)
        .eq('tenant_id', tenant.id)
        .order('creado_en', { ascending: false })

      if (histError) throw histError
      setHistorial(histData as HistorialLog[])
    } catch (err: any) {
      showMsg('Error al cargar datos: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [tenant, id])

  useEffect(() => {
    if (tenant) loadData()
  }, [loadData, tenant])

  // Obtener el estado actual de cada diente (último registro en el historial)
  const getDienteEstadoActual = (num: number) => {
    const logs = historial.filter(h => h.diente === num)
    if (logs.length === 0) return 'Sano'
    return logs[0].estado
  }

  const getDienteNotasActuales = (num: number) => {
    const logs = historial.filter(h => h.diente === num)
    if (logs.length === 0) return ''
    return logs[0].notas || ''
  }

  // Guardar nuevo registro de historial dental
  const registrarTratamiento = async () => {
    if (!dienteSel || !tenant || !paciente) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('historial_dental')
        .insert({
          paciente_id: paciente.id,
          diente: dienteSel,
          estado: nuevoEstado,
          notas: notasEstado.trim() || null,
          tenant_id: tenant.id
        })

      if (error) throw error

      showMsg(`Registro del diente ${dienteSel} actualizado ✓`)
      setModalRegistro(false)
      setNotasEstado('')
      loadData()
    } catch (err: any) {
      showMsg('Error al guardar: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToothClick = (num: number) => {
    setDienteSel(num)
    setNuevoEstado(getDienteEstadoActual(num))
    setNotasEstado(getDienteNotasActuales(num))
    setModalRegistro(true)
  }

  // Renderiza una celda de diente interactiva
  const renderTooth = (num: number) => {
    const estado = getDienteEstadoActual(num)
    const info = ESTADOS_INFO[estado] || ESTADOS_INFO.Sano
    const isSelected = dienteSel === num

    return (
      <button
        key={num}
        onClick={() => handleToothClick(num)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '8px 4px',
          borderRadius: 12,
          background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
          border: isSelected ? '2px solid #185FA5' : '1px solid var(--border-light)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          minWidth: 50,
          boxShadow: isSelected ? '0 4px 12px rgba(24,95,165,0.15)' : 'none',
        }}
        className="interactive-item"
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dark)' }}>{num}</span>
        <div style={{
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          <ToothSVG num={num} estado={estado} />
        </div>
        <span style={{ fontSize: 9, fontWeight: 600, color: info.color, textTransform: 'uppercase' }}>{info.label}</span>
      </button>
    )
  }

  // Calcular la edad a partir de la fecha de nacimiento
  const calcEdad = (fecha: string | null) => {
    if (!fecha) return '—'
    const hoy = new Date()
    const nac = new Date(fecha)
    let edad = hoy.getFullYear() - nac.getFullYear()
    const m = hoy.getMonth() - nac.getMonth()
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) {
      edad--
    }
    return `${edad} años`
  }

  if (tenantLoading || loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        <Sidebar />
        <main style={{ marginLeft: isMobile ? 0 : 240, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </main>
      </div>
    )
  }

  if (!paciente) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        <Sidebar />
        <main style={{ marginLeft: isMobile ? 0 : 240, flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-dark)' }}>Paciente no encontrado</div>
          <button style={{ ...btnDarkCss, marginTop: 16 }} onClick={() => router.push('/pacientes')}>Volver a Pacientes</button>
        </main>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ marginLeft: isMobile ? 0 : 240, flex: 1, paddingBottom: isMobile ? 80 : 24, minWidth: 0, overflowX: 'hidden' }}>
        <PageHeader
          title={`Ficha Clínica: ${paciente.nombre}`}
          sub="Historial clínico y Odontograma interactivo"
          right={
            <button style={btnLightCss} onClick={() => router.push('/pacientes')}>
              ← Pacientes
            </button>
          }
        />

        <div style={{ padding: isMobile ? '1rem' : '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>
          
          {/* Ficha General del Paciente */}
          <div className="glass-card" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20, alignItems: 'center' }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #185FA5, #378ADD)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 700,
              flexShrink: 0
            }}>
              {initials(paciente.nombre)}
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 16, width: '100%', textAlign: isMobile ? 'center' : 'left' }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Nombre Completo</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark)' }}>{paciente.nombre}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Teléfono</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-dark)' }}>{paciente.telefono}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Email</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{paciente.email || '—'}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Edad (Nacimiento)</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-dark)' }}>
                  {calcEdad(paciente.fecha_nacimiento)} {paciente.fecha_nacimiento ? `(${paciente.fecha_nacimiento})` : ''}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 20 }}>
            
            {/* Sección del Odontograma */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Odontograma Interactivo</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Selecciona una pieza dental para registrar tratamientos o modificar su estado.</p>
                </div>

                {/* Leyenda */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, borderBottom: '1px solid var(--border-light)', paddingBottom: 10 }}>
                  {Object.entries(ESTADOS_INFO).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{value.icon}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{value.label}</span>
                    </div>
                  ))}
                </div>

                {/* Arcada Superior */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, textAlign: 'center' }}>Arcada Superior (Maxilar)</div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(48px, 1fr))',
                    gap: 8,
                    background: 'var(--bg-input)',
                    padding: 10,
                    borderRadius: 14,
                    border: '1px solid var(--border-light)'
                  }}>
                    {DIENTES_SUPERIORES.map(renderTooth)}
                  </div>
                </div>

                {/* Arcada Inferior */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, textAlign: 'center' }}>Arcada Inferior (Mandíbula)</div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(48px, 1fr))',
                    gap: 8,
                    background: 'var(--bg-input)',
                    padding: 10,
                    borderRadius: 14,
                    border: '1px solid var(--border-light)'
                  }}>
                    {DIENTES_INFERIORES.map(renderTooth)}
                  </div>
                </div>
              </div>

              {/* Historial Completo Cronológico */}
              <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Historial Clínico Completo</h3>
                {historial.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>
                    No hay registros clínicos previos para este paciente.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-light)' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Fecha</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Diente</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Estado</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Detalles / Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.map((log) => {
                          const dateStr = new Date(log.creado_en).toLocaleDateString('es-AR', {
                            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })
                          const info = ESTADOS_INFO[log.estado] || ESTADOS_INFO.Sano
                          return (
                            <tr key={log.id} style={{ borderBottom: '1px solid var(--border-lighter)' }}>
                              <td style={{ padding: '10px 12px', color: 'var(--text-muted-darker)', whiteSpace: 'nowrap' }}>{dateStr}</td>
                              <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-dark)' }}>Diente {log.diente}</td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: info.bg, color: info.color }}>
                                  {log.estado}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', color: 'var(--text-dark)' }}>{log.notas || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Panel Lateral: Detalle Pieza & Registro de Tratamiento */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="glass-card" style={{ padding: '1.5rem', height: 'fit-content' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', marginBottom: 14 }}>
                  {dienteSel ? `Detalle Pieza Dental ${dienteSel}` : 'Selecciona una Pieza'}
                </h3>
                
                {dienteSel ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ background: 'var(--bg-input)', padding: 12, borderRadius: 12, border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>ESTADO ACTUAL</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 16 }}>{ESTADOS_INFO[getDienteEstadoActual(dienteSel)]?.icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: ESTADOS_INFO[getDienteEstadoActual(dienteSel)]?.color }}>
                          {getDienteEstadoActual(dienteSel)}
                        </span>
                      </div>
                      {getDienteNotasActuales(dienteSel) && (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dark)', fontStyle: 'italic' }}>
                          " {getDienteNotasActuales(dienteSel)} "
                        </div>
                      )}
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 14 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dark)', marginBottom: 10 }}>Registrar Evolución / Tratamiento</h4>
                      
                      <div style={groupCss}>
                        <label style={labelCss}>Nuevo Estado</label>
                        <select style={selectCss} value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}>
                          {Object.keys(ESTADOS_INFO).map(est => (
                            <option key={est} value={est}>{est}</option>
                          ))}
                        </select>
                      </div>

                      <div style={groupCss}>
                        <label style={labelCss}>Notas Clínicas</label>
                        <textarea
                          style={textareaCss}
                          value={notasEstado}
                          onChange={e => setNotasEstado(e.target.value)}
                          placeholder="Ej: Remoción de caries y obturación de composite..."
                        />
                      </div>

                      <button
                        style={{ ...btnDarkCss, width: '100%', marginTop: 8 }}
                        disabled={saving}
                        onClick={registrarTratamiento}
                      >
                        {saving ? 'Guardando...' : 'Guardar Tratamiento'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: 13 }}>
                    Haz clic en cualquier diente de la maqueta interactiva para ver su historial específico o registrar una nueva evolución clínica.
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* Modal para Mobile (para mejorar usabilidad) */}
      {modalRegistro && isMobile && dienteSel && (
        <div style={overlayCss(true)} onClick={() => setModalRegistro(false)}>
          <div style={modalCss(true)} onClick={e => e.stopPropagation()}>
            <div style={modalTitleCss}>Actualizar Diente {dienteSel}</div>
            
            <div style={groupCss}>
              <label style={labelCss}>Estado</label>
              <select style={selectCss} value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}>
                {Object.keys(ESTADOS_INFO).map(est => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </select>
            </div>

            <div style={groupCss}>
              <label style={labelCss}>Notas Clínicas</label>
              <textarea
                style={textareaCss}
                value={notasEstado}
                onChange={e => setNotasEstado(e.target.value)}
                placeholder="Notas sobre el estado actual o tratamiento..."
              />
            </div>

            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModalRegistro(false)} disabled={saving}>Cancelar</button>
              <button style={btnDarkCss} onClick={registrarTratamiento} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} isMobile={isMobile} />}
    </div>
  )
}
