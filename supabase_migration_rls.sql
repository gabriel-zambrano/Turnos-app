-- ── MIGRACIÓN DE SEGURIDAD RLS NÚCLEO (CITAS, PACIENTES, BLOQUEOS Y TRATAMIENTOS) ──

-- 1. Habilitar RLS en tablas núcleo
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tratamientos ENABLE ROW LEVEL SECURITY;

-- 2. Limpiar políticas antiguas si existen
DROP POLICY IF EXISTS tenant_isolation_citas ON citas;
DROP POLICY IF EXISTS tenant_isolation_pacientes ON pacientes;
DROP POLICY IF EXISTS tenant_isolation_bloqueos ON bloqueos;
DROP POLICY IF EXISTS tenant_isolation_tratamientos ON tratamientos;

-- 3. Crear políticas de aislamiento por inquilino basado en tenant_users
CREATE POLICY tenant_isolation_citas ON citas FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY tenant_isolation_pacientes ON pacientes FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY tenant_isolation_bloqueos ON bloqueos FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY tenant_isolation_tratamientos ON tratamientos FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
