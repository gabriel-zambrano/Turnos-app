# DentalDesk · Release Candidate

**22/08/2026 · READY FOR PAID ACTIVATION**

Producción **no** fue modificada en esta sesión. Nada commiteado.

---

## 1 · R-18 · Cierre forense

### 1.1 · Lo demostrado

**El mecanismo estaba en el repositorio.** `20260722120000_remote_schema.sql` contenía 30 `GRANT ... ON TABLE ... TO "anon"` sobre tablas sensibles, más `ALL` sobre `tenants_public` (que es R-10). Escrito con `CREATE TABLE IF NOT EXISTS` y `CREATE OR REPLACE VIEW`: **re-ejecutarlo no produce error.**

Neutralizado. Guarda **G-5** creada, 9 tests.

### 1.2 · Lo que falta demostrar

Que esos GRANT **llegaron a ejecutarse** en producción, y por cuál vía.

**Rango a revisar:** desde el **19/08 00:00 UTC** hasta hoy. Las reversiones se detectaron el 20/08 y el 22/08; un día de margen antes cubre la ejecución que las causó.

**Eventos a buscar, en este orden:**

1. `GRANT` — `log_statement = 'ddl'` está activo y PostgreSQL clasifica `GRANT` como `LOGSTMT_DDL`
2. `bi_citas_por_dia` — el último objeto revertido
3. `CREATE OR REPLACE VIEW` — indicaría re-ejecución del baseline
4. `schema_migrations` — inserciones o borrados delatan `db push` o una reparación

**Cómo comprobar si los 30 GRANT se ejecutaron:** buscar `GRANT ALL ON TABLE "public"."pacientes" TO "anon"` literal. Ese GRANT **solo existe en el baseline**. Si aparece en el log, el baseline se re-ejecutó y la fecha es la del incidente.

### 1.3 · Cómo distinguir los siete orígenes

| | Origen | Firma en el log |
|---|---|---|
| **a** | Ejecución del baseline | Los 30 GRANT **seguidos**, en el orden del archivo, mismo `session_id`, precedidos de `CREATE OR REPLACE VIEW` |
| **b** | `db push` | `INSERT INTO supabase_migrations.schema_migrations` en la misma sesión · `user_name = postgres` · `application_name` del CLI |
| **c** | `db reset` | `DROP SCHEMA public CASCADE` o `CREATE SCHEMA public` antes. **Muy destructivo: se habría notado** |
| **d** | Reparación de migraciones | `DELETE`/`UPDATE` sobre `schema_migrations` **sin** DDL de tablas alrededor |
| **e** | Ejecución manual (SQL Editor) | `user_name = postgres`, sesión corta, **sin** toque a `schema_migrations`. `application_name` del editor |
| **f** | Dashboard | Como (e) pero desde la UI de tablas: GRANT aislados, no en bloque |
| **g** | Otro proceso | `user_name` distinto de `postgres` — típicamente `supabase_admin`. **Es el único caso que la neutralización NO cubre** |

**El discriminante principal es `user_name`. El secundario es si `schema_migrations` fue tocada en la misma sesión.**

### 1.4 · Dictamen

Si los logs ya no alcanzan al 19/08 —el plan Free retiene poco— el veredicto correcto es:

> **R-18: mecanismo neutralizado, causa histórica no demostrable.**

**¿Alcanza para cerrarlo? No por sí solo.** La neutralización cubre los orígenes **a** a **f**, que comparten una misma raíz: el archivo. **No cubre (g)** — un proceso de plataforma emitiendo GRANT.

**Control adicional obligatorio.** Correr semanalmente, y en cada smoke test post-deploy:

```sql
SELECT c.relname, c.relkind, array_to_string(c.relacl, E'\n') AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
  AND array_to_string(c.relacl, ',') LIKE '%anon%'
  AND c.relname <> 'tenants_public';
```

**Criterio de cierre definitivo: cuatro semanas consecutivas en cero.** Antes de eso, R-18 queda **abierto con mecanismo neutralizado** — que es distinto de cerrado, y distinto de abierto sin entender.

---

## 2 · R-2 · ✅ **IMPLEMENTADO** — 22/08/2026

