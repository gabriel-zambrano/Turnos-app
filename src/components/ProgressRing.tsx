'use client'
import React, { useEffect, useState } from 'react'

/**
 * Anillo de progreso en SVG.
 *
 * Reemplaza a la barra lineal en el portal del paciente. El motivo no es
 * estético: una barra al 60% se lee como "me falta el 40%", mientras que un
 * anillo cerrándose se lee como "voy por acá". Es el mismo dato contado como
 * avance y no como faltante, que es lo que corresponde en un tratamiento de
 * dos años.
 *
 * El trazo se dibuja con `strokeDasharray` = circunferencia y un
 * `strokeDashoffset` que la descuenta. Rotado -90° para que empiece arriba y
 * no a las 3 en punto.
 */
export function ProgressRing({
  value,
  size = 132,
  stroke = 10,
  from,
  to,
  track,
  label,
  sublabel,
}: {
  /** Porcentaje 0-100. Se recorta al rango: un dato sucio no rompe el dibujo. */
  value: number
  size?: number
  stroke?: number
  /** Inicio del degradado del trazo. */
  from: string
  /** Fin del degradado del trazo. */
  to: string
  /** Color del anillo de fondo. Por defecto, `from` al 10%. */
  track?: string
  /** Texto grande del centro. Si se omite, el porcentaje. */
  label?: React.ReactNode
  /** Texto chico debajo del label. */
  sublabel?: React.ReactNode
}) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r

  // El anillo arranca vacío y se llena al montar. Sin esto la transición no
  // ocurre nunca, porque el valor final ya está puesto en la primera pintura.
  const [dibujado, setDibujado] = useState(false)
  const [animar, setAnimar] = useState(true)
  useEffect(() => {
    setAnimar(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const t = requestAnimationFrame(() => setDibujado(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Cada instancia necesita su propio id de degradado: dos anillos en la misma
  // página con el mismo id hacen que el segundo herede el color del primero.
  // Los dos puntos que mete useId (":r0:") son inválidos dentro de url(#...),
  // así que se quitan.
  const gradId = 'pr' + React.useId().replace(/:/g, '')

  const offset = circumference * (1 - (dibujado ? pct : 0) / 100)

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }} aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track || `${from}1a`}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: animar ? 'stroke-dashoffset 900ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          textAlign: 'center',
          padding: stroke,
        }}
      >
        <div className="kpi-numeral" style={{ fontSize: size * 0.28, fontWeight: 600, color: 'var(--portal-text-primary, #0a1e3d)', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {label ?? `${Math.round(pct)}%`}
        </div>
        {sublabel ? (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted, #8a99ad)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {sublabel}
          </div>
        ) : null}
      </div>
    </div>
  )
}
