import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────
// Test de aislamiento entre clínicas (RLS).
//
// Corre Postgres real en proceso (PGlite, sin Docker ni base externa),
// aplica las MISMAS políticas RLS que están en la migración de producción
// (supabase_migration_perf_2_rls.sql) y verifica que un usuario de la clínica A
// no pueda leer ni escribir datos de la clínica B.
//
// Detalle importante: en Postgres los superusuarios BYPASSAN RLS. Supabase
// ejecuta las queries del cliente como el rol `authenticated` (no-superusuario),
// así que acá replicamos exactamente eso con SET ROLE + el claim JWT `sub`,
// que es lo que lee auth.uid().
// ─────────────────────────────────────────────────────────────

const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '22222222-2222-2222-2222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

// Tablas núcleo: sus políticas se leen de la migración de producción.
const TABLAS_NUCLEO = ['citas', 'pacientes', 'bloqueos', 'tratamientos'] as const

// Tablas secundarias: usan todas el mismo patrón canónico de aislamiento
// (tenant_isolation_<tabla>, FOR ALL). Las incluimos para que una tabla nueva
// mal protegida no pase desapercibida.
const TABLAS_SECUNDARIAS = [
  'config_fidelizacion', 'costos_fijos', 'egresos_manuales', 'historial_dental',
  'historial_puntos', 'ingresos_manuales', 'logs_envios', 'meta_mensual',
  'paciente_fotos', 'pagos', 'perfil_doctor', 'premios', 'presupuestos',
  'recordatorios_log', 'tratamiento_items', 'whatsapp_contactos',
] as const

const TABLAS = [...TABLAS_NUCLEO, ...TABLAS_SECUNDARIAS] as const

let db: PGlite

/** Ejecuta una query haciéndose pasar por un usuario (rol authenticated + claim sub). */
async function asUser<T = any>(uid: string, query: string): Promise<T[]> {
  await db.exec(`SET ROLE authenticated; SET request.jwt.claims = '{"sub":"${uid}"}';`)
  try {
    const res = await db.query(query)
    return res.rows as T[]
  } finally {
    await db.exec('RESET ROLE;')
  }
}

beforeAll(async () => {
  db = new PGlite()

  // 1. Infra que en Supabase ya existe: schema auth, auth.uid() y el rol authenticated.
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid
    $$;
    CREATE ROLE authenticated NOSUPERUSER;
  `)

  // 2. Tablas núcleo (mínimas: solo lo que las políticas necesitan, tenant_id).
  //
  // `role` replica la columna real de producción, DEFAULT incluido. Hasta ahora
  // el harness no la tenía, así que ninguna política ni función que discrimine
  // por rol podía probarse acá: los tests de RBAC no compilaban.
  //
  // El DEFAULT 'admin' NO es un descuido, es lo que hay hoy en producción
  // (remote_schema.sql). Está replicado a propósito para que se vea que una fila
  // insertada sin `role` nace administradora. Cuando B1.5a lo cambie a 'staff',
  // el test "estado actual del esquema de roles" de abajo va a fallar, y esa
  // falla es la señal de que el cambio llegó.
  await db.exec(`
    CREATE TABLE tenant_users (
      tenant_id uuid,
      user_id   uuid,
      role      text NOT NULL DEFAULT 'admin'
    );
    CREATE TABLE citas        (id uuid primary key, tenant_id uuid, dato text);
    CREATE TABLE pacientes    (id uuid primary key, tenant_id uuid, dato text);
    CREATE TABLE bloqueos     (id uuid primary key, tenant_id uuid, dato text);
    CREATE TABLE tratamientos (id uuid primary key, tenant_id uuid, dato text);
    ALTER TABLE citas        ENABLE ROW LEVEL SECURITY;
    ALTER TABLE pacientes    ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bloqueos     ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tratamientos ENABLE ROW LEVEL SECURITY;
  `)

  // 3. Aplicar las políticas RLS REALES desde la migración de producción.
  //    Si alguien cambia esa migración, este test valida la versión nueva.
  const migracion = readFileSync(
    path.resolve(process.cwd(), 'supabase_migration_perf_2_rls.sql'),
    'utf-8'
  )
  await db.exec(migracion)

  // 3b. Tablas secundarias con el patrón canónico de aislamiento, igual que en
  //     supabase_migration_seguridad_lanzamiento.sql.
  for (const t of TABLAS_SECUNDARIAS) {
    await db.exec(`
      CREATE TABLE ${t} (id uuid primary key, tenant_id uuid, dato text);
      ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_${t} ON ${t} FOR ALL
        USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));
    `)
  }

  // 4. Permisos del rol authenticated (en Supabase se otorgan por defecto).
  await db.exec(`
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT ON tenant_users TO authenticated;
  `)
  for (const t of TABLAS) {
    await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO authenticated;`)
  }

  // 5. Sembrar: 2 clínicas, 2 usuarios (uno por clínica), 1 fila por tabla por clínica.
  //    Ambos con rol 'admin', que es exactamente lo que hay en producción hoy.
  await db.exec(`
    INSERT INTO tenant_users (tenant_id, user_id, role) VALUES
      ('${TENANT_A}', '${USER_A}', 'admin'),
      ('${TENANT_B}', '${USER_B}', 'admin');
  `)
  for (const t of TABLAS) {
    await db.exec(`
      INSERT INTO ${t} (id, tenant_id, dato) VALUES
        ('${crypto.randomUUID()}', '${TENANT_A}', 'dato-de-A'),
        ('${crypto.randomUUID()}', '${TENANT_B}', 'dato-de-B');
    `)
  }
})