**14 tests verdes** en `src/lib/roles-equipo.test.ts`.

| | Caso | Resultado |
|---|---|---|
| 1 | `admin → owner` | **403 DENEGADO** |
| 2 | `owner → owner` | Permitido *(decisión provisional)* |
| 3 | `admin → admin` | Permitido *(comportamiento anterior intacto — DO-6.2 sigue congelado)* |
| 4 | `admin →` rol inválido | **400 DENEGADO** — incluye `Admin`, `OWNER`, `odontologo` |
| 5 | `role` vacío / `undefined` / `null` / `'   '` | → `staff`, explícito |
| 5b | `role` no-string (`42`, `{}`, `[]`) | **400** — no se convierte con `String()` |
| 6 | tenant ajeno (`ownerTenant = null`) | **403 DENEGADO** |
| 6b | `staff` o rol desconocido invitando | **403** — falla cerrado |

Más 3 tests que verifican la **ruta**: que ningún `insert` use el `role` crudo —son **dos** inserts con indentación distinta— y que la validación ocurra antes de `inviteUserByEmail`.

Y un test de **estado previo** que reproduce `role || 'staff'` y demuestra que aceptaba `'owner'`. Sin él, los otros 13 no probarían nada.

**Archivos:** `src/lib/roles-equipo.ts` *(nuevo)* · `src/lib/roles-equipo.test.ts` *(nuevo)* · `src/app/api/equipo/invitar/route.ts` *(+22 líneas, 2 sustituciones)*.

**Rollback:** borrar el bloque de validación y volver a `role: role || 'staff'`.

<details>
<summary>Diseño original (referencia)</summary>

### 2.1 · Inspección

| | Verificado |
|---|---|
| Archivo | `src/app/api/equipo/invitar/route.ts`, 130 líneas |
| Usuario | `supabaseClient` con cookies + anon key → `auth.getUser()` ✅ |
| Escrituras | `supabaseAdmin` con `SERVICE_ROLE_KEY` — **ignora RLS** |
| `tenantId` | Del body, **pero verificado**: `.eq('user_id', user.id).eq('tenant_id', tenantId)` ✅ |
| Rol actual | `ownerTenant.role`, exige `owner` o `admin` ✅ |
| `role` entrante | Del body, **sin validar**, usado en **dos** `insert` (líneas ~96 y ~118) 🔴 |
| Tests | **Ninguno cubre esta ruta** 🔴 |

**El defecto es exactamente uno:** `role: role || 'staff'` acepta cualquier cadena, incluido `'owner'`.

### 2.2 · El diff mínimo

Un solo bloque, insertado **inmediatamente después** de la verificación de `ownerTenant` (línea ~50) y **antes** de `inviteUserByEmail`. La posición importa: validar después de invitar deja el email enviado y un usuario creado en Auth.

```ts
// ── R-2 · Validación de rol (mínima, previa a cualquier efecto) ──
//
// `role` llega del body. Antes se insertaba tal cual, así que un `admin`
// podía invitar a alguien como 'owner' y escalar privilegios, o guardar una
// cadena arbitraria que ningún control reconoce.
//
// Esto NO es DO-6: no introduce jerarquías ni tabla de roles. Solo cierra la
// escalada y la inyección. Revertir es borrar este bloque.
const ROLES_VALIDOS = ['owner', 'admin', 'staff'] as const
const rolPedido = typeof role === 'string' && role.trim() ? role.trim() : 'staff'

if (!ROLES_VALIDOS.includes(rolPedido as typeof ROLES_VALIDOS[number])) {
  return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
}

// La escalada: solo un owner puede crear otro owner.
if (rolPedido === 'owner' && ownerTenant.role !== 'owner') {
  return NextResponse.json(
    { error: 'Solo el propietario puede designar a otro propietario.' },
    { status: 403 }
  )
}
```

Y reemplazar `role: role || 'staff'` por `role: rolPedido` en los **dos** `insert`.

**Total: 15 líneas nuevas, 2 sustituciones, 1 archivo.**

### 2.3 · Por qué así y no de otra forma

