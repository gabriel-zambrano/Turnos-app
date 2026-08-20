# P0-05 · FASE 1 — Diseño técnico de hardening de bypasses

**Fecha:** 13 de agosto de 2026
**Estado:** diseño. **Ningún archivo modificado. Sin migraciones, sin RLS tocada, sin producción, sin datos.**
Solo lectura del repositorio.

---

## 0. El hallazgo que cambia el alcance

Pediste inventario completo, no solo las cinco funciones. Al hacerlo apareció algo que **no había visto y que importa más que las funciones**.

Hay **12 `ALTER DEFAULT PRIVILEGES`** en `remote_schema.sql:1884-1907`, no uno. Tres son peligrosos:

```sql
-- :1895
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon;          -- ← funciones nuevas → anon

-- :1905
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon;             -- ← TABLAS Y VISTAS nuevas → anon

-- :1906
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO authenticated;    -- ← TABLAS Y VISTAS nuevas → authenticated
```

**`ON TABLES` incluye vistas.** En PostgreSQL, el default privilege sobre `TABLES` aplica a tablas, vistas y foreign tables.

### Por qué esto reordena la Fase 1

**1 · Es la causa raíz de P0-07.** Las seis vistas `bi_*` no necesitaron que nadie escribiera un `GRANT`: nacieron concedidas a `anon` por el default privilege. Lo que revocamos el 09/08 fue el síntoma.

**2 · Toda tabla nueva nace abierta a `anon`.** P0-01 crea tablas. P0-05 también. P0-06 crea `factura_eventos`. El soft delete agrega columnas. **Cada objeto nuevo del roadmap nacería accesible sin autenticar** salvo que alguien se acuerde de revocarlo.

**3 · La gravedad relativa cambia.** El default sobre funciones (`:1896`) que venía señalando es real, pero **el de tablas a `anon` (`:1905`) es peor**: una tabla nueva con datos clínicos quedaría legible desde internet.

**→ El punto 2 de tu pedido pasa a ser el trabajo más importante de la Fase 1**, por encima de las dos funciones.

---

# A · Inventario de riesgos

## A.1 · Todas las funciones del esquema `public`

**14 funciones. 12 son `SECURITY DEFINER`.**

| # | Función | Args | Ejecuta hoy | DEFINER | Lee | Modifica | ¿Saltea RLS? | Tenant | Rol | Riesgo | Fase 1 |
|---|---|---|---|:---:|---|---|:---:|:---:|:---:|---|:---:|
| 1 | `fn_ajustar_puntos_manual` | `uuid, int, text, text` | `authenticated`, `service_role` | **Sí** | `pacientes` | `pacientes`, `historial_puntos` | **Sí** | ✅ | ❌ | **Alto** | **A** |
| 2 | `fn_canjear_premio` | `uuid, uuid` | `authenticated`, `service_role` | **Sí** | `premios`, `pacientes` | `premios`, `pacientes`, `historial_puntos` | **Sí** | ✅ | ❌ | Medio | **A** |
| 3 | `fn_aprobar_asistencia` | `uuid` | `authenticated`, `service_role` | **Sí** | `citas`, `pacientes`, `config_fidelizacion`, `historial_puntos` | `citas`, `pacientes`, `historial_puntos` | **Sí** | ✅ | ❌ | Bajo | **B** |
| 4 | `fn_registrar_inasistencia` | `uuid, text` | `authenticated`, `service_role` | **Sí** | `citas` | `citas`, `pacientes` | **Sí** | ✅ | ❌ | Medio | **B** |
| 5 | `emitir_factura_con_detalle` | 17 args | `authenticated` | **Sí** | `tenant_users` | `facturas`, `factura_items`, `factura_pagos` | **Sí** | ✅ | ❌ | Bajo | **B** |
| 6 | `crear_tenant` | `text, text, text, text` | **solo `service_role`** | **Sí** | — | `tenants` | Sí | N/A | N/A | **Nulo** | — |
| 7 | `emitir_enlace_turno` | `uuid` | **nadie** *(revocado a todos)* | **Sí** | `citas`, `enlaces_turno` | `enlaces_turno` | Sí | ✅ | N/A | **Nulo** | — |
| 8 | `get_user_email` | `uuid` | **solo `service_role`** | **Sí** | `auth.users` | — | Sí | ❌ | ❌ | **Nulo** | — |
| 9 | `get_tenant_admin_email` | `uuid` | **solo `service_role`** | **Sí** | `auth.users`, `tenant_users` | — | Sí | ❌ | ❌ | **Nulo** | — |
| 10 | `sync_turno_to_cita` | trigger | **solo `service_role`** | **Sí** | `pacientes` | `pacientes`, `citas` | Sí | ❌ **NO** | ❌ | **Alto** | **P0-01** |
| 11 | `sync_valor_cita` | trigger | *(default)* | **Sí** | `tratamiento_items` | `citas` | Sí | vía fila | ❌ | Bajo | — |
| 12 | `sync_cobrado_cita` | trigger | *(default)* | **Sí** | `pagos` | `citas` | Sí | vía fila | ❌ | Bajo | — |
| 13 | `sembrar_renglon_cita` | trigger | *(default)* | **Sí** | `citas` | `tratamiento_items` | Sí | vía fila | ❌ | Bajo | — |
| 14 | `generar_codigo_enlace` | — | *(default)* | **No** | — | — | No | N/A | N/A | **Nulo** | — |

