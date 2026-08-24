# DO-6 · Modelo multirol — propuesta final de implementación

**22/08/2026 · DISEÑO CERRADO. Nada implementado.**

Revisión crítica del diseño previo con las decisiones del owner incorporadas. Todo lo afirmado sobre el estado actual está verificado contra `remote_schema.sql` y `src/`. Lo que no pude verificar está marcado **NO VERIFICADO**.

---

## 1 · Decisiones cerradas

| | Decisión | Consecuencia técnica |
|---|---|---|
| **DO-6.1** | 4 roles: `owner` 100 · `admin` 80 · `odontologo` 50 · `staff` 30 | Catálogo con FK. `odontologo` **no existe hoy en ninguna línea del código** |
| **DO-6.2** | `admin` **no** otorga `admin`. Nadie otorga `owner` por invitación | `puede_otorgar_rol` usa `>` **estricto** |
| **DO-6.3** | `ON DELETE RESTRICT` sobre `auth.users` | Viable, pero **inconsistente con `tenant_users`, que ya tiene `CASCADE`** — ver §15 |
| **DO-6.4** | Multirol antes del piloto | Entra en la ruta crítica del lanzamiento |

**La jerarquía estricta implementa DO-6.2 exactamente:**

| Otorgante | ¿`owner`? | ¿`admin`? | ¿`odontologo`? | ¿`staff`? |
|---|---|---|---|---|
| `owner` (100) | ❌ 100>100 falso | ✅ | ✅ | ✅ |
| `admin` (80) | ❌ | ❌ 80>80 falso | ✅ | ✅ |
| `odontologo` (50) | ❌ | ❌ | ❌ | ✅ 50>30 |
| `staff` (30) | ❌ | ❌ | ❌ | ❌ |

⚠️ **Efecto no pedido:** con `>` estricto, un `odontologo` puede otorgar `staff`. Si no lo querés, la regla no es jerárquica sino una matriz explícita. **DECISIÓN DEL OWNER.**

---

## 2 · Invariantes de seguridad

Enunciados que deben ser verdaderos **siempre**, por cualquier camino —UI, API, SQL, `service_role`, migración—. Cada uno tiene un test obligatorio en §14.

| | Invariante | Dónde se sostiene |
|---|---|---|
| **I-1** | Ningún tenant queda sin al menos un `owner` | Trigger `BEFORE DELETE/UPDATE` |
| **I-2** | Nadie otorga un rol de jerarquía ≥ a la propia | `puede_otorgar_rol()` + trigger `BEFORE INSERT` |
| **I-3** | `owner` solo se crea por alta de clínica o transferencia explícita | Trigger + ruta dedicada |
| **I-4** | Nadie se otorga un rol a sí mismo | Trigger: `otorgado_por <> user_id`, salvo alta de clínica |
| **I-5** | El catálogo `roles` es inmutable desde la aplicación | Sin policies de escritura + `REVOKE` |
| **I-6** | Un rol fuera del catálogo es imposible | FK a `roles(codigo)` |
| **I-7** | `tiene_rol()` responde solo sobre quien la llama | Sin parámetro `p_user_id`. **Invariante de firma** |
| **I-8** | Ausencia de dato = denegación | `EXISTS` devuelve `false`, nunca `NULL` |

**I-7 es el más frágil porque es social, no técnico.** Nada impide que alguien agregue el parámetro en el futuro. El test lo fija.

---

## 3 · Modelo final

### 3.1 · Lo que NO se toca

**43 policies** consultan `tenant_users` para **pertenencia**:

```sql
tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
```

No mencionan rol. **No se modifica ninguna.** Tocar `tenant_users` obliga a reescribir 43 policies en una migración, y un error deja a alguien sin historia clínica.

Constraints verificados que se conservan:

```
tenant_users_pkey                  PRIMARY KEY (id)
tenant_users_user_id_tenant_id_key UNIQUE (user_id, tenant_id)
tenant_users_tenant_id_fkey        FK → tenants(id) ON DELETE CASCADE
tenant_users_user_id_fkey          FK → auth.users(id) ON DELETE CASCADE
```

### 3.2 · Catálogo

```sql
CREATE TABLE public.roles (
  codigo    text PRIMARY KEY,
  nombre    text NOT NULL,
  jerarquia integer NOT NULL UNIQUE,
  CONSTRAINT roles_jerarquia_positiva CHECK (jerarquia > 0)
);
```

`UNIQUE` sobre `jerarquia`: dos roles con el mismo número hacen ambiguo el `>` estricto y reabren DO-6.2 por la puerta de atrás.

### 3.3 · Autorización

```sql
CREATE TABLE public.tenant_user_roles (
  tenant_id    uuid NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id)  ON DELETE RESTRICT,   -- DO-6.3
  rol          text NOT NULL REFERENCES roles(codigo)   ON DELETE RESTRICT,
  otorgado_por uuid          REFERENCES auth.users(id)  ON DELETE SET NULL,
  otorgado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, rol),
  CONSTRAINT tur_pertenece_al_tenant
    FOREIGN KEY (user_id, tenant_id) REFERENCES tenant_users(user_id, tenant_id) ON DELETE CASCADE
);
```

