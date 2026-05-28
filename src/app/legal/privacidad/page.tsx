import React from 'react'
import Link from 'next/link'

export default function Privacidad() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a122c', color: '#cbd5e1', fontFamily: 'Outfit, Inter, sans-serif', padding: '60px 20px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 24, padding: '48px 32px', backdropFilter: 'blur(10px)' }}>
        
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 32 }}>
          ← Volver al Inicio
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.8px' }}>Política de Privacidad</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 32 }}>Última actualización: 28 de Mayo, 2026</p>

        <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          En <strong>DentalDesk</strong> (en adelante, "la Plataforma"), operada como un software bajo el modelo de Software como Servicio (SaaS), nos comprometemos solemnemente a proteger la privacidad y confidencialidad de la información personal y de salud que los profesionales y clínicas odontológicas (en adelante, "los Usuarios") gestionan a través de nuestro sistema.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>1. Cumplimiento de la Ley 25.326 (Argentina)</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          DentalDesk cumple estrictamente con lo establecido en la <strong>Ley de Protección de Datos Personales N° 25.326</strong> de la República Argentina. Garantizamos que todos los datos sensibles de los pacientes cargados en el sistema (tales como diagnósticos, tratamientos, evoluciones clínicas e historial médico) están protegidos bajo estrictas medidas de seguridad técnica, lógica y física.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>2. Rol como Encargado del Tratamiento</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          El profesional odontólogo o clínica que registra una cuenta en DentalDesk actúa como <strong>Responsable de la Base de Datos</strong> de sus respectivos pacientes. DentalDesk actúa únicamente como <strong>Encargado del Tratamiento</strong> de dicha información personal y de salud. Nos limitamos a almacenar y estructurar los datos según las instrucciones lógicas del sistema, sin comercializar, ceder ni compartir bajo ningún concepto la información de los pacientes con terceros.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>3. Aislamiento Lógico (Multi-Tenant)</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          La arquitectura de DentalDesk está diseñada para un aislamiento absoluto de los datos por cada inquilino mediante la tecnología de <strong>Row Level Security (RLS)</strong>. Ningún usuario, doctor o colaborador perteneciente a otra clínica odontológica registrada en el SaaS podrá tener acceso, ver o modificar la información de tus pacientes, agendas, turnos ni registros financieros.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>4. Recopilación de Datos y Finalidad</h2>
        <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <li><strong>Datos del Profesional:</strong> Nombre completo, dirección de email, contraseña (encriptada mediante hash), teléfono público y datos del consultorio dental para fines de login, cobros y personalización de marca.</li>
          <li><strong>Datos del Paciente:</strong> Nombre completo, teléfono, email, ficha clínica de turnos e historial médico, recolectados con el único fin de agendar citas, enviar notificaciones por correo y WhatsApp, y mantener la historia clínica digital del consultorio.</li>
        </ul>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>5. Seguridad de la Información</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Implementamos protocolos de seguridad estándar de la industria, incluyendo cifrado SSL/TLS de 256 bits para todas las transferencias de datos en tránsito, hashing criptográfico para contraseñas de sesión, e inyección segura de variables de autenticación para llamadas internas a APIs.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>6. Contacto y Soporte</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Si tenés alguna consulta legal sobre la administración de las bases de datos o deseas ejercer tus derechos de acceso, rectificación o supresión de datos bajo la Ley 25.326, envianos un correo electrónico a: <strong>soporte@dentaldesk.app</strong>.
        </p>

      </div>
    </div>
  )
}
