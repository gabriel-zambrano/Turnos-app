import type { SupabaseClient } from '@supabase/supabase-js'
import { registrarPago as registrarPagoReal, type DatosPago } from './registrar-pago'
import { cobradoDeCita, formatoPesos } from './cobro-previo'

/**
 * Cobro de un turno: la secuencia única que usan Agenda, Dashboard y Ficha.
 *
 * Antes cada pantalla tenía su copia, y cada arreglo había que hacerlo tres
 * veces (el 30/09/2026 una de las copias duplicaba cobros y las otras no).
 * Esta función no escribe nada por su cuenta: el pago sigue entrando por
 * `registrarPago` y el cierre del turno por la acción que se le pase.
 *
 * Secuencia:
 *   1. caja del día cerrada            → no registra nada
 *   2. no se pudo leer lo ya cobrado   → no registra nada
 *   3. ya hay cobros y no se confirmó  → pide confirmación
 *   4. registra el pago                → si falla, no hay nada guardado
 *   5. cierra el turno                 → si falla, el pago YA está guardado
 *
 * Con `pago: null` solo cierra el turno (la Ficha lo usa cuando el turno ya
 * tiene cobro y únicamente falta marcarlo asistido).
 */

export type ResultadoCobro =
  | { tipo: 'caja_cerrada' }
  | { tipo: 'sin_verificar' }
  | { tipo: 'requiere_confirmacion'; cobradoPrevio: number }
  | { tipo: 'pago_rechazado'; motivo: string }
  | { tipo: 'cobrado'; monto: number }
  | { tipo: 'cobrado_sin_cerrar'; monto: number }
  | { tipo: 'cerrado' }
  | { tipo: 'cierre_fallido' }

export interface PagoDeTurno {
  monto: number
  formaPago: string
  requiereFactura: boolean
  origen: DatosPago['origen']
  nota?: string
}

export interface EntradaCobroTurno {
  supabase: SupabaseClient
  tenantId: string
  citaId: string
  pacienteId: string
  /** Fecha (YYYY-MM-DD) cuya caja se verifica. Sin fecha no se verifica. */
  fechaCaja?: string
  /** null = solo cerrar el turno, sin registrar pago. */
  pago: PagoDeTurno | null
  /** El usuario ya vio el aviso de cobro previo y eligió seguir. */
  confirmadoPagoExtra?: boolean
  cerrarTurno: (citaId: string) => Promise<{ success: boolean }>
  /** Inyectable para tests. */
  registrarPago?: typeof registrarPagoReal
}

export async function cobrarTurno(e: EntradaCobroTurno): Promise<ResultadoCobro> {
  const registrar = e.registrarPago ?? registrarPagoReal

  if (e.pago) {
    const [caja, previo] = await Promise.all([
      e.fechaCaja
        ? e.supabase.from('cajas_diarias').select('estado')
            .eq('tenant_id', e.tenantId).eq('fecha', e.fechaCaja).maybeSingle()
        : Promise.resolve({ data: null }),
      cobradoDeCita(e.supabase, e.tenantId, e.citaId),
    ])
    if ((caja as { data: { estado?: string } | null }).data?.estado === 'cerrada') return { tipo: 'caja_cerrada' }
    if (previo.error) return { tipo: 'sin_verificar' }
    if (previo.total > 0 && !e.confirmadoPagoExtra) {
      return { tipo: 'requiere_confirmacion', cobradoPrevio: previo.total }
    }

    const { error } = await registrar(e.supabase, {
      tenantId: e.tenantId,
      pacienteId: e.pacienteId,
      citaId: e.citaId,
      formaPago: e.pago.formaPago,
      monto: e.pago.monto,
      requiereFactura: e.pago.requiereFactura,
      origen: e.pago.origen,
      nota: e.pago.nota,
    })
    if (error) return { tipo: 'pago_rechazado', motivo: error }
  }

  let cerro = false
  try {
    cerro = (await e.cerrarTurno(e.citaId)).success
  } catch {
    cerro = false
  }

  if (e.pago) {
    return cerro
      ? { tipo: 'cobrado', monto: e.pago.monto }
      : { tipo: 'cobrado_sin_cerrar', monto: e.pago.monto }
  }
  return cerro ? { tipo: 'cerrado' } : { tipo: 'cierre_fallido' }
}

export interface MensajeCobro {
  texto: string
  tono: 'exito' | 'error'
  /**
   * Si el formulario tiene que cerrarse. Siempre true cuando el pago quedó
   * guardado, aunque algo haya fallado después: un formulario abierto invita
   * a reintentar y duplicar el cobro.
   */
  cerrarFormulario: boolean
}

/** Texto para el usuario. null para `requiere_confirmacion`, que se muestra como aviso en el formulario. */
export function mensajeCobro(r: ResultadoCobro, fidelizacionHabilitada: boolean): MensajeCobro | null {
  switch (r.tipo) {
    case 'caja_cerrada':
      return { texto: 'La caja de este día está cerrada. Reabrila desde Finanzas para registrar el cobro.', tono: 'error', cerrarFormulario: false }
    case 'sin_verificar':
      return { texto: 'No se pudo verificar si el turno ya tiene cobros. No se registró nada; probá de nuevo.', tono: 'error', cerrarFormulario: false }
    case 'requiere_confirmacion':
      return null
    case 'pago_rechazado':
      return { texto: `No se registró el cobro. ${r.motivo}. Podés volver a intentarlo.`, tono: 'error', cerrarFormulario: false }
    case 'cobrado':
      return {
        texto: fidelizacionHabilitada
          ? `Cobro de ${formatoPesos(r.monto)} registrado · puntos acreditados`
          : `Cobro de ${formatoPesos(r.monto)} registrado · turno cerrado`,
        tono: 'exito', cerrarFormulario: true,
      }
    case 'cobrado_sin_cerrar':
      return {
        texto: `El cobro de ${formatoPesos(r.monto)} quedó registrado. No se pudo marcar el turno como asistido; hacelo desde la agenda. No vuelvas a cobrarlo.`,
        tono: 'error', cerrarFormulario: true,
      }
    case 'cerrado':
      return { texto: fidelizacionHabilitada ? 'Turno cerrado · puntos acreditados' : 'Turno cerrado', tono: 'exito', cerrarFormulario: true }
    case 'cierre_fallido':
      return { texto: 'No se pudo marcar el turno como asistido. Probá de nuevo; no se registró ningún cobro.', tono: 'error', cerrarFormulario: false }
  }
}
