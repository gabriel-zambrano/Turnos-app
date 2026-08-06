import { redirect } from 'next/navigation'
import { PantallaTurno, PantallaError } from '@/components/turno/PantallaTurno'
import { leerTurnoPublico, emitirEnlaceTurno, MENSAJE_POR_MOTIVO } from '@/lib/turno-publico'

// ─────────────────────────────────────────────────────────────
// La ruta larga, que sigue viva por compatibilidad.
//
// Los links de esta forma ya salieron en recordatorios y viven en el WhatsApp
// de gente real: no se puede borrar la ruta sin romperlos. Lo que hace es
// resolver el código corto de esa cita y mandar a /t/<codigo>, que es donde
// está la pantalla de verdad.
//
// Si por lo que sea no se puede emitir el código —la migración todavía no
// corrió, por ejemplo—, renderiza igual en vez de dejar al paciente sin nada.
// ─────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Tu turno',
  robots: { index: false, follow: false },
}

export default async function AgendarPage({
  params,
}: {
  params: { token: string; cita: string }
}) {
  const res = await leerTurnoPublico(params.token, params.cita)

  if (!res.ok) {
    if (res.motivo === 'base') {
      console.error('[agendar] no se pudo leer el turno:', res.detalle)
    }
    return <PantallaError mensaje={MENSAJE_POR_MOTIVO[res.motivo]} />
  }

  const codigo = await emitirEnlaceTurno(res.turno.citaId)
  if (codigo) redirect(`/t/${codigo}`)

  // Sin código: se muestra la pantalla acá mismo. Pierde el botón de confirmar
  // —que va por código— pero el paciente igual puede agendar, que es a lo que
  // vino desde este link.
  return (
    <PantallaTurno
      turno={res.turno}
      urlIcs={`/api/ics?cita=${encodeURIComponent(res.turno.citaId)}&token=${encodeURIComponent(params.token)}`}
    />
  )
}
