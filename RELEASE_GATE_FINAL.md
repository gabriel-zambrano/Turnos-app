# DentalDesk · RELEASE GATE FINAL

**26/08/2026** · Última evaluación técnica antes de congelar el código.

---

# 0 · TRES CORRECCIONES AL BRIEF

Antes del veredicto, porque el brief parte de premisas que la evidencia contradice.

### 0.1 · «No existe todavía un owner en producción»

**FALSO.** El `owner` se creó el **25/08** y lo verificaste vos con `UPDATE ... RETURNING`.

```
odbenegaswalter@gmail.com   → owner
studioandbrand@gmail.com    → admin  (cuenta de mantenimiento del proveedor)
```

Documentado en `OPERACION.md` §3. Es la tercera vez en esta auditoría que una premisa vieja sobrevive a la evidencia que la refutó; la anoto para que no arrastre la decisión.

### 0.2 · «674 tests verdes»

**Son 686, en 30 archivos.** Diferencia menor, pero §16 pide saber si el número es cobertura o volumen, y para eso el número tiene que ser el correcto.

### 0.3 · «El único bloqueo económico es Supabase Pro/PITR» — **me equivoqué yo**

En mi informe anterior escribí *"lo que sigue no es más auditoría: son 25 dólares y un restore verificado"*.

**Era incompleto, y esta evaluación lo demuestra.** Supabase documenta que PITR y los backups **no cubren los objetos de Storage**:

> *"the buckets and files metadata will show up in the dashboard of the new project, but the storage files stored in the S3 buckets would not be present"*

**Pagar Pro no cierra la recuperabilidad de las fotos clínicas.** Detalle completo en §3.

---

# 1 · VEREDICTO EJECUTIVO

## 🔴 NO-GO

**Bloquea un solo eje: recuperabilidad.** No es "falta activar Pro" — es más específico y más grave de lo que yo mismo había concluido.

Todo lo demás está verificado. Esta evaluación **no encontró ninguna vulnerabilidad nueva de seguridad**, y produjo evidencia dinámica nueva que refuerza el aislamiento.

---

# 2 · BLOQUEANTES REALES

## 🔴 B-1 · Las fotos clínicas no tienen backup, y PITR no las va a cubrir

**RIESGO:** pérdida irreversible de fotografías clínicas de pacientes. Documentación odontológica de valor médico-legal.

**EVIDENCIA:**
1. `probar-restore.sh:41` → `npx supabase db dump --linked --data-only`. Sin `--schema`, Supabase excluye los esquemas gestionados. **Es un dump de datos de `public`.**
2. Los archivos de Storage viven en S3, no en Postgres. **Ningún `pg_dump` los alcanza.**
3. Documentación de Supabase: PITR se construye sobre backups físicos del directorio de la base + WAL. **Storage queda fuera por diseño.**

**PRUEBA REALIZADA:** lectura del script + verificación de la política de backups de Supabase en su documentación oficial.

**RESULTADO:** hoy no existe ninguna copia de las fotos clínicas. Después de pagar Pro, **seguirá sin existir.**

**Y el modo de falla es el peor posible:** un restore devuelve las filas de `paciente_fotos` intactas. La app muestra la ficha con sus fotos listadas. **Las imágenes no cargan.** El restore reporta éxito sobre una pérdida silenciosa.

**ESTADO:** 🔴 NO VERIFICADO / NO CUBIERTO
**¿BLOQUEA?** **SÍ** — pérdida irreversible de datos clínicos.
**ACCIÓN:** backup explícito de Storage, separado del de la base. No es opcional ni sustituible por Pro.

---

## 🔴 B-2 · No existe backup automático de la base

**RIESGO:** RPO infinito. Un `DELETE` accidental, una migración destructiva o un incidente de plataforma pierden todo desde el último dump manual.

**EVIDENCIA:** plan Free. Sin backups diarios, sin PITR, sin retención.

**PRUEBA REALIZADA:** el restore manual se ejecutó y midió **RTO 154 s** el 24/08.

