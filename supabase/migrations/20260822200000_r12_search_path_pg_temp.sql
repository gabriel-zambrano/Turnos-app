-- ═══════════════════════════════════════════════════════════════════════════
-- R-12 · `pg_temp` explícito en las funciones SECURITY DEFINER que faltaban
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  NO APLICADO. Probar con `npx supabase db reset` antes de `db push`.
--
-- QUÉ CAMBIA — y es lo único que cambia
--
--     SET "search_path" TO 'public'
--   → SET "search_path" TO 'public', 'pg_temp'
--
--   En cuatro funciones. Nada más: ni firma, ni retorno, ni lógica, ni
--   `SECURITY DEFINER`, ni dueño, ni privilegios, ni RLS. Los cuerpos están
--   copiados textualmente de `20260722120000_remote_schema.sql`, no
--   transcriptos: transcribir un cuerpo de 44 líneas para cambiar una es la
--   forma más fácil de introducir un error silencioso.
--
-- POR QUÉ IMPORTA QUE FALTE `pg_temp`
--
--   Cuando `pg_temp` no se declara, PostgreSQL lo busca de forma IMPLÍCITA y
--   PRIMERO para nombres de relación. Un usuario con privilegio TEMP —que
--   `anon` y `authenticated` tienen por defecto— puede crear `pg_temp.tenants`
--   o `pg_temp.pacientes`, y una función SECURITY DEFINER resolvería contra
--   esa tabla en lugar de la real, ejecutándose con los privilegios de
--   `postgres`, que no está sujeto a RLS.
--
--   Declararlo AL FINAL lo mueve de implícito-primero a explícito-último.
--   `public` se sigue buscando antes, así que ninguna resolución legítima
--   cambia. Lo único que deja de ser posible es el eclipse.
--
-- CUÁLES SÍ Y CUÁLES NO
--
--   Se corrigen 4:
--     crear_tenant · get_tenant_admin_email · get_user_email · sync_turno_to_cita
--
--   NO se tocan las 5 que ya están correctas — verificado tomando la ÚLTIMA
--   definición de cada una, no la primera:
--     fn_aprobar_asistencia       'public', 'pg_temp'   ya en el dump inicial
--     fn_registrar_inasistencia   'public', 'pg_temp'   ya en el dump inicial
--     fn_ajustar_puntos_manual    'public', 'pg_temp'   corregida por B1.2
--     fn_canjear_premio           'public', 'pg_temp'   corregida por B1.3
--     tiene_rol                   public, pg_temp       nació correcta en B1.1
--
--   Recrearlas sin necesidad sería riesgo sin beneficio: `fn_ajustar_puntos_manual`
--   y `fn_canjear_premio` llevan las guardas de rol y límite de B1.2/B1.3, y
--   tocarlas acá podría revertirlas.
--
-- ⚠️  `sync_turno_to_cita` ES UNA FUNCIÓN DE TRIGGER
--
--   `CREATE OR REPLACE FUNCTION` conserva el trigger asociado. **NO recrear
--   el trigger.** Hacerlo abriría una ventana sin sincronización entre
--   `turnos` y `citas`.
--
-- FIJADO POR
--
--   `src/lib/guardas-privilegios.test.ts` · G-5.4 falla si una SECURITY
--   DEFINER nueva se declara sin `pg_temp`.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── crear_tenant ──
CREATE OR REPLACE FUNCTION "public"."crear_tenant"("p_nombre" "text", "p_subdominio" "text", "p_plan" "text", "p_custom_domain" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id UUID;
  v_feature_bi BOOLEAN := false;
  v_feature_whatsapp BOOLEAN := false;
  v_feature_recordatorios BOOLEAN := false;
  v_max_pacientes INT := 100;
  v_max_citas_mes INT := 200;
BEGIN
  IF p_plan = 'pro' THEN
    v_feature_whatsapp := true;
    v_feature_recordatorios := true;
    v_max_pacientes := 500;
    v_max_citas_mes := 999;
  ELSIF p_plan = 'business' THEN
    v_feature_bi := true;
    v_feature_whatsapp := true;
    v_feature_recordatorios := true;
    v_max_pacientes := 999;
    v_max_citas_mes := 999;
  END IF;

  INSERT INTO tenants (
    nombre, subdominio, plan, custom_domain,
    subdominio_generico, activo,
    feature_bi, feature_whatsapp, feature_recordatorios,
    max_pacientes, max_citas_mes
  )
  VALUES (
    p_nombre, p_subdominio, p_plan, p_custom_domain,
    p_subdominio, true,
    v_feature_bi, v_feature_whatsapp, v_feature_recordatorios,
    v_max_pacientes, v_max_citas_mes
  )
  RETURNING id INTO v_tenant_id;

  RETURN v_tenant_id;
END;
$$;

-- ── get_tenant_admin_email ──
CREATE OR REPLACE FUNCTION "public"."get_tenant_admin_email"("tid" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT u.email 
  FROM auth.users u
  JOIN public.tenant_users tu ON tu.user_id = u.id
  WHERE tu.tenant_id = tid
  LIMIT 1;
$$;

-- ── get_user_email ──
CREATE OR REPLACE FUNCTION "public"."get_user_email"("uid" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT email FROM auth.users WHERE id = uid;
$$;

-- ── sync_turno_to_cita ──
CREATE OR REPLACE FUNCTION "public"."sync_turno_to_cita"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_paciente_id UUID;
  v_nombre_completo TEXT;
  v_fecha_hora TIMESTAMPTZ;
BEGIN
  v_nombre_completo := NEW.nombre || ' ' || NEW.apellido;

  v_fecha_hora := (NEW.fecha::TEXT || ' ' || NEW.hora || ':00')::TIMESTAMP 
                  AT TIME ZONE 'America/Argentina/Buenos_Aires';

  SELECT id INTO v_paciente_id
  FROM pacientes
  WHERE email = NEW.email
  LIMIT 1;

  IF v_paciente_id IS NULL THEN
    INSERT INTO pacientes (nombre, email, telefono)
    VALUES (v_nombre_completo, NEW.email, NEW.telefono)
    RETURNING id INTO v_paciente_id;
  END IF;

  INSERT INTO citas (
    paciente_id,
    fecha_hora,
    tipo_tratamiento,
    estado,
    notas,
    duracion_minutos
  ) VALUES (
    v_paciente_id,
    v_fecha_hora,
    NEW.servicio,
    'pendiente',
    COALESCE(NEW.notas, ''),
    30
  );

  RETURN NEW;
END;
$$;



-- ── Privilegios · RE-AFIRMADOS, NO MODIFICADOS ──
--
-- Estas cuatro líneas son COPIA EXACTA de lo que ya declara
-- `20260722120000_remote_schema.sql` (L1616-1656). No cambian nada: ninguna
-- de las cuatro funciones es ejecutable hoy por `anon` ni por `authenticated`.
--
-- Van igual por dos razones:
--
--   1. `CREATE OR REPLACE` preserva el ACL de una función que YA existe, pero
--      en una base reconstruida desde cero el orden importa. Bajo R-17 —el
--      default privilege no se puede suprimir en este entorno— una función
--      creada de nuevo nace ejecutable por PUBLIC. El REVOKE explícito es la
--      única protección que funciona acá.
--
--   2. La guarda G-2.1 exige que toda migración que declare una función
--      declare también su REVOKE, en la misma migración. Detectó la ausencia
--      en la primera versión de este archivo.

REVOKE ALL ON FUNCTION public.crear_tenant(text, text, text, text) FROM PUBLIC;
GRANT ALL  ON FUNCTION public.crear_tenant(text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_tenant_admin_email(uuid) FROM PUBLIC;
GRANT ALL  ON FUNCTION public.get_tenant_admin_email(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_user_email(uuid) FROM PUBLIC;
GRANT ALL  ON FUNCTION public.get_user_email(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.sync_turno_to_cita() FROM PUBLIC;
GRANT ALL  ON FUNCTION public.sync_turno_to_cita() TO service_role;


-- ── Verificación ──
DO $verif$
DECLARE r record; v_mal text[] := '{}';
BEGIN
  FOR r IN
    SELECT p.proname, array_to_string(p.proconfig, ',') AS cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    IF r.cfg IS NULL OR position('pg_temp' in r.cfg) = 0 THEN
      v_mal := v_mal || r.proname;
    END IF;
  END LOOP;

  IF array_length(v_mal, 1) > 0 THEN
    RAISE EXCEPTION 'R-12: SECURITY DEFINER sin pg_temp: %', array_to_string(v_mal, ', ');
  END IF;

  -- Que la app siga andando importa tanto como el arreglo.
  IF NOT has_function_privilege('authenticated', 'public.get_user_email(uuid)', 'EXECUTE') THEN
    RAISE WARNING 'R-12: authenticated no ejecuta get_user_email (puede ser correcto)';
  END IF;
END $verif$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
--
--   `CREATE OR REPLACE` con los mismos cuerpos y `SET "search_path" TO 'public'`.
--   Están en `20260722120000_remote_schema.sql`. Sin datos de por medio, sin
--   redeploy, sin tocar el trigger.
--
-- VERIFICACIÓN MANUAL POSTERIOR
--
--   1. Crear una clínica desde el panel admin      → crear_tenant
--   2. Que llegue el daily-briefing                → get_tenant_admin_email
--   3. Abrir la pantalla de equipo                 → get_user_email
--   4. Reservar un turno desde el formulario público → sync_turno_to_cita
--
--   La 4 es la que menos se ejercita y la única con trigger de por medio.
-- ═══════════════════════════════════════════════════════════════════════════
