# P0-05 v2 · Bloque de funciones — B1.2 + B1.3

**Fecha:** 20/08/2026
**Estado:** 🟠 **DISEÑO. No implementado. Requiere autorización explícita.**

> **Decisiones que lo habilitan:** DO-2 (±500) · DO-3 (nota obligatoria, mín. 10) · DO-4 (odontólogo no canjea) · DO-6 (multirol)
> **Evidencia que lo habilita:** A-1.2 — los cuerpos vivos de las dos funciones son **byte-idénticos** al repositorio (md5 `5cbd955856` y `7dc9bdecc5`). No hay riesgo de pisar lógica que no conocemos.
> **Independiente de B1.6.** No depende de la ventana de observación.

---

## 1 · Alcance

| Función | Qué se agrega | Decisión |
|---|---|---|
| `fn_ajustar_puntos_manual` | Verificación de rol → `owner`, `admin` | DO-6 |
| | Límite `abs(puntos) ≤ 500` | DO-2 |
| | Nota obligatoria, mín. 10 caracteres tras `trim` | DO-3 |
| `fn_canjear_premio` | Verificación de rol → `owner`, `admin`, `staff` | DO-4 |

**Fuera de alcance:** las otras 12 funciones · `search_path` de las 9 sin `pg_temp` (R-12 — **estas dos ya lo tienen**, confirmado en N-2) · privilegios (B1.1/B1.6) · RLS · el modelo multirol en sí.

---

## 2 · La costura — decisión de diseño que hay que tomar

DO-6 adoptó **multirol con tabla de asociación**. Eso plantea una pregunta que no se puede esquivar: **¿contra qué se verifica el rol hoy?**

Hoy la verdad está en `tenant_users.role` — una columna de texto, un valor por usuario. En Fase 2 pasa a una tabla de asociación. Si B1.2/B1.3 consultan la columna directamente, **hay que reescribirlas en Fase 2**.

### Opción A — consulta directa *(mínima hoy, se rehace después)*

```sql
IF NOT EXISTS (
  SELECT 1 FROM tenant_users
  WHERE user_id = v_user_id AND tenant_id = v_tenant_id
    AND role IN ('owner','admin')
) THEN
  RAISE EXCEPTION 'Solo un administrador puede ajustar puntos manualmente.';
END IF;
```

Sigue exactamente el patrón del chequeo de tenant que ya existe en ambas funciones. **Cero objetos nuevos.** Se reescribe en Fase 2.

### Opción B — función auxiliar `tiene_rol()` ← **recomendada**

```sql
-- Hoy lee tenant_users.role. En Fase 2 pasa a leer la tabla de asociación.
-- Las funciones que la usan NO cambian.
CREATE FUNCTION public.tiene_rol(p_tenant_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
      AND role = ANY(p_roles)
  )
$$;

REVOKE ALL ON FUNCTION public.tiene_rol(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiene_rol(uuid, text[]) TO authenticated, service_role;
```

Y en las funciones:

```sql
IF NOT tiene_rol(v_tenant_id, ARRAY['owner','admin']) THEN
  RAISE EXCEPTION 'Solo un administrador puede ajustar puntos manualmente.';
END IF;
```

**Por qué la recomiendo:** la migración multirol de Fase 2 tiene que reescribir **4 políticas RLS y 5 rutas de API**. Con la costura, además solo cambia el cuerpo de `tiene_rol` — no se vuelven a tocar B1.2 ni B1.3. Es un punto único donde se concentra la definición de "tener un rol".

**Tres cosas a tener en cuenta, dichas de frente:**

**Debe llevar su propio `REVOKE`.** Es una función nueva, y mientras B1.1 no aterrice **nacería con `GRANT EXECUTE` para `anon`** por el default privilege. Es exactamente el mecanismo de R-11. El `REVOKE` va en la misma migración, no después. *(Y es justo lo que la guarda G-2 de B1.7 va a exigir automáticamente.)*

**`SECURITY DEFINER` es necesario y hay que justificarlo.** Si fuera `INVOKER` y alguna vez se usa dentro de una política sobre `tenant_users`, la lectura interna dispararía esa misma política → recursión infinita. Con `DEFINER` y dueño `postgres`, la lectura salta RLS. Es el mismo motivo por el que las cuatro funciones existentes son `DEFINER`.

**`search_path` fijo con `pg_temp` explícito.** Cierra el vector de R-12 desde el principio. `anon` y `authenticated` **tienen privilegio `TEMP`** — confirmado en producción — así que una `DEFINER` sin `pg_temp` anclado es secuestrable.

### ✅ RESUELTO — 20/08/2026

**Opción B aprobada.** Con una precisión del owner que cambia dónde vive la función:

> *"Aprobado `tiene_rol()` como costura de compatibilidad entre el modelo actual y el futuro modelo multirol. **Debe crearse y protegerse dentro de la misma migración que B1.1**; no puede quedar expuesta a `anon` por default privileges."*

**`tiene_rol()` sale de este bloque y pasa a la migración de B1.1.** Acá solo se consume.

