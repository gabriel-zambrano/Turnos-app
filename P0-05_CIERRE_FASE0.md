# P0-05 · Cierre FASE 0

**Fecha:** 15/08/2026 · **Tipo:** solo lectura
**Nada ejecutado sobre Supabase. Ningún archivo de producción modificado. Ningún commit. `.git` sin tocar. Los 4 archivos del usuario intactos.**

---

## 0 · Impedimento de acceso — se mantiene

No tengo vía a la base. Verificado:

```
psql          AUSENTE
pg_dump       AUSENTE
supabase CLI  AUSENTE
egress        curl https://supabase.co → 000
```

`.env.local` tiene `SUPABASE_SERVICE_ROLE_KEY`, pero sin salida de red no hay conexión, y PostgREST no expone `pg_proc`, `pg_class.relacl` ni `pg_default_acl`. **No intenté ningún bypass.**

**Por regla fundamental tuya —evidencia de producción sobre suposición del repositorio— A-1, A-2 y A-3 no pueden cerrarse hoy.** Marco todo dato de producción como NO VERIFICADO.

**Lo que sí hizo esta sesión:** auditar mi propio script contra los pasos 3, 5, 6 y 7. **Estaba incompleto en cuatro áreas.** Las consultas faltantes están en §9. Y aparecieron **dos hallazgos nuevos** desde el repositorio, uno de ellos relevante.

---

## 1 · Estado de A-1

### Las 14 funciones — identificación

Barrí `supabase/migrations/*.sql` **y** los 20 `.sql` sueltos de la raíz. Son **14 funciones en el esquema `public`**, y las 14 se declaran `SECURITY DEFINER`.

**Corrección a documentos previos:** `generar_codigo_enlace` **es** `SECURITY DEFINER`. En `P0-05_FASE1_DISENO.md` la clasifiqué como que no lo era. Ese documento dice 12; son 14.

### Tabla de producción

| función | firma | owner | security | volatility | search_path | anon | authenticated | service_role | otros |
|---|---|---|---|---|---|---|---|---|---|
| `fn_ajustar_puntos_manual` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `fn_canjear_premio` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `fn_aprobar_asistencia` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `fn_registrar_inasistencia` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `emitir_factura_con_detalle` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `crear_tenant` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `emitir_enlace_turno` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `get_user_email` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `get_tenant_admin_email` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `sync_turno_to_cita` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `sync_valor_cita` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `sync_cobrado_cita` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `sembrar_renglon_cita` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `generar_codigo_enlace` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |

> **NO VERIFICADO — motivo exacto:** `pg_proc` requiere sesión SQL. Sin `psql`, sin CLI, sin egress.

**Respeté tu instrucción de PASO 3:** no agrupo por nombre. Cada firma con sus argumentos es una identidad distinta, y **si producción tuviera dos sobrecargas del mismo nombre, el repositorio no lo mostraría**. La consulta usa `pg_get_function_identity_arguments()`, que devuelve la identidad completa.

### Hipótesis del repositorio — a contrastar, no evidencia

| función | firma declarada | `REVOKE FROM PUBLIC` | GRANT declarado | modifica datos | saltea RLS |
|---|---|:---:|---|:---:|:---:|
| `fn_ajustar_puntos_manual` | `(uuid, integer, text, text) → json` | ✅ `:1621` | `authenticated`, `service_role` | ✅ | ✅ |
| `fn_canjear_premio` | `(uuid, uuid) → json` | ✅ `:1633` | `authenticated`, `service_role` | ✅ | ✅ |
| `fn_aprobar_asistencia` | `(uuid) → json` | ✅ `:1627` | `authenticated`, `service_role` | ✅ | ✅ |
| `fn_registrar_inasistencia` | `(uuid, text) → json` | ✅ `:1639` | `authenticated`, `service_role` | ✅ | ✅ |
| `emitir_factura_con_detalle` | 17 args | ✅ `:267` | `authenticated` | ✅ | ✅ |
| `crear_tenant` | `(text, text, text, text)` | ✅ `:1616` | `service_role` | ✅ | ✅ |
| `emitir_enlace_turno` | `(uuid)` | ✅ `:161` + bucle `:168` | **ninguno** | ✅ | ✅ |
| `get_user_email` | `(uuid)` | ✅ `:1650` | `service_role` | ❌ | ✅ |
| `get_tenant_admin_email` | `(uuid)` | ✅ `:1645` | `service_role` | ❌ | ✅ |
| `sync_turno_to_cita` | `() → trigger` | ✅ `:1655` | `service_role` | ✅ | ✅ |
| `sync_valor_cita` | `() → trigger` | ❌ | *(default)* | ✅ | ✅ |
| `sync_cobrado_cita` | `() → trigger` | ❌ | *(default)* | ✅ | ✅ |
| `sembrar_renglon_cita` | `() → trigger` | ❌ | *(default)* | ✅ | ✅ |
| **`generar_codigo_enlace`** | `() → text` | **❌** | *(default → PUBLIC)* | ❌ | ✅ *(sin efecto)* |

`search_path` declarado: `'public', 'pg_temp'` en las 10 no-trigger. **Si en producción alguna tiene `search_path` vacío es hallazgo nuevo** — una `SECURITY DEFINER` sin `search_path` fijo es secuestrable por esquema.

### Huellas para comparar contra `pg_get_functiondef()`

md5 del cuerpo normalizado (espacios colapsados):

