import React from 'react'
import { Icon, type IconName } from './Icon'

/**
 * Estado vacío. Nunca "Sin datos": responde qué es esta pantalla, por qué
 * está vacía y cuál es el siguiente paso.
 *
 *   <EmptyState
 *     icon="calendar"
 *     title="No hay turnos para hoy"
 *     description="La agenda de hoy está libre."
 *     action={<Button variant="primary" icon="plus" onClick={nuevoTurno}>Nuevo turno</Button>}
 *   />
 *
 * `action` solo con acciones que existen en esa pantalla.
 */
export interface EmptyStateProps {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: IconName
  action?: React.ReactNode
  /** Versión compacta para dentro de tarjetas o tablas. */
  compact?: boolean
}

export function EmptyState({ title, description, icon = 'inbox', action, compact = false }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      gap: 'var(--space-2)', padding: compact ? 'var(--space-6) var(--space-4)' : 'var(--space-12) var(--space-6)',
    }}>
      <div aria-hidden="true" style={{
        width: compact ? 36 : 44, height: compact ? 36 : 44, borderRadius: 'var(--radius-pill)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent-soft)', color: 'var(--accent)', marginBottom: 'var(--space-1)',
      }}>
        <Icon name={icon} size={compact ? 18 : 20} />
      </div>
      <p style={{ margin: 0, fontSize: compact ? 'var(--fs-md)' : 'var(--fs-lg)', fontWeight: 600, color: 'var(--text-dark)' }}>
        {title}
      </p>
      {description && (
        <p style={{ margin: 0, maxWidth: 420, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 'var(--space-3)' }}>{action}</div>}
    </div>
  )
}