Tres decisiones que merecen explicación:

**`tur_pertenece_al_tenant`** apoya sobre `tenant_users_user_id_tenant_id_key`. Hace **estructuralmente imposible** tener un rol sin pertenencia. Sin esto, quitar a alguien del equipo le deja los roles colgando, y si vuelve a entrar los recupera sin que nadie los otorgue.

**`otorgado_por` es `SET NULL`, no `RESTRICT`.** Si fuera RESTRICT, no podrías borrar nunca a un usuario que alguna vez otorgó un rol. El rastro se pierde parcialmente; la alternativa es no poder dar de baja a nadie.

**`tenant_id` sigue en `CASCADE`.** Borrar una clínica debe llevarse sus roles. Lo que DO-6.3 protege es el usuario, no el tenant.

### 3.4 · `tenant_users.role` pasa a ser caché derivada

**Esta es mi principal corrección a tu diseño.** Tu regla 12 pide *minimizar* la ventana de doble fuente. **Se puede eliminar por completo.**

```sql
CREATE OR REPLACE FUNCTION public.sincronizar_rol_legado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid; v_user uuid; v_rol text;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_user   := COALESCE(NEW.user_id,   OLD.user_id);

  SELECT tur.rol INTO v_rol
  FROM tenant_user_roles tur JOIN roles r ON r.codigo = tur.rol
  WHERE tur.tenant_id = v_tenant AND tur.user_id = v_user
  ORDER BY r.jerarquia DESC LIMIT 1;

  UPDATE tenant_users SET role = COALESCE(v_rol, 'staff')
  WHERE tenant_id = v_tenant AND user_id = v_user;

  RETURN NULL;
END $$;
```

`tenant_users.role` queda con el rol de **mayor jerarquía**. Consecuencias:

- Las **4 policies RLS** y las **8 rutas** siguen leyendo la columna vieja y **obtienen la respuesta correcta** sin cambiar una línea
- La ventana de §9 deja de existir: no hay dos verdades, hay una verdad y una vista materializada
- Alguien con `admin` + `odontologo` aparece como `admin` en la columna legada — correcto para chequeos de `admin||owner`
- Alguien con **solo** `odontologo` aparece como `odontologo` → los chequeos `admin||owner` lo **deniegan**. Correcto y fail-closed
- El `COALESCE(..., 'staff')` cubre el caso de quedarse sin roles: cae al mínimo, nunca a `admin`

⚠️ **Contrapartida honesta:** la migración de las policies y rutas deja de ser urgente, y lo que no es urgente no se hace. **La columna legada tiene que tener fecha de eliminación** o vas a convivir con ella un año.

---

## 4 · Matriz de roles y permisos

Derivada de lo que el código verifica **hoy** (8 rutas + 4 policies + 2 funciones). No inventa permisos.

| Capacidad | Dónde se verifica | `owner` | `admin` | `odontologo` | `staff` |
|---|---|:-:|:-:|:-:|:-:|
| Ver pacientes, agenda, historia | RLS de pertenencia | ✅ | ✅ | ✅ | ✅ |
| Editar historia clínica | RLS de pertenencia | ✅ | ✅ | ✅ | ✅ |
| Configurar facturación ARCA | `arca_config_write` | ✅ | ✅ | ❌ | ❌ |
| Anular facturas | `facturacion/anular` | ✅ | ✅ | ❌ | ❌ |
| Plantillas de consentimiento | `plantillas_write` | ✅ | ✅ | ❌ | ❌ |
| Campañas CRM | `crm_campanas_write` | ✅ | ✅ | ❌ | ❌ |
| Editar datos de la clínica | `tenants_update_own` | ✅ | ✅ | ❌ | ❌ |
| Exportar datos | `pacientes/exportar` | ✅ | ✅ | ❌ | ❌ |
| Gestionar equipo | `equipo/*` | ✅ | ✅ | ❌ | ❌ |
| Cancelar suscripción | `billing/cancelar` | ✅ | ✅ | ❌ | ❌ |
| Ajustar puntos *(hoy oculto)* | `fn_ajustar_puntos_manual` | ✅ | ✅ | ❌ | ❌ |
| Canjear premio *(hoy oculto)* | `fn_canjear_premio` | ✅ | ✅ | ❌ | ✅ |
| Otorgar roles | `puede_otorgar_rol` | admin↓ | odont↓ | staff | ❌ |
| Transferir ownership | Ruta dedicada | ✅ | ❌ | ❌ | ❌ |

🔴 **`odontologo` y `staff` tienen exactamente los mismos permisos sobre datos clínicos.** La única diferencia entre los cuatro roles hoy es administrativa. **Un odontólogo y una secretaria ven lo mismo: toda la historia clínica de todos los pacientes.**

