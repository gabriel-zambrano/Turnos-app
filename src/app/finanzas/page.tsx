'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { AppShell } from '@/components/AppShell'
import { Toast, Spinner, PageHeader, useBloqueoScroll } from '@/components/UI'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'
import { triggerConfetti } from '@/lib/confetti'
import { desglosarFacturable, FORMAS_PAGO, FORMAS_PAGO_FACTURABLES_DEFAULT, sugerirRequiereFactura } from '@/lib/pagos'
import { registrarPago, formasFacturablesDe } from '@/lib/registrar-pago'

interface Tratamiento  { id: string; nombre: string; precio_base: number | null }
interface CostoFijo    { id: string; nombre: string; monto: number; activo: boolean }
interface MetaMensual  { id: string; mes: number; anio: number; meta_ingresos: number }
interface IngresoManual { id: string; fecha: string; concepto: string; monto: number }
interface EgresoManual  { id: string; fecha: string; concepto: string; monto: number }
interface CitaAsistida { id: string; paciente_id: string; fecha_hora: string; tipo_tratamiento: string; precio_cobrado: number | null; sena: number | null; valor: number | null; pacientes: { nombre: string; telefono: string; dni_cuit?: string | null; tipo_documento?: string | null } | null }

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
  const supabase = useMemo(() => createClient(), [])
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

  // Estados de facturación ARCA
  const [facturas, setFacturas]           = useState<any[]>([])
  const [arcaConfig, setArcaConfig]       = useState<any | null>(null)
  // Pagos por cita, para saber qué parte del cobro entra en el criterio
  // de medios facturables de la clínica.
  const [pagosPorCita, setPagosPorCita]   = useState<Record<string, { forma_pago: string; monto: number; requiere_factura: boolean | null }[]>>({})
  const [formasFacturables, setFormasFacturables] = useState<string[]>(FORMAS_PAGO_FACTURABLES_DEFAULT)

  // Modal para saldar una deuda registrando cómo se cobró
  const [modalSaldar, setModalSaldar]   = useState(false)
  const [saldarCita, setSaldarCita]     = useState<CitaAsistida | null>(null)
  const [saldarMonto, setSaldarMonto]   = useState<number | ''>('')
  const [saldarForma, setSaldarForma]   = useState<string>(FORMAS_PAGO[0])
  const [saldarFactura, setSaldarFactura] = useState(false)
  // Ingreso manual: forma de pago e intención de facturar
  const [fIngForma, setFIngForma]     = useState<string>(FORMAS_PAGO[0])
  const [fIngFactura, setFIngFactura] = useState(false)
  const [modalFacturar, setModalFacturar] = useState(false)
  const [facturandoItem, setFacturandoItem] = useState<{ id: string; tipo: 'cita' | 'ingreso'; monto: number; concepto: string; pacienteNombre: string; pacienteDocTipo?: string; pacienteDocNro?: string } | null>(null)
  const [fDocTipo, setFDocTipo]           = useState('DNI')
  const [fDocNro, setFDocNro]             = useState('')
  const [fPacienteNombre, setFPacienteNombre] = useState('')
  const [fTipoComprobante, setFTipoComprobante] = useState('11') // Default Factura C (Monotributista)
  const [fCondicionVenta, setFCondicionVenta] = useState('Contado')
  const [facturando, setFacturando]       = useState(false)

  const [modalMeta, setModalMeta]       = useState(false)
  const [modalCosto, setModalCosto]     = useState(false)
  const [modalIngreso, setModalIngreso] = useState(false)
  const [modalEgreso, setModalEgreso]   = useState(false)
  
  // Estados de Caja Diaria y Arqueo
  interface CajaDiaria {
    id: string
    tenant_id: string
    fecha: string
    monto_apertura: number
    monto_cierre_declarado: number | null
    monto_cierre_sistema: number | null
    estado: 'abierta' | 'cerrada'
    observaciones: string | null
    created_at: string
    closed_at: string | null
  }
  const [cajaActiva, setCajaActiva] = useState<CajaDiaria | null>(null)
  const [cajaLoading, setCajaLoading] = useState(false)
  const [modalApertura, setModalApertura] = useState(false)
  const [modalCierre, setModalCierre] = useState(false)
  const [mAperturaVal, setMAperturaVal] = useState<number | ''>(0)
  const [mCierreVal, setMCierreVal] = useState<number | ''>('')
  const [cajaObs, setCajaObs] = useState('')

  // Con un modal abierto, el fondo no se mueve al deslizar en el celular
  useBloqueoScroll(modalSaldar || modalFacturar || modalMeta || modalCosto || modalIngreso || modalEgreso || modalApertura || modalCierre)
  
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

  // La protección de sesión la hace el middleware (src/middleware.ts) server-side
  // antes de montar esta página; no hace falta re-verificar acá (era un viaje de red extra).
  
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

    const [resTrat, resCostos, resMeta, resManuales, resEgresos, resCitas, resDeudas, resFacturas, resArca, resPagos] = await Promise.all([
      supabase.from('tratamientos').select('id, nombre, precio_base').eq('tenant_id', tenant.id).eq('activo', true),
      supabase.from('costos_fijos').select('*').eq('tenant_id', tenant.id).order('nombre'),
      supabase.from('meta_mensual').select('*').eq('tenant_id', tenant.id).eq('mes', mesActual).eq('anio', anioActual).maybeSingle(),
      supabase.from('ingresos_manuales').select('*').eq('tenant_id', tenant.id).gte('fecha', inicioFecha).lte('fecha', finFecha).order('fecha', { ascending: false }),
      supabase.from('egresos_manuales').select('*').eq('tenant_id', tenant.id).gte('fecha', inicioFecha).lte('fecha', finFecha).order('fecha', { ascending: false }),
      supabase.from('citas').select('id, paciente_id, fecha_hora, tipo_tratamiento, precio_cobrado, valor, sena, pacientes(nombre, telefono, dni_cuit, tipo_documento)').eq('tenant_id', tenant.id).in('estado', ['confirmado', 'asistio']).gte('fecha_hora', inicioMes).lte('fecha_hora', finMes).order('fecha_hora', { ascending: false }),
      supabase.from('citas').select('id, paciente_id, fecha_hora, tipo_tratamiento, precio_cobrado, valor, sena, pacientes(nombre, telefono, dni_cuit, tipo_documento)').eq('tenant_id', tenant.id).in('estado', ['confirmado', 'asistio']).order('fecha_hora', { ascending: false }),
      supabase.from('facturas').select('*').eq('tenant_id', tenant.id).eq('estado', 'emitida'),
      supabase.from('arca_config').select('*').eq('tenant_id', tenant.id).eq('activo', true).maybeSingle(),
      supabase.from('pagos').select('cita_id, forma_pago, monto, requiere_factura').eq('tenant_id', tenant.id)
    ])

    // Agrupa los pagos por cita. Si la tabla todavía no existe (migración sin
    // aplicar), queda vacío y la pantalla se comporta como antes.
    const mapaPagos: Record<string, { forma_pago: string; monto: number; requiere_factura: boolean | null }[]> = {}
    for (const p of (resPagos.data ?? [])) {
      if (!p.cita_id) continue
      ;(mapaPagos[p.cita_id] ||= []).push({ forma_pago: p.forma_pago, monto: Number(p.monto), requiere_factura: p.requiere_factura })
    }
    setPagosPorCita(mapaPagos)
    
    setFormasFacturables(resArca.data?.formas_pago_facturables ?? FORMAS_PAGO_FACTURABLES_DEFAULT)

    if (resTrat.data)    setTratamientos(resTrat.data)
    if (resCostos.data)  setCostos(resCostos.data)
    if (resMeta.data)    setMeta(resMeta.data)
    if (resManuales.data) setManuales(resManuales.data)
    if (resEgresos.data) setEgresos(resEgresos.data)
    if (resCitas.data)   setCitasMes(resCitas.data as unknown as CitaAsistida[])
    if (resFacturas.data) setFacturas(resFacturas.data)
    
    if (resArca.data) {
      setArcaConfig(resArca.data)
    } else {
      setArcaConfig(null)
    }
    
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

  const loadCaja = useCallback(async () => {
    if (!tenant) return
    setCajaLoading(true)
    const { data, error } = await supabase
      .from('cajas_diarias')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('fecha', fechaCaja)
      .maybeSingle()
    if (!error && data) {
      setCajaActiva(data)
    } else {
      setCajaActiva(null)
    }
    setCajaLoading(false)
  }, [tenant, fechaCaja])

  useEffect(() => {
    if (tenant) loadCaja()
  }, [loadCaja, tenant])

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

  /**
   * Qué parte del cobro de una cita entra en el criterio de medios
   * facturables de la clínica. Devuelve null si no hay pagos cargados
   * (cita vieja o migración sin aplicar): ahí no se filtra nada.
   */
  const desgloseDeCita = useCallback((citaId: string) => {
    const pagos = pagosPorCita[citaId]
    if (!pagos || pagos.length === 0) return null
    const formasOk: string[] = arcaConfig?.formas_pago_facturables ?? FORMAS_PAGO_FACTURABLES_DEFAULT
    return desglosarFacturable(pagos, formasOk)
  }, [pagosPorCita, arcaConfig])

  // ── Acciones ───────────────────────────────────────────────────────────────
  function abrirModalFacturar(item: any, tipo: 'cita' | 'ingreso') {
    const monto = tipo === 'cita' ? getPrecio(item) : item.monto
    const concepto = tipo === 'cita' ? `Tratamiento: ${item.tipo_tratamiento}` : item.concepto
    const pacienteNombre = tipo === 'cita' ? (item.pacientes?.nombre || 'Paciente') : 'Paciente Eventual'
    const docNro = tipo === 'cita' ? (item.pacientes?.dni_cuit || '') : ''
    // Si el paciente no tiene documento cargado, por defecto se factura a Consumidor Final
    // (no es obligatorio identificar por debajo de $10.000.000 — RG 5700/2025).
    const docTipo = docNro ? (tipo === 'cita' ? (item.pacientes?.tipo_documento || 'DNI') : 'DNI') : 'Sin Identificar'

    setFacturandoItem({
      id: item.id,
      tipo,
      monto,
      concepto,
      pacienteNombre,
      pacienteDocTipo: docTipo,
      pacienteDocNro: docNro
    })

    setFPacienteNombre(pacienteNombre)
    setFDocTipo(docTipo)
    setFDocNro(docNro)
    setFCondicionVenta('Contado')
    
    if (arcaConfig?.condicion_iva === 'Monotributista') {
      setFTipoComprobante('11') // Factura C
    } else {
      setFTipoComprobante('6') // Factura B
    }

    setModalFacturar(true)
  }

  async function emitirFacturaElectronica(forzarNoFacturable = false) {
    if (!facturandoItem || !tenant) return
    if (!fDocNro && fDocTipo !== 'Sin Identificar') {
      alert('Por favor, ingresá el número de documento.')
      return
    }

    setFacturando(true)
    try {
      const res = await fetch('/api/facturacion/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          citaId: facturandoItem.tipo === 'cita' ? facturandoItem.id : undefined,
          ingresoManualId: facturandoItem.tipo === 'ingreso' ? facturandoItem.id : undefined,
          pacienteDocTipo: fDocTipo,
          pacienteDocNro: fDocNro || '0',
          pacienteNombre: fPacienteNombre,
          tipoComprobante: Number(fTipoComprobante),
          condicionVenta: fCondicionVenta,
          forzarNoFacturable
        })
      })

      const data = await res.json()

      // 409: el cobro no entra en el criterio de medios facturables.
      // Se pide confirmación explícita en vez de bloquear.
      if (res.status === 409 && data.requiereConfirmacion) {
        setFacturando(false)
        if (confirm(`${data.error}\n\n¿Emitir la factura igual por ${fmt(data.desglose?.total ?? 0)}?`)) {
          return emitirFacturaElectronica(true)
        }
        return
      }

      if (!res.ok) {
        throw new Error(data.error || 'Error al emitir factura')
      }

      msg(data.simulado
        ? `Factura SIMULADA Nro ${data.factura.nro_comprobante} (sin validez fiscal — la plataforma aún no tiene credenciales de ARCA)`
        : `Factura Nro ${data.factura.nro_comprobante} emitida con éxito (CAE: ${data.factura.cae}) ✓`)
      setModalFacturar(false)
      load()
    } catch (err: any) {
      alert('Error al facturar: ' + err.message)
    } finally {
      setFacturando(false)
    }
  }

  /**
   * Edita el precio del tratamiento de la cita.
   *
   * Ya no escribe `citas.precio_cobrado`: esa columna pasó a ser derivada de
   * los pagos. Este campo ahora edita el renglón de tratamiento, y el trigger
   * recalcula `citas.valor`. Si la cita tiene varios tratamientos, un solo
   * número no alcanza para representarlos y se manda al detalle.
   */
  async function guardarPrecioCita(c: CitaAsistida, precio: number) {
    if (cajaActiva?.estado === 'cerrada') return msg('La caja está cerrada para este día', 'error')
    if (!tenant) return
    const { data: items } = await supabase
      .from('tratamiento_items').select('id').eq('cita_id', c.id).eq('tenant_id', tenant.id)

    if (items && items.length > 1) {
      setEditandoPrecio(null)
      return msg('Esta cita tiene varios tratamientos: editalos desde la cita', 'error')
    }

    const { error } = items && items.length === 1
      ? await supabase.from('tratamiento_items')
          .update({ precio_unitario: precio, cantidad: 1, descuento_pct: 0 }).eq('id', items[0].id)
      : await supabase.from('tratamiento_items').insert({
          tenant_id: tenant.id, paciente_id: c.paciente_id, cita_id: c.id,
          descripcion: c.tipo_tratamiento || 'Consulta', cantidad: 1, precio_unitario: precio, orden: 0,
        })

    setEditandoPrecio(null)
    if (error) return msg('Error al actualizar: ' + error.message, 'error')
    msg('Precio actualizado ✓')
    load()
  }

  /** Abre el modal para saldar: hace falta saber CÓMO se cobró. */
  function abrirSaldar(c: CitaAsistida) {
    const deuda = getDeuda(c)
    if (deuda <= 0) return
    setSaldarCita(c)
    setSaldarMonto(deuda)
    setSaldarForma(FORMAS_PAGO[0])
    setSaldarFactura(sugerirRequiereFactura(FORMAS_PAGO[0], formasFacturables))
    setModalSaldar(true)
  }

  async function confirmarSaldar() {
    if (!saldarCita || !tenant) return
    if (!(Number(saldarMonto) > 0)) return msg('El monto tiene que ser mayor a cero', 'error')
    setSaving(true)
    // El pago entra por `pagos`; el trigger actualiza citas.precio_cobrado.
    // Antes se escribía esa columna a mano y el cobro quedaba sin medio de
    // pago, así que esquivaba el criterio de facturación.
    const { error } = await registrarPago(supabase, {
      tenantId: tenant.id,
      pacienteId: saldarCita.paciente_id,
      citaId: saldarCita.id,
      formaPago: saldarForma,
      monto: Number(saldarMonto),
      requiereFactura: saldarFactura,
      origen: 'saldar_deuda',
    })
    setSaving(false)
    if (error) return msg('Error al saldar: ' + error, 'error')
    setModalSaldar(false)
    msg('Cobro registrado ✓')
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
    if (cajaActiva?.estado === 'cerrada') return msg('La caja está cerrada para este día', 'error')
    if (!fConcepto.trim() || fMonto === '' || Number(fMonto) <= 0) return msg('Completá concepto y monto', 'error')
    if (!tenant) return
    setSaving(true)
    // Con forma de pago: antes un ingreso suelto se facturaba siempre, sin
    // importar cómo había entrado la plata.
    await supabase.from('ingresos_manuales').insert({
      fecha: fFecha, concepto: fConcepto.trim(), monto: fMonto, tenant_id: tenant.id,
      forma_pago: fIngForma, requiere_factura: fIngFactura,
    })
    setSaving(false); setModalIngreso(false); setFConcepto(''); setFMonto(''); setFFecha(hoyAR()); msg('Ingreso registrado ✓'); load()
  }
  async function eliminarIngreso(id: string) {
    if (cajaActiva?.estado === 'cerrada') return msg('La caja está cerrada para este día', 'error')
    await supabase.from('ingresos_manuales').delete().eq('id', id); msg('Ingreso eliminado'); load()
  }

  async function agregarEgreso() {
    if (cajaActiva?.estado === 'cerrada') return msg('La caja está cerrada para este día', 'error')
    if (!fConcepto.trim() || fMonto === '' || Number(fMonto) <= 0) return msg('Completá concepto y monto', 'error')
    if (!tenant) return
    setSaving(true)
    await supabase.from('egresos_manuales').insert({ fecha: fFecha, concepto: fConcepto.trim(), monto: fMonto, tenant_id: tenant.id })
    setSaving(false); setModalEgreso(false); setFConcepto(''); setFMonto(''); setFFecha(hoyAR()); msg('Egreso registrado ✓'); load()
  }
  async function eliminarEgreso(id: string) {
    if (cajaActiva?.estado === 'cerrada') return msg('La caja está cerrada para este día', 'error')
    await supabase.from('egresos_manuales').delete().eq('id', id); msg('Egreso eliminado'); load()
  }

  async function abrirCaja() {
    if (!tenant) return
    const valor = Number(mAperturaVal)
    if (isNaN(valor) || valor < 0) return msg('Ingresá un monto de apertura válido', 'error')
    
    setSaving(true)
    const { data: userRes } = await supabase.auth.getUser()
    const { error } = await supabase.from('cajas_diarias').insert({
      tenant_id: tenant.id,
      fecha: fechaCaja,
      monto_apertura: valor,
      estado: 'abierta',
      creado_por: userRes.user?.id
    })
    
    setSaving(false)
    if (error) {
      msg('Error al abrir la caja: ' + error.message, 'error')
    } else {
      msg('Caja abierta exitosamente ✓')
      setModalApertura(false)
      loadCaja()
    }
  }

  async function cerrarCaja() {
    if (!tenant || !cajaActiva) return
    const valor = Number(mCierreVal)
    if (isNaN(valor) || valor < 0) return msg('Ingresá el efectivo contado físicamente', 'error')
    
    setSaving(true)
    const { data: userRes } = await supabase.auth.getUser()
    const totalSistema = cajaDia + cajaActiva.monto_apertura

    const { error } = await supabase.from('cajas_diarias').update({
      monto_cierre_declarado: valor,
      monto_cierre_sistema: totalSistema,
      estado: 'cerrada',
      closed_at: new Date().toISOString(),
      observaciones: cajaObs.trim() || null,
      cerrado_por: userRes.user?.id
    }).eq('id', cajaActiva.id)
    
    setSaving(false)
    if (error) {
      msg('Error al cerrar la caja: ' + error.message, 'error')
    } else {
      msg('Caja cerrada y arqueo registrado ✓')
      setModalCierre(false)
      loadCaja()
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (tenantLoading || loading) return (
    <AppShell centrado><Spinner /></AppShell>
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
    <AppShell>
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

        <div className="app-content" style={{ maxWidth:1100, margin:'0 auto' }}>
          
          <div className="tabs-scroll" style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: '1.5rem', width: 'fit-content' }}>
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
            cajaLoading ? (
              <div style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:16, padding:'3rem 1.25rem', textAlign:'center' }}>
                <Spinner />
              </div>
            ) : !cajaActiva ? (
              <div style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:16, padding:'3rem 2rem', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
                <div style={{ fontSize: 36 }}>💰</div>
                <div style={{ fontWeight:700, fontSize:18, color:'#0a1e3d' }}>Caja Diaria no iniciada</div>
                <p style={{ fontSize:13, color:'#64748b', maxWidth:420, lineHeight:1.5 }}>
                  Para poder registrar cobros de turnos, ingresos manuales o egresos en esta fecha, primero debés realizar la apertura de la caja diaria.
                </p>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8, flexWrap:'wrap', justifyContent:'center' }}>
                  <input type="date" value={fechaCaja} onChange={e => setFechaCaja(e.target.value)} style={{ ...inputSt, width: 'auto', padding: '6px 12px' }} />
                  <button onClick={() => { setMAperturaVal(0); setModalApertura(true) }} style={{ fontSize:13, fontWeight:600, padding:'8px 18px', borderRadius:8, border:'none', background:'#138A6B', color:'#fff', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                    Abrir Caja Diaria
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background:'#fff', border:'0.5px solid #e8e8e8', borderRadius:16, padding:'1.25rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight:700, fontSize:18, color:'#0a1e3d' }}>Control de Caja</div>
                    {cajaActiva.estado === 'cerrada' ? (
                      <span style={{ fontSize: 10, background: '#fee2e2', color: '#ef4444', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>🔓 Cerrada</span>
                    ) : (
                      <span style={{ fontSize: 10, background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>🟢 Abierta</span>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:10, alignItems: 'center' }}>
                    <input type="date" value={fechaCaja} onChange={e => setFechaCaja(e.target.value)} style={{ ...inputSt, width: 'auto', padding: '5px 10px' }} />
                    {cajaActiva.estado === 'abierta' ? (
                      <>
                        <button onClick={() => { setFFecha(fechaCaja); setModalIngreso(true) }} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'none', background:'#10b981', color:'#fff', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>+ Ingreso</button>
                        <button onClick={() => { setFFecha(fechaCaja); setModalEgreso(true) }} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'none', background:'#ef4444', color:'#fff', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>- Egreso</button>
                        <button onClick={() => { setMCierreVal(''); setCajaObs(''); setModalCierre(true) }} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #ef4444', background:'#fee2e2', color:'#ef4444', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>Cerrar Caja (Arqueo)</button>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', background: '#fee2e2', color: '#ef4444', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        🔒 Caja Cerrada para Ediciones
                      </span>
                    )}
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
                            <button onClick={() => precioEdit !== '' && guardarPrecioCita(c, precioEdit as number)} style={{ fontSize:11, padding:'4px 8px', borderRadius:6, border:'none', background:'#1D9E75', color:'#fff', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>✓</button>
                            <button onClick={() => setEditandoPrecio(null)} style={{ fontSize:11, padding:'4px 8px', borderRadius:6, border:'0.5px solid #e2e8f0', background:'#fff', color:'#888', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>×</button>
                          </>
                        ) : (
                          <>
                            {(() => {
                              const fac = facturas.find(f => f.cita_id === c.id);
                              if (fac) {
                                return (
                                  <a
                                    href={`/api/facturacion/pdf/${fac.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={fac.simulada ? 'Factura de prueba, sin validez fiscal — clic para ver el PDF' : `CAE: ${fac.cae} — clic para ver el PDF`}
                                    style={{ fontSize: 10, background: fac.simulada ? '#fef3c7' : '#d1fae5', color: fac.simulada ? '#92400e' : '#065f46', padding: '3px 8px', borderRadius: 12, fontWeight: 700, marginRight: 4, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                  >
                                    {fac.simulada ? 'Simulada' : 'Facturado'} N°{fac.nro_comprobante} ⬇
                                  </a>
                                )
                              } else if (arcaConfig) {
                                const d = desgloseDeCita(c.id)
                                const atenuado = d?.nadaFacturable
                                const parcial  = d?.esParcial
                                const aviso = atenuado
                                  ? `Cobrado con ${d!.formasNoFacturables.join(' y ')}, que no facturás. Podés emitirla igual confirmando.`
                                  : parcial
                                    ? `Cobro mixto: se factura solo ${fmt(d!.facturable)} de ${fmt(d!.total)}`
                                    : 'Emitir Factura Electrónica ARCA'
                                return (
                                  <button
                                    onClick={() => abrirModalFacturar(c, 'cita')}
                                    disabled={cajaActiva.estado === 'cerrada'}
                                    style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, marginRight: 4, cursor: cajaActiva.estado === 'cerrada' ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 600,
                                      border: `1px solid ${atenuado ? '#cbd5e1' : parcial ? '#EF9F27' : '#1D9E75'}`,
                                      background: atenuado ? '#f8fafc' : parcial ? '#fffbeb' : '#ecfdf5',
                                      color: atenuado ? '#94a3b8' : parcial ? '#92400e' : '#1D9E75',
                                      opacity: cajaActiva.estado === 'cerrada' ? 0.6 : 1 }}
                                    title={aviso}
                                  >
                                    {atenuado ? 'Facturar ⚠' : parcial ? 'Facturar parcial 📄' : 'Facturar 📄'}
                                  </button>
                                )
                              }
                              return null;
                            })()}
                            <div style={{ fontSize:14, fontWeight:700, color: c.precio_cobrado !== null ? '#378ADD' : '#1D9E75' }}>{fmt(getPrecio(c))}</div>
                            {cajaActiva.estado === 'abierta' && (
                              <button onClick={() => { setEditandoPrecio(c.id); setPrecioEdit(getPrecio(c)) }} style={{ fontSize:11, padding:'2px 7px', borderRadius:5, border:'0.5px solid #e2e8f0', background:'#fff', color:'#94a3b8', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>✎</button>
                            )}
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
                        {(() => {
                          const fac = facturas.find(f => f.ingreso_manual_id === m.id);
                          if (fac) {
                            return (
                              <a
                                href={`/api/facturacion/pdf/${fac.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={fac.simulada ? 'Factura de prueba, sin validez fiscal — clic para ver el PDF' : `CAE: ${fac.cae} — clic para ver el PDF`}
                                style={{ fontSize: 10, background: fac.simulada ? '#fef3c7' : '#d1fae5', color: fac.simulada ? '#92400e' : '#065f46', padding: '3px 8px', borderRadius: 12, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                              >
                                {fac.simulada ? 'Simulada' : 'Facturado'} N°{fac.nro_comprobante} ⬇
                              </a>
                            )
                          } else if (arcaConfig) {
                            return (
                              <button 
                                onClick={() => abrirModalFacturar(m, 'ingreso')} 
                                disabled={cajaActiva.estado === 'cerrada'}
                                style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, border: '1px solid #1D9E75', background: '#ecfdf5', color: '#1D9E75', cursor: cajaActiva.estado === 'cerrada' ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, opacity: cajaActiva.estado === 'cerrada' ? 0.6 : 1 }}
                                title="Emitir Factura Electrónica ARCA"
                              >
                                Facturar 📄
                              </button>
                            )
                          }
                          return null;
                        })()}
                        <div style={{ fontSize:14, fontWeight:700, color:'#378ADD' }}>{fmt(m.monto)}</div>
                        {cajaActiva.estado === 'abierta' && (
                          <button onClick={() => eliminarIngreso(m.id)} style={{ fontSize:12, padding:'2px 8px', borderRadius:6, border:'0.5px solid #e2e8f0', background:'#fff', color:'#D85A30', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>×</button>
                        )}
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
                        {cajaActiva.estado === 'abierta' && (
                          <button onClick={() => eliminarEgreso(e.id)} style={{ fontSize:12, padding:'2px 8px', borderRadius:6, border:'0.5px solid #e2e8f0', background:'#fff', color:'#D85A30', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>×</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Balance / Arqueo Summary */}
                {cajaActiva.estado === 'abierta' ? (
                  <div style={{ background: cajaDia >= 0 ? '#ecfdf5' : '#fef2f2', padding: '1rem', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${cajaDia >= 0 ? '#10b981' : '#ef4444'}` }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: cajaDia >= 0 ? '#065f46' : '#991b1b' }}>CAJA DEL DÍA (SISTEMA)</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: cajaDia >= 0 ? '#10b981' : '#ef4444' }}>{fmt(cajaDia + cajaActiva.monto_apertura)}</div>
                  </div>
                ) : (
                  (() => {
                    const totalSistema = cajaDia + cajaActiva.monto_apertura
                    const diff = (cajaActiva.monto_cierre_declarado ?? 0) - totalSistema
                    return (
                      <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0a1e3d' }}>Resumen del Arqueo de Caja</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 12 }}>
                          <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: '0.5px solid #e2e8f0' }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>MONTO APERTURA</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0a1e3d', marginTop: 4 }}>{fmt(cajaActiva.monto_apertura)}</div>
                          </div>
                          <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: '0.5px solid #e2e8f0' }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>SISTEMA (CALCULADO)</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0a1e3d', marginTop: 4 }}>{fmt(totalSistema)}</div>
                          </div>
                          <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: '0.5px solid #e2e8f0' }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>CONTADO (DECLARADO)</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#0a1e3d', marginTop: 4 }}>{fmt(cajaActiva.monto_cierre_declarado ?? 0)}</div>
                          </div>
                          <div style={{ padding: 10, background: diff === 0 ? '#ecfdf5' : '#fffbeb', borderRadius: 8, border: `0.5px solid ${diff === 0 ? '#10b981' : '#f59e0b'}` }}>
                            <div style={{ fontSize: 11, color: diff === 0 ? '#065f46' : '#92400e', fontWeight: 600 }}>DIFERENCIA</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: diff === 0 ? '#10b981' : diff > 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
                              {diff === 0 ? 'Cuadrada ✓' : (diff > 0 ? `+${fmt(diff)} (Sobrante)` : `${fmt(diff)} (Faltante)`)}
                            </div>
                          </div>
                        </div>
                        {cajaActiva.observaciones && (
                          <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', padding: '8px 12px', background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 8 }}>
                            <strong>Observaciones del Cierre:</strong> {cajaActiva.observaciones}
                          </div>
                        )}
                      </div>
                    )
                  })()
                )}
              </div>
            )
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
                            <button onClick={() => abrirSaldar(c)} style={{ fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#0f1e2b', cursor:'pointer' }}>
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
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Forma de pago</div>
                <select style={inputSt} value={fIngForma}
                  onChange={e => { setFIngForma(e.target.value); setFIngFactura(sugerirRequiereFactura(e.target.value, formasFacturables)) }}>
                  {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:9, cursor:'pointer', padding:'10px 12px', borderRadius:9,
                background: fIngFactura ? 'rgba(29,158,117,0.08)' : '#f8fafc',
                border:`1px solid ${fIngFactura ? 'rgba(29,158,117,0.3)' : '#e2e8f0'}` }}>
                <input type="checkbox" checked={fIngFactura} onChange={e => setFIngFactura(e.target.checked)}
                  style={{ width:17, height:17, accentColor:'#1D9E75', cursor:'pointer' }} />
                <span style={{ fontSize:13, color:'#0a1e3d', fontWeight:500 }}>Facturar este ingreso</span>
              </label>
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

      {modalApertura && (
        <div onClick={() => setModalApertura(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'1.5rem', width:'100%', maxWidth:360, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a1e3d', marginBottom:'0.5rem' }}>Abrir Caja Diaria</div>
            <p style={{ fontSize:12, color:'#64748b', marginBottom:'1rem' }}>
              Establecé el fondo inicial en efectivo para dar cambio durante la jornada.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Monto Inicial (Efectivo) *</div>
                <input type="number" style={inputSt} value={mAperturaVal} onChange={e => setMAperturaVal(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" autoFocus />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:'1.25rem', justifyContent:'flex-end' }}>
              <button onClick={() => setModalApertura(false)} style={{ fontSize:13, padding:'7px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>Cancelar</button>
              <button onClick={abrirCaja} disabled={saving} style={{ fontSize:13, fontWeight:600, padding:'7px 18px', borderRadius:8, border:'none', background: saving ? '#e2e8f0' : '#138A6B', color: saving ? '#94a3b8' : '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}>
                {saving ? 'Abriendo...' : 'Abrir Caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCierre && (
        <div onClick={() => setModalCierre(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'1.5rem', width:'100%', maxWidth:360, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a1e3d', marginBottom:'0.5rem' }}>Cierre de Caja y Arqueo</div>
            <p style={{ fontSize:12, color:'#64748b', marginBottom:'1rem' }}>
              Ingresá el total de efectivo y valores contados físicamente en la caja.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '0.5px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
                Caja calculada por sistema: <strong style={{ color: '#0a1e3d' }}>{fmt(cajaDia + (cajaActiva?.monto_apertura ?? 0))}</strong>
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Efectivo Contado Físicamente *</div>
                <input type="number" style={inputSt} value={mCierreVal} onChange={e => setMCierreVal(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" autoFocus />
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Observaciones / Notas</div>
                <textarea style={{ ...inputSt, resize: 'none', height: 60 }} value={cajaObs} onChange={e => setCajaObs(e.target.value)} placeholder="Ej: Faltan $100 por vuelto mal dado." />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:'1.25rem', justifyContent:'flex-end' }}>
              <button onClick={() => setModalCierre(false)} style={{ fontSize:13, padding:'7px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>Cancelar</button>
              <button onClick={cerrarCaja} disabled={saving} style={{ fontSize:13, fontWeight:600, padding:'7px 18px', borderRadius:8, border:'none', background: saving ? '#e2e8f0' : '#ef4444', color: saving ? '#94a3b8' : '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}>
                {saving ? 'Cerrando...' : 'Cerrar Caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalSaldar && saldarCita && (
        <div onClick={() => setModalSaldar(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'1.5rem', width:'100%', maxWidth:380, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a1e3d', marginBottom:'0.35rem' }}>Registrar cobro</div>
            <p style={{ fontSize:12, color:'#64748b', marginBottom:'1.25rem' }}>
              {saldarCita.pacientes?.nombre} — {saldarCita.tipo_tratamiento}
            </p>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Monto</div>
                <input type="number" inputMode="decimal" style={inputSt} value={saldarMonto}
                  onChange={e => setSaldarMonto(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Forma de pago</div>
                <select style={inputSt} value={saldarForma}
                  onChange={e => { setSaldarForma(e.target.value); setSaldarFactura(sugerirRequiereFactura(e.target.value, formasFacturables)) }}>
                  {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <label style={{ display:'flex', alignItems:'center', gap:9, cursor:'pointer', padding:'10px 12px', borderRadius:9,
                background: saldarFactura ? 'rgba(29,158,117,0.08)' : '#f8fafc',
                border:`1px solid ${saldarFactura ? 'rgba(29,158,117,0.3)' : '#e2e8f0'}` }}>
                <input type="checkbox" checked={saldarFactura} onChange={e => setSaldarFactura(e.target.checked)}
                  style={{ width:17, height:17, accentColor:'#1D9E75', cursor:'pointer' }} />
                <span style={{ fontSize:13, color:'#0a1e3d', fontWeight:500 }}>
                  Facturar este cobro
                  <span style={{ display:'block', fontSize:11, color:'#64748b', fontWeight:400, marginTop:1 }}>
                    {sugerirRequiereFactura(saldarForma, formasFacturables)
                      ? `${saldarForma} se factura según tu configuración`
                      : `${saldarForma} no se factura, salvo que el paciente lo pida`}
                  </span>
                </span>
              </label>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:'1.25rem', justifyContent:'flex-end' }}>
              <button onClick={() => setModalSaldar(false)} style={{ fontSize:13, padding:'7px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>Cancelar</button>
              <button onClick={confirmarSaldar} disabled={saving} style={{ fontSize:13, fontWeight:600, padding:'7px 18px', borderRadius:8, border:'none', background: saving ? '#e2e8f0' : '#1D9E75', color: saving ? '#94a3b8' : '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}>
                {saving ? 'Registrando...' : 'Registrar cobro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalFacturar && facturandoItem && (
        <div onClick={() => setModalFacturar(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, padding:'1.5rem', width:'100%', maxWidth:400, boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#0a1e3d', marginBottom:'0.5rem' }}>Emitir Factura Electrónica</div>
            <p style={{ fontSize:12, color:'#64748b', marginBottom:'1.25rem' }}>
              Confirmá los datos del paciente para solicitar la autorización del comprobante en ARCA.
            </p>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', background:'#f8fafc', padding:'8px 12px', borderRadius:8, fontSize:12 }}>
                <span style={{ color:'#64748b' }}>Concepto:</span>
                <span style={{ fontWeight:600, color:'#0a1e3d' }}>{facturandoItem.concepto}</span>
              </div>
              {(() => {
                const d = facturandoItem.tipo === 'cita' ? desgloseDeCita(facturandoItem.id) : null

                // Sin pagos cargados se factura el total, como siempre.
                if (!d || (!d.esParcial && !d.nadaFacturable)) {
                  return (
                    <div style={{ display:'flex', justifyContent:'space-between', background:'#ecfdf5', padding:'8px 12px', borderRadius:8, fontSize:12, marginBottom:4 }}>
                      <span style={{ color:'#047857' }}>Total a facturar:</span>
                      <span style={{ fontWeight:700, color:'#10b981' }}>{fmt(facturandoItem.monto)}</span>
                    </div>
                  )
                }

                // Cobro mixto o íntegramente no facturable: se muestra el
                // desglose para que no haya sorpresas después de emitir.
                return (
                  <div style={{ background:'#fffbeb', border:'1px solid #fde68a', padding:'10px 12px', borderRadius:8, fontSize:12, marginBottom:4 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', color:'#92400e', marginBottom:4 }}>
                      <span>Cobrado en total:</span><span>{fmt(d.total)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', color:'#92400e', marginBottom:6 }}>
                      <span>Cobrado con {d.formasNoFacturables.join(' / ')}:</span>
                      <span>− {fmt(d.noFacturable)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700,
                      color: d.nadaFacturable ? '#b45309' : '#047857', borderTop:'1px solid #fde68a', paddingTop:6 }}>
                      <span>Se factura:</span><span>{fmt(d.facturable)}</span>
                    </div>
                    <p style={{ fontSize:11, color:'#92400e', margin:'8px 0 0', lineHeight:1.4 }}>
                      {d.nadaFacturable
                        ? 'Esta clínica no factura estos medios de pago. Si seguís, se te va a pedir confirmación.'
                        : 'Al facturar solo una parte, el comprobante lleva un renglón único de pago parcial en vez del detalle por tratamiento.'}
                    </p>
                  </div>
                )
              })()}

              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Nombre del Paciente (Razón Social) *</div>
                <input 
                  style={inputSt} 
                  value={fPacienteNombre} 
                  onChange={e => setFPacienteNombre(e.target.value)} 
                  placeholder="Ej. Juan Pérez" 
                />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Tipo Doc.</div>
                  <select 
                    style={inputSt} 
                    value={fDocTipo} 
                    onChange={e => setFDocTipo(e.target.value)}
                  >
                    <option value="Sin Identificar">Consumidor Final (sin datos)</option>
                    <option value="DNI">DNI</option>
                    <option value="CUIT">CUIT</option>
                    <option value="CUIL">CUIL</option>
                    <option value="Pasaporte">Pasaporte</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Nro Documento</div>
                  <input 
                    style={inputSt} 
                    value={fDocNro} 
                    onChange={e => setFDocNro(e.target.value)} 
                    placeholder="Ej. 34567890" 
                    disabled={fDocTipo === 'Sin Identificar'}
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Tipo de Comprobante *</div>
                <select 
                  style={inputSt} 
                  value={fTipoComprobante} 
                  onChange={e => setFTipoComprobante(e.target.value)}
                  disabled={arcaConfig?.condicion_iva === 'Monotributista'}
                >
                  {arcaConfig?.condicion_iva === 'Monotributista' ? (
                    <option value="11">Factura C (Monotributo)</option>
                  ) : (
                    <>
                      <option value="6">Factura B (A Consumidor Final)</option>
                      <option value="1">Factura A (A Responsable Inscripto)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4 }}>Condición de venta</div>
                <select
                  style={inputSt}
                  value={fCondicionVenta}
                  onChange={e => setFCondicionVenta(e.target.value)}
                >
                  <option value="Contado">Contado (efectivo)</option>
                  <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                  <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                  <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                  <option value="Cuenta Corriente">Cuenta Corriente</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Otra">Otra</option>
                </select>
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:'1.5rem', justifyContent:'flex-end' }}>
              <button 
                onClick={() => setModalFacturar(false)} 
                disabled={facturando}
                style={{ fontSize:13, padding:'7px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', cursor: facturando ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}
              >
                Cancelar
              </button>
              <button 
                onClick={() => emitirFacturaElectronica()}
                disabled={facturando} 
                style={{ fontSize:13, fontWeight:600, padding:'7px 18px', borderRadius:8, border:'none', background: facturando ? '#e2e8f0' : '#1D9E75', color: facturando ? '#94a3b8' : '#fff', cursor: facturando ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}
              >
                {facturando ? 'Emitiendo CAE...' : 'Emitir Factura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} isMobile={isMobile} />}
    </AppShell>
  )
}