**RESULTADO:** existe un procedimiento probado, pero **requiere que una persona se acuerde de ejecutarlo.** Un backup ocurre aunque nadie haga nada; esto no.

**ESTADO:** 🔴 MITIGADO PARCIALMENTE
**¿BLOQUEA?** **SÍ** — imposibilidad de recuperación ante pérdida no anticipada.
**ACCIÓN:** Supabase Pro + PITR (25 USD/mes).

---

## 🟠 B-3 · El restore verifica 6 de 23 tablas y no cubre `auth.users`

**RIESGO:** un restore incompleto que **reporta éxito**.

**EVIDENCIA:**

```
verifica:      pacientes · citas · facturas · pagos · historial_puntos · tenant_users
NO verifica:   historial_dental · paciente_fotos · presupuestos · tratamientos ·
               ingresos_manuales · egresos_manuales · costos_fijos · perfil_doctor ·
               recordatorios_log · feedback_post_visita · bloqueos · turnos ·
               logs_envios · meta_mensual · whatsapp_contactos · tenants · admin_users
               (17 de 23)
```

**`historial_dental` y `presupuestos` son el núcleo clínico y no están en la verificación.**

Además, el dump no incluye el esquema `auth`. **Un restore devuelve 212 pacientes y ninguna cuenta con la cual entrar** — `tenant_users` apuntaría a `user_id` inexistentes.

**PRUEBA REALIZADA:** comparación programática de las 23 tablas con RLS contra la consulta de verificación del script.

**ESTADO:** 🟠 PENDIENTE
**¿BLOQUEA?** No por sí solo, pero **invalida la confianza en B-2**: el RTO de 154 s corresponde a un restore cuya integridad se comprobó sobre el 26 % de las tablas.
**ACCIÓN:** extender la verificación a las 23 y decidir explícitamente qué pasa con `auth.users`.

---

# 3 · RECUPERABILIDAD — respuesta punto por punto

| | Pregunta | Respuesta |
|---|---|---|
| **A** | Estado de backups | **No existen automáticos.** Solo dump manual bajo demanda |
| **B** | ¿PITR? | **No.** Requiere plan Pro |
| **C** | **RPO real** | **Infinito.** No hay punto de recuperación garantizado |
| **D** | **RTO real** | **154 s medidos** — válido solo para las 6 tablas verificadas |
| **E** | ¿El restore reconstruye el sistema actual? | **Parcialmente.** Datos de `public` sí; **`auth.users` no; Storage no** |
| **F** | ¿Esquema actual o baseline viejo? | **Actual.** El script hace `db reset` y reconstruye desde las migraciones del repo, así que incluye Storage y R-12 aunque el dump sea de datos. **Este punto está bien resuelto** |
| **G** | Qué falta | Backup automático + backup de Storage + verificación de las 23 tablas + decisión sobre `auth` |
| **H** | ¿El único bloqueo es pagar Pro? | **NO.** Pro cierra B-2. **No cierra B-1.** |

## BACKUPS: 🔴 **NO-GO**

## Después de pagar Supabase Pro, exactamente esto:

```
1. Dashboard → Settings → Add-ons → Point-in-Time Recovery → habilitar
2. Esperar el primer backup físico completo (confirmarlo en Database → Backups)
3. Settings → Database → Backups: confirmar retención (7 días en Pro)
4. Restore de prueba a un proyecto NUEVO desde el backup automático
      (NO desde un dump manual — hay que probar el mecanismo real)
5. Comparar las 23 tablas, no 6:
      SELECT relname, n_live_tup FROM pg_stat_user_tables
      WHERE schemaname='public' ORDER BY relname;
      contra el mismo query en producción
6. Verificar qué pasó con auth.users en el proyecto restaurado.
      Si está vacío: definir el procedimiento de re-invitación ANTES de necesitarlo
7. Confirmar lo que ya sabemos: las fotos de Storage NO están.
      Ese paso no es para descubrirlo, es para que quede asentado
8. Backup de Storage — independiente:
      supabase storage cp -r ss://fotos_clinicas ./backup-fotos --experimental
      programado, con destino fuera de Supabase
9. Restaurar una foto desde ese backup y abrirla
10. Anotar RTO y RPO reales en OPERACION.md
```

