'use client'
import type { HistorialLog } from '../tipos'
import { DIENTES_SUPERIORES, DIENTES_INFERIORES, ESTADOS_INFO } from '../odontograma-datos'

// Pestaña extraída de la Ficha del paciente (page.tsx) sin cambios de
// comportamiento: el JSX es el mismo; lo que usaba de la página llega por props.

export interface TabOdontogramaProps {
  renderTooth: (num: number) => JSX.Element
  historial: HistorialLog[]
}

export function TabOdontograma({ renderTooth, historial }: TabOdontogramaProps) {
  return (
      <>
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Odontograma Interactivo</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Selecciona una pieza dental para registrar tratamientos o modificar su estado.</p>
          </div>

          {/* Leyenda */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, borderBottom: '1px solid var(--border-light)', paddingBottom: 10 }}>
            {Object.entries(ESTADOS_INFO).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>{value.icon}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{value.label}</span>
              </div>
            ))}
          </div>

          {/* Arcada Superior */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, textAlign: 'center' }}>Arcada Superior (Maxilar)</div>
            {/* Una sola hilera con scroll táctil, no una grilla que
                se parte en varias filas.
                Las 16 piezas con ancho mínimo de 48px necesitan unos
                890px: en un teléfono la arcada se rompía en tres
                filas y el 18 terminaba debajo del 24. Eso destruye
                la correspondencia anatómica con la boca del paciente,
                que es el estándar con el que se lee un odontograma. */}
            <div style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              background: 'var(--bg-input)',
              padding: 10,
              borderRadius: 14,
              border: '1px solid var(--border-light)'
            }}>
              {DIENTES_SUPERIORES.map(renderTooth)}
            </div>
          </div>

          {/* Arcada Inferior */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, textAlign: 'center' }}>Arcada Inferior (Mandíbula)</div>
            {/* Una sola hilera con scroll táctil, no una grilla que
                se parte en varias filas.
                Las 16 piezas con ancho mínimo de 48px necesitan unos
                890px: en un teléfono la arcada se rompía en tres
                filas y el 18 terminaba debajo del 24. Eso destruye
                la correspondencia anatómica con la boca del paciente,
                que es el estándar con el que se lee un odontograma. */}
            <div style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              background: 'var(--bg-input)',
              padding: 10,
              borderRadius: 14,
              border: '1px solid var(--border-light)'
            }}>
              {DIENTES_INFERIORES.map(renderTooth)}
            </div>
          </div>
        </div>

        {/* Historial Completo Cronológico */}
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Historial Clínico Completo</h3>
          {historial.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>
              No hay registros clínicos previos para este paciente.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Fecha</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Diente</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Estado</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Detalles / Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((log) => {
                    const dateStr = new Date(log.creado_en).toLocaleDateString('es-AR', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })
                    const info = ESTADOS_INFO[log.estado] || ESTADOS_INFO.Sano
                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border-lighter)' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted-darker)', whiteSpace: 'nowrap' }}>{dateStr}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-dark)' }}>Diente {log.diente}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: info.bg, color: info.color }}>
                            {log.estado}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-dark)' }}>{log.notas || '—'}</td>
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
