// ─────────────────────────────────────────────────────────────
// Avisos al consultorio cuando entra un turno por el link público.
//
// El turno queda en estado 'pendiente' esperando confirmación, así que si el
// consultorio no se entera, el paciente queda esperando y el turno se pierde.
// Por eso el aviso sale por varios canales y ninguno bloquea la respuesta al
// paciente: si falla el mail o WhatsApp, el turno igual quedó registrado.
// ─────────────────────────────────────────────────────────────

export interface DatosAviso {
  clinica: string
  paciente: string
  telefono: string
  emailPaciente?: string | null
  tratamiento: string
  /** Fecha ya formateada para leer, ej: "martes 28 de julio". */
  fechaLinda: string
  hora: string
  notas?: string | null
  /** Monto de la seña, si la clínica pide una. */
  sena?: number | null
  urlAgenda: string
}

export function asuntoAviso(d: DatosAviso): string {
  return `Nuevo turno pedido online — ${d.paciente}, ${d.fechaLinda} ${d.hora} hs`
}

/**
 * Texto plano del aviso. Se usa tal cual en WhatsApp y como respaldo del mail.
 * Va al grano: quién, cuándo y qué hacer.
 */
export function textoAviso(d: DatosAviso): string {
  const lineas = [
    `Nuevo turno pedido desde la página de reservas.`,
    ``,
    `Paciente: ${d.paciente}`,
    `Teléfono: ${d.telefono}`,
    `Cuándo: ${d.fechaLinda} a las ${d.hora} hs`,
    `Motivo: ${d.tratamiento}`,
  ]
  if (d.notas) lineas.push(`Comentario: ${d.notas}`)
  if (d.sena && d.sena > 0) {
    lineas.push(``, `El paciente vio que debe abonar $${d.sena.toLocaleString('es-AR')} de seña para que el turno quede confirmado.`)
  }
  lineas.push(``, `El turno está PENDIENTE hasta que lo confirmes:`, d.urlAgenda)
  return lineas.join('\n')
}

export function htmlAviso(d: DatosAviso): string {
  const fila = (etiqueta: string, valor: string) => `
    <tr>
      <td style="padding:6px 0;color:#94a3b8;font-size:13px;width:110px;vertical-align:top">${etiqueta}</td>
      <td style="padding:6px 0;color:#0f1e2b;font-size:14px;font-weight:600">${valor}</td>
    </tr>`

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px 16px">
      <div style="background:#fff;border:1px solid #e8edf2;border-radius:16px;padding:28px">
        <div style="font-size:12px;font-weight:700;color:#138A6B;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">
          Turno pedido online
        </div>
        <h1 style="font-size:19px;font-weight:800;color:#0a1e3d;margin:0 0 20px">
          ${d.fechaLinda} · ${d.hora} hs
        </h1>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          ${fila('Paciente', d.paciente)}
          ${fila('Teléfono', d.telefono)}
          ${d.emailPaciente ? fila('Email', d.emailPaciente) : ''}
          ${fila('Motivo', d.tratamiento)}
          ${d.notas ? fila('Comentario', d.notas) : ''}
        </table>

        ${d.sena && d.sena > 0 ? `
        <div style="background:#FFF3CD;border:1px solid #ffe08a;border-radius:10px;padding:12px 14px;margin-bottom:20px;font-size:13px;color:#633806;line-height:1.5">
          Al paciente se le informó que debe abonar <strong>$${d.sena.toLocaleString('es-AR')}</strong>
          de seña para que el turno quede confirmado.
        </div>` : ''}

        <div style="background:#f8fafc;border-radius:10px;padding:12px 14px;margin-bottom:20px;font-size:13px;color:#475569;line-height:1.5">
          El turno figura como <strong>pendiente</strong> en tu agenda. Confirmalo cuando corresponda.
        </div>

        <a href="${d.urlAgenda}" style="display:block;text-align:center;background:#0a1e3d;color:#fff;padding:13px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">
          Abrir la agenda
        </a>
      </div>
    </div>`
}
