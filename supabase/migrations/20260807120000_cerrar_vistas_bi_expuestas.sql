-- ─────────────────────────────────────────────────────────────
-- P0-07 · Cerrar la exposición de las vistas de BI
--
-- QUÉ PASABA
-- Seis vistas `bi_*` combinaban tres condiciones que, juntas, dejaban los
-- agregados de negocio de TODAS las clínicas al alcance de cualquiera:
--
--   1. `OWNER TO postgres` y sin `security_invoker`. Una vista sin esa opción
--      corre con los privilegios de su dueño; `postgres` es superusuario y los
--      superusuarios saltean RLS. Las políticas `tenant_isolation_citas` y
--      `tenant_isolation_pacientes` NO se aplicaban al consultar por acá.
--   2. Ningún filtro por `tenant_id`. Agregaban sobre la tabla entera: un
--      `sum(valor)` sobre `citas` es la facturación de todos los consultorios.
--   3. `GRANT ALL ... TO anon`. La anon key viaja en el bundle del navegador y
--      PostgREST expone toda relación con grant. No hacía falta ni loguearse.
--
-- Lo expuesto no era PII de pacientes —son agregados, sin nombres ni emails—
-- sino algo igual de sensible para un SaaS: la facturación mensual, el ticket
-- promedio por tratamiento y la cantidad de pacientes de cada clínica.
--
-- POR QUÉ SE ELIMINAN EN VEZ DE ARREGLARSE
-- Son código muerto. La aplicación no las consulta: `/bi` lee `citas`
-- directamente (src/app/bi/page.tsx:133,155), `/finanzas` y `/dashboard` leen
-- las tablas base. Arreglarlas (agregar `security_invoker`, `tenant_id` y
-- recortar grants) sería mantener con vida una superficie de ataque que nadie
-- usa. Si mañana se necesitan, se recrean bien: la definición original está
-- más abajo, en el bloque de reversión.
--
-- QUÉ NO SE TOCA
--   · `bi_resumen`      — materializada, TIENE `tenant_id`, grant solo a
--                         `service_role`, y está `WITH NO DATA`. No expone nada.
--   · `tenants_public`  — intencional y en uso: la resolución de clínica por
--                         hostname del portal público la necesita
--                         (src/components/TenantContext.tsx:154). Está acotada
--                         a columnas de branding y a `activo = true`.
--
-- POR QUÉ `RESTRICT` Y NO `CASCADE`
-- `RESTRICT` es el default, pero acá va explícito porque es la propiedad de
-- seguridad más importante de esta migración. Este repositorio verificó las
-- dependencias contra el dump del 22/07, no contra la base de hoy. Si en
-- producción algo depende de una de estas vistas —otra vista, una función—
-- queremos que la migración FALLE y nos lo diga, no que arrastre objetos por
-- delante en silencio. Si falla, hay que leer el error antes de insistir.
--
-- ALTERNATIVA MÁS CONSERVADORA
-- Si preferís no borrar hasta estar seguro de que ninguna herramienta externa
-- (Metabase, Looker Studio, un conector de Sheets) las consulta, el paso 1 de
-- abajo se puede reemplazar por un REVOKE, que cierra la exposición sin
-- destruir nada:
--
--   REVOKE ALL ON TABLE public.bi_citas_por_dia            FROM anon, authenticated;
--   REVOKE ALL ON TABLE public.bi_citas_por_tratamiento    FROM anon, authenticated;
--   REVOKE ALL ON TABLE public.bi_ingresos_por_mes         FROM anon, authenticated;
--   REVOKE ALL ON TABLE public.bi_kpis_mes                 FROM anon, authenticated;
--   REVOKE ALL ON TABLE public.bi_ocupacion_por_hora       FROM anon, authenticated;
--   REVOKE ALL ON TABLE public.bi_pacientes_nuevos_por_mes FROM anon, authenticated;
--
-- Y correr el DROP más adelante. Cierra el mismo agujero; deja la deuda.
--
-- Idempotente: se puede correr más de una vez.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 1. Eliminar las seis vistas expuestas
--
-- Al eliminar una vista se eliminan también sus grants: el ACL vive en el
-- objeto. No hace falta REVOKE previo ni posterior.
-- ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.bi_citas_por_dia            RESTRICT;
DROP VIEW IF EXISTS public.bi_citas_por_tratamiento    RESTRICT;
DROP VIEW IF EXISTS public.bi_ingresos_por_mes         RESTRICT;
DROP VIEW IF EXISTS public.bi_kpis_mes                 RESTRICT;
DROP VIEW IF EXISTS public.bi_ocupacion_por_hora       RESTRICT;
DROP VIEW IF EXISTS public.bi_pacientes_nuevos_por_mes RESTRICT;


