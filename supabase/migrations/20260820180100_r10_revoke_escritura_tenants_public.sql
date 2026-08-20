-- ═══════════════════════════════════════════════════════════════════════════
-- R-10 · Cerrar la escritura anónima sobre tenants a través de tenants_public
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  YA APLICADO EN PRODUCCIÓN el 15/08/2026 desde el SQL Editor.
--     Bitácora P0-05, entrada 006. IDEMPOTENTE.
--
-- EL PROBLEMA — vulnerabilidad crítica, cerrada
--
--   `tenants_public` es una vista sobre `tenants`. Cuatro hechos medidos en
--   producción la volvían explotable:
--
--     is_updatable        = YES        (vista auto-actualizable)
--     is_insertable_into  = YES
--     reloptions          = NULL       (SIN security_invoker)
--     relowner            = postgres   (superusuario, no sujeto a RLS)
--     tenants.force_rls   = false      (el dueño ignora sus propias políticas)
--     ACL de anon         = arwdDxtm   (lectura Y ESCRITURA)
--
--   Una vista sin `security_invoker` corre con los privilegios de su dueño.
--   Con `anon` teniendo INSERT/UPDATE/DELETE sobre ella, un cliente SIN
--   AUTENTICAR podía escribir en `tenants`: cambiar nombre, dirección,
--   teléfono, colores, `whatsapptemplate` y —lo más grave—
--   `subdominio_generico` y `custom_domain`, que son las columnas con las que
--   el portal público resuelve el tenant. Reescribirlas es secuestro de ruteo.
--
--   Y `anon` no es una credencial privilegiada: NEXT_PUBLIC_SUPABASE_ANON_KEY
--   viaja al navegador en cada carga de la aplicación.
--
--   La ironía: la migración 20260722190555 había revocado el SELECT de
--   `tenants` a `anon`. La vista quedó con MÁS privilegios que la tabla que
--   esa migración protegía.
--
-- ALCANCE DE LA CORRECCIÓN
--
--   `tenants_public` tiene un único consumidor en todo el repositorio:
--   src/components/TenantContext.tsx:153-157, con el cliente del navegador y
--   un `.select('*')`. Ninguna escritura, en ningún archivo. Por eso alcanza
--   con dejar SELECT.
--
--   `bi_resumen` arrastraba un residuo del mismo tipo: anon=awdDxtm, es decir
--   escritura y MAINTAIN sin SELECT. Nada la consume desde el cliente.
--
-- VERIFICACIÓN POSTERIOR (15/08/2026)
--   tenants_public → anon=r          (solo lectura)
--   bi_resumen     → sin privilegios para anon ni authenticated
--   Portal público en turnos.walterbenegas.com.ar/reserva/walterbenegas:
--   carga con nombre, logo y colores. Ese host resuelve por `custom_domain`,
--   una de las columnas que TenantContext lee de la vista, así que la prueba
--   ejercitó exactamente el camino que el REVOKE podía romper.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL    ON TABLE public.tenants_public FROM anon, authenticated;
GRANT  SELECT ON TABLE public.tenants_public TO   anon, authenticated;

REVOKE ALL    ON TABLE public.bi_resumen     FROM anon, authenticated;


-- ── Verificación: falla ruidosamente si quedó escritura abierta ──
DO $$
BEGIN
    IF has_table_privilege('anon', 'public.tenants_public', 'UPDATE')
       OR has_table_privilege('anon', 'public.tenants_public', 'INSERT')
       OR has_table_privilege('anon', 'public.tenants_public', 'DELETE') THEN
        RAISE EXCEPTION 'R-10: anon conserva escritura sobre tenants_public';
    END IF;

    IF NOT has_table_privilege('anon', 'public.tenants_public', 'SELECT') THEN
        RAISE EXCEPTION 'R-10: anon perdió el SELECT sobre tenants_public — el portal público deja de resolver el tenant';
    END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
--
--   GRANT ALL ON TABLE public.tenants_public TO anon, authenticated;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--     ON TABLE public.bi_resumen TO anon, authenticated;
--
--   Reabre la vulnerabilidad. No hacerlo sin un motivo muy explícito.
--
-- PENDIENTE ASOCIADO
--   La causa de fondo es que la vista no declara `security_invoker`. Agregarlo
--   —junto con `force_rls` sobre `tenants`— es trabajo de Fase 2 (R-9).
-- ═══════════════════════════════════════════════════════════════════════════
