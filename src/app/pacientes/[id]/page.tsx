'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, BtnPrimary, BtnSm, SkeletonBox, SkeletonLista, inputCss, selectCss, textareaCss, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss, btnRedCss } from '@/components/UI'
import { initials } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { FORMAS_PAGO, FORMAS_PAGO_FACTURABLES_DEFAULT, sugerirRequiereFactura } from '@/lib/pagos'
import { formasFacturablesDe } from '@/lib/registrar-pago'
import { urlPublicaDeClinica } from '@/lib/config'
import { storagePathFromUrl, esImagenSoportada, BUCKET_FOTOS } from '@/lib/storage'
import { useTenantContext } from '@/components/TenantContext'
import { SignaturePad } from '@/components/SignaturePad'
import { aprobarAsistenciaAction, canjearPremioAction, ajustarPuntosManualAction, registrarInasistenciaAction } from '@/app/actions/fidelizacion'
import { registrarConsentimiento, tieneConsentimientoVigente } from '@/lib/consentimiento-datos'
import { validarAjustePuntos } from '@/lib/ajuste-puntos'
import { FIDELIZACION_HABILITADA } from '@/lib/fidelizacion-flag'
import { citasPendientesDeAprobar } from '@/lib/citas-para-aprobar'
import { textoPagoPrevio } from '@/lib/cobro-previo'
import { cobrarTurno, mensajeCobro } from '@/lib/cobro-turno'
import { Icon, Modal } from '@/components/ui/index'
import { CobroVisitas } from './pestanas/CobroVisitas'
import { ProgramaPuntos } from './pestanas/ProgramaPuntos'

