-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  MIGRACIÓN NEUTRALIZADA — NUNCA SE APLICÓ Y NO DEBE APLICARSE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Esta migración proponía DROPear las seis vistas `bi_*` para cerrar P0-07.
-- El owner decidió otra cosa: se aplicó un REVOKE, preservando las vistas.
--
--   > "NO hagas DROP de las seis vistas todavía. No uses CASCADE, no modifiques
--      datos y no hagas DROP. Quiero preservar bi_resumen y tenants_public
--      exactamente como están."
--
-- El archivo quedó versionado (commit 3995193) con los `DROP VIEW` activos.
-- Eso lo convertía en una mina: un `supabase db push` habría BORRADO las seis
-- vistas en producción, donde hoy existen y están correctamente revocadas.
--
-- Neutralizada el 20/08/2026 al detectarse durante la tarea F1-2 del release
-- board. Se conserva el archivo, y no se borra, para que el historial muestre
-- que la opción se evaluó y se descartó.
--
-- LO QUE SÍ SE APLICÓ está en:
--   20260820180000_p0_07_revoke_vistas_bi.sql
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ESTA MIGRACIÓN NO EJECUTA NADA. Es documentación de una decisión descartada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Contenido original, inerte ──
--
-- DROP VIEW IF EXISTS public.bi_citas_por_dia            RESTRICT;
-- DROP VIEW IF EXISTS public.bi_citas_por_tratamiento    RESTRICT;
-- DROP VIEW IF EXISTS public.bi_ingresos_por_mes         RESTRICT;
-- DROP VIEW IF EXISTS public.bi_kpis_mes                 RESTRICT;
-- DROP VIEW IF EXISTS public.bi_ocupacion_por_hora       RESTRICT;
-- DROP VIEW IF EXISTS public.bi_pacientes_nuevos_por_mes RESTRICT;
--
-- El bloque DO de verificación que seguía a estos DROP también queda inerte:
-- exigía que las seis vistas NO existieran, y hoy existen a propósito.
--
-- Motivo del descarte: las vistas alimentan el módulo /bi. Eliminarlas resolvía
-- la exposición al costo de romper una funcionalidad viva. El REVOKE cierra el
-- acceso de `anon` sin tocar el objeto.


SELECT 'migracion_neutralizada_ver_20260820180000' AS nota;
