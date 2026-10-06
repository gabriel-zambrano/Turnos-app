'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { PacienteFoto } from '../tipos'

// Pestaña extraída de la Ficha del paciente (page.tsx) sin cambios de
// comportamiento: el JSX es el mismo; lo que usaba de la página llega por props.

export interface TabFotosProps {
  fotos: PacienteFoto[]
  setModalFoto: Dispatch<SetStateAction<boolean>>
  isMobile: boolean
}

export function TabFotos({ fotos, setModalFoto, isMobile }: TabFotosProps) {
  return (
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Evolución Fotográfica</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Galería de seguimiento clínico visual del tratamiento.</p>
          </div>
          <button 
            onClick={() => setModalFoto(true)}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            📷 Agregar Foto
          </button>
        </div>

        {fotos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-input)', borderRadius: 12 }}>
            Aún no hay fotos clínicas registradas para este paciente.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14 }}>
            {fotos.map(foto => (
              <div key={foto.id} style={{ 
                position: 'relative', 
                borderRadius: 14, 
                overflow: 'hidden', 
                border: '1px solid var(--border-light)',
                boxShadow: '0 4px 12px rgba(10,30,61,0.02)'
              }}>
                <img src={foto.url} alt={foto.tipo} loading="lazy" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(10,30,61,0.75)', color: '#fff', fontSize: 11, padding: '6px 10px', fontWeight: 600, backdropFilter: 'blur(4px)' }}>
                  {foto.tipo}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
  )
}
