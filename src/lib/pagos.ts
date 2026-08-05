/**
 * Formas de pago y aritmética de dinero.
 *
 * Dos reglas que valen para todo el módulo:
 *
 * 1. La lista `FORMAS_PAGO` tiene que quedar idéntica al CHECK de la tabla
 *    `pagos` (migración 20260804120000). Si agregás una acá, agregala allá.
 *
 * 2. La plata se suma SIEMPRE en centavos enteros. Sumar floats y redondear
 *    al final produce diferencias de un centavo que ARCA rechaza con el
 *    error 10048 (ImpTotal != ImpNeto + ImpIVA).
 */

export const FORMAS_PAGO = [
  'Efectivo',
  'Tarjeta de Débito',
  'Tarjeta de Crédito',
  'Transferencia',
  'Cheque',
  'Mercado Pago',
  'Obra Social',
  'Otro',
] as const

export type FormaPago = (typeof FORMAS_PAGO)[number]

/**
 * Condiciones de venta que acepta ARCA. Son las que ya usaba
 * /api/facturacion/emitir; no se pueden inventar valores nuevos.
 */
export const CONDICIONES_VENTA = [
  'Contado',
  'Tarjeta de Débito',
  'Tarjeta de Crédito',
  'Transferencia Bancaria',
  'Cuenta Corriente',
  'Cheque',
  'Otra',
] as const

/**
 * Mapa forma de pago interna → condición de venta fiscal.
 *
 * ARCA acepta UNA sola condición de venta por comprobante. Cuando el paciente
 * paga con varios medios, el comprobante lleva la condición del medio con el
 * que más pagó (ver `condicionVentaDominante`) y el desglose real queda en
 * `factura_pagos`, impreso como bloque informativo no fiscal.
 */
export const FORMA_PAGO_A_CONDICION_VENTA: Record<FormaPago, string> = {
  'Efectivo': 'Contado',
  'Tarjeta de Débito': 'Tarjeta de Débito',
  'Tarjeta de Crédito': 'Tarjeta de Crédito',
  'Transferencia': 'Transferencia Bancaria',
  'Cheque': 'Cheque',
  'Mercado Pago': 'Transferencia Bancaria',
  'Obra Social': 'Cuenta Corriente',
  'Otro': 'Otra',
}

export function esFormaPagoValida(v: unknown): v is FormaPago {
  return typeof v === 'string' && (FORMAS_PAGO as readonly string[]).includes(v)
}

/** Convierte a centavos enteros. Redondea al centavo más cercano. */
export function aCentavos(monto: number): number {
  return Math.round(Number(monto) * 100)
}

/** Vuelve de centavos enteros a pesos con 2 decimales exactos. */
export function aPesos(centavos: number): number {
  return Math.round(centavos) / 100
}

/**
 * Suma montos sin drift de punto flotante.
 * `sumarMontos([0.1, 0.2])` da 0.3, no 0.30000000000000004.
 */
export function sumarMontos(montos: number[]): number {
  return aPesos(montos.reduce((acc, m) => acc + aCentavos(m), 0))
}

export interface ItemFacturable {
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento_pct?: number
}

export interface ItemCalculado extends ItemFacturable {
  subtotal: number
}

/** Subtotal de un renglón: cantidad × precio − descuento, redondeado al centavo. */
export function subtotalItem(item: ItemFacturable): number {
  const bruto = Number(item.cantidad) * Number(item.precio_unitario)
  const factor = 1 - Number(item.descuento_pct ?? 0) / 100
  return aPesos(Math.round(bruto * factor * 100))
}

/**
 * Calcula los renglones y el total del comprobante.
 *
 * El total es la suma de los subtotales YA redondeados — no el redondeo de la
 * suma. Así el total impreso en el PDF coincide exacto con la columna de
 * subtotales, que es lo que mira el contador (y lo que valida ARCA).
 */
export function calcularTotales(items: ItemFacturable[]): { items: ItemCalculado[]; total: number } {
  const calculados = items.map(i => ({ ...i, subtotal: subtotalItem(i) }))
  return { items: calculados, total: sumarMontos(calculados.map(i => i.subtotal)) }
}

/**
 * Desagrega IVA sobre un total, en centavos, garantizando neto + iva == total.
 *
 * Se calcula el neto y el IVA sale por diferencia. Al revés (calcular el IVA
 * y sumarlo) el redondeo puede dar un centavo de más y ARCA rechaza.
 */
export function desagregarIva(total: number, alicuota: number): { neto: number; iva: number; total: number } {
  const totalCent = aCentavos(total)
  if (!alicuota || alicuota <= 0) {
    return { neto: aPesos(totalCent), iva: 0, total: aPesos(totalCent) }
  }
  const netoCent = Math.round(totalCent / (1 + alicuota / 100))
  return {
    neto: aPesos(netoCent),
    iva: aPesos(totalCent - netoCent),
    total: aPesos(totalCent),
  }
}

export interface PagoLinea {
  forma_pago: string
  monto: number
  /**
   * Decisión tomada al cobrar. `undefined`/`null` en los pagos anteriores a
   * esta funcionalidad: para esos se cae al criterio por medio de pago.
   */
  requiere_factura?: boolean | null
}

