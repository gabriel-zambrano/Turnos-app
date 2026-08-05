'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, BtnPrimary, BtnSm, SkeletonBox, SkeletonLista, inputCss, selectCss, textareaCss, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss, btnRedCss } from '@/components/UI'
import { initials } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { FORMAS_PAGO, FORMAS_PAGO_FACTURABLES_DEFAULT, sugerirRequiereFactura } from '@/lib/pagos'
import { registrarPago, formasFacturablesDe } from '@/lib/registrar-pago'
import { urlPublicaDeClinica } from '@/lib/config'
import { storagePathFromUrl, esImagenSoportada, BUCKET_FOTOS } from '@/lib/storage'
import { useTenantContext } from '@/components/TenantContext'
import { SignaturePad } from '@/components/SignaturePad'
import { aprobarAsistenciaAction, canjearPremioAction, ajustarPuntosManualAction, registrarInasistenciaAction } from '@/app/actions/fidelizacion'
import { registrarConsentimiento, tieneConsentimientoVigente } from '@/lib/consentimiento-datos'

interface Paciente {
  id: string
  nombre: string
  telefono: string
  email: string | null
  fecha_nacimiento: string | null
  ultimo_tratamiento: string | null
  creado_en: string
  alergias: string | null
  antecedentes: string | null
  progreso_plan_porcentaje: number | null
  puntos: number | null
  puntos_saldo_cache: number
  consentimiento_datos_en: string | null
  consentimiento_datos_ver: string | null
  visitas_consecutivas_sin_faltar: number
  total_visitas_asistidas: number
  recomendaciones: string | null
}


interface HistorialLog {
  id: string
  paciente_id: string
  diente: number
  estado: string
  notas: string | null
  creado_en: string
}

