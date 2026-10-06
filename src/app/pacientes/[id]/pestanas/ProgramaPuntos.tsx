'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { Paciente } from '../tipos'
import { btnDarkCss, groupCss, labelCss, selectCss, inputCss } from '@/components/UI'
import { canjearPremioAction, ajustarPuntosManualAction } from '@/app/actions/fidelizacion'
import { validarAjustePuntos } from '@/lib/ajuste-puntos'

// Sección extraída de la Ficha del paciente (page.tsx) sin cambios de
// comportamiento: el JSX es el mismo; lo que usaba de la página llega por props.

export interface ProgramaPuntosProps {
  configFidelizacion: any | null
  premios: any[]
  isMobile: boolean
  paciente: Paciente
  procesandoCanje: string | null
  setProcesandoCanje: Dispatch<SetStateAction<string | null>>
  showMsg: (m: string, tipo?: string) => void
  loadData: () => Promise<void>
  ajustePuntosTipo: 'ajuste_manual' | 'ajuste_reverso'
  setAjustePuntosTipo: Dispatch<SetStateAction<'ajuste_manual' | 'ajuste_reverso'>>
  ajustePuntosMonto: number | ''
  setAjustePuntosMonto: Dispatch<SetStateAction<number | ''>>
  ajustePuntosNota: string
  setAjustePuntosNota: Dispatch<SetStateAction<string>>
  procesandoAjuste: boolean
  setProcesandoAjuste: Dispatch<SetStateAction<boolean>>
  historialPuntos: any[]
}