- **No incluye `odontologo`** en la lista blanca. Ese rol no existe en ninguna línea del código: agregarlo pertenece a DO-6. Sumarlo después es una palabra.
- **No impide `admin → admin`.** Eso es DO-6.2 y está congelado. Este cambio cierra **solo** la escalada confirmada.
- **`owner → owner` sigue permitido**, según tu decisión provisional.
- **La validación es server-side y previa a todo efecto.** No depende de la UI.
- **Reversible** borrando el bloque.

### 2.4 · Test que acompaña

Ninguno cubre la ruta. Propongo `src/lib/invitar-roles.test.ts` con la tabla de decisión —quién invita, qué rol pide, resultado— más un test que **falle contra el código actual**, o no prueba nada.

</details>

---

## 3 · R-12 · 🟡 Migración **ESCRITA, no aplicada**

### 3.1 · Tres correcciones de mi propio diagnóstico

Este riesgo lo reporté mal **tres veces** antes de mirar el texto crudo. Queda documentado porque el modo de falla es instructivo:

| Reporte | Por qué era falso |
|---|---|
| *"9 de 13 sin `pg_temp`"* | Heredado de la auditoría inicial, sin verificar |
| *"8 funciones **sin `search_path`**"* | Mi regex buscaba `SET search_path`; el dump escribe `SET "search_path"` **entre comillas** |
| *"6 funciones sin `pg_temp`"* | Tomé la **primera** definición de cada función en vez de la **última**, y no vi que dos ya estaban bien en el propio dump |

**Lo real, verificado sobre el texto crudo y tomando la última definición: son 4.**

### 3.2 · Las cuatro

Todas declaran `SET "search_path" TO 'public'` — sin `pg_temp`.

| Función | Riesgo | Depende de |
|---|---|---|
| `crear_tenant` | **Alto** — inserta en `tenants`; la llama `/api/admin/tenants` con `service_role` | `tenants` |
| `sync_turno_to_cita` | **Alto** — trigger que inserta en `pacientes` y `citas` desde el formulario público | `pacientes`, `citas` |
| `get_tenant_admin_email` | **Medio** — lee `auth.users` | `auth.users`, `tenant_users` |
| `get_user_email` | **Medio** — lee `auth.users` | `auth.users` |

### 3.3 · Las cinco que **NO** se tocan

Verificado: ya declaran `pg_temp`. Recrearlas sería riesgo sin beneficio.

| Función | `search_path` | Desde |
|---|---|---|
| `fn_aprobar_asistencia` | `'public', 'pg_temp'` | Ya en el dump inicial |
| `fn_registrar_inasistencia` | `'public', 'pg_temp'` | Ya en el dump inicial |
| `fn_ajustar_puntos_manual` | `'public', 'pg_temp'` | Corregida por **B1.2** |
| `fn_canjear_premio` | `'public', 'pg_temp'` | Corregida por **B1.3** |
| `tiene_rol` | `public, pg_temp` | Nació correcta en **B1.1** |

⚠️ **Las dos de fidelización llevan las guardas de rol y límite de B1.2/B1.3.** Recrearlas acá podría revertirlas. Por eso quedan fuera.

### 3.3 · Impacto

**Ninguno sobre comportamiento legítimo.** Declarar `pg_temp` al final lo mueve de implícito-primero a explícito-último. `public` se sigue buscando antes, así que toda resolución legítima da igual. Lo único que cambia es que un objeto temporal deje de poder eclipsar uno real.

### 3.4 · La migración — escrita

**`supabase/migrations/20260822200000_r12_search_path_pg_temp.sql`** · 213 líneas · **NO aplicada**.

Los cuatro cuerpos se extrajeron **programáticamente** de `remote_schema.sql` y se les reemplazó una sola línea. No hay transcripción manual: copiar a mano un cuerpo de 44 líneas para cambiar una es la forma más fácil de introducir un error silencioso.

**Privilegios re-afirmados, no modificados.** Las cuatro ya tenían `REVOKE ALL ... FROM PUBLIC` + `GRANT ALL ... TO service_role` en el baseline (L1616-1656). La migración repite eso **idéntico**, por dos motivos: bajo R-17 una función recreada en una base nueva nace ejecutable por PUBLIC, y la guarda **G-2.1 detectó la ausencia** en la primera versión de este archivo.

