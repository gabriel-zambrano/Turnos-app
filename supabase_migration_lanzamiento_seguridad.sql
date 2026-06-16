-- ── MIGRACIÓN DE SEGURIDAD PARA LANZAMIENTO SAAS ──

-- 1. Habilitar Row Level Security (RLS) en las tablas de portal y feedback
ALTER TABLE fotos_progreso ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_post_visita ENABLE ROW LEVEL SECURITY;

-- 2. Limpiar políticas de aislamiento antiguas si existen
DROP POLICY IF EXISTS tenant_isolation_fotos_progreso ON fotos_progreso;
DROP POLICY IF EXISTS tenant_isolation_feedback_post_visita ON feedback_post_visita;

-- 3. Crear políticas RLS de aislamiento para médicos/staff
CREATE POLICY tenant_isolation_fotos_progreso ON fotos_progreso FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY tenant_isolation_feedback_post_visita ON feedback_post_visita FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

-- 4. Habilitar RLS en tablas de logs de envíos y recordatorios
ALTER TABLE logs_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordatorios_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_logs_envios ON logs_envios;
DROP POLICY IF EXISTS tenant_isolation_recordatorios_log ON recordatorios_log;

CREATE POLICY tenant_isolation_logs_envios ON logs_envios FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY tenant_isolation_recordatorios_log ON recordatorios_log FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

-- 5. Crear política para permitir que los propietarios (owners) y administradores actualicen su tenant
DROP POLICY IF EXISTS tenants_update_own ON tenants;
CREATE POLICY tenants_update_own ON tenants
  FOR UPDATE
  USING (id IN (
    SELECT tenant_id FROM tenant_users 
    WHERE user_id = auth.uid() AND (role = 'owner' OR role = 'admin')
  ));
