'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { SignaturePad } from '@/components/SignaturePad'

export default function FirmarConsentimiento() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ titulo: string; contenido: string; estado: string; firmanteNombre: string | null; clinica: string } | null>(null)
  const [error, setError] = useState('')
  const [nombre, setNombre] = useState('')
  const [doc, setDoc] = useState('')
  const [firma, setFirma] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    fetch(`/api/consentimientos/firmar/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else {
          setData(d)
          if (d.estado === 'firmado') setListo(true)
          if (d.firmanteNombre) setNombre(d.firmanteNombre)
        }
      })
      .catch(() => setError('No se pudo cargar el consentimiento'))
      .finally(() => setLoading(false))
  }, [token])

  async function firmar() {
    if (!nombre.trim()) return alert('Ingresá tu nombre completo.')
    if (!firma) return alert('Por favor, firmá en el recuadro.')
    setEnviando(true)
    try {
      const res = await fetch(`/api/consentimientos/firmar/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaPng: firma, firmanteNombre: nombre.trim(), firmanteDoc: doc.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al firmar')
      setListo(true)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const wrap: React.CSSProperties = { minHeight: '100vh', background: '#f1f5f9', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem 1rem' }
  const cardSt: React.CSSProperties = { background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(10,30,61,0.08)', maxWidth: 620, width: '100%', padding: '1.75rem' }
  const inputSt: React.CSSProperties = { fontSize: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box', outline: 'none', fontFamily: 'DM Sans, sans-serif' }

  if (loading) return <div style={wrap}><div style={cardSt}>Cargando…</div></div>
  if (error) return <div style={wrap}><div style={{ ...cardSt, textAlign: 'center' }}><div style={{ fontSize: 40 }}>⚠️</div><p style={{ color: '#64748b' }}>{error}</p></div></div>

  if (listo) return (
    <div style={wrap}>
      <div style={{ ...cardSt, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h2 style={{ color: '#0a1e3d', margin: '0.5rem 0' }}>¡Consentimiento firmado!</h2>
        <p style={{ color: '#64748b', fontSize: 14 }}>Gracias. Tu firma quedó registrada correctamente en {data?.clinica}. Ya podés cerrar esta página.</p>
      </div>
    </div>
  )

  return (
    <div style={wrap}>
      <div style={cardSt}>
        <div style={{ fontSize: 12, color: '#8fa3bc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{data?.clinica}</div>
        <h1 style={{ fontSize: 19, color: '#0a1e3d', margin: '4px 0 16px' }}>{data?.titulo}</h1>

        <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: '#f8fafc', border: '1px solid #e8edf2', borderRadius: 12, padding: '1rem', maxHeight: 300, overflowY: 'auto', marginBottom: '1.5rem' }}>
          {data?.contenido}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1rem' }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Nombre y apellido *</label>
            <input style={inputSt} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre completo" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>DNI (opcional)</label>
            <input style={inputSt} value={doc} onChange={e => setDoc(e.target.value)} placeholder="Ej. 34567890" />
          </div>
        </div>

        <label style={{ fontSize: 13, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Tu firma *</label>
        <SignaturePad onChange={setFirma} />

        <button
          onClick={firmar}
          disabled={enviando}
          style={{ width: '100%', marginTop: '1.25rem', padding: '13px', borderRadius: 10, border: 'none', background: enviando ? '#94a3b8' : '#1D9E75', color: '#fff', fontSize: 15, fontWeight: 700, cursor: enviando ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}
        >
          {enviando ? 'Registrando firma…' : 'Confirmar y firmar'}
        </button>
        <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 10 }}>
          Al firmar, aceptás el contenido de este documento. Tu firma queda registrada de forma segura e inalterable.
        </p>
      </div>
    </div>
  )
}
