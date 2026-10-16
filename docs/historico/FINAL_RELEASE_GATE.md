# DentalDesk · Final Release Gate

**26/08/2026** · Evaluación independiente antes del primer cliente externo.

**Pregunta única:** ¿puede recibir datos reales de un tercero sin que mañana aparezca un fallo previsible?

---

# VEREDICTO

## 🔴 NO-GO — por un solo motivo, y no es de código

**No existe ningún mecanismo automático de recuperación.** Todo lo demás está verificado.

**Con backups activos y restore comprobado → GO.**

---

# 1 · Lo que esta evaluación encontró

**Cero hallazgos nuevos.**

No es una conclusión cómoda de escribir, así que la sostengo con el dato que la respalda: **este gate produjo 4 sospechas y las 4 fueron falsos positivos míos**, verificados leyendo el código.

| Sospecha del detector | Realidad |
|---|---|
| `consentimientos/firmar/[token]` sin autorización | **Falso.** Valida UUID, `.eq('token_firma', token)` — el token ES la credencial. Rate limit 10/min. Mi regex buscaba `.eq('token'` |
| `reserva/crear` sin acotar tenant | **Falso.** Resuelve el tenant desde un slug público y **todas** las consultas van `.eq('tenant_id', tenant.id)`. Rate limit 5/hora/IP |
| `horas-ocupadas` sin autorización | **Falso.** Exige `tenant_id`, valida formato UUID, filtra por él. Público por diseño — el flujo de reserva lo necesita |
| `reserva/[clinica]` sin autorización | **Falso.** Página pública de la clínica, acotada por slug |

**Sumados a los 6 falsos positivos de la evaluación anterior, son 10.** Esa proporción —10 falsos, 1 real, el webhook de `sync-sheet`— es la señal de que el rendimiento de seguir buscando cayó.

---

# 2 · Validación de las guardas · caso positivo ejecutado

Pediste no evaluar las guardas leyendo su regex. **Inyecté el defecto conocido en cada una.**

| Guarda | Defecto inyectado | Resultado |
|---|---|---|
| **G-1.1** RLS | `CREATE TABLE public.tabla_nueva_sin_rls` sin `ENABLE ROW LEVEL SECURITY` | 🟢 **LA DETECTA** |
| **G-2.1** REVOKE | `CREATE FUNCTION fn_peligrosa` SECURITY DEFINER sin REVOKE | 🟢 **LA DETECTA** |
| **G-2.2** `pg_temp` | La misma, con `search_path = public` sin `pg_temp` | 🟢 **LA DETECTA** |
| **G-5.1** GRANT a `anon` | `GRANT ALL ON TABLE "public"."pacientes" TO "anon"` en el baseline | 🟢 **LA DETECTA** — `remote_schema.sql:1953` |
| **G-5.4** `pg_temp` efectivo | Función nueva con `search_path = 'public'` | 🟢 **LA DETECTA** |
| **G-6.1** service_role en PDFs | — | 🟡 **Control positivo verificado**: reconoce `SERVICE_ROLE_KEY` en `equipo/miembros` |

**Las cinco guardas críticas están validadas con su caso positivo, no por inspección.**

⚠️ **Una corrección durante esta evaluación:** G-5.4 producía un **falso positivo** — reportaba 4 funciones ya corregidas en producción. Solo miraba `CREATE FUNCTION`, y esas se arreglaron con `ALTER FUNCTION`, que cambia la propiedad sin reescribir el `CREATE`.

**Es la limitación de fondo de toda guarda que lea archivos: ve declaraciones, no estado.** Corregida — ahora entiende `CREATE`, `ALTER` explícito y el `ALTER` dinámico de R-12.

---

# 3 · Matriz multi-tenant

