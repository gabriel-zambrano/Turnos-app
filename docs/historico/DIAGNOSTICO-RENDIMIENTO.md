# Diagnóstico de lentitud — Turnos-app / DentalDesk

**Stack:** Next.js 14 (App Router) + Supabase (Postgres + Auth) + Vercel.
**Fecha del análisis:** 2 de julio de 2026.
**Método:** lectura directa del código fuente (`src/`) y de las migraciones SQL del repo. No requirió acceso a la base de datos en producción; los hallazgos son estructurales y se ven en el código tal cual está.

---

## Resumen ejecutivo

La lentitud no tiene una causa única: son **tres capas de sobrecosto que se suman en cada carga de página**.

1. **Base de datos sin índices**, con políticas de seguridad (RLS) que escanean tablas completas en cada consulta. Este es el hallazgo más grave y el que más empeora con el tiempo (a más pacientes/turnos, más lento).
2. **Resolución de sesión y de "tenant" duplicada y en serie** (server + cliente), agregando varios viajes de red secuenciales antes de que la página empiece a mostrar datos reales.
3. **Componentes gigantes 100% client-side** sin división de código, con el cliente de Supabase recreándose en cada render.

Ninguna de las correcciones propuestas cambia el comportamiento visible del sistema para el usuario: son optimizaciones de infraestructura (índices, caché, memoización) o eliminación de trabajo redundante.

---

## Hallazgo 1 — Base de datos: cero índices en las tablas críticas

Revisé las 10 migraciones SQL del repo. En total hay **un solo `CREATE INDEX`** en todo el proyecto (`supabase_migration_sprint_5_fidelizacion.sql:80`, sobre `historial_puntos`, una tabla secundaria).

Las tablas que se consultan en *cada* carga de agenda, dashboard y ficha de paciente —`citas`, `pacientes`, `bloqueos`, `tratamientos`, `tenant_users`— **no tienen ningún índice**, ni siquiera sobre `tenant_id`, que es la columna por la que se filtra absolutamente todo (es una app multi-tenant).

Ejemplo real, `src/app/agenda/page.tsx:457`:
```
supabase.from('citas').select('*, pacientes(nombre,telefono,token)')
  .eq('tenant_id', tenant.id).gte('fecha_hora', desde).lte('fecha_hora', hasta)
```
Sin índice en `citas(tenant_id, fecha_hora)`, Postgres tiene que recorrer toda la tabla `citas` de todos los consultorios cada vez que alguien abre la agenda.

**Por qué esto explica la lentitud "progresiva":** con pocos turnos de prueba no se nota. A medida que se acumulan meses de citas de varios consultorios, cada consulta se vuelve más lenta porque escanea más filas. Es el patrón clásico de "andaba bien al principio y ahora tarda".

### Agravante: las políticas RLS multiplican el problema

`supabase_migration_rls.sql:17-25` define el aislamiento por tenant así:
```sql
CREATE POLICY tenant_isolation_citas ON citas FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
```
La misma fórmula se repite para `pacientes`, `bloqueos` y `tratamientos`. Esto es correcto en cuanto a seguridad, pero tiene dos problemas de rendimiento conocidos (documentados por el propio Supabase):

- `tenant_users` tampoco tiene índice en `user_id`, así que la subconsulta interna escanea toda esa tabla.
- `auth.uid()` no está envuelto en `(select auth.uid())`, lo que le impide a Postgres cachear el resultado una sola vez por consulta; en cambio se re-evalúa fila por fila.

Es decir: cada fila de `citas` que Postgres evalúa dispara, en el peor caso, un escaneo completo de `tenant_users`. Con 2-3 consultorios esto no se nota; con decenas, sí.

---

## Hallazgo 2 — Resolución de sesión/tenant duplicada y en serie

Conté **hasta 5 consultas secuenciales a Supabase antes de que una página empiece a traer sus propios datos**:

| Paso | Dónde | Qué hace |
|---|---|---|
| 1-2 | `src/middleware.ts:35-53` | Crea un cliente admin de Supabase **nuevo en cada request** y hace 2 consultas *secuenciales* (`custom_domain`, luego `subdominio_generico`) para resolver el tenant por hostname. |
| 3 | `src/components/TenantContext.tsx:64` | Ya en el navegador, vuelve a pedir la sesión (`getSession()`). |
| 4 | `TenantContext.tsx:69-72` | Consulta `tenant_users` por `user_id` (sin índice, ver Hallazgo 1). |
| 5 | `TenantContext.tsx:83-87` | Consulta `tenants` por el id resuelto. |