Eso no lo arregla DO-6 — es Fase 2 (`FORCE RLS`, policies por operación). **Pero significa que implementar los 4 roles NO reduce la exposición de datos clínicos**, solo la administrativa. Conviene saberlo antes de decir que el sistema "tiene control de acceso por rol".

---

## 5 · Flujo de otorgamiento

```sql
CREATE OR REPLACE FUNCTION public.puede_otorgar_rol(p_tenant_id uuid, p_rol text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT
    -- Nadie otorga owner por esta vía. DO-6.2, explícito y no derivado
    -- de la aritmética: si mañana cambia una jerarquía, esto sigue firme.
    p_rol <> 'owner'
    AND EXISTS (SELECT 1 FROM roles WHERE codigo = p_rol)      -- I-6, fail-closed
    AND COALESCE((
      SELECT max(r.jerarquia) FROM tenant_user_roles tur
        JOIN roles r ON r.codigo = tur.rol
       WHERE tur.user_id = auth.uid() AND tur.tenant_id = p_tenant_id
    ), 0) > (SELECT jerarquia FROM roles WHERE codigo = p_rol)
$$;

REVOKE ALL ON FUNCTION public.puede_otorgar_rol(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_otorgar_rol(uuid, text) TO authenticated, service_role;
```

**`p_rol <> 'owner'` va explícito** aunque `>` estricto ya lo impide. Redundancia deliberada: es el invariante I-3 y no debe depender de que nadie edite una fila de `roles`.

**Fail-closed en tres puntos:** rol inexistente → `EXISTS` false. Sin roles → `COALESCE(...,0)` → `0 > n` false. Jerarquía nula → comparación `NULL` → false.

**La función NO alcanza sola.** Todas las escrituras de equipo pasan por `service_role`, que **ignora RLS**. El control real es el trigger:

```sql
CREATE OR REPLACE FUNCTION public.validar_otorgamiento_rol()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  -- Excepción única: el alta de clínica crea su primer owner sin otorgante.
  IF NEW.rol = 'owner' AND NEW.otorgado_por IS NULL THEN
    IF EXISTS (SELECT 1 FROM tenant_user_roles
                WHERE tenant_id = NEW.tenant_id AND rol = 'owner') THEN
      RAISE EXCEPTION 'Ya existe un owner en este tenant. Usá la transferencia explícita.';
    END IF;
    RETURN NEW;   -- primer owner de una clínica nueva
  END IF;

  IF NEW.otorgado_por IS NULL THEN
    RAISE EXCEPTION 'Todo rol otorgado debe registrar quién lo otorgó.';
  END IF;

  IF NEW.otorgado_por = NEW.user_id THEN
    RAISE EXCEPTION 'Nadie puede otorgarse un rol a sí mismo.';   -- I-4
  END IF;

  IF NEW.rol = 'owner' THEN
    RAISE EXCEPTION 'El rol owner solo se asigna por transferencia explícita.';  -- I-3
  END IF;

  IF COALESCE((SELECT max(r.jerarquia) FROM tenant_user_roles tur
                 JOIN roles r ON r.codigo = tur.rol
                WHERE tur.user_id = NEW.otorgado_por
                  AND tur.tenant_id = NEW.tenant_id), 0)
     <= (SELECT jerarquia FROM roles WHERE codigo = NEW.rol) THEN
    RAISE EXCEPTION 'Jerarquía insuficiente para otorgar el rol %.', NEW.rol;  -- I-2
  END IF;

  RETURN NEW;
END $$;
```

El trigger **no usa `auth.uid()`**: lee `NEW.otorgado_por`. Así funciona igual desde `service_role`, donde `auth.uid()` es `NULL`.

---

## 6 · Transferencia de ownership

DO-6.2 la saca de la invitación normal. Necesita ruta propia, atómica y auditada.

```sql
CREATE OR REPLACE FUNCTION public.transferir_ownership(
  p_tenant_id uuid, p_nuevo_owner uuid, p_conservar_admin boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_actual uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenant_user_roles
                  WHERE tenant_id = p_tenant_id AND user_id = v_actual AND rol = 'owner') THEN
    RAISE EXCEPTION 'Solo el owner actual puede transferir la propiedad.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenant_users
                  WHERE tenant_id = p_tenant_id AND user_id = p_nuevo_owner) THEN
    RAISE EXCEPTION 'El destinatario no pertenece a esta clínica.';
  END IF;

  IF p_nuevo_owner = v_actual THEN
    RAISE EXCEPTION 'Ya sos el owner de esta clínica.';
  END IF;

  -- Orden deliberado: primero se crea el nuevo owner, después se saca el viejo.
  -- Al revés, entre las dos sentencias el tenant queda sin owner y el trigger
  -- de I-1 aborta la transacción entera.
  INSERT INTO tenant_user_roles (tenant_id, user_id, rol, otorgado_por)
  VALUES (p_tenant_id, p_nuevo_owner, 'owner', v_actual)
  ON CONFLICT DO NOTHING;

  DELETE FROM tenant_user_roles
  WHERE tenant_id = p_tenant_id AND user_id = v_actual AND rol = 'owner';

  IF p_conservar_admin THEN
    INSERT INTO tenant_user_roles (tenant_id, user_id, rol, otorgado_por)
    VALUES (p_tenant_id, v_actual, 'admin', p_nuevo_owner)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
```

