# Audit de GO / NO-GO — Lanzamiento comercial

**DentalDesk · SaaS odontológico multi-tenant**
**Fecha:** 20/08/2026 · **Alcance:** producto completo, no solo P0-05
**Nada implementado. Ningún archivo de código modificado. Nada ejecutado contra producción.**

**Pregunta:** *¿podemos poner dinero de clientes reales sobre este sistema en los próximos 3 meses sin crear un problema serio de seguridad, datos u operación?*

**Respuesta corta: 🟡 CONDITIONAL GO.** Detalle en §17.

### Clasificación de evidencia usada

| Marca | Significa |
|---|---|
| **🟢 PROD** | Confirmado en producción, medido |
| **🔵 REPO** | Confirmado en el repositorio. **No es evidencia de producción** |
| **🟠 INF** | Inferido. Razonamiento, no medición |
| **⚪ NV** | **NO VERIFICADO** |
| **🟣 RA** | Riesgo aceptado con alcance definido |

---

## 1 · Seguridad y autenticación

| Área | Estado | Evidencia |
|---|---|---|
| Autenticación | 🔵 REPO | Supabase GoTrue, cookies. Middleware con `esRutaPublica()` |
| Sesión servidor | 🔵 REPO | `createClient()` de `server.ts`, cookies → rol `authenticated` |
| Portal de pacientes | 🟢 PROD | Token UUID por paciente. P0-03 verificó saneo en Sentry |
| Enlaces cortos | 🔵 REPO | `generar_codigo_enlace`: 12 chars base32, 122 bits de `gen_random_uuid()` |
| Consentimiento digital | 🔵 REPO | `token_firma` UUID único, `contenido_snapshot` inmutable, hash SHA256 |
| `service_role` | 🔵 REPO | Solo en rutas de API. **Nunca** llega al navegador |
| `anon` | 🟢 PROD | **34 de 35 tablas con `arwdDxtm`.** Contenido solo por RLS. B1.6 pendiente |
| `SECURITY DEFINER` | 🟢 PROD | 13 funciones. 4 cerradas a `service_role`. R-11 y R-12 abiertos |
| `search_path` | 🟢 PROD | 9 de 13 sin `pg_temp` (**R-12**). `anon` y `authenticated` tienen `TEMP` |
| Sentry / PII | 🟢 PROD | P0-03 desplegado y verificado: sin cookies, sin IP, URLs saneadas |
| Secretos | 🟢 PROD | **R-14** — token en texto plano en `cron.job`, expuesto además en chat |
| Rotación de secretos | ⚪ NV | `CRON_SECRET` sin rotar. Eventos históricos de Sentry sin purgar |

### ¿Existe alguna ruta que permita a un usuario del Tenant A actuar como Tenant B?

**No encontré ninguna.** Pero la afirmación tiene límites que hay que decir:

**Lo verificado:** las 4 políticas RLS con rol y las 5 rutas de API resuelven el tenant desde `tenant_users` con `auth.uid()`, no desde parámetros del cliente. Las funciones `SECURITY DEFINER` validan pertenencia antes de escribir. `emitir_factura_con_detalle` recibe `p_tenant_id` del cliente **pero lo valida** contra `tenant_users` — leí el cuerpo vivo. `/api/horas-ocupadas` exige `tenant_id` con formato UUID y filtra por él.

**Lo NO verificado:** no hice pruebas activas de IDOR. No intenté, con una sesión del tenant A, invocar rutas con IDs del tenant B. **Sin eso, "no encontré" no es "no existe".**

**Un vector cerrado, que es la mejor evidencia de que el riesgo era real:** R-10 permitía a `anon` escribir en `tenants` por `tenants_public`. Estuvo abierto meses y ninguna revisión de código lo detectó — apareció recién al mirar `relacl` en producción.

---

## 2 · Multi-tenancy y aislamiento

**El bloque más importante, y el que mejor está.**

### Mapa de propagación del tenant

```
tenants (35 tablas cuelgan de acá)
  │
  ├─→ tenant_users ────→ auth.users        [tenant_id NOT NULL]  🟢 base de toda RLS
  │
  ├─→ pacientes ───────────────────────────[tenant_id NOT NULL]  🟢 209 filas
  │     ├─→ citas ─────────────────────────[NOT NULL] CASCADE
  │     │     ├─→ tratamiento_items ───────[NOT NULL] CASCADE
  │     │     ├─→ pagos ───────────────────[NOT NULL] CASCADE
  │     │     ├─→ recordatorios_log ───────[NOT NULL] CASCADE
  │     │     ├─→ enlaces_turno ───────────[NOT NULL] CASCADE
  │     │     ├─→ facturas ────────────────[NOT NULL] SET NULL   ⚠️ sobrevive
  │     │     └─→ historial_puntos ────────[NOT NULL] SET NULL
  │     ├─→ historial_dental ──────────────[NOT NULL] CASCADE    ⚠️ historia clínica
  │     ├─→ paciente_fotos ────────────────[NOT NULL] CASCADE    ⚠️ deja huérfanos en Storage
  │     ├─→ historial_puntos ──────────────[NOT NULL] CASCADE
  │     ├─→ feedback_post_visita ──────────[NOT NULL] CASCADE
  │     ├─→ consentimientos_firmados ──────[NOT NULL] SET NULL   ⚠️ PII sobrevive
  │     ├─→ crm_envios ────────────────────[NOT NULL] SET NULL
  │     └─→ presupuestos ──────────────────[NOT NULL] NO ACTION  ⚠️ bloquea (0 filas)
  │
  ├─→ turnos ─(trigger)→ citas   ⚠️ sync_turno_to_cita SIN filtro de tenant (P0-01)
  ├─→ premios, config_fidelizacion, tratamientos, bloqueos
  ├─→ facturas → factura_items, factura_pagos
  ├─→ arca_config, plantillas_consentimiento, crm_campanas
  └─→ perfil_doctor, meta_mensual, costos_fijos, ingresos/egresos_manuales, logs_envios
```