### Observaciones del inventario

**Cuatro funciones están bien cerradas** y no hacía falta tocarlas: `crear_tenant`, `emitir_enlace_turno`, `get_user_email` y `get_tenant_admin_email` tienen `REVOKE FROM PUBLIC` y `GRANT` solo a `service_role`. `emitir_enlace_turno` además revoca explícitamente `anon` y `authenticated` en un bucle — es el mejor ejemplo de endurecimiento del repositorio.

**Las cuatro funciones de trigger** (11-13 y parte de 10) solo se invocan por trigger. Son `SECURITY DEFINER` porque necesitan escribir en tablas con RLS. **Llamarlas directamente falla** (devuelven `trigger`, que no es un tipo invocable desde SQL normal). No son superficie de ataque.

**`sync_turno_to_cita` es la excepción y ya está catalogada:** es el bug de P0-01 —busca pacientes por email sin filtrar tenant— pero su ejecución está limitada a `service_role`, así que **no es un bypass de RBAC**. Queda donde está.

**El default privilege sobre funciones importa menos de lo que dije**, porque las 12 existentes tienen grants explícitos. **Importa para las futuras.**

## A.2 · Los 12 `ALTER DEFAULT PRIVILEGES`

| Línea | Objeto | Rol | Riesgo | Fase 1 |
|---|---|---|---|:---:|
| 1884 | SEQUENCES | `postgres` | Nulo | — |
| 1885 | SEQUENCES | **`anon`** | Bajo | — |
| 1886 | SEQUENCES | `authenticated` | Bajo | — |
| 1887 | SEQUENCES | `service_role` | Nulo | — |
| 1894 | FUNCTIONS | `postgres` | Nulo | — |
| **1895** | **FUNCTIONS** | **`anon`** | **Alto** | **Sí** |
| **1896** | **FUNCTIONS** | **`authenticated`** | **Alto** | **Sí** |
| 1897 | FUNCTIONS | `service_role` | Nulo | — |
| 1904 | TABLES | `postgres` | Nulo | — |
| **1905** | **TABLES** | **`anon`** | **CRÍTICO** | **Sí** |
| **1906** | **TABLES** | **`authenticated`** | **Alto** | **Sí** |
| 1907 | TABLES | `service_role` | Nulo | — |

### Comportamiento real, confirmado

**Solo afecta objetos futuros.** `ALTER DEFAULT PRIVILEGES` modifica el ACL que se aplica al crear un objeto nuevo. No toca nada existente.

**Aplica solo a objetos creados por el rol `postgres`** —es lo que dice `FOR ROLE postgres`—. En Supabase, las migraciones corren como `postgres`, así que aplica a todo lo que agreguemos.

**`ON TABLES` incluye vistas.** Es lo que hizo que las `bi_*` nacieran abiertas.

### Qué podría romperse al revocarlos

