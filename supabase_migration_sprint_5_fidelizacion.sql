-- ── MIGRACIÓN SPRINT 5: SISTEMA DE FIDELIZACIÓN Y LEDGER DE PUNTOS ──

-- 1. Tabla: Configuración de fidelización por tenant
CREATE TABLE IF NOT EXISTS config_fidelizacion (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  ars_por_punto      NUMERIC NOT NULL DEFAULT 1000,   -- $ que valen 1 punto al ganar
  ars_valor_canje    NUMERIC NOT NULL DEFAULT 50,     -- $ que vale 1 punto al canjear
  racha_objetivo     INTEGER NOT NULL DEFAULT 3,
  racha_bonus_puntos INTEGER NOT NULL DEFAULT 150,
  actualizado_en     TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en config_fidelizacion
ALTER TABLE config_fidelizacion ENABLE ROW LEVEL SECURITY;

-- Política RLS estándar para config_fidelizacion
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_config_fidelizacion') THEN
    CREATE POLICY tenant_isolation_config_fidelizacion ON config_fidelizacion FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;

-- 2. Tabla: Catálogo de premios
CREATE TABLE IF NOT EXISTS premios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  costo_puntos INTEGER NOT NULL CHECK (costo_puntos > 0),
  valor_referencia_ars NUMERIC,
  stock INTEGER,                 -- NULL = ilimitado
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en premios
ALTER TABLE premios ENABLE ROW LEVEL SECURITY;

-- Política RLS estándar para premios
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_premios') THEN
    CREATE POLICY tenant_isolation_premios ON premios FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;

-- 3. Columnas nuevas en pacientes (el saldo es CACHÉ; la verdad es el ledger)
ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS puntos_saldo_cache INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visitas_consecutivas_sin_faltar INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_visitas_asistidas INTEGER NOT NULL DEFAULT 0;

-- 4. Ledger inmutable historial_puntos (fuente única de verdad + auditoría)
CREATE TABLE IF NOT EXISTS historial_puntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  cita_id UUID REFERENCES citas(id) ON DELETE SET NULL,   -- nullable (bonus/canje/ajuste)
  premio_id UUID REFERENCES premios(id),                  -- solo en canjes
  tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN
    ('gasto_tratamiento','bonus_asistencia','canje_premio','ajuste_manual','ajuste_reverso','migracion_inicial')),
  puntos_afectados INTEGER NOT NULL,        -- negativo en canjes/reversas
  monto_gasto_origen NUMERIC,               -- monto de la cita que originó el gasto
  saldo_resultante INTEGER NOT NULL,        -- snapshot del saldo tras el movimiento
  visita_numero_registrada INTEGER,
  aprobado_por_usuario_id UUID REFERENCES auth.users(id),
  nota TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices e Idempotencia
CREATE UNIQUE INDEX IF NOT EXISTS uq_gasto_por_cita
  ON historial_puntos (cita_id)
  WHERE tipo_movimiento = 'gasto_tratamiento';

CREATE INDEX IF NOT EXISTS idx_histpuntos_paciente ON historial_puntos (paciente_id, creado_en DESC);

-- Habilitar RLS en historial_puntos
ALTER TABLE historial_puntos ENABLE ROW LEVEL SECURITY;

-- Política RLS estándar para historial_puntos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_historial_puntos') THEN
    CREATE POLICY tenant_isolation_historial_puntos ON historial_puntos FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
  END IF;
END
$$;

-- 5. Seeds: config_fidelizacion y premios base para cada tenant existente
INSERT INTO config_fidelizacion (tenant_id)
SELECT id FROM tenants
ON CONFLICT DO NOTHING;

INSERT INTO premios (tenant_id, nombre, costo_puntos, valor_referencia_ars)
SELECT t.id, p.nombre, p.costo_puntos, p.valor_referencia_ars
FROM tenants t
CROSS JOIN (
  VALUES 
    ('Kit de Higiene Premium', 800, 40000::numeric),
    ('Limpieza Dental + Fluoración', 1400, 70000::numeric),
    ('Tratamiento de Caries (1 sector)', 1400, 70000::numeric),
    ('Blanqueamiento (sesión)', 4200, 210000::numeric)
) AS p(nombre, costo_puntos, valor_referencia_ars)
WHERE NOT EXISTS (
  SELECT 1 FROM premios pr 
  WHERE pr.tenant_id = t.id AND pr.nombre = p.nombre
);

