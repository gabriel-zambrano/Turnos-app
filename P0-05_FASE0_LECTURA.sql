-- ═══════════════════════════════════════════════════════════════════════════
-- P0-05 · FASE 0 — DIAGNÓSTICO DE SOLO LECTURA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Resuelve los bloqueantes A-1, A-2, A-3 y A-7 de P0-05_FASE1_REVISION_CRITICA.md
--
-- ESTE SCRIPT NO MODIFICA NADA.
--   · Ningún CREATE, ALTER, DROP, GRANT, REVOKE.
--   · Ningún INSERT, UPDATE, DELETE.
--   · Ningún objeto temporal.
--   · Solo SELECT sobre catálogos del sistema y sobre datos propios.
--
-- Se puede correr entero o bloque por bloque en el SQL Editor de Supabase.
-- Cada bloque devuelve su propio resultado; copiámelos tal cual.
--
-- NOTA: el test de integración de §6.4 de la revisión (que crea una función y
-- una tabla de prueba) NO está acá a propósito. Ese crea objetos, así que no
-- pertenece a una etapa de solo lectura. Va después de aplicar B1.1.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- A-1 · DEFINICIÓN VIVA DE LAS FUNCIONES
-- ───────────────────────────────────────────────────────────────────────────
-- Por qué: hay 20 archivos .sql sueltos en la raíz del repositorio que se
-- aplicaron a mano. El repositorio NO es fuente de verdad. Antes de hacer
-- CREATE OR REPLACE sobre fn_ajustar_puntos_manual o fn_canjear_premio hay que
-- saber qué cuerpo corre hoy — si difiere, el REPLACE pisaría lógica viva y el
-- rollback restauraría la versión equivocada.

-- A-1.1 · Inventario: qué funciones existen, cuáles son SECURITY DEFINER,
--         y con qué search_path corren.
SELECT
    p.proname                                          AS funcion,
    pg_get_function_identity_arguments(p.oid)          AS argumentos,
    p.prosecdef                                        AS es_security_definer,
    pg_get_userbyid(p.proowner)                        AS dueno,
    l.lanname                                          AS lenguaje,
    coalesce(array_to_string(p.proconfig, ', '), '(sin search_path fijo)')
                                                       AS config,
    md5(pg_get_functiondef(p.oid))                     AS huella_definicion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language  l ON l.oid = p.prolang
WHERE n.nspname = 'public'
ORDER BY p.prosecdef DESC, p.proname;

-- Esperado según el repositorio: 14 funciones, TODAS con es_security_definer = true,
-- dueño 'postgres', y search_path fijo en 'public, pg_temp'.
-- Cualquier función que NO aparezca en esa lista, o cualquier search_path vacío,
-- es un hallazgo nuevo.


-- A-1.2 · Cuerpo completo de las dos funciones que va a tocar la Fase 2.
--         GUARDAR ESTE RESULTADO. Es el rollback de B1.2 y B1.3.
SELECT
    p.proname                  AS funcion,
    pg_get_functiondef(p.oid)  AS definicion_completa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_ajustar_puntos_manual', 'fn_canjear_premio')
ORDER BY p.proname;

-- Comparar contra:
--   supabase/migrations/20260722120000_remote_schema.sql
--   supabase_migration_sprint_5_fidelizacion.sql
-- Ya verifiqué que esas dos copias solo difieren en formato. Falta saber si
-- alguna de las dos es la que efectivamente corre.


-- ───────────────────────────────────────────────────────────────────────────
-- A-2 · ACL VIVO
-- ───────────────────────────────────────────────────────────────────────────
-- Por qué: todo el análisis de privilegios salió de leer el dump. El dump es de
-- julio y hubo cambios manuales después (entre ellos el REVOKE de las vistas bi_*
-- que aplicamos el 09/08). Hay que ver el ACL real.
--
-- Cómo leer las letras del ACL:  r=SELECT  a=INSERT  w=UPDATE  d=DELETE
--                                D=TRUNCATE  x=REFERENCES  t=TRIGGER  m=MAINTAIN
--                                X=EXECUTE
-- Formato: destinatario=privilegios/otorgante.  Un "=r/postgres" sin destinatario
-- a la izquierda del '=' significa PUBLIC — es decir, todo el mundo.

