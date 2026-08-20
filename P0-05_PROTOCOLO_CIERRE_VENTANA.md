# P0-05 · Protocolo de análisis — cierre de la ventana de observación

**Escrito el 19/08/2026, ANTES de ver los resultados.**
**Ventana:** desde `2026-08-19 21:31:44 UTC` (reset) hasta `2026-08-21 21:31:44 UTC` o posterior.

> **Por qué existe este documento.** Fijar los criterios antes de ver los datos es lo que impide racionalizarlos después. Si al ver el resultado quiero cambiar una regla de acá, eso es señal de que la regla estaba bien y mi conclusión está mal.
>
> **Nada de esto se modifica una vez que lleguen los resultados.**

---

## 1 · Verificaciones previas — antes de interpretar nada

Tres controles que **preceden** al análisis. Si alguno falla, la ventana no es válida y no se interpreta.

### V-1 · ¿El reset se sostuvo?

```sql
SELECT stats_reset FROM pg_stat_statements_info;
```

**Debe devolver `2026-08-19 21:31:44.446407+00`.** Si es posterior, alguien reinició de nuevo y la ventana se perdió: hay que empezar otra vez.

### V-2 · Control positivo — ¿se ejercitó el flujo anónimo?

**Este es el control que valida toda la prueba.** Sin él, un resultado vacío no significa nada.

En la consulta de cierre, `tenants_public` **tiene que aparecer con `calls > 0`**.

Es el único camino que el código ejecuta como `anon` (`TenantContext.tsx:154`), y se dispara cada vez que alguien abre el portal público sin sesión. Si no aparece:

> **El portal público no se usó durante la ventana. Resultado INCONCLUSO.**
> No se avanza. Se extiende la ventana y se ejercita el flujo explícitamente.

**Ausencia de tráfico anónimo no es evidencia de ausencia de consumidores.** Es evidencia de que no probamos nada.

### V-3 · ¿Hubo contaminación?

Durante la ventana **no debe haberse ejecutado**: ningún `curl` con la clave `anon`, ninguna prueba de diagnóstico contra la API, ningún `GRANT`/`REVOKE`, ningún cambio de RLS o funciones.

Si hubo algo, hay que declararlo **antes** de mirar los resultados, no después de ver una entrada incómoda.

---

## 2 · Pre-clasificación — para no leer mal el ruido

Estas entradas **van a aparecer** y no son señal. Se clasifican de antemano como **ESPERABLE**, y su presencia no bloquea B1.6:

| Entrada | `tabla` | Qué es |
|---|---|---|
| `select set_config('search_path', …), set_config('role', …)` | `null` | Preámbulo de PostgREST antes del `SET ROLE` |
| `COMMIT` | `null` | Cierre de transacción |
| `ABORT` | `null` | Transacción abortada — puede ser una denegación de RLS o un error |
| `SET ROLE anon` | `null` | Cambio de rol |
| `tenants_public` | `tenants_public` | **El camino legítimo. Además es el control positivo V-2** |

**Aclaración necesaria sobre el criterio 1.** *"Si aparece SOLO `tenants_public`"* no puede leerse literalmente: la fontanería de PostgREST siempre está. El criterio operativo correcto es:

> **Ninguna entrada con `tabla` no nula distinta de `tenants_public`.**

Un `ABORT` con muchas llamadas merece una nota —puede indicar denegaciones de RLS— pero **no bloquea** B1.6, porque no identifica una tabla.

---

## 3 · Qué esperar del flujo legítimo

Referencia de lo que el código puede producir como `anon`, verificado en `TenantContext.tsx:82-159`:

| Ruta | Consulta esperada | Rol |
|---|---|---|
| Cualquier ruta pública sin sesión | `SELECT … FROM tenants_public WHERE custom_domain = $1 OR subdominio_generico = $2` | **`anon`** |
| Cualquier ruta con sesión | `tenant_users`, `tenants` | `authenticated` — **no `anon`** |
| `/reserva`, `/t`, `/agendar`, `/paciente`, `/firmar` | vía rutas de API | **`service_role`** |
| `/login`, `/registro`, `/recuperar-password` | GoTrue, esquema `auth` | `supabase_auth_admin` — **no toca tablas de `public`** |

**Cualquier otra tabla de `public` bajo `anon` es señal, no ruido.**

---

## 4 · Cómo clasificar cada entrada

| Clasificación | Cuándo |
|---|---|
| **ESPERABLE** | `tenants_public`, o fontanería de PostgREST (§2) |
| **CONSUMIDOR VIVO** | Tabla de negocio, con `stats_since` dentro de la ventana, sin explicación en el código |
| **DIAGNÓSTICO NUESTRO** | Correlaciona con una acción declarada en V-3 |
| **INCONCLUSO** | Aparece, pero no se puede determinar el origen con la evidencia disponible |
| **REQUIERE INVESTIGACIÓN** | Tabla de negocio con volumen bajo, sin correlación establecida |

