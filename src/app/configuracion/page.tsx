'use client'
import { useState, useEffect, useMemo } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { PageHeader, BtnPrimary, groupCss, labelCss, inputCss, textareaCss, Toast, grid2Css, Spinner } from '@/components/UI'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'
import { urlPublicaDeClinica } from '@/lib/config'

export default function Configuracion() {
  const supabase = useMemo(() => createClient(), [])
  const { tenant, loading: tenantLoading } = useTenantContext()

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: string } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [email, setEmail] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)
  // Link público de reserva de turnos, para que el consultorio lo comparta.
  const [slugReserva, setSlugReserva] = useState('')
  // Seña que se le pide al paciente para reservar por el link público.
  const [senaReserva, setSenaReserva] = useState<number>(0)
  const [senaDatosPago, setSenaDatosPago] = useState('')
  const [emailAvisos, setEmailAvisos] = useState('')
  const [guardandoReserva, setGuardandoReserva] = useState(false)
  const [confirmandoBaja, setConfirmandoBaja] = useState(false)
  const [dandoBaja, setDandoBaja] = useState(false)
  const [linkCopiado, setLinkCopiado] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Form states
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#0a1e3d')
  const [secondaryColor, setSecondaryColor] = useState('#185FA5')
  const [accentColor, setAccentColor] = useState('#138A6B')
  const [whatsappTemplate, setWhatsappTemplate] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Estados de configuración de ARCA
  const [arcaCuit, setArcaCuit] = useState('')
  const [arcaCondicionIva, setArcaCondicionIva] = useState('Monotributista')
  const [arcaPuntoVenta, setArcaPuntoVenta] = useState('1')
  const [arcaAlicuotaIva, setArcaAlicuotaIva] = useState('10.5')
  const [arcaActivo, setArcaActivo] = useState(true)
  const [arcaRazonSocial, setArcaRazonSocial] = useState('')
  const [arcaDomicilio, setArcaDomicilio] = useState('')
  const [arcaIngresosBrutos, setArcaIngresosBrutos] = useState('EXENTO')
  const [arcaInicioActividades, setArcaInicioActividades] = useState('')

  // Automatización de CRM (campañas por WhatsApp)
  const [crmCumples, setCrmCumples] = useState(false)
  const [crmRecall, setCrmRecall] = useState(false)
  const [crmReactivacion, setCrmReactivacion] = useState(false)

  useEffect(() => {
    if (tenant) {
      setNombre(tenant.nombre || '')
      setDireccion(tenant.direccion || '')
      setTelefono(tenant.telefono || '')
      setPrimaryColor(tenant.primaryColor || '#0a1e3d')
      setSecondaryColor(tenant.secondaryColor || '#185FA5')
      setAccentColor(tenant.accentColor || '#138A6B')
      setWhatsappTemplate(tenant.whatsappTemplate || '')
      setLogoUrl(tenant.logoUrl || '')

      const tenantId = tenant.id
      // Cargar configuración de ARCA
      const loadArcaConfig = async () => {
        try {
          const res = await fetch(`/api/facturacion/config?tenantId=${tenantId}`)
          const data = await res.json()
          if (data.config) {
            setArcaCuit(data.config.cuit || '')
            setArcaCondicionIva(data.config.condicion_iva || 'Monotributista')
            setArcaPuntoVenta(String(data.config.punto_venta || '1'))
            setArcaAlicuotaIva(String(data.config.alicuota_iva ?? '10.5'))
            setArcaActivo(data.config.activo ?? true)
            setArcaRazonSocial(data.config.razon_social || '')
            setArcaDomicilio(data.config.domicilio_comercial || '')
            setArcaIngresosBrutos(data.config.ingresos_brutos || 'EXENTO')
            setArcaInicioActividades(data.config.inicio_actividades || '')
          }
        } catch (err) {
          console.error('Error al cargar configuración ARCA:', err)
        }
      }
      loadArcaConfig()

      // Slug para el link público de reserva
      supabase.from('tenants')
        .select('subdominio_generico, subdominio, sena_reserva, sena_datos_pago, email_avisos')
        .eq('id', tenantId).maybeSingle().then(({ data }) => {
          if (!data) return
          setSlugReserva(data.subdominio_generico || data.subdominio || '')
          setSenaReserva(Number(data.sena_reserva) || 0)
          setSenaDatosPago(data.sena_datos_pago || '')
          setEmailAvisos(data.email_avisos || '')
        })

      // Cargar config de campañas de CRM
      supabase.from('crm_campanas').select('*').eq('tenant_id', tenantId).maybeSingle().then(({ data }) => {
        if (data) {
          setCrmCumples(!!data.cumples_activo)
          setCrmRecall(!!data.recall_activo)
          setCrmReactivacion(!!data.reactivacion_activo)
        }
      })
    }
  }, [tenant])

  // Baja de la suscripción: corta el débito, no borra datos.
  async function cancelarSuscripcion() {
    if (!tenant?.id) return
    setDandoBaja(true)
    try {
      const res = await fetch('/api/billing/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        msg(data.error || 'No pudimos procesar la baja', 'error')
      } else {
        setConfirmandoBaja(false)
        msg(data.mensaje || 'Suscripción dada de baja')
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch {
      msg('No pudimos conectar. Intentá de nuevo.', 'error')
    }
    setDandoBaja(false)
  }

  // Guarda la configuración de la reserva online (seña y avisos).
  async function guardarReservaOnline() {
    if (!tenant?.id) return
    setGuardandoReserva(true)
    const { error } = await supabase.from('tenants').update({
      sena_reserva: senaReserva || 0,
      sena_datos_pago: senaDatosPago.trim() || null,
      email_avisos: emailAvisos.trim() || null,
    }).eq('id', tenant.id)
    setGuardandoReserva(false)
    if (error) return msg('Error al guardar: ' + error.message, 'error')
    msg('Reserva online actualizada ✓')
  }

  // Guarda al instante el toggle de una campaña de CRM
  async function toggleCampana(campo: 'cumples_activo' | 'recall_activo' | 'reactivacion_activo', valor: boolean) {
    if (!tenant?.id) return
    const setters = { cumples_activo: setCrmCumples, recall_activo: setCrmRecall, reactivacion_activo: setCrmReactivacion }
    setters[campo](valor)
    const { error } = await supabase.from('crm_campanas').upsert({
      tenant_id: tenant.id,
      [campo]: valor,
      actualizado_en: new Date().toISOString(),
    })
    if (error) { msg('Error al guardar: ' + error.message, 'error'); setters[campo](!valor) }
    else msg('Automatización actualizada ✓')
  }

  useEffect(() => {
    async function getSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email) {
        setEmail(session.user.email)
      }
    }
    getSession()
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const billingParam = params.get('billing')
      const preapprovalId = params.get('preapproval_id')

      if (billingParam === 'success') {
        msg('¡Suscripción procesada con éxito! Tu plan se actualizará en unos instantes. ✓')
        window.history.replaceState({}, '', window.location.pathname)
      } else if (billingParam === 'success-mock' && preapprovalId) {
        const triggerMockWebhook = async () => {
          try {
            const res = await fetch('/api/webhooks/mercadopago', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: preapprovalId })
            })
            if (res.ok) {
              msg('¡Simulación de suscripción activada! Plan Pro habilitado ✓')
              setTimeout(() => {
                window.history.replaceState({}, '', window.location.pathname)
                window.location.reload()
              }, 2000)
            } else {
              msg('Error al activar la suscripción simulada', 'error')
            }
          } catch (err) {
            console.error(err)
            msg('Error al activar la simulación', 'error')
          }
        }
        triggerMockWebhook()
      }
    }
  }, [])

  async function handleUpgrade() {
    if (!tenant?.id) return msg('Error: No se encontró el consultorio actual', 'error')
    if (!email) return msg('Error: No se encontró la sesión del usuario', 'error')
    setCheckingOut(true)

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenantId: tenant.id,
          email: email
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Error al generar checkout')
      }

      if (data.checkoutUrl) {
        msg('Redirigiendo a la pasarela de pago...')
        window.location.href = data.checkoutUrl
      } else {
        throw new Error('No se recibió la URL de checkout')
      }
    } catch (err: any) {
      msg(err.message, 'error')
    } finally {
      setCheckingOut(false)
    }
  }

  function msg(m: string, tipo = 'ok') {
    setToast({ msg: m, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0 || !tenant?.id) return
    const file = e.target.files[0]
    
    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      return msg('Por favor, seleccioná una imagen válida (JPG, PNG, SVG).', 'error')
    }

    setUploadingLogo(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${tenant.id}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `tenant-logos/${fileName}`

    try {
      // 1. Subir a Supabase Storage (bucket 'logos')
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file, { cacheControl: '3600', upsert: false })
      
      if (uploadError) throw uploadError

      // 2. Obtener la URL pública
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(filePath)
      
      // 3. Actualizar el estado local y la DB
      setLogoUrl(publicUrl)
      const { data: upd, error: dbError } = await supabase.from('tenants').update({ logourl: publicUrl }).eq('id', tenant.id).select('id')

      if (dbError) throw dbError
      if (!upd || upd.length === 0) throw new Error('No se pudo guardar el logo: no tenés permisos para modificar esta clínica (debés ser dueño o administrador).')
      msg('Logo subido correctamente ✓')
      
    } catch (err: any) {
      msg('Error al subir logo: ' + err.message, 'error')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleSave() {
    if (!tenant?.id) return msg('Error: No se encontró la clínica actual', 'error')
    setSaving(true)

    try {
      // 1. Guardar configuración de la clínica
      const updates = {
        nombre,
        direccion,
        telefono,
        primarycolor: primaryColor,
        secondarycolor: secondaryColor,
        accentcolor: accentColor,
        whatsapptemplate: whatsappTemplate
      }

      const { data: tenantUpd, error: tenantError } = await supabase
        .from('tenants')
        .update(updates)
        .eq('id', tenant.id)
        .select('id')

      if (tenantError) throw new Error(tenantError.message)
      if (!tenantUpd || tenantUpd.length === 0) {
        throw new Error('No se pudieron guardar los cambios: no tenés permisos para modificar esta clínica (debés ser dueño o administrador).')
      }

      // 2. Guardar configuración fiscal si hay CUIT
      if (arcaCuit) {
        const cleanCuit = arcaCuit.replace(/-/g, '')
        if (cleanCuit.length !== 11 || isNaN(Number(cleanCuit))) {
          throw new Error('El CUIT debe contener exactamente 11 dígitos numéricos.')
        }

        const arcaRes = await fetch('/api/facturacion/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: tenant.id,
            cuit: cleanCuit,
            condicionIva: arcaCondicionIva,
            puntoVenta: Number(arcaPuntoVenta) || 1,
            alicuotaIva: Number(arcaAlicuotaIva),
            razonSocial: arcaRazonSocial,
            domicilioComercial: arcaDomicilio,
            ingresosBrutos: arcaIngresosBrutos,
            inicioActividades: arcaInicioActividades,
            activo: arcaActivo
          })
        })

        if (!arcaRes.ok) {
          const arcaData = await arcaRes.json()
          throw new Error(arcaData.error || 'Error al guardar la configuración fiscal')
        }
      }

      msg('Configuración guardada correctamente ✓')
      setTimeout(() => window.location.reload(), 1000)
    } catch (err: any) {
      msg('Error al guardar: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // El link que el consultorio comparte tiene que salir por SU dominio, no por
  // el de la plataforma ni por el que el odontólogo tenga abierto.
  const linkReserva = `${urlPublicaDeClinica(tenant)}/reserva/${slugReserva}`

  if (tenantLoading) return <Spinner />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', paddingBottom: isMobile ? 80 : 0, minWidth: 0 }}>
        <PageHeader 
          title="Configuración de Clínica" 
          sub="Personalizá los colores, marca y textos para tus pacientes"
          right={
            <BtnPrimary onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </BtnPrimary>
          }
        />
        
        <div style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: 800 }}>

          {slugReserva && (
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ fontSize: 16, color: 'var(--text-dark, #0a1e3d)', marginBottom: 6, fontWeight: 700 }}>
                Link para que tus pacientes pidan turno
              </h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 1rem', lineHeight: 1.5 }}>
                Compartilo en Instagram, WhatsApp o Google. El paciente elige día y horario entre
                los que tenés libres, y el turno te llega como pendiente para que lo confirmes.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  readOnly
                  style={{ ...inputCss, flex: 1, minWidth: 220, fontFamily: 'monospace', fontSize: 13 }}
                  value={linkReserva}
                  onFocus={e => e.currentTarget.select()}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(linkReserva)
                    setLinkCopiado(true)
                    setTimeout(() => setLinkCopiado(false), 2000)
                  }}
                  style={{ background: '#0f1e2b', color: '#fff', border: 'none', padding: '0 20px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {linkCopiado ? 'Copiado ✓' : 'Copiar'}
                </button>
                <a
                  href={linkReserva}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderRadius: 10, border: '1px solid #e2e8f0', color: '#0f1e2b', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}
                >
                  Ver
                </a>
              </div>

              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e8edf2' }}>
                <div style={grid2Css}>
                  <div style={groupCss}>
                    <label style={labelCss}>Seña para reservar (pesos)</label>
                    <input
                      type="number" min="0" step="500" style={inputCss}
                      value={senaReserva || ''}
                      onChange={e => setSenaReserva(Number(e.target.value) || 0)}
                      placeholder="0"
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, display: 'block' }}>
                      0 = no se pide seña. Con un monto cargado, el paciente lo ve antes de pedir el turno.
                    </span>
                  </div>
                  <div style={groupCss}>
                    <label style={labelCss}>Email donde recibir los avisos</label>
                    <input
                      type="email" style={inputCss}
                      value={emailAvisos}
                      onChange={e => setEmailAvisos(e.target.value)}
                      placeholder={email || 'tu@email.com'}
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, display: 'block' }}>
                      Si lo dejás vacío, se usa el email con el que iniciás sesión.
                    </span>
                  </div>
                </div>

                <div style={groupCss}>
                  <label style={labelCss}>Cómo abonar la seña (se le muestra al paciente)</label>
                  <textarea
                    style={{ ...textareaCss, minHeight: 70 }}
                    value={senaDatosPago}
                    onChange={e => setSenaDatosPago(e.target.value)}
                    placeholder={'Ej: Transferí a\nAlias: consultorio.benegas\nCBU: 0000003100000000000000\nMandanos el comprobante por WhatsApp.'}
                  />
                </div>

                <BtnPrimary onClick={guardarReservaOnline} disabled={guardandoReserva}>
                  {guardandoReserva ? 'Guardando...' : 'Guardar reserva online'}
                </BtnPrimary>
              </div>
            </div>
          )}

          <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: 16, color: 'var(--text-dark, #0a1e3d)', marginBottom: '1.5rem', fontWeight: 700 }}>
              Información General
            </h3>
            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Nombre del Consultorio</label>
                <input style={inputCss} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. DentalCare Palermo" />
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Teléfono (para portal)</label>
                <input style={inputCss} value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+54 9 11 1234-5678" />
              </div>
            </div>
            <div style={groupCss}>
              <label style={labelCss}>Dirección (para portal y agenda)</label>
              <input style={inputCss} value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Ej: Av. Corrientes 1234, Piso 2 B, CABA" />
            </div>

            <div style={{ ...groupCss, marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e8edf2' }}>
              <label style={labelCss}>Logo Oficial de la Clínica</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" style={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 8, border: '1px solid #e8edf2' }} />
                ) : (
                  <div style={{ width: 60, height: 60, background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 24 }}>🏢</div>
                )}
                <div>
                  <input type="file" accept="image/*" onChange={handleUploadLogo} id="logo-upload" style={{ display: 'none' }} />
                  <label htmlFor="logo-upload" style={{ display: 'inline-block', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: '1px solid #dde5ef', background: '#fff', color: '#4a6080', cursor: uploadingLogo ? 'not-allowed' : 'pointer' }}>
                    {uploadingLogo ? 'Subiendo...' : 'Subir nuevo logo'}
                  </label>
                  <div style={{ fontSize: 11, color: '#8fa3bc', marginTop: 6 }}>Formatos soportados: JPG, PNG, SVG.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: 16, color: 'var(--text-dark, #0a1e3d)', marginBottom: '1.5rem', fontWeight: 700 }}>
              Colores y Marca (Branding)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              <div style={groupCss}>
                <label style={labelCss}>Color Principal</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} style={{ width: 44, height: 44, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#8fa3bc' }}>{primaryColor}</span>
                </div>
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Color Secundario</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} style={{ width: 44, height: 44, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#8fa3bc' }}>{secondaryColor}</span>
                </div>
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Color de Acento</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} style={{ width: 44, height: 44, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#8fa3bc' }}>{accentColor}</span>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted, #8fa3bc)', marginTop: '1rem' }}>
              Estos colores se aplicarán automáticamente en el Portal del Paciente.
            </p>
          </div>

          {tenant && (
            <>
              {/* Tarjeta de Configuración de Facturación Electrónica ARCA */}
              <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: 16, color: 'var(--text-dark, #0a1e3d)', marginBottom: '0.5rem', fontWeight: 700 }}>
                  Facturación Electrónica (ARCA / ex AFIP)
                </h3>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.4 }}>
                  Configurá los datos fiscales de tu clínica para emitir facturas electrónicas a tus pacientes directamente desde el módulo de Caja Diaria.
                </p>

                <div style={{ ...grid2Css, marginBottom: '1.25rem' }}>
                  <div style={groupCss}>
                    <label style={labelCss}>CUIT de la Clínica / Profesional</label>
                    <input 
                      style={inputCss} 
                      value={arcaCuit} 
                      onChange={e => setArcaCuit(e.target.value)} 
                      placeholder="Ej. 20-34567890-9" 
                    />
                  </div>
                  <div style={groupCss}>
                    <label style={labelCss}>Punto de Venta (registrado en ARCA)</label>
                    <input 
                      style={inputCss} 
                      type="number" 
                      value={arcaPuntoVenta} 
                      onChange={e => setArcaPuntoVenta(e.target.value)} 
                      placeholder="Ej. 2" 
                    />
                  </div>
                </div>

                <div style={{ ...grid2Css, marginBottom: '1.5rem' }}>
                  <div style={groupCss}>
                    <label style={labelCss}>Condición frente al IVA</label>
                    <select 
                      style={inputCss} 
                      value={arcaCondicionIva} 
                      onChange={e => setArcaCondicionIva(e.target.value)}
                    >
                      <option value="Monotributista">Responsable Monotributo (Factura C)</option>
                      <option value="Responsable Inscripto">Responsable Inscripto (Facturas A y B)</option>
                      <option value="Exento">IVA Exento</option>
                    </select>
                  </div>
                  <div style={{ ...groupCss, justifyContent: 'center' }}>
                    <label style={{ ...labelCss, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 22 }}>
                      <input
                        type="checkbox"
                        checked={arcaActivo}
                        onChange={e => setArcaActivo(e.target.checked)}
                        style={{ width: 16, height: 16 }}
                      />
                      Activar módulo de facturación electrónica
                    </label>
                  </div>
                </div>

                {arcaCondicionIva === 'Responsable Inscripto' && (
                  <div style={{ ...grid2Css, marginBottom: '1.5rem' }}>
                    <div style={groupCss}>
                      <label style={labelCss}>Alícuota de IVA (Facturas A y B)</label>
                      <select
                        style={inputCss}
                        value={arcaAlicuotaIva}
                        onChange={e => setArcaAlicuotaIva(e.target.value)}
                      >
                        <option value="10.5">10,5% (servicios de salud)</option>
                        <option value="21">21%</option>
                        <option value="0">0% (exento)</option>
                      </select>
                      <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Verificá la alícuota que corresponde con tu contador.</span>
                    </div>
                  </div>
                )}

                <div style={{ borderTop: '1px solid #e8edf2', margin: '0.5rem 0 1.25rem' }} />
                <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: '1rem' }}>
                  Datos que se imprimen en el encabezado de la factura (PDF).
                </p>

                <div style={{ ...grid2Css, marginBottom: '1.25rem' }}>
                  <div style={groupCss}>
                    <label style={labelCss}>Razón Social</label>
                    <input style={inputCss} value={arcaRazonSocial} onChange={e => setArcaRazonSocial(e.target.value)} placeholder="Ej. BENEGAS WALTER EBER" />
                  </div>
                  <div style={groupCss}>
                    <label style={labelCss}>Domicilio Comercial</label>
                    <input style={inputCss} value={arcaDomicilio} onChange={e => setArcaDomicilio(e.target.value)} placeholder="Ej. Av. Santa Fe 3329 1B" />
                  </div>
                </div>

                <div style={{ ...grid2Css, marginBottom: '1.5rem' }}>
                  <div style={groupCss}>
                    <label style={labelCss}>Ingresos Brutos</label>
                    <input style={inputCss} value={arcaIngresosBrutos} onChange={e => setArcaIngresosBrutos(e.target.value)} placeholder="Ej. EXENTO o N° de IIBB" />
                  </div>
                  <div style={groupCss}>
                    <label style={labelCss}>Inicio de Actividades</label>
                    <input style={inputCss} value={arcaInicioActividades} onChange={e => setArcaInicioActividades(e.target.value)} placeholder="Ej. 01/12/2017" />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 12, border: '1px solid #e8edf2', fontSize: 12, color: '#4a6080', lineHeight: 1.5 }}>
                  <strong style={{ color: '#0f1e2b', display: 'block', marginBottom: 4 }}>Pasos para habilitar delegación (Esquema Seguro):</strong>
                  1. Ingresá a la web de ARCA/AFIP con tu Clave Fiscal.<br />
                  2. Buscá el servicio <strong>Administrador de Relaciones de Clave Fiscal</strong>.<br />
                  3. Seleccioná <strong>Nueva Relación</strong> y luego el servicio <strong>Facturación Electrónica (wsfe)</strong>.<br />
                  4. Designá como Representante al CUIT de la Plataforma: <strong>{process.env.NEXT_PUBLIC_ARCA_PLATFORM_CUIT || '(a confirmar — consultanos)'}</strong>.<br />
                  Mientras la plataforma no tenga credenciales de ARCA cargadas, las facturas se emiten en <strong>modo simulación</strong> (sin validez fiscal, marcadas como &quot;Simulada&quot;).
                </div>
              </div>

              {/* Automatización de CRM (campañas por WhatsApp) */}
              <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: 16, color: 'var(--text-dark, #0a1e3d)', marginBottom: '0.5rem', fontWeight: 700 }}>
                  Automatización de CRM (WhatsApp)
                </h3>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: '1.25rem', lineHeight: 1.4 }}>
                  Envío automático de mensajes por WhatsApp. Se procesan una vez por día. Requiere tener conectado WhatsApp Business (si no, no se envía nada).
                </p>
                {[
                  { key: 'cumples_activo' as const, val: crmCumples, titulo: '🎉 Saludo de cumpleaños', desc: 'El día del cumpleaños del paciente.' },
                  { key: 'recall_activo' as const, val: crmRecall, titulo: '🦷 Recordatorio de control (recall)', desc: 'Cuando vence el control según su último tratamiento.' },
                  { key: 'reactivacion_activo' as const, val: crmReactivacion, titulo: '⏰ Reactivación de inactivos', desc: 'Pacientes sin visita hace más de 6 meses.' },
                ].map(c => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0.9rem 0', borderTop: '1px solid #eef2f6' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0a1e3d' }}>{c.titulo}</div>
                      <div style={{ fontSize: 12, color: '#8fa3bc' }}>{c.desc}</div>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, cursor: 'pointer' }}>
                      <input type="checkbox" checked={c.val} onChange={e => toggleCampana(c.key, e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: 'absolute', inset: 0, borderRadius: 24, background: c.val ? '#1D9E75' : '#cbd5e1', transition: '0.2s' }} />
                      <span style={{ position: 'absolute', top: 3, left: c.val ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: '0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </label>
                  </div>
                ))}
              </div>

              <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: 16, color: 'var(--text-dark, #0a1e3d)', fontWeight: 700, margin: 0 }}>
                    Planes y Suscripción (Facturación)
                  </h3>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  background: tenant.plan === 'pro' ? '#d1fae5' : '#e2e8f0',
                  color: tenant.plan === 'pro' ? '#065f46' : '#64748b'
                }}>
                  Plan {tenant.plan === 'pro' ? 'Pro 🚀' : 'Starter'}
                </span>
              </div>

              {tenant.plan !== 'pro' ? (
                <div>
                  <p style={{ fontSize: 14, color: '#4a6080', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                    Tu consultorio se encuentra en el <strong>Plan Starter</strong>. Actualizá al <strong>Plan Pro</strong> para desbloquear las herramientas de Business Intelligence, analítica financiera avanzada, exportación de reportes y potenciar tu clínica dental.
                  </p>

                  <div style={{ ...grid2Css, marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1rem', border: '1px solid #e8edf2', borderRadius: 12, background: '#f8fafc' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: '0.5rem' }}>Plan Starter</div>
                      <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <li>Agenda interactiva & turnos</li>
                        <li>Historial básico de pacientes</li>
                        <li>Filtros y buscador de citas</li>
                      </ul>
                    </div>

                    <div style={{ padding: '1rem', border: '2px solid #6366f1', borderRadius: 12, background: '#e0e7ff33', position: 'relative' }}>
                      <span style={{ position: 'absolute', top: -10, right: 10, background: '#6366f1', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' }}>Recomendado</span>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1e2b', marginBottom: '0.5rem' }}>Plan Pro ⭐</div>
                      <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: 12, color: '#312e81', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <li><strong>Módulo de Analítica & BI</strong></li>
                        <li><strong>Ganancia neta y rentabilidad</strong></li>
                        <li><strong>Exportación a CSV / Excel</strong></li>
                        <li>Recordatorios automáticos</li>
                      </ul>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap', background: '#f8fafc', padding: '1rem', borderRadius: 12, border: '1px solid #e8edf2' }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#8fa3bc', fontWeight: 600 }}>PRECIO MENSUAL</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#0f1e2b' }}>$3.500 ARS <span style={{ fontSize: 13, fontWeight: 500, color: '#8fa3bc' }}>/mes</span></div>
                    </div>
                    <BtnPrimary onClick={handleUpgrade} disabled={checkingOut}>
                      {checkingOut ? 'Procesando...' : 'Mejorar al Plan Pro'}
                    </BtnPrimary>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', background: '#d1fae533', border: '1px solid #10b98133', padding: '1rem 1.25rem', borderRadius: 12, marginBottom: '1.5rem' }}>
                    <span style={{ fontSize: 20, color: '#10b981' }}>✓</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#065f46', marginBottom: 2 }}>¡Tu suscripción Pro está activa!</div>
                      <p style={{ fontSize: 13, color: '#047857', margin: 0, lineHeight: 1.4 }}>
                        Tenés acceso completo a todas las características premium, incluyendo el módulo de Business Intelligence y Analítica.
                      </p>
                    </div>
                  </div>

                  <div style={{ ...grid2Css, fontSize: 13, color: '#4a6080' }}>
                    <div style={{ padding: '0.75rem 1rem', border: '1px solid #e8edf2', borderRadius: 10 }}>
                      <span style={{ fontSize: 11, color: '#8fa3bc', display: 'block', marginBottom: 2, fontWeight: 600 }}>ESTADO DE FACTURACIÓN</span>
                      <strong>
                        {tenant.subscriptionStatus === 'authorized' ? 'Autorizado / Activo' : tenant.subscriptionStatus || 'Activo'}
                      </strong>
                    </div>
                    <div style={{ padding: '0.75rem 1rem', border: '1px solid #e8edf2', borderRadius: 10 }}>
                      <span style={{ fontSize: 11, color: '#8fa3bc', display: 'block', marginBottom: 2, fontWeight: 600 }}>PRÓXIMA FECHA DE PAGO</span>
                      <strong>
                        {tenant.nextPaymentDate 
                          ? new Date(tenant.nextPaymentDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                          : 'No programada'
                        }
                      </strong>
                    </div>
                  </div>

                  <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e8edf2' }}>
                    {tenant?.subscriptionStatus === 'cancelled' ? (
                      <div style={{ fontSize: 12.5, color: '#856404', background: '#FFF3CD', border: '1px solid #ffe08a', borderRadius: 10, padding: '12px 14px', lineHeight: 1.55 }}>
                        Tu suscripción está dada de baja: no se te va a cobrar de nuevo.
                        Conservás el acceso hasta el final del período que ya abonaste, y
                        tus datos siguen guardados. Podés reactivarla cuando quieras.
                      </div>
                    ) : confirmandoBaja ? (
                      <div style={{ fontSize: 12.5, color: '#4a6080', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px', lineHeight: 1.55 }}>
                        <strong style={{ color: '#0a1e3d' }}>¿Damos de baja la suscripción?</strong>
                        <div style={{ marginTop: 6 }}>
                          Se corta el débito automático. Seguís usando el sistema hasta el
                          final del período que ya pagaste, y <strong>no se borra nada</strong>:
                          las historias clínicas, los turnos y los comprobantes quedan donde están.
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                          <button onClick={cancelarSuscripcion} disabled={dandoBaja}
                            style={{ background: '#D85A30', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: dandoBaja ? 0.6 : 1 }}>
                            {dandoBaja ? 'Procesando...' : 'Sí, dar de baja'}
                          </button>
                          <button onClick={() => setConfirmandoBaja(false)} disabled={dandoBaja}
                            style={{ background: '#fff', color: '#4a6080', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                            No, volver
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#8fa3bc', marginBottom: 10 }}>
                          Suscripción gestionada de forma segura mediante MercadoPago.
                        </div>
                        <button onClick={() => setConfirmandoBaja(true)}
                          style={{ background: 'none', border: 'none', color: '#8fa3bc', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                          Dar de baja la suscripción
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: 16, color: 'var(--text-dark, #0a1e3d)', marginBottom: '1.5rem', fontWeight: 700 }}>
              Mensajería Automática
            </h3>
            <div style={groupCss}>
              <label style={labelCss}>Plantilla de Confirmación de Turno (WhatsApp)</label>
              <textarea 
                style={{ ...textareaCss, minHeight: 120 }} 
                value={whatsappTemplate} 
                onChange={e => setWhatsappTemplate(e.target.value)} 
              />
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted, #8fa3bc)', lineHeight: 1.5 }}>
                <strong>Variables soportadas:</strong> <br/>
                <code>{'{nombre_paciente}'}</code>, <code>{'{nombre_clinica}'}</code>, <code>{'{dia_semana}'}</code>, <code>{'{fecha}'}</code>, <code>{'{hora}'}</code>, <code>{'{tratamiento}'}</code>, <code>{'{link}'}</code>
              </div>
            </div>
          </div>
        </div>
      </main>
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} isMobile={isMobile} />}
    </div>
  )
}
