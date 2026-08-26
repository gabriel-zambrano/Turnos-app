-- ═══════════════════════════════════════════════════════════════════════════
-- P0-09 · Storage · Aislamiento del bucket `logos` y privilegios del esquema
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ✅ APLICADA EN PRODUCCIÓN — 25/08/2026, vía `supabase db push`.
--
--    Verificado después, contra pg_policies de producción:
--      8 policies en el esquema storage
--        · 4 fotos_*_tenant      {authenticated}
--        · 3 logos_*_tenant      {authenticated}   ← antes {public} con auth.role()
--        · 1 "Logos public access"  SELECT {public}
--      logos           5 MB · jpeg, png, webp
--      fotos_clinicas 10 MB · jpeg, png, webp
--
--    Probada antes con `npx supabase db reset` sobre base limpia. Ese reset
--    encontró tres defectos que en producción habrían quedado invisibles,
--    porque el estado previo los tapaba. Están descritos abajo.
--
-- QUÉ NO SE TOCA
--
--   Las cuatro policies de `fotos_clinicas` quedan intactas. Están bien:
--   comparan (storage.foldername(name))[1] contra los tenants del usuario, en
--   las cuatro operaciones, con roles = {authenticated}. No hay nada que
--   mejorar ahí y tocarlas sería riesgo sin beneficio.
--
-- QUÉ CORRIGE — y en qué orden de gravedad real
--
--   H-3 🔴 ACTIVO · `logos` no aísla por tenant. Cualquier usuario autenticado
--          de cualquier clínica podía borrar o pisar el logo de otra, con el
--          cliente normal: supabase.storage.from('logos').remove([...]).
--
--   H-4 🔴 ACTIVO · Ningún bucket limita tipo ni tamaño. La única validación
--          era `file.type.startsWith('image/')` en el navegador — que además
--          acepta image/svg+xml, y un SVG ejecuta JavaScript. En un bucket
--          PÚBLICO eso es alojar contenido arbitrario en tu dominio.
--
--   H-2 🟡 LATENTE · La policy "Logos update" no tenía USING. Con USING nulo
--          una policy permisiva no restringe QUÉ fila se actualiza: solo el
--          WITH CHECK limitaba el resultado. Un UPDATE podía tomar la foto
--          clínica de otro tenant y moverla a `logos`, que es público.
--
--   H-1 🟡 LATENTE · `anon` tenía DELETE/INSERT/UPDATE/TRUNCATE sobre
--          storage.objects y storage.buckets. Es R-1 en el esquema `storage`,
--          que B1.6 no recorrió.
--
--   Latente = la falla existe, pero `storage` NO está expuesto en PostgREST.
--   Verificado el 22/08: HTTP 406 con Accept-Profile: storage. No hay puerta
--   desde internet. Se corrige igual: la exposición es una casilla de
--   configuración que alguien puede marcar sin saber lo que hay detrás.
--
-- POR QUÉ EL AISLAMIENTO DE `logos` NO PUEDE COPIAR EL DE `fotos_clinicas`
--
--   Las rutas son estructuralmente distintas:
--
--     fotos_clinicas:  <tenant_id>/<paciente_id>/<archivo>
--     logos:           tenant-logos/<tenant_id>-<random>.<ext>
--
--   En logos el primer segmento es la constante 'tenant-logos'. El tenant vive
--   en el PREFIJO DEL NOMBRE DE ARCHIVO. Copiar foldername()[1] habría dejado
--   a todas las clínicas sin poder subir su logo.
--
--   Y no sirve split_part(filename, '-', 1): un UUID contiene guiones. Por eso
--   se compara con LIKE contra el tenant_id completo.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- H-0 🔴 · VERSIONAR las policies de `fotos_clinicas`
--
-- HALLAZGO DEL 25/08, encontrado por un `supabase db reset`:
--
--   Las 4 policies de `fotos_clinicas` NO ESTABAN EN NINGUNA MIGRACIÓN.
--   Existían únicamente en producción, creadas a mano desde el dashboard.
--
--   Consecuencia: una base reconstruida desde las migraciones —un `db reset`,
--   un entorno de staging, una restauración de backup sobre esquema limpio—
--   se levanta con las fotos clínicas SIN NINGÚN AISLAMIENTO POR TENANT.
--
--   Es más grave que el problema de `logos` que esta migración vino a
--   corregir: son imágenes médicas asociadas a una persona identificable.
--
-- POR QUÉ `IF NOT EXISTS` Y NO `DROP` + `CREATE`
--
--   En producción estas policies YA existen y son correctas —verificado el
--   22/08, consulta S-3—. Borrarlas para recrearlas abriría una ventana sin
--   protección, aunque sea breve. Acá solo se crean donde faltan.
--
--   Las definiciones son COPIA EXACTA de lo que devolvió `pg_policies` en
--   producción. No se rediseñó nada: se versionó lo que ya funciona.
-- ═══════════════════════════════════════════════════════════════════════════

