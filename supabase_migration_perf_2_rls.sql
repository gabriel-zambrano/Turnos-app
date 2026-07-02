-- ── CAMBIO 2 de 6: Optimizar las políticas RLS (citas, pacientes, bloqueos, tratamientos) ──
-- Objetivo: que Postgres evalúe auth.uid() una sola vez por consulta en vez de una vez por fila.
-- Riesgo: bajo. El resultado de la política es idéntico (mismo aislamiento por tenant).
--         Solo cambia CÓMO se ejecuta, no QUÉ filas devuelve.
-- Requisito: correr esto DESPUÉS del cambio 1 (índices), no antes.
-- Cómo aplicar: Supabase Dashboard → SQL Editor → pegar todo → Run.

-- Recreamos cada política con auth.uid() envuelto en (select ...).
-- DROP + CREATE es seguro: no hay una ventana donde falte la política,
-- Postgres ejecuta todo el bloque en una sola transacción implícita.

DROP POLICY IF EXISTS tenant_isolation_citas ON citas;
CREATE POLICY tenant_isolation_citas ON citas FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS tenant_isolation_pacientes ON pacientes;
CREATE POLICY tenant_isolation_pacientes ON pacientes FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS tenant_isolation_bloqueos ON bloqueos;
CREATE POLICY tenant_isolation_bloqueos ON bloqueos FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS tenant_isolation_tratamientos ON tratamientos;
CREATE POLICY tenant_isolation_tratamientos ON tratamientos FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));

-- ── Rollback (solo si hiciera falta volver atrás) ──
-- DROP POLICY IF EXISTS tenant_isolation_citas ON citas;
-- CREATE POLICY tenant_isolation_citas ON citas FOR ALL
--   USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
-- (repetir para pacientes, bloqueos, tratamientos con la versión original)
