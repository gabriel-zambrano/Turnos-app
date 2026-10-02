import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * Guarda del sistema de diseño.
 *
 * 1. Cada token semántico existe en :root y en [data-theme="dark"]. Un token
 *    definido en un solo tema deja el modo oscuro roto en todo lugar que lo use.
 * 2. Los grises y colores de texto llegan a 4,5:1 (WCAG AA) sobre los fondos
 *    de la app, en los dos temas. --text-muted llegó a estar en 2,58:1.
 */
const css = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')

function bloque(selector: string): string {
  const i = css.indexOf(selector + ' {')
  if (i < 0) throw new Error(`No se encontró ${selector}`)
  return css.slice(i, css.indexOf('\n}', i))
}
const root = bloque(':root')
const dark = bloque('[data-theme="dark"]')
const valor = (b: string, t: string) => new RegExp(`${t}:\\s*([^;]+);`).exec(b)?.[1].trim()

const SEMANTICOS = [
  '--accent', '--accent-hover', '--accent-soft', '--accent-contrast', '--focus-ring',
  '--success', '--success-soft', '--success-border', '--success-text',
  '--warning', '--warning-soft', '--warning-border', '--warning-text',
  '--danger', '--danger-soft', '--danger-border', '--danger-text',
  '--info', '--info-soft', '--text-muted', '--text-subtle',
  '--est-ausente-bg', '--est-ausente-color', '--shadow-pop', '--shadow-modal',
  '--success-contrast', '--danger-contrast', '--warning-contrast', '--warning-solid',
]

function lum(hex: string) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

describe('tokens en los dos temas', () => {
  for (const t of SEMANTICOS) {
    it(`${t} está en :root y en el tema oscuro`, () => {
      expect(valor(root, t), `${t} falta en :root`).toBeTruthy()
      expect(valor(dark, t), `${t} falta en [data-theme="dark"]`).toBeTruthy()
    })
  }
})

describe('contraste de texto ≥ 4,5:1', () => {
  const fondos = { claro: ['#ffffff', valor(root, '--bg-app')!], oscuro: ['#0f172a', valor(dark, '--bg-app')!] }
  const textos = ['--text-dark', '--text-muted', '--accent', '--success-text', '--warning-text', '--danger-text']
  for (const tema of ['claro', 'oscuro'] as const) {
    const b = tema === 'claro' ? root : dark
    for (const t of textos) {
      it(`${t} en tema ${tema}`, () => {
        const v = valor(b, t)!
        expect(v, `${t} tiene que ser un hex para poder medirlo`).toMatch(/^#[0-9a-fA-F]{6}$/)
        for (const f of fondos[tema]) expect(contraste(v, f), `${t} ${v} sobre ${f}`).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})

describe('foco visible', () => {
  it('existe una regla global :focus-visible', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/)
  })
  it('se respeta prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce')
  })
})

describe('texto sobre fondos sólidos ≥ 4,5:1', () => {
  const pares: [string, string][] = [
    ['--accent-contrast', '--accent'], ['--success-contrast', '--success'],
    ['--danger-contrast', '--danger'], ['--warning-contrast', '--warning-solid'],
  ]
  for (const [tema, b] of [['claro', root], ['oscuro', dark]] as const) {
    for (const [texto, fondo] of pares) {
      it(`${texto} sobre ${fondo} en tema ${tema}`, () => {
        const t = valor(b, texto)!, f = valor(b, fondo)!
        expect(t).toMatch(/^#[0-9a-fA-F]{6}$/)
        expect(f).toMatch(/^#[0-9a-fA-F]{6}$/)
        expect(contraste(t, f), `${t} sobre ${f}`).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})