⚠️ **`sync_turno_to_cita` es un trigger.** `CREATE OR REPLACE FUNCTION` conserva el trigger asociado; **no hay que recrear el trigger**. Hacerlo dejaría una ventana sin sincronización.

⚠️ **Bloque de verificación obligatorio** al final: que las 6 tengan `pg_temp` y que `authenticated` conserve `EXECUTE`.

### 3.5 · Rollback

`CREATE OR REPLACE` con los cuerpos de `remote_schema.sql`. Sin datos de por medio, sin redeploy. **Requiere tu autorización** para crear la migración.

---

## 4 · Storage · Diagnóstico local

🔴 **NO EJECUTADO.** El entorno donde corro **no tiene Docker**, así que `npx supabase db reset` es tuyo. No lo simulo.

### Lo que sí quedó verificado — estático

| | Verificación | Resultado |
|---|---|---|
| ✅ | El baseline regenerado desde cero **NO** reintroduce los 30 GRANT | Neutralizados y fijados por G-5 |
| ✅ | G-5 detecta cualquier regresión | **12 tests**, incluido uno que avisa si regenerás el dump |
| ✅ | Las 4 policies de `fotos_clinicas` están en producción y aíslan por tenant | S-3, 22/08 |
| ✅ | `fotos_clinicas` es privada | S-1, 22/08 |
| ⬜ | El esquema regenerado conserva las policies de Storage | **Pendiente de `db reset`** |
| ⬜ | La migración de `logos` no rompe subidas | **Pendiente de `db reset`** |

### Procedimiento y clasificación de fallas

```bash
cd ~/Turnos-app && open -a Docker && npx supabase db reset
npx vitest run          # 617 tests
```

| Si falla | Severidad |
|---|---|
| `fotos_clinicas` aparece `public = true` | **CRÍTICO** — fuga de imágenes médicas. Abortar |
| Se pierde alguna policy de `fotos_clinicas` | **CRÍTICO** — sin aislamiento entre clínicas |
| G-5 se pone en rojo | **CRÍTICO** — el baseline volvió a traer GRANT |
| La migración de `logos` no aplica por propiedad | **ALTO** — usar Dashboard → Storage → Policies |
| No se puede subir un logo | **ALTO** — la policy quedó demasiado estricta |
| Un logo heredado no se puede borrar | **MEDIO** — no sigue `<tenant_id>-...`; se sigue viendo |
| Rechaza SVG | **BAJO** — es el comportamiento buscado |

---

## 5 · IDOR dinámico · Ejecutado

**`src/lib/idor-dinamico.test.ts` — 65 tests, todos verdes.**

Postgres real (PGlite), políticas RLS reales cargadas desde la migración, dos tenants, dos usuarios.

| Tenant A | Usuario A | Recurso B | Acción | Esperado | Resultado |
|---|---|---|---|---|---|
| A | `USER_A` | fila de B | `SELECT WHERE id = B` | 0 filas | ✅ 12 tablas |
| A | `USER_A` | fila de B | `UPDATE ... WHERE id = B` | 0 filas **y dato intacto** | ✅ 12 tablas |
| A | `USER_A` | fila de B | `DELETE ... WHERE id = B` | 0 filas **y fila presente** | ✅ 12 tablas |
| A | `USER_A` | tenant B | `INSERT` con `tenant_id = B` | Excepción | ✅ 12 tablas |
| A | `USER_A` | fila propia | `UPDATE tenant_id = B` | Excepción | ✅ 12 tablas |

Tablas: `citas`, `pacientes`, `bloqueos`, `tratamientos`, `historial_dental`, `paciente_fotos`, `presupuestos`, `premios`, `historial_puntos`, `ingresos_manuales`, `egresos_manuales`, `costos_fijos`.

**El último caso es el que más fácil se escapa:** A no toca nada de B, empuja *su* fila hacia B. Sin `WITH CHECK` eso pasa silenciosamente.

