import React from 'react'

export default function Privacidad() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#0a1e3d', marginBottom: 24 }}>Política de Privacidad</h1>
      <p style={{ color: '#4a6080', lineHeight: 1.6 }}>
        En DentalDesk respetamos tu privacidad y nos comprometemos a proteger la información personal y de salud que gestionás en nuestra plataforma.
      </p>
      <h2 style={{ color: '#0a1e3d', marginTop: 32 }}>1. Información que recopilamos</h2>
      <p style={{ color: '#4a6080', lineHeight: 1.6 }}>
        Recopilamos información básica de registro de los profesionales (nombre, email, teléfono, dirección del consultorio) así como la información cargada de los pacientes (fichas clínicas, turnos, historial dental).
      </p>
      <h2 style={{ color: '#0a1e3d', marginTop: 32 }}>2. Uso de la información</h2>
      <p style={{ color: '#4a6080', lineHeight: 1.6 }}>
        La información se utiliza exclusivamente para brindar el servicio de gestión de turnos y clínica dental. No vendemos ni compartimos información de pacientes con terceros, asegurando el aislamiento de datos entre los distintos profesionales.
      </p>
      <h2 style={{ color: '#0a1e3d', marginTop: 32 }}>3. Seguridad</h2>
      <p style={{ color: '#4a6080', lineHeight: 1.6 }}>
        Utilizamos Row Level Security (RLS) y encriptación en tránsito para asegurar que cada profesional solo tenga acceso a su propia base de pacientes.
      </p>
      <p style={{ marginTop: 40, color: '#94a3b8', fontSize: 14 }}>
        Última actualización: Mayo 2026
      </p>
    </div>
  )
}
