import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import path from 'path'

// ─────────────────────────────────────────────────────────────
// P0-07 · Las vistas de BI ya no exponen datos entre clínicas.
//
// Seis vistas `bi_*` corrían con los privilegios de su dueño (`postgres`,
// superusuario) porque no declaraban `security_invoker`. Eso les hacía saltear
// RLS. Sumado a que no filtraban por `tenant_id` y a que tenían `GRANT ALL TO
// anon`, cualquiera con la anon key —que viaja en el bundle del navegador—
// podía leer la facturación mensual, el ticket promedio por tratamiento y la
// cantidad de pacientes de TODAS las clínicas, sin loguearse.
//
// Estos tests cubren tres cosas distintas, y las tres hacen falta:
//
//   1. Que la migración haga lo que dice (PGlite, Postgres de verdad).
//   2. Que ninguna pantalla haya empezado a depender de esas vistas.
//   3. Que nadie vuelva a crear una vista sobre una tabla con RLS sin
//      `security_invoker`. Este último es el que evita que el problema vuelva
//      dentro de seis meses: los otros dos verifican el pasado.
//
// Lo que NO se puede verificar acá: que en la base REAL las vistas hayan
// desaparecido y que `anon` ya no las lea. Eso requiere conexión a Supabase
// y está listado al final como pendiente de ejecución contra staging.
// ─────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, '..', '..')
const MIGRACION = path.join(RAIZ, 'supabase/migrations/20260820180000_p0_07_revoke_vistas_bi.sql')

/** Las seis que se revocan. */
const VISTAS_REVOCADAS = [
  'bi_citas_por_dia',
  'bi_citas_por_tratamiento',
  'bi_ingresos_por_mes',
  'bi_kpis_mes',
  'bi_ocupacion_por_hora',
  'bi_pacientes_nuevos_por_mes',
] as const

/** Las dos que se conservan, cada una por su motivo. */
const VISTAS_CONSERVADAS = [
  // Materializada, TIENE tenant_id, grant solo a service_role, WITH NO DATA.
  'bi_resumen',
  // En uso: la resolución de clínica por hostname del portal público.
  'tenants_public',
] as const

const sqlMigracion = readFileSync(MIGRACION, 'utf8')

let db: PGlite

