import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import {
  FORMAS_PAGO, CONDICIONES_VENTA, FORMA_PAGO_A_CONDICION_VENTA,
  FORMAS_PAGO_FACTURABLES_DEFAULT,
  sumarMontos, subtotalItem, calcularTotales, desagregarIva,
  condicionVentaDominante, agruparPagos, esFormaPagoValida,
  desglosarFacturable, pagosFacturables, sugerirRequiereFactura,
} from './pagos'

describe('Aritmética de dinero', () => {
  it('suma sin drift de punto flotante', () => {
    expect(sumarMontos([0.1, 0.2])).toBe(0.3)
    expect(0.1 + 0.2).not.toBe(0.3) // el bug que estamos evitando
  })

  it('suma montos reales de consultorio sin perder centavos', () => {
    expect(sumarMontos([15000.33, 8250.71, 4999.99])).toBe(28251.03)
  })

  it('calcula el subtotal con descuento', () => {
    expect(subtotalItem({ descripcion: 'Limpieza', cantidad: 1, precio_unitario: 20000 })).toBe(20000)
    expect(subtotalItem({ descripcion: 'Caries', cantidad: 3, precio_unitario: 12500 })).toBe(37500)
    expect(subtotalItem({ descripcion: 'Ortodoncia', cantidad: 1, precio_unitario: 45000, descuento_pct: 10 })).toBe(40500)
  })

  it('el total es la suma de subtotales redondeados, no el redondeo de la suma', () => {
    // Tres renglones con decimales feos: si redondearas al final darías 0.01 distinto
    const { items, total } = calcularTotales([
      { descripcion: 'A', cantidad: 3, precio_unitario: 33.335 },
      { descripcion: 'B', cantidad: 3, precio_unitario: 33.335 },
      { descripcion: 'C', cantidad: 3, precio_unitario: 33.335 },
    ])
    expect(total).toBe(sumarMontos(items.map(i => i.subtotal)))
  })
})

describe('Desagregación de IVA (requisito de ARCA)', () => {
  const casos = [10.5, 21]
  const totales = [1, 33.33, 1000, 15750.55, 28251.03, 999999.99]

  for (const alicuota of casos) {
    for (const total of totales) {
      it(`neto + iva == total exacto (total ${total}, alícuota ${alicuota}%)`, () => {
        const r = desagregarIva(total, alicuota)
        // ARCA rechaza con error 10048 si esto no cuadra al centavo
        expect(sumarMontos([r.neto, r.iva])).toBe(r.total)
        expect(r.total).toBe(total)
      })
    }
  }

  it('con alícuota 0 no desagrega (caso Factura C / monotributo)', () => {
    const r = desagregarIva(50000, 0)
    expect(r.neto).toBe(50000)
    expect(r.iva).toBe(0)
  })
})

describe('Formas de pago', () => {
  it('toda forma de pago mapea a una condición de venta que ARCA acepta', () => {
    for (const forma of FORMAS_PAGO) {
      const cond = FORMA_PAGO_A_CONDICION_VENTA[forma]
      expect(cond, `falta el mapeo de "${forma}"`).toBeTruthy()
      expect(CONDICIONES_VENTA as readonly string[]).toContain(cond)
    }
  })

  it('la lista de código coincide con el CHECK de la tabla `pagos`', () => {
    // Si alguien agrega una forma en un lado y no en el otro, el INSERT
    // explota en producción con un error de constraint. Esto lo detecta antes.
    const sql = readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20260804120000_pagos_y_multitratamiento.sql'),
      'utf-8'
    )
    const check = sql.match(/forma_pago\s+TEXT NOT NULL CHECK \(forma_pago IN \(([\s\S]*?)\)\)/)
    expect(check, 'no se encontró el CHECK de forma_pago en la migración').toBeTruthy()
    const enSql = (check![1].match(/'[^']+'/g) || []).map(s => s.slice(1, -1)).sort()
    expect(enSql).toEqual([...FORMAS_PAGO].sort())
  })

  it('valida formas de pago desconocidas', () => {
    expect(esFormaPagoValida('Efectivo')).toBe(true)
    expect(esFormaPagoValida('Bitcoin')).toBe(false)
    expect(esFormaPagoValida(null)).toBe(false)
  })
})