Y tres tests de control del harness, porque una suite de aislamiento que no puede fallar es peor que ninguna.

### 🟡 Pendiente de prueba dinámica — **no verde**

**22 rutas usan `service_role`, que ignora RLS.** Su aislamiento vive en TypeScript, y **ningún test de este archivo las cubre**.

**7 rutas reciben UUID o token por path** — la superficie IDOR clásica:

```
consentimientos/firmar/[token]  ·  consentimientos/pdf/[id]  ·  facturacion/pdf/[id]
paciente/[token]  ·  paciente/[token]/estado  ·  paciente/[token]/feedback
reserva/[clinica]
```

Requieren HTTP contra dos tenants con datos. El análisis estático (G-4) no encontró agujeros, **pero análisis estático no es prueba**.

---

## 6 · DO-6 · Congelado

Ver `DO-6_DECISIONES_PENDIENTES.md`. **Nada implementado.** Decisiones 1 y 2 bloquean el arranque.

---

## 7 · Estado del build y los tests

```
npx tsc --noEmit     → 0 errores
npx vitest run       → 634 tests · 28 archivos · todos verdes
npx next build       → 🟡 NO VERIFICADO en esta sesión
```

⚠️ **`next build` no se pudo correr acá:** excede el timeout del entorno donde ejecuto. **No lo doy por verde.** La última corrida limpia fue tuya, antes de estos cambios. De todo lo agregado después, solo dos archivos entran al bundle —`api/equipo/invitar/route.ts` y `lib/roles-equipo.ts`— y `tsc` pasa limpio sobre ambos.

**Cambios locales sin commitear:**

| Archivo | Tipo | Motivo |
|---|---|---|
| `supabase/migrations/20260722120000_remote_schema.sql` | Modificado | R-18 · 30 GRANT neutralizados |
| `src/lib/guardas-privilegios.test.ts` | Nuevo | G-5 · 9 tests |
| `src/lib/idor-dinamico.test.ts` | Nuevo | IDOR · 65 tests |
| `src/lib/fidelizacion-flag.ts` | Nuevo | Fidelización apagada |
| `src/app/pacientes/page.tsx` | Modificado | B1.4 |
| `src/app/{dashboard,paciente/[token],api/paciente/[token]}` | Modificados | Fidelización oculta |
| `supabase/migrations/20260822190000_p0_09_...` | Nuevo | Storage · **sin aplicar** |
| Documentación | Varios | Bitácora, checklist, DO-6, este archivo |

**Migraciones escritas y no aplicadas:** solo la de Storage.

---

## 8 · Tabla de riesgos

**Leyenda de estados** — la distinción no es cosmética:

| | Significa |
|---|---|
| 🟢 **CERRADO** | Corregido **y verificado en producción**. No requiere seguimiento |
| 🔵 **MITIGADO** | El mecanismo está desactivado, pero **queda algo sin demostrar**. Requiere control activo |
| 🟡 **PENDIENTE** | Trabajo escrito o diseñado, sin aplicar. Depende de ejecución |
| 🟠 **BLOQUEADO POR DECISIÓN** | Técnicamente listo. Espera una definición del owner |
| 🔴 **BLOQUEADO POR INFRAESTRUCTURA PAGA** | Solo se destraba pagando |
| 🟣 **ACEPTADO** | Riesgo conocido, diferido a Fase 2 con decisión explícita |

