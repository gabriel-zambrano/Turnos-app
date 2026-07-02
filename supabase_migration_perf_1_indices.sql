-- ── CAMBIO 1 de 6: Índices en tablas críticas (citas, pacientes, bloqueos, tratamientos, tenant_users) ──
-- Objetivo: evitar que cada consulta a la agenda/pacientes escanee la tabla completa.
-- Riesgo: NULO. Un índice no cambia ningún resultado, solo acelera la lectura.
--         Es reversible en cualquier momento con DROP INDEX (ver al final del archivo).
-- Cómo aplicar: Supabase Dashboard → SQL Editor → pegar todo → Run.

CREATE INDEX IF NOT EXISTS idx_citas_tenant_fecha ON citas (tenant_id, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_citas_paciente ON citas (paciente_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_tenant ON pacientes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bloqueos_tenant_fecha ON bloqueos (tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_tratamientos_tenant ON tratamientos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users (user_id);

-- ── Verificación (opcional pero recomendada) ──
-- Corré esto ANTES de crear los índices de arriba, guardá el resultado,
-- y volvé a correrlo DESPUÉS para comparar. Buscá que diga "Index Scan"
-- en vez de "Seq Scan" sobre citas/pacientes, y que el "execution time" baje.
--
-- EXPLAIN ANALYZE
-- SELECT * FROM citas WHERE tenant_id = '<pegá acá un tenant_id real>'
--   AND fecha_hora >= now() - interval '7 days' AND fecha_hora <= now() + interval '7 days';

-- ── Rollback (solo si algo saliera mal, no debería hacer falta) ──
-- DROP INDEX IF EXISTS idx_citas_tenant_fecha;
-- DROP INDEX IF EXISTS idx_citas_paciente;
-- DROP INDEX IF EXISTS idx_pacientes_tenant;
-- DROP INDEX IF EXISTS idx_bloqueos_tenant_fecha;
-- DROP INDEX IF EXISTS idx_tratamientos_tenant;
-- DROP INDEX IF EXISTS idx_tenant_users_user;
