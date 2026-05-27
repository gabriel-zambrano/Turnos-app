'use client'

import React, { useState } from 'react'

export function RegistroWizard() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    nombreProfesional: '',
    email: '',
    password: '',
    nombreConsultorio: '',
    direccion: '',
    telefono: '',
    primaryColor: '#0a1e3d',
    secondaryColor: '#185FA5',
    accentColor: '#138A6B'
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const nextStep = () => setStep(s => Math.min(s + 1, 4))
  const prevStep = () => setStep(s => Math.max(s - 1, 1))

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al registrar')
      
      // Auto login or redirect to login
      window.location.href = '/login?registered=true'
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 10px 40px rgba(10,30,61,0.08)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #e8edf2' }}>
        {[1, 2, 3, 4].map(s => (
          <div key={s} style={{ flex: 1, padding: '16px 0', textAlign: 'center', background: step === s ? '#f4f7fb' : '#fff', fontWeight: step === s ? 700 : 500, color: step === s ? '#185FA5' : '#94a3b8', borderBottom: step === s ? '3px solid #185FA5' : '3px solid transparent' }}>
            Paso {s}
          </div>
        ))}
      </div>

      <div style={{ padding: '32px' }}>
        {error && (
          <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="slide-up">
            <h2 style={{ fontSize: 20, color: '#0a1e3d', marginBottom: 20 }}>Datos de la Cuenta</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Nombre Completo</label>
                <input type="text" name="nombreProfesional" value={formData.nombreProfesional} onChange={handleChange} required style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #c8d4e0', fontSize: 15 }} placeholder="Ej: Dr. Juan Pérez" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Email</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} required style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #c8d4e0', fontSize: 15 }} placeholder="tu@email.com" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Contraseña</label>
                <input type="password" name="password" value={formData.password} onChange={handleChange} required style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #c8d4e0', fontSize: 15 }} placeholder="Mínimo 6 caracteres" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="slide-up">
            <h2 style={{ fontSize: 20, color: '#0a1e3d', marginBottom: 20 }}>Datos del Consultorio</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Nombre del Consultorio</label>
                <input type="text" name="nombreConsultorio" value={formData.nombreConsultorio} onChange={handleChange} required style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #c8d4e0', fontSize: 15 }} placeholder="Ej: Consultorio DentalDesk" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Dirección</label>
                <input type="text" name="direccion" value={formData.direccion} onChange={handleChange} required style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #c8d4e0', fontSize: 15 }} placeholder="Ej: Av. Principal 123" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Teléfono Público</label>
                <input type="tel" name="telefono" value={formData.telefono} onChange={handleChange} required style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #c8d4e0', fontSize: 15 }} placeholder="Ej: +54911..." />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="slide-up">
            <h2 style={{ fontSize: 20, color: '#0a1e3d', marginBottom: 20 }}>Personalización</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Color Primario</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="color" name="primaryColor" value={formData.primaryColor} onChange={handleChange} style={{ width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, color: '#4a6080' }}>Utilizado para fondos oscuros</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Color Secundario</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="color" name="secondaryColor" value={formData.secondaryColor} onChange={handleChange} style={{ width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, color: '#4a6080' }}>Utilizado para botones y acentos</span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Color Destacado</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="color" name="accentColor" value={formData.accentColor} onChange={handleChange} style={{ width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, color: '#4a6080' }}>Utilizado para llamadas a la acción</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="slide-up" style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#E1F5EE', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
              🚀
            </div>
            <h2 style={{ fontSize: 20, color: '#0a1e3d', marginBottom: 12 }}>¡Todo listo!</h2>
            <p style={{ color: '#4a6080', fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
              Revisá que la información sea correcta. Tu consultorio <strong>{formData.nombreConsultorio}</strong> será creado y podrás empezar a gestionar tus turnos.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
          {step > 1 ? (
            <button onClick={prevStep} style={{ padding: '12px 24px', borderRadius: 12, border: '1px solid #c8d4e0', background: '#fff', color: '#4a6080', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Atrás
            </button>
          ) : <div></div>}

          {step < 4 ? (
            <button 
              onClick={nextStep} 
              disabled={step === 1 && (!formData.email || !formData.password || !formData.nombreProfesional)}
              style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: '#185FA5', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (step === 1 && (!formData.email || !formData.password)) ? 0.5 : 1 }}
            >
              Siguiente
            </button>
          ) : (
            <button 
              onClick={handleSubmit} 
              disabled={loading}
              style={{ padding: '12px 32px', borderRadius: 12, border: 'none', background: '#138A6B', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Creando...' : 'Crear Cuenta'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
