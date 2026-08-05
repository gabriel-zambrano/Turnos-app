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
async function crearBaseMigrada(sembrarAntesDeLimpiar?: (db: PGlite) => Promise<void>): Promise<PGlite> {
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
    CREATE TABLE pacientes         (id uuid PRIMARY KEY, tenant_id uuid, nombre text);
    CREATE TABLE tratamientos      (id uuid PRIMARY KEY, tenant_id uuid, nombre text);
    CREATE TABLE ingresos_manuales (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, fecha date DEFAULT CURRENT_DATE, monto numeric(10,2), concepto text);
    CREATE TABLE arca_config       (tenant_id uuid PRIMARY KEY, cuit text, activo boolean DEFAULT true);
    CREATE TABLE citas (
      id uuid PRIMARY KEY, tenant_id uuid, paciente_id uuid, tipo_tratamiento text,
      fecha_hora timestamptz DEFAULT now(),
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
    INSERT INTO pacientes   VALUES ('${PACIENTE}', '${TENANT}', 'Araceli Castro');
    INSERT INTO arca_config (tenant_id, cuit) VALUES ('${TENANT}', '20111222333');
    INSERT INTO citas (id, tenant_id, paciente_id, tipo_tratamiento, valor, sena, medio_pago)
      VALUES ('${CITA}', '${TENANT}', '${PACIENTE}', 'Limpieza', 20000, 5000, 'EFECTIVO');
  `)

  await db.exec(leerMigracion())
  await db.exec(leerMigracion('20260805120000_sembrar_renglon_en_cita_nueva.sql'))
  await db.exec(leerMigracion('20260805130000_intencion_de_facturar.sql'))
  // Los datos a limpiar tienen que existir ANTES de la migración de limpieza,
  // igual que en producción.
  if (sembrarAntesDeLimpiar) await sembrarAntesDeLimpiar(db)
  await db.exec(leerMigracion('20260805140000_limpiar_ingresos_duplicados.sql'))
  return db
}

/** Una migración real, tal cual se va a aplicar en producción. */
function leerMigracion(archivo = '20260804120000_pagos_y_multitratamiento.sql'): string {
  return readFileSync(path.resolve(process.cwd(), 'supabase/migrations', archivo), 'utf-8')
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

describe('Cita nueva con valor: se le siembra el renglón sola', () => {
  const CITA_NUEVA = '55555555-5555-5555-5555-555555555555'
  const CITA_SIN_VALOR = '66666666-6666-6666-6666-666666666666'

  it('la cita que nace con importe queda con su renglón', async () => {
    // Simula lo que hace la reserva online: inserta con valor, sin detalle.
    await db.exec(`INSERT INTO citas (id, tenant_id, paciente_id, tipo_tratamiento, valor)
      VALUES ('${CITA_NUEVA}', '${TENANT}', '${PACIENTE}', 'Ortodoncia', 45000);`)

    const items = await db.query<{ descripcion: string; subtotal: string }>(
      `SELECT descripcion, subtotal FROM tratamiento_items WHERE cita_id = '${CITA_NUEVA}'`
    )
    expect(items.rows).toHaveLength(1)
    expect(items.rows[0].descripcion).toBe('Ortodoncia')
    expect(Number(items.rows[0].subtotal)).toBe(45000)
  })

  it('agregar un segundo tratamiento SUMA en vez de reemplazar', async () => {
    // Este es el bug que la migración evita: sin el renglón sembrado, el
    // trigger recalculaba el total desde cero y el valor original se perdía.
    await db.exec(`INSERT INTO tratamiento_items (tenant_id, paciente_id, cita_id, descripcion, cantidad, precio_unitario)
      VALUES ('${TENANT}', '${PACIENTE}', '${CITA_NUEVA}', 'Limpieza', 1, 20000);`)

    const r = await db.query<{ valor: string }>(`SELECT valor FROM citas WHERE id = '${CITA_NUEVA}'`)
    expect(Number(r.rows[0].valor)).toBe(65000) // 45.000 + 20.000, no 20.000
  })

  it('la cita sin importe no genera renglón', async () => {
    // Un turno agendado sin cobrar todavía no tiene nada que detallar.
    await db.exec(`INSERT INTO citas (id, tenant_id, paciente_id, tipo_tratamiento)
      VALUES ('${CITA_SIN_VALOR}', '${TENANT}', '${PACIENTE}', 'Consulta');`)

    const items = await db.query(`SELECT 1 FROM tratamiento_items WHERE cita_id = '${CITA_SIN_VALOR}'`)
    expect(items.rows).toHaveLength(0)
  })

  it('usa "Consulta" si el tratamiento viene vacío', async () => {
    const id = '77777777-7777-7777-7777-777777777777'
    await db.exec(`INSERT INTO citas (id, tenant_id, paciente_id, tipo_tratamiento, valor)
      VALUES ('${id}', '${TENANT}', '${PACIENTE}', '   ', 5000);`)

    const items = await db.query<{ descripcion: string }>(
      `SELECT descripcion FROM tratamiento_items WHERE cita_id = '${id}'`
    )
    expect(items.rows[0].descripcion).toBe('Consulta')
  })
})

describe('Migración: intención de facturar', () => {
  it('el backfill marca los pagos según el criterio vigente de la clínica', async () => {
    const propia = await crearBaseMigrada()
    // Se insertan pagos ANTES de que exista la columna, como en producción
    await propia.exec(`ALTER TABLE pagos DROP COLUMN requiere_factura;`)
    await propia.exec(`INSERT INTO pagos (tenant_id, paciente_id, cita_id, forma_pago, monto) VALUES
      ('${TENANT}', '${PACIENTE}', '${CITA}', 'Transferencia', 30000),
      ('${TENANT}', '${PACIENTE}', '${CITA}', 'Efectivo', 20000);`)
    await propia.exec(leerMigracion('20260805130000_intencion_de_facturar.sql'))

    const r = await propia.query<{ forma_pago: string; requiere_factura: boolean }>(
      `SELECT forma_pago, requiere_factura FROM pagos ORDER BY forma_pago`
    )
    // Efectivo no se factura, Transferencia sí — igual que antes de la columna
    expect(r.rows.find(x => x.forma_pago === 'Efectivo')!.requiere_factura).toBe(false)
    expect(r.rows.find(x => x.forma_pago === 'Transferencia')!.requiere_factura).toBe(true)
    await propia.close()
  })

  it('los ingresos manuales existentes siguen siendo facturables', async () => {
    // El default es true a propósito: preserva el comportamiento anterior,
    // donde un ingreso suelto se facturaba siempre.
    const r = await db.query<{ requiere_factura: boolean }>(
      `INSERT INTO ingresos_manuales (id, tenant_id, monto, concepto)
       VALUES (gen_random_uuid(), '${TENANT}', 5000, 'Venta de cepillos')
       RETURNING requiere_factura`
    )
    expect(r.rows[0].requiere_factura).toBe(true)
  })

  it('rechaza una forma de pago inválida en ingresos manuales', async () => {
    await expect(db.exec(`INSERT INTO ingresos_manuales (id, tenant_id, monto, concepto, forma_pago)
      VALUES (gen_random_uuid(), '${TENANT}', 1000, 'x', 'Bitcoin');`)).rejects.toThrow()
  })

  it('acepta que el ingreso no tenga forma de pago cargada', async () => {
    // Los que ya existían no la tienen y no hay que romperlos
    await expect(db.exec(`INSERT INTO ingresos_manuales (id, tenant_id, monto, concepto)
      VALUES (gen_random_uuid(), '${TENANT}', 1000, 'sin medio');`)).resolves.toBeTruthy()
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

describe('Limpieza de ingresos manuales duplicados', () => {
  const CITA_COBRADA = '88888888-8888-8888-8888-888888888888'
  const CITA_FACTURADA = '99999999-9999-9999-9999-999999999999'
  const ING_FACTURADO = 'aaaaaaaa-0000-0000-0000-000000000001'

  /**
   * Reproduce lo que dejaba el Cobro Express: escribía citas.precio_cobrado
   * Y creaba un ingreso manual por el mismo cobro. Finanzas sumaba los dos.
   */
  async function sembrarDuplicados(db: PGlite) {
    await db.exec(`
      -- a) Duplicado real: cita cobrada + ingreso manual con el mismo monto
      INSERT INTO citas (id, tenant_id, paciente_id, tipo_tratamiento, fecha_hora, precio_cobrado)
        VALUES ('${CITA_COBRADA}', '${TENANT}', '${PACIENTE}', 'Ajuste de ortodoncia',
                '2026-07-20T14:00:00-03:00', 75000);
      INSERT INTO ingresos_manuales (tenant_id, fecha, concepto, monto)
        VALUES ('${TENANT}', '2026-07-20', 'Pago Ajuste de ortodoncia — Araceli Castro', 75000);

      -- b) Ingreso genuinamente suelto: no tiene cita pareja, no se toca
      INSERT INTO ingresos_manuales (tenant_id, fecha, concepto, monto)
        VALUES ('${TENANT}', '2026-07-24', 'Amanda- Blanqueamiento', 160000);

      -- c) Con formato de Cobro Express pero sin cita que lo respalde
      INSERT INTO ingresos_manuales (tenant_id, fecha, concepto, monto)
        VALUES ('${TENANT}', '2026-07-15', 'Pago Consulta — Araceli Castro', 40000);

      -- d) Duplicado PERO ya facturado: no se puede borrar, hay un
      --    comprobante fiscal que lo referencia
      INSERT INTO citas (id, tenant_id, paciente_id, tipo_tratamiento, fecha_hora, precio_cobrado)
        VALUES ('${CITA_FACTURADA}', '${TENANT}', '${PACIENTE}', 'Caries',
                '2026-07-21T10:00:00-03:00', 150000);
      INSERT INTO ingresos_manuales (id, tenant_id, fecha, concepto, monto)
        VALUES ('${ING_FACTURADO}', '${TENANT}', '2026-07-21', 'Pago Caries — Araceli Castro', 150000);
      INSERT INTO facturas (tenant_id, ingreso_manual_id, tipo_comprobante, punto_venta,
                            nro_comprobante, cae, cae_expira, monto, paciente_nombre,
                            paciente_doc_tipo, paciente_doc_nro, estado, simulada)
        VALUES ('${TENANT}', '${ING_FACTURADO}', 11, 1, 1, '74000000000000', '2026-08-01',
                150000, 'Araceli Castro', 'DNI', '30111222', 'emitida', false);
    `)
  }

  it('borra el ingreso duplicado y deja el cobro en la cita', async () => {
    const propia = await crearBaseMigrada(sembrarDuplicados)

    const dup = await propia.query(
      `SELECT 1 FROM ingresos_manuales WHERE concepto = 'Pago Ajuste de ortodoncia — Araceli Castro'`)
    expect(dup.rows).toHaveLength(0)

    // La plata no se perdió: sigue registrada donde corresponde
    const cita = await propia.query<{ precio_cobrado: string }>(
      `SELECT precio_cobrado FROM citas WHERE id = '${CITA_COBRADA}'`)
    expect(Number(cita.rows[0].precio_cobrado)).toBe(75000)
    await propia.close()
  })

  it('respalda lo borrado antes de borrarlo', async () => {
    const propia = await crearBaseMigrada(sembrarDuplicados)
    const r = await propia.query<{ concepto: string; monto: string; cita_pareja: string }>(
      `SELECT concepto, monto, cita_pareja FROM ingresos_manuales_duplicados_respaldo`)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].concepto).toBe('Pago Ajuste de ortodoncia — Araceli Castro')
    expect(r.rows[0].cita_pareja).toBe(CITA_COBRADA)
    await propia.close()
  })

  it('no toca los ingresos sueltos sin cita pareja', async () => {
    const propia = await crearBaseMigrada(sembrarDuplicados)
    const r = await propia.query(`SELECT concepto FROM ingresos_manuales ORDER BY fecha`)
    const conceptos = r.rows.map((x: any) => x.concepto)
    expect(conceptos).toContain('Amanda- Blanqueamiento')
    // Tiene formato de Cobro Express pero ninguna cita lo respalda
    expect(conceptos).toContain('Pago Consulta — Araceli Castro')
    await propia.close()
  })

  it('no borra un ingreso que ya fue facturado', async () => {
    // Borrarlo dejaría huérfana la referencia de un comprobante fiscal
    const propia = await crearBaseMigrada(sembrarDuplicados)
    const r = await propia.query(`SELECT 1 FROM ingresos_manuales WHERE id = '${ING_FACTURADO}'`)
    expect(r.rows).toHaveLength(1)
    await propia.close()
  })

  it('es idempotente: correrla de nuevo no rompe ni duplica el respaldo', async () => {
    const propia = await crearBaseMigrada(sembrarDuplicados)
    await propia.exec(leerMigracion('20260805140000_limpiar_ingresos_duplicados.sql'))
    const r = await propia.query(`SELECT 1 FROM ingresos_manuales_duplicados_respaldo`)
    expect(r.rows).toHaveLength(1)
    await propia.close()
  })
})
