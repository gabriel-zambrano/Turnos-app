-- ── MULTI-TRATAMIENTO POR TURNO + FORMAS DE PAGO ──
--
-- Objetivo: una cita puede tener N tratamientos (caries + ortodoncia + limpieza)
-- que se suman, y N formas de pago (efectivo + tarjeta). La factura muestra
-- el detalle renglón por renglón y el desglose de pagos.
--
-- REGLA DE ORO DE ESTA MIGRACIÓN:
--   `citas.valor` sigue siendo el total autoritativo, mantenido por trigger.
--   Las vistas de BI (bi_ingresos_por_mes, bi_kpis_mes, bi_citas_por_tratamiento)
--   leen esa columna y NO se tocan. Si esto se rompe, el dashboard devuelve
--   cero en silencio.
--
-- Idempotente: se puede correr más de una vez.

-- ─────────────────────────────────────────────────────────────
-- 1. Renglones de tratamiento (el detalle de la cita)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tratamiento_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    paciente_id     UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    -- Nullable a propósito: deja la puerta abierta a ítems sueltos de cuenta
    -- corriente (presupuestos, cuotas) sin volver a migrar el esquema.
    cita_id         UUID REFERENCES citas(id) ON DELETE CASCADE,
    tratamiento_id  UUID REFERENCES tratamientos(id) ON DELETE SET NULL,
    descripcion     TEXT NOT NULL,
    cantidad        INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
    descuento_pct   NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
    subtotal        NUMERIC(12,2) GENERATED ALWAYS AS (
                        ROUND(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)
                    ) STORED,
    orden           INTEGER NOT NULL DEFAULT 0,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tratamiento_items_cita_idx     ON tratamiento_items (cita_id, orden);