| Superficie | Aislamiento | Evidencia | Prueba | Estado |
|---|---|---|---|---|
| **Tablas** | `tenant_id` en las 23 del baseline | `remote_schema.sql` | RLS 23/23 | 🟢 VERIFIED |
| **RLS activo** | 43 policies de pertenencia + 4 de rol | `pg_policies` producción | — | 🟢 VERIFIED |
| **SELECT A→B** | Bloqueado | `idor-dinamico.test.ts` | **12 tablas · PostgreSQL real** | 🟢 VERIFIED |
| **INSERT A→B** | Excepción | idem | **12 tablas** — `WITH CHECK` | 🟢 VERIFIED |
| **UPDATE A→B** | 0 filas · dato intacto | idem | **12 tablas** · verifica el dato, no solo el conteo | 🟢 VERIFIED |
| **DELETE A→B** | 0 filas · fila presente | idem | **12 tablas** | 🟢 VERIFIED |
| **UPDATE `tenant_id` A→B** | Excepción | idem | **12 tablas** — el caso que pediste explícitamente | 🟢 VERIFIED |
| **RPC / funciones** | 14 `SECURITY DEFINER`, todas con `pg_temp` | `pg_proc` producción | Bloque `DO` de R-12 | 🟢 VERIFIED |
| **`fn_*` fidelización** | `tiene_rol()` + pertenencia | `fidelizacion-roles.test.ts` | 28 tests, PostgreSQL real | 🟢 VERIFIED |
| **`service_role`** | 18 de 22 rutas verifican tenant o secreto | Inventario §4 | Lectura de las 22 | 🟢 VERIFIED |
| **API · sesión** | `tenant_users` filtrando por `tenant_id` pedido | 8 rutas administrativas | `guardas-api-tenant` | 🟢 VERIFIED |
| **Storage `fotos_clinicas`** | Privado · 4 policies por tenant | `pg_policies` producción | `db reset` + verificación | 🟢 VERIFIED |
| **Storage `logos`** | Público SELECT · escritura por tenant | idem | idem | 🟢 VERIFIED |
| **Vistas `bi_*`** | REVOKE de `anon` | `vistas-bi.test.ts` | 21 tests, PostgreSQL real | 🟢 VERIFIED |
| **Webhooks** | HMAC (MercadoPago) · svix (Resend) | `timingSafeEqual` | Lectura | 🟢 VERIFIED |
| **Cron** | `Bearer` + `timingSafeEqual` · falla cerrado | `cron-auth.ts` | 401 sin credencial, probado | 🟢 VERIFIED |
| **Google Sheets** | ~~Sin dimensión de tenant~~ | Trigger `tgenabled = 'D'` | SQL verificado | 🟢 **CERRADO 25/08** |

**No es "RLS existe".** Las cuatro operaciones se prueban A→B contra PostgreSQL real, con dos tenants y las políticas cargadas desde la migración de producción.

---

# 4 · `service_role` × identificador del usuario

La intersección que pediste mirar con lupa.

| Ruta | IDs del usuario | Autorización |
|---|---|---|
| `admin/tenants` | body | ✅ `tenant_users` |
| `billing/cancelar` | body | ✅ `tenant_users` |
| `clinicas` | body | ✅ `tenant_users` |
| `confirmar-turno` | body | ✅ `tenant_users` |
| `enlaces-turno` | body | ✅ `tenant_users` |
| `equipo/invitar` | body | ✅ `tenant_users` + validación de rol (R-2) |
| `equipo/miembros` | query+body | ✅ `tenant_users` |
| `recordatorios` | body | ✅ `tenant_users` |
| `registro` | body | ✅ `tenant_users` |
| `send-recordatorios` | body | ✅ `tenant_users` |
| `paciente/[token]` ×3 | path+body | 🔑 token UUID · `crypto.randomUUID()` |
| `consentimientos/firmar/[token]` | path+body | 🔑 `token_firma` UUID · rate limit 10/min |
| `reserva/crear` | body | 🔑 slug público → tenant resuelto en servidor |
| `reserva/[clinica]` · `horas-ocupadas` | path+query | 🌐 público por diseño · acotado por tenant |
| `crm-campanas` · `daily-briefing` | — | 🔐 `CRON_SECRET` |
| `sync-sheet` | body | 🔐 `SYNC_SHEET_SECRET` · **trigger desactivado** |
| `webhooks/mercadopago` | body | 🔐 HMAC-SHA256 + `timingSafeEqual` |
| `webhooks/resend` | — | 🔐 firma svix |

**Ninguna ruta con `service_role` acepta un identificador del usuario sin verificar pertenencia, token o firma.**

---

# 5 · Los cinco escenarios

## A · Confidencialidad — 🟢 VERIFIED

**¿Puede la clínica A leer datos de B?** No, en ninguna de las superficies probadas.

**Prueba:** 65 tests dinámicos, PostgreSQL real, 12 tablas incluyendo `pacientes`, `historial_dental`, `paciente_fotos`, `presupuestos`.

**Storage:** `fotos_clinicas` privado con aislamiento por tenant en las 4 operaciones. Las policies **ahora están versionadas** — hasta la semana pasada existían solo en producción, y cualquier entorno reconstruido las levantaba sin aislamiento. Ese era un hallazgo real y está cerrado.

## B · Integridad — 🟢 VERIFIED