### Estado por dimensión

| Dimensión | Estado | Evidencia |
|---|---|---|
| `tenant_id` presente | 🟢 PROD | En las 35 tablas de negocio |
| `tenant_id NOT NULL` | 🔵 REPO | Verificado en `pacientes`, `citas`, `turnos`, `historial_puntos` |
| RLS habilitada | 🟢 PROD | **43 de 43** relaciones — N-1 |
| **`FORCE RLS`** | 🟢 PROD | **`false` en las 43** — **R-9**. El dueño ignora sus propias políticas |
| Políticas | 🟢 PROD | 1-3 por tabla. `enlaces_turno` con 0 → **deniega todo**, falla cerrada |
| `anon` puede leer | 🟢 PROD | **34 de 35 tablas.** Solo RLS lo contiene. **B1.6 pendiente** |
| `authenticated` puede leer | 🟢 PROD | Las 35. Por diseño — DO-1 difirió esto a Fase 2 |
| Integridad cross-tenant | 🟢 PROD | **U-01/U-02/U-03 = 0**, con 3 clínicas coexistiendo históricamente |
| Vistas | 🟢 PROD | 7 vistas + 1 matview. `bi_*` cerradas (P0-07). `tenants_public` solo `SELECT` |

### Lo que los tests NO prueban — falsa sensación de seguridad

**84 tests de aislamiento en PGlite, todos verdes. Y no prueban lo que uno cree.**

| Limitación | Consecuencia |
|---|---|
| El harness **concede los privilegios él mismo** (`GRANT … TO authenticated`) | **No puede detectar un privilegio faltante o sobrante.** B1.1 y B1.6 probados ahí darían verde sin probar nada |
| Tablas sintéticas `(id, tenant_id, dato)` | No hay FK, no hay CASCADE, no hay columnas reales |
| No corre PostgREST | No prueba cómo se expone realmente la API |
| `auth.uid()` es un shim | No es GoTrue |
| No prueba Storage | Las policies de `storage.objects` no están cubiertas |

**Los 471 tests verdes NO son evidencia de aislamiento en producción.** Son evidencia de que las políticas RLS, aplicadas sobre tablas con los privilegios correctos, aíslan por tenant. Eso es valioso y no es lo mismo.

**Prueba concreta de esta brecha:** B1.1 pasó la verificación de catálogo y falló la de comportamiento (**R-17**).

### Vectores identificados

| Vector | Estado |
|---|---|
| Cross-tenant read por RLS | 🟢 Contenido. U-01/U-02/U-03 = 0 |
| Cross-tenant write por RLS | 🟢 Contenido. `WITH CHECK` heredado de `USING` |
| **`SECURITY DEFINER` saltea RLS** | 🟣 **Por diseño.** Por eso las validaciones van dentro del cuerpo |
| **`sync_turno_to_cita` sin filtro de tenant** | 🟠 **P0-01 abierto.** Busca pacientes por email sin filtrar tenant. Solo `service_role` |
| IDOR en APIs | ⚪ **NV — no se probó activamente** |
| `service_role` con parámetros del usuario | 🔵 `/api/equipo/invitar` inserta `role` sin whitelist (**R-2**) |

---

## 3 · RBAC y modelo multirol

### Estado actual — 🟢 PROD

```sql
tenant_users (role text NOT NULL DEFAULT 'admin')   -- sin CHECK
```

**2 usuarios, ambos `admin`, 1 clínica.** El sistema **nunca operó con roles diferenciados.**

### Dónde vive la lógica de roles — está duplicada en tres capas

| Capa | Cuántos | Ejemplos |
|---|---|---|
| Políticas RLS | **4** | `arca_config_write`, `plantillas_write`, `crm_campanas_write`, `tenants_update_own` |
| Rutas de API | **5** | `equipo/invitar`, `equipo/miembros`, `facturacion/anular`, `facturacion/config`, `pacientes/exportar` |
| Funciones SQL | **0** | Ninguna valida rol todavía — eso es B1.2/B1.3 |

**Nueve lugares con la misma regla escrita a mano.** `tiene_rol()` —ya creada en producción— es la costura que unifica esto, pero **todavía no la consume nadie**.

### Qué falta para que sea comercializable

| # | Falta | Prioridad |
|---|---|---|
| 1 | La tabla de asociación multirol *(DO-6)* | **P1** |
| 2 | Migrar las 4 políticas y las 5 rutas a `tiene_rol()` | **P1** |
| 3 | **Jerarquía: quién puede otorgar qué rol** (**R-2**) | **P1** |
| 4 | Vocabulario cerrado por integridad referencial | P1 |
| 5 | Probar el sistema con roles diferenciados **de verdad** | **P0** |

**El punto 5 es el que más me preocupa.** Todo el diseño de RBAC se hizo sobre un sistema donde **todos son admin**. Cuando exista el primer `odontologo`, cuatro políticas RLS empiezan a denegar cosas que hoy nadie prueba. **Ese día no puede ser el día del primer cliente pago.**

### R-2 · Escalada admin → owner

🟣 **Riesgo aceptado, con alcance definido.** `/api/equipo/invitar:14` toma `role` del request y lo inserta con `service_role` sin whitelist. Un `admin` puede crear un `owner`.

**No fue explotado** — 🟢 PROD: los 2 usuarios son `admin`, sin valores inventados. **Pero el riesgo crece con cada usuario nuevo.** Con 50 clínicas y 200 usuarios, "nadie lo usó" deja de ser tranquilizador.

---

## 4 · Base de datos e integridad

| Control | Estado |
|---|---|
| FK hacia `pacientes`/`citas`/`tenants` | 🔵 REPO · mapa completo, §2 |
| `ON UPDATE` | 🔵 **`NO ACTION` en todas.** Sin sorpresas |
| `CHECK` | 🔵 `historial_puntos.tipo_movimiento` (6 valores). **`tenant_users.role` sin CHECK** |
| `UNIQUE` parcial | 🔵 **`uq_gasto_por_cita`** — impide acreditar dos veces la misma cita ✅ |
| Triggers | 🟢 PROD · 5, todos activos. Uno roto (**R-8**) |
| Ownership | 🟢 PROD · **43 objetos y 14 funciones, todos de `postgres`** |
| Índices | 🔵 `idx_histpuntos_paciente`. **Sin índice por `tenant_id`** en varias tablas |
| Soft delete | 🔵 **No existe.** Ni `archivado_en`, ni `deleted_at`, ni `activo` |

