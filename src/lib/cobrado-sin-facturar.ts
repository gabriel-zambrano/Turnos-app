/**
 * Cobros marcados para facturar que todavía no tienen factura emitida.
 *
 * En agosto de 2026 quedaron $ 751.000 en esta situación y nadie lo vio:
 * la información estaba, pero repartida turno por turno. Esta función la
 * resume para mostrarla arriba de la Caja. Solo calcula con lo que la
 * pantalla ya cargó; no consulta nada.
 */

export interface PagoParaFacturar {
  monto: number
  requiere_factura: boolean | null
}

export interface IngresoParaFacturar {
  id: string
  monto: number
  requiere_factura?: boolean | null
}

export interface FacturaEmitida {
  cita_id?: string | null
  ingreso_manual_id?: string | null
}

export function cobradoSinFacturar(
  citas: { id: string }[],
  pagosPorCita: Record<string, PagoParaFacturar[]>,
  manuales: IngresoParaFacturar[],
  facturas: FacturaEmitida[]
): { cantidad: number; monto: number } {
  const citasFacturadas = new Set(facturas.map(f => f.cita_id).filter(Boolean) as string[])
  const ingresosFacturados = new Set(facturas.map(f => f.ingreso_manual_id).filter(Boolean) as string[])
  let cantidad = 0
  let monto = 0

  for (const c of citas) {
    if (citasFacturadas.has(c.id)) continue
    const aFacturar = (pagosPorCita[c.id] ?? []).filter(p => p.requiere_factura)
    if (aFacturar.length === 0) continue
    cantidad++
    monto += aFacturar.reduce((s, p) => s + Number(p.monto || 0), 0)
  }
  for (const m of manuales) {
    if (!m.requiere_factura || ingresosFacturados.has(m.id)) continue
    cantidad++
    monto += Number(m.monto || 0)
  }
  return { cantidad, monto }
}
