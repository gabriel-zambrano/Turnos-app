'use client'
import React, { useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * Botón de DentalDesk.
 *
 * Bloqueo del primer click: si `onClick` devuelve una promesa, el botón queda
 * deshabilitado y con texto de progreso hasta que la promesa termine. El
 * bloqueo usa un ref además del estado, porque el estado tarda un render en
 * deshabilitar el botón y dos clicks seguidos entraban los dos (así se
 * duplicaron cobros el 30/09/2026). Con este componente, una acción de dinero
 * no necesita implementar su propio bloqueo.
 *
 * Estilos: clases `.dd-btn*` en globals.css (hover, activo y foco no se
 * pueden expresar con estilos inline). Colores solo por tokens.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Carga controlada desde afuera. Si `onClick` devuelve una promesa no hace falta. */
  loading?: boolean
  /** Texto mientras carga. Por defecto se mantiene el texto del botón. */
  loadingText?: string
  icon?: IconName
  iconPosition?: 'start' | 'end'
  fullWidth?: boolean
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<unknown>
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  loadingText,
  icon,
  iconPosition = 'start',
  fullWidth = false,
  onClick,
  disabled,
  type = 'button',
  className,
  children,
  style,
  ...rest
}, ref) {
  const enCursoRef = useRef(false)
  const [enCurso, setEnCurso] = useState(false)
  const ocupado = loading || enCurso

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!onClick || enCursoRef.current || ocupado || disabled) return
    const r = onClick(e)
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      enCursoRef.current = true
      setEnCurso(true)
      try {
        await r
      } finally {
        enCursoRef.current = false
        setEnCurso(false)
      }
    }
  }

  const tamIcono = size === 'sm' ? 14 : 16
  const contenido = ocupado && loadingText ? loadingText : children
  const iconoNodo = ocupado
    ? <span className="dd-btn-spinner" aria-hidden="true" />
    : icon ? <Icon name={icon} size={tamIcono} /> : null

  const clases = ['dd-btn', `dd-btn--${variant}`, `dd-btn--${size}`, fullWidth ? 'dd-btn--full' : '', className ?? '']
    .filter(Boolean).join(' ')

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={clases}
      style={style}
      disabled={disabled || ocupado}
      aria-busy={ocupado || undefined}
      onClick={handleClick}
    >
      {iconPosition === 'start' && iconoNodo}
      {contenido != null && <span>{contenido}</span>}
      {iconPosition === 'end' && iconoNodo}
    </button>
  )
})