| Revocación | Qué se rompe | Probabilidad |
|---|---|---|
| FUNCTIONS de `anon` | Una función futura pensada para el portal público (sin login) | **Baja** — hoy ninguna |
| FUNCTIONS de `authenticated` | Una función futura llamada desde la app sin `GRANT` explícito | **Alta si nadie lo sabe** — es la falla deseada, ruidosa y en desarrollo |
| **TABLES de `anon`** | Una tabla futura que el portal público necesite leer | **Baja** — hoy el portal usa `service_role` vía API, salvo `tenants_public` |
| **TABLES de `authenticated`** | **Toda tabla nueva sería inaccesible desde el navegador hasta concederla** | **Alta** — y acá está el problema |

**El último merece cuidado.** La app consulta ~16 tablas directamente desde el navegador. Si P0-05 crea una tabla nueva y nadie la concede, la pantalla que la use falla.

**Pero falla en desarrollo, no en producción**, si hay un test de patrón que lo detecte. Es exactamente el intercambio que queremos.

**Nada existente se rompe.** Las 16 tablas actuales tienen sus grants explícitos en el dump (`remote_schema.sql:1660-1880`).

## A.3 · Acceso directo navegador → Supabase

| Tabla | Browser | API | RLS actual | Uso clínico | Uso financiero | Riesgo si revocamos |
|---|:---:|:---:|---|:---:|:---:|---|
| `pacientes` | **10** | 10 | tenant, sin rol | **Sí** | — | **Crítico** — listado, ficha, alta, búsqueda, CRM |
| `citas` | **12** | 13 | tenant, sin rol | Sí | Sí | **Crítico** — agenda, dashboard, cobros |
| `tratamientos` | **8** | 4 | tenant, sin rol | Sí | Sí | **Alto** — agenda, ficha, modales |
| `pagos` | 2 | 1 | tenant, sin rol | — | **Sí** | Alto — cobro de turnos |
| `facturas` | 2 | 4 | tenant, SELECT+INSERT | — | **Sí** | Alto — pantalla de facturas |
| `ingresos_manuales` | 2 | 1 | tenant, sin rol | — | **Sí** | Medio — finanzas, dashboard |
| `tenants` | 2 | 20 | tenant + rol (UPDATE) | — | — | Medio — branding |
| `arca_config` | 1 | 4 | **tenant + rol** ✅ | — | **Sí** | Bajo |
| `historial_dental` | **1** | 1 | tenant, sin rol | **Sí** | — | Medio — solo la ficha |
| `paciente_fotos` | **1** | 1 | tenant, sin rol | **Sí** | — | Medio — solo la ficha |
| `egresos_manuales` | 1 | 0 | tenant, sin rol | — | **Sí** | Medio — solo finanzas |
| `costos_fijos` | 1 | 0 | tenant, sin rol | — | **Sí** | Medio |
| `meta_mensual` | 1 | 0 | tenant, sin rol | — | **Sí** | Medio |
| `premios` | 1 | 0 | tenant, sin rol | — | Sí | Bajo — solo la ficha |
| `config_fidelizacion` | 1 | 0 | tenant, sin rol | — | Sí | Bajo |
| `historial_puntos` | 1 | 0 | tenant, sin rol | — | Sí | Bajo |

**Conclusión para la Fase 1: no se revoca nada.** `pacientes` y `citas` tienen 22 puntos de acceso combinados. Revocar `authenticated` rompería la aplicación entera.

**Esto confirma P5:** RLS es el punto de imposición, no una defensa secundaria.

---

# B · Mapa de bypasses

## B.1 · P0-08 — todos los caminos que cambian `citas.estado`

Pediste el mapa completo. **Hay siete caminos.**

### Desde el navegador, directo a Supabase

| # | Archivo:línea | Estado que fija | Valida fecha | Valida facturación | Autoriza |
|---|---|---|:---:|:---:|---|
| 1 | `dashboard/page.tsx:389` | `confirmado` | ❌ | ❌ | RLS (tenant) |
| 2 | `agenda/page.tsx:586` | cualquiera *(edición completa)* | ❌ | ❌ | RLS (tenant) |
| 3 | `agenda/page.tsx:649` | cualquiera | ❌ | ❌ | RLS (tenant) |
| 4 | `AvisoPedidosOnline.tsx:77` | `confirmado` | ❌ | ❌ | RLS (tenant) |
| 5 | `agenda/page.tsx:608` | **DELETE de la cita** | ❌ | ❌ | RLS (tenant) |

### Desde funciones SQL

