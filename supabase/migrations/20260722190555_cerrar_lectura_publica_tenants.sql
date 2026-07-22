-- El portal público usa la vista tenants_public y el panel de admin usa
-- /api/admin/tenants con service-role, así que la tabla ya no necesita
-- lectura pública. Cierra la fuga de datos comerciales entre clínicas.
ALTER POLICY tenants_select_own ON tenants
  USING (id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));

REVOKE SELECT ON tenants FROM anon;