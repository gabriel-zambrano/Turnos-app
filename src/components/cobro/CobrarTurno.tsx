'use client'
import React, { useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Modal, FormField, Button } from '@/components/ui'
import { inputCss, selectCss } from '@/components/UI'
import { FORMAS_PAGO, sugerirRequiereFactura } from '@/lib/pagos'
import { cobrarTurno, mensajeCobro, type ResultadoCobro, type MensajeCobro } from '@/lib/cobro-turno'
import { textoPagoPrevio } from '@/lib/cobro-previo'
import { aprobarAsistenciaAction } from '@/app/actions/fidelizacion'
import { FIDELIZACION_HABILITADA } from '@/lib/fidelizacion-flag'
import type { DatosPago } from '@/lib/registrar-pago'

/**
 * Formulario único para cobrar un turno.
 *
 * Toda la secuencia (caja, cobro previo, pago, cierre del turno) vive en
 * `lib/cobro-turno`; este componente solo junta los datos y muestra el
 * resultado. El botón se bloquea solo desde el primer click (Button), y el
 * modal no se puede cerrar mientras el cobro está en curso.
 *
 * No tiene campo de fecha: el pago se registra con la fecha del día, y un
 * campo que no se guarda es una interfaz que miente.
 */

export interface TurnoACobrar {
  id: string
  pacienteId: string
  /** YYYY-MM-DD: se verifica la caja de ese día. */
  fecha: string
  nombre: string
  tratamiento: string
  valor?: number | null
}

export interface CobrarTurnoProps {
  open: boolean
  turno: TurnoACobrar | null
  supabase: SupabaseClient
  tenantId: string
  formasFacturables: string[]
  origen?: DatosPago['origen']
  onClose: () => void
  /** Se llama con cada resultado final (no con la confirmación de pago extra). */
  onResultado: (r: ResultadoCobro, m: MensajeCobro) => void
}

export function CobrarTurno({
  open, turno, supabase, tenantId, formasFacturables, origen = 'cobro_rapido', onClose, onResultado,
}: CobrarTurnoProps) {
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState<number | ''>('')
  const [forma, setForma] = useState<string>(FORMAS_PAGO[0])
  const [factura, setFactura] = useState(false)
  const [previo, setPrevio] = useState<number | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [errores, setErrores] = useState<{ concepto?: string; monto?: string; general?: string }>({})

  // Valores iniciales cada vez que se abre para un turno. Depende solo de
  // `open` y del id: el padre puede armar el objeto `turno` en cada render, y
  // si el efecto dependiera del objeto, el formulario se reiniciaría mientras
  // se escribe.
  const turnoRef = useRef(turno)
  turnoRef.current = turno
  const formasRef = useRef(formasFacturables)
  formasRef.current = formasFacturables
  const turnoId = turno?.id
  useEffect(() => {
    const t = turnoRef.current
    if (!open || !t) return
    setConcepto(`Pago ${t.tratamiento} — ${t.nombre}`)
    setMonto(t.valor ?? '')
    setForma(FORMAS_PAGO[0])
    setFactura(sugerirRequiereFactura(FORMAS_PAGO[0], formasRef.current))
    setPrevio(null)
    setErrores({})
  }, [open, turnoId])

  async function confirmar() {
    if (!turno) return
    const e: typeof errores = {}
    if (!concepto.trim()) e.concepto = 'Escribí un concepto.'
    if (monto === '' || Number(monto) <= 0) e.monto = 'Poné un monto mayor a cero.'
    setErrores(e)
    if (e.concepto || e.monto) return

    setEnCurso(true)
    try {
      const r = await cobrarTurno({
        supabase, tenantId,
        citaId: turno.id, pacienteId: turno.pacienteId, fechaCaja: turno.fecha,
        pago: { monto: Number(monto), formaPago: forma, requiereFactura: factura, origen, nota: concepto.trim() },
        confirmadoPagoExtra: previo !== null,
        cerrarTurno: aprobarAsistenciaAction,
      })
      if (r.tipo === 'requiere_confirmacion') {
        setPrevio(r.cobradoPrevio)
        return
      }
      const m = mensajeCobro(r, FIDELIZACION_HABILITADA)!
      if (m.cerrarFormulario) {
        onResultado(r, m)
        onClose()
      } else {
        setErrores({ general: m.texto })
      }
    } finally {
      setEnCurso(false)
    }
  }

  const facturaSugerida = sugerirRequiereFactura(forma, formasFacturables)

  return (
    <Modal
      open={open && !!turno}
      onClose={onClose}
      title="Registrar cobro"
      description={turno ? `${turno.nombre} · ${turno.tratamiento}` : undefined}
      maxWidth={420}
      dismissible={!enCurso}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enCurso}>Cancelar</Button>
          <Button variant="primary" onClick={confirmar} loading={enCurso} loadingText="Registrando…">
            {previo !== null ? 'Registrar otro pago' : 'Confirmar cobro'}
          </Button>
        </>
      }
    >
      <FormField label="Concepto" required error={errores.concepto}>
        <input type="text" style={inputCss} value={concepto} onChange={ev => setConcepto(ev.target.value)} />
      </FormField>

      <FormField label="Monto ($)" required error={errores.monto}>
        <input type="number" inputMode="decimal" style={inputCss} value={monto} placeholder="0"
          onChange={ev => { setMonto(ev.target.value === '' ? '' : Number(ev.target.value)); setPrevio(null) }} />
      </FormField>

      {/* Sin forma de pago, el cobro esquivaba el criterio de facturación. */}
      <FormField label="Forma de pago">
        <select style={selectCss} value={forma}
          onChange={ev => { setForma(ev.target.value); setFactura(sugerirRequiereFactura(ev.target.value, formasFacturables)) }}>
          {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </FormField>

      <label style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer',
        padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)',
        background: factura ? 'var(--success-soft)' : 'var(--bg-input)',
        border: `1px solid ${factura ? 'var(--success-border)' : 'var(--border-color)'}`,
      }}>
        <input type="checkbox" checked={factura} onChange={ev => setFactura(ev.target.checked)}
          style={{ width: 18, height: 18, accentColor: 'var(--success)', cursor: 'pointer' }} />
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-dark)', fontWeight: 500 }}>
          Facturar este cobro
          <span style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
            {facturaSugerida
              ? `${forma} se factura según tu configuración`
              : `${forma} no se factura, salvo que el paciente lo pida`}
          </span>
        </span>
      </label>

      {previo !== null && (
        <div role="alert" style={{
          padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-sm)', lineHeight: 1.45,
          background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', color: 'var(--warning-text)',
        }}>
          {textoPagoPrevio(previo)}
        </div>
      )}

      {errores.general && (
        <div role="alert" style={{
          marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-sm)', lineHeight: 1.45,
          background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)',
        }}>
          {errores.general}
        </div>
      )}
    </Modal>
  )
}