DO $fotos$
DECLARE
  -- La condición de pertenencia, idéntica en las cuatro.
  c_tenant CONSTANT text :=
    '(bucket_id = ''fotos_clinicas''::text AND (storage.foldername(name))[1] IN ' ||
    '(SELECT (tenant_users.tenant_id)::text FROM tenant_users ' ||
    ' WHERE tenant_users.user_id = (SELECT auth.uid())))';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='storage' AND policyname='fotos_select_tenant') THEN
    EXECUTE format('CREATE POLICY fotos_select_tenant ON storage.objects
                    FOR SELECT TO authenticated USING (%s)', c_tenant);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='storage' AND policyname='fotos_insert_tenant') THEN
    EXECUTE format('CREATE POLICY fotos_insert_tenant ON storage.objects
                    FOR INSERT TO authenticated WITH CHECK (%s)', c_tenant);
  END IF;

  -- UPDATE lleva USING y WITH CHECK. En producción el WITH CHECK está en NULL,
  -- lo que hace que PostgreSQL reutilice el USING — correcto, pero implícito.
  -- Acá va explícito: el destino de la fila también tiene que ser del tenant.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='storage' AND policyname='fotos_update_tenant') THEN
    EXECUTE format('CREATE POLICY fotos_update_tenant ON storage.objects
                    FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
                   c_tenant, c_tenant);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='storage' AND policyname='fotos_delete_tenant') THEN
    EXECUTE format('CREATE POLICY fotos_delete_tenant ON storage.objects
                    FOR DELETE TO authenticated USING (%s)', c_tenant);
  END IF;
END $fotos$;


-- ── H-3 + H-2 · Reescribir las tres policies de escritura de `logos` ──
--
-- Se reemplazan, no se editan: no existe ALTER POLICY que agregue USING.

DROP POLICY IF EXISTS "Logos insert" ON storage.objects;
DROP POLICY IF EXISTS "Logos update" ON storage.objects;
DROP POLICY IF EXISTS "Logos delete" ON storage.objects;

-- La lectura NO se toca: `logos` es público a propósito — el logo aparece en
-- el portal del paciente, que no tiene sesión.
--   "Logos public access" · SELECT · qual: (bucket_id = 'logos')


CREATE POLICY "logos_insert_tenant" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = 'tenant-logos'
  AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND storage.filename(name) LIKE tu.tenant_id::text || '-%'
  )
);

CREATE POLICY "logos_update_tenant" ON storage.objects
FOR UPDATE TO authenticated
-- USING explícito: define QUÉ fila se puede tomar. Su ausencia era H-2.
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND storage.filename(name) LIKE tu.tenant_id::text || '-%'
  )
)
-- WITH CHECK: define en qué se puede convertir. Ambos son necesarios; con uno
-- solo, o se toma cualquier fila, o se la deja en cualquier lado.
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = 'tenant-logos'
  AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND storage.filename(name) LIKE tu.tenant_id::text || '-%'
  )
);

CREATE POLICY "logos_delete_tenant" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND storage.filename(name) LIKE tu.tenant_id::text || '-%'
  )
);

-- Nota sobre logos heredados: si alguno no sigue `<tenant_id>-...`, su clínica
-- no va a poder borrarlo. NO deja de verse — la lectura pasa por "Logos public
-- access", que solo mira bucket_id. El efecto es no poder limpiar un archivo
-- viejo, no perder el logo.


-- ── H-1 · Sacar a `anon` del esquema storage ──
--
-- Mismo criterio que B1.6 sobre `public`. `authenticated` conserva lo que
-- necesita; el aislamiento real lo ponen las policies de arriba.

