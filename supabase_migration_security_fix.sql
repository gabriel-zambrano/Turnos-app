-- ════════════════════════════════════════════════════════════════════════
-- DentalDesk · Migración de seguridad (RLS faltante + expiración de token)
-- Ejecutar en el SQL Editor del Dashboard de Supabase.
-- Idempotente: se puede correr más de una vez sin romper nada.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. RLS en tablas que se crearon sin protección de tenant ──

-- feedback_post_visita
ALTER TABLE feedback_post_visita ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_feedback_post_visita') THEN
    CREATE POLICY tenant_isolation_feedback_post_visita ON feedback_post_visita FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END $$;

-- fotos_progreso
ALTER TABLE fotos_progreso ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_fotos_progreso') THEN
    CREATE POLICY tenant_isolation_fotos_progreso ON fotos_progreso FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ── 2. Verificación: tablas con tenant_id que deberían tener RLS ──
-- Corré esta consulta para confirmar que NINGUNA tabla con tenant_id quede sin RLS:
--
--   SELECT c.relname AS tabla, c.relrowsecurity AS rls_activado
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relkind = 'r'
--     AND EXISTS (
--       SELECT 1 FROM information_schema.columns col
--       WHERE col.table_name = c.relname AND col.column_name = 'tenant_id'
--     )
--   ORDER BY rls_activado, tabla;
--
-- Cualquier fila con rls_activado = false debe corregirse con el patrón de arriba.

-- ── 3. Expiración de token del portal de paciente ──
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS token_expira TIMESTAMP WITH TIME ZONE;

-- Opcional: por defecto, los tokens existentes expiran a 90 días desde hoy.
-- Ajustá el plazo según tu política de retención de enlaces.
UPDATE pacientes
SET token_expira = now() + interval '90 days'
WHERE token IS NOT NULL AND token_expira IS NULL;

-- Recomendación: al generar/rotar el token de un paciente, setear también
-- token_expira = now() + interval '90 days' (o el plazo que definas).