| función | copias en repo | ¿idénticas? | huella |
|---|:---:|---|---|
| `fn_ajustar_puntos_manual` | 2 | ✅ | `5cbd955856` |
| `fn_canjear_premio` | 2 | ✅ | `7dc9bdecc5` |
| `fn_aprobar_asistencia` | 2 | ✅ | `0b33fd9ea4` |
| `fn_registrar_inasistencia` | 2 | ✅ | `33dda49c94` |
| `emitir_factura_con_detalle` | 1 | — | `291c9c75a0` |
| `crear_tenant` | 1 | — | `cc0447dd93` |
| `emitir_enlace_turno` | 1 | — | `50deb6de60` |
| `get_user_email` | 1 | — | `f78358d33d` |
| `get_tenant_admin_email` | 1 | — | `4fb93de935` |
| `sync_turno_to_cita` | 1 | — | `afe4bc04ff` |
| `sync_valor_cita` | 1 | — | `28535a224b` |
| `sync_cobrado_cita` | 1 | — | `6d3a9cca00` |
| `sembrar_renglon_cita` | 1 | — | `763b29b6ac` |
| `generar_codigo_enlace` | 1 | — | `009f35b048` |

**Las 4 duplicadas entre `remote_schema.sql` y `supabase_migration_sprint_5_fidelizacion.sql` son byte-idénticas.** Eso elimina una ambigüedad: no importa cuál se aplicó. **Sigue sin saberse si producción coincide con alguna de las dos.**

### Anomalías a marcar cuando lleguen los datos

| # | Qué buscar | Por qué |
|---|---|---|
| 1 | `prosecdef = false` en alguna de las 14 | El repo dice que las 14 son DEFINER |
| 2 | `proconfig` nulo o sin `search_path` | Secuestro por esquema |
| 3 | `owner ≠ postgres` | Cambia qué RLS saltea |
| 4 | `anon` con EXECUTE en algo que no sea `generar_codigo_enlace` | R-5 dejaría de ser aislado |
| 5 | Sobrecargas del mismo nombre | El repo no las mostraría |
| 6 | Funciones en `public` fuera de las 14 | Inventario incompleto |
| 7 | md5 distinto del de arriba | **Bloqueante para B1.2/B1.3** |

### Estado A-1

🔴 **BLOQUEADO.** No es seguro tocar B1.2/B1.3. Si el cuerpo vivo difiere, un `CREATE OR REPLACE` armado sobre el repositorio pisaría lógica en uso y el rollback restauraría una versión que nunca corrió. La pérdida sería silenciosa.

---

## 2 · Estado de A-2

### 2.1 · Las 12 tablas de R-1

| tabla | relacl | anon S/I/U/D | auth S/I/U/D | RLS | FORCE RLS | policies | origen del privilegio |
|---|---|---|---|---|---|---|---|
| `pagos` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `facturas` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `factura_items` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `factura_pagos` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `tratamiento_items` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `arca_config` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `consentimientos_firmados` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `plantillas_consentimiento` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `crm_campanas` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `crm_envios` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `enlaces_turno` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `ingresos_manuales_duplicados_respaldo` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |

> **NO VERIFICADO — motivo exacto:** `pg_class.relacl` y `has_table_privilege()` requieren sesión SQL.

**Sobre "distinguí privilegio explícito de heredado":** PostgreSQL **no registra la procedencia** de un privilegio. `relacl` muestra el estado final; no dice si vino de un `GRANT` escrito a mano o de un `ALTER DEFAULT PRIVILEGES`. La inferencia se hace **cruzando dos hechos**:

1. Que la tabla **no tenga `GRANT` explícito en ninguna migración** → verificable en el repo, y es el caso de las 12.
2. Que `relacl` **muestre a `anon`** → requiere producción.

Si ambas se cumplen, el privilegio es heredado. **La segunda mitad falta.**

**Hecho del repositorio, verificable:** ninguna de las 12 tiene `GRANT` explícito. De las 35 tablas creadas, 23 lo tienen y 12 no.

**Hipótesis sobre RLS declarada:**

| tabla | RLS declarada | policies declaradas |
|---|:---:|:---:|
| `pagos` | ✅ | 1 |
| `facturas` | ✅ | 2 |
| `factura_items` | ✅ | 1 |
| `factura_pagos` | ✅ | 1 |
| `tratamiento_items` | ✅ | 1 |
| `arca_config` | ✅ | 2 *(una por rol)* |
| `consentimientos_firmados` | ✅ | 2 |
| `plantillas_consentimiento` | ✅ | 2 *(una por rol)* |
| `crm_campanas` | ✅ | 2 *(una por rol)* |
| `crm_envios` | ✅ | 1 |
| `enlaces_turno` | ✅ | **0** |
| `ingresos_manuales_duplicados_respaldo` | ✅ | 1 |

**`FORCE ROW LEVEL SECURITY` no aparece declarado en ninguna migración, para ninguna tabla.** Importa: sin `FORCE`, **el dueño de la tabla ignora RLS**. Como el dueño es `postgres`, toda función `SECURITY DEFINER` sigue saltando RLS aunque las políticas sean perfectas. **Que en producción esté o no activo: NO VERIFICADO.**

### 2.2 · Default privileges

| rol creador | esquema | tipo | privilegios | equivale a |
|---|---|---|---|---|
| NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |

> **NO VERIFICADO — motivo exacto:** `pg_default_acl` requiere sesión SQL.

**Declarado en el repositorio** (`remote_schema.sql:1884-1907`), **12 statements**, todos `FOR ROLE postgres IN SCHEMA public`:

| líneas | tipo | roles |
|---|---|---|
| 1884-1887 | SEQUENCES | `postgres`, `anon`, `authenticated`, `service_role` |
| 1894-1897 | FUNCTIONS | `postgres`, **`anon`**, **`authenticated`**, `service_role` |
| 1904-1907 | TABLES | `postgres`, **`anon`**, **`authenticated`**, `service_role` |

| statement | ¿en el repo? | línea | ¿vivo? |
|---|:---:|---|---|
| `GRANT ALL ON TABLES TO anon` | ✅ | `:1905` | **NO VERIFICADO** |
| `GRANT ALL ON TABLES TO authenticated` | ✅ | `:1906` | **NO VERIFICADO** |
| `GRANT ALL ON FUNCTIONS TO anon` | ✅ | `:1895` | **NO VERIFICADO** |
| `GRANT ALL ON FUNCTIONS TO authenticated` | ✅ | `:1896` | **NO VERIFICADO** |

