import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * Pantallas ya migradas al sistema de diseño (Fase 4). Una vez migrada, una
 * pantalla no puede volver a tener colores fijos (rompen el tema oscuro),
 * emojis como íconos ni diálogos nativos del navegador.
 *
 * Al migrar una pantalla nueva, se agrega acá.
 */
const MIGRADAS = ['src/app/finanzas/page.tsx']

for (const archivo of MIGRADAS) {
  describe(`pantalla migrada: ${archivo}`, () => {
    const fuente = readFileSync(path.join(process.cwd(), archivo), 'utf8')
    const codigo = fuente.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

    it('sin colores hex fijos (salvo respaldo dentro de var())', () => {
      const hex = codigo.match(/(?<!var\(--[a-z0-9-]+,\s?)#[0-9a-fA-F]{6}\b|(?<!var\(--[a-z0-9-]+,\s?)'#[0-9a-fA-F]{3}'/g) ?? []
      expect(hex, `colores fijos: ${hex.join(' ')}`).toEqual([])
    })
    it('sin emojis como íconos', () => {
      // RegExp con flag 'u' por constructor: el proyecto compila a ES5 y no admite /u literal.
      const emojis = codigo.match(new RegExp('[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]', 'gu')) ?? []
      expect(emojis, `emojis: ${emojis.join(' ')}`).toEqual([])
    })
    it('sin alert() ni confirm() del navegador', () => {
      expect(codigo).not.toMatch(/(^|[^.\w])(alert|confirm)\(/)
    })
    it('sin texto menor a 12 px', () => {
      expect(codigo).not.toMatch(/fontSize:\s?(9|10|10\.5|11|11\.5)\b/)
    })
  })
}
