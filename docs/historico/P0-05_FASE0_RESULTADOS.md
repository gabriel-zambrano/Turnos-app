# P0-05 · FASE 0 · RESULTADOS DE PRODUCCIÓN

**Fecha:** 15/08/2026 · **Tipo:** solo lectura
**Nada ejecutado sobre Supabase. Ningún archivo del repositorio modificado. Ningún commit.**

---

## 0 · IMPEDIMENTO — no pude ejecutar ninguna consulta contra producción

Pediste que ejecutara las consultas. **No tengo ninguna vía a la base.** Lo verifiqué antes de responder:

```
psql          AUSENTE
pg_dump       AUSENTE
supabase CLI  AUSENTE
salida de red curl https://supabase.co → 000 (sin egress)
```

El sandbox donde corro está aislado de la red. `.env.local` contiene `SUPABASE_SERVICE_ROLE_KEY`, pero **no serviría igual**: sin salida de red no hay conexión posible, y aunque la hubiera, PostgREST no expone `pg_get_functiondef`, `pg_default_acl` ni `pg_class.relacl` — esas consultas requieren una sesión SQL, no la API REST.

**No intenté ningún bypass**, según tu regla. No usé el service_role key, no busqué rutas alternativas de red, no traté de alcanzar la base por otro medio.

### Consecuencia sobre el criterio de éxito

**A-1, A-2, A-3 y A-7 NO pueden cerrarse en esta sesión.** Todo dato de producción queda **NO VERIFICADO**.

Lo que sí hice: separar con rigor lo que es evidencia del **repositorio** de lo que sería evidencia de **producción**, y dejar cada consulta lista con su valor esperado, para que al correrlas se vea de inmediato si producción difiere.

**El script está en `P0-05_FASE0_LECTURA.sql`.** Es solo `SELECT` sobre catálogos y datos propios: sin `CREATE`, sin objetos temporales, sin escritura.

> ⚠️ **Advertencia metodológica.** Todo lo que sigue etiquetado `REPOSITORIO` es una **hipótesis sobre producción, no evidencia**. El repositorio ya demostró no ser fuente de verdad: hay 20 archivos `.sql` sueltos en la raíz aplicados a mano, y el `REVOKE` de las vistas `bi_*` del 09/08 no está en ninguna migración.

---

## 1 · A-1 — Funciones vivas

### Estado de producción

| función | firma | owner | SECURITY DEFINER | ACL | anon EXECUTE | authenticated EXECUTE | coincide con repo |
|---|---|---|---|---|---|---|---|
| `fn_ajustar_puntos_manual` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `fn_canjear_premio` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `fn_aprobar_asistencia` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `fn_registrar_inasistencia` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `emitir_factura_con_detalle` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `crear_tenant` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `emitir_enlace_turno` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `get_user_email` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `get_tenant_admin_email` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `sync_turno_to_cita` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `sync_valor_cita` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `sync_cobrado_cita` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `sembrar_renglon_cita` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |
| `generar_codigo_enlace` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | **NO VERIF.** |

> **NO VERIFICADO — motivo exacto:** sin `psql`, sin CLI de Supabase y sin salida de red desde el sandbox. Requiere ejecutar `P0-05_FASE0_LECTURA.sql` §A-1 en el SQL Editor.

### Lo que dice el repositorio — hipótesis a contrastar

| función | firma según repo | SECURITY DEFINER | `REVOKE FROM PUBLIC` | GRANT explícito |
|---|---|:---:|:---:|---|
| `fn_ajustar_puntos_manual` | `(uuid, integer, text, text) → json` | ✅ | ✅ `:1621` | `authenticated`, `service_role` |
| `fn_canjear_premio` | `(uuid, uuid) → json` | ✅ | ✅ `:1633` | `authenticated`, `service_role` |
| `fn_aprobar_asistencia` | `(uuid) → json` | ✅ | ✅ `:1627` | `authenticated`, `service_role` |
| `fn_registrar_inasistencia` | `(uuid, text) → json` | ✅ | ✅ `:1639` | `authenticated`, `service_role` |
| `emitir_factura_con_detalle` | 17 args | ✅ | ✅ `:267` | `authenticated` |
| `crear_tenant` | `(text, text, text, text)` | ✅ | ✅ `:1616` | `service_role` |
| `emitir_enlace_turno` | `(uuid)` | ✅ | ✅ `:161` + bucle `:168` | **ninguno** |
| `get_user_email` | `(uuid)` | ✅ | ✅ `:1650` | `service_role` |
| `get_tenant_admin_email` | `(uuid)` | ✅ | ✅ `:1645` | `service_role` |
| `sync_turno_to_cita` | `() → trigger` | ✅ | ✅ `:1655` | `service_role` |
| `sync_valor_cita` | `() → trigger` | ✅ | ❌ | *(default)* |
| `sync_cobrado_cita` | `() → trigger` | ✅ | ❌ | *(default)* |
| `sembrar_renglon_cita` | `() → trigger` | ✅ | ❌ | *(default)* |
| **`generar_codigo_enlace`** | `() → text` | ✅ | **❌ NINGUNO** | *(default → PUBLIC)* |

