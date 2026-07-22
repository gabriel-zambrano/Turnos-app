-- ════════════════════════════════════════════════════════════════════════
-- DentalDesk · Endurecimiento de seguridad previo al lanzamiento multi-tenant
--
-- Este archivo documenta TODOS los cambios de base aplicados durante la
-- auditoría de seguridad. Se aplicaron primero a mano en el SQL Editor; queda
-- acá para que el repo refleje producción y la base sea reproducible.
--
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- IMPORTANTE — orden respecto del deploy: la sección 3 (vista tenants_public y
-- cierre de la política de tenants) requiere que el código que usa la vista y la
-- API de admin YA esté publicado. Si se corre antes, el portal público y el
-- panel de admin se quedan sin datos hasta que termine el deploy.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. Cerrar puertas de escritura anónima ──────────────────────────────
-- El feedback real entra por /api/paciente/[token]/feedback con service-role,
-- así que la política anónima no se usaba y permitía insertar feedback falso
-- en cualquier clínica. `turnos` es una tabla legado sin uso en el código y su
-- política tenía un tenant_id hardcodeado.

DROP POLICY IF EXISTS public_insert_feedback ON feedback_post_visita;
DROP POLICY IF EXISTS turnos_insert_publico ON turnos;


-- ── 2. Optimizar auth.uid() en las políticas secundarias ────────────────
-- Envolver auth.uid() en (select ...) hace que Postgres lo evalúe una sola vez
-- por consulta en lugar de una vez por fila. Usamos ALTER POLICY (no DROP+CREATE)
-- para preservar el rol y la operación de cada política.
-- Las 4 núcleo (citas, pacientes, bloqueos, tratamientos) ya estaban optimizadas
-- en supabase_migration_perf_2_rls.sql.

DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'config_fidelizacion','costos_fijos','egresos_manuales','historial_dental',
    'historial_puntos','ingresos_manuales','logs_envios','meta_mensual',
    'paciente_fotos','perfil_doctor','premios','presupuestos',
    'recordatorios_log','whatsapp_contactos'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = 'tenant_isolation_' || t
    ) THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())))',
        'tenant_isolation_' || t, t
      );
    END IF;
  END LOOP;
END $$;

-- feedback_post_visita usa otro nombre de política (solo SELECT).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='tenant_isolation_feedback_auth') THEN
    ALTER POLICY tenant_isolation_feedback_auth ON feedback_post_visita
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='tenant_users_select_own') THEN
    ALTER POLICY tenant_users_select_own ON tenant_users USING (user_id = (select auth.uid()));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='tenant_users_self_read') THEN
    ALTER POLICY tenant_users_self_read ON tenant_users USING (user_id = (select auth.uid()));
  END IF;
END $$;


-- ── 3. Cerrar la lectura pública de `tenants` ───────────────────────────
-- La política tenía "OR subdominio_generico IS NOT NULL" con rol {public}: es
-- decir, cualquier visitante anónimo podía leer la fila de toda clínica con
-- subdominio, incluyendo plan, subscription_status, mp_preapproval_id,
-- next_payment_date, dirección y teléfono.
--
-- Sostenía dos usos legítimos, ambos migrados en código:
--   · portal público  -> ahora usa la vista tenants_public (solo branding)
--   · panel de admin  -> ahora usa /api/admin/tenants con service-role

CREATE OR REPLACE VIEW tenants_public AS
SELECT id, nombre, direccion, telefono, logourl,
       primarycolor, secondarycolor, accentcolor,
       whatsapptemplate, subdominio_generico, custom_domain
FROM tenants
WHERE activo = true;

GRANT SELECT ON tenants_public TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='tenants_select_own') THEN
    ALTER POLICY tenants_select_own ON tenants
      USING (id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));
  END IF;
END $$;

-- anon ya no necesita leer la tabla: la vista corre con privilegios de su dueño.
REVOKE SELECT ON tenants FROM anon;