**El trigger de §5 bloquea `rol = 'owner'`.** La función lo evade porque es `SECURITY DEFINER` con dueño `postgres`… **y eso no alcanza: los triggers SÍ se disparan para el dueño.** Hace falta una marca de contexto:

```sql
-- Dentro de transferir_ownership, antes del INSERT:
PERFORM set_config('app.transferencia_en_curso', 'true', true);   -- true = local a la transacción
```

Y en el trigger:

```sql
IF NEW.rol = 'owner' AND current_setting('app.transferencia_en_curso', true) = 'true' THEN
  RETURN NEW;
END IF;
```

⚠️ **Esto es un bypass deliberado y hay que mirarlo con desconfianza.** `set_config(..., true)` es local a la transacción, así que no persiste. Pero **cualquier función `SECURITY DEFINER` que alguien agregue en el futuro puede setear esa variable y saltarse I-3.** Es la pieza más delicada del diseño. La alternativa —una tabla de "transferencias autorizadas"— es más segura y más pesada. **DECISIÓN DEL OWNER.**

---

## 7 · Protección del último owner

```sql
CREATE OR REPLACE FUNCTION public.proteger_ultimo_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_tenant uuid; v_owners integer;
BEGIN
  v_tenant := OLD.tenant_id;
  IF OLD.rol <> 'owner' THEN RETURN COALESCE(NEW, OLD); END IF;

  -- El tenant se está borrando: la cascada es legítima.
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_tenant) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) INTO v_owners FROM tenant_user_roles
  WHERE tenant_id = v_tenant AND rol = 'owner'
    AND NOT (user_id = OLD.user_id);

  IF v_owners = 0 THEN
    RAISE EXCEPTION 'No se puede dejar la clínica sin propietario.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_proteger_ultimo_owner
BEFORE DELETE OR UPDATE ON tenant_user_roles
FOR EACH ROW EXECUTE FUNCTION proteger_ultimo_owner();
```

### Los caminos que tu regla 8 pide cubrir

| Camino | ¿Lo cubre el trigger? |
|---|---|
| `DELETE` directo de `tenant_user_roles` | ✅ |
| `UPDATE` que cambia el rol | ✅ |
| Transferencia de ownership | ✅ — por eso el INSERT va antes del DELETE |
| Quitar al miembro del equipo (`tenant_users` DELETE) | ✅ vía `tur_pertenece_al_tenant` CASCADE → dispara el trigger |
| Borrar el usuario de Auth | ✅ `RESTRICT` aborta antes |
| Borrar el tenant | ✅ permitido a propósito |
| `service_role` por API | ✅ **los triggers no son RLS: se disparan igual** |
| `TRUNCATE tenant_user_roles` | ❌ **los triggers de fila NO se disparan en TRUNCATE** |
| `ALTER TABLE ... DISABLE TRIGGER` | ❌ requiere ser dueño |

Los dos últimos son riesgo residual, en §15.

🔴 **Y la guarda que existe hoy está mal para este modelo.** `equipo/miembros/route.ts` cuenta `role IN ('owner','admin')`:

```ts
if ((objetivo as any).role === 'owner' || (objetivo as any).role === 'admin') {
  const { data: responsables } = await supabaseAdmin
    .from('tenant_users').select('user_id')
    .eq('tenant_id', tenantId).in('role', ['owner', 'admin'])
  if ((responsables || []).length <= 1) { ...bloquea... }
}
```

Protege *"al menos un responsable"*, no *"al menos un owner"*. **Con DO-6.2 eso es insuficiente:** una clínica puede quedar con puros `admin`, y ningún `admin` puede crear un `owner`. Hay que cambiarla en M-5.

---

## 8 · Migración de datos

```sql
-- ── Paso 1 · Detección. ANTES de tocar nada. ──
DO $$
DECLARE r record; v_n integer := 0;
BEGIN
  FOR r IN
    SELECT tu.tenant_id, tu.user_id, tu.role
    FROM tenant_users tu
    WHERE tu.role IS NULL OR tu.role NOT IN (SELECT codigo FROM roles)
  LOOP
    RAISE WARNING 'Rol fuera de catálogo · tenant_id=% user_id=% role=%',
                  r.tenant_id, r.user_id, coalesce(r.role, '<NULL>');
    v_n := v_n + 1;
  END LOOP;

  IF v_n > 0 THEN
    RAISE EXCEPTION 'DO-6: % membresía(s) con rol fuera del catálogo. '
                    'Resolver a mano. NO se migra nada.', v_n;
  END IF;
END $$;
```