interface PacienteFoto {
  id: string
  url: string
  tipo: string
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
  const supabase = useMemo(() => createClient(), [])
  const { tenant, loading: tenantLoading } = useTenantContext()

  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [historial, setHistorial] = useState<HistorialLog[]>([])
  const [fotos, setFotos] = useState<PacienteFoto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: string } | null>(null)

  // Edit Ficha states
  const [modalFicha, setModalFicha] = useState(false)
  const [editNombre, setEditNombre] = useState('')
  const [editTelefono, setEditTelefono] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editFechaNac, setEditFechaNac] = useState('')
  const [editAlergias, setEditAlergias] = useState('')
  const [editAntecedentes, setEditAntecedentes] = useState('')
  const [editProgreso, setEditProgreso] = useState<number>(0)
  // Los puntos no se editan acá: el saldo lo maneja el ledger de fidelización
  // (ajustarPuntosManualAction), que deja asiento y mantiene el cache al día.
  const [editRecomendaciones, setEditRecomendaciones] = useState('')
  const [guardandoFicha, setGuardandoFicha] = useState(false)
  const [guardandoConsentimiento, setGuardandoConsentimiento] = useState(false)
  const [attendedVisitsCount, setAttendedVisitsCount] = useState(0)

  // Loyalty & Points states
  const [premios, setPremios] = useState<any[]>([])
  const [historialPuntos, setHistorialPuntos] = useState<any[]>([])
  const [configFidelizacion, setConfigFidelizacion] = useState<any | null>(null)

  // Appointment check-in approval state
  const [citaAprobarId, setCitaAprobarId] = useState('')
  const [montoCobrado, setMontoCobrado] = useState<number | ''>('')
  const [isMontoEditable, setIsMontoEditable] = useState(false)
  const [aprobForma, setAprobForma] = useState<string>(FORMAS_PAGO[0])
  const [aprobFactura, setAprobFactura] = useState(false)
  const [formasFacturables, setFormasFacturables] = useState<string[]>(FORMAS_PAGO_FACTURABLES_DEFAULT)

  // Criterio de medios facturables de la clínica, para pre-marcar el check.
  useEffect(() => {
    if (!tenant) return
    formasFacturablesDe(supabase, tenant.id).then(f => {
      setFormasFacturables(f)
      setAprobFactura(sugerirRequiereFactura(FORMAS_PAGO[0], f))
    })
  }, [tenant, supabase])
  const [procesandoPuntos, setProcesandoPuntos] = useState(false)
  const [procesandoCanje, setProcesandoCanje] = useState<string | null>(null)

  // Manual points adjustment states
  const [ajustePuntosMonto, setAjustePuntosMonto] = useState<number | ''>('')
  const [ajustePuntosTipo, setAjustePuntosTipo] = useState<'ajuste_manual' | 'ajuste_reverso'>('ajuste_manual')
  const [ajustePuntosNota, setAjustePuntosNota] = useState('')
  const [procesandoAjuste, setProcesandoAjuste] = useState(false)

  // Tabs state
  const [tabActiva, setTabActiva] = useState<'odontograma' | 'turnos' | 'fidelizacion' | 'fotos' | 'consentimientos'>('odontograma')

  // Consentimientos
  const [consentimientos, setConsentimientos] = useState<any[]>([])
  const [plantillas, setPlantillas] = useState<any[]>([])
  const [modalConsent, setModalConsent] = useState(false)
  const [cPlantillaId, setCPlantillaId] = useState('')
  const [cModo, setCModo] = useState<'presencial' | 'remota'>('presencial')
  const [cFirma, setCFirma] = useState<string | null>(null)
  const [cGuardando, setCGuardando] = useState(false)
  const [linkRemoto, setLinkRemoto] = useState('')

  // Cuidados posteriores por email
  const [modalCuidados, setModalCuidados] = useState(false)
  const [tratamientosCuidados, setTratamientosCuidados] = useState<{ id: string; nombre: string }[]>([])
  const [cuidTratId, setCuidTratId] = useState('')
  const [enviandoCuidados, setEnviandoCuidados] = useState(false)

  async function abrirModalCuidados() {
    if (!tenant) return
    const { data } = await supabase.from('tratamientos')
      .select('id, nombre')
      .eq('tenant_id', tenant.id)
      .not('cuidados_posteriores', 'is', null)
      .order('nombre')
    const lista = (data || []).filter((t: any) => t.nombre)
    setTratamientosCuidados(lista)
    setCuidTratId(lista[0]?.id || '')
    setModalCuidados(true)
  }

  async function enviarCuidados() {
    if (!tenant || !cuidTratId) return showMsg('Elegí un tratamiento', 'error')
    setEnviandoCuidados(true)
    try {
      const res = await fetch('/api/cuidados/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id, pacienteId: id, tratamientoId: cuidTratId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al enviar')
      showMsg(`Cuidados enviados a ${d.email} ✓`)
      setModalCuidados(false)
    } catch (err: any) {
      showMsg(err.message, 'error')
    } finally {
      setEnviandoCuidados(false)
    }
  }

  // Appointments state
  const [citas, setCitas] = useState<any[]>([])

  // Direct turn scheduling states
  const [modalTurno, setModalTurno] = useState(false)
  const [nuevoTurnoFecha, setNuevoTurnoFecha] = useState(new Date().toISOString().split('T')[0])
  const [nuevoTurnoHora, setNuevoTurnoHora] = useState('09:00')
  const [nuevoTurnoTratamiento, setNuevoTurnoTratamiento] = useState('Limpieza')
  const [nuevoTurnoDuracion, setNuevoTurnoDuracion] = useState(30)
  const [nuevoTurnoNotas, setNuevoTurnoNotas] = useState('')
  const [guardandoTurno, setGuardandoTurno] = useState(false)

  // Fotos states
  const [modalFoto, setModalFoto] = useState(false)
  const [fotoTipo, setFotoTipo] = useState('Antes')
  const [uploadingFoto, setUploadingFoto] = useState(false)

  async function guardarFichaMedica() {
    if (!tenant || !paciente) return
    setGuardandoFicha(true)
    const { error } = await supabase
      .from('pacientes')
      .update({
        nombre: editNombre.trim(),
        telefono: editTelefono.trim(),
        email: editEmail.trim() || null,
        fecha_nacimiento: editFechaNac || null,
        alergias: editAlergias.trim() || null,
        antecedentes: editAntecedentes.trim() || null,
        progreso_plan_porcentaje: editProgreso,
        recomendaciones: editRecomendaciones.trim() || null
      })
      .eq('id', paciente.id)

    setGuardandoFicha(false)
    if (error) {
      showMsg('Error al guardar ficha: ' + error.message, 'error')
    } else {
      setModalFicha(false)
      setPaciente(prev => prev ? { 
        ...prev, 
        nombre: editNombre.trim(),
        telefono: editTelefono.trim(),
        email: editEmail.trim() || null,
        fecha_nacimiento: editFechaNac || null,
        alergias: editAlergias.trim() || null, 
        antecedentes: editAntecedentes.trim() || null, 
        progreso_plan_porcentaje: editProgreso,
        recomendaciones: editRecomendaciones.trim() || null
      } : null)
      showMsg('Datos del paciente actualizados ✓')
    }
  }

  async function agendarTurnoDirecto() {
    if (!tenant || !paciente) return
    setGuardandoTurno(true)
    try {
      const { error } = await supabase
        .from('citas')
        .insert({
          paciente_id: paciente.id,
          tenant_id: tenant.id,
          fecha_hora: `${nuevoTurnoFecha}T${nuevoTurnoHora}:00-03:00`,
          tipo_tratamiento: nuevoTurnoTratamiento,
          duracion_minutos: nuevoTurnoDuracion,
          estado: 'pendiente',
          notas: nuevoTurnoNotas.trim() || null
        })
      if (error) throw error
      showMsg('Turno agendado con éxito ✓')
      setModalTurno(false)
      setNuevoTurnoNotas('')
      loadData()
    } catch (err: any) {
      showMsg('Error al agendar turno: ' + err.message, 'error')
    } finally {
      setGuardandoTurno(false)
    }
  }

  async function cambiarEstadoCita(citaId: string, nuevoEstado: string) {
    if (nuevoEstado === 'ausente' || nuevoEstado === 'cancelado') {
      const res = await registrarInasistenciaAction(citaId, nuevoEstado as any)
      if (!res.success) {
        showMsg('Error al registrar inasistencia: ' + res.error, 'error')
      } else {
        showMsg(`Turno marcado como ${nuevoEstado === 'ausente' ? 'Ausente' : 'Cancelado'} ✓`)
        loadData()
      }
      return
    }

    if (nuevoEstado === 'asistio') {
      const cita = citas.find(c => c.id === citaId)
      if (cita) {
        setCitaAprobarId(citaId)
        setTabActiva('fidelizacion')
        showMsg('Completá la aprobación del turno para otorgar puntos.')
      }
      return
    }

    const { error } = await supabase
      .from('citas')
      .update({ estado: nuevoEstado })
      .eq('id', citaId)
    if (error) {
      showMsg('Error al actualizar estado: ' + error.message, 'error')
    } else {
      showMsg('Estado de cita actualizado ✓')
      loadData()
    }
  }

  const handleAprobarAsistencia = async () => {
    if (!citaAprobarId) return
    if (montoCobrado === '' || Number(montoCobrado) <= 0) {
      showMsg('Ingresa un monto válido para la cita', 'error')
      return
    }
    setProcesandoPuntos(true)
    try {
      if (isMontoEditable) {
        // El cobro entra por `pagos`, no escribiendo `precio_cobrado` a mano:
        // así queda la forma de pago y la intención de facturar, y el trigger
        // mantiene la columna derivada.
        const { error: pagoErr } = await registrarPago(supabase, {
          tenantId: tenant!.id,
          pacienteId: id as string,
          citaId: citaAprobarId,
          formaPago: aprobForma,
          monto: Number(montoCobrado),
          requiereFactura: aprobFactura,
          origen: 'ficha_paciente',
        })
        if (pagoErr) throw new Error(pagoErr)
      }
      
      const res = await aprobarAsistenciaAction(citaAprobarId)
      if (!res.success) {
        throw new Error(res.error)
      }
      
      showMsg('Visita aprobada y puntos procesados ✓')
      setCitaAprobarId('')
      loadData()
    } catch (err: any) {
      showMsg('Error: ' + err.message, 'error')
    } finally {
      setProcesandoPuntos(false)
    }
  }

  const citasParaAprobar = citas.filter(c => 
    ['pendiente', 'confirmado', 'asistio'].includes(c.estado) &&
    !historialPuntos.some(h => h.cita_id === c.id && h.tipo_movimiento === 'gasto_tratamiento')
  )

  useEffect(() => {
    if (citaAprobarId) {
      const c = citasParaAprobar.find(x => x.id === citaAprobarId)
      if (c) {
        setMontoCobrado(c.precio_cobrado ?? c.valor ?? '')
        setIsMontoEditable(c.precio_cobrado === null)
      }
    } else if (citasParaAprobar.length > 0) {
      setCitaAprobarId(citasParaAprobar[0].id)
    }
  }, [citaAprobarId, citasParaAprobar])

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

  const loadConsentimientos = useCallback(async () => {
    if (!tenant || !id) return
    try {
      const [rc, rp] = await Promise.all([
        fetch(`/api/consentimientos?pacienteId=${id}`).then(r => r.json()),
        fetch(`/api/consentimientos?plantillas=1&tenantId=${tenant.id}`).then(r => r.json()),
      ])
      setConsentimientos(rc.consentimientos || [])
      setPlantillas(rp.plantillas || [])
      if (rp.plantillas?.[0] && !cPlantillaId) setCPlantillaId(rp.plantillas[0].id)
    } catch { /* noop */ }
  }, [tenant, id, cPlantillaId])

  useEffect(() => { if (tabActiva === 'consentimientos') loadConsentimientos() }, [tabActiva, loadConsentimientos])

  function abrirModalConsent() {
    setCModo('presencial')
    setCFirma(null)
    setLinkRemoto('')
    if (plantillas[0]) setCPlantillaId(plantillas[0].id)
    setModalConsent(true)
  }

  async function guardarConsentimiento() {
    if (!tenant) return
    const plantilla = plantillas.find(p => p.id === cPlantillaId)
    if (!plantilla) return showMsg('Elegí una plantilla de consentimiento', 'error')
    if (cModo === 'presencial' && !cFirma) return showMsg('Falta la firma del paciente', 'error')

    setCGuardando(true)
    try {
      const res = await fetch('/api/consentimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          pacienteId: id,
          plantillaId: plantilla.id,
          titulo: plantilla.titulo,
          contenido: plantilla.contenido,
          contexto: cModo,
          firmanteNombre: paciente?.nombre,
          firmaPng: cModo === 'presencial' ? cFirma : undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al guardar')

      if (cModo === 'remota') {
        const link = `${urlPublicaDeClinica(tenant)}/firmar/${d.consentimiento.token_firma}`
        setLinkRemoto(link)
        showMsg('Link de firma generado ✓')
      } else {
        showMsg('Consentimiento firmado ✓')
        setModalConsent(false)
      }
      loadConsentimientos()
    } catch (err: any) {
      showMsg(err.message, 'error')
    } finally {
      setCGuardando(false)
    }
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

      // 3. Cargar fotos clínicas
      const { data: fotosData, error: fotosError } = await supabase
        .from('paciente_fotos')
        .select('*')
        .eq('paciente_id', id)
        .eq('tenant_id', tenant.id)
        .order('creado_en', { ascending: false })

      if (fotosError) throw fotosError

      // El bucket es privado: generamos una URL firmada temporal por foto.
      // storagePathFromUrl acepta tanto las rutas nuevas como las URLs públicas
      // que quedaron guardadas antes de cerrar el bucket.
      const fotosCrudas = (fotosData || []) as PacienteFoto[]
      const fotosFirmadas = await Promise.all(
        fotosCrudas.map(async (f) => {
          const ruta = storagePathFromUrl(f.url)
          if (!ruta) return f
          const { data: firmada } = await supabase.storage
            .from(BUCKET_FOTOS)
            .createSignedUrl(ruta, 600) // 10 minutos
          return firmada?.signedUrl ? { ...f, url: firmada.signedUrl } : f
        })
      )
      setFotos(fotosFirmadas)

      // 4. Cargar citas del paciente
      const { data: citasData, error: citasError } = await supabase
        .from('citas')
        .select('*')
        .eq('paciente_id', id)
        .eq('tenant_id', tenant.id)
        .order('fecha_hora', { ascending: false })

      if (citasError) throw citasError
      setCitas(citasData || [])

      // 5. Cargar configuración de fidelización, premios y ledger de puntos
      const { data: configData } = await supabase
        .from('config_fidelizacion')
        .select('*')
        .eq('tenant_id', tenant.id)
        .maybeSingle()

      setConfigFidelizacion(configData)

      const { data: premiosData } = await supabase
        .from('premios')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('activo', true)
        .order('costo_puntos', { ascending: true })

      setPremios(premiosData || [])

      const { data: histPuntosData } = await supabase
        .from('historial_puntos')
        .select('*')
        .eq('paciente_id', id)
        .eq('tenant_id', tenant.id)
        .order('creado_en', { ascending: false })

      setHistorialPuntos(histPuntosData || [])

      // 6. Cargar cantidad de citas asistidas/completadas
      const { count, error: countError } = await supabase
        .from('citas')
        .select('*', { count: 'exact', head: true })
        .eq('paciente_id', id)
        .eq('tenant_id', tenant.id)
        .in('estado', ['asistio', 'completado'])

      if (!countError) {
        setAttendedVisitsCount(count || 0)
      }
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

  // Guardar Foto Clínica
  const uploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tenant || !paciente) return

    // Red de contención: si igual entra un HEIC (por ejemplo eligiéndolo desde
    // la app Archivos), avisamos en vez de guardar una foto que nadie va a ver.
    if (!esImagenSoportada(file)) {
      showMsg(
        'Formato no compatible. Usá JPG, PNG o WEBP. Si es una foto de iPhone (HEIC), volvé a elegirla desde la galería y el teléfono la convierte sola.',
        'error'
      )
      e.target.value = ''
      return
    }

    setUploadingFoto(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${tenant.id}/${paciente.id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('fotos_clinicas')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      // Guardamos la RUTA dentro del bucket, no una URL pública: el bucket es
      // privado y las fotos se sirven con URLs firmadas que vencen.
      const { error: dbError } = await supabase
        .from('paciente_fotos')
        .insert({
          paciente_id: paciente.id,
          tenant_id: tenant.id,
          url: fileName,
          tipo: fotoTipo
        })

      if (dbError) throw dbError

      showMsg('Foto guardada correctamente ✓')
      setModalFoto(false)
      loadData()
    } catch (err: any) {
      showMsg('Error al subir foto: ' + err.message, 'error')
    } finally {
      setUploadingFoto(false)
    }
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

  // Registra el consentimiento de un paciente cargado antes de que existiera
  // el checkbox. Solo lo toca el consultorio, con el paciente presente.
  async function registrarConsentimientoPaciente() {
    if (!paciente) return
    setGuardandoConsentimiento(true)
    const { error } = await supabase
      .from('pacientes')
      .update(registrarConsentimiento(true, 'consultorio')!)
      .eq('id', paciente.id)
    setGuardandoConsentimiento(false)
    if (error) return showMsg('Error al registrar el consentimiento: ' + error.message, 'error')
    showMsg('Consentimiento registrado ✓')
    loadData()
  }

  if (tenantLoading || loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        <Sidebar />
        <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex: 1, minWidth: 0 }}>
          <div style={{ padding: isMobile ? '1rem' : '1.75rem 2rem', maxWidth: 1100 }}>
            {/* Cabecera del paciente: avatar, nombre y datos de contacto. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
              <SkeletonBox w={64} h={64} r={32} />
              <div style={{ flex: 1 }}>
                <SkeletonBox w="38%" h={22} mb={10} />
                <SkeletonBox w="24%" h={12} />
              </div>
            </div>
            {/* Solapas */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
              {[110, 90, 140, 80].map((w, i) => <SkeletonBox key={i} w={w} h={32} r={16} />)}
            </div>
            <SkeletonLista filas={5} conAvatar={false} />
          </div>
        </main>
      </div>
    )
  }

  if (!paciente) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        <Sidebar />
        <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-dark)' }}>Paciente no encontrado</div>
          <button style={{ ...btnDarkCss, marginTop: 16 }} onClick={() => router.push('/pacientes')}>Volver a Pacientes</button>
        </main>
      </div>
    )
  }

  // Calcular próximo turno futuro (activo)
  const proximaCita = citas && citas.length > 0 
    ? citas
        .filter(c => {
          const isFuture = new Date(c.fecha_hora) >= new Date()
          const isCancelled = c.estado === 'cancelado' || c.estado === 'ausente'
          return isFuture && !isCancelled
        })
        .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())[0]
    : null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex: 1, paddingBottom: isMobile ? 80 : 24, minWidth: 0, overflowX: 'hidden' }}>
        <PageHeader
          title={`Ficha Clínica: ${paciente.nombre}`}
          sub="Historial clínico y Odontograma interactivo"
          right={
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnLightCss} onClick={abrirModalCuidados} title="Enviar cuidados posteriores por email">
                📧 Enviar cuidados
              </button>
              <button style={btnLightCss} onClick={() => router.push('/pacientes')}>
                ← Pacientes
              </button>
            </div>
          }
        />

        <div style={{ padding: isMobile ? '1rem' : '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>

          {/* Pacientes cargados antes de que existiera el consentimiento de
              datos. No se les puede dar por prestado: hay que pedírselo en la
              próxima visita y registrarlo desde acá. */}
          {!tieneConsentimientoVigente(paciente as any) && (
            <div style={{ background: '#FFF3CD', border: '1px solid #ffe08a', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#633806', marginBottom: 3 }}>
                  Falta el consentimiento de datos
                </div>
                <div style={{ fontSize: 12.5, color: '#856404', lineHeight: 1.5 }}>
                  Este paciente se cargó antes de que se pidiera el consentimiento para el
                  tratamiento de sus datos de salud. Pedíselo en la próxima visita y registralo acá.
                </div>
              </div>
              <button
                onClick={registrarConsentimientoPaciente}
                disabled={guardandoConsentimiento}
                style={{ ...btnDarkCss, opacity: guardandoConsentimiento ? 0.6 : 1, whiteSpace: 'nowrap' }}
              >
                {guardandoConsentimiento ? 'Guardando…' : 'El paciente ya lo prestó'}
              </button>
            </div>
          )}

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
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)', gap: 16, width: '100%', textAlign: isMobile ? 'center' : 'left' }}>
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
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Próximo Turno</span>
                {proximaCita ? (
                  <span 
                    style={{ fontSize: 13, fontWeight: 700, color: '#185FA5', cursor: 'pointer', display: 'block', textDecoration: 'underline' }} 
                    onClick={() => setTabActiva('turnos')}
                    title="Haga click para ver el historial de turnos"
                  >
                    📅 {new Date(proximaCita.fecha_hora).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las {new Date(proximaCita.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                  </span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: isMobile ? 'center' : 'flex-start', flexWrap: 'wrap', marginTop: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706', display: 'block' }}>⚠️ Sin turnos</span>
                    <button 
                      onClick={() => { setTabActiva('turnos'); setModalTurno(true); }}
                      style={{ background: '#185FA5', border: 'none', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                    >
                      + Agendar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 20 }}>
            
            {/* Left Column: Tab switcher and corresponding tab content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* Tab Selector Bar */}
              <div className="glass-card" style={{ padding: '8px 12px', display: 'flex', gap: 6, overflowX: 'auto' }}>
                {[
                  { id: 'odontograma', label: '🦷 Odontograma & Tratamientos' },
                  { id: 'turnos', label: `📅 Turnos (${citas.length})` },
                  { id: 'fidelizacion', label: `🪙 Club de Puntos (${paciente.puntos_saldo_cache ?? 0} pts)` },
                  { id: 'fotos', label: `📷 Evolución Visual (${fotos.length})` },
                  { id: 'consentimientos', label: '✍️ Consentimientos' }
                ].map(tab => {
                  const active = tabActiva === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setTabActiva(tab.id as any)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 10,
                        border: 'none',
                        background: active ? 'rgba(24, 95, 165, 0.08)' : 'transparent',
                        color: active ? '#185FA5' : 'var(--text-muted-darker)',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              {/* TAB CONTENT: ODONTOGRAMA */}
              {tabActiva === 'odontograma' && (
                <>
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
                </>
              )}

              {/* TAB CONTENT: TURNOS */}
              {tabActiva === 'turnos' && (
                <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Historial de Turnos</h3>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Gestiona las citas pasadas y futuras de {paciente.nombre}.</p>
                    </div>
                    <button 
                      onClick={() => setModalTurno(true)}
                      style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      📅 Agendar Turno
                    </button>
                  </div>

                  {citas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: 13 }}>
                      No hay turnos registrados para este paciente.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-light)' }}>
                            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Fecha y Hora</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Tratamiento</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Duración</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Estado</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {citas.map((cita) => {
                            const dateObj = new Date(cita.fecha_hora)
                            const dateStr = dateObj.toLocaleDateString('es-AR', {
                              day: '2-digit', month: '2-digit', year: 'numeric'
                            })
                            const timeStr = dateObj.toLocaleTimeString('es-AR', {
                              hour: '2-digit', minute: '2-digit'
                            })
                            return (
                              <tr key={cita.id} style={{ borderBottom: '1px solid var(--border-lighter)' }}>
                                <td style={{ padding: '12px 12px', color: 'var(--text-dark)', fontWeight: 600 }}>{dateStr} a las {timeStr} hs</td>
                                <td style={{ padding: '12px 12px', color: 'var(--text-dark)' }}>{cita.tipo_tratamiento}</td>
                                <td style={{ padding: '12px 12px', color: 'var(--text-muted-darker)' }}>{cita.duracion_minutos} min</td>
                                <td style={{ padding: '12px 12px' }}>
                                  <span style={{ 
                                    fontSize: 11, 
                                    fontWeight: 700, 
                                    padding: '3px 8px', 
                                    borderRadius: 6, 
                                    background: cita.estado === 'confirmado' ? '#D1E7DD' : cita.estado === 'pendiente' ? '#FFF3CD' : cita.estado === 'asistio' || cita.estado === 'completado' ? '#E6F1FB' : '#F8D7DA',
                                    color: cita.estado === 'confirmado' ? '#0A3622' : cita.estado === 'pendiente' ? '#856404' : cita.estado === 'asistio' || cita.estado === 'completado' ? '#0C447C' : '#58151C'
                                  }}>
                                    {cita.estado.toUpperCase()}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 12px' }}>
                                  <select 
                                    value={cita.estado} 
                                    onChange={e => cambiarEstadoCita(cita.id, e.target.value)}
                                    style={{ 
                                      padding: '4px 8px', 
                                      borderRadius: 8, 
                                      border: '1px solid var(--border-light)', 
                                      background: 'var(--bg-input)', 
                                      color: 'var(--text-dark)', 
                                      fontSize: 12, 
                                      fontWeight: 600,
                                      outline: 'none',
                                      cursor: 'pointer' 
                                    }}
                                  >
                                    <option value="pendiente">Pendiente</option>
                                    <option value="confirmado">Confirmado</option>
                                    <option value="asistio">Asistió</option>
                                    <option value="completado">Completado</option>
                                    <option value="cancelado">Cancelado</option>
                                    <option value="ausente">Ausente</option>
                                  </select>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB CONTENT: FIDELIZACION */}
              {tabActiva === 'fidelizacion' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  
                  {/* SECCION 1: APROBACION DE VISITA */}
                  <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Aprobación Manual de Visita</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                      Confirmá la asistencia del paciente y procesá la acumulación de puntos correspondiente al gasto de la cita.
                    </p>

                    {citasParaAprobar.length === 0 ? (
                      <div style={{ padding: '1.5rem', background: 'var(--bg-input, #f0f4f8)', borderRadius: 12, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                        🎉 No hay consultas pendientes de procesamiento de puntos.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
                        <div style={groupCss}>
                          <label style={labelCss}>Seleccionar Turno</label>
                          <select 
                            style={selectCss} 
                            value={citaAprobarId} 
                            onChange={e => setCitaAprobarId(e.target.value)}
                          >
                            {citasParaAprobar.map(c => {
                              const dateObj = new Date(c.fecha_hora)
                              const dateStr = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                              return (
                                <option key={c.id} value={c.id}>
                                  {dateStr} - {c.tipo_tratamiento} (${c.precio_cobrado ?? c.valor ?? 'Sin precio'})
                                </option>
                              )
                            })}
                          </select>
                        </div>

                        <div style={groupCss}>
                          <label style={labelCss}>Monto Cobrado (ARS)</label>
                          <input
                            type="number"
                            style={inputCss}
                            value={montoCobrado}
                            onChange={e => setMontoCobrado(e.target.value === '' ? '' : Number(e.target.value))}
                            disabled={!isMontoEditable}
                            placeholder="Monto cobrado en la cita"
                          />
                          {!isMontoEditable && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                              El monto ya fue registrado en la cita y no puede editarse desde aquí.
                            </span>
                          )}
                        </div>

                        {/* Sin forma de pago, este cobro esquivaba el criterio
                            de facturación y se facturaba entero. */}
                        {isMontoEditable && (
                          <>
                            <div style={groupCss}>
                              <label style={labelCss}>Forma de pago</label>
                              <select style={inputCss} value={aprobForma}
                                onChange={e => { setAprobForma(e.target.value); setAprobFactura(sugerirRequiereFactura(e.target.value, formasFacturables)) }}>
                                {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
                              </select>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
                              padding: '10px 12px', borderRadius: 9, marginBottom: 12,
                              background: aprobFactura ? 'rgba(29,158,117,0.08)' : 'var(--bg-input, #f8fafc)',
                              border: `1px solid ${aprobFactura ? 'rgba(29,158,117,0.3)' : 'var(--border-color, #e2e8ed)'}` }}>
                              <input type="checkbox" checked={aprobFactura} onChange={e => setAprobFactura(e.target.checked)}
                                style={{ width: 17, height: 17, accentColor: '#1D9E75', cursor: 'pointer' }} />
                              <span style={{ fontSize: 13, color: 'var(--text-dark)', fontWeight: 500 }}>
                                Facturar este cobro
                                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginTop: 1 }}>
                                  {sugerirRequiereFactura(aprobForma, formasFacturables)
                                    ? `${aprobForma} se factura según tu configuración`
                                    : `${aprobForma} no se factura, salvo que el paciente lo pida`}
                                </span>
                              </span>
                            </label>
                          </>
                        )}

                        <button
                          style={{ ...btnDarkCss, width: '100%', marginTop: 8 }}
                          disabled={procesandoPuntos}
                          onClick={handleAprobarAsistencia}
                        >
                          {procesandoPuntos ? 'Procesando Puntos...' : 'Confirmar Asistencia y Procesar Puntos'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SECCION 2: CATALOGO DE PREMIOS */}
                  <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Canje de Premios</h3>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                        Canjeá los puntos acumulados por premios del catálogo. 1 punto = ${configFidelizacion?.ars_valor_canje ?? 50} ARS.
                      </p>
                    </div>

                    {premios.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>
                        No hay premios registrados en el catálogo de esta clínica.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginTop: 6 }}>
                        {premios.map(p => {
                          const ptsActuales = paciente.puntos_saldo_cache ?? 0
                          const tienePuntos = ptsActuales >= p.costo_puntos
                          const tieneStock = p.stock === null || p.stock > 0
                          const canCanjear = tienePuntos && tieneStock
                          const pct = Math.min(100, (ptsActuales / p.costo_puntos) * 100)

                          return (
                            <div key={p.id} style={{ 
                              background: 'var(--bg-input, #f8fafc)', 
                              border: '1px solid var(--border-light, #e2e8f0)', 
                              borderRadius: 12, 
                              padding: 14, 
                              display: 'flex', 
                              flexDirection: 'column', 
                              justifyContent: 'space-between',
                              gap: 10
                            }}>
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark)' }}>{p.nombre}</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>{p.costo_puntos} pts</span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                  Valor ref: ${p.valor_referencia_ars?.toLocaleString('es-AR') ?? '—'} · Stock: {p.stock === null ? 'Ilimitado' : p.stock}
                                </div>
                              </div>

                              <div style={{ marginTop: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                                  <span>Progreso</span>
                                  <span>{ptsActuales} / {p.costo_puntos} pts</span>
                                </div>
                                <div style={{ height: 6, background: 'var(--border-lighter, #e2e8ed)', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: tienePuntos ? '#10B981' : '#378ADD', borderRadius: 3 }} />
                                </div>
                              </div>

                              <button
                                style={{ 
                                  ...btnDarkCss, 
                                  background: canCanjear ? 'linear-gradient(135deg, #10b981, #059669)' : 'var(--border-light, #cbd5e1)', 
                                  color: canCanjear ? '#fff' : 'var(--text-muted-darker, #64748b)', 
                                  cursor: canCanjear ? 'pointer' : 'not-allowed',
                                  fontSize: 12,
                                  minHeight: 36,
                                  padding: '0.4rem 0.8rem',
                                  marginTop: 6
                                }}
                                disabled={!canCanjear || procesandoCanje === p.id}
                                onClick={async () => {
                                  if (!confirm(`¿Confirmás el canje de "${p.nombre}" por ${p.costo_puntos} puntos?`)) return
                                  setProcesandoCanje(p.id)
                                  const res = await canjearPremioAction(paciente.id, p.id)
                                  setProcesandoCanje(null)
                                  if (res.success) {
                                    showMsg('Canje realizado con éxito ✓')
                                    loadData()
                                  } else {
                                    showMsg('Error en canje: ' + res.error, 'error')
                                  }
                                }}
                              >
                                {procesandoCanje === p.id ? 'Canjeando...' : 'Canjear Premio'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* SECCION 3: AJUSTE MANUAL DE PREMIOS */}
                  <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Ajuste Manual / Auditoría</h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                      <div style={groupCss}>
                        <label style={labelCss}>Tipo de Ajuste</label>
                        <select 
                          style={selectCss} 
                          value={ajustePuntosTipo} 
                          onChange={e => setAjustePuntosTipo(e.target.value as any)}
                        >
                          <option value="ajuste_manual">Agregar Puntos (+)</option>
                          <option value="ajuste_reverso">Restar Puntos (-)</option>
                        </select>
                      </div>

                      <div style={groupCss}>
                        <label style={labelCss}>Cantidad de Puntos</label>
                        <input
                          type="number"
                          style={inputCss}
                          value={ajustePuntosMonto}
                          onChange={e => setAjustePuntosMonto(e.target.value === '' ? '' : Math.abs(Number(e.target.value)))}
                          placeholder="Ej: 100"
                        />
                      </div>
                    </div>

                    <div style={groupCss}>
                      <label style={labelCss}>Motivo / Nota de Auditoría</label>
                      <input
                        type="text"
                        style={inputCss}
                        value={ajustePuntosNota}
                        onChange={e => setAjustePuntosNota(e.target.value)}
                        placeholder="Ej: Ajuste por error de carga anterior..."
                      />
                    </div>

                    <button
                      style={{ ...btnDarkCss, width: '100%', marginTop: 4 }}
                      disabled={procesandoAjuste}
                      onClick={async () => {
                        if (ajustePuntosMonto === '' || Number(ajustePuntosMonto) <= 0) {
                          showMsg('Ingresa una cantidad de puntos válida', 'error')
                          return
                        }
                        if (!ajustePuntosNota.trim()) {
                          showMsg('Es obligatorio ingresar un motivo para el ajuste', 'error')
                          return
                        }
                        setProcesandoAjuste(true)
                        const signo = ajustePuntosTipo === 'ajuste_manual' ? 1 : -1
                        const res = await ajustarPuntosManualAction(
                          paciente.id, 
                          Number(ajustePuntosMonto) * signo, 
                          ajustePuntosTipo, 
                          ajustePuntosNota.trim()
                        )
                        setProcesandoAjuste(false)
                        if (res.success) {
                          showMsg('Ajuste aplicado correctamente ✓')
                          setAjustePuntosMonto('')
                          setAjustePuntosNota('')
                          loadData()
                        } else {
                          showMsg('Error en ajuste: ' + res.error, 'error')
                        }
                      }}
                    >
                      {procesandoAjuste ? 'Aplicando Ajuste...' : 'Aplicar Ajuste Manual'}
                    </button>
                  </div>

                  {/* SECCION 4: HISTORIAL LEDGER */}
                  <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Historial de Movimientos de Puntos</h3>
                    
                    {historialPuntos.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>
                        No hay movimientos registrados en el historial de puntos de este paciente.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-light)' }}>
                              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Fecha</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Operación</th>
                              <th style={{ padding: '8px 12px', textAlign: 'center', color: '#185FA5', fontWeight: 600 }}>Puntos</th>
                              <th style={{ padding: '8px 12px', textAlign: 'center', color: '#185FA5', fontWeight: 600 }}>Saldo</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#185FA5', fontWeight: 600 }}>Detalles / Motivo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historialPuntos.map((log) => {
                              const dateStr = new Date(log.creado_en).toLocaleDateString('es-AR', {
                                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                              })
                              const operacionLabels: Record<string, string> = {
                                gasto_tratamiento: 'Tratamiento',
                                bonus_asistencia: 'Bonus Racha',
                                canje_premio: 'Canje Premio',
                                ajuste_manual: 'Ajuste Manual',
                                ajuste_reverso: 'Ajuste Reverso',
                                migracion_inicial: 'Asiento Inicial'
                              }
                              const operacionColors: Record<string, string> = {
                                gasto_tratamiento: '#0C447C',
                                bonus_asistencia: '#166534',
                                canje_premio: '#991B1B',
                                ajuste_manual: '#633806',
                                ajuste_reverso: '#712B13',
                                migracion_inicial: '#444441'
                              }
                              const sign = log.puntos_afectados > 0 ? '+' : ''
                              const ptsColor = log.puntos_afectados > 0 ? '#10B981' : '#EF4444'

                              return (
                                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-lighter)' }}>
                                  <td style={{ padding: '10px 12px', color: 'var(--text-muted-darker)', whiteSpace: 'nowrap' }}>{dateStr}</td>
                                  <td style={{ padding: '10px 12px' }}>
                                    <span style={{ 
                                      fontSize: 10.5, 
                                      fontWeight: 700, 
                                      padding: '2px 8px', 
                                      borderRadius: 6, 
                                      background: `${operacionColors[log.tipo_movimiento]}12`, 
                                      color: operacionColors[log.tipo_movimiento] 
                                    }}>
                                      {operacionLabels[log.tipo_movimiento] || log.tipo_movimiento}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: ptsColor }}>
                                    {sign}{log.puntos_afectados}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-dark)' }}>
                                    {log.saldo_resultante} pts
                                  </td>
                                  <td style={{ padding: '10px 12px', color: 'var(--text-dark)' }}>
                                    {log.nota || '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* TAB CONTENT: FOTOS */}
              {tabActiva === 'fotos' && (
                <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Evolución Fotográfica</h3>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Galería de seguimiento clínico visual del tratamiento.</p>
                    </div>
                    <button 
                      onClick={() => setModalFoto(true)}
                      style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      📷 Agregar Foto
                    </button>
                  </div>

                  {fotos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-input)', borderRadius: 12 }}>
                      Aún no hay fotos clínicas registradas para este paciente.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14 }}>
                      {fotos.map(foto => (
                        <div key={foto.id} style={{ 
                          position: 'relative', 
                          borderRadius: 14, 
                          overflow: 'hidden', 
                          border: '1px solid var(--border-light)',
                          boxShadow: '0 4px 12px rgba(10,30,61,0.02)'
                        }}>
                          <img src={foto.url} alt={foto.tipo} loading="lazy" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(10,30,61,0.75)', color: '#fff', fontSize: 11, padding: '6px 10px', fontWeight: 600, backdropFilter: 'blur(4px)' }}>
                            {foto.tipo}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB CONTENT: CONSENTIMIENTOS */}
              {tabActiva === 'consentimientos' && (
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ fontSize: 15, color: 'var(--text-dark, #0a1e3d)', fontWeight: 700, margin: 0 }}>Consentimientos informados</h3>
                      <p style={{ fontSize: 12, color: '#8fa3bc', margin: '2px 0 0' }}>Firma digital del paciente, presencial o por link.</p>
                    </div>
                    <button onClick={abrirModalConsent} style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                      + Nuevo consentimiento
                    </button>
                  </div>

                  {consentimientos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#8fa3bc', fontSize: 13 }}>
                      Este paciente todavía no tiene consentimientos.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {consentimientos.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-light, rgba(56,138,221,0.12))' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0a1e3d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.titulo}</div>
                            <div style={{ fontSize: 11, color: '#8fa3bc' }}>
                              {c.estado === 'firmado'
                                ? `Firmado ${c.firmado_en ? new Date(c.firmado_en).toLocaleDateString('es-AR') : ''} · ${c.contexto === 'remota' ? 'remoto' : 'presencial'}`
                                : 'Pendiente de firma'}
                            </div>
                          </div>
                          {c.estado === 'firmado' ? (
                            <span style={{ fontSize: 9.5, background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>Firmado</span>
                          ) : (
                            <button
                              onClick={() => { const l = `${urlPublicaDeClinica(tenant)}/firmar/${c.token_firma}`; navigator.clipboard?.writeText(l); showMsg('Link copiado ✓') }}
                              style={{ fontSize: 10.5, padding: '4px 9px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}
                            >Copiar link</button>
                          )}
                          {c.estado === 'firmado' && (
                            <a href={`/api/consentimientos/pdf/${c.id}`} target="_blank" rel="noopener noreferrer" title="Ver PDF" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D9E75', textDecoration: 'none', flexShrink: 0 }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Right Column: Pinned Medical Profile overview & Tooth Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* Ficha Médica General (Alergias, Antecedentes, Progreso, Puntos VIP) */}
              <div className="glass-card" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Antecedentes & Plan</h3>
                  <button 
                    onClick={() => {
                      setEditNombre(paciente.nombre)
                      setEditTelefono(paciente.telefono)
                      setEditEmail(paciente.email || '')
                      setEditFechaNac(paciente.fecha_nacimiento || '')
                      setEditAlergias(paciente.alergias || '')
                      setEditAntecedentes(paciente.antecedentes || '')
                      setEditProgreso(paciente.progreso_plan_porcentaje || 0)
                      setEditRecomendaciones(paciente.recomendaciones || '')
                      setModalFicha(true)
                    }}
                    style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    ✏️ Editar Ficha
                  </button>
                </div>

                {paciente.alergias ? (
                  <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 12px', color: '#991B1B', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Alergias Importantes</div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{paciente.alergias}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#F0FDF4', border: '1px solid #DCFCE7', borderRadius: 10, padding: '10px 12px', color: '#166534', fontSize: 12, fontWeight: 600 }}>
                    ✅ Sin alergias conocidas.
                  </div>
                )}

                <div>
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Antecedentes Médicos</span>
                  <span style={{ fontSize: 13, color: 'var(--text-dark)', marginTop: 2, display: 'block', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                    {paciente.antecedentes || 'Sin antecedentes registrados.'}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light, #dde5ef)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Progreso del Plan</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#185FA5' }}>{paciente.progreso_plan_porcentaje || 0}%</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--border-lighter, #f1f5f9)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${paciente.progreso_plan_porcentaje || 0}%`, background: 'linear-gradient(90deg, #185FA5, #138A6B)', borderRadius: 4, transition: 'width 0.4s ease' }} />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light, #dde5ef)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Sistema de Puntos VIP</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 4 }}>
                      🪙 {paciente.puntos_saldo_cache ?? 0} pts
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>Total visitas asistidas: <strong>{paciente.total_visitas_asistidas ?? 0}</strong></span>
                    <span>Racha de asistencia: <strong>{paciente.visitas_consecutivas_sin_faltar ?? 0} / {configFidelizacion?.racha_objetivo ?? 3}</strong> para bonus (+{configFidelizacion?.racha_bonus_puntos ?? 150} pts)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border-lighter, #f1f5f9)', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${Math.min(100, ((paciente.visitas_consecutivas_sin_faltar ?? 0) / (configFidelizacion?.racha_objetivo ?? 3)) * 100)}%`, 
                      background: 'linear-gradient(90deg, #F59E0B, #EF9F27)', 
                      borderRadius: 3, 
                      transition: 'width 0.4s ease' 
                    }} />
                  </div>
                </div>

                {paciente.recomendaciones && (
                  <div style={{ borderTop: '1px solid var(--border-light, #dde5ef)', paddingTop: 12 }}>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Indicaciones para el portal</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-dark)', marginTop: 2, display: 'block', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                      "{paciente.recomendaciones}"
                    </span>
                  </div>
                )}
              </div>

              {/* Tooth detail block (Only displayed on Odontograma tab) */}
              {tabActiva === 'odontograma' && (
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
                      Haz clic en any diente de la maqueta interactiva para ver su historial específico o registrar una nueva evolución clínica.
                    </div>
                  )}
                </div>
              )}

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

      {/* Modal para Editar Ficha Médica */}
      {modalFicha && paciente && (
        <div style={overlayCss(isMobile)} onClick={() => setModalFicha(false)}>
          <div style={modalCss(isMobile)} onClick={e => e.stopPropagation()}>
            <div style={modalTitleCss}>Editar Ficha Médica</div>
            
            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Nombre Completo *</label>
                <input 
                  style={inputCss} 
                  value={editNombre} 
                  onChange={e => setEditNombre(e.target.value)} 
                  placeholder="Ej: Belen Morlingo" 
                  required
                />
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Teléfono *</label>
                <input 
                  style={inputCss} 
                  value={editTelefono} 
                  onChange={e => setEditTelefono(e.target.value)} 
                  placeholder="Ej: +54 9 11 1234-5678" 
                  required
                />
              </div>
            </div>

            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Email</label>
                <input 
                  type="email"
                  style={inputCss} 
                  value={editEmail} 
                  onChange={e => setEditEmail(e.target.value)} 
                  placeholder="paciente@email.com" 
                />
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Fecha de Nacimiento</label>
                <input 
                  type="date"
                  style={inputCss} 
                  value={editFechaNac} 
                  onChange={e => setEditFechaNac(e.target.value)} 
                />
              </div>
            </div>

            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Alergias</label>
                <input 
                  style={inputCss} 
                  value={editAlergias} 
                  onChange={e => setEditAlergias(e.target.value)} 
                  placeholder="Ej: Penicilina, Látex, Metales..." 
                />
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Progreso del Plan (%)</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  style={inputCss} 
                  value={editProgreso} 
                  onChange={e => setEditProgreso(Number(e.target.value))} 
                />
              </div>
            </div>

            <div style={groupCss}>
              <label style={labelCss}>Antecedentes Médicos</label>
              <textarea 
                style={{ ...textareaCss, height: 80, resize: 'vertical' }} 
                value={editAntecedentes} 
                onChange={e => setEditAntecedentes(e.target.value)} 
                placeholder="Ej: Hipertensión, Diabetes, Cirugías..." 
              />
            </div>

            <div style={{ ...groupCss, background: 'var(--bg-input, rgba(0,0,0,0.02))', padding: 12, borderRadius: 10, border: '1px solid var(--border-light, #dde5ef)', marginTop: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dark)', display: 'block' }}>Puntos de Ajuste Manual</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>
                Los puntos y ajustes manuales se gestionan ahora desde la pestaña <strong>Club de Puntos</strong> en la ficha del paciente para mantener el historial auditado.
              </span>
            </div>

            <div style={groupCss}>
              <label style={labelCss}>Indicaciones / Recomendaciones (Visible en Portal)</label>
              <textarea 
                style={{ ...textareaCss, height: 80, resize: 'vertical' }} 
                value={editRecomendaciones} 
                onChange={e => setEditRecomendaciones(e.target.value)} 
                placeholder="Ej: Usar elásticos intermaxilares por las noches. Próximo control en 3 semanas..." 
              />
            </div>

            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModalFicha(false)} disabled={guardandoFicha}>Cancelar</button>
              <button style={btnDarkCss} onClick={guardarFichaMedica} disabled={guardandoFicha}>
                {guardandoFicha ? 'Guardando...' : 'Guardar'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal para Agendar Turno Directo */}
      {modalTurno && (
        <div style={overlayCss(isMobile)} onClick={() => setModalTurno(false)}>
          <div style={modalCss(isMobile)} onClick={e => e.stopPropagation()}>
            <div style={modalTitleCss}>Agendar Nuevo Turno</div>
            
            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Fecha *</label>
                <input 
                  type="date" 
                  style={inputCss} 
                  value={nuevoTurnoFecha} 
                  onChange={e => setNuevoTurnoFecha(e.target.value)} 
                  required
                />
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Hora *</label>
                <input 
                  type="time" 
                  style={inputCss} 
                  value={nuevoTurnoHora} 
                  onChange={e => setNuevoTurnoHora(e.target.value)} 
                  required
                />
              </div>
            </div>

            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Tratamiento</label>
                <select 
                  style={selectCss} 
                  value={nuevoTurnoTratamiento} 
                  onChange={e => setNuevoTurnoTratamiento(e.target.value)}
                >
                  <option value="Limpieza">Limpieza</option>
                  <option value="Ajuste de ortodoncia">Ajuste de ortodoncia</option>
                  <option value="Consulta General">Consulta General</option>
                  <option value="Extracción">Extracción</option>
                  <option value="Implante">Implante</option>
                  <option value="Endodoncia">Endodoncia</option>
                  <option value="Blanqueamiento">Blanqueamiento</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Duración (minutos)</label>
                <input 
                  type="number" 
                  style={inputCss} 
                  value={nuevoTurnoDuracion} 
                  onChange={e => setNuevoTurnoDuracion(Number(e.target.value))} 
                  min="15" 
                  step="15"
                />
              </div>
            </div>

            <div style={groupCss}>
              <label style={labelCss}>Notas / Observaciones</label>
              <textarea 
                style={{ ...textareaCss, height: 80 }} 
                value={nuevoTurnoNotas} 
                onChange={e => setNuevoTurnoNotas(e.target.value)} 
                placeholder="Ej: Ajuste de brackets superiores..." 
              />
            </div>

            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModalTurno(false)} disabled={guardandoTurno}>Cancelar</button>
              <button style={btnDarkCss} onClick={agendarTurnoDirecto} disabled={guardandoTurno}>
                {guardandoTurno ? 'Agendando...' : 'Agendar Turno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Agregar Foto Clínica */}
      {modalFoto && (
        <div style={overlayCss(isMobile)} onClick={() => setModalFoto(false)}>
          <div style={modalCss(isMobile)} onClick={e => e.stopPropagation()}>
            <div style={modalTitleCss}>Subir Foto Clínica</div>
            
            <div style={groupCss}>
              <label style={labelCss}>Etapa del Tratamiento</label>
              <select style={selectCss} value={fotoTipo} onChange={e => setFotoTipo(e.target.value)}>
                <option value="Antes">Antes</option>
                <option value="Durante">Durante</option>
                <option value="Después">Después</option>
                <option value="Radiografía">Radiografía</option>
                <option value="Estudio 3D">Estudio 3D</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            <div style={groupCss}>
              <label style={labelCss}>Seleccionar Archivo</label>
              <input
                type="file"
                // Sin "image/*" a propósito: al no aceptar HEIC, iOS convierte
                // la foto a JPEG automáticamente al elegirla desde el iPhone.
                accept="image/jpeg,image/png,image/webp"
                onChange={uploadFoto}
                style={{ ...inputCss, padding: '10px' }} 
                disabled={uploadingFoto}
              />
              {uploadingFoto && <div style={{ fontSize: 12, color: '#185FA5', marginTop: 8, fontWeight: 600 }}>Subiendo foto, por favor espera...</div>}
            </div>

            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModalFoto(false)} disabled={uploadingFoto}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalConsent && (
        <div onClick={() => setModalConsent(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0a1e3d', marginBottom: '1rem' }}>Nuevo consentimiento</div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Plantilla</label>
              <select value={cPlantillaId} onChange={e => setCPlantillaId(e.target.value)} style={{ ...inputCss, width: '100%' }}>
                {plantillas.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
              </select>
            </div>

            {plantillas.find(p => p.id === cPlantillaId) && (
              <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap', background: '#f8fafc', border: '1px solid #e8edf2', borderRadius: 10, padding: '0.9rem', maxHeight: 180, overflowY: 'auto', marginBottom: 16 }}>
                {plantillas.find(p => p.id === cPlantillaId)?.contenido}
              </div>
            )}

            {/* Selector de modo */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['presencial', 'remota'] as const).map(m => (
                <button key={m} onClick={() => { setCModo(m); setLinkRemoto('') }} style={{ flex: 1, padding: '10px', borderRadius: 10, border: cModo === m ? '1.5px solid #1D9E75' : '1px solid #e2e8f0', background: cModo === m ? '#ecfdf5' : '#fff', color: cModo === m ? '#1D9E75' : '#64748b', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  {m === 'presencial' ? '✍️ Firma presencial' : '🔗 Enviar link'}
                </button>
              ))}
            </div>

            {cModo === 'presencial' ? (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Firma del paciente</label>
                <SignaturePad onChange={setCFirma} />
              </div>
            ) : linkRemoto ? (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '0.9rem', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#065f46', fontWeight: 600, marginBottom: 6 }}>Link generado — compartilo con el paciente:</div>
                <div style={{ fontSize: 11, color: '#0a1e3d', wordBreak: 'break-all', background: '#fff', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1fae5' }}>{linkRemoto}</div>
                <button onClick={() => { navigator.clipboard?.writeText(linkRemoto); showMsg('Link copiado ✓') }} style={{ marginTop: 8, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Copiar link</button>
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
                Se generará un link seguro para que el paciente firme desde su propio celular.
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setModalConsent(false)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cerrar</button>
              {!linkRemoto && (
                <button onClick={guardarConsentimiento} disabled={cGuardando} style={{ fontSize: 13, fontWeight: 600, padding: '7px 18px', borderRadius: 8, border: 'none', background: cGuardando ? '#94a3b8' : '#1D9E75', color: '#fff', cursor: cGuardando ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  {cGuardando ? 'Guardando…' : cModo === 'presencial' ? 'Registrar firma' : 'Generar link'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {modalCuidados && (
        <div onClick={() => setModalCuidados(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Enviar cuidados posteriores</div>
            <p style={{ fontSize: 12.5, color: '#64748b', marginBottom: '1rem', lineHeight: 1.5 }}>
              Se envía por email a <strong>{paciente.nombre}</strong>{paciente.email ? ` (${paciente.email})` : ''} el instructivo del tratamiento elegido.
            </p>
            {!paciente.email ? (
              <div style={{ background: '#fef3c7', color: '#92400e', padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>
                Este paciente no tiene email cargado. Agregá su email en la ficha para poder enviarle los cuidados.
              </div>
            ) : tratamientosCuidados.length === 0 ? (
              <div style={{ background: '#f1f5f9', color: '#64748b', padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>
                Todavía no cargaste cuidados posteriores en ningún tratamiento. Cargalos en <strong>Precios</strong>.
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Tratamiento</label>
                <select value={cuidTratId} onChange={e => setCuidTratId(e.target.value)} style={{ ...inputCss, width: '100%' }}>
                  {tratamientosCuidados.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button onClick={() => setModalCuidados(false)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cerrar</button>
              <button onClick={enviarCuidados} disabled={enviandoCuidados || !paciente.email || tratamientosCuidados.length === 0} style={{ fontSize: 13, fontWeight: 600, padding: '7px 18px', borderRadius: 8, border: 'none', background: (enviandoCuidados || !paciente.email || !tratamientosCuidados.length) ? '#94a3b8' : '#1D9E75', color: '#fff', cursor: enviandoCuidados ? 'wait' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {enviandoCuidados ? 'Enviando…' : 'Enviar email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} isMobile={isMobile} />}
    </div>
  )
}
