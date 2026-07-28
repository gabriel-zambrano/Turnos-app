'use client'

// ─────────────────────────────────────────────────────────────
// Portada del dominio del consultorio.
//
// Antes esto redirigía a /dashboard, así que quien entraba al dominio pelado
// —el link de la bio de Instagram, alguien que escribe la dirección de memoria—
// terminaba en un formulario de login. Además de ser una mala primera
// impresión, hace pensar que hace falta una cuenta para pedir turno.
//
// Ahora: si hay sesión, va al panel como siempre. Si no, ve el consultorio y un
// botón para pedir turno.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'

export default function Portada() {
  const { tenant, loading } = useTenantContext()
  const [verificandoSesion, setVerificandoSesion] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        window.location.href = '/dashboard'
        return
      }
      setVerificandoSesion(false)
    })
  }, [])

  if (verificandoSesion || loading) {
    return <Centrado><span style={{ color: '#8fa3bc', fontSize: 14 }}>Cargando…</span></Centrado>
  }

  // Sin clínica resuelta estamos en el dominio de la plataforma, no en el de un
  // consultorio: ahí lo que corresponde es la presentación del producto.
  if (!tenant) {
    return (
      <Centrado>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#0a1e3d', margin: '0 0 12px', letterSpacing: '-0.5px' }}>
            DentalDesk
          </h1>
          <p style={{ fontSize: 16, color: '#4a6080', lineHeight: 1.6, margin: '0 0 28px' }}>
            El sistema de gestión para consultorios odontológicos: agenda, ficha clínica,
            facturación y recordatorios en un solo lugar.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/precios" style={botonPrimario('#0a1e3d')}>Ver planes y precios</Link>
            <Link href="/login" style={botonSecundario}>Ingresar</Link>
          </div>
        </div>
      </Centrado>
    )
  }

  const acento = tenant.secondaryColor || '#185FA5'

  return (
    <Centrado>
      <div style={{ textAlign: 'center', maxWidth: 440, width: '100%' }}>

        {tenant.logoUrl
          ? <img src={tenant.logoUrl} alt={tenant.nombre} style={{ width: 82, height: 82, objectFit: 'contain', borderRadius: 18, marginBottom: 22 }} />
          : <div style={{ width: 82, height: 82, borderRadius: 18, background: acento, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 800, margin: '0 auto 22px' }}>
              {tenant.nombre.charAt(0)}
            </div>}

        <h1 style={{ fontSize: 27, fontWeight: 800, color: '#0a1e3d', margin: '0 0 10px', letterSpacing: '-0.4px', lineHeight: 1.25 }}>
          {tenant.nombre}
        </h1>

        {tenant.direccion && (
          <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 4px' }}>{tenant.direccion}</p>
        )}
        {tenant.telefono && (
          <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 30px' }}>{tenant.telefono}</p>
        )}

        {/* Lo que vino a hacer casi todo el que entra acá. */}
        {tenant.slug && (
          <Link href={`/reserva/${tenant.slug}`} style={{ ...botonPrimario(acento), display: 'block', marginBottom: 14, fontSize: 16, padding: '16px' }}>
            Pedir un turno
          </Link>
        )}

        <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 32px' }}>
          Elegís el día y el horario entre los que están libres.
          {tenant.telefono && <> ¿Preferís hablar? Llamá al {tenant.telefono}.</>}
        </p>

        <div style={{ borderTop: '1px solid #e8edf2', paddingTop: 18 }}>
          <Link href="/login" style={{ fontSize: 13, color: '#8fa3bc', textDecoration: 'none', fontWeight: 600 }}>
            Acceso del consultorio →
          </Link>
        </div>
      </div>
    </Centrado>
  )
}

function Centrado({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px 20px', fontFamily: 'DM Sans, system-ui, sans-serif',
    }}>
      {children}
    </div>
  )
}

const botonPrimario = (color: string): React.CSSProperties => ({
  background: color, color: '#fff', padding: '14px 28px', borderRadius: 14,
  fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-block',
})

const botonSecundario: React.CSSProperties = {
  background: '#fff', color: '#0a1e3d', padding: '14px 28px', borderRadius: 14,
  fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-block',
  border: '1px solid #e2e8f0',
}
