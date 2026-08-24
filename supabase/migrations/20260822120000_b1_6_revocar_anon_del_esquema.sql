-- ═══════════════════════════════════════════════════════════════════════════
-- B1.6 · Revocar `anon` de todo el esquema público
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  YA APLICADO EN PRODUCCIÓN el 20/08/2026 desde el SQL Editor.
--     Bitácora P0-05, entrada 011. Esta migración lo versiona. IDEMPOTENTE.
--
-- POR QUÉ EXISTE ESTA MIGRACIÓN
--
--   Sin ella, `supabase db reset` reconstruye el esquema pero NO el estado de
--   privilegios: `20260722120000_remote_schema.sql` vuelve a ejecutar
--   `GRANT ALL ON TABLE ... TO anon` sobre 23 tablas, y nada lo revoca.
--
--   O sea: el sistema era reconstruible en su estructura y NO en su seguridad.
--   Detectado el 22/08 al diseñar las guardas G-1/G-2.
--
-- EL PROBLEMA QUE CIERRA
--
--   `anon` tenía `arwdDxtm` sobre 34 de 35 tablas — lectura Y escritura. Lo
--   único que lo contenía era RLS. Un error en una política, una tabla nueva
--   sin RLS, o una función SECURITY DEFINER mal escrita, y quedaba expuesto.
--
--   Cierra R-1 (34 tablas), R-5 (`generar_codigo_enlace` ejecutable por anon)
--   y R-11 (`emitir_factura_con_detalle` conservaba `anon=X` pese al
--   REVOKE FROM PUBLIC de su migración: son dos mecanismos distintos y el
--   default privilege le había dado un grant explícito).
--
-- PRECONDICIÓN QUE SE CUMPLIÓ
--
--   Ventana de observación de `pg_stat_statements`, protocolo congelado en
--   P0-05_PROTOCOLO_CIERRE_VENTANA.md. Cerró con CASO 1 — AVANZA:
--   V-1 PASS, V-2 PASS (`tenants_public` con tráfico real), cero entradas de
--   tablas de negocio.
--
--   Salvedad registrada: la cobertura efectiva con `anon` operativo fue de
--   ~24 h, no de 48. Riesgo residual bajo, compensado con el control de
--   detección N-1 corrido periódicamente.
--
-- POR QUÉ UN BUCLE Y NO `REVOKE ON ALL TABLES`
--
--   `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon` también alcanzaría
--   `tenants_public`, que el portal público NECESITA para resolver el tenant
--   por hostname (`TenantContext.tsx:154`, único camino anónimo del código).
--
--   La alternativa era revocar todo y volver a conceder. Se descartó: el SQL
--   Editor demostró dos veces que puede ejecutar parte de un bloque sin
--   devolver error. Si corría el REVOKE y no el GRANT, el portal público
--   quedaba caído. El bucle es UNA sentencia atómica que excluye la vista
--   por construcción.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Revocar anon de toda relación de public, salvo tenants_public ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','v','m','p')
      AND c.relname <> 'tenants_public'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', r.relname);
  END LOOP;
END $$;


-- ── 2. tenants_public: solo lectura ──
-- Redundante con 20260820180100 (R-10), a propósito: si esta migración se
-- aplica sobre una base donde aquella no corrió, el portal igual queda bien.
REVOKE ALL    ON TABLE public.tenants_public FROM anon, authenticated;
GRANT  SELECT ON TABLE public.tenants_public TO   anon, authenticated;


-- ── 3. Funciones ──
--
-- R-11: el `REVOKE ALL ... FROM PUBLIC` de su migración original no borró el
-- grant explícito que el default privilege le había dado a `anon`.
REVOKE ALL ON FUNCTION public.emitir_factura_con_detalle(
  uuid, uuid, uuid, integer, integer, integer, text, date, numeric,
  text, text, text, text, text, boolean, jsonb, jsonb) FROM anon;

-- R-5: INVOKER, no toca ninguna tabla. Higiene, no vulnerabilidad. Su única
-- llamada es interna, desde emitir_enlace_turno, que es DEFINER.
REVOKE ALL ON FUNCTION public.generar_codigo_enlace() FROM PUBLIC, anon;

-- Funciones de trigger: devuelven `trigger`, no son invocables desde SQL
-- normal ni PostgREST las expone. Higiene.
REVOKE ALL ON FUNCTION public.sembrar_renglon_cita() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_cobrado_cita()    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_valor_cita()      FROM PUBLIC, anon;


-- ── 4. Verificación: falla ruidosamente si algo quedó abierto ──
DO $$
DECLARE
    v_relaciones TEXT;
    v_funciones  TEXT;
BEGIN
    -- (a) anon no debe leer ninguna relación salvo tenants_public
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_relaciones
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','v','m','p')
      AND c.relname <> 'tenants_public'
      AND (has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE')
        OR has_table_privilege('anon', c.oid, 'DELETE'));

    IF v_relaciones IS NOT NULL THEN
        RAISE EXCEPTION 'B1.6: anon conserva acceso sobre: %', v_relaciones;
    END IF;

    -- (b) el portal público tiene que seguir resolviendo el tenant
    IF NOT has_table_privilege('anon', 'public.tenants_public', 'SELECT') THEN
        RAISE EXCEPTION 'B1.6: anon perdió el SELECT sobre tenants_public — el portal público deja de funcionar';
    END IF;
    IF has_table_privilege('anon', 'public.tenants_public', 'UPDATE') THEN
        RAISE EXCEPTION 'B1.6: anon conserva escritura sobre tenants_public — R-10 reabierto';
    END IF;

    -- (c) ninguna función ejecutable por anon
    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_funciones
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF v_funciones IS NOT NULL THEN
        RAISE EXCEPTION 'B1.6: anon puede ejecutar: %', v_funciones;
    END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
--
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
--
--   Un comando, inmediato, sin datos, sin redeploy. Reabre R-1, R-5 y R-11.
--   La línea base con el ACL previo de las 44 relaciones está en la
--   entrada 011 de P0-05_BITACORA.md.
--
-- PENDIENTE ASOCIADO
--   `authenticated` conserva acceso a las 36 tablas: RLS sigue siendo el
--   único control para ese rol. Es DO-1, diferido a Fase 2 a propósito —
--   revocarlo produce fallas silenciosas en producción ("la pantalla carga
--   vacía") en vez de errores ruidosos en desarrollo.
-- ═══════════════════════════════════════════════════════════════════════════
