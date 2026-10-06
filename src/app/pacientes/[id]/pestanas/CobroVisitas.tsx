'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { ResultadoCobroFicha } from '../tipos'
import { btnDarkCss, groupCss, labelCss, selectCss, inputCss } from '@/components/UI'
import { FORMAS_PAGO, sugerirRequiereFactura } from '@/lib/pagos'
import { Icon } from '@/components/ui/index'

// Sección extraída de la Ficha del paciente (page.tsx) sin cambios de
// comportamiento: el JSX es el mismo; lo que usaba de la página llega por props.

export interface CobroVisitasProps {
  resultadoCobro: ResultadoCobroFicha
  setResultadoCobro: Dispatch<SetStateAction<ResultadoCobroFicha>>
  citasParaAprobar: any[]
  citaAprobarId: string
  setCitaAprobarId: Dispatch<SetStateAction<string>>
  montoCobrado: number | ''
  setMontoCobrado: Dispatch<SetStateAction<number | ''>>
  isMontoEditable: boolean
  aprobForma: string
  setAprobForma: Dispatch<SetStateAction<string>>
  aprobFactura: boolean
  setAprobFactura: Dispatch<SetStateAction<boolean>>
  formasFacturables: string[]
  procesandoPuntos: boolean
  handleAprobarAsistencia: () => Promise<void>
}

export function CobroVisitas({ resultadoCobro, setResultadoCobro, citasParaAprobar, citaAprobarId, setCitaAprobarId, montoCobrado, setMontoCobrado, isMontoEditable, aprobForma, setAprobForma, aprobFactura, setAprobFactura, formasFacturables, procesandoPuntos, handleAprobarAsistencia }: CobroVisitasProps) {
  return (
    <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Aprobación Manual de Visita</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
        Confirmá la asistencia del paciente y registrá el cobro de la cita.
      </p>

      {resultadoCobro && (
        <div role="status" aria-live="polite" style={{
          display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
          margin: 'var(--space-2) 0 var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--fs-sm)', lineHeight: 1.45, fontWeight: 500,
          background: resultadoCobro.tono === 'exito' ? 'var(--success-soft)' : 'var(--danger-soft)',
          border: `1px solid ${resultadoCobro.tono === 'exito' ? 'var(--success-border)' : 'var(--danger-border)'}`,
          color: resultadoCobro.tono === 'exito' ? 'var(--success-text)' : 'var(--danger-text)',
        }}>
          <Icon name={resultadoCobro.tono === 'exito' ? 'check' : 'alert'} size={16} style={{ marginTop: 1 }} />
          <span>{resultadoCobro.texto}</span>
        </div>
      )}

      {citasParaAprobar.length === 0 ? (
        <div style={{ padding: '1.5rem', background: 'var(--bg-input, #f0f4f8)', borderRadius: 12, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
          No hay turnos pendientes de cerrar o cobrar.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
          <div style={groupCss}>
            <label style={labelCss}>Seleccionar Turno</label>
            <select 
              style={selectCss} 
              value={citaAprobarId} 
              onChange={e => { setCitaAprobarId(e.target.value); setResultadoCobro(null) }}
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
              onChange={e => { setMontoCobrado(e.target.value === '' ? '' : Number(e.target.value)); setResultadoCobro(null) }}
              disabled={!isMontoEditable}
              placeholder="Monto cobrado en la cita"
            />
            {!isMontoEditable && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
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
                background: aprobFactura ? 'var(--success-soft)' : 'var(--bg-input, #f8fafc)',
                border: `1px solid ${aprobFactura ? 'var(--success-border)' : 'var(--border-color, #e2e8ed)'}` }}>
                <input type="checkbox" checked={aprobFactura} onChange={e => setAprobFactura(e.target.checked)}
                  style={{ width: 17, height: 17, accentColor: 'var(--success-text)', cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: 'var(--text-dark)', fontWeight: 500 }}>
                  Facturar este cobro
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginTop: 1 }}>
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
            {procesandoPuntos ? 'Procesando...' : 'Confirmar Asistencia y Registrar Cobro'}
          </button>
        </div>
      )}
    </div>
  )
}
