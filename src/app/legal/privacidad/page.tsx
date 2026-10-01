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
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 32 }}>Última actualización: 26 de Agosto, 2026</p>

        <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          En <strong>DentalDesk</strong> (en adelante, "la Plataforma"), operada bajo el modelo de Software como Servicio (SaaS), protegemos la privacidad y la confidencialidad de la información personal y de salud que los profesionales y clínicas odontológicas (en adelante, "los Usuarios") gestionan a través de nuestro sistema.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>1. Cumplimiento de la Ley 25.326 (Argentina)</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          DentalDesk se ajusta a lo establecido en la <strong>Ley de Protección de Datos Personales N° 25.326</strong> de la República Argentina. Los datos sensibles de los pacientes cargados en el sistema (diagnósticos, tratamientos, evoluciones clínicas e historial médico) se protegen mediante las medidas técnicas y organizativas descriptas en esta política.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>2. Rol como Encargado del Tratamiento</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          El profesional o clínica que registra una cuenta actúa como <strong>Responsable de la Base de Datos</strong> de sus pacientes. DentalDesk actúa como <strong>Encargado del Tratamiento</strong>: almacena y estructura los datos según las instrucciones del Responsable. <strong>No comercializamos ni cedemos datos de pacientes.</strong> Los únicos terceros que los procesan son los proveedores de infraestructura enumerados en la sección 9, que actúan como subencargados bajo nuestras instrucciones.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>3. Aislamiento Lógico (Multi-Tenant)</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Los datos de cada clínica están aislados de los de las demás mediante <strong>Row Level Security (RLS)</strong> aplicado en la base de datos. Ningún usuario, profesional o colaborador perteneciente a otra clínica registrada en la Plataforma puede acceder, ver ni modificar la información de tus pacientes, agendas, turnos, fotografías clínicas ni registros financieros. Este aislamiento se verifica mediante pruebas automatizadas que se ejecutan ante cada cambio del sistema.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          La única excepción es el acceso del equipo técnico de DentalDesk, descripto en la sección 6.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>4. Recopilación de Datos y Finalidad</h2>
        <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <li><strong>Datos del Profesional:</strong> nombre completo, dirección de email, contraseña (almacenada mediante hash), teléfono público y datos del consultorio, con fines de acceso a la cuenta, facturación de la suscripción y personalización de marca.</li>
          <li><strong>Datos del Paciente:</strong> nombre completo, teléfono, email, ficha de turnos, historia clínica, fotografías clínicas y consentimientos firmados, con el fin de agendar citas, enviar notificaciones por correo electrónico y mantener la historia clínica digital del consultorio.</li>
        </ul>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>5. Seguridad de la Información</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Aplicamos cifrado <strong>TLS</strong> en todas las transferencias de datos entre tu navegador y nuestros servidores, y hashing criptográfico para las contraseñas. Las fotografías clínicas se almacenan en un repositorio privado, no accesible públicamente, con control de acceso por clínica. Los enlaces que se envían a pacientes utilizan identificadores aleatorios de alta entropía.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          El cifrado en tránsito protege la comunicación frente a terceros que la intercepten. <strong>No se trata de cifrado de extremo a extremo:</strong> para prestar el Servicio, la Plataforma necesita procesar los datos en claro en sus servidores.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>6. Acceso del Equipo Técnico de DentalDesk</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Para prestar soporte, diagnosticar fallas, migrar información y realizar tareas de mantenimiento, <strong>el equipo técnico de DentalDesk puede acceder a los datos alojados en la Plataforma, incluida información clínica de pacientes.</strong> Preferimos declararlo de forma explícita antes que dejarlo implícito.
        </p>
        <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <li>El acceso se realiza mediante <strong>cuentas nominadas</strong>, nunca anónimas ni compartidas.</li>
          <li>Esas cuentas <strong>figuran visibles en la pantalla de Equipo de tu clínica</strong>, junto al resto de los usuarios. Podés verificarlas en cualquier momento.</li>
          <li>Se limita a lo necesario para resolver la incidencia o ejecutar la tarea solicitada.</li>
          <li>El personal técnico está obligado a confidencialidad sobre toda la información a la que acceda.</li>
          <li>No utilizamos datos clínicos de pacientes para fines comerciales, analíticos ni de entrenamiento de modelos.</li>
        </ul>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Si preferís que retiremos ese acceso de tu clínica, podés solicitarlo escribiendo a soporte. Tené en cuenta que ello limitará nuestra capacidad de asistirte ante incidencias que requieran inspeccionar tus datos.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>7. Consentimiento del Paciente</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          El tratamiento de datos de salud requiere el <strong>consentimiento expreso, libre e informado</strong> del paciente. Es responsabilidad del profesional usuario recabar dicho consentimiento antes de cargar la información en la Plataforma. DentalDesk pone a disposición un modelo de texto de consentimiento para facilitar este proceso.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>8. Conservación de los Datos y Baja de la Cuenta</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Conservamos los datos mientras la cuenta esté activa y durante los plazos que exija la normativa sanitaria sobre conservación de la historia clínica, que en Argentina puede alcanzar los diez años.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Para dar de baja una cuenta, el Responsable debe solicitarlo por escrito a soporte. Al recibir la solicitud:
        </p>
        <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <li>Entregamos una <strong>exportación de los datos de la clínica</strong> dentro de los 30 días corridos.</li>
          <li>Suspendemos el acceso a la Plataforma.</li>
          <li>Eliminamos los datos <strong>a partir de la confirmación del Responsable de que recibió la exportación</strong>, salvo que exista obligación legal de conservarlos. La historia clínica no se elimina antes del plazo que la normativa sanitaria imponga al profesional.</li>
        </ul>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          La eliminación no es automática: se ejecuta de forma verificada y se confirma por escrito al Responsable.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>9. Terceros y Subencargados</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
          Para prestar el Servicio compartimos datos, estrictamente lo necesario, con proveedores que actúan como encargados y solo los procesan según nuestras instrucciones:
        </p>
        <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <li><strong>Supabase:</strong> base de datos y almacenamiento de archivos.</li>
          <li><strong>Vercel:</strong> hosting de la aplicación.</li>
          <li><strong>Resend:</strong> envío de emails transaccionales.</li>
          <li><strong>MercadoPago:</strong> procesamiento de pagos de la suscripción. No recibe datos clínicos.</li>
          <li><strong>Sentry:</strong> registro de errores técnicos, configurado para no recibir datos identificatorios de pacientes.</li>
        </ul>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>10. Notificación de Incidentes</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Si detectamos un incidente de seguridad que afecte datos personales de tu clínica o de tus pacientes, te lo notificaremos <strong>sin demora indebida</strong>, describiendo qué ocurrió, qué datos se vieron involucrados y qué medidas adoptamos. Como Responsable de la Base de Datos, te corresponde evaluar si el incidente debe comunicarse a los titulares de los datos o a la autoridad de control.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>11. Transferencias Internacionales</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Algunos de nuestros proveedores procesan datos fuera de Argentina o Venezuela. En esos casos adoptamos salvaguardas contractuales que garantizan un nivel de protección adecuado, conforme a lo exigido por la Ley 25.326.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>12. Derechos de los Titulares (ARCO)</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Toda persona puede ejercer sus derechos de <strong>acceso, rectificación, actualización y supresión</strong> de sus datos. Para datos de pacientes, la solicitud se canaliza a través del profesional responsable. En Argentina, el titular puede además reclamar ante la <strong>Agencia de Acceso a la Información Pública (AAIP)</strong>.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>13. Menores de Edad</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Cuando el paciente sea menor de edad, el consentimiento para el tratamiento de sus datos debe ser otorgado por su madre, padre o representante legal.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>14. Venezuela y Otros Países</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Para usuarios en Venezuela, donde no existe una ley integral de protección de datos equivalente, aplicamos la protección constitucional del habeas data y la normativa sanitaria sobre la historia clínica, adoptando como estándar de referencia las buenas prácticas internacionales.
        </p>

        <h2 style={{ fontSize: 20, color: '#fff', fontWeight: 700, marginTop: 32, marginBottom: 12 }}>15. Contacto y Soporte</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Para consultas sobre esta política, para solicitar la baja de tu cuenta o para ejercer derechos bajo la Ley 25.326, escribinos a: <strong>soporte@dentaldesk.app</strong>.
        </p>

      </div>
    </div>
  )
}
