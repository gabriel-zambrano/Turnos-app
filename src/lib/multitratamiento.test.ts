import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────
// Test de la migración de multi-tratamiento y formas de pago.
//
// Corre la migración REAL contra un Postgres de verdad (PGlite, en proceso)
// y verifica la invariante que sostiene todo el resto del sistema:
//
//   `citas.valor` sigue siendo el total autoritativo, mantenido por trigger.
//
// Importa porque las vistas de BI (bi_ingresos_por_mes, bi_kpis_mes,
// bi_citas_por_tratamiento) leen esa columna. Si el trigger deja de
// sincronizarla, el dashboard devuelve cero SIN dar ningún error — el peor
// tipo de bug para un SaaS de facturación.
// ─────────────────────────────────────────────────────────────

const TENANT = '11111111-1111-1111-1111-111111111111'
const PACIENTE = '22222222-2222-2222-2222-222222222222'
const CITA = '33333333-3333-3333-3333-333333333333'

let db: PGlite

/** Devuelve el estado de cobro que la cita expone al resto de la app. */
async function estadoCita() {
  const r = await db.query<{ valor: string; saldo: string; precio_cobrado: string | null; medio_pago: string | null }>(
    `SELECT valor, saldo, precio_cobrado, medio_pago FROM citas WHERE id = '${CITA}'`
  )
  const f = r.rows[0]
  return {
    valor: Number(f.valor),
    saldo: Number(f.saldo),
    precio_cobrado: f.precio_cobrado === null ? null : Number(f.precio_cobrado),
    medio_pago: f.medio_pago,
  }
}

async function agregarItem(descripcion: string, cantidad: number, precio: number) {
  await db.exec(`INSERT INTO tratamiento_items (tenant_id, paciente_id, cita_id, descripcion, cantidad, precio_unitario)
    VALUES ('${TENANT}', '${PACIENTE}', '${CITA}', '${descripcion}', ${cantidad}, ${precio});`)
}

async function agregarPago(forma: string, monto: number) {
  await db.exec(`INSERT INTO pagos (tenant_id, paciente_id, cita_id, forma_pago, monto)
    VALUES ('${TENANT}', '${PACIENTE}', '${CITA}', '${forma}', ${monto});`)
}

/**
 * Levanta un Postgres con el esquema previo, datos preexistentes y la
 * migración real ya aplicada.
 *
 * Cada bloque de tests que muta datos usa su propia instancia: compartir una
 * sola hacía que el orden de ejecución cambiara los resultados.
 */
