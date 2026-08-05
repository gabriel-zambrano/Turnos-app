'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FORMAS_PAGO, FORMAS_PAGO_FACTURABLES_DEFAULT, sumarMontos, subtotalItem, sugerirRequiereFactura } from '@/lib/pagos'
import { registrarPago, formasFacturablesDe } from '@/lib/registrar-pago'

/**
 * Editor de renglones de tratamiento y formas de pago de una cita.
 *
 * Se apoya en los triggers de la base: al guardar un renglón, Postgres
 * recalcula `citas.valor`; al guardar un pago, recalcula `citas.precio_cobrado`
 * y `citas.medio_pago`. Por eso este componente NO escribe en `citas`
 * directamente — si lo hiciera, pisaría el total calculado.
 */

interface ItemDB {
  id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento_pct: number
  subtotal: number
  orden: number
}

interface PagoDB {
  id: string
  forma_pago: string
  monto: number
  fecha: string
  requiere_factura: boolean | null
}

interface Props {
  tenantId: string
  citaId: string
  pacienteId: string
  /** Seña ya cobrada en la reserva; se descuenta del saldo. */
  sena?: number
  /**
   * Valor y tratamiento que la cita ya traía cargados a mano. Si todavía no
   * hay renglones, se ofrece convertirlos en el primero — así las citas
   * creadas desde la reserva online o el modal rápido no quedan sin detalle.
   */
  valorCita?: number | null
  tratamientoCita?: string | null
  /** Se dispara cuando cambian los totales, para que la agenda recargue. */
  onCambio?: () => void
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n)

const inputSt: React.CSSProperties = {
  fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
  fontFamily: 'DM Sans, sans-serif', color: '#0a1e3d', width: '100%', boxSizing: 'border-box', outline: 'none',
}
const labelSt: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3,
}
const cardSt: React.CSSProperties = {
  border: '1px solid #e8ecf1', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fbfcfd',
}
const btnAddSt: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7,
  border: '1px dashed #cbd5e1', background: '#fff', color: '#185FA5',
  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
}
const btnDelSt: React.CSSProperties = {
  border: 'none', background: 'transparent', color: '#D85A30',
  cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 4px',
}

