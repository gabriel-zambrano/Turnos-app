-- ═══════════════════════════════════════════════════════════════════════════
-- P0-09 · Storage · Aislamiento del bucket `logos` y privilegios del esquema
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️  NO APLICADO. Leer las dos advertencias del final antes de ejecutar.
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

REVOKE ALL ON ALL TABLES IN SCHEMA storage FROM anon;
GRANT SELECT ON storage.buckets TO anon;   -- el portal público resuelve el logo

REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA storage FROM authenticated;


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

  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'storage' AND policyname LIKE 'fotos_%_tenant';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'P0-09: las 4 policies de fotos_clinicas debían quedar intactas, hay %', v_n;
  END IF;

  IF has_table_privilege('anon', 'storage.objects', 'DELETE') THEN
    RAISE EXCEPTION 'P0-09: anon sigue con DELETE sobre storage.objects';
  END IF;

  IF NOT has_table_privilege('authenticated', 'storage.objects', 'SELECT') THEN
    RAISE EXCEPTION 'P0-09: authenticated perdió SELECT — Storage deja de funcionar';
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
