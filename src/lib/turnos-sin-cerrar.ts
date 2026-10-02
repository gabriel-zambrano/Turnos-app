/**
 * Turnos que ya pasaron y siguen como pendiente o confirmado.
 *
 * Nadie los cierra porque nada lo pide: en junio y julio de 2026 quedaron
 * cientos así, y ensucian la caja, los reportes y el control diario. La
 * Agenda los muestra en un aviso para cerrarlos (asistió o faltó).
 *
 * `ahora` es la fecha y hora local de la clínica, 'YYYY-MM-DD HH:MM' o
 * 'YYYY-MM-DDTHH:MM'. Se compara como texto, que funciona porque el formato
 * es de ancho fijo y va de mayor a menor.
 */
export interface TurnoParaCerrar {
  id: string
  fecha: string   // YYYY-MM-DD
  hora: string    // HH:MM
  estado: string
}

const ABIERTOS = ['pendiente', 'confirmado']

export function turnosSinCerrar<T extends TurnoParaCerrar>(turnos: T[], ahora: string): T[] {
  const corte = ahora.replace(' ', 'T').slice(0, 16)
  return turnos
    .filter(t => ABIERTOS.includes(t.estado) && `${t.fecha}T${t.hora.slice(0, 5)}` < corte)
    .sort((a, b) => `${a.fecha}T${a.hora}`.localeCompare(`${b.fecha}T${b.hora}`))
}

/** Fecha y hora actual en Argentina, 'YYYY-MM-DD HH:MM'. */
export function ahoraEnArgentina(d = new Date()): string {
  return d.toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 16)
}