**Esto es lo que pediste en tu regla 10 y es correcto pedirlo.** Sin esta guarda, un `INSERT ... WHERE role IN (...)` saltea las filas malas **en silencio** y esa persona queda sin ningún rol: sin error, sin aviso, sin acceso. Y `role` es `text` sin `CHECK`, así que un `'Admin'` con mayúscula es perfectamente posible hoy.

```sql
-- ── Paso 2 · Idempotencia (tu regla 11) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenant_user_roles) THEN
    IF EXISTS (
      SELECT tenant_id, user_id FROM tenant_users
      EXCEPT SELECT tenant_id, user_id FROM tenant_user_roles
    ) THEN
      RAISE EXCEPTION 'DO-6: tenant_user_roles tiene datos pero no cubre todas '
                      'las membresías. Migración parcial previa: revisar a mano.';
    END IF;
    RAISE NOTICE 'DO-6: ya migrado. Sin cambios.';
    RETURN;
  END IF;
END $$;

-- ── Paso 3 · Migración ──
INSERT INTO tenant_user_roles (tenant_id, user_id, rol, otorgado_por, otorgado_en)
SELECT tu.tenant_id, tu.user_id, tu.role, NULL, COALESCE(tu.creado_en, now())
FROM tenant_users tu
ON CONFLICT (tenant_id, user_id, rol) DO NOTHING;

-- ── Paso 4 · Verificación ──
DO $$
DECLARE v_a integer; v_b integer; v_sin_owner integer;
BEGIN
  SELECT count(*) INTO v_a FROM tenant_users;
  SELECT count(DISTINCT (tenant_id, user_id)) INTO v_b FROM tenant_user_roles;
  IF v_a <> v_b THEN
    RAISE EXCEPTION 'DO-6: % membresías vs % migradas.', v_a, v_b;
  END IF;

  SELECT count(*) INTO v_sin_owner FROM tenants t
  WHERE NOT EXISTS (SELECT 1 FROM tenant_user_roles
                     WHERE tenant_id = t.id AND rol = 'owner');
  IF v_sin_owner > 0 THEN
    RAISE WARNING 'DO-6: % clínica(s) SIN OWNER tras migrar. Ver §15/C-1.', v_sin_owner;
  END IF;
END $$;
```

🔴 **Con los datos de hoy, el paso 4 va a emitir ese WARNING.** Los 2 usuarios en producción son **ambos `admin`**. **No hay ningún `owner`.** Migrar tal cual produce una clínica sin propietario, y con DO-6.2 nadie va a poder crear uno. **Hay que decidir qué usuario pasa a `owner` ANTES de M-2.**

**DECISIÓN DEL OWNER:** cuál de los dos `user_id` queda como `owner`.

⚠️ **El trigger de §5 debe crearse DESPUÉS de esta migración**, o rechaza cada fila por `otorgado_por IS NULL`.

---

## 9 · Orden exacto de migraciones

| | Migración | Reversible | Lee alguien |
|---|---|---|---|
| **M-1** | `roles` + seed de los 4 + RLS + `REVOKE` | ✅ `DROP` | Nadie |
| **M-2** | `tenant_user_roles` + RLS + detección + migración + verificación | ✅ `DROP` | Nadie |
| **M-2b** | 🔴 **Promover un `admin` a `owner`** (§8) | ✅ | Nadie |
| **M-3** | Triggers: `validar_otorgamiento_rol`, `proteger_ultimo_owner`, `sincronizar_rol_legado` | ✅ `DROP TRIGGER` | — |
| **M-4** | Cuerpo nuevo de `tiene_rol()` + `puede_otorgar_rol()` + `transferir_ownership()` | ✅ cuerpo anterior | **Acá empieza** |
| **M-5** | API: validar rol en `invitar`, corregir la guarda del último owner, ruta de transferencia | ✅ revert | — |
| **M-6** | UI de equipo multirol | ✅ revert | — |
| **M-7** | Las 4 policies RLS → `tiene_rol()`. **Una migración por policy** | ✅ | — |
| **M-8** | `tenant_users.role`: quitar `DEFAULT` | ✅ | — |
| **M-9** | *(≥4 semanas)* `DROP COLUMN tenant_users.role` | ❌ | — |

### Por qué no hay ventana de doble verdad

`sincronizar_rol_legado` entra en **M-3, antes** de que `tiene_rol()` cambie en M-4. Desde M-3, `tenant_users.role` es una proyección de `tenant_user_roles`. Las 4 policies y las 8 rutas leen esa proyección y **coinciden con el modelo nuevo por construcción**.

Tu regla 12 pedía minimizar la ventana. **Esta secuencia la elimina.** No hay instante en que dos fuentes discrepen.

**Riesgo del enfoque:** si el trigger de sincronización falla o se desactiva, las dos fuentes divergen **en silencio**. El test T-14 de §14 lo cubre.

**M-7 va de a una policy por migración.** Son cuatro tablas distintas: un error deja a la clínica sin facturar, sin plantillas, sin CRM o sin editar sus datos.

