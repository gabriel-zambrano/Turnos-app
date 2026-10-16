import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ═══════════════════════════════════════════════════════════════════════════
// Guarda de escalas · radios y elevación
//
// POR QUÉ EXISTE
//
//   Las escalas YA están definidas en globals.css, en los dos temas:
//
//     --radius-sm: 6px   --radius-md: 10px  --radius-lg: 16px
//     --radius-xl: 22px  --radius-pill: 999px
//     --shadow-subtle  --shadow-card  --shadow-pop  --shadow-modal
//
//   El problema nunca fue que faltaran: es que las pantallas no las usan.
//   Al medirlo había 18 valores distintos de borderRadius y 56 box-shadow
//   diferentes, y las sombras CRECÍAN con cada pantalla nueva — porque sin
//   que nadie vigile, cada vista inventa la suya.
//
// CÓMO FUNCIONA · trinquete, no umbral
//
//   No exige cero. Fija el número actual de valores crudos por archivo y
//   falla si SUBE. Se puede bajar cuando se quiera; no se puede empeorar.
//
//   Un test que exigiera cero hoy estaría rojo desde el primer día, y un
//   test rojo permanente se ignora y después se borra. Esto, en cambio,
//   captura el avance real y lo vuelve irreversible.
//
//   Cuando bajes un número, actualizá el tope acá. Es parte del trabajo.
//
// DECISIÓN PENDIENTE — no la resuelve este archivo
//
//   De los 127 radios crudos que quedan, 66 son `8` y 29 son `12`. Ninguno
//   de los dos está en la escala, que define 6 y 10.
//
//   O sea: la escala y el código no coinciden, y el código tiene la mayoría.
//   Antes de migrar 95 lugares hay que decidir cuál manda. Lo más probable
//   es que convenga corregir la ESCALA a 4 / 8 / 12 / 16 / 999 —los valores
//   que el producto ya usa— en vez de reescribir 95 llamadas a 6 y 10.
//
//   Migrar a una escala equivocada cuesta el doble: una vez para entrar y
//   otra para salir.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tope de valores crudos por archivo. Solo puede bajar.
 * Medido el 15/10/2026 después de migrar las 57 coincidencias exactas.
 */
const TOPES: Record<string, { radios: number; sombras: number }> = {
  'src/app/finanzas/page.tsx':                              { radios: 74, sombras: 0 },
  'src/app/agenda/page.tsx':                                { radios: 22, sombras: 11 },
  'src/app/pacientes/[id]/page.tsx':                        { radios: 16, sombras: 0 },
  'src/app/pacientes/[id]/pestanas/CobroVisitas.tsx':       { radios: 2,  sombras: 0 },
  'src/app/pacientes/[id]/pestanas/ProgramaPuntos.tsx':     { radios: 3,  sombras: 0 },
  'src/app/pacientes/[id]/pestanas/TabConsentimientos.tsx': { radios: 3,  sombras: 0 },
  'src/app/pacientes/[id]/pestanas/TabFotos.tsx':           { radios: 3,  sombras: 1 },
  'src/app/pacientes/[id]/pestanas/TabOdontograma.tsx':     { radios: 2,  sombras: 0 },
  'src/app/pacientes/[id]/pestanas/TabTurnos.tsx':          { radios: 2,  sombras: 0 },
}

