import React from 'react'
import { RegistroWizard } from '@/components/RegistroWizard'
import Link from 'next/link'

export default function RegistroPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f7fb', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 500 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0a1e3d', marginBottom: 8, textAlign: 'center' }}>Crear cuenta en DentalDesk</h1>
        <p style={{ color: '#4a6080', fontSize: 15, textAlign: 'center', marginBottom: 32 }}>
          Llevá tu consultorio al siguiente nivel. Completá los datos para empezar.
        </p>

        <RegistroWizard />

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 14, color: '#4a6080' }}>
          ¿Ya tenés una cuenta?{' '}
          <Link href="/login" style={{ color: '#185FA5', fontWeight: 700, textDecoration: 'none' }}>
            Iniciá sesión acá
          </Link>
        </div>
      </div>
    </div>
  )
}
