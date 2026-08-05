import type { SupabaseClient } from '@supabase/supabase-js'
import { sugerirRequiereFactura, FORMAS_PAGO_FACTURABLES_DEFAULT } from './pagos'

/**
 * Única puerta de entrada del dinero cobrado a un paciente.
 *
 * Antes había cinco pantallas escribiendo `citas.precio_cobrado` a mano
 * (cobro rápido de agenda y dashboard, ficha del paciente, saldar deuda,
 * editar precio). Eso tenía dos consecuencias malas:
 *
 *   1. Ninguna guardaba la forma de pago, así que esos cobros esquivaban el
 *      criterio de facturación de la clínica y se facturaban enteros.
 *   2. `precio_cobrado` lo recalcula el trigger desde `pagos`. Escribirlo a
 *      mano y después registrar un pago hacía desaparecer el monto anterior.
 *
 * Ahora todas registran acá. `citas.precio_cobrado` queda como columna
 * derivada, que nadie escribe directamente.
 */

export type OrigenPago =
  | 'detalle'
  | 'cobro_rapido'
  | 'ficha_paciente'
  | 'saldar_deuda'
  | 'sena_reserva'

export interface DatosPago {
  tenantId: string
  pacienteId: string
  citaId?: string | null
  formaPago: string
  monto: number
  origen: OrigenPago
  /**
   * Si se factura. Si no se pasa, se deduce del medio de pago según el
   * criterio de la clínica.
   */
  requiereFactura?: boolean
  /** Criterio de la clínica (`arca_config.formas_pago_facturables`). */
  formasFacturables?: string[]
  nota?: string
}

export async function registrarPago(
  supabase: SupabaseClient,
  d: DatosPago
): Promise<{ error: string | null }> {
  if (!(d.monto > 0)) return { error: 'El monto tiene que ser mayor a cero' }

  const requiere = d.requiereFactura ?? sugerirRequiereFactura(
    d.formaPago,
    d.formasFacturables ?? FORMAS_PAGO_FACTURABLES_DEFAULT
  )

  const { error } = await supabase.from('pagos').insert({
    tenant_id: d.tenantId,
    paciente_id: d.pacienteId,
    cita_id: d.citaId ?? null,
    forma_pago: d.formaPago,
    monto: d.monto,
    requiere_factura: requiere,
    origen: d.origen,
    nota: d.nota ?? null,
  })

  return { error: error?.message ?? null }
}

/**
 * Criterio de medios facturables de una clínica.
 * Si no tiene facturación configurada, devuelve el default del sistema.
 */
export async function formasFacturablesDe(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('arca_config')
    .select('formas_pago_facturables')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return data?.formas_pago_facturables ?? FORMAS_PAGO_FACTURABLES_DEFAULT
}
