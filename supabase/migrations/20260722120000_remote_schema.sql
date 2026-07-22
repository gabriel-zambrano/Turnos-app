


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."crear_tenant"("p_nombre" "text", "p_subdominio" "text", "p_plan" "text", "p_custom_domain" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id UUID;
  v_feature_bi BOOLEAN := false;
  v_feature_whatsapp BOOLEAN := false;
  v_feature_recordatorios BOOLEAN := false;
  v_max_pacientes INT := 100;
  v_max_citas_mes INT := 200;
BEGIN
  IF p_plan = 'pro' THEN
    v_feature_whatsapp := true;
    v_feature_recordatorios := true;
    v_max_pacientes := 500;
    v_max_citas_mes := 999;
  ELSIF p_plan = 'business' THEN
    v_feature_bi := true;
    v_feature_whatsapp := true;
    v_feature_recordatorios := true;
    v_max_pacientes := 999;
    v_max_citas_mes := 999;
  END IF;

  INSERT INTO tenants (
    nombre, subdominio, plan, custom_domain,
    subdominio_generico, activo,
    feature_bi, feature_whatsapp, feature_recordatorios,
    max_pacientes, max_citas_mes
  )
  VALUES (
    p_nombre, p_subdominio, p_plan, p_custom_domain,
    p_subdominio, true,
    v_feature_bi, v_feature_whatsapp, v_feature_recordatorios,
    v_max_pacientes, v_max_citas_mes
  )
  RETURNING id INTO v_tenant_id;

  RETURN v_tenant_id;
END;
$$;


ALTER FUNCTION "public"."crear_tenant"("p_nombre" "text", "p_subdominio" "text", "p_plan" "text", "p_custom_domain" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_ajustar_puntos_manual"("p_paciente_id" "uuid", "p_puntos_afectados" integer, "p_tipo_movimiento" "text", "p_nota" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."fn_ajustar_puntos_manual"("p_paciente_id" "uuid", "p_puntos_afectados" integer, "p_tipo_movimiento" "text", "p_nota" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_aprobar_asistencia"("p_cita_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."fn_aprobar_asistencia"("p_cita_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_canjear_premio"("p_paciente_id" "uuid", "p_premio_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."fn_canjear_premio"("p_paciente_id" "uuid", "p_premio_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_registrar_inasistencia"("p_cita_id" "uuid", "p_estado" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."fn_registrar_inasistencia"("p_cita_id" "uuid", "p_estado" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_admin_email"("tid" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT u.email 
  FROM auth.users u
  JOIN public.tenant_users tu ON tu.user_id = u.id
  WHERE tu.tenant_id = tid
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_tenant_admin_email"("tid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_email"("uid" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT email FROM auth.users WHERE id = uid;
$$;


ALTER FUNCTION "public"."get_user_email"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_turno_to_cita"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_paciente_id UUID;
  v_nombre_completo TEXT;
  v_fecha_hora TIMESTAMPTZ;
BEGIN
  v_nombre_completo := NEW.nombre || ' ' || NEW.apellido;

  v_fecha_hora := (NEW.fecha::TEXT || ' ' || NEW.hora || ':00')::TIMESTAMP 
                  AT TIME ZONE 'America/Argentina/Buenos_Aires';

  SELECT id INTO v_paciente_id
  FROM pacientes
  WHERE email = NEW.email
  LIMIT 1;

  IF v_paciente_id IS NULL THEN
    INSERT INTO pacientes (nombre, email, telefono)
    VALUES (v_nombre_completo, NEW.email, NEW.telefono)
    RETURNING id INTO v_paciente_id;
  END IF;

  INSERT INTO citas (
    paciente_id,
    fecha_hora,
    tipo_tratamiento,
    estado,
    notas,
    duracion_minutos
  ) VALUES (
    v_paciente_id,
    v_fecha_hora,
    NEW.servicio,
    'pendiente',
    COALESCE(NEW.notas, ''),
    30
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_turno_to_cita"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."citas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "paciente_id" "uuid" NOT NULL,
    "fecha_hora" timestamp with time zone NOT NULL,
    "tipo_tratamiento" "text" DEFAULT 'Consulta'::"text" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "notas" "text",
    "duracion_minutos" integer DEFAULT 30 NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "valor" numeric(10,2) DEFAULT 0,
    "sena" numeric(10,2) DEFAULT 0,
    "descuento" numeric(5,2) DEFAULT 0,
    "saldo" numeric(10,2) GENERATED ALWAYS AS (("valor" - "sena")) STORED,
    "tenant_id" "uuid" DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a'::"uuid" NOT NULL,
    "no_show" boolean DEFAULT false,
    "costo_insumos" numeric DEFAULT 0,
    "presupuesto_id" "uuid",
    "medio_pago" "text",
    "precio_cobrado" numeric(12,2) DEFAULT NULL::numeric
);


ALTER TABLE "public"."citas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."bi_citas_por_dia" AS
 SELECT "date"(("fecha_hora" AT TIME ZONE 'America/Argentina/Buenos_Aires'::"text")) AS "fecha",
    "count"(*) AS "total",
    "count"(*) FILTER (WHERE ("estado" = 'confirmado'::"text")) AS "confirmadas",
    "count"(*) FILTER (WHERE ("estado" = 'pendiente'::"text")) AS "pendientes",
    "count"(*) FILTER (WHERE ("estado" = 'cancelado'::"text")) AS "canceladas",
    "round"(((("count"(*) FILTER (WHERE ("estado" = 'confirmado'::"text")))::numeric / (NULLIF("count"(*), 0))::numeric) * (100)::numeric), 1) AS "tasa_confirmacion"
   FROM "public"."citas"
  WHERE ("fecha_hora" >= ("now"() - '30 days'::interval))
  GROUP BY ("date"(("fecha_hora" AT TIME ZONE 'America/Argentina/Buenos_Aires'::"text")))
  ORDER BY ("date"(("fecha_hora" AT TIME ZONE 'America/Argentina/Buenos_Aires'::"text")));


ALTER VIEW "public"."bi_citas_por_dia" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."bi_citas_por_tratamiento" AS
 SELECT "tipo_tratamiento",
    "count"(*) AS "total",
    "count"(*) FILTER (WHERE ("estado" = 'confirmado'::"text")) AS "confirmadas",
    "round"("avg"("duracion_minutos"), 0) AS "duracion_promedio",
    "round"("avg"("valor") FILTER (WHERE ("valor" IS NOT NULL)), 0) AS "valor_promedio"
   FROM "public"."citas"
  GROUP BY "tipo_tratamiento"
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."bi_citas_por_tratamiento" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."bi_ingresos_por_mes" AS
 SELECT "to_char"("date_trunc"('month'::"text", ("fecha_hora" AT TIME ZONE 'America/Argentina/Buenos_Aires'::"text")), 'YYYY-MM'::"text") AS "mes",
    "count"(*) AS "citas",
    COALESCE("sum"("valor") FILTER (WHERE ("valor" IS NOT NULL)), (0)::numeric) AS "ingresos",
    COALESCE("sum"("sena") FILTER (WHERE ("sena" IS NOT NULL)), (0)::numeric) AS "senas"
   FROM "public"."citas"
  GROUP BY ("date_trunc"('month'::"text", ("fecha_hora" AT TIME ZONE 'America/Argentina/Buenos_Aires'::"text")))
  ORDER BY ("to_char"("date_trunc"('month'::"text", ("fecha_hora" AT TIME ZONE 'America/Argentina/Buenos_Aires'::"text")), 'YYYY-MM'::"text")) DESC
 LIMIT 6;


ALTER VIEW "public"."bi_ingresos_por_mes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."bi_kpis_mes" AS
 SELECT "count"(*) AS "citas_mes",
    "count"(*) FILTER (WHERE ("estado" = 'confirmado'::"text")) AS "confirmadas",
    "count"(*) FILTER (WHERE ("estado" = 'cancelado'::"text")) AS "canceladas",
    "round"(((("count"(*) FILTER (WHERE ("estado" = 'confirmado'::"text")))::numeric / (NULLIF("count"(*), 0))::numeric) * (100)::numeric), 1) AS "tasa_confirmacion",
    COALESCE("sum"("valor") FILTER (WHERE ("valor" IS NOT NULL)), (0)::numeric) AS "ingresos_mes",
    COALESCE("sum"("sena") FILTER (WHERE ("sena" IS NOT NULL)), (0)::numeric) AS "senas_mes",
    "count"(DISTINCT "paciente_id") AS "pacientes_unicos"
   FROM "public"."citas"
  WHERE ("date_trunc"('month'::"text", "fecha_hora") = "date_trunc"('month'::"text", "now"()));


ALTER VIEW "public"."bi_kpis_mes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."bi_ocupacion_por_hora" AS
 SELECT (EXTRACT(hour FROM ("fecha_hora" AT TIME ZONE 'America/Argentina/Buenos_Aires'::"text")))::integer AS "hora",
    "count"(*) AS "total_citas",
    "round"("avg"("duracion_minutos"), 0) AS "duracion_promedio"
   FROM "public"."citas"
  GROUP BY (EXTRACT(hour FROM ("fecha_hora" AT TIME ZONE 'America/Argentina/Buenos_Aires'::"text")))
  ORDER BY ((EXTRACT(hour FROM ("fecha_hora" AT TIME ZONE 'America/Argentina/Buenos_Aires'::"text")))::integer);


ALTER VIEW "public"."bi_ocupacion_por_hora" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pacientes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" NOT NULL,
    "telefono" "text" NOT NULL,
    "email" "text",
    "fecha_nacimiento" "date",
    "ultimo_tratamiento" "text" DEFAULT 'Consulta'::"text",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "token" "text",
    "tenant_id" "uuid" DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a'::"uuid" NOT NULL,
    "alergias" "text",
    "antecedentes" "text",
    "progreso_plan_porcentaje" integer DEFAULT 0,
    "puntos" integer DEFAULT 0,
    "recomendaciones" "text",
    "puntos_saldo_cache" integer DEFAULT 0 NOT NULL,
    "visitas_consecutivas_sin_faltar" integer DEFAULT 0 NOT NULL,
    "total_visitas_asistidas" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."pacientes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."bi_pacientes_nuevos_por_mes" AS
 SELECT "to_char"("date_trunc"('month'::"text", "creado_en"), 'YYYY-MM'::"text") AS "mes",
    "count"(*) AS "pacientes_nuevos"
   FROM "public"."pacientes"
  GROUP BY ("date_trunc"('month'::"text", "creado_en"))
  ORDER BY ("to_char"("date_trunc"('month'::"text", "creado_en"), 'YYYY-MM'::"text")) DESC
 LIMIT 6;


ALTER VIEW "public"."bi_pacientes_nuevos_por_mes" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."bi_resumen" AS
 SELECT "tenant_id",
    "date_trunc"('month'::"text", "fecha_hora") AS "mes",
    "tipo_tratamiento",
    "count"(*) AS "total_citas",
    "count"(*) FILTER (WHERE ("estado" = 'completado'::"text")) AS "completadas",
    "count"(*) FILTER (WHERE ("estado" = 'cancelado'::"text")) AS "canceladas",
    "count"(*) FILTER (WHERE ("no_show" = true)) AS "no_shows",
    "sum"("valor") AS "ingresos",
    "sum"("saldo") AS "saldo_pendiente",
    "sum"("costo_insumos") AS "costos",
    ("sum"("valor") - "sum"("costo_insumos")) AS "ganancia_neta"
   FROM "public"."citas" "c"
  GROUP BY "tenant_id", ("date_trunc"('month'::"text", "fecha_hora")), "tipo_tratamiento"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."bi_resumen" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bloqueos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fecha" "date" NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fin" time without time zone NOT NULL,
    "motivo" "text",
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."bloqueos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."config_fidelizacion" (
    "tenant_id" "uuid" NOT NULL,
    "ars_por_punto" numeric DEFAULT 1000 NOT NULL,
    "ars_valor_canje" numeric DEFAULT 50 NOT NULL,
    "racha_objetivo" integer DEFAULT 3 NOT NULL,
    "racha_bonus_puntos" integer DEFAULT 150 NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."config_fidelizacion" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."costos_fijos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "monto" numeric(10,2) DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a'::"uuid"
);


ALTER TABLE "public"."costos_fijos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."egresos_manuales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "fecha" "date" NOT NULL,
    "concepto" "text" NOT NULL,
    "monto" numeric NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "egresos_manuales_monto_check" CHECK (("monto" > (0)::numeric))
);


ALTER TABLE "public"."egresos_manuales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_post_visita" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paciente_id" "uuid",
    "cita_id" "uuid",
    "tenant_id" "uuid",
    "dolor" integer,
    "satisfaccion" integer,
    "comentario" "text",
    "creado_en" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "feedback_post_visita_dolor_check" CHECK ((("dolor" >= 1) AND ("dolor" <= 5))),
    CONSTRAINT "feedback_post_visita_satisfaccion_check" CHECK ((("satisfaccion" >= 1) AND ("satisfaccion" <= 10)))
);


ALTER TABLE "public"."feedback_post_visita" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."historial_dental" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paciente_id" "uuid" NOT NULL,
    "diente" integer NOT NULL,
    "estado" character varying(50) NOT NULL,
    "notas" "text",
    "tenant_id" "uuid" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."historial_dental" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."historial_puntos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "paciente_id" "uuid" NOT NULL,
    "cita_id" "uuid",
    "premio_id" "uuid",
    "tipo_movimiento" "text" NOT NULL,
    "puntos_afectados" integer NOT NULL,
    "monto_gasto_origen" numeric,
    "saldo_resultante" integer NOT NULL,
    "visita_numero_registrada" integer,
    "aprobado_por_usuario_id" "uuid",
    "nota" "text",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "historial_puntos_tipo_movimiento_check" CHECK (("tipo_movimiento" = ANY (ARRAY['gasto_tratamiento'::"text", 'bonus_asistencia'::"text", 'canje_premio'::"text", 'ajuste_manual'::"text", 'ajuste_reverso'::"text", 'migracion_inicial'::"text"])))
);


ALTER TABLE "public"."historial_puntos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingresos_manuales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "concepto" "text" NOT NULL,
    "monto" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a'::"uuid"
);


ALTER TABLE "public"."ingresos_manuales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logs_envios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paciente" "text" NOT NULL,
    "canal" "text" DEFAULT 'WhatsApp'::"text" NOT NULL,
    "estado" "text" NOT NULL,
    "hora" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL,
    CONSTRAINT "logs_envios_estado_check" CHECK (("estado" = ANY (ARRAY['enviado'::"text", 'fallido'::"text"])))
);


