import { NextRequest, NextResponse } from 'next/server'
import { APP_NAME, EMAIL_DOMAIN } from '@/lib/config'
import { construirIcs } from '@/lib/calendario'
import { leerTurnoPublico, HTTP_POR_MOTIVO, MENSAJE_POR_MOTIVO } from '@/lib/turno-publico'

// ─────────────────────────────────────────────────────────────
// Archivo de calendario para que el paciente agende su turno de un toque.
//
// Los datos se leen de la base a partir del token del paciente y NO del
// querystring. Una versión anterior recibía fecha, hora y tratamiento por la
// URL: cualquiera podía armar un turno inventado, y el link quedaba viejo si
// el turno se reprogramaba. Ahora el link es estable y siempre refleja lo que
// está agendado.
//
// La lectura vive en `lib/turno-publico.ts` porque la comparte con la pantalla
// /agendar. Ahí está explicado por qué el `token_expira` se consulta aparte.
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') || ''
  const citaId = searchParams.get('cita') || ''

  const res = await leerTurnoPublico(token, citaId)

  if (!res.ok) {
    // El detalle solo se registra del lado del servidor: al paciente se le
    // devuelve el mensaje genérico. Pero queda en los logs, que es lo que
    // faltaba cuando esto devolvía "Link inválido" para cualquier falla.
    if (res.motivo === 'base') {
      console.error('[api/ics] no se pudo leer el turno:', res.detalle)
    }
    return NextResponse.json(
      { error: MENSAJE_POR_MOTIVO[res.motivo] },
      { status: HTTP_POR_MOTIVO[res.motivo] }
    )
  }

  const { turno } = res
  const clinica = turno.clinica || APP_NAME

  const ics = construirIcs({
    uid: `cita-${turno.citaId}@${EMAIL_DOMAIN}`,
    titulo: `Turno en ${clinica} - ${turno.tratamiento}`,
    descripcion: `Turno en ${clinica}\nTratamiento: ${turno.tratamiento}`,
    ubicacion: turno.direccion || undefined,
    inicio: new Date(turno.fechaHora),
    duracionMinutos: turno.duracionMinutos,
    producto: APP_NAME,
    recordatorio: `Mañana tenés turno en ${clinica}`,
  })

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // `inline` y no `attachment`, que es lo que había.
      //
      // El paciente abre esto desde un link de WhatsApp, o sea dentro del
      // navegador embebido de WhatsApp (WKWebView en iOS, WebView en
      // Android). Ese navegador no tiene gestor de descargas: una respuesta
      // `attachment` no hace absolutamente nada — ni hoja, ni error, ni
      // aviso. Tocar el botón parecía no responder.
      //
      // Con `inline`, iOS abre directamente la hoja de "Agregar evento" del
      // Calendario. Chrome y el escritorio no saben mostrar text/calendar, así
      // que lo descargan igual: no se pierde nada y se gana el caso del
      // teléfono, que es el 95% del tráfico.
      'Content-Disposition': 'inline; filename="turno.ics"',
      'Cache-Control': 'no-store',
    },
  })
}
