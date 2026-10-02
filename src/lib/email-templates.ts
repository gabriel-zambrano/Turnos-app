/**
 * Templates HTML de emails transaccionales para DentalDesk.
 *
 * Inspirado en el diseño limpio y cálido:
 * - Tarjeta única contenida con esquinas redondeadas (20px).
 * - Encabezado superior sólido en verde bosque/oliva (#455A47) con saludo personalizado.
 * - Cuerpo blanco con tipografía clara y jerarquía directa.
 * - Caja de detalles suave (#F4F5F1) con viñetas destacadas.
 * - Botón de llamada a la acción principal con el mismo color del encabezado (#455A47).
 * - Enlace directo de respaldo ("O copiá este link...").
 * - Opciones sutiles de calendario (Google, Apple, Outlook).
 */

export interface EmailConfirmacionParams {
  nombrePaciente: string
  fecha: string // ej. "2026-10-24" o "24 de octubre"
  hora: string  // ej. "14:30"
  tratamiento: string
  duracionMinutos?: number
  clinicaNombre: string
  clinicaDireccion?: string
  clinicaTelefono?: string
  clinicaLogoUrl?: string
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
  clinicaLogoUrl?: string
  enlaceTurno?: string
}

export interface EmailPedidoReservaParams {
  nombrePaciente: string
  fechaHoraTexto: string
  tratamiento: string
  clinicaNombre: string
  clinicaDireccion?: string
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

export function generarEmailConfirmacionHtml(params: EmailConfirmacionParams): string {
  const nombre = escaparHtml(params.nombrePaciente || 'Paciente')
  const primerNombre = nombre.split(' ')[0]
  const clinica = escaparHtml(params.clinicaNombre || 'Consultorio Odontológico')
  const direccion = escaparHtml(params.clinicaDireccion || '')
  const tratamiento = escaparHtml(params.tratamiento || 'Consulta Odontológica')
  const fecha = escaparHtml(params.fecha)
  const hora = escaparHtml(params.hora)
  const duracion = params.duracionMinutos ? `${params.duracionMinutos} min` : '30 min'
  const notas = params.notas ? escaparHtml(params.notas) : null

  const enlacePrincipal = params.portalUrl || params.googleCalendarUrl || ''
  const textoBoton = params.portalUrl ? 'Ver mi turno en el portal →' : 'Agregar a mi calendario →'

  const mapsUrl = direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.clinicaDireccion || '')}`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tu turno está confirmado — ${clinica}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAFBF9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-container { max-width: 500px; width: 100%; margin: 0 auto; }
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 16px 10px !important; }
      .email-card-header { padding: 26px 18px 22px !important; }
      .email-card-body { padding: 24px 18px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #FAFBF9; color: #222E25; -webkit-font-smoothing: antialiased;">
  <div class="email-wrapper" style="background-color: #FAFBF9; padding: 36px 14px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" class="email-container" style="max-width: 500px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #EAECE7; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);">
      
      <!-- ENCABEZADO VERDE CON SALUDO -->
      <tr>
        <td class="email-card-header" style="background-color: #455A47; padding: 30px 24px 26px; text-align: center; border-radius: 20px 20px 0 0;">
          <div style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.01em; margin-bottom: 5px;">
            ¡Hola, ${primerNombre}! 👋
          </div>
          <div style="font-size: 13.5px; color: rgba(255, 255, 255, 0.85); font-weight: 400;">
            ${clinica} · Consultorio Odontológico
          </div>
        </td>
      </tr>

      <!-- CUERPO DE LA TARJETA -->
      <tr>
        <td class="email-card-body" style="padding: 30px 26px 30px; background: #ffffff;">
          
          <div style="font-size: 18px; font-weight: 700; color: #222E25; margin-bottom: 12px;">
            Tu turno está confirmado 🦷
          </div>
          
          <p style="margin: 0 0 22px; font-size: 15px; line-height: 1.6; color: #57665B;">
            Hemos reservado este espacio para tu consulta de <strong>${tratamiento}</strong>. Te esperamos en el consultorio para brindarte la mejor atención.
          </p>

          <!-- CAJA DE DETALLES (CALLOUT SUAVE) -->
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #F4F5F1; border-radius: 14px; margin-bottom: 24px;">
            <tr>
              <td style="padding: 20px 22px;">
                <div style="font-size: 14.5px; font-weight: 700; color: #243026; margin-bottom: 12px;">
                  Detalles de tu cita
                </div>
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td style="padding-bottom: 9px; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Fecha y horario:</strong> ${fecha} a las ${hora} hs
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 9px; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Tratamiento:</strong> ${tratamiento} (${duracion})
                    </td>
                  </tr>
                  ${direccion ? `
                  <tr>
                    <td style="padding-bottom: 9px; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Lugar:</strong> ${direccion} ${mapsUrl ? `(<a href="${mapsUrl}" target="_blank" style="color: #455A47; font-weight: 600; text-decoration: underline;">Cómo llegar</a>)` : ''}
                    </td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding-bottom: ${notas ? '9px' : '0'}; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Puntualidad:</strong> Te sugerimos presentarte 10 minutos antes.
                    </td>
                  </tr>
                  ${notas ? `
                  <tr>
                    <td style="font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Indicaciones:</strong> ${notas}
                    </td>
                  </tr>
                  ` : ''}
                </table>
              </td>
            </tr>
          </table>

          <!-- BOTÓN PRINCIPAL VERDE -->
          ${enlacePrincipal ? `
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
            <tr>
              <td align="center">
                <a href="${enlacePrincipal}" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: #455A47; color: #ffffff; text-align: center; padding: 14px 20px; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.01em;">
                  ${textoBoton}
                </a>
              </td>
            </tr>
          </table>

          <!-- ENLACE DE COPIAR ABAJO -->
          <div style="text-align: center; margin-top: 14px; font-size: 12.5px; color: #7B8A7F; line-height: 1.5;">
            O copiá este link: <br>
            <a href="${enlacePrincipal}" target="_blank" style="color: #3B82F6; text-decoration: underline; word-break: break-all;">
              ${enlacePrincipal}
            </a>
          </div>
          ` : ''}

          <!-- CALENDARIO -->
          ${(params.googleCalendarUrl || params.icsCalendarUrl || params.outlookCalendarUrl) ? `
          <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #F0F2ED; text-align: center;">
            <div style="font-size: 12.5px; color: #7B8A7F; margin-bottom: 8px;">
              Guardar en tu calendario:
            </div>
            <div style="font-size: 13px; font-weight: 600;">
              ${params.googleCalendarUrl ? `<a href="${escaparHtml(params.googleCalendarUrl)}" target="_blank" style="color: #455A47; text-decoration: underline; margin: 0 6px;">Google Calendar</a>` : ''}
              ${params.icsCalendarUrl ? `<span style="color: #cbd5e1;">·</span> <a href="${escaparHtml(params.icsCalendarUrl)}" target="_blank" style="color: #455A47; text-decoration: underline; margin: 0 6px;">Apple / iCal</a>` : ''}
              ${params.outlookCalendarUrl ? `<span style="color: #cbd5e1;">·</span> <a href="${escaparHtml(params.outlookCalendarUrl)}" target="_blank" style="color: #455A47; text-decoration: underline; margin: 0 6px;">Outlook</a>` : ''}
            </div>
          </div>
          ` : ''}

        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding: 0 24px 28px; text-align: center; background: #ffffff;">
          <div style="font-size: 12px; color: #8D9B91; line-height: 1.5;">
            ${clinica} ${params.clinicaTelefono ? `· Tel: ${escaparHtml(params.clinicaTelefono)}` : ''}<br>
            Si necesitás cancelar o reprogramar, respondé este email o comunicate con la recepción.
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
  const tratamiento = escaparHtml(params.tratamiento || 'Consulta Odontológica')
  const fechaHora = escaparHtml(params.fechaHoraTexto)
  const enlace = params.enlaceTurno ? escaparHtml(params.enlaceTurno) : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recordatorio de Turno — ${clinica}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAFBF9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-container { max-width: 500px; width: 100%; margin: 0 auto; }
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 16px 10px !important; }
      .email-card-header { padding: 26px 18px 22px !important; }
      .email-card-body { padding: 24px 18px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #FAFBF9; color: #222E25; -webkit-font-smoothing: antialiased;">
  <div class="email-wrapper" style="background-color: #FAFBF9; padding: 36px 14px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" class="email-container" style="max-width: 500px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #EAECE7; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);">
      
      <!-- ENCABEZADO VERDE CON SALUDO -->
      <tr>
        <td class="email-card-header" style="background-color: #455A47; padding: 30px 24px 26px; text-align: center; border-radius: 20px 20px 0 0;">
          <div style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.01em; margin-bottom: 5px;">
            ¡Hola, ${primerNombre}! 👋
          </div>
          <div style="font-size: 13.5px; color: rgba(255, 255, 255, 0.85); font-weight: 400;">
            ${clinica} · Consultorio Odontológico
          </div>
        </td>
      </tr>

      <!-- CUERPO DE LA TARJETA -->
      <tr>
        <td class="email-card-body" style="padding: 30px 26px 30px; background: #ffffff;">
          
          <div style="font-size: 18px; font-weight: 700; color: #222E25; margin-bottom: 12px;">
            Recordatorio de tu turno 🗓️
          </div>
          
          <p style="margin: 0 0 22px; font-size: 15px; line-height: 1.6; color: #57665B;">
            Te recordamos que tenés una cita programada para <strong>${tratamiento}</strong> en <strong>${clinica}</strong>.
          </p>

          <!-- CAJA DE DETALLES (CALLOUT SUAVE) -->
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #F4F5F1; border-radius: 14px; margin-bottom: 24px;">
            <tr>
              <td style="padding: 20px 22px;">
                <div style="font-size: 14.5px; font-weight: 700; color: #243026; margin-bottom: 12px;">
                  Detalles de tu cita
                </div>
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td style="padding-bottom: 9px; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Fecha y horario:</strong> ${fechaHora}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 9px; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Tratamiento:</strong> ${tratamiento}
                    </td>
                  </tr>
                  ${direccion ? `
                  <tr>
                    <td style="padding-bottom: 9px; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Lugar:</strong> ${direccion}
                    </td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Puntualidad:</strong> Te sugerimos presentarte 10 minutos antes.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- BOTÓN PRINCIPAL VERDE -->
          ${enlace ? `
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
            <tr>
              <td align="center">
                <a href="${enlace}" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: #455A47; color: #ffffff; text-align: center; padding: 14px 20px; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.01em;">
                  Confirmar asistencia y ver turno →
                </a>
              </td>
            </tr>
          </table>

          <!-- ENLACE DE COPIAR ABAJO -->
          <div style="text-align: center; margin-top: 14px; font-size: 12.5px; color: #7B8A7F; line-height: 1.5;">
            O copiá este link: <br>
            <a href="${enlace}" target="_blank" style="color: #3B82F6; text-decoration: underline; word-break: break-all;">
              ${enlace}
            </a>
          </div>
          ` : ''}

        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding: 0 24px 28px; text-align: center; background: #ffffff;">
          <div style="font-size: 12px; color: #8D9B91; line-height: 1.5;">
            ${clinica}<br>
            Si necesitás cancelar o reprogramar, respondé este email o comunicate con el consultorio.
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
  const tratamiento = escaparHtml(params.tratamiento || 'Consulta Odontológica')
  const fechaHora = escaparHtml(params.fechaHoraTexto)
  const portalUrl = params.portalUrl ? escaparHtml(params.portalUrl) : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pedido de Turno Recibido — ${clinica}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #FAFBF9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-container { max-width: 500px; width: 100%; margin: 0 auto; }
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 16px 10px !important; }
      .email-card-header { padding: 26px 18px 22px !important; }
      .email-card-body { padding: 24px 18px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #FAFBF9; color: #222E25; -webkit-font-smoothing: antialiased;">
  <div class="email-wrapper" style="background-color: #FAFBF9; padding: 36px 14px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" class="email-container" style="max-width: 500px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #EAECE7; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);">
      
      <!-- ENCABEZADO VERDE CON SALUDO -->
      <tr>
        <td class="email-card-header" style="background-color: #455A47; padding: 30px 24px 26px; text-align: center; border-radius: 20px 20px 0 0;">
          <div style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.01em; margin-bottom: 5px;">
            ¡Hola, ${primerNombre}! 👋
          </div>
          <div style="font-size: 13.5px; color: rgba(255, 255, 255, 0.85); font-weight: 400;">
            ${clinica} · Solicitud de Turno
          </div>
        </td>
      </tr>

      <!-- CUERPO DE LA TARJETA -->
      <tr>
        <td class="email-card-body" style="padding: 30px 26px 30px; background: #ffffff;">
          
          <div style="font-size: 18px; font-weight: 700; color: #222E25; margin-bottom: 12px;">
            Recibimos tu solicitud de turno 🌿
          </div>
          
          <p style="margin: 0 0 22px; font-size: 15px; line-height: 1.6; color: #57665B;">
            Tomamos tu pedido para <strong>${tratamiento}</strong>. El equipo de <strong>${clinica}</strong> revisará los horarios y te confirmará a la brevedad.
          </p>

          <!-- CAJA DE DETALLES (CALLOUT SUAVE) -->
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background-color: #F4F5F1; border-radius: 14px; margin-bottom: 24px;">
            <tr>
              <td style="padding: 20px 22px;">
                <div style="font-size: 14.5px; font-weight: 700; color: #243026; margin-bottom: 12px;">
                  Detalles de tu solicitud
                </div>
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td style="padding-bottom: 9px; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Turno pedido:</strong> ${fechaHora}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 9px; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Tratamiento:</strong> ${tratamiento}
                    </td>
                  </tr>
                  ${direccion ? `
                  <tr>
                    <td style="padding-bottom: ${params.senaMonto ? '9px' : '0'}; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Lugar:</strong> ${direccion}
                    </td>
                  </tr>
                  ` : ''}
                  ${params.senaMonto && params.senaMonto > 0 ? `
                  <tr>
                    <td style="padding-bottom: ${params.senaDatosPago ? '9px' : '0'}; font-size: 14px; line-height: 1.55; color: #57665B;">
                      • <strong>Seña requerida:</strong> $${params.senaMonto.toLocaleString('es-AR')}
                    </td>
                  </tr>
                  ` : ''}
                  ${params.senaDatosPago ? `
                  <tr>
                    <td style="font-size: 13.5px; line-height: 1.55; color: #57665B;">
                      • <strong>Datos de seña:</strong> ${escaparHtml(params.senaDatosPago)}
                    </td>
                  </tr>
                  ` : ''}
                </table>
              </td>
            </tr>
          </table>

          <!-- BOTÓN PRINCIPAL VERDE -->
          ${portalUrl ? `
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
            <tr>
              <td align="center">
                <a href="${portalUrl}" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: #455A47; color: #ffffff; text-align: center; padding: 14px 20px; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.01em;">
                  Ver mi portal de paciente →
                </a>
              </td>
            </tr>
          </table>

          <!-- ENLACE DE COPIAR ABAJO -->
          <div style="text-align: center; margin-top: 14px; font-size: 12.5px; color: #7B8A7F; line-height: 1.5;">
            O copiá este link: <br>
            <a href="${portalUrl}" target="_blank" style="color: #3B82F6; text-decoration: underline; word-break: break-all;">
              ${portalUrl}
            </a>
          </div>
          ` : ''}

        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding: 0 24px 28px; text-align: center; background: #ffffff;">
          <div style="font-size: 12px; color: #8D9B91; line-height: 1.5;">
            ${clinica}<br>
            Este turno todavía no está confirmado. Te avisaremos cuando sea aprobado.
          </div>
        </td>
      </tr>

    </table>
  </div>
</body>
</html>`
}