ALTER TABLE "public"."logs_envios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_mensual" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mes" integer NOT NULL,
    "anio" integer NOT NULL,
    "meta_ingresos" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a'::"uuid"
);


ALTER TABLE "public"."meta_mensual" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paciente_fotos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paciente_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."paciente_fotos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfil_doctor" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" DEFAULT 'Od. Walter Benegas'::"text" NOT NULL,
    "clinica" "text" DEFAULT 'Consultorio Benegas'::"text" NOT NULL,
    "zona_horaria" "text" DEFAULT 'America/Argentina/Buenos_Aires'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."perfil_doctor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "costo_puntos" integer NOT NULL,
    "valor_referencia_ars" numeric,
    "stock" integer,
    "activo" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "premios_costo_puntos_check" CHECK (("costo_puntos" > 0))
);


ALTER TABLE "public"."premios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presupuestos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "paciente_id" "uuid" NOT NULL,
    "tratamiento" "text" NOT NULL,
    "monto" numeric NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "convertido_en" timestamp with time zone
);


ALTER TABLE "public"."presupuestos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recordatorios_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "cita_id" "uuid",
    "tipo_mensaje" "text" DEFAULT 'WhatsApp'::"text" NOT NULL,
    "estado_envio" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "mensaje_preview" "text",
    "proveedor_ref" "text",
    "error_detalle" "text",
    "enviado_en" timestamp with time zone,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "resend_email_id" "text",
    "estado_entrega" "text",
    "abierto_en" timestamp with time zone
);