**El caso que pediste explícitamente** —A mueve su fila al tenant B— **está probado en las 12 tablas** y lanza excepción. Es el más sutil: A no toca nada de B, empuja lo suyo hacia B. Sin `WITH CHECK` pasaría en silencio.

## C · Autorización — 🟢 VERIFIED · con una precisión

**Pertenencia al tenant:** verificada en las 8 rutas administrativas y las 43 policies.

**Privilegios administrativos:** `admin`/`owner` en 8 rutas + 4 policies. R-2 cerrado: un `admin` ya no puede invitar a nadie como `owner`.

**Privilegios clínicos: NO IMPLEMENTADO / POST-LAUNCH.**

`odontologo` y `staff` **no tienen ninguna restricción clínica**. Verían lo mismo que `admin` en historia clínica, odontograma y fotos.

**No es una vulnerabilidad del lanzamiento** porque esos roles no se anuncian ni se usan. **Pasa a serlo el día que se anuncien.**

## D · Disponibilidad — 🟡 MITIGATED / MONITOR

**Hubo una caída real el 24/08:** cinco minutos de 504 `MIDDLEWARE_INVOCATION_TIMEOUT`.

**Dos defectos corregidos y desplegados:** el middleware llamaba a Supabase Auth antes de mirar si la ruta era pública, y el matcher no excluía `sw.js`, `manifest.json` ni los iconos —**8 de 13 invocaciones eran archivos estáticos**—.

⚠️ **La causa raíz del pico no se demostró.** El log decía `No outgoing requests` y **234 MB**: se colgó antes de tocar la red. Se midió un arranque en frío real de **1,1 s** — significativo pero lejos de 25 s.

**MONITOR, no VERIFIED.** El mecanismo está mitigado; la magnitud observada no se reprodujo.

## E · Recuperabilidad — 🔴 BLOCKER

| Existe hoy | No existe |
|---|---|
| Dump manual con RTO **154 s** medido | Backup automático |
| Restore probado, 6 conteos idénticos | PITR |
| `ON_ERROR_STOP=1` — aborta ante fallo parcial | Retención |
| | **RPO — hoy es infinito por definición** |

**El restore manual NO es un backup.** Requiere que una persona se acuerde de correrlo. La diferencia no es técnica: un backup ocurre aunque nadie haga nada.

**212 pacientes reales sin recuperación automática.**

---

# 6 · R-18 · 🟡 MITIGATED / MONITOR

## Lo demostrado

**El mecanismo estaba en el repositorio.** `20260722120000_remote_schema.sql` contenía **30 `GRANT ... TO "anon"`** sobre tablas sensibles. Escrito con `CREATE TABLE IF NOT EXISTS` y `CREATE OR REPLACE VIEW`: **re-ejecutarlo no da error.**

**Neutralizado.** Y **G-5 validada con inyección**: reintroduje el GRANT y lo detectó.

**¿Puede el baseline volver a introducirlos?** No por sí solo. **Sí si alguien regenera el dump** con `supabase db dump` — G-5.3 vigila la nota de neutralización precisamente por eso.

## Lo que queda sin demostrar

**Qué invocación lo disparó** el 20/08 y el 22/08. La retención de logs del plan Free no llega al 19/08.

**¿Hay un mecanismo externo plausible?** Los 6 event triggers de Supabase se revisaron: **ninguno otorga a `anon`**. Pero no puedo descartar categóricamente un proceso de plataforma.

**Monitoreo N-1:** existe y está documentado. **Criterio de cierre: cuatro semanas consecutivas en cero.**

**No CLOSED.** El mecanismo conocido está neutralizado; la causa histórica no es demostrable.

---

# 7 · Storage

| | `fotos_clinicas` | `logos` |
|---|---|---|
| Público | **No** | Sí (por diseño) |
| SELECT | `{authenticated}` + tenant | `{public}` — el portal lo necesita |
| INSERT | `{authenticated}` + tenant | `{authenticated}` + prefijo de tenant |
| UPDATE | `{authenticated}` + tenant | idem, con `USING` **y** `WITH CHECK` |
| DELETE | `{authenticated}` + tenant | `{authenticated}` + prefijo |
| MIME | jpeg, png, webp | idem — **SVG excluido a propósito** |
| Tamaño | 10 MB | 5 MB |
| **Estado** | 🟢 VERIFIED | 🟢 VERIFIED |

**Verificado con `db reset` sobre base limpia y contra `pg_policies` de producción** — 8 policies, no por inspección visual.

