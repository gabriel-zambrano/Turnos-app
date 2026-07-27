-- ─────────────────────────────────────────────────────────────
-- Consentimiento para el tratamiento de datos personales de salud
--
-- Distinto del consentimiento *informado* por tratamiento (que ya existe en
-- `consentimientos_firmados`, con firma y hash). Éste es el que exige la Ley
-- 25.326 de Protección de Datos Personales: los datos de salud son "datos
-- sensibles" y para tratarlos hace falta consentimiento previo, expreso y
-- documentado del titular.
--
-- Se guarda el momento, la versión del texto que aceptó y la IP desde donde se
-- registró, para poder demostrar después qué aceptó exactamente y cuándo.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS consentimiento_datos_en   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consentimiento_datos_ver  TEXT,
  ADD COLUMN IF NOT EXISTS consentimiento_datos_ip   TEXT,
  -- Quién lo registró: el paciente (reserva online) o el consultorio (mostrador).
  ADD COLUMN IF NOT EXISTS consentimiento_datos_origen TEXT;

COMMENT ON COLUMN pacientes.consentimiento_datos_en IS
  'Cuándo prestó consentimiento para el tratamiento de sus datos de salud (Ley 25.326). NULL = pendiente de regularizar.';
COMMENT ON COLUMN pacientes.consentimiento_datos_ver IS
  'Versión del texto de consentimiento que aceptó, para poder reconstruir qué decía.';

-- Índice parcial para poder listar rápido a quiénes falta regularizar.
CREATE INDEX IF NOT EXISTS idx_pacientes_sin_consentimiento
  ON pacientes (tenant_id)
  WHERE consentimiento_datos_en IS NULL;

-- ⚠️ Los pacientes que ya estaban cargados quedan en NULL a propósito: no se
-- puede dar por consentido algo que nunca se pidió. Hay que regularizarlos en
-- la próxima visita; la ficha los muestra con un aviso.
