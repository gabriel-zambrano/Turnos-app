/**
 * Saldo pendiente de un paciente: lo que falta cobrar de turnos ASISTIDOS.
 *
 * Deuda de un turno = valor − (seña + cobrado), si es positiva. Se cuentan
 * solo turnos asistidos: un turno confirmado todavía no se atendió y no es
 * deuda. (La lista de Deudores de Finanzas hoy incluye confirmados; está
 * anotado como hallazgo aparte.)
 */
export interface CitaConValores {
  estado: string
  valor?: number | string | null
  precio_cobrado?: number | string | null
  sena?: number | string | null
}

const n = (v: number | string | null | undefined) => Number(v ?? 0) || 0

export function deudaDeCita(c: CitaConValores): number {
  return Math.max(0, n(c.valor) - n(c.sena) - n(c.precio_cobrado))
}

export function saldoPendiente(citas: CitaConValores[]): { monto: number; turnos: number } {
  let monto = 0, turnos = 0
  for (const c of citas) {
    if (c.estado !== 'asistio') continue
    const d = deudaDeCita(c)
    if (d > 0) { monto += d; turnos++ }
  }
  return { monto, turnos }
}