| # | Función | Estado | Valida fecha | Valida facturación |
|---|---|---|:---:|:---:|
| 6 | `fn_aprobar_asistencia` → `remote_schema.sql:213` | `asistio` | ❌ | ❌ |
| 7 | `fn_registrar_inasistencia` → `:381` | `ausente`, `cancelado` | ❌ | ❌ |

### Desde APIs públicas (sin login)

| # | Ruta | Estado | Valida fecha | Valida facturación |
|---|---|---|:---:|:---:|
| 8 | `api/paciente/[token]/estado/route.ts:55` | `confirmado`, `cancelado` | ❌ | ❌ |
| 9 | `lib/turno-publico.ts:251` *(usado por `/t/[codigo]` y `/agendar`)* | `confirmado` | **parcial** | ❌ |

**El 9 es el único con alguna validación:** `turno-publico.ts:247` verifica `if (res.turno.estado !== 'pendiente')` — solo permite `pendiente → confirmado`. Es una máquina de estados mínima, y es el único camino que la tiene.

### Dónde debe vivir la regla

**Ningún punto de la aplicación las cubre a todas.** Los caminos 1-5 son navegador directo; 6-7 son funciones `SECURITY DEFINER` que saltean RLS; 8-9 son APIs públicas con `service_role`.

**La única capa que ve los nueve es la base de datos.**

**→ Recomendación: un trigger `BEFORE UPDATE` sobre `citas`.**

```
si NEW.estado = 'cancelado'
   y (OLD.fecha_hora < now()
       o existe una factura emitida y no anulada para esta cita)
→ RAISE EXCEPTION
```

Un trigger `BEFORE UPDATE` **también se dispara dentro de funciones `SECURITY DEFINER`** —los triggers no se saltean por privilegios— así que cubre los caminos 6 y 7, que ninguna otra capa alcanza.

**Esto es P0-08, no Fase 1.** No es un bypass de autorización: quien llama ya está autorizado. Lo documento acá porque pediste el mapa y porque **corregir solo `/api/paciente/[token]/estado` dejaría ocho caminos abiertos** — que era justamente tu preocupación.

## B.2 · Eliminación de pacientes

**Tablas afectadas por CASCADE (9):**

`citas` → `historial_dental` → `paciente_fotos` → `historial_puntos` → `feedback_post_visita` → y vía `citas`: `pagos`, `tratamiento_items`, `recordatorios_log`, `enlaces_turno`

**Tablas intactas:**

| Tabla | Qué pasa |
|---|---|
| `facturas` | `cita_id → SET NULL`. **Sobrevive huérfana.** Conserva `paciente_nombre` y `paciente_doc_nro` desnormalizados |
| `presupuestos` | **Sin cascade → bloquea el DELETE** si hay filas |
| `logs_envios` | Sin FK a `pacientes` |

**Archivos huérfanos en Storage — confirmado en el código:**

```ts
// pacientes/[id]/page.tsx:719-736
const fileName = `${tenant.id}/${paciente.id}/${Date.now()}.${ext}`
await supabase.storage.from('fotos_clinicas').upload(fileName, file)
await supabase.from('paciente_fotos').insert({ url: fileName, ... })
```

`paciente_fotos.url` es **el único índice** de los objetos. El CASCADE lo borra. Los archivos quedan.

*(La ruta contiene `paciente_id`, así que en teoría se podrían listar por prefijo — pero hace falta el id de un paciente que ya no existe.)*

**Impacto en facturación:** la factura sobrevive; `pagos` se borra vía `citas`. **Queda un comprobante emitido sin rastro del cobro.**

**Impacto en auditoría:** `recordatorios_log` se borra vía `citas`. Se pierde la evidencia de qué se le comunicó al paciente.

**UI/API que permiten eliminar:** una sola, `pacientes/page.tsx:139`, desde el navegador, sin API.

**¿Existe soft delete hoy?** **No.** `pacientes` no tiene `archivado_en`, `deleted_at` ni `activo`.

### Diseño mínimo de soft delete — NO implementar

```
DB    · pacientes.archivado_en timestamptz NULL
      · índice parcial WHERE archivado_en IS NULL
      · RLS: DELETE físico solo owner
API   · ninguna nueva (el borrado es cliente-directo)
UI    · el botón "eliminar" pasa a UPDATE archivado_en = now()
      · ~10 archivos agregan .is('archivado_en', null) a sus consultas
      · pantalla o filtro de archivados
Store · procedimiento de purga que borre los objetos ANTES del DELETE físico
```