Los `search_path` en el repo son `'public', 'pg_temp'` en las 10 no-trigger. **Si en producción alguna tiene `search_path` vacío es un hallazgo nuevo**, porque una `SECURITY DEFINER` sin `search_path` fijo es vulnerable a secuestro por esquema.

### Huellas del repositorio — para comparar contra `md5(pg_get_functiondef(oid))`

Calculé el md5 del cuerpo normalizado (espacios colapsados) de cada copia en el repositorio:

| función | copias en repo | ¿idénticas entre sí? | huella |
|---|:---:|---|---|
| `fn_ajustar_puntos_manual` | 2 | ✅ idénticas | `5cbd955856` |
| `fn_canjear_premio` | 2 | ✅ idénticas | `7dc9bdecc5` |
| `fn_aprobar_asistencia` | 2 | ✅ idénticas | `0b33fd9ea4` |
| `fn_registrar_inasistencia` | 2 | ✅ idénticas | `33dda49c94` |
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

**Las 4 copias duplicadas (`remote_schema.sql` vs `supabase_migration_sprint_5_fidelizacion.sql`) son byte-idénticas tras normalizar espacios.** Eso elimina una fuente de ambigüedad: no importa cuál de las dos se aplicó, el cuerpo es el mismo.

**Lo que sigue sin saberse es si producción coincide con cualquiera de las dos.**

### Diferencias repo vs producción

> **NO VERIFICADO — motivo exacto:** no pude obtener `pg_get_functiondef()` de producción. **No enumero ninguna diferencia porque no tengo con qué comparar.** Afirmar "coinciden" sería exactamente el fallo que el principio final prohíbe.

### Bloqueante A-1

**BLOQUEADO.**

No es seguro modificar B1.2/B1.3 todavía. El riesgo concreto: si el cuerpo vivo difiere del repositorio, un `CREATE OR REPLACE` construido sobre el repo **pisaría lógica que hoy corre**, y el rollback restauraría una versión que nunca estuvo en producción. La pérdida sería silenciosa.

Es la misma clase de error que la auditoría cometió con las vistas `bi_*`: confiar en el dump en vez de mirar la base.

---

## 2 · A-2 — ACL

### 2.1 · Las 12 tablas

| tabla | relacl | anon S/I/U/D | auth S/I/U/D | RLS | FORCE RLS | policies |
|---|---|---|---|---|---|---|
| `pagos` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `facturas` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `factura_items` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `factura_pagos` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `tratamiento_items` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `arca_config` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `consentimientos_firmados` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `plantillas_consentimiento` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `crm_campanas` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `crm_envios` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `enlaces_turno` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |
| `ingresos_manuales_duplicados_respaldo` | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |

> **NO VERIFICADO — motivo exacto:** `pg_class.relacl` y `has_table_privilege()` requieren sesión SQL. Sin egress de red.

**Hipótesis del repositorio, a contrastar:**

| tabla | ¿GRANT explícito? | RLS declarada | policies declaradas |
|---|:---:|:---:|:---:|
| `pagos` | ❌ | ✅ | 1 |
| `facturas` | ❌ | ✅ | 2 |
| `factura_items` | ❌ | ✅ | 1 |
| `factura_pagos` | ❌ | ✅ | 1 |
| `tratamiento_items` | ❌ | ✅ | 1 |
| `arca_config` | ❌ | ✅ | 2 *(una por rol)* |
| `consentimientos_firmados` | ❌ | ✅ | 2 |
| `plantillas_consentimiento` | ❌ | ✅ | 2 *(una por rol)* |
| `crm_campanas` | ❌ | ✅ | 2 *(una por rol)* |
| `crm_envios` | ❌ | ✅ | 1 |
| `enlaces_turno` | ❌ | ✅ | **0** |
| `ingresos_manuales_duplicados_respaldo` | ❌ | ✅ | 1 |

**Ninguna de las 12 tiene `GRANT` explícito en ninguna migración.** Eso es un hecho del repositorio, verificable. **Que por eso hayan heredado el default privilege es una inferencia**, y es justamente lo que hay que confirmar.

**Celda a mirar primero:** cualquier fila donde `anon SELECT = true` **y** (`RLS = false` **o** `policies = 0`). Ese es el patrón que expuso $35.341.190 en las vistas `bi_*`.

### 2.2 · Default privileges