-- 6. Migración del saldo histórico
DO $$
DECLARE
  r RECORD;
  v_visitas INTEGER;
  v_puntos_iniciales INTEGER;
BEGIN
  FOR r IN SELECT id, tenant_id, COALESCE(puntos, 0) as puntos_manuales FROM pacientes LOOP
    -- Calcular visitas asistidas desde citas con estado IN ('asistio','completado')
    SELECT COUNT(*)::integer INTO v_visitas
    FROM citas
    WHERE paciente_id = r.id AND estado IN ('asistio', 'completado');

    -- Calcular puntos acumulados hasta ahora: puntos_viejos (ajuste manual) + visitas * 100
    v_puntos_iniciales := r.puntos_manuales + (v_visitas * 100);

    -- Insertar asiento migracion_inicial
    IF NOT EXISTS (
      SELECT 1 FROM historial_puntos 
      WHERE paciente_id = r.id AND tipo_movimiento = 'migracion_inicial'
    ) THEN
      INSERT INTO historial_puntos (
        tenant_id,
        paciente_id,
        tipo_movimiento,
        puntos_afectados,
        saldo_resultante,
        nota
      ) VALUES (
        r.tenant_id,
        r.id,
        'migracion_inicial',
        v_puntos_iniciales,
        v_puntos_iniciales,
        'Migración inicial de saldo histórico (puntos + visitas × 100)'
      );

      -- Actualizar paciente con caché inicializado
      UPDATE pacientes
      SET 
        puntos_saldo_cache = v_puntos_iniciales,
        total_visitas_asistidas = v_visitas,
        visitas_consecutivas_sin_faltar = 0
      WHERE id = r.id;
    END IF;
  END LOOP;
END
$$;

-- 7. Funciones RPC PL/pgSQL

