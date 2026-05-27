-- ── FIX: COLUMNAS FALTANTES EN PACIENTES ──

-- Agregamos las columnas médicas a la tabla de pacientes
ALTER TABLE pacientes 
  ADD COLUMN IF NOT EXISTS alergias TEXT,
  ADD COLUMN IF NOT EXISTS antecedentes TEXT,
  ADD COLUMN IF NOT EXISTS progreso_plan_porcentaje INTEGER DEFAULT 0;

-- Nota: Si el error persiste inmediatamente después de correr esto, 
-- puede deberse a la caché de Supabase. 
-- Ve a tu panel de Supabase -> API Settings -> y haz clic en "Reload schema cache" 
-- (o simplemente refresca el proyecto).
