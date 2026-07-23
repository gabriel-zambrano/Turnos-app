-- ── MIGRACIÓN PARA INTEGRACIÓN DE FACTURACIÓN ELECTRÓNICA ARCA ──
-- Idempotente: puede correrse aunque una versión anterior haya sido aplicada.

-- 1. Agregar campos fiscales a la tabla de pacientes
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS dni_cuit TEXT;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'DNI';

-- 2. Crear tabla de configuración fiscal por clínica (tenant)
CREATE TABLE IF NOT EXISTS arca_config (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    cuit TEXT NOT NULL,
    condicion_iva TEXT NOT NULL DEFAULT 'Monotributista', -- Monotributista, Responsable Inscripto, Exento
    punto_venta INTEGER NOT NULL DEFAULT 1,
    -- Alícuota de IVA usada al desagregar en Facturas A/B (Responsable Inscripto).
    -- Servicios de salud suelen ir al 10.5; cada clínica lo valida con su contador.
    alicuota_iva NUMERIC(4,1) NOT NULL DEFAULT 10.5,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE arca_config ADD COLUMN IF NOT EXISTS alicuota_iva NUMERIC(4,1) NOT NULL DEFAULT 10.5;
-- Datos fiscales de cabecera que aparecen en el PDF del comprobante
ALTER TABLE arca_config ADD COLUMN IF NOT EXISTS razon_social TEXT;
ALTER TABLE arca_config ADD COLUMN IF NOT EXISTS domicilio_comercial TEXT;
ALTER TABLE arca_config ADD COLUMN IF NOT EXISTS ingresos_brutos TEXT DEFAULT 'EXENTO';
ALTER TABLE arca_config ADD COLUMN IF NOT EXISTS inicio_actividades TEXT;

-- 3. La caché manual de tokens WSAA quedó obsoleta:
--    @afipsdk/afip.js gestiona la autenticación internamente (no lee ServiceTA).
DROP TABLE IF EXISTS arca_tokens;

-- 4. Crear tabla de facturas emitidas
CREATE TABLE IF NOT EXISTS facturas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cita_id UUID REFERENCES citas(id) ON DELETE SET NULL,
    ingreso_manual_id UUID REFERENCES ingresos_manuales(id) ON DELETE SET NULL,
    tipo_comprobante INTEGER NOT NULL, -- 11=Factura C, 6=Factura B, 1=Factura A
    punto_venta INTEGER NOT NULL DEFAULT 1,
    nro_comprobante INTEGER NOT NULL,
    cae TEXT NOT NULL,
    cae_expira DATE NOT NULL,
    monto NUMERIC(12, 2) NOT NULL,
    paciente_nombre TEXT NOT NULL,
    paciente_doc_tipo TEXT NOT NULL, -- DNI, CUIT, Pasaporte, etc.
    paciente_doc_nro TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'emitida', -- emitida, error
    simulada BOOLEAN NOT NULL DEFAULT false, -- true = CAE ficticio (demo), sin validez fiscal
    error_mensaje TEXT,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS punto_venta INTEGER NOT NULL DEFAULT 1;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS simulada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS concepto TEXT;
-- Nota de crédito: si esta fila anula a otra factura, apunta a su id.
-- tipo_comprobante 13/8/3 = Nota de Crédito C/B/A.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS anula_factura_id UUID REFERENCES facturas(id) ON DELETE SET NULL;

-- Evita duplicar numeración ante requests concurrentes.
-- Solo aplica a facturas REALES: las simuladas son pruebas y pueden repetir número.
DROP INDEX IF EXISTS facturas_numeracion_unica;
CREATE UNIQUE INDEX IF NOT EXISTS facturas_numeracion_unica
    ON facturas (tenant_id, punto_venta, tipo_comprobante, nro_comprobante)
    WHERE estado = 'emitida' AND simulada = false;

CREATE INDEX IF NOT EXISTS facturas_tenant_idx ON facturas (tenant_id, creada_en DESC);

-- 5. Habilitar Row Level Security (RLS)
ALTER TABLE arca_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

-- 6. Políticas RLS
-- arca_config: lectura para miembros; escritura solo admin/owner
DROP POLICY IF EXISTS tenant_isolation_arca_config ON arca_config;
DROP POLICY IF EXISTS arca_config_select ON arca_config;
DROP POLICY IF EXISTS arca_config_write ON arca_config;

CREATE POLICY arca_config_select ON arca_config FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY arca_config_write ON arca_config FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_users
    WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM tenant_users
    WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
  ));

-- facturas: inmutables desde el cliente — solo SELECT e INSERT (sin UPDATE/DELETE)
DROP POLICY IF EXISTS tenant_isolation_facturas ON facturas;
DROP POLICY IF EXISTS facturas_select ON facturas;
DROP POLICY IF EXISTS facturas_insert ON facturas;

CREATE POLICY facturas_select ON facturas FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

CREATE POLICY facturas_insert ON facturas FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
