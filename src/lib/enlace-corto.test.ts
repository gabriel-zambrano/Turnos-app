import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────
// Corre la migración REAL del enlace corto contra un Postgres de verdad.
//
// Lo que se verifica no es que "ande", sino las tres propiedades de las que
// depende que el link que le llegó al paciente no se rompa nunca:
//
//   1. Emitir dos veces devuelve el MISMO código. Si no, cada recordatorio
//      generaría un link nuevo y el del mensaje anterior quedaría muerto.
//   2. El alfabeto no tiene caracteres ambiguos. El paciente que no encuentra
//      el mensaje llama al consultorio y lo lee en voz alta.
//   3. Los códigos no se repiten ni son predecibles: el código ES la
//      credencial de acceso al turno.
// ─────────────────────────────────────────────────────────────

const TENANT = '11111111-1111-1111-1111-111111111111'
const PACIENTE = '22222222-2222-2222-2222-222222222222'
const CITA = '33333333-3333-3333-3333-333333333333'
const OTRA_CITA = '44444444-4444-4444-4444-444444444444'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()

  // Esquema mínimo con lo que la migración necesita referenciar.
  await db.exec(`
    CREATE TABLE tenants  (id uuid PRIMARY KEY);
    CREATE TABLE pacientes(id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
    CREATE TABLE citas (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      paciente_id uuid NOT NULL REFERENCES pacientes(id),
      fecha_hora timestamptz NOT NULL
    );
    INSERT INTO tenants VALUES ('${TENANT}');
    INSERT INTO pacientes VALUES ('${PACIENTE}', '${TENANT}');
    INSERT INTO citas VALUES ('${CITA}', '${TENANT}', '${PACIENTE}', now());
    INSERT INTO citas VALUES ('${OTRA_CITA}', '${TENANT}', '${PACIENTE}', now());
  `)

  const migracion = readFileSync(
    path.join(__dirname, '../../supabase/migrations/20260806160000_enlace_corto_de_turno.sql'),
    'utf8'
  )
  await db.exec(migracion)
})

async function emitir(citaId: string): Promise<string> {
  const r = await db.query<{ emitir_enlace_turno: string }>(
    `SELECT emitir_enlace_turno('${citaId}')`
  )
  return r.rows[0].emitir_enlace_turno
}

describe('la migración es idempotente', () => {
  it('correrla dos veces no rompe', async () => {
    const migracion = readFileSync(
      path.join(__dirname, '../../supabase/migrations/20260806160000_enlace_corto_de_turno.sql'),
      'utf8'
    )
    await expect(db.exec(migracion)).resolves.toBeDefined()
  })
})

describe('el código', () => {
  it('tiene doce caracteres', async () => {
    expect(await emitir(CITA)).toHaveLength(12)
  })

  it('no usa I, L, O ni U', async () => {
    // Se confunden con 1, 1, 0 y V al leerlas en voz alta o al tipearlas.
    const codigos: string[] = []
    for (let i = 0; i < 200; i++) {
      const r = await db.query<{ generar_codigo_enlace: string }>('SELECT generar_codigo_enlace()')
      codigos.push(r.rows[0].generar_codigo_enlace)
    }
    expect(codigos.join('')).not.toMatch(/[ILOU]/)
    expect(codigos.join('')).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/)
  })

  it('no se repite', async () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 300; i++) {
      const r = await db.query<{ generar_codigo_enlace: string }>('SELECT generar_codigo_enlace()')
      vistos.add(r.rows[0].generar_codigo_enlace)
    }
    expect(vistos.size).toBe(300)
  })

  it('usa todo el alfabeto y no un puñado de letras', async () => {
    // Un mapeo mal hecho —por ejemplo tomar el dígito hexadecimal suelto en
    // vez del par— daría códigos de solo 16 símbolos distintos. Se vería
    // aleatorio y tendría la mitad de la entropía.
    let juntos = ''
    for (let i = 0; i < 100; i++) {
      const r = await db.query<{ generar_codigo_enlace: string }>('SELECT generar_codigo_enlace()')
      juntos += r.rows[0].generar_codigo_enlace
    }
    expect(new Set(juntos).size).toBeGreaterThan(28)
  })
})

describe('emitir_enlace_turno', () => {
  it('devuelve siempre el mismo código para la misma cita', async () => {
    // Es la propiedad que importa: el link que ya está en el WhatsApp del
    // paciente tiene que seguir funcionando después de cada recordatorio.
    const primero = await emitir(CITA)
    const segundo = await emitir(CITA)
    const tercero = await emitir(CITA)
    expect(segundo).toBe(primero)
    expect(tercero).toBe(primero)
  })

  it('da códigos distintos a citas distintas', async () => {
    expect(await emitir(OTRA_CITA)).not.toBe(await emitir(CITA))
  })

  it('hereda el tenant de la cita', async () => {
    await emitir(CITA)
    const r = await db.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM enlaces_turno WHERE cita_id = '${CITA}'`
    )
    expect(r.rows[0].tenant_id).toBe(TENANT)
  })

  it('falla fuerte si la cita no existe', async () => {
    // Devolver un código para una cita inexistente crearía un link que lleva
    // a una pantalla de error. Mejor que reviente donde se emite.
    await expect(
      db.query(`SELECT emitir_enlace_turno('99999999-9999-9999-9999-999999999999')`)
    ).rejects.toThrow()
  })

  it('una sola fila por cita', async () => {
    for (let i = 0; i < 5; i++) await emitir(CITA)
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM enlaces_turno WHERE cita_id = '${CITA}'`
    )
    expect(r.rows[0].n).toBe(1)
  })

  it('el enlace se borra con la cita', async () => {
    // ON DELETE CASCADE: un turno borrado no puede dejar un link vivo que
    // siga resolviendo a datos de un paciente.
    await emitir(OTRA_CITA)
    await db.exec(`DELETE FROM citas WHERE id = '${OTRA_CITA}'`)
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM enlaces_turno WHERE cita_id = '${OTRA_CITA}'`
    )
    expect(r.rows[0].n).toBe(0)
  })
})

describe('la tabla no se puede leer desde el cliente', () => {
  it('tiene RLS activo y ninguna política', async () => {
    // Sin políticas, el anon key no lista nada. Si alguien pudiera listar los
    // códigos, el largo del código dejaría de importar.
    const rls = await db.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'enlaces_turno'`
    )
    expect(rls.rows[0].relrowsecurity).toBe(true)

    const pol = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'enlaces_turno'`
    )
    expect(pol.rows[0].n).toBe(0)
  })
})
