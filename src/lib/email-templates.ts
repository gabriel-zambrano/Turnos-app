/**
 * Templates HTML de emails transaccionales para DentalDesk.
 *
 * Diseño Premium inspirado en los colores de identidad del consultorio:
 * - Header limpio y elegante con logo o isotipo y nombre del consultorio.
 * - Badge de estado "● TURNO CONFIRMADO" con tonalidad de la clínica.
 * - Tarjeta Ticket / Boarding Pass con troquelado punteado, tipografía monoespaciada para la hora y detalles de tratamiento y dirección con link a Google Maps.
 * - Botón de llamada a la acción principal con el color primario de la clínica.
 * - Enlaces directos de calendario (Google, Apple/iCal, Outlook) y opciones de gestión (Modificar / Cancelar).
 * - Pre-Flight Checklist ("ANTES DE TU VISITA") con recomendaciones de puntualidad e higiene.
 * - Footer oscuro (#0F172A) con datos del consultorio, links de privacidad y soporte.
 */

export interface EmailConfirmacionParams {
  nombrePaciente: string
  fecha: string // ej. "2026-10-02" o "24 de octubre de 2026"
  hora: string  // ej. "12:40"
  tratamiento: string
  duracionMinutos?: number
  clinicaNombre: string
  clinicaDireccion?: string
  clinicaTelefono?: string
  clinicaLogoUrl?: string
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  googleCalendarUrl?: string
  icsCalendarUrl?: string
  outlookCalendarUrl?: string
  portalUrl?: string
  notas?: string | null
}

export interface EmailRecordatorioParams {
  nombrePaciente: string
  fechaHoraTexto: string
  tratamiento: string
  clinicaNombre: string
  clinicaDireccion?: string
  clinicaTelefono?: string
  clinicaLogoUrl?: string
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  enlaceTurno?: string
}

export interface EmailPedidoReservaParams {
  nombrePaciente: string
  fechaHoraTexto: string
  tratamiento: string
  clinicaNombre: string
  clinicaDireccion?: string
  clinicaTelefono?: string
  clinicaLogoUrl?: string
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  portalUrl?: string
  senaMonto?: number | null
  senaDatosPago?: string | null
}

function escaparHtml(str?: string | null): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatearFechaLegible(fechaStr?: string | null): { diaSemana: string; fechaLegible: string; fechaCompleta: string } {
  if (!fechaStr) return { diaSemana: '', fechaLegible: '', fechaCompleta: '' }
  const str = fechaStr.trim()
  const matchIso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (matchIso) {
    const year = parseInt(matchIso[1], 10)
    const month = parseInt(matchIso[2], 10)
    const day = parseInt(matchIso[3], 10)
    const d = new Date(year, month - 1, day)
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const diaSemana = dias[d.getDay()] || ''
    const mesNombre = meses[month - 1] || ''
    const fechaLegible = `${day} de ${mesNombre} de ${year}`
    const fechaCompleta = `${diaSemana}, ${day} de ${mesNombre} de ${year}`
    return { diaSemana, fechaLegible, fechaCompleta }
  }

  return { diaSemana: '', fechaLegible: str, fechaCompleta: str }
}