**No supongo el rol propietario.** El repo dice `postgres`, pero en Supabase las migraciones pueden correr como `postgres` o `supabase_admin`. **Un default privilege `FOR ROLE X` solo aplica a objetos creados por X.** Si producción tiene entradas para otro rol, el análisis cambia por completo. La consulta devuelve `defaclrole` sin asumirlo.

**Secuencias (PASO 5):** el repo declara los 4 statements de `SEQUENCES`, incluido `anon`. **Impacto menor** — `USAGE` sobre una secuencia solo permite consumir números, no leer datos. Pero si el diseño v2 agrega una tabla con `serial`, la secuencia nacería concedida. Lo dejo registrado, no propongo tocarlo.

### 2.3 · Funciones ejecutables por `anon`

> **NO VERIFICADO — motivo exacto:** requiere `proacl` / `has_function_privilege()`.

**Hipótesis:** de las 14, **13 tienen `REVOKE ALL … FROM PUBLIC`**. La única sin revocar:

```
generar_codigo_enlace()  →  SECURITY DEFINER, RETURNS text, sin REVOKE
```

En PostgreSQL `EXECUTE` va a `PUBLIC` por defecto. Sin `REVOKE`, `anon` la alcanza vía `POST /rest/v1/rpc/generar_codigo_enlace`.

**Riesgo, leyendo el cuerpo completo: bajo.** No toca ninguna tabla — deriva 12 caracteres base32 de `gen_random_uuid()`. Devuelve un código nuevo, no uno existente. Lo objetable es que el `SECURITY DEFINER` es **innecesario** y que es la única grieta en un esquema por lo demás disciplinado.

**¿R-5 es aislado?** Según el repositorio sí. **En producción NO VERIFICADO** — y es exactamente el tipo de afirmación que no debe darse por buena sin mirar.

### Estado A-2

🔴 **BLOQUEADO.** **B1.1 y B1.6 no deben diseñarse en firme sobre la hipótesis del repositorio.**

---

## 3 · Estado de A-3

### Estructura — verificada en el repositorio

```sql
historial_puntos (
  id                        uuid PK  DEFAULT gen_random_uuid()
  tenant_id                 uuid     NOT NULL
  paciente_id               uuid     NOT NULL   → pacientes(id) ON DELETE CASCADE
  cita_id                   uuid                → citas(id)     ON DELETE SET NULL
  premio_id                 uuid                → premios(id)
  tipo_movimiento           text     NOT NULL   CHECK (6 valores)
  puntos_afectados          integer  NOT NULL
  monto_gasto_origen        numeric              ← reconstruye el origen
  saldo_resultante          integer  NOT NULL
  visita_numero_registrada  integer
  aprobado_por_usuario_id   uuid                 ← ACTOR
  nota                      text
  creado_en                 timestamptz NOT NULL DEFAULT now()
)
```

| pregunta del PASO 6 | respuesta |
|---|---|
| `tenant_id` | ✅ `NOT NULL` |
| `paciente_id` | ✅ `NOT NULL` |
| actor | ✅ `aprobado_por_usuario_id` — **nullable, sin FK a `auth.users`** |
| PK | `id` |
| FK salientes | `paciente_id` CASCADE, `cita_id` SET NULL, `premio_id`, `tenant_id` |
| FK entrantes | **ninguna** |
| triggers | **ninguno** |

**`CHECK` sobre `tipo_movimiento`:** `gasto_tratamiento`, `bonus_asistencia`, `canje_premio`, `ajuste_manual`, `ajuste_reverso`, `migracion_inicial`.

### Índices — verificados

```sql
idx_histpuntos_paciente  ON (paciente_id, creado_en DESC)
uq_gasto_por_cita        UNIQUE ON (cita_id) WHERE tipo_movimiento = 'gasto_tratamiento'
```

El índice único parcial impide acreditar dos veces la misma cita. **No hay índice por `tenant_id` ni por `tipo_movimiento`** — las consultas de A-3 harán seq scan. Sin importancia al volumen actual.

### RLS y políticas — con una discrepancia interna

Una sola política, `tenant_isolation_historial_puntos`, **pero las dos copias del repositorio difieren**:

```sql
-- remote_schema.sql (dump de producción)
USING (tenant_id IN (SELECT tenant_users.tenant_id FROM tenant_users
                     WHERE tenant_users.user_id = (SELECT auth.uid())))

-- supabase_migration_sprint_5_fidelizacion.sql
FOR ALL
USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()))
```

Diferencia: `(SELECT auth.uid())` vs `auth.uid()`. **Es de rendimiento, no de seguridad** — el `SELECT` envuelto permite a Postgres cachear el valor como InitPlan. Semánticamente equivalentes.

**Ninguna de las dos declara `WITH CHECK`.** En PostgreSQL, si se omite, se usa la expresión de `USING` — así que INSERT y UPDATE quedan cubiertos. **No es un agujero, pero es implícito**, y conviene que producción lo confirme.

### Quién escribe y quién lee

| función | operación |
|---|---|
| `fn_ajustar_puntos_manual` | INSERT |
| `fn_canjear_premio` | INSERT |
| `fn_aprobar_asistencia` | INSERT + SELECT |
| `fn_registrar_inasistencia` | INSERT |

**Ninguna ruta de `src/` escribe la tabla.** La única lectura es `src/app/pacientes/[id]/page.tsx:621`, desde el navegador. **Todas las escrituras pasan por funciones `SECURITY DEFINER`** — lo que confirma que B1.2/B1.3 son el punto de control correcto, y que una política RLS sobre esta tabla no las alcanzaría.

### Reconstrucción del origen de los puntos

