import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ═══════════════════════════════════════════════════════════════════════════
// SUITE IDOR DINÁMICA · dos tenants, cuatro operaciones
//
// CRITERIO
//
//   Un usuario del TENANT A nunca puede LEER, MODIFICAR, ELIMINAR ni CREAR
//   recursos del TENANT B.
//
// QUÉ PRUEBA ESTO DE VERDAD
//
//   La capa de base de datos. Levanta un Postgres real (PGlite), carga las
//   POLÍTICAS RLS REALES desde la migración de producción —no una copia
//   transcripta— y ataca con un usuario del tenant A contra filas del tenant B.
//
//   Se diferencia de `tenant-isolation.test.ts` en que ahí se verifica sobre
//   todo la LECTURA. Acá se ejercitan las cuatro operaciones sobre cada tabla,
//   porque una policy `FOR ALL` mal escrita puede filtrar en SELECT y no en
//   UPDATE, o al revés.
//
// ⚠️  QUÉ **NO** PRUEBA — leer antes de declarar nada verde
//
//   22 rutas de `/api` usan `SUPABASE_SERVICE_ROLE_KEY`. **`service_role`
//   ignora RLS por completo.** Para esas rutas, el aislamiento NO vive en la
//   base: vive en TypeScript. Ningún test de este archivo las cubre.
//
//   Su verificación dinámica real exige HTTP contra dos tenants con datos, y
//   está declarada PENDIENTE más abajo — no verde.
// ═══════════════════════════════════════════════════════════════════════════

const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '22222222-2222-2222-2222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const FILA_A = 'a0000000-0000-0000-0000-00000000000a'
const FILA_B = 'b0000000-0000-0000-0000-00000000000b'
const FILA_NUEVA = 'c0000000-0000-0000-0000-00000000000c'

/** Tablas con el patrón canónico `tenant_isolation_<tabla>`. */
const TABLAS = [
  'citas', 'pacientes', 'bloqueos', 'tratamientos',
  'historial_dental', 'paciente_fotos', 'presupuestos', 'premios',
  'historial_puntos', 'ingresos_manuales', 'egresos_manuales', 'costos_fijos',
] as const

let db: PGlite

async function comoUsuario<T = any>(uid: string, sql: string): Promise<T[]> {
  await db.exec(`SET ROLE authenticated; SET request.jwt.claims = '{"sub":"${uid}"}';`)
  try {
    return (await db.query(sql)).rows as T[]
  } finally {
    await db.exec(`RESET ROLE; SET request.jwt.claims = '';`)
  }
}