export function generarEmailConfirmacionHtml(params: EmailConfirmacionParams): string {
  const nombre = escaparHtml(params.nombrePaciente || 'Paciente')
  const primerNombre = nombre.split(' ')[0]
  const clinica = escaparHtml(params.clinicaNombre || 'Consultorio Odontológico')
  const direccion = escaparHtml(params.clinicaDireccion || '')
  const telefono = escaparHtml(params.clinicaTelefono || '')
  const tratamiento = escaparHtml(params.tratamiento || 'Consulta Odontológica')
  const hora = escaparHtml(params.hora)
  const duracion = params.duracionMinutos ? `${params.duracionMinutos} min` : '20 min'
  const notas = params.notas ? escaparHtml(params.notas) : null
  const logoUrl = params.clinicaLogoUrl ? escaparHtml(params.clinicaLogoUrl) : ''

  // Colores del consultorio con fallback al sistema Deep Teal / Ocean Navy
  const primaryColor = params.primaryColor || '#0F4C5C'
  const accentColor = params.accentColor || '#138A6B'

  const { diaSemana, fechaLegible, fechaCompleta } = formatearFechaLegible(params.fecha)

  const enlacePrincipal = params.portalUrl || params.googleCalendarUrl || ''
  const textoBoton = params.portalUrl ? 'Ver mi turno en el portal →' : 'Agregar a mi calendario →'
  const portalUrl = params.portalUrl ? escaparHtml(params.portalUrl) : ''

  const mapsUrl = direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.clinicaDireccion || '')}`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Turno Confirmado — ${clinica}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-container { max-width: 560px; width: 100%; margin: 0 auto; }
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 16px 8px !important; }
      .email-card-header { padding: 24px 18px 20px !important; }
      .email-card-body { padding: 22px 16px 20px !important; }
      .ticket-pad { padding: 18px 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; color: #0A2540; -webkit-font-smoothing: antialiased;">
  <div class="email-wrapper" style="background-color: #F8FAFC; padding: 36px 12px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" class="email-container" style="max-width: 560px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 10px 30px rgba(10, 37, 64, 0.05);">
      
      <!-- HEADER CON LOGO Y NOMBRE DE CLÍNICA -->
      <tr>
        <td class="email-card-header" style="padding: 30px 28px 24px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #F1F5F9;">
          ${logoUrl ? `
          <div style="margin-bottom: 12px;">
            <img src="${logoUrl}" alt="${clinica}" style="max-height: 48px; max-width: 170px; height: auto; display: inline-block; vertical-align: middle;" />
          </div>
          ` : `
          <div style="display: inline-block; width: 44px; height: 44px; border-radius: 12px; background: ${primaryColor}14; border: 1.5px solid ${primaryColor}30; text-align: center; line-height: 44px; font-size: 20px; margin-bottom: 10px;">
            🦷
          </div>
          `}
          <div style="font-size: 19px; font-weight: 800; color: #0A2540; letter-spacing: -0.02em; margin-bottom: 3px;">
            ${clinica}
          </div>
          <div style="font-size: 12.5px; color: #64748B; font-weight: 500;">
            ${clinica} · Consultorio Odontológico
          </div>
        </td>
      </tr>

      <!-- CUERPO PRINCIPAL -->
      <tr>
        <td class="email-card-body" style="padding: 28px 28px 24px; background-color: #ffffff;">
          
          <!-- BADGE: TURNO CONFIRMADO -->
          <div style="display: inline-block; background-color: ${primaryColor}12; border: 1px solid ${primaryColor}28; border-radius: 20px; padding: 4px 12px; margin-bottom: 16px;">
            <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background-color: ${primaryColor}; vertical-align: middle; margin-right: 6px;"></span>
            <span style="font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: ${primaryColor}; vertical-align: middle;">TURNO CONFIRMADO</span>
          </div>

          <!-- SALUDO Y MENSAJE -->
          <div style="font-size: 22px; font-weight: 800; color: #0A2540; letter-spacing: -0.02em; margin-bottom: 8px; line-height: 1.3;">
            ¡Hola, ${primerNombre}! 👋
          </div>
          <div style="font-size: 17px; font-weight: 700; color: #0A2540; margin-bottom: 8px;">
            Tu turno está confirmado 🦷
          </div>
          <p style="margin: 0 0 24px; font-size: 14.5px; line-height: 1.55; color: #475569;">
            Tu turno de <strong>${tratamiento}</strong> está confirmado. Hemos reservado este espacio para tu consulta y te esperamos para brindarte la mejor atención.
          </p>

          <!-- TICKET DEL TURNO (ESTILO BOARDING PASS / APPLE WALLET) -->
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; margin-bottom: 24px; overflow: hidden;">
            <tr>
              <td class="ticket-pad" style="padding: 22px 20px;">
                
                <!-- FILA 1: FECHA Y HORARIO -->
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td valign="top" style="width: 58%; text-align: left;">
                      <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                        FECHA
                      </div>
                      <div style="font-size: 15.5px; font-weight: 800; color: #0A2540; line-height: 1.3;">
                        ${diaSemana ? `${diaSemana}<br><span style="font-size: 13.5px; font-weight: 600; color: #475569;">${fechaLegible}</span>` : fechaLegible}
                      </div>
                    </td>
                    <td valign="top" style="width: 42%; text-align: right;">
                      <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                        HORARIO
                      </div>
                      <div style="display: inline-block; background-color: #ffffff; border: 1.5px solid ${primaryColor}35; border-radius: 8px; padding: 4px 10px; box-shadow: 0 2px 6px rgba(10, 37, 64, 0.04);">
                        <span style="font-family: 'JetBrains Mono', 'Courier New', Courier, monospace; font-size: 16px; font-weight: 800; color: ${primaryColor}; letter-spacing: -0.02em;">
                          [${hora}]
                        </span>
                        <span style="font-size: 12px; font-weight: 700; color: #475569; margin-left: 2px;">hs</span>
                      </div>
                      <div style="font-size: 11.5px; color: #64748B; font-weight: 600; margin-top: 3px;">
                        ${duracion}
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- DIVIDER TROQUELADO -->
                <div style="border-top: 1px dashed #CBD5E1; margin: 16px 0; height: 1px;"></div>

                <!-- FILA 2: TRATAMIENTO -->
                <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                  TRATAMIENTO
                </div>
                <div style="font-size: 15px; font-weight: 700; color: #0A2540;">
                  ${tratamiento}
                </div>
                ${notas ? `
                <div style="font-size: 12.5px; color: #64748B; margin-top: 4px;">
                  • Indicaciones: ${notas}
                </div>
                ` : ''}

                ${direccion ? `
                <!-- DIVIDER TROQUELADO -->
                <div style="border-top: 1px dashed #CBD5E1; margin: 16px 0; height: 1px;"></div>

                <!-- FILA 3: LUGAR -->
                <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                  LUGAR
                </div>
                <div style="font-size: 14px; font-weight: 600; color: #0A2540; line-height: 1.4;">
                  ${direccion}
                </div>
                ${mapsUrl ? `
                <div style="margin-top: 4px;">
                  <a href="${mapsUrl}" target="_blank" style="color: ${primaryColor}; font-size: 12.5px; font-weight: 700; text-decoration: underline;">
                    Cómo llegar →
                  </a>
                </div>
                ` : ''}
                ` : ''}

              </td>
            </tr>
          </table>

          <!-- BOTÓN PRINCIPAL CON COLOR DEL CONSULTORIO -->
          ${enlacePrincipal ? `
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td align="center">
                <a href="${enlacePrincipal}" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: ${primaryColor}; color: #ffffff; text-align: center; padding: 14px 22px; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.01em; box-shadow: 0 4px 14px ${primaryColor}30;">
                  ${textoBoton}
                </a>
              </td>
            </tr>
          </table>

          <!-- ENLACE DIRECTO DE RESPALDO -->
          <div style="text-align: center; margin-bottom: 22px; font-size: 12px; color: #64748B; line-height: 1.5;">
            O copiá este link: <br>
            <a href="${enlacePrincipal}" target="_blank" style="color: ${primaryColor}; text-decoration: underline; word-break: break-all; font-weight: 500;">
              ${enlacePrincipal}
            </a>
          </div>
          ` : ''}

          <!-- ACCIONES SECUNDARIAS: AGENDAR / MODIFICAR / CANCELAR -->
          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px 14px; text-align: center; font-size: 12.5px; color: #475569; margin-bottom: 24px;">
            <span style="font-weight: 700; color: #0A2540;">📅 Agendar:</span>
            ${params.googleCalendarUrl ? `<a href="${escaparHtml(params.googleCalendarUrl)}" target="_blank" style="color: ${primaryColor}; text-decoration: underline; font-weight: 600; margin: 0 5px;">Google</a>` : ''}
            ${params.icsCalendarUrl ? `<span style="color: #CBD5E1;">·</span> <a href="${escaparHtml(params.icsCalendarUrl)}" target="_blank" style="color: ${primaryColor}; text-decoration: underline; font-weight: 600; margin: 0 5px;">Apple / iCal</a>` : ''}
            ${params.outlookCalendarUrl ? `<span style="color: #CBD5E1;">·</span> <a href="${escaparHtml(params.outlookCalendarUrl)}" target="_blank" style="color: ${primaryColor}; text-decoration: underline; font-weight: 600; margin: 0 5px;">Outlook</a>` : ''}
            ${portalUrl ? `
            <span style="color: #CBD5E1; margin: 0 6px;">|</span>
            <a href="${portalUrl}" target="_blank" style="color: #64748B; text-decoration: underline; font-weight: 600;">Modificar o Cancelar</a>
            ` : ''}
          </div>

          <!-- CHECKLIST: ANTES DE TU VISITA -->
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #F0FDF4; border: 1px solid #DCFCE7; border-radius: 14px; margin-bottom: 12px;">
            <tr>
              <td style="padding: 18px 20px;">
                <div style="font-size: 11.5px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 12px;">
                  ANTES DE TU VISITA
                </div>
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td valign="top" style="width: 24px; font-size: 16px; line-height: 1.5;">⏱️</td>
                    <td style="padding-bottom: 8px; font-size: 13px; line-height: 1.5; color: #14532D;">
                      <strong>Presentate 10 min antes:</strong> Para realizar tu recepción y check-in con tranquilidad.
                    </td>
                  </tr>
                  <tr>
                    <td valign="top" style="width: 24px; font-size: 16px; line-height: 1.5;">📱</td>
                    <td style="padding-bottom: 8px; font-size: 13px; line-height: 1.5; color: #14532D;">
                      <strong>Recordatorio previo:</strong> Te avisaremos con anticipación por WhatsApp o email.
                    </td>
                  </tr>
                  <tr>
                    <td valign="top" style="width: 24px; font-size: 16px; line-height: 1.5;">🦷</td>
                    <td style="font-size: 13px; line-height: 1.5; color: #14532D;">
                      <strong>Cuidado previo:</strong> Recomendamos cepillado previo y evitar comer 2 horas antes de tu consulta.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <!-- FOOTER OSCURO CON DATOS DEL CONSULTORIO -->
      <tr>
        <td style="background-color: #0F172A; padding: 28px 24px 26px; text-align: center; border-radius: 0 0 20px 20px;">
          <div style="font-size: 13.5px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">
            Consultorio · ${clinica}
          </div>
          ${direccion ? `
          <div style="font-size: 12px; color: #94A3B8; margin-bottom: 12px;">
            ${direccion} ${telefono ? `· Tel: ${telefono}` : ''}
          </div>
          ` : ''}
          <div style="font-size: 12px; color: #64748B;">
            ${portalUrl ? `<a href="${portalUrl}" target="_blank" style="color: #94A3B8; text-decoration: underline; margin: 0 6px;">Portal del Paciente</a> · ` : ''}
            <a href="${portalUrl ? `${portalUrl}` : 'https://dentaldesk.com.ar'}" target="_blank" style="color: #94A3B8; text-decoration: underline; margin: 0 6px;">Privacidad</a> · 
            <a href="mailto:${escaparHtml(telefono ? '' : '') || 'ayuda@dentaldesk.com.ar'}" style="color: #94A3B8; text-decoration: underline; margin: 0 6px;">Ayuda</a>
          </div>
          <div style="font-size: 11px; color: #475569; margin-top: 14px; line-height: 1.45;">
            Mensaje de confirmación automático de cita odontológica. Si necesitás cancelar o reprogramar, podés hacerlo desde el portal o contactando al consultorio.
          </div>
        </td>
      </tr>

    </table>
  </div>
</body>
</html>`
}