CREATE INDEX IF NOT EXISTS tratamiento_items_paciente_idx ON tratamiento_items (tenant_id, paciente_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Pagos (N formas de pago por cita)
-- ─────────────────────────────────────────────────────────────
-- La lista tiene que quedar igual que FORMAS_PAGO en src/lib/pagos.ts.
-- Si agregás una acá, agregala allá (hay un test que lo verifica).
CREATE TABLE IF NOT EXISTS pagos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    paciente_id  UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    cita_id      UUID REFERENCES citas(id) ON DELETE CASCADE,
    forma_pago   TEXT NOT NULL CHECK (forma_pago IN (
                     'Efectivo', 'Tarjeta de Débito', 'Tarjeta de Crédito',
                     'Transferencia', 'Cheque', 'Mercado Pago', 'Obra Social', 'Otro'
                 )),
    monto        NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
    nota         TEXT,
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pagos_cita_idx     ON pagos (cita_id);
CREATE INDEX IF NOT EXISTS pagos_paciente_idx ON pagos (tenant_id, paciente_id, fecha DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. Triggers: mantienen citas.valor y citas.precio_cobrado sincronizados
-- ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER porque el trigger tiene que poder escribir en `citas`
-- aunque la política RLS del usuario evalúe distinto; el WHERE por tenant_id
-- garantiza que no pueda tocar otra clínica.

CREATE OR REPLACE FUNCTION sync_valor_cita() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cita   UUID := COALESCE(NEW.cita_id, OLD.cita_id);
    v_tenant UUID := COALESCE(NEW.tenant_id, OLD.tenant_id);
BEGIN
    IF v_cita IS NOT NULL THEN
        UPDATE citas SET
            valor = (
                SELECT COALESCE(SUM(subtotal), 0)
                FROM tratamiento_items WHERE cita_id = v_cita
            ),
            actualizado_en = NOW()
        WHERE id = v_cita AND tenant_id = v_tenant;
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_valor_cita ON tratamiento_items;
CREATE TRIGGER trg_sync_valor_cita
    AFTER INSERT OR UPDATE OR DELETE ON tratamiento_items
    FOR EACH ROW EXECUTE FUNCTION sync_valor_cita();

CREATE OR REPLACE FUNCTION sync_cobrado_cita() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cita   UUID := COALESCE(NEW.cita_id, OLD.cita_id);
    v_tenant UUID := COALESCE(NEW.tenant_id, OLD.tenant_id);
BEGIN
    IF v_cita IS NOT NULL THEN
        UPDATE citas SET
            precio_cobrado = (
                SELECT COALESCE(SUM(monto), 0)
                FROM pagos WHERE cita_id = v_cita
            ),
            -- Medio de pago dominante, para que /bi y la agenda sigan
            -- mostrando algo coherente en su columna de siempre.
            medio_pago = (
                SELECT forma_pago FROM pagos WHERE cita_id = v_cita
                GROUP BY forma_pago ORDER BY SUM(monto) DESC, forma_pago LIMIT 1
            ),
            actualizado_en = NOW()
        WHERE id = v_cita AND tenant_id = v_tenant;
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_cobrado_cita ON pagos;
CREATE TRIGGER trg_sync_cobrado_cita
    AFTER INSERT OR UPDATE OR DELETE ON pagos
    FOR EACH ROW EXECUTE FUNCTION sync_cobrado_cita();

-- ─────────────────────────────────────────────────────────────
-- 4. Detalle de la factura (snapshot inmutable)
-- ─────────────────────────────────────────────────────────────
-- Copia, no FK viva: si mañana cambia el precio del tratamiento, la factura
-- ya emitida no puede mutar. Es requisito fiscal.
CREATE TABLE IF NOT EXISTS factura_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    factura_id      UUID NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    orden           INTEGER NOT NULL DEFAULT 0,
    descripcion     TEXT NOT NULL,
    cantidad        NUMERIC(10,2) NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
    subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS factura_items_factura_idx ON factura_items (factura_id, orden);

-- Desglose de formas de pago. INFORMATIVO, no fiscal:
-- ARCA acepta una sola condición de venta por comprobante (columna
-- facturas.condicion_venta). Esto es el detalle real de caja.
CREATE TABLE IF NOT EXISTS factura_pagos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    factura_id  UUID NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    forma_pago  TEXT NOT NULL,
    monto       NUMERIC(12,2) NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS factura_pagos_factura_idx ON factura_pagos (factura_id);

-- ─────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE tratamiento_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_pagos     ENABLE ROW LEVEL SECURITY;

-- tratamiento_items y pagos: patrón canónico (FOR ALL), igual que el resto
-- de las tablas operativas.
DROP POLICY IF EXISTS tenant_isolation_tratamiento_items ON tratamiento_items;
CREATE POLICY tenant_isolation_tratamiento_items ON tratamiento_items FOR ALL
  USING      (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS tenant_isolation_pagos ON pagos;
CREATE POLICY tenant_isolation_pagos ON pagos FOR ALL
  USING      (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));

-- factura_items y factura_pagos: mismo patrón inmutable que `facturas`
-- (solo SELECT; el INSERT lo hace la función SECURITY DEFINER de abajo).
DROP POLICY IF EXISTS factura_items_select ON factura_items;
CREATE POLICY factura_items_select ON factura_items FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS factura_pagos_select ON factura_pagos;
CREATE POLICY factura_pagos_select ON factura_pagos FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));