### Reglas que no se relajan

**`stats_since` ≠ última ejecución.** En esta ventana `stats_since` sí indica cuándo se vio la consulta **por primera vez desde el reset**, que es un dato mucho mejor que antes — pero sigue sin decir cuándo fue la última.

**`rows` no es evidencia de filas afectadas.** Verificado: PostgREST envuelve cada consulta en un agregado que devuelve una fila, así que `rows = calls` sistemáticamente. **No usar esa columna para argumentar nada.**

**No atribuir sin evidencia.** *"Debe ser el cron"* o *"debe ser un test viejo"* no son atribuciones. Una atribución exige correlación con un hecho verificable: una acción declarada, un log, un horario que coincida.

**1-3 llamadas no es ruido.** Con la ventana limpia, tres llamadas a `pacientes` significan que **algo las hizo en las últimas 48 horas**. `stats_since` da el timestamp: con eso se puede mirar qué pasó en ese momento.

---

## 5 · Decisión sobre B1.6

| Resultado | Decisión |
|---|---|
| V-1 falla | **INCONCLUSO** — ventana perdida, repetir |
| V-2 falla *(sin `tenants_public`)* | **INCONCLUSO** — no se ejercitó el flujo. Extender |
| V-3 declara contaminación | **INCONCLUSO** — evaluar el alcance primero |
| Solo `tenants_public` + fontanería | **AVANZA** |
| Cualquier tabla de negocio | **BLOQUEADO** — identificar el consumidor antes de revocar |

**Nada de "avanza con reservas".** Las tres opciones son las únicas.

---

## 6 · Si B1.6 AVANZA — qué habilita exactamente

La evidencia habilitante sería, en conjunto:

1. **Código** — las 11 rutas públicas no consultan tablas directamente; `TenantContext:154` es la única consulta sin sesión *(verificado 15/08)*.
2. **Repositorio** — sin Edge Functions, sin scripts, la clave `anon` usada en 4 lugares, todos dentro de la app *(verificado 15/08)*.
3. **Producción, ventana limpia** — 48 h de uso real sin tráfico anónimo contra tablas de negocio.
4. **Control positivo** — `tenants_public` con tráfico, o sea que el flujo sí se ejercitó.

**Ninguna de las cuatro alcanza sola.** La 3 sin la 4 no prueba nada. La 1 y la 2 son del repositorio, y P0-07 ya demostró que eso no basta.

### Verificación post-aplicación

El diseño está en `P0-05_v2_BLOQUE_PRIVILEGIOS.md` §4. Los controles obligatorios:

| # | Verificación | Criterio |
|---|---|---|
| 1 | ACL de las 43 relaciones | `anon` lee **exactamente una**: `tenants_public` |
| 2 | ACL de las 14 funciones | `anon` no ejecuta **ninguna** |
| 3 | `authenticated` | **Sin cambios** en tablas y funciones |
| 4 | Portal público en ventana privada | Carga con nombre, logo y colores |
| 5 | Reserva de un turno de prueba | Funciona *(va por API con `service_role`)* |
| 6 | Panel: `/pacientes`, `/agenda`, `/dashboard`, `/finanzas` | Sin errores |
| 7 | 24 h posteriores | Sin errores nuevos en Sentry |
| 8 | **`pg_stat_statements` de `anon` a las 24 h** | Solo `tenants_public`. **Detecta lo que rompimos sin saberlo** |

**La 8 es la que cierra el círculo:** si un consumidor desconocido empieza a fallar tras el `REVOKE`, sus intentos aparecen ahí.

**El rollback es un `GRANT`.** Total, sin datos, sin redeploy.

---

## 7 · Si B1.6 queda BLOQUEADO

**No proponer el `REVOKE` "con cuidado".** El paso siguiente es identificar el consumidor, y para eso:

1. `stats_since` de la entrada da el momento exacto.
2. Los logs de la API en el panel de Supabase (Logs → API) permiten filtrar por ese rango y muestran IP, user-agent y ruta. **Ese es el dato que identifica al cliente**, y está fuera de SQL.
3. Con el cliente identificado, se decide: migrarlo a `service_role` con su propia ruta de API, o aceptar el riesgo documentándolo.

---

## 8 · Bitácora

Cuando lleguen los resultados y se tome la decisión, corresponde la **entrada 009**. La 008 ya documenta el análisis previo y el reset.

**No se escribe antes de tener el resultado.**

---

*Protocolo escrito antes de ver los datos. No se modifica después.*