-- A-2.1 · Las 12 tablas que NO tienen GRANT explícito en ninguna migración.
--         Si aparece 'anon=' con cualquier letra, el default privilege se las
--         concedió y solo RLS las protege.
SELECT
    c.relname                                       AS tabla,
    c.relrowsecurity                                AS rls_activa,
    c.relforcerowsecurity                           AS rls_forzada,
    (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS politicas,
    coalesce(array_to_string(c.relacl, E'\n'), '(ACL nulo = solo el dueño)')
                                                    AS acl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
        'pagos', 'facturas', 'factura_items', 'factura_pagos',
        'tratamiento_items', 'arca_config', 'consentimientos_firmados',
        'plantillas_consentimiento', 'crm_campanas', 'crm_envios',
        'enlaces_turno', 'ingresos_manuales_duplicados_respaldo'
      )
ORDER BY c.relname;


-- A-2.2 · TODAS las relaciones de public: qué puede tocar anon.
--         Esta es la consulta que habría encontrado P0-07 antes de que pasara.
SELECT
    c.relname                                       AS objeto,
    CASE c.relkind WHEN 'r' THEN 'tabla'
                   WHEN 'v' THEN 'vista'
                   WHEN 'm' THEN 'vista materializada'
                   WHEN 'p' THEN 'tabla particionada'
                   ELSE c.relkind::text END         AS tipo,
    c.relrowsecurity                                AS rls_activa,
    (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS politicas,
    has_table_privilege('anon',          c.oid, 'SELECT') AS anon_lee,
    has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_lee,
    has_table_privilege('anon',          c.oid, 'INSERT')
      OR has_table_privilege('anon',     c.oid, 'UPDATE')
      OR has_table_privilege('anon',     c.oid, 'DELETE') AS anon_escribe
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'v', 'm', 'p')
ORDER BY anon_lee DESC, c.relrowsecurity, c.relname;

-- ALERTA ROJA: cualquier fila con anon_lee = true Y (rls_activa = false O politicas = 0).
-- Ese es exactamente el patrón que expuso $35.341.190 en las vistas bi_*.
-- Excepción conocida y aceptada: tenants_public.


-- A-2.3 · Tablas de public SIN RLS. Debería devolver CERO filas.
SELECT c.relname AS tabla_sin_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY c.relname;


-- A-2.4 · Tablas CON RLS pero SIN políticas.
--         No es un error: RLS sin políticas deniega todo (falla cerrada).
--         Se espera enlaces_turno acá. Cualquier otra, revisar.
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = c.oid)
ORDER BY c.relname;


-- A-2.5 · ACL de las funciones. Busca las ejecutables por PUBLIC o por anon.
SELECT
    p.proname                                       AS funcion,
    p.prosecdef                                     AS security_definer,
    has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_ejecuta,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ejecuta,
    coalesce(array_to_string(p.proacl, E'\n'), '(ACL nulo = EXECUTE para PUBLIC)')
                                                    AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY anon_ejecuta DESC, p.proname;

-- Esperado: la ÚNICA con anon_ejecuta = true debería ser generar_codigo_enlace
-- (hallazgo R-5: es SECURITY DEFINER y es la única sin REVOKE FROM PUBLIC).
-- Si aparece cualquier otra, es un bypass que no está en el inventario.


-- A-2.6 · Los ALTER DEFAULT PRIVILEGES que están REALMENTE activos.
--         Todo el hallazgo del diseño salió de leer el dump. Esto lo confirma.
SELECT
    pg_get_userbyid(d.defaclrole)                   AS rol_creador,
    n.nspname                                       AS esquema,
    CASE d.defaclobjtype WHEN 'r' THEN 'TABLAS y VISTAS'
                         WHEN 'S' THEN 'SECUENCIAS'
                         WHEN 'f' THEN 'FUNCIONES'
                         WHEN 'T' THEN 'TIPOS'
                         ELSE d.defaclobjtype::text END AS tipo_objeto,
    array_to_string(d.defaclacl, E'\n')             AS privilegios_por_defecto
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY n.nspname, tipo_objeto, rol_creador;

-- Esperado según el repositorio: 12 statements para el rol postgres en public.
-- Los tres que importan son  anon=arwdDxt  sobre TABLAS y VISTAS,
-- y  anon=X / authenticated=X  sobre FUNCIONES.


-- ───────────────────────────────────────────────────────────────────────────
-- A-3 · DISTRIBUCIÓN DE historial_puntos
-- ───────────────────────────────────────────────────────────────────────────
-- Por qué: no voy a proponer un límite para fn_ajustar_puntos_manual sin ver
-- los datos. Cualquier percentil que escribiera sería inventado.