async function crearBaseMigrada(): Promise<PGlite> {
  const db = new PGlite()

  // Esquema mínimo con las columnas que la migración necesita tocar.
  // `saldo` se declara GENERATED igual que en producción: si el trigger
  // rompiera esa columna, el test lo detecta.
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid
    $$;
    CREATE ROLE authenticated NOSUPERUSER;

    CREATE TABLE tenants           (id uuid PRIMARY KEY);
    CREATE TABLE tenant_users      (tenant_id uuid, user_id uuid);
    CREATE TABLE pacientes         (id uuid PRIMARY KEY, tenant_id uuid);
    CREATE TABLE tratamientos      (id uuid PRIMARY KEY, tenant_id uuid, nombre text);
    CREATE TABLE ingresos_manuales (id uuid PRIMARY KEY, tenant_id uuid);
    CREATE TABLE arca_config       (tenant_id uuid PRIMARY KEY, cuit text, activo boolean DEFAULT true);
    CREATE TABLE citas (
      id uuid PRIMARY KEY, tenant_id uuid, paciente_id uuid, tipo_tratamiento text,
      valor numeric(10,2) DEFAULT 0, sena numeric(10,2) DEFAULT 0,
      saldo numeric(10,2) GENERATED ALWAYS AS (valor - sena) STORED,
      precio_cobrado numeric(12,2), medio_pago text,
      actualizado_en timestamptz DEFAULT now()
    );
    CREATE TABLE facturas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, cita_id uuid,
      ingreso_manual_id uuid, tipo_comprobante int, punto_venta int, nro_comprobante int,
      cae text, cae_expira date, monto numeric(12,2), paciente_nombre text,
      paciente_doc_tipo text, paciente_doc_nro text, concepto text,
      condicion_venta text, estado text, simulada boolean
    );
  `)

  // Datos previos a la migración: una cita "vieja" con valor plano y un
  // medio de pago escrito a mano, para probar el backfill.
  await db.exec(`
    INSERT INTO tenants     VALUES ('${TENANT}');
    INSERT INTO pacientes   VALUES ('${PACIENTE}', '${TENANT}');
    INSERT INTO arca_config (tenant_id, cuit) VALUES ('${TENANT}', '20111222333');
    INSERT INTO citas (id, tenant_id, paciente_id, tipo_tratamiento, valor, sena, medio_pago)
      VALUES ('${CITA}', '${TENANT}', '${PACIENTE}', 'Limpieza', 20000, 5000, 'EFECTIVO');
  `)

  await db.exec(leerMigracion())
  return db
}

/** La migración real, tal cual se va a aplicar en producción. */
function leerMigracion(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20260804120000_pagos_y_multitratamiento.sql'),
    'utf-8'
  )
}

beforeAll(async () => { db = await crearBaseMigrada() })

afterAll(async () => { await db?.close() })

describe('Migración: la guarda del paso 9 detecta descuadres', () => {
  /** Extrae el bloque DO de auto-verificación de la migración real. */
  function guardaDeVerificacion(): string {
    const bloques = leerMigracion().match(/DO \$\$[\s\S]*?END \$\$;/g) || []
    const guarda = bloques[bloques.length - 1]
    expect(guarda, 'no se encontró el bloque DO de verificación').toBeTruthy()
    return guarda
  }

  it('pasa cuando los renglones cuadran contra citas.valor', async () => {
    const propia = await crearBaseMigrada()
    await expect(propia.exec(guardaDeVerificacion())).resolves.toBeTruthy()
    await propia.close()
  })

  it('aborta si citas.valor no coincide con la suma de sus renglones', async () => {
    const propia = await crearBaseMigrada()
    // Se desactiva el trigger para provocar exactamente el escenario temido:
    // el detalle cambia y citas.valor queda viejo. Las vistas de BI seguirían
    // mostrando el número anterior sin dar ningún error.
    await propia.exec(`ALTER TABLE tratamiento_items DISABLE TRIGGER trg_sync_valor_cita;`)
    await propia.exec(`UPDATE tratamiento_items SET precio_unitario = precio_unitario + 1;`)

    await expect(propia.exec(guardaDeVerificacion())).rejects.toThrow(/Migración abortada/)
    await propia.close()
  })

  it('aborta si una cita con importe quedó sin renglón de detalle', async () => {
    const propia = await crearBaseMigrada()
    await propia.exec(`ALTER TABLE tratamiento_items DISABLE TRIGGER trg_sync_valor_cita;`)
    await propia.exec(`DELETE FROM tratamiento_items;`)

    await expect(propia.exec(guardaDeVerificacion())).rejects.toThrow(/sin rengl[oó]n/i)
    await propia.close()
  })
})

describe('Migración: criterio de medios facturables', () => {
  it('deja el default de la clínica en transferencia y tarjeta de crédito', async () => {
    const r = await db.query<{ formas_pago_facturables: string[] }>(
      `SELECT formas_pago_facturables FROM arca_config WHERE tenant_id = '${TENANT}'`
    )
    expect(r.rows[0].formas_pago_facturables).toEqual(['Transferencia', 'Tarjeta de Crédito'])
  })

  it('cada clínica puede cambiar su criterio', async () => {
    await db.exec(`UPDATE arca_config SET formas_pago_facturables = ARRAY['Efectivo']::TEXT[] WHERE tenant_id = '${TENANT}';`)
    const r = await db.query<{ formas_pago_facturables: string[] }>(
      `SELECT formas_pago_facturables FROM arca_config WHERE tenant_id = '${TENANT}'`
    )
    expect(r.rows[0].formas_pago_facturables).toEqual(['Efectivo'])
    await db.exec(`UPDATE arca_config SET formas_pago_facturables = DEFAULT WHERE tenant_id = '${TENANT}';`)
  })
})

describe('Migración: backfill de datos existentes', () => {
  it('normaliza el medio de pago escrito a mano', async () => {
    // Sin esto, /bi agrupa "EFECTIVO" y "Efectivo" como dos categorías distintas
    const { medio_pago } = await estadoCita()
    expect(medio_pago).toBe('Efectivo')
  })

  it('convierte la cita vieja en un renglón sin cambiar su importe', async () => {
    const items = await db.query<{ descripcion: string; subtotal: string }>(
      `SELECT descripcion, subtotal FROM tratamiento_items WHERE cita_id = '${CITA}'`
    )
    expect(items.rows).toHaveLength(1)
    expect(items.rows[0].descripcion).toBe('Limpieza')
    expect(Number(items.rows[0].subtotal)).toBe(20000)
    // El número que ya veía la clínica no se movió
    expect((await estadoCita()).valor).toBe(20000)
  })
})

describe('Trigger: citas.valor sigue siendo el total autoritativo', () => {
  it('suma varios tratamientos del mismo turno', async () => {
    await agregarItem('Caries pieza 26', 3, 12500) // 37.500
    await agregarItem('Ajuste de ortodoncia', 1, 45000)
    // 20.000 + 37.500 + 45.000
    expect((await estadoCita()).valor).toBe(102500)
  })

  it('aplica descuentos por renglón', async () => {
    await db.exec(`UPDATE tratamiento_items SET descuento_pct = 10 WHERE descripcion = 'Ajuste de ortodoncia';`)
    // 45.000 − 10% = 40.500 → total 98.000
    expect((await estadoCita()).valor).toBe(98000)
  })

  it('mantiene coherente la columna GENERATED `saldo` (valor − seña)', async () => {
    const { valor, saldo } = await estadoCita()
    expect(saldo).toBe(valor - 5000)
  })

  it('recalcula al quitar un renglón', async () => {
    await db.exec(`DELETE FROM tratamiento_items WHERE descripcion = 'Ajuste de ortodoncia';`)
    expect((await estadoCita()).valor).toBe(57500) // 20.000 + 37.500
  })
})

describe('Trigger: pago dividido', () => {
  it('acumula varias formas de pago en precio_cobrado', async () => {
    await agregarPago('Efectivo', 20000)
    await agregarPago('Tarjeta de Crédito', 30000)
    expect((await estadoCita()).precio_cobrado).toBe(50000)
  })

  it('deja en medio_pago el medio con el que más se pagó', async () => {
    // La agenda y /bi siguen leyendo esta columna: tiene que mostrar algo útil
    expect((await estadoCita()).medio_pago).toBe('Tarjeta de Crédito')
  })

  it('recalcula al quitar un pago', async () => {
    await db.exec(`DELETE FROM pagos WHERE forma_pago = 'Tarjeta de Crédito' AND cita_id = '${CITA}';`)
    const e = await estadoCita()
    expect(e.precio_cobrado).toBe(20000)
    expect(e.medio_pago).toBe('Efectivo')
  })

  it('rechaza formas de pago fuera de la lista', async () => {
    // El CHECK de la tabla tiene que coincidir con FORMAS_PAGO de src/lib/pagos.ts
    await expect(agregarPago('Bitcoin', 1)).rejects.toThrow()
  })

  it('rechaza montos negativos o cero', async () => {
    await expect(agregarPago('Efectivo', 0)).rejects.toThrow()
    await expect(agregarPago('Efectivo', -500)).rejects.toThrow()
  })
})

describe('Emisión atómica de la factura', () => {
  it('inserta factura, ítems y pagos en una sola llamada', async () => {
    await db.exec(`INSERT INTO tenant_users VALUES ('${TENANT}', '44444444-4444-4444-4444-444444444444');`)
    await db.exec(`SET request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';`)

    await db.query(`SELECT * FROM emitir_factura_con_detalle(
      '${TENANT}'::uuid, '${CITA}'::uuid, NULL, 11, 1, 1, '74123456789012', '2026-09-01'::date,
      57500, 'Paciente Test', 'DNI', '30111222', 'Limpieza + Caries pieza 26', 'Contado', true,
      '[{"orden":0,"descripcion":"Limpieza","cantidad":1,"precio_unitario":20000,"subtotal":20000},
        {"orden":1,"descripcion":"Caries pieza 26","cantidad":3,"precio_unitario":12500,"subtotal":37500}]'::jsonb,
      '[{"forma_pago":"Efectivo","monto":20000}]'::jsonb
    )`)

    const items = await db.query<{ descripcion: string; subtotal: string }>(
      `SELECT descripcion, subtotal FROM factura_items ORDER BY orden`
    )
    expect(items.rows.map(i => i.descripcion)).toEqual(['Limpieza', 'Caries pieza 26'])

    // El total de la factura tiene que cuadrar exacto con la suma de renglones
    const suma = items.rows.reduce((s, i) => s + Number(i.subtotal), 0)
    const fact = await db.query<{ monto: string }>(`SELECT monto FROM facturas`)
    expect(Number(fact.rows[0].monto)).toBe(suma)

    const pagos = await db.query(`SELECT * FROM factura_pagos`)
    expect(pagos.rows).toHaveLength(1)
  })

  it('rechaza a un usuario que no pertenece a la clínica', async () => {
    await db.exec(`SET request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999"}';`)
    await expect(
      db.query(`SELECT * FROM emitir_factura_con_detalle(
        '${TENANT}'::uuid, NULL, NULL, 11, 1, 2, 'X', '2026-09-01'::date, 100, 'Intruso',
        'DNI', '1', 'x', 'Contado', true, '[]'::jsonb, '[]'::jsonb)`)
    ).rejects.toThrow(/No autorizado/)
  })
})