**Sí, la tabla lo permite.** `monto_gasto_origen` guarda el importe que generó los puntos; `cita_id` los ata a la cita; `visita_numero_registrada` fija la posición en la racha; `aprobado_por_usuario_id` identifica al actor. **Es un ledger completo.** Para DO-2 significa que un ajuste manual grande es auditable a posteriori — siempre que la nota sirva.

### Datos

| métrica | valor |
|---|---|
| filas totales | NO VERIFICADO |
| filas por tenant | NO VERIFICADO |
| `tenant_id` NULL | NO VERIFICADO *(el `NOT NULL` lo impediría; a confirmar)* |
| distribución por tipo | NO VERIFICADO |
| máximo / promedio / p50 / p90 / p95 / p99 | NO VERIFICADO |
| conteos > 100 / 250 / 500 / 1000 | NO VERIFICADO |
| ajustes sin nota útil | NO VERIFICADO |
| distribución por actor | NO VERIFICADO |
| `ars_por_punto`, `ars_valor_canje`, `racha_bonus_puntos` vigentes | NO VERIFICADO |

> **NO VERIFICADO — motivo exacto:** requiere leer filas. Sin conexión.

### DO-2 — no elijo el límite

**No presento ningún número.** Tu instrucción fue presentar los datos que permitan decidir; no hay datos.

Lo único aportable es el marco, que sale del esquema:

```
impacto_ARS = puntos × ars_valor_canje
```

Y **una pregunta que decide casi todo el resultado**: si las cargas iniciales de saldo usaron `migracion_inicial` (que existe como tipo separado) o si se hicieron como `ajuste_manual`. En el primer caso el histórico de ajustes debería ser chico y el límite puede ser bajo; en el segundo habrá outliers legítimos grandes. **La consulta A-3.4 lo resuelve y es la que más mueve el número.**

### Estado A-3

🔴 **BLOQUEADO** en datos. 🟢 **Estructura, índices, RLS, triggers y escritores: verificados en el repositorio.**

---

## 4 · Estado de A-7

### FK — verificada en el repositorio

```sql
-- remote_schema.sql:1331
ALTER TABLE ONLY "public"."presupuestos"
  ADD CONSTRAINT "presupuestos_paciente_id_fkey"
  FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id");
```

| | |
|---|---|
| tabla hija | `presupuestos` |
| columna | `paciente_id`, **`NOT NULL`** |
| ON DELETE | **sin cláusula → `NO ACTION`** |
| ON UPDATE | sin cláusula → `NO ACTION` |
| DEFERRABLE | no declarado → inmediata |

### FK salientes y entrantes

| dirección | constraint | destino | ON DELETE |
|---|---|---|---|
| saliente | `presupuestos_paciente_id_fkey` | `pacientes(id)` | **NO ACTION** |
| saliente | `presupuestos_tenant_id_fkey` | `tenants(id)` | **NO ACTION** |
| entrante | — | — | **ninguna tabla referencia `presupuestos`** |

### Triggers

**Ninguno sobre `presupuestos`.** Inventarié los 5 triggers del esquema (§5, R-8); ninguno la toca.

### Dependencia lógica sin FK

**`presupuestos` no aparece en ningún archivo de `src/`**, salvo dos listas de tablas dentro de tests (`tenant-isolation.test.ts:34`, `vistas-bi.test.ts:340`).

**No hay UI ni API que cree, lea, actualice ni borre presupuestos.** Es una tabla sin código.

Eso **sugiere fuertemente** que está vacía y que el bloqueo sería teórico — pero **es una inferencia, no evidencia**. Pudo cargarse desde el SQL Editor, pudo venir de una funcionalidad removida, o el `count` puede no ser cero por razones que el repositorio no muestra. **`SELECT count(*) FROM presupuestos` es la única forma de saberlo.**

### Las cuatro preguntas

**1 · ¿La FK bloquea el DELETE?**
Según el repositorio, **sí**: `NO ACTION` no diferible → `SQLSTATE 23503` apenas exista un presupuesto del paciente. **En producción: NO VERIFICADO.**

**2 · ¿Cuántos pacientes afectados?**
> **NO VERIFICADO.**

**3 · ¿Ruta alternativa vía `service_role`?**
**Verificado: no.** Todas las llamadas a `.delete()`:

| ruta | cliente | objetivo |
|---|---|---|
| `src/app/pacientes/page.tsx:139` | `supabase` (cookies → `authenticated`) | **`pacientes`** |
| `src/app/api/clinicas/route.ts:114` | `supabaseAdmin` (`service_role`) | `tenants` |
| `src/app/api/registro/route.ts:133` | `supabaseAdmin` | `auth.users` |

**Una sola ruta borra pacientes y usa el cliente `authenticated`.** Para B1.4 eso es bueno: una policy RLS `FOR DELETE` cubriría el 100% de las rutas del código. **Salvedad:** el SQL Editor y cualquier uso directo del `service_role` key siguen saltando RLS. Límite de plataforma.

**4 · ¿Qué mensaje produce hoy?**
**Verificado** — `src/app/pacientes/page.tsx:136-143`:

```ts
const {error} = await supabase.from('pacientes').delete().eq('id',sel.id)
if(error) return msg('Error al eliminar: '+error.message,'error')
setModal(null); msg('Paciente eliminado'); load()
```

Mostraría el mensaje crudo de PostgREST, en inglés, con nombres de tabla y constraint. **No dice "este paciente tiene presupuestos".**

**Y acá está el problema para B1.4.** Los dos modos de falla producen respuestas opuestas:

| mecanismo | resultado | qué ve el usuario |
|---|---|---|
| FK viola | excepción | `Error al eliminar: …` ✅ |
| **RLS deniega** | **0 filas, `error = null`** | **"Paciente eliminado"** ❌ |

**Aplicar B1.4 sin tocar la UI le daría a un odontólogo un mensaje de éxito falso.** No estaba contemplado en el diseño de Fase 1.