ALTER TABLE "public"."recordatorios_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tenant_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "subdominio" "text" NOT NULL,
    "plan" "text" DEFAULT 'starter'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "custom_domain" "text",
    "subdominio_generico" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "feature_bi" boolean DEFAULT false NOT NULL,
    "feature_whatsapp" boolean DEFAULT false NOT NULL,
    "feature_recordatorios" boolean DEFAULT false NOT NULL,
    "max_pacientes" integer DEFAULT 100 NOT NULL,
    "max_citas_mes" integer DEFAULT 200 NOT NULL,
    "direccion" "text" DEFAULT ''::"text",
    "telefono" "text" DEFAULT ''::"text",
    "logourl" "text" DEFAULT ''::"text",
    "primarycolor" "text" DEFAULT '#0a1e3d'::"text",
    "secondarycolor" "text" DEFAULT '#185FA5'::"text",
    "accentcolor" "text" DEFAULT '#138A6B'::"text",
    "whatsapptemplate" "text" DEFAULT 'Hola {nombre_paciente},\n\nTe recordamos tu turno en *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n\nConfirma o cancela tu turno acá:\n{link}'::"text",
    "mp_preapproval_id" "text",
    "subscription_status" "text" DEFAULT 'inactive'::"text",
    "next_payment_date" timestamp with time zone
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."tenants_public" AS
 SELECT "id",
    "nombre",
    "direccion",
    "telefono",
    "logourl",
    "primarycolor",
    "secondarycolor",
    "accentcolor",
    "whatsapptemplate",
    "subdominio_generico",
    "custom_domain"
   FROM "public"."tenants"
  WHERE ("activo" = true);


