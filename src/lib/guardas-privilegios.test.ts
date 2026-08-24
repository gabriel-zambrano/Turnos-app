import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ═══════════════════════════════════════════════════════════════════════════
// G-5 · Guarda de privilegios de `anon` en las migraciones
//
// POR QUÉ EXISTE
//
//   R-18: los privilegios de producción se revirtieron dos veces —20/08 y
//   22/08— sin causa aparente. El 22/08 se encontró el mecanismo, y no estaba
//   en producción: estaba en el repositorio.
//
//   `20260722120000_remote_schema.sql` contenía 30 sentencias
//   `GRANT ... ON TABLE ... TO "anon"` sobre 30 tablas, incluidas `pacientes`,
//   `historial_dental`, `paciente_fotos`, `tenant_users` y `tenants`. Es
//   exactamente el estado que B1.6 revocó.
//
//   Y el archivo usa `CREATE TABLE IF NOT EXISTS` y `CREATE OR REPLACE VIEW`:
//   re-ejecutarlo NO da error. Un `db reset --linked`, un
//   `db push --include-all`, una reparación del historial de migraciones o
//   pegarlo en el SQL Editor restauraban la exposición completa, en silencio.
//
//   G-1 y G-2 no lo detectaban: excluyen el dump inicial a propósito
//   (`DUMP_INICIAL`, guardas-migraciones.test.ts:64). Esta guarda es la que
//   sí lo mira.
//
// QUÉ FIJA
//
//   Que `anon` no recupere privilegios de tabla por la vía de una migración.
//   No sustituye la verificación en producción —una migración no es el estado
//   real— pero cierra el camino por el que el estado real se corrompía.
//
// LO QUE ESTA GUARDA NO PUEDE HACER
//
//   No detecta un `GRANT` ejecutado a mano en el SQL Editor, ni uno emitido
//   por la plataforma. Para eso está el control N-1 en producción.
// ═══════════════════════════════════════════════════════════════════════════

const DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * Las ÚNICAS cosas que `anon` necesita. Cada excepción lleva su razón: sin
 * eso, esta lista se convierte en el lugar donde se esconden los problemas.
 *
 * Los patrones toleran comillas opcionales, espacios extra y `, authenticated`
 * al final, porque las migraciones no siguen un estilo único. Lo que NO
 * toleran es el verbo: solo `USAGE` y `SELECT`. Un `ALL` o un `INSERT` no
 * coincide con ninguna y hace fallar la guarda, que es el punto.
 */
const q = (id: string) => `"?${id}"?`
const PERMITIDO = [
  // Sin USAGE sobre el esquema, `anon` no alcanza absolutamente nada.
  new RegExp(`^GRANT\\s+USAGE\\s+ON\\s+SCHEMA\\s+${q('public')}\\s+TO\\s+.*\\banon\\b`, 'i'),

  // El portal del paciente resuelve el branding de la clínica sin sesión.
  new RegExp(`^GRANT\\s+SELECT\\s+ON\\s+(TABLE\\s+)?${q('public')}\\.${q('tenants_public')}\\s+TO\\s+.*\\banon\\b`, 'i'),

  // Ídem para el logo: `logos` es un bucket público y el portal lo resuelve
  // sin sesión. Solo SELECT sobre el catálogo de buckets, nunca sobre objects.
  new RegExp(`^GRANT\\s+SELECT\\s+ON\\s+(TABLE\\s+)?${q('storage')}\\.${q('buckets')}\\s+TO\\s+.*\\banon\\b`, 'i'),
]

function migraciones(): { archivo: string; lineas: string[] }[] {
  return readdirSync(DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => ({ archivo: f, lineas: readFileSync(join(DIR, f), 'utf8').split('\n') }))
}

/** Líneas GRANT activas —no comentadas— que mencionan a anon. */
function grantsAnon() {
  const hallazgos: { archivo: string; linea: number; sql: string }[] = []
  for (const { archivo, lineas } of migraciones()) {
    lineas.forEach((cruda, i) => {
      const l = cruda.trim()
      if (l.startsWith('--')) return                       // comentada
      if (!/^GRANT\b/i.test(l)) return                     // no es un GRANT
      if (!/\banon\b/.test(l)) return                      // no menciona anon
      if (PERMITIDO.some(re => re.test(l))) return         // excepción declarada
      hallazgos.push({ archivo, linea: i + 1, sql: l })
    })
  }
  return hallazgos
}

