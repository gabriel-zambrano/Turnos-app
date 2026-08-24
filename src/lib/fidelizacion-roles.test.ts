import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────
// B1.2 + B1.3 · Rol, límite y nota en las funciones de fidelización.
//
// POR QUÉ UN HARNESS PROPIO
//
// `tenant-isolation.test.ts` usa tablas sintéticas `(id, tenant_id, dato)`.
// Sirve para probar RLS, pero estas funciones necesitan `puntos_saldo_cache`,
// `costo_puntos`, `stock` y las 13 columnas de `historial_puntos`. Cargarle
// ese esquema a los 88 tests de aislamiento sería empeorarlos.
//
// LOS CUERPOS SE CARGAN DESDE LOS ARCHIVOS, NO SE TRANSCRIBEN
//
// Si escribiera las funciones a mano acá, validaría mi copia y no la
// migración. El estado "antes" sale de remote_schema.sql —cuyo md5 coincide
// con el cuerpo vivo de producción, verificado en FASE 0— y el "después" de
// la migración real.
//
// LO QUE ESTE HARNESS NO PUEDE PROBAR
//
// PGlite es monoproceso: no reproduce concurrencia. El `FOR UPDATE` que
// protege del doble canje existe y no se toca, pero acá no se ejercita. Se
// deja dicho en vez de escribir un test que aparente cubrirlo.
// ─────────────────────────────────────────────────────────────

const RAIZ = path.resolve(__dirname, '..', '..')
const leerMigracion = (a: string) =>
  readFileSync(path.join(RAIZ, 'supabase/migrations', a), 'utf-8')

const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '22222222-2222-2222-2222-222222222222'

const OWNER_A       = 'a0000000-0000-0000-0000-000000000001'
const ADMIN_A       = 'a0000000-0000-0000-0000-000000000002'
const ODONTOLOGO_A  = 'a0000000-0000-0000-0000-000000000003'
const STAFF_A       = 'a0000000-0000-0000-0000-000000000004'
const ADMIN_B       = 'b0000000-0000-0000-0000-000000000001'

const PACIENTE_A = 'c0000000-0000-0000-0000-000000000001'
const PACIENTE_B = 'c0000000-0000-0000-0000-000000000002'
const PREMIO_A   = 'd0000000-0000-0000-0000-000000000001'
const PREMIO_B   = 'd0000000-0000-0000-0000-000000000002'

const NOTA = 'correccion por carga erronea del martes'   // 38 caracteres

let db: PGlite

/**
 * Ejecuta como `authenticated` con el claim `sub` de ese usuario.
 *
 * El cambio de rol es LOCAL a la llamada: fuera de acá todo corre como
 * superusuario, que es quien puede crear funciones y sembrar datos. Un
 * `SET ROLE` global rompía el `CREATE OR REPLACE FUNCTION` de las migraciones
 * con `permission denied for schema public`.
 */
async function comoUsuario(uid: string, sql: string) {
  await db.exec(`SET ROLE authenticated; SET request.jwt.claims = '{"sub":"${uid}"}';`)
  try {
    return await db.query(sql)
  } finally {
    await db.exec(`RESET ROLE; SET request.jwt.claims = '';`)
  }
}

