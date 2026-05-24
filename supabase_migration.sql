-- ── MIGRACIÓN SEGURA PARA SAAS MULTI-TENANT (TABLAS FINANCIERAS) ──
-- Este script agrega la columna tenant_id de forma segura, mapea los registros antiguos
-- al ID del Dr. Walter Benegas y habilita políticas RLS sin alterar ni borrar datos de pacientes.

-- 1. Agregar columna tenant_id a costos_fijos (con default temporal para registros antiguos)
ALTER TABLE costos_fijos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a';
UPDATE costos_fijos SET tenant_id = '2845c423-affa-4ca2-9c5f-f4ec8e35701a' WHERE tenant_id IS NULL;

-- 2. Agregar columna tenant_id a ingresos_manuales
ALTER TABLE ingresos_manuales ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a';
UPDATE ingresos_manuales SET tenant_id = '2845c423-affa-4ca2-9c5f-f4ec8e35701a' WHERE tenant_id IS NULL;

-- 3. Agregar columna tenant_id a meta_mensual
ALTER TABLE meta_mensual ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a';
UPDATE meta_mensual SET tenant_id = '2845c423-affa-4ca2-9c5f-f4ec8e35701a' WHERE tenant_id IS NULL;

-- 4. Habilitar Row Level Security (RLS) para aislamiento
ALTER TABLE costos_fijos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingresos_manuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_mensual ENABLE ROW LEVEL SECURITY;

-- 5. Crear políticas RLS basadas en membresía de usuario
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_costos_fijos') THEN
    CREATE POLICY tenant_isolation_costos_fijos ON costos_fijos FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_ingresos_manuales') THEN
    CREATE POLICY tenant_isolation_ingresos_manuales ON ingresos_manuales FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_meta_mensual') THEN
    CREATE POLICY tenant_isolation_meta_mensual ON meta_mensual FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;
