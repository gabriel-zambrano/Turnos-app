'use client'
import React from 'react'
import { Icon } from './Icon'
import { Button } from './Button'

/**
 * Estado de error con salida. Responde las cuatro preguntas del modelo de
 * error de la auditoría:
 *   1. qué falló                → title
 *   2. qué quedó guardado        → saved   (ej. "El cobro de $ 85.000 está guardado.")
 *   3. qué NO quedó guardado     → notSaved
 *   4. qué hacer                 → description y/o onRetry
 *
 * Nunca se le pasa `error.message` crudo como título: el texto técnico va,
 * si hace falta, en `detail`, que queda en letra chica.
 *
 * `inline` para dentro de un formulario o modal; sin `inline`, ocupa la
 * sección que no pudo cargar (el resto de la pantalla sigue visible).
 */
export interface ErrorStateProps {
  title: React.ReactNode
  description?: React.ReactNode
  saved?: React.ReactNode
  notSaved?: React.ReactNode
  detail?: React.ReactNode
  onRetry?: () => void | Promise<unknown>
  retryLabel?: string
  inline?: boolean
}

export function ErrorState({
  title, description, saved, notSaved, detail, onRetry, retryLabel = 'Reintentar', inline = false,
}: ErrorStateProps) {
  return (
    <div role="alert" style={{
      display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start',
      padding: inline ? 'var(--space-3)' : 'var(--space-6)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)',
    }}>
      <Icon name="error" size={18} style={{ marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 'var(--fs-md)', fontWeight: 600 }}>{title}</p>
        {saved && <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--fs-sm)', lineHeight: 1.45, color: 'var(--text-dark)' }}>{saved}</p>}
        {notSaved && <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--fs-sm)', lineHeight: 1.45 }}>{notSaved}</p>}
        {description && <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--fs-sm)', lineHeight: 1.45, color: 'var(--text-dark)' }}>{description}</p>}
        {detail && <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', wordBreak: 'break-word' }}>Detalle técnico: {detail}</p>}
        {onRetry && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>{retryLabel}</Button>
          </div>
        )}
      </div>
    </div>
  )
}
