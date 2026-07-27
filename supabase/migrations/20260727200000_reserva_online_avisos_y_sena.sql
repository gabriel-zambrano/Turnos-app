-- ─────────────────────────────────────────────────────────────
-- Reserva online: avisos al consultorio y seña de reserva
--
-- Dos cosas que faltaban para poder usar el link público en serio:
--   1. Saber qué turnos entraron por el link (para avisarlos y contarlos).
--   2. Poder pedir una seña, que es lo que evita que el paciente no aparezca.
-- ─────────────────────────────────────────────────────────────

-- ── 1. De dónde vino el turno ────────────────────────────────
-- Antes se distinguía leyendo el texto de `notas`, que es frágil: si alguien
-- edita la nota, el turno deja de contarse como pedido online.
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS origen TEXT;

COMMENT ON COLUMN citas.origen IS
  'Quién cargó el turno: ''online'' (el paciente por el link público) o NULL/''consultorio'' (lo cargó la clínica).';

-- Los turnos que ya entraron por el link quedaron marcados solo en las notas.
UPDATE citas
SET origen = 'online'
WHERE origen IS NULL
  AND notas LIKE 'Pedido online%';

-- El aviso del dashboard consulta "pedidos online sin confirmar": conviene que
-- no recorra toda la tabla.
CREATE INDEX IF NOT EXISTS idx_citas_pedidos_online
  ON citas (tenant_id, fecha_hora)
  WHERE origen = 'online' AND estado = 'pendiente';

-- ── 2. Seña de reserva, configurable por clínica ─────────────
ALTER TABLE tenants
  -- 0 = no se pide seña. Cada clínica define su monto.
  ADD COLUMN IF NOT EXISTS sena_reserva NUMERIC(10,2) DEFAULT 0,
  -- Alias/CBU o instrucciones que se le muestran al paciente para abonarla.
  ADD COLUMN IF NOT EXISTS sena_datos_pago TEXT,
  -- Casilla donde recibir los avisos. Si está vacía se usa la del dueño.
  ADD COLUMN IF NOT EXISTS email_avisos TEXT;

COMMENT ON COLUMN tenants.sena_reserva IS
  'Monto de la seña para reservar por el link público. 0 = sin seña.';

SELECT id, nombre, sena_reserva, email_avisos FROM tenants;
