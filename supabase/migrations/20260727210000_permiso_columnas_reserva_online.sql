-- ─────────────────────────────────────────────────────────────
-- Permiso para guardar la configuración de la reserva online
--
-- Síntoma: al guardar la seña en Configuración, Supabase devuelve 403.
--
-- Causa: la migración de branding hizo REVOKE UPDATE ON tenants y volvió a
-- otorgarlo **columna por columna**, para que nadie pueda auto-ascenderse el
-- plan o habilitarse features editando su propia fila. Las columnas nuevas de
-- la reserva online no estaban en esa lista, así que el UPDATE se rechaza.
--
-- Estas tres son seguras de exponer: son datos operativos del consultorio, no
-- tocan plan, features ni estado de suscripción.
-- ─────────────────────────────────────────────────────────────

GRANT UPDATE (sena_reserva, sena_datos_pago, email_avisos)
  ON tenants TO authenticated;

-- Verificación: deberían aparecer las 11 columnas editables por el consultorio
-- (las 8 de branding + estas 3).
SELECT column_name
FROM information_schema.column_privileges
WHERE table_name = 'tenants'
  AND grantee = 'authenticated'
  AND privilege_type = 'UPDATE'
ORDER BY column_name;