### Estado A-7

🟡 **PARCIAL.**

| | |
|---|---|
| ✅ Estructura de la FK | verificada |
| ✅ FK entrantes y salientes | verificadas |
| ✅ Triggers | ninguno |
| ✅ Ausencia de rutas `service_role` | verificada |
| ✅ Mensaje de error | verificado |
| ✅ Ausencia de código que use la tabla | verificada |
| ❌ `count(*)` | **NO VERIFICADO** — decide si el bloqueo es real |
| ❌ FK viva | **NO VERIFICADO** |

---

## 5 · Hallazgos nuevos

### R-8 · Trigger webhook sobre `citas` hacia un dominio que no es el de producción

- **ID:** R-8
- **Severidad:** **Media**

**Evidencia** — `remote_schema.sql:1197`:

```sql
CREATE OR REPLACE TRIGGER "sync_turnos_to_sheets"
  AFTER INSERT OR UPDATE ON "public"."citas"
  FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"(
    'https://turnos-app-delta.vercel.app/api/sync-sheet',
    'POST',
    '{"Content-type":"application/json"}',
    '{}',
    '5000');
```

Y el endpoint receptor, `src/app/api/sync-sheet/route.ts:16-22`:

```ts
const authHeader = req.headers.get("authorization");
if (!process.env.SYNC_SHEET_SECRET || authHeader !== `Bearer ${process.env.SYNC_SHEET_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Impacto — cuatro cosas, ninguna en ningún inventario previo:**

1. **El trigger no manda `Authorization`.** Sus headers son solo `Content-type`. El endpoint exige `Bearer $SYNC_SHEET_SECRET`. **Cada INSERT o UPDATE de `citas` dispara un POST que recibe 401.** La sincronización con Google Sheets está rota, probablemente desde que se agregó el secreto.
2. **El dominio no es el de producción.** Apunta a `turnos-app-delta.vercel.app`; la app vive en `dentaldesk.app`. Si ese deployment todavía resuelve y sirve una versión vieja **sin** el chequeo del secreto, estaría recibiendo datos de citas. **NO VERIFICADO.**
3. **Está en la ruta caliente de escritura**, con timeout de 5000 ms. Afecta a **los 9 caminos que mutan `citas.estado`** identificados en P0-08.
4. **Egress de PII por diseño.** Si funcionara, `/api/sync-sheet` lee `nombre`, `telefono` y `email` del paciente con `service_role` y los escribe en una planilla de Google.

**Recomendación:** verificar si el trigger existe en producción (§9, consulta N-4) y si `turnos-app-delta.vercel.app` sigue vivo. **Decidir si el sync se arregla o se elimina es del owner.**

**¿Bloquea FASE 0?** **No.** No afecta a A-1, A-2, A-3 ni A-7. **Sí debe entrar en el inventario de P0-05 v2** y probablemente en P0-08.

**No lo corrijo.**

---

### R-9 · `FORCE ROW LEVEL SECURITY` no está declarado en ninguna tabla

- **ID:** R-9
- **Severidad:** **Baja-Media** *(informativa mientras `postgres` sea el dueño)*

**Evidencia:** barrí las 35 tablas en todas las migraciones y los 20 `.sql` sueltos. **Cero apariciones de `FORCE ROW LEVEL SECURITY`.**

**Impacto:** sin `FORCE`, **el dueño de la tabla no está sujeto a sus propias políticas RLS**. Como el dueño es `postgres`, toda función `SECURITY DEFINER` la saltea — que es justamente por qué B1.2/B1.3 tienen que verificar el rol *dentro* del cuerpo y no con una policy.

Ya lo había dicho de las funciones. **Lo nuevo es que es una propiedad global del esquema, no un detalle de esas dos.** Ninguna política RLS de DentalDesk restringe a `postgres`, y eso incluye las que escriba la Fase 2.

**Recomendación:** ninguna para Fase 1. Registrarlo para que el diseño de Fase 2 no asuma que una policy alcanza para contener a una `SECURITY DEFINER`. **Activar `FORCE` tendría efectos amplios y no debe considerarse sin evidencia.**

**¿Bloquea FASE 0?** **No.**

**No lo corrijo.**

---

## 6 · Decisiones DO-1 a DO-8

| Decisión | Contexto | Opciones | Recomendación técnica | Riesgo | Decisión owner |
|---|---|---|---|---|---|
| **DO-1** · `TABLES FROM authenticated` en Fase 1 o 2 | El default privilege concede toda tabla nueva a `authenticated`. Solo afecta objetos futuros | (a) Fase 1 · (b) Fase 2 | **(b)** — su falla es *"la pantalla carga vacía"* en producción, no un error en desarrollo | (a) falla silenciosa · (b) toda tabla nueva sigue naciendo concedida | ⬜ |
| **DO-2** · Límite de ajuste de puntos | `fn_ajustar_puntos_manual` no acota magnitud | Depende de los datos | **Ninguna** — sin datos, cualquier número sería inventado | Fijar un límite a ciegas rompe ajustes legítimos o no frena nada | ⬜ **bloqueada por A-3** |
| **DO-3** · ¿Nota obligatoria? | La función hace `COALESCE(p_nota, 'Ajuste manual de puntos')`: hoy **inventa** la nota si llega `NULL` | (a) obligatoria · (b) dejar como está | **(a)** — el ledger ya es completo; sin nota real la auditoría no sirve | (a) rompe un flujo si la UI no manda nota. **Cuánto histórico no cumpliría: NO VERIFICADO** | ⬜ |
| **DO-4** · ¿Odontólogo canjea premios? | `fn_canjear_premio` valida auth, tenant, premio activo, stock y saldo. **No valida rol** | (a) sí · (b) no | **Ninguna** — es política del negocio | (a) más superficie · (b) fricción operativa | ⬜ |
| **DO-5** · ¿Aplicar B1.4? | Policy RLS `FOR DELETE` en `pacientes` → owner/admin | (a) sí · (b) esperar a Fase 2 | **(a) con reserva** — cubre el 100% de las rutas, pero **exige tocar el mensaje de la UI** | **RLS deniega con 0 filas y `error = null` → la UI diría "Paciente eliminado"**. Aplicarlo tal cual da éxito falso | ⬜ |
| **DO-6** · Modelo `owner` | Ver análisis abajo | (a) booleano · (b) roles múltiples · (c) convivir | **Ninguna de forma.** La evidencia solo sostiene que hoy hay dos ejes en una columna | ver abajo | ⬜ |
| **DO-7** · ¿Excepción de contención para R-2? | `equipo/invitar:14` toma `role` del request; `:96`/`:118` lo insertan con `supabaseAdmin` sin whitelist. Un `admin` puede crear un `owner` | (a) corregir en Fase 1 · (b) Fase 2 | **Ninguna** — es tu regla de contención, no una cuestión técnica | (a) rompe la regla "cero archivos de `src/`" · (b) escalada de privilegios sigue abierta | ⬜ |
| **DO-8** · ¿Odontólogo administra plantillas? | `plantillas_write` permite `role IN ('admin','owner')`. Un odontólogo no podría editar las plantillas que hace firmar | (a) sí · (b) no | **Ninguna** — depende de cómo entiendas la responsabilidad clínica | (a) más superficie sobre documentos legales · (b) fricción | ⬜ |

### DO-6 · Análisis ampliado (PASO 8) — sin elegir

**Qué existe hoy — verificado:**

```sql
tenant_users (
  id         uuid PK,
  user_id    uuid NOT NULL,
  tenant_id  uuid NOT NULL,
  role       text NOT NULL DEFAULT 'admin',   -- una columna, sin CHECK
  creado_en  timestamptz DEFAULT now()
)
```

**Qué depende del rol hoy:**

| tipo | dónde | condición |
|---|---|---|
| RLS | `arca_config_write` | `role IN ('admin','owner')` |
| RLS | `plantillas_write` | `role IN ('admin','owner')` |
| RLS | `crm_campanas_write` | `role IN ('admin','owner')` |
| RLS | `tenants_update_own` (UPDATE) | `role IN ('admin','owner')` |
| API | `equipo/invitar:49` | debe ser `admin`/`owner` |
| API | `equipo/miembros:100,124` | idem |
| API | `facturacion/anular:41` | idem |
| API | `facturacion/config:95` | idem |
| API | `pacientes/exportar:19` | idem |

**Qué inconsistencia presenta:**

`owner` responde **quién es dueño** — propiedad, único, no delegable. `odontologo` responde **qué hace** — función, varios, rotativo. **Comparten columna.** Con un solo valor por usuario, la persona "dueño que además ejerce" tiene que elegir entre administrar el negocio y atender clínicamente. En una clínica chica ese es *el* caso, no un borde.

**Qué opción sería técnicamente más segura:** **no lo determino.** Depende de si en el futuro un usuario podrá tener más de una función, y eso es una decisión de producto que no está en el código. Lo que sí sostengo:

- **Cualquier opción que mantenga un eje único deja el caso sin representar.**
- **Cualquier opción que separe los ejes obliga a reescribir las 4 políticas RLS y las 5 rutas de API de arriba.** Ese es el costo real, y es el mismo para las variantes (a) y (b).
- **El costo de (c) —convivir— no es cero:** se paga cada vez que se agregue una política por rol, porque hay que decidir caso por caso si `owner` cuenta como clínico.

**Consecuencia inmediata sobre B1.5:** el `CHECK` de vocabulario **cementa el modelo de un eje** justo cuando quedó demostrado que no alcanza. Por eso propuse partirlo: `B1.5a` (`DEFAULT 'staff'`, seguro e independiente) ahora, `B1.5b` (`CHECK`) después de DO-6.

**No implemento ninguna.**

---

## 7 · FASE 0

| Bloqueante | Estado | Evidencia |
|---|---|---|
| **A-1** | 🔴 **BLOQUEADO** | Sin `pg_proc`. Repo: 14 funciones (no 12), las 4 duplicadas byte-idénticas, huellas md5 listas |
| **A-2** | 🔴 **BLOQUEADO** | Sin `relacl`, `pg_default_acl` ni `proacl`. Repo: 12 tablas sin `GRANT` explícito, 12 default privileges, **`FORCE RLS` en ninguna** |
| **A-3** | 🔴 **BLOQUEADO en datos** · 🟢 estructura | Estructura, PK, FK, 2 índices, política única, cero triggers, 4 escritores: verificados. **Cero filas leídas** |
| **A-4** | 🟢 **RESUELTO** | Entrada 003 — harness con `role`, 84 tests de aislamiento, 471 totales, `tsc` exit 0 |
| **A-5** | 🟢 **RESUELTO** | Entrada 002 — commit `3af93d3` |
| **A-6** | 🔴 **ABIERTO** | DO-6 sin decidir. Evidencia ampliada en §6 |
| **A-7** | 🟡 **PARCIAL** | FK, triggers, ausencia de rutas `service_role`, mensaje de error y ausencia de código: verificados. **`count(*)` NO VERIFICADO** |

**FASE 0 abierta. 2 de 7 cerrados.** No marco nada más como resuelto: falta evidencia real.

---

## 8 · Próximo paso

### Qué falta para escribir P0-05 v2

**Una sola acción tuya:** correr el SQL en el editor de Supabase y pasarme la salida.

`P0-05_FASE0_LECTURA.sql` cubre buena parte, **pero le faltaban cuatro cosas** que este pedido dejó a la vista. Están en §9.

### Qué debe entrar en P0-05 v2, y con qué evidencia

| # | Contenido | Requiere |
|---|---|---|
| 1 | **B1.2/B1.3 sobre el cuerpo VIVO**, no el del repo | A-1 |
| 2 | **B1.6** — revocar `anon` de las 12 tablas, con ACL vivo como línea base | A-2 |
| 3 | **B1.1** ajustada al `defaclrole` real | A-2 |
| 4 | **DO-2 con número justificado** por percentiles | A-3 |
| 5 | **B1.4 con el mensaje de éxito falso resuelto** | ya verificado |
| 6 | **B1.5 partida** en `a` y `b` | A-6/DO-6 |
| 7 | **R-2, R-6, R-7, R-8, R-9** con destino asignado | ya verificado |
| 8 | **B1.1/B1.6 movidas de PGlite a integración SQL** | ya verificado |
| 9 | Confirmar si `presupuestos` bloquea de verdad | A-7 |

### Si corrés una sola consulta

**N-1 de §9** — RLS global cruzado con qué puede leer `anon`. Es la que habría detectado P0-07 antes de que expusiera los $35.341.190, y la que detectaría el próximo caso.

**No escribo migraciones. No implemento B1.1 a B1.7.**

---

## 9 · Consultas que le faltaban al script

Auditar `P0-05_FASE0_LECTURA.sql` contra los pasos 3, 5, 6 y 7 mostró **cuatro huecos**. Estas se agregan; **son solo lectura**, sin `CREATE`, sin objetos temporales.

```sql
-- ═══ N-1 · [PASO 4] RLS global + exposición a anon ─ LA MÁS IMPORTANTE ═══
SELECT c.relname AS objeto,
       CASE c.relkind WHEN 'r' THEN 'tabla' WHEN 'v' THEN 'vista'
                      WHEN 'm' THEN 'matview' WHEN 'p' THEN 'particionada' END AS tipo,
       c.relrowsecurity                                        AS rls_activa,
       c.relforcerowsecurity                                   AS force_rls,
       (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS politicas,
       has_table_privilege('anon',          c.oid, 'SELECT')   AS anon_lee,
       has_table_privilege('anon',          c.oid, 'INSERT')   AS anon_inserta,
       has_table_privilege('anon',          c.oid, 'UPDATE')   AS anon_actualiza,
       has_table_privilege('anon',          c.oid, 'DELETE')   AS anon_borra,
       has_table_privilege('authenticated', c.oid, 'SELECT')   AS auth_lee,
       has_table_privilege('authenticated', c.oid, 'DELETE')   AS auth_borra,
       coalesce(array_to_string(c.relacl, E'\n'), '(ACL nulo)') AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p')
ORDER BY anon_lee DESC, c.relrowsecurity, c.relname;
-- ALERTA: anon_lee = true Y (rls_activa = false O politicas = 0).
-- Excepción conocida: tenants_public.

-- ═══ N-2 · [PASO 3] campos que el script no traía ═══
SELECT n.nspname AS esquema, p.proname AS funcion,
       pg_get_function_identity_arguments(p.oid) AS args_identidad,
       pg_get_function_result(p.oid)             AS retorno,
       pg_get_userbyid(p.proowner)               AS owner,
       l.lanname                                 AS lenguaje,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE'
                          WHEN 's' THEN 'STABLE'
                          WHEN 'v' THEN 'VOLATILE' END          AS volatility,
       p.proisstrict                             AS strict,
       coalesce(array_to_string(p.proconfig, ', '), '(SIN search_path)') AS config,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS srole_exec,
       coalesce(array_to_string(p.proacl, E'\n'), '(ACL nulo = PUBLIC)') AS acl,
       md5(regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g')) AS huella
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language  l ON l.oid = p.prolang
WHERE n.nspname = 'public'
ORDER BY p.prosecdef DESC, p.proname;
-- La huella NO es comparable con las md5 de §1 (normalizan distinto).
-- Sirve para detectar dos funciones idénticas y para comparar entre entornos.

-- ═══ N-3 · [PASO 6] historial_puntos: filas, tenants, NULLs, actores ═══
SELECT count(*)                                    AS filas,
       count(DISTINCT tenant_id)                   AS tenants,
       count(*) FILTER (WHERE tenant_id IS NULL)   AS tenant_null,
       count(*) FILTER (WHERE paciente_id IS NULL) AS paciente_null,
       count(DISTINCT aprobado_por_usuario_id)     AS actores,
       count(*) FILTER (WHERE aprobado_por_usuario_id IS NULL) AS sin_actor,
       min(creado_en)::date                        AS desde,
       max(creado_en)::date                        AS hasta
FROM historial_puntos;

SELECT tenant_id, tipo_movimiento, count(*) AS filas,
       min(puntos_afectados) AS minimo, max(puntos_afectados) AS maximo
FROM historial_puntos
GROUP BY tenant_id, tipo_movimiento
ORDER BY tenant_id, count(*) DESC;

-- ═══ N-4 · [PASO 7 + R-8] triggers vivos ═══
SELECT c.relname AS tabla, t.tgname AS trigger,
       CASE WHEN t.tgtype::int & 1  = 1 THEN 'ROW' ELSE 'STATEMENT' END AS nivel,
       CASE WHEN t.tgtype::int & 2  = 2 THEN 'BEFORE' ELSE 'AFTER' END  AS momento,
       CASE WHEN t.tgtype::int & 4  = 4 THEN 'INSERT ' ELSE '' END ||
       CASE WHEN t.tgtype::int & 8  = 8 THEN 'DELETE ' ELSE '' END ||
       CASE WHEN t.tgtype::int & 16 = 16 THEN 'UPDATE ' ELSE '' END     AS eventos,
       t.tgenabled                        AS habilitado,
       np.nspname || '.' || p.proname     AS funcion,
       pg_get_triggerdef(t.oid)           AS definicion
FROM pg_trigger t
JOIN pg_class     c  ON c.oid = t.tgrelid
JOIN pg_namespace n  ON n.oid = c.relnamespace
JOIN pg_proc      p  ON p.oid = t.tgfoid
JOIN pg_namespace np ON np.oid = p.pronamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
-- Confirma R-8: buscar sync_turnos_to_sheets sobre citas y leer su URL.
-- tgenabled: 'O' = habilitado, 'D' = deshabilitado.

-- ═══ N-5 · [PASO 7] FK completas hacia pacientes y citas ═══
SELECT src.relname AS tabla_hija,
       (SELECT string_agg(a.attname, ', ' ORDER BY x.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum) AS columnas,
       tgt.relname AS tabla_padre, c.conname AS constraint,
       CASE c.confdeltype WHEN 'a' THEN 'NO ACTION (bloquea)'
                          WHEN 'r' THEN 'RESTRICT (bloquea)'
                          WHEN 'c' THEN 'CASCADE'
                          WHEN 'n' THEN 'SET NULL'
                          WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
       CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
                          WHEN 'c' THEN 'CASCADE'   WHEN 'n' THEN 'SET NULL'
                          WHEN 'd' THEN 'SET DEFAULT' END AS on_update,
       c.condeferrable AS diferible
FROM pg_constraint c
JOIN pg_class src ON src.oid = c.conrelid
JOIN pg_class tgt ON tgt.oid = c.confrelid
WHERE c.contype = 'f' AND tgt.relname IN ('pacientes','citas','tenants')
ORDER BY tgt.relname, on_delete, src.relname;

-- ═══ N-6 · [PASO 7] ¿presupuestos bloquea de verdad? ═══
SELECT (SELECT count(*) FROM presupuestos)                    AS filas,
       (SELECT count(DISTINCT paciente_id) FROM presupuestos) AS pacientes_bloqueados,
       (SELECT count(*) FROM pacientes)                       AS pacientes_total;
-- filas = 0 → el bloqueo es teórico y B1.4 puede probarse con normalidad.
-- filas > 0 → el borrado YA falla hoy para esos pacientes.
```

---

## BORRADOR de próxima entrada de bitácora

> # ⚠️ NO PEGAR EN LA BITÁCORA HASTA EJECUTAR Y VERIFICAR
>
> Esta entrada describe una sesión **sin ejecución contra producción**. Solo debe incorporarse
> a `P0-05_BITACORA.md` si aceptás registrar el intento fallido de acceso. Si preferís que la
> bitácora solo tenga pasos ejecutados, **descartala** y esperá a la entrada que documente la
> corrida real del SQL.

```markdown
## 005 · FASE 0 · Intento de recolección de evidencia — sin acceso a la base

**Fecha:** 15/08/2026 · **Etapa:** FASE 0 · **Tipo:** incidente + verificación de repositorio

**Objetivo.** Cerrar A-1, A-2, A-3 y A-7 con evidencia de producción.

**Resultado: no se pudo.** El entorno no tiene vía a la base:

    psql          AUSENTE
    pg_dump       AUSENTE
    supabase CLI  AUSENTE
    egress        curl https://supabase.co → 000

`.env.local` tiene `SUPABASE_SERVICE_ROLE_KEY`, pero sin salida de red no hay conexión, y
PostgREST no expone `pg_proc`, `pg_class.relacl` ni `pg_default_acl`. **No se intentó bypass.**

**Cero consultas ejecutadas contra Supabase. Cero archivos modificados. Cero commits.**

**Lo que sí se verificó — solo repositorio:**

| Área | Hallazgo |
|---|---|
| A-1 | Son **14** funciones, no 12. `generar_codigo_enlace` **es** SECURITY DEFINER |
| A-1 | Las 4 copias duplicadas son **byte-idénticas** tras normalizar espacios |
| A-1 | md5 de las 14 registradas para comparar contra `pg_get_functiondef()` |
| A-2 | **`FORCE ROW LEVEL SECURITY` no está declarado en ninguna tabla** → R-9 |
| A-3 | Estructura, PK, FK, 2 índices, 1 política, **cero triggers**, 4 escritores — todos SECURITY DEFINER |
| A-3 | La política tiene dos redacciones distintas en el repo (`(SELECT auth.uid())` vs `auth.uid()`) — equivalentes |
| A-7 | FK `NO ACTION`, sin FK entrantes, sin triggers |
| A-7 | **`presupuestos` no aparece en ningún archivo de `src/`** — tabla sin código |
| A-7 | Una sola ruta borra pacientes, con cliente `authenticated`. No hay camino `service_role` |
| A-7 | **RLS deniega con 0 filas y `error = null` → la UI mostraría "Paciente eliminado"** |
| nuevo | **R-8** — trigger `sync_turnos_to_sheets` sobre `citas` hacia `turnos-app-delta.vercel.app`, sin header de auth |
| nuevo | **R-9** — ninguna tabla con `FORCE RLS` |

**Auditoría del script.** `P0-05_FASE0_LECTURA.sql` estaba incompleto en 4 áreas
(volatility/strict/retorno, filas y tenants de `historial_puntos`, triggers, FK con `condeferrable`).
Las consultas faltantes quedaron en `P0-05_CIERRE_FASE0.md` §9 como N-1 a N-6.

**Estado de FASE 0:** A-1 🔴 · A-2 🔴 · A-3 🔴 · A-4 🟢 · A-5 🟢 · A-6 🔴 · A-7 🟡

**Verificación.** `git status` sin cambios respecto de la entrada 004.
Métricas sin variación: 471 tests, 21 archivos, `tsc` exit 0.

**Rollback.** N/A — no se modificó nada.
```

---

*Informe de solo lectura. Ninguna consulta ejecutada contra Supabase — no había vía. Ningún archivo de producción modificado. Ningún commit. `.git` sin tocar. Los 4 archivos del usuario intactos. Ningún bypass intentado.*
