# Revisión de pre-migración — B1.2 + B1.3

**Fecha:** 21/08/2026 · **Nada implementado. Sin SQL de escritura. Sin migraciones. Sin commit.**

---

## 1 · `src/lib/ajuste-puntos.ts` — ¿debe existir?

**Sí. 🟢** Pero con una condición que hay que escribir en el propio código: **no es un control de seguridad.**

### Qué regla pertenece a cada capa

| Regla | Dónde vive | Por qué |
|---|---|---|
| Monto `> 0` y finito | **UI** *(conveniencia)* | Evitar un round-trip por un campo vacío |
| Monto `≤ 500` | **AMBAS** | UI avisa · **DB decide** |
| Nota no vacía | **AMBAS** | idem |
| Nota `≥ 10` | **AMBAS** | idem |
| Nota ≠ texto de relleno | **AMBAS** | idem |
| **Autenticación** | **SOLO DB** | `auth.uid()` no es falsificable desde el cliente |
| **Pertenencia al tenant** | **SOLO DB** | Es la frontera de aislamiento |
| **Rol del actor** | **SOLO DB** | Un cliente puede mentir sobre su rol |
| **Saldo resultante ≥ 0** | **SOLO DB** | Depende del saldo actual, con lock |
| **`FOR UPDATE`** | **SOLO DB** | Concurrencia |
| Existencia del paciente | **SOLO DB** | — |

### Duplicación intencional

Las cuatro reglas de formato —monto, longitud, no vacío, texto de relleno— **están duplicadas a propósito**.

Sin la capa de UI, un usuario que escribe `"ok"` recibe:

```
Error en ajuste: El ajuste requiere una nota de al menos 10 caracteres que lo justifique.
```

…que en el mejor caso es legible, y en el peor —si el mensaje cambia o PostgREST lo envuelve— es un `500` sin explicación. **La duplicación compra claridad, no seguridad.**

Y está protegida: dos tests fijan que `LIMITE_AJUSTE_PUNTOS === 500` y `NOTA_MINIMA_CARACTERES === 10`. Si alguien los cambia sin tocar la migración, el test falla.

### 🔴 Duplicación peligrosa — la que hay que evitar

**El riesgo no es duplicar. Es que alguien crea que la UI valida.**

Concretamente:

- Que un futuro desarrollador vea `validarAjustePuntos()` y **saque la validación de la función SQL** por "redundante". La Server Action se puede invocar directamente: es un endpoint POST de Next.js, no hace falta pasar por el formulario.
- Que se agregue una segunda pantalla de ajuste que **no llame a `validarAjustePuntos()`** y nadie lo note, porque "ya está validado".

**Mitigación propuesta, sin implementar todavía:** un comentario al inicio de `fn_ajustar_puntos_manual` diciendo que la validación de la UI es cosmética y que esa función es la autoridad. El módulo TS ya lo dice; falta el lado SQL.

**⚠️ Y hay un hueco real que no cubre nada:** `ajustarPuntosManualAction` es una Server Action, o sea un endpoint. **Se puede llamar sin pasar por el formulario.** Hoy no valida nada por su cuenta — delega todo en la función SQL, que es lo correcto. Pero conviene saberlo: la UI no es una barrera, es un cartel.

---

## 2 · Diff conceptual contra el cuerpo vivo

**Autoridad:** definición viva obtenida en A-1.2, con md5 del cuerpo normalizado **idéntico** al del repositorio (`5cbd955856` y `7dc9bdecc5`). El repositorio refleja producción para estas dos.

### B1.2 · `fn_ajustar_puntos_manual`

| Propiedad | ACTUAL | NUEVO |
|---|---|---|
| Firma | `(uuid, integer, text, text)` | **sin cambio** |
| Retorno | `json` | **sin cambio** |
| Security | `DEFINER` | **sin cambio** |
| Owner | `postgres` | **sin cambio** |
| `search_path` | `public, pg_temp` | **sin cambio** ✅ *(R-12 no aplica)* |
| Tablas leídas | `pacientes`, `tenant_users` | **sin cambio** |
| Tablas escritas | `pacientes`, `historial_puntos` | **sin cambio** |

**Lógica — orden actual y dónde entra lo nuevo:**

```
1. Validar tipo_movimiento ∈ {ajuste_manual, ajuste_reverso}    ← se conserva
2. auth.uid() no nulo                                           ← se conserva
3. SELECT ... FROM pacientes WHERE id = p_paciente_id FOR UPDATE ← se conserva (lock)
4. IF NOT FOUND → 'Paciente no encontrado.'                     ← se conserva
5. Pertenencia al tenant vía tenant_users                       ← se conserva
   ══════════ ACÁ ENTRAN LOS TRES BLOQUES NUEVOS ══════════
   5a. Rol ∈ {owner, admin}                        ← NUEVO
   5b. abs(p_puntos_afectados) ≤ 500               ← NUEVO
   5c. Nota: no nula, ≥10 tras trim, ≠ relleno     ← NUEVO
6. v_new_saldo := cache + p_puntos_afectados                    ← se conserva
7. IF v_new_saldo < 0 → excepción                               ← se conserva
8. UPDATE pacientes                                             ← se conserva
9. INSERT historial_puntos                                      ← se conserva, CON UN CAMBIO
```

**El cambio del paso 9:**

```sql
-- ACTUAL
COALESCE(p_nota, 'Ajuste manual de puntos')
-- NUEVO
trim(p_nota)
```

El `COALESCE` queda inalcanzable con 5c aplicado. **Dejarlo sería dejar una trampa:** si alguien relaja la validación, el sistema vuelve a inventar notas en silencio.

**Cross-tenant:** sin cambio. El paso 5 ya lo cubre y funciona.
**Ante error:** `RAISE EXCEPTION` → PostgREST devuelve `500` con el mensaje → la Server Action lo pasa a `{success:false, error}` → la UI lo muestra crudo. **Por eso el texto del `RAISE` es lo que lee el usuario final.**

### B1.3 · `fn_canjear_premio`

| Propiedad | ACTUAL | NUEVO |
|---|---|---|
| Firma, retorno, security, owner, `search_path` | — | **sin cambio** |
| Tablas leídas | `premios`, `pacientes`, `tenant_users` | **sin cambio** |
| Tablas escritas | `premios`, `pacientes`, `historial_puntos` | **sin cambio** |

```
1. auth.uid() no nulo                                    ← se conserva
2. SELECT ... FROM premios WHERE id = p_premio_id         ← se conserva
   → obtiene v_premio_tenant_id
3. IF NOT FOUND → 'Premio no encontrado.'                ← se conserva
4. IF NOT v_activo → excepción                           ← se conserva
5. Pertenencia a v_premio_tenant_id                      ← se conserva
   ══════════ ACÁ ENTRA EL BLOQUE NUEVO ══════════
   5a. Rol ∈ {owner, admin, staff}                ← NUEVO (DO-4)
6. SELECT ... FROM pacientes
     WHERE id = p_paciente_id
       AND tenant_id = v_premio_tenant_id  FOR UPDATE     ← se conserva
7. Stock, saldo, descuentos, ledger                       ← se conserva
```

**Un solo bloque. Nada más cambia.**

**🟢 Estado de ambos diffs:** el punto de inserción es limpio, reusa variables ya calculadas, y **ninguna guarda existente se toca.**

---

## 3 · `tiene_rol()` — recomendación

# **Opción B**

Y con un matiz que cambia la naturaleza de la decisión: **`tiene_rol()` ya existe en producción**, creada en la entrada 009 con el ACL correcto. **Pero nadie la consume todavía**, así que sigue siendo reversible con un `DROP`.

### Por qué B y no A

| Criterio | A · consulta directa | B · `tiene_rol()` |
|---|---|---|
| Seguridad | Igual — ambas dentro de una DEFINER | Igual |
| Fase 2 | **Hay que reescribir B1.2 y B1.3** | **Solo cambia el cuerpo de `tiene_rol`** |
| Superficie | 0 objetos nuevos | 1 función más |
| Rollback | `CREATE OR REPLACE` | idem + `DROP FUNCTION` |
| Duplicación | La regla de rol se repite en cada función | Un punto único |

Fase 2 ya tiene que reescribir **4 políticas RLS y 5 rutas de API**. Con la costura, B1.2 y B1.3 quedan fuera de esa lista.

### Por qué NO la opción C que evalué

Consideré `tiene_rol(p_user_id uuid, p_tenant_id uuid, p_roles text[])` — pasando el usuario explícitamente, más limpio y testeable.

**La descarté.** Con `EXECUTE` para `authenticated`, cualquier usuario podría preguntar *"¿el usuario X tiene rol Y en el tenant Z?"*. Es divulgación de información sobre terceros, menor pero real.

**Con `auth.uid()` interno, la función solo puede responder sobre quien la llama.** Esa limitación es la protección.

### ⚠️ Detalle no obvio que hay que verificar

`fn_ajustar_puntos_manual` ya calcula `v_user_id := auth.uid()`. Si llama a `tiene_rol()`, **la función interna invoca `auth.uid()` otra vez.**

**Funciona**, porque `SECURITY DEFINER` **no altera** `request.jwt.claims` — cambia el rol de ejecución, no la sesión. Así que `auth.uid()` devuelve el mismo valor adentro.

**Pero es un supuesto, no una verificación.** Debe cubrirlo un test PGlite explícito: llamar a la función DEFINER externa y comprobar que la verificación de rol interna ve al usuario correcto. **Si esto falla, B1.2 y B1.3 rechazan a todo el mundo.**

---

## 4 · Privilegios de `tiene_rol()` — obligatorio

**Estado actual en producción, medido en la entrada 009:**

```
owner:       postgres
security:    DEFINER
search_path: public, pg_temp
acl:         postgres=X, authenticated=X, service_role=X
anon_exec:   false ✅
```

**Cómo debe quedar, y ya está así:**

| Rol | Debe | Por qué |
|---|---|---|
| `PUBLIC` | ❌ | Default de PostgreSQL; hay que revocarlo explícitamente — **R-17** |
| `anon` | ❌ | Sin sesión no hay rol que consultar |
| `authenticated` | ✅ | Lo llaman B1.2/B1.3, que corren como `authenticated` |
| `service_role` | ✅ | Para llamadas desde API |

**El `REVOKE` que debe acompañar toda creación:**

```sql
REVOKE ALL     ON FUNCTION public.tiene_rol(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.tiene_rol(uuid, text[]) TO authenticated, service_role;
```

**No es redundante.** R-17 confirmó que `ALTER DEFAULT PRIVILEGES … REVOKE … FROM PUBLIC` **no funciona en este entorno** — tres intentos, éxito sin efecto. Toda función nueva nace con `EXECUTE` para `PUBLIC`. **El `REVOKE` explícito es la única protección.**

### 🔴 Verificación pendiente — puede romper B1.2/B1.3

B1.6 revocó funciones. **No verificamos si `authenticated` conservó `EXECUTE` sobre `tiene_rol`.** La consulta posterior confirmó *"0 funciones ejecutables por `anon`"* — correcto, pero **no miró `authenticated`.**

Es el mismo error que casi oculta la reapertura de R-10: **verificar solo lo esperado.**

```sql
SELECT has_function_privilege('authenticated','public.tiene_rol(uuid,text[])','EXECUTE') AS debe_true,
       has_function_privilege('service_role', 'public.tiene_rol(uuid,text[])','EXECUTE') AS debe_true_2,
       has_function_privilege('anon',         'public.tiene_rol(uuid,text[])','EXECUTE') AS debe_false,
       coalesce(array_to_string(proacl, E'\n'),'(nulo)') AS acl
FROM pg_proc WHERE oid = 'public.tiene_rol(uuid,text[])'::regprocedure;
```

**Si `authenticated` perdió el `EXECUTE`, B1.2 y B1.3 fallarían para todos los usuarios.**

---

## 5 · Diseño de los tests PGlite

### 🔴 El harness NO alcanza

```
pacientes  (id uuid, tenant_id uuid, dato text)     ← sin puntos_saldo_cache
premios    (id uuid, tenant_id uuid, dato text)     ← sin costo_puntos, stock, activo
historial_puntos (id, tenant_id, dato)              ← sin las 13 columnas reales
```

**Y ningún test carga nunca estas dos funciones.** No hay precedente.

**Precedente a reusar:** `multitratamiento.test.ts:115` lee migraciones reales con `readFileSync(path.resolve(process.cwd(), 'supabase/migrations', archivo))` y las aplica a PGlite. **Ese es el patrón.**

⚠️ **El cuerpo debe cargarse desde el archivo de migración, nunca transcribirse.** Transcribir valida mi copia, no la función.

### Los 16 casos

**B1.2 — `fn_ajustar_puntos_manual`**

| # | Escenario | Rol | Tenant | Datos previos | Operación | Esperado | Riesgo que cubre |
|---|---|---|---|---|---|---|---|
| 1 | Ajuste válido | `owner` | A | saldo 100 | `+100`, nota 20ch | ✅ saldo 200 | Regresión: no romper el camino feliz |
| 2 | Ajuste válido | `admin` | A | saldo 100 | `+100`, nota 20ch | ✅ | idem |
| 3 | **Rol clínico** | **`odontologo`** | A | saldo 100 | `+100` | ❌ excepción de rol | **Escalada por rol** |
| 4 | **Recepción** | **`staff`** | A | saldo 100 | `+100` | ❌ excepción de rol | idem |
| 5 | **Cross-tenant** | `owner` de **A** | paciente de **B** | — | `+100` | ❌ 'No autorizado' | **Aislamiento** |
| 6 | Supera el límite | `admin` | A | — | `+501` | ❌ excepción de límite | DO-2 |
| 7 | Justo el límite | `admin` | A | — | `+500` | ✅ | Borde superior |
| 8 | **Negativo grande** | `admin` | A | saldo 600 | `−501` | ❌ | **El límite es sobre `abs()`** |
| 9 | Nota corta | `admin` | A | — | nota 9ch | ❌ excepción de nota | DO-3 |
| 10 | **Nota de relleno** | `admin` | A | — | `'Ajuste manual de puntos'` | ❌ | **Cumple longitud sin justificar** |
| 11 | Saldo negativo | `admin` | A | saldo 50 | `−100` | ❌ | Regresión |
| 12 | Paciente inexistente | `admin` | A | — | uuid random | ❌ 'Paciente no encontrado' | Regresión |
| 13 | **`auth.uid()` propaga** | `admin` | A | — | ajuste válido | ✅ y el ledger registra el actor correcto | **§3 — si falla, todo rechaza** |

**B1.3 — `fn_canjear_premio`**

| # | Escenario | Rol | Tenant | Datos previos | Operación | Esperado | Riesgo |
|---|---|---|---|---|---|---|---|
| 14 | Canje válido | `owner`/`admin`/`staff` | A | saldo 200, premio 100, stock 5 | canje | ✅ saldo 100, stock 4 | Regresión |
| 15 | **Odontólogo canjea** | **`odontologo`** | A | idem | canje | ❌ excepción de rol | **DO-4** |
| 16 | **Premio de otro tenant** | `admin` de A | premio de **B** | — | canje | ❌ 'No autorizado' | **§6 — el ataque cross-tenant** |

**Regresiones que deben seguir verdes:** premio inactivo · sin stock · saldo insuficiente · el ledger registra `aprobado_por_usuario_id`.

**Sobre concurrencia y doble canje:** el `FOR UPDATE` sobre `pacientes` ya existe y **no se toca**. PGlite es monoproceso: **no puede probar concurrencia real.** Lo dejo fuera con esa justificación explícita, en vez de escribir un test que aparenta cubrirlo.

---

## 6 · El punto crítico de B1.3 — `v_premio_tenant_id`

**Confirmado: debe usar `v_premio_tenant_id`.** 🟢

En el cuerpo vivo hay **dos variables de tenant, y llegan en momentos distintos:**

```sql
-- Paso 2: del PREMIO. Se resuelve primero.
SELECT nombre, costo_puntos, stock, activo, tenant_id
INTO   v_premio_nombre, v_costo_puntos, v_stock, v_activo, v_premio_tenant_id
FROM premios WHERE id = p_premio_id;

-- Paso 6: del PACIENTE, ya filtrado por el tenant del premio.
SELECT puntos_saldo_cache, tenant_id
INTO   v_puntos_saldo_cache, v_tenant_id
FROM pacientes
WHERE id = p_paciente_id AND tenant_id = v_premio_tenant_id
FOR UPDATE;
```

**`v_tenant_id` no existe todavía cuando se valida la autorización.** Usarla ahí sería `NULL`, y `tenant_id = NULL` nunca coincide → **la función rechazaría a todos**. Ruidoso, no peligroso.

### El ataque que evita — el caso peligroso es el inverso

**Si se moviera la verificación de rol después del paso 6 y usara `v_tenant_id`:**

Un `admin` del tenant **B** llama con `p_premio_id` de **A**. El paso 5 ya lo rechazaría… **salvo que también se cambiara.** El riesgo real es que un refactor futuro reordene los bloques y ambas verificaciones pasen a usar `v_tenant_id` — que en ese punto es el tenant del **paciente**.

Ahí: un admin de B podría canjear **un premio de A** para **un paciente de B**, descontando stock del catálogo ajeno. **Robo de stock cross-tenant**, con el ledger registrándolo como legítimo.

**Por eso la verificación de rol va inmediatamente después de la de pertenencia, contra la misma variable, en el paso 5.** El test #16 lo cubre.

---

## 7 · Verificación de la UI

Los 18 tests de `ajuste-puntos.test.ts` cubren los 8 criterios. **Verificado, no inferido:**

| Criterio | Test | Estado |
|---|---|---|
| 500 aceptado | *acepta exactamente el límite* | 🟢 |
| 501 rechazado | *rechaza el límite más uno* | 🟢 |
| 10 caracteres aceptados | *acepta una nota de exactamente el mínimo* | 🟢 |
| 9 rechazados | *rechaza una de 9: el borde de abajo* | 🟢 |
| `trim` funciona | *acepta si el contenido interno alcanza, y devuelve normalizada* | 🟢 |
| Nota vacía rechazada | *rechaza la nota vacía* | 🟢 |
| Solo espacios rechazado | *rechaza una nota que solo tiene espacios* | 🟢 |
| Mensajes claros | *"El motivo debe tener al menos 10 caracteres."* | 🟢 |

**Ningún bug crítico. No cambio nada.**

Una observación sin acción: el input hace `Math.abs(Number(...))`, así que escribir `-5` muestra `5`. Es preexistente —el signo lo da el desplegable— pero técnicamente transforma sin avisar. **Fuera de alcance.**

---

## 8 · Acoplamiento UI ↔ DB

| Regla | UI | DB | Fuente de verdad |
|---|:---:|:---:|---|
| Máximo 500 | ✅ | ⬜ *(B1.2)* | **DB** |
| Nota ≥ 10 | ✅ | ⬜ *(B1.2)* | **DB** |
| Nota ≠ relleno | ✅ | ⬜ *(B1.2)* | **DB** |
| Monto > 0 | ✅ | ❌ | **UI** *(la DB acepta 0; sería un no-op)* |
| **Tenant** | ❌ | ✅ | **DB — exclusiva** |
| **Rol** | ❌ | ⬜ *(B1.2/B1.3)* | **DB — exclusiva** |
| **Saldo no negativo** | ❌ | ✅ | **DB — exclusiva** |
| **Premio pertenece al tenant** | ❌ | ✅ | **DB — exclusiva** |
| **Autenticación** | ❌ | ✅ | **DB — exclusiva** |
| **Concurrencia** | ❌ | ✅ | **DB — exclusiva** |

**Las cinco reglas de seguridad e integridad viven solo en la DB.** La UI no duplica ninguna. 🟢

---

## 9 · Criterio de salida

| Punto | Estado |
|---|---|
| 1 · El módulo debe existir | 🟢 **LISTO** · falta comentario recíproco en el SQL |
| 2 · Diff conceptual | 🟢 **LISTO** |
| 3 · `tiene_rol()` | 🟡 **REQUIERE DECISIÓN** — recomiendo B |
| 4 · Privilegios | 🔴 **REQUIERE VERIFICACIÓN** — `authenticated` tras B1.6 |
| 5 · Harness | 🔴 **REQUIERE CAMBIO** — tablas sintéticas insuficientes |
| 6 · `v_premio_tenant_id` | 🟢 **LISTO** |
| 7 · UI | 🟢 **LISTO** |
| 8 · Acoplamiento | 🟢 **LISTO** |

### A · Decisiones pendientes

1. **Opción B para `tiene_rol()`.** Recomiendo sí. Ya existe en producción; nadie la consume.
2. **¿Se agrega el comentario recíproco** en las funciones SQL apuntando a `ajuste-puntos.ts`? Recomiendo sí.
3. **Roles de B1.3:** `owner`, `admin`, `staff` — confirmar contra DO-4.

### B · Archivos a modificar

- `src/lib/tenant-isolation.test.ts` **o** un archivo nuevo `src/lib/fidelizacion-roles.test.ts` — **recomiendo el segundo:** el harness actual tiene 88 tests que no deberían cargar el peso de este esquema
- Ningún archivo de `src/app/` — la UI ya está

### C · Migración a escribir

**Una sola**, `CREATE OR REPLACE` de las dos funciones, con el cuerpo vivo más los bloques nuevos. Sin `DROP`. Sin tocar firma. Sin tocar privilegios.

### D · Tests a agregar

Los 16 de §5, más 4 regresiones, en un archivo nuevo con su propio harness que cargue el esquema real de `pacientes`, `premios`, `historial_puntos`, `config_fidelizacion` y `tenant_users`.

### E · Orden

```
1. Verificar privilegios de tiene_rol      ← 🔴 bloquea todo
2. Decidir A/B/C                            ← 🟡
3. Harness nuevo con esquema real
4. Los 16 tests, en rojo (aún sin migración)
5. Escribir la migración
6. Los 16 en verde + los 494 existentes
7. tsc --noEmit
8. Aplicar en producción, de a un statement
9. Verificar ACL y pruebas manuales
10. Bitácora
```

**El paso 4 en rojo antes del 5 no es ceremonia:** un test que nunca falló no prueba nada. Es lo que nos enseñó `vistas-bi.test.ts`, verde durante semanas afirmando lo contrario de la realidad.

### F · Rollback

```sql
-- Guardar ANTES:
SELECT pg_get_functiondef(oid) FROM pg_proc
WHERE oid IN ('public.fn_ajustar_puntos_manual(uuid,integer,text,text)'::regprocedure,
              'public.fn_canjear_premio(uuid,uuid)'::regprocedure);
```

`CREATE OR REPLACE` con esa salida. Total, sin datos, sin redeploy. **`CREATE OR REPLACE` preserva el ACL**, así que los privilegios no se tocan al revertir.

### G · Verificaciones post-deploy

1. ACL de ambas funciones **sin cambios** — `CREATE OR REPLACE` los preserva, pero hay que confirmarlo
2. `anon` no ejecuta ninguna
3. Ajustar +100 con nota válida como admin → funciona
4. Ajustar 501 → **mensaje legible en la UI, no un error crudo**
5. Ajustar con nota de 3 caracteres → idem
6. Canjear un premio como admin → funciona
7. **Marcar asistencia → sigue acreditando puntos** *(no se toca `fn_aprobar_asistencia`, pero comparte `historial_puntos`)*
8. 24 h sin errores nuevos en Sentry

---

*Revisión de pre-migración. Nada implementado, ningún SQL de escritura ejecutado, ninguna migración creada, ningún commit.*
