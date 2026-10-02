/**
 * Templates HTML de emails transaccionales para DentalDesk.
 *
 * Siguen la filosofía "Premium Trust & Calm":
 * - Paleta Deep Teal (#0A2540) + Acento Mint/Sage (#10B981 / #E0F2F1) + Neutros Slate/Zinc.
 * - Estructura tipo "Boarding Pass / Apple Wallet" con troquelado punteado.
 * - Tipografía monospace del sistema para fechas y horarios.
 * - Pre-flight checklist para reducir el absentismo en el consultorio.
 * - Maquetado tabular con CSS inline 100% compatible con Gmail, Apple Mail y Outlook.
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
    @media only screen and (max-width: 480px) {
      .email-container { width: 100% !important; padding: 16px 12px !important; }
      .ticket-col { display: block !important; width: 100% !important; margin-bottom: 12px !important; }
      .calendar-btn-col { display: block !important; width: 100% !important; margin-bottom: 8px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <div style="background-color: #f4f7fb; padding: 32px 12px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" class="email-container" style="max-width: 520px; width: 100%; margin: 0 auto;">
      
      <!-- HEADER / BRANDING -->
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          ${params.clinicaLogoUrl
            ? `<img src="${escaparHtml(params.clinicaLogoUrl)}" alt="${clinica}" style="max-height: 48px; max-width: 180px; object-fit: contain; display: block; border-radius: 8px;" />`
            : `<div style="display: inline-block; padding: 10px 16px; background: #0A2540; border-radius: 12px; color: #ffffff; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">${clinica}</div>`
          }
        </td>
      </tr>

      <!-- MENSAJE DE BIENVENIDA -->
      <tr>
        <td style="text-align: center; padding-bottom: 24px;">
          <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: #0A2540; letter-spacing: -0.02em;">
            Todo listo, ${primerNombre}. Tu turno está confirmado.
          </h1>
          <p style="margin: 0; font-size: 14.5px; color: #64748b; line-height: 1.5;">
            Hemos reservado este espacio exclusivamente para ti en <strong>${clinica}</strong>.
          </p>
        </td>
      </tr>

      <!-- EL TICKET (APPLE WALLET / BOARDING PASS STYLE) -->
      <tr>
        <td>
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px rgba(10, 37, 64, 0.04); overflow: hidden;">
            
            <!-- ENCABEZADO DEL TICKET CON BADGE VERIFICADO -->
            <tr>
              <td style="padding: 20px 24px 16px; border-bottom: 1px solid #f1f5f9;">
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td>
                      <span style="display: inline-block; padding: 4px 10px; background: #E0F2F1; color: #0F5145; font-size: 11px; font-weight: 700; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.06em;">
                        ✓ Turno Confirmado
                      </span>
                    </td>
                    <td align="right">
                      <span style="font-size: 12px; color: #94a3b8; font-weight: 600;">Pase Digital</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- DATOS PRINCIPALES: FECHA, HORA, TRATAMIENTO -->
            <tr>
              <td style="padding: 20px 24px;">
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td class="ticket-col" style="vertical-align: top; width: 55%; padding-right: 12px;">
                      <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">
                        Fecha y Horario
                      </div>
                      <div style="font-size: 17px; font-weight: 800; color: #0A2540; letter-spacing: -0.01em;">
                        ${fecha}
                      </div>
                      <div style="font-family: 'SFMono-Regular', Menlo, Consolas, Monaco, monospace; font-size: 20px; font-weight: 700; color: #0F4C5C; margin-top: 3px;">
                        ${hora} hs
                      </div>
                    </td>
                    <td class="ticket-col" style="vertical-align: top; width: 45%; border-left: 1px solid #f1f5f9; padding-left: 16px;">
                      <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">
                        Tratamiento
                      </div>
                      <div style="font-size: 15px; font-weight: 700; color: #0A2540;">
                        ${tratamiento}
                      </div>
                      <div style="font-size: 13px; color: #64748b; margin-top: 3px;">
                        ⏱️ ${duracion}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- TROQUELADO / DIVISOR PUNTEADO (LÍNEA TICKET) -->
            <tr>
              <td style="padding: 0 24px;">
                <div style="border-top: 2px dashed #cbd5e1; margin: 0; line-height: 1;"></div>
              </td>
            </tr>

            <!-- UBICACIÓN Y NOTAS -->
            <tr>
              <td style="padding: 20px 24px;">
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td>
                      <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">
                        Lugar de Atención
                      </div>
                      <div style="font-size: 14.5px; font-weight: 600; color: #0A2540; display: flex; align-items: center; gap: 6px;">
                        📍 ${direccion || clinica}
                      </div>
                      ${mapsUrl ? `
                        <div style="margin-top: 8px;">
                          <a href="${mapsUrl}" target="_blank" style="display: inline-block; font-size: 12.5px; font-weight: 600; color: #0F4C5C; text-decoration: none;">
                            🧭 Cómo llegar en Google Maps &rarr;
                          </a>
                        </div>
                      ` : ''}
                      ${notas ? `
                        <div style="margin-top: 14px; padding: 10px 14px; background: #f8fafc; border-radius: 10px; border-left: 3px solid #0F4C5C;">
                          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Indicaciones del consultorio:</div>
                          <div style="font-size: 13px; color: #334155; margin-top: 3px;">${notas}</div>
                        </div>
                      ` : ''}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- ACCIÓN DEL PORTAL (SI EXISTE TOKEN) -->
            ${params.portalUrl ? `
            <tr>
              <td style="padding: 0 24px 20px;">
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background: #f8fafc; border-radius: 12px; padding: 14px 16px;">
                  <tr>
                    <td style="vertical-align: middle;">
                      <div style="font-size: 13px; font-weight: 700; color: #0A2540;">¿Necesitas hacer cambios?</div>
                      <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Confirmá asistencia o reprogramá en un toque.</div>
                    </td>
                    <td align="right" style="vertical-align: middle;">
                      <a href="${escaparHtml(params.portalUrl)}" target="_blank" style="display: inline-block; padding: 8px 14px; background: #0A2540; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 12.5px; font-weight: 600;">
                        Abrir Portal
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ` : ''}

          </table>
        </td>
      </tr>

      <!-- AGREGAR AL CALENDARIO -->
      <tr>
        <td style="padding-top: 24px;">
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 18px 20px;">
            <tr>
              <td style="padding-bottom: 12px; text-align: center;">
                <div style="font-size: 13px; font-weight: 700; color: #0A2540; letter-spacing: 0.02em;">
                  📅 Guardar recordatorio en tu calendario
                </div>
              </td>
            </tr>
            <tr>
              <td>
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    ${params.googleCalendarUrl ? `
                    <td class="calendar-btn-col" style="padding: 4px;">
                      <a href="${escaparHtml(params.googleCalendarUrl)}" target="_blank" style="display: block; text-align: center; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; color: #1e293b; text-decoration: none; font-size: 12.5px; font-weight: 600;">
                        Google
                      </a>
                    </td>
                    ` : ''}
                    ${params.icsCalendarUrl ? `
                    <td class="calendar-btn-col" style="padding: 4px;">
                      <a href="${escaparHtml(params.icsCalendarUrl)}" target="_blank" style="display: block; text-align: center; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; color: #1e293b; text-decoration: none; font-size: 12.5px; font-weight: 600;">
                        Apple (iCal)
                      </a>
                    </td>
                    ` : ''}
                    ${params.outlookCalendarUrl ? `
                    <td class="calendar-btn-col" style="padding: 4px;">
                      <a href="${escaparHtml(params.outlookCalendarUrl)}" target="_blank" style="display: block; text-align: center; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; color: #1e293b; text-decoration: none; font-size: 12.5px; font-weight: 600;">
                        Outlook
                      </a>
                    </td>
                    ` : ''}
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- EL PRE-FLIGHT CHECKLIST (REDUCCIÓN DE AUSENTISMO) -->
      <tr>
        <td style="padding-top: 24px;">
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 20px 22px;">
            <tr>
              <td style="padding-bottom: 14px;">
                <div style="font-size: 12px; font-weight: 800; color: #0A2540; text-transform: uppercase; letter-spacing: 0.05em;">
                  Pre-Flight Checklist para tu visita
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 10px;">
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td style="width: 24px; vertical-align: top; font-size: 16px;">⏱️</td>
                    <td style="font-size: 13.5px; color: #475569; line-height: 1.45; padding-left: 8px;">
                      <strong>Puntualidad:</strong> Te pedimos llegar 10 minutos antes para registrar tu ingreso con tranquilidad.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom: 10px;">
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td style="width: 24px; vertical-align: top; font-size: 16px;">📱</td>
                    <td style="font-size: 13.5px; color: #475569; line-height: 1.45; padding-left: 8px;">
                      <strong>Aviso previo:</strong> Te enviaremos un recordatorio por WhatsApp o email 24h antes del turno.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
                  <tr>
                    <td style="width: 24px; vertical-align: top; font-size: 16px;">🦷</td>
                    <td style="font-size: 13.5px; color: #475569; line-height: 1.45; padding-left: 8px;">
                      <strong>Preparación:</strong> Recuerda higienizar tus dientes antes de acudir a tu cita.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- FOOTER STRIPE-STYLE -->
      <tr>
        <td style="padding-top: 32px; text-align: center;">
          <div style="font-size: 13px; font-weight: 600; color: #475569;">
            ${clinica} ${params.clinicaTelefono ? `· Tel: ${escaparHtml(params.clinicaTelefono)}` : ''}
          </div>
          ${direccion ? `<div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">${direccion}</div>` : ''}
          <div style="font-size: 11.5px; color: #94a3b8; margin-top: 14px; line-height: 1.5;">
            Mensaje automático de gestión de turnos enviado por ${clinica}.<br>
            Si necesitas cancelar o reprogramar, utiliza el portal de paciente o comunícate con la recepción.
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
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <div style="background-color: #f4f7fb; padding: 32px 12px;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%; margin: 0 auto;">
      
      <!-- LOGO / HEADER -->
      <tr>
        <td align="center" style="padding-bottom: 24px;">
          ${params.clinicaLogoUrl
            ? `<img src="${escaparHtml(params.clinicaLogoUrl)}" alt="${clinica}" style="max-height: 48px; max-width: 180px; object-fit: contain; display: block; border-radius: 8px;" />`
            : `<div style="display: inline-block; padding: 10px 16px; background: #0A2540; border-radius: 12px; color: #ffffff; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">${clinica}</div>`
          }
        </td>
      </tr>

      <!-- TÍTULO -->
      <tr>
        <td style="text-align: center; padding-bottom: 20px;">
          <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: #0A2540; letter-spacing: -0.02em;">
            Recordatorio de tu turno
          </h1>
          <p style="margin: 0; font-size: 14.5px; color: #64748b;">
            Hola <strong>${primerNombre}</strong>, te recordamos tu cita programada:
          </p>
        </td>
      </tr>

      <!-- TICKET -->
      <tr>
        <td>
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px rgba(10, 37, 64, 0.04); overflow: hidden;">
            <tr>
              <td style="padding: 20px 24px;">
                <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">
                  Fecha y Hora
                </div>
                <div style="font-family: 'SFMono-Regular', Menlo, Consolas, Monaco, monospace; font-size: 18px; font-weight: 700; color: #0F4C5C;">
                  ${fechaHora}
                </div>

                <div style="margin-top: 16px;">
                  <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">
                    Tratamiento
                  </div>
                  <div style="font-size: 15px; font-weight: 700; color: #0A2540;">
                    ${tratamiento}
                  </div>
                </div>

                ${direccion ? `
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #f1f5f9;">
                  <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">
                    Lugar
                  </div>
                  <div style="font-size: 14px; font-weight: 600; color: #0A2540;">
                    📍 ${direccion}
                  </div>
                </div>
                ` : ''}
              </td>
            </tr>

            ${enlace ? `
            <tr>
              <td style="padding: 0 24px 24px; text-align: center;">
                <a href="${enlace}" target="_blank" style="display: block; padding: 13px 20px; background: #0A2540; color: #ffffff; text-decoration: none; border-radius: 12px; font-size: 14.5px; font-weight: 700; letter-spacing: 0.01em;">
                  Confirmar Asistencia y Ver Turno &rarr;
                </a>
                <div style="font-size: 12px; color: #94a3b8; margin-top: 8px;">
                  Podés confirmar o reprogramar directamente desde tu celular.
                </div>
              </td>
            </tr>
            ` : ''}
          </table>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding-top: 28px; text-align: center;">
          <div style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
            Este es un mensaje automático de ${clinica}.<br>
            Si tenés alguna consulta, respondé este email o comunicate con la recepción.
          </div>
        </td>
      </tr>

    </table>
  </div>
</body>
</html>`
}
