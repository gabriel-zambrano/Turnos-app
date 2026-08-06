import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { PantallaTurno, PantallaError } from '@/components/turno/PantallaTurno'
import {
  leerTurnoPorCodigo,
  confirmarTurnoPorCodigo,
  MENSAJE_POR_MOTIVO,
} from '@/lib/turno-publico'

// ─────────────────────────────────────────────────────────────
// El link que recibe el paciente: /t/K3M9QPX7RB4T
//
// Reemplaza a /agendar/[token]/[cita], que eran noventa caracteres con dos
// UUID pegados. En un mensaje de WhatsApp eso ocupaba tres renglones y competía
// con el texto que importa.
//
// El código da acceso a UN turno y nada más. Deliberadamente no expone el token
// del paciente —que abre su ficha entera—, así que las tres acciones se
// resuelven con el código: agendar, confirmar y reprogramar.
// ─────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

/**
 * La vista previa que arma WhatsApp al pegar el link.
 *
 * **No lleva datos del paciente.** La tarjeta la genera el crawler de Meta
 * abriendo esta URL: poner ahí el nombre o el tratamiento es mandarle datos de
 * salud a un tercero en cada envío. Va la clínica, y nada más.
 */
export async function generateMetadata({ params }: { params: { codigo: string } }): Promise<Metadata> {
  const res = await leerTurnoPorCodigo(params.codigo)
  const clinica = res.ok && res.turno.clinica ? res.turno.clinica : 'tu consultorio'

  return {
    title: `Tu turno en ${clinica}`,
    description: 'Confirmá tu turno y agendalo en el calendario de tu teléfono.',
    robots: { index: false, follow: false },
    openGraph: {
      title: `Tu turno en ${clinica}`,
      description: 'Confirmalo y agendalo en un toque.',
      type: 'website',
    },
  }
}

export default async function TurnoPorCodigoPage({
  params,
  searchParams,
}: {
  params: { codigo: string }
  searchParams: { ok?: string }
}) {
  const codigo = params.codigo.toUpperCase()
  const res = await leerTurnoPorCodigo(codigo)

  if (!res.ok) {
    if (res.motivo === 'base') {
      console.error('[/t] no se pudo leer el turno:', res.detalle)
    }
    return <PantallaError mensaje={MENSAJE_POR_MOTIVO[res.motivo]} />
  }

  // Server action: el formulario funciona sin JavaScript en el cliente, que es
  // lo que hace que esto ande igual dentro del navegador embebido de WhatsApp.
  async function confirmar() {
    'use server'
    await confirmarTurnoPorCodigo(codigo)
    revalidatePath(`/t/${codigo}`)
  }

  return (
    <PantallaTurno
      turno={res.turno}
      urlIcs={`/api/ics?c=${encodeURIComponent(codigo)}`}
      confirmar={confirmar}
      yaConfirmo={searchParams.ok === '1'}
    />
  )
}