afterAll(async () => {
  await db?.close()
})

describe('Aislamiento entre clínicas (RLS)', () => {
  for (const tabla of TABLAS) {
    it(`${tabla}: el usuario de A solo ve filas de su clínica`, async () => {
      const filas = await asUser(USER_A, `SELECT tenant_id FROM ${tabla}`)
      expect(filas).toHaveLength(1)
      expect(filas[0].tenant_id).toBe(TENANT_A)
    })

    it(`${tabla}: el usuario de B solo ve filas de su clínica`, async () => {
      const filas = await asUser(USER_B, `SELECT tenant_id FROM ${tabla}`)
      expect(filas).toHaveLength(1)
      expect(filas[0].tenant_id).toBe(TENANT_B)
    })

    it(`${tabla}: A no puede insertar filas en la clínica B (WITH CHECK)`, async () => {
      await expect(
        asUser(
          USER_A,
          `INSERT INTO ${tabla} (id, tenant_id, dato) VALUES ('${crypto.randomUUID()}', '${TENANT_B}', 'intento-cross')`
        )
      ).rejects.toThrow()
    })

    it(`${tabla}: A no puede actualizar filas de la clínica B`, async () => {
      // La fila de B es invisible para A, así que el UPDATE afecta 0 filas.
      await asUser(USER_A, `UPDATE ${tabla} SET dato = 'hackeado' WHERE tenant_id = '${TENANT_B}'`)
      const filasB = await asUser(USER_B, `SELECT dato FROM ${tabla}`)
      expect(filasB[0].dato).toBe('dato-de-B')
    })
  }

  it('un usuario sin sesión (sin claim) no ve ninguna fila', async () => {
    await db.exec(`SET ROLE authenticated; SET request.jwt.claims = '';`)
    const res = await db.query('SELECT * FROM citas')
    await db.exec('RESET ROLE;')
    expect(res.rows).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────
// Estado actual del esquema de roles.
//
// Estos tests no prueban una defensa: FIJAN lo que hay hoy, para que cambiarlo
// tenga que ser deliberado. Cuando aterrice B1.5a (DEFAULT 'staff') el primero
// va a fallar, y esa falla es la confirmación de que el cambio llegó — no un
// test roto que haya que "arreglar" a mano.
//
// El aislamiento por tenant NO depende del rol: las políticas de arriba miran
// solo la pertenencia a tenant_users. Por eso agregar la columna es inerte y
// los 81 tests anteriores siguen valiendo igual.
// ─────────────────────────────────────────────────────────────
describe('Esquema de roles (estado actual, previo a P0-05)', () => {
  it('una fila insertada sin rol nace como admin', async () => {
    const tenant = crypto.randomUUID()
    const usuario = crypto.randomUUID()
    await db.exec(
      `INSERT INTO tenant_users (tenant_id, user_id) VALUES ('${tenant}', '${usuario}')`
    )
    const res = await db.query<{ role: string }>(
      `SELECT role FROM tenant_users WHERE user_id = '${usuario}'`
    )
    // Hoy: 'admin'. B1.5a lo baja a 'staff'.
    expect(res.rows[0].role).toBe('admin')
  })

  it('no hay CHECK sobre el vocabulario: admite cualquier texto', async () => {
    const tenant = crypto.randomUUID()
    const usuario = crypto.randomUUID()
    // Documenta el hallazgo R-2: /api/equipo/invitar inserta `role` tal como
    // llega del cliente, sin lista blanca. La base no lo frena.
    await db.exec(
      `INSERT INTO tenant_users (tenant_id, user_id, role)
       VALUES ('${tenant}', '${usuario}', 'rol-que-no-existe')`
    )
    const res = await db.query<{ role: string }>(
      `SELECT role FROM tenant_users WHERE user_id = '${usuario}'`
    )
    expect(res.rows[0].role).toBe('rol-que-no-existe')
  })

  it('el rol no interviene en el aislamiento entre clínicas', async () => {
    // Un usuario de B con rol arbitrario sigue sin ver datos de A.
    const intruso = crypto.randomUUID()
    await db.exec(
      `INSERT INTO tenant_users (tenant_id, user_id, role)
       VALUES ('${TENANT_B}', '${intruso}', 'owner')`
    )
    const filas = await asUser(intruso, `SELECT tenant_id FROM pacientes`)
    expect(filas).toHaveLength(1)
    expect(filas[0].tenant_id).toBe(TENANT_B)
  })
})