beforeAll(async () => {
  db = new PGlite()

  // Reproducimos el estado ANTERIOR a la migración: las tablas base, las seis
  // vistas tal como estaban (sin security_invoker, sin tenant_id) y las dos que
  // se conservan. Los roles `anon` y `authenticated` no existen en un Postgres
  // pelado, así que los creamos para poder probar los grants.
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;

    CREATE TABLE tenants (
      id uuid PRIMARY KEY,
      nombre text,
      activo boolean DEFAULT true
    );
    CREATE TABLE pacientes (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      creado_en timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE citas (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      paciente_id uuid NOT NULL,
      fecha_hora timestamptz NOT NULL,
      tipo_tratamiento text,
      estado text,
      duracion_minutos integer DEFAULT 30,
      valor numeric,
      sena numeric,
      no_show boolean DEFAULT false,
      costo_insumos numeric DEFAULT 0,
      saldo numeric GENERATED ALWAYS AS (valor - sena) STORED
    );

    -- Las seis vistas expuestas, como estaban en producción.
    CREATE VIEW bi_citas_por_dia AS
      SELECT date(fecha_hora) AS fecha, count(*) AS total FROM citas GROUP BY date(fecha_hora);
    CREATE VIEW bi_citas_por_tratamiento AS
      SELECT tipo_tratamiento, count(*) AS total FROM citas GROUP BY tipo_tratamiento;
    CREATE VIEW bi_ingresos_por_mes AS
      SELECT to_char(date_trunc('month', fecha_hora), 'YYYY-MM') AS mes,
             COALESCE(sum(valor), 0) AS ingresos
      FROM citas GROUP BY date_trunc('month', fecha_hora);
    CREATE VIEW bi_kpis_mes AS
      SELECT count(*) AS citas_mes, COALESCE(sum(valor), 0) AS ingresos_mes FROM citas;
    CREATE VIEW bi_ocupacion_por_hora AS
      SELECT EXTRACT(hour FROM fecha_hora)::integer AS hora, count(*) AS total_citas
      FROM citas GROUP BY EXTRACT(hour FROM fecha_hora);
    CREATE VIEW bi_pacientes_nuevos_por_mes AS
      SELECT to_char(date_trunc('month', creado_en), 'YYYY-MM') AS mes, count(*) AS pacientes_nuevos
      FROM pacientes GROUP BY date_trunc('month', creado_en);

    -- Las dos que se conservan.
    CREATE MATERIALIZED VIEW bi_resumen AS
      SELECT tenant_id, date_trunc('month', fecha_hora) AS mes, sum(valor) AS ingresos
      FROM citas GROUP BY tenant_id, date_trunc('month', fecha_hora)
      WITH NO DATA;
    CREATE VIEW tenants_public AS
      SELECT id, nombre FROM tenants WHERE activo = true;

    -- Los grants que hacían al problema.
    GRANT ALL ON TABLE bi_citas_por_dia            TO anon, authenticated, service_role;
    GRANT ALL ON TABLE bi_citas_por_tratamiento    TO anon, authenticated, service_role;
    GRANT ALL ON TABLE bi_ingresos_por_mes         TO anon, authenticated, service_role;
    GRANT ALL ON TABLE bi_kpis_mes                 TO anon, authenticated, service_role;
    GRANT ALL ON TABLE bi_ocupacion_por_hora       TO anon, authenticated, service_role;
    GRANT ALL ON TABLE bi_pacientes_nuevos_por_mes TO anon, authenticated, service_role;
    GRANT ALL ON TABLE bi_resumen                  TO service_role;
    GRANT ALL ON TABLE tenants_public              TO anon, authenticated, service_role;
  `)
})

/** ¿Existe la relación en el esquema public? */
async function existe(nombre: string): Promise<boolean> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind IN ('v','m') AND relname = '${nombre}'`
  )
  return r.rows[0].n > 0
}

/** ¿Ese rol puede hacer SELECT sobre esa relación? */
async function puedeLeer(rol: string, relacion: string): Promise<boolean> {
  const r = await db.query<{ ok: boolean }>(
    `SELECT has_table_privilege('${rol}', '${relacion}', 'SELECT') AS ok`
  )
  return r.rows[0].ok
}

// ─────────────────────────────────────────────────────────────

describe('estado previo (control del propio test)', () => {
  it('antes de migrar, las seis vistas existen y anon puede leerlas', async () => {
    // Si este test fallara, el resto no probaría nada: estaríamos verificando
    // que no existe algo que nunca creamos.
    for (const v of VISTAS_REVOCADAS) {
      expect(await existe(v), `${v} debería existir antes de migrar`).toBe(true)
      expect(await puedeLeer('anon', v), `anon debería poder leer ${v} antes`).toBe(true)
    }
  })
})

describe('la migración revoca acceso a las vistas expuestas', () => {
  it('corre sin errores', async () => {
    await expect(db.exec(sqlMigracion)).resolves.toBeDefined()
  })

  it('1. las seis vistas vulnerables siguen existiendo', async () => {
    for (const v of VISTAS_REVOCADAS) {
      expect(await existe(v), `${v} debería seguir existiendo`).toBe(true)
    }
  })

  it('2. no queda acceso anónimo: la relación existe pero no se puede leer', async () => {
    for (const v of VISTAS_REVOCADAS) {
      expect(await puedeLeer('anon', v)).toBe(false)
    }
  })

  it('3. tampoco queda acceso autenticado', async () => {
    for (const v of VISTAS_REVOCADAS) {
      expect(await puedeLeer('authenticated', v)).toBe(false)
    }
  })

  it('conserva bi_resumen y tenants_public', async () => {
    for (const v of VISTAS_CONSERVADAS) {
      expect(await existe(v), `${v} NO debía eliminarse`).toBe(true)
    }
  })

  it('bi_resumen sigue sin ser legible por anon ni por authenticated', async () => {
    expect(await puedeLeer('anon', 'bi_resumen')).toBe(false)
    expect(await puedeLeer('authenticated', 'bi_resumen')).toBe(false)
  })

  it('tenants_public sigue siendo legible: el portal público la necesita', async () => {
    // Es la única vista que debe seguir abierta. Está acotada a branding y a
    // clínicas activas, y sin ella la reserva online no resuelve la clínica.
    expect(await puedeLeer('anon', 'tenants_public')).toBe(true)
  })

  it('es idempotente: correrla dos veces no rompe', async () => {
    await expect(db.exec(sqlMigracion)).resolves.toBeDefined()
  })

  it('no queda ninguna vista legible por anon salvo tenants_public', async () => {
    const r = await db.query<{ relname: string }>(
      `SELECT relname FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relkind IN ('v','m')
          AND has_table_privilege('anon', oid, 'SELECT')`
    )
    expect(r.rows.map(x => x.relname)).toEqual(['tenants_public'])
  })
})

describe('la migración usa REVOKE y no DROP', () => {
  it('ningún DROP view existe en la migración', () => {
    expect(sqlMigracion).not.toMatch(/DROP\s+(MATERIALIZED\s+)?VIEW/i)
  })

  it('se revoca el acceso a anon y authenticated', () => {
    for (const v of VISTAS_REVOCADAS) {
      expect(sqlMigracion).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${v}\\s+FROM anon, authenticated`, 'i'))
    }
  })

  it('no toca las vistas que deben conservarse', () => {
    const sentencias = sqlMigracion
      .split('\n')
      .filter(l => !l.trim().startsWith('--'))
      .join('\n')
    for (const v of VISTAS_CONSERVADAS) {
      expect(sentencias, `la migración no debe alterar ${v}`)
        .not.toMatch(new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${v}`, 'i'))
    }
  })

  it('no hace cambios globales de permisos', () => {
    const sentencias = sqlMigracion
      .split('\n')
      .filter(l => !l.trim().startsWith('--'))
      .join('\n')
    expect(sentencias).not.toMatch(/ON\s+ALL\s+TABLES\s+IN\s+SCHEMA/i)
    expect(sentencias).not.toMatch(/ALTER\s+DEFAULT\s+PRIVILEGES/i)
  })
})

