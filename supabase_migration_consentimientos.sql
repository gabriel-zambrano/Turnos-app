-- ── HISTORIA CLÍNICA · CONSENTIMIENTOS INFORMADOS CON FIRMA DIGITAL ──
-- Ley 26.529: la historia clínica digital debe garantizar integridad,
-- autenticidad, inalterabilidad, perdurabilidad y recuperabilidad.
-- Por eso los registros firmados son de solo lectura (RLS sin UPDATE/DELETE)
-- y guardan un hash SHA-256 del contenido + snapshot del texto firmado.

-- 1. Plantillas de consentimiento por clínica (texto editable)
CREATE TABLE IF NOT EXISTS plantillas_consentimiento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    contenido TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Consentimientos firmados (registro inmutable)
CREATE TABLE IF NOT EXISTS consentimientos_firmados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    paciente_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
    plantilla_id UUID REFERENCES plantillas_consentimiento(id) ON DELETE SET NULL,
    titulo TEXT NOT NULL,
    contenido_snapshot TEXT NOT NULL,      -- texto exacto que se firmó (inmutable)
    firma_png TEXT,                        -- trazo de la firma en dataURL PNG (base64)
    firmante_nombre TEXT,
    firmante_doc TEXT,
    hash_sha256 TEXT,                      -- huella del contenido + firmante + fecha
    contexto TEXT NOT NULL DEFAULT 'presencial', -- presencial | remota
    estado TEXT NOT NULL DEFAULT 'pendiente',    -- pendiente | firmado
    token_firma UUID UNIQUE DEFAULT gen_random_uuid(), -- para firma remota
    ip_firma TEXT,
    user_agent TEXT,
    solicitado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    firmado_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS consentimientos_paciente_idx ON consentimientos_firmados (paciente_id, solicitado_en DESC);
CREATE INDEX IF NOT EXISTS consentimientos_tenant_idx ON consentimientos_firmados (tenant_id, solicitado_en DESC);

-- 3. RLS
ALTER TABLE plantillas_consentimiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE consentimientos_firmados ENABLE ROW LEVEL SECURITY;

-- Plantillas: lectura para miembros; escritura solo admin/owner
DROP POLICY IF EXISTS plantillas_select ON plantillas_consentimiento;
DROP POLICY IF EXISTS plantillas_write ON plantillas_consentimiento;
CREATE POLICY plantillas_select ON plantillas_consentimiento FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY plantillas_write ON plantillas_consentimiento FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('admin','owner')))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('admin','owner')));

-- Consentimientos firmados: inmutables desde el cliente (solo SELECT/INSERT).
-- La firma remota y el registro de la firma se hacen server-side con service-role.
DROP POLICY IF EXISTS consentimientos_select ON consentimientos_firmados;
DROP POLICY IF EXISTS consentimientos_insert ON consentimientos_firmados;
CREATE POLICY consentimientos_select ON consentimientos_firmados FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
CREATE POLICY consentimientos_insert ON consentimientos_firmados FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

-- 4. Plantilla por defecto para cada clínica existente (consentimiento odontológico general).
--    Se puede editar o desactivar desde la app.
INSERT INTO plantillas_consentimiento (tenant_id, titulo, contenido)
SELECT t.id,
  'Consentimiento informado para tratamiento odontológico',
  'Por medio del presente, en mi carácter de paciente (o representante legal), declaro que ' ||
  'he sido informado/a de manera clara y comprensible sobre el diagnóstico, el plan de tratamiento ' ||
  'odontológico propuesto, sus alternativas, los beneficios esperados, los riesgos y las posibles ' ||
  'complicaciones, así como de los cuidados posteriores necesarios.' || E'\n\n' ||
  'He tenido la oportunidad de realizar preguntas y todas fueron respondidas satisfactoriamente. ' ||
  'Comprendo que la odontología no es una ciencia exacta y que no puede garantizarse un resultado determinado.' || E'\n\n' ||
  'En consecuencia, presto mi consentimiento libre y voluntario para la realización del tratamiento, ' ||
  'pudiendo revocarlo en cualquier momento antes de su ejecución.'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM plantillas_consentimiento p WHERE p.tenant_id = t.id
);
