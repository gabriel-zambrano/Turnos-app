-- ─────────────────────────────────────────────────────────────
-- ¿Qué migraciones están realmente aplicadas en producción?
--
-- El CLI perdió el historial porque varias migraciones se aplicaron a mano
-- pegando SQL en el dashboard. `supabase migration list` no sirve para
-- saberlo: solo lee la tabla de historial, que en esos casos está vacía.
--
-- Esto pregunta directo al esquema si el objeto que crea cada migración
-- existe o no. Correr en el SQL Editor de Supabase.
-- ─────────────────────────────────────────────────────────────

SELECT * FROM (
  VALUES
    ('20260723180351', 'arca',
     (SELECT count(*) > 0 FROM information_schema.tables
      WHERE table_name = 'arca_config')),

    ('20260723190856', 'consentimientos',
     (SELECT count(*) > 0 FROM information_schema.tables
      WHERE table_name = 'consentimientos_firmados')),

    ('20260724164544', 'recall',
     (SELECT count(*) > 0 FROM information_schema.columns
      WHERE table_name = 'tratamientos' AND column_name = 'meses_control')),

    ('20260724171401', 'crm_automatizacion',
     (SELECT count(*) > 0 FROM information_schema.tables
      WHERE table_name = 'crm_campanas')),

    ('20260724175226', 'cuidados',
     (SELECT count(*) > 0 FROM information_schema.columns
      WHERE table_name = 'tratamientos' AND column_name = 'cuidados_posteriores')),

    ('20260725090417', 'fix_branding',
     (SELECT count(*) > 0 FROM information_schema.column_privileges
      WHERE table_name = 'tenants' AND column_name = 'primarycolor'
        AND privilege_type = 'UPDATE' AND grantee = 'authenticated')),

    -- Esta solo hace UPDATE de datos, no cambia el esquema: se detecta
    -- mirando el dato en sí.
    ('20260727160536', 'duracion_blanqueamiento',
     (SELECT count(*) > 0 FROM tratamientos
      WHERE nombre ILIKE 'blanqueamiento' AND duracion_default = 80)),

    ('20260727170000', 'consentimiento_datos_paciente',
     (SELECT count(*) > 0 FROM information_schema.columns
      WHERE table_name = 'pacientes' AND column_name = 'consentimiento_datos_en')),

    ('20260727200000', 'reserva_online_avisos_y_sena',
     (SELECT count(*) > 0 FROM information_schema.columns
      WHERE table_name = 'citas' AND column_name = 'origen')),

    ('20260727210000', 'permiso_columnas_reserva_online',
     (SELECT count(*) > 0 FROM information_schema.column_privileges
      WHERE table_name = 'tenants' AND column_name = 'sena_reserva'
        AND privilege_type = 'UPDATE' AND grantee = 'authenticated')),

    ('20260804120000', 'pagos_y_multitratamiento',
     (SELECT count(*) > 0 FROM information_schema.tables
      WHERE table_name = 'tratamiento_items'))
) AS t(timestamp_migracion, nombre, aplicada)
ORDER BY timestamp_migracion;

-- Cómo leerlo:
--   aplicada = true  → marcarla con `supabase migration repair --status applied <ts>`
--   aplicada = false → dejarla para que la aplique `supabase db push`
--
-- La última (pagos_y_multitratamiento) tiene que dar false: es la nueva.

-- ── Control aparte: la duración del blanqueamiento ──
-- Es el único dato que `db push` pisaría si la re-aplicaras. Si acá ves un
-- valor distinto de 80 y es el que querés, anotalo antes de tocar nada.
SELECT te.nombre AS clinica, t.nombre AS tratamiento, t.duracion_default
FROM tratamientos t
JOIN tenants te ON te.id = t.tenant_id
WHERE t.nombre ILIKE '%blanqueamiento%';
