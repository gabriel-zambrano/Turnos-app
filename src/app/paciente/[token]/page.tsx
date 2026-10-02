'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { SuccessModal } from '@/components/SuccessModal'
import { ProgressRing } from '@/components/ProgressRing'
import { FIDELIZACION_HABILITADA } from '@/lib/fidelizacion-flag'
import { SignaturePad } from '@/components/SignaturePad'
import { TEXTO_CONSENTIMIENTO_DATOS } from '@/lib/consentimiento-datos'

interface Turno {
  id: string
  fecha_hora: string
  tipo_tratamiento: string
  estado: string
  duracion_minutos: number
  notes: string | null
}

interface Paciente {
  id: string
  nombre: string
  telefono: string
  dni_cuit?: string | null
  alergias?: string | null
  antecedentes?: string | null
  consentimiento_datos_en?: string | null
  consentimiento_datos_ver?: string | null
  progreso_plan_porcentaje?: number
  puntos?: number
  recomendaciones?: string | null
}


interface TenantBranding {
  id: string
  nombre: string
  direccion: string
  telefono: string
  logoUrl?: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  whatsappTemplate: string
}

/* Sin rojo, a propósito.
   En la app del odontólogo el rojo hace falta: un turno caído o una deuda
   tienen que alarmar, porque hay alguien que debe reaccionar. Acá el que mira
   es el paciente, mirando su propio turno, y no hay nada que pueda hacer con
   la alarma salvo asustarse. El ámbar dice "esto no siguió adelante" sin
   decir "algo salió mal". Los valores son los mismos que ya usa
   `--est-pendiente-*` en globals.css. */
const ESTADO_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pendiente:  { bg: '#FFF3CD', color: '#856404', label: 'Pendiente' },
  confirmado: { bg: '#D1E7DD', color: '#0A3622', label: 'Confirmado' },
  cancelado:  { bg: '#FAEEDA', color: '#633806', label: 'Cancelado' },
  completado: { bg: '#E2E3E5', color: '#41464B', label: 'Completado' },
}

function formatFecha(fechaHora: string) {
  const dt = new Date(fechaHora)
  const ar = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const hora = String(ar.getHours()).padStart(2,'0') + ':' + String(ar.getMinutes()).padStart(2,'0')
  return {
    dia: dias[ar.getDay()],
    fecha: ar.getDate() + ' de ' + meses[ar.getMonth()],
    hora,
    full: dias[ar.getDay()] + ' ' + ar.getDate() + ' de ' + meses[ar.getMonth()] + ' a las ' + hora + 'hs'
  }
}

function formatCountdown(fechaHora: string): string | null {
  const dt = new Date(fechaHora).getTime()
  const now = Date.now()
  const diffMs = dt - now
  if (diffMs < 0) return null
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays === 0) {
    if (diffHours === 0) {
      const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)))
      return `En ${diffMins} min`
    }
    return `Hoy (en ${diffHours} h)`
  }
  if (diffDays === 1) return 'Mañana'
  if (diffDays < 7) return `En ${diffDays} días`
  const weeks = Math.floor(diffDays / 7)
  return `En ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`
}