### Riesgos de pérdida de datos

| Riesgo | Estado | Detalle |
|---|---|---|
| **Borrar un paciente destruye historia clínica** | 🔵 REPO | CASCADE sobre `historial_dental`, `paciente_fotos`, `historial_puntos`, `recordatorios_log`. **Irreversible, sin confirmación reforzada, sin log de quién borró** |
| **Fotos huérfanas en Storage** | 🟢 PROD | `paciente_fotos.url` es el único índice. CASCADE borra la fila, el archivo queda |
| **PII sobrevive al borrado** | 🔵 REPO | `consentimientos_firmados` con `SET NULL` conserva nombre, documento, firma PNG, IP y user-agent |
| **Comprobante sin cobro** | 🔵 REPO | `facturas` sobrevive (`SET NULL`), `pagos` muere. Asimetría contable permanente |
| **Falso éxito al borrar** | 🟢 PROD | RLS devuelve 0 filas con `error = null`; la UI muestra *"Paciente eliminado"*. **B1.4** |
| Doble acreditación de puntos | 🟢 Cubierto | `uq_gasto_por_cita` |
| Doble canje | 🟠 INF | `FOR UPDATE` + validación de stock. **Sin clave de idempotencia.** 0 canjes históricos: sin probar bajo concurrencia |
| Doble webhook de MP | 🟢 Cubierto | Idempotente por diseño — §8 |
| **Borrado en cascada de un tenant** | 🟠 INF | 19 FK cascadean desde `tenants`. Lo frena que `pacientes.tenant_id` es `NO ACTION` — **por accidente, no por diseño** (**R-7**) |

---

## 5 · Puntos y fidelización

**🟢 PROD — 251 movimientos, 209 pacientes, 1 clínica:**

```
migracion_inicial   159   máx 200
gasto_tratamiento    88   máx 390
bonus_asistencia      4   máx 150
ajuste_manual         0   ← nunca se usó
ajuste_reverso        0   ← nunca se usó
canje_premio          0   ← nunca se usó
```

| Control | Estado |
|---|---|
| Límite ±500 | 🔴 **Diseñado, NO aplicado** (B1.2) |
| Nota obligatoria | 🔴 **Diseñada, NO aplicada.** Hoy `COALESCE` **inventa** la nota |
| Validación de tenant | 🟢 PROD · las 4 funciones validan contra `tenant_users` |
| Actor registrado | 🟢 PROD · `aprobado_por_usuario_id` en el ledger |
| Concurrencia | 🟢 PROD · `FOR UPDATE` sobre `pacientes` en ambas |
| Saldo negativo | 🟢 PROD · rechazado en `fn_ajustar_puntos_manual` |
| Validación de rol | 🔴 **Ninguna función valida rol.** B1.2/B1.3 sin aplicar |
| Replay de canje | ⚪ **NV** · sin idempotencia; nunca ejercitado |
| Ledger inmutable | 🟠 INF · append-only **de hecho** (ningún código hace UPDATE/DELETE), **no por restricción** |

**Riesgo comercial real:** los puntos valen $50 cada uno al canjearse. Hoy **cualquier miembro del tenant puede ajustar puntos sin límite y sin justificar**. Con 2 usuarios de confianza es tolerable. Con 50 clínicas y decenas de recepcionistas, no.

---

## 6 · Pacientes y borrado

**Cadena completa, 🟢 PROD y 🔵 REPO:**

1. **Una sola ruta borra pacientes:** `src/app/pacientes/page.tsx:139`, cliente `authenticated`. **No hay camino `service_role`** — verificado en todo el repositorio.
2. **RLS deniega devolviendo 0 filas con `error = null`.** No lanza excepción.
3. **La UI infiere éxito de la ausencia de error** y muestra *"Paciente eliminado"*.
4. **`presupuestos` bloquearía** con `23503`… pero tiene **0 filas** 🟢 PROD, así que el borrado funciona hoy.
5. El error de FK se mostraría **crudo y en inglés**, con nombres de tabla y constraint.

**Consecuencia:** aplicar B1.4 sin corregir la UI le mostraría *"Paciente eliminado"* a un odontólogo cuyo borrado fue denegado. **Peor que no tener el control.** Por eso DO-5 autorizó tocar ese archivo.

**Lo que sigue faltando después de B1.4:** confirmación reforzada, log de auditoría del borrado, limpieza de Storage y soft delete. **Ninguno está diseñado.**

---

## 7 · Seguridad de APIs

**36 rutas.** Inventario completo medido.

### Rutas públicas — sin sesión, alcanzables desde internet

| Ruta | Método | Rate limit | Validación | Riesgo |
|---|---|---|---|---|
| `/api/registro` | POST | ✅ | — | Alta de clínicas. **Sin captcha** ⚪ |
| `/api/reserva/[clinica]` | GET | ✅ | slug | Datos públicos de la clínica |
| `/api/horas-ocupadas` | GET | ✅ | `tenant_id` UUID obligatorio | **Enumerable** si se conoce un `tenant_id` |
| `/api/paciente/[token]/*` | GET, PATCH, POST | ✅ | token UUID | 122 bits de entropía |
| `/api/consentimientos/firmar/[token]` | GET, POST | ✅ | token UUID | Idem |
| `/api/webhooks/mercadopago` | POST | — | **firma HMAC** ✅ | §8 |
| `/api/webhooks/resend` | POST | — | **firma svix** ✅ | — |

**Las tres primeras son públicas por diseño y están limitadas.** `/api/horas-ocupadas` expone horarios ocupados de un tenant si se conoce su UUID — aceptable para un portal de reservas, pero es enumeración.