describe('G-5.1 · ninguna migración le devuelve privilegios de tabla a `anon`', () => {
  it('no hay GRANT a anon fuera de las dos excepciones declaradas', () => {
    const h = grantsAnon()
    const detalle = h.map(x => `\n  ${x.archivo}:${x.linea}\n    ${x.sql}`).join('')
    expect(
      h,
      h.length === 0 ? '' :
      `Se encontraron ${h.length} GRANT a \`anon\`.\n` +
      `Este es el mecanismo de R-18: una migración que, al re-aplicarse, ` +
      `restaura la exposición que B1.6 cerró.\n` +
      `Si el privilegio es realmente necesario, agregalo a PERMITIDO con su ` +
      `justificación. Si no, comentalo.${detalle}`
    ).toEqual([])
  })
})

describe('G-5.2 · `tenants_public` no vuelve a ser escribible por anon (R-10)', () => {
  it('ninguna migración le da a anon más que SELECT sobre tenants_public', () => {
    // R-10: `tenants_public` es una vista auto-actualizable cuyo dueño es
    // `postgres`. Un GRANT de INSERT/UPDATE/DELETE —o `ALL`— le permitía a
    // `anon` ESCRIBIR sobre la tabla `tenants` a través de ella, sin sesión.
    // Se corrigió dos veces en producción: volvió una vez.
    const malos = migraciones().flatMap(({ archivo, lineas }) =>
      lineas
        .map((l, i) => ({ l: l.trim(), i: i + 1 }))
        .filter(({ l }) =>
          !l.startsWith('--') &&
          /^GRANT\b/i.test(l) &&
          /tenants_public/.test(l) &&
          /\banon\b/.test(l) &&
          /\b(ALL|INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(l)
        )
        .map(({ l, i }) => `${archivo}:${i} → ${l}`)
    )
    expect(malos, `R-10 reintroducido:\n  ${malos.join('\n  ')}`).toEqual([])
  })
})

describe('G-5.3 · el dump inicial quedó neutralizado', () => {
  const DUMP = '20260722120000_remote_schema.sql'

  it('el dump conserva la nota que explica la neutralización', () => {
    // Si alguien regenera el dump con `supabase db dump`, esta nota desaparece
    // y con ella la neutralización. El test avisa antes de que se aplique.
    const s = readFileSync(join(DIR, DUMP), 'utf8')
    expect(
      s.includes('R-18 · GRANTS A `anon` NEUTRALIZADOS'),
      `${DUMP} perdió la nota de neutralización. ` +
      `Si lo regeneraste con \`supabase db dump\`, volvió a traer los GRANT a anon: ` +
      `hay que neutralizarlos de nuevo antes de commitear.`
    ).toBe(true)
  })

  it('las 30 líneas neutralizadas siguen comentadas', () => {
    const s = readFileSync(join(DIR, DUMP), 'utf8')
    const comentadas = (s.match(/^-- \[R-1[08][^\]]*\] ?GRANT/gm) || []).length
    expect(
      comentadas,
      `Se esperaban al menos 30 GRANT neutralizados y hay ${comentadas}. ` +
      `Alguien los descomentó o el archivo se regeneró.`
    ).toBeGreaterThanOrEqual(30)
  })
})

