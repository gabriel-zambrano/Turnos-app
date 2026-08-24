import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// ─────────────────────────────────────────────────────────────
// G-1 y G-2 · Guardas sobre las migraciones.
//
// EL PROBLEMA QUE PREVIENEN
//
// El esquema tenía `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon`.
// Consecuencia: toda tabla y toda vista nueva creada por `postgres` nacía
// accesible sin autenticar. Así quedaron expuestas las seis vistas `bi_*`
// —$35.341.190 legibles por cualquiera con la clave pública— sin que nadie
// escribiera un GRANT.
//
// B1.1 cerró el default privilege para tablas y secuencias. Pero NO para
// funciones: R-17 confirmó que `REVOKE ... ON FUNCTIONS FROM PUBLIC` no tiene
// efecto en este entorno. Tres intentos, éxito sin efecto. **Toda función
// nueva sigue naciendo ejecutable por PUBLIC, y por herencia por `anon`.**
//
// La única mitigación es que cada migración lo revoque explícitamente. Estos
// tests lo vuelven obligatorio en CI en vez de depender de la memoria.
//
// LO QUE NO HACEN
//
// Leen migraciones, no producción. Una migración impecable no garantiza que
// el estado vivo sea correcto — eso se verifica con la consulta N-1 de
// P0-05_FASE0_LECTURA_v2.sql. Son complementarios, no sustitutos.
// ─────────────────────────────────────────────────────────────

const DIR = join(__dirname, '..', '..', 'supabase', 'migrations')

interface Migracion {
  archivo: string
  /** Texto sin comentarios de línea, para no contar lo que está apagado. */
  codigo: string
  tablas: string[]
  funciones: string[]
}