describe('Pago dividido → condición de venta única', () => {
  it('sin pagos declara Contado', () => {
    expect(condicionVentaDominante([])).toBe('Contado')
  })

  it('un solo medio usa su mapeo', () => {
    expect(condicionVentaDominante([{ forma_pago: 'Transferencia', monto: 50000 }]))
      .toBe('Transferencia Bancaria')
  })

  it('con pago mixto gana el medio con el que más se pagó', () => {
    const cond = condicionVentaDominante([
      { forma_pago: 'Efectivo', monto: 20000 },
      { forma_pago: 'Tarjeta de Crédito', monto: 30000 },
    ])
    expect(cond).toBe('Tarjeta de Crédito')
  })

  it('ante empate el resultado es determinista', () => {
    const pagos = [
      { forma_pago: 'Tarjeta de Crédito', monto: 25000 },
      { forma_pago: 'Efectivo', monto: 25000 },
    ]
    expect(condicionVentaDominante(pagos)).toBe(condicionVentaDominante([...pagos].reverse()))
  })

  it('suma varios pagos del mismo medio antes de comparar', () => {
    const cond = condicionVentaDominante([
      { forma_pago: 'Efectivo', monto: 15000 },
      { forma_pago: 'Efectivo', monto: 15000 },
      { forma_pago: 'Tarjeta de Débito', monto: 25000 },
    ])
    expect(cond).toBe('Contado') // 30.000 en efectivo > 25.000 en débito
  })

  it('agrupa el desglose por forma para el PDF', () => {
    const g = agruparPagos([
      { forma_pago: 'Efectivo', monto: 10000.5 },
      { forma_pago: 'Efectivo', monto: 5000.25 },
      { forma_pago: 'Cheque', monto: 3000 },
    ])
    expect(g).toHaveLength(2)
    expect(g.find(p => p.forma_pago === 'Efectivo')!.monto).toBe(15000.75)
  })
})

describe('Qué medios de pago se facturan', () => {
  const OK = FORMAS_PAGO_FACTURABLES_DEFAULT // Transferencia + Tarjeta de Crédito

  it('por defecto factura transferencia y tarjeta de crédito', () => {
    expect(OK).toContain('Transferencia')
    expect(OK).toContain('Tarjeta de Crédito')
    expect(OK).not.toContain('Efectivo')
    expect(OK).not.toContain('Mercado Pago')
  })

  it('con todo el cobro facturable, se factura el total', () => {
    const d = desglosarFacturable([{ forma_pago: 'Transferencia', monto: 50000 }], OK)
    expect(d.facturable).toBe(50000)
    expect(d.noFacturable).toBe(0)
    expect(d.esParcial).toBe(false)
    expect(d.nadaFacturable).toBe(false)
  })

  it('con cobro mixto separa la porción facturable', () => {
    const d = desglosarFacturable([
      { forma_pago: 'Efectivo', monto: 30000 },
      { forma_pago: 'Transferencia', monto: 20000 },
    ], OK)
    expect(d.total).toBe(50000)
    expect(d.facturable).toBe(20000)   // solo la transferencia
    expect(d.noFacturable).toBe(30000)
    expect(d.esParcial).toBe(true)
    expect(d.formasNoFacturables).toEqual(['Efectivo'])
  })

  it('marca como no facturable un cobro 100% en efectivo o Mercado Pago', () => {
    const d = desglosarFacturable([
      { forma_pago: 'Efectivo', monto: 20000 },
      { forma_pago: 'Mercado Pago', monto: 15000 },
    ], OK)
    expect(d.facturable).toBe(0)
    expect(d.nadaFacturable).toBe(true)
    expect(d.esParcial).toBe(false) // no es parcial: no hay nada que facturar
    expect(d.formasNoFacturables).toEqual(['Efectivo', 'Mercado Pago'])
  })

  it('no repite una forma de pago en el aviso aunque haya varios pagos', () => {
    const d = desglosarFacturable([
      { forma_pago: 'Efectivo', monto: 1000 },
      { forma_pago: 'Efectivo', monto: 2000 },
    ], OK)
    expect(d.formasNoFacturables).toEqual(['Efectivo'])
  })

  it('una lista vacía significa "facturar todo" (clínica sin filtro)', () => {
    const d = desglosarFacturable([{ forma_pago: 'Efectivo', monto: 40000 }], [])
    expect(d.facturable).toBe(40000)
    expect(d.nadaFacturable).toBe(false)
    expect(d.esParcial).toBe(false)
  })

  it('cada clínica puede definir su propio criterio', () => {
    // Una clínica que también factura Mercado Pago
    const d = desglosarFacturable([
      { forma_pago: 'Mercado Pago', monto: 25000 },
      { forma_pago: 'Efectivo', monto: 5000 },
    ], ['Transferencia', 'Tarjeta de Crédito', 'Mercado Pago'])
    expect(d.facturable).toBe(25000)
    expect(d.esParcial).toBe(true)
  })

  it('suma en centavos: la porción facturable no pierde decimales', () => {
    const d = desglosarFacturable([
      { forma_pago: 'Transferencia', monto: 10000.33 },
      { forma_pago: 'Tarjeta de Crédito', monto: 5000.71 },
      { forma_pago: 'Efectivo', monto: 999.99 },
    ], OK)
    expect(d.facturable).toBe(15001.04)
    expect(sumarMontos([d.facturable, d.noFacturable])).toBe(d.total)
  })

  it('la condición de venta sale solo de los pagos que se facturan', () => {
    // Aunque el efectivo sea el monto mayor, el comprobante no puede
    // declarar "Contado" si se emitió por la transferencia.
    const pagos = [
      { forma_pago: 'Efectivo', monto: 90000 },
      { forma_pago: 'Transferencia', monto: 10000 },
    ]
    expect(condicionVentaDominante(pagos)).toBe('Contado')
    expect(condicionVentaDominante(pagosFacturables(pagos, OK))).toBe('Transferencia Bancaria')
  })

  it('sin criterio configurado, pagosFacturables devuelve todos', () => {
    const pagos = [{ forma_pago: 'Efectivo', monto: 100 }]
    expect(pagosFacturables(pagos, [])).toEqual(pagos)
  })
})

