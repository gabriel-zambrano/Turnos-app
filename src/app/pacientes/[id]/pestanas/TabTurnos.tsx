'use client'
import { Icon } from '@/components/ui/index'
import type { Dispatch, SetStateAction } from 'react'
import type { Paciente } from '../tipos'

// Pestaña extraída de la Ficha del paciente (page.tsx) sin cambios de
// comportamiento: el JSX es el mismo; lo que usaba de la página llega por props.

export interface TabTurnosProps {
  paciente: Paciente
  citas: any[]
  setModalTurno: Dispatch<SetStateAction<boolean>>
  cambiarEstadoCita: (citaId: string, nuevoEstado: string) => Promise<void>
}

export function TabTurnos({ paciente, citas, setModalTurno, cambiarEstadoCita }: TabTurnosProps) {
  return (
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Historial de Turnos</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Gestiona las citas pasadas y futuras de {paciente.nombre}.</p>
          </div>
          <button 
            onClick={() => setModalTurno(true)}
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="plus" size={14} />Agendar turno
          </button>
        </div>

        {citas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: 13 }}>
            No hay turnos registrados para este paciente.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Fecha y Hora</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Tratamiento</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Duración</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Estado</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--accent)', fontWeight: 600 }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {citas.map((cita) => {
                  const dateObj = new Date(cita.fecha_hora)
                  const dateStr = dateObj.toLocaleDateString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                  })
                  const timeStr = dateObj.toLocaleTimeString('es-AR', {
                    hour: '2-digit', minute: '2-digit'
                  })
                  return (
                    <tr key={cita.id} style={{ borderBottom: '1px solid var(--border-lighter)' }}>
                      <td style={{ padding: '12px 12px', color: 'var(--text-dark)', fontWeight: 600 }}>{dateStr} a las {timeStr} hs</td>
                      <td style={{ padding: '12px 12px', color: 'var(--text-dark)' }}>{cita.tipo_tratamiento}</td>
                      <td style={{ padding: '12px 12px', color: 'var(--text-muted-darker)' }}>{cita.duracion_minutos} min</td>
                      <td style={{ padding: '12px 12px' }}>
                        <span style={{ 
                          fontSize: 12, 
                          fontWeight: 700, 
                          padding: '3px 8px', 
                          borderRadius: 6, 
                          background: cita.estado === 'confirmado' ? 'var(--est-confirmado-bg)' : cita.estado === 'pendiente' ? 'var(--est-pendiente-bg)' : cita.estado === 'asistio' || cita.estado === 'completado' ? 'var(--est-asistio-bg)' : 'var(--est-cancelado-bg)',
                          color: cita.estado === 'confirmado' ? 'var(--est-confirmado-color)' : cita.estado === 'pendiente' ? 'var(--est-pendiente-color)' : cita.estado === 'asistio' || cita.estado === 'completado' ? 'var(--est-asistio-color)' : 'var(--est-cancelado-color)'
                        }}>
                          {cita.estado.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <select 
                          value={cita.estado} 
                          onChange={e => cambiarEstadoCita(cita.id, e.target.value)}
                          style={{ 
                            padding: '4px 8px', 
                            borderRadius: 8, 
                            border: '1px solid var(--border-light)', 
                            background: 'var(--bg-input)', 
                            color: 'var(--text-dark)', 
                            fontSize: 12, 
                            fontWeight: 600,
                            outline: 'none',
                            cursor: 'pointer' 
                          }}
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="confirmado">Confirmado</option>
                          <option value="asistio">Asistió</option>
                          <option value="completado">Completado</option>
                          <option value="cancelado">Cancelado</option>
                          <option value="ausente">Ausente</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
  )
}
