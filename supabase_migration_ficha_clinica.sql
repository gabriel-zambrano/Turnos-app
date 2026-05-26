-- ── AGREGAR COLUMNAS CLÍNICAS A LA TABLA PACIENTES ──
-- Ejecuta este script en el SQL Editor de tu Dashboard de Supabase.

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS alergias TEXT;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antecedentes TEXT;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS progreso_plan_porcentaje INTEGER DEFAULT 0;
