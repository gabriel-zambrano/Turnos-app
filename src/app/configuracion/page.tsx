'use client'
import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { PageHeader, BtnPrimary, groupCss, labelCss, inputCss, textareaCss, Toast, grid2Css, Spinner } from '@/components/UI'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'

export default function Configuracion() {
  const supabase = createClient()
  const { tenant, loading: tenantLoading } = useTenantContext()

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: string } | null>(null)

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
    }
  }, [tenant])

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
      const { error: dbError } = await supabase.from('tenants').update({ logoUrl: publicUrl }).eq('id', tenant.id)
      
      if (dbError) throw dbError
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

    const updates = {
      nombre,
      direccion,
      telefono,
      primaryColor,
      secondaryColor,
      accentColor,
      whatsappTemplate
    }

    const { error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', tenant.id)

    setSaving(false)
    if (error) {
      msg('Error al guardar: ' + error.message, 'error')
    } else {
      msg('Configuración guardada correctamente ✓')
      // Note: Idealmente se actualiza el TenantContext o se recarga la página
      setTimeout(() => window.location.reload(), 1000)
    }
  }

  if (tenantLoading) return <Spinner />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        <PageHeader 
          title="Configuración de Clínica" 
          sub="Personalizá los colores, marca y textos para tus pacientes"
          right={
            <BtnPrimary onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </BtnPrimary>
          }
        />
        
        <div style={{ padding: '2rem', maxWidth: 800 }}>
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
              <input style={inputCss} value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Av. Santa Fe 3329, Piso 1 B, Palermo" />
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
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  )
}