describe('La marca al cobrar manda sobre el medio de pago', () => {
  const OK = FORMAS_PAGO_FACTURABLES_DEFAULT

  it('sugiere facturar según el medio, como valor inicial del check', () => {
    expect(sugerirRequiereFactura('Transferencia', OK)).toBe(true)
    expect(sugerirRequiereFactura('Tarjeta de Crédito', OK)).toBe(true)
    expect(sugerirRequiereFactura('Efectivo', OK)).toBe(false)
    expect(sugerirRequiereFactura('Mercado Pago', OK)).toBe(false)
  })

  it('sin criterio configurado sugiere facturar todo', () => {
    expect(sugerirRequiereFactura('Efectivo', [])).toBe(true)
  })

  it('el paciente que pagó en efectivo y pide factura, se factura', () => {
    // El caso que motivó la funcionalidad: reintegro de obra social.
    const d = desglosarFacturable([
      { forma_pago: 'Efectivo', monto: 30000, requiere_factura: true },
    ], OK)
    expect(d.facturable).toBe(30000)
    expect(d.nadaFacturable).toBe(false)
  })

  it('una transferencia marcada como no facturable no se factura', () => {
    const d = desglosarFacturable([
      { forma_pago: 'Transferencia', monto: 50000, requiere_factura: false },
    ], OK)
    expect(d.facturable).toBe(0)
    expect(d.nadaFacturable).toBe(true)
    expect(d.formasNoFacturables).toEqual(['Transferencia'])
  })

  it('mezcla marcas explícitas de distinto signo', () => {
    const d = desglosarFacturable([
      { forma_pago: 'Efectivo', monto: 20000, requiere_factura: true },
      { forma_pago: 'Transferencia', monto: 30000, requiere_factura: false },
    ], OK)
    expect(d.facturable).toBe(20000)   // el efectivo que el paciente pidió
    expect(d.noFacturable).toBe(30000) // la transferencia excluida a mano
    expect(d.esParcial).toBe(true)
  })

  it('los pagos viejos sin marca caen al criterio por medio de pago', () => {
    // Retrocompatibilidad: los cargados antes de que existiera la columna.
    const d = desglosarFacturable([
      { forma_pago: 'Transferencia', monto: 10000 },
      { forma_pago: 'Efectivo', monto: 5000, requiere_factura: null },
    ], OK)
    expect(d.facturable).toBe(10000)
    expect(d.noFacturable).toBe(5000)
  })

  it('la condición de venta sale de los pagos efectivamente facturados', () => {
    const pagos = [
      { forma_pago: 'Efectivo', monto: 90000, requiere_factura: true },
      { forma_pago: 'Transferencia', monto: 10000, requiere_factura: false },
    ]
    // Se factura el efectivo, así que el comprobante declara Contado
    expect(condicionVentaDominante(pagosFacturables(pagos, OK))).toBe('Contado')
  })

  it('cambiar el criterio de la clínica no altera cobros ya marcados', () => {
    const pagos = [{ forma_pago: 'Efectivo', monto: 25000, requiere_factura: true }]
    // Aunque la clínica pase a facturar solo cheques, este cobro ya estaba decidido
    expect(desglosarFacturable(pagos, ['Cheque']).facturable).toBe(25000)
  })
})
