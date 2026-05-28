-- ── MIGRACIÓN DE COLUMNAS DE SUSCRIPCIÓN PARA MERCADOPAGO ──

-- 1. Agregar columnas de MercadoPago a la tabla tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_payment_date TIMESTAMPTZ;

-- 2. Asegurarse de que el Dr. Walter Benegas tenga un estado activo inicial
UPDATE tenants 
SET plan = 'pro', subscription_status = 'authorized', feature_bi = true 
WHERE id = '2845c423-affa-4ca2-9c5f-f4ec8e35701a' AND (subscription_status = 'inactive' OR subscription_status IS NULL);