-- ─────────────────────────────────────────────────────────────
-- 2. Verificación — falla ruidosamente si algo quedó mal
--
-- Tres cosas se comprueban, y las tres son motivo de abortar:
--   a) que no quede ninguna de las seis;
--   b) que `bi_resumen` y `tenants_public` sigan existiendo (no las tocamos,
--      pero si un CASCADE mal puesto se las llevó, hay que enterarse acá);
--   c) que no quede ninguna vista del esquema `public` legible por `anon`
--      salvo `tenants_public`, que es la única con motivo para serlo.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_restantes  TEXT;
    v_faltantes  TEXT;
    v_expuestas  TEXT;
BEGIN
    -- (a) ninguna de las seis debe sobrevivir
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_restantes
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'v'
      AND c.relname IN (
          'bi_citas_por_dia', 'bi_citas_por_tratamiento', 'bi_ingresos_por_mes',
          'bi_kpis_mes', 'bi_ocupacion_por_hora', 'bi_pacientes_nuevos_por_mes'
      );

    IF v_restantes IS NOT NULL THEN
        RAISE EXCEPTION 'P0-07: estas vistas siguen existiendo: %', v_restantes;
    END IF;

    -- (b) las dos que NO se tocan deben seguir en pie
    SELECT string_agg(esperada, ', ') INTO v_faltantes
    FROM (VALUES ('bi_resumen'), ('tenants_public')) AS t(esperada)
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace
          AND c.relkind IN ('v', 'm')
          AND c.relname = t.esperada
    );

    IF v_faltantes IS NOT NULL THEN
        RAISE EXCEPTION 'P0-07: se eliminaron vistas que debían conservarse: %', v_faltantes;
    END IF;

    -- (c) ninguna vista legible por `anon` salvo tenants_public
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_expuestas
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('v', 'm')
      AND c.relname <> 'tenants_public'
      AND has_table_privilege('anon', c.oid, 'SELECT');

    IF v_expuestas IS NOT NULL THEN
        RAISE WARNING 'P0-07: quedan vistas legibles por anon (revisar): %', v_expuestas;
    END IF;

    RAISE NOTICE 'P0-07 OK: 6 vistas eliminadas; bi_resumen y tenants_public intactas.';
END $$;