import type { Paciente, HistorialLog, PacienteFoto } from './tipos'
import { DIENTES_SUPERIORES, DIENTES_INFERIORES, ESTADOS_INFO } from './odontograma-datos'
import { TabConsentimientos } from './pestanas/TabConsentimientos'
import { TabTurnos } from './pestanas/TabTurnos'
import { TabOdontograma } from './pestanas/TabOdontograma'
import { TabFotos } from './pestanas/TabFotos'

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
    strokeColor = "var(--diente-sano)"
    fillColor = "rgba(16, 185, 129, 0.05)"
  } else if (estado === 'Caries') {
    strokeColor = "var(--diente-caries)"
    fillColor = "rgba(239, 68, 68, 0.15)"
    strokeWidth = 2
  } else if (estado === 'Corona') {
    strokeColor = "var(--diente-corona)"
    fillColor = "rgba(245, 158, 11, 0.2)"
    strokeWidth = 2
  } else if (estado === 'Endodoncia') {
    strokeColor = "var(--diente-endodoncia)"
    fillColor = "rgba(59, 130, 246, 0.1)"
    strokeWidth = 2
  } else if (estado === 'Implante') {
    strokeColor = "var(--diente-implante)"
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
        style={{ fill: fillColor, stroke: strokeColor }}
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />

      {/* Renders visuales de tratamiento */}
      {estado === 'Caries' && (
        <circle cx="16" cy="6" r="3.5" style={{ fill: 'var(--diente-caries)', stroke: 'var(--bg-card)' }} strokeWidth="1" />
      )}

      {estado === 'Endodoncia' && (
        <path d="M 16,8 L 16,24" style={{ stroke: 'var(--diente-endodoncia)' }} strokeWidth="2.5" strokeLinecap="round" />
      )}

      {estado === 'Implante' && (
        <g style={{ stroke: 'var(--diente-implante)' }} strokeWidth="1.5" strokeLinecap="round">
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
          style={{ fill: 'var(--diente-corona)' }} 
          opacity="0.85"
        />
      )}

      {estado === 'Ausente' && (
        <g style={{ stroke: 'var(--diente-ausente)' }} strokeWidth="2.5" strokeLinecap="round">
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
  // Resultado del último cobro, visible dentro de la sección. El toast dura
  // 3,5 s abajo de la pantalla y se pierde: con dinero, el resultado tiene
  // que quedar donde el usuario está mirando.
  const [resultadoCobro, setResultadoCobro] = useState<{ texto: string; tono: 'exito' | 'error' } | null>(null)
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
      showMsg(`Cuidados enviados a ${d.email}`)
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
      showMsg('Datos del paciente actualizados')
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
      showMsg('Turno agendado con éxito')
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
        showMsg(`Turno marcado como ${nuevoEstado === 'ausente' ? 'Ausente' : 'Cancelado'}`)
        loadData()
      }
      return
    }

    if (nuevoEstado === 'asistio') {
      const cita = citas.find(c => c.id === citaId)
      if (cita) {
        setCitaAprobarId(citaId)
        setTabActiva('fidelizacion')
        showMsg('Completá la aprobación del turno.')
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
      showMsg('Estado de cita actualizado')
      loadData()
    }
  }

  const handleAprobarAsistencia = async () => {
    if (!citaAprobarId || !tenant) return
    if (montoCobrado === '' || Number(montoCobrado) <= 0) {
      showMsg('Ingresá un monto válido para el turno', 'error')
      return
    }
    setProcesandoPuntos(true)
    try {
      // Misma secuencia que Agenda y Dashboard (lib/cobro-turno). Si el turno
      // ya tiene cobro, el monto está bloqueado y solo se cierra el turno.
      // La Ficha no verifica la caja del día, igual que antes.
      const r = await cobrarTurno({
        supabase, tenantId: tenant.id,
        citaId: citaAprobarId, pacienteId: id as string,
        pago: isMontoEditable
          ? { monto: Number(montoCobrado), formaPago: aprobForma, requiereFactura: aprobFactura, origen: 'ficha_paciente' }
          : null,
        cerrarTurno: aprobarAsistenciaAction,
      })
      if (r.tipo === 'requiere_confirmacion') {
        // La ficha mostraba el turno como sin cobro, pero ya tiene. Se
        // recarga (el monto queda bloqueado) en vez de cobrar de nuevo.
        loadData()
        const aviso = `${textoPagoPrevio(r.cobradoPrevio)} La ficha se actualizó; revisá el turno antes de cobrar.`
        setResultadoCobro({ texto: aviso, tono: 'error' })
        showMsg(aviso, 'error')
        return
      }
      const m = mensajeCobro(r, FIDELIZACION_HABILITADA)!
      if (m.cerrarFormulario) {
        setCitaAprobarId('')
        loadData()
      }
      setResultadoCobro({ texto: m.texto, tono: m.tono })
      showMsg(m.texto, m.tono === 'exito' ? undefined : 'error')
    } finally {
      setProcesandoPuntos(false)
    }
  }

  // Memorizada: sin useMemo era un arreglo nuevo en cada render, el efecto de
  // abajo corría en cada tecla y devolvía el monto al precio del tratamiento.
  // Por eso desde la Ficha no se podía cobrar otro monto que el de lista.
  const citasParaAprobar = useMemo(
    () => citasPendientesDeAprobar(citas, historialPuntos, FIDELIZACION_HABILITADA),
    [citas, historialPuntos]
  )

  useEffect(() => {
    if (citaAprobarId) {
      const c = citasParaAprobar.find(x => x.id === citaAprobarId)
      if (c) {
        // Misma regla que citasPendientesDeAprobar: un cobro de $ 0 (turno al
        // que se le borraron los pagos) cuenta como sin cobro.
        const yaCobrado = Number(c.precio_cobrado ?? 0) > 0
        setMontoCobrado(yaCobrado ? c.precio_cobrado : (c.valor ?? ''))
        setIsMontoEditable(!yaCobrado)
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
        showMsg('Link de firma generado')
      } else {
        showMsg('Consentimiento firmado')
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

      showMsg(`Registro del diente ${dienteSel} actualizado`)
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

      showMsg('Foto guardada correctamente')
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
          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-light)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          minWidth: 50,
          // Dentro de la hilera con scroll, las piezas no se comprimen:
          // sin esto flex las achicaría hasta volverlas ilegibles.
          flexShrink: 0,
          boxShadow: isSelected ? '0 4px 12px rgba(24,95,165,0.15)' : 'none',
        }}
        className="interactive-item"
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dark)' }}>{num}</span>
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
        <span style={{ fontSize: 12, fontWeight: 600, color: info.color, textTransform: 'uppercase' }}>{info.label}</span>
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
    showMsg('Consentimiento registrado')
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
          <Icon name="search" size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
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

  const secondaryColor = tenant?.secondaryColor || 'var(--accent)'

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
                <Icon name="mail" size={14} />Enviar cuidados
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
            <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <Icon name="alert" size={18} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--warning-text)', marginBottom: 3 }}>
                  Falta el consentimiento de datos
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--warning-text)', lineHeight: 1.5 }}>
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
              background: 'linear-gradient(135deg, var(--accent), var(--accent))',
              color: 'var(--accent-contrast)',
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
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Nombre Completo</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark)' }}>{paciente.nombre}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Teléfono</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-dark)' }}>{paciente.telefono}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Email</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{paciente.email || '—'}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Edad (Nacimiento)</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-dark)' }}>
                  {calcEdad(paciente.fecha_nacimiento)} {paciente.fecha_nacimiento ? `(${paciente.fecha_nacimiento})` : ''}
                </span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Próximo Turno</span>
                {proximaCita ? (
                  <span 
                    style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', display: 'block', textDecoration: 'underline' }} 
                    onClick={() => setTabActiva('turnos')}
                    title="Haga click para ver el historial de turnos"
                  >
                    <Icon name="calendar" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{new Date(proximaCita.fecha_hora).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las {new Date(proximaCita.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                  </span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: isMobile ? 'center' : 'flex-start', flexWrap: 'wrap', marginTop: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="alert" size={12} />Sin turnos</span>
                    <button 
                      onClick={() => { setTabActiva('turnos'); setModalTurno(true); }}
                      style={{ background: 'var(--accent)', border: 'none', color: 'var(--accent-contrast)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
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
              <div className="glass-card" style={{ padding: '8px 12px', display: 'flex', gap: 6, overflowX: 'auto', position: 'sticky', top: 58, zIndex: 10, background: 'var(--bg-card, #fff)', borderBottom: '1px solid var(--border-light, rgba(56,138,221,0.12))' }}>
                {[
                  { id: 'odontograma', label: 'Odontograma y tratamientos' },
                  { id: 'turnos', label: `Turnos (${citas.length})` },
                  // Con fidelización apagada la pestaña sigue existiendo: adentro
                  // vive la aprobación de visita, que es donde se registra el
                  // cobro y se decide la facturación. Cambia el nombre, no el rol.
                  { id: 'fidelizacion', label: FIDELIZACION_HABILITADA
                      ? `Club de puntos (${paciente.puntos_saldo_cache ?? 0} pts)`
                      : 'Cobros y visitas' },
                  { id: 'fotos', label: `Evolución visual (${fotos.length})` },
                  { id: 'consentimientos', label: 'Consentimientos' }
                ].map(tab => {
                  const active = tabActiva === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setTabActiva(tab.id as any)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: active ? `color-mix(in srgb, ${secondaryColor} 8%, transparent)` : 'transparent',
                        color: active ? secondaryColor : 'var(--text-muted-darker, #4a6080)',
                        fontSize: 12.5,
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap',
                        boxShadow: active ? '0 1px 3px rgba(10,30,61,0.06)' : 'none'
                      }}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              {/* TAB CONTENT: ODONTOGRAMA */}
              {tabActiva === 'odontograma' && <TabOdontograma renderTooth={renderTooth} historial={historial} />}

              {/* TAB CONTENT: TURNOS */}
              {tabActiva === 'turnos' && <TabTurnos paciente={paciente} citas={citas} setModalTurno={setModalTurno} cambiarEstadoCita={cambiarEstadoCita} />}

              {/* TAB CONTENT: FIDELIZACION */}
              {tabActiva === 'fidelizacion' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  
                  {/* SECCION 1: APROBACION DE VISITA */}
                  <CobroVisitas resultadoCobro={resultadoCobro} setResultadoCobro={setResultadoCobro} citasParaAprobar={citasParaAprobar} citaAprobarId={citaAprobarId} setCitaAprobarId={setCitaAprobarId} montoCobrado={montoCobrado} setMontoCobrado={setMontoCobrado} isMontoEditable={isMontoEditable} aprobForma={aprobForma} setAprobForma={setAprobForma} aprobFactura={aprobFactura} setAprobFactura={setAprobFactura} formasFacturables={formasFacturables} procesandoPuntos={procesandoPuntos} handleAprobarAsistencia={handleAprobarAsistencia} />

                  {/* ─────────────────────────────────────────────────────────
                      SECCIONES 2, 3 y 4 · canje, ajuste manual e historial.
                      Ocultas mientras FIDELIZACION_HABILITADA sea false.
                      El código queda: se reactiva poniendo el flag en true.
                      Ver src/lib/fidelizacion-flag.ts para el porqué.
                      ───────────────────────────────────────────────────────── */}
                  {FIDELIZACION_HABILITADA && (
                  <>

                  <ProgramaPuntos configFidelizacion={configFidelizacion} premios={premios} isMobile={isMobile} paciente={paciente} procesandoCanje={procesandoCanje} setProcesandoCanje={setProcesandoCanje} showMsg={showMsg} loadData={loadData} ajustePuntosTipo={ajustePuntosTipo} setAjustePuntosTipo={setAjustePuntosTipo} ajustePuntosMonto={ajustePuntosMonto} setAjustePuntosMonto={setAjustePuntosMonto} ajustePuntosNota={ajustePuntosNota} setAjustePuntosNota={setAjustePuntosNota} procesandoAjuste={procesandoAjuste} setProcesandoAjuste={setProcesandoAjuste} historialPuntos={historialPuntos} />

                  </>
                  )}
                  {/* ── fin del bloque oculto por FIDELIZACION_HABILITADA ── */}

                </div>
              )}

              {/* TAB CONTENT: FOTOS */}
              {tabActiva === 'fotos' && <TabFotos fotos={fotos} setModalFoto={setModalFoto} isMobile={isMobile} />}

              {/* TAB CONTENT: CONSENTIMIENTOS */}
              {tabActiva === 'consentimientos' && <TabConsentimientos consentimientos={consentimientos} abrirModalConsent={abrirModalConsent} tenant={tenant} showMsg={showMsg} />}

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
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Icon name="edit" size={14} />Editar ficha
                  </button>
                </div>

                {paciente.alergias ? (
                  <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 12px', color: 'var(--danger-text)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Icon name="alert" size={16} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Alergias Importantes</div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{paciente.alergias}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: 'var(--success-soft)', border: '1px solid var(--success-border)', borderRadius: 10, padding: '10px 12px', color: 'var(--success-text)', fontSize: 12, fontWeight: 600 }}>
                    <Icon name="check" size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Sin alergias conocidas.
                  </div>
                )}

                <div>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Antecedentes Médicos</span>
                  <span style={{ fontSize: 13, color: 'var(--text-dark)', marginTop: 2, display: 'block', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                    {paciente.antecedentes || 'Sin antecedentes registrados.'}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light, #dde5ef)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Progreso del Plan</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{paciente.progreso_plan_porcentaje || 0}%</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--border-lighter, #f1f5f9)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${paciente.progreso_plan_porcentaje || 0}%`, background: 'linear-gradient(90deg, var(--accent), var(--success))', borderRadius: 4, transition: 'width 0.4s ease' }} />
                  </div>
                </div>

                {FIDELIZACION_HABILITADA && (
                <div style={{ borderTop: '1px solid var(--border-light, #dde5ef)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Sistema de Puntos VIP</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {paciente.puntos_saldo_cache ?? 0} pts
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>Total visitas asistidas: <strong>{paciente.total_visitas_asistidas ?? 0}</strong></span>
                    <span>Racha de asistencia: <strong>{paciente.visitas_consecutivas_sin_faltar ?? 0} / {configFidelizacion?.racha_objetivo ?? 3}</strong> para bonus (+{configFidelizacion?.racha_bonus_puntos ?? 150} pts)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border-lighter, #f1f5f9)', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${Math.min(100, ((paciente.visitas_consecutivas_sin_faltar ?? 0) / (configFidelizacion?.racha_objetivo ?? 3)) * 100)}%`, 
                      background: 'linear-gradient(90deg, var(--warning), var(--warning))', 
                      borderRadius: 3, 
                      transition: 'width 0.4s ease' 
                    }} />
                  </div>
                </div>
                )}

                {paciente.recomendaciones && (
                  <div style={{ borderTop: '1px solid var(--border-light, #dde5ef)', paddingTop: 12 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>Indicaciones para el portal</span>
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
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>ESTADO ACTUAL</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, display: 'inline-block', flexShrink: 0, background: `var(--diente-${getDienteEstadoActual(dienteSel).toLowerCase()})` }} />
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
        <Modal open onClose={() => setModalRegistro(false)} title={`Actualizar diente ${dienteSel}`}>
            
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
        </Modal>
      )}

      {/* Modal para Editar Ficha Médica */}
      {modalFicha && paciente && (
        <Modal open onClose={() => setModalFicha(false)} title="Editar ficha médica">
            
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

            {FIDELIZACION_HABILITADA && (
            <div style={{ ...groupCss, background: 'var(--bg-input, rgba(0,0,0,0.02))', padding: 12, borderRadius: 10, border: '1px solid var(--border-light, #dde5ef)', marginTop: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dark)', display: 'block' }}>Puntos de Ajuste Manual</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block', lineHeight: 1.4 }}>
                Los puntos y ajustes manuales se gestionan ahora desde la pestaña <strong>Club de Puntos</strong> en la ficha del paciente para mantener el historial auditado.
              </span>
            </div>
            )}

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

        </Modal>
      )}

      {/* Modal para Agendar Turno Directo */}
      {modalTurno && (
        <Modal open onClose={() => setModalTurno(false)} title="Agendar nuevo turno">
            
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
        </Modal>
      )}

      {/* Modal para Agregar Foto Clínica */}
      {modalFoto && (
        <Modal open onClose={() => setModalFoto(false)} title="Subir foto clínica">
            
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
              {uploadingFoto && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 8, fontWeight: 600 }}>Subiendo foto, por favor espera...</div>}
            </div>

            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModalFoto(false)} disabled={uploadingFoto}>Cancelar</button>
            </div>
        </Modal>
      )}

      {modalConsent && (
        <Modal open onClose={() => setModalConsent(false)} title="Nuevo consentimiento" maxWidth={520} dismissible={!cGuardando}>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Plantilla</label>
              <select value={cPlantillaId} onChange={e => setCPlantillaId(e.target.value)} style={{ ...inputCss, width: '100%' }}>
                {plantillas.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
              </select>
            </div>

            {plantillas.find(p => p.id === cPlantillaId) && (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted-darker)', lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: 10, padding: '0.9rem', maxHeight: 180, overflowY: 'auto', marginBottom: 16 }}>
                {plantillas.find(p => p.id === cPlantillaId)?.contenido}
              </div>
            )}

            {/* Selector de modo */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['presencial', 'remota'] as const).map(m => (
                <button key={m} onClick={() => { setCModo(m); setLinkRemoto('') }} style={{ flex: 1, padding: '10px', borderRadius: 10, border: cModo === m ? '1.5px solid var(--success)' : '1px solid var(--border-color)', background: cModo === m ? 'var(--success-soft)' : 'var(--bg-card)', color: cModo === m ? 'var(--success-text)' : 'var(--text-muted)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  {m === 'presencial' ? 'Firma presencial' : 'Enviar link'}
                </button>
              ))}
            </div>

            {cModo === 'presencial' ? (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Firma del paciente</label>
                <SignaturePad onChange={setCFirma} />
              </div>
            ) : linkRemoto ? (
              <div style={{ background: 'var(--success-soft)', border: '1px solid var(--success-border)', borderRadius: 10, padding: '0.9rem', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--success-text)', fontWeight: 600, marginBottom: 6 }}>Link generado — compartilo con el paciente:</div>
                <div style={{ fontSize: 12, color: 'var(--text-dark)', wordBreak: 'break-all', background: 'var(--bg-card)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--success-border)' }}>{linkRemoto}</div>
                <button onClick={() => { navigator.clipboard?.writeText(linkRemoto); showMsg('Link copiado') }} style={{ marginTop: 8, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--success)', color: 'var(--success-contrast)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Copiar link</button>
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                Se generará un link seguro para que el paciente firme desde su propio celular.
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setModalConsent(false)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cerrar</button>
              {!linkRemoto && (
                <button onClick={guardarConsentimiento} disabled={cGuardando} style={{ fontSize: 13, fontWeight: 600, padding: '7px 18px', borderRadius: 8, border: 'none', background: cGuardando ? 'var(--bg-input)' : 'var(--success)', color: cGuardando ? 'var(--text-muted)' : 'var(--success-contrast)', cursor: cGuardando ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  {cGuardando ? 'Guardando…' : cModo === 'presencial' ? 'Registrar firma' : 'Generar link'}
                </button>
              )}
            </div>
        </Modal>
      )}

      {modalCuidados && (
        <Modal open onClose={() => setModalCuidados(false)} title="Enviar cuidados posteriores" maxWidth={420} dismissible={!enviandoCuidados}>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Se envía por email a <strong>{paciente.nombre}</strong>{paciente.email ? ` (${paciente.email})` : ''} el instructivo del tratamiento elegido.
            </p>
            {!paciente.email ? (
              <div style={{ background: 'var(--warning-soft)', color: 'var(--warning-text)', padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>
                Este paciente no tiene email cargado. Agregá su email en la ficha para poder enviarle los cuidados.
              </div>
            ) : tratamientosCuidados.length === 0 ? (
              <div style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>
                Todavía no cargaste cuidados posteriores en ningún tratamiento. Cargalos en <strong>Precios</strong>.
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tratamiento</label>
                <select value={cuidTratId} onChange={e => setCuidTratId(e.target.value)} style={{ ...inputCss, width: '100%' }}>
                  {tratamientosCuidados.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button onClick={() => setModalCuidados(false)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cerrar</button>
              <button onClick={enviarCuidados} disabled={enviandoCuidados || !paciente.email || tratamientosCuidados.length === 0} style={{ fontSize: 13, fontWeight: 600, padding: '7px 18px', borderRadius: 8, border: 'none', background: (enviandoCuidados || !paciente.email || !tratamientosCuidados.length) ? 'var(--bg-input)' : 'var(--success)', color: (enviandoCuidados || !paciente.email || !tratamientosCuidados.length) ? 'var(--text-muted)' : 'var(--success-contrast)', cursor: enviandoCuidados ? 'wait' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {enviandoCuidados ? 'Enviando…' : 'Enviar email'}
              </button>
            </div>
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} isMobile={isMobile} />}
    </div>
  )
}