### Rate limiting — debilidad estructural 🔵 REPO

```
Rate limiter simple en memoria (por instancia serverless).
en Vercel cada instancia tiene su propia memoria, así que esto NO es un límite global
```

**Está documentado en el propio código, lo cual habla bien.** Pero: **solo 9 de 36 rutas lo usan**, y en serverless el límite se multiplica por la cantidad de instancias. **Con tráfico real no frena un ataque distribuido.**

### Riesgo de IDOR

⚪ **NO VERIFICADO.** No se hicieron pruebas activas. Varias rutas reciben IDs por parámetro (`/api/facturacion/pdf/[id]`, `/api/consentimientos/pdf/[id]`); **no verifiqué si validan que el ID pertenezca al tenant de la sesión.**

**Esto es un hueco concreto del audit y debería cerrarse antes de vender.**

---

## 8 · Billing — MercadoPago y ARCA

**El bloque mejor construido del sistema.** Leí el webhook completo.

| Control | Estado |
|---|---|
| Firma HMAC-SHA256 obligatoria | 🔵 **REPO ✅** · rechaza si no hay `MERCADOPAGO_WEBHOOK_SECRET` |
| **Nunca confía en el body para el estado** | 🔵 **REPO ✅** · consulta `api.mercadopago.com/preapproval/{id}` |
| Tenant desde `external_reference` | 🔵 REPO · `"<tenantId>\|<plan>"`, traído del servidor de MP |
| Ruta de simulación | 🔵 **REPO ✅** · `mock-preapp-` bloqueado si `NODE_ENV === 'production'` |
| Idempotencia | 🟠 **INF ✅** · re-consulta el estado en cada llamada → **un replay re-sincroniza, no duplica** |
| Fuera de orden | 🟠 INF · el último en ejecutar escribe el estado real de MP. **Auto-corrige** |
| Webhook de Resend | 🔵 REPO ✅ · firma svix verificada |

### ¿Puede un webhook del Tenant A modificar el estado comercial del Tenant B?

**No.** 🔵 REPO. El `tenantId` no viene del request: sale del `external_reference` que **MercadoPago devuelve al ser consultado desde el servidor**. Para afectar a otro tenant habría que forjar la firma HMAC **y** controlar el `external_reference` de una preapproval real de MP.

**Debilidades reales:**

| # | Qué | Severidad |
|---|---|---|
| 1 | `.eq('id', tenantId)` con un id inexistente afecta 0 filas **en silencio** | Baja |
| 2 | **Sin conciliación**: nada compara el estado de MP con el de `tenants` periódicamente | **Media** |
| 3 | **Sin registro de eventos de facturación** — no hay tabla de auditoría de cambios de plan | **Media** |
| 4 | ARCA: `emitir_factura_con_detalle` con `anon=X` (**R-11**). **Se defiende sola** con `auth.uid()`, pero el privilegio no debería estar | Media |
| 5 | Upgrade/downgrade/renovación | ⚪ **NV** — no probados |

---

## 9 · Email y notificaciones

| Flujo | Estado |
|---|---|
| Recordatorios diarios | 🟢 **PROD ✅** · 2-7 por día, **`envios` == `citas_distintas`: sin duplicados** |
| Firma del webhook de Resend | 🔵 REPO ✅ |
| **Quién los envía realmente** | ⚪ **NV** · dos programadores disparan a las 11:00 UTC y solo uno produce filas |
| Recordatorios por email (`recordatorio-email`) | 🟢 **PROD ❌** · **R-13** — la ruta fue borrada; ~24 fallos diarios |
| PII en logs | 🟢 PROD ✅ · P0-03 saneado y verificado |
| Reintentos | ⚪ NV |

**El hallazgo operativo más concreto de todo el audit:** si alguien esperaba recordatorios por email, **hace meses que no salen y nadie se enteró**.

---

## 10 · Cron, Edge Functions y jobs

**Cinco programadores. Ninguno versionado.**

| # | Origen | Programación | Destino | Estado |
|---|---|---|---|---|
| 1 | `pg_cron` jobid 3 | `0 11 * * *` | Edge Function `enviar-recordatorios` | 🟢 **timeout 5000ms** · resultado nunca observable |
| 2 | `pg_cron` jobid 4 | `0 * * * *` | `/api/recordatorio-email` | 🟢 **404 · R-13** |
| 3 | Vercel | `0 11 * * *` | `/api/cron` | ⚪ NV |
| 4 | Vercel | `0 22 * * *` | `/api/daily-briefing` | ⚪ NV |
| 5 | Vercel | `0 12 * * *` | `/api/crm-campanas` | ⚪ NV |
| — | Trigger | por escritura de `citas` | `turnos-app-delta.vercel.app` | 🟢 **401 · R-8** |

### R-14 · Secretos en texto plano — el más grave de este bloque

🟢 **PROD.** `cron.job.command` contiene **dos credenciales en claro**: un bearer token custom con formato `<producto>_<palabra>_<año>` y una clave `sb_publishable_…`.

**Consecuencias:**

1. Están en la tabla, **en los backups**, y a la vista de cualquiera con acceso al SQL Editor.
2. **No aparecen en el repositorio** → no se pueden auditar ni rotar desde el código.
3. **El token custom quedó expuesto en esta conversación.** Debe rotarse.
4. ⚪ **NV crítico: ¿ese token es el valor de `CRON_SECRET`?** Si lo es, la misma cadena protege `/api/cron`, `/api/daily-briefing` y `/api/crm-campanas`.

### R-15 · Edge Function sin versionar

🟢 PROD. `enviar-recordatorios` corre a diario. **`supabase/functions/` no existe en el repositorio.** No sabemos qué hace, qué datos toca ni con qué privilegios. **Es código de producción invisible.**

### R-8 · Trigger a dominio ajeno