| rol creador | esquema | tipo de objeto | privilegios | equivale a |
|---|---|---|---|---|
| NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. | NO VERIF. |

> **NO VERIFICADO — motivo exacto:** `pg_default_acl` requiere sesión SQL.

**Lo que declara el repositorio** (`remote_schema.sql:1884-1907`) — **12 statements**, todos `FOR ROLE postgres IN SCHEMA public`:

| líneas | tipo | roles |
|---|---|---|
| 1884-1887 | SEQUENCES | `postgres`, `anon`, `authenticated`, `service_role` |
| 1894-1897 | FUNCTIONS | `postgres`, **`anon`**, **`authenticated`**, `service_role` |
| 1904-1907 | TABLES | `postgres`, **`anon`**, **`authenticated`**, `service_role` |

Los cuatro que preguntás, según el repositorio:

| statement | ¿declarado en el repo? | línea | ¿vivo en producción? |
|---|:---:|---|---|
| `GRANT ALL ON TABLES TO anon` | ✅ | `:1905` | **NO VERIFICADO** |
| `GRANT ALL ON TABLES TO authenticated` | ✅ | `:1906` | **NO VERIFICADO** |
| `GRANT ALL ON FUNCTIONS TO anon` | ✅ | `:1895` | **NO VERIFICADO** |
| `GRANT ALL ON FUNCTIONS TO authenticated` | ✅ | `:1896` | **NO VERIFICADO** |

**Sobre "no supongas el rol propietario": tenés razón en insistir.** El repositorio dice `FOR ROLE postgres`, pero en Supabase las migraciones pueden correr como `postgres` o como `supabase_admin` según el mecanismo. Si producción tiene entradas para otro rol, el análisis cambia: un default privilege `FOR ROLE X` **solo aplica a objetos creados por X**. La consulta A-2.6 devuelve `defaclrole` sin suponerlo.

### 2.3 · Funciones ejecutables por `anon`

> **NO VERIFICADO — motivo exacto:** requiere `has_function_privilege()` o `pg_proc.proacl` de producción.

**Hipótesis del repositorio:** de las 14 funciones, **13 tienen `REVOKE ALL … FROM PUBLIC` explícito**. La única sin revocar es:

```
generar_codigo_enlace()  →  SECURITY DEFINER, RETURNS text, sin REVOKE
```

En PostgreSQL, `EXECUTE` se concede a `PUBLIC` por defecto en toda función nueva. Sin el `REVOKE`, `anon` la alcanzaría vía PostgREST (`POST /rest/v1/rpc/generar_codigo_enlace`).

**¿R-5 es un caso aislado?** **Según el repositorio, sí** — es la única. **En producción, NO VERIFICADO.** La consulta A-2.5 lo responde, y es la que habría encontrado R-5 sin que nadie la buscara.

Riesgo de R-5, evaluado leyendo el cuerpo completo: **bajo**. No accede a ninguna tabla; deriva 12 caracteres base32 de `gen_random_uuid()` y los devuelve. Un atacante obtiene un código nuevo, no uno existente. Lo que molesta es que el `SECURITY DEFINER` es **innecesario** —la función no toca nada que requiera privilegios— y que es la única grieta en un esquema por lo demás disciplinado.

### Bloqueante A-2

**BLOQUEADO.** Sin `relacl`, `pg_default_acl` ni `proacl` de producción no puedo afirmar nada sobre permisos reales. **B1.1 y B1.6 no deben diseñarse en firme sobre la hipótesis del repositorio.**

---

## 3 · A-3 — Historial de puntos

### Distribución

| métrica | valor |
|---|---|
| total | NO VERIFICADO |
| máximo absoluto | NO VERIFICADO |
| promedio absoluto | NO VERIFICADO |
| p50 | NO VERIFICADO |
| p90 | NO VERIFICADO |
| p95 | NO VERIFICADO |
| p99 | NO VERIFICADO |
| cantidad > 100 | NO VERIFICADO |
| cantidad > 250 | NO VERIFICADO |
| cantidad > 500 | NO VERIFICADO |
| cantidad > 1000 | NO VERIFICADO |

### Top 20

> **NO VERIFICADO — motivo exacto:** requiere leer filas de `historial_puntos`. Sin conexión.

### Notas

| métrica | valor |
|---|---|
| total | NO VERIFICADO |
| sin nota útil | NO VERIFICADO |
| con nota útil | NO VERIFICADO |
| % sin nota | NO VERIFICADO |

**Detalle del código que hace esta medición necesaria:** `fn_ajustar_puntos_manual` hace `COALESCE(p_nota, 'Ajuste manual de puntos')` — **inventa la nota cuando llega `NULL`**. Por eso tu definición de "sin nota" incluye ese texto exacto: hoy no se distingue de un usuario que lo escribió a mano. **Es la definición correcta.**

