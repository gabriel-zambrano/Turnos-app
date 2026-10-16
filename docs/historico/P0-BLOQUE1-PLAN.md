# P0 · Bloque 1 — Plan de cierre de bypasses

**Fecha:** 13 de agosto de 2026
**Estado:** especificación. **Ningún archivo modificado. Sin migraciones, sin deploy, sin tocar Supabase ni datos reales.**

---

## 0. Dos premisas tuyas que hay que corregir antes de proponer código

Pediste que las señale. Son dos, y la segunda cambia el alcance del bloque.

### 0.1 · "Impedir que un usuario no autorizado la ejecute directamente desde Supabase"

Pediste eso para `fn_ajustar_puntos_manual`. **Hay que separar dos escenarios que se ven iguales y no lo son:**

| Vía de ejecución | ¿La cubre una verificación de rol dentro de la función? |
|---|---|
| Desde la app (Server Action → PostgREST) | **Sí** |
| Desde `curl` con la anon key + JWT del usuario | **Sí** — `auth.uid()` resuelve igual |
| Desde el SQL Editor de Supabase | **No** — corre como `postgres`, `auth.uid()` es `NULL` |
| Con la `service_role` key | **No** — saltea todo |

Las dos primeras son la superficie real de un usuario de la aplicación. **Las dos últimas requieren credenciales de administrador del proyecto** —el SQL Editor exige login en Supabase, la service-role key es un secreto de servidor— y **ningún mecanismo dentro de la función las puede detener**. Es un límite de la plataforma, no un defecto del diseño.

**Lo que sí se puede garantizar:** ningún usuario de la aplicación, por ningún camino disponible para él, ejecuta la función sin el rol adecuado. Eso es lo que va a cubrir este bloque.

### 0.2 · "NO modificar P0-07 salvo que sea necesario"

Lo pusiste como excepción condicional. **Mi lectura: no es necesario para el Bloque 1.**

Las vistas `bi_*` ya están cerradas para `anon` y `authenticated` desde el 09/08 (REVOKE aplicado y verificado con `42501`). **No hay bypass abierto ahí.** El `DROP` pendiente es completar la mitigación, no cerrar un riesgo.

En el informe anterior lo listé dentro del Bloque 1. **Me corrijo: sale del alcance.** Meterlo suma una migración destructiva a un bloque que quiero mantener chico y reversible.

---

## 1. Objetivo

Cerrar los riesgos que existen **hoy**, independientes del RBAC completo, sin tocar la arquitectura de acceso directo navegador → Supabase y sin degradar ninguna funcionalidad en uso.

**Criterio de éxito:** que al terminar, ningún usuario de la aplicación pueda modificar saldos de puntos ni canjear premios sin el rol adecuado, y que ninguna función nueva nazca ejecutable sin revisión.

**Criterio de contención:** 2 a 3 días. Si algo empuja más allá, sale del bloque.

---

## 2. Hallazgos confirmados

### 2.1 · `fn_ajustar_puntos_manual`

**Quién la ejecuta hoy:** `authenticated` y `service_role`, por `GRANT` explícito (`remote_schema.sql:1621-1623`). Precedido de `REVOKE ALL ... FROM PUBLIC`: está abierta a propósito.

**Qué operaciones permite:**

```
UPDATE pacientes SET puntos_saldo_cache = <nuevo>   -- saldo arbitrario
INSERT INTO historial_puntos (...)                  -- registro en el ledger
```

**Validaciones que sí tiene:**
- `p_tipo_movimiento IN ('ajuste_manual','ajuste_reverso')`
- `auth.uid()` no nulo
- El paciente existe, con `FOR UPDATE` (evita carreras)
- **Pertenencia al tenant** del paciente
- El saldo resultante no queda negativo

**Lo que NO valida:**
- **Rol** — cualquier miembro
- **Límite superior** — `p_puntos_afectados` no tiene tope
- `p_nota` puede ser `NULL`; se reemplaza por un texto genérico

**Dimensión económica:** `config_fidelizacion.ars_valor_canje` vale 50 por defecto. **1.000 puntos ≈ $50.000** en premios canjeables.

### 2.2 · `fn_canjear_premio`

**Por qué saltea RLS:** es `SECURITY DEFINER` y su dueño es `postgres`. Una función `SECURITY DEFINER` corre con los privilegios de su dueño; los superusuarios no están sujetos a RLS. Por lo tanto, las policies de `premios`, `pacientes` e `historial_puntos` **no se evalúan** dentro de su cuerpo.

**Tenant isolation: correcta.** Resuelve el tenant desde `premios.tenant_id` (no desde un parámetro), verifica pertenencia, y busca al paciente con `WHERE id = p_paciente_id AND tenant_id = v_premio_tenant_id`. **No hay forma de canjear un premio del tenant A para un paciente del tenant B.**

**Lo que falta:** verificación de rol.

**Consecuencia concreta:** aunque pongamos RLS por rol sobre `premios`, cualquier miembro sigue canjeando. La policy quedaría decorativa.

### 2.3 · `ALTER DEFAULT PRIVILEGES`

```sql
-- remote_schema.sql:1896
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT ALL ON FUNCTIONS TO "authenticated";
```

**Qué concede exactamente:** toda función **creada por el rol `postgres` en el esquema `public` a partir de ahora** recibe `EXECUTE` para `authenticated` automáticamente.

**Qué NO hace:** no afecta a las funciones existentes. Las cinco actuales tienen su `GRANT` escrito a mano.

**El riesgo es prospectivo:** la próxima función `SECURITY DEFINER` que alguien agregue —incluidas las de P0-05, P0-06 y el soft delete— nace ejecutable por cualquier usuario logueado sin que nadie lo decida.

### 2.4 · `fn_registrar_inasistencia`

**Auditoría del cuerpo completo (`remote_schema.sql:344-390`):**

| Validación | ¿Existe? |
|---|---|
| Estado en `('ausente','cancelado')` | Sí |
| Autenticado | Sí |
| Cita existe | Sí |
| Pertenencia al tenant | Sí |
| **Que la cita sea futura** | **NO** |
| **Que la cita no esté facturada** | **NO** |
| **Estado previo de la cita** | **NO** |

**Puede marcar `cancelado` una cita pasada. Puede marcarla aunque tenga factura emitida.**

**Comparación explícita con P0-08:**

| | P0-08 | `fn_registrar_inasistencia` |
|---|---|---|
| Quién | **El paciente**, sin login | Un miembro de la clínica, autenticado |
| Por dónde | `PATCH /api/paciente/[token]/estado` | Server Action → RPC |
| Estados | `confirmado`, `cancelado` | `ausente`, `cancelado` |
| Valida fecha | No | No |
| Valida facturación | No | No |
| Es un bypass de RBAC | No | **No** |

**Es el mismo defecto de validación por dos caminos, pero no es un bypass de autorización.** La matriz permite a los cuatro roles marcar asistencia, así que no verificar rol es correcto. El problema es que ninguno de los dos valida el estado de la cita.

**→ Queda documentado como P0-08, fuera de este bloque.** No cerrarlo no deja ningún bypass abierto: quien la llama ya está autorizado a hacerlo.

**Recomendación para cuando se implemente P0-08:** arreglar **las dos vías juntas**. Corregir solo el endpoint del paciente deja la misma falla accesible desde la app.

### 2.5 · Hard delete de pacientes

**Cascadas confirmadas:**

| Tabla | Mecanismo |
|---|---|
| `citas` | `citas_paciente_id_fkey ON DELETE CASCADE` |
| `historial_dental` | `ON DELETE CASCADE` |
| `paciente_fotos` | `ON DELETE CASCADE` |
| `historial_puntos` | `ON DELETE CASCADE` |
| `feedback_post_visita` | `ON DELETE CASCADE` |
| `pagos` | vía `citas` → `CASCADE` |
| `tratamiento_items` | vía `citas` → `CASCADE` |
| `recordatorios_log` | vía `citas` → `CASCADE` |
| `enlaces_turno` | vía `citas` → `CASCADE` |
| `presupuestos` | **sin cascade** → bloquea el DELETE si hay filas |
| `facturas` | `cita_id ON DELETE SET NULL` → sobrevive huérfana |

**Archivos huérfanos en Storage — confirmado con el código:**

`pacientes/[id]/page.tsx:719-736` sube a `fotos_clinicas` con la ruta `<tenant_id>/<paciente_id>/<timestamp>.<ext>` y guarda **esa ruta** en `paciente_fotos.url`.

```ts
const fileName = `${tenant.id}/${paciente.id}/${Date.now()}.${ext}`
await supabase.storage.from('fotos_clinicas').upload(fileName, file)
await supabase.from('paciente_fotos').insert({ url: fileName, ... })
```

**`paciente_fotos.url` es el único índice de los objetos.** El CASCADE borra esas filas; los objetos quedan en el bucket sin referencia.

**Atenuante que no cambia el problema:** la ruta contiene `paciente_id`, así que en teoría se podrían encontrar listando el prefijo `<tenant_id>/<paciente_id>/`. Pero **hay que conocer el `paciente_id` de un paciente que ya no existe** — y esa es justamente la fila que se borró.

**Pérdida de trazabilidad de facturación:** la factura sobrevive (correcto, es comprobante fiscal, y guarda `paciente_nombre` y `paciente_doc_nro` desnormalizados). Pero `pagos` se borra vía `citas`. **Queda una factura emitida sin rastro del cobro que la respalda.**

**Dónde se ejecuta:** `pacientes/page.tsx:139`, desde el navegador, sin API, sin verificación de rol.

### 2.6 · Storage

| | |
|---|---|
| Bucket | `fotos_clinicas`, privado desde `supabase_migration_seguridad_lanzamiento.sql` |
| Ruta | `<tenant_id>/<paciente_id>/<timestamp>.<ext>` |
| Vínculo con la base | `paciente_fotos.url` guarda la ruta. **No hay FK: es un string** |
| Policies | 4 (SELECT/INSERT/UPDATE/DELETE), `TO authenticated`, scope por `(storage.foldername(name))[1] = tenant_id` |
| ¿Verifican rol? | **No** |
| Lectura pública | Vía URLs firmadas a 1 h, generadas server-side (`api/paciente/[token]/route.ts:130-140`) |

**Hoy Recepción puede subir, sobrescribir y borrar fotos clínicas.** La matriz dice `L`. **Fuera del alcance de este bloque** — es RBAC, va en P0-05.

---

## 3. Riesgos actuales

| # | Riesgo | Severidad | ¿Depende del RBAC? |
|---|---|---|---|
| **R1** | Cualquier miembro modifica saldos de puntos sin límite | **Alta** | **No — riesgo de hoy** |
| **R2** | Cualquier miembro canjea premios | Media | No |
| **R3** | Toda función futura nace ejecutable sin revisión | **Alta** | **No — riesgo prospectivo** |
| **R4** | Cualquier miembro destruye historia clínica con un DELETE | **Alta** | Parcial |
| R5 | Se puede cancelar una cita pasada o facturada | Media | No → **P0-08** |
| R6 | Recepción puede borrar fotos clínicas | Media | Sí → **P0-05** |

**R1, R2, R3 y R4 son el alcance de este bloque.** R5 y R6 quedan documentados.

---

## 4. Cambios propuestos

Cinco cambios. Cuatro SQL, uno de configuración de esquema.

### C1 · Rol dentro de `fn_ajustar_puntos_manual`

Se agrega, **después** de la verificación de tenant que ya existe:

```
IF NOT EXISTS (
  SELECT 1 FROM tenant_users
  WHERE user_id = v_user_id
    AND tenant_id = v_tenant_id            -- ← tenant Y rol, misma condición
    AND role IN ('owner','admin')
) THEN
  RAISE EXCEPTION 'Solo un administrador puede ajustar puntos manualmente.';
END IF;
```

**No reemplaza la verificación de tenant: la refuerza.** Ambas condiciones en el mismo `EXISTS`, unidas por `AND`.

**Y un límite:**

```
IF abs(p_puntos_afectados) > 500 THEN
  RAISE EXCEPTION 'El ajuste no puede superar los 500 puntos.';
END IF;
IF p_nota IS NULL OR trim(p_nota) = '' THEN
  RAISE EXCEPTION 'El ajuste requiere una nota que lo justifique.';
END IF;
```

**El tope de 500 es una propuesta, no una constante técnica.** Con `ars_valor_canje = 50`, equivale a $25.000 por operación. **→ Decisión tuya.**

### C2 · Rol dentro de `fn_canjear_premio`

Mismo patrón, con la lista de roles de la matriz:

```
AND role IN ('owner','admin','staff')     -- Odontólogo NO canjea (P6)
```

**Depende de P6.** Si respondés que Odontólogo también canjea, la lista incluye `odontologo`.

**Nota:** `staff` es el nombre interno del rol que la UI llama "Recepción". No se renombra en este bloque.

### C3 · Revocar el default privilege sobre funciones

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM authenticated;
```

**Qué funciones existentes afecta: NINGUNA.** `ALTER DEFAULT PRIVILEGES` solo aplica a objetos creados **después**. Las cinco actuales tienen su `GRANT` explícito y lo conservan.

**Qué cambia:** a partir de acá, toda función nueva en `public` requiere un `GRANT EXECUTE ... TO authenticated` escrito a mano. Es exactamente el punto: que sea una decisión y no un default.

**Riesgo:** si alguna migración futura crea una función y se olvida del `GRANT`, la app da error de permisos. **Es la falla deseada** — ruidosa y en desarrollo, no silenciosa en producción.

### C4 · RLS `FOR DELETE` sobre `pacientes` → owner/admin

```sql
-- La policy actual es FOR ALL. Hay que separarla:
--   tenant_isolation_pacientes  FOR SELECT, INSERT, UPDATE  → todos los miembros
--   tenant_delete_pacientes     FOR DELETE                  → owner/admin
```

**No cambia el comportamiento para los dos usuarios actuales** (ambos `admin`). Cierra la puerta para cuando entre alguien más.

**No es soft delete.** El DELETE sigue destruyendo lo mismo; solo se restringe quién puede provocarlo.

### C5 · Higiene de roles

```sql
ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_role_check
  CHECK (role IN ('owner','admin','odontologo','staff'));

ALTER TABLE tenant_users ALTER COLUMN role SET DEFAULT 'staff';
```

**Precondición dura:** `SELECT DISTINCT role FROM tenant_users` debe devolver solo valores de esa lista. Confirmado en producción: solo `admin`.

**La asignación de `owner` (P4) queda fuera:** es un `UPDATE` de datos, no de esquema, y depende de tu decisión.

---

## 5. Cambios explícitamente fuera de alcance

| Qué | Por qué | Dónde va |
|---|---|---|
| RBAC completo (13 recursos) | Es P0-05 | P0-05 |
| Policies de Storage con rol | RBAC | P0-05 |
| Trigger de campos clínicos en `pacientes` | RBAC | P0-05 |
| RLS por rol en finanzas, `historial_dental`, `premios` | RBAC | P0-05 |
| Revocar acceso de `authenticated` a tablas | Rompería ~12 archivos | Descartado (P5) |
| Soft delete | Cambio de esquema + ~10 archivos | P0-05 o aparte |
| Validación de fecha/estado en citas | No es bypass de autorización | **P0-08** |
| `DROP` de las vistas `bi_*` | **Ya están cerradas.** No hay bypass abierto | P0-07, aparte |
| Renombrar `staff` → `recepcion` | Sin beneficio funcional | Descartado |
| Asignar `owner` | Depende de P4 | Con la decisión |
| Helper `requireMembership()` | Infraestructura de RBAC | P0-05 |
| `search_path` de `emitir_factura_con_detalle` | Inconsistencia menor, sin vulnerabilidad conocida | Deuda |

**El criterio para dejar algo afuera:** si requiere tocar código de la aplicación o migrar datos, no entra. Este bloque es SQL acotado y reversible.

---

## 6. Matriz de impacto

| Cambio | Tablas | Funciones SQL | Rutas API | Archivos | Tests a modificar | Regresión posible |
|---|---|---|---|---|---|---|
| **C1** | `pacientes`, `historial_puntos` | `fn_ajustar_puntos_manual` | — | **Ninguno** | Ninguno *(no hay tests de fidelización)* | Si algún admin ajustaba >500 puntos habitualmente |
| **C2** | `premios`, `pacientes`, `historial_puntos` | `fn_canjear_premio` | — | **Ninguno** | Ninguno | Si un odontólogo canjea hoy, deja de poder |
| **C3** | — | Ninguna existente | — | **Ninguno** | Ninguno | Solo migraciones futuras que olviden el `GRANT` |
| **C4** | `pacientes` | — | — | `pacientes/page.tsx:139` *(sin cambio, solo puede fallar)* | Ninguno | Si un futuro `staff` intenta borrar → error |
| **C5** | `tenant_users` | — | — | **Ninguno** | Ninguno | Si existiera un rol fuera de la lista → falla el `CHECK` |

**Cero archivos de aplicación modificados.** Es la propiedad que mantiene el bloque en 2-3 días.

**Componentes que consumen las funciones afectadas** *(sin cambios, pero pueden empezar a recibir error)*:

- `src/app/actions/fidelizacion.ts` — las 4 Server Actions
- `src/app/pacientes/[id]/page.tsx:1330` — el botón de canje
- `src/app/pacientes/page.tsx:139` — el borrado de paciente

**Las Server Actions ya manejan el error** y devuelven `{ success: false, error }`. La UI muestra el mensaje. **No hace falta cambiar código para que el rechazo se vea bien** — solo revisar que el texto sea comprensible.

---

## 7. Estrategia de autorización SQL

### 7.1 · Dónde se impone cada control

| Control | Mecanismo | Por qué ahí |
|---|---|---|
| C1, C2 | **Dentro de la función** | Son `SECURITY DEFINER`: RLS no se evalúa en su cuerpo. La verificación tiene que ser explícita |
| C3 | `ALTER DEFAULT PRIVILEGES` | Es la única forma de cambiar el default |
| C4 | **RLS `FOR DELETE`** | El DELETE viene del navegador. RLS es el único punto que lo cubre |
| C5 | Constraint de tabla | Integridad de datos |

### 7.2 · Por qué no usar `auth_has_role()` todavía

El helper es infraestructura de P0-05. Introducirlo acá significaría crear una función nueva, decidir sus grants —justo cuando estamos cambiando el default— y agregar una dependencia entre bloques.

**En el Bloque 1 la verificación va escrita en cada función.** Son dos lugares. Cuando llegue P0-05, se refactorizan a `auth_has_role()`.

Es duplicación consciente y acotada, a cambio de que los bloques sean independientes.

### 7.3 · Forma exacta de la verificación

```sql
IF NOT EXISTS (
  SELECT 1 FROM tenant_users
  WHERE user_id  = v_user_id
    AND tenant_id = v_tenant_id
    AND role IN ('owner','admin')
) THEN
  RAISE EXCEPTION '<mensaje>';
END IF;
```

**Un solo `EXISTS`, tres condiciones unidas por `AND`.** Nunca dos `EXISTS` separados, nunca un `OR`.

---

## 8. Estrategia de tenant isolation

**Regla: `tenant isolation AND role authorization`, en la misma condición.**

### 8.1 · C1 y C2 — dentro de funciones

El `v_tenant_id` **no viene por parámetro**: se deriva de la fila.

| Función | De dónde sale el tenant |
|---|---|
| `fn_ajustar_puntos_manual` | `SELECT tenant_id FROM pacientes WHERE id = p_paciente_id` |
| `fn_canjear_premio` | `SELECT tenant_id FROM premios WHERE id = p_premio_id` |

**Es la propiedad que hace segura la verificación.** Aunque un atacante pase un `p_paciente_id` de otro tenant, el `v_tenant_id` resultante es el de ese otro tenant, y el `EXISTS` sobre `tenant_users` falla. El parámetro no controla contra qué tenant se valida.

`fn_canjear_premio` además cruza: busca al paciente con `AND tenant_id = v_premio_tenant_id`. **No se puede canjear un premio del tenant A para un paciente del tenant B.**

### 8.2 · C4 — RLS

```sql
CREATE POLICY tenant_delete_pacientes ON pacientes
  FOR DELETE TO authenticated
  USING (
    tenant_id IN (
      SELECT tu.tenant_id FROM tenant_users tu
      WHERE tu.user_id = (select auth.uid())
        AND tu.role IN ('owner','admin')     -- ← AND, misma subconsulta
    )
  );
```

El conjunto es **subconjunto estricto** del que devolvía la policy `FOR ALL`. Agregar `AND role IN (...)` solo quita filas.

### 8.3 · El error a evitar

```sql
-- ❌ NUNCA
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  OR auth_has_role(ARRAY['owner'])
)
```

`OR` entre tenant y rol convierte el aislamiento en opcional. Y un helper sin `tenant_id` responde por el rol en **cualquier** clínica.

### 8.4 · Verificación obligatoria

Antes de dar el bloque por cerrado, **los 81 tests de `tenant-isolation.test.ts` tienen que seguir en verde**, más los nuevos cross-tenant de §9.

---

## 9. Plan de testing

### 9.1 · Matriz por control

| Control | Test PGlite | Test unitario | Integración Supabase | Test manual |
|---|:---:|:---:|:---:|:---:|
| **C1** rol en ajustar puntos | ✅ | — | opcional | recomendado |
| **C1** límite de 500 puntos | ✅ | — | — | — |
| **C1** nota obligatoria | ✅ | — | — | — |
| **C2** rol en canjear premio | ✅ | — | opcional | recomendado |
| **C2** tenant isolation en canje | ✅ | — | — | — |
| **C3** default privilege revocado | ⚠️ **parcial** | ✅ *(patrón)* | **✅ requerido** | — |
| **C4** DELETE solo owner/admin | ✅ | — | — | recomendado |
| **C4** tenant isolation en DELETE | ✅ | — | — | — |
| **C5** CHECK de rol | ✅ | — | — | — |
| **C5** DEFAULT `staff` | ✅ | — | — | — |
| Regresión: tenant isolation | ✅ *(81 existentes)* | — | — | — |
| Regresión: la app sigue andando | — | — | — | **✅ requerido** |

### 9.2 · Tests PGlite

Nuevo archivo, siguiendo el patrón de `tenant-isolation.test.ts` (`SET ROLE authenticated` + claim `sub`).

**C1 · `fn_ajustar_puntos_manual`**

| # | Caso | Esperado |
|---|---|---|
| 1 | `owner` ajusta +100 en su tenant | ✅ saldo actualizado |
| 2 | `admin` ajusta +100 | ✅ |
| 3 | **`odontologo` ajusta** | ❌ excepción |
| 4 | **`staff` ajusta** | ❌ excepción |
| 5 | **`owner` del tenant A sobre paciente del tenant B** | ❌ excepción |
| 6 | **`owner` ajusta +501** | ❌ excepción de límite |
| 7 | `owner` ajusta +500 | ✅ borde permitido |
| 8 | **`owner` con nota vacía** | ❌ excepción |
| 9 | Ajuste que dejaría saldo negativo | ❌ *(regresión — ya existía)* |
| 10 | Tipo de movimiento inválido | ❌ *(regresión)* |

**C2 · `fn_canjear_premio`**

| # | Caso | Esperado |
|---|---|---|
| 11 | `owner` canjea | ✅ stock y saldo descontados |
| 12 | `admin` canjea | ✅ |
| 13 | `staff` canjea | ✅ *(según P6)* |
| 14 | **`odontologo` canjea** | ❌ *(según P6)* |
| 15 | **Premio del tenant A, paciente del tenant B** | ❌ |
| 16 | Premio inactivo | ❌ *(regresión)* |
| 17 | Sin stock | ❌ *(regresión)* |
| 18 | Saldo insuficiente | ❌ *(regresión)* |

**C4 · DELETE de pacientes**

| # | Caso | Esperado |
|---|---|---|
| 19 | `owner` borra en su tenant | ✅ |
| 20 | `admin` borra | ✅ |
| 21 | **`odontologo` borra** | ❌ 0 filas afectadas |
| 22 | **`staff` borra** | ❌ 0 filas |
| 23 | **`owner` del A borra paciente del B** | ❌ 0 filas |
| 24 | Los cuatro roles pueden SELECT/UPDATE | ✅ *(no se rompió la lectura)* |

**C5 · Roles**

| # | Caso | Esperado |
|---|---|---|
| 25 | `INSERT tenant_users(role='lector')` | ❌ viola el CHECK |
| 26 | Los 4 roles válidos se insertan | ✅ |
| 27 | `INSERT` sin `role` | ✅ queda `staff` |

**Detalle sobre el 21-23:** RLS no lanza excepción en un DELETE denegado — devuelve **0 filas afectadas**. El test debe verificar el conteo, no esperar un error.

### 9.3 · Test unitario — guarda de patrón

Al estilo de `guardas-multitenant.test.ts`:

```
Recorre supabase/migrations/*.sql
Por cada CREATE FUNCTION:
  → exige un GRANT EXECUTE ... TO explícito en el mismo archivo
  → falla si no está
```

**Es lo que evita que C3 se convierta en una trampa**: sin esta guarda, alguien crea una función, no la concede, y descubre el problema en producción.

### 9.4 · Integración Supabase — **requerido para C3**

`ALTER DEFAULT PRIVILEGES` depende de qué rol crea el objeto. En PGlite todo lo crea el mismo rol; en Supabase intervienen `postgres`, `supabase_admin` y el pooler. **PGlite no reproduce ese escenario.**

**Verificación en staging:**

```sql
-- 1. Aplicar C3
-- 2. Crear una función de prueba
CREATE FUNCTION public.__prueba_grant() RETURNS int LANGUAGE sql AS 'SELECT 1';
-- 3. Comprobar que authenticated NO puede ejecutarla
SELECT has_function_privilege('authenticated', 'public.__prueba_grant()', 'EXECUTE');
--    → esperado: false
-- 4. Limpiar
DROP FUNCTION public.__prueba_grant();
```

**Si devuelve `true`, C3 no tuvo efecto** y hay que investigar qué rol está creando las funciones.

### 9.5 · Manual — obligatorio antes de cerrar

- ☐ Ajustar puntos como admin → funciona
- ☐ Ajustar 501 puntos → mensaje comprensible en la UI
- ☐ Canjear un premio → funciona
- ☐ Borrar un paciente de prueba → funciona
- ☐ `/pacientes`, `/pacientes/[id]`, `/agenda`, `/dashboard`, `/finanzas` → sin errores
- ☐ Marcar asistencia → sigue acreditando puntos

**Los mensajes de error importan.** Las Server Actions devuelven `{ success:false, error }` y la UI lo muestra tal cual: el texto del `RAISE EXCEPTION` es lo que va a leer el usuario.

---

## 10. Limitaciones de PGlite

**Lo que NO puede verificarse en PGlite, dicho explícitamente:**

| Limitación | Afecta a | Alternativa |
|---|---|---|
| No reproduce `ALTER DEFAULT PRIVILEGES` con roles de Supabase | **C3** | Integración en staging (§9.4) |
| No tiene `storage.objects` ni el bucket | Storage | Manual — **fuera de alcance** |
| `auth.uid()` es una función simulada, no el JWT real de GoTrue | C1, C2, C4 | Fiel al comportamiento; la diferencia es de origen, no de semántica |
| No tiene PostgREST: no valida cómo se exponen las funciones | C1, C2 | Manual |
| No reproduce el pooler ni el rol `authenticator` | C3 | Integración |

**No voy a presentar como verificado nada de esta lista.** C3 queda como **parcialmente verificable en PGlite y con verificación obligatoria en Supabase real.**

---

## 11. Verificación requerida en Supabase real

| # | Qué | Cuándo | Bloqueante |
|---|---|---|---|
| V1 | `SELECT DISTINCT role FROM tenant_users` → solo valores esperados | **Antes de C5** | **Sí** |
| V2 | Inventario de funciones en `public` y sus grants actuales | **Antes de C3** | **Sí** |
| V3 | Prueba de función nueva sin grant (§9.4) | Después de C3 | **Sí** |
| V4 | Ajustar puntos y canjear premio desde la app | Después de C1, C2 | **Sí** |
| V5 | Las 5 pantallas principales funcionan | Después de todo | **Sí** |
| V6 | `EXPLAIN ANALYZE` de un DELETE sobre `pacientes` | Después de C4 | No |

**V2 es el que más me importa.** Antes de revocar el default hay que saber qué funciones existen y con qué grants, para confirmar que ninguna dependía del privilegio implícito:

```sql
SELECT p.proname,
       p.prosecdef AS security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ejecuta,
       pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
ORDER BY p.prosecdef DESC, p.proname;
```

**Si alguna función tiene `auth_ejecuta = true` y no aparece con `GRANT` explícito en las migraciones, dependía del default y hay que concederla a mano antes de C3.**

---

## 12. Rollback

| Cambio | Cómo se revierte | ¿Reversible? | ¿Afecta datos? | ¿Requiere redeploy? |
|---|---|---|---|---|
| **C1** | `CREATE OR REPLACE FUNCTION` con el cuerpo anterior | **Sí, total** | No | No |
| **C2** | Ídem | **Sí, total** | No | No |
| **C3** | `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO authenticated` | **Sí, total** | No | No |
| **C4** | `DROP POLICY tenant_delete_pacientes` + restaurar la `FOR ALL` | **Sí, total** | No | No |
| **C5 · CHECK** | `ALTER TABLE tenant_users DROP CONSTRAINT tenant_users_role_check` | **Sí, total** | No | No |
| **C5 · DEFAULT** | `ALTER COLUMN role SET DEFAULT 'admin'` | **Sí, total** | No | No |

**Ninguno modifica datos. Ninguno requiere redeploy. Todos se revierten con SQL.**

Es la propiedad que define este bloque: **cinco cambios, cero riesgo de pérdida de datos, rollback en minutos.**

**Guardar antes de empezar:**

```sql
-- Cuerpo actual de las dos funciones, para el rollback
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('fn_ajustar_puntos_manual','fn_canjear_premio');

-- Definición actual de la policy
SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy WHERE polrelid = 'pacientes'::regclass;
```

---

## 13. Orden exacto de implementación

### Día 1 · Verificación y preparación — 3 h

1. **V1** — `SELECT DISTINCT role FROM tenant_users`
2. **V2** — inventario de funciones y grants
3. Guardar los cuerpos actuales para rollback (§12)
4. Escribir la migración con C1 a C5 *(un solo archivo)*
5. Escribir los tests PGlite (27 casos)

### Día 2 · Staging — 4 h

6. Aplicar la migración en un proyecto de staging
7. **V3** — prueba de función nueva sin grant
8. Correr `npm test` completo → los 468 + los nuevos
9. Verificar que los 81 de tenant isolation siguen verdes
10. **V4** — ajustar puntos y canjear desde la app de staging

### Día 3 · Producción — 2 h

11. Aplicar la migración en producción, **en una sola transacción**
12. **V5** — las 5 pantallas
13. Manual: ajustar puntos, canjear, borrar un paciente de prueba
14. Observar 24 h

**Total: 2 a 3 días.**

### Regla de contención

> **Si algún paso requiere modificar un archivo de `src/`, sale del bloque.**

Es lo que impide que se convierta en P0-05 sin darse cuenta. La única excepción admisible sería ajustar el texto de un mensaje de error, y ni eso hace falta: las Server Actions ya propagan el mensaje del `RAISE EXCEPTION`.

---

## 14. Criterios de aceptación

| # | Criterio | Cómo se verifica |
|---|---|---|
| 1 | `odontologo` y `staff` **no** pueden ajustar puntos | Tests 3, 4 |
| 2 | Ajuste mayor al límite → rechazado | Test 6 |
| 3 | Ajuste sin nota → rechazado | Test 8 |
| 4 | `odontologo` **no** puede canjear *(según P6)* | Test 14 |
| 5 | `odontologo` y `staff` **no** pueden borrar pacientes | Tests 21, 22 |
| 6 | **Ningún cruce entre tenants** en las tres operaciones | Tests 5, 15, 23 |
| 7 | Una función nueva **no** queda ejecutable por `authenticated` | **V3 en Supabase real** |
| 8 | Guarda de patrón: toda función con `GRANT` explícito | Test unitario |
| 9 | Rol inválido → rechazado por el `CHECK` | Test 25 |
| 10 | **Los 81 tests de tenant isolation siguen verdes** | `npm test` |
| 11 | **Los 468 tests actuales siguen verdes** | `npm test` |
| 12 | Las 5 pantallas funcionan | V5, manual |
| 13 | Los mensajes de error se leen bien en la UI | Manual |
| 14 | **Cero archivos de `src/` modificados** | `git diff --stat` |

**El 14 es el que define que el bloque no se desbordó.**

---

## 15. Riesgos residuales

**Lo que este bloque NO cierra, y hay que saberlo:**

| # | Riesgo residual | Por qué queda | Dónde se cierra |
|---|---|---|---|
| **RR1** | El SQL Editor y la service-role key siguen pudiendo todo | Límite de la plataforma (§0.1) | No se cierra. Se gestiona con control de acceso al proyecto |
| **RR2** | Recepción puede escribir historia clínica, ver finanzas, borrar fotos | Es RBAC | **P0-05** |
| **RR3** | El DELETE sigue destruyendo historia clínica y dejando fotos huérfanas | C4 solo restringe **quién**, no **qué pasa** | Soft delete |
| **RR4** | Se puede cancelar una cita pasada o facturada, por dos caminos | No es bypass de autorización | **P0-08** |
| **RR5** | Las 22 rutas con `service_role` siguen salteando RLS | Ya inventariadas; validan a mano | P0-05 |
| **RR6** | Las vistas `bi_*` siguen existiendo | Acceso ya revocado. Sin bypass abierto | P0-07 |
| **RR7** | El límite de 500 puntos es arbitrario | Necesita tu criterio de negocio | Decisión |
| **RR8** | Si un admin ajustaba >500 habitualmente, se le rompe el flujo | **NO VERIFICADO** — no consulté `historial_puntos` | Consultar antes de aplicar |

**Sobre RR8**, conviene mirarlo antes de fijar el tope:

```sql
SELECT max(abs(puntos_afectados)) AS maximo,
       count(*) FILTER (WHERE abs(puntos_afectados) > 500) AS superan_500,
       count(*) AS total
FROM historial_puntos
WHERE tipo_movimiento IN ('ajuste_manual','ajuste_reverso');
```

Si hay ajustes históricos sobre 500, el tope está mal calibrado.

---

## 16. Decisiones necesarias antes de implementar

| # | Pregunta | Bloquea | Sugerencia |
|---|---|---|---|
| **B1** | ¿Cuál es el límite por ajuste de puntos? | C1 | 500 — **confirmar con RR8** |
| **B2** | ¿Odontólogo canjea premios? *(= P6)* | C2 | No |
| **B3** | ¿La nota es obligatoria en los ajustes? | C1 | Sí |
| **B4** | ¿Se aplica C4 aunque hoy no cambie nada? | C4 | Sí — cierra la puerta antes de que entre alguien |

**B2 es P6.** Las otras tres son nuevas y específicas de este bloque.

---

*Especificación. Ningún archivo modificado, ninguna migración creada, ninguna función alterada, sin deploy, sin tocar Supabase ni datos reales. Todos los comandos ejecutados fueron de lectura sobre el repositorio.*
