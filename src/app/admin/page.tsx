'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { estadoSuscripcion, diasRestantes, type EstadoSuscripcion } from '@/lib/subscription'

interface Tenant {
  id: string
  nombre: string
  subdominio: string
  subdominio_generico: string | null
  plan: string
  activo: boolean
  feature_bi: boolean
  feature_whatsapp: boolean
  feature_recordatorios: boolean
  custom_domain: string | null
  creado_en: string
  subscription_status: string | null
  next_payment_date: string | null
  owner_email: string | null
}

const ESTADO_STYLE: Record<EstadoSuscripcion, { bg: string; color: string; label: string }> = {
  trial:     { bg: '#FFF3CD', color: '#856404', label: 'Trial' },
  activa:    { bg: '#D1E7DD', color: '#0A3622', label: 'Activa' },
  vencida:   { bg: '#F8D7DA', color: '#58151C', label: 'Vencida' },
  sin_datos: { bg: '#E2E3E5', color: '#41464B', label: 'Sin datos' },
}

function fechaCorta(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const PLAN_STYLE: Record<string, { bg: string; color: string }> = {
  starter:  { bg: '#E2E3E5', color: '#41464B' },
  pro:      { bg: '#D1E7DD', color: '#0A3622' },
  business: { bg: '#CFE2FF', color: '#084298' },
}

// Nota: acá NO se decide quién es admin. La autorización la resuelve
// /api/admin/tenants en el servidor (tabla admin_users o ADMIN_EMAIL) y este
// componente solo reacciona al 401/403. Así nadie queda afuera del panel por
// una variable de build mal seteada.

export default function AdminPanel() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState({
    nombre: '',
    subdominio: '',
    plan: 'starter',
    custom_domain: '',
  })
  const [msg, setMsg] = useState<{txt: string, tipo: string} | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Nota: no loguear `session` — contiene el access token del usuario.
      if (event === 'INITIAL_SESSION') {
        if (!session) {
          router.replace('/login')
          return
        }
        // Es el servidor el que dice si sos admin: si no lo sos, la API
        // responde 403 y recién ahí salimos del panel.
        loadTenants()
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  async function loadTenants() {
    // Va por la API con service-role, que verifica que seas admin en el servidor.
    const res = await fetch('/api/admin/tenants')

    if (res.status === 401) {
      router.replace('/login')
      return
    }
    if (res.status === 403) {
      router.replace('/dashboard')
      return
    }

    setAuthChecked(true)

    if (!res.ok) {
      setTenants([])
      setLoading(false)
      notify('No se pudieron cargar las clínicas', 'error')
      return
    }

    const { tenants } = await res.json()
    setTenants(tenants || [])
    setLoading(false)
  }

  function notify(txt: string, tipo = 'ok') {
    setMsg({ txt, tipo })
    setTimeout(() => setMsg(null), 3500)
  }

  async function crearTenant() {
    if (!form.nombre || !form.subdominio) {
      notify('Completá nombre y subdominio', 'error')
      return
    }
    setCreando(true)
    // Va por la API con service-role: la función crear_tenant ya no es
    // ejecutable por usuarios comunes.
    const res = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: form.nombre,
        subdominio: form.subdominio,
        plan: form.plan,
        custom_domain: form.custom_domain || null,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      notify('Error: ' + (data?.error || 'no se pudo crear la clínica'), 'error')
    } else {
      notify(`Clínica creada. Tenant ID: ${data.tenantId}`)
      setForm({ nombre: '', subdominio: '', plan: 'starter', custom_domain: '' })
      loadTenants()
    }
    setCreando(false)
  }

  async function toggleActivo(id: string, activo: boolean) {
    const res = await fetch('/api/admin/tenants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, activo: !activo }),
    })
    if (!res.ok) {
      notify('No se pudo cambiar el estado de la clínica', 'error')
      return
    }
    loadTenants()
  }

  if (!authChecked) return null

  // Conteo por estado para el resumen de arriba.
  const resumen = tenants.reduce(
    (acc, t) => {
      const e = estadoSuscripcion(t.subscription_status, t.next_payment_date)
      acc[e] = (acc[e] || 0) + 1
      return acc
    },
    { trial: 0, activa: 0, vencida: 0, sin_datos: 0 } as Record<EstadoSuscripcion, number>
  )

  const inputStyle = {
    width: '100%', border: 'none', background: '#f4f7fb',
    borderRadius: 10, padding: '0.8rem 1rem', fontSize: 14,
    color: '#0f1e2b', fontFamily: 'DM Sans, sans-serif',
    outline: 'none', boxSizing: 'border-box' as const
  }
  const labelStyle = {
    fontSize: 11, fontWeight: 600 as const, color: '#aaa',
    textTransform: 'uppercase' as const, letterSpacing: 1,
    marginBottom: 6, display: 'block' as const
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fb', fontFamily: 'DM Sans, sans-serif', padding: '2rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0f1e2b' }}>Panel Andbrand</div>
          <div style={{ fontSize: 14, color: '#aaa', marginTop: 4 }}>Gestión de clínicas y tenants</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', border: '0.5px solid #e8e8e8', marginBottom: '2rem' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f1e2b', marginBottom: '1rem' }}>Nueva clínica</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Nombre</label>
              <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Consultorio Dra. López" style={inputStyle}/>
            </div>
            <div>
              <label style={labelStyle}>Subdominio</label>
              <input value={form.subdominio} onChange={e => setForm(p => ({ ...p, subdominio: e.target.value.toLowerCase().replace(/\s/g, '') }))} placeholder="Ej: lopez" style={inputStyle}/>
            </div>
            <div>
              <label style={labelStyle}>Plan</label>
              <select value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))} style={inputStyle}>
                <option value="starter">Starter — Agenda básica</option>
                <option value="pro">Pro — Agenda + WhatsApp + Recordatorios</option>
                <option value="business">Business — Todo + BI + ROI</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Dominio personalizado (opcional)</label>
              <input value={form.custom_domain} onChange={e => setForm(p => ({ ...p, custom_domain: e.target.value }))} placeholder="Ej: turnos.dra-lopez.com.ar" style={inputStyle}/>
            </div>
          </div>
          <button onClick={crearTenant} disabled={creando} style={{ padding: '0.8rem 2rem', borderRadius: 12, border: 'none', background: creando ? '#e5e5e5' : '#0f1e2b', color: creando ? '#aaa' : '#fff', fontWeight: 600, fontSize: 14, cursor: creando ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            {creando ? 'Creando...' : '+ Crear clínica'}
          </button>
        </div>

        {/* Resumen de la cartera */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
          {([
            ['Total', tenants.length, '#0f1e2b'],
            ['En trial', resumen.trial, '#856404'],
            ['Activas', resumen.activa, '#0A3622'],
            ['Vencidas', resumen.vencida, '#58151C'],
          ] as const).map(([label, valor, color]) => (
            <div key={label} style={{ background: '#fff', borderRadius: 14, border: '0.5px solid #e8e8e8', padding: '1rem 1.25rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color, marginTop: 4 }}>{valor}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #e8e8e8', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '0.5px solid #e8e8e8', fontSize: 15, fontWeight: 600, color: '#0f1e2b' }}>
            Clínicas — {tenants.length}
          </div>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>Cargando...</div>
          ) : tenants.map((t, i) => {
            const estado = estadoSuscripcion(t.subscription_status, t.next_payment_date)
            const dias = diasRestantes(t.next_payment_date)
            const est = ESTADO_STYLE[estado]
            return (
            <div key={t.id} style={{ padding: '1rem 1.5rem', borderBottom: i < tenants.length - 1 ? '0.5px solid #f0f0ee' : 'none', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#0f1e2b' }}>{t.nombre}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
                  {t.custom_domain || t.subdominio_generico || t.subdominio}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                  {t.owner_email || <span style={{ color: '#ccc' }}>sin contacto</span>}
                </div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>
                  Alta: {fechaCorta(t.creado_en)}
                  {dias !== null && (
                    <span style={{ color: dias < 0 ? '#D85A30' : dias <= 5 ? '#856404' : '#aaa', fontWeight: dias <= 5 ? 600 : 400 }}>
                      {' · '}
                      {dias < 0 ? `vencida hace ${Math.abs(dias)}d` : `${dias}d restantes`}
                    </span>
                  )}
                </div>
              </div>

              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: est.bg, color: est.color, whiteSpace: 'nowrap' }}>
                {est.label}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {t.feature_bi && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#CFE2FF', color: '#084298', fontWeight: 600 }}>BI</span>}
                {t.feature_whatsapp && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#D1E7DD', color: '#0A3622', fontWeight: 600 }}>WA</span>}
                {t.feature_recordatorios && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#FFF3CD', color: '#856404', fontWeight: 600 }}>REC</span>}
              </div>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: PLAN_STYLE[t.plan]?.bg, color: PLAN_STYLE[t.plan]?.color }}>{t.plan}</span>
              <button onClick={() => toggleActivo(t.id, t.activo)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '0.5px solid #e8e8e8', background: t.activo ? '#E1F5EE' : '#F8D7DA', color: t.activo ? '#085041' : '#58151C', cursor: 'pointer', fontWeight: 500, fontFamily: 'DM Sans, sans-serif' }}>
                {t.activo ? 'Activo' : 'Inactivo'}
              </button>
            </div>
            )
          })}
        </div>
      </div>

      {msg && (
        <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: msg.tipo === 'error' ? '#D85A30' : '#0f1e2b', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: 12, fontSize: 13, fontWeight: 500 }}>
          {msg.txt}
        </div>
      )}
    </div>
  )
}
