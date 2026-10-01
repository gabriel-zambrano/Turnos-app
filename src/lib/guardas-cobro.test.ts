import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * Guarda de doble submit en los flujos de dinero.
 *
 * El 30/09/2026 el cobro de Agenda registró pagos duplicados: consultaba la
 * caja (un `await`) y recién después deshabilitaba el botón. Un doble click
 * entraba dos veces. Esta guarda exige que cada handler bloquee ANTES de su
 * primer `await`.
 */
const CASOS: { archivo: string; funcion: string; bloqueo: string }[] = [
  { archivo: 'src/app/agenda/page.tsx', funcion: 'async function guardarCobroExpress', bloqueo: 'cobrandoRef.current = true' },
  { archivo: 'src/app/dashboard/page.tsx', funcion: 'async function guardarRegistrarCobro', bloqueo: 'cobrandoRef.current = true' },
  { archivo: 'src/components/DetalleCitaCobro.tsx', funcion: 'async function agregarPago', bloqueo: 'pagandoRef.current = true' },
  { archivo: 'src/app/pacientes/[id]/page.tsx', funcion: 'const handleAprobarAsistencia = async', bloqueo: 'setProcesandoPuntos(true)' },
  { archivo: 'src/app/finanzas/page.tsx', funcion: 'async function confirmarSaldar', bloqueo: 'setSaving(true)' },
  { archivo: 'src/app/finanzas/page.tsx', funcion: 'async function emitirFacturaElectronica', bloqueo: 'emitiendoRef.current = true' },
]

function cuerpo(fuente: string, firma: string): string {
  const i = fuente.indexOf(firma)
  if (i < 0) throw new Error(`No se encontró "${firma}"`)
  // Hasta la siguiente función declarada al mismo nivel.
  const resto = fuente.slice(i + firma.length)
  const fin = resto.search(/\n  (async function|function|const [A-Za-z]+ = (async )?\()/)
  return fin < 0 ? resto : resto.slice(0, fin)
}

describe('guarda de doble submit en cobros y facturación', () => {
  for (const c of CASOS) {
    it(`${c.archivo} · ${c.funcion} bloquea antes del primer await`, () => {
      const fuente = readFileSync(path.join(process.cwd(), c.archivo), 'utf8')
      const f = cuerpo(fuente, c.funcion)
      const iBloqueo = f.indexOf(c.bloqueo)
      const iAwait = f.indexOf('await ')
      expect(iBloqueo, `falta "${c.bloqueo}"`).toBeGreaterThan(-1)
      expect(iAwait, 'la función no tiene await').toBeGreaterThan(-1)
      expect(iBloqueo).toBeLessThan(iAwait)
    })
  }

  it('ningún flujo de facturación usa alert() o confirm() del navegador', () => {
    const fuente = readFileSync(path.join(process.cwd(), 'src/app/finanzas/page.tsx'), 'utf8')
    const f = cuerpo(fuente, 'async function emitirFacturaElectronica')
    expect(f).not.toMatch(/(^|[^.\w])(alert|confirm)\(/)
  })
})