export function DetalleCitaCobro({ tenantId, citaId, pacienteId, sena = 0, valorCita, tratamientoCita, onCambio }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<ItemDB[]>([])
  const [pagos, setPagos] = useState<PagoDB[]>([])
  const [catalogo, setCatalogo] = useState<{ id: string; nombre: string; precio_base: number | null }[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // En pantalla angosta la tabla de 6 columnas y la grilla de anchos fijos
  // no entran: se apilan. El corte es el ancho útil dentro del modal, no el
  // del dispositivo, por eso 640 y no 768.
  const [angosto, setAngosto] = useState(false)
  useEffect(() => {
    const check = () => setAngosto(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Formularios de alta
  const [nDesc, setNDesc] = useState('')
  const [nCant, setNCant] = useState(1)
  const [nPrecio, setNPrecio] = useState<number | ''>('')
  const [nDto, setNDto] = useState<number | ''>('')
  const [pForma, setPForma] = useState<string>(FORMAS_PAGO[0])
  const [pMonto, setPMonto] = useState<number | ''>('')
  const [pFactura, setPFactura] = useState(false)
  const [formasFacturables, setFormasFacturables] = useState<string[]>(FORMAS_PAGO_FACTURABLES_DEFAULT)

  const cargar = useCallback(async () => {
    setCargando(true)
    const [rItems, rPagos, rCat] = await Promise.all([
      supabase.from('tratamiento_items').select('*').eq('cita_id', citaId).order('orden', { ascending: true }),
      supabase.from('pagos').select('*').eq('cita_id', citaId).order('creado_en', { ascending: true }),
      supabase.from('tratamientos').select('id, nombre, precio_base').eq('tenant_id', tenantId).eq('activo', true).order('nombre'),
    ])
    setItems(rItems.data ?? [])
    setPagos(rPagos.data ?? [])
    setCatalogo(rCat.data ?? [])
    setCargando(false)
  }, [supabase, citaId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  // Criterio de la clínica, para pre-marcar el check de facturar.
  useEffect(() => {
    formasFacturablesDe(supabase, tenantId).then(f => {
      setFormasFacturables(f)
      setPFactura(sugerirRequiereFactura(pForma, f))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tenantId])

  const totalTratamientos = sumarMontos(items.map(i => Number(i.subtotal)))
  const totalPagado = sumarMontos([...pagos.map(p => Number(p.monto)), Number(sena) || 0])
  const saldo = sumarMontos([totalTratamientos, -totalPagado])

  // Preview del renglón que se está por agregar
  const previewSubtotal = nPrecio === '' ? 0 : subtotalItem({
    descripcion: nDesc, cantidad: nCant || 1,
    precio_unitario: Number(nPrecio), descuento_pct: Number(nDto) || 0,
  })

  async function agregarItem() {
    if (!nDesc.trim()) return setError('Poné el nombre del tratamiento')
    if (nPrecio === '' || Number(nPrecio) < 0) return setError('Poné un precio válido')
    setError(null)
    const { error: e } = await supabase.from('tratamiento_items').insert({
      tenant_id: tenantId, paciente_id: pacienteId, cita_id: citaId,
      descripcion: nDesc.trim(), cantidad: nCant || 1,
      precio_unitario: Number(nPrecio), descuento_pct: Number(nDto) || 0,
      orden: items.length,
    })
    if (e) return setError(e.message)
    setNDesc(''); setNCant(1); setNPrecio(''); setNDto('')
    await cargar(); onCambio?.()
  }

  async function borrarItem(id: string) {
    const { error: e } = await supabase.from('tratamiento_items').delete().eq('id', id)
    if (e) return setError(e.message)
    await cargar(); onCambio?.()
  }

  async function agregarPago() {
    if (pMonto === '' || Number(pMonto) <= 0) return setError('Poné un monto mayor a cero')
    setError(null)
    const { error: e } = await registrarPago(supabase, {
      tenantId, pacienteId, citaId,
      formaPago: pForma,
      monto: Number(pMonto),
      requiereFactura: pFactura,
      origen: 'detalle',
    })
    if (e) return setError(e)
    setPMonto('')
    await cargar(); onCambio?.()
  }

  async function borrarPago(id: string) {
    const { error: e } = await supabase.from('pagos').delete().eq('id', id)
    if (e) return setError(e.message)
    await cargar(); onCambio?.()
  }

  /**
   * Convierte el valor plano de una cita vieja en su primer renglón.
   * El trigger recalcula `citas.valor` con el mismo número, así que la
   * conversión no cambia ningún importe ni ningún reporte.
   */
  async function sembrarDesdeValorCita() {
    if (!Number(valorCita)) return
    const { error: e } = await supabase.from('tratamiento_items').insert({
      tenant_id: tenantId, paciente_id: pacienteId, cita_id: citaId,
      descripcion: tratamientoCita || 'Consulta', cantidad: 1,
      precio_unitario: Number(valorCita), orden: 0,
    })
    if (e) return setError(e.message)
    await cargar(); onCambio?.()
  }

  /** Precarga precio y descripción al elegir del catálogo de la clínica. */
  function elegirDelCatalogo(id: string) {
    const t = catalogo.find(c => c.id === id)
    if (!t) return
    setNDesc(t.nombre)
    if (t.precio_base != null) setNPrecio(Number(t.precio_base))
  }

  if (cargando) {
    return <div style={{ fontSize: 13, color: '#94a3b8', padding: '10px 0' }}>Cargando detalle…</div>
  }

  // En mobile los botones necesitan 44px de alto para ser tocables cómodos.
  const btnAdd: React.CSSProperties = angosto
    ? { ...btnAddSt, minHeight: 44, padding: '10px 16px', fontSize: 13, width: '100%' }
    : btnAddSt

  return (
    <div>
      {error && (
        <div style={{ fontSize: 12, color: '#B4260F', background: '#FDECE7', border: '1px solid #F6C7BA',
          borderRadius: 7, padding: '7px 10px', marginBottom: 10 }}>{error}</div>
      )}

      {/* ── Tratamientos ── */}
      <div style={cardSt}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 10 }}>
          Tratamientos de este turno
        </div>

        {items.length === 0 ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Todavía no cargaste ningún tratamiento.</div>
            {Number(valorCita) > 0 && (
              <button style={{ ...btnAddSt, marginTop: 8 }} onClick={sembrarDesdeValorCita}>
                Usar el valor ya cargado ({fmt(Number(valorCita))}) como primer renglón
              </button>
            )}
          </div>
        ) : angosto ? (
          /* Pantalla angosta: cada renglón es una fila de dos niveles.
             Una tabla de 6 columnas no entra en un teléfono. */
          <div style={{ marginBottom: 10 }}>
            {items.map(i => (
              <div key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '8px 0', borderTop: '1px solid #eef2f6' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#0a1e3d', fontWeight: 500 }}>{i.descripcion}</div>
                  <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                    {i.cantidad} × {fmt(Number(i.precio_unitario))}
                    {Number(i.descuento_pct) > 0 && ` · ${Number(i.descuento_pct)}% dto.`}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0a1e3d', whiteSpace: 'nowrap' }}>
                  {fmt(Number(i.subtotal))}
                </div>
                <button style={{ ...btnDelSt, fontSize: 20, minWidth: 32, minHeight: 32 }}
                  onClick={() => borrarItem(i.id)} aria-label="Quitar tratamiento">×</button>
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: '#64748b', fontSize: 11, textAlign: 'left' }}>
                <th style={{ padding: '4px 0', fontWeight: 600 }}>Tratamiento</th>
                <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'center', width: 40 }}>Cant.</th>
                <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right', width: 90 }}>Precio</th>
                <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right', width: 45 }}>Dto.</th>
                <th style={{ padding: '4px 0', fontWeight: 600, textAlign: 'right', width: 95 }}>Subtotal</th>
                <th style={{ width: 24 }} />
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} style={{ borderTop: '1px solid #eef2f6' }}>
                  <td style={{ padding: '6px 0', color: '#0a1e3d' }}>{i.descripcion}</td>
                  <td style={{ padding: '6px 0', textAlign: 'center', color: '#64748b' }}>{i.cantidad}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', color: '#64748b' }}>{fmt(Number(i.precio_unitario))}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', color: '#64748b' }}>
                    {Number(i.descuento_pct) > 0 ? `${Number(i.descuento_pct)}%` : '—'}
                  </td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600, color: '#0a1e3d' }}>{fmt(Number(i.subtotal))}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button style={btnDelSt} onClick={() => borrarItem(i.id)} title="Quitar" aria-label="Quitar tratamiento">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Alta de renglón. En angosto la descripción ocupa una fila entera y
            cantidad/precio/descuento bajan a una segunda: con anchos fijos
            al campo de texto le quedaban ~70px en un teléfono. */}
        <div style={angosto
          ? { display: 'grid', gridTemplateColumns: '1fr', gap: 8 }
          : { display: 'grid', gridTemplateColumns: '1fr 52px 100px 62px', gap: 6, alignItems: 'end' }}>
          <div>
            <label style={labelSt}>Tratamiento</label>
            {catalogo.length > 0 && (
              <select
                style={{ ...inputSt, marginBottom: 4 }}
                value=""
                onChange={e => elegirDelCatalogo(e.target.value)}
              >
                <option value="">— Elegir del catálogo —</option>
                {catalogo.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
            <input style={inputSt} value={nDesc} onChange={e => setNDesc(e.target.value)} placeholder="Ej: Caries pieza 26" />
          </div>
          {/* En angosto los tres numéricos comparten una fila propia */}
          <div style={angosto
            ? { display: 'grid', gridTemplateColumns: '64px 1fr 72px', gap: 8, alignItems: 'end' }
            : { display: 'contents' }}>
            <div>
              <label style={labelSt}>Cant.</label>
              <input type="number" min={1} inputMode="numeric" style={inputSt} value={nCant}
                onChange={e => setNCant(Number(e.target.value) || 1)} />
            </div>
            <div>
              <label style={labelSt}>Precio</label>
              {/* inputMode decimal abre el teclado numérico del teléfono */}
              <input type="number" min={0} inputMode="decimal" style={inputSt} value={nPrecio}
                onChange={e => setNPrecio(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
            </div>
            <div>
              <label style={labelSt}>Dto. %</label>
              <input type="number" min={0} max={100} inputMode="numeric" style={inputSt} value={nDto}
                onChange={e => setNDto(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: angosto ? 'column' : 'row', gap: 8,
          justifyContent: 'space-between', alignItems: angosto ? 'stretch' : 'center', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {previewSubtotal > 0 && <>Subtotal: <strong style={{ color: '#0a1e3d' }}>{fmt(previewSubtotal)}</strong></>}
          </span>
          <button style={btnAdd} onClick={agregarItem}>+ Agregar tratamiento</button>
        </div>
      </div>

      {/* ── Pagos ── */}
      <div style={cardSt}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 10 }}>
          Formas de pago
        </div>

        {pagos.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
            Sin pagos registrados en este turno.
          </div>
        ) : (
          <div style={{ marginBottom: 10 }}>
            {pagos.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                borderTop: '1px solid #eef2f6', fontSize: 12.5 }}>
                <span style={{ flex: 1, color: '#0a1e3d' }}>
                  {p.forma_pago}
                  {p.requiere_factura && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 6px',
                      borderRadius: 5, background: '#d1fae5', color: '#065f46' }}>SE FACTURA</span>
                  )}
                </span>
                <span style={{ fontWeight: 600, color: '#0a1e3d' }}>{fmt(Number(p.monto))}</span>
                <button style={btnDelSt} onClick={() => borrarPago(p.id)} title="Quitar" aria-label="Quitar pago">×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: angosto ? '1fr' : '1fr 110px', gap: 8, alignItems: 'end' }}>
          <div>
            <label style={labelSt}>Forma de pago</label>
            <select style={inputSt} value={pForma}
              onChange={e => { setPForma(e.target.value); setPFactura(sugerirRequiereFactura(e.target.value, formasFacturables)) }}>
              {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={labelSt}>Monto</label>
            <input type="number" min={0} inputMode="decimal" style={inputSt} value={pMonto}
              onChange={e => setPMonto(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
          </div>
        </div>
        {/* La decisión de facturar se toma acá y queda guardada con el cobro.
            El medio de pago solo pre-marca el check. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', marginTop: 10,
          padding: '9px 11px', borderRadius: 8,
          background: pFactura ? 'rgba(29,158,117,0.08)' : '#fff',
          border: `1px solid ${pFactura ? 'rgba(29,158,117,0.3)' : '#e2e8f0'}` }}>
          <input type="checkbox" checked={pFactura} onChange={e => setPFactura(e.target.checked)}
            style={{ width: 17, height: 17, accentColor: '#1D9E75', cursor: 'pointer' }} />
          <span style={{ fontSize: 12.5, color: '#0a1e3d', fontWeight: 500 }}>
            Facturar este cobro
            <span style={{ display: 'block', fontSize: 11, color: '#64748b', fontWeight: 400, marginTop: 1 }}>
              {sugerirRequiereFactura(pForma, formasFacturables)
                ? `${pForma} se factura según tu configuración`
                : `${pForma} no se factura, salvo que el paciente lo pida`}
            </span>
          </span>
        </label>

        <div style={{ display: 'flex', flexDirection: angosto ? 'column' : 'row', gap: 8,
          justifyContent: 'space-between', alignItems: angosto ? 'stretch' : 'center', marginTop: 8 }}>
          {saldo > 0 ? (
            // Atajo: completa el monto con lo que falta cobrar, para no tipearlo
            <button
              style={{ ...btnAdd, borderStyle: 'solid', borderColor: '#e2e8f0', color: '#64748b' }}
              onClick={() => setPMonto(saldo)}
            >
              Saldo restante: {fmt(saldo)}
            </button>
          ) : <span />}
          <button style={btnAdd} onClick={agregarPago}>+ Registrar pago</button>
        </div>
      </div>

      {/* ── Resumen ── */}
      <div style={{ ...cardSt, background: '#F3F7FB', borderColor: '#dbe6f0', marginBottom: 0 }}>
        {[
          ['Total tratamientos', totalTratamientos, false],
          ...(Number(sena) > 0 ? [['Seña de la reserva', Number(sena), false] as const] : []),
          ['Pagado', totalPagado, false],
        ].map(([label, valor]) => (
          <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#64748b', padding: '2px 0' }}>
            <span>{label}</span><span>{fmt(Number(valor))}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700,
          paddingTop: 6, marginTop: 6, borderTop: '1px solid #dbe6f0',
          color: saldo > 0 ? '#B4260F' : '#138A6B' }}>
          <span>{saldo > 0 ? 'Saldo pendiente' : saldo < 0 ? 'A favor del paciente' : 'Saldado'}</span>
          <span>{fmt(Math.abs(saldo))}</span>
        </div>
      </div>
    </div>
  )
}
