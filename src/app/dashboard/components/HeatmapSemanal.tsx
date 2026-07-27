'use client'

// ─────────────────────────────────────────────────────────────
// Carga de turnos de los próximos 7 días.
//
// Es un selector de fecha además de un gráfico: al tocar un día, el dashboard
// muestra la agenda de ese día. La intensidad del color indica cuántos turnos
// hay, para ver de un vistazo dónde queda lugar libre.
// ─────────────────────────────────────────────────────────────

import { hoyISO } from '@/lib/constants'

export interface DiaHeatmap {
  dateStr: string
  dayName: string
  dayNum: string
  count: number
}

interface Props {
  dias: DiaHeatmap[]
  fechaSeleccionada: string
  onSeleccionar: (fecha: string) => void
  primaryColor: string
  secondaryColor: string
  accentColor: string
}

export function HeatmapSemanal({
  dias,
  fechaSeleccionada,
  onSeleccionar,
  primaryColor,
  secondaryColor,
  accentColor,
}: Props) {
  return (
    <div className="glass-container" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: primaryColor }}>Carga de Turnos (Próximos 7 días)</span>
        <span style={{ fontSize: 11, color: '#8fa3bc' }}>Haz clic para ver la agenda de ese día</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {dias.map(d => {
          const isSelected = fechaSeleccionada === d.dateStr
          const isToday = hoyISO() === d.dateStr
    
          // Color density scale
          let bg = 'transparent'
          let border = '1px solid var(--border-light, #dde5ef)'
          let text = 'var(--text-dark, #0a1e3d)'
    
          if (d.count > 0) {
            if (d.count <= 2) {
              bg = `${secondaryColor}15`
              border = `1px solid ${secondaryColor}30`
              text = secondaryColor
            } else if (d.count <= 5) {
              bg = `${secondaryColor}35`
              border = `1px solid ${secondaryColor}60`
              text = primaryColor
            } else {
              bg = secondaryColor
              border = `1px solid ${secondaryColor}`
              text = '#fff'
            }
          }
    
          if (isSelected) {
            border = `2.5px solid ${accentColor}`
          }

          return (
            <button
              key={d.dateStr}
              onClick={() => onSeleccionar(d.dateStr)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '8px 4px',
                borderRadius: 12,
                background: bg,
                border: border,
                color: text,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', opacity: d.count > 5 ? 0.9 : 0.6 }}>{d.dayName}</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{d.dayNum}</span>
              {d.count > 0 && (
                <span style={{ 
                  fontSize: 9, 
                  fontWeight: 700, 
                  background: d.count > 5 ? '#fff' : secondaryColor, 
                  color: d.count > 5 ? secondaryColor : '#fff',
                  padding: '1px 5px', 
                  borderRadius: 8,
                  marginTop: 2
                }}>
                  {d.count}
                </span>
              )}
              {isToday && !isSelected && (
                <span style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: '50%', background: accentColor }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