**Path traversal:** las rutas de fotos son `<tenant_id>/<paciente_id>/<archivo>` y la policy compara `(storage.foldername(name))[1]` contra los tenants del usuario. Un `../` no cambia el primer segmento.

**`anon` sobre `storage.objects`:** ⚪ **ACCEPTED · no accionable.** El ACL dice `anon=arwdDxtm/supabase_storage_admin` — solo el otorgante puede revocar, y `postgres` no puede asumir ese rol (`permission denied to set role`). **Es cómo Supabase entrega todos sus proyectos.** Mitigado porque `storage` no está expuesto en PostgREST (HTTP 406, verificado).

---

# 8 · Tabla final

| Riesgo | Estado | Evidencia |
|---|---|---|
| Confidencialidad A→B | 🟢 VERIFIED | 65 tests · PostgreSQL real |
| Integridad · UPDATE `tenant_id` | 🟢 VERIFIED | 12 tablas · excepción |
| Autorización administrativa | 🟢 VERIFIED | 8 rutas + 4 policies + R-2 |
| Autorización clínica por rol | ⚪ NO IMPLEMENTADO | 43/47 de pertenencia · no se anuncia |
| `service_role` × ID de usuario | 🟢 VERIFIED | 22 rutas revisadas · ninguna sin control |
| Storage | 🟢 VERIFIED | 8 policies · `db reset` + producción |
| Privilegios SQL | 🟢 VERIFIED | `anon` solo `tenants_public` |
| Guardas G-1/G-2/G-5/G-6 | 🟢 VERIFIED | **Caso positivo ejecutado en las 5** |
| R-18 | 🟡 MITIGATED | Mecanismo neutralizado · causa no demostrable |
| Disponibilidad | 🟡 MONITOR | 2 defectos corregidos · causa raíz sin demostrar |
| Sentry histórico | 🟠 PENDING | PII previa a P0-06 |
| Planilla de Google histórica | 🟠 PENDING | Trigger apagado · datos ya escritos |
| Acceso de mantenimiento sin declarar | 🟠 PENDING | Decisión tomada, falta el texto |
| **Recuperabilidad** | 🔴 **BLOCKER** | **No existe backup automático** |

---

# 9 · Para pasar a GO

| | Acción | Costo |
|---|---|---|
| 1 | **Supabase Pro + PITR** | **25 USD/mes** |
| 2 | **Restore probado, 6 conteos idénticos** | 30 min |
| 3 | Purgar Sentry histórico | 15 min |
| 4 | Borrar la planilla de Google | 5 min |
| 5 | Declarar el acceso de mantenimiento | 10 min |

**Solo el punto 1 cuesta dinero.** El 2 es la frontera: no es activar Pro lo que habilita recibir datos de terceros, es **haber restaurado y comprobado que volvieron completos**.

---

# 10 · Lo que no debe afirmarse

🚫 **"Permisos diferenciados por odontólogo / administrador / secretaría"** — 43 de 47 policies son de pertenencia. Una secretaria ve la misma historia clínica que el titular.

🚫 **"Backup automático"** hasta completar el punto 2.

🚫 **"Cifrado de extremo a extremo"** — es TLS en tránsito. E2E significa que el servidor no puede leer los datos, y el tuyo los lee.

🚫 **"Exportación completa de la historia clínica"** — el export incluye pacientes, turnos y facturas. **Omite odontograma, fotos, consentimientos y pagos.**

🚫 **"Eliminación de datos en 30 días tras la baja"** — no existe mecanismo de baja de tenant. **Está en la política actual y no se puede cumplir.**

✅ **Sí puede afirmarse, con evidencia:**

- *"Los datos de cada clínica están aislados de los de las demás"* — 65 tests dinámicos
- *"Las fotos clínicas se guardan en un bucket privado con aislamiento por clínica"* — verificado en producción
- *"Los consentimientos registran hash SHA-256 e IP de firma"* — verificado en el código
- *"Los enlaces de paciente usan identificadores de alta entropía"* — UUID v4 y 60 bits en los códigos cortos

---

# Conclusión

**El sistema está técnicamente listo salvo recuperabilidad.**

Esta evaluación no encontró ningún riesgo nuevo real. Las cuatro sospechas que generó resultaron falsos positivos, verificados leyendo el código.

**Eso no significa que el sistema sea perfecto.** Significa que los métodos disponibles —lectura del código, tests dinámicos contra PostgreSQL real, consultas a producción, validación de guardas con inyección— ya no producen señal.

**Lo que sigue no es más auditoría: son 25 dólares y un restore verificado.**
