-- ═══════════════════════════════════════════════════════════════════════════
-- B1.2 + B1.3 · Verificación de rol, límite de ajuste y nota obligatoria
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ✅ APLICADO EN PRODUCCIÓN — 22/08/2026, vía `supabase db push`.
--    Privilegios verificados después: authenticated ejecuta, anon no.
--    Falta la verificación manual funcional del pie de este archivo.
--
-- QUÉ CAMBIA
--
--   B1.2 · fn_ajustar_puntos_manual
--     + rol ∈ {owner, admin}                        (DO-6)
--     + abs(puntos) ≤ 500                           (DO-2)
--     + nota obligatoria, ≥10 caracteres tras trim  (DO-3)
--     ~ COALESCE(p_nota, '...') → trim(p_nota)
--
--   B1.3 · fn_canjear_premio
--     + rol ∈ {owner, admin, staff}                 (DO-4)
--
-- QUÉ NO CAMBIA
--
--   Firma, retorno, SECURITY DEFINER, owner, search_path. Y ninguna guarda
--   existente: validación de tipo de movimiento, auth.uid() no nulo, lock
--   FOR UPDATE, pertenencia al tenant, saldo no negativo, premio activo,
--   stock y saldo suficiente. Todas se conservan textualmente.
--
-- BASE DE PARTIDA
--
--   El cuerpo vivo obtenido con pg_get_functiondef() en FASE 0 (A-1.2) tiene
--   md5 idéntico al del repositorio: 5cbd955856 y 7dc9bdecc5. El repositorio
--   refleja producción para estas dos funciones.
--
-- POR QUÉ LA VERIFICACIÓN VA DENTRO DEL CUERPO
--
--   Estas funciones son SECURITY DEFINER con dueño postgres, que no está
--   sujeto a RLS. Las políticas de pacientes, premios e historial_puntos NO
--   se evalúan dentro de ellas. Una policy sería decorativa: el único lugar
--   donde el control se aplica es acá adentro.
--
-- POR QUÉ tiene_rol() Y NO UNA CONSULTA DIRECTA
--
--   Costura hacia el modelo multirol de Fase 2 (DO-6). Cuando la verdad de
--   los roles pase a la tabla de asociación, cambia SOLO el cuerpo de
--   tiene_rol(). Estas dos funciones no se vuelven a tocar.
--
--   tiene_rol() usa auth.uid() internamente, no un parámetro: así solo puede
--   responder sobre quien la llama. Con EXECUTE para authenticated, un
--   parámetro permitiría preguntar por terceros.
--
--   SECURITY DEFINER no altera request.jwt.claims, así que auth.uid() dentro
--   de tiene_rol() devuelve el mismo usuario que en la función que la llama.
--   El test #13 lo verifica en vez de darlo por supuesto.
--
-- LOS NÚMEROS ESTÁN DUPLICADOS EN src/lib/ajuste-puntos.ts
--
--   Esa capa es de UX: evita que el usuario reciba un error crudo de
--   PostgreSQL. NO es un control de seguridad — la Server Action es un
--   endpoint y se puede llamar sin pasar por el formulario. **La autoridad
--   es esta función.** Si cambiás 500 o 10 acá, cambialos allá; dos tests
--   fijan esos valores del lado del código.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- B1.2 · fn_ajustar_puntos_manual
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_ajustar_puntos_manual(
  p_paciente_id uuid,
  p_puntos_afectados integer,
  p_tipo_movimiento text,
  p_nota text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_puntos_saldo_cache INTEGER;
  v_new_saldo INTEGER;
  v_nota TEXT;

  -- DO-2. El movimiento legítimo más grande de la historia del sistema es un
  -- gasto_tratamiento de 390 puntos: un tratamiento de $390.000. 500 cubre
  -- ese piso con margen. Se eligió por encima de 400 porque ars_por_punto es
  -- fijo en 1000 y la inflación va a subir los puntos por tratamiento.
  c_limite_ajuste CONSTANT INTEGER := 500;

  -- DO-3. Evita notas que cumplen la letra y no el propósito: ".", "x", "ok".
  c_nota_minima   CONSTANT INTEGER := 10;

  -- Relleno que esta misma función usaba cuando la nota llegaba NULL. Se
  -- rechaza explícitamente: si alguien lo copia y pega, cumple la longitud
  -- sin justificar nada.
  c_nota_relleno  CONSTANT TEXT    := 'Ajuste manual de puntos';
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

  -- ══════════════════ B1.2 · bloques nuevos ══════════════════

  -- Rol (DO-6). Ajustar puntos manualmente mueve dinero: cada punto vale
  -- ars_valor_canje al canjearse. Es una operación administrativa.
  IF NOT tiene_rol(v_tenant_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Solo un administrador puede ajustar puntos manualmente.';
  END IF;

  -- Límite (DO-2). Sobre el valor absoluto: el signo lo decide el tipo de
  -- movimiento, no la magnitud.
  IF abs(p_puntos_afectados) > c_limite_ajuste THEN
    RAISE EXCEPTION 'El ajuste no puede superar los % puntos por operación.', c_limite_ajuste;
  END IF;

  -- Nota (DO-3). El ledger ya registra quién, cuándo, cuánto y sobre quién.
  -- La nota aporta el POR QUÉ, que es lo único irreconstruible después.
  v_nota := trim(coalesce(p_nota, ''));
  IF length(v_nota) < c_nota_minima OR v_nota = c_nota_relleno THEN
    RAISE EXCEPTION 'El ajuste requiere una nota de al menos % caracteres que lo justifique.', c_nota_minima;
  END IF;

  -- ═══════════════════════════════════════════════════════════

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
    p_puntos_afectados, v_new_saldo, v_user_id, v_nota
  );
  RETURN json_build_object(
    'saldo', v_new_saldo,
    'puntos_afectados', p_puntos_afectados
  );
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- B1.3 · fn_canjear_premio
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_canjear_premio(
  p_paciente_id uuid,
  p_premio_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- ══════════════════ B1.3 · bloque nuevo ══════════════════

  -- Rol (DO-4). El odontólogo NO canjea: el canje entrega valor económico y
  -- pertenece al eje administrativo. Quien genera los puntos con su
  -- tratamiento no debería además poder liquidarlos.
  --
  -- ⚠️  v_premio_tenant_id, NO v_tenant_id.
  --     v_tenant_id todavía no está asignado en este punto — se resuelve
  --     recién en el SELECT del paciente, más abajo. Y usar el tenant del
  --     PACIENTE en vez del PREMIO permitiría, si alguien reordenara los
  --     bloques, canjear un premio ajeno descontando stock del catálogo de
  --     otra clínica, con el ledger registrándolo como legítimo.
  IF NOT tiene_rol(v_premio_tenant_id, ARRAY['owner', 'admin', 'staff']) THEN
    RAISE EXCEPTION 'Tu rol no permite canjear premios.';
  END IF;

  -- ═════════════════════════════════════════════════════════

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
$function$;


-- ── Privilegios ──
-- CREATE OR REPLACE preserva el ACL existente, así que esto es defensivo:
-- si alguna vez la función se recreara desde cero, R-17 haría que naciera
-- ejecutable por PUBLIC. Los REVOKE explícitos son la única protección que
-- funciona en este entorno.
REVOKE ALL ON FUNCTION public.fn_ajustar_puntos_manual(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ajustar_puntos_manual(uuid, integer, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_canjear_premio(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_canjear_premio(uuid, uuid) TO authenticated, service_role;


-- ── Verificación ──
DO $$
BEGIN
    IF has_function_privilege('anon', 'public.fn_ajustar_puntos_manual(uuid,integer,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'B1.2: anon puede ejecutar fn_ajustar_puntos_manual';
    END IF;
    IF has_function_privilege('anon', 'public.fn_canjear_premio(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'B1.3: anon puede ejecutar fn_canjear_premio';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.fn_ajustar_puntos_manual(uuid,integer,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'B1.2: authenticated NO puede ejecutar fn_ajustar_puntos_manual — la app se rompe';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.fn_canjear_premio(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'B1.3: authenticated NO puede ejecutar fn_canjear_premio — la app se rompe';
    END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
--
--   CREATE OR REPLACE con el cuerpo previo, guardado antes de aplicar:
--
--     SELECT pg_get_functiondef(oid) FROM pg_proc
--     WHERE oid IN (
--       'public.fn_ajustar_puntos_manual(uuid,integer,text,text)'::regprocedure,
--       'public.fn_canjear_premio(uuid,uuid)'::regprocedure);
--
--   Total, sin datos, sin redeploy. CREATE OR REPLACE preserva el ACL, así
--   que los privilegios no se alteran al revertir.
--
-- VERIFICACIÓN MANUAL POSTERIOR — obligatoria
--
--   1. Ajustar +100 con nota válida como admin → funciona
--   2. Ajustar 501 → mensaje legible en la UI, no un error crudo
--   3. Ajustar con nota de 3 caracteres → idem
--   4. Canjear un premio como admin → funciona
--   5. Marcar asistencia → sigue acreditando puntos
--
--   El punto 5 importa aunque no se toque fn_aprobar_asistencia: comparte
--   historial_puntos con estas dos.
-- ═══════════════════════════════════════════════════════════════════════════
