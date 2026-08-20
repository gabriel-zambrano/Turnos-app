-- ═══════════════════════════════════════════════════════════════════════════
-- P0-07 · Cerrar la lectura anónima de las seis vistas bi_*
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  YA APLICADO EN PRODUCCIÓN el 09/08/2026 desde el SQL Editor.
--     Esta migración lo versiona. Es IDEMPOTENTE: correrla de nuevo no cambia
--     nada, porque REVOKE sobre un privilegio ausente es un no-op.
--
-- EL PROBLEMA
--
--   Las seis vistas `bi_*` se crearon sin `security_invoker` y con dueño
--   `postgres`. Una vista sin esa opción se ejecuta con los privilegios de su
--   dueño, y `postgres` no está sujeto a RLS. Sumado al `GRANT ALL ... TO anon`
--   que heredaron del default privilege del esquema, quedaban legibles por
--   cualquiera con la clave `anon` —que viaja al navegador en cada carga.
--
--   Verificado el 09/08/2026 con un curl sin sesión: HTTP 200 devolviendo
--   6 meses de facturación, $35.341.190 ARS sobre 562 citas, sin filtro de
--   tenant. No era teórico.
--
-- POR QUÉ REVOKE Y NO DROP
--
--   Las vistas alimentan el módulo /bi. Eliminarlas cerraba la exposición al
--   costo de romper una funcionalidad viva. El REVOKE cierra el acceso sin
--   tocar el objeto. Decisión del owner; ver 20260807120000, neutralizada.
--
-- VERIFICACIÓN POSTERIOR (09/08/2026): las seis devuelven 401 + 42501.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON TABLE public.bi_citas_por_dia            FROM anon, authenticated;
REVOKE ALL ON TABLE public.bi_citas_por_tratamiento    FROM anon, authenticated;
REVOKE ALL ON TABLE public.bi_ingresos_por_mes         FROM anon, authenticated;
REVOKE ALL ON TABLE public.bi_kpis_mes                 FROM anon, authenticated;
REVOKE ALL ON TABLE public.bi_ocupacion_por_hora       FROM anon, authenticated;
REVOKE ALL ON TABLE public.bi_pacientes_nuevos_por_mes FROM anon, authenticated;

-- `postgres` y `service_role` conservan acceso: el módulo /bi lee por API.


-- ── Verificación: falla ruidosamente si algo quedó abierto ──
DO $$
DECLARE v_expuestas TEXT;
BEGIN
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_expuestas
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('v', 'm')
      AND c.relname LIKE 'bi\_%'
      AND has_table_privilege('anon', c.oid, 'SELECT');

    IF v_expuestas IS NOT NULL THEN
        RAISE EXCEPTION 'P0-07: estas vistas bi_* siguen legibles por anon: %', v_expuestas;
    END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
--
--   GRANT ALL ON TABLE public.bi_citas_por_dia            TO anon, authenticated;
--   GRANT ALL ON TABLE public.bi_citas_por_tratamiento    TO anon, authenticated;
--   GRANT ALL ON TABLE public.bi_ingresos_por_mes         TO anon, authenticated;
--   GRANT ALL ON TABLE public.bi_kpis_mes                 TO anon, authenticated;
--   GRANT ALL ON TABLE public.bi_ocupacion_por_hora       TO anon, authenticated;
--   GRANT ALL ON TABLE public.bi_pacientes_nuevos_por_mes TO anon, authenticated;
--
--   Reabre la exposición. Solo con motivo explícito.
-- ═══════════════════════════════════════════════════════════════════════════