### Comparativa por tipo de movimiento

> **NO VERIFICADO.** Los 6 tipos permitidos por el `CHECK` son: `gasto_tratamiento`, `bonus_asistencia`, `canje_premio`, `ajuste_manual`, `ajuste_reverso`, `migracion_inicial`. **Que existan filas de cada uno es NO VERIFICADO.**

### Configuración económica

> **NO VERIFICADO — motivo exacto:** requiere leer `config_fidelizacion`.

Los **defaults declarados en el esquema** (no necesariamente los valores vigentes): `ars_por_punto = 1000`, `ars_valor_canje = 50`, `racha_bonus_puntos = 150`, `racha_objetivo = 3`.

### DATOS OBSERVADOS

**Ninguno.** No hay un solo dato de producción en esta sección.

### RECOMENDACIÓN

**No puedo dar una recomendación de límite, ni siquiera preliminar.**

Pediste una recomendación razonada "con los datos reales". No hay datos reales. Cualquier número que escribiera acá sería una inferencia disfrazada de evidencia — exactamente lo que el principio final define como fallo.

Lo único que puedo aportar es el **marco de conversión**, que sale del esquema y no de los datos:

```
impacto_ARS = puntos × ars_valor_canje
```

Y dos anclas estructurales, útiles para leer los percentiles cuando los tengas:

- El **bonus por racha** es el mayor otorgamiento automático del sistema. Si sigue en 150, cualquier ajuste manual muy por encima merece explicación.
- Existe el tipo `migracion_inicial` **separado** de `ajuste_manual`. **Si las cargas iniciales usaron ese tipo**, el histórico de `ajuste_manual` debería ser chico y el límite podría ser bajo. **Si no lo usaron**, habrá outliers legítimos grandes. La consulta A-3.4 lo resuelve, y es la que más cambia el número final.

### DO-2

**No propongo valor.** Bloqueada por A-3.

---

## 4 · A-7 — presupuestos

### Count

> **NO VERIFICADO — motivo exacto:** requiere `SELECT count(*) FROM presupuestos`. Sin conexión.

Sin ese número **no se sabe si el bloqueo es teórico o real hoy**.

### FK — verificado en el repositorio

```sql
-- supabase/migrations/20260722120000_remote_schema.sql:1331
ALTER TABLE ONLY "public"."presupuestos"
  ADD CONSTRAINT "presupuestos_paciente_id_fkey"
  FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id");
```

| tabla hija | columna | ON DELETE | ON UPDATE |
|---|---|---|---|
| `presupuestos` | `paciente_id` | **sin cláusula → `NO ACTION`** | sin cláusula → `NO ACTION` |

**No hay cláusula `ON DELETE`.** El default de PostgreSQL es `NO ACTION`, que rechaza el borrado del padre si existen hijos. Y `presupuestos.paciente_id` es `NOT NULL`, así que no hay forma de que la fila hija quede sin padre.

### Las 4 preguntas

**1 · ¿La FK realmente bloquea el DELETE?**

**Según el repositorio, sí.** `NO ACTION` sin `DEFERRABLE` → el `DELETE` sobre `pacientes` falla con `SQLSTATE 23503` (`foreign_key_violation`) apenas exista un presupuesto de ese paciente.

**En producción: NO VERIFICADO.** Falta confirmar que la constraint viva tenga `confdeltype = 'a'` (consulta A-7.1) y que existan filas (A-7.2).

**2 · ¿Cuántos pacientes están potencialmente afectados?**

> **NO VERIFICADO.** `SELECT count(DISTINCT paciente_id) FROM presupuestos`.

**3 · ¿Existe alguna ruta alternativa que borre vía `service_role`?**

**Verificado en el repositorio: NO.** Barrí todas las llamadas a `.delete()`:

| ruta | cliente | objetivo |
|---|---|---|
| `src/app/pacientes/page.tsx:139` | `supabase` (cookies → `authenticated`) | **`pacientes`** |
| `src/app/api/clinicas/route.ts:114` | `supabaseAdmin` (`service_role`) | `tenants` |
| `src/app/api/registro/route.ts:133` | `supabaseAdmin` | `auth.users` |

**Hay una única ruta que borra pacientes, y usa el cliente `authenticated`.** Eso es una buena noticia para B1.4: una policy RLS `FOR DELETE` sobre `pacientes` **cubriría el 100% de las rutas del código**, sin que quede un camino `service_role` por detrás.

**Salvedad importante:** eso vale para las rutas *del código*. El SQL Editor de Supabase y cualquier uso directo del `service_role` key siguen pudiendo borrar sin pasar por RLS. Es un límite de plataforma, no del diseño.

**4 · ¿Qué mensaje produciría el código actual?**

