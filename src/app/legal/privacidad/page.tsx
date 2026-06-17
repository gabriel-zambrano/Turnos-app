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
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 32 }}>Última actualización: 17 de Junio, 2026</p>

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

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>6. Consentimiento del Paciente</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          El tratamiento de datos de salud requiere el <strong>consentimiento expreso, libre e informado</strong> del paciente. Es responsabilidad del profesional usuario recabar dicho consentimiento antes de cargar la información en la Plataforma. DentalDesk pone a disposición un modelo de texto de consentimiento para facilitar este proceso.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>7. Conservación de los Datos</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Conservamos los datos mientras la cuenta esté activa y durante los plazos que exija la normativa sanitaria sobre conservación de la historia clínica. Tras la baja de la cuenta, los datos se eliminan o anonimizan en un plazo de 30 días, salvo que exista una obligación legal de conservarlos por más tiempo.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>8. Terceros y Subencargados</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
          Para prestar el Servicio compartimos datos, estrictamente lo necesario, con proveedores que actúan como encargados y solo procesan los datos según nuestras instrucciones:
        </p>
        <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <li><strong>Supabase:</strong> base de datos y almacenamiento.</li>
          <li><strong>Vercel:</strong> hosting de la aplicación.</li>
          <li><strong>Resend:</strong> envío de emails transaccionales.</li>
          <li><strong>MercadoPago:</strong> procesamiento de pagos de la suscripción.</li>
          <li><strong>Google:</strong> sincronización opcional con Google Sheets.</li>
        </ul>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>9. Transferencias Internacionales</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Algunos de nuestros proveedores procesan datos fuera de Argentina o Venezuela. En esos casos adoptamos salvaguardas contractuales que garantizan un nivel de protección adecuado, conforme a lo exigido por la Ley 25.326.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>10. Derechos de los Titulares (ARCO)</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Toda persona puede ejercer sus derechos de <strong>acceso, rectificación, actualización y supresión</strong> de sus datos. Para datos de pacientes, la solicitud se canaliza a través del profesional responsable. En Argentina, el titular puede además reclamar ante la <strong>Agencia de Acceso a la Información Pública (AAIP)</strong>.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>11. Menores de Edad</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Cuando el paciente sea menor de edad, el consentimiento para el tratamiento de sus datos debe ser otorgado por su madre, padre o representante legal.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>12. Venezuela y Otros Países</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Para usuarios en Venezuela, donde no existe una ley integral de protección de datos equivalente, aplicamos la protección constitucional del habeas data y la normativa sanitaria sobre la historia clínica, adoptando como estándar de referencia las buenas prácticas internacionales.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>13. Contacto y Soporte</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Si tenés alguna consulta legal sobre la administración de las bases de datos o deseas ejercer tus derechos de acceso, rectificación o supresión de datos bajo la Ley 25.326, envianos un correo electrónico a: <strong>soporte@dentaldesk.app</strong>.
        </p>

      </div>
    </div>
  )
}
