-- ── RECALL CLÍNICO ──
-- Intervalo de control por tratamiento: cada cuántos meses el paciente debería
-- volver para control tras haberse hecho ese tratamiento.
-- NULL = el tratamiento no genera recall (ej. una urgencia puntual).
ALTER TABLE tratamientos ADD COLUMN IF NOT EXISTS meses_control INTEGER;

-- Sugerencias iniciales por nombre habitual (solo si no estaba configurado).
-- El profesional puede ajustarlas desde la pantalla de Precios/Tratamientos.
UPDATE tratamientos SET meses_control = 6
  WHERE meses_control IS NULL AND (
    lower(nombre) LIKE '%limpieza%' OR lower(nombre) LIKE '%control%' OR
    lower(nombre) LIKE '%profilaxis%' OR lower(nombre) LIKE '%higiene%'
  );
UPDATE tratamientos SET meses_control = 1
  WHERE meses_control IS NULL AND lower(nombre) LIKE '%ortodoncia%';