**Riesgo principal:** si un archivo se olvida el filtro, muestra pacientes archivados. Se mitiga con un test de patrón.

---

# C · Propuesta FASE 1

**Cinco tareas. Cero archivos de `src/` modificados.**

---

## P0-05-B1.1 · Revocar los default privileges peligrosos

**Migración:** `2026MMDD_fase1_default_privileges.sql`

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM authenticated;
```

**Nota sobre `TABLES FROM authenticated` (`:1906`):** lo dejo **fuera** de la Fase 1.

Revocarlo obliga a conceder explícitamente cada tabla nueva. Es lo correcto, pero **su falla se manifiesta como "la pantalla no carga"** en vez de "no compila", y quiero que la Fase 1 no tenga modos de falla silenciosos en producción.

**→ DECISIÓN DEL OWNER: ¿se incluye `TABLES FROM authenticated` en Fase 1 o se difiere a Fase 2?**

| Riesgo | Impacto |
|---|---|
| Una función futura sin `GRANT` explícito falla | **Deseado** — ruidoso, en desarrollo |
| Una tabla futura que el portal público necesite | Baja — hoy usa `service_role` vía API |
| Objetos existentes | **Ninguno** — no los toca |

**Tests:** unitario de patrón + integración en Supabase real *(§D)*
**Aceptación:** una función nueva sin `GRANT` no es ejecutable por `authenticated`; una tabla nueva no es legible por `anon`
**Rollback:** volver a aplicar los `GRANT` de las líneas 1895, 1896, 1905. Total, sin datos, sin redeploy

---

## P0-05-B1.2 · Rol en `fn_ajustar_puntos_manual`

**Migración:** `CREATE OR REPLACE FUNCTION` con el cuerpo actual más dos bloques.

```
-- Después de resolver v_tenant_id desde pacientes:
IF NOT EXISTS (
  SELECT 1 FROM tenant_users
  WHERE user_id = v_user_id
    AND tenant_id = v_tenant_id
    AND role IN ('owner','admin')
) THEN
  RAISE EXCEPTION 'Solo un administrador puede ajustar puntos manualmente.';
END IF;

IF abs(p_puntos_afectados) > <LIMITE> THEN
  RAISE EXCEPTION 'El ajuste no puede superar los <LIMITE> puntos.';
END IF;

IF p_nota IS NULL OR trim(p_nota) = '' THEN
  RAISE EXCEPTION 'El ajuste requiere una nota que lo justifique.';
END IF;
```

**Riesgo:** si algún admin viene ajustando por encima del límite, se le rompe el flujo. **NO VERIFICADO.**

```sql
SELECT max(abs(puntos_afectados)) AS maximo,
       count(*) FILTER (WHERE abs(puntos_afectados) > 500) AS superan_500
FROM historial_puntos WHERE tipo_movimiento IN ('ajuste_manual','ajuste_reverso');
```

**→ DECISIÓN DEL OWNER: ¿cuál es el límite? ¿La nota es obligatoria?**

**Tests:** 10 casos PGlite *(§D)*
**Aceptación:** `odontologo` y `staff` reciben excepción; `owner`/`admin` del tenant A no pueden ajustar pacientes del tenant B
**Rollback:** `CREATE OR REPLACE` con el cuerpo guardado. Total, sin datos, sin redeploy

---

## P0-05-B1.3 · Rol en `fn_canjear_premio`

Mismo patrón. La lista de roles depende de P6.

```
AND role IN ('owner','admin','staff')     -- Odontólogo NO canjea
```

**→ DECISIÓN DEL OWNER (= P6): ¿Odontólogo canjea premios?**

**Respuesta a tu pregunta 6:** *"¿la función puede seguir operando aunque RLS bloquee al usuario?"* — **Sí, hoy sí.** Es `SECURITY DEFINER` con dueño `postgres`, y los superusuarios no están sujetos a RLS. Las policies de `premios` **no se evalúan dentro de su cuerpo**. Por eso la verificación tiene que ir adentro: una policy sobre `premios` sería decorativa.

**Tests:** 8 casos PGlite
**Aceptación:** `odontologo` recibe excepción; no se puede canjear un premio del tenant A para un paciente del tenant B
**Rollback:** idéntico a B1.2

---

## P0-05-B1.4 · RLS `FOR DELETE` en `pacientes` → owner/admin

```sql
-- Separar la policy FOR ALL actual:
--   tenant_isolation_pacientes  FOR SELECT, INSERT, UPDATE → todos
--   tenant_delete_pacientes     FOR DELETE                 → owner/admin
```

**No es soft delete.** El DELETE sigue destruyendo lo mismo; se restringe **quién** puede provocarlo.

**Impacto hoy: ninguno.** Los dos usuarios son `admin`.

**Detalle para los tests:** RLS no lanza excepción en un DELETE denegado — devuelve **0 filas afectadas**. Verificar el conteo.

**Tests:** 6 casos PGlite
**Aceptación:** `odontologo`/`staff` → 0 filas; los cuatro roles siguen pudiendo SELECT y UPDATE
**Rollback:** `DROP POLICY` + restaurar la `FOR ALL`. Total, sin datos, sin redeploy

---

## P0-05-B1.5 · Higiene de roles

```sql
ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_role_check
  CHECK (role IN ('owner','admin','odontologo','staff'));