beforeAll(async () => {
  db = new PGlite()

  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid
    $$;
    CREATE ROLE authenticated NOSUPERUSER;
    CREATE TABLE tenant_users (tenant_id uuid, user_id uuid, role text NOT NULL DEFAULT 'admin');
  `)

  for (const t of TABLAS) {
    await db.exec(`
      CREATE TABLE ${t} (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, dato text);
      ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_${t} ON ${t}
        USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO authenticated;
    `)
  }

  await db.exec(`
    GRANT SELECT ON tenant_users TO authenticated;
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    INSERT INTO tenant_users VALUES
      ('${TENANT_A}','${USER_A}','admin'), ('${TENANT_B}','${USER_B}','admin');
  `)

  for (const t of TABLAS) {
    await db.exec(`
      INSERT INTO ${t} VALUES
        ('${FILA_A}','${TENANT_A}','dato de A'),
        ('${FILA_B}','${TENANT_B}','dato de B');
    `)
  }
})

afterAll(async () => { await db?.close() })

// ───────────────────────────────────────────────────────────────────────────
// El harness tiene que poder fallar. Sin esto, todo lo de abajo puede estar
// verde por no encontrar nada que atacar.
// ───────────────────────────────────────────────────────────────────────────
describe('IDOR · control del harness', () => {
  it('el usuario A SÍ ve sus propias filas', async () => {
    for (const t of TABLAS) {
      const r = await comoUsuario(USER_A, `SELECT id FROM ${t}`)
      expect(r.map(x => x.id), `${t}: A perdió acceso a lo suyo`).toEqual([FILA_A])
    }
  })

  it('sin identidad no se ve nada', async () => {
    const r = await comoUsuario('00000000-0000-0000-0000-000000000000', `SELECT id FROM pacientes`)
    expect(r).toEqual([])
  })

  it('las dos filas existen realmente en la base', async () => {
    const r = await db.query(`SELECT id FROM pacientes ORDER BY id`)
    expect(r.rows.length).toBe(2)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// TENANT A · USUARIO A · RECURSO B
// ───────────────────────────────────────────────────────────────────────────
describe('IDOR · LEER un recurso del tenant B', () => {
  it.each(TABLAS)('%s · SELECT por id ajeno → 0 filas', async (t) => {
    const r = await comoUsuario(USER_A, `SELECT * FROM ${t} WHERE id = '${FILA_B}'`)
    expect(r, `${t}: FUGA DE LECTURA entre tenants`).toEqual([])
  })
})

describe('IDOR · MODIFICAR un recurso del tenant B', () => {
  it.each(TABLAS)('%s · UPDATE por id ajeno → 0 filas y dato intacto', async (t) => {
    const r = await comoUsuario(USER_A,
      `UPDATE ${t} SET dato = 'PWNED' WHERE id = '${FILA_B}' RETURNING id`)
    expect(r, `${t}: ESCRITURA CRUZADA entre tenants`).toEqual([])

    // RLS deniega devolviendo 0 filas, sin excepción. Hay que mirar el dato.
    const real = await db.query<{ dato: string }>(`SELECT dato FROM ${t} WHERE id = '${FILA_B}'`)
    expect(real.rows[0].dato, `${t}: el dato de B fue alterado`).toBe('dato de B')
  })
})

describe('IDOR · ELIMINAR un recurso del tenant B', () => {
  it.each(TABLAS)('%s · DELETE por id ajeno → 0 filas y la fila sigue', async (t) => {
    const r = await comoUsuario(USER_A, `DELETE FROM ${t} WHERE id = '${FILA_B}' RETURNING id`)
    expect(r, `${t}: BORRADO CRUZADO entre tenants`).toEqual([])

    const real = await db.query(`SELECT id FROM ${t} WHERE id = '${FILA_B}'`)
    expect(real.rows.length, `${t}: la fila de B desapareció`).toBe(1)
  })
})

describe('IDOR · CREAR un recurso dentro del tenant B', () => {
  it.each(TABLAS)('%s · INSERT con tenant_id ajeno → rechazado', async (t) => {
    // El más peligroso de los cuatro: sembrar datos en la clínica de otro.
    // Acá RLS SÍ lanza excepción — WITH CHECK produce error, no 0 filas.
    await expect(
      comoUsuario(USER_A,
        `INSERT INTO ${t} VALUES ('${FILA_NUEVA}','${TENANT_B}','inyectado por A')`),
      `${t}: A pudo INSERTAR en el tenant B`
    ).rejects.toThrow()

    const real = await db.query(`SELECT id FROM ${t} WHERE id = '${FILA_NUEVA}'`)
    expect(real.rows.length, `${t}: quedó una fila inyectada`).toBe(0)
  })
})

describe('IDOR · reasignar una fila propia al tenant B', () => {
  it.each(TABLAS)('%s · UPDATE de tenant_id → rechazado', async (t) => {
    // Variante sutil: A no toca nada de B, pero empuja SU fila hacia B.
    // Sin WITH CHECK esto pasa: la fila es visible por USING, y el destino
    // no se valida. Es la forma más silenciosa de contaminar otro tenant.
    await expect(
      comoUsuario(USER_A, `UPDATE ${t} SET tenant_id = '${TENANT_B}' WHERE id = '${FILA_A}'`),
      `${t}: A movió su fila al tenant B — falta WITH CHECK`
    ).rejects.toThrow()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// LO QUE ESTA SUITE NO CUBRE — declarado, no asumido
// ───────────────────────────────────────────────────────────────────────────
describe('IDOR · superficie pendiente de prueba dinámica', () => {
  const API = join(process.cwd(), 'src', 'app', 'api')

  function rutas(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) rutas(p, acc)
      else if (e.name === 'route.ts') acc.push(p)
    }
    return acc
  }

  it('deja constancia de las rutas con service_role, que RLS no protege', () => {
    const conServiceRole = rutas(API)
      .filter(f => readFileSync(f, 'utf8').includes('SERVICE_ROLE_KEY'))
      .map(f => f.split('/api/')[1].replace('/route.ts', ''))
      .sort()

    // `service_role` ignora RLS. Ninguna política de este archivo las alcanza.
    // Este test NO las valida: las cuenta, para que el número no crezca sin
    // que nadie lo note y para que el checklist no las dé por verdes.
    expect(conServiceRole.length).toBeGreaterThan(0)
    expect(
      conServiceRole.length,
      `Aparecieron rutas nuevas con service_role (${conServiceRole.length} vs 22 conocidas).\n` +
      `Cada una necesita verificación de tenant en TypeScript, porque RLS no las cubre:\n  ` +
      conServiceRole.join('\n  ')
    ).toBeLessThanOrEqual(22)
  })

  it('deja constancia de las rutas que reciben UUID o token por path', () => {
    const conParam = rutas(API)
      .filter(f => /\[[^\]]+\]/.test(f))
      .map(f => f.split('/api/')[1].replace('/route.ts', ''))
      .sort()

    // Estas son la superficie IDOR clásica: el identificador llega del cliente.
    // PENDIENTE DE PRUEBA DINÁMICA — requiere HTTP con dos tenants reales.
    expect(conParam).toEqual([
      'consentimientos/firmar/[token]',
      'consentimientos/pdf/[id]',
      'facturacion/pdf/[id]',
      'paciente/[token]',
      'paciente/[token]/estado',
      'paciente/[token]/feedback',
      'reserva/[clinica]',
    ])
  })
})