-- ─────────────────────────────────────────────────────────────
-- 3. Consulta de control (opcional, para pegar en el SQL Editor)
--
-- Deja ver de un vistazo el estado de todas las vistas del esquema:
--
--   SELECT c.relname AS vista,
--          c.relkind AS tipo,
--          COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
--                    WHERE option_name = 'security_invoker'), 'off') AS security_invoker,
--          has_table_privilege('anon', c.oid, 'SELECT')          AS anon_lee,
--          has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_lee
--   FROM pg_class c
--   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v','m')
--   ORDER BY c.relname;
--
-- Esperado después de esta migración:
--   bi_resumen      | m | off | false | false
--   tenants_public  | v | off | true  | true
-- ─────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════
-- REVERSIÓN
--
-- Recrea las seis vistas TAL CUAL estaban, para volver atrás sin arqueología.
-- Ojo: recrearlas así reintroduce el problema. Si alguna hace falta de verdad,
-- la versión correcta lleva `WITH (security_invoker = on)`, columna `tenant_id`
-- en el SELECT y en el GROUP BY, y grant solo a `authenticated`.
--
-- CREATE OR REPLACE VIEW public.bi_citas_por_dia AS
--  SELECT date((fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')) AS fecha,
--     count(*) AS total,
--     count(*) FILTER (WHERE estado = 'confirmado') AS confirmadas,
--     count(*) FILTER (WHERE estado = 'pendiente')  AS pendientes,
--     count(*) FILTER (WHERE estado = 'cancelado')  AS canceladas,
--     round(((count(*) FILTER (WHERE estado = 'confirmado'))::numeric
--            / NULLIF(count(*), 0)::numeric) * 100::numeric, 1) AS tasa_confirmacion
--    FROM public.citas
--   WHERE fecha_hora >= (now() - '30 days'::interval)
--   GROUP BY date((fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires'))
--   ORDER BY date((fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires'));
--
-- CREATE OR REPLACE VIEW public.bi_citas_por_tratamiento AS
--  SELECT tipo_tratamiento,
--     count(*) AS total,
--     count(*) FILTER (WHERE estado = 'confirmado') AS confirmadas,
--     round(avg(duracion_minutos), 0) AS duracion_promedio,
--     round(avg(valor) FILTER (WHERE valor IS NOT NULL), 0) AS valor_promedio
--    FROM public.citas
--   GROUP BY tipo_tratamiento
--   ORDER BY count(*) DESC;
--
-- CREATE OR REPLACE VIEW public.bi_ingresos_por_mes AS
--  SELECT to_char(date_trunc('month', (fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')), 'YYYY-MM') AS mes,
--     count(*) AS citas,
--     COALESCE(sum(valor) FILTER (WHERE valor IS NOT NULL), 0::numeric) AS ingresos,
--     COALESCE(sum(sena)  FILTER (WHERE sena  IS NOT NULL), 0::numeric) AS senas
--    FROM public.citas
--   GROUP BY date_trunc('month', (fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires'))
--   ORDER BY to_char(date_trunc('month', (fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')), 'YYYY-MM') DESC
--   LIMIT 6;
--
-- CREATE OR REPLACE VIEW public.bi_kpis_mes AS
--  SELECT count(*) AS citas_mes,
--     count(*) FILTER (WHERE estado = 'confirmado') AS confirmadas,
--     count(*) FILTER (WHERE estado = 'cancelado')  AS canceladas,
--     round(((count(*) FILTER (WHERE estado = 'confirmado'))::numeric
--            / NULLIF(count(*), 0)::numeric) * 100::numeric, 1) AS tasa_confirmacion,
--     COALESCE(sum(valor) FILTER (WHERE valor IS NOT NULL), 0::numeric) AS ingresos_mes,
--     COALESCE(sum(sena)  FILTER (WHERE sena  IS NOT NULL), 0::numeric) AS senas_mes,
--     count(DISTINCT paciente_id) AS pacientes_unicos
--    FROM public.citas
--   WHERE date_trunc('month', fecha_hora) = date_trunc('month', now());
--
-- CREATE OR REPLACE VIEW public.bi_ocupacion_por_hora AS
--  SELECT (EXTRACT(hour FROM (fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')))::integer AS hora,
--     count(*) AS total_citas,
--     round(avg(duracion_minutos), 0) AS duracion_promedio
--    FROM public.citas
--   GROUP BY EXTRACT(hour FROM (fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires'))
--   ORDER BY (EXTRACT(hour FROM (fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')))::integer;
--
-- CREATE OR REPLACE VIEW public.bi_pacientes_nuevos_por_mes AS
--  SELECT to_char(date_trunc('month', creado_en), 'YYYY-MM') AS mes,
--     count(*) AS pacientes_nuevos
--    FROM public.pacientes
--   GROUP BY date_trunc('month', creado_en)
--   ORDER BY to_char(date_trunc('month', creado_en), 'YYYY-MM') DESC
--   LIMIT 6;
--
-- Y los grants que tenían (NO recrearlos: son parte del problema):
--   GRANT ALL ON TABLE public.bi_* TO anon;
--   GRANT ALL ON TABLE public.bi_* TO authenticated;
--   GRANT ALL ON TABLE public.bi_* TO service_role;
-- ═════════════════════════════════════════════════════════════