El resultado del middleware (pasos 1-2) **nunca se usa en el cliente**: queda en un header `x-tenant-id` que ningún componente lee. El `TenantContext` repite todo el trabajo de resolución de tenant desde cero, en el navegador, con 3 consultas más.

Encima, varias páginas hacen su **propia** verificación de sesión adicional:
- `src/app/dashboard/page.tsx:22-27` llama `supabase.auth.getSession()` de nuevo, aunque el middleware ya bloqueó el acceso si no había sesión.
- `src/hooks/useAuth.ts` hace lo mismo, con otro cliente de Supabase distinto (`src/lib/supabase.ts`, ver Hallazgo 3).
- `src/hooks/useTenant.ts` es una **tercera implementación** de resolución de tenant (por hostname únicamente), que convive con `TenantContext` sin que quede claro cuál se usa dónde.

Cada una de estas llamadas es un viaje de red. Sumadas y en serie, agregan varios cientos de milisegundos a *cada navegación*, antes de que aparezca un solo turno en pantalla.

---

## Hallazgo 3 — Cliente de Supabase recreado en cada render

En **24 archivos** el patrón es:
```
export default function Agenda() {
  const supabase = createClient()   // src/app/agenda/page.tsx:307
  ...
}
```
`createClient()` (`src/lib/supabase/client.ts`) construye un cliente de Supabase completo (con su propio listener de autenticación) **cada vez que el componente se renderiza**, no solo al montarse — porque no está envuelto en `useMemo` ni definido fuera del componente.

Esto importa especialmente en páginas como `agenda/page.tsx` (1788 líneas, decenas de `useState`, se re-renderiza en cada clic, cada arrastre de turno, cada tick del reloj cada 60s) o `pacientes/[id]/page.tsx` (1749 líneas): en la práctica se están creando e inicializando clientes de Supabase de más constantemente.

A esto se suma que existe un **cuarto** cliente de Supabase, separado y no relacionado: `src/lib/supabase.ts`, un módulo legado que además referencia una tabla `turnos` que ya no existe en el esquema actual (el sistema usa `citas`). Solo lo usa `useAuth.ts`. Es código muerto que además contribuye al problema de "múltiples instancias de GoTrueClient" que Supabase advierte explícitamente que hay que evitar.

---

## Hallazgo 4 — Componentes monolíticos, sin code-splitting

```
1788 líneas  src/app/agenda/page.tsx
1749 líneas  src/app/pacientes/[id]/page.tsx
1100 líneas  src/app/paciente/[token]/page.tsx   (portal público del paciente)
1091 líneas  src/app/dashboard/page.tsx
```
Las cuatro son `'use client'` completas (no hay ni un componente de servidor haciendo data-fetching) y no encontré un solo `next/dynamic` en todo el proyecto. Consecuencias:

- Todo el árbol de estado vive en un único componente gigante: abrir un modal de "nueva cita" o mover un turno re-renderiza potencialmente toda la agenda.
- El bundle de la página se descarga y parsea completo aunque el usuario solo quiera ver el calendario del día, sin siquiera abrir el modal de cobro o el de bloqueo de horario.
- `paciente/[token]/page.tsx` es la página que ven los **pacientes finales** al confirmar un turno por WhatsApp/email — es la cara pública del sistema y también sufre el mismo patrón 100% client-render, sin necesidad: ese contenido (datos del turno, del consultorio) es perfecto para renderizarse en el servidor.

Adicional menor: 5 usos de `<img>` en vez de `next/image` (sin optimización automática de tamaño/formato).

---

## Priorización (impacto vs. riesgo de la corrección)