ALTER TABLE tenant_users ALTER COLUMN role SET DEFAULT 'staff';
```

**Precondición dura:** `SELECT DISTINCT role FROM tenant_users` → solo valores de la lista. Confirmado: solo `admin`.

**Fuera:** la asignación de `owner` es un `UPDATE` de datos y depende de P4.

**Tests:** 3 casos PGlite
**Aceptación:** un rol inválido es rechazado; un INSERT sin rol queda `staff`
**Rollback:** `DROP CONSTRAINT` + `SET DEFAULT 'admin'`. Total, sin datos, sin redeploy

---

## C.6 · Lo que queda explícitamente fuera

| Qué | Por qué | Dónde |
|---|---|---|
| Rol en `fn_aprobar_asistencia`, `fn_registrar_inasistencia`, `emitir_factura_con_detalle` | **Recomendación B** — la matriz permite a los 4 roles | — |
| Validación de fecha/facturación en citas | 9 caminos, requiere trigger | **P0-08** |
| Soft delete | Esquema + ~10 archivos | Fase 3 |
| RLS por rol en 13 recursos | Es el RBAC | **Fase 2** |
| Policies de Storage con rol | RBAC | **Fase 2** |
| Trigger de campos clínicos | RBAC | **Fase 2** |
| `DROP` de vistas `bi_*` | Ya cerradas, sin bypass abierto | P0-07 |
| `sync_turno_to_cita` sin filtro de tenant | Solo `service_role`, no es bypass de RBAC | **P0-01** |
| Revocar `authenticated` de tablas | Rompería 22 puntos de acceso | Descartado (P5) |
| `TABLES FROM authenticated` en default privileges | Falla silenciosa en producción | **Decisión** |

**Regla de contención:** *si un paso requiere modificar un archivo de `src/`, sale de la Fase 1.*

---

# D · Tests

## D.1 · Matriz por control

| Control | PGlite | Unitario | Integración Supabase | Manual |
|---|:---:|:---:|:---:|:---:|
| B1.1 · default privileges FUNCTIONS | ⚠️ parcial | ✅ patrón | **✅ requerido** | — |
| B1.1 · default privileges TABLES | ⚠️ parcial | ✅ patrón | **✅ requerido** | — |
| B1.2 · rol en ajustar puntos | ✅ | — | opcional | ✅ |
| B1.2 · límite y nota | ✅ | — | — | ✅ |
| B1.3 · rol en canjear | ✅ | — | opcional | ✅ |
| B1.3 · tenant isolation en canje | ✅ | — | — | — |
| B1.4 · DELETE por rol | ✅ | — | — | ✅ |
| B1.5 · CHECK y DEFAULT | ✅ | — | — | — |
| Regresión: 81 tests de tenant isolation | ✅ | — | — | — |
| Regresión: la app funciona | — | — | — | **✅ requerido** |

## D.2 · Casos PGlite — 27

**B1.2 · `fn_ajustar_puntos_manual`**

| # | Caso | Esperado |
|---|---|---|
| 1 | `owner` ajusta +100 | ✅ |
| 2 | `admin` ajusta +100 | ✅ |
| 3 | **`odontologo` ajusta** | ❌ excepción |
| 4 | **`staff` ajusta** | ❌ excepción |
| 5 | **`owner` del A sobre paciente del B** | ❌ excepción |
| 6 | **Supera el límite** | ❌ excepción |
| 7 | Justo en el límite | ✅ |
| 8 | **Nota vacía** | ❌ excepción |
| 9 | Saldo resultante negativo | ❌ *(regresión)* |
| 10 | Tipo de movimiento inválido | ❌ *(regresión)* |

**B1.3 · `fn_canjear_premio`**

| # | Caso | Esperado |
|---|---|---|
| 11-13 | `owner` / `admin` / `staff` canjean | ✅ |
| 14 | **`odontologo` canjea** | ❌ *(según P6)* |
| 15 | **Premio del A, paciente del B** | ❌ |
| 16-18 | Premio inactivo / sin stock / saldo insuficiente | ❌ *(regresión)* |

**B1.4 · DELETE**

| # | Caso | Esperado |
|---|---|---|
| 19-20 | `owner` / `admin` borran | ✅ |
| 21-22 | **`odontologo` / `staff` borran** | ❌ **0 filas** |
| 23 | **`owner` del A borra paciente del B** | ❌ 0 filas |
| 24 | Los 4 roles SELECT y UPDATE | ✅ |

**B1.5 · Roles**

| # | Caso | Esperado |
|---|---|---|
| 25 | Rol inválido | ❌ viola CHECK |
| 26 | Los 4 válidos | ✅ |
| 27 | INSERT sin rol | ✅ queda `staff` |

## D.3 · Test unitario — guarda de patrón

Al estilo de `guardas-multitenant.test.ts`:

```
Por cada CREATE FUNCTION en supabase/migrations/:
  → exigir GRANT EXECUTE explícito en el mismo archivo