export function ProgramaPuntos({ configFidelizacion, premios, isMobile, paciente, procesandoCanje, setProcesandoCanje, showMsg, loadData, ajustePuntosTipo, setAjustePuntosTipo, ajustePuntosMonto, setAjustePuntosMonto, ajustePuntosNota, setAjustePuntosNota, procesandoAjuste, setProcesandoAjuste, historialPuntos }: ProgramaPuntosProps) {
  return (
    <>
      {/* SECCION 2: CATALOGO DE PREMIOS */}
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Canje de Premios</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Canjeá los puntos acumulados por premios del catálogo. 1 punto = ${configFidelizacion?.ars_valor_canje ?? 50} ARS.
          </p>
        </div>

        {premios.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>
            No hay premios registrados en el catálogo de esta clínica.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginTop: 6 }}>
            {premios.map(p => {
              const ptsActuales = paciente.puntos_saldo_cache ?? 0
              const tienePuntos = ptsActuales >= p.costo_puntos
              const tieneStock = p.stock === null || p.stock > 0
              const canCanjear = tienePuntos && tieneStock
              const pct = Math.min(100, (ptsActuales / p.costo_puntos) * 100)

              return (
                <div key={p.id} style={{ 
                  background: 'var(--bg-input, #f8fafc)', 
                  border: '1px solid var(--border-light, #e2e8f0)', 
                  borderRadius: 12, 
                  padding: 14, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  gap: 10
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark)' }}>{p.nombre}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning-text)' }}>{p.costo_puntos} pts</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Valor ref: ${p.valor_referencia_ars?.toLocaleString('es-AR') ?? '—'} · Stock: {p.stock === null ? 'Ilimitado' : p.stock}
                    </div>
                  </div>

                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                      <span>Progreso</span>
                      <span>{ptsActuales} / {p.costo_puntos} pts</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border-lighter, #e2e8ed)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: tienePuntos ? 'var(--success)' : 'var(--accent)', borderRadius: 3 }} />
                    </div>
                  </div>

                  <button
                    style={{ 
                      ...btnDarkCss, 
                      background: canCanjear ? 'var(--success)' : 'var(--border-light, #cbd5e1)', 
                      color: canCanjear ? 'var(--success-contrast)' : 'var(--text-muted-darker, #64748b)', 
                      cursor: canCanjear ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                      minHeight: 36,
                      padding: '0.4rem 0.8rem',
                      marginTop: 6
                    }}
                    disabled={!canCanjear || procesandoCanje === p.id}
                    onClick={async () => {
                      if (!confirm(`¿Confirmás el canje de "${p.nombre}" por ${p.costo_puntos} puntos?`)) return
                      setProcesandoCanje(p.id)
                      const res = await canjearPremioAction(paciente.id, p.id)
                      setProcesandoCanje(null)
                      if (res.success) {
                        showMsg('Canje realizado con éxito ✓')
                        loadData()
                      } else {
                        showMsg('Error en canje: ' + res.error, 'error')
                      }
                    }}
                  >
                    {procesandoCanje === p.id ? 'Canjeando...' : 'Canjear Premio'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* SECCION 3: AJUSTE MANUAL DE PREMIOS */}
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Ajuste Manual / Auditoría</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div style={groupCss}>
            <label style={labelCss}>Tipo de Ajuste</label>
            <select 
              style={selectCss} 
              value={ajustePuntosTipo} 
              onChange={e => setAjustePuntosTipo(e.target.value as any)}
            >
              <option value="ajuste_manual">Agregar Puntos (+)</option>
              <option value="ajuste_reverso">Restar Puntos (-)</option>
            </select>
          </div>

          <div style={groupCss}>
            <label style={labelCss}>Cantidad de Puntos</label>
            <input
              type="number"
              style={inputCss}
              value={ajustePuntosMonto}
              onChange={e => setAjustePuntosMonto(e.target.value === '' ? '' : Math.abs(Number(e.target.value)))}
              placeholder="Ej: 100"
            />
          </div>
        </div>

        <div style={groupCss}>
          <label style={labelCss}>Motivo / Nota de Auditoría</label>
          <input
            type="text"
            style={inputCss}
            value={ajustePuntosNota}
            onChange={e => setAjustePuntosNota(e.target.value)}
            placeholder="Ej: Ajuste por error de carga anterior..."
          />
        </div>

        <button
          style={{ ...btnDarkCss, width: '100%', marginTop: 4 }}
          disabled={procesandoAjuste}
          onClick={async () => {
            // Las mismas reglas que aplica fn_ajustar_puntos_manual.
            // La base sigue siendo la autoridad final; esto solo
            // evita que el usuario reciba un error crudo de
            // PostgreSQL por algo que se puede avisar antes.
            const validacion = validarAjustePuntos(ajustePuntosMonto, ajustePuntosNota)
            if (!validacion.ok) {
              showMsg(validacion.error, 'error')
              return
            }
            setProcesandoAjuste(true)
            const signo = ajustePuntosTipo === 'ajuste_manual' ? 1 : -1
            const res = await ajustarPuntosManualAction(
              paciente.id,
              Number(ajustePuntosMonto) * signo,
              ajustePuntosTipo,
              validacion.nota
            )
            setProcesandoAjuste(false)
            if (res.success) {
              showMsg('Ajuste aplicado correctamente ✓')
              setAjustePuntosMonto('')
              setAjustePuntosNota('')
              loadData()
            } else {
              showMsg('Error en ajuste: ' + res.error, 'error')
            }
          }}
        >
          {procesandoAjuste ? 'Aplicando Ajuste...' : 'Aplicar Ajuste Manual'}
        </button>
      </div>

      {/* SECCION 4: HISTORIAL LEDGER */}
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Historial de Movimientos de Puntos</h3>
        
        {historialPuntos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>
            No hay movimientos registrados en el historial de puntos de este paciente.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Fecha</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Operación</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--accent)', fontWeight: 600 }}>Puntos</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--accent)', fontWeight: 600 }}>Saldo</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Detalles / Motivo</th>
                </tr>
              </thead>
              <tbody>
                {historialPuntos.map((log) => {
                  const dateStr = new Date(log.creado_en).toLocaleDateString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })
                  const operacionLabels: Record<string, string> = {
                    gasto_tratamiento: 'Tratamiento',
                    bonus_asistencia: 'Bonus Racha',
                    canje_premio: 'Canje Premio',
                    ajuste_manual: 'Ajuste Manual',
                    ajuste_reverso: 'Ajuste Reverso',
                    migracion_inicial: 'Asiento Inicial'
                  }
                  const operacionColors: Record<string, string> = {
                    gasto_tratamiento: 'var(--accent)',
                    bonus_asistencia: 'var(--success-text)',
                    canje_premio: 'var(--danger-text)',
                    ajuste_manual: 'var(--warning-text)',
                    ajuste_reverso: 'var(--danger-text)',
                    migracion_inicial: 'var(--text-muted)'
                  }
                  const sign = log.puntos_afectados > 0 ? '+' : ''
                  const ptsColor = log.puntos_afectados > 0 ? 'var(--success-text)' : 'var(--danger-text)'

                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-lighter)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted-darker)', whiteSpace: 'nowrap' }}>{dateStr}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ 
                          fontSize: 12.5, 
                          fontWeight: 700, 
                          padding: '2px 8px', 
                          borderRadius: 6, 
                          background: `${operacionColors[log.tipo_movimiento]}12`, 
                          color: operacionColors[log.tipo_movimiento] 
                        }}>
                          {operacionLabels[log.tipo_movimiento] || log.tipo_movimiento}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: ptsColor }}>
                        {sign}{log.puntos_afectados}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-dark)' }}>
                        {log.saldo_resultante} pts
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-dark)' }}>
                        {log.nota || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
