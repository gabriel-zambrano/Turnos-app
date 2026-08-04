import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import {
  FORMAS_PAGO, CONDICIONES_VENTA, FORMA_PAGO_A_CONDICION_VENTA,
  sumarMontos, subtotalItem, calcularTotales, desagregarIva,
  condicionVentaDominante, agruparPagos, esFormaPagoValida,
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
