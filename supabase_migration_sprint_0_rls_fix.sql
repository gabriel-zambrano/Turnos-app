-- Fix RLS para las tablas de tenants
-- Esto asegura que los médicos logueados puedan leer su propia configuración de consultorio y resolver el ID correctamente.

-- 1. Habilitar RLS en tenant_users
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- 2. Política para que el usuario pueda ver a qué consultorios pertenece
DROP POLICY IF EXISTS "tenant_users_select_own" ON tenant_users;
CREATE POLICY "tenant_users_select_own" ON tenant_users
FOR SELECT USING (user_id = auth.uid());

-- 3. Habilitar RLS en tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- 4. Política para que el usuario pueda ver los datos de su consultorio
DROP POLICY IF EXISTS "tenants_select_own" ON tenants;
CREATE POLICY "tenants_select_own" ON tenants
FOR SELECT USING (
  id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()) 
  OR subdominio_generico IS NOT NULL -- Permitir lectura pública a través de dominio para el portal del paciente
);
