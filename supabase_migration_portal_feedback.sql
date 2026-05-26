-- ── TABLAS PARA EL PORTAL DEL PACIENTE EXPANDIDO ──
-- Ejecuta este script en el SQL Editor de tu Dashboard de Supabase.

-- 1. Tabla de fotos de progreso del paciente
CREATE TABLE IF NOT EXISTS fotos_progreso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  descripcion TEXT,
  etapa TEXT,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  tenant_id UUID NOT NULL
);

-- 2. Tabla de feedback post-visita del paciente
CREATE TABLE IF NOT EXISTS feedback_post_visita (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  cita_id UUID REFERENCES citas(id) ON DELETE CASCADE,
  dolor INTEGER CHECK (dolor >= 1 AND dolor <= 5) NOT NULL,
  satisfaccion INTEGER CHECK (satisfaccion >= 1 AND satisfaccion <= 5) NOT NULL,
  comentario TEXT,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  tenant_id UUID NOT NULL
);
