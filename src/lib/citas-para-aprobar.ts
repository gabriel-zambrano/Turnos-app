/**
 * Turnos que la ficha ofrece en "Cobros y Visitas" para cerrar y cobrar.
 *
 * Antes se definían por la ausencia de un movimiento de puntos
 * ('gasto_tratamiento'). Con el programa de puntos apagado ese movimiento ya
 * no se escribe, y los turnos cobrados volvían a la lista para siempre.
 *
 * Con el programa apagado, la regla se basa en el turno mismo:
 *   - pendiente o confirmado → falta cerrarlo;
 *   - asistió sin cobro      → falta cobrarlo;
 *   - asistió con cobro      → terminado, no se ofrece.
 *
 * Con el programa encendido se conserva la regla anterior sin cambios.
 */

export interface CitaParaAprobar {
  id: string
  estado: string
  precio_cobrado?: number | string | null
}

export interface MovimientoPuntos {
  cita_id?: string | null
  tipo_movimiento?: string | null
}

const ABIERTOS = ['pendiente', 'confirmado']

export function citasPendientesDeAprobar<T extends CitaParaAprobar>(
  citas: T[],
  historialPuntos: MovimientoPuntos[],
  fidelizacionHabilitada: boolean
): T[] {
  if (fidelizacionHabilitada) {
    return citas.filter(c =>
      [...ABIERTOS, 'asistio'].includes(c.estado) &&
      !historialPuntos.some(h => h.cita_id === c.id && h.tipo_movimiento === 'gasto_tratamiento')
    )
  }
  return citas.filter(c => {
    if (ABIERTOS.includes(c.estado)) return true
    if (c.estado === 'asistio') return !(Number(c.precio_cobrado ?? 0) > 0)
    return false
  })
}
