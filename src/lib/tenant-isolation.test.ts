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

// Las 4 tablas núcleo protegidas por la migración.
const TABLAS = ['citas', 'pacientes', 'bloqueos', 'tratamientos'] as const

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
  await db.exec(`
    CREATE TABLE tenant_users (tenant_id uuid, user_id uuid);
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

  // 4. Permisos del rol authenticated (en Supabase se otorgan por defecto).
  await db.exec(`
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT ON tenant_users TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON citas, pacientes, bloqueos, tratamientos TO authenticated;
  `)

  // 5. Sembrar: 2 clínicas, 2 usuarios (uno por clínica), 1 fila por tabla por clínica.
  await db.exec(`
    INSERT INTO tenant_users (tenant_id, user_id) VALUES
      ('${TENANT_A}', '${USER_A}'),
      ('${TENANT_B}', '${USER_B}');
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
