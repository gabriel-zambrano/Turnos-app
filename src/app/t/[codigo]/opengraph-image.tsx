import { ImageResponse } from 'next/og'
import { leerTurnoPorCodigo } from '@/lib/turno-publico'
import { formatearTurno } from '@/components/turno/PantallaTurno'

// ─────────────────────────────────────────────────────────────
// La tarjeta que WhatsApp muestra al pegar el link.
//
// En un mensaje de texto de WhatsApp no existe el botón: lo que el paciente
// toca como si lo fuera es esta tarjeta. Antes no había una sola etiqueta
// OpenGraph en el repo, así que el link llegaba como una URL azul pelada entre
// el texto.
//
// ── Qué NO va acá ──
//
// El nombre del paciente y el tratamiento. Esta imagen la genera el crawler de
// Meta abriendo la URL: todo lo que se ponga viaja a sus servidores en cada
// envío, y el tratamiento es un dato de salud. Va la clínica, la fecha y la
// hora —que el paciente ya tiene en el texto del mensaje— y nada más.
// ─────────────────────────────────────────────────────────────

export const runtime = 'edge'
export const alt = 'Tu turno'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: { codigo: string } }) {
  const res = await leerTurnoPorCodigo(params.codigo)

  const clinica = res.ok && res.turno.clinica ? res.turno.clinica : 'Tu consultorio'
  const cuando = res.ok ? formatearTurno(res.turno.fechaHora) : null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a1e3d',
          color: '#fff',
          fontFamily: 'sans-serif',
          padding: 64,
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 6, color: '#8fa3bc', textTransform: 'uppercase' }}>
          {clinica}
        </div>

        {cuando ? (
          <>
            <div style={{ fontSize: 56, color: '#c5d4e8', marginTop: 40, textTransform: 'capitalize' }}>
              {cuando.dia} {cuando.fecha}
            </div>
            <div style={{ fontSize: 168, fontWeight: 700, lineHeight: 1.1, letterSpacing: -6 }}>
              {cuando.hora}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 72, marginTop: 40 }}>Tu turno</div>
        )}

        <div
          style={{
            display: 'flex',
            marginTop: 48,
            padding: '16px 40px',
            borderRadius: 999,
            background: '#138A6B',
            fontSize: 32,
            fontWeight: 600,
          }}
        >
          Confirmar y agendar
        </div>
      </div>
    ),
    size
  )
}