🟢 PROD. Dispara en cada INSERT/UPDATE de `citas` hacia `turnos-app-delta.vercel.app`, sin header de autorización. **Devuelve 401 — sin fuga de PII, verificado.** El deployment viejo sigue vivo y con el chequeo del secreto activo. **Riesgo latente:** si alguna vez se redeploya ahí una versión sin ese chequeo, empiezan a fluir nombre, teléfono y email de pacientes.

---

## 11 · Observabilidad

| Control | Estado |
|---|---|
| Saneo de PII | 🟢 **PROD ✅** · P0-03 verificado: URLs saneadas, sin cookies, sin IP, sin `user` |
| `sendDefaultPii: false` | 🔵 REPO ✅ |
| Cobertura | 🔵 REPO ✅ · `beforeSend`, `beforeSendTransaction`, `beforeBreadcrumb`, tags, spans |
| **Eventos históricos** | 🔴 **PROD** · **sin purgar.** Los previos a P0-03 conservan tokens de pacientes e IPs |
| Rotación de tokens filtrados | 🔴 **PROD** · ≥4 tokens de paciente estuvieron en Sentry. **Sin rotar** |
| `CRON_SECRET` en Sentry | ⚪ **NV** · la ventana de exportación no alcanzó la corrida del cron |
| Retención | ⚪ NV |

### ¿Podemos diagnosticar un incidente del Tenant A sin exponer datos del B?

**Sí para eventos nuevos** 🟢 — P0-03 sanea antes de enviar.
**No para los históricos** 🔴 — hay tokens de paciente e IPs sin purgar. **Es una fuga en reposo.**

---

## 12 · Backups y recuperación

**Hay más de lo que esperaba, y menos de lo necesario.**

`RUNBOOK-LANZAMIENTO.md` documenta un backup y restore **efectivamente probado**:

> ✅ **HECHO** (22/07/2026). Restore sin errores y cotejo exacto.

Eso es 🟢 PROD y vale mucho: **un backup que nunca se restauró no es un backup**, y este se restauró.

**Pero:**

| Aspecto | Estado |
|---|---|
| Restore probado una vez | 🟢 PROD · 22/07/2026 |
| **Backups automáticos** | ⚪ **NV** · el runbook describe un `pg_dump` **manual** |
| **PITR** | ⚪ **NV** · no hay evidencia de que esté habilitado |
| **RPO** | ⚪ **NO DEFINIDO** · ¿cuántos datos se puede perder? |
| **RTO** | ⚪ **NO DEFINIDO** · ¿en cuánto tiempo se vuelve a operar? |
| Restore con el esquema actual | ⚪ NV · ver contradicción |
| **El dump contiene PII real** | 🟢 PROD · el propio runbook lo advierte. Sin cifrado ni política de retención documentada |

### 🔴 CONTRADICCIÓN DETECTADA

**El runbook dice** (línea 62): *"✅ HECHO (22/07/2026). El baseline capturó **23 tablas**"*.

**La evidencia de producción dice** (N-1, 20/08/2026): **35 tablas** y 43 relaciones.

**Doce tablas quedaron fuera del baseline versionado**, entre ellas `pagos`, `facturas`, `factura_items`, `factura_pagos`, `tratamiento_items`, `arca_config`, `consentimientos_firmados` y `enlaces_turno`. Son exactamente las 12 sin `GRANT` explícito de R-1.

**Consecuencia directa: el procedimiento de restore documentado no reconstruye el esquema actual.** El runbook marca ✅ y ya no aplica.

---

## 13 · Deploy y release management

### ¿Podemos reconstruir producción desde Git?

# **NO.**

Y no es una limitación menor: **es el hallazgo estructural más importante del audit.**

| # | Qué falta en Git | Evidencia |
|---|---|---|
| 1 | **20 archivos `.sql` sueltos** en la raíz, aplicados a mano | 🔵 REPO |
| 2 | **P0-07** · el `REVOKE` de las vistas `bi_*` | 🟢 PROD · no está en ninguna migración |
| 3 | **R-10** · el `REVOKE` sobre `tenants_public` | 🟢 PROD · aplicado desde el editor |
| 4 | **B1.1** · default privileges + `tiene_rol()` | 🟢 PROD · aplicado desde el editor |
| 5 | **Los 2 jobs de `pg_cron`** con sus secretos | 🟢 PROD · **R-14** |
| 6 | **La Edge Function `enviar-recordatorios`** | 🟢 PROD · **R-15** |
| 7 | **El trigger `sync_turnos_to_sheets`** | 🟢 PROD · solo en el dump |
| 8 | **Baseline incompleto** — 23 de 35 tablas | 🟢 PROD · §12 |
| 9 | `src/lib/tenant-isolation.test.ts` (A-4) sin commitear | 🔵 REPO |
| 10 | Locks de `.git` bloqueando operaciones | 🔵 REPO |

**Si mañana se pierde el proyecto de Supabase, no se puede reconstruir.** Ni el esquema completo, ni los privilegios, ni los jobs, ni la Edge Function.

**Y es exactamente el problema que originó todo P0-05:** confiar en el repositorio en vez del estado vivo. La diferencia es que ahora sabemos que pasa — **y le seguimos agregando deuda: tres cambios más en las últimas semanas.**

---

## 14 · Performance y escalabilidad

**Base actual: 1 clínica, 2 usuarios, 209 pacientes, 251 movimientos de puntos.** Nada se probó a escala.

