// ─────────────────────────────────────────────────────────────
// Reglas del agendamiento online del paciente.
//
// Todo lo que decide qué turno se puede pedir vive acá, en funciones puras y
// testeadas, para que la página pública y la API apliquen exactamente el mismo
// criterio. La API es la que manda: el front puede mostrar lo que quiera, pero
// el turno se valida de nuevo en el servidor antes de guardarse.
//
// Zona horaria: todo el sistema trabaja en horario de Argentina (UTC-3) y las
// fechas se guardan con el offset explícito, igual que en NuevaCitaModal.
// ─────────────────────────────────────────────────────────────

/** Primer y último slot del día, y cada cuánto se abre uno. */
export const HORA_APERTURA = 8
export const HORA_CIERRE = 20 // exclusivo: el último slot arranca 19:40
export const MINUTOS_POR_SLOT = 20

/** Anticipación mínima para reservar. Evita el turno "para dentro de 10 minutos". */
export const ANTICIPACION_MINIMA_HORAS = 2

/** Hasta cuándo se puede reservar hacia adelante. */
export const DIAS_MAXIMOS_A_FUTURO = 60

export const OFFSET_AR = '-03:00'

/** Todos los horarios posibles del día, en formato "HH:MM". */
export function slotsDelDia(): string[] {
  const slots: string[] = []
  for (let h = HORA_APERTURA; h < HORA_CIERRE; h++) {
    for (let m = 0; m < 60; m += MINUTOS_POR_SLOT) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slots
}

/** "2026-07-28" + "09:20" → Date en horario de Argentina. */
export function fechaHoraAR(fecha: string, hora: string): Date {
  return new Date(`${fecha}T${hora}:00${OFFSET_AR}`)
}

/** Formato ISO con offset que espera la columna fecha_hora. */
export function fechaHoraISO(fecha: string, hora: string): string {
  return `${fecha}T${hora}:00${OFFSET_AR}`
}

export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false
  const d = new Date(`${fecha}T12:00:00${OFFSET_AR}`)
  return !Number.isNaN(d.getTime())
}

export function esHoraValida(hora: string): boolean {
  return slotsDelDia().includes(hora)
}

/**
 * Días que atiende el consultorio: lunes a viernes.
 *
 * ⚠️ Hoy es fijo para toda la plataforma. Cuando haya clínicas con otros
 * horarios (sábados, turnos partidos), esto tiene que pasar a ser configuración
 * por tenant: una tabla `horarios_atencion` con día, apertura y cierre.
 */
export function esDiaHabil(fecha: string): boolean {
  const d = new Date(`${fecha}T12:00:00${OFFSET_AR}`)
  // getUTCDay sobre el mediodía AR devuelve el día correcto sin importar dónde
  // corra el servidor. 0 = domingo, 6 = sábado.
  const dia = d.getUTCDay()
  return dia !== 0 && dia !== 6
}

export interface Ocupacion {
  /** Inicio del turno ya existente. */
  fechaHora: string
  /** Cuánto dura, para bloquear también los slots que pisa. */
  duracionMinutos: number
}

/**
 * Slots que quedan libres una vez descontados los turnos ya tomados.
 *
 * Un turno de 60 minutos a las 09:00 bloquea 09:00, 09:20 y 09:40: si solo se
 * bloqueara el horario exacto, dos pacientes podrían pedir turnos superpuestos.
 */
export function slotsLibres(
  fecha: string,
  ocupados: Ocupacion[],
  duracionPedidaMinutos: number,
  ahora: Date = new Date()
): string[] {
  if (!esFechaValida(fecha) || !esDiaHabil(fecha)) return []

  const minimo = new Date(ahora.getTime() + ANTICIPACION_MINIMA_HORAS * 60 * 60 * 1000)
  const tope = new Date(ahora.getTime() + DIAS_MAXIMOS_A_FUTURO * 24 * 60 * 60 * 1000)

  // Rangos [inicio, fin) ya ocupados, en milisegundos.
  const rangos = ocupados.map(o => {
    const inicio = new Date(o.fechaHora).getTime()
    const dur = o.duracionMinutos > 0 ? o.duracionMinutos : MINUTOS_POR_SLOT
    return [inicio, inicio + dur * 60 * 1000] as const
  })

  const cierre = fechaHoraAR(fecha, '00:00').getTime() + HORA_CIERRE * 60 * 60 * 1000

  return slotsDelDia().filter(hora => {
    const inicio = fechaHoraAR(fecha, hora).getTime()
    const fin = inicio + duracionPedidaMinutos * 60 * 1000

    if (inicio < minimo.getTime()) return false
    if (inicio > tope.getTime()) return false
    // El turno tiene que terminar antes del cierre.
    if (fin > cierre) return false

    return !rangos.some(([ocupadoIni, ocupadoFin]) => inicio < ocupadoFin && fin > ocupadoIni)
  })
}

export type MotivoRechazo =
  | 'fecha_invalida'
  | 'hora_invalida'
  | 'dia_no_habil'
  | 'muy_pronto'
  | 'muy_lejos'
  | 'ocupado'

/**
 * Validación final, la que corre en el servidor antes de insertar. Devuelve
 * null si el turno se puede tomar, o el motivo del rechazo.
 */
export function validarReserva(
  fecha: string,
  hora: string,
  duracionMinutos: number,
  ocupados: Ocupacion[],
  ahora: Date = new Date()
): MotivoRechazo | null {
  if (!esFechaValida(fecha)) return 'fecha_invalida'
  if (!esHoraValida(hora)) return 'hora_invalida'
  if (!esDiaHabil(fecha)) return 'dia_no_habil'

  const inicio = fechaHoraAR(fecha, hora).getTime()
  const minimo = ahora.getTime() + ANTICIPACION_MINIMA_HORAS * 60 * 60 * 1000
  const tope = ahora.getTime() + DIAS_MAXIMOS_A_FUTURO * 24 * 60 * 60 * 1000

  if (inicio < minimo) return 'muy_pronto'
  if (inicio > tope) return 'muy_lejos'

  if (!slotsLibres(fecha, ocupados, duracionMinutos, ahora).includes(hora)) return 'ocupado'

  return null
}

export const MENSAJE_RECHAZO: Record<MotivoRechazo, string> = {
  fecha_invalida: 'La fecha no es válida.',
  hora_invalida: 'Ese horario no está dentro de la atención del consultorio.',
  dia_no_habil: 'El consultorio atiende de lunes a viernes.',
  muy_pronto: `Los turnos se piden con al menos ${ANTICIPACION_MINIMA_HORAS} horas de anticipación.`,
  muy_lejos: `Solo se puede reservar hasta ${DIAS_MAXIMOS_A_FUTURO} días para adelante.`,
  ocupado: 'Ese horario se acaba de ocupar. Elegí otro, por favor.',
}