**Orden dentro de la migración de B1.1 — importa:**

1. Primero los `ALTER DEFAULT PRIVILEGES … REVOKE`
2. Después el `CREATE FUNCTION tiene_rol(...)` → **nace limpia**
3. Igual, `REVOKE ALL … FROM PUBLIC, anon` explícito

El paso 3 es redundante si el 1 funcionó. **Va igual**: si el 1 falla por algún motivo que no anticipamos, el 3 es lo único que impide que la función nazca ejecutable por `anon`.

---

## 3 · B1.2 · `fn_ajustar_puntos_manual`

**Migración:** `CREATE OR REPLACE FUNCTION` con el cuerpo vivo actual más tres bloques. **La firma no cambia.**

### Dónde entra cada bloque

El cuerpo actual, verificado en producción, tiene este orden:

```
1. Validar tipo de movimiento          ← existe
2. auth.uid() no nulo                  ← existe
3. SELECT … FROM pacientes FOR UPDATE  ← existe (lock)
4. Validar pertenencia al tenant       ← existe
   ── acá entran los tres bloques nuevos ──
5. Calcular saldo, rechazar negativo   ← existe
6. UPDATE pacientes                    ← existe
7. INSERT historial_puntos             ← existe
```

Los tres van **entre 4 y 5**: después de conocer el tenant y antes de tocar datos.

### Bloque 1 · Rol *(DO-6)*

```sql
IF NOT tiene_rol(v_tenant_id, ARRAY['owner','admin']) THEN
  RAISE EXCEPTION 'Solo un administrador puede ajustar puntos manualmente.';
END IF;
```

### Bloque 2 · Límite *(DO-2)*

```sql
IF abs(p_puntos_afectados) > c_limite_ajuste THEN
  RAISE EXCEPTION 'El ajuste no puede superar los % puntos por operación.', c_limite_ajuste;
END IF;
```

`c_limite_ajuste CONSTANT integer := 500;` declarado en el `DECLARE`. **Constante nombrada, no literal suelto** — para que se encuentre cuando haya que revisarlo junto con `ars_por_punto`.

### Bloque 3 · Nota *(DO-3)*

```sql
IF p_nota IS NULL
   OR length(trim(p_nota)) < c_nota_minima
   OR trim(p_nota) = 'Ajuste manual de puntos' THEN
  RAISE EXCEPTION 'El ajuste requiere una nota de al menos % caracteres que lo justifique.', c_nota_minima;
END IF;
```

**Y hay que quitar el `COALESCE` del `INSERT`.** Hoy la función hace:

```sql
… v_user_id, COALESCE(p_nota, 'Ajuste manual de puntos')
```

Con la nota obligatoria el `COALESCE` es inalcanzable, pero dejarlo es dejar una trampa: si alguien relaja la validación, el sistema vuelve a inventar notas en silencio. **Se reemplaza por `trim(p_nota)`.**

El rechazo explícito del texto autogenerado es lo que impide que alguien lo copie y pegue para cumplir la letra.

### Lo que NO se toca

Las guardas existentes se conservan íntegras: validación de `tipo_movimiento`, `auth.uid()` no nulo, `FOR UPDATE` sobre `pacientes`, rechazo de saldo negativo, y el `INSERT` en el ledger con `aprobado_por_usuario_id`. **Ninguna se modifica.**

---

## 4 · B1.3 · `fn_canjear_premio`

**Un solo bloque**, después de la validación de tenant existente:

```sql
IF NOT tiene_rol(v_premio_tenant_id, ARRAY['owner','admin','staff']) THEN
  RAISE EXCEPTION 'Tu rol no permite canjear premios.';
END IF;
```

Ojo con el detalle: la función usa **`v_premio_tenant_id`**, no `v_tenant_id`. Es el tenant del premio, resuelto antes que el del paciente, y es contra el que ya valida la pertenencia. **Usar la variable equivocada abriría un hueco cross-tenant.**

**Se conserva todo lo demás:** premio existe, premio activo, pertenencia al tenant, paciente del mismo tenant, `FOR UPDATE`, stock, saldo suficiente, descuento de stock y de saldo, e `INSERT` en el ledger.

**Nada más cambia.** DO-4 solo excluye a `odontologo`.

---

## 5 · Tests

Todos en **PGlite**, sobre el harness ya extendido con la columna `role` (entrada 003). El harness **sí sirve acá**: lo que se prueba es lógica de función, no privilegios.

⚠️ **Precondición:** el harness necesita `pacientes.puntos_saldo_cache`, `premios` e `historial_puntos` con sus columnas reales. Hoy las tablas sintéticas son `(id, tenant_id, dato)`. **Hay que extenderlo, y eso es parte de este bloque.**

⚠️ **Y el cuerpo debe cargarse desde el dump vivo, no transcribirse.** Si lo escribo a mano en el test, valido mi transcripción, no la función.

### B1.2 — 10 casos