---

## 10 · Migración de RLS

### Las 43 de pertenencia: no se tocan

Preguntan si el usuario pertenece al tenant. Eso no cambió. Migrarlas sería trabajo sin beneficio y riesgo alto.

### Las 4 de rol

Patrón, idéntico para las cuatro:

```sql
-- ANTES
USING (tenant_id IN (SELECT tenant_id FROM tenant_users
                      WHERE user_id = auth.uid() AND role IN ('admin','owner')))
-- DESPUÉS
USING (tiene_rol(tenant_id, ARRAY['owner','admin']))
```

⚠️ **`tenants_update_own` no sigue el patrón.** Su columna es `id`, no `tenant_id`: `tiene_rol(id, ARRAY[...])`. Copiar el patrón sin mirar produce una policy que compila y no filtra nada.

### RLS de las tablas nuevas

```sql
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_lectura ON roles FOR SELECT TO authenticated USING (true);
-- Sin policies de escritura: nadie escribe vía PostgREST.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON roles FROM authenticated, anon;
GRANT SELECT ON roles TO authenticated;

ALTER TABLE tenant_user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tur_lectura_propio_tenant ON tenant_user_roles
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tenant_user_roles FROM authenticated, anon;
```

🔴 **Advertencia sobre tu regla 5.** Pedís revisar la RLS *"para evitar que un usuario pueda otorgarse roles"*. **La RLS no es el control acá.**

Verificado: `tenant_users` tiene `service_role_full_access` y `tenant_users_select_own`, **sin ninguna policy de escritura para `authenticated`**. Toda la gestión de equipo pasa por `service_role` desde el servidor — está documentado en el encabezado de `equipo/miembros/route.ts`. **`service_role` ignora RLS.**

Las policies de arriba sirven de defensa en profundidad y para el día que algo se mueva al cliente. **Los controles reales son los triggers de §5 y §7, que sí se disparan para `service_role`.** Decir lo contrario sería consuelo falso.

---

## 11 · Migración de API

Las 8 rutas hacen lo mismo. Tu regla 14 pide no duplicar lógica: **un helper, una sola definición.**

```ts
// src/lib/autorizacion.ts
export const ROLES = ['owner', 'admin', 'odontologo', 'staff'] as const
export type Rol = typeof ROLES[number]

/** Verifica pertenencia Y roles en un solo lugar. Fail-closed. */
export async function exigirRol(tenantId: string, roles: Rol[]) { /* ... */ }
```

**Gracias a la caché derivada (§3.4), las 8 rutas siguen funcionando sin cambios durante M-4 a M-6.** La migración al helper es refactor de calidad, no de seguridad, y puede ir después del piloto.

### `/api/equipo/invitar` — tu regla 15

Verificado línea por línea:

| Requisito | Estado hoy |
|---|---|
| No aceptar `tenantId` arbitrario | ✅ **Ya cumple.** `.eq('user_id', user.id).eq('tenant_id', tenantId)` |
| Validar que el rol exista | ❌ `role: role || 'staff'`, sin validar |
| Impedir `owner` | ❌ **R-2, confirmado en código** |
| Impedir `admin` si invita un `admin` | ❌ |
| Usar `puede_otorgar_rol()` | ❌ no existe |
| Fallar cerrado ante rol desconocido | ❌ falla abierto: guarda la cadena tal cual |

**Uno de seis ya está.** El comentario del código muestra que alguien ya corrigió ahí un bug de multi-clínica — no hay que rehacerlo.

Corrección propuesta:

```ts
const rolPedido = typeof role === 'string' ? role.trim() : 'staff'
if (!ROLES.includes(rolPedido as Rol)) {
  return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
}
if (rolPedido === 'owner') {
  return NextResponse.json(
    { error: 'La propiedad se transfiere, no se invita.' }, { status: 403 })
}
const { data: puede } = await supabaseAdmin
  .rpc('puede_otorgar_rol', { p_tenant_id: tenantId, p_rol: rolPedido })
if (!puede) {
  return NextResponse.json({ error: 'Tu rol no permite otorgar ese rol' }, { status: 403 })
}
```

⚠️ **`puede_otorgar_rol` usa `auth.uid()`, que con `service_role` es `NULL`** → `COALESCE(...,0)` → `0 > n` → **siempre false**. Habría que llamarla con el cliente del usuario, no con `supabaseAdmin`. **Si no, la ruta rechaza a todo el mundo, incluido el owner.** Es el error más fácil de cometer en toda esta migración.

---

## 12 · Migración de UI

`equipo/page.tsx` mapea `owner|admin|else → Staff`. Un `odontologo` aparecería como **"Staff (Secretaria)"** — un odontólogo etiquetado como secretaria en la pantalla del equipo.

Cambios: badges desde `roles.nombre`; multi-selección al invitar; ocultar roles que `puede_otorgar_rol` deniega; botón de transferencia visible solo para `owner`, con confirmación por escrito; y **quitar "SVG" del texto de subida de logo** *(no es de DO-6, es de P0-09; lo anoto para que no se pierda)*.