| Riesgo | 10 | 50 | 100 | 500 | Detalle |
|---|:---:|:---:|:---:|:---:|---|
| **Rate limiting en memoria** | 🟡 | 🔴 | 🔴 | 🔴 | Por instancia serverless. No frena abuso distribuido |
| **Navegador → Supabase directo** | 🟢 | 🟡 | 🔴 | 🔴 | 22 puntos de acceso solo en `pacientes` y `citas`. Cada cliente abre conexiones |
| **Sin índice por `tenant_id`** | 🟢 | 🟡 | 🔴 | 🔴 | Las policies filtran por `tenant_id`; sin índice, seq scan por tenant |
| **Fotos huérfanas en Storage** | 🟢 | 🟡 | 🟡 | 🔴 | Crecimiento monotónico sin limpieza |
| **`historial_puntos` sin índice de tenant** | 🟢 | 🟢 | 🟡 | 🔴 | Crece con cada tratamiento |
| **Trigger HTTP en cada escritura de `citas`** | 🟡 | 🔴 | 🔴 | 🔴 | **R-8** · una petición encolada por escritura, todas fallando |
| Pool de conexiones de Supabase | 🟢 | 🟡 | 🔴 | 🔴 | ⚪ NV · plan actual desconocido |
| Límites de Resend | 🟢 | 🟡 | 🔴 | 🔴 | ⚪ NV · cuota desconocida |
| Cuota de Sentry | 🟢 | 🟡 | 🔴 | 🔴 | ⚪ NV · `tracesSampleRate: 0.1` ayuda |

**El techo lo pone el rate limiting en memoria y el acceso directo desde el navegador.** Ambos están documentados en el código como decisiones conscientes con migración prevista — lo cual es buena ingeniería — pero **ninguna de las dos migraciones está hecha.**

---

## 15 · Operación comercial multi-tenant

| Capacidad | Estado |
|---|---|
| Crear clínica | 🔵 REPO ✅ · `/api/clinicas`, `/api/registro` |
| Crear owner | 🔵 REPO ✅ · rol `'owner'` explícito en el alta |
| Invitar usuarios | 🔵 REPO ⚠️ · funciona, **sin whitelist de rol** (R-2) |
| Asignar roles | 🔵 REPO ⚠️ · una sola columna. Multirol pendiente |
| Subdominio / dominio propio | 🟢 PROD ✅ · `turnos.walterbenegas.com.ar` funciona |
| Branding | 🟢 PROD ✅ · vía `tenants_public` |
| Plan y facturación | 🔵 REPO ✅ · MercadoPago |
| Cancelar suscripción | 🔵 REPO ✅ · `/api/billing/cancelar`, **solo el owner** |
| **Suspender por falta de pago** | ⚪ **NV** · `subscription_status` se actualiza; **qué bloquea, sin verificar** |
| **Exportar datos de la clínica** | 🔴 **Solo pacientes** (`/api/pacientes/exportar`). No hay export completo |
| **Eliminar un tenant** | 🔴 **NO EXISTE** ruta de baja de datos |
| **Recuperar una clínica dada de baja** | 🔴 **NO EXISTE** |

### ¿Qué ocurre cuando una clínica se va?

**No lo sabemos, porque no está construido.**

Lo que sí puedo afirmar 🔵 REPO: cancelar la suscripción **solo cancela el cobro**. Los datos quedan. No hay export, no hay purga, no hay retención definida, no hay baja.

**Implicaciones que no son técnicas:**

- **Legales.** Historias clínicas y consentimientos firmados con PII de pacientes que ya no son clientes. La Ley 25.326 da derecho de supresión, y **no hay mecanismo para ejercerlo**.
- **Contractuales.** Sin un procedimiento de export, una clínica que se va **no puede llevarse sus datos**. Eso es difícil de sostener en un contrato de servicio.
- **Operativas.** Sin baja, la base crece indefinidamente con tenants inactivos.
- **Técnicas.** Si alguien intenta borrar un tenant, 19 FK cascadean. Lo frena `pacientes.tenant_id` con `NO ACTION` — **por accidente** (R-7).

**Este es el bloque más flojo del producto, y el que menos atención recibió.**

---

## 16 · Matriz de riesgo

| ID | Riesgo | Sev. | Prob. | Evidencia | Estado | Antes de lanzar |
|---|---|---|---|---|---|---|
| **D-1** | **No se puede reconstruir producción desde Git** | Crítica | Alta | 🟢 PROD · §13 | Abierto | **P0** |
| **D-2** | **Baseline de 23 tablas vs 35 reales — el restore no reconstruye** | Crítica | Alta | 🟢 PROD · contradicción §12 | Abierto | **P0** |
| **B-1** | **Sin backups automáticos, PITR, RPO ni RTO** | Crítica | Media | ⚪ NV | Abierto | **P0** |
| **R-14** | **Secretos en texto plano en `cron.job`; uno expuesto** | Alta | Alta | 🟢 PROD | Abierto | **P0** |
| **T-1** | **El sistema nunca operó con roles diferenciados** | Alta | **Certeza** | 🟢 PROD · 2 usuarios admin | Abierto | **P0** |
| **O-1** | **No existe baja de tenant ni export de datos** | Alta | Alta | 🔵 REPO · §15 | Abierto | **P0** |
| **R-1** | 34 de 35 tablas con `anon=arwdDxtm` | Alta | Media | 🟢 PROD | **B1.6 diseñado** | **P1** |
| **S-1** | Eventos históricos de Sentry con PII sin purgar | Alta | Media | 🟢 PROD | Abierto | **P1** |
| **S-2** | Tokens de paciente filtrados sin rotar | Alta | Media | 🟢 PROD | Abierto | **P1** |
| **I-1** | **IDOR no probado en 36 rutas** | Alta | ⚪ NV | ⚪ NV | Abierto | **P1** |
| **R-2** | Escalada admin → owner | Alta | Baja | 🟢 PROD · sin explotar | 🟣 RA → Fase 2 | **P1** |
| **P-1** | Borrar un paciente destruye historia clínica sin log | Alta | Media | 🔵 REPO | B1.4 parcial | **P1** |
| **B1.2** | Ajuste de puntos sin límite ni justificación | Media | Alta | 🟢 PROD · 0 usos | Diseñado | **P1** |
| **R-13** | Cron horario contra ruta borrada · 24 fallos/día | Media | **Certeza** | 🟢 PROD | Abierto | **P1** |
| **R-15** | Edge Function de producción sin versionar | Media | Alta | 🟢 PROD | Abierto | **P1** |
| **R-17** | Funciones nuevas nacen ejecutables por `anon` | Media | Media | 🟢 PROD | Mitigado G-2 | **P1** |
| **E-1** | Rate limiting en memoria, 9 de 36 rutas | Media | Alta | 🔵 REPO | Abierto | **P1** |
| **R-9** | `FORCE RLS` en ninguna tabla | Media | Baja | 🟢 PROD | Abierto | P2 |
| **R-12** | 9 funciones DEFINER sin `pg_temp` | Media | Baja | 🟢 PROD | Abierto | P2 |
| **R-8** | Trigger a dominio ajeno · roto, sin fuga | Media | Baja | 🟢 PROD | Abierto | P2 |
| **R-11** | `emitir_factura_con_detalle` con `anon=X` | Media | Baja | 🟢 PROD · se defiende | B1.6 | P2 |
| **P0-01** | `sync_turno_to_cita` sin filtro de tenant | Media | Baja | 🔵 REPO · solo `service_role` | Abierto | P2 |
| **F-1** | Fotos huérfanas en Storage | Baja | Alta | 🟢 PROD | Abierto | P2 |
| **F-2** | PII sobrevive al borrado del paciente | Media | Media | 🔵 REPO | Abierto | P2 |
| **B-2** | Sin conciliación de estado con MercadoPago | Media | Media | 🔵 REPO | Abierto | P2 |
| **R-7** | 19 CASCADE / 12 NO ACTION sin documentar | Baja | Baja | 🟢 PROD | Abierto | P3 |
| **E-2** | Sin índice por `tenant_id` | Baja | Media | 🔵 REPO | Abierto | P3 |