-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  ESTOS REVOKE NO VAN A TENER EFECTO. Se conservan documentados.
--
-- VERIFICADO el 25/08 contra una base local reconstruida:
--
--   ACL de storage.objects:  anon=arwdDxtm/supabase_storage_admin
--                                          ↑ el otorgante
--
--   En PostgreSQL, solo el OTORGANTE puede revocar un privilegio. Ese grant lo
--   hizo `supabase_storage_admin`, no `postgres`. Y PostgreSQL no falla al
--   revocar algo que no otorgaste: no hace nada, en silencio.
--
--   ¿Y asumir el rol?
--     SET ROLE supabase_storage_admin;
--     → ERROR: permission denied to set role "supabase_storage_admin"
--
--   Tampoco por el Dashboard: su UI de Storage gestiona POLICIES, no GRANT de
--   tabla.
--
-- QUÉ SIGNIFICA ESO
--
--   Que `anon` tenga privilegios de tabla sobre `storage.objects` NO es una
--   configuración mal hecha de este proyecto: **es cómo Supabase entrega todos
--   sus proyectos.** El diseño de la plataforma asume que el control de acceso
--   a Storage son las POLICIES —las que esta migración sí arregla— y no los
--   privilegios de tabla.
--
--   Sumado a que el esquema `storage` no está expuesto en PostgREST
--   —verificado el 22/08, HTTP 406 con Accept-Profile: storage—, no hay
--   camino desde internet hacia esos privilegios.
--
--   Reclasificado: de "riesgo latente pendiente" a **diseño de la plataforma,
--   no accionable, mitigado por RLS**. No queda como TODO abierto, porque no
--   hay forma de cerrarlo.
--
-- POR QUÉ SE DEJAN LAS SENTENCIAS
--
--   Si Supabase cambia esto algún día, o si el proyecto migra a Postgres
--   autogestionado, el REVOKE pasa a tener efecto y ya está escrito. Cuestan
--   cero y documentan la intención.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `FROM PUBLIC` además de `FROM anon` — es la lección de R-11.
--
--   Un `REVOKE ... FROM anon` NO quita un privilegio que `anon` hereda de
--   `PUBLIC`: son dos mecanismos distintos. Y `has_table_privilege('anon', ...)`
--   devuelve true si el privilegio llega por cualquiera de los dos caminos.
--
--   La primera versión de esta migración revocaba solo a `anon` y el bloque de
--   verificación la rechazó en un `db reset`. El mismo error que R-11 documentó
--   en agosto, cometido de nuevo acá.
REVOKE ALL ON ALL TABLES IN SCHEMA storage FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA storage FROM anon;

-- Y ahora se devuelve, explícito, solo lo que cada rol necesita.
--
-- `authenticated` opera sobre objects a través de las policies de arriba: sin
-- estos privilegios de tabla, las policies no llegan a evaluarse y Storage deja
-- de funcionar para todos los usuarios con sesión.
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;

-- `anon` solo necesita resolver el bucket del logo en el portal del paciente.
GRANT SELECT ON storage.buckets TO anon;


-- ── H-4 · Límites de tipo y tamaño ──
--
-- DECISIÓN DEL OWNER: los valores. Estos son una propuesta.
--
--   SVG queda AFUERA a propósito. Un SVG puede contener <script>, y `logos` es
--   público: subir uno equivale a alojar JavaScript en tu dominio. La UI hoy
--   lo ofrece ("JPG, PNG, SVG") — ese texto habría que corregirlo aparte.
--
--   Los tres MIME coinciden con FORMATOS_IMAGEN_WEB de src/lib/storage.ts.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit    = 5242880       -- 5 MB
WHERE id = 'logos';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit    = 10485760      -- 10 MB · fotos clínicas de cámara
WHERE id = 'fotos_clinicas';


