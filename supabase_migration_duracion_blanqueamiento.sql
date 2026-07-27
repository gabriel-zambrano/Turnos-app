-- ─────────────────────────────────────────────────────────────
-- Duración del blanqueamiento: 1 h 20 min
--
-- El blanqueamiento va acompañado de una limpieza dental, así que ocupa 80
-- minutos de agenda y no 60. Con la reserva online esto pasa a ser importante:
-- si la duración quedara corta, el sistema le ofrecería al paciente un horario
-- que en realidad se superpone con el turno siguiente.
--
-- Idempotente: se puede correr las veces que haga falta.
-- ─────────────────────────────────────────────────────────────

UPDATE tratamientos
SET duracion_default = 80
WHERE nombre ILIKE 'blanqueamiento'
  AND (duracion_default IS NULL OR duracion_default <> 80);

-- Verificación: debería devolver 80 para cada clínica que tenga el tratamiento
-- cargado. Si una clínica no aparece acá, la reserva online igual usa 80, que
-- es el valor por defecto del sistema (src/lib/constants.ts).
SELECT t.nombre AS tratamiento, t.duracion_default, te.nombre AS clinica
FROM tratamientos t
JOIN tenants te ON te.id = t.tenant_id
WHERE t.nombre ILIKE 'blanqueamiento';