ALTER VIEW "public"."tenants_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tratamientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "precio_base" numeric(10,2),
    "duracion_default" integer DEFAULT 30,
    "activo" boolean DEFAULT true,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."tratamientos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turnos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "apellido" "text" NOT NULL,
    "email" "text" NOT NULL,
    "telefono" "text" NOT NULL,
    "servicio" "text" NOT NULL,
    "fecha" "date" NOT NULL,
    "hora" "text" NOT NULL,
    "notas" "text",
    "estado" "text" DEFAULT 'pendiente'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a'::"uuid" NOT NULL
);


ALTER TABLE "public"."turnos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_contactos" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "telefono" "text",
    "nombre" "text",
    "ultimo_contacto" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."whatsapp_contactos" OWNER TO "postgres";


ALTER TABLE "public"."whatsapp_contactos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."whatsapp_contactos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bloqueos"
    ADD CONSTRAINT "bloqueos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."citas"
    ADD CONSTRAINT "citas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."config_fidelizacion"
    ADD CONSTRAINT "config_fidelizacion_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "public"."costos_fijos"
    ADD CONSTRAINT "costos_fijos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."egresos_manuales"
    ADD CONSTRAINT "egresos_manuales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_post_visita"
    ADD CONSTRAINT "feedback_post_visita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historial_dental"
    ADD CONSTRAINT "historial_dental_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historial_puntos"
    ADD CONSTRAINT "historial_puntos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingresos_manuales"
    ADD CONSTRAINT "ingresos_manuales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logs_envios"
    ADD CONSTRAINT "logs_envios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_mensual"
    ADD CONSTRAINT "meta_mensual_mes_anio_key" UNIQUE ("mes", "anio");