function fuente(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

/** `borderRadius: 8` — un número crudo, no un token. */
function radiosCrudos(s: string): number {
  return (s.match(/borderRadius:\s*\d+(?![\d.])/g) ?? []).length
}

/** `boxShadow: '0 2px 6px …'` sin pasar por --shadow-*. */
function sombrasCrudas(s: string): number {
  return (s.match(/boxShadow:\s*'[^']*'/g) ?? [])
    .filter(x => !x.includes('var(--shadow')).length
}

describe('escalas · el trinquete no se puede aflojar', () => {
  for (const [archivo, tope] of Object.entries(TOPES)) {
    it(`${archivo} no agrega radios crudos`, () => {
      const real = radiosCrudos(fuente(archivo))
      expect(
        real <= tope.radios,
        `${archivo} tiene ${real} radios crudos; el tope es ${tope.radios}.\n\n` +
        `Usá los tokens de globals.css en vez de un número:\n` +
        `  borderRadius: 'var(--radius-sm)'   // 6px\n` +
        `  borderRadius: 'var(--radius-md)'   // 10px\n` +
        `  borderRadius: 'var(--radius-lg)'   // 16px\n` +
        `  borderRadius: 'var(--radius-xl)'   // 22px\n` +
        `  borderRadius: 'var(--radius-pill)' // 999px\n\n` +
        `Si el valor que necesitás no está en la escala, el problema es la\n` +
        `escala, no tu componente. Discutilo antes de agregar un valor nuevo.`
      ).toBe(true)

      if (real < tope.radios) {
        console.log(`  ↓ ${archivo}: ${real} radios crudos (tope ${tope.radios}) — bajá el tope en guardas-escalas.test.ts`)
      }
    })

    it(`${archivo} no agrega sombras crudas`, () => {
      const real = sombrasCrudas(fuente(archivo))
      expect(
        real <= tope.sombras,
        `${archivo} tiene ${real} sombras crudas; el tope es ${tope.sombras}.\n\n` +
        `Usá: var(--shadow-subtle) · var(--shadow-card) · var(--shadow-pop) ·\n` +
        `var(--shadow-modal). Están definidas para tema claro Y oscuro: una\n` +
        `sombra escrita a mano no se adapta al tema.\n\n` +
        `Las sombras pasaron de 56 a 63 en tres semanas justamente así.`
      ).toBe(true)
    })
  }
})

/**
 * Bloques CSS de primer nivel, con su selector y su cuerpo.
 *
 * La primera versión de esto hacía `s.indexOf('[data-theme="dark"]')` para
 * partir el archivo en dos. Falló: la línea 85 de globals.css es un COMENTARIO
 * que menciona `[data-theme="dark"]` para documentar la regla de que todo token
 * exista en los dos temas. El índice caía en el comentario, el tramo "claro"
 * terminaba antes de las sombras, y el test reportaba que faltaban tokens que
 * estaban perfectamente definidos.
 *
 * Buscar un texto que también aparece en prosa no sirve. Esto recorre las
 * llaves y arma los bloques de verdad.
 */
function bloques(css: string): { selector: string; cuerpo: string }[] {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: { selector: string; cuerpo: string }[] = []
  let i = 0
  while (i < sinComentarios.length) {
    const abre = sinComentarios.indexOf('{', i)
    if (abre === -1) break
    const selector = sinComentarios.slice(i, abre).trim()
    let nivel = 1
    let j = abre + 1
    while (j < sinComentarios.length && nivel > 0) {
      if (sinComentarios[j] === '{') nivel++
      else if (sinComentarios[j] === '}') nivel--
      j++
    }
    out.push({ selector, cuerpo: sinComentarios.slice(abre + 1, j - 1) })
    i = j
  }
  return out
}

describe('escalas · las escalas existen y son completas', () => {
  const css = () => readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

  it('los tokens de radio están definidos', () => {
    const s = css()
    for (const t of ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-pill']) {
      expect(new RegExp(`${t}\\s*:`).test(s), `falta ${t} en globals.css`).toBe(true)
    }
  })

  it('los tokens de sombra están definidos en los DOS temas', () => {
    const bs = bloques(css())

    // Control del propio detector: si el parser no encuentra los dos tipos de
    // bloque, el test pasaría en verde sin haber comprobado nada.
    const claros = bs.filter(b => /^:root\b/.test(b.selector))
    const oscuros = bs.filter(b => /^\[data-theme="dark"\]\s*$/.test(b.selector))
    expect(claros.length, 'el parser no encontró ningún bloque :root').toBeGreaterThan(0)
    expect(oscuros.length, 'el parser no encontró el bloque [data-theme="dark"]').toBeGreaterThan(0)

    const definido = (bloques: typeof bs, token: string) =>
      bloques.some(b => new RegExp(`${token}\\s*:`).test(b.cuerpo))

    for (const t of ['--shadow-subtle', '--shadow-card', '--shadow-pop', '--shadow-modal']) {
      expect(definido(claros, t), `falta ${t} en :root`).toBe(true)
      expect(
        definido(oscuros, t),
        `${t} no se redefine en [data-theme="dark"]. Una sombra pensada para ` +
        `fondo claro sobre fondo oscuro no se ve, o se ve como un halo sucio.`
      ).toBe(true)
    }
  })

  it('TODA sombra de :root existe también en el tema oscuro', () => {
    // Generaliza el test anterior, que solo miraba las cuatro declaradas y por
    // eso no habría visto un --shadow-* nuevo agregado a un solo tema. Es la
    // regla que el propio globals.css pide en su comentario de cabecera:
    // "Todo token nuevo existe también en [data-theme='dark']".
    const bs = bloques(css())
    const cuerpoClaro = bs.filter(b => /^:root\b/.test(b.selector)).map(b => b.cuerpo).join('\n')
    const cuerpoOscuro = bs.filter(b => /^\[data-theme="dark"\]\s*$/.test(b.selector)).map(b => b.cuerpo).join('\n')

    // `Array.from` y no `[...new Set()]`: el target es es5 sin
    // downlevelIteration, y desparramar un Set no compila.
    const enClaro = Array.from(
      new Set(cuerpoClaro.match(/--shadow-[a-z0-9-]+(?=\s*:)/g) ?? [])
    )
    expect(enClaro.length, 'no se detectó ninguna sombra en :root').toBeGreaterThan(0)

    const huerfanas = enClaro.filter(t => !new RegExp(`${t}\\s*:`).test(cuerpoOscuro))
    expect(
      huerfanas,
      `Estas sombras existen en :root y NO en [data-theme="dark"]:\n` +
      `  ${huerfanas.join(', ')}\n\n` +
      `En tema oscuro van a heredar el valor claro: una sombra calculada para\n` +
      `fondo blanco sobre un fondo casi negro no se ve, o se ve como suciedad\n` +
      `alrededor del elemento.`
    ).toEqual([])
  })

  it('una sola familia tipográfica', () => {
    // Había tres: DM Sans (156 usos), Inter (12) y Outfit (3). Tres
    // tipografías en un producto no es una decisión, es trabajo sin terminar.
    const archivos = [
      'src/app/legal/privacidad/page.tsx',
      'src/app/legal/terminos/page.tsx',
      'src/app/precios/page.tsx',
    ]
    for (const a of archivos) {
      const s = fuente(a)
      expect(
        /Outfit/.test(s),
        `${a} volvió a usar Outfit. La familia del producto es DM Sans, ` +
        `vía var(--font-sans).`
      ).toBe(false)
    }
  })
})
