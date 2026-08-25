-- ═══════════════════════════════════════════════════════════════════════════
-- R-12 · `pg_temp` explícito en toda función SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Probar con `npx supabase db reset` antes de `db push`.
--
-- QUÉ HACE
--
--   Recorre `pg_proc` y, a toda función `SECURITY DEFINER` del esquema
--   `public` cuyo `search_path` no incluya `pg_temp`, le agrega `pg_temp`
--   AL FINAL. Nada más: ni el cuerpo, ni la firma, ni el retorno, ni los
--   privilegios, ni el dueño.
--
-- POR QUÉ `ALTER FUNCTION` Y NO `CREATE OR REPLACE`
--
--   `ALTER FUNCTION ... SET search_path` cambia SOLO esa propiedad. No hay que
--   copiar el cuerpo, así que no hay forma de introducir un error al
--   transcribirlo. Para funciones de 120 líneas como `fn_aprobar_asistencia`,
--   la diferencia de riesgo es enorme.
--
--   La primera versión de esta migración copiaba cuerpos con `CREATE OR
--   REPLACE`. Funcionaba, pero era trabajo y riesgo innecesarios.
--
-- POR QUÉ RECORRE `pg_proc` EN VEZ DE LISTAR NOMBRES
--
--   Porque una lista escrita a mano ya falló. Este riesgo se contó mal cuatro
--   veces:
--
--     "9 de 13 sin pg_temp"   heredado de la auditoría, sin verificar
--     "8 sin search_path"     el regex buscaba `SET search_path`; el dump
--                             escribe `SET "search_path"` CON COMILLAS
--     "6 sin pg_temp"         tomaba la primera definición, no la última
--     "4 sin pg_temp"         el regex exigía el prefijo `public.`, y cinco
--                             funciones se declaran sin él
--
--   Las cuatro veces el error fue el mismo: **parsear archivos de texto en vez
--   de consultar el estado real de la base.** Este bloque consulta `pg_proc`.
--   No puede contar mal porque no cuenta: actúa sobre lo que encuentra.
--
--   Las cinco que el último regex se perdió —`sync_valor_cita`,
--   `sync_cobrado_cita`, `sembrar_renglon_cita`, `emitir_enlace_turno` y
--   `emitir_factura_con_detalle`— las detectó el bloque de verificación de la
--   versión anterior de este mismo archivo, en un `db reset`.
--
-- POR QUÉ IMPORTA QUE FALTE `pg_temp`
--
--   Cuando `pg_temp` no está declarado, PostgreSQL lo busca de forma IMPLÍCITA
--   y PRIMERO para nombres de relación. Un usuario con privilegio TEMP —que
--   `anon` y `authenticated` tienen por defecto— puede crear `pg_temp.pacientes`
--   o `pg_temp.tenants`, y una función SECURITY DEFINER resolvería contra esa
--   tabla en lugar de la real, ejecutándose con los privilegios de su dueño,
--   que no está sujeto a RLS.
--
--   Declararlo AL FINAL lo mueve de implícito-primero a explícito-último.
--   `public` se sigue buscando antes, así que ninguna resolución legítima
--   cambia. Lo único que deja de ser posible es el eclipse.
--
-- IMPACTO
--
--   Ninguno sobre comportamiento legítimo. Los triggers asociados se conservan:
--   `ALTER FUNCTION` no los toca —a diferencia de un `DROP` + `CREATE`—.
--
-- FIJADO POR
--
--   `src/lib/guardas-privilegios.test.ts` · G-5.4
-- ═══════════════════════════════════════════════════════════════════════════

DO $r12$
DECLARE
  r        record;
  v_actual text;
  v_nuevo  text;
  v_n      integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.oid::regprocedure AS firma,
           array_to_string(p.proconfig, ',') AS cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                                   -- SECURITY DEFINER
      AND (p.proconfig IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM unnest(p.proconfig) c
             WHERE c LIKE 'search_path=%' AND c LIKE '%pg_temp%'
           ))
    ORDER BY p.oid::regprocedure::text
  LOOP
    -- Conservar el search_path que ya tiene y sumarle pg_temp al final.
    -- Si no tenía ninguno, queda 'public, pg_temp'.
    SELECT substring(c FROM 'search_path=(.*)')
      INTO v_actual
      FROM unnest(coalesce((SELECT proconfig FROM pg_proc WHERE oid = r.oid), '{}'))  c
     WHERE c LIKE 'search_path=%'
     LIMIT 1;

    v_nuevo := coalesce(nullif(trim(v_actual), ''), 'public');

    EXECUTE format('ALTER FUNCTION %s SET search_path TO %s, %L',
                   r.firma, v_nuevo, 'pg_temp');

    RAISE NOTICE 'R-12: % → search_path = %, pg_temp', r.firma, v_nuevo;
    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'R-12: % función(es) corregida(s).', v_n;
END $r12$;


-- ── Verificación ──
DO $verif$
DECLARE v_mal text[] := '{}'; v_total integer;
BEGIN
  SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
    INTO v_mal
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                          WHERE c LIKE 'search_path=%' AND c LIKE '%pg_temp%'));

  IF v_mal IS NOT NULL AND array_length(v_mal, 1) > 0 THEN
    RAISE EXCEPTION 'R-12: SECURITY DEFINER sin pg_temp: %', array_to_string(v_mal, ', ');
  END IF;

  -- Que el bloque haya encontrado algo sobre lo que trabajar. Si no hay
  -- ninguna SECURITY DEFINER, la verificación de arriba pasa por vacío — y
  -- eso sería un problema distinto, no un éxito.
  SELECT count(*) INTO v_total
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef;

  IF v_total < 9 THEN
    RAISE EXCEPTION 'R-12: solo % funciones SECURITY DEFINER en public. Se esperaban 9 o más — '
                    'el esquema no es el que esta migración asume.', v_total;
  END IF;

  RAISE NOTICE 'R-12 OK: % funciones SECURITY DEFINER, todas con pg_temp.', v_total;
END $verif$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
--
--   Por función, quitando pg_temp:
--     ALTER FUNCTION public.<nombre>(<args>) SET search_path TO 'public';
--
--   O en bloque, con el mismo patrón dinámico de arriba invirtiendo la
--   condición. Sin datos de por medio, sin redeploy, sin tocar triggers.
--
-- VERIFICACIÓN MANUAL POSTERIOR
--
--   1. Crear una clínica desde el panel admin        → crear_tenant
--   2. Que llegue el daily-briefing                  → get_tenant_admin_email
--   3. Abrir la pantalla de equipo                   → get_user_email
--   4. Reservar un turno desde el formulario público → sync_turno_to_cita
--   5. Cargar un pago en una cita                    → sync_cobrado_cita
--   6. Crear una cita nueva                          → sembrar_renglon_cita
--   7. Generar el link corto de un turno             → emitir_enlace_turno
--   8. Emitir una factura simulada                   → emitir_factura_con_detalle
--
--   La 4, la 6 y la 7 son las que menos se ejercitan, y las tres tienen
--   trigger o dependencia de por medio.
-- ═══════════════════════════════════════════════════════════════════════════