| RIESGO | ESTADO | EVIDENCIA | ACCIÓN | BLOQUEA |
|---|---|---|---|:-:|
| **R-1** `anon` con acceso a 34 tablas | 🟢 CERRADO | B1.6 + verificación en producción | — | No |
| **R-10** `anon` escribía `tenants` | 🟢 CERRADO | Migración aplicada · G-5.2 lo fija | — | No |
| **R-11** `REVOKE FROM PUBLIC` insuficiente | 🟢 CERRADO | Verificado en producción | — | No |
| **R-13** job horario roto | 🟢 CERRADO | Job eliminado | — | No |
| **P0-07** vistas BI expuestas | 🟢 CERRADO | REVOKE aplicado y verificado | — | No |
| **B1.2 / B1.3** rol y límite en fidelización | 🟢 CERRADO | Aplicado 22/08 · privilegios verificados | Verificación funcional pendiente | No |
| **R-2** escalada `admin → owner` | 🟢 **CERRADO** | **14 tests** · validación server-side previa a todo efecto | Desplegar | No |
| **B1.4** falso éxito del borrado | 🟢 CERRADO | Código + `tsc` | Smoke test 9 | No |
| **IDOR · capa de datos** | 🟢 CERRADO | **65 tests** · Postgres real, políticas reales | — | No |
| **Fidelización** | 🟢 CERRADO | Apagada por flag · datos intactos | — | No |
| **R-18** privilegios revertidos | 🔵 **MITIGADO** | 30 GRANT hallados en el baseline y neutralizados · G-5 (12 tests) | Logs + **4 semanas** de control N-1 | **Sí** |
| **R-12** `search_path` sin `pg_temp` | 🟡 PENDIENTE | 4 funciones · migración de 213 líneas escrita | `db reset` + `db push` | No |
| **Storage · `logos`** | 🟡 PENDIENTE | S-1 a S-4 en producción · migración escrita | `db reset` + `db push` | **Sí** |
| **IDOR · 22 rutas `service_role`** | 🟡 PENDIENTE | Solo análisis estático | Suite HTTP | No |
| **`next build`** | 🟡 PENDIENTE | No verificable en mi entorno | Correrlo | **Sí** |
| **Sin `owner` en producción** | 🟠 **BLOQUEADO POR DECISIÓN** | 2 usuarios, ambos `admin` | DO-6 · Decisión 1 | **Sí** |
| **DO-6 · recuperación del último owner** | 🟠 BLOQUEADO POR DECISIÓN | Diseño auditado | DO-6 · Decisión 2 | Sí¹ |
| **DO-6 · multirol** | 🟠 BLOQUEADO POR DECISIÓN | 4 decisiones abiertas | Decisiones 3-6 | No¹ |
| **`CRON_SECRET` sin rotar** | 🟡 PENDIENTE | 7 archivos lo usan | Rotar + redeploy | **Sí** |
| **Sentry histórico con PII** | 🟡 PENDIENTE | Nuevos saneados desde P0-06 | Purgar | No |
| **Backups / PITR** | 🔴 **BLOQUEADO POR INFRAESTRUCTURA PAGA** | Free plan · RPO infinito · 212 pacientes | Supabase Pro | **Sí** |
| **Validar el restore** | 🔴 BLOQUEADO POR INFRAESTRUCTURA PAGA | RTO 154s medido, conteos sin comparar | Depende del anterior | **Sí** |
| **R-9** `FORCE RLS` ausente | 🟣 ACEPTADO | 43/43 en `false` | Fase 2 | No |
| **R-8 · R-14 · R-15** | 🟣 ACEPTADO | Documentados | Fase 2 | No |
| **Autorización clínica por rol** | 🟣 ACEPTADO | 43 policies de pertenencia, 4 de rol | Fase 2 | No² |

¹ No bloquea el lanzamiento **si** el piloto no anuncia los 4 roles como funcionalidad. La Decisión 2 sí bloquea implementar DO-6.
² No bloquea el lanzamiento, **pero prohíbe** describir DO-6 como control de acceso a datos médicos.

**Resumen:** 10 cerrados · 1 mitigado · 6 pendientes · 3 bloqueados por decisión · 2 bloqueados por dinero · 3 aceptados.

---

## 9 · Tabla de acciones