| # | Hallazgo | Impacto en velocidad | Riesgo de arreglarlo |
|---|---|---|---|
| 1 | Índices faltantes en `citas`, `pacientes`, `bloqueos`, `tratamientos`, `tenant_users` | 🔴 Muy alto, empeora con el tiempo | 🟢 Nulo — es puramente aditivo |
| 2 | Políticas RLS sin `(select auth.uid())` | 🔴 Alto, mismo escalamiento | 🟢 Bajo — reescritura equivalente, se puede validar con `EXPLAIN ANALYZE` antes/después |
| 3 | Resolución de tenant/sesión duplicada (middleware + 3 hooks distintos) | 🟠 Medio-alto, en *cada* navegación | 🟡 Medio — toca varios archivos, conviene hacerlo con cuidado y probar login/logout a fondo |
| 4 | Cliente Supabase recreado por render + módulo legado `lib/supabase.ts` | 🟠 Medio | 🟢 Bajo — cambio mecánico (memoizar / mover a módulo) |
| 5 | Páginas monolíticas sin code-splitting | 🟡 Medio, se nota más en el dispositivo del usuario que en el servidor | 🟡 Medio-alto — requiere refactor real, mejor hacerlo incremental |
| 6 | `select('*')` sin paginar (21 casos) | 🟡 Crece con el volumen de pacientes/turnos | 🟢 Bajo si se agrega `.limit()`/paginación sin sacar campos que ya se usan |

---

## Mejoras propuestas (no invasivas, no cambian comportamiento)

**1. Agregar índices — hacerlo primero, es la mejora de mayor impacto por menor esfuerzo:**
```sql
CREATE INDEX IF NOT EXISTS idx_citas_tenant_fecha ON citas (tenant_id, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_citas_paciente ON citas (paciente_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_tenant ON pacientes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bloqueos_tenant_fecha ON bloqueos (tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_tratamientos_tenant ON tratamientos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users (user_id);
```
`CREATE INDEX IF NOT EXISTS` no rompe nada existente; solo acelera lecturas (el único costo es un poco más de espacio en disco y una fracción más de tiempo en cada escritura, imperceptible en este volumen).

**2. Reescribir las 4 políticas RLS envolviendo `auth.uid()`:**
```sql
CREATE POLICY tenant_isolation_citas ON citas FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));
```
(mismo patrón para `pacientes`, `bloqueos`, `tratamientos`). Es una recomendación oficial de Supabase; el efecto de seguridad es idéntico, solo cambia cómo Postgres lo ejecuta.

**3. Eliminar la resolución de tenant redundante en el cliente:**
- Ya que el middleware resuelve el tenant server-side y setea `x-tenant-id`, aprovechar ese valor (vía un layout server-side o pasándolo por prop) en lugar de que `TenantContext` vuelva a consultar `tenant_users` + `tenants` desde el navegador.
- Unificar `TenantContext.tsx` y `useTenant.ts` en una sola fuente de verdad — hoy conviven dos implementaciones distintas.
- Quitar los `getSession()` sueltos en `dashboard/page.tsx` y `useAuth.ts`: el middleware ya garantiza que no se llega a esas páginas sin sesión.

**4. Memoizar el cliente de Supabase:**
```ts
// en vez de: const supabase = createClient()  dentro del componente
const supabase = useMemo(() => createClient(), [])
```
Y retirar `src/lib/supabase.ts` (código muerto, referencia una tabla `turnos` inexistente) para no tener un cuarto cliente flotando.

**5. Paginar/limitar los `select('*')` de listados** (pacientes, historial de citas) a medida que crecen — agregar `.range()` o `.limit()` con "cargar más", sin quitar ningún campo que ya se muestra.

**6. Dividir las páginas más grandes en subcomponentes con `React.memo`, y cargar modales pesados (`NuevaCitaModal`, etc.) con `next/dynamic`.** Esto es lo más laborioso de la lista — recomiendo dejarlo para el final y hacerlo módulo por módulo, no como refactor único.

---

## Qué evitar

- No tocar la lógica de negocio de `citas`/turnos al mismo tiempo que los índices o el RLS — hacerlo en cambios separados y verificables (correr `EXPLAIN ANALYZE` antes/después de cada índice para confirmar que el plan de consulta mejora).
- Al reescribir las políticas RLS, probar explícitamente que un usuario de un consultorio **no** puede ver datos de otro — es una migración de seguridad, no solo de performance.
- El refactor de componentes gigantes (punto 6) es el único con riesgo real de introducir bugs visuales; conviene hacerlo último y con QA manual del calendario/drag-and-drop.

---

*Todo lo anterior surge de leer el código del repo (`src/`, `supabase_migration*.sql`, `next.config.js`, `vercel.json`) tal como está hoy en la carpeta del proyecto. No se ejecutaron cambios: este documento es solo el diagnóstico y la propuesta.*
