// Motor de envío por WhatsApp Cloud API (Meta).
// Requiere variables de entorno de la plataforma:
//   WHATSAPP_TOKEN     → token permanente de la app de Meta
//   WHATSAPP_PHONE_ID  → id del número de teléfono en WhatsApp Business
//   WHATSAPP_API_VERSION (opcional, por defecto v21.0)
//
// Los mensajes proactivos (cumpleaños, recall, reactivación) se envían con
// PLANTILLAS pre-aprobadas por Meta. Cada plantilla puede tener variables de
// cuerpo ({{1}}, {{2}}, ...) que se completan con `variables`.

export interface EnvioWhatsApp {
  telefono: string        // en formato internacional, se normaliza a dígitos
  plantilla: string       // nombre de la plantilla aprobada en Meta
  idioma?: string         // por defecto 'es_AR' con fallback a 'es'
  variables?: string[]    // valores para {{1}}, {{2}}, ...
}

export interface ResultadoEnvio {
  ok: boolean
  id?: string             // id del mensaje devuelto por Meta
  error?: string
}

export function whatsappConfigurado(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID)
}

/** Normaliza un teléfono argentino a formato E.164 sin '+': 54 9 <area><numero>. */
export function normalizarTelefonoWA(tel: string): string | null {
  let d = String(tel || '').replace(/\D/g, '')
  if (!d) return null
  // Quita 00 inicial de discado internacional
  d = d.replace(/^00/, '')
  // Si ya viene con 54, lo dejamos; si no, asumimos Argentina
  if (!d.startsWith('54')) d = '54' + d
  // WhatsApp AR requiere el 9 después del 54 para móviles
  if (!d.startsWith('549')) d = '549' + d.slice(2)
  return d.length >= 12 && d.length <= 15 ? d : null
}

export async function enviarWhatsApp({ telefono, plantilla, idioma = 'es_AR', variables = [] }: EnvioWhatsApp): Promise<ResultadoEnvio> {
  if (!whatsappConfigurado()) {
    return { ok: false, error: 'WhatsApp no configurado (faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_ID)' }
  }
  const to = normalizarTelefonoWA(telefono)
  if (!to) return { ok: false, error: 'Teléfono inválido' }

  const version = process.env.WHATSAPP_API_VERSION || 'v21.0'
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_ID}/messages`

  const componentes = variables.length
    ? [{ type: 'body', parameters: variables.map(v => ({ type: 'text', text: String(v) })) }]
    : []

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: plantilla,
      language: { code: idioma },
      ...(componentes.length ? { components: componentes } : {}),
    },
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`
      return { ok: false, error: msg }
    }
    return { ok: true, id: data?.messages?.[0]?.id }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Error de red' }
  }
}