// ─────────────────────────────────────────────────────────────
// Guardas sobre el código fuente. Al estilo de guardas-multitenant.test.ts:
// leen los archivos y fallan si aparece el patrón que queremos evitar.
// ─────────────────────────────────────────────────────────────

function archivosFuente(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'node_modules' || entrada === '.next') continue
      archivosFuente(ruta, acumulado)
    } else if (/\.(ts|tsx)$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

const FUENTES = archivosFuente(join(RAIZ, 'src')).map(ruta => ({
  ruta: ruta.replace(RAIZ + '/', ''),
  texto: readFileSync(ruta, 'utf8'),
}))

describe('4. la aplicación no consulta las vistas eliminadas', () => {
  it('ningún archivo de src/ las referencia', () => {
    const infractores: string[] = []
    for (const f of FUENTES) {
      for (const v of VISTAS_REVOCADAS) {
        // Solo consultas reales: .from('vista') o .rpc(...). Una mención en un
        // comentario no rompe nada.
        const consulta = new RegExp(`\\.(from|rpc)\\(\\s*['"\`]${v}['"\`]`)
        if (consulta.test(f.texto)) infractores.push(`${f.ruta} → ${v}`)
      }
    }
    expect(infractores, `Estas vistas ya no existen:\n${infractores.join('\n')}`).toEqual([])
  })
})

describe('5. BI y finanzas siguen funcionando: consultan las tablas reales', () => {
  const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

  it('/bi lee citas directamente', () => {
    const bi = leer('src/app/bi/page.tsx')
    expect(bi).toMatch(/\.from\(\s*['"]citas['"]\s*\)/)
    for (const v of VISTAS_REVOCADAS) {
      expect(bi).not.toMatch(new RegExp(`\\.from\\(\\s*['"\`]${v}['"\`]`))
    }
  })

  it('/finanzas lee las tablas base', () => {
    const fin = leer('src/app/finanzas/page.tsx')
    for (const tabla of ['citas', 'ingresos_manuales', 'egresos_manuales', 'costos_fijos', 'facturas']) {
      expect(fin, `/finanzas debe seguir leyendo ${tabla}`)
        .toMatch(new RegExp(`\\.from\\(\\s*['"]${tabla}['"]\\s*\\)`))
    }
  })

  it('/dashboard lee las tablas base', () => {
    const dash = leer('src/app/dashboard/page.tsx')
    expect(dash).toMatch(/\.from\(\s*['"]citas['"]\s*\)/)
  })

  it('el portal público sigue resolviendo la clínica por tenants_public', () => {
    // Es la vista que NO se toca. Si alguien la elimina, la reserva online deja
    // de resolver la clínica por hostname.
    const ctx = leer('src/components/TenantContext.tsx')
    expect(ctx).toMatch(/\.from\(\s*['"]tenants_public['"]\s*\)/)
  })
})

// ─────────────────────────────────────────────────────────────
// La guarda que evita que esto vuelva a pasar.
// ─────────────────────────────────────────────────────────────

describe('regresión: no crear vistas que salteen RLS', () => {
  const DIR_MIGRACIONES = join(RAIZ, 'supabase/migrations')
  const TABLAS_CON_RLS = [
    'citas', 'pacientes', 'historial_dental', 'paciente_fotos', 'pagos',
    'facturas', 'tratamiento_items', 'ingresos_manuales', 'egresos_manuales',
    'presupuestos', 'consentimientos_firmados',
  ]

  it('toda vista nueva sobre una tabla con RLS declara security_invoker', () => {
    const infractores: string[] = []

    for (const archivo of readdirSync(DIR_MIGRACIONES).filter(f => f.endsWith('.sql'))) {
      // El dump del esquema es el registro histórico de lo que YA existía:
      // documenta el problema, no lo introduce. Esta migración es justamente
      // la que lo corrige.
      if (archivo === '20260722120000_remote_schema.sql') continue
      if (archivo === '20260807120000_cerrar_vistas_bi_expuestas.sql') continue

      const texto = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8')
      const sinComentarios = texto
        .split('\n')
        .filter(l => !l.trim().startsWith('--'))
        .join('\n')

      // Array.from y no un for-of sobre matchAll: el tsconfig del proyecto
      // apunta a es5 y no habilita downlevelIteration.
      const vistas = Array.from(
        sinComentarios.matchAll(
          /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(?:public\.)?["']?(\w+)["']?([\s\S]*?);/gi
        )
      )

      for (const m of vistas) {
        const [sentencia, nombre] = [m[0], m[1]]
        const tocaTablaProtegida = TABLAS_CON_RLS.some(t =>
          new RegExp(`FROM\\s+["']?(?:public\\.)?["']?${t}\\b`, 'i').test(sentencia)
        )
        const declaraInvoker = /security_invoker\s*=\s*(on|true)/i.test(sentencia)

        if (tocaTablaProtegida && !declaraInvoker) {
          infractores.push(`${archivo} → vista "${nombre}"`)
        }
      }
    }

    expect(
      infractores,
      'Una vista sin security_invoker corre con los privilegios de su dueño y ' +
      'saltea RLS. Agregá WITH (security_invoker = on) y un filtro por tenant_id:\n' +
      infractores.join('\n')
    ).toEqual([])
  })

  it('ninguna migración nueva concede permisos sobre vistas a anon', () => {
    const infractores: string[] = []

    for (const archivo of readdirSync(DIR_MIGRACIONES).filter(f => f.endsWith('.sql'))) {
      if (archivo === '20260722120000_remote_schema.sql') continue

      const texto = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8')
      const sinComentarios = texto
        .split('\n')
        .filter(l => !l.trim().startsWith('--'))
        .join('\n')

      const grants = Array.from(sinComentarios.matchAll(/GRANT[\s\S]*?TO\s+([^;]+);/gi))

      for (const m of grants) {
        const destinatarios = m[1]
        const objeto = m[0]
        if (/\banon\b/i.test(destinatarios) && /\bbi_\w+/i.test(objeto)) {
          infractores.push(`${archivo} → ${m[0].trim().slice(0, 80)}`)
        }
      }
    }

    expect(infractores).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────
// PENDIENTE DE EJECUCIÓN CONTRA STAGING / PRODUCCIÓN
//
// Estos tests corren sobre PGlite: prueban que la migración hace lo que dice,
// no que la base real haya quedado así. Lo que falta verificar a mano, después
// de aplicar la migración:
//
//   1. Las seis vistas ya no existen en la base real:
//        SELECT relname FROM pg_class
//         WHERE relnamespace='public'::regnamespace AND relkind IN ('v','m')
//         ORDER BY relname;
//      Esperado: solo bi_resumen y tenants_public.
//
//   2. `anon` ya no las lee vía PostgREST:
//        curl "https://<project>.supabase.co/rest/v1/bi_ingresos_por_mes?select=*" \
//             -H "apikey: <ANON_KEY>"
//      Esperado: 404 (la relación no existe).
//
//   3. Las pantallas siguen andando: abrir /bi, /finanzas y /dashboard con una
//      sesión real y confirmar que muestran datos.
//
//   4. El portal público sigue resolviendo la clínica: abrir /reserva/<slug>
//      sin sesión y confirmar que carga el branding.
//
// NO están automatizados porque requieren conexión a Supabase, y este entorno
// no tiene salida de red. No hay resultado que reportar hasta ejecutarlos.
// ─────────────────────────────────────────────────────────────