-- A-3.1 · Distribución de los ajustes manuales.
SELECT
    count(*)                                                     AS total_ajustes,
    max(abs(puntos_afectados))                                   AS maximo,
    round(avg(abs(puntos_afectados)))                            AS promedio,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY abs(puntos_afectados)) AS p50,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY abs(puntos_afectados)) AS p90,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY abs(puntos_afectados)) AS p95,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY abs(puntos_afectados)) AS p99,
    count(*) FILTER (WHERE abs(puntos_afectados) >  100)         AS mayores_100,
    count(*) FILTER (WHERE abs(puntos_afectados) >  250)         AS mayores_250,
    count(*) FILTER (WHERE abs(puntos_afectados) >  500)         AS mayores_500,
    count(*) FILTER (WHERE abs(puntos_afectados) > 1000)         AS mayores_1000
FROM historial_puntos
WHERE tipo_movimiento IN ('ajuste_manual', 'ajuste_reverso');


-- A-3.2 · Los 20 ajustes más grandes, con su nota.
--         Sirve para juzgar si un ajuste grande fue legítimo.
SELECT
    creado_en::date                                  AS fecha,
    tipo_movimiento,
    puntos_afectados,
    puntos_afectados * 50                            AS equivale_ars_al_canjear,
    saldo_resultante,
    left(coalesce(nota, '(sin nota)'), 90)           AS nota
FROM historial_puntos
WHERE tipo_movimiento IN ('ajuste_manual', 'ajuste_reverso')
ORDER BY abs(puntos_afectados) DESC
LIMIT 20;

-- El factor 50 es ars_valor_canje por defecto. A-3.5 confirma el valor real.


-- A-3.3 · Cuántos ajustes vienen sin nota útil.
--         La función actual hace COALESCE(p_nota, 'Ajuste manual de puntos'),
--         o sea que INVENTA la nota cuando llega NULL. Por eso hay que contar
--         también ese texto exacto: hoy no se distingue de "no puso nota".
SELECT
    count(*)                                                     AS total,
    count(*) FILTER (WHERE nota IS NULL)                         AS nota_nula,
    count(*) FILTER (WHERE trim(coalesce(nota,'')) = '')         AS nota_vacia,
    count(*) FILTER (WHERE nota = 'Ajuste manual de puntos')     AS nota_autogenerada,
    count(*) FILTER (WHERE nota IS NOT NULL
                       AND trim(nota) <> ''
                       AND nota <> 'Ajuste manual de puntos')    AS nota_real
FROM historial_puntos
WHERE tipo_movimiento IN ('ajuste_manual', 'ajuste_reverso');

-- 'nota_real' es cuántos ajustes históricos pasarían el filtro si la nota
-- se vuelve obligatoria (decisión DO-3).


-- A-3.4 · Magnitud comparativa: cuánto se otorga por cada vía.
--         Si las cargas iniciales usaron 'migracion_inicial' en vez de
--         'ajuste_manual', el límite puede ser bastante más bajo.
SELECT
    tipo_movimiento,
    count(*)                            AS movimientos,
    max(abs(puntos_afectados))          AS maximo,
    round(avg(abs(puntos_afectados)))   AS promedio,
    min(creado_en)::date                AS desde,
    max(creado_en)::date                AS hasta
FROM historial_puntos
GROUP BY tipo_movimiento
ORDER BY count(*) DESC;


-- A-3.5 · Parámetros económicos vigentes por clínica.
SELECT
    tenant_id,
    ars_por_punto        AS ars_para_ganar_1_punto,
    ars_valor_canje      AS ars_que_vale_1_punto_al_canjear,
    racha_bonus_puntos   AS mayor_otorgamiento_automatico,
    racha_objetivo
FROM config_fidelizacion;


-- A-3.6 · Quién viene haciendo los ajustes.
--         Con dos usuarios ambos 'admin', esperamos poca dispersión.
SELECT
    aprobado_por_usuario_id,
    count(*)                            AS ajustes,
    max(abs(puntos_afectados))          AS maximo,
    sum(puntos_afectados)               AS neto_otorgado
FROM historial_puntos
WHERE tipo_movimiento IN ('ajuste_manual', 'ajuste_reverso')
GROUP BY aprobado_por_usuario_id
ORDER BY count(*) DESC;