| # | Caso | Esperado |
|---|---|---|
| 1-2 | `owner` / `admin` ajustan +100 | ✅ |
| **3** | **`odontologo` ajusta** | ❌ excepción de rol |
| **4** | **`staff` ajusta** | ❌ excepción de rol |
| **5** | **`owner` del tenant A sobre paciente del B** | ❌ *(regresión del chequeo existente)* |
| **6** | **501 puntos** | ❌ excepción de límite |
| 7 | Exactamente 500 | ✅ |
| 8 | **−501** | ❌ — el límite es sobre `abs()` |
| **9** | **Nota de 9 caracteres** | ❌ excepción de nota |
| **10** | **Nota = `'Ajuste manual de puntos'`** | ❌ — el texto autogenerado no cuenta |

*Regresiones que deben seguir en verde:* saldo negativo rechazado · `tipo_movimiento` inválido rechazado · sin `auth.uid()` rechazado · el ledger registra `aprobado_por_usuario_id`.

### B1.3 — 6 casos

| # | Caso | Esperado |
|---|---|---|
| 11-13 | `owner` / `admin` / `staff` canjean | ✅ |
| **14** | **`odontologo` canjea** | ❌ excepción de rol |
| **15** | **Premio del tenant A, paciente del B** | ❌ *(regresión)* |
| 16 | Premio inactivo / sin stock / saldo insuficiente | ❌ *(regresión)* |

### Si se elige la opción B — 4 casos para `tiene_rol()`

| # | Caso | Esperado |
|---|---|---|
| 17 | Usuario con el rol pedido | `true` |
| 18 | Usuario sin el rol pedido | `false` |
| **19** | **Usuario de otro tenant con el rol** | **`false`** |
| 20 | Sin `auth.uid()` | `false` |

**El 19 es el que importa:** tener el rol en una clínica no puede habilitar nada en otra.

---

## 6 · Orden, rollback y aceptación

| # | Paso | Bloquea |
|---|---|---|
| 0 | Confirmar que la UI de ajuste envía una nota de ≥10 caracteres | **Sí** |
| 1 | Guardar el `pg_get_functiondef()` vivo de las dos *(línea base de rollback)* | Sí |
| 2 | Extender el harness PGlite con las columnas reales | Sí |
| 3 | Opción A o B *(§2)* | Sí |
| 4 | Migración única, transaccional | — |
| 5 | Los 16-20 casos + los 471 existentes en verde | Sí |
| 6 | Pruebas manuales *(abajo)* | Sí |
| 7 | Bitácora | — |

**El paso 0 es el que puede romper producción.** `ajustarPuntosManualAction` recibe `nota: string` obligatorio en TypeScript, pero **eso no garantiza que el formulario lo exija ni que valide longitud**. Si permite enviar una nota corta o vacía, el flujo se rompe con la validación nueva. **Verificar antes, no después.**

### Pruebas manuales

- [ ] Ajustar +100 con nota válida como admin → funciona
- [ ] Ajustar 501 → mensaje comprensible en la UI
- [ ] Ajustar con nota de 3 caracteres → mensaje comprensible
- [ ] Canjear un premio como admin → funciona
- [ ] Marcar asistencia → sigue acreditando puntos *(no se toca `fn_aprobar_asistencia`)*

**Los mensajes importan.** Las Server Actions devuelven `{success:false, error}` y la UI muestra `error.message` tal cual. **El texto del `RAISE EXCEPTION` es lo que lee el usuario final.**

### Rollback

`CREATE OR REPLACE FUNCTION` con la definición guardada en el paso 1. Total, sin datos, sin redeploy. Si se eligió la opción B, además `DROP FUNCTION tiene_rol(uuid, text[])`.

### Aceptación

- [ ] `odontologo` y `staff` no pueden ajustar puntos
- [ ] `odontologo` no puede canjear premios
- [ ] 501 y −501 rechazados; 500 aceptado
- [ ] Nota vacía, corta o autogenerada rechazadas
- [ ] Aislamiento cross-tenant intacto en ambas funciones
- [ ] Las guardas previas siguen funcionando
- [ ] 471 tests + los nuevos en verde · `tsc --noEmit` exit 0
- [ ] **Cero archivos de `src/` modificados** *(la excepción de DO-5 es solo para B1.4)*
- [ ] Si se usó opción B: `anon` **no** puede ejecutar `tiene_rol`

---

## 7 · Nota sobre el modelo multirol

Este bloque verifica roles contra `tenant_users.role`, que hoy tiene **2 filas, ambas `admin`** — verificado en producción.

Con multirol, `tiene_rol()` pasa a leer la tabla de asociación y **la semántica se vuelve más permisiva de forma deseable**: el dueño que además ejerce tendrá `owner` + `odontologo`, y podrá ajustar puntos y canjear premios **por su rol de owner**, no por el clínico.

**Eso es lo que vuelve inocuas a DO-4 y DO-8.** Las restricciones alcanzan a un odontólogo contratado sin rol administrativo, que es a quien se quiere alcanzar. Sin multirol, habrían generado fricción real en un consultorio de una sola persona.

---

*Diseño. Ninguna migración creada, nada ejecutado contra Supabase, ningún archivo de `src/` modificado, ningún commit.*