---

## 13 · Rollback

| Desde | Cómo | Pérdida |
|---|---|---|
| M-1..M-3 | `DROP TABLE tenant_user_roles, roles CASCADE` | Ninguna |
| M-4 | `CREATE OR REPLACE tiene_rol` con el cuerpo de `20260820180200` | Ninguna |
| M-5..M-6 | `git revert` | Ninguna |
| M-7 | Recrear cada policy desde `remote_schema.sql` | Ninguna |
| M-8 | `ALTER TABLE tenant_users ALTER COLUMN role SET DEFAULT 'admin'` | Ninguna |
| **M-9** | **Ninguno** | **Total** |

**Todo es reversible salvo M-9**, y M-9 no se ejecuta sin backups automáticos funcionando —hoy no existen— ni antes de 4 semanas de operación estable.

**El rollback de M-4 es el único con ventana de riesgo:** entre revertir `tiene_rol()` y revertir el trigger de sincronización, los roles otorgados en el modelo nuevo ya están reflejados en la columna legada. Al revertir, **esos roles persisten**. Es rollback de código, no de datos. Hay que decidir si además se revierten los datos.

---

## 14 · Tests obligatorios

Harness PGlite existente (`fidelizacion-roles.test.ts` como molde). **Todos deben fallar contra el estado previo**, o no prueban nada.

**Invariantes** — T-1 a T-8, uno por invariante de §2. Los críticos:

- **T-1** · borrar el último `owner` falla; con dos owners, funciona
- **T-2** · `admin` otorgando `admin` falla; `owner` otorgando `admin` funciona
- **T-3** · `INSERT` directo de `rol='owner'` sin transferencia falla
- **T-4** · `otorgado_por = user_id` falla
- **T-7** · 🔴 **`tiene_rol` no acepta `p_user_id`** — se verifica leyendo `pg_proc.proargnames`. Es un test sobre la *firma*, no sobre el comportamiento
- **T-8** · `tiene_rol(NULL, ...)`, `tiene_rol(uuid, NULL)`, `tiene_rol(uuid, ARRAY[]::text[])` → los tres `false`

**Compatibilidad con B1.2/B1.3** — T-9 a T-11. `fn_ajustar_puntos_manual` y `fn_canjear_premio` deben comportarse **idénticamente** antes y después de M-4. Los 28 tests de `fidelizacion-roles.test.ts` corren contra el modelo nuevo **sin modificarse**. Si hay que tocarlos, la firma cambió y eso es una regresión.

**Migración** — T-12 rechaza un rol fuera de catálogo nombrando `tenant_id`/`user_id`/`role`; T-13 correr la migración dos veces no duplica ni falla.

**Sincronización** — **T-14** 🔴 el más importante y el que no está en tu lista: tras cada `INSERT`/`UPDATE`/`DELETE` en `tenant_user_roles`, `tenant_users.role` debe igualar el rol de mayor jerarquía. Sin esto, las 4 policies y las 8 rutas leen datos viejos y nadie se entera.

**Privilegios** — T-15: `anon` sin `EXECUTE` sobre `tiene_rol`, `puede_otorgar_rol` y `transferir_ownership`; `authenticated` con `EXECUTE` sobre las tres.

**Transferencia** — T-16 a T-18: solo el `owner` transfiere; a alguien que no pertenece falla; en ningún instante intermedio el tenant queda sin owner.

---

## 15 · Riesgos residuales

### 🔴 C-1 · Bloqueo permanente sin recuperación — **el defecto más grave de tus decisiones**

DO-6.2 dice que nadie otorga `owner` por invitación, y la transferencia exige **ser** owner.

**Si el único `owner` de una clínica se pierde** —renuncia, pierde el email, fallece, borra la cuenta— **esa clínica queda sin propietario para siempre.** Los `admin` no pueden crear uno. La transferencia requiere un owner que ya no existe. Y con DO-6.3 tampoco se puede borrar al usuario para rehacer el vínculo.

Es un escenario común en un SaaS de clínicas chicas: el dueño es el odontólogo titular, y esa persona rota.

**No hay vía de escape en tu diseño.** Hace falta una, y `admin_users` —que existe: `(id, email, creado_en)`, solo `service_role`— es el lugar natural:

```sql
-- Excepción de plataforma en transferir_ownership: un admin_users puede
-- transferir sin ser owner del tenant. Toda invocación queda registrada.
IF EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()) THEN
  ... permitir, con asiento obligatorio en una tabla de auditoría ...
END IF;
```

**DECISIÓN DEL OWNER.** Sin esto, la primera clínica que pierda a su dueño es un incidente sin herramienta, resoluble solo con SQL manual en producción — que es justo lo que este proyecto viene tratando de eliminar.

### 🔴 C-2 · `RESTRICT` es viable, pero deja `tenant_users` inconsistente