-- ─────────────────────────────────────────────────────────────
-- 6. Emisión atómica: factura + ítems + pagos en UNA transacción
-- ─────────────────────────────────────────────────────────────
-- Sin esto, si falla el segundo INSERT queda una factura con CAE de ARCA
-- y sin renglones — y `facturas` no tiene política de UPDATE para arreglarla.
CREATE OR REPLACE FUNCTION emitir_factura_con_detalle(
    p_tenant_id          UUID,
    p_cita_id            UUID,
    p_ingreso_manual_id  UUID,
    p_tipo_comprobante   INTEGER,
    p_punto_venta        INTEGER,
    p_nro_comprobante    INTEGER,
    p_cae                TEXT,
    p_cae_expira         DATE,
    p_monto              NUMERIC,
    p_paciente_nombre    TEXT,
    p_paciente_doc_tipo  TEXT,
    p_paciente_doc_nro   TEXT,
    p_concepto           TEXT,
    p_condicion_venta    TEXT,
    p_simulada           BOOLEAN,
    p_items              JSONB,
    p_pagos              JSONB
-- SETOF y no un composite pelado: así PostgREST la expone como una fila y
-- `.rpc(...).single()` desde el cliente devuelve la factura, no un escalar.
) RETURNS SETOF facturas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_factura facturas;
BEGIN
    -- Revalidación de tenant: la función es DEFINER, así que RLS no la frena.
    IF NOT EXISTS (
        SELECT 1 FROM tenant_users
        WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'No autorizado para este consultorio';
    END IF;

    INSERT INTO facturas (
        tenant_id, cita_id, ingreso_manual_id, tipo_comprobante, punto_venta,
        nro_comprobante, cae, cae_expira, monto, paciente_nombre,
        paciente_doc_tipo, paciente_doc_nro, concepto, condicion_venta,
        estado, simulada
    ) VALUES (
        p_tenant_id, p_cita_id, p_ingreso_manual_id, p_tipo_comprobante, p_punto_venta,
        p_nro_comprobante, p_cae, p_cae_expira, p_monto, p_paciente_nombre,
        p_paciente_doc_tipo, p_paciente_doc_nro, p_concepto, p_condicion_venta,
        'emitida', p_simulada
    ) RETURNING * INTO v_factura;

    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        INSERT INTO factura_items (tenant_id, factura_id, orden, descripcion, cantidad, precio_unitario, subtotal)
        SELECT p_tenant_id, v_factura.id,
               COALESCE((it->>'orden')::int, 0),
               it->>'descripcion',
               COALESCE((it->>'cantidad')::numeric, 1),
               COALESCE((it->>'precio_unitario')::numeric, 0),
               COALESCE((it->>'subtotal')::numeric, 0)
        FROM jsonb_array_elements(p_items) AS it;
    END IF;

    IF p_pagos IS NOT NULL AND jsonb_array_length(p_pagos) > 0 THEN
        INSERT INTO factura_pagos (tenant_id, factura_id, forma_pago, monto)
        SELECT p_tenant_id, v_factura.id, pg->>'forma_pago', (pg->>'monto')::numeric
        FROM jsonb_array_elements(p_pagos) AS pg;
    END IF;

    RETURN NEXT v_factura;
END $$;

REVOKE ALL ON FUNCTION emitir_factura_con_detalle FROM PUBLIC;
GRANT EXECUTE ON FUNCTION emitir_factura_con_detalle TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 7. Backfill: normalizar citas.medio_pago viejo a la lista fija
-- ─────────────────────────────────────────────────────────────
-- Sin esto /bi agrupa "efectivo", "Efectivo" y "EFECTIVO" como tres categorías.
UPDATE citas SET medio_pago = CASE
    WHEN lower(trim(medio_pago)) IN ('efectivo', 'cash', 'contado')       THEN 'Efectivo'
    WHEN lower(trim(medio_pago)) LIKE '%debito%'
      OR lower(trim(medio_pago)) LIKE '%débito%'                          THEN 'Tarjeta de Débito'
    WHEN lower(trim(medio_pago)) LIKE '%credito%'
      OR lower(trim(medio_pago)) LIKE '%crédito%'                         THEN 'Tarjeta de Crédito'
    WHEN lower(trim(medio_pago)) LIKE '%transfer%'                        THEN 'Transferencia'
    WHEN lower(trim(medio_pago)) LIKE '%cheque%'                          THEN 'Cheque'
    WHEN lower(trim(medio_pago)) LIKE '%mercado%'                         THEN 'Mercado Pago'
    WHEN lower(trim(medio_pago)) LIKE '%obra%'
      OR lower(trim(medio_pago)) LIKE '%social%'
      OR lower(trim(medio_pago)) LIKE '%prepaga%'                         THEN 'Obra Social'
    ELSE medio_pago
END
WHERE medio_pago IS NOT NULL AND trim(medio_pago) <> '';

-- ─────────────────────────────────────────────────────────────
-- 8. Migrar las citas existentes a un renglón de detalle
-- ─────────────────────────────────────────────────────────────
-- Cada cita con valor cargado pasa a tener 1 ítem equivalente, para que la
-- UI nueva no muestre turnos históricos "vacíos". El trigger recalcula el
-- mismo `valor` que ya tenían, así que no cambia ningún número.
INSERT INTO tratamiento_items (tenant_id, paciente_id, cita_id, descripcion, cantidad, precio_unitario, orden)
SELECT c.tenant_id, c.paciente_id, c.id, COALESCE(c.tipo_tratamiento, 'Consulta'), 1, COALESCE(c.valor, 0), 0
FROM citas c
WHERE c.valor IS NOT NULL AND c.valor > 0
  AND NOT EXISTS (SELECT 1 FROM tratamiento_items ti WHERE ti.cita_id = c.id);

-- ── Rollback ──
-- DROP FUNCTION IF EXISTS emitir_factura_con_detalle;
-- DROP TABLE IF EXISTS factura_pagos, factura_items, pagos, tratamiento_items;
-- DROP FUNCTION IF EXISTS sync_valor_cita, sync_cobrado_cita;
