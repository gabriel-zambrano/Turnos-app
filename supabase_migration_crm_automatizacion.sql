-- ── AUTOMATIZACIÓN DE CRM (campañas por WhatsApp) ──
-- Config on/off por clínica + log de envíos anti-duplicados.
-- Las credenciales de WhatsApp Cloud API son de la PLATAFORMA (variables de
-- entorno WHATSAPP_TOKEN / WHATSAPP_PHONE_ID); acá solo se guarda qué campañas
-- están activas por clínica. El nombre de la clínica va como variable en la
-- plantilla aprobada por Meta.

CREATE TABLE IF NOT EXISTS crm_campanas (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    cumples_activo BOOLEAN NOT NULL DEFAULT false,
    recall_activo BOOLEAN NOT NULL DEFAULT false,
    reactivacion_activo BOOLEAN NOT NULL DEFAULT false,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_envios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    paciente_id UUID REFERENCES pacientes(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL,            -- cumple | recall | reactivacion
    canal TEXT NOT NULL DEFAULT 'whatsapp',
    estado TEXT NOT NULL,          -- enviado | error
    detalle TEXT,                  -- id del mensaje o mensaje de error
    clave_dedupe TEXT NOT NULL,    -- evita reenviar lo mismo (ej. 'cumple:2026')
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un envío por paciente/tipo/clave (anti-duplicados a nivel base)
CREATE UNIQUE INDEX IF NOT EXISTS crm_envios_dedupe
    ON crm_envios (tenant_id, paciente_id, tipo, clave_dedupe);
CREATE INDEX IF NOT EXISTS crm_envios_tenant_idx ON crm_envios (tenant_id, creado_en DESC);

-- RLS
ALTER TABLE crm_campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_campanas_select ON crm_campanas;
DROP POLICY IF EXISTS crm_campanas_write ON crm_campanas;
CREATE POLICY crm_campanas_select ON crm_campanas FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));
CREATE POLICY crm_campanas_write ON crm_campanas FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid()) AND role IN ('admin','owner')))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid()) AND role IN ('admin','owner')));

-- Log: lectura para miembros; la escritura la hace el cron con service-role.
DROP POLICY IF EXISTS crm_envios_select ON crm_envios;
CREATE POLICY crm_envios_select ON crm_envios FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));