Por cada CREATE TABLE / CREATE VIEW:
  → exigir GRANT explícito, o ausencia deliberada documentada
```

**Es lo que convierte B1.1 en una red y no en una trampa.**

## D.4 · Integración Supabase — requerido

PGlite no reproduce `ALTER DEFAULT PRIVILEGES` con los roles de Supabase: allá intervienen `postgres`, `supabase_admin` y el pooler.

```sql
-- Después de aplicar B1.1, en staging:
CREATE FUNCTION public.__prueba() RETURNS int LANGUAGE sql AS 'SELECT 1';
CREATE TABLE public.__prueba_tabla (id int);

SELECT has_function_privilege('authenticated','public.__prueba()','EXECUTE');  -- false
SELECT has_table_privilege('anon','public.__prueba_tabla','SELECT');           -- false

DROP FUNCTION public.__prueba();
DROP TABLE public.__prueba_tabla;
```

**Si alguna devuelve `true`, B1.1 no tuvo efecto.**

## D.5 · Lo que NO puede probarse con PGlite

| Limitación | Afecta | Alternativa |
|---|---|---|
| `ALTER DEFAULT PRIVILEGES` con roles de Supabase | **B1.1** | Integración (D.4) |
| `storage.objects` y buckets | Storage | Manual — **fuera de Fase 1** |
| PostgREST: cómo se exponen las funciones | B1.2, B1.3 | Manual |
| Pooler y rol `authenticator` | B1.1 | Integración |
| `auth.uid()` real de GoTrue | B1.2-B1.4 | Simulado; semántica equivalente |

**No voy a presentar B1.1 como verificado con PGlite.**

## D.6 · Manual — antes de cerrar

- ☐ Ajustar puntos como admin → funciona
- ☐ Superar el límite → mensaje comprensible en la UI
- ☐ Canjear un premio → funciona
- ☐ Borrar un paciente de prueba → funciona
- ☐ `/pacientes`, `/pacientes/[id]`, `/agenda`, `/dashboard`, `/finanzas` → sin errores
- ☐ Marcar asistencia → sigue acreditando puntos

**Los mensajes importan:** las Server Actions devuelven `{success:false, error}` y la UI lo muestra tal cual. El texto del `RAISE EXCEPTION` es lo que lee el usuario.

---

# E · Decisiones del owner

| # | Decisión | Bloquea | Sugerencia |
|---|---|---|---|
| **DO-1** | ¿Se incluye `TABLES FROM authenticated` en Fase 1? | B1.1 | **No** — falla silenciosa en producción. Diferir a Fase 2 con la guarda de patrón ya en su lugar |
| **DO-2** | ¿Cuál es el límite por ajuste de puntos? | B1.2 | 500 (~$25.000) — **verificar contra `historial_puntos` primero** |
| **DO-3** | ¿La nota es obligatoria en los ajustes? | B1.2 | Sí |
| **DO-4** | ¿Odontólogo canjea premios? *(= P6)* | B1.3 | No |
| **DO-5** | ¿Se aplica B1.4 aunque hoy no cambie nada? | B1.4 | Sí — cierra la puerta antes de que entre alguien |
| **DO-6** | ¿A quién se asigna `owner`? *(= P4)* | Fuera de B1.5 | El odontólogo |

**Ninguna asumida.**

---

# F · Checklist de cierre de FASE 1

### Verificaciones previas

- [ ] `SELECT DISTINCT role FROM tenant_users` → solo `owner`/`admin`/`odontologo`/`staff`
- [ ] Inventario de funciones y grants actuales en producción *(§D.4)*
- [ ] Cuerpos de `fn_ajustar_puntos_manual` y `fn_canjear_premio` guardados para rollback
- [ ] Definición actual de `tenant_isolation_pacientes` guardada
- [ ] `historial_puntos` consultado para calibrar el límite *(DO-2)*
- [ ] DO-1 a DO-5 respondidas

### Implementación

- [ ] B1.1 · default privileges revocados *(según DO-1)*
- [ ] B1.2 · rol, límite y nota en `fn_ajustar_puntos_manual`
- [ ] B1.3 · rol en `fn_canjear_premio`
- [ ] B1.4 · policy `FOR DELETE` en `pacientes`
- [ ] B1.5 · `CHECK` y `DEFAULT` en `tenant_users`
- [ ] Una sola migración, aplicada en una transacción

### Verificación técnica

- [ ] Los 27 casos PGlite en verde
- [ ] Guarda de patrón de grants en verde
- [ ] **Los 81 tests de tenant isolation en verde**
- [ ] **Los 468 tests actuales en verde**
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm run build` → exit 0
- [ ] **Integración en Supabase real: función y tabla nuevas sin privilegio** *(§D.4)*