**Verificado.** `src/app/pacientes/page.tsx:136-143`:

```ts
async function saveBorrar() {
  if(!sel) return
  setSaving(true)
  const {error} = await supabase.from('pacientes').delete().eq('id',sel.id)
  setSaving(false)
  if(error) return msg('Error al eliminar: '+error.message,'error')
  setModal(null); msg('Paciente eliminado'); load()
}
```

El usuario vería `error.message` de PostgREST tal cual, algo del orden de:

```
Error al eliminar: update or delete on table "pacientes" violates
foreign key constraint "presupuestos_paciente_id_fkey" on table "presupuestos"
```

**Un mensaje en inglés, con nombres de tabla y constraint.** No dice "este paciente tiene presupuestos". Si el bloqueo ya ocurre en producción, es plausible que se haya interpretado como un error del sistema y no como una regla de negocio.

**Detalle relevante para B1.4:** los dos modos de falla del borrado producen **respuestas distintas**. RLS deniega devolviendo **0 filas y `error = null`** → la UI diría *"Paciente eliminado"* sin haber borrado nada. La FK falla con **excepción** → la UI muestra el error. Si B1.4 se aplica sin tocar la UI, un odontólogo que intente borrar **verá un mensaje de éxito falso**. Eso hay que contemplarlo en el diseño v2.

### Estado A-7

**PARCIAL.**

- ✅ Estructura de la FK: verificada en el repositorio.
- ✅ Ausencia de rutas `service_role`: verificada.
- ✅ Mensaje de error: verificado.
- ❌ Existencia de filas en `presupuestos`: **NO VERIFICADO** — es lo que decide si el bloqueo es teórico o real.
- ❌ FK viva en producción: **NO VERIFICADO**.

---

## 5 · Verificaciones adicionales

### RLS global

> **NO VERIFICADO — motivo exacto:** requiere `pg_class.relrowsecurity`. Sin conexión.

**Hipótesis del repositorio:** las 35 tablas declaradas tienen `ENABLE ROW LEVEL SECURITY` en alguna migración. **Ninguna quedaría sin RLS.**

**Esta es la consulta más importante de todo el script.** Es la que habría detectado P0-07 antes de que ocurriera, y la que detectaría el próximo. Aunque nada más se corra, correr esta.

### Roles existentes

> **NO VERIFICADO — motivo exacto:** requiere `SELECT DISTINCT role FROM tenant_users`.

**Esperado según el historial del proyecto:** solo `admin`, 2 usuarios, 1 clínica. **Si aparece cualquier otro valor** —incluido `''`, mayúsculas distintas o texto arbitrario— **confirma R-2**: `/api/equipo/invitar:14` toma `role` del cuerpo del request y lo inserta en `:96` y `:118` sin lista blanca, usando `supabaseAdmin`.

Y hay una precondición dura para B1.5b: **si existe un valor fuera del vocabulario, el `CHECK` fallaría al aplicarse.**

### Mapa completo de FKs — verificado en el repositorio

**Hacia `pacientes(id)`:**

| tabla | columna | ON DELETE | ON UPDATE | efecto |
|---|---|---|---|---|
| `citas` | `paciente_id` | **CASCADE** | NO ACTION | se borra |
| `historial_dental` | `paciente_id` | **CASCADE** | NO ACTION | **historia clínica se borra** |
| `paciente_fotos` | `paciente_id` | **CASCADE** | NO ACTION | se borra la fila, **no el archivo** |
| `historial_puntos` | `paciente_id` | **CASCADE** | NO ACTION | **ledger se borra** |
| `feedback_post_visita` | `paciente_id` | **CASCADE** | NO ACTION | se borra |
| `tratamiento_items` | `paciente_id` | **CASCADE** | NO ACTION | se borra |
| `pagos` | `paciente_id` | **CASCADE** | NO ACTION | **cobros se borran** |
| `consentimientos_firmados` | `paciente_id` | **SET NULL** | NO ACTION | **sobrevive con PII** |
| `crm_envios` | `paciente_id` | **SET NULL** | NO ACTION | sobrevive |
| **`presupuestos`** | `paciente_id` | **NO ACTION** | NO ACTION | **BLOQUEA** |

**Hacia `citas(id)`:**

| tabla | columna | ON DELETE | ON UPDATE |
|---|---|---|---|
| `tratamiento_items` | `cita_id` | CASCADE | NO ACTION |
| `pagos` | `cita_id` | CASCADE | NO ACTION |
| `recordatorios_log` | `cita_id` | CASCADE | NO ACTION |
| `enlaces_turno` | `cita_id` | CASCADE | NO ACTION |
| `feedback_post_visita` | `cita_id` | CASCADE | NO ACTION |
| `historial_puntos` | `cita_id` | **SET NULL** | NO ACTION |
| `facturas` | `cita_id` | **SET NULL** | NO ACTION |