ALTER TABLE ONLY "public"."meta_mensual"
    ADD CONSTRAINT "meta_mensual_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paciente_fotos"
    ADD CONSTRAINT "paciente_fotos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pacientes"
    ADD CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pacientes"
    ADD CONSTRAINT "pacientes_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."perfil_doctor"
    ADD CONSTRAINT "perfil_doctor_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premios"
    ADD CONSTRAINT "premios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recordatorios_log"
    ADD CONSTRAINT "recordatorios_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_user_id_tenant_id_key" UNIQUE ("user_id", "tenant_id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_custom_domain_key" UNIQUE ("custom_domain");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_subdominio_generico_key" UNIQUE ("subdominio_generico");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_subdominio_key" UNIQUE ("subdominio");



ALTER TABLE ONLY "public"."tratamientos"
    ADD CONSTRAINT "tratamientos_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."tratamientos"
    ADD CONSTRAINT "tratamientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turnos"
    ADD CONSTRAINT "turnos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."perfil_doctor"
    ADD CONSTRAINT "uq_perfil_doctor_tenant" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."whatsapp_contactos"
    ADD CONSTRAINT "whatsapp_contactos_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_bloqueos_tenant" ON "public"."bloqueos" USING "btree" ("tenant_id");



CREATE INDEX "idx_bloqueos_tenant_fecha" ON "public"."bloqueos" USING "btree" ("tenant_id", "fecha");



CREATE INDEX "idx_citas_paciente" ON "public"."citas" USING "btree" ("paciente_id");



CREATE INDEX "idx_citas_tenant" ON "public"."citas" USING "btree" ("tenant_id");



CREATE INDEX "idx_citas_tenant_fecha" ON "public"."citas" USING "btree" ("tenant_id", "fecha_hora");



CREATE INDEX "idx_histpuntos_paciente" ON "public"."historial_puntos" USING "btree" ("paciente_id", "creado_en" DESC);



CREATE INDEX "idx_logs_envios_tenant" ON "public"."logs_envios" USING "btree" ("tenant_id");



CREATE INDEX "idx_pacientes_tenant" ON "public"."pacientes" USING "btree" ("tenant_id");



CREATE INDEX "idx_perfil_doctor_tenant" ON "public"."perfil_doctor" USING "btree" ("tenant_id");



CREATE INDEX "idx_recordatorios_log_tenant" ON "public"."recordatorios_log" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenant_users_user" ON "public"."tenant_users" USING "btree" ("user_id");



CREATE INDEX "idx_tratamientos_tenant" ON "public"."tratamientos" USING "btree" ("tenant_id");



CREATE INDEX "idx_turnos_tenant" ON "public"."turnos" USING "btree" ("tenant_id");



CREATE INDEX "idx_whatsapp_contactos_tenant" ON "public"."whatsapp_contactos" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "uq_gasto_por_cita" ON "public"."historial_puntos" USING "btree" ("cita_id") WHERE ("tipo_movimiento" = 'gasto_tratamiento'::"text");



CREATE UNIQUE INDEX "uq_tenants_subdominio_generico" ON "public"."tenants" USING "btree" ("subdominio_generico") WHERE ("subdominio_generico" IS NOT NULL);



CREATE OR REPLACE TRIGGER "sync_turnos_to_sheets" AFTER INSERT OR UPDATE ON "public"."citas" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://turnos-app-delta.vercel.app/api/sync-sheet', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "trigger_turno_to_cita" AFTER INSERT ON "public"."turnos" FOR EACH ROW EXECUTE FUNCTION "public"."sync_turno_to_cita"();



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bloqueos"
    ADD CONSTRAINT "bloqueos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."citas"
    ADD CONSTRAINT "citas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."citas"
    ADD CONSTRAINT "citas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."config_fidelizacion"
    ADD CONSTRAINT "config_fidelizacion_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."costos_fijos"
    ADD CONSTRAINT "costos_fijos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."egresos_manuales"
    ADD CONSTRAINT "egresos_manuales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_post_visita"
    ADD CONSTRAINT "feedback_post_visita_cita_id_fkey" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_post_visita"
    ADD CONSTRAINT "feedback_post_visita_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_post_visita"
    ADD CONSTRAINT "feedback_post_visita_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_dental"
    ADD CONSTRAINT "historial_dental_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_dental"
    ADD CONSTRAINT "historial_dental_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_puntos"
    ADD CONSTRAINT "historial_puntos_aprobado_por_usuario_id_fkey" FOREIGN KEY ("aprobado_por_usuario_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."historial_puntos"
    ADD CONSTRAINT "historial_puntos_cita_id_fkey" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."historial_puntos"
    ADD CONSTRAINT "historial_puntos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_puntos"
    ADD CONSTRAINT "historial_puntos_premio_id_fkey" FOREIGN KEY ("premio_id") REFERENCES "public"."premios"("id");



ALTER TABLE ONLY "public"."historial_puntos"
    ADD CONSTRAINT "historial_puntos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingresos_manuales"
    ADD CONSTRAINT "ingresos_manuales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."logs_envios"
    ADD CONSTRAINT "logs_envios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."meta_mensual"
    ADD CONSTRAINT "meta_mensual_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."paciente_fotos"
    ADD CONSTRAINT "paciente_fotos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."paciente_fotos"
    ADD CONSTRAINT "paciente_fotos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pacientes"
    ADD CONSTRAINT "pacientes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."perfil_doctor"
    ADD CONSTRAINT "perfil_doctor_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."premios"
    ADD CONSTRAINT "premios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id");



ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."recordatorios_log"
    ADD CONSTRAINT "recordatorios_log_cita_id_fkey" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recordatorios_log"
    ADD CONSTRAINT "recordatorios_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."turnos"
    ADD CONSTRAINT "turnos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."whatsapp_contactos"
    ADD CONSTRAINT "whatsapp_contactos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



CREATE POLICY "Service role full access" ON "public"."turnos" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_users_service_only" ON "public"."admin_users" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."bloqueos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."citas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."config_fidelizacion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."costos_fijos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."egresos_manuales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_post_visita" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historial_dental" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historial_puntos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingresos_manuales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logs_envios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_mensual" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paciente_fotos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pacientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfil_doctor" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."premios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presupuestos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recordatorios_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_full_access" ON "public"."tenant_users" TO "service_role" USING (true);



CREATE POLICY "tenant_isolation_bloqueos" ON "public"."bloqueos" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tenant_isolation_citas" ON "public"."citas" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tenant_isolation_config_fidelizacion" ON "public"."config_fidelizacion" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tenant_isolation_costos_fijos" ON "public"."costos_fijos" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_egresos_manuales" ON "public"."egresos_manuales" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_feedback_auth" ON "public"."feedback_post_visita" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tenant_isolation_historial_dental" ON "public"."historial_dental" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_historial_puntos" ON "public"."historial_puntos" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tenant_isolation_ingresos_manuales" ON "public"."ingresos_manuales" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_logs_envios" ON "public"."logs_envios" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_meta_mensual" ON "public"."meta_mensual" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_paciente_fotos" ON "public"."paciente_fotos" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_pacientes" ON "public"."pacientes" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tenant_isolation_perfil_doctor" ON "public"."perfil_doctor" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_premios" ON "public"."premios" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tenant_isolation_presupuestos" ON "public"."presupuestos" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_recordatorios_log" ON "public"."recordatorios_log" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



CREATE POLICY "tenant_isolation_tratamientos" ON "public"."tratamientos" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tenant_isolation_whatsapp_contactos" ON "public"."whatsapp_contactos" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."tenant_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_users_select_own" ON "public"."tenant_users" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "tenant_users_self_read" ON "public"."tenant_users" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_select_own" ON "public"."tenants" FOR SELECT USING ((("id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))) OR ("subdominio_generico" IS NOT NULL)));



ALTER TABLE "public"."tratamientos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."turnos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "turnos_tenant_isolation" ON "public"."turnos" TO "authenticated" USING (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"())))) WITH CHECK (("tenant_id" IN ( SELECT "tenant_users"."tenant_id"
   FROM "public"."tenant_users"
  WHERE ("tenant_users"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."whatsapp_contactos" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."crear_tenant"("p_nombre" "text", "p_subdominio" "text", "p_plan" "text", "p_custom_domain" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_tenant"("p_nombre" "text", "p_subdominio" "text", "p_plan" "text", "p_custom_domain" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_ajustar_puntos_manual"("p_paciente_id" "uuid", "p_puntos_afectados" integer, "p_tipo_movimiento" "text", "p_nota" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_ajustar_puntos_manual"("p_paciente_id" "uuid", "p_puntos_afectados" integer, "p_tipo_movimiento" "text", "p_nota" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_ajustar_puntos_manual"("p_paciente_id" "uuid", "p_puntos_afectados" integer, "p_tipo_movimiento" "text", "p_nota" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_aprobar_asistencia"("p_cita_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_aprobar_asistencia"("p_cita_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_aprobar_asistencia"("p_cita_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_canjear_premio"("p_paciente_id" "uuid", "p_premio_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_canjear_premio"("p_paciente_id" "uuid", "p_premio_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_canjear_premio"("p_paciente_id" "uuid", "p_premio_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_registrar_inasistencia"("p_cita_id" "uuid", "p_estado" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_registrar_inasistencia"("p_cita_id" "uuid", "p_estado" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_registrar_inasistencia"("p_cita_id" "uuid", "p_estado" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_tenant_admin_email"("tid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tenant_admin_email"("tid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_email"("uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_email"("uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_turno_to_cita"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_turno_to_cita"() TO "service_role";



GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";



GRANT ALL ON TABLE "public"."citas" TO "anon";
GRANT ALL ON TABLE "public"."citas" TO "authenticated";
GRANT ALL ON TABLE "public"."citas" TO "service_role";



GRANT ALL ON TABLE "public"."bi_citas_por_dia" TO "anon";
GRANT ALL ON TABLE "public"."bi_citas_por_dia" TO "authenticated";
GRANT ALL ON TABLE "public"."bi_citas_por_dia" TO "service_role";



GRANT ALL ON TABLE "public"."bi_citas_por_tratamiento" TO "anon";
GRANT ALL ON TABLE "public"."bi_citas_por_tratamiento" TO "authenticated";
GRANT ALL ON TABLE "public"."bi_citas_por_tratamiento" TO "service_role";



GRANT ALL ON TABLE "public"."bi_ingresos_por_mes" TO "anon";
GRANT ALL ON TABLE "public"."bi_ingresos_por_mes" TO "authenticated";
GRANT ALL ON TABLE "public"."bi_ingresos_por_mes" TO "service_role";



GRANT ALL ON TABLE "public"."bi_kpis_mes" TO "anon";
GRANT ALL ON TABLE "public"."bi_kpis_mes" TO "authenticated";
GRANT ALL ON TABLE "public"."bi_kpis_mes" TO "service_role";



GRANT ALL ON TABLE "public"."bi_ocupacion_por_hora" TO "anon";
GRANT ALL ON TABLE "public"."bi_ocupacion_por_hora" TO "authenticated";
GRANT ALL ON TABLE "public"."bi_ocupacion_por_hora" TO "service_role";



GRANT ALL ON TABLE "public"."pacientes" TO "anon";
GRANT ALL ON TABLE "public"."pacientes" TO "authenticated";
GRANT ALL ON TABLE "public"."pacientes" TO "service_role";



GRANT ALL ON TABLE "public"."bi_pacientes_nuevos_por_mes" TO "anon";
GRANT ALL ON TABLE "public"."bi_pacientes_nuevos_por_mes" TO "authenticated";
GRANT ALL ON TABLE "public"."bi_pacientes_nuevos_por_mes" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."bi_resumen" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."bi_resumen" TO "authenticated";
GRANT ALL ON TABLE "public"."bi_resumen" TO "service_role";



GRANT ALL ON TABLE "public"."bloqueos" TO "anon";
GRANT ALL ON TABLE "public"."bloqueos" TO "authenticated";
GRANT ALL ON TABLE "public"."bloqueos" TO "service_role";



GRANT ALL ON TABLE "public"."config_fidelizacion" TO "anon";
GRANT ALL ON TABLE "public"."config_fidelizacion" TO "authenticated";
GRANT ALL ON TABLE "public"."config_fidelizacion" TO "service_role";



GRANT ALL ON TABLE "public"."costos_fijos" TO "anon";
GRANT ALL ON TABLE "public"."costos_fijos" TO "authenticated";
GRANT ALL ON TABLE "public"."costos_fijos" TO "service_role";



GRANT ALL ON TABLE "public"."egresos_manuales" TO "anon";
GRANT ALL ON TABLE "public"."egresos_manuales" TO "authenticated";
GRANT ALL ON TABLE "public"."egresos_manuales" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_post_visita" TO "anon";
GRANT ALL ON TABLE "public"."feedback_post_visita" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_post_visita" TO "service_role";



GRANT ALL ON TABLE "public"."historial_dental" TO "anon";
GRANT ALL ON TABLE "public"."historial_dental" TO "authenticated";
GRANT ALL ON TABLE "public"."historial_dental" TO "service_role";



GRANT ALL ON TABLE "public"."historial_puntos" TO "anon";
GRANT ALL ON TABLE "public"."historial_puntos" TO "authenticated";
GRANT ALL ON TABLE "public"."historial_puntos" TO "service_role";



GRANT ALL ON TABLE "public"."ingresos_manuales" TO "anon";
GRANT ALL ON TABLE "public"."ingresos_manuales" TO "authenticated";
GRANT ALL ON TABLE "public"."ingresos_manuales" TO "service_role";



GRANT ALL ON TABLE "public"."logs_envios" TO "anon";
GRANT ALL ON TABLE "public"."logs_envios" TO "authenticated";
GRANT ALL ON TABLE "public"."logs_envios" TO "service_role";



GRANT ALL ON TABLE "public"."meta_mensual" TO "anon";
GRANT ALL ON TABLE "public"."meta_mensual" TO "authenticated";
GRANT ALL ON TABLE "public"."meta_mensual" TO "service_role";



GRANT ALL ON TABLE "public"."paciente_fotos" TO "anon";
GRANT ALL ON TABLE "public"."paciente_fotos" TO "authenticated";
GRANT ALL ON TABLE "public"."paciente_fotos" TO "service_role";



GRANT ALL ON TABLE "public"."perfil_doctor" TO "anon";
GRANT ALL ON TABLE "public"."perfil_doctor" TO "authenticated";
GRANT ALL ON TABLE "public"."perfil_doctor" TO "service_role";



GRANT ALL ON TABLE "public"."premios" TO "anon";
GRANT ALL ON TABLE "public"."premios" TO "authenticated";
GRANT ALL ON TABLE "public"."premios" TO "service_role";



GRANT ALL ON TABLE "public"."presupuestos" TO "anon";
GRANT ALL ON TABLE "public"."presupuestos" TO "authenticated";
GRANT ALL ON TABLE "public"."presupuestos" TO "service_role";



GRANT ALL ON TABLE "public"."recordatorios_log" TO "anon";
GRANT ALL ON TABLE "public"."recordatorios_log" TO "authenticated";
GRANT ALL ON TABLE "public"."recordatorios_log" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_users" TO "anon";
GRANT ALL ON TABLE "public"."tenant_users" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_users" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tenants" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT UPDATE("nombre") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("direccion") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("telefono") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("logourl") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("primarycolor") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("secondarycolor") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("accentcolor") ON TABLE "public"."tenants" TO "authenticated";



GRANT UPDATE("whatsapptemplate") ON TABLE "public"."tenants" TO "authenticated";



GRANT ALL ON TABLE "public"."tenants_public" TO "anon";
GRANT ALL ON TABLE "public"."tenants_public" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants_public" TO "service_role";



GRANT ALL ON TABLE "public"."tratamientos" TO "anon";
GRANT ALL ON TABLE "public"."tratamientos" TO "authenticated";
GRANT ALL ON TABLE "public"."tratamientos" TO "service_role";



GRANT ALL ON TABLE "public"."turnos" TO "anon";
GRANT ALL ON TABLE "public"."turnos" TO "authenticated";
GRANT ALL ON TABLE "public"."turnos" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_contactos" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_contactos" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_contactos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."whatsapp_contactos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."whatsapp_contactos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."whatsapp_contactos_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







