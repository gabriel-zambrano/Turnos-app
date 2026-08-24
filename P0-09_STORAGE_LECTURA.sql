-- ═══════════════════════════════════════════════════════════════════════════
-- P0-09 · Auditoría de Supabase Storage — SOLO LECTURA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Todas las sentencias son SELECT. No modifican nada. Se pueden correr en
-- producción sin riesgo y sin ventana.
--
-- POR QUÉ ESTE BLOQUE EXISTE
--
--   Storage nunca se auditó. Ahí viven las fotos clínicas de los pacientes:
--   imágenes médicas asociadas a una persona identificable. No sabemos si las
--   policies están bien NI si están mal — que son dos estados distintos, y el
--   segundo al menos se puede arreglar.
--
--   `src/lib/storage.ts` afirma en un comentario que el bucket "ahora es
--   privado". Eso es una afirmación del REPOSITORIO. Este script existe para
--   convertirla en evidencia de PRODUCCIÓN o desmentirla.
--
-- CÓMO CORRERLO
--
--   SQL Editor → pegar UNA consulta por vez → "No limit" → pasar resultado.
--   Numeradas S-1 a S-8. El orden importa: S-1 puede volver todo lo demás
--   irrelevante.
--
-- ⚠️  Las rutas contienen UUIDs de pacientes, no nombres. Aun así, no pegar
--     resultados crudos en ningún lado público.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- S-1 · ¿Los buckets son públicos?
--
-- LA CONSULTA MÁS IMPORTANTE DEL BLOQUE. Si `public = true`, las policies de
-- storage.objects NO protegen la lectura: cualquiera con la URL descarga el
-- archivo, sin token, sin sesión, sin pertenecer al tenant. Para fotos
-- clínicas eso es una fuga de datos médicos.
--
-- Esperado: fotos_clinicas → false.
-- ───────────────────────────────────────────────────────────────────────────
SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
FROM storage.buckets
ORDER BY name;


-- ───────────────────────────────────────────────────────────────────────────
-- S-2 · ¿RLS está activo sobre storage.objects?
--
-- Si `rls_activo` es false, las policies de S-3 son decorativas: no se evalúa
-- ninguna.
-- ───────────────────────────────────────────────────────────────────────────
SELECT c.relname AS tabla,
       c.relrowsecurity  AS rls_activo,
       c.relforcerowsecurity AS force_rls,
       pg_get_userbyid(c.relowner) AS dueno
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage'
ORDER BY c.relname;


-- ───────────────────────────────────────────────────────────────────────────
-- S-3 · Las policies, completas
--
-- Acá se lee si el aislamiento por tenant existe. Con rutas
-- `<tenant_id>/<paciente_id>/<archivo>`, una policy correcta compara el primer
-- segmento contra los tenants del usuario, típicamente con
-- `(storage.foldername(name))[1]`.
--
-- Señales de alarma:
--   - `qual` = 'true'                → cualquiera autenticado ve todo
--   - `roles` incluye 'anon'         → sin sesión
--   - no se menciona tenant_id       → no hay aislamiento entre clínicas
--   - cmd = 'ALL' con qual laxo      → también escribe y borra
-- ───────────────────────────────────────────────────────────────────────────
SELECT policyname, tablename, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, cmd, policyname;


-- ───────────────────────────────────────────────────────────────────────────
-- S-4 · Privilegios de tabla sobre el esquema storage
--
-- B1.6 revocó `anon` del esquema `public`. NO tocó `storage`: es otro esquema
-- y quedó fuera de aquel DO loop. Esta consulta dice si ahí quedó algo abierto.
-- ───────────────────────────────────────────────────────────────────────────
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'storage'
  AND grantee IN ('anon', 'authenticated', 'public', 'PUBLIC')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;


-- ───────────────────────────────────────────────────────────────────────────
-- S-5 · Estructura real de las rutas
--
-- Una policy solo puede aislar por tenant si la ruta EMPIEZA con el tenant_id.
-- Si el primer segmento es cualquier otra cosa, no hay nada contra qué comparar
-- y el aislamiento es imposible de escribir, por buena que sea la intención.
-- ───────────────────────────────────────────────────────────────────────────
SELECT bucket_id,
       (storage.foldername(name))[1] AS primer_segmento,
       ((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-') AS parece_uuid,
       count(*) AS archivos,
       pg_size_pretty(sum(coalesce((metadata->>'size')::bigint, 0))) AS peso
FROM storage.objects
GROUP BY 1, 2, 3
ORDER BY archivos DESC;


-- ───────────────────────────────────────────────────────────────────────────
-- S-6 · ¿Esos primeros segmentos son tenants reales?
--
-- Un UUID con forma de UUID no es un tenant. Si aparecen huérfanos, son
-- archivos que ninguna policy basada en `tenant_users` va a alcanzar — ni para
-- permitir ni para denegar.
-- ───────────────────────────────────────────────────────────────────────────
SELECT o.bucket_id,
       CASE WHEN t.id IS NOT NULL THEN 'tenant real' ELSE 'HUÉRFANO' END AS estado,
       count(*) AS archivos
FROM storage.objects o
LEFT JOIN tenants t
  ON t.id::text = (storage.foldername(o.name))[1]
GROUP BY 1, 2
ORDER BY 1, 2;


-- ───────────────────────────────────────────────────────────────────────────
-- S-7 · URLs públicas legadas todavía guardadas en la base
--
-- `storage.ts` dice que el bucket era público y se guardaba la URL pública en
-- `paciente_fotos.url`. Si esas filas siguen ahí:
--   - con bucket privado → las fotos viejas no se ven (defecto funcional)
--   - con bucket público → siguen siendo accesibles por cualquiera (fuga)
--
-- Cuenta agregada: no devuelve ninguna URL.
-- ───────────────────────────────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE url LIKE '%/object/public/%') AS publicas_legadas,
       count(*) FILTER (WHERE url LIKE '%/object/sign/%')   AS firmadas,
       count(*) FILTER (WHERE url NOT LIKE 'http%')          AS rutas_relativas,
       count(*)                                              AS total
FROM paciente_fotos;


-- ───────────────────────────────────────────────────────────────────────────
-- S-8 · Fotos huérfanas en los dos sentidos
--
-- Objetos en Storage sin fila en `paciente_fotos` = archivos que sobrevivieron
-- al borrado de un paciente. Filas sin objeto = imágenes rotas en la ficha.
--
-- El primer número es el que importa: son datos clínicos de pacientes que se
-- creen eliminados.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM storage.objects o
     WHERE o.bucket_id = 'fotos_clinicas'
       AND NOT EXISTS (
         SELECT 1 FROM paciente_fotos f
         WHERE f.url LIKE '%' || o.name OR f.url = o.name
       )) AS objetos_sin_fila,
  (SELECT count(*) FROM paciente_fotos f
     WHERE NOT EXISTS (
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'fotos_clinicas'
         AND (f.url LIKE '%' || o.name OR f.url = o.name)
     )) AS filas_sin_objeto;
