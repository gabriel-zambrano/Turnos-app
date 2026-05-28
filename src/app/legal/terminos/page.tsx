import React from 'react'
import Link from 'next/link'

export default function Terminos() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a122c', color: '#cbd5e1', fontFamily: 'Outfit, Inter, sans-serif', padding: '60px 20px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 24, padding: '48px 32px', backdropFilter: 'blur(10px)' }}>
        
        <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 32 }}>
          ← Volver al Inicio
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.8px' }}>Términos y Condiciones</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 32 }}>Última actualización: 28 de Mayo, 2026</p>

        <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          Al registrarse, acceder o utilizar la plataforma web <strong>DentalDesk</strong> (en adelante, "el Servicio"), el odontólogo o representante de la clínica dental (en adelante, "el Usuario") acepta y se compromete a cumplir con los siguientes Términos y Condiciones.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>1. Prestación del Servicio</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          DentalDesk proporciona una plataforma de software en la nube para la gestión de consultorios odontológicos. Esto incluye la gestión de agendas, fichas de pacientes, históricos de tratamientos, módulos financieros básicos y analíticas de Business Intelligence. El Servicio se ofrece bajo la modalidad de "como está" y "según disponibilidad".
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>2. Suscripciones y Pagos (MercadoPago)</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          El Servicio dispone de un plan gratuito (Starter) y un plan de pago (Plan Pro). Las suscripciones mensuales del Plan Pro son cobradas en pesos argentinos (ARS) mediante la plataforma de pagos segura de <strong>MercadoPago</strong>.
        </p>
        <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <li><strong>Suscripción Recurrente:</strong> Al activar el Plan Pro, el Usuario autoriza el débito automático mensual por el valor vigente.</li>
          <li><strong>Periodo de Prueba (Trial):</strong> Los nuevos registros disfrutan de un periodo de prueba gratis de 14 días con acceso completo a las funciones Pro. Cumplidos los 14 días, la cuenta se convertirá en Starter si no se asocia un método de pago.</li>
          <li><strong>Falta de Pago:</strong> En caso de que MercadoPago reporte el rechazo de un pago mensual, la cuenta se degradará automáticamente al Plan Starter, restringiendo el acceso al módulo de BI hasta que se regularice la deuda.</li>
        </ul>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>3. Responsabilidad sobre Fichas Dentales y Diagnósticos</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          El profesional odontólogo es el único <strong>Responsable Civil e Institucional</strong> por los diagnósticos, recetas, planes de tratamientos y notas evolutivas registradas en la ficha dental de sus pacientes. DentalDesk no interviene ni se responsabiliza bajo ningún concepto por decisiones médicas, mala praxis o inexactitud en los registros ingresados en el software.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>4. Propiedad Intelectual y Licencia</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          DentalDesk otorga al Usuario una licencia de uso limitada, no exclusiva, intransferible y revocable para utilizar el software únicamente dentro de su consultorio dental. Toda la tecnología, base de código, interfaces gráficas, marcas y logotipos de DentalDesk son propiedad intelectual exclusiva de la Plataforma.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>5. Rescisión del Servicio</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          El Usuario puede cancelar su suscripción a DentalDesk en cualquier momento desde su panel de Configuración de Clínica o poniéndose en contacto con soporte. Al rescindir el servicio, se le dará la posibilidad de solicitar la exportación de sus fichas de pacientes en formato estructurado (CSV) durante los siguientes 30 días hábiles.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>6. Jurisdicción y Ley Aplicable</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Estos Términos y Condiciones se rigen e interpretan bajo las leyes vigentes de la República Argentina. Cualquier conflicto derivado de la interpretación de este acuerdo se someterá a la jurisdicción de los Tribunales Ordinarios en lo Comercial de la Ciudad Autónoma de Buenos Aires.
        </p>

      </div>
    </div>
  )
}
