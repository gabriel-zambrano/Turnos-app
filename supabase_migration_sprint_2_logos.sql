-- Script para crear el bucket de 'logos' y configurar sus políticas de acceso

-- 1. Insertamos el bucket público
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Permitir acceso de lectura público a todo el mundo (Select)
CREATE POLICY "Logos public access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'logos');

-- 3. Permitir subida (Insert) solo a usuarios autenticados
CREATE POLICY "Logos insert" 
ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id = 'logos' 
    AND auth.role() = 'authenticated'
);

-- 4. Permitir actualización (Update) solo a usuarios autenticados
CREATE POLICY "Logos update" 
ON storage.objects FOR UPDATE 
WITH CHECK (
    bucket_id = 'logos' 
    AND auth.role() = 'authenticated'
);

-- 5. Permitir eliminación (Delete) solo a usuarios autenticados
CREATE POLICY "Logos delete" 
ON storage.objects FOR DELETE 
USING (
    bucket_id = 'logos' 
    AND auth.role() = 'authenticated'
);