**Todas las FK son `ON UPDATE NO ACTION`.** No hay ninguna sorpresa por ese lado.

**Diferencias contra el mapa de la revisión crítica:** ninguna. El mapa de §4.2 de `P0-05_FASE1_REVISION_CRITICA.md` queda **confirmado desde el repositorio**. Contra producción: **NO VERIFICADO**.

*(Aparte: `fotos_progreso` aparece con CASCADE hacia `pacientes` en `supabase_migration_portal_feedback.sql`, un archivo suelto de la raíz. No está en `supabase/migrations/` ni se referencia en `src/`. **Si existe en producción es una tabla huérfana no inventariada.** La consulta A-2.2 la revelaría.)*

---

## 6 · BLOQUEANTES ACTUALIZADOS

| Bloqueante | Estado | Evidencia |
|---|---|---|
| **A-1** | **BLOQUEADO** | Sin `pg_get_functiondef()` de producción. Repo: 14 funciones, las 4 duplicadas son byte-idénticas entre sí |
| **A-2** | **BLOQUEADO** | Sin `relacl`, `pg_default_acl` ni `proacl`. Repo: 12 tablas sin `GRANT` explícito, 12 default privileges declarados |
| **A-3** | **BLOQUEADO** | Cero datos de producción. No propongo límite |
| **A-4** | **RESUELTO** | entrada 003 — harness con `role`, 84 tests, 471 totales |
| **A-5** | **RESUELTO** | entrada 002 — commit `3af93d3` |
| **A-6** | **ABIERTO** | DO-6 sin decidir. Evidencia nueva en §7 |
| **A-7** | **PARCIAL** | FK, ausencia de rutas `service_role` y mensaje de error: verificados en repo. Existencia de filas: NO VERIFICADO |

**FASE 0 sigue abierta.** 2 de 7 cerrados.

---

## 7 · DECISIONES DO-1 A DO-8

### DO-1 · ¿`TABLES FROM authenticated` en Fase 1 o Fase 2?

- **Pendiente.**
- **Evidencia:** `ALTER DEFAULT PRIVILEGES` solo afecta objetos futuros — no toca las 35 tablas existentes. Verifiqué que las 8 llamadas `.rpc()` usan funciones con `REVOKE FROM PUBLIC` y que el portal público va por `service_role`. **Nada existente dependería del default.**
- **Recomendación técnica:** diferir a Fase 2. Su modo de falla es *"la pantalla carga vacía"* en producción, no un error en desarrollo. Los otros tres statements fallan ruidoso.
- **Bloquea:** B1.1.

### DO-2 · Límite de ajuste de puntos

- **Pendiente.**
- **Evidencia:** **ninguna.** A-3 no pudo ejecutarse.
- **Recomendación:** **no doy número.** Sería inferencia presentada como evidencia.
- **Bloquea:** B1.2. **Bloqueada a su vez por A-3.**

### DO-3 · ¿Nota obligatoria?

- **Pendiente.**
- **Evidencia:** verificado en el repositorio — la función hace `COALESCE(p_nota, 'Ajuste manual de puntos')`, o sea que **hoy la nota nunca es `NULL` en el ledger aunque el usuario no haya escrito nada**. Volverla obligatoria exige quitar ese `COALESCE` y agregar la validación.
- **Recomendación:** el costo es bajo y el beneficio de auditoría alto. Pero **cuánto del histórico no cumpliría es NO VERIFICADO** (consulta A-3.3).
- **Bloquea:** B1.2.

### DO-4 · ¿Odontólogo canjea premios?

- **Pendiente.**
- **Evidencia:** verificado — `fn_canjear_premio` valida autenticación, pertenencia al tenant, premio activo, stock y saldo. **No valida rol.** Hoy cualquier miembro del tenant canjea.
- **Recomendación:** ninguna. Es política del negocio, no una cuestión técnica.
- **Bloquea:** B1.3.

### DO-5 · ¿Aplicar B1.4 aunque hoy no cambie nada?

- **Pendiente.**
- **Evidencia nueva de esta sesión:** existe **una sola ruta de borrado de pacientes** y usa el cliente `authenticated` (`pacientes/page.tsx:139`). No hay camino `service_role` en el código. **Una policy RLS `FOR DELETE` cubriría el 100% de las rutas.** Eso refuerza B1.4 más de lo que suponía el diseño.
- **Contra-evidencia también nueva:** RLS deniega devolviendo **0 filas con `error = null`**, y esa UI muestra *"Paciente eliminado"* cuando no hay error. **Aplicar B1.4 sin tocar la UI produciría un mensaje de éxito falso.**
- **Recomendación:** si se aplica, contemplar el mensaje. Eso toca `src/`, así que roza la regla de contención.
- **Bloquea:** B1.4.

