-- ── SPRINT 3: FINANZAS (CAJA DIARIA Y DEUDORES) ──

-- 1. Crear tabla de egresos manuales (gastos del día)
CREATE TABLE IF NOT EXISTS egresos_manuales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  concepto TEXT NOT NULL,
  monto NUMERIC NOT NULL CHECK (monto > 0),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar seguridad (RLS)
ALTER TABLE egresos_manuales ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de acceso (Aislamiento por Tenant)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_egresos_manuales') THEN
    CREATE POLICY tenant_isolation_egresos_manuales ON egresos_manuales FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;
