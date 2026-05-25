-- ── MIGRACIÓN PARA HISTORIAL CLÍNICO Y ODONTOGRAMA INTERACTIVO ──

-- 1. Crear tabla de historial dental por diente
CREATE TABLE IF NOT EXISTS historial_dental (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    diente INT NOT NULL, -- Número de diente según sistema FDI (11-18, 21-28, 31-38, 41-48)
    estado VARCHAR(50) NOT NULL, -- Sano, Caries, Corona, Endodoncia, Implante, Ausente
    notas TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitar RLS (Row Level Security) para aislamiento de tenants
ALTER TABLE historial_dental ENABLE ROW LEVEL SECURITY;

-- 3. Crear política RLS para asegurar que el doctor solo vea datos de su consultorio (tenant)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'historial_dental' AND policyname = 'tenant_isolation_historial_dental'
  ) THEN
    CREATE POLICY tenant_isolation_historial_dental ON historial_dental
      FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;

-- 4. Asegurar que las características avanzadas de BI y reportes estén habilitadas para el consultorio principal
UPDATE tenants 
SET feature_bi = true, feature_recordatorios = true 
WHERE id = '2845c423-affa-4ca2-9c5f-f4ec8e35701a';
