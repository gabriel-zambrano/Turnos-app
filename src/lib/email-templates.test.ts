import { describe, it, expect } from 'vitest'
import { generarEmailConfirmacionHtml, generarEmailRecordatorioHtml } from './email-templates'

describe('generarEmailConfirmacionHtml', () => {
  it('genera el HTML con diseño ticket premium, colores del consultorio, checklist y footer oscuro', () => {
    const html = generarEmailConfirmacionHtml({
      nombrePaciente: 'Gabriel Zambrano',
      fecha: '24 de Octubre de 2026',
      hora: '14:30',
      tratamiento: 'Limpieza Dental',
      duracionMinutos: 45,
      clinicaNombre: 'Consultorio Dental Benegas',
      clinicaDireccion: 'Av. Corrientes 1234, CABA',
      clinicaTelefono: '11-4567-8900',
      primaryColor: '#0F4C5C',
      googleCalendarUrl: 'https://calendar.google.com/test',
      icsCalendarUrl: 'https://clinica.test/api/ics?test',
      portalUrl: 'https://clinica.test/paciente/tok123',
      notas: 'Traer cepillo habitual',
    })

    expect(html).toContain('¡Hola, Gabriel! 👋')
    expect(html).toContain('Consultorio Dental Benegas')
    expect(html).toContain('TURNO CONFIRMADO')
    expect(html).toContain('Limpieza Dental')
    expect(html).toContain('14:30')
    expect(html).toContain('24 de Octubre de 2026')
    expect(html).toContain('Av. Corrientes 1234, CABA')
    expect(html).toContain('Cómo llegar →')
    expect(html).toContain('Ver mi turno en el portal →')
    expect(html).toContain('https://clinica.test/paciente/tok123')
    expect(html).toContain('Traer cepillo habitual')
    expect(html).toContain('ANTES DE TU VISITA')
    expect(html).toContain('#0F172A') // Footer oscuro
    expect(html).toContain('#0F4C5C') // Color primario de la clínica
  })

  it('soporta fecha ISO y formatea día de la semana', () => {
    const html = generarEmailConfirmacionHtml({
      nombrePaciente: 'Gabriel',
      fecha: '2026-10-02',
      hora: '12:40',
      tratamiento: 'Ajuste de ortodoncia',
      clinicaNombre: 'Dr. Walter Benegas',
      clinicaDireccion: 'Av. Santa Fe 3329 1 B',
    })

    expect(html).toContain('Viernes')
    expect(html).toContain('2 de octubre de 2026')
    expect(html).toContain('[12:40]')
    expect(html).toContain('Ajuste de ortodoncia')
    expect(html).toContain('Av. Santa Fe 3329 1 B')
  })

  it('escapa caracteres especiales para prevenir inyección HTML', () => {
    const html = generarEmailConfirmacionHtml({
      nombrePaciente: '<script>alert(1)</script>',
      fecha: '2026-10-24',
      hora: '10:00',
      tratamiento: 'Ortodoncia & Control',
      clinicaNombre: 'Clínica "Salud"',
    })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('Ortodoncia &amp; Control')
    expect(html).toContain('Clínica &quot;Salud&quot;')
  })
})

describe('generarEmailRecordatorioHtml', () => {
  it('genera el recordatorio con estilo ticket y color de la clínica', () => {
    const html = generarEmailRecordatorioHtml({
      nombrePaciente: 'Ana García',
      fechaHoraTexto: 'Mañana a las 11:00 hs',
      tratamiento: 'Blanqueamiento',
      clinicaNombre: 'Dental Studio',
      clinicaDireccion: 'Calle 50 #120',
      primaryColor: '#0F4C5C',
      enlaceTurno: 'https://clinica.test/t/ABC123XYZ',
    })

    expect(html).toContain('¡Hola, Ana! 👋')
    expect(html).toContain('RECORDATORIO DE TURNO')
    expect(html).toContain('Mañana a las 11:00 hs')
    expect(html).toContain('Blanqueamiento')
    expect(html).toContain('Confirmar asistencia y ver turno →')
    expect(html).toContain('https://clinica.test/t/ABC123XYZ')
    expect(html).toContain('#0F4C5C')
    expect(html).toContain('#0F172A') // Footer oscuro
  })
})