/** Extrae una función completa de un archivo SQL, delimitada por $$ o $function$. */
function extraerFuncion(sql: string, nombre: string): string {
  const re = new RegExp(
    String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"?(?:public"?\."?)?${nombre}"?\s*\(`,
    'i'
  )
  const m = re.exec(sql)
  if (!m) throw new Error(`No se encontró ${nombre}`)
  const delim = sql.slice(m.index).match(/\$(function)?\$/)
  if (!delim) throw new Error(`Sin delimitador en ${nombre}`)
  const d = delim[0]
  const i = sql.indexOf(d, m.index)
  const j = sql.indexOf(d, i + d.length)
  return sql.slice(m.index, j + d.length) + ';'
}

async function sembrar() {
  await db.exec(`
    UPDATE pacientes SET puntos_saldo_cache = 200;
    UPDATE premios   SET stock = 5, activo = true;
    DELETE FROM historial_puntos;
  `)
}

beforeAll(async () => {
  db = new PGlite()

  // Infra que en Supabase ya existe.
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub','')::uuid
    $$;
    CREATE ROLE anon           NOSUPERUSER;
    CREATE ROLE authenticated  NOSUPERUSER;
    CREATE ROLE service_role   NOSUPERUSER;
  `)

  // Esquema real, con las columnas que las funciones tocan de verdad.
  await db.exec(`
    CREATE TABLE tenant_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL, tenant_id uuid NOT NULL,
      role text NOT NULL DEFAULT 'admin'
    );
    CREATE TABLE pacientes (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
      nombre text, puntos_saldo_cache integer NOT NULL DEFAULT 0
    );
    CREATE TABLE premios (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
      nombre text NOT NULL, costo_puntos integer NOT NULL,
      stock integer, activo boolean NOT NULL DEFAULT true
    );
    CREATE TABLE historial_puntos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL, paciente_id uuid NOT NULL,
      cita_id uuid, premio_id uuid,
      tipo_movimiento text NOT NULL,
      puntos_afectados integer NOT NULL,
      monto_gasto_origen numeric,
      saldo_resultante integer NOT NULL,
      visita_numero_registrada integer,
      aprobado_por_usuario_id uuid,
      nota text,
      creado_en timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT historial_puntos_tipo_movimiento_check CHECK (tipo_movimiento = ANY (ARRAY[
        'gasto_tratamiento','bonus_asistencia','canje_premio',
        'ajuste_manual','ajuste_reverso','migracion_inicial']))
    );
  `)

  // Privilegios que en Supabase `authenticated` ya tiene por defecto.
  // Sin esto el harness falla con `permission denied` antes de llegar a
  // probar nada — y no probaría lo que queremos: acá lo que se verifica es
  // la lógica de las funciones, no los privilegios de tabla.
  await db.exec(`
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON tenant_users, pacientes, premios, historial_puntos
      TO authenticated;
  `)

  await db.exec(`
    INSERT INTO tenant_users (user_id, tenant_id, role) VALUES
      ('${OWNER_A}','${TENANT_A}','owner'),
      ('${ADMIN_A}','${TENANT_A}','admin'),
      ('${ODONTOLOGO_A}','${TENANT_A}','odontologo'),
      ('${STAFF_A}','${TENANT_A}','staff'),
      ('${ADMIN_B}','${TENANT_B}','admin');
    INSERT INTO pacientes (id, tenant_id, nombre, puntos_saldo_cache) VALUES
      ('${PACIENTE_A}','${TENANT_A}','Paciente de A', 200),
      ('${PACIENTE_B}','${TENANT_B}','Paciente de B', 200);
    INSERT INTO premios (id, tenant_id, nombre, costo_puntos, stock) VALUES
      ('${PREMIO_A}','${TENANT_A}','Limpieza gratis', 100, 5),
      ('${PREMIO_B}','${TENANT_B}','Blanqueamiento', 100, 5);
  `)

  // tiene_rol(), tal como está en producción (migración de B1.1).
  await db.exec(extraerFuncion(
    leerMigracion('20260820180200_b1_1_default_privileges_y_tiene_rol.sql'),
    'tiene_rol'
  ))

})

afterAll(async () => { await db?.close() })

// ═════════════════════════════════════════════════════════════