-- 7.a. fn_aprobar_asistencia
CREATE OR REPLACE FUNCTION fn_aprobar_asistencia(p_cita_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_paciente_id UUID;
  v_precio_cobrado NUMERIC;
  v_valor NUMERIC;
  v_estado TEXT;
  v_ars_por_punto NUMERIC;
  v_racha_objetivo INTEGER;
  v_racha_bonus_puntos INTEGER;
  v_puntos_saldo_cache INTEGER;
  v_total_visitas_asistidas INTEGER;
  v_visitas_consecutivas_sin_faltar INTEGER;
  v_monto NUMERIC;
  v_puntos_ganados INTEGER;
  v_bonus_aplicado INTEGER;
  v_saldo_actual INTEGER;
BEGIN
  -- Obtener el usuario autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado.';
  END IF;

  -- Resolver datos de la cita
  SELECT tenant_id, paciente_id, precio_cobrado, valor, estado
  INTO v_tenant_id, v_paciente_id, v_precio_cobrado, v_valor, v_estado
  FROM citas
  WHERE id = p_cita_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita no encontrada.';
  END IF;

  -- Validar pertenencia del usuario al tenant de la cita
  IF NOT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = v_user_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'No autorizado para operar en este tenant.';
  END IF;

  -- Obtener y bloquear la fila del paciente (evita condiciones de carrera)
  SELECT puntos_saldo_cache, total_visitas_asistidas, visitas_consecutivas_sin_faltar
  INTO v_puntos_saldo_cache, v_total_visitas_asistidas, v_visitas_consecutivas_sin_faltar
  FROM pacientes
  WHERE id = v_paciente_id AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente no encontrado.';
  END IF;

  -- Validar idempotencia: no duplicar puntos para una misma cita
  IF EXISTS (
    SELECT 1 FROM historial_puntos
    WHERE cita_id = p_cita_id AND tipo_movimiento = 'gasto_tratamiento'
  ) THEN
    RAISE EXCEPTION 'La cita ya fue procesada para acumulación de puntos.';
  END IF;

  -- Obtener configuración de fidelización para el tenant
  SELECT ars_por_punto, racha_objetivo, racha_bonus_puntos
  INTO v_ars_por_punto, v_racha_objetivo, v_racha_bonus_puntos
  FROM config_fidelizacion
  WHERE tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    -- Fallback por defecto si no existiera config
    v_ars_por_punto := 1000;
    v_racha_objetivo := 3;
    v_racha_bonus_puntos := 150;
  END IF;

  -- Determinar el monto de la cita
  v_monto := v_precio_cobrado;
  IF v_monto IS NULL THEN
    v_monto := v_valor;
  END IF;

  IF v_monto IS NULL THEN
    RAISE EXCEPTION 'La cita no tiene precio cobrado ni valor registrado para calcular puntos.';
  END IF;

  -- Calcular puntos ganados (redondeo hacia abajo, floor)
  v_puntos_ganados := floor(v_monto / v_ars_por_punto)::integer;

  -- Marcar cita como 'asistio'
  UPDATE citas SET estado = 'asistio' WHERE id = p_cita_id;

  -- Registrar movimiento en el ledger: gasto_tratamiento
  v_saldo_actual := v_puntos_saldo_cache + v_puntos_ganados;
  v_total_visitas_asistidas := v_total_visitas_asistidas + 1;
  v_visitas_consecutivas_sin_faltar := v_visitas_consecutivas_sin_faltar + 1;

  INSERT INTO historial_puntos (
    tenant_id, paciente_id, cita_id, tipo_movimiento,
    puntos_afectados, monto_gasto_origen, saldo_resultante,
    visita_numero_registrada, aprobado_por_usuario_id, nota
  ) VALUES (
    v_tenant_id, v_paciente_id, p_cita_id, 'gasto_tratamiento',
    v_puntos_ganados, v_monto, v_saldo_actual,
    v_total_visitas_asistidas, v_user_id, 'Puntos acumulados por asistencia a consulta/tratamiento'
  );

  -- Evaluar bonus por racha
  v_bonus_aplicado := 0;
  IF v_visitas_consecutivas_sin_faltar >= v_racha_objetivo THEN
    v_bonus_aplicado := v_racha_bonus_puntos;
    v_saldo_actual := v_saldo_actual + v_bonus_aplicado;
    v_visitas_consecutivas_sin_faltar := 0; -- Reiniciar racha tras completarla

    INSERT INTO historial_puntos (
      tenant_id, paciente_id, cita_id, tipo_movimiento,
      puntos_afectados, saldo_resultante,
      visita_numero_registrada, aprobado_por_usuario_id, nota
    ) VALUES (
      v_tenant_id, v_paciente_id, p_cita_id, 'bonus_asistencia',
      v_bonus_aplicado, v_saldo_actual,
      v_total_visitas_asistidas, v_user_id, 'Premio por racha de asistencias consecutivas completada'
    );
  END IF;

  -- Actualizar paciente con caché refrescado
  UPDATE pacientes
  SET 
    puntos_saldo_cache = v_saldo_actual,
    total_visitas_asistidas = v_total_visitas_asistidas,
    visitas_consecutivas_sin_faltar = v_visitas_consecutivas_sin_faltar
  WHERE id = v_paciente_id;

  RETURN json_build_object(
    'saldo', v_saldo_actual,
    'puntos_ganados', v_puntos_ganados,
    'bonus_aplicado', v_bonus_aplicado,
    'racha_actual', v_visitas_consecutivas_sin_faltar
  );
END;
$$;

-- 7.b. fn_registrar_inasistencia
CREATE OR REPLACE FUNCTION fn_registrar_inasistencia(p_cita_id UUID, p_estado TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_paciente_id UUID;
BEGIN
  -- Validar estado permitido
  IF p_estado NOT IN ('ausente', 'cancelado') THEN
    RAISE EXCEPTION 'Estado de inasistencia no válido. Debe ser ausente o cancelado.';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado.';
  END IF;

  -- Resolver cita
  SELECT tenant_id, paciente_id
  INTO v_tenant_id, v_paciente_id
  FROM citas
  WHERE id = p_cita_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita no encontrada.';
  END IF;

  -- Validar autorización
  IF NOT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = v_user_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  -- Bloquear y actualizar paciente (romper racha)
  UPDATE pacientes
  SET visitas_consecutivas_sin_faltar = 0
  WHERE id = v_paciente_id AND tenant_id = v_tenant_id;

  -- Marcar cita
  UPDATE citas SET estado = p_estado WHERE id = p_cita_id;

  RETURN json_build_object(
    'estado_cita', p_estado,
    'racha_actual', 0
  );
END;
$$;

-- 7.c. fn_canjear_premio
CREATE OR REPLACE FUNCTION fn_canjear_premio(p_paciente_id UUID, p_premio_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_puntos_saldo_cache INTEGER;
  v_premio_nombre TEXT;
  v_costo_puntos INTEGER;
  v_stock INTEGER;
  v_activo BOOLEAN;
  v_premio_tenant_id UUID;
  v_new_saldo INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado.';
  END IF;

  -- Obtener y validar el premio
  SELECT nombre, costo_puntos, stock, activo, tenant_id
  INTO v_premio_nombre, v_costo_puntos, v_stock, v_activo, v_premio_tenant_id
  FROM premios
  WHERE id = p_premio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premio no encontrado.';
  END IF;

  IF NOT v_activo THEN
    RAISE EXCEPTION 'El premio seleccionado no está activo.';
  END IF;

  -- Validar autorización
  IF NOT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = v_user_id AND tenant_id = v_premio_tenant_id
  ) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  -- Bloquear y validar paciente
  SELECT puntos_saldo_cache, tenant_id
  INTO v_puntos_saldo_cache, v_tenant_id
  FROM pacientes
  WHERE id = p_paciente_id AND tenant_id = v_premio_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente no encontrado.';
  END IF;

  -- Validar stock si no es ilimitado
  IF v_stock IS NOT NULL AND v_stock <= 0 THEN
    RAISE EXCEPTION 'No hay stock disponible para este premio.';
  END IF;

  -- Validar saldo de puntos
  IF v_puntos_saldo_cache < v_costo_puntos THEN
    RAISE EXCEPTION 'Saldo de puntos insuficiente para realizar el canje.';
  END IF;

  -- Descontar stock del premio si no es ilimitado
  IF v_stock IS NOT NULL THEN
    UPDATE premios SET stock = stock - 1 WHERE id = p_premio_id;
  END IF;

  -- Descontar saldo del paciente
  v_new_saldo := v_puntos_saldo_cache - v_costo_puntos;
  UPDATE pacientes SET puntos_saldo_cache = v_new_saldo WHERE id = p_paciente_id;

  -- Registrar en ledger
  INSERT INTO historial_puntos (
    tenant_id, paciente_id, premio_id, tipo_movimiento,
    puntos_afectados, saldo_resultante, aprobado_por_usuario_id, nota
  ) VALUES (
    v_tenant_id, p_paciente_id, p_premio_id, 'canje_premio',
    -v_costo_puntos, v_new_saldo, v_user_id, 'Canje de premio: ' || v_premio_nombre
  );

  RETURN json_build_object(
    'saldo', v_new_saldo,
    'premio_nombre', v_premio_nombre,
    'puntos_descontados', v_costo_puntos
  );
END;
$$;

-- 7.d. fn_ajustar_puntos_manual
CREATE OR REPLACE FUNCTION fn_ajustar_puntos_manual(
  p_paciente_id UUID,
  p_puntos_afectados INTEGER,
  p_tipo_movimiento TEXT,
  p_nota TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_puntos_saldo_cache INTEGER;
  v_new_saldo INTEGER;
BEGIN
  -- Validar tipo movimiento
  IF p_tipo_movimiento NOT IN ('ajuste_manual', 'ajuste_reverso') THEN
    RAISE EXCEPTION 'Tipo de movimiento de ajuste no válido. Debe ser ajuste_manual o ajuste_reverso.';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado.';
  END IF;

  -- Bloquear y validar paciente
  SELECT puntos_saldo_cache, tenant_id
  INTO v_puntos_saldo_cache, v_tenant_id
  FROM pacientes
  WHERE id = p_paciente_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente no encontrado.';
  END IF;

  -- Validar autorización
  IF NOT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = v_user_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  -- Calcular nuevo saldo
  v_new_saldo := v_puntos_saldo_cache + p_puntos_afectados;
  IF v_new_saldo < 0 THEN
    RAISE EXCEPTION 'El ajuste resultaría en un saldo negativo, lo cual no está permitido.';
  END IF;

  -- Actualizar paciente
  UPDATE pacientes SET puntos_saldo_cache = v_new_saldo WHERE id = p_paciente_id;

  -- Registrar en ledger
  INSERT INTO historial_puntos (
    tenant_id, paciente_id, tipo_movimiento,
    puntos_afectados, saldo_resultante, aprobado_por_usuario_id, nota
  ) VALUES (
    v_tenant_id, p_paciente_id, p_tipo_movimiento,
    p_puntos_afectados, v_new_saldo, v_user_id, COALESCE(p_nota, 'Ajuste manual de puntos')
  );

  RETURN json_build_object(
    'saldo', v_new_saldo,
    'puntos_afectados', p_puntos_afectados
  );
END;
$$;