-- ───────────────────────────────────────────────────────────────────────────
-- A-7 · ¿presupuestos BLOQUEA EL BORRADO DE PACIENTES?
-- ───────────────────────────────────────────────────────────────────────────
-- Por qué: presupuestos.paciente_id referencia pacientes(id) SIN acción de
-- borrado. Si hay filas, el DELETE falla con error de FK y la UI muestra
-- "Error al eliminar: ...". El borrado ya estaría roto en producción.
-- Esto también invalida los tests #19-20 del diseño, que asumían que
-- owner/admin SIEMPRE pueden borrar.

-- A-7.1 · Confirmar la acción de la FK en la base viva.
SELECT
    c.conname                                        AS restriccion,
    src.relname                                      AS tabla_origen,
    tgt.relname                                      AS tabla_destino,
    CASE c.confdeltype WHEN 'a' THEN 'NO ACTION (bloquea)'
                       WHEN 'r' THEN 'RESTRICT (bloquea)'
                       WHEN 'c' THEN 'CASCADE'
                       WHEN 'n' THEN 'SET NULL'
                       WHEN 'd' THEN 'SET DEFAULT' END AS al_borrar_el_destino
FROM pg_constraint c
JOIN pg_class src ON src.oid = c.conrelid
JOIN pg_class tgt ON tgt.oid = c.confrelid
WHERE c.contype = 'f'
  AND tgt.relname IN ('pacientes', 'citas')
ORDER BY al_borrar_el_destino, src.relname;

-- Esperado del repositorio: presupuestos con NO ACTION;
-- consentimientos_firmados y crm_envios con SET NULL (sobreviven con PII);
-- el resto CASCADE.


-- A-7.2 · Cuántos pacientes NO se pueden borrar hoy.
SELECT
    (SELECT count(*) FROM pacientes)                       AS pacientes_total,
    (SELECT count(DISTINCT paciente_id) FROM presupuestos) AS pacientes_bloqueados,
    (SELECT count(*) FROM presupuestos)                    AS filas_presupuestos;


-- A-7.3 · Qué sobreviviría hoy a un borrado, en volumen.
SELECT 'consentimientos_firmados (sobrevive con PII)' AS tabla,
       count(*) AS filas, count(paciente_id) AS con_paciente_vinculado
FROM consentimientos_firmados
UNION ALL
SELECT 'crm_envios (sobrevive)', count(*), count(paciente_id) FROM crm_envios
UNION ALL
SELECT 'facturas (sobrevive, cita_id SET NULL)', count(*), count(cita_id) FROM facturas;

-- Si 'con_paciente_vinculado' < 'filas' ya hay filas desvinculadas, o sea que
-- ya se borraron pacientes y quedaron estos rastros.


-- A-7.4 · Volumen que se destruiría. Contexto para la decisión DO-5.
SELECT 'citas'              AS tabla, count(*) AS filas FROM citas
UNION ALL SELECT 'historial_dental',   count(*) FROM historial_dental
UNION ALL SELECT 'paciente_fotos',     count(*) FROM paciente_fotos
UNION ALL SELECT 'historial_puntos',   count(*) FROM historial_puntos
UNION ALL SELECT 'pagos',              count(*) FROM pagos
UNION ALL SELECT 'tratamiento_items',  count(*) FROM tratamiento_items
UNION ALL SELECT 'recordatorios_log',  count(*) FROM recordatorios_log
ORDER BY filas DESC;


-- ───────────────────────────────────────────────────────────────────────────
-- EXTRA · ESTADO DE tenant_users  (insumo para las decisiones de owner)
-- ───────────────────────────────────────────────────────────────────────────
-- Precondición de B1.5a y evidencia para DO-6 (modelo owner vs odontologo).

SELECT
    role,
    count(*)                       AS usuarios,
    count(DISTINCT tenant_id)      AS clinicas,
    min(creado_en)::date           AS desde
FROM tenant_users
GROUP BY role
ORDER BY count(*) DESC;

-- Esperado: solo 'admin'. Cualquier otro valor (incluido '' o mayúsculas
-- distintas) confirmaría el hallazgo R-2: role se inserta sin whitelist desde
-- /api/equipo/invitar, así que puede contener texto arbitrario.


-- El DEFAULT vigente de la columna.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tenant_users'
ORDER BY ordinal_position;

-- Esperado: role text NOT NULL DEFAULT 'admin'::text, y ningún CHECK.
-- Ese default es el hueco que cierra B1.5a: una fila insertada sin role
-- nace administradora.


-- ═══════════════════════════════════════════════════════════════════════════
-- FIN. Nada de lo anterior modificó el estado de la base.
-- ═══════════════════════════════════════════════════════════════════════════