const MIGRACIONES: Migracion[] = readdirSync(DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(archivo => {
    const texto = readFileSync(join(DIR, archivo), 'utf8')
    const codigo = texto.split('\n').map(l => l.split('--')[0]).join('\n')
    return {
      archivo,
      codigo,
      tablas: Array.from(
        codigo.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?(?:public"?\."?)?([a-z_0-9]+)"?/gi)
      ).map(m => m[1]),
      funciones: Array.from(
        codigo.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+"?(?:public"?\."?)?([a-z_0-9]+)"?\s*\(/gi)
      ).map(m => m[1]),
    }
  })

/**
 * El dump inicial del esquema. Concede explícitamente a todos los roles sobre
 * las 23 tablas que capturó, así que cumple las reglas por otro camino. Se lo
 * trata aparte porque no es una migración escrita a mano.
 */
const DUMP_INICIAL = '20260722120000_remote_schema.sql'

// ─────────────────────────────────────────────────────────────
// Deuda preexistente.
//
// Estas tablas y funciones se crearon antes de que existieran las guardas.
// Su estado EN PRODUCCIÓN ya fue corregido —B1.6 revocó `anon` de todas las
// tablas y de estas cuatro funciones— pero las migraciones no lo reflejan.
//
// ⚠️  CONSECUENCIA REAL: un `supabase db reset` reconstruye el esquema
//     correctamente pero NO el estado de privilegios. `remote_schema.sql`
//     vuelve a conceder `anon`, y nada lo revoca porque **B1.6 todavía no
//     está versionado**.
//
// La lista NO es una absolución: es deuda registrada. Se vacía cuando se
// escriba la migración que versiona B1.6.
// ─────────────────────────────────────────────────────────────

const TABLAS_SIN_GRANT_PREEXISTENTES = [
  'arca_config', 'facturas', 'plantillas_consentimiento', 'consentimientos_firmados',
  'crm_campanas', 'crm_envios', 'tratamiento_items', 'pagos', 'factura_items',
  'factura_pagos', 'ingresos_manuales_duplicados_respaldo', 'enlaces_turno',
  'cajas_diarias',
] as const

/**
 * Funciones cuyo `REVOKE` NO está en la migración que las crea.
 *
 * Las cuatro están revocadas: lo hace `20260822120000_b1_6_...`. Pero G-2.1
 * exige que el `REVOKE` sea CO-LOCADO con el `CREATE`, y esa exigencia es
 * correcta: entre una migración y otra la función queda ejecutable por
 * PUBLIC. En un `db reset` esa ventana existe de verdad.
 *
 * Se quedan en la lista por eso — no por estar sin revocar, sino por estar
 * revocadas tarde. El test de abajo verifica que sí lo estén.
 */
const FUNCIONES_SIN_REVOKE_PREEXISTENTES = [
  'sync_valor_cita', 'sync_cobrado_cita', 'sembrar_renglon_cita', 'generar_codigo_enlace',
] as const

// ── Detectores ──

const tieneGrant = (m: Migracion, t: string) =>
  new RegExp(String.raw`GRANT[^;]*\b${t}\b`, 'i').test(m.codigo)

const tieneRls = (m: Migracion, t: string) =>
  new RegExp(String.raw`ALTER TABLE[^;]*\b${t}\b[^;]*ENABLE ROW LEVEL`, 'is').test(m.codigo)

const tieneRevoke = (m: Migracion, f: string) =>
  new RegExp(String.raw`REVOKE[^;]*\b${f}\b`, 'i').test(m.codigo)

function cabeceraDe(m: Migracion, fn: string): string {
  const re = new RegExp(String.raw`CREATE (?:OR REPLACE )?FUNCTION\s+"?(?:public"?\.")?${fn}"?\s*\(`, 'i')
  const match = re.exec(m.codigo)
  if (!match) return ''
  const cuerpo = m.codigo.indexOf('$$', match.index)
  return m.codigo.slice(match.index, cuerpo > 0 ? cuerpo : match.index + 500)
}

// ═════════════════════════════════════════════════════════════

describe('G-1.1 · toda tabla nueva habilita RLS', () => {
  it('ninguna migración crea una tabla sin ENABLE ROW LEVEL SECURITY', () => {
    // Sin allowlist: hoy se cumple en las 23 migraciones. Es la regla más
    // importante del conjunto — una tabla sin RLS es legible por cualquiera
    // que tenga el GRANT, y el GRANT llega solo por el default privilege.
    const infractores: string[] = []
    for (const m of MIGRACIONES) {
      for (const t of m.tablas) {
        if (!tieneRls(m, t)) infractores.push(`${m.archivo} → ${t}`)
      }
    }
    expect(
      infractores,
      'Toda tabla nueva debe declarar ALTER TABLE ... ENABLE ROW LEVEL SECURITY ' +
      'en la misma migración que la crea.'
    ).toEqual([])
  })
})

describe('G-1.2 · toda tabla nueva declara sus privilegios', () => {
  it('ninguna tabla nueva depende del default privilege para sus permisos', () => {
    const infractores: string[] = []
    for (const m of MIGRACIONES) {
      if (m.archivo === DUMP_INICIAL) continue
      for (const t of m.tablas) {
        if (tieneGrant(m, t)) continue
        if ((TABLAS_SIN_GRANT_PREEXISTENTES as readonly string[]).includes(t)) continue
        infractores.push(`${m.archivo} → ${t}`)
      }
    }
    expect(
      infractores,
      'Estas tablas no declaran GRANT explícito. Sin él, sus privilegios los ' +
      'define el default privilege del esquema — que es lo que expuso las ' +
      'vistas bi_*. Agregá el GRANT para authenticated y service_role.'
    ).toEqual([])
  })
})

describe('G-2.1 · toda función nueva revoca PUBLIC', () => {
  it('ninguna función nueva queda ejecutable por PUBLIC', () => {
    // R-17: PostgreSQL concede EXECUTE a PUBLIC en toda función nueva, y ese
    // default NO se puede suprimir con ALTER DEFAULT PRIVILEGES en este
    // entorno. El REVOKE explícito es la única protección que funciona.
    const infractores: string[] = []
    for (const m of MIGRACIONES) {
      if (m.archivo === DUMP_INICIAL) continue
      for (const f of m.funciones) {
        if (tieneRevoke(m, f)) continue
        if ((FUNCIONES_SIN_REVOKE_PREEXISTENTES as readonly string[]).includes(f)) continue
        infractores.push(`${m.archivo} → ${f}`)
      }
    }
    expect(
      infractores,
      'Estas funciones no revocan PUBLIC. Agregá:\n' +
      '  REVOKE ALL ON FUNCTION public.<nombre>(<args>) FROM PUBLIC, anon;\n' +
      '  GRANT EXECUTE ON FUNCTION public.<nombre>(<args>) TO authenticated;\n' +
      'en la misma migración. Ver R-17 en P0-05_BITACORA.md.'
    ).toEqual([])
  })
})

describe('G-2.2 · toda SECURITY DEFINER fija search_path', () => {
  it('ninguna función SECURITY DEFINER queda sin search_path', () => {
    // Sin allowlist: hoy se cumple. Una DEFINER sin search_path fijo es
    // secuestrable por tabla temporal, y `anon` y `authenticated` TIENEN
    // privilegio TEMP — confirmado en producción (R-12).
    const infractores: string[] = []
    for (const m of MIGRACIONES) {
      for (const f of m.funciones) {
        const cab = cabeceraDe(m, f)
        if (!/SECURITY\s+DEFINER/i.test(cab)) continue
        if (!/SET\s+"?search_path"?/i.test(cab)) infractores.push(`${m.archivo} → ${f}`)
      }
    }
    expect(
      infractores,
      'Agregá SET search_path = public, pg_temp a estas funciones SECURITY DEFINER.'
    ).toEqual([])
  })
})

describe('G-1/G-2 · las listas de deuda no se pudren', () => {
  it('toda tabla listada como deuda sigue existiendo en alguna migración', () => {
    const todas = MIGRACIONES.flatMap(m => m.tablas)
    const fantasmas = TABLAS_SIN_GRANT_PREEXISTENTES.filter(t => !todas.includes(t))
    expect(fantasmas, 'Sacalas de TABLAS_SIN_GRANT_PREEXISTENTES: ya no existen').toEqual([])
  })

  it('toda tabla listada como deuda sigue sin GRANT', () => {
    // Si alguien le agrega el GRANT, hay que sacarla de la lista. Dejarla
    // puesta la seguiría cubriendo si mañana se lo quitan.
    const yaCorregidas = TABLAS_SIN_GRANT_PREEXISTENTES.filter(t =>
      MIGRACIONES.some(m => m.tablas.includes(t) && tieneGrant(m, t))
    )
    expect(yaCorregidas, 'Ya tienen GRANT: sacalas de la lista de deuda').toEqual([])
  })

  it('toda función listada como deuda sigue sin REVOKE co-locado', () => {
    const yaCorregidas = FUNCIONES_SIN_REVOKE_PREEXISTENTES.filter(f =>
      MIGRACIONES.some(m => m.funciones.includes(f) && tieneRevoke(m, f))
    )
    expect(
      yaCorregidas,
      'Estas funciones ya revocan PUBLIC en la misma migración que las crea. ' +
      'Sacalas de la lista de deuda.'
    ).toEqual([])
  })

  it('las funciones con REVOKE tardío SÍ están revocadas en alguna migración', () => {
    // La deuda es que el REVOKE no está junto al CREATE, no que falte. Si
    // alguien borrara la migración de B1.6, estas cuatro quedarían realmente
    // ejecutables por PUBLIC y este test lo detecta.
    const sinRevocarEnNingunLado = FUNCIONES_SIN_REVOKE_PREEXISTENTES.filter(
      f => !MIGRACIONES.some(m => tieneRevoke(m, f))
    )
    expect(
      sinRevocarEnNingunLado,
      'Estas funciones no se revocan en NINGUNA migración. Ya no es deuda de ' +
      'co-locación: están expuestas a PUBLIC en una base reconstruida.'
    ).toEqual([])
  })
})

describe('G-1/G-2 · cobertura del propio análisis', () => {
  it('encuentra las migraciones', () => {
    expect(MIGRACIONES.length).toBeGreaterThanOrEqual(20)
  })

  it('encuentra tablas y funciones', () => {
    expect(MIGRACIONES.flatMap(m => m.tablas).length).toBeGreaterThanOrEqual(30)
    expect(MIGRACIONES.flatMap(m => m.funciones).length).toBeGreaterThanOrEqual(10)
  })

  it('los detectores reconocen GRANT, RLS y REVOKE', () => {
    expect(MIGRACIONES.some(m => /GRANT/i.test(m.codigo))).toBe(true)
    expect(MIGRACIONES.some(m => /ENABLE ROW LEVEL/i.test(m.codigo))).toBe(true)
    expect(MIGRACIONES.some(m => /REVOKE/i.test(m.codigo))).toBe(true)
  })
})