### DO-6 · Modelo `owner`

- **Pendiente. No asumo booleano ni roles múltiples.**
- **Evidencia verificada:**
  - `tenant_users.role` es **una sola columna `text`**, `NOT NULL DEFAULT 'admin'`, **sin `CHECK`**.
  - Existen **4 políticas RLS ya atadas al rol**: `arca_config_write`, `plantillas_write`, `crm_campanas_write`, `tenants_update_own` — todas `role IN ('admin','owner')`. **El día que exista el primer `odontologo` o `staff`, quedan denegados en esas cuatro sin cambiar una línea.**
  - Hay **4 rutas de API** que comparan contra `'owner'`/`'admin'`: `equipo/invitar:49`, `equipo/miembros:100,124`, `facturacion/anular:41`, `facturacion/config:95`, `pacientes/exportar:19`.
  - La persona "dueño que además es odontólogo" **no es representable** con una sola columna.
- **Sin recomendación de forma.** Las opciones que enumeré antes (columna booleana / tabla de roles múltiples) son dos entre varias, y elegir es tuyo. Lo único que la evidencia sostiene es que **`owner` y `odontologo` responden preguntas distintas** —propiedad vs. función— y hoy comparten columna.
- **Bloquea:** B1.5b y todo el diseño de Fase 2.

### DO-7 · ¿Excepción de contención para cerrar R-2?

- **Pendiente. No modifiqué `/api/equipo/invitar`.**
- **Evidencia verificada:** `route.ts:14` toma `role` del cuerpo del request; `:96` y `:118` lo insertan como `role || 'staff'` con `supabaseAdmin` (`service_role`, saltea RLS). **No hay lista blanca.** El guard de `:49` solo exige que quien invita sea `admin`/`owner` — no acota qué rol asigna.
- **Consecuencia:** un `admin` puede crear un `owner`. El `CHECK` de B1.5b **no lo cierra**: `'owner'` es un valor válido.
- **Recomendación técnica:** la corrección es una lista blanca de pocas líneas. El riesgo hoy es bajo (dos usuarios de confianza), pero es escalada de privilegios en producción.
- **Bloquea:** R-2. **Toca `src/`.**

### DO-8 · ¿Odontólogo administra plantillas de consentimiento?

- **Pendiente. No cambié ninguna política.**
- **Evidencia verificada:** `plantillas_write` sobre `plantillas_consentimiento` permite `role IN ('admin','owner')`. Un `odontologo` quedaría sin poder editar las plantillas que él mismo hace firmar.
- **Recomendación:** ninguna. Depende de cómo entiendas la responsabilidad clínica.
- **Bloquea:** Fase 2.

---

## Hallazgos nuevos de esta sesión

### R-6 · Ruta de borrado masivo con `service_role` sin guarda

`src/app/api/clinicas/route.ts:114`:

```ts
if (linkError) {
  // Rollback tenant creation if linking fails
  await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
  ...
}
```

Un `DELETE` sobre `tenants` con `service_role`, que **saltea RLS por completo**. Verifiqué que **19 FK apuntan a `tenants(id)` con `ON DELETE CASCADE`**.

**Severidad real: baja.** Es un rollback compensatorio que corre inmediatamente después de crear el tenant, sobre un tenant que todavía está vacío. Además `pacientes.tenant_id` **no tiene `ON DELETE`** (`remote_schema.sql:1316`), o sea `NO ACTION`: un tenant con pacientes **no se puede borrar**. El diseño falla cerrado por accidente.

**Por qué lo registro igual:** es la única ruta del código que puede disparar un borrado en cascada sobre 19 tablas, no tiene ninguna verificación de que el tenant esté vacío, y su seguridad depende de una FK sin cláusula explícita —o sea, del default de PostgreSQL— y no de una decisión deliberada. Si alguien alguna vez agrega `ON DELETE CASCADE` a `pacientes.tenant_id` "para poder borrar clínicas de prueba", esta ruta se vuelve peligrosa en silencio.

**No lo corrijo.** Fuera del alcance de Fase 1.

### R-7 · Asimetría no documentada en las FK hacia `tenants`

De las FK que apuntan a `tenants(id)`: **19 con `CASCADE`, 12 sin cláusula** (`NO ACTION`), entre ellas `pacientes` y `presupuestos`.

Nadie documentó ese criterio. Parece histórico más que decidido. El efecto práctico —borrar una clínica es imposible si tiene pacientes— es deseable, pero **es accidental**, y explica por qué la eliminación de las dos clínicas de prueba requirió cuidado.

**Impacto:** bajo hoy. Relevante para la Fase 3, cuando se diseñe el borrado de clínicas o el soft delete.

