-- ═══════════════════════════════════════════════════════════════════════════
-- F1-7 · Privilegios explícitos para cajas_diarias
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  A DIFERENCIA DE LAS TRES MIGRACIONES ANTERIORES, ESTA NO ESTÁ APLICADA.
--     Es un cambio nuevo. Revisar antes de aplicar.
--
-- EL PROBLEMA
--
--   `20260820170000_caja_diaria_y_arqueo.sql` crea `cajas_diarias` con todo lo
--   que corresponde —`tenant_id NOT NULL`, RLS habilitada, política de
--   aislamiento con USING y WITH CHECK, `UNIQUE (tenant_id, fecha)`— pero
--   SIN NINGÚN GRANT EXPLÍCITO.
--
--   Es exactamente el patrón que dejó las seis vistas `bi_*` expuestas y las
--   12 tablas de R-1 dependiendo del default privilege. Y es el primer caso
--   que la guarda G-1 de B1.7 va a detectar cuando exista.
--
--   Sus privilegios reales dependen de CUÁNDO se aplicó la migración respecto
--   de B1.1 (20/08/2026):
--
--     · ANTES de B1.1 → nació con `anon = arwdDxtm`. Solo RLS la contiene.
--     · DESPUÉS       → nació sin privilegios para `anon`. Correcto.
--
--   ⚠️  NO VERIFICADO cuál de los dos. Esta migración cierra el caso en ambos:
--       el REVOKE es un no-op si no había nada que revocar.
--
-- POR QUÉ `authenticated` RECIBE GRANT EXPLÍCITO
--
--   Hoy lo hereda del default privilege, que DO-1 dejó vigente hasta Fase 2.
--   Declararlo explícito hace que la tabla deje de depender de ese default:
--   cuando Fase 2 lo revoque, `cajas_diarias` sigue funcionando.
--
--   Es la práctica que la guarda G-1 va a exigir a toda tabla nueva.
--
-- CONTENIDO SENSIBLE
--
--   Arqueo de caja: montos de apertura y cierre, diferencias. Información
--   financiera de la clínica. No debe ser alcanzable por `anon` ni siquiera
--   con RLS de por medio — defensa en profundidad.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON TABLE public.cajas_diarias FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cajas_diarias TO authenticated;
GRANT ALL                            ON TABLE public.cajas_diarias TO service_role;


-- ── Verificación ──
DO $$
BEGIN
    IF has_table_privilege('anon', 'public.cajas_diarias', 'SELECT') THEN
        RAISE EXCEPTION 'F1-7: anon conserva lectura sobre cajas_diarias';
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.cajas_diarias', 'SELECT') THEN
        RAISE EXCEPTION 'F1-7: authenticated perdió el SELECT sobre cajas_diarias — el módulo de caja deja de funcionar';
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid = 'public.cajas_diarias'::regclass) THEN
        RAISE EXCEPTION 'F1-7: cajas_diarias no tiene RLS habilitada';
    END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN MANUAL POSTERIOR — obligatoria
--
--   El módulo de caja diaria debe seguir funcionando: abrir caja, registrar
--   movimientos, cerrar con arqueo. Si algo falla, es que `authenticated`
--   necesita un privilegio que este GRANT no cubre.
--
-- ROLLBACK
--
--   GRANT ALL ON TABLE public.cajas_diarias TO anon;
--
--   Solo restaura el acceso de anon. Los GRANT a authenticated y service_role
--   se dejan: son correctos con o sin esta migración.
-- ═══════════════════════════════════════════════════════════════════════════
