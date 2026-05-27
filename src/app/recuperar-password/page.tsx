'use client'

import React, { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function RecuperarPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)
    
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f7fb', padding: 20 }}>
      <div style={{ background: '#fff', padding: 40, borderRadius: 20, boxShadow: '0 10px 40px rgba(10,30,61,0.08)', width: '100%', maxWidth: 400 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0a1e3d', marginBottom: 8, textAlign: 'center' }}>Recuperar contraseña</h1>
        <p style={{ color: '#4a6080', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          Ingresá tu email y te enviaremos un link para restablecerla.
        </p>

        {success ? (
          <div style={{ background: '#E1F5EE', color: '#138A6B', padding: 16, borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
            Te enviamos las instrucciones a tu correo. Por favor revisá tu bandeja de entrada o spam.
          </div>
        ) : (
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 6 }}>Email</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #c8d4e0', fontSize: 15 }}
                placeholder="tu@email.com"
              />
            </div>
            <button 
              type="submit" 
              disabled={loading}
              style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: '#185FA5', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Enviando...' : 'Enviar link de recuperación'}
            </button>
          </form>
        )}
        
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Link href="/login" style={{ color: '#185FA5', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  )
}
