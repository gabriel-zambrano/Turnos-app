import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

/**
 * Rutas públicas con token en la URL (portal del paciente, firma de
 * consentimientos, etc.). Usan service_role y no tienen sesión: el token
 * secreto ES la autorización. Si alguna busca por `id` el valor de la URL, el
 * id (que no es secreto: aparece en /pacientes/<id>) pasa a abrir la puerta.
 *
 * Pasó el 01/10/2026 en /api/paciente/[token] (commit a1e5b2b): con el id de
 * un paciente se leían y escribían sus datos clínicos sin login.
 */
function rutasConToken(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) out.push(...rutasConToken(p))
    else if (n === 'route.ts' && p.includes('[token]')) out.push(p)
  }
  return out
}

const RUTAS = rutasConToken(path.join(process.cwd(), 'src/app/api'))

describe('rutas públicas con [token]', () => {
  it('existen (si esto falla, la búsqueda de archivos dejó de encontrarlas)', () => {
    expect(RUTAS.length).toBeGreaterThanOrEqual(4)
  })
  for (const ruta of RUTAS) {
    it(`${path.relative(process.cwd(), ruta)} no busca por id el valor de la URL`, () => {
      const fuente = readFileSync(ruta, 'utf8')
      const porId = fuente.match(/\.eq\(\s*'id'\s*,\s*(token|cleanToken|params\.token)\s*\)/g) ?? []
      expect(porId, `busca por id: ${porId.join(' ')}`).toEqual([])
    })
  }
})