function obtenerSaludo() {
  const hora = new Date().getHours()
  if (hora >= 6 && hora < 12) return 'Buenos días'
  if (hora >= 12 && hora < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function PacientePage() {
  const { token } = useParams<{ token: string }>()
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [tenant, setTenant] = useState<TenantBranding | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [accion, setAccion] = useState<{id:string, tipo:'confirmado'|'cancelado'} | null>(null)
  const [reproConfirm, setReproConfirm] = useState<Turno | null>(null)
  
  const [pastTurnos, setPastTurnos] = useState<any[]>([])
  const [fotos, setFotos] = useState<any[]>([])
  const [feedbackPendiente, setFeedbackPendiente] = useState<any>(null)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [dolor, setDolor] = useState<number>(3)
  const [satisfaccion, setSatisfaccion] = useState<number>(5)
  const [comentario, setComentario] = useState<string>('')
  const [sendingFeedback, setSendingFeedback] = useState(false)
  const [tabActiva, setTabActiva] = useState<'turnos' | 'tratamiento'>('turnos')

  // Estado para Anamnesis y Consentimiento Digital (Leyes 25.326 y 26.529)
  const [consentimientoFirmado, setConsentimientoFirmado] = useState<{ id: string; titulo: string; firmado_en: string; hash_sha256?: string } | null>(null)
  const [showAnamnesisModal, setShowAnamnesisModal] = useState(false)
  const [anamnesisStep, setAnamnesisStep] = useState<1 | 2 | 3 | 4>(1)
  const [alergiasSeleccionadas, setAlergiasSeleccionadas] = useState<string[]>([])
  const [otraAlergia, setOtraAlergia] = useState('')
  const [condicionesSeleccionadas, setCondicionesSeleccionadas] = useState<string[]>([])
  const [otraCondicion, setOtraCondicion] = useState('')
  const [medicacionHabitual, setMedicacionHabitual] = useState('')
  const [contactoEmergencia, setContactoEmergencia] = useState('')
  const [dniPaciente, setDniPaciente] = useState('')
  const [aceptaConsentimiento, setAceptaConsentimiento] = useState(false)
  const [verTextoLegalCompleto, setVerTextoLegalCompleto] = useState(false)
  const [firmaDigital, setFirmaDigital] = useState<string | null>(null)
  const [enviandoAnamnesis, setEnviandoAnamnesis] = useState(false)
  const [anamnesisError, setAnamnesisError] = useState('')
  const [successModal, setSuccessModal] = useState<{
    open: boolean
    badge?: string
    title: string
    description: string
    detail?: string
    detailIcon?: string
  } | null>(null)

  function toggleAlergia(alergia: string) {
    if (alergia === 'Ninguna alergia conocida') {
      setAlergiasSeleccionadas(['Ninguna alergia conocida'])
      setOtraAlergia('')
      return
    }
    setAlergiasSeleccionadas(prev => {
      const sinNinguna = prev.filter(x => x !== 'Ninguna alergia conocida')
      if (sinNinguna.includes(alergia)) {
        return sinNinguna.filter(x => x !== alergia)
      } else {
        return [...sinNinguna, alergia]
      }
    })
  }

  function toggleCondicion(cond: string) {
    if (cond === 'Ninguna condición previa') {
      setCondicionesSeleccionadas(['Ninguna condición previa'])
      setOtraCondicion('')
      return
    }
    setCondicionesSeleccionadas(prev => {
      const sinNinguna = prev.filter(x => x !== 'Ninguna condición previa')
      if (sinNinguna.includes(cond)) {
        return sinNinguna.filter(x => x !== cond)
      } else {
        return [...sinNinguna, cond]
      }
    })
  }

  function abrirModalAnamnesis() {
    setAnamnesisError('')
    setAnamnesisStep(1)
    if (paciente?.dni_cuit) setDniPaciente(paciente.dni_cuit)
    if (paciente?.alergias && paciente.alergias !== 'Ninguna') {
      setOtraAlergia(paciente.alergias)
    }
    if (paciente?.antecedentes && paciente.antecedentes !== 'Ninguno') {
      setOtraCondicion(paciente.antecedentes)
    }
    setShowAnamnesisModal(true)
  }

  async function enviarAnamnesis() {
    if (!dniPaciente.trim()) {
      setAnamnesisError('Ingresá tu DNI o número de documento.')
      setAnamnesisStep(3)
      return
    }
    if (!aceptaConsentimiento) {
      setAnamnesisError('Debés marcar el casillero de consentimiento legal para continuar.')
      setAnamnesisStep(3)
      return
    }
    if (!firmaDigital) {
      setAnamnesisError('Por favor firmá en el recuadro para validar tu declaración.')
      setAnamnesisStep(4)
      return
    }

    setEnviandoAnamnesis(true)
    setAnamnesisError('')
    try {
      const alergiasList = alergiasSeleccionadas.filter(x => x !== 'Ninguna alergia conocida')
      if (otraAlergia.trim()) alergiasList.push(otraAlergia.trim())
      const alergiasTexto = alergiasList.length > 0 ? alergiasList.join(', ') : 'Ninguna'

      const condList = condicionesSeleccionadas.filter(x => x !== 'Ninguna condición previa')
      if (otraCondicion.trim()) condList.push(otraCondicion.trim())
      const condTexto = condList.length > 0 ? condList.join(', ') : 'Ninguna'

      const res = await fetch(`/api/paciente/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dni: dniPaciente.trim(),
          alergias: alergiasTexto,
          antecedentes: condTexto,
          medicacionHabitual: medicacionHabitual.trim(),
          contactoEmergencia: contactoEmergencia.trim(),
          aceptaConsentimiento: true,
          firmaPng: firmaDigital,
        })
      })

      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al guardar la declaración.')

      setShowAnamnesisModal(false)
      setSuccessModal({
        open: true,
        badge: 'FICHA Y CONSENTIMIENTO AL DÍA',
        title: '¡Declaración jurada guardada con éxito!',
        description: 'Tus antecedentes de salud y el consentimiento para tu atención médica quedaron registrados y protegidos con tu firma digital.',
        detail: 'Documento sellado digitalmente conforme a las Leyes 25.326 y 26.529 con huella de integridad SHA-256 e IP de auditoría.',
        detailIcon: '🔒',
      })
      setPaciente(prev => prev ? {
        ...prev,
        dni_cuit: d.paciente.dni_cuit,
        alergias: d.paciente.alergias,
        antecedentes: d.paciente.antecedentes,
        consentimiento_datos_en: d.paciente.consentimiento_datos_en,
        consentimiento_datos_ver: d.paciente.consentimiento_datos_ver,
      } : null)
      if (d.consentimiento) {
        setConsentimientoFirmado(d.consentimiento)
      }
    } catch (err: any) {
      setAnamnesisError(err.message || 'Error al guardar.')
    } finally {
      setEnviandoAnamnesis(false)
    }
  }

  async function cambiarEstado(citaId: string, nuevoEstado: 'confirmado' | 'cancelado') {
    setAccion({ id: citaId, tipo: nuevoEstado })
    await fetch(`/api/paciente/${token}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citaId, estado: nuevoEstado }),
    })
    setTurnos(prev => prev.map(t => t.id === citaId ? { ...t, estado: nuevoEstado } : t))
    setAccion(null)
  }

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/paciente/${token}`)
      if (!res.ok) { setError(true); setLoading(false); return }
      const data = await res.json()
      setPaciente(data.paciente)
      if (data.paciente?.dni_cuit) {
        setDniPaciente(data.paciente.dni_cuit)
      }
      setConsentimientoFirmado(data.consentimientoFirmado || null)
      setTurnos(data.turnos)
      setPastTurnos(data.pastTurnos || [])
      setFotos(data.fotos || [])
      setFeedbackPendiente(data.feedbackPendiente || null)
      if (data.feedbackPendiente) {
        setShowFeedbackModal(true)
      }
      setTenant(data.tenant)
      setLoading(false)
    }
    load()
  }, [token])

  async function enviarFeedback() {
    if (!feedbackPendiente) return
    setSendingFeedback(true)
    try {
      const res = await fetch(`/api/paciente/${token}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dolor,
          satisfaccion,
          comentario,
          citaId: feedbackPendiente.cita_id
        })
      })
      if (res.ok) {
        setFeedbackPendiente(null)
        setShowFeedbackModal(false)
        setSuccessModal({
          open: true,
          badge: 'CONTROL POST-VISITA',
          title: '¡Muchas gracias por tus respuestas!',
          description: 'Tu valoración y estado fueron informados a tu odontólogo para acompañar tu recuperación tras la consulta.',
          detail: 'Agradecemos tu tiempo. Tus comentarios nos ayudan a seguir brindando una atención médica de excelencia.',
          detailIcon: '✨',
        })
      } else {
        const d = await res.json()
        alert('Error: ' + d.error)
      }
    } catch (e) {
      console.error(e)
      alert('Error de conexión')
    }
    setSendingFeedback(false)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', justifyContent:'center', padding: '2.5rem 1.25rem', fontFamily:'DM Sans, system-ui', background: '#f4f7fb' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Skeleton Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="skeleton-shimmer" style={{ width: 140, height: 28, borderRadius: 8, margin: '0 auto' }} />
        </div>
        {/* Skeleton Avatar & Saludo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div className="skeleton-shimmer" style={{ width: 72, height: 72, borderRadius: 24, margin: '0 auto 16px' }} />
          <div className="skeleton-shimmer" style={{ width: 100, height: 14, borderRadius: 6, margin: '0 auto 8px' }} />
          <div className="skeleton-shimmer" style={{ width: 180, height: 26, borderRadius: 8, margin: '0 auto' }} />
        </div>
        {/* Skeleton Ticket Card */}
        <div style={{ borderRadius: 22, padding: '1.5rem', background: '#fff', border: '1px solid rgba(15,30,61,0.06)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div className="skeleton-shimmer" style={{ width: 110, height: 22, borderRadius: 12 }} />
            <div className="skeleton-shimmer" style={{ width: 80, height: 22, borderRadius: 12 }} />
          </div>
          <div className="skeleton-shimmer" style={{ width: '65%', height: 24, borderRadius: 8, marginBottom: 10 }} />
          <div className="skeleton-shimmer" style={{ width: '40%', height: 16, borderRadius: 6, marginBottom: 20 }} />
          <div className="skeleton-shimmer" style={{ width: '100%', height: 46, borderRadius: 14 }} />
        </div>
      </div>
      <style>{`
        .skeleton-shimmer {
          background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.6s infinite ease-in-out;
        }
        @keyframes skeleton-loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans, system-ui', background:'#f8fafc' }}>
      <div style={{ textAlign:'center', maxWidth:380, padding:'2.5rem 2rem', background:'#fff', borderRadius:24, boxShadow:'0 10px 30px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)' }}>
        {/* Ámbar y no rojo: el link venció, que es lo más común y no es culpa
            de nadie. Y el ícono es un reloj y no un signo de exclamación, por
            lo mismo. */}
        <div style={{ fontSize:48, marginBottom:20, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'rgba(239, 159, 39, 0.10)', color: '#EF9F27', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 7 12 12 15 14"/></svg>
          </div>
        </div>
        <div style={{ fontSize:19, fontWeight:800, color:'#0a1e3d', letterSpacing: '-0.01em' }}>Enlace de turno no válido</div>
        <div style={{ color:'#64748b', marginTop:10, fontSize:14, lineHeight:1.6 }}>Por favor ponte en contacto con tu consultorio para que te envíe un nuevo enlace de acceso.</div>
      </div>
    </div>
  )

  const primaryColor = tenant?.primaryColor || '#0a1e3d'
  const secondaryColor = tenant?.secondaryColor || '#185FA5'
  const accentColor = tenant?.accentColor || '#138A6B'

  const isOrtodoncia = (paciente?.progreso_plan_porcentaje && paciente.progreso_plan_porcentaje > 0) || 
                       pastTurnos.some(t => t.tipo_tratamiento.toLowerCase().includes('ortodoncia')) || 
                       turnos.some(t => t.tipo_tratamiento.toLowerCase().includes('ortodoncia'))
  const isPrimeraVez = pastTurnos.length === 0
  const hasTratamientoOVisitas = isOrtodoncia || pastTurnos.length > 0 || fotos.length > 0 || !!paciente?.recomendaciones || !!paciente?.consentimiento_datos_en || !!paciente?.alergias

  const getMesesTranscurridos = () => {
    if (pastTurnos.length === 0) return 1
    const firstCita = new Date(pastTurnos[pastTurnos.length - 1].fecha_hora)
    const now = new Date()
    const diffYears = now.getFullYear() - firstCita.getFullYear()
    const diffMonths = now.getMonth() - firstCita.getMonth()
    return Math.max(1, diffYears * 12 + diffMonths)
  }

  const getEstimadoMesesRestantes = () => {
    const pct = paciente?.progreso_plan_porcentaje || 0
    if (pct <= 0) return null
    if (pct >= 100) return 'Tratamiento completado'
    const elapsed = getMesesTranscurridos()
    const remaining = Math.max(1, Math.round(elapsed * (100 - pct) / pct))
    return `~${remaining} meses estimados restantes`
  }

  return (
    <div className="portal-wrapper">
      <div className="portal-container">
        
        {/* Logo de la Clínica */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.nombre || 'Logo clínica'} style={{ height: 56, objectFit: 'contain', borderRadius: 12 }} />
          ) : (
            <div style={{ fontSize: 16, fontWeight: 800, color: primaryColor, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {tenant?.nombre || 'DentalDesk'}
            </div>
          )}
        </div>

        <div className="portal-layout">
          
          <div className="portal-column-main">
            {/* Encabezado Paciente */}
            <div style={{ textAlign:'center', marginBottom:'2.5rem' }}>
              <div style={{ 
                width: 72, 
                height: 72, 
                borderRadius: '24px', 
                background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})`, 
                color: '#fff', 
                fontSize: 30, 
                fontWeight: 800, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                margin: '0 auto 16px', 
                boxShadow: `0 10px 25px ${secondaryColor}25`,
                transform: 'rotate(-4deg)',
                transition: 'transform 0.3s'
              }} 
              onMouseEnter={e => e.currentTarget.style.transform = 'rotate(0deg)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'rotate(-4deg)'}
              >
                {paciente?.nombre ? paciente.nombre.charAt(0).toUpperCase() : 'M'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                {obtenerSaludo()},
              </div>
              <h1 style={{ fontSize:23, fontWeight:800, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em', margin:0 }}>{paciente?.nombre}</h1>
              <div style={{ display: 'inline-block', padding: '4px 12px', background: `${secondaryColor}10`, color: secondaryColor, fontSize: 13, fontWeight: 700, borderRadius: 20, marginTop: 8 }}>
                {paciente?.progreso_plan_porcentaje && paciente.progreso_plan_porcentaje > 0 
                  ? `${turnos[0]?.tipo_tratamiento || pastTurnos[0]?.tipo_tratamiento || 'Ortodoncia'} activa · ${getMesesTranscurridos()} meses`
                  : 'Consulta General'}
              </div>
            </div>

            {/* Banner de Feedback Pendiente */}
            {feedbackPendiente && !showFeedbackModal && (
              <div 
                onClick={() => setShowFeedbackModal(true)}
                style={{ 
                  background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})`, 
                  color: '#fff', 
                  borderRadius: 22, 
                  padding: '1.25rem', 
                  marginBottom: 24, 
                  cursor: 'pointer',
                  boxShadow: `0 8px 24px ${secondaryColor}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.015)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.9 }}>Control Post-Visita</div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>¿Cómo te sientes tras tu turno de {feedbackPendiente.tipo_tratamiento}?</div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Ayúdanos a cuidarte respondiendo 3 breves preguntas.</div>
                </div>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.4))' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
            )}

            {/* Tarjeta de Acción: Declaración Jurada de Salud y Consentimiento Digital */}
            {!paciente?.consentimiento_datos_en && (
              <div 
                className="patient-card"
                style={{
                  background: 'linear-gradient(135deg, rgba(15, 76, 92, 0.05) 0%, rgba(24, 95, 165, 0.04) 100%)',
                  borderRadius: 22,
                  padding: '1.35rem 1.25rem',
                  marginBottom: 24,
                  border: '1.5px solid rgba(15, 76, 92, 0.16)',
                  boxShadow: '0 10px 28px -6px rgba(15, 76, 92, 0.08)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: `${primaryColor}14`,
                    color: primaryColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    flexShrink: 0
                  }}>
                    📋
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Requisito Clínico Obligatorio
                      </span>
                      <span className="pulse-dot-amber" />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text-primary)', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                      Declaración de Salud y Consentimiento
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                      Completá tu declaración de alergias, antecedentes y firma digital antes de tu turno (Ley 25.326 y 26.529).
                    </div>
                    <button
                      onClick={abrirModalAnamnesis}
                      style={{
                        marginTop: 14,
                        padding: '10px 18px',
                        background: `linear-gradient(135deg, ${primaryColor}, #0F5145)`,
                        color: '#ffffff',
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: `0 4px 14px ${primaryColor}28`,
                        transition: 'transform 0.2s',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                    >
                      <span>✍️ Completar y firmar ahora (2 min)</span>
                      <span>&rarr;</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Badge de Verificación: Ficha de salud y consentimiento al día */}
            {paciente?.consentimiento_datos_en && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 16,
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.22)',
                  marginBottom: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🛡️</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: '#065F46' }}>
                      Ficha de salud y consentimiento al día
                    </div>
                    <div style={{ fontSize: 11.5, color: '#047857', marginTop: 1 }}>
                      Firmado digitalmente el {new Date(paciente.consentimiento_datos_en).toLocaleDateString('es-AR')}
                    </div>
                  </div>
                </div>
                {consentimientoFirmado && (
                  <a
                    href={`/api/consentimientos/pdf/${consentimientoFirmado.id}?token=${token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#065F46',
                      textDecoration: 'none',
                      padding: '5px 12px',
                      borderRadius: 10,
                      background: '#ffffff',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}
                  >
                    <span>📄</span>
                    <span>Ver PDF</span>
                  </a>
                )}
              </div>
            )}

            {/* Switcher de Pestañas Dinámicas si tiene historial o tratamiento */}
            {hasTratamientoOVisitas && (
              <div style={{
                display: 'flex',
                background: 'rgba(10, 37, 64, 0.04)',
                padding: 4,
                borderRadius: 16,
                marginBottom: 24,
                border: '1px solid rgba(10, 37, 64, 0.06)'
              }}>
                <button
                  type="button"
                  onClick={() => setTabActiva('turnos')}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background: tabActiva === 'turnos' ? '#ffffff' : 'transparent',
                    color: tabActiva === 'turnos' ? primaryColor : 'var(--portal-text-muted)',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    boxShadow: tabActiva === 'turnos' ? '0 2px 8px rgba(10,37,64,0.08)' : 'none',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <span>🗓️</span>
                  <span>Próximo Turno</span>
                  {turnos.length > 0 && (
                    <span style={{
                      background: tabActiva === 'turnos' ? `${accentColor}18` : 'rgba(10,37,64,0.06)',
                      color: tabActiva === 'turnos' ? accentColor : 'var(--portal-text-muted)',
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 8,
                      fontWeight: 800
                    }}>
                      {turnos.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTabActiva('tratamiento')}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background: tabActiva === 'tratamiento' ? '#ffffff' : 'transparent',
                    color: tabActiva === 'tratamiento' ? primaryColor : 'var(--portal-text-muted)',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    boxShadow: tabActiva === 'tratamiento' ? '0 2px 8px rgba(10,37,64,0.08)' : 'none',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <span>📈</span>
                  <span>Ficha e Historial</span>
                  {pastTurnos.length > 0 && (
                    <span style={{
                      background: tabActiva === 'tratamiento' ? `${secondaryColor}18` : 'rgba(10,37,64,0.06)',
                      color: tabActiva === 'tratamiento' ? secondaryColor : 'var(--portal-text-muted)',
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 8,
                      fontWeight: 800
                    }}>
                      {pastTurnos.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* VISTA 1: PRÓXIMOS TURNOS */}
            {tabActiva === 'turnos' && (
              <div>
                {turnos.length > 0 ? (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3 style={{ fontSize:13, fontWeight:800, color:'var(--portal-text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                        Próximo turno
                      </h3>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Pase digital
                      </span>
                    </div>

                    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                      {turnos.map(t => {
                        const { dia, fecha, hora } = formatFecha(t.fecha_hora)
                        const countdown = formatCountdown(t.fecha_hora)
                        return (
                          <div
                            key={t.id}
                            className="patient-card"
                            style={{
                              borderRadius: 24,
                              padding: '1.75rem 1.5rem',
                              background: 'var(--portal-card-bg)',
                              border: '1px solid var(--portal-card-border)',
                              boxShadow: '0 16px 36px -12px rgba(10,37,64,0.08), 0 2px 8px rgba(10,37,64,0.02)',
                              position: 'relative',
                              overflow: 'hidden',
                            }}
                          >
                            {/* Cabecera de la tarjeta: Clínica y Badge en Vivo */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(10,37,64,0.05)' }}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: accentColor }} />
                                {tenant?.nombre || 'Consultorio Dental'}
                              </div>
                              
                              <div>
                                {t.estado === 'confirmado' ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, background: '#E0F2F1', color: '#085041', padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(16,185,129,0.2)' }}>
                                    <span className="pulse-dot-green" />
                                    Confirmado
                                  </span>
                                ) : (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(245,158,11,0.2)' }}>
                                    <span className="pulse-dot-amber" />
                                    Pendiente
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Countdown pill si existe */}
                            {countdown && (
                              <div style={{ marginBottom: 10 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, background: `${secondaryColor}12`, color: secondaryColor, padding: '3px 10px', borderRadius: 20 }}>
                                  ⏱️ {countdown}
                                </span>
                              </div>
                            )}

                            {/* Fecha y Hora Tabular */}
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--portal-text-secondary)', textTransform: 'capitalize', letterSpacing: '-0.01em' }}>
                                {dia}, {fecha}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                                <span className="kpi-numeral" style={{ fontSize: 44, fontWeight: 800, color: 'var(--portal-text-primary)', letterSpacing: '-0.03em', fontFamily: "'SFMono-Regular', Menlo, Monaco, Consolas, monospace", lineHeight: 1 }}>
                                  {hora}
                                </span>
                                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--portal-text-muted)' }}>hs</span>
                              </div>

                              {/* Chip de Tratamiento */}
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '5px 12px', borderRadius: 20, background: `${secondaryColor}10`, color: secondaryColor, fontSize: 13, fontWeight: 700, border: `1px solid ${secondaryColor}20` }}>
                                <span>🦷</span>
                                <span>{t.tipo_tratamiento}</span>
                                <span style={{ opacity: 0.6, fontSize: 11.5 }}>· {t.duracion_minutos} min</span>
                              </div>
                            </div>

                            {/* Tarjeta de Dirección y Maps */}
                            {tenant?.direccion && (
                              <div style={{ padding: '10px 14px', background: 'rgba(10,37,64,0.02)', borderRadius: 14, marginBottom: 16, border: '1px solid rgba(10,37,64,0.05)' }}>
                                <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>📍</span>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tenant.direccion}</span>
                                </div>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.direccion)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11.5, color: secondaryColor, fontWeight: 700, textDecoration: 'none' }}
                                >
                                  Cómo llegar en Google Maps &rarr;
                                </a>
                              </div>
                            )}

                            {/* Botones de Acción */}
                            {t.estado === 'pendiente' ? (
                              <div style={{ display:'flex', flexDirection: 'column', gap:10 }}>
                                <div style={{ display:'flex', gap:10 }}>
                                  <button
                                    onClick={() => cambiarEstado(t.id, 'confirmado')}
                                    disabled={accion?.id===t.id}
                                    style={{ 
                                      flex:1, 
                                      fontSize:14, 
                                      padding:'13px', 
                                      borderRadius:14, 
                                      border:'none', 
                                      background: `linear-gradient(135deg, ${accentColor}, #0F5145)`, 
                                      color: '#fff', 
                                      cursor:'pointer', 
                                      fontWeight:700, 
                                      fontFamily:'DM Sans, system-ui', 
                                      boxShadow: `0 6px 18px ${accentColor}35`, 
                                      transition:'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 6
                                    }}
                                    onMouseEnter={e => {
                                      e.currentTarget.style.transform = 'translateY(-1px)'
                                      e.currentTarget.style.boxShadow = `0 8px 22px ${accentColor}45`
                                    }}
                                    onMouseLeave={e => {
                                      e.currentTarget.style.transform = 'none'
                                      e.currentTarget.style.boxShadow = `0 6px 18px ${accentColor}35`
                                    }}
                                  >
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    {accion?.id===t.id ? 'Confirmando...' : 'Confirmar mi turno'}
                                  </button>
                                  <button
                                    onClick={() => setReproConfirm(t)}
                                    disabled={accion?.id===t.id}
                                    style={{ 
                                      flex:1, 
                                      fontSize:14, 
                                      padding:'13px', 
                                      borderRadius:14, 
                                      border:`1px solid ${secondaryColor}25`, 
                                      background: `${secondaryColor}0a`, 
                                      color: secondaryColor, 
                                      cursor:'pointer', 
                                      fontWeight:600, 
                                      fontFamily:'DM Sans, system-ui', 
                                      transition:'all 0.2s' 
                                    }}
                                    onMouseEnter={e => {
                                      e.currentTarget.style.background = `${secondaryColor}14`
                                      e.currentTarget.style.borderColor = `${secondaryColor}40`
                                    }}
                                    onMouseLeave={e => {
                                      e.currentTarget.style.background = `${secondaryColor}0a`
                                      e.currentTarget.style.borderColor = `${secondaryColor}25`
                                    }}
                                  >
                                    Reprogramar
                                  </button>
                                </div>
                                <a
                                  href={`/api/ics?cita=${t.id}&token=${token}`}
                                  style={{ 
                                    width:'100%',
                                    boxSizing:'border-box',
                                    textDecoration:'none',
                                    minHeight:44,
                                    fontSize:13, 
                                    padding:'11px', 
                                    borderRadius:14, 
                                    border:'1px solid var(--portal-card-border)', 
                                    background: 'transparent', 
                                    color: 'var(--portal-text-secondary)', 
                                    cursor:'pointer', 
                                    fontWeight:600, 
                                    fontFamily:'DM Sans, system-ui', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    gap: 8, 
                                    transition: 'all 0.2s' 
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.background = 'rgba(10,30,61,0.03)'
                                    e.currentTarget.style.borderColor = 'rgba(10,30,61,0.12)'
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.borderColor = 'var(--portal-card-border)'
                                  }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                  Agregar a mi calendario
                                </a>
                              </div>
                            ) : (
                              <div style={{ display:'flex', flexDirection: 'column', gap:10 }}>
                                <div style={{ display:'flex', gap:10 }}>
                                  <div
                                    style={{ 
                                      flex:1, 
                                      fontSize:14, 
                                      padding:'13px', 
                                      borderRadius:14, 
                                      background: '#E0F2F1', 
                                      border: '1px solid rgba(16,185,129,0.25)', 
                                      color: '#085041', 
                                      fontWeight:700, 
                                      fontFamily:'DM Sans, system-ui', 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center', 
                                      gap: 6 
                                    }}
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    Turno Confirmado
                                  </div>
                                  <button
                                    onClick={() => setReproConfirm(t)}
                                    style={{ 
                                      flex:1, 
                                      fontSize:14, 
                                      padding:'13px', 
                                      borderRadius:14, 
                                      border:`1px solid ${secondaryColor}25`, 
                                      background: `${secondaryColor}0a`, 
                                      color: secondaryColor, 
                                      cursor:'pointer', 
                                      fontWeight:600, 
                                      fontFamily:'DM Sans, system-ui', 
                                      transition:'all 0.2s' 
                                    }}
                                    onMouseEnter={e => {
                                      e.currentTarget.style.background = `${secondaryColor}14`
                                      e.currentTarget.style.borderColor = `${secondaryColor}40`
                                    }}
                                    onMouseLeave={e => {
                                      e.currentTarget.style.background = `${secondaryColor}0a`
                                      e.currentTarget.style.borderColor = `${secondaryColor}25`
                                    }}
                                  >
                                    Reprogramar
                                  </button>
                                </div>
                                <a
                                  href={`/api/ics?cita=${t.id}&token=${token}`}
                                  style={{ 
                                    width:'100%',
                                    boxSizing:'border-box',
                                    textDecoration:'none',
                                    minHeight:44,
                                    fontSize:13, 
                                    padding:'11px', 
                                    borderRadius:14, 
                                    border:'1px solid var(--portal-card-border)', 
                                    background: 'transparent', 
                                    color: 'var(--portal-text-secondary)', 
                                    cursor:'pointer', 
                                    fontWeight:600, 
                                    fontFamily:'DM Sans, system-ui', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    gap: 8, 
                                    transition: 'all 0.2s' 
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.background = 'rgba(10,30,61,0.03)'
                                    e.currentTarget.style.borderColor = 'rgba(10,30,61,0.12)'
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.borderColor = 'var(--portal-card-border)'
                                  }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                  Agregar a mi calendario
                                </a>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="patient-card" style={{ borderRadius: 24, padding: '2.5rem 1.75rem', textAlign: 'center', background: 'var(--portal-card-bg)', marginBottom: 28, border: '1px solid var(--portal-card-border)' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${secondaryColor}10`, color: secondaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--portal-text-primary)', letterSpacing: '-0.01em' }}>
                      No tenés turnos programados
                    </div>
                    <div style={{ fontSize: 13.5, color: 'var(--portal-text-muted)', marginTop: 6, lineHeight: 1.55 }}>
                      ¿Listo para tu próxima visita o control? Podés comunicarte con tu consultorio para coordinar un horario en minutos.
                    </div>
                    {tenant?.telefono && (
                      <div style={{ marginTop: 18 }}>
                        <a
                          href={`https://wa.me/${tenant.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Quisiera solicitar un turno en ${tenant.nombre}. Mi nombre es ${paciente?.nombre || ''}.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '11px 20px',
                            background: accentColor,
                            color: '#fff',
                            borderRadius: 14,
                            fontSize: 13.5,
                            fontWeight: 700,
                            textDecoration: 'none',
                            boxShadow: `0 4px 14px ${accentColor}30`,
                            transition: 'all 0.2s',
                          }}
                        >
                          Pedir turno por WhatsApp &rarr;
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Banner de acceso rápido a ficha médica */}
                {hasTratamientoOVisitas && (
                  <div
                    onClick={() => setTabActiva('tratamiento')}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 18,
                      background: `${secondaryColor}0c`,
                      border: `1px solid ${secondaryColor}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      marginBottom: 24,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>📈</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text-primary)' }}>
                          Ver mi ficha clínica e historial
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginTop: 2 }}>
                          Progreso, fotos, indicaciones y visitas pasadas
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 16, color: secondaryColor, fontWeight: 800 }}>&rarr;</span>
                  </div>
                )}

                {/* Engagement para Pacientes No Ortodoncia / Primera Vez */}
                {!isOrtodoncia && isPrimeraVez && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ marginBottom: 16, textAlign: 'center' }}>
                      <div style={{ display: 'inline-block', padding: '5px 12px', background: `${accentColor}12`, color: accentColor, borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                        ¡Te esperamos!
                      </div>
                      <p style={{ color: 'var(--portal-text-secondary)', fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>
                        Conocé por qué nuestros pacientes nos eligen cada día.
                      </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="patient-card" style={{ padding: '14px 16px', borderRadius: 18, background: 'var(--portal-card-bg)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text-primary)' }}>4.9 en Google Reviews</div>
                          <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 3, lineHeight: 1.45 }}>
                            Atención personalizada y calidez humana. Priorizamos tu comodidad.
                          </div>
                        </div>
                      </div>

                      <div className="patient-card" style={{ padding: '14px 16px', borderRadius: 18, background: 'var(--portal-card-bg)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: `${accentColor}12`, color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text-primary)' }}>Turnos puntuales</div>
                          <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 3, lineHeight: 1.45 }}>
                            Tu tiempo vale: organizamos los turnos con precisión para evitar demoras.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VISTA 2: TRATAMIENTO E HISTORIAL */}
            {tabActiva === 'tratamiento' && (
              <div>
                {/* Puntos VIP si están habilitados */}
                {FIDELIZACION_HABILITADA && paciente && (
                  <div className="patient-card" style={{ 
                    padding: '1.25rem', 
                    borderRadius: 20, 
                    background: 'var(--portal-card-bg)', 
                    marginBottom: 24,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    borderLeft: `4px solid #EAB308`
                  }}>
                    <div style={{ 
                      width: 44, 
                      height: 44, 
                      borderRadius: '50%', 
                      background: 'rgba(234, 179, 8, 0.1)', 
                      color: '#EAB308', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      flexShrink: 0 
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Puntos acumulados</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em' }}>
                          {paciente.puntos ?? 0}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#EAB308', textTransform: 'uppercase', letterSpacing: '0.02em' }}>puntos vip</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                        ¡Seguí asistiendo a tus citas para sumar más y canjearlos por premios!
                      </div>
                    </div>
                  </div>
                )}

                {/* Indicaciones del Odontólogo */}
                {paciente?.recomendaciones && (
                  <div className="patient-card" style={{ 
                    padding: '1.25rem', 
                    borderRadius: 20, 
                    background: 'var(--portal-card-bg)', 
                    marginBottom: 24,
                    borderLeft: `4px solid ${accentColor}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ 
                        width: 28, 
                        height: 28, 
                        borderRadius: '50%', 
                        background: `${accentColor}12`, 
                        color: accentColor, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Indicaciones de tu Odontólogo
                      </span>
                    </div>
                    <p style={{ color: 'var(--portal-text-secondary)', fontSize: 13.5, lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                      "{paciente.recomendaciones}"
                    </p>
                  </div>
                )}

                {/* Ficha Médica y Declaración Jurada de Salud */}
                <div className="patient-card" style={{ 
                  padding: '1.35rem 1.25rem', 
                  borderRadius: 20, 
                  background: 'var(--portal-card-bg)', 
                  marginBottom: 24,
                  borderLeft: `4px solid ${primaryColor}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ 
                        width: 28, 
                        height: 28, 
                        borderRadius: '50%', 
                        background: `${primaryColor}14`, 
                        color: primaryColor, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontSize: 14
                      }}>
                        📋
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Ficha de Salud y Consentimiento
                      </span>
                    </div>
                    {paciente?.consentimiento_datos_en ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#065F46', background: '#D1FAE5', padding: '2px 8px', borderRadius: 12 }}>
                        ✓ Al día
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 12 }}>
                        Pendiente
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--portal-text-secondary)' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Alergias manifestadas
                      </div>
                      <div style={{ marginTop: 2, fontWeight: 600, color: paciente?.alergias && paciente.alergias !== 'Ninguna' ? '#DC2626' : 'var(--portal-text-primary)' }}>
                        {paciente?.alergias || 'Sin alergias manifestadas'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Condiciones y antecedentes médicos
                      </div>
                      <div style={{ marginTop: 2, fontWeight: 500, color: 'var(--portal-text-primary)', lineHeight: 1.4 }}>
                        {paciente?.antecedentes || 'Sin antecedentes médicos manifestados'}
                      </div>
                    </div>

                    {paciente?.dni_cuit && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Documento de Identidad (DNI)
                        </div>
                        <div style={{ marginTop: 2, fontWeight: 600, color: 'var(--portal-text-primary)' }}>
                          {paciente.dni_cuit}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--portal-card-border)' }}>
                    <button
                      type="button"
                      onClick={abrirModalAnamnesis}
                      style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--portal-card-border)',
                        background: 'transparent',
                        color: primaryColor,
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,76,92,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {paciente?.consentimiento_datos_en ? '✍️ Actualizar datos' : '✍️ Completar declaración'}
                    </button>
                    {consentimientoFirmado && (
                      <a
                        href={`/api/consentimientos/pdf/${consentimientoFirmado.id}?token=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flex: 1,
                          padding: '9px 12px',
                          borderRadius: 10,
                          border: 'none',
                          background: `${secondaryColor}12`,
                          color: secondaryColor,
                          fontSize: 12.5,
                          fontWeight: 700,
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = `${secondaryColor}20`}
                        onMouseLeave={e => e.currentTarget.style.background = `${secondaryColor}12`}
                      >
                        <span>📄</span>
                        <span>Descargar PDF</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Anillo de Progreso */}
                {isOrtodoncia && paciente && (paciente.progreso_plan_porcentaje || 0) > 0 && (
                  <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progreso del tratamiento</span>
                    <ProgressRing
                      value={paciente.progreso_plan_porcentaje || 0}
                      from={secondaryColor}
                      to={accentColor}
                      sublabel="completado"
                    />
                    <div style={{ fontSize:13, color:'var(--portal-text-secondary)', fontWeight:500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {getEstimadoMesesRestantes()}
                    </div>
                  </div>
                )}

                {/* Stats Grid */}
                {isOrtodoncia && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 24 }}>
                    <div className="patient-card" style={{ padding: '16px', borderRadius: 18, borderLeft: `4px solid ${secondaryColor}`, background: 'var(--portal-card-bg)' }}>
                      <div className="kpi-numeral" style={{ fontSize: 28, fontWeight: 600, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em' }}>
                        {pastTurnos.filter(pt => pt.estado === 'asistio' || pt.estado === 'completado').length}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>
                        Visitas totales
                      </div>
                    </div>
                    
                    <div className="patient-card" style={{ padding: '16px', borderRadius: 18, borderLeft: `4px solid ${accentColor}`, background: 'var(--portal-card-bg)' }}>
                      {(() => {
                        const pastNonCanceled = pastTurnos.filter(pt => pt.estado !== 'cancelado')
                        const attendedCount = pastNonCanceled.filter(pt => pt.estado === 'asistio' || pt.estado === 'completado').length
                        const adherence = pastNonCanceled.length > 0 ? Math.round((attendedCount / pastNonCanceled.length) * 100) : 100
                        return (
                          <>
                            <div className="kpi-numeral" style={{ fontSize: 28, fontWeight: 600, color: accentColor, letterSpacing: '-0.02em' }}>{adherence}%</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>Adherencia</div>
                          </>
                        )
                      })()}
                    </div>
                    
                    <div className="patient-card" style={{ padding: '16px', borderRadius: 18, borderLeft: `4px solid ${primaryColor}`, background: 'var(--portal-card-bg)' }}>
                      {(() => {
                        const pct = paciente?.progreso_plan_porcentaje || 0
                        const elapsed = getMesesTranscurridos()
                        const remaining = pct > 0 ? Math.max(1, Math.round(elapsed * (100 - pct) / pct)) : 0
                        return (
                          <>
                            <div className="kpi-numeral" style={{ fontSize: 28, fontWeight: 600, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em' }}>{remaining}</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>Meses restantes</div>
                          </>
                        )
                      })()}
                    </div>
                    
                    <div className="patient-card" style={{ padding: '16px', borderRadius: 18, borderLeft: '4px solid #94a3b8', background: 'var(--portal-card-bg)' }}>
                      <div className="kpi-numeral" style={{ fontSize: 28, fontWeight: 600, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em' }}>{fotos.length}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>Fotos</div>
                    </div>
                  </div>
                )}

                {/* Adherence microcopy */}
                {isOrtodoncia && (() => {
                  const pastNonCanceled = pastTurnos.filter(pt => pt.estado !== 'cancelado')
                  const attendedCount = pastNonCanceled.filter(pt => pt.estado === 'asistio' || pt.estado === 'completado').length
                  const adherence = pastNonCanceled.length > 0 ? Math.round((attendedCount / pastNonCanceled.length) * 100) : 100
                  let message = 'Sos de los pacientes más constantes'
                  if (adherence < 80) message = 'A seguir mejorando la regularidad'
                  else if (adherence < 90) message = 'Excelente constancia en tus visitas'
                  return (
                    <div style={{ marginBottom: 24, padding: '12px', background: `${accentColor}0e`, borderRadius: 14, fontSize: 13, fontWeight: 600, color: accentColor, textAlign: 'center', border: `1px solid ${accentColor}20` }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 6 }}><polyline points="20 6 9 17 4 12"/></svg>
                      {message}
                    </div>
                  )
                })()}

                {/* Fotos de progreso */}
                {isOrtodoncia && fotos.length > 0 && (
                  <div style={{ marginBottom: 26 }}>
                     <h3 style={{ fontSize:14, fontWeight:800, color:'var(--portal-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom:12 }}>Fotos del proceso</h3>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                       {fotos.length >= 2 ? (
                         <div className="patient-card" style={{ borderRadius:20, padding:'1.25rem', background: 'var(--portal-card-bg)' }}>
                           <div style={{ display:'flex', gap:12 }}>
                             <div style={{ flex:1, textAlign:'center' }}>
                               <div style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:800, marginBottom:8, letterSpacing: '0.04em' }}>ANTES</div>
                               <img src={fotos[0].url} alt="Antes" loading="lazy" style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', borderRadius:12, boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }} />
                             </div>
                             <div style={{ flex:1, textAlign:'center' }}>
                               <div style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:800, marginBottom:8, letterSpacing: '0.04em' }}>DESPUÉS</div>
                               <img src={fotos[fotos.length-1].url} alt="Después" loading="lazy" style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', borderRadius:12, boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }} />
                             </div>
                           </div>
                         </div>
                       ) : (
                         <div className="patient-card" style={{ borderRadius:20, padding:'1.25rem', background: 'var(--portal-card-bg)' }}>
                           <div style={{ textAlign:'center' }}>
                             <div style={{ fontSize:11, color:'var(--portal-text-muted)', fontWeight:800, marginBottom:8, letterSpacing: '0.04em' }}>
                               {(fotos[0]?.tipo || 'Foto').toString().toUpperCase()}
                             </div>
                             <img src={fotos[0].url} alt="Foto del proceso" loading="lazy" style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', borderRadius:12, boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }} />
                           </div>
                         </div>
                       )}
                     </div>
                  </div>
                )}

                {/* Últimas visitas */}
                {pastTurnos.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize:14, fontWeight:800, color:'var(--portal-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom:12 }}>Últimas visitas</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {pastTurnos.slice(-4).reverse().map(pt => (
                        <div key={pt.id} className="patient-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius:18, padding:'1rem 1.25rem', background: 'var(--portal-card-bg)' }}>
                          <div>
                            <div style={{ fontSize:14, fontWeight:700, color: 'var(--portal-text-primary)' }}>{pt.tipo_tratamiento}</div>
                            <div style={{ fontSize:12.5, color:'var(--portal-text-muted)', marginTop:3 }}>{formatFecha(pt.fecha_hora).fecha}</div>
                          </div>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${accentColor}12`, color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Volver a turnos */}
                <div
                  onClick={() => setTabActiva('turnos')}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 18,
                    background: 'rgba(10,37,64,0.03)',
                    border: '1px solid rgba(10,37,64,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>🗓️</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text-primary)' }}>
                        Ver mis turnos programados
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 2 }}>
                        Consultar fecha, horario y confirmación
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 16, color: primaryColor, fontWeight: 800 }}>&rarr;</span>
                </div>
              </div>
            )}

            {/* Botón flotante o directo de WhatsApp de la clínica */}
            {tenant?.telefono && (
              <div style={{ marginTop: 28, textAlign: 'center' }}>
                <a
                  href={`https://wa.me/${tenant.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Me contacto desde mi portal de paciente. Mi nombre es ${paciente?.nombre || ''}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '11px 20px',
                    borderRadius: 14,
                    background: 'rgba(37,211,102,0.1)',
                    color: '#128C7E',
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: 'none',
                    border: '1px solid rgba(37,211,102,0.25)',
                    boxShadow: '0 2px 8px rgba(37,211,102,0.08)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.66.986 3.288 1.488 4.905 1.489 5.5.003 9.975-4.47 9.979-9.967.002-2.662-1.033-5.166-2.915-7.05C16.734 1.744 14.236.703 11.58.701c-5.503 0-9.98 4.47-9.985 9.969-.001 1.776.48 3.5 1.391 5.01L1.93 21.72l6.147-1.611-.43-.255z"/></svg>
                  <span>¿Dudas o consultas? Escribinos por WhatsApp</span>
                </a>
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign:'center', marginTop:'3rem', fontSize:12, color:'var(--portal-text-muted)', fontWeight:600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {tenant?.nombre || ''} {tenant?.direccion ? `— ${tenant.direccion}` : ''}
        </div>
      </div>

      {/* Modal / Bottom Sheet Cuestionario Post-Visita */}
      {showFeedbackModal && feedbackPendiente && (
        <div className="portal-modal-overlay" onClick={() => setShowFeedbackModal(false)}>
          <div className="portal-modal-content" onClick={e=>e.stopPropagation()}>
            <div style={{ width:40, height:4, borderRadius:4, background:'#e2e8f0', margin:'0 auto 1.25rem' }}/>
            
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={{ fontSize:19, fontWeight:800, color:'var(--portal-text-primary)', letterSpacing: '-0.02em', marginBottom:4 }}>Cuestionario de Control</div>
              <div style={{ fontSize:13, color:'var(--portal-text-secondary)', lineHeight:1.5 }}>
                Queremos saber cómo estás tras tu cita de <strong>{feedbackPendiente.tipo_tratamiento}</strong>.
              </div>
            </div>

            {/* Dolor Selector */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-primary)', display: 'block', marginBottom: 12, textAlign:'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ¿Sentís alguna molestia o dolor?
              </label>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 300, margin: '0 auto', gap: 10 }}>
                {[
                  {
                    value: 1,
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
                    label: 'Sin dolor'
                  },
                  {
                    value: 3,
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
                    label: 'Molestia'
                  },
                  {
                    value: 5,
                    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
                    label: 'Dolor'
                  }
                ].map(item => {
                  const selected = dolor === item.value
                  return (
                    <button
                      key={item.value}
                      onClick={() => setDolor(item.value)}
                      style={{
                        flex: 1, 
                        padding: '12px 6px', 
                        borderRadius: 16,
                        border: '2px solid ' + (selected ? accentColor : 'var(--portal-card-border)'),
                        background: selected ? `${accentColor}12` : 'transparent',
                        color: selected ? accentColor : 'var(--portal-text-muted)',
                        cursor: 'pointer', 
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        gap: 6
                      }}
                    >
                      {item.icon}
                      <span style={{ fontSize: 10, fontWeight: 800 }}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Satisfacción Selector */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-primary)', display: 'block', marginBottom: 10, textAlign:'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ¿Cómo calificarías la atención?
              </label>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
                {[1, 2, 3, 4, 5].map(val => {
                  const active = val <= satisfaccion
                  return (
                    <button
                      key={val}
                      onClick={() => setSatisfaccion(val)}
                      style={{
                        background: 'transparent', 
                        border: 'none', 
                        cursor: 'pointer', 
                        padding: 4,
                        transition: 'transform 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill={active ? "#F59E0B" : "none"} stroke={active ? "#F59E0B" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Comentarios */}
            <div style={{ marginBottom: 26 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-primary)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Comentario o duda adicional
              </label>
              <textarea
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                placeholder="Contanos si tenés inflamación, dudas sobre la medicación o cualquier comentario..."
                style={{
                  width: '100%', 
                  height: 80, 
                  padding: '12px 14px', 
                  borderRadius: 14, 
                  border: '1px solid var(--portal-card-border)',
                  background: 'rgba(255, 255, 255, 0.4)', 
                  color: 'var(--portal-text-primary)', 
                  fontFamily: 'inherit', 
                  fontSize: 14,
                  resize: 'none', 
                  outline: 'none',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)'
                }}
              />
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowFeedbackModal(false)}
                disabled={sendingFeedback}
                style={{
                  flex: 1, 
                  padding: '13px', 
                  borderRadius: 14, 
                  border: '1px solid var(--portal-card-border)',
                  background: 'transparent', 
                  color: 'var(--portal-text-secondary)',
                  fontSize: 13, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontFamily: 'DM Sans, system-ui',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Omitir por ahora
              </button>
              <button
                onClick={enviarFeedback}
                disabled={sendingFeedback}
                style={{
                  flex: 1.5, 
                  padding: '13px', 
                  borderRadius: 14, 
                  border: 'none',
                  background: secondaryColor, 
                  color: '#fff',
                  fontSize: 13, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontFamily: 'DM Sans, system-ui',
                  boxShadow: `0 4px 14px ${secondaryColor}30`, 
                  opacity: sendingFeedback ? 0.6 : 1,
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'none'}
              >
                {sendingFeedback ? 'Enviando...' : 'Enviar Respuestas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule confirmation modal sheet */}
      {reproConfirm && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-content">
            <div style={{width:40,height:4,borderRadius:4,background:'#e2e8f0',margin:'0 auto 1.5rem'}}/>
            <div style={{textAlign:'center',marginBottom:24}}>
              <div style={{width:54,height:54,borderRadius:'50%',background:`${secondaryColor}12`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={secondaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
              </div>
              <div style={{fontSize:18,fontWeight:800,color:'var(--portal-text-primary)',letterSpacing: '-0.02em', marginBottom:6}}>Reprogramar o Cancelar</div>
              <div style={{fontSize:14,color:'var(--portal-text-secondary)',lineHeight:1.6,padding:'0 12px'}}>
                Para reprogramar o cancelar tu turno, comunícate con nosotros vía WhatsApp o llamada para coordinar un nuevo horario.
              </div>
            </div>
            
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {/* WhatsApp template link to clinic's phone */}
              {tenant?.telefono && (
                <a
                  href={`https://wa.me/${tenant.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Hola! Me contacto para reprogramar o cancelar mi turno del día ${formatFecha(reproConfirm.fecha_hora).fecha} a las ${formatFecha(reproConfirm.fecha_hora).hora} hs (Tratamiento: ${reproConfirm.tipo_tratamiento}). Mi nombre es ${paciente?.nombre}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    textDecoration: 'none', 
                    display:'flex', 
                    alignItems:'center', 
                    justifyContent:'center', 
                    gap:8, 
                    fontSize:14, 
                    padding:'14px', 
                    borderRadius:14, 
                    border:'none', 
                    background:'linear-gradient(135deg,#25D366,#128C7E)', 
                    color:'#fff', 
                    cursor:'pointer', 
                    fontWeight:700, 
                    fontFamily:'DM Sans, system-ui', 
                    boxShadow: '0 4px 14px rgba(37,211,102,0.2)', 
                    transition:'transform 0.2s'
                  }}
                  onMouseEnter={e=>e.currentTarget.style.transform='scale(1.015)'}
                  onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.66.986 3.288 1.488 4.905 1.489 5.5.003 9.975-4.47 9.979-9.967.002-2.662-1.033-5.166-2.915-7.05C16.734 1.744 14.236.703 11.58.701c-5.503 0-9.98 4.47-9.985 9.969-.001 1.776.48 3.5 1.391 5.01L1.93 21.72l6.147-1.611-.43-.255z"/></svg>
                  Enviar WhatsApp al Consultorio
                </a>
              )}
              
              {/* Direct call to clinic */}
              {tenant?.telefono && (
                <a
                  href={`tel:${tenant.telefono.replace(/\s/g, '')}`}
                  style={{
                    textDecoration: 'none', 
                    display:'flex', 
                    alignItems:'center', 
                    justifyContent:'center', 
                    gap:8, 
                    fontSize:14, 
                    padding:'14px', 
                    borderRadius:14, 
                    border:`1px solid ${secondaryColor}25`, 
                    background:`${secondaryColor}0a`, 
                    color: secondaryColor, 
                    cursor:'pointer', 
                    fontWeight:700, 
                    fontFamily:'DM Sans, system-ui', 
                    transition:'transform 0.2s'
                  }}
                  onMouseEnter={e=>e.currentTarget.style.transform='scale(1.015)'}
                  onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                >
                  📞 Llamar al Consultorio
                </a>
              )}

              <button
                onClick={() => setReproConfirm(null)}
                style={{
                  marginTop: 6, 
                  padding:'13px', 
                  borderRadius:14, 
                  border:'1px solid var(--portal-card-border)', 
                  background:'transparent', 
                  color:'var(--portal-text-secondary)', 
                  fontSize:13, 
                  fontWeight:700, 
                  cursor:'pointer', 
                  fontFamily:'DM Sans, system-ui',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,0.02)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Bottom Sheet Declaración Jurada de Salud y Consentimiento Digital (Leyes 25.326 y 26.529) */}
      {showAnamnesisModal && (
        <div className="portal-modal-overlay" onClick={() => !enviandoAnamnesis && setShowAnamnesisModal(false)}>
          <div
            className="portal-modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              maxHeight: '92vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              padding: '1.75rem 1.5rem 2rem',
            }}
          >
            {/* Grab handle */}
            <div style={{ width: 42, height: 4, borderRadius: 4, background: '#cbd5e1', margin: '0 auto 1.25rem' }} />

            {/* Stepper Header */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                <span>Paso {anamnesisStep} de 4</span>
                <span>·</span>
                <span>{anamnesisStep === 1 ? 'Alergias' : anamnesisStep === 2 ? 'Salud General' : anamnesisStep === 3 ? 'Legal y DNI' : 'Firma'}</span>
              </div>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--portal-text-primary)', letterSpacing: '-0.02em', margin: '0 0 6px 0' }}>
                {anamnesisStep === 1 && '¿Tenés alguna alergia?'}
                {anamnesisStep === 2 && 'Condiciones médicas y salud'}
                {anamnesisStep === 3 && 'Identificación y consentimiento'}
                {anamnesisStep === 4 && 'Firma electrónica digital'}
              </h2>
              <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.45, maxWidth: 380, margin: '0 auto' }}>
                {anamnesisStep === 1 && 'Indicanos si sos alérgico a medicamentos, anestésicos o materiales dentales.'}
                {anamnesisStep === 2 && 'Tu historial es fundamental para garantizar un tratamiento 100% seguro.'}
                {anamnesisStep === 3 && 'Conforme a la Ley 25.326 y Ley 26.529 de Protección de Datos de Salud.'}
                {anamnesisStep === 4 && 'Firmá con tu dedo o mouse para sellar tu declaración de forma digital.'}
              </div>

              {/* Progress Bar indicator */}
              <div style={{ display: 'flex', gap: 6, marginTop: 14, justifyContent: 'center' }}>
                {[1, 2, 3, 4].map(s => (
                  <div
                    key={s}
                    style={{
                      height: 4,
                      width: 50,
                      borderRadius: 4,
                      background: s <= anamnesisStep ? primaryColor : 'rgba(10,37,64,0.1)',
                      transition: 'background 0.3s ease',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Error banner if any */}
            {anamnesisError && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⚠️</span>
                <span>{anamnesisError}</span>
              </div>
            )}

            {/* PASO 1: ALERGIAS */}
            {anamnesisStep === 1 && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                  {[
                    'Penicilina / Amoxicilina',
                    'Anestésicos locales (Lidocaína / etc.)',
                    'Látex',
                    'Aspirina / Ibuprofeno (AINEs)',
                    'Metales / Níquel',
                    'Ninguna alergia conocida'
                  ].map(alergia => {
                    const isSelected = alergiasSeleccionadas.includes(alergia)
                    const isNone = alergia === 'Ninguna alergia conocida'
                    return (
                      <button
                        key={alergia}
                        type="button"
                        onClick={() => toggleAlergia(alergia)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 14,
                          border: isSelected
                            ? `2px solid ${isNone ? '#10B981' : secondaryColor}`
                            : '1.5px solid var(--portal-card-border)',
                          background: isSelected
                            ? (isNone ? '#ECFDF5' : `${secondaryColor}10`)
                            : '#ffffff',
                          color: isSelected
                            ? (isNone ? '#065F46' : secondaryColor)
                            : 'var(--portal-text-primary)',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: 13.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>{alergia}</span>
                        <span style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: isSelected ? 'none' : '1.5px solid #cbd5e1',
                          background: isSelected ? (isNone ? '#10B981' : secondaryColor) : 'transparent',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                        }}>
                          {isSelected ? '✓' : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div style={{ marginBottom: 22 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 6 }}>
                    ¿Otra alergia o aclaración médica? (opcional)
                  </label>
                  <input
                    type="text"
                    value={otraAlergia}
                    onChange={e => setOtraAlergia(e.target.value)}
                    placeholder="Ej. Alergia a corticoides, yodo, analgésicos..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 13.5,
                      padding: '11px 14px',
                      borderRadius: 12,
                      border: '1px solid var(--portal-card-border)',
                      background: 'rgba(255,255,255,0.7)',
                      outline: 'none',
                      fontFamily: 'inherit',
                      color: 'var(--portal-text-primary)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowAnamnesisModal(false)}
                    style={{
                      flex: 1,
                      padding: '13px',
                      borderRadius: 12,
                      border: '1px solid var(--portal-card-border)',
                      background: 'transparent',
                      color: 'var(--portal-text-secondary)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnamnesisError('')
                      setAnamnesisStep(2)
                    }}
                    style={{
                      flex: 1.5,
                      padding: '13px',
                      borderRadius: 12,
                      border: 'none',
                      background: primaryColor,
                      color: '#ffffff',
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: `0 4px 14px ${primaryColor}28`,
                    }}
                  >
                    Continuar &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* PASO 2: SALUD GENERAL Y ANTECEDENTES */}
            {anamnesisStep === 2 && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                  {[
                    'Hipertensión arterial',
                    'Problemas cardíacos / Arritmia',
                    'Diabetes',
                    'Tomo anticoagulantes / Problemas de coagulación',
                    'Tomo o tomé bifosfonatos (fijadores óseos)',
                    'Asma / Problemas respiratorios',
                    'Embarazo / Período de lactancia',
                    'Ninguna condición previa'
                  ].map(cond => {
                    const isSelected = condicionesSeleccionadas.includes(cond)
                    const isNone = cond === 'Ninguna condición previa'
                    return (
                      <button
                        key={cond}
                        type="button"
                        onClick={() => toggleCondicion(cond)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 14,
                          border: isSelected
                            ? `2px solid ${isNone ? '#10B981' : secondaryColor}`
                            : '1.5px solid var(--portal-card-border)',
                          background: isSelected
                            ? (isNone ? '#ECFDF5' : `${secondaryColor}10`)
                            : '#ffffff',
                          color: isSelected
                            ? (isNone ? '#065F46' : secondaryColor)
                            : 'var(--portal-text-primary)',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: 13.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>{cond}</span>
                        <span style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: isSelected ? 'none' : '1.5px solid #cbd5e1',
                          background: isSelected ? (isNone ? '#10B981' : secondaryColor) : 'transparent',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                        }}>
                          {isSelected ? '✓' : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 6 }}>
                    ¿Tomás alguna medicación habitualmente? (opcional)
                  </label>
                  <input
                    type="text"
                    value={medicacionHabitual}
                    onChange={e => setMedicacionHabitual(e.target.value)}
                    placeholder="Ej. Enalapril 10mg, levotiroxina, aspirina preventiva..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 13.5,
                      padding: '11px 14px',
                      borderRadius: 12,
                      border: '1px solid var(--portal-card-border)',
                      background: 'rgba(255,255,255,0.7)',
                      outline: 'none',
                      fontFamily: 'inherit',
                      color: 'var(--portal-text-primary)',
                    }}
                  />
                </div>

                <div style={{ marginBottom: 22 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 6 }}>
                    Contacto de emergencia (opcional)
                  </label>
                  <input
                    type="text"
                    value={contactoEmergencia}
                    onChange={e => setContactoEmergencia(e.target.value)}
                    placeholder="Ej. Mamá (María): 11 5555-1234"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 13.5,
                      padding: '11px 14px',
                      borderRadius: 12,
                      border: '1px solid var(--portal-card-border)',
                      background: 'rgba(255,255,255,0.7)',
                      outline: 'none',
                      fontFamily: 'inherit',
                      color: 'var(--portal-text-primary)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setAnamnesisError('')
                      setAnamnesisStep(1)
                    }}
                    style={{
                      flex: 1,
                      padding: '13px',
                      borderRadius: 12,
                      border: '1px solid var(--portal-card-border)',
                      background: 'transparent',
                      color: 'var(--portal-text-secondary)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    &larr; Volver
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnamnesisError('')
                      setAnamnesisStep(3)
                    }}
                    style={{
                      flex: 1.5,
                      padding: '13px',
                      borderRadius: 12,
                      border: 'none',
                      background: primaryColor,
                      color: '#ffffff',
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: `0 4px 14px ${primaryColor}28`,
                    }}
                  >
                    Continuar &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* PASO 3: IDENTIFICACIÓN Y CONSENTIMIENTO LEGAL */}
            {anamnesisStep === 3 && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 6 }}>
                    DNI / Documento de Identidad *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={dniPaciente}
                    onChange={e => setDniPaciente(e.target.value)}
                    placeholder="Ej. 35894120"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 15,
                      fontWeight: 700,
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: !dniPaciente.trim() && anamnesisError ? '1.5px solid #EF4444' : '1px solid var(--portal-card-border)',
                      background: 'rgba(255,255,255,0.7)',
                      outline: 'none',
                      fontFamily: 'inherit',
                      color: 'var(--portal-text-primary)',
                    }}
                  />
                  <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', marginTop: 4, display: 'block' }}>
                    Requerido por la Ley 26.529 para validez legal de tu historia clínica.
                  </span>
                </div>

                {/* Recuadro de Consentimiento Legal */}
                <div style={{
                  background: 'rgba(10,37,64,0.03)',
                  border: '1px solid rgba(10,37,64,0.08)',
                  borderRadius: 14,
                  padding: '14px',
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚖️</span>
                    <span>Protección de Datos de Salud (Ley 25.326)</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', lineHeight: 1.5 }}>
                    Autorizás a {tenant?.nombre || 'el consultorio'} a registrar y tratar tus datos de salud con el fin exclusivo de tu atención odontológica, turnos y pagos. Tus datos se guardan bajo secreto profesional y confidencialidad médica, y podés acceder o rectificarlos en cualquier momento.
                  </div>
                  <button
                    type="button"
                    onClick={() => setVerTextoLegalCompleto(!verTextoLegalCompleto)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: secondaryColor,
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: '6px 0 0',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    {verTextoLegalCompleto ? 'Ocultar texto normativo completo' : 'Ver términos y texto normativo completo'}
                  </button>

                  {verTextoLegalCompleto && (
                    <div style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      background: '#ffffff',
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      fontSize: 11.5,
                      color: '#475569',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      maxHeight: 150,
                      overflowY: 'auto',
                    }}>
                      {TEXTO_CONSENTIMIENTO_DATOS}
                    </div>
                  )}
                </div>

                {/* Checkbox Obligatorio */}
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  cursor: 'pointer',
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: aceptaConsentimiento ? `${primaryColor}0a` : '#ffffff',
                  border: `1.5px solid ${aceptaConsentimiento ? primaryColor : 'var(--portal-card-border)'}`,
                  marginBottom: 22,
                  transition: 'all 0.2s ease',
                }}>
                  <input
                    type="checkbox"
                    checked={aceptaConsentimiento}
                    onChange={e => setAceptaConsentimiento(e.target.checked)}
                    style={{
                      width: 18,
                      height: 18,
                      accentColor: primaryColor,
                      marginTop: 2,
                      cursor: 'pointer',
                    }}
                  />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--portal-text-primary)', lineHeight: 1.45 }}>
                    Declaro bajo juramento que los datos aportados sobre mi salud son verdaderos (Ley 26.529), y presto mi consentimiento expreso e informado para su tratamiento médico (Ley 25.326).
                  </span>
                </label>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setAnamnesisError('')
                      setAnamnesisStep(2)
                    }}
                    style={{
                      flex: 1,
                      padding: '13px',
                      borderRadius: 12,
                      border: '1px solid var(--portal-card-border)',
                      background: 'transparent',
                      color: 'var(--portal-text-secondary)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    &larr; Volver
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!dniPaciente.trim()) {
                        setAnamnesisError('Ingresá tu número de DNI o documento.')
                        return
                      }
                      if (!aceptaConsentimiento) {
                        setAnamnesisError('Debés tildar la casilla de consentimiento para avanzar.')
                        return
                      }
                      setAnamnesisError('')
                      setAnamnesisStep(4)
                    }}
                    style={{
                      flex: 1.5,
                      padding: '13px',
                      borderRadius: 12,
                      border: 'none',
                      background: primaryColor,
                      color: '#ffffff',
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: `0 4px 14px ${primaryColor}28`,
                    }}
                  >
                    Continuar a Firmar &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* PASO 4: FIRMA DIGITAL ELECTRÓNICA */}
            {anamnesisStep === 4 && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-primary)' }}>
                      Trazá tu firma manuscrita *
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                      Con dedo o mouse
                    </span>
                  </div>

                  {/* Lienzo SignaturePad */}
                  <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--portal-card-border)' }}>
                    <SignaturePad onChange={setFirmaDigital} height={180} />
                  </div>
                </div>

                {/* Sello de seguridad y validez legal */}
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  fontSize: 11.5,
                  color: '#065F46',
                  lineHeight: 1.45,
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span style={{ fontSize: 16 }}>🔒</span>
                  <span>
                    Firma electrónica amparada por la Ley 25.506. Se generará una huella de integridad SHA-256 junto con la fecha, hora e IP de conexión.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    disabled={enviandoAnamnesis}
                    onClick={() => {
                      setAnamnesisError('')
                      setAnamnesisStep(3)
                    }}
                    style={{
                      flex: 1,
                      padding: '13px',
                      borderRadius: 12,
                      border: '1px solid var(--portal-card-border)',
                      background: 'transparent',
                      color: 'var(--portal-text-secondary)',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    &larr; Volver
                  </button>
                  <button
                    type="button"
                    disabled={enviandoAnamnesis || !firmaDigital}
                    onClick={enviarAnamnesis}
                    style={{
                      flex: 1.8,
                      padding: '13px',
                      borderRadius: 12,
                      border: 'none',
                      background: `linear-gradient(135deg, ${accentColor}, #0F5145)`,
                      color: '#ffffff',
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: (enviandoAnamnesis || !firmaDigital) ? 'not-allowed' : 'pointer',
                      opacity: (enviandoAnamnesis || !firmaDigital) ? 0.6 : 1,
                      boxShadow: `0 4px 14px ${accentColor}30`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{enviandoAnamnesis ? 'Sellando y guardando…' : 'Firmar y Enviar Declaración'}</span>
                    {!enviandoAnamnesis && <span>✓</span>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {successModal && (
        <SuccessModal
          open={successModal.open}
          onClose={() => setSuccessModal(null)}
          badge={successModal.badge}
          title={successModal.title}
          description={successModal.description}
          detail={successModal.detail}
          detailIcon={successModal.detailIcon}
          accentColor={primaryColor}
        />
      )}

      <style>{`
        :root {
          --portal-bg: #F4F7FB;
          --portal-card-bg: #FFFFFF;
          --portal-card-border: rgba(15, 76, 92, 0.08);
          --portal-text-primary: #0A2540;
          --portal-text-secondary: #475569;
          --portal-text-muted: #64748b;
          --portal-shadow: rgba(10, 37, 64, 0.04);
        }
        body {
          background-color: var(--portal-bg) !important;
          color: var(--portal-text-primary) !important;
          background: radial-gradient(ellipse at 50% -10%, rgba(15, 76, 92, 0.08) 0%, rgba(244, 247, 251, 0.95) 45%, #EEF3F9 100%) !important;
          background-attachment: fixed !important;
          transition: background-color 0.3s, color 0.3s;
        }
        .patient-card {
          background: #ffffff !important;
          border: 1px solid rgba(15, 76, 92, 0.08) !important;
          box-shadow: 0 16px 36px -12px rgba(10, 37, 64, 0.08), 0 2px 8px rgba(10, 37, 64, 0.02) !important;
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .patient-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 42px -10px rgba(10, 37, 64, 0.12), 0 4px 12px rgba(10, 37, 64, 0.04) !important;
          border-color: rgba(15, 76, 92, 0.16) !important;
        }
        
        .portal-wrapper {
          min-height: 100vh;
          background: var(--portal-bg);
          transition: background-color 0.3s ease;
          padding: 2.5rem 1.25rem;
        }
        .portal-container {
          max-width: 480px;
          margin: 0 auto;
        }
        .portal-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }
        .portal-column-main, .portal-column-side {
          display: flex;
          flex-direction: column;
          gap: 0px;
        }
        
        /* Modales responsivos */
        .portal-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(10, 30, 61, 0.5);
          backdrop-filter: blur(10px);
          z-index: 9999;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0 0 env(safe-area-inset-bottom, 0);
          transition: all 0.3s ease;
        }
        .portal-modal-content {
          background: var(--portal-card-bg, #fff);
          border-radius: 28px 28px 0 0;
          padding: 1.75rem 1.5rem 2.25rem;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 -12px 40px rgba(10, 30, 61, 0.12);
          border-top: 1px solid var(--portal-card-border);
          transition: all 0.3s ease;
        }

        /* En escritorio el portal NO se expande a dos columnas.
           El paciente lo abre desde un link de WhatsApp, o sea desde el
           teléfono casi siempre. Mantener una sola columna significa que hay
           un solo layout que mantener y testear, y que el odontólogo, cuando
           previsualiza el portal desde su escritorio, ve exactamente lo que va
           a ver el paciente. Con dos disposiciones eso no pasaba: el orden de
           importancia de la versión móvil y el de la de escritorio se
           desincronizaban en cuanto se agregaba una sección.

           Para que 480px en una pantalla grande se lea como una decisión y no
           como una página sin terminar, la columna se enmarca: fondo propio,
           borde y sombra, centrada sobre el degradado del body. */
        @media (min-width: 768px) {
          .portal-wrapper {
            padding: 3.5rem 2rem;
            display: flex;
            justify-content: center;
            align-items: flex-start;
          }
          .portal-container {
            max-width: 480px;
            width: 100%;
            background: rgba(255, 255, 255, 0.55);
            border: 1px solid var(--portal-card-border);
            border-radius: 32px;
            padding: 2.5rem 1.75rem;
            box-shadow:
              0 25px 50px -12px rgba(10, 30, 61, 0.12),
              0 0 0 1px rgba(255, 255, 255, 0.6) inset;
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
          }
          .portal-modal-overlay {
            align-items: center;
            padding: 1rem;
          }
          .portal-modal-content {
            border-radius: 28px;
            border: 1px solid var(--portal-card-border);
            box-shadow: 0 20px 50px rgba(10, 30, 61, 0.15);
          }
        }
      `}</style>
    </div>
  )
}