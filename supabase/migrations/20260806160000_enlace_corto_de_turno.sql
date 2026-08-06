-- ── ENLACE CORTO PARA EL TURNO DEL PACIENTE ──
--
-- El link que le llega al paciente por WhatsApp era así:
--
--   https://clinica.com/agendar/11111111-1111-4111-8111-111111111111/2222…
--
-- Noventa caracteres, dos UUID pegados. En un mensaje de WhatsApp eso ocupa
-- tres renglones, se ve a spam, y compite con el texto que importa. Ahora es:
--
--   https://clinica.com/t/K3M9QPX7RB4T
--
-- ── Por qué doce caracteres y no seis ──
--
-- El código ES la credencial: quien lo tenga ve el turno. Un código de seis
-- caracteres en este alfabeto son ~30 bits, que un escaneo distribuido recorre
-- entero. Son datos de salud, así que no alcanza con "es improbable".
--
-- Doce caracteres son ~60 bits: 10^18 combinaciones. Con el rate limit por IP
-- que ya existe (20-30 intentos por minuto), agotarlo lleva más tiempo que la
-- edad del universo. Y el link igual sigue entrando en un renglón.
--
-- ── El alfabeto ──
--
-- Base32 de Crockford sin I, L, O ni U. Las tres primeras se confunden con 1 y
-- 0 cuando alguien lee el código en voz alta por teléfono —cosa que va a pasar,
-- porque el paciente que no encuentra el mensaje llama al consultorio—. La U se
-- saca para que el azar no arme palabras subidas de tono.
--
-- Idempotente.

-- ─────────────────────────────────────────────────────────────
-- 1. La tabla
-- ─────────────────────────────────────────────────────────────
-- El enlace es una fila aparte y no una columna en `citas` a propósito: así se
-- puede revocar (borrar la fila) sin tocar el turno, y se puede emitir uno
-- nuevo si el paciente reenvía el mensaje a quien no debía.
CREATE TABLE IF NOT EXISTS enlaces_turno (
    codigo      TEXT PRIMARY KEY,
    cita_id     UUID NOT NULL REFERENCES citas(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE enlaces_turno IS
    'Código corto que identifica un turno en el link que recibe el paciente. '
    'El código es la credencial: quien lo tiene ve ese turno y solo ese.';

-- Una cita tiene un enlace, no varios: si se emite otro, se pisa el anterior.
CREATE UNIQUE INDEX IF NOT EXISTS enlaces_turno_cita_idx ON enlaces_turno (cita_id);
CREATE INDEX IF NOT EXISTS enlaces_turno_tenant_idx ON enlaces_turno (tenant_id);

-- ─────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────
-- Nadie lee esta tabla desde el cliente. La resuelve el servidor con la clave
-- de servicio, que se saltea RLS. Sin políticas de lectura, un anon key
-- filtrado no sirve para listar códigos, que es exactamente lo que hay que
-- evitar: con la lista, el largo del código deja de importar.
ALTER TABLE enlaces_turno ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 3. Generación del código
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generar_codigo_enlace()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    alfabeto CONSTANT TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  -- sin I, L, O, U
    hex       TEXT;
    resultado TEXT := '';
    i INT;
BEGIN
    -- La entropía sale de gen_random_uuid(), que es núcleo de Postgres desde
    -- la 13 y usa un generador criptográfico. Dos motivos para preferirlo:
    --
    --   · random() NO es criptográfico. Su semilla es predecible, y con la
    --     semilla se derivan todos los códigos emitidos después. Para algo que
    --     ES la credencial de acceso, eso lo invalida.
    --   · gen_random_bytes() serviría, pero vive en pgcrypto, que en Supabase
    --     está en el esquema `extensions` y en otros Postgres puede no estar
    --     instalado. Un uuid da 122 bits y no depende de ninguna extensión.
    hex := replace(gen_random_uuid()::text, '-', '');

    FOR i IN 1..12 LOOP
        -- Cada par de dígitos hexadecimales es un byte; el módulo 32 lo baja
        -- al alfabeto. El sesgo de 256 % 32 = 0 es nulo: 32 divide a 256.
        resultado := resultado || substr(
            alfabeto,
            (('x' || substr(hex, i * 2 - 1, 2))::bit(8)::int % 32) + 1,
            1
        );
    END LOOP;
    RETURN resultado;
END;
$$;

COMMENT ON FUNCTION generar_codigo_enlace() IS
    'Código de 12 caracteres en base32 sin I/L/O/U, con entropía de gen_random_uuid().';

-- ─────────────────────────────────────────────────────────────
-- 4. Emisión
-- ─────────────────────────────────────────────────────────────
-- Devuelve el enlace de una cita, creándolo si no existe. Es idempotente:
-- llamarla dos veces para la misma cita devuelve el mismo código, así que el
-- link que ya está en el WhatsApp del paciente nunca deja de funcionar.
CREATE OR REPLACE FUNCTION emitir_enlace_turno(p_cita_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_codigo    TEXT;
    v_tenant_id UUID;
    intentos    INT := 0;
BEGIN
    SELECT codigo INTO v_codigo FROM enlaces_turno WHERE cita_id = p_cita_id;
    IF v_codigo IS NOT NULL THEN
        RETURN v_codigo;
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM citas WHERE id = p_cita_id;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'La cita % no existe', p_cita_id;
    END IF;

    -- La colisión es astronómicamente improbable, pero el reintento cuesta
    -- tres líneas y evita que un turno se quede sin link por mala suerte.
    LOOP
        intentos := intentos + 1;
        v_codigo := generar_codigo_enlace();
        BEGIN
            INSERT INTO enlaces_turno (codigo, cita_id, tenant_id)
            VALUES (v_codigo, p_cita_id, v_tenant_id);
            RETURN v_codigo;
        EXCEPTION WHEN unique_violation THEN
            -- Puede ser el código (reintentar) o la cita, si dos pedidos
            -- entraron a la vez. En ese caso gana el que insertó primero.
            SELECT codigo INTO v_codigo FROM enlaces_turno WHERE cita_id = p_cita_id;
            IF v_codigo IS NOT NULL THEN
                RETURN v_codigo;
            END IF;
            IF intentos >= 5 THEN
                RAISE EXCEPTION 'No se pudo generar un código para la cita %', p_cita_id;
            END IF;
        END;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION emitir_enlace_turno(UUID) IS
    'Devuelve el código de una cita, creándolo si hace falta. Idempotente: el '
    'link que ya recibió el paciente sigue valiendo.';

-- Solo la clave de servicio emite enlaces. Si un cliente pudiera llamar a esta
-- función, podría pedir el código de cualquier cita pasando su id.
-- Los roles se revocan uno por uno y solo si existen: `anon` y `authenticated`
-- son de Supabase, y esta migración también corre en el Postgres de los tests.
REVOKE ALL ON FUNCTION emitir_enlace_turno(UUID) FROM PUBLIC;

DO $$
DECLARE r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON FUNCTION emitir_enlace_turno(UUID) FROM %I', r);
        END IF;
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Verificación
-- ─────────────────────────────────────────────────────────────
-- Debería devolver 12 caracteres, y dos veces seguidas el mismo:
--
--   SELECT emitir_enlace_turno(id), emitir_enlace_turno(id)
--   FROM citas ORDER BY fecha_hora DESC LIMIT 1;
--
-- Y el alfabeto no debería tener nunca I, L, O ni U:
--
--   SELECT count(*) FROM enlaces_turno WHERE codigo ~ '[ILOU]';   -- 0