-- ── Verificación ──
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'storage' AND policyname LIKE 'logos_%_tenant';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'P0-09: se esperaban 3 policies de logos, hay %', v_n;
  END IF;

  -- Las 4 de fotos_clinicas: en producción ya existían, en una base nueva las
  -- crea el bloque H-0. En ambos casos tienen que estar las cuatro.
  --
  -- La primera versión de esta migración las daba por existentes en vez de
  -- crearlas, y por eso reventaba en un `db reset`. Esa falla fue lo que
  -- reveló que nunca habían estado versionadas.
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'storage' AND policyname LIKE 'fotos_%_tenant';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'P0-09: se esperaban 4 policies de fotos_clinicas, hay %', v_n;
  END IF;

  -- Y las cuatro tienen que exigir pertenencia al tenant. Una policy que
  -- exista pero con `USING (true)` sería peor que no tenerla: da falsa calma.
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'storage' AND policyname LIKE 'fotos_%_tenant'
    AND coalesce(qual, with_check) LIKE '%tenant_users%';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'P0-09: solo % de 4 policies de fotos_clinicas filtran por tenant_users', v_n;
  END IF;

  -- ── Privilegios de `anon`: ADVERTENCIA, no excepción ──
  --
  -- Por qué no aborta:
  --
  --   `storage.objects` pertenece a `supabase_storage_admin`. PostgreSQL NO
  --   falla cuando revocás un privilegio que no otorgaste: simplemente no hace
  --   nada. Así que este REVOKE puede quedar sin efecto y no hay forma de
  --   forzarlo desde una migración que corre como `postgres`.
  --
  --   Y el riesgo es LATENTE, no activo: el esquema `storage` NO está expuesto
  --   en PostgREST —verificado el 22/08, HTTP 406 con Accept-Profile: storage—.
  --   Sin esa puerta, un privilegio de tabla sobre `storage.objects` no es
  --   alcanzable desde internet.
  --
  --   Abortar acá bloquearía las correcciones que SÍ son activas —el
  --   aislamiento de `logos` y el versionado de `fotos_clinicas`— por algo que
  --   quizá no se pueda arreglar por esta vía. El orden de prioridades quedaría
  --   al revés.
  --
  -- Si esta advertencia aparece, el arreglo va por Dashboard → Storage, o por
  -- un bloque con `SET ROLE supabase_storage_admin`. Queda anotado en el
  -- RELEASE-CHECKLIST, no silenciado.
  IF has_table_privilege('anon', 'storage.objects', 'DELETE') THEN
    RAISE WARNING 'P0-09: anon conserva DELETE sobre storage.objects. '
                  'El REVOKE no tuvo efecto — dueño: %. '
                  'Riesgo LATENTE: storage no está expuesto en PostgREST. '
                  'Corregir desde el Dashboard.',
                  (SELECT pg_get_userbyid(relowner) FROM pg_class
                    WHERE oid = 'storage.objects'::regclass);
  END IF;

  -- Esto sí aborta: si `authenticated` perdió el acceso, Storage deja de
  -- funcionar para todos los usuarios con sesión. Romper la app es peor que
  -- no cerrar un riesgo latente.
  IF NOT has_table_privilege('authenticated', 'storage.objects', 'SELECT') THEN
    RAISE EXCEPTION 'P0-09: authenticated perdió SELECT sobre storage.objects — Storage deja de funcionar';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  ADVERTENCIA 1 · ESTO PUEDE FALLAR POR PROPIEDAD
--
--   `storage.objects` pertenece a `supabase_storage_admin`, no a `postgres`.
--   Crear o borrar policies exige ser dueño. Si aparece:
--
--     ERROR: must be owner of table objects
--
--   NO forzar nada. Hay dos caminos:
--     a) Dashboard → Storage → Policies (la UI corre con el rol correcto)
--     b) SET ROLE supabase_storage_admin;  ... ;  RESET ROLE;
--
--   Los UPDATE sobre storage.buckets pueden fallar por lo mismo. La UI de
--   Storage → Settings del bucket los hace sin SQL.
--
-- ⚠️  ADVERTENCIA 2 · PROBAR ANTES EN LOCAL
--
--     npx supabase db reset      # aplica las 26 migraciones
--
--   Una policy mal escrita acá no filtra datos: **rompe la subida de logos y
--   de fotos clínicas**. Eso se nota enseguida y es lo que hay que verificar.
--
-- VERIFICACIÓN MANUAL POSTERIOR — obligatoria
--
--   1. Subir un logo desde Configuración → funciona
--   2. Subir una foto clínica a un paciente → funciona
--   3. Ver una foto ya cargada → sigue visible
--   4. Abrir el portal de un paciente sin sesión → el logo se ve
--   5. Intentar subir un .svg → ahora lo rechaza
--
--   El 3 y el 4 son los que detectan un aislamiento demasiado estricto.
--
-- ROLLBACK
--
--   DROP POLICY de las tres `logos_*_tenant` y recrear las tres originales
--   ("Logos insert", "Logos update", "Logos delete") tal como figuran en
--   P0-09_STORAGE_LECTURA.sql, resultado S-3 del 22/08. Los límites de MIME y
--   tamaño se revierten poniendo NULL en las dos columnas.
-- ═══════════════════════════════════════════════════════════════════════════