export function generarEmailRecordatorioHtml(params: EmailRecordatorioParams): string {
  const nombre = escaparHtml(params.nombrePaciente || 'Paciente')
  const primerNombre = nombre.split(' ')[0]
  const clinica = escaparHtml(params.clinicaNombre || 'Consultorio Odontológico')
  const direccion = escaparHtml(params.clinicaDireccion || '')
  const telefono = escaparHtml(params.clinicaTelefono || '')
  const tratamiento = escaparHtml(params.tratamiento || 'Consulta Odontológica')
  const fechaHora = escaparHtml(params.fechaHoraTexto)
  const enlace = params.enlaceTurno ? escaparHtml(params.enlaceTurno) : ''
  const logoUrl = params.clinicaLogoUrl ? escaparHtml(params.clinicaLogoUrl) : ''

  const primaryColor = params.primaryColor || '#0F4C5C'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recordatorio de Turno — ${clinica}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-container { max-width: 560px; width: 100%; margin: 0 auto; }
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 16px 8px !important; }
      .email-card-header { padding: 24px 18px 20px !important; }
      .email-card-body { padding: 22px 16px 20px !important; }
      .ticket-pad { padding: 18px 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; color: #0A2540; -webkit-font-smoothing: antialiased;">
  <div class="email-wrapper" style="background-color: #F8FAFC; padding: 36px 12px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" class="email-container" style="max-width: 560px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 10px 30px rgba(10, 37, 64, 0.05);">
      
      <!-- HEADER CON LOGO Y NOMBRE DE CLÍNICA -->
      <tr>
        <td class="email-card-header" style="padding: 30px 28px 24px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #F1F5F9;">
          ${logoUrl ? `
          <div style="margin-bottom: 12px;">
            <img src="${logoUrl}" alt="${clinica}" style="max-height: 48px; max-width: 170px; height: auto; display: inline-block; vertical-align: middle;" />
          </div>
          ` : `
          <div style="display: inline-block; width: 44px; height: 44px; border-radius: 12px; background: ${primaryColor}14; border: 1.5px solid ${primaryColor}30; text-align: center; line-height: 44px; font-size: 20px; margin-bottom: 10px;">
            🗓️
          </div>
          `}
          <div style="font-size: 19px; font-weight: 800; color: #0A2540; letter-spacing: -0.02em; margin-bottom: 3px;">
            ${clinica}
          </div>
          <div style="font-size: 12.5px; color: #64748B; font-weight: 500;">
            ${clinica} · Consultorio Odontológico
          </div>
        </td>
      </tr>

      <!-- CUERPO PRINCIPAL -->
      <tr>
        <td class="email-card-body" style="padding: 28px 28px 24px; background-color: #ffffff;">
          
          <!-- BADGE: RECORDATORIO DE TURNO -->
          <div style="display: inline-block; background-color: ${primaryColor}12; border: 1px solid ${primaryColor}28; border-radius: 20px; padding: 4px 12px; margin-bottom: 16px;">
            <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background-color: ${primaryColor}; vertical-align: middle; margin-right: 6px;"></span>
            <span style="font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: ${primaryColor}; vertical-align: middle;">RECORDATORIO DE TURNO</span>
          </div>

          <!-- SALUDO Y MENSAJE -->
          <div style="font-size: 22px; font-weight: 800; color: #0A2540; letter-spacing: -0.02em; margin-bottom: 8px; line-height: 1.3;">
            ¡Hola, ${primerNombre}! 👋
          </div>
          <div style="font-size: 17px; font-weight: 700; color: #0A2540; margin-bottom: 8px;">
            Recordatorio de tu turno 🗓️
          </div>
          <p style="margin: 0 0 24px; font-size: 14.5px; line-height: 1.55; color: #475569;">
            Te recordamos que tenés una cita programada para <strong>${tratamiento}</strong> en <strong>${clinica}</strong>.
          </p>

          <!-- TICKET DEL TURNO -->
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; margin-bottom: 24px; overflow: hidden;">
            <tr>
              <td class="ticket-pad" style="padding: 22px 20px;">
                
                <!-- FILA 1: FECHA Y HORARIO -->
                <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                  FECHA Y HORARIO
                </div>
                <div style="font-size: 16px; font-weight: 800; color: #0A2540; margin-bottom: 12px;">
                  ${fechaHora}
                </div>

                <!-- DIVIDER TROQUELADO -->
                <div style="border-top: 1px dashed #CBD5E1; margin: 14px 0; height: 1px;"></div>

                <!-- FILA 2: TRATAMIENTO -->
                <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                  TRATAMIENTO
                </div>
                <div style="font-size: 15px; font-weight: 700; color: #0A2540;">
                  ${tratamiento}
                </div>

                ${direccion ? `
                <!-- DIVIDER TROQUELADO -->
                <div style="border-top: 1px dashed #CBD5E1; margin: 14px 0; height: 1px;"></div>

                <!-- FILA 3: LUGAR -->
                <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                  LUGAR
                </div>
                <div style="font-size: 14px; font-weight: 600; color: #0A2540; line-height: 1.4;">
                  ${direccion}
                </div>
                ` : ''}

              </td>
            </tr>
          </table>

          <!-- BOTÓN PRINCIPAL -->
          ${enlace ? `
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td align="center">
                <a href="${enlace}" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: ${primaryColor}; color: #ffffff; text-align: center; padding: 14px 22px; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.01em; box-shadow: 0 4px 14px ${primaryColor}30;">
                  Confirmar asistencia y ver turno →
                </a>
              </td>
            </tr>
          </table>

          <!-- ENLACE DIRECTO DE RESPALDO -->
          <div style="text-align: center; margin-bottom: 22px; font-size: 12px; color: #64748B; line-height: 1.5;">
            O copiá este link: <br>
            <a href="${enlace}" target="_blank" style="color: ${primaryColor}; text-decoration: underline; word-break: break-all; font-weight: 500;">
              ${enlace}
            </a>
          </div>
          ` : ''}

          <!-- CHECKLIST: ANTES DE TU VISITA -->
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #F0FDF4; border: 1px solid #DCFCE7; border-radius: 14px; margin-bottom: 12px;">
            <tr>
              <td style="padding: 18px 20px;">
                <div style="font-size: 11.5px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 12px;">
                  RECORDATORIO ANTES DE TU VISITA
                </div>
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td valign="top" style="width: 24px; font-size: 16px; line-height: 1.5;">⏱️</td>
                    <td style="padding-bottom: 8px; font-size: 13px; line-height: 1.5; color: #14532D;">
                      <strong>Presentate 10 min antes:</strong> Te sugerimos presentarte unos minutos antes para anunciarte.
                    </td>
                  </tr>
                  <tr>
                    <td valign="top" style="width: 24px; font-size: 16px; line-height: 1.5;">🦷</td>
                    <td style="font-size: 13px; line-height: 1.5; color: #14532D;">
                      <strong>Higiene previa:</strong> Realizá tu cepillado habitual antes de ingresar a la consulta.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <!-- FOOTER OSCURO -->
      <tr>
        <td style="background-color: #0F172A; padding: 28px 24px 26px; text-align: center; border-radius: 0 0 20px 20px;">
          <div style="font-size: 13.5px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">
            Consultorio · ${clinica}
          </div>
          ${direccion ? `
          <div style="font-size: 12px; color: #94A3B8; margin-bottom: 12px;">
            ${direccion} ${telefono ? `· Tel: ${telefono}` : ''}
          </div>
          ` : ''}
          <div style="font-size: 11px; color: #475569; margin-top: 14px; line-height: 1.45;">
            Si necesitás cancelar o reprogramar, podés hacerlo desde tu portal o comunicándote con el consultorio.
          </div>
        </td>
      </tr>

    </table>
  </div>
</body>
</html>`
}

export function generarEmailPedidoReservaHtml(params: EmailPedidoReservaParams): string {
  const nombre = escaparHtml(params.nombrePaciente || 'Paciente')
  const primerNombre = nombre.split(' ')[0]
  const clinica = escaparHtml(params.clinicaNombre || 'Consultorio Odontológico')
  const direccion = escaparHtml(params.clinicaDireccion || '')
  const telefono = escaparHtml(params.clinicaTelefono || '')
  const tratamiento = escaparHtml(params.tratamiento || 'Consulta Odontológica')
  const fechaHora = escaparHtml(params.fechaHoraTexto)
  const portalUrl = params.portalUrl ? escaparHtml(params.portalUrl) : ''
  const logoUrl = params.clinicaLogoUrl ? escaparHtml(params.clinicaLogoUrl) : ''

  const primaryColor = params.primaryColor || '#0F4C5C'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pedido de Turno Recibido — ${clinica}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-container { max-width: 560px; width: 100%; margin: 0 auto; }
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 16px 8px !important; }
      .email-card-header { padding: 24px 18px 20px !important; }
      .email-card-body { padding: 22px 16px 20px !important; }
      .ticket-pad { padding: 18px 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; color: #0A2540; -webkit-font-smoothing: antialiased;">
  <div class="email-wrapper" style="background-color: #F8FAFC; padding: 36px 12px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" class="email-container" style="max-width: 560px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 10px 30px rgba(10, 37, 64, 0.05);">
      
      <!-- HEADER CON LOGO Y NOMBRE DE CLÍNICA -->
      <tr>
        <td class="email-card-header" style="padding: 30px 28px 24px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #F1F5F9;">
          ${logoUrl ? `
          <div style="margin-bottom: 12px;">
            <img src="${logoUrl}" alt="${clinica}" style="max-height: 48px; max-width: 170px; height: auto; display: inline-block; vertical-align: middle;" />
          </div>
          ` : `
          <div style="display: inline-block; width: 44px; height: 44px; border-radius: 12px; background: ${primaryColor}14; border: 1.5px solid ${primaryColor}30; text-align: center; line-height: 44px; font-size: 20px; margin-bottom: 10px;">
            🌿
          </div>
          `}
          <div style="font-size: 19px; font-weight: 800; color: #0A2540; letter-spacing: -0.02em; margin-bottom: 3px;">
            ${clinica}
          </div>
          <div style="font-size: 12.5px; color: #64748B; font-weight: 500;">
            ${clinica} · Solicitud de Turno
          </div>
        </td>
      </tr>

      <!-- CUERPO PRINCIPAL -->
      <tr>
        <td class="email-card-body" style="padding: 28px 28px 24px; background-color: #ffffff;">
          
          <!-- BADGE: SOLICITUD DE TURNO -->
          <div style="display: inline-block; background-color: ${primaryColor}12; border: 1px solid ${primaryColor}28; border-radius: 20px; padding: 4px 12px; margin-bottom: 16px;">
            <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background-color: ${primaryColor}; vertical-align: middle; margin-right: 6px;"></span>
            <span style="font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: ${primaryColor}; vertical-align: middle;">SOLICITUD EN REVISIÓN</span>
          </div>

          <!-- SALUDO Y MENSAJE -->
          <div style="font-size: 22px; font-weight: 800; color: #0A2540; letter-spacing: -0.02em; margin-bottom: 8px; line-height: 1.3;">
            ¡Hola, ${primerNombre}! 👋
          </div>
          <div style="font-size: 17px; font-weight: 700; color: #0A2540; margin-bottom: 8px;">
            Recibimos tu solicitud de turno 🌿
          </div>
          <p style="margin: 0 0 24px; font-size: 14.5px; line-height: 1.55; color: #475569;">
            Tomamos tu pedido para <strong>${tratamiento}</strong>. El equipo de <strong>${clinica}</strong> revisará los horarios y te confirmará a la brevedad.
          </p>

          <!-- TICKET DE LA SOLICITUD -->
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; margin-bottom: 24px; overflow: hidden;">
            <tr>
              <td class="ticket-pad" style="padding: 22px 20px;">
                
                <!-- FILA 1: HORARIO SOLICITADO -->
                <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                  TURNO SOLICITADO
                </div>
                <div style="font-size: 16px; font-weight: 800; color: #0A2540; margin-bottom: 12px;">
                  ${fechaHora}
                </div>

                <!-- DIVIDER TROQUELADO -->
                <div style="border-top: 1px dashed #CBD5E1; margin: 14px 0; height: 1px;"></div>

                <!-- FILA 2: TRATAMIENTO -->
                <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                  TRATAMIENTO
                </div>
                <div style="font-size: 15px; font-weight: 700; color: #0A2540;">
                  ${tratamiento}
                </div>

                ${direccion ? `
                <!-- DIVIDER TROQUELADO -->
                <div style="border-top: 1px dashed #CBD5E1; margin: 14px 0; height: 1px;"></div>

                <!-- FILA 3: LUGAR -->
                <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                  LUGAR
                </div>
                <div style="font-size: 14px; font-weight: 600; color: #0A2540; line-height: 1.4;">
                  ${direccion}
                </div>
                ` : ''}

                ${params.senaMonto && params.senaMonto > 0 ? `
                <!-- DIVIDER TROQUELADO -->
                <div style="border-top: 1px dashed #CBD5E1; margin: 14px 0; height: 1px;"></div>

                <!-- SEÑA -->
                <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; color: #64748B; margin-bottom: 4px;">
                  SEÑA REQUERIDA
                </div>
                <div style="font-size: 15px; font-weight: 700; color: ${primaryColor};">
                  $${params.senaMonto.toLocaleString('es-AR')}
                </div>
                ${params.senaDatosPago ? `
                <div style="font-size: 12.5px; color: #475569; margin-top: 4px; line-height: 1.4;">
                  ${escaparHtml(params.senaDatosPago)}
                </div>
                ` : ''}
                ` : ''}

              </td>
            </tr>
          </table>

          <!-- BOTÓN PRINCIPAL -->
          ${portalUrl ? `
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td align="center">
                <a href="${portalUrl}" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: ${primaryColor}; color: #ffffff; text-align: center; padding: 14px 22px; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.01em; box-shadow: 0 4px 14px ${primaryColor}30;">
                  Ver mi portal de paciente →
                </a>
              </td>
            </tr>
          </table>

          <!-- ENLACE DIRECTO DE RESPALDO -->
          <div style="text-align: center; margin-bottom: 22px; font-size: 12px; color: #64748B; line-height: 1.5;">
            O copiá este link: <br>
            <a href="${portalUrl}" target="_blank" style="color: ${primaryColor}; text-decoration: underline; word-break: break-all; font-weight: 500;">
              ${portalUrl}
            </a>
          </div>
          ` : ''}

        </td>
      </tr>

      <!-- FOOTER OSCURO -->
      <tr>
        <td style="background-color: #0F172A; padding: 28px 24px 26px; text-align: center; border-radius: 0 0 20px 20px;">
          <div style="font-size: 13.5px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">
            Consultorio · ${clinica}
          </div>
          ${direccion ? `
          <div style="font-size: 12px; color: #94A3B8; margin-bottom: 12px;">
            ${direccion} ${telefono ? `· Tel: ${telefono}` : ''}
          </div>
          ` : ''}
          <div style="font-size: 11px; color: #475569; margin-top: 14px; line-height: 1.45;">
            Este turno aún no está confirmado. Te enviaremos un correo apenas sea aprobado por el consultorio.
          </div>
        </td>
      </tr>

    </table>
  </div>
</body>
</html>`
}