**El cierre no es el paso 1. Es el paso 9.**

---

# 4 · SEGURIDAD MULTI-TENANT

## 4.1 · Hallazgo nuevo — la tabla que sostiene todo el modelo no estaba probada

`tenant_users` es referenciada por **las 43 policies** `tenant_isolation_*`. Si un usuario pudiera insertarse una fila ahí, obtendría acceso **legítimo** a otro tenant por la vía normal: todas las policies lo dejarían pasar.

**No estaba en la suite dinámica.** La probé.

**Réplica exacta de las policies de producción, PostgreSQL real (PGlite):**

```
=== CONTROL POSITIVO ===
  A ve sus propios pacientes:        ["Paciente de A"]        ← 1 fila, no 0
  A inserta en su propio tenant:     filas=1

=== ESCALADA ===
  T-1 auto-inscripción en B    → RECHAZADO · new row violates RLS policy for "tenant_users"
  T-2 mudar su membresía a B   → filas=0
  T-3 auto-promoción a owner   → filas=0
  T-4 borrar la membresía de B → filas=0
  T-5 A lee tenant_users       → 1 fila · solo el tenant A
```

**El control positivo es lo que hace válido al resto.** Si `auth.uid()` fuera NULL, T-1 a T-5 pasarían vacuamente. C-1 devuelve exactamente 1 fila propia: la sesión está resuelta.

> **Y esto me pasó de verdad en el primer intento.** Usé `set_config(..., true)` — `is_local`, se descarta al terminar la transacción. `auth.uid()` era NULL y **los cinco tests pasaban sin probar nada.** Es exactamente el defecto que §16 pide buscar. Lo encontré en mi propio harness.

**ESTADO:** 🟢 VERIFICADO DINÁMICAMENTE. **La escalada de privilegios entre tenants está cerrada.**

## 4.2 · Las 8 policies «sin WITH CHECK» — falso positivo, y lo probé

El análisis estático marca 8 policies `FOR ALL` sin `WITH CHECK`, entre ellas `pacientes`, `citas` y `tratamientos`.

**PostgreSQL usa la expresión `USING` como `WITH CHECK` cuando esta última no se declara.** No es una laguna: es la semántica.

```
  A empuja sus pacientes al tenant B → RECHAZADO · new row violates RLS policy
  A inserta un paciente dentro de B  → RECHAZADO · new row violates RLS policy
  A borra pacientes de B             → filas=0 · el dato de B intacto
```

**ESTADO:** 🟢 VERIFICADO DINÁMICAMENTE. **No es hallazgo.**

## 4.3 · Matriz completa

| Superficie | Operaciones | Prueba | Estado |
|---|---|---|---|
| 12 tablas tenant-scoped | SELECT/INSERT/UPDATE/DELETE A→B | 65 tests · PostgreSQL real | 🟢 DINÁMICO |
| `UPDATE SET tenant_id = B` | las 12 | excepción en todas | 🟢 DINÁMICO |
| **`tenant_users`** | INSERT/UPDATE/DELETE/SELECT | **nuevo · 11 pruebas** | 🟢 **DINÁMICO** |
| `FOR ALL` sin WITH CHECK | UPDATE/INSERT cross-tenant | **nuevo** | 🟢 **DINÁMICO** |
| Vistas `bi_*` | acceso de `anon` | 21 tests · PostgreSQL real | 🟢 DINÁMICO |
| Funciones `fn_*` | rol + pertenencia | 28 tests · PostgreSQL real | 🟢 DINÁMICO |
| Storage `fotos_clinicas` | las 4 | `db reset` + producción | 🟢 PRODUCCIÓN |
| PDFs `[id]` | IDOR | estructural (G-6) | 🟡 ESTÁTICO |
| Rutas `service_role` | 22 rutas | lectura completa | 🟢 ESTÁTICO |