**6 P0 · 11 P1 · 8 P2 · 2 P3**

---

## 17 · GO / NO-GO

# 🟡 CONDITIONAL GO

**No es 🔴 NO GO** porque los fundamentos están sanos: RLS activa en las 43 relaciones, integridad cross-tenant verificada en cero con tres clínicas coexistiendo, webhook de MercadoPago bien construido, saneo de PII desplegado y verificado, y un backup efectivamente restaurado.

**No es 🟢 GO** porque hay seis condiciones que, si fallan con clientes reales encima, producen un daño del que no se vuelve.

### Las 6 condiciones P0 — todas deben cumplirse

**1 · Reconstruir producción desde Git.**
Versionar P0-07, R-10, B1.1, los 2 jobs de `pg_cron`, la Edge Function y el trigger. Regenerar el baseline con las 35 tablas. **Criterio de aceptación: aplicar todas las migraciones sobre una base vacía y obtener un esquema idéntico al de producción, comparado objeto por objeto.**

**2 · Backups con RPO y RTO definidos.**
Confirmar si PITR está habilitado. Definir cuántos datos se puede perder y en cuánto tiempo se vuelve a operar. **Criterio: un restore completo probado sobre el esquema actual, no sobre el de 23 tablas.**

**3 · Rotar el secreto de R-14 y sacarlo de `cron.job`.**
Y determinar si es el valor de `CRON_SECRET`. **Criterio: ningún secreto en texto plano en la base, y el token expuesto rotado.**

**4 · Probar el sistema con roles diferenciados.**
Crear un usuario `odontologo` y uno `staff` reales, y ejercitar los flujos completos. **Cuatro políticas RLS empiezan a denegar cosas que nadie probó nunca. Ese día no puede ser el día del primer cliente.**

**5 · Baja de tenant y export de datos.**
Como mínimo: export completo de los datos de una clínica y un procedimiento documentado de baja. **Criterio: exportar una clínica, verificar que el archivo tenga todo, y tener escrito qué se hace con los datos después.**

**6 · Probar IDOR en las 36 rutas.**
Con una sesión del tenant A, intentar operar sobre IDs del tenant B en cada ruta que reciba un identificador. **Criterio: cero accesos exitosos.** Hoy es 🟢 GO por ausencia de prueba, no por prueba.

### Para pasar de 🟡 a 🟢

Las 6 condiciones P0 cerradas y verificadas **con evidencia de producción, no de repositorio**. Más los P1 que tocan datos de pacientes: **B1.6, S-1, S-2, P-1 y B1.2.**

---

## 18 · Plan de 90 días

### Semanas 1-2 — Recuperabilidad

*Si el sistema se cae hoy, no se puede reconstruir. Eso va primero.*

| Área | Trabajo |
|---|---|
| **Infra** | Versionar P0-07, R-10, B1.1. Regenerar baseline con las 35 tablas. Limpiar locks de `.git`, commitear A-4 |
| **Infra** | Versionar los 2 jobs de `pg_cron`, la Edge Function `enviar-recordatorios` y el trigger `sync_turnos_to_sheets` |
| **Backups** | Verificar PITR. Definir RPO/RTO. **Restore completo probado sobre el esquema actual** |
| **Seguridad** | **Rotar el secreto de R-14.** Sacarlo de `cron.job` a variable de entorno. Verificar si es `CRON_SECRET` |
| **Seguridad** | Purgar eventos históricos de Sentry. Rotar los ≥4 tokens de paciente filtrados |
| **Operación** | Eliminar el job horario roto de R-13 |

### Semanas 3-4 — Cerrar P0-05

| Área | Trabajo |
|---|---|
| **Multi-tenancy** | Cerrar la ventana y aplicar **B1.6** con el protocolo congelado |
| **Datos** | **B1.2 + B1.3** — límite 500, nota obligatoria, canje sin odontólogo |
| **Datos** | **B1.4** — falso mensaje de éxito. Único archivo autorizado |
| **QA** | **B1.7** — guardas G-1, G-2, G-3 en CI |
| **QA** | **Suite de IDOR sobre las 36 rutas.** Es la deuda de verificación más grande |

### Semanas 5-8 — RBAC real y ciclo de vida comercial

| Área | Trabajo |
|---|---|
| **Roles** | Modelo multirol: tabla de asociación, migrar 4 políticas y 5 rutas a `tiene_rol()` |
| **Roles** | **Jerarquía de invitación** — cierra R-2 |
| **Roles** | **Operar con roles diferenciados en un entorno de prueba.** Condición P0-4 |
| **Comercial** | Export completo de datos por clínica |
| **Comercial** | Procedimiento de baja de tenant, con retención definida |
| **Comercial** | Verificar qué bloquea efectivamente `subscription_status` |
| **Billing** | Conciliación periódica con MercadoPago. Tabla de auditoría de cambios de plan |