/**
 * Condición de venta a declarar ante ARCA cuando hay pago dividido:
 * la del medio con el que más se pagó. Ante empate, gana el orden de
 * `FORMAS_PAGO` (determinista, para que dos emisiones iguales no difieran).
 */
export function condicionVentaDominante(pagos: PagoLinea[]): string {
  if (!pagos.length) return 'Contado'

  const porForma = new Map<string, number>()
  for (const p of pagos) {
    porForma.set(p.forma_pago, (porForma.get(p.forma_pago) ?? 0) + aCentavos(p.monto))
  }

  let ganadora = ''
  let maxCent = -1
  for (const forma of FORMAS_PAGO) {
    const cent = porForma.get(forma)
    if (cent !== undefined && cent > maxCent) {
      maxCent = cent
      ganadora = forma
    }
  }

  if (!ganadora) return 'Contado'
  return FORMA_PAGO_A_CONDICION_VENTA[ganadora as FormaPago] ?? 'Contado'
}

/**
 * Medios de pago que se facturan por defecto: los que dejan rastro bancario.
 * Cada clínica lo ajusta en `arca_config.formas_pago_facturables`.
 */
export const FORMAS_PAGO_FACTURABLES_DEFAULT: string[] = ['Transferencia', 'Tarjeta de Crédito']

/**
 * Sugerencia con la que la UI pre-marca el check "se factura" al registrar
 * un cobro. Es solo el valor inicial: la decisión final la toma el
 * profesional y queda guardada en `pagos.requiere_factura`.
 */
export function sugerirRequiereFactura(
  formaPago: string,
  formasFacturables: string[] = FORMAS_PAGO_FACTURABLES_DEFAULT
): boolean {
  // Sin criterio configurado, la clínica factura todo.
  if (!formasFacturables || formasFacturables.length === 0) return true
  return formasFacturables.includes(formaPago)
}

export interface DesgloseFacturable {
  /** Total cobrado, sin importar el medio. */
  total: number
  /** Porción cobrada con medios que la clínica factura. */
  facturable: number
  /** Porción cobrada con medios que la clínica NO factura. */
  noFacturable: number
  /** Formas de pago presentes que no se facturan (para avisarle al usuario). */
  formasNoFacturables: string[]
  /** true si hay algo facturable y algo que no: se factura solo una parte. */
  esParcial: boolean
  /** true si no hay nada facturable con el criterio de la clínica. */
  nadaFacturable: boolean
}

/**
 * Separa un cobro entre lo que se factura y lo que no.
 *
 * Manda la marca `requiere_factura` que quedó guardada al registrar cada
 * pago, NO el medio de pago. Así un cobro en efectivo que el paciente pidió
 * facturar se factura, y cambiar después el criterio de la clínica no altera
 * cómo se trataron los cobros ya hechos.
 *
 * Los pagos sin la marca (cargados antes de que existiera) caen al criterio
 * por medio de pago, para no cambiarles el comportamiento.
 */
export function desglosarFacturable(
  pagos: PagoLinea[],
  formasFacturables: string[] = FORMAS_PAGO_FACTURABLES_DEFAULT
): DesgloseFacturable {
  const total = sumarMontos(pagos.map(p => p.monto))

  const seFactura = (p: PagoLinea) => p.requiere_factura !== undefined && p.requiere_factura !== null
    ? p.requiere_factura
    : sugerirRequiereFactura(p.forma_pago, formasFacturables)

  const siFactura = pagos.filter(seFactura)
  const noFactura = pagos.filter(p => !seFactura(p))

  const facturable = sumarMontos(siFactura.map(p => p.monto))
  const noFacturable = sumarMontos(noFactura.map(p => p.monto))

  const formasNoFacturables: string[] = []
  for (const p of noFactura) {
    if (!formasNoFacturables.includes(p.forma_pago)) formasNoFacturables.push(p.forma_pago)
  }

  return {
    total,
    facturable,
    noFacturable,
    formasNoFacturables,
    esParcial: facturable > 0 && noFacturable > 0,
    nadaFacturable: facturable <= 0,
  }
}

/** Los pagos que sí se facturan, para derivar de ahí la condición de venta. */
export function pagosFacturables(
  pagos: PagoLinea[],
  formasFacturables: string[] = FORMAS_PAGO_FACTURABLES_DEFAULT
): PagoLinea[] {
  return pagos.filter(p => p.requiere_factura !== undefined && p.requiere_factura !== null
    ? p.requiere_factura
    : sugerirRequiereFactura(p.forma_pago, formasFacturables))
}

/** Agrupa los pagos por forma para el bloque informativo del PDF. */
export function agruparPagos(pagos: PagoLinea[]): PagoLinea[] {
  const porForma = new Map<string, number>()
  for (const p of pagos) {
    porForma.set(p.forma_pago, (porForma.get(p.forma_pago) ?? 0) + aCentavos(p.monto))
  }
  const salida: PagoLinea[] = []
  porForma.forEach((cent, forma_pago) => salida.push({ forma_pago, monto: aPesos(cent) }))
  return salida
}