describe('estado previo · las funciones actuales NO validan rol ni límite', () => {
  beforeAll(async () => {
    const dump = leerMigracion('20260722120000_remote_schema.sql')
    await db.exec(extraerFuncion(dump, 'fn_ajustar_puntos_manual'))
    await db.exec(extraerFuncion(dump, 'fn_canjear_premio'))
    await sembrar()
  })

  it('hoy un odontólogo puede ajustar puntos', async () => {
    // Si esto fallara, el resto no probaría nada: estaríamos verificando que
    // se cierra algo que ya estaba cerrado.
    await comoUsuario(ODONTOLOGO_A,
      `SELECT fn_ajustar_puntos_manual('${PACIENTE_A}', 50, 'ajuste_manual', '${NOTA}')`)
    const r = await db.query<{ s: number }>(
      `SELECT puntos_saldo_cache s FROM pacientes WHERE id='${PACIENTE_A}'`)
    expect(r.rows[0].s).toBe(250)
  })

  it('hoy no hay límite: 5000 puntos pasan', async () => {
    await comoUsuario(ADMIN_A,
      `SELECT fn_ajustar_puntos_manual('${PACIENTE_A}', 5000, 'ajuste_manual', '${NOTA}')`)
    const r = await db.query<{ s: number }>(
      `SELECT puntos_saldo_cache s FROM pacientes WHERE id='${PACIENTE_A}'`)
    expect(r.rows[0].s).toBe(5250)
  })

  it('hoy la nota puede ser NULL y la función la inventa', async () => {
    await comoUsuario(ADMIN_A,
      `SELECT fn_ajustar_puntos_manual('${PACIENTE_A}', 10, 'ajuste_manual', NULL)`)
    const r = await db.query<{ nota: string }>(
      `SELECT nota FROM historial_puntos ORDER BY creado_en DESC LIMIT 1`)
    expect(r.rows[0].nota).toBe('Ajuste manual de puntos')
  })

  it('hoy un odontólogo puede canjear premios', async () => {
    await comoUsuario(ODONTOLOGO_A,
      `SELECT fn_canjear_premio('${PACIENTE_A}', '${PREMIO_A}')`)
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int n FROM historial_puntos WHERE tipo_movimiento='canje_premio'`)
    expect(r.rows[0].n).toBe(1)
  })
})

describe('B1.2 · fn_ajustar_puntos_manual', () => {
  beforeAll(async () => {
    await db.exec(leerMigracion('20260822130000_b1_2_b1_3_rol_limite_y_nota.sql'))
    await sembrar()
  })

  const ajustar = (uid: string, puntos: number, nota: string | null) =>
    comoUsuario(uid,
      `SELECT fn_ajustar_puntos_manual('${PACIENTE_A}', ${puntos}, 'ajuste_manual', ${nota === null ? 'NULL' : `'${nota}'`})`)

  it('1. owner ajusta', async () => {
    await ajustar(OWNER_A, 100, NOTA)
    const r = await db.query<{ s: number }>(`SELECT puntos_saldo_cache s FROM pacientes WHERE id='${PACIENTE_A}'`)
    expect(r.rows[0].s).toBe(300)
  })

  it('2. admin ajusta', async () => {
    await sembrar()
    await ajustar(ADMIN_A, 100, NOTA)
    const r = await db.query<{ s: number }>(`SELECT puntos_saldo_cache s FROM pacientes WHERE id='${PACIENTE_A}'`)
    expect(r.rows[0].s).toBe(300)
  })

  it('3. odontólogo NO ajusta', async () => {
    await expect(ajustar(ODONTOLOGO_A, 100, NOTA)).rejects.toThrow(/administrador/i)
  })

  it('4. staff NO ajusta', async () => {
    await expect(ajustar(STAFF_A, 100, NOTA)).rejects.toThrow(/administrador/i)
  })

  it('5. cross-tenant: admin de B sobre paciente de A', async () => {
    await expect(
      comoUsuario(ADMIN_B, `SELECT fn_ajustar_puntos_manual('${PACIENTE_A}', 100, 'ajuste_manual', '${NOTA}')`)
    ).rejects.toThrow(/No autorizado/i)
  })

  it('6. 501 puntos rechazados', async () => {
    await expect(ajustar(ADMIN_A, 501, NOTA)).rejects.toThrow(/no puede superar los 500/i)
  })

  it('7. exactamente 500 aceptados', async () => {
    await sembrar()
    await ajustar(ADMIN_A, 500, NOTA)
    const r = await db.query<{ s: number }>(`SELECT puntos_saldo_cache s FROM pacientes WHERE id='${PACIENTE_A}'`)
    expect(r.rows[0].s).toBe(700)
  })

  it('8. −501 rechazado: el límite es sobre el valor absoluto', async () => {
    await sembrar()
    await db.exec(`UPDATE pacientes SET puntos_saldo_cache = 1000 WHERE id='${PACIENTE_A}'`)
    await expect(ajustar(ADMIN_A, -501, NOTA)).rejects.toThrow(/no puede superar los 500/i)
  })

  it('9. nota de 9 caracteres rechazada', async () => {
    await expect(ajustar(ADMIN_A, 100, 'abcdefghi')).rejects.toThrow(/al menos 10 caracteres/i)
  })

  it('10. el texto de relleno rechazado aunque cumpla la longitud', async () => {
    await expect(ajustar(ADMIN_A, 100, 'Ajuste manual de puntos')).rejects.toThrow(/al menos 10 caracteres/i)
  })

  it('10b. nota NULL rechazada', async () => {
    await expect(ajustar(ADMIN_A, 100, null)).rejects.toThrow(/al menos 10 caracteres/i)
  })

  it('11. saldo negativo sigue rechazado', async () => {
    await sembrar()
    await db.exec(`UPDATE pacientes SET puntos_saldo_cache = 50 WHERE id='${PACIENTE_A}'`)
    await expect(ajustar(ADMIN_A, -100, NOTA)).rejects.toThrow(/saldo negativo/i)
  })

  it('12. paciente inexistente', async () => {
    await expect(
      comoUsuario(ADMIN_A, `SELECT fn_ajustar_puntos_manual('${TENANT_B}', 100, 'ajuste_manual', '${NOTA}')`)
    ).rejects.toThrow(/Paciente no encontrado/i)
  })

  it('13. auth.uid() se propaga: el ledger registra al actor correcto', async () => {
    // Si SECURITY DEFINER alterara request.jwt.claims, tiene_rol() no vería
    // al usuario y TODO sería rechazado. Este test lo verifica en vez de
    // darlo por supuesto.
    await sembrar()
    await ajustar(ADMIN_A, 100, NOTA)
    const r = await db.query<{ u: string; nota: string }>(
      `SELECT aprobado_por_usuario_id u, nota FROM historial_puntos ORDER BY creado_en DESC LIMIT 1`)
    expect(r.rows[0].u).toBe(ADMIN_A)
    expect(r.rows[0].nota).toBe(NOTA)      // trim aplicado, sin COALESCE
  })

  it('13b. la nota se guarda normalizada con trim', async () => {
    await sembrar()
    await ajustar(ADMIN_A, 100, `   ${NOTA}   `)
    const r = await db.query<{ nota: string }>(
      `SELECT nota FROM historial_puntos ORDER BY creado_en DESC LIMIT 1`)
    expect(r.rows[0].nota).toBe(NOTA)
  })
})

describe('B1.3 · fn_canjear_premio', () => {
  beforeAll(sembrar)

  const canjear = (uid: string, premio = PREMIO_A) =>
    comoUsuario(uid, `SELECT fn_canjear_premio('${PACIENTE_A}', '${premio}')`)

  it('14a. owner canjea', async () => {
    await sembrar()
    await canjear(OWNER_A)
    const r = await db.query<{ s: number }>(`SELECT puntos_saldo_cache s FROM pacientes WHERE id='${PACIENTE_A}'`)
    expect(r.rows[0].s).toBe(100)
  })

  it('14b. admin canjea', async () => {
    await sembrar()
    await canjear(ADMIN_A)
    const r = await db.query<{ n: number }>(`SELECT stock n FROM premios WHERE id='${PREMIO_A}'`)
    expect(r.rows[0].n).toBe(4)
  })

  it('14c. staff canjea', async () => {
    await sembrar()
    await canjear(STAFF_A)
    const r = await db.query<{ s: number }>(`SELECT puntos_saldo_cache s FROM pacientes WHERE id='${PACIENTE_A}'`)
    expect(r.rows[0].s).toBe(100)
  })

  it('15. odontólogo NO canjea (DO-4)', async () => {
    await sembrar()
    await expect(canjear(ODONTOLOGO_A)).rejects.toThrow(/no permite canjear/i)
  })

  it('16. premio de otro tenant rechazado', async () => {
    // El ataque que evita usar v_premio_tenant_id y no v_tenant_id.
    await sembrar()
    await expect(canjear(ADMIN_A, PREMIO_B)).rejects.toThrow(/No autorizado/i)
  })

  it('16b. el stock del premio ajeno queda intacto', async () => {
    const r = await db.query<{ n: number }>(`SELECT stock n FROM premios WHERE id='${PREMIO_B}'`)
    expect(r.rows[0].n).toBe(5)
  })

  it('regresión: premio inactivo', async () => {
    await sembrar()
    await db.exec(`UPDATE premios SET activo = false WHERE id='${PREMIO_A}'`)
    await expect(canjear(ADMIN_A)).rejects.toThrow(/no está activo/i)
  })

  it('regresión: sin stock', async () => {
    await sembrar()
    await db.exec(`UPDATE premios SET stock = 0 WHERE id='${PREMIO_A}'`)
    await expect(canjear(ADMIN_A)).rejects.toThrow(/stock/i)
  })

  it('regresión: saldo insuficiente', async () => {
    await sembrar()
    await db.exec(`UPDATE pacientes SET puntos_saldo_cache = 10 WHERE id='${PACIENTE_A}'`)
    await expect(canjear(ADMIN_A)).rejects.toThrow(/insuficiente/i)
  })
})
