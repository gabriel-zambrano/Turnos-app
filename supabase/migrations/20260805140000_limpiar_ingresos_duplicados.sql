-- ── LIMPIEZA DE INGRESOS MANUALES DUPLICADOS ──
--
-- El Cobro Express hacía dos cosas con un mismo cobro: escribía
-- `citas.precio_cobrado` Y creaba una fila en `ingresos_manuales`.
--
-- Finanzas suma las dos cosas para el total del mes:
--     totalMes = suma(citas.precio_cobrado) + suma(ingresos_manuales.monto)
--
-- Resultado: cada cobro hecho con ese botón se contaba dos veces. El
-- "Facturado en el mes" venía inflado desde mayo.
--
-- El código ya no genera estas filas (la agenda dejó de insertarlas y el
-- dashboard solo lo hace cuando el cobro no está ligado a una cita). Esto
-- limpia lo que quedó.
--
-- NO se pierde información: el cobro sigue registrado en `citas.precio_cobrado`,
-- que es la fuente correcta. La fila de ingreso manual era la copia espuria.
--
-- Idempotente: si se corre de nuevo no encuentra nada que borrar.

-- ─────────────────────────────────────────────────────────────
-- 1. Respaldo, antes de tocar nada
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingresos_manuales_duplicados_respaldo (
    id               UUID,
    tenant_id        UUID,
    fecha            DATE,
    concepto         TEXT,
    monto            NUMERIC(10,2),
    forma_pago       TEXT,
    requiere_factura BOOLEAN,
    cita_pareja      UUID,
    respaldado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ingresos_manuales_duplicados_respaldo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_ingresos_manuales_duplicados_respaldo ON ingresos_manuales_duplicados_respaldo;
CREATE POLICY tenant_isolation_ingresos_manuales_duplicados_respaldo
  ON ingresos_manuales_duplicados_respaldo FOR ALL
  USING      (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));

-- ─────────────────────────────────────────────────────────────
-- 2. Identificar los duplicados
-- ─────────────────────────────────────────────────────────────
-- Un ingreso es duplicado solo si se cumplen las TRES condiciones:
--   a) El concepto tiene el formato exacto que generaba el Cobro Express.
--   b) Existe una cita del mismo día, mismo paciente, mismo tratamiento y
--      con `precio_cobrado` idéntico al monto.
--   c) No fue facturado — si tiene comprobante emitido, no se toca.
--
-- Los que no cumplan las tres quedan como están. En la base de origen eran
-- 3 filas sin pareja: ingresos genuinamente sueltos o filas de prueba.
CREATE TEMP TABLE _duplicados AS
SELECT im.id, im.tenant_id, im.fecha, im.concepto, im.monto,
       im.forma_pago, im.requiere_factura, c.cita_id
FROM ingresos_manuales im
JOIN LATERAL (
    SELECT ci.id AS cita_id
    FROM citas ci
    JOIN pacientes p ON p.id = ci.paciente_id
    WHERE ci.tenant_id = im.tenant_id
      AND im.concepto = 'Pago ' || ci.tipo_tratamiento || ' — ' || p.nombre
      AND ci.precio_cobrado = im.monto
      AND (ci.fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = im.fecha
    LIMIT 1
) c ON true
WHERE im.concepto LIKE 'Pago %—%'
  AND NOT EXISTS (
      SELECT 1 FROM facturas f
      WHERE f.ingreso_manual_id = im.id AND f.estado = 'emitida'
  );

-- ─────────────────────────────────────────────────────────────
-- 3. Respaldar y borrar
-- ─────────────────────────────────────────────────────────────
INSERT INTO ingresos_manuales_duplicados_respaldo
    (id, tenant_id, fecha, concepto, monto, forma_pago, requiere_factura, cita_pareja)
SELECT d.id, d.tenant_id, d.fecha, d.concepto, d.monto, d.forma_pago, d.requiere_factura, d.cita_id
FROM _duplicados d
WHERE NOT EXISTS (
    SELECT 1 FROM ingresos_manuales_duplicados_respaldo r WHERE r.id = d.id
);

DELETE FROM ingresos_manuales
WHERE id IN (SELECT id FROM _duplicados);

-- ─────────────────────────────────────────────────────────────
-- 4. Verificación: aborta y revierte si algo no cierra
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_borrados   INTEGER;
    v_respaldados INTEGER;
    v_quedan     INTEGER;
    v_monto      NUMERIC;
BEGIN
    SELECT count(*), COALESCE(sum(monto), 0) INTO v_borrados, v_monto FROM _duplicados;
    SELECT count(*) INTO v_respaldados FROM ingresos_manuales_duplicados_respaldo;

    -- Todo lo borrado tiene que estar respaldado. Si no, se revierte entero.
    IF v_respaldados < v_borrados THEN
        RAISE EXCEPTION 'Migración abortada: se identificaron % duplicados pero solo % quedaron respaldados',
            v_borrados, v_respaldados;
    END IF;

    -- Y no puede quedar ninguno con pareja sin limpiar.
    SELECT count(*) INTO v_quedan
    FROM ingresos_manuales im
    WHERE im.concepto LIKE 'Pago %—%'
      AND EXISTS (
          SELECT 1 FROM citas ci JOIN pacientes p ON p.id = ci.paciente_id
          WHERE ci.tenant_id = im.tenant_id
            AND im.concepto = 'Pago ' || ci.tipo_tratamiento || ' — ' || p.nombre
            AND ci.precio_cobrado = im.monto
            AND (ci.fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = im.fecha
      )
      AND NOT EXISTS (
          SELECT 1 FROM facturas f WHERE f.ingreso_manual_id = im.id AND f.estado = 'emitida'
      );

    IF v_quedan > 0 THEN
        RAISE EXCEPTION 'Migración abortada: quedaron % ingresos duplicados sin limpiar', v_quedan;
    END IF;

    RAISE NOTICE 'Limpieza OK: % ingresos duplicados respaldados y borrados, por % de facturacion inflada.',
        v_borrados, v_monto;
END $$;

DROP TABLE IF EXISTS _duplicados;

-- ── Rollback ──
-- Restaura los ingresos borrados desde el respaldo:
--
-- INSERT INTO ingresos_manuales (id, tenant_id, fecha, concepto, monto, forma_pago, requiere_factura)
-- SELECT id, tenant_id, fecha, concepto, monto, forma_pago, requiere_factura
-- FROM ingresos_manuales_duplicados_respaldo
-- WHERE NOT EXISTS (SELECT 1 FROM ingresos_manuales im WHERE im.id = ingresos_manuales_duplicados_respaldo.id);
