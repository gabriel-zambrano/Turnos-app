'use client'
import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * Lienzo de firma. Captura el trazo con dedo o mouse y lo exporta como PNG (dataURL).
 * Uso: <SignaturePad onChange={(dataUrl|null) => ...} />
 */
export function SignaturePad({ onChange, height = 200 }: { onChange?: (dataUrl: string | null) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [vacio, setVacio] = useState(true)

  // Ajusta el tamaño real del canvas al contenedor (nítido en pantallas retina)
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(ratio, ratio)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#0a1e3d'
    }
  }, [])

  useEffect(() => {
    setupCanvas()
    window.addEventListener('resize', setupCanvas)
    return () => window.removeEventListener('resize', setupCanvas)
  }, [setupCanvas])

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    drawing.current = true
    last.current = pos(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !last.current) return
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (vacio) setVacio(false)
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    if (onChange && canvasRef.current) onChange(vacio ? null : canvasRef.current.toDataURL('image/png'))
  }

  const limpiar = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setVacio(true)
    onChange?.(null)
  }

  return (
    <div>
      <div style={{ position: 'relative', border: '1.5px dashed #cbd5e1', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          style={{ width: '100%', height, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        />
        {vacio && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: '#cbd5e1', fontSize: 14, fontFamily: 'DM Sans, sans-serif' }}>
            Firmá acá con el dedo o el mouse
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button type="button" onClick={limpiar} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          Borrar firma
        </button>
      </div>
    </div>
  )
}