**Cero operaciones cross-tenant exitosas.**

## 4.4 · FORCE RLS — ausente, y correctamente

**No aparece en ninguna migración.** No lo convierto en bloqueante, y la razón es técnica:

`FORCE ROW LEVEL SECURITY` solo cambia el comportamiento **para el dueño de la tabla**. La aplicación se conecta como `authenticated` o `anon`, que no son dueños — RLS ya les aplica. Y `service_role` tiene el atributo `BYPASSRLS`, sobre el cual `FORCE` no tiene efecto.

**Activarlo no cambiaría nada de lo que protege al sistema.** ⚪ DEUDA ACEPTADA — sin impacto demostrable.

---

# 5 · AUTORIZACIÓN / IDOR

## 5.1 · Inventario `service_role` × identificador del usuario

| Ruta | Identificador | Autoriza | Prueba | Resultado |
|---|---|---|---|---|
| `admin/tenants` | body | `tenant_users` | lectura | 🟢 |
| `billing/cancelar` | body | `tenant_users` | lectura | 🟢 |
| `clinicas` | body | `tenant_users` | lectura | 🟢 |
| `confirmar-turno` | body | `tenant_users` | lectura | 🟢 |
| `enlaces-turno` | body | `tenant_users` | lectura | 🟢 |
| `equipo/invitar` | body | `tenant_users` + rol (R-2) | 15 tests | 🟢 |
| `equipo/miembros` | query+body | `tenant_users` | lectura | 🟢 |
| `recordatorios` · `registro` · `send-recordatorios` | body | `tenant_users` | lectura | 🟢 |
| `paciente/[token]` ×3 | path | UUID v4 · `crypto.randomUUID()` | lectura | 🟢 |
| `consentimientos/firmar/[token]` | path | UUID validado vs `token_firma` · rate limit 10/min | lectura | 🟢 |
| `reserva/crear` | body | slug público → tenant resuelto en servidor · rate limit 5/h | lectura | 🟢 |
| `reserva/[clinica]` · `horas-ocupadas` | path/query | público por diseño · acotado | lectura | 🟢 |
| `crm-campanas` · `daily-briefing` | — | `CRON_SECRET` + `timingSafeEqual` | 24 tests | 🟢 |
| `sync-sheet` | body | `SYNC_SHEET_SECRET` · **trigger desactivado** | SQL producción | 🟢 |
| `webhooks/mercadopago` | body | HMAC-SHA256 | 33 tests | 🟢 |
| `webhooks/resend` | — | firma svix | lectura | 🟢 |

**Ninguna ruta con `service_role` acepta un identificador del usuario sin verificar pertenencia, token o firma.**

## 5.2 · Cuatro falsos positivos de mi propio detector

Mi inventario marcó `horas-ocupadas`, `consentimientos/firmar/[token]`, `reserva/crear` y `reserva/[clinica]` como *sin autorización*. **Las cuatro son falsas.**

El regex buscaba `.eq('token'` y la columna se llama **`token_firma`**. Las otras dos son endpoints públicos de reserva, correctamente acotados.

**Sumados a los 6 de la evaluación anterior, van 10 falsos positivos contra 1 hallazgo real** (el webhook de `sync-sheet`). Esa proporción es dato, no anécdota: **el análisis estático sin lectura ya no produce señal en este código.**

## 5.3 · Rutas cuya única defensa es RLS

`consentimientos/pdf/[id]` y `facturacion/pdf/[id]` consultan por `id` sin filtrar por tenant. Corren como `authenticated`, así que RLS filtra y un `id` ajeno devuelve 404.

**Defensa de una sola capa.** Fijada por G-6, que falla si alguien cambia el cliente a `service_role`.

🟡 **Deuda post-lanzamiento:** agregar el filtro explícito de tenant. No bloquea — RLS está probado dinámicamente.

---

# 6 · BASE DE DATOS / RLS / PRIVILEGIOS

