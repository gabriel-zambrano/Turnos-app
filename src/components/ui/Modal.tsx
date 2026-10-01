'use client'
import React, { useEffect, useId, useRef } from 'react'
import { overlayCss, modalCss, useBloqueoScroll, useIsMobile } from '../UI'
import { SELECTOR_ENFOCABLE, indiceFocoAtrapado } from '@/lib/foco'
import { Icon } from './Icon'

/**
 * Modal accesible.
 *
 * Usa los mismos estilos que los modales actuales (overlayCss, modalCss), así
 * que adoptarlo no cambia el aspecto. Lo que agrega:
 *   - role="dialog", aria-modal y título asociado (aria-labelledby);
 *   - foco atrapado: Tab y Shift+Tab no salen del modal;
 *   - Escape cierra (salvo `dismissible={false}`, para cuando hay una
 *     operación en curso que no conviene interrumpir);
 *   - al cerrar, el foco vuelve al elemento que abrió el modal.
 */

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  /** Ancho máximo en escritorio. */
  maxWidth?: number
  /** false mientras hay una operación en curso: ni Escape ni el fondo cierran. */
  dismissible?: boolean
  /** Elemento a enfocar al abrir. Por defecto, el primer enfocable. */
  initialFocusRef?: React.RefObject<HTMLElement>
  /** role="alertdialog" para confirmaciones que interrumpen. */
  role?: 'dialog' | 'alertdialog'
}

export function Modal({
  open, onClose, title, description, children, footer,
  maxWidth = 540, dismissible = true, initialFocusRef, role = 'dialog',
}: ModalProps) {
  const isMobile = useIsMobile()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previoRef = useRef<HTMLElement | null>(null)
  const auto = useId()
  const tituloId = `modal-titulo-${auto}`
  const descId = description ? `modal-desc-${auto}` : undefined

  useBloqueoScroll(open)

  // Foco al abrir y retorno al cerrar.
  useEffect(() => {
    if (!open) return
    previoRef.current = document.activeElement as HTMLElement | null
    const t = window.setTimeout(() => {
      const candidatos = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE) ?? [])
      const destino = initialFocusRef?.current
        ?? candidatos.find(el => !el.hasAttribute('data-modal-cerrar'))
        ?? dialogRef.current
      destino?.focus()
    }, 0)
    return () => {
      window.clearTimeout(t)
      const previo = previoRef.current
      if (previo && document.contains(previo)) previo.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      if (dismissible) { e.stopPropagation(); onClose() }
      return
    }
    if (e.key !== 'Tab' || !dialogRef.current) return
    const enfocables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE))
      .filter(el => el.offsetParent !== null || el === document.activeElement)
    const actual = enfocables.indexOf(document.activeElement as HTMLElement)
    const destino = indiceFocoAtrapado(enfocables.length, actual, e.shiftKey)
    if (destino !== null) {
      e.preventDefault()
      enfocables[destino]?.focus()
    }
  }

  return (
    <div
      style={overlayCss(isMobile)}
      onMouseDown={e => { if (dismissible && e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ ...modalCss(isMobile), maxWidth: isMobile ? '100vw' : maxWidth, outline: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div>
            <h2 id={tituloId} style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--text-dark)', letterSpacing: '-0.01em', lineHeight: 1.25 }}>
              {title}
            </h2>
            {description && (
              <p id={descId} style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button type="button" className="dd-btn dd-btn--ghost dd-btn--sm" onClick={onClose} aria-label="Cerrar" data-modal-cerrar="" style={{ padding: '0 var(--space-2)' }}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        {children}
        {footer && (
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-6)', flexWrap: 'wrap' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