**Verificado:** `tenant_users_user_id_fkey` ya es `ON DELETE CASCADE` sobre `auth.users`.

Con `tenant_user_roles` en `RESTRICT`, borrar un usuario de Auth **aborta la transacción completa**. Es lo que pedís en DO-6.3, y funciona. Pero:

- **`tenant_users` queda con una CASCADE que nunca puede dispararse.** Código muerto que miente sobre el comportamiento. Conviene alinearlo a `RESTRICT`. **DECISIÓN DEL OWNER.**
- **El Dashboard de Supabase va a fallar** al borrar un usuario, con un error de FK crudo y sin explicación. **NO VERIFICADO:** cómo presenta GoTrue ese error.
- **`registro/route.ts:133` hace `deleteUser` como rollback.** ✅ **Verificado que es seguro:** ocurre *antes* de cualquier `INSERT` en `tenant_users`, así que no hay roles todavía.
- **NO VERIFICADO:** si el borrado interno de GoTrue usa una ruta que ignore la FK.

### 🟡 C-3 · La marca de transferencia es un bypass

`app.transferencia_en_curso` (§6) permite saltarse I-3. Es local a la transacción, pero **cualquier `SECURITY DEFINER` futura puede setearla**. La alternativa —tabla de transferencias autorizadas con token de un solo uso— es más segura y más pesada.

### 🟡 C-4 · Los roles solo suman

`max(jerarquia)` implica que ningún rol puede **restar** permisos. No existe "odontólogo suspendido". Si hace falta, este modelo no lo soporta.

### 🟡 C-5 · `TRUNCATE` y `DISABLE TRIGGER`

Los triggers de fila no se disparan en `TRUNCATE`. Mitigación: `REVOKE TRUNCATE` (ya en §10) — pero `service_role` conserva todo. `DISABLE TRIGGER` exige ser dueño. Aceptables, pero deben quedar escritos.

### 🟡 C-6 · El catálogo es inmutable para la app, no para `service_role`

Cualquier ruta con `SUPABASE_SERVICE_ROLE_KEY` puede reescribir `roles.jerarquia` y romper todo el modelo. **Es la misma superficie que ya existe** para toda la base. No la agrava, pero la vuelve más valiosa: `CRON_SECRET` sin rotar sigue abierto en el tablero.

### 🟢 C-7 · DO-6 no reduce la exposición de datos clínicos

Como muestra §4: `odontologo` y `staff` ven **exactamente lo mismo** que `admin` en pacientes, historia clínica y fotos. Las 43 policies de pertenencia no distinguen rol.

**Implementar DO-6 mejora el control administrativo, no el clínico.** No es un defecto del diseño —es Fase 2— pero **sí sería un defecto describirlo de otro modo** ante una clínica.

---

## 16 · Criterio GO / NO-GO

### NO-GO si alguna es cierta

| | Condición |
|---|---|
| 1 | Existe algún tenant sin `owner` tras M-2 |
| 2 | **C-1 sin resolver** — no hay vía de recuperación del último owner |
| 3 | Algún test de §14 en rojo, o alguno no falla contra el estado previo |
| 4 | Los 28 tests de `fidelizacion-roles.test.ts` requirieron modificación |
| 5 | `anon` tiene `EXECUTE` sobre cualquiera de las tres funciones nuevas |
| 6 | T-14 no verifica la sincronización de la columna legada |
| 7 | Los 4 roles no se ejercitaron en staging con un usuario real cada uno |
| 8 | **No existen backups automáticos** *(hoy: NO existen)* |

### GO cuando

1. M-1 a M-8 aplicadas y verificadas, cada una con su asiento en la bitácora
2. Los 18 tests en verde, y los 28 de fidelización **sin tocar**
3. Cuatro usuarios de prueba en staging, uno por rol, con la matriz de §4 recorrida a mano
4. C-1 resuelto y **probado**: simular la pérdida del owner y recuperarla
5. Transferencia de ownership ejecutada de punta a punta en staging
6. Backups automáticos activos y un restore verificado
7. Rollback de M-4 ensayado en local
8. `tenant_users.role` sigue existiendo *(M-9 no se ejecuta antes del piloto)*

### Qué NO es criterio de GO

**Que `odontologo` esté implementado no significa que un odontólogo vea menos que un admin.** Ver C-7. Confundir las dos cosas al describirle el producto a una clínica sería una afirmación falsa sobre protección de datos médicos.

---

## Resumen de decisiones pendientes

| | Decisión | Bloquea |
|---|---|---|
| **1** | 🔴 **C-1** · vía de recuperación del último owner | **GO** |
| **2** | 🔴 Cuál de los 2 `admin` actuales pasa a `owner` | **M-2b** |
| **3** | ¿`tenant_users_user_id_fkey` también a `RESTRICT`? | M-2 |
| **4** | ¿Marca de transacción o tabla de transferencias? | M-4 |
| **5** | ¿`odontologo` puede otorgar `staff`? | M-4 |