| Verificación | Resultado | Estado |
|---|---|---|
| RLS habilitado | 23/23 tablas del baseline | 🟢 PRODUCCIÓN |
| Policies | 43 de pertenencia + 4 de rol | 🟢 PRODUCCIÓN |
| `anon` sobre `public` | solo `tenants_public` (SELECT) | 🟢 PRODUCCIÓN |
| `PUBLIC` | revocado (R-11) | 🟢 PRODUCCIÓN |
| SECURITY DEFINER | 14 funciones, **14 con `pg_temp`** | 🟢 PRODUCCIÓN |
| Vistas `bi_*` | revocadas de `anon` | 🟢 DINÁMICO |
| `tenant_users` escribible por usuarios | **NO** | 🟢 **DINÁMICO** |
| FORCE RLS | ausente · sin impacto | ⚪ ACEPTADO |

## 6.1 · Las guardas, validadas por inyección

No las evalué leyendo su regex. **Inyecté el defecto que cada una debe atrapar.**

| Guarda | Defecto inyectado | Resultado |
|---|---|---|
| G-1.1 | `CREATE TABLE public.tabla_nueva_sin_rls` | 🟢 detecta |
| G-2.1 | SECURITY DEFINER sin REVOKE | 🟢 detecta |
| G-2.2 | SECURITY DEFINER sin `pg_temp` | 🟢 detecta |
| G-5.1 | `GRANT ALL ON pacientes TO anon` en el baseline | 🟢 detecta · línea 1953 |
| G-5.4 | función con `search_path` sin `pg_temp` | 🟢 detecta |
| G-6.1 | — | 🟢 control positivo sobre `equipo/miembros` |

⚠️ **G-5.4 tenía un falso positivo propio**, corregido en esta ronda: solo entendía `CREATE FUNCTION` y marcaba como pendientes 4 funciones ya arregladas con `ALTER FUNCTION`. **Es el límite de fondo de toda guarda que lee archivos: ve declaraciones, no estado.**

---

# 7 · STORAGE

| | `fotos_clinicas` | `logos` |
|---|---|---|
| Público | **No** | Sí (el portal lo requiere) |
| SELECT / INSERT / UPDATE / DELETE | `authenticated` + tenant | público / `authenticated` + prefijo de tenant |
| MIME | jpeg · png · webp | ídem — **SVG excluido a propósito** |
| Tamaño | 10 MB | 5 MB |
| Path traversal | ruta `<tenant_id>/<paciente_id>/…`, la policy compara `foldername(name)[1]` | `filename(name) LIKE tenant_id \|\| '-%'` |
| **Aislamiento** | 🟢 VERIFICADO EN PRODUCCIÓN | 🟢 VERIFICADO EN PRODUCCIÓN |
| **Backup** | 🔴 **NO EXISTE** | 🔴 **NO EXISTE** |

**Las 8 policies fueron verificadas contra `pg_policies` de producción y reconstruidas con `db reset` sobre base limpia.** Hasta el 25/08 las de `fotos_clinicas` existían solo en producción, sin versionar — ese era un hallazgo real y está cerrado.

**`anon` sobre `storage.objects`:** ⚪ ACEPTADO. El ACL es `anon=arwdDxtm/supabase_storage_admin`; solo el otorgante revoca y `postgres` no puede asumir ese rol. **Es cómo Supabase entrega todos sus proyectos.** Mitigado: `storage` no está expuesto en PostgREST (HTTP 406, verificado).

---

# 8 · AUTH / SECRETOS / SENTRY

| Verificación | Resultado | Estado |
|---|---|---|
| `.env` versionado | ninguno · solo `.env.example` | 🟢 |
| Secretos en el código | `git grep` de patrones JWT/`sk_live_`/`APP_USR-`/`re_` → **0** | 🟢 |
| `CRON_SECRET` | rotado 25/08 · `timingSafeEqual` · falla cerrado | 🟢 PRODUCCIÓN |
| Tokens de paciente | UUID v4 · `crypto.randomUUID()` | 🟢 |
| Sentry · eventos nuevos | `sendDefaultPii:false` + 3 hooks de scrub · 63 tests | 🟢 |
| **Sentry · eventos históricos** | **anteriores a P0-06: tokens de paciente e IPs** | 🟠 **PENDIENTE** |
| Cuenta de mantenimiento | existe, es deliberada, **no declarada en la política** | 🟠 **PENDIENTE** |