-- ── 4. Evitar el bypass de facturación ──────────────────────────────────
-- RLS es a nivel de FILA, no de columna. Con UPDATE sobre toda la tabla, el
-- dueño de una clínica podía ponerse plan='business', feature_bi=true y
-- subscription_status='authorized' sobre su propia fila: auto-ascenso gratis
-- que además anulaba el gate de suscripción de la app.
-- La app solo necesita escribir columnas de branding.

REVOKE UPDATE ON tenants FROM authenticated;
GRANT UPDATE (nombre, direccion, telefono, primarycolor, secondarycolor,
              accentcolor, whatsapptemplate, logourl)
  ON tenants TO authenticated;

-- Crear y borrar clínicas pasa por API con service-role.
REVOKE INSERT, DELETE ON tenants FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON tenants FROM anon;


-- ── 5. Funciones SECURITY DEFINER sin acceso público ────────────────────
-- Postgres otorga EXECUTE a PUBLIC por defecto. Combinado con SECURITY DEFINER
-- (que corre con privilegios del dueño y saltea RLS), cualquier usuario -e
-- incluso un anónimo con la anon key- podía invocarlas. `crear_tenant` permitía
-- crear clínicas ilimitadas salteándose registro, pago y trial.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('crear_tenant','fn_ajustar_puntos_manual','fn_aprobar_asistencia',
                        'fn_canjear_premio','fn_registrar_inasistencia',
                        'get_tenant_admin_email','get_user_email','sync_turno_to_cita')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Estas tres no se invocan con la sesión del usuario:
--   crear_tenant y get_tenant_admin_email -> solo desde APIs con service-role
--   get_user_email y sync_turno_to_cita   -> sin uso en el código
-- Los 4 fn_* de fidelización SÍ conservan 'authenticated' porque los llaman
-- server actions con la sesión del usuario (y validan el tenant internamente).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('crear_tenant','get_user_email','get_tenant_admin_email','sync_turno_to_cita')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;


-- ── 6. Storage: aislamiento por clínica y fin del acceso público ────────
-- Las fotos clínicas estaban en un bucket público (cualquiera con el link las
-- veía sin autenticarse) y las políticas de escritura solo validaban bucket_id,
-- no el tenant: una clínica podía borrar o sobreescribir las fotos de otra.
-- Las rutas son '<tenant_id>/<paciente_id>/<archivo>', así que scopeamos por
-- la primera carpeta.
--
-- Requiere el código que genera URLs firmadas (ver src/lib/storage.ts).

DROP POLICY IF EXISTS "Auth Insert fotos" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update fotos" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete fotos" ON storage.objects;
DROP POLICY IF EXISTS "Public Access fotos" ON storage.objects;

DROP POLICY IF EXISTS "fotos_select_tenant" ON storage.objects;
CREATE POLICY "fotos_select_tenant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'fotos_clinicas'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM tenant_users WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "fotos_insert_tenant" ON storage.objects;
CREATE POLICY "fotos_insert_tenant" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fotos_clinicas'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM tenant_users WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "fotos_update_tenant" ON storage.objects;
CREATE POLICY "fotos_update_tenant" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'fotos_clinicas'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM tenant_users WHERE user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "fotos_delete_tenant" ON storage.objects;
CREATE POLICY "fotos_delete_tenant" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fotos_clinicas'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM tenant_users WHERE user_id = (select auth.uid())
    )
  );

UPDATE storage.buckets SET public = false WHERE id = 'fotos_clinicas';


-- ── 7. Verificación ─────────────────────────────────────────────────────
-- El diagnóstico completo (10 chequeos, todos deben dar su valor esperado)
-- está en RUNBOOK-LANZAMIENTO.md. Chequeo rápido de cobertura RLS:
--
--   SELECT c.relname, c.relrowsecurity
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname='public' AND c.relkind='r'
--     AND EXISTS (SELECT 1 FROM information_schema.columns col
--                 WHERE col.table_name=c.relname AND col.column_name='tenant_id')
--   ORDER BY c.relrowsecurity, c.relname;
--
-- Ninguna fila debe tener relrowsecurity = false.
