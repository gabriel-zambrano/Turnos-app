-- ═══════════════════════════════════════════════════════════════════════════
-- B1.1 · Cerrar los default privileges + costura tiene_rol()
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  YA APLICADO EN PRODUCCIÓN el 20/08/2026 desde el SQL Editor.
--     Bitácora P0-05, entrada 009. IDEMPOTENTE.
--
-- EL PROBLEMA — la causa raíz de P0-07 y R-11
--
--   El esquema tenía DOCE `ALTER DEFAULT PRIVILEGES`, no uno. Tres eran
--   peligrosos, y el peor concedía TABLAS Y VISTAS a `anon`:
--
--     ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--       GRANT ALL ON TABLES TO anon;        -- remote_schema.sql:1905
--
--   `ON TABLES` incluye vistas. Por eso las seis `bi_*` nacieron concedidas a
--   `anon` sin que nadie escribiera un GRANT: era el default. Cerrar P0-07 sin
--   cerrar esto habría sido tratar el síntoma.
--
--   Y explica R-11: `emitir_factura_con_detalle` tenía `REVOKE ALL ... FROM
--   PUBLIC` en su migración, pero conservaba `anon=X`. Un REVOKE FROM PUBLIC
--   NO borra un grant explícito a `anon` — son dos mecanismos distintos, y el
--   default privilege le había dado uno explícito al crearse.
--
-- POR QUÉ SOLO `FOR ROLE postgres`
--
--   Producción tiene default privileges para DOS roles: `postgres` y
--   `supabase_admin`. Los de `supabase_admin` NO se pueden alterar:
--   `pg_has_role('postgres','supabase_admin','MEMBER')` = false.
--
--   Sin impacto práctico: los 43 objetos de `public` y las 14 funciones
--   pertenecen a `postgres`. `supabase_admin` nunca creó nada acá; su entrada
--   es residuo del bootstrap del proyecto.
--
--   Riesgo residual: si la plataforma creara algo en `public` como
--   `supabase_admin`, nacería concedido a `anon`. Se detecta con la consulta
--   N-1 de P0-05_FASE0_LECTURA_v2.sql, corrida periódicamente.
--
-- POR QUÉ `authenticated` CONSERVA TABLAS
--
--   Decisión DO-1. Revocarlo hace que una tabla nueva sin GRANT explícito
--   simplemente NO CARGUE en la UI: falla silenciosa en producción. Se difirió
--   a Fase 2, junto con la guarda G-1 que exige declarar el GRANT en cada
--   migración. `FUNCTIONS` sí se revoca: ahí la falla es ruidosa y en
--   desarrollo (`permission denied for function`).
--
-- ⚠️  LIMITACIÓN CONOCIDA — R-17
--
--   Estos statements NO impiden que una función nueva sea ejecutable por
--   `anon`. PostgreSQL concede EXECUTE a PUBLIC en toda función nueva, y ese
--   default NO sale de pg_default_acl: es incorporado al tipo de objeto. Como
--   todo rol pertenece a PUBLIC, `anon` lo hereda.
--
--   Se intentó suprimirlo TRES veces —`REVOKE EXECUTE ON FUNCTIONS FROM
--   PUBLIC` con y sin `FOR ROLE`— y las tres devolvieron éxito sin efecto.
--   Medido creando una función después de cada intento: el ACL siempre mostró
--   `=X/postgres`, y `has_function_privilege('anon', ...)` siempre true.
--
--   MITIGACIÓN: toda migración que cree una función debe incluir su
--   `REVOKE ALL ... FROM PUBLIC` explícito, como hacen 13 de las 14 existentes
--   y como hace `tiene_rol()` más abajo. La guarda G-2 de B1.7 lo vuelve
--   obligatorio en CI.
--
-- ⚠️  NOTA DE EJECUCIÓN
--
--   Al aplicarse en producción, el SQL Editor de Supabase ejecutó la cola de
--   un bloque BEGIN/COMMIT y NO la cabeza, sin devolver error en la parte que
--   no corrió. Los siete ALTER se aplicaron después, DE A UNO. Si esta
--   migración se corre por el editor y no por CLI, verificar el catálogo
--   después de cada statement.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── public · FOR ROLE postgres ──
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM authenticated;

-- ── storage · FOR ROLE postgres ──
-- Los 8 objetos de `storage` pertenecen a supabase_storage_admin, ninguno a
-- postgres. Este default nunca se aplicó a nada: cierra el caso de crear algo
-- ahí desde el SQL Editor, que corre como postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  REVOKE ALL ON SEQUENCES FROM anon;


-- ═══════════════════════════════════════════════════════════════════════════
-- tiene_rol() · costura de compatibilidad hacia el modelo multirol (DO-6)
--
--   Hoy lee `tenant_users.role`. Cuando aterrice la tabla de asociación
--   multirol de Fase 2, cambia SOLO el cuerpo de esta función: las funciones y
--   políticas que la consumen no se vuelven a tocar. Es el punto único donde
--   se define qué significa "tener un rol".
--
--   SECURITY DEFINER es necesario: si fuera INVOKER y alguna vez se usa en una
--   política sobre `tenant_users`, la lectura interna dispararía esa misma
--   política y entraría en recursión. Con DEFINER y dueño postgres, salta RLS.
--
--   search_path con `pg_temp` anclado cierra el vector de R-12: `anon` y
--   `authenticated` TIENEN privilegio TEMP —confirmado en producción— así que
--   una DEFINER sin pg_temp explícito es secuestrable por tabla temporal.
--
--   CREATE OR REPLACE en vez de CREATE: la función ya existe en producción.
--   ⚠️  CREATE OR REPLACE PRESERVA EL ACL EXISTENTE, por eso el REVOKE de
--       abajo se ejecuta siempre y no es redundante.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tiene_rol(p_tenant_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant_id
      AND role = ANY(p_roles)
  )
$$;

REVOKE ALL     ON FUNCTION public.tiene_rol(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.tiene_rol(uuid, text[]) TO   authenticated, service_role;

COMMENT ON FUNCTION public.tiene_rol(uuid, text[]) IS
  'Costura de compatibilidad hacia el modelo multirol (DO-6). Hoy lee tenant_users.role; en Fase 2 pasará a leer la tabla de asociación sin que cambien sus consumidores.';


-- ── Verificación ──
DO $$
BEGIN
    IF has_function_privilege('anon', 'public.tiene_rol(uuid,text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'B1.1: anon puede ejecutar tiene_rol()';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.tiene_rol(uuid,text[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'B1.1: authenticated NO puede ejecutar tiene_rol() — B1.2/B1.3 fallarían';
    END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — de a un statement
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON FUNCTIONS TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES    TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON SEQUENCES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
--     GRANT ALL ON TABLES    TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
--     GRANT ALL ON FUNCTIONS TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
--     GRANT ALL ON SEQUENCES TO anon;
--   DROP FUNCTION public.tiene_rol(uuid, text[]);
--
--   Sin datos, sin redeploy. Verificar antes que nada consuma tiene_rol().
-- ═══════════════════════════════════════════════════════════════════════════
