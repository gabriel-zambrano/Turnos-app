import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lo ya cobrado de un turno, leído de `pagos` en el momento de cobrar.
 *
 * Se consulta al confirmar, no se toma de la pantalla: la lista puede estar
 * desactualizada (otro usuario cobró, o un intento anterior sí se guardó).
 * Solo lee; la escritura sigue siendo `registrarPago`.
 */
export async function cobradoDeCita(
  supabase: SupabaseClient,
  tenantId: string,
  citaId: string
): Promise<{ total: number; error: string | null }> {
  const { data, error } = await supabase
    .from('pagos')
    .select('monto')
    .eq('tenant_id', tenantId)
    .eq('cita_id', citaId)
  if (error) return { total: 0, error: error.message }
  const total = (data ?? []).reduce((s, p: { monto: number | string }) => s + Number(p.monto || 0), 0)
  return { total, error: null }
}

/** Formato de moneda de la app: "$ 85.000". */
export function formatoPesos(n: number): string {
  return '$ ' + Math.round(n).toLocaleString('es-AR')
}

/**
 * Si hay que frenar y preguntar antes de registrar otro pago.
 * Un turno con dinero cobrado puede recibir otro pago (seña, cuotas), así
 * que no se bloquea: se exige una confirmación explícita.
 */
export function requiereConfirmarPagoExtra(cobradoPrevio: number, yaConfirmado: boolean): boolean {
  return cobradoPrevio > 0 && !yaConfirmado
}

export function textoPagoPrevio(cobradoPrevio: number): string {
  return `Este turno ya tiene ${formatoPesos(cobradoPrevio)} cobrados. ¿Querés registrar otro pago?`
}
