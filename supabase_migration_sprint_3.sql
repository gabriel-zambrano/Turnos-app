-- ── MIGRACIÓN SPRINT 3: FICHA CLÍNICA Y EVOLUCIÓN ──

-- 1. Tabla: Historial Dental (Odontograma)
CREATE TABLE IF NOT EXISTS historial_dental (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    diente INTEGER NOT NULL,
    estado TEXT NOT NULL,
    notas TEXT,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Habilitar RLS en historial_dental
ALTER TABLE historial_dental ENABLE ROW LEVEL SECURITY;

-- Política de aislamiento de tenant para historial_dental
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_historial_dental') THEN
    CREATE POLICY tenant_isolation_historial_dental ON historial_dental FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;

-- 2. Tabla: Fotos Clínicas
CREATE TABLE IF NOT EXISTS paciente_fotos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    tipo TEXT NOT NULL, -- ej: 'Antes', 'Durante', 'Después'
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Habilitar RLS en paciente_fotos
ALTER TABLE paciente_fotos ENABLE ROW LEVEL SECURITY;

-- Política de aislamiento de tenant para paciente_fotos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_paciente_fotos') THEN
    CREATE POLICY tenant_isolation_paciente_fotos ON paciente_fotos FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;

-- 3. Storage Bucket para las Fotos Clínicas
INSERT INTO storage.buckets (id, name, public) 
VALUES ('fotos_clinicas', 'fotos_clinicas', true)
ON CONFLICT (id) DO NOTHING;

-- Política de Storage: Acceso público de lectura a las fotos
CREATE POLICY "Public Access fotos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'fotos_clinicas');

-- Política de Storage: Insertar/Modificar para usuarios autenticados
CREATE POLICY "Auth Insert fotos" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'fotos_clinicas');

CREATE POLICY "Auth Update fotos" 
ON storage.objects FOR UPDATE 
TO authenticated
USING (bucket_id = 'fotos_clinicas');

CREATE POLICY "Auth Delete fotos" 
ON storage.objects FOR DELETE 
TO authenticated
USING (bucket_id = 'fotos_clinicas');
