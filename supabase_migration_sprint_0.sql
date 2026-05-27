-- ── MIGRACIÓN SPRINT 0: SEGURIDAD Y MULTI-TENANT ──
-- Habilitar Row Level Security (RLS) en las tablas principales para aislar los datos entre profesionales.

-- 1. Habilitar RLS en tabla citas
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;

-- 2. Habilitar RLS en tabla pacientes
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas para la tabla citas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_citas') THEN
    CREATE POLICY tenant_isolation_citas ON citas FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;

-- 4. Crear políticas para la tabla pacientes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_pacientes') THEN
    CREATE POLICY tenant_isolation_pacientes ON pacientes FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;

-- 5. Agregar campos de personalización a tenants
ALTER TABLE tenants 
  ADD COLUMN IF NOT EXISTS direccion TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS telefono TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS logoUrl TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS primaryColor TEXT DEFAULT '#0a1e3d',
  ADD COLUMN IF NOT EXISTS secondaryColor TEXT DEFAULT '#185FA5',
  ADD COLUMN IF NOT EXISTS accentColor TEXT DEFAULT '#138A6B',
  ADD COLUMN IF NOT EXISTS whatsappTemplate TEXT DEFAULT 'Hola {nombre_paciente},\n\nTe recordamos tu turno en *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n\nConfirma o cancela tu turno acá:\n{link}';
