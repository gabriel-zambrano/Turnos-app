import { describe, it, expect } from 'vitest'
import { generarEmailConfirmacionHtml, generarEmailRecordatorioHtml } from './email-templates'

describe('generarEmailConfirmacionHtml', () => {
  it('genera el HTML con los datos principales, pre-flight checklist y enlaces', () => {
    const html = generarEmailConfirmacionHtml({
      nombrePaciente: 'Juan Pérez',
      fecha: '24 de Octubre de 2026',
      hora: '14:30',
      tratamiento: 'Limpieza Dental',
      duracionMinutos: 45,
      clinicaNombre: 'Clínica Odontológica Central',
      clinicaDireccion: 'Av. Corrientes 1234, CABA',
      clinicaTelefono: '11-4567-8900',
      googleCalendarUrl: 'https://calendar.google.com/test',
      icsCalendarUrl: 'https://clinica.test/api/ics?test',
      portalUrl: 'https://clinica.test/paciente/tok123',
      notas: 'Traer cepillo habitual',
    })

    expect(html).toContain('Todo listo, Juan. Tu turno está confirmado.')
    expect(html).toContain('Clínica Odontológica Central')
    expect(html).toContain('Limpieza Dental')
    expect(html).toContain('14:30 hs')
    expect(html).toContain('24 de Octubre de 2026')
    expect(html).toContain('Av. Corrientes 1234, CABA')
    expect(html).toContain('Pre-Flight Checklist para tu visita')
    expect(html).toContain('https://calendar.google.com/test')
    expect(html).toContain('https://clinica.test/paciente/tok123')
    expect(html).toContain('Traer cepillo habitual')
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
  it('genera el recordatorio con CTA al turno', () => {
    const html = generarEmailRecordatorioHtml({
      nombrePaciente: 'Ana García',
      fechaHoraTexto: 'Mañana a las 11:00 hs',
      tratamiento: 'Blanqueamiento',
      clinicaNombre: 'Dental Studio',
      clinicaDireccion: 'Calle 50 #120',
      enlaceTurno: 'https://clinica.test/t/ABC123XYZ',
    })

    expect(html).toContain('Recordatorio de tu turno')
    expect(html).toContain('Hola <strong>Ana</strong>')
    expect(html).toContain('Mañana a las 11:00 hs')
    expect(html).toContain('Blanqueamiento')
    expect(html).toContain('https://clinica.test/t/ABC123XYZ')
  })
})