### Verificación funcional

- [ ] Las 6 pruebas manuales de §D.6
- [ ] Mensajes de error legibles en la UI
- [ ] 24 h de observación sin errores nuevos en Sentry

### Contención

- [ ] **`git diff --stat` → cero archivos de `src/` modificados**
- [ ] Una sola migración nueva
- [ ] Todos los cambios revertibles con SQL, sin datos, sin redeploy

### Riesgos residuales aceptados y documentados

- [ ] SQL Editor y `service_role` siguen pudiendo todo *(límite de plataforma)*
- [ ] Recepción sigue pudiendo escribir historia clínica y ver finanzas → **Fase 2**
- [ ] El DELETE sigue destruyendo historia clínica y dejando fotos huérfanas → **Fase 3**
- [ ] Se puede cancelar una cita pasada o facturada por 9 caminos → **P0-08**
- [ ] `sync_turno_to_cita` sigue sin filtrar tenant → **P0-01**

---

## Contradicciones entre la matriz y el comportamiento actual

Pediste que las señale explícitamente. **Encontré una.**

**Emitir factura.** La matriz dice `E` para los cuatro roles. `emitir_factura_con_detalle` no verifica rol, y `/api/facturacion/emitir` tampoco. **Coinciden.**

En la auditoría inicial marqué eso como inconsistencia —"emitir pide menos que anular"— y lo propuse como quick win. **Con la matriz cerrada, era una decisión sin tomar, no un error.** Ese quick win queda descartado, y lo repito acá porque figura en `AUDITORIA-PROFUNDA-2026-08.md` y en `P0_PRODUCTION_DIAGNOSTICS.md` como si fuera un defecto.

No encontré otras contradicciones: el resto del comportamiento actual es más permisivo que la matriz, nunca más restrictivo.

---

*Diseño técnico. Ningún archivo modificado, ninguna migración creada, ninguna función alterada, ninguna policy tocada, sin deploy, sin producción, sin datos. Todos los comandos ejecutados fueron de lectura sobre el repositorio.*
