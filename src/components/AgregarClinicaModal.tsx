'use client'

import React, { useState } from 'react'
import { overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, inputCss, selectCss, btnDarkCss, btnLightCss } from '@/components/UI'

interface Props {
  onClose: () => void
  onSuccess: (newTenantId: string) => void
  isMobile?: boolean
}

// Igual a la limpieza que hace la API (src/app/api/clinicas/route.ts) — la calculamos
// acá también para mostrarle al usuario, en vivo, el subdominio real que va a quedar.
function limpiarSubdominio(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63)
}

export function AgregarClinicaModal({ onClose, onSuccess, isMobile = false }: Props) {
  const [nombre, setNombre] = useState('')
  const [subdominio, setSubdominio] = useState('')
  const [plan, setPlan] = useState('pro')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subdominioLimpio = limpiarSubdominio(subdominio)
  const subdominioMuyCorto = subdominioLimpio.length > 0 && subdominioLimpio.length < 3

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim() || !subdominioLimpio) {
      setError('El nombre y el subdominio son obligatorios')
      return
    }
    if (subdominioLimpio.length < 3) {
      setError('El subdominio debe tener al menos 3 caracteres')
      return
    }

    setCargando(true)
    setError(null)

    try {
      const res = await fetch('/api/clinicas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nombre: nombre.trim(),
          subdominio: subdominioLimpio,
          plan
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear la clínica')
      }

      onSuccess(data.tenantId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={overlayCss(isMobile)} onClick={onClose}>
      <div style={modalCss(isMobile)} onClick={e => e.stopPropagation()}>
        <div style={modalTitleCss}>Agregar Nueva Clínica</div>
        
        {error && (
          <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={groupCss}>
            <label style={labelCss}>Nombre de la clínica *</label>
            <input 
              style={inputCss} 
              value={nombre} 
              onChange={e => setNombre(e.target.value)} 
              placeholder="Ej: Odontología Integral" 
              autoFocus 
              required
              disabled={cargando}
            />
          </div>

          <div style={groupCss}>
            <label style={labelCss}>Subdominio para el portal *</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input 
                style={inputCss} 
                value={subdominio} 
                onChange={e => setSubdominio(e.target.value.toLowerCase().replace(/\s/g, ''))} 
                placeholder="ej: integral" 
                required
                disabled={cargando}
              />
              <span style={{ fontSize: 12, color: '#aaa', marginLeft: 8, whiteSpace: 'nowrap' }}>.turnos-app.com</span>
            </div>
            {subdominioLimpio ? (
              <span style={{ fontSize: 11, color: subdominioMuyCorto ? '#B91C1C' : '#0D9488', marginTop: 4, display: 'block' }}>
                Tu portal quedará en: <strong>{subdominioLimpio}.turnos-app.com</strong>
                {subdominioMuyCorto ? ' (mínimo 3 caracteres)' : ''}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: '#aaa', marginTop: 4, display: 'block' }}>Solo letras, números y guiones.</span>
            )}
          </div>

          <div style={groupCss}>
            <label style={labelCss}>Plan</label>
            <select 
              style={selectCss} 
              value={plan} 
              onChange={e => setPlan(e.target.value)}
              disabled={cargando}
            >
              <option value="starter">Starter — Agenda básica</option>
              <option value="pro">Pro — Agenda + WhatsApp + Recordatorios (Recomendado)</option>
              <option value="business">Business — Todo + Analíticas Pro</option>
            </select>
          </div>

          <div style={footerCss}>
            <button 
              type="button" 
              style={btnLightCss} 
              onClick={onClose} 
              disabled={cargando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{ ...btnDarkCss, opacity: (cargando || subdominioMuyCorto) ? 0.6 : 1 }}
              disabled={cargando || subdominioMuyCorto}
            >
              {cargando ? 'Creando...' : 'Crear clínica'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
