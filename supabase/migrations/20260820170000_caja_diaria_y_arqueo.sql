-- Migración para crear la tabla de cajas diarias y arqueo

CREATE TABLE IF NOT EXISTS public.cajas_diarias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  monto_apertura NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_cierre_declarado NUMERIC(10,2),
  monto_cierre_sistema NUMERIC(10,2),
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  observaciones TEXT,
  creado_por UUID REFERENCES auth.users(id),
  cerrado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, fecha)
);

ALTER TABLE public.cajas_diarias OWNER TO postgres;

-- Habilitar RLS
ALTER TABLE public.cajas_diarias ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso por Tenant
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_cajas_diarias') THEN
    CREATE POLICY tenant_isolation_cajas_diarias ON public.cajas_diarias FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;
