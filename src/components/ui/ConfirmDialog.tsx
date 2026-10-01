'use client'
import React, { useRef, useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

/**
 * Confirmación de una acción IRREVERSIBLE: emitir un comprobante ante ARCA,
 * eliminar un paciente, eliminar a alguien del equipo.
 *
 * Para lo reversible (cancelar un turno, marcar ausente, borrar un bloqueo)
 * no se usa: una pregunta veinte veces por día se responde sin leer y deja
 * de proteger. Ahí corresponde "Deshacer".
 *
 * Reglas que impone el componente:
 *   - el mensaje tiene que decir el dato concreto ("por $ 85.000"), no
 *     "¿Estás seguro?";
 *   - en las destructivas el foco arranca en Cancelar, para que un Enter
 *     apurado no confirme;
 *   - mientras `onConfirm` corre, el diálogo no se cierra ni se puede
 *     confirmar dos veces;
 *   - si `onConfirm` falla, el error se muestra adentro y el diálogo sigue
 *     abierto.
 */

export interface ConfirmDialogProps {
  open: boolean
  title: React.ReactNode
  /** Qué va a pasar, con el dato concreto. */
  children: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void | Promise<unknown>
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, children, confirmLabel, cancelLabel = 'Cancelar',
  tone = 'danger', onConfirm, onCancel,
}: ConfirmDialogProps) {
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmar() {
    setError(null)
    setEnCurso(true)
    try {
      await onConfirm()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setEnCurso(false)
    }
  }

  function cancelar() {
    if (enCurso) return
    setError(null)
    onCancel()
  }

  return (
    <Modal
      open={open}
      onClose={cancelar}
      title={title}
      role="alertdialog"
      maxWidth={440}
      dismissible={!enCurso}
      initialFocusRef={tone === 'danger' ? (cancelarRef as React.RefObject<HTMLElement>) : undefined}
      footer={
        <>
          <Button ref={cancelarRef} variant="secondary" onClick={cancelar} disabled={enCurso}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirmar} loading={enCurso}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-dark)', lineHeight: 1.5 }}>{children}</div>
      {error && (
        <p role="alert" style={{
          margin: 'var(--space-4) 0 0', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)',
          background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)',
          fontSize: 'var(--fs-sm)', lineHeight: 1.45,
        }}>
          {error}
        </p>
      )}
    </Modal>
  )
}