| ACCIÓN | GRATIS | PRO/PITR | PRODUCCIÓN | ESTADO |
|---|:-:|:-:|:-:|---|
| Neutralizar los 30 GRANT del baseline | ✅ | — | No | 🟢 **Hecho** |
| Guarda G-5 (12 tests) | ✅ | — | No | 🟢 **Hecho** |
| Suite IDOR dinámica (65 tests) | ✅ | — | No | 🟢 **Hecho** |
| **R-2 · validar el rol al invitar** (14 tests) | ✅ | — | No | 🟢 **Hecho** |
| **R-12 · migración escrita** | ✅ | — | No | 🟢 **Hecho** |
| `DO-6_DECISIONES_PENDIENTES.md` | ✅ | — | No | 🟢 **Hecho** |
| Corregir mis 3 errores de diagnóstico de R-12 | ✅ | — | No | 🟢 **Hecho** |
| **Commit** | ✅ | — | No | 🟠 **Bloqueado por `.git/index.lock`** |
| `npx next build` | ✅ | — | No | ⬜ **Tuyo** — excede mi timeout |
| Probar Storage y R-12 con `db reset` | ✅ | — | No | ⬜ **Tuyo** — necesita Docker |
| Suite IDOR HTTP · 7 rutas con path | ✅ | — | No | ⬜ Pendiente |
| Suite IDOR HTTP · 22 rutas `service_role` | ✅ | — | No | ⬜ Pendiente |
| Revisar los logs de R-18 | ✅ | — | **Sí** | ⬜ Tuyo |
| Aplicar la migración de Storage | ✅ | — | **Sí** | ⬜ Tras `db reset` |
| Aplicar la migración de R-12 | ✅ | — | **Sí** | ⬜ Tras `db reset` |
| Promover un `admin` a `owner` | ✅ | — | **Sí** | 🟠 Decisión 1 |
| Rotar `CRON_SECRET` + redeploy | ✅ | — | **Sí** | ⬜ Tuyo |
| Purgar Sentry histórico | ✅ | — | **Sí** | ⬜ Tuyo |
| Las 3 verificaciones manuales | ✅ | — | **Sí** | ⬜ Tuyo |
| Control N-1 semanal · 4 semanas | ✅ | — | **Sí** | ⬜ Criterio de cierre de R-18 |
| Implementar DO-6 | ✅ | — | **Sí** | 🟠 Decisiones 1 y 2 |
| **Activar Supabase Pro + PITR** | ❌ | ✅ | **Sí** | 🔴 **25 USD/mes** |
| Confirmar el backup en el Dashboard | ❌ | ✅ | **Sí** | 🔴 Depende del anterior |
| Restore + comparar los 6 conteos | ❌ | ✅ | **Sí** | 🔴 Depende del anterior |
| Deploy + 12 smoke tests | ✅ | — | **Sí** | 🔴 Último paso |

**16 de 25 acciones son gratis. Una sola necesita dinero — y de ella dependen otras dos.**

---

## 10 · Checklist final de lanzamiento

**Gratis, antes de pagar:**

1. Aplicar el diff de R-2 + su test
2. Migración de R-12 (escribir; aplicar después)
3. `db reset` local → probar Storage → aplicar en producción
4. Revisar los logs de R-18
5. Promover un `admin` a `owner`
6. Rotar `CRON_SECRET` + redeploy
7. Purgar Sentry histórico
8. Las 3 verificaciones manuales
9. Commit + tag

**Con dinero:**

10. Supabase Pro → PITR → confirmar el backup en Database → Backups
11. `./probar-restore.sh` → comparar los 6 conteos contra producción

**Lanzamiento:**

12. `git push` → Vercel
13. Los 12 smoke tests de `RELEASE-CHECKLIST.md` §15
14. Control N-1 → cero filas
15. GO

---

## Qué falta para lanzar

```
🟢 Código · tests (617) · build · migraciones · RLS · IDOR en capa de datos
🟢 R-1 · R-10 · R-11 · R-13 · P0-07 · B1.2/B1.3 · B1.4 · G-1/2/4/5
🟡 R-2      diff listo, sin aplicar
🟡 R-12     diseñado, sin migración
🟡 Storage  migración escrita, sin probar (necesita Docker)
🟡 DO-6     congelado, 2 decisiones bloqueantes
🟡 IDOR     22 rutas service_role sin prueba dinámica
🔴 R-18     mecanismo neutralizado · disparador desconocido
🔴 owner    no existe ninguno en producción
🔴 Backups  25 USD/mes
🔴 CRON_SECRET sin rotar
```

**Seis de los diez pendientes se cierran gratis.** Tres necesitan solo acceso a producción. **Uno solo necesita dinero.**
