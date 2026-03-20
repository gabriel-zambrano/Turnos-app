'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const router = useRouter()
  const [email,   setEmail]   = useState('doctor@dentaldesk.com')
  const [pass,    setPass]    = useState('demo1234')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    setTimeout(() => {
      if (email === 'doctor@dentaldesk.com' && pass === 'demo1234') {
        router.push('/')
      } else {
        setError('Credenciales incorrectas. Usá doctor@dentaldesk.com / demo1234')
        setLoading(false)
      }
    }, 800)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '0.7rem 1rem', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.07)',
    color: '#fff', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
    outline: 'none', marginBottom: '1rem',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1e2b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinecap="round">
              <path d="M12 2C8.5 2 6 4.5 6 7.5c0 2 .8 3.8 1.5 5.5C8.5 15.5 9 19 9 21c0 .6.4 1 1 1s1-.4 1-1v-3c0-.6.4-1 1-1s1 .4 1 1v3c0 .6.4 1 1 1s1-.4 1-1c0-2 .5-5.5 1.5-8C17.2 11.3 18 9.5 18 7.5 18 4.5 15.5 2 12 2z"/>
            </svg>
          </div>
          <div style={{ fontSize: 26, fontWeight: 600, color: '#fff', marginBottom: 4, fontFamily: 'DM Sans, sans-serif' }}>DentalDesk</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Od. Walter Benegas</div>
        </div>

        {/* Card */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '2rem' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Iniciar sesión</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: '1.5rem' }}>Accedé al panel de gestión</div>

          {error && (
            <div style={{ background: 'rgba(216,90,48,0.15)', border: '1px solid rgba(216,90,48,0.3)', borderRadius: 8, padding: '0.65rem 0.85rem', fontSize: 12, color: '#f4a07a', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 5 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inp} placeholder="doctor@dentaldesk.com"/>

            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 5 }}>Contraseña</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} required style={inp} placeholder="••••••••"/>

            <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: 'none', background: loading ? 'rgba(255,255,255,0.1)' : '#fff', color: loading ? 'rgba(255,255,255,0.4)' : '#0f1e2b', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: '1.25rem' }}>
            Demo: doctor@dentaldesk.com / demo1234
          </div>
        </div>
      </div>
    </div>
  )
}