**No confundo "ya no se generan" con "los viejos fueron purgados".** No lo fueron.

---

# 9 · DISPONIBILIDAD

## Incidente del 24/08 — **MITIGADO · CAUSA NO DEMOSTRADA**

**Corregido y desplegado:**
- el middleware llamaba a Supabase Auth **antes** de evaluar si la ruta era pública
- el matcher dejaba pasar assets del PWA — **8 de 13 invocaciones eran archivos estáticos**
- `Promise.race` con timeout de 3 s sobre la llamada de sesión

**No demostrado:** el log decía `No outgoing requests` y **234 MB** — se colgó antes de tocar la red. Un arranque en frío medido da **1,1 s**, lejos de los 25 s del timeout.

**No invento una causa.** Región corregida a `pdx1` (Supabase está en `us-west-2`), 40 tests fijan el matcher.

**ESTADO:** 🟡 MITIGADO / NO REPRODUCIBLE · no bloquea.

---

# 10 · INTEGRIDAD DE DATOS

## 10.1 · El patrón B1.4 en el resto del código

**RIESGO:** RLS niega `DELETE`/`UPDATE` devolviendo **0 filas con `error = null`**. Sin `.select()`, la ruta responde 200 sobre una operación que no ocurrió.

**PRUEBA:** barrido de las 42 rutas. **13 operaciones sin `.select()`.**

**RESULTADO — la distinción que importa:**

| | Rutas | ¿Riesgo? |
|---|---|---|
| `service_role` | 11 | **No.** `service_role` ignora RLS: 0 filas significa que la fila realmente no existía, no que fue denegada. Todas verifican pertenencia antes |
| `authenticated` | **2** — `consentimientos`, `facturacion/emitir` | **Verificadas** |

Las dos rutas `authenticated` validan `tenant_users` **antes** del UPDATE y acotan con `.eq('tenant_id', tenantId)`. Un UPDATE de 0 filas ahí no puede ser una denegación silenciosa de RLS: el tenant ya fue verificado.

**ESTADO:** 🟢 VERIFICADO. B1.4 era el único caso real y está cerrado.

## 10.2 · Otros

| | Estado |
|---|---|
| FK circular en `facturas` | conocida · `ON_ERROR_STOP=1` hace que el restore **explote** en vez de reportar verde |
| MercadoPago | HMAC + idempotencia · 33 tests | 🟢 |
| Recordatorios | `por_cita = 1.00` sobre 9 días — **sin duplicación** | 🟢 PRODUCCIÓN |
| pg_cron job 3 | muerto · documentado · **no debe "repararse"** | 🟡 |

---

# 11 · MIGRACIONES / RELEASE

| Verificación | Resultado |
|---|---|
| Migraciones | 20 · orden cronológico coherente |
| Reintroducción de `GRANT ... TO anon` | **el baseline las tenía: 30.** Neutralizadas, con nota, vigiladas por G-5.3 |
| `db reset` obligatorio | sí — el 25/08 encontró **3 defectos** en mi propia migración de Storage |
| Rollback | `~/rollback-dentaldesk/` · **fuera del repo a propósito** |
| Drift producción/repo | las policies de `fotos_clinicas` existían solo en producción → **ya versionadas** |

⚠️ **Regla operativa:** no regenerar `remote_schema.sql` con `supabase db dump`. Vuelve a traer los 30 GRANT. G-5.3 lo detecta, pero mejor no provocarlo.

---

# 12 · TESTS — ¿cobertura o volumen?

**686 tests · 30 archivos.** Desglose real:

| Categoría | Archivos | Bloques `it()` | Qué vale |
|---|---|---|---|
| **PostgreSQL real (PGlite)** | 6 | **118** | Ejecuta SQL de verdad contra las policies de producción |
| Estático (lee archivos) | 11 | 260 | Detecta regresión estructural, **no** comportamiento |
| Unit (lógica pura) | 12 | 190 | Funciones puras — vale lo que vale |
| Con mocks | 1 | 12 | El más débil |

**Archivos sin `expect()`: 0.**

**Veredicto honesto:** los 686 **no son 686 pruebas de seguridad**. Lo que sostiene el aislamiento son los **118 bloques contra PostgreSQL real** — que se expanden a bastantes más por `it.each` — y ahí están las cuatro operaciones, los dos tenants y el cambio malicioso de `tenant_id`.

**Los 260 estáticos son guardas de regresión, no pruebas de seguridad.** Su valor es impedir que alguien deshaga lo arreglado. Y ya demostraron su límite: **G-5.4 producía un falso positivo por leer declaraciones en vez de estado.**

🟢 **Es cobertura real donde importa**, con la categoría correcta declarada.

---

# 13 · DEPENDENCIAS

`npm audit --omit=dev` → **18 vulnerabilidades en el árbol de producción** (1 baja, 10 moderadas, 7 altas).

| Paquete | Sev. | Alcance real | Clasificación |
|---|---|---|---|
| `vitest` | **crítica** | **devDependency.** Requiere el UI server escuchando. **No se despliega** | ⚪ NO APLICA |
| `xlsx` | alta | Producción. `XLSX.read` corre **en el navegador del propio usuario**, sobre un archivo que él eligió. Sin fix disponible | 🟡 POST-LANZAMIENTO |
| `next` 14.2.35 | alta | DoS vía Image Optimizer **en self-hosted**. Están en Vercel | 🟡 POST-LANZAMIENTO |
| `ws`, `fast-uri`, `qs`, `uuid`, `nanoid`, `brace-expansion`, `glob` | alta/mod. | Transitivas · `npm audit fix` disponible | 🟡 POST-LANZAMIENTO |
| `svix` (vía `resend`) | mod. | Producción — valida firmas de webhook | 🟠 **actualizar `resend`** |
| `@opentelemetry/*`, `@sentry/*` | mod. | Instrumentación | 🟡 POST-LANZAMIENTO |
| `esbuild`, `vite`, `postcss`, `@babel/core` | mod./baja | Build-time | ⚪ NO APLICA |

**Ninguna es bloqueante.** La crítica no se despliega; la de mayor alcance real (`xlsx`) es autoinfligida en el navegador propio.

**Acción antes del primer cliente:** `npm audit fix` (no `--force`) + actualizar `resend`. Diez minutos.

---

# 14 · RIESGO DE NEGOCIO

| Riesgo | Puede ocurrir | Estado |
|---|---|---|
| **Pérdida de fotos clínicas** | **SÍ — y PITR no lo evita** | 🔴 |
| **Pérdida de la base** | **SÍ — RPO infinito** | 🔴 |
| Pérdida de historias clínicas | Solo por lo anterior | 🔴 |
| Exposición cross-tenant | **No demostrable** — 65+11 pruebas dinámicas | 🟢 |
| Acceso indebido a pacientes | **No demostrable** | 🟢 |
| Pérdida de consentimientos | Por B-1/B-2 | 🔴 |
| Facturación incorrecta / cobros duplicados | **No** — HMAC + idempotencia + 33 tests | 🟢 |
| Borrado accidental irreversible | **SÍ** — sin PITR no hay vuelta atrás | 🔴 |
| Imposibilidad de recuperar una clínica | **SÍ** | 🔴 |

**Los seis rojos son el mismo riesgo:** recuperabilidad. **Cero provienen de seguridad, autorización o aislamiento.**

---

# 15 · DEUDA POST-LANZAMIENTO