describe('G-5.4 · toda SECURITY DEFINER declara `pg_temp` (R-12)', () => {
  // Cuando `pg_temp` no se declara, PostgreSQL lo busca IMPLÍCITA y PRIMERO
  // para nombres de relación. Un usuario con privilegio TEMP —que anon y
  // authenticated tienen por defecto— puede crear `pg_temp.pacientes`, y una
  // función SECURITY DEFINER resolvería contra esa tabla, corriendo con los
  // privilegios de `postgres`, que no está sujeto a RLS.
  //
  // Declararlo al FINAL lo mueve a explícito-último y cierra el eclipse.

  /** Tolera `SET search_path` y `SET "search_path"`, con `TO` o `=`. */
  const SEARCH_PATH = /SET\s+"?search_path"?\s*(?:TO|=)\s*([^\n]+)/i

  /** Última definición de cada función, que es la que gobierna. */
  function definicionesEfectivas() {
    const efectiva = new Map<string, { archivo: string; searchPath: string | null }>()
    for (const { archivo, lineas } of migraciones()) {
      const s = lineas.join('\n')
      const re = /CREATE (?:OR REPLACE )?FUNCTION\s+"?public"?\."?(\w+)"?\s*\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(s)) !== null) {
        const i = m.index
        const j = s.indexOf('AS $', i)
        if (j < 0 || j - i > 1500) continue
        const cabecera = s.slice(i, j)
        if (!/SECURITY\s+DEFINER/i.test(cabecera)) continue
        const sp = SEARCH_PATH.exec(cabecera)
        efectiva.set(m[1], { archivo, searchPath: sp ? sp[1].trim() : null })
      }
    }
    return efectiva
  }

  it('ninguna función SECURITY DEFINER queda sin `pg_temp`', () => {
    // `Array.from` y no spread: el proyecto compila a es5 sin
    // `downlevelIteration`, así que `[...map.entries()]` no compila.
    const malas = Array.from(definicionesEfectivas().entries())
      .filter(([, d]) => !d.searchPath || !d.searchPath.includes('pg_temp'))
      .map(([n, d]) => `${n} → ${d.searchPath ?? 'SIN search_path'}  (${d.archivo})`)

    expect(
      malas,
      malas.length === 0 ? '' :
      `R-12: ${malas.length} función(es) SECURITY DEFINER sin \`pg_temp\`.\n` +
      `Agregá \`SET search_path TO 'public', 'pg_temp'\` — con pg_temp AL FINAL.\n  ` +
      malas.join('\n  ')
    ).toEqual([])
  })

  it('encuentra las funciones SECURITY DEFINER que existen', () => {
    // Si el detector deja de encontrarlas, el test de arriba pasa por vacío.
    expect(definicionesEfectivas().size).toBeGreaterThanOrEqual(9)
  })

  it('reconoce las dos sintaxis del repositorio', () => {
    // El dump escribe `SET "search_path" TO 'public'` con comillas; las
    // migraciones escritas a mano usan `SET search_path = public`. Un detector
    // que solo entienda una de las dos reporta falsos negativos — pasó tres
    // veces durante esta auditoría antes de mirarse el texto crudo.
    expect(SEARCH_PATH.exec(`SET "search_path" TO 'public', 'pg_temp'`)?.[1].trim())
      .toBe(`'public', 'pg_temp'`)
    expect(SEARCH_PATH.exec('SET search_path = public, pg_temp')?.[1].trim())
      .toBe('public, pg_temp')
    expect(SEARCH_PATH.exec('SET search_path TO public')?.[1].trim()).toBe('public')
  })
})

describe('G-5 · cobertura del propio detector', () => {
  // Sin estos, la guarda puede pasar por no encontrar nada que mirar —
  // el peor modo de falla de un test de este tipo: verde por vacío.

  it('encuentra las migraciones', () => {
    expect(migraciones().length).toBeGreaterThanOrEqual(26)
  })

  it('el detector reconoce un GRANT a anon cuando existe', () => {
    const l = 'GRANT ALL ON TABLE "public"."pacientes" TO "anon";'
    expect(/^GRANT\b/i.test(l) && /\banon\b/.test(l)).toBe(true)
    expect(PERMITIDO.some(re => re.test(l))).toBe(false)
  })

  it('el detector ignora una línea comentada', () => {
    expect('-- [R-18 neutralizado] GRANT ALL ON TABLE "public"."pacientes" TO "anon";'.trim().startsWith('--')).toBe(true)
  })

  it('el detector acepta las dos excepciones declaradas', () => {
    expect(PERMITIDO.some(re => re.test('GRANT USAGE ON SCHEMA "public" TO "anon";'))).toBe(true)
    expect(PERMITIDO.some(re => re.test('GRANT SELECT ON TABLE "public"."tenants_public" TO "anon";'))).toBe(true)
  })

  it('el detector NO acepta un ALL sobre tenants_public', () => {
    expect(PERMITIDO.some(re => re.test('GRANT ALL ON TABLE "public"."tenants_public" TO "anon";'))).toBe(false)
  })
})
