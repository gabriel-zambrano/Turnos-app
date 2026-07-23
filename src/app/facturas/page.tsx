'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Spinner, PageHeader, Toast } from '@/components/UI'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'

interface Factura {
  id: string
  tipo_comprobante: number
  punto_venta: number
  nro_comprobante: number
  cae: string
  cae_expira: string
  monto: number
  paciente_nombre: string
  paciente_doc_tipo: string
  paciente_doc_nro: string
  concepto: string | null
  estado: string
  simulada: boolean
  anula_factura_id: string | null
  creada_en: string
}

const TIPO_LETRA: Record<number, string> = { 1: 'A', 6: 'B', 11: 'C', 3: 'A', 8: 'B', 13: 'C' }
const ES_NOTA_CREDITO = (t: number) => t === 3 || t === 8 || t === 13
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n)
}

export default function FacturasPage() {
  const supabase = useMemo(() => createClient(), [])
  const { tenant, loading: tenantLoading } = useTenantContext()
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroMes, setFiltroMes] = useState<string>('') // '' = todos; 'YYYY-MM'
  const [anulando, setAnulando] = useState<string | null>(null)
  const [confirmAnular, setConfirmAnular] = useState<Factura | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: string } | null>(null)
  const msg = (m: string, tipo = 'ok') => { setToast({ msg: m, tipo }); setTimeout(() => setToast(null), 4000) }

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
      .from('facturas')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('estado', 'emitida')
      .order('creada_en', { ascending: false })
    setFacturas(data || [])
    setLoading(false)
  }, [tenant, supabase])

  useEffect(() => { if (tenant) load() }, [tenant, load])

  // Meses disponibles para el filtro
  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>()
    facturas.forEach(f => set.add(f.creada_en.slice(0, 7)))
    return Array.from(set).sort().reverse()
  }, [facturas])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return facturas.filter(f => {
      if (filtroMes && !f.creada_en.startsWith(filtroMes)) return false
      if (!q) return true
      return (
        f.paciente_nombre?.toLowerCase().includes(q) ||
        String(f.nro_comprobante).includes(q) ||
        (f.concepto || '').toLowerCase().includes(q) ||
        (f.paciente_doc_nro || '').includes(q)
      )
    })
  }, [facturas, busqueda, filtroMes])

  // Ids de facturas que ya fueron anuladas (tienen una NC apuntándolas)
  const anuladasIds = useMemo(() => {
    const s = new Set<string>()
    facturas.forEach(f => { if (f.anula_factura_id) s.add(f.anula_factura_id) })
    return s
  }, [facturas])

  // Totales netos: las notas de crédito restan del total facturado
  const totales = useMemo(() => {
    const reales = filtradas.filter(f => !f.simulada)
    const neto = reales.reduce((s, f) => s + (ES_NOTA_CREDITO(f.tipo_comprobante) ? -Number(f.monto) : Number(f.monto)), 0)
    return {
      cantidad: filtradas.length,
      montoReal: neto,
      cantidadReal: reales.length,
    }
  }, [filtradas])

  async function anular(f: Factura) {
    if (!tenant) return
    setConfirmAnular(null)
    setAnulando(f.id)
    try {
      const res = await fetch('/api/facturacion/anular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id, facturaId: f.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al anular')
      msg(`Nota de crédito N°${data.notaCredito.nro_comprobante} emitida ✓`)
      load()
    } catch (err: any) {
      msg('Error: ' + err.message, 'error')
    } finally {
      setAnulando(null)
    }
  }

  if (tenantLoading || loading) return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></main>
    </div>
  )

  const card: React.CSSProperties = { background: 'var(--bg-card, #fff)', border: '1px solid var(--border-light, rgba(56,138,221,0.12))', borderRadius: 14, padding: '1rem 1.25rem' }
  const inputSt: React.CSSProperties = { fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'DM Sans, sans-serif', color: '#0a1e3d', outline: 'none' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)', flex: 1, minWidth: 0, paddingBottom: isMobile ? 90 : 0 }}>
        <PageHeader title="Facturas emitidas" sub={tenant?.nombre} />

        <div style={{ padding: isMobile ? '1rem' : '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Tarjetas de totales */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12 }}>
            <div style={card}>
              <div style={{ fontSize: 11, color: '#8fa3bc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Comprobantes</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0a1e3d', marginTop: 4 }}>{totales.cantidad}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: '#8fa3bc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Total facturado</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1D9E75', marginTop: 4 }}>{fmt(totales.montoReal)}</div>
            </div>
            <div style={{ ...card, gridColumn: isMobile ? 'span 2' : 'auto' }}>
              <div style={{ fontSize: 11, color: '#8fa3bc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Con validez fiscal</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0a1e3d', marginTop: 4 }}>{totales.cantidadReal}</div>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              style={{ ...inputSt, flex: 1, minWidth: 200 }}
              placeholder="Buscar por paciente, N° de comprobante o concepto…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            <select style={inputSt} value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
              <option value="">Todos los meses</option>
              {mesesDisponibles.map(m => {
                const [a, mm] = m.split('-')
                return <option key={m} value={m}>{MESES[Number(mm) - 1]} {a}</option>
              })}
            </select>
          </div>

          {/* Lista */}
          {filtradas.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '3rem 1rem', color: '#8fa3bc' }}>
              {facturas.length === 0
                ? 'Todavía no emitiste facturas. Facturá desde Finanzas → botón "Facturar".'
                : 'No hay facturas que coincidan con el filtro.'}
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {filtradas.map((f, i) => {
                const esNC = ES_NOTA_CREDITO(f.tipo_comprobante)
                const anulada = anuladasIds.has(f.id)
                return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '12px 14px' : '14px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--border-lighter, rgba(56,138,221,0.08))', opacity: anulada ? 0.6 : 1 }}>
                  {/* Letra + tipo */}
                  <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 8, background: esNC ? '#b45309' : '#0f1e2b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>
                    {TIPO_LETRA[f.tipo_comprobante] || 'C'}
                  </div>

                  {/* Datos */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0a1e3d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {esNC && <span style={{ color: '#b45309' }}>NC </span>}{f.paciente_nombre}
                      <span style={{ color: '#94a3b8', fontWeight: 500 }}> · N°{String(f.punto_venta).padStart(4, '0')}-{String(f.nro_comprobante).padStart(8, '0')}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#8fa3bc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {new Date(f.creada_en).toLocaleDateString('es-AR')} · {f.concepto || 'Servicio'}
                    </div>
                  </div>

                  {/* Estado + monto */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: esNC ? '#b45309' : '#0a1e3d' }}>{esNC ? '-' : ''}{fmt(f.monto)}</div>
                    {anulada
                      ? <span style={{ fontSize: 9.5, background: '#fee2e2', color: '#991b1b', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>Anulada</span>
                      : esNC
                        ? <span style={{ fontSize: 9.5, background: '#fef3c7', color: '#b45309', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>Nota de crédito</span>
                        : f.simulada
                          ? <span style={{ fontSize: 9.5, background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>Simulada</span>
                          : <span style={{ fontSize: 9.5, background: '#d1fae5', color: '#065f46', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>Autorizada</span>}
                  </div>

                  {/* Descargar PDF */}
                  <a
                    href={`/api/facturacion/pdf/${f.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ver / descargar PDF"
                    style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D9E75', textDecoration: 'none' }}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </a>

                  {/* Anular (solo facturas reales, no NC, no ya anuladas) */}
                  {!esNC && !anulada && (
                    <button
                      onClick={() => setConfirmAnular(f)}
                      disabled={anulando === f.id}
                      title="Anular con nota de crédito"
                      style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 8, border: '1px solid #fecaca', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D85A30', cursor: anulando === f.id ? 'wait' : 'pointer' }}
                    >
                      {anulando === f.id
                        ? <span style={{ fontSize: 10 }}>…</span>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
                    </button>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Confirmación de anulación */}
        {confirmAnular && (
          <div onClick={() => setConfirmAnular(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0a1e3d', marginBottom: 8 }}>Anular comprobante</div>
              <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, marginBottom: 4 }}>
                Se va a emitir una <strong>Nota de Crédito</strong> por {fmt(confirmAnular.monto)} que anula la factura
                N°{String(confirmAnular.punto_venta).padStart(4, '0')}-{String(confirmAnular.nro_comprobante).padStart(8, '0')} de {confirmAnular.paciente_nombre}.
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: '1.25rem' }}>
                La factura original queda registrada (ARCA no permite borrarla); la nota de crédito la deja sin efecto.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmAnular(null)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancelar</button>
                <button onClick={() => anular(confirmAnular)} style={{ fontSize: 13, fontWeight: 600, padding: '7px 18px', borderRadius: 8, border: 'none', background: '#D85A30', color: '#fff', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Emitir Nota de Crédito</button>
              </div>
            </div>
          </div>
        )}

        {toast && <Toast msg={toast.msg} tipo={toast.tipo} isMobile={isMobile} />}
      </main>
    </div>
  )
}
