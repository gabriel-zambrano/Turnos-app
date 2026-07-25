-- ── FIX: permitir guardar el branding del consultorio (logo, colores, nombre) ──
-- Síntoma: al guardar en Configuración no persistían logo/colores.
-- Causa: la migración de seguridad hizo REVOKE UPDATE ON tenants, y la política
-- RLS que re-habilita el UPDATE para dueño/admin (tenants_update_own) no había
-- quedado aplicada. Sin ella, el UPDATE se bloquea sin error (0 filas).
-- Este script es idempotente: se puede correr sin riesgo aunque ya estuviera bien.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Política de UPDATE para el dueño/admin de la clínica (USING + WITH CHECK)
DROP POLICY IF EXISTS tenants_update_own ON tenants;
CREATE POLICY tenants_update_own ON tenants
  FOR UPDATE
  USING (id IN (
    SELECT tenant_id FROM tenant_users
    WHERE user_id = (select auth.uid()) AND role IN ('owner', 'admin')
  ))
  WITH CHECK (id IN (
    SELECT tenant_id FROM tenant_users
    WHERE user_id = (select auth.uid()) AND role IN ('owner', 'admin')
  ));

-- Permiso de columnas de branding (solo estas; el resto sigue bloqueado por
-- seguridad para evitar auto-ascenso de plan/feature).
REVOKE UPDATE ON tenants FROM authenticated;
GRANT UPDATE (nombre, direccion, telefono, primarycolor, secondarycolor,
              accentcolor, whatsapptemplate, logourl)
  ON tenants TO authenticated;

-- ── Verificación del rol del usuario ──
-- Si tras correr esto seguís sin poder guardar, revisá que tu usuario sea
-- 'owner' o 'admin' en la clínica (reemplazá el email):
--   SELECT u.email, tu.role, tu.tenant_id
--   FROM tenant_users tu JOIN auth.users u ON u.id = tu.user_id
--   WHERE u.email = 'odbenegaswalter@gmail.com';