### Semanas 9-12 — Endurecer y piloto

| Área | Trabajo |
|---|---|
| **Infra** | Rate limiting a store compartido (Upstash / Vercel KV) |
| **Datos** | Soft delete de pacientes + limpieza de Storage + log de auditoría del borrado |
| **Seguridad** | `FORCE RLS` (R-9) y `search_path` de las 9 funciones (R-12) |
| **Performance** | Índices por `tenant_id`. Verificar límites de Supabase, Resend y Sentry |
| **Piloto** | **2-3 clínicas reales, con roles diferenciados, monitoreadas de cerca** |
| **Piloto** | Simulacro de incidente: restaurar un backup y medir el RTO real |

---

## 19 · Checklist de release candidate

```
[ ] Seguridad          · secretos rotados · Sentry purgado · tokens rotados
[ ] Multi-tenancy      · B1.6 aplicado · suite IDOR en verde · U-01/02/03 = 0
[ ] RBAC               · multirol · jerarquía · probado con 4 roles reales
[ ] Database           · B1.2 · B1.3 · B1.4 · soft delete
[ ] APIs               · IDOR probado · rate limiting compartido
[ ] Billing            · conciliación · auditoría de plan · upgrade/downgrade probados
[ ] Email              · R-13 cerrado · emisor único confirmado
[ ] Cron               · versionados · sin secretos en claro · idempotentes
[ ] Edge Functions     · versionadas · con su secreto en variable de entorno
[ ] Sentry             · histórico purgado · retención definida
[ ] Backups            · automáticos · PITR · RPO/RTO · restore probado
[ ] Deploy             · producción reconstruible desde Git — verificado
[ ] Performance        · índices · rate limiting · límites de proveedor conocidos
[ ] Onboarding         · alta de clínica probada de punta a punta
[ ] Baja de tenant     · export completo · purga · retención
[ ] Piloto             · 2-3 clínicas reales, 30 días sin incidentes
[ ] Recuperación       · simulacro de incidente con RTO medido
```

---

## 20 · Resultado ejecutivo

### 1 · ¿Está listo para vender hoy?

**No.** No por una falla de seguridad activa —los fundamentos están sanos— sino porque **si algo sale mal no se puede reconstruir el sistema**, y porque **nunca operó con roles diferenciados**, que es exactamente lo que hace un cliente real.

### 2 · ¿Puede estar listo en menos de 3 meses?

**Sí.** Ninguna de las 6 condiciones P0 requiere rediseñar la arquitectura. Son trabajo de disciplina —versionar, respaldar, rotar, probar— más el modelo multirol, que ya está decidido y acotado.

**La base es sólida.** RLS en las 43 relaciones, integridad cross-tenant en cero con tres clínicas históricas, webhook de MP que no confía en el body, PII saneada en Sentry. Eso no se improvisa.

### 3 · Mayor riesgo

**No se puede reconstruir producción desde Git.** Y el baseline documentado cubre 23 de 35 tablas, así que **el procedimiento de restore que figura como probado ya no reconstruye el esquema actual**. Si el proyecto de Supabase se pierde o se corrompe, se pierden los datos de todas las clínicas.

### 4 · Segundo mayor riesgo

**El sistema nunca operó con roles diferenciados.** Todo el diseño de RBAC se hizo sobre una base donde los dos usuarios son `admin`. Cuando exista el primer `odontologo`, cuatro políticas RLS empiezan a denegar cosas que nadie probó jamás.

### 5 · Las primeras cinco cosas

1. **Rotar el secreto de R-14** — está expuesto ahora mismo
2. **Versionar los tres cambios de producción** y regenerar el baseline con las 35 tablas
3. **Verificar PITR y probar un restore completo** sobre el esquema actual
4. **Purgar Sentry y rotar los tokens de paciente filtrados**
5. **Cerrar la ventana y aplicar B1.6** con el protocolo congelado

### 6 · Qué NO tocaría todavía

- **La arquitectura navegador → Supabase directo.** Funciona, RLS la contiene, y rediseñarla ahora abriría más riesgo del que cierra.
- **`FORCE RLS`.** Efectos amplios, beneficio marginal mientras las funciones validen internamente.
- **P0-01** (`sync_turno_to_cita`). Solo `service_role`, no es un bypass de RBAC.
- **Funcionalidades comerciales nuevas.** Nada que no sea necesario para operar seguro.
- **Optimización de performance.** Con 1 clínica es prematuro; los riesgos ya están mapeados.

### 7 · Condición para el primer cliente pago

**Las 6 condiciones P0 cerradas**, y sobre todo estas tres:

- **Producción reconstruible desde Git**, verificado aplicando las migraciones sobre una base vacía
- **Restore probado** sobre el esquema actual, con RTO medido
- **El sistema operado con los 4 roles diferenciados** en un entorno de prueba, con los flujos completos ejercitados

Sin las tres, un cliente pago es un riesgo que no se puede justificar.

### 8 · Condición para pasar de 5 a 50 clínicas

- **Rate limiting en store compartido.** El actual es por instancia serverless: con volumen no frena nada
- **Índices por `tenant_id`** en las tablas que crecen
- **Baja de tenant y export completo** funcionando — con 50 clínicas, alguna se va
- **Conciliación automática con MercadoPago.** Con 5 se detecta a mano; con 50 no
- **Límites de Supabase, Resend y Sentry conocidos y monitoreados**
- **El acceso directo navegador → Supabase revisado** para el volumen de conexiones esperado

---

*Audit de diagnóstico. Nada implementado, ningún archivo de código modificado, ninguna migración creada, nada ejecutado contra producción. Toda afirmación sobre producción está respaldada por una medición registrada en `P0-05_BITACORA.md`; el resto está marcado como repositorio, inferencia o no verificado.*
