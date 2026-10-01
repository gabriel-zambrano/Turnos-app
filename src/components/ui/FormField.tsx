'use client'
import React, { useId } from 'react'

/**
 * Campo de formulario: label + control + ayuda + error, asociados.
 *
 * Hoy hay 142 <label> y un solo `htmlFor` en todo el código: un lector de
 * pantalla no sabe qué campo es cuál, y tocar el label no enfoca el input.
 * FormField genera el id y se lo pasa al control hijo junto con
 * aria-describedby (ayuda y error) y aria-invalid. El control sigue siendo un
 * <input>/<select>/<textarea> común con los estilos existentes (inputCss, …),
 * así la migración es pantalla por pantalla.
 *
 *   <FormField label="Monto" required error={errMonto}>
 *     <input type="number" style={inputCss} value={...} onChange={...} />
 *   </FormField>
 */

export interface FormFieldProps {
  label: React.ReactNode
  children: React.ReactElement
  hint?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
  /** id explícito del control; si no, se genera. */
  id?: string
  style?: React.CSSProperties
}

export function FormField({ label, children, hint, error, required, id, style }: FormFieldProps) {
  const auto = useId()
  const controlId = id ?? children.props.id ?? `campo-${auto}`
  const hintId = hint && !error ? `${controlId}-ayuda` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [children.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = React.cloneElement(children, {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : children.props['aria-invalid'],
    'aria-required': required || children.props['aria-required'] || undefined,
    required: children.props.required ?? required,
  })

  return (
    <div style={{ marginBottom: 'var(--space-3)', ...style }}>
      <label
        htmlFor={controlId}
        style={{
          display: 'block', marginBottom: 'var(--space-1)',
          fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.01em',
          color: 'var(--text-muted-darker)',
        }}
      >
        {label}
        {required && <span aria-hidden="true" style={{ color: 'var(--danger-text)', marginLeft: 2 }}>*</span>}
      </label>
      {control}
      {hintId && (
        <p id={hintId} style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--fs-xs)', color: 'var(--danger-text)', lineHeight: 1.45, fontWeight: 500 }}>
          {error}
        </p>
      )}
    </div>
  )
}