**No lo corrijo.**

---

## 8 · RECOMENDACIÓN DE SIGUIENTE PASO

### Cerrados

| | |
|---|---|
| **A-4** | Harness PGlite con `role`. 84 tests de aislamiento, 471 totales, `tsc` en 0 |
| **A-5** | Guarda de P0-07 versionada, commit `3af93d3` |

### Abiertos

| | Falta |
|---|---|
| **A-1** | `pg_get_functiondef()` + `proacl` de las 14 funciones |
| **A-2** | `relacl` de las 12 tablas, `pg_default_acl`, `proacl`, RLS global |
| **A-3** | Toda la evidencia. Cero datos |
| **A-6** | DO-6 |
| **A-7** | `count(*)` de `presupuestos` y confirmación de la FK viva |

### Evidencia que falta — una sola acción

**Correr `P0-05_FASE0_LECTURA.sql` en el SQL Editor de Supabase y pasarme los resultados.**

Es solo lectura: `SELECT` sobre catálogos y sobre datos propios, sin `CREATE`, sin objetos temporales, sin escritura. Cubre A-1, A-2, A-3 y A-7 en una pasada.

**Si preferís correr una sola consulta**, que sea A-2.2 (`RLS global` + qué puede leer `anon`). Es la que habría detectado P0-07 antes de que expusiera $35.341.190, y la que detectaría el próximo caso.

### Qué debería entrar en `P0-05_FASE1_DISENO_v2`

**Nada todavía.** El diseño v2 debe escribirse **con los datos en la mano**, no antes. Escribirlo ahora repetiría el error que la revisión crítica encontró: construir sobre el repositorio como si fuera producción.

Cuando estén los datos, el v2 tiene que incorporar:

1. **B1.6** — revocar `anon` de las 12 tablas, con el ACL vivo como línea base.
2. **B1.2/B1.3 construidas sobre el cuerpo vivo**, no sobre el del repositorio.
3. **DO-2 con un número justificado** por percentiles reales.
4. **B1.4 con el problema del mensaje de éxito falso resuelto** — hallazgo de esta sesión.
5. **B1.5 partida** en `a` (DEFAULT) y `b` (CHECK, tras DO-6).
6. **R-2, R-6 y R-7 registrados** como riesgos abiertos con destino asignado.
7. **B1.1 y B1.6 movidas de PGlite a integración SQL** — el harness concede privilegios explícitamente y no puede detectar su ausencia.

**No escribo la migración. No implemento B1.1 a B1.7.**

---

## Respuestas al criterio de éxito

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Qué funciones SECURITY DEFINER existen REALMENTE? | **NO VERIFICADO** — sin acceso. Repo declara 14 |
| 2 | ¿Coinciden con el repositorio? | **NO VERIFICADO** — no tengo con qué comparar |
| 3 | ¿Qué permisos tiene realmente `anon`? | **NO VERIFICADO** |
| 4 | ¿Qué permisos tiene realmente `authenticated`? | **NO VERIFICADO** |
| 5 | ¿Qué default privileges existen? | **NO VERIFICADO** — repo declara 12 |
| 6 | ¿Las 12 tablas están expuestas a `anon`? | **NO VERIFICADO**. Hecho verificable: **ninguna tiene `GRANT` explícito** |
| 7 | ¿Qué datos hay en `historial_puntos`? | **NO VERIFICADO** — cero datos |
| 8 | ¿Qué límite tiene sentido? | **NO VERIFICADO** — no propongo número |
| 9 | ¿Cuántos ajustes sin nota útil? | **NO VERIFICADO** |
| 10 | ¿Qué roles existen? | **NO VERIFICADO** |
| 11 | ¿`presupuestos` bloquea el DELETE? | **PARCIAL** — la FK es `NO ACTION` en el repo, o sea que bloquearía. Si hay filas: NO VERIFICADO |
| 12 | ¿Hay tablas públicas sin RLS? | **NO VERIFICADO** — repo declara RLS en las 35 |
| 13 | ¿Otras funciones ejecutables por `anon`? | **NO VERIFICADO**. En el repo, `generar_codigo_enlace` es la única sin `REVOKE FROM PUBLIC` |
| 14 | ¿El mapa de FK coincide? | **VERIFICADO contra el repositorio**, sin diferencias respecto de la revisión crítica. Contra producción: NO VERIFICADO |

**11 de 14 preguntas quedan sin responder por falta de acceso.** No rellené ninguna con inferencias.

---

*Informe de solo lectura. Ninguna consulta ejecutada contra Supabase — no había vía. Ningún archivo del repositorio modificado. Ningún commit. Ningún bypass intentado. Todos los comandos fueron lectura del repositorio y del entorno del sandbox.*
