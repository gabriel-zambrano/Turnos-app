'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Toast, Spinner } from '@/components/UI'
import { createClient } from '@/lib/supabase/client'

interface Tratamiento {
  id: string
  nombre: string
  precio_base: number | null
  duracion_default: number | null
  activo: boolean
}

const inputSt: React.CSSProperties = {
  fontSize: 13, padding: '6px 10px', borderRadius: 8,
  border: '1px solid #e2e8f0', fontFamily: 'DM Sans, sans-serif',
  color: '#0a1e3d', width: '100%', boxSizing: 'border-box',
  outline: 'none',
}

export default function TratamientosPage() {
  const supabase = createClient()
  const [tratamientos, setTratamientos] = useState<Tratamiento[]>([])
  const [loading, setLoading]     = useState(true)
  const [isMobile, setIsMobile]   = useState(false)
  const [toast, setToast]         = useState<{ msg: string; tipo: string } | null>(null)
  const [modal, setModal]         = useState(false)
  const [saving, setSaving]       = useState<string | null>(null)
  const [fNombre, setFNombre]     = useState('')
  const [fPrecio, setFPrecio]     = useState<number | ''>('')
  const [fDuracion, setFDuracion] = useState<number | ''>('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.replace('/login')
    })
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function msg(m: string, tipo = 'ok') {
    setToast({ msg: m, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  const { tenant, loading: tenantLoading } = useTenantContext()

  const load = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    const { data } = await supabase.from('tratamientos').select('*').eq('tenant_id', tenant.id).order('nombre')
    if (data) setTratamientos(data as Tratamiento[])
    setLoading(false)
  }, [tenant, supabase])

  useEffect(() => { load() }, [load])

  function updateRow(id: string, k: keyof Tratamiento, v: unknown) {
    setTratamientos(prev => prev.map(t => t.id === id ? { ...t, [k]: v } : t))
  }

  async function guardar(t: Tratamiento) {
    setSaving(t.id)
    const { error } = await supabase.from('tratamientos').update({
      precio_base: t.precio_base,
      duracion_default: t.duracion_default,
      activo: t.activo,
    }).eq('id', t.id)
    setSaving(null)
    if (error) { msg('Error: ' + error.message, 'error'); return }
    msg('Guardado ✓')
  }

  async function insertar() {
    if (!tenant?.id) return msg('Error de sesión', 'error')
    if (!fNombre.trim()) return msg('Ingresá el nombre', 'error')
    setGuardando(true)
    const { error } = await supabase.from('tratamientos').insert({
      nombre: fNombre.trim(),
      precio_base: fPrecio === '' ? null : fPrecio,
      duracion_default: fDuracion === '' ? null : fDuracion,
      activo: true,
      tenant_id: tenant.id,
    })
    setGuardando(false)
    if (error) { msg('Error: ' + error.message, 'error'); return }
    setModal(false); setFNombre(''); setFPrecio(''); setFDuracion('')
    msg('Tratamiento agregado ✓'); load()
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f4f7fb', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', padding: isMobile ? '1rem' : '2rem', paddingBottom: 80, minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0a1e3d' }}>Tratamientos</div>
            <div style={{ fontSize: 13, color: '#8fa3bc', marginTop: 2 }}>Precios y duraciones por defecto</div>
          </div>
          <button
            onClick={() => setModal(true)}
            style={{ fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 10, border: 'none', background: '#138A6B', color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            + Agregar tratamiento
          </button>
        </div>

        {loading ? <Spinner /> : (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e8edf2', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {tratamientos.length === 0
                  ? <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Sin tratamientos</div>
                  : tratamientos.map((t, i) => (
                    <div key={t.id} style={{ padding: '1rem', borderBottom: i < tratamientos.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0a1e3d', marginBottom: 10 }}>{t.nombre}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#8fa3bc', marginBottom: 3 }}>Precio base ($)</div>
                          <input type="number" style={inputSt} value={t.precio_base ?? ''} onChange={e => updateRow(t.id, 'precio_base', e.target.value === '' ? null : Number(e.target.value))} placeholder="0" />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#8fa3bc', marginBottom: 3 }}>Duración (min)</div>
                          <input type="number" style={inputSt} value={t.duracion_default ?? ''} onChange={e => updateRow(t.id, 'duracion_default', e.target.value === '' ? null : Number(e.target.value))} placeholder="30" />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0a1e3d', cursor: 'pointer' }}>
                          <input type="checkbox" checked={t.activo} onChange={e => updateRow(t.id, 'activo', e.target.checked)} style={{ accentColor: '#138A6B', width: 15, height: 15 }} />
                          Activo
                        </label>
                        <button onClick={() => guardar(t)} disabled={saving === t.id} style={{ fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 8, border: 'none', background: saving === t.id ? '#e2e8f0' : '#138A6B', color: saving === t.id ? '#94a3b8' : '#fff', cursor: saving === t.id ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                          {saving === t.id ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  ))
                }
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Nombre', 'Precio base ($)', 'Duración (min)', 'Activo', ''].map(h => (
                        <th key={h} style={{ padding: '0.85rem 1.25rem', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tratamientos.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Sin tratamientos</td></tr>
                    ) : tratamientos.map((t, i) => (
                      <tr key={t.id} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                        <td style={{ padding: '0.85rem 1.25rem', fontWeight: 600, color: '#0a1e3d' }}>{t.nombre}</td>
                        <td style={{ padding: '0.6rem 1.25rem', minWidth: 150 }}>
                          <input type="number" style={inputSt} value={t.precio_base ?? ''} onChange={e => updateRow(t.id, 'precio_base', e.target.value === '' ? null : Number(e.target.value))} placeholder="0" />
                        </td>
                        <td style={{ padding: '0.6rem 1.25rem', minWidth: 130 }}>
                          <input type="number" style={inputSt} value={t.duracion_default ?? ''} onChange={e => updateRow(t.id, 'duracion_default', e.target.value === '' ? null : Number(e.target.value))} placeholder="30" />
                        </td>
                        <td style={{ padding: '0.6rem 1.25rem' }}>
                          <input type="checkbox" checked={t.activo} onChange={e => updateRow(t.id, 'activo', e.target.checked)} style={{ accentColor: '#138A6B', width: 16, height: 16, cursor: 'pointer' }} />
                        </td>
                        <td style={{ padding: '0.6rem 1.25rem' }}>
                          <button onClick={() => guardar(t)} disabled={saving === t.id} style={{ fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 8, border: 'none', background: saving === t.id ? '#e2e8f0' : '#138A6B', color: saving === t.id ? '#94a3b8' : '#fff', cursor: saving === t.id ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
                            {saving === t.id ? 'Guardando...' : 'Guardar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal agregar */}
      {modal && (
        <div onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0a1e3d', marginBottom: '1.25rem' }}>Nuevo tratamiento</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Nombre *</div>
                <input style={inputSt} value={fNombre} onChange={e => setFNombre(e.target.value)} placeholder="Ej: Blanqueamiento" autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Precio base ($)</div>
                  <input type="number" style={inputSt} value={fPrecio} onChange={e => setFPrecio(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Duración (min)</div>
                  <input type="number" style={inputSt} value={fDuracion} onChange={e => setFDuracion(e.target.value === '' ? '' : Number(e.target.value))} placeholder="30" />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancelar</button>
              <button onClick={insertar} disabled={guardando} style={{ fontSize: 13, fontWeight: 600, padding: '7px 18px', borderRadius: 8, border: 'none', background: guardando ? '#e2e8f0' : '#138A6B', color: guardando ? '#94a3b8' : '#fff', cursor: guardando ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {guardando ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  )
}