| | Ítem | Por qué no bloquea |
|---|---|---|
| 🟡 | Autorización clínica por rol | No existe y **no se anuncia** |
| 🟡 | Filtro de tenant en PDFs `[id]` | RLS probado dinámicamente · G-6 fija la regresión |
| 🟡 | `npm audit fix` + `resend` | Sin exposición remota demostrable |
| 🟡 | R-18 → CERRADO | Requiere 4 semanas del control N-1 en cero |
| 🟡 | Causa raíz del 24/08 | Mecanismo mitigado · logs no retenidos |
| 🟡 | Borrar `sync-sheet` y sus credenciales | Trigger en `tgenabled='D'` |
| 🟡 | Export incompleto (falta odontograma, fotos, consentimientos) | No prometerlo completo |
| ⚪ | FORCE RLS | Sin impacto demostrable |
| ⚪ | `anon` en `storage.objects` | No accionable |

---

# 16 · CHECKLIST DE GO-LIVE

### Económico — 25 USD/mes

- [ ] **1.** Supabase Pro + PITR habilitado
- [ ] **2.** Restore a proyecto nuevo **desde el backup automático**
- [ ] **3.** Las **23 tablas** coinciden con producción
- [ ] **4.** Decisión documentada sobre `auth.users`

### Técnico — sin costo, ~2 h

- [ ] **5.** **Backup de Storage**, independiente y programado
- [ ] **6.** **Restaurar una foto desde ese backup y abrirla**
- [ ] **7.** Extender `probar-restore.sh` a las 23 tablas
- [ ] **8.** `npm audit fix` + actualizar `resend`

### Operativo — ~30 min

- [ ] **9.** Purgar eventos históricos de Sentry
- [ ] **10.** Borrar la planilla de Google (PII de 212 pacientes + notas clínicas)
- [ ] **11.** Declarar la cuenta de mantenimiento en `/legal/privacidad`
- [ ] **12.** Corregir §7 de la política: promete borrado a 30 días sin mecanismo de baja
- [ ] **13.** Corregir §4: menciona WhatsApp, que no envía nada

### No afirmar

- [ ] **14.** Sin "permisos por rol clínico" · sin "backup automático" hasta el 6 · sin "cifrado de extremo a extremo" (es TLS) · sin "exportación completa"

**El gate se cierra en el 6, no en el 1.**

---

# RELEASE DECISION

## 🔴 NO-GO

**Qué bloquea:** recuperabilidad, en dos formas. No hay backup automático de la base (RPO infinito), y **las fotos clínicas no tienen backup de ningún tipo — ni lo tendrán al pagar Pro**, porque PITR se construye sobre backups físicos del directorio de Postgres y WAL, y los objetos de Storage viven en S3, fuera de ese alcance.

**Evidencia:** `probar-restore.sh:41` hace `db dump --data-only` (solo `public`, sin `auth`); la verificación cubre 6 de 23 tablas, omitiendo `historial_dental`, `presupuestos` y `paciente_fotos`; y Supabase documenta que tras un restore *"los archivos guardados en los buckets S3 no estarán presentes"*. El modo de falla es el peor: las filas vuelven, las imágenes no, y el restore reporta éxito.

**Acción mínima:** Supabase Pro + PITR, backup de Storage independiente, y verificación extendida a las 23 tablas.

**Cómo verificar el cierre:** restaurar a un proyecto nuevo desde el backup automático, comparar las 23 tablas, y **abrir una foto clínica recuperada desde el backup de Storage**. Ese último paso es el gate.

**Lo demás no bloquea.** Esta evaluación no encontró ninguna vulnerabilidad nueva. Produjo evidencia dinámica de que la escalada vía `tenant_users` está cerrada y de que las 8 policies «sin WITH CHECK» no son una laguna, y **descartó 4 sospechas propias por lectura del código** — diez falsos positivos contra un hallazgo real en toda la ronda final.

---

**El código debe congelarse. Lo que queda es operativo, no técnico** — con una salvedad que corrige lo que yo mismo afirmé antes: el paso operativo **no es solo pagar**. Es pagar **y** construir el backup de Storage, que ningún plan de Supabase resuelve por vos.
