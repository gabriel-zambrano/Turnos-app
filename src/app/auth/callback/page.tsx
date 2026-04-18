'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallback() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isRecovery, setIsRecovery] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      setIsRecovery(true)
    } else {
      router.replace('/dashboard')
    }
  }, [router])

  async function actualizarPassword() {
    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    router.replace('/admin')
  }

  if (!isRecovery) return null

  const inputStyle = {
    width: '100%', border: 'none', background: '#f4f7fb',
    borderRadius: 10, padding: '0.85rem 1rem', fontSize: 15,
    color: '#0f1e2b', fontFamily: 'DM Sans, sans-serif',
    outline: 'none', boxSizing: 'border-box' as const
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f7fb', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 400, border: '0.5px solid #e8e8e8' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0f1e2b', marginBottom: 4 }}>Crear contraseña</div>
        <div style={{ fontSize: 13, color: '#aaa', marginBottom: '1.5rem' }}>Panel de administración Andbrand</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Nueva contraseña"
            style={inputStyle}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirmar contraseña"
            style={inputStyle}
          />

          {error && (
            <div style={{ background: '#FAECE7', borderRadius: 10, padding: '0.75rem 1rem', fontSize: 13, color: '#D85A30' }}>
              {error}
            </div>
          )}

          <button
            onClick={actualizarPassword}
            disabled={loading}
            style={{ padding: '0.9rem', borderRadius: 12, border: 'none', background: loading ? '#e5e5e5' : '#0f1e2b', color: loading ? '#aaa' : '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </div>
      </div>
    </div>
  )
}
