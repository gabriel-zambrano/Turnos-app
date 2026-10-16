# Auditoría profunda — DentalDesk

**Fecha:** 7 de agosto de 2026
**Alcance:** código real del repositorio, sin modificaciones.
**Método:** lectura del flujo de ejecución (middleware → ruta → cliente Supabase → policy RLS → función/trigger). Cada hallazgo cita archivo y línea.
**Base analizada:** 132 archivos TS/TSX, 27.524 líneas en `src/`; 17 migraciones en `supabase/migrations/` + 20 archivos `supabase_migration_*.sql` en la raíz.

**Convención usada en todo el informe:**

- **HECHO** — verificado leyendo el código.
- **HIPÓTESIS** — deducción razonada que depende de datos o configuración que no están en el repo.
- **NO VERIFICADO** — no se puede determinar sin acceso a la base o al panel de Vercel/Supabase.

---

## 1. Mapa del sistema

### Estructura

```
src/
├── middleware.ts              única barrera global (redirect a /login)
├── app/
│   ├── (32 rutas de página)   42 archivos con 'use client'
│   ├── api/ (38 route.ts)     toda la lógica servidor
│   └── actions/fidelizacion.ts  ÚNICA server action del proyecto
├── components/ (19)           Sidebar, TenantContext, modales
└── lib/ (20 módulos + 18 .test.ts)
```

### Flujo de autenticación

1. `src/middleware.ts` corre en **todas** las rutas salvo `_next/static`, `_next/image`, `favicon.ico`.
2. Redirige `www.*` → apex con 308 (`middleware.ts:17-22`).
3. Llama `updateSession()` (`src/lib/supabase/middleware.ts`) que crea un `createServerClient` de `@supabase/ssr`, ejecuta `auth.getUser()` — que revalida el JWT contra el servidor de Supabase, no solo lo decodifica — y reescribe las cookies refrescadas en la respuesta.
4. Si la ruta **no** es pública y no hay `user` → redirect a `/login`.

La lista de rutas públicas vive en `src/lib/rutas-publicas.ts` y es única para el middleware y para el gate de suscripción. La función `coincide()` compara por segmento completo, lo que corrige un bug real documentado en el propio archivo (el prefijo `/paciente` matcheaba `/pacientes`).

### Flujo de autorización

No hay una capa de autorización unificada. Conviven tres mecanismos:

| Mecanismo | Dónde | Qué protege |
|---|---|---|
| RLS por `tenant_id` | Postgres | Todo acceso con el cliente de cookies (anon key + JWT del usuario) |
| Chequeo manual `tenant_users` | 21 de 38 API routes | Rutas que usan `service_role` |
| `esAdminDePlataforma()` | `src/lib/admin.ts` | Solo `/api/admin/*` |

### Resolución del tenant

**No hay resolución de tenant server-side.** El middleware la eliminó explícitamente (`middleware.ts:36-38`: *"el resultado (header x-tenant-id) no lo leía nadie"*). El tenant se resuelve **en el cliente**, en `src/components/TenantContext.tsx`, por hostname, y el `tenantId` viaja al backend **en el body de cada request**, donde cada ruta lo revalida contra `tenant_users`. Es un patrón defendible (el backend nunca confía en el valor), pero implica que **cada ruta nueva debe acordarse de revalidar**.

### Acceso a Supabase — tres clientes distintos

| Cliente | Archivo | Clave | RLS |
|---|---|---|---|
| Browser (singleton) | `src/lib/supabase/client.ts` | anon | **Sí** |
| Server (cookies) | `src/lib/supabase/server.ts` | anon + JWT | **Sí** |
| Admin | `createClient(url, SERVICE_ROLE_KEY)` inline en 15 rutas | service_role | **No — bypass total** |

El singleton de browser está bien resuelto: no cachea cuando `typeof window === 'undefined'`, evitando compartir estado entre requests SSR.

### Server / Client Components

**42 archivos con `'use client'`.** Prácticamente toda página con datos es un Client Component que consulta Supabase directamente desde el navegador. Las únicas excepciones con lógica servidor son `/t/[codigo]/page.tsx` (server component + server action inline) y `src/app/actions/fidelizacion.ts`.

### Integraciones externas

| Servicio | Credencial | Aislamiento por tenant |
|---|---|---|
| MercadoPago | `MERCADOPAGO_ACCESS_TOKEN` (plataforma) | Vía `external_reference` = `<tenantId>\|<plan>` |
| ARCA/AFIP | `ARCA_CERT` + `ARCA_PRIVATE_KEY` (plataforma) | Delegación: CUIT emisor sale de `arca_config.cuit` |
| Resend | `RESEND_API_KEY` (plataforma) | Dominio único, nombre de clínica como display name |
| Google Sheets | `GOOGLE_SHEET_ID` (**una sola planilla global**) | **Ninguno** — ver C6 |
| Sentry | DSN hardcodeado | Ninguno |
| WhatsApp Cloud | `WHATSAPP_TOKEN` (plataforma) | Por plantilla |

---

# A. RESUMEN EJECUTIVO — los 10 problemas más importantes

| # | Problema | Severidad |
|---|---|---|
| 1 | Trigger `SECURITY DEFINER` que busca pacientes por email **sin filtrar por tenant** y crea filas con `tenant_id` NULL | P0 |
| 2 | Sentry con `sendDefaultPii: true` + `tracesSampleRate: 1` → tokens del portal de pacientes y PII clínica salen a un tercero | P0 |
| 3 | Los tokens del portal de paciente **nunca expiran**: la columna existe pero jamás se escribe | P0 |
| 4 | Factura autorizada por ARCA + fallo al persistir = **factura huérfana** sin registro local ni reintento | P0 |
| 5 | **Ningún rol tiene restricciones a nivel base de datos**: `staff` lee y escribe toda la historia clínica igual que el `owner` | P0 |
| 6 | Sincronización a Google Sheets **global**: una sola planilla para todas las clínicas (hoy rota, pero el diseño está) | P0 |
| 7 | Numeración de comprobantes ARCA sin lock → emisión concurrente pierde comprobantes ya autorizados | P1 |
| 8 | `/api/` excluido del middleware: toda ruta nueva nace sin protección por defecto | P1 |
| 9 | Cero paginación y 35 `select('*')`: la ficha de paciente dispara 7 queries `*` y el listado carga la clínica entera al navegador | P1 |
| 10 | El test de aislamiento RLS lee un `.sql` de la raíz que **no es** la fuente de verdad del esquema desplegado | P1 |

---

# B. CRÍTICOS

---

## C1 · Trigger `SECURITY DEFINER` sin `tenant_id` — corrupción y cruce entre clínicas

**Problema.** La función `sync_turno_to_cita()` empareja pacientes **solo por email**, sin filtrar por clínica, y crea `pacientes` y `citas` **sin `tenant_id`**.

**Evidencia — HECHO.** `supabase/migrations/20260722120000_remote_schema.sql:419-465`:

```sql
CREATE OR REPLACE FUNCTION "public"."sync_turno_to_cita"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
...
  SELECT id INTO v_paciente_id
  FROM pacientes
  WHERE email = NEW.email          -- ← sin tenant_id
  LIMIT 1;

  IF v_paciente_id IS NULL THEN
    INSERT INTO pacientes (nombre, email, telefono)   -- ← sin tenant_id
    VALUES (v_nombre_completo, NEW.email, NEW.telefono)
    RETURNING id INTO v_paciente_id;
  END IF;

  INSERT INTO citas (paciente_id, fecha_hora, tipo_tratamiento, ...)  -- ← sin tenant_id
```

Trigger activo en `remote_schema.sql:1201`:
```sql
CREATE OR REPLACE TRIGGER "trigger_turno_to_cita" AFTER INSERT ON "public"."turnos"
  FOR EACH ROW EXECUTE FUNCTION "public"."sync_turno_to_cita"();
```

**Causa.** Función heredada de la etapa mono-tenant, nunca actualizada al modelo multi-tenant. Ninguna migración posterior la elimina (verificado con `grep DROP TRIGGER` sobre las 37 migraciones).

**Impacto.**
1. Si Clínica A inserta un turno con `email = juan@x.com` y ese email ya existe en Clínica B, la cita se **adjunta al paciente de la Clínica B**.
2. Los pacientes y citas creados quedan con `tenant_id` NULL → invisibles a toda policy RLS (`tenant_id IN (...)` con NULL nunca matchea) → datos huérfanos, no facturables, no auditables.
3. Combinado con C7, un paciente huérfano que abre su portal ve el branding de otra clínica.

**Riesgo.** Fuga de datos clínicos entre tenants + corrupción silenciosa.

**Atenuante — HECHO.** `grep "from('turnos')"` sobre `src/` no devuelve **ninguna** escritura desde la aplicación. El trigger está latente.
**NO VERIFICADO.** Si algún formulario externo, integración legacy o carga manual sigue escribiendo en `public.turnos`. Hay que consultar `SELECT count(*), max(created_at) FROM turnos` en producción antes de decidir.

**Solución recomendada.** Confirmar que `turnos` está muerta y eliminar trigger + función. Si sigue viva, agregar `tenant_id` a `turnos` y propagarlo en ambos INSERT + filtrar el SELECT por tenant.
**Esfuerzo:** 2 h (+1 h de verificación en prod). **Prioridad: P0.**

---

## C2 · Sentry filtra tokens de pacientes y PII clínica a un tercero

**Problema.** Los tres archivos de configuración de Sentry activan simultáneamente el envío de PII, el muestreo del 100 % de trazas y el envío de logs.

**Evidencia — HECHO.** `sentry.server.config.ts`, `sentry.edge.config.ts` y `src/instrumentation-client.ts` contienen los tres, idénticos:

```ts
tracesSampleRate: 1,
enableLogs: true,
sendDefaultPii: true,
```

**Causa.** Configuración generada por el wizard de Sentry y dejada tal cual.

**Impacto.** `sendDefaultPii: true` hace que Sentry capture IP, headers de request y cookies. `tracesSampleRate: 1` significa que **cada** request genera una traza con su URL. Las URLs del producto incluyen el secreto en el path:

- `/paciente/<token>` y `/api/paciente/<token>` — token que abre la historia clínica completa
- `/firmar/<token>` — token que permite firmar un consentimiento
- `/t/<codigo>` — código del turno
- `/api/send-recordatorios?token=<CRON_SECRET>` (ver I4)

Es decir: **todos los tokens de acceso público del sistema quedan almacenados en Sentry**, junto con la IP del paciente. Además, `src/app/layout.tsx:29` inyecta `Sentry.getTraceData()` en el `<head>` de todas las páginas.

**Riesgo.** Cualquiera con acceso al proyecto de Sentry —o un incidente en Sentry— obtiene acceso permanente (por C3) a historias clínicas. Para datos de salud en Argentina esto entra de lleno en el ámbito de la Ley 25.326 y de la Ley 26.529 (historia clínica).

**Solución recomendada.** `sendDefaultPii: false`; `tracesSampleRate` ≈ 0.1 en producción; `beforeSend`/`beforeSendTransaction` que redacte el segmento de token de la URL. Complementariamente, mover el token de la ruta al `Authorization` header o a una cookie de sesión corta.
**Esfuerzo:** 3 h. **Prioridad: P0.**

---

## C3 · Los tokens del portal de paciente nunca expiran

**Problema.** La expiración está implementada en el código de lectura pero **nunca se escribe** el valor.

**Evidencia — HECHO.**

Se lee (`src/app/api/paciente/[token]/route.ts:66-69`):
```ts
if (pac.token_expira && new Date(pac.token_expira).getTime() < Date.now()) {
  return NextResponse.json({ error: 'Este enlace ha expirado...' }, { status: 410 })
}
```

Nunca se escribe: `grep -rn "token_expira" src/ | grep -iE "update|set|insert"` → **0 resultados**.

La migración lo declara explícitamente (`supabase_migration_security_fix.sql:48-58`):
```sql
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS token_expira TIMESTAMP WITH TIME ZONE;
-- IMPORTANTE (sistema en producción): NO expiramos los tokens existentes.
-- El portal trata token_expira NULL como "válido para siempre".
-- No se aplica ninguna expiración automática.
```

Y los tokens se generan siempre sin expiración: `src/app/pacientes/page.tsx:99,209,249`, `src/app/dashboard/page.tsx:93`, `src/app/api/reserva/crear/route.ts:145`, `src/app/api/pacientes/importar/route.ts:105`, `src/app/agenda/page.tsx:1603`, `src/components/NuevaCitaModal.tsx:183` — todos `crypto.randomUUID()` sin `token_expira`.

**Lo que el token abre — HECHO** (`/api/paciente/[token]/route.ts`): nombre, teléfono, **alergias**, **antecedentes**, historial dental completo, turnos pasados y futuros, **fotos clínicas** (URLs firmadas), saldo de puntos, recomendaciones.

**Entropía — correcta.** `crypto.randomUUID()` = UUIDv4, 122 bits. La enumeración es inviable. El problema no es la fuerza bruta sino la **permanencia**.

**Impacto.** El link viaja por WhatsApp y email. Queda en el historial del navegador, en la caché del WebView de WhatsApp, en cualquier reenvío, y —por C2— en Sentry. Un token filtrado **una vez** da acceso **para siempre** a la historia clínica de esa persona. Revocarlo requiere que alguien del consultorio entre a `/pacientes` y apriete "Generar link" para ese paciente específico; no hay revocación masiva ni rotación automática.

**Riesgo.** Exposición permanente de datos de salud.

**Solución recomendada.** Setear `token_expira = now() + interval '30 days'` en cada generación y renovar el token en cada recordatorio enviado (el envío ya toca la fila). Agregar acción de "revocar todos los links" a nivel clínica.
**Esfuerzo:** 4 h. **Prioridad: P0.**

---

## C4 · Factura autorizada por ARCA que se pierde localmente

**Problema.** Entre obtener el CAE de ARCA y persistirlo hay una ventana en la que un fallo deja el comprobante **autorizado ante el fisco y sin ningún registro en el sistema**.

**Evidencia — HECHO.** `src/app/api/facturacion/emitir/route.ts`:

```ts
366:  const arcaRes = await afip.ElectronicBilling.createVoucher(invoiceData)  // ← CAE emitido, irreversible
      cae = arcaRes.CAE
...
384:  const { data: factura, error: insertError } = await supabase
385:    .rpc('emitir_factura_con_detalle', {...})

406:  if (insertError) {
407:    // 23505 = violación del índice único de numeración (emisión concurrente)
408:    if ((insertError as any).code === '23505') {
409:      return NextResponse.json({ error: 'Otra factura se emitió al mismo tiempo...' }, { status: 409 })
410:    }
411:    const prefijo = esSimulada
412:      ? 'Error al registrar factura'
413:      : `Factura autorizada por ARCA (CAE: ${cae}) pero falló el registro local`
414:    return NextResponse.json({ error: `${prefijo}: ${insertError.message}` }, { status: 500 })
415:  }
```

El CAE se devuelve **en el texto de un mensaje de error HTTP**. No se persiste en ninguna tabla, no hay cola de reintentos, no hay tabla de comprobantes pendientes de conciliación.

**Nota sobre el `23505`.** Es aún peor que el caso genérico: llega **después** de que ARCA autorizó el comprobante. El mensaje al usuario dice "reintentá en unos segundos", pero el número ya fue consumido en ARCA y el reintento generará un **segundo** comprobante fiscal. El primero queda emitido ante el fisco y ausente del sistema.

**Causa.** El diseño asume que la operación local no falla. La transacción con el fisco no es reversible ni compensable, así que la única defensa posible es persistir **antes** de llamar a ARCA.

**Impacto.** Diferencia entre el libro IVA ventas de la clínica y lo declarado en ARCA. Es un error fiscal, no un bug de UI: implica ajuste manual con el contador y potencialmente una nota de crédito.

**Riesgo.** Inconsistencia fiscal. En una clínica que factura decenas de comprobantes por día, un timeout de red basta.

**Solución recomendada.** Patrón outbox en dos fases: (1) INSERT de la factura en estado `pendiente_cae` con el número reservado, (2) llamada a ARCA, (3) UPDATE a `emitida` con el CAE. Si el paso 3 falla, la fila queda como `pendiente_cae` y un job de conciliación consulta `getVoucherInfo` en ARCA para completarla. **Nota:** hoy `facturas` no tiene policy de UPDATE (`supabase/migrations/20260723180351_arca.sql:97-101`, solo SELECT e INSERT), así que este cambio requiere una función `SECURITY DEFINER` para el paso 3.
**Esfuerzo:** 2-3 días. **Prioridad: P0.**

---

## C5 · No existe separación de roles a nivel base de datos

**Problema.** El sistema define tres roles (`owner`, `admin`, `staff`) y los muestra en la UI, pero **ninguna policy RLS de las tablas clínicas y financieras verifica el rol**. Cualquier miembro del tenant tiene los mismos permisos que el dueño.

**Evidencia — HECHO.** Todas las policies `tenant_isolation_*` filtran únicamente por `tenant_id`. `supabase/migrations/20260722120000_remote_schema.sql:1436-1570` y `supabase_migration_perf_2_rls.sql`:

```sql
CREATE POLICY tenant_isolation_pacientes ON pacientes FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));
```

No hay `AND role IN (...)`. Las tablas afectadas son: `citas`, `pacientes`, `bloqueos`, `tratamientos`, `historial_dental`, `historial_puntos`, `paciente_fotos`, `presupuestos`, `ingresos_manuales`, `egresos_manuales`, `costos_fijos`, `meta_mensual`, `config_fidelizacion`, `premios`, `perfil_doctor`, `logs_envios`, `recordatorios_log`, `whatsapp_contactos`, `tratamiento_items`, `pagos`.

Sí verifican rol (las excepciones): `arca_config` (`arca.sql:82-91`), `plantillas_consentimiento` (`consentimientos.sql:51-53`), `crm_campanas` (`crm_automatizacion.sql:41-43`), y `tenants` para UPDATE.

Consecuencia concreta: la UI en `src/app/equipo/page.tsx:154` etiqueta el rol como *"Staff (Secretaria)"*, pero esa secretaria puede leer y **modificar** alergias, antecedentes, historial dental y fotos clínicas de todos los pacientes, y editar ingresos, egresos y costos fijos — directamente desde el cliente Supabase del navegador, sin pasar por ninguna pantalla.

**Inconsistencia adicional en la capa API — HECHO.** Los chequeos de rol en las rutas son arbitrarios:

| Ruta | Chequeo |
|---|---|
| `/api/facturacion/emitir` | solo membresía (`route.ts:72-80`) — **cualquier staff emite comprobantes fiscales** |
| `/api/facturacion/anular` | `admin`/`owner` (`route.ts:41-43`) |
| `/api/facturacion/config` POST | `admin`/`owner` (`route.ts:95-97`) |
| `/api/pacientes/exportar` | `admin`/`owner` (`route.ts:19-21`) |
| `/api/pacientes/importar` | solo membresía (`route.ts:45-46`) |
| `/api/consentimientos` POST | solo membresía (`route.ts:62-63`) |
| `/api/billing/cancelar` | `owner`/`admin` (`route.ts:40-43`) |

Emitir una factura electrónica —acto con consecuencia fiscal— es más laxo que anularla o que exportar el listado de pacientes.

**Causa.** El modelo de roles se agregó a `tenant_users` (`remote_schema.sql:865`, `role text DEFAULT 'admin' NOT NULL`, sin CHECK constraint) pero nunca se propagó al modelo de permisos.

**Impacto.** No hay principio de mínimo privilegio. Una clínica con recepcionista, higienista y varios odontólogos no puede segmentar el acceso a la historia clínica — que es exactamente lo que la normativa de datos de salud espera.

**Riesgo.** Acceso no autorizado dentro del tenant; imposibilidad de auditar quién puede ver qué.

**Solución recomendada.** Definir la matriz de permisos por rol, agregar `CHECK (role IN ('owner','admin','staff'))`, y añadir la condición de rol a las policies de las tablas sensibles (empezando por `historial_dental`, `paciente_fotos`, `ingresos_manuales`, `egresos_manuales`, `costos_fijos`). Unificar el chequeo de rol en las API en un helper único.
**Esfuerzo:** 1 semana (requiere decisión de producto sobre la matriz). **Prioridad: P0.**

---

## C6 · Google Sheets: una sola planilla global para todas las clínicas

**Problema.** La sincronización de turnos escribe datos de pacientes de **todos los tenants** en **una única** planilla de Google, identificada por una env var global.

**Evidencia — HECHO.** `src/app/api/sync-sheet/route.ts`:
```ts
const auth = new google.auth.GoogleAuth({
  credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, ... },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
...
await sheets.spreadsheets.values.append({
  spreadsheetId: process.env.GOOGLE_SHEET_ID,   // ← una sola, global
  range: "Turnos!A:I",
  requestBody: { values: [[ nombre, email, telefono, record.tipo_tratamiento,
                            fecha, hora, record.estado, record.notas, record.id ]] },
});
```

No hay ninguna lectura de `tenant_id` en todo el archivo. El campo `record.notas` son las **notas internas del profesional** sobre la consulta.

Y el trigger dispara para todos los tenants (`remote_schema.sql:1197`):
```sql
CREATE OR REPLACE TRIGGER "sync_turnos_to_sheets" AFTER INSERT OR UPDATE ON "public"."citas"
  FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"(
    'https://turnos-app-delta.vercel.app/api/sync-sheet', 'POST',
    '{"Content-type":"application/json"}', '{}', '5000');
```

**Hallazgo secundario — HECHO.** El trigger envía únicamente el header `Content-type`. El endpoint exige `Authorization: Bearer <SYNC_SHEET_SECRET>` (`sync-sheet/route.ts:19-22`). Por lo tanto **todas las invocaciones del trigger reciben 401 y la sincronización no funciona**. El diseño falla cerrado, lo cual es la suerte que evitó la fuga.

Efecto adicional: cada INSERT/UPDATE en `citas` de cualquier clínica genera una llamada HTTP sincrónica con timeout de 5 s hacia un endpoint que responde 401. Es latencia añadida a cada operación de agenda.

**Riesgo.** Si alguien "arregla" el trigger agregando el header, se activa una fuga cross-tenant de PII y notas clínicas hacia una planilla compartida.

**Solución recomendada.** Decidir: si la feature no se usa, eliminar trigger y ruta. Si se usa, mover `spreadsheetId` a una columna de `tenants` y que cada clínica conecte su propia planilla vía OAuth (hoy no hay flujo OAuth de Google en el proyecto — el único uso es una service account de plataforma).
**Esfuerzo:** 1 h para eliminar; 3-4 días para hacerlo por tenant. **Prioridad: P0.**

---

## C7 · Fallbacks a un tenant por defecto

**Problema.** Cuando falta el `tenant_id`, tres rutas caen a un tenant por defecto en lugar de fallar.

**Evidencia — HECHO.**
```
src/app/api/paciente/[token]/route.ts:71   const tid = pac.tenant_id || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || ''
src/app/api/confirmar-turno/route.ts:42    const tid = tenantId || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || ''
src/app/api/recordatorios/route.ts:42      const tid = tenantId || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || ''
src/app/api/send-recordatorios/route.ts:11 const DEFAULT_TENANT_ID = '2845c423-affa-4ca2-9c5f-f4ec8e35701a'
src/app/api/send-recordatorios/route.ts:88 tenantsToProcess = [{ id: DEFAULT_TENANT_ID, nombre: '' }]
```

El UUID en `send-recordatorios/route.ts:11` es un identificador de producción **hardcodeado en el código fuente**.

**Causa.** Herencia de la etapa mono-tenant.

**Impacto.** Un paciente huérfano (creado por C1, con `tenant_id` NULL) que abra su portal verá el nombre, dirección, teléfono, logo y colores de **otra clínica**. Y `send-recordatorios` puede terminar enviando emails en nombre de esa clínica hardcodeada.

**Riesgo.** Cruce de identidad entre clínicas; envío de comunicaciones en nombre de un tercero.

**Solución recomendada.** Eliminar los fallbacks: sin `tenant_id` resuelto, devolver 404. Es la semántica correcta y expone los datos huérfanos en lugar de disimularlos.
**Esfuerzo:** 2 h. **Prioridad: P0.**

---

## C8 · Numeración ARCA sin control de concurrencia

**Problema.** El número de comprobante se obtiene de ARCA y se incrementa en memoria, sin ningún lock.

**Evidencia — HECHO.** `src/app/api/facturacion/emitir/route.ts:309-310`:
```ts
const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, cbteTipo)
nroComprobante = Number(lastVoucher) + 1
```
Y en modo simulación (`route.ts:~290`), el máximo local + 1, también sin lock.

Existe un índice único que actúa como red (`arca.sql:63-66`):
```sql
CREATE UNIQUE INDEX facturas_numeracion_unica
    ON facturas (tenant_id, punto_venta, tipo_comprobante, nro_comprobante)
    WHERE estado = 'emitida' AND simulada = false;
```

**Causa.** El índice protege la **integridad local**, pero se evalúa recién en el paso 7, después de que ARCA ya autorizó en el paso 6.

**Impacto.** Dos emisiones simultáneas (dos recepcionistas cobrando a la vez) leen el mismo `lastVoucher`. Ambas llaman a `createVoucher`. ARCA puede rechazar la segunda por número duplicado, o autorizarla si el primer request aún no impactó. Si autoriza ambas, la segunda revienta contra el índice único local y se pierde — cae en el escenario de C4.

**Riesgo.** Salto o duplicación de numeración fiscal.

**Solución recomendada.** Reservar el número con `SELECT ... FOR UPDATE` sobre una fila de secuencia por `(tenant_id, punto_venta, tipo_comprobante)`, o serializar la emisión por tenant con un advisory lock de Postgres. Se resuelve junto con C4.
**Esfuerzo:** incluido en C4. **Prioridad: P1.**

---

## C9 · El paciente puede cambiar el estado de citas pasadas

**Problema.** El endpoint público de cambio de estado no valida ni la fecha de la cita ni el estado actual.

**Evidencia — HECHO.** `src/app/api/paciente/[token]/estado/route.ts:45-56`:
```ts
const { data: cita } = await supabaseAdmin
  .from('citas').select('id').eq('id', citaId).eq('paciente_id', pac.id).single()
if (!cita) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })

await supabaseAdmin.from('citas').update({ estado }).eq('id', citaId).eq('paciente_id', pac.id)
```

No hay `.gte('fecha_hora', now)` ni verificación del estado previo. `ESTADOS_VALIDOS = ['confirmado','cancelado']`.

**Lo que está bien:** el filtro `.eq('paciente_id', pac.id)` sí impide tocar citas de otro paciente. No hay acceso cruzado.

**Impacto.** Una cita ya marcada como `asistio` —que ya otorgó puntos de fidelización vía `fn_aprobar_asistencia`, que puede tener pagos registrados y una factura emitida— puede pasarse a `cancelado` desde el portal del paciente. Los reportes de `/finanzas` y `/bi` filtran por estado; la factura queda emitida contra una cita cancelada.

**Riesgo.** Corrupción del estado financiero; descuadre entre facturación y agenda.

**Solución recomendada.** Permitir la transición únicamente si `fecha_hora > now()` y `estado IN ('pendiente','confirmado')`.
**Esfuerzo:** 1 h. **Prioridad: P1.**

---

# C. IMPORTANTES

---

## I1 · `/api/` está excluido del middleware

**Evidencia — HECHO.** `src/lib/rutas-publicas.ts:33-39`:
```ts
export const RUTAS_DE_SISTEMA = [
  '/_next/', '/favicon', '/manifest.json', '/sw.js', '/offline.html', '/icons/',
  '/api/',        // ← toda la API
] as const
```
Y `esRutaPublica()` devuelve `true` para cualquier path que empiece con `/api/`.

**Estado actual — HECHO.** Se revisaron las 38 rutas. Todas las que exponen datos privados verifican sesión y pertenencia al tenant. Las públicas por diseño (`/api/ics`, `/api/horas-ocupadas`, `/api/reserva/*`, `/api/paciente/[token]/*`, `/api/consentimientos/firmar/[token]`) tienen rate limit. **No se encontró ninguna ruta desprotegida hoy.**

**Riesgo.** Es un problema de diseño, no de estado. El modelo es *deny by default* en las páginas y *allow by default* en la API. Cualquier `route.ts` nuevo nace público hasta que alguien recuerde agregar el chequeo. Con 38 rutas y 21 patrones de verificación copiados a mano, la probabilidad de omisión crece con cada feature.

**Solución recomendada.** Invertir el default: lista explícita de rutas API públicas y verificación de sesión en el middleware para el resto. Alternativamente, un `withAuth(handler)` obligatorio + un test que falle si un `route.ts` no lo usa (el patrón ya existe en `guardas-multitenant.test.ts`).
**Esfuerzo:** 1 día. **Prioridad: P1.**

---

## I2 · Rate limiting en memoria por instancia

**Evidencia — HECHO.** `src/lib/rate-limit.ts:14` — `const store = new Map<string, Bucket>()`. El propio archivo documenta la limitación.

**Impacto real, endpoint por endpoint:**

| Endpoint | Límite | ¿Sirve? |
|---|---|---|
| `/api/paciente/[token]` | 30/min | **Irrelevante** — 122 bits de entropía hacen la enumeración imposible con o sin límite |
| `/api/reserva/crear` | 5/hora | **Comprometido** — es la única defensa contra el llenado malicioso de la agenda, y se multiplica por el número de lambdas |
| `/api/consentimientos/firmar` POST | 10/min | Protege poco: el token ya es el control de acceso |

El caso que importa es `/api/reserva/crear`. Con N instancias activas el límite efectivo es 5×N por hora, y cada cold start resetea el Map. Rotando IP el bypass es trivial.

**Solución recomendada.** Mover el rate limiting de `/api/reserva/crear` a la base (contar reservas por IP/teléfono en `citas` de la última hora) o a Vercel KV / Upstash. La interfaz de `rate-limit.ts` ya está pensada para ese reemplazo.
**Esfuerzo:** 4 h. **Prioridad: P1.**

---

## I3 · `CRON_SECRET` viaja en la query string

**Evidencia — HECHO.** `src/app/api/cron/route.ts:31-33`:
```ts
const res = await fetch(`${base}/api/send-recordatorios?token=${secret}`, { method: 'POST' })
```
Y se acepta también como parámetro de entrada (`cron/route.ts:20,25`): `tokenParam === secret`.

**Impacto.** Los query strings se registran en los access logs de Vercel, en cualquier proxy intermedio, y —por C2, con `tracesSampleRate: 1`— en Sentry. `CRON_SECRET` permite disparar el envío de recordatorios **de todas las clínicas** (`send-recordatorios/route.ts:26-27`: `isCron` habilita procesar todos los tenants).

**Solución recomendada.** Usar solo el header `Authorization: Bearer`. El código ya lo soporta; hay que quitar la variante por query param.
**Esfuerzo:** 30 min. **Prioridad: P1.**

---

## I4 · Sin headers de seguridad HTTP

**Evidencia — HECHO.** `next.config.js` (26 líneas) no define `headers()`. `grep` de `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy` sobre `next.config.js`, `src/middleware.ts` y `src/app/layout.tsx` → **0 resultados**.

**Sobre el Referer — matiz importante.** `src/app/layout.tsx:49-58` carga Google Fonts desde `fonts.googleapis.com` en **todas** las páginas, incluidas `/paciente/[token]` y `/firmar/[token]`. Los navegadores modernos usan `strict-origin-when-cross-origin` por defecto, que en peticiones cross-origin envía **solo el origen**, no el path. Por lo tanto **el token no se filtra a Google hoy**. Pero eso depende del default del navegador, no de una decisión del sistema: no hay `Referrer-Policy` explícito.

**Solución recomendada.** `headers()` en `next.config.js` con `Referrer-Policy: no-referrer` en las rutas con token, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. CSP requiere trabajo aparte por los estilos inline (todo el proyecto usa `style={{...}}`).
**Esfuerzo:** 3 h (sin CSP). **Prioridad: P1.**

---

## I5 · Componentes de página desmesurados, todos en el cliente

**Evidencia — HECHO.**

| Archivo | Líneas | `'use client'` |
|---|---:|---|
| `src/app/pacientes/[id]/page.tsx` | 2.164 | sí |
| `src/app/agenda/page.tsx` | 1.974 | sí |
| `src/app/paciente/[token]/page.tsx` | 1.179 | sí |
| `src/app/finanzas/page.tsx` | 1.080 | sí |
| `src/app/dashboard/page.tsx` | 976 | sí |
| `src/app/configuracion/page.tsx` | 832 | sí |
| `src/app/bi/page.tsx` | 750 | sí |
| `src/components/NuevaCitaModal.tsx` | 615 | sí |
| `src/components/Sidebar.tsx` | 558 | sí |

Total: 42 archivos con `'use client'`. Solo `src/app/t/[codigo]/page.tsx` hace fetch en el servidor.

**Impacto concreto.**
1. Todo el código de consulta viaja al navegador y se ejecuta después de la hidratación → waterfall obligatorio (HTML → JS → hidratación → query → render).
2. `/bi` importa Recharts en el bundle del cliente.
3. Ninguna de estas páginas puede usar caché de Next ni streaming.
4. La ficha de paciente (2.164 líneas) es imposible de revisar en un PR.

**Solución recomendada.** No refactorizar en bloque. Convertir a Server Component la **carga inicial** de las 3 páginas más pesadas manteniendo la interactividad en hijos cliente. Empezar por `/pacientes/[id]`, que es la de peor relación coste/beneficio.
**Esfuerzo:** 3-5 días para las 3 principales. **Prioridad: P1.**

---

## I6 · Cero paginación, 35 `select('*')`

**Evidencia — HECHO.**

`grep -n "\.range(\|\.limit(" ` sobre `pacientes/page.tsx`, `agenda/page.tsx`, `facturas/page.tsx`, `crm/page.tsx` → **0 resultados**. Ningún listado pagina.

`src/app/pacientes/page.tsx:50`:
```ts
const {data: pacData} = await supabase.from('pacientes').select('*')
  .eq('tenant_id', tenant.id).order('creado_en',{ascending:false})
```
Trae **todos** los pacientes con **todas** las columnas al navegador: `alergias`, `antecedentes`, `dni_cuit`, y el **`token` del portal**. Todo eso queda en memoria del cliente y en el DevTools de cualquiera que abra la pantalla.

`src/app/pacientes/[id]/page.tsx:546,557,568,594,605,613,622` — **7** queries `select('*')` separadas para armar una ficha. Waterfall si son secuenciales; 7 round-trips si son paralelas.

`src/app/finanzas/page.tsx:127-134` — 6 `select('*')` incluyendo `facturas` completa del tenant sin filtro de período.

**Denylist en lugar de allowlist — `src/app/api/paciente/[token]/route.ts:85-97`:**
```ts
.select('*')                        // trae toda la fila de tenants
const SENSITIVE = ['mp_preapproval_id', 'subscription_status', 'plan', ...]
const safeTenant = Object.fromEntries(
  Object.entries(dbTenant).filter(([k]) => !SENSITIVE.includes(k)))
```
Toda columna nueva de `tenants` queda **expuesta al portal público por defecto**.

**Solución recomendada.** Allowlist de columnas en las lecturas hacia el portal público (prioridad); paginación con `.range()` en los listados; en `/pacientes` no traer `token` ni `antecedentes` al listado.
**Esfuerzo:** 2-3 días. **Prioridad: P1.**

---

## I7 · El test de aislamiento no lee el esquema real

**Evidencia — HECHO.** `src/lib/tenant-isolation.test.ts:80-82`:
```ts
const migracion = readFileSync(
  path.resolve(process.cwd(), 'supabase_migration_perf_2_rls.sql'), ...)
```

Ese archivo (`supabase_migration_perf_2_rls.sql`, en la raíz) contiene **4** policies: `citas`, `pacientes`, `bloqueos`, `tratamientos`. El test corre PGlite, define `auth.uid()`, hace `SET ROLE authenticated` — el planteo es excelente — pero valida un archivo que no es la fuente de verdad de lo desplegado.

**Tablas con RLS que el test NO cubre:** `facturas`, `factura_items`, `factura_pagos`, `arca_config`, `consentimientos_firmados`, `plantillas_consentimiento`, `crm_campanas`, `crm_envios`, `enlaces_turno`, `tenants`, `tenant_users`, `admin_users`, `turnos`, `feedback_post_visita`. Es decir: **toda la superficie de facturación, consentimientos y CRM.**

Las tablas de `TABLAS_SECUNDARIAS` del test sí se enumeran, pero sus policies se generan dentro del propio test siguiendo "el patrón canónico" — no se leen de una migración. El test verifica que el patrón funciona, no que esté aplicado en producción.

**Solución recomendada.** Que el test aplique el conjunto completo de `supabase/migrations/*.sql` en orden, o al menos el `remote_schema.sql` + las posteriores.
**Esfuerzo:** 1-2 días. **Prioridad: P1.**

---

## I8 · Dos sistemas de migraciones en paralelo

**Evidencia — HECHO.** 20 archivos `supabase_migration_*.sql` en la raíz (aplicados a mano según los comentarios: *"Supabase Dashboard → SQL Editor → pegar todo → Run"*) + 17 en `supabase/migrations/` gestionados por CLI. `20260722120000_remote_schema.sql` es un dump de producción, lo que sugiere que se adoptó la CLI a mitad de camino sin retirar lo anterior.

**Impacto.** No hay forma de reconstruir el esquema desde cero de manera fiable, ni de saber qué está realmente aplicado en producción sin consultar la base. El test de aislamiento (I7) es una consecuencia directa de esta ambigüedad. `supabase/snippets/diagnostico-migraciones.sql` sugiere que ya se sintió el problema.

**Solución recomendada.** Consolidar: dump del esquema actual como baseline única en `supabase/migrations/`, archivar los `.sql` de la raíz en `docs/legacy-sql/`.
**Esfuerzo:** 1 día. **Prioridad: P2.**

---

## I9 · Dependencias — análisis diferenciado

`npm audit` reporta 22 vulnerabilidades (1 crítica, 7 altas, 13 moderadas, 1 baja). El número bruto no es la señal. Desglose real:

### Vulnerabilidad real y aplicable

**`next@14.2.29`.** De los ~27 advisories en rango, los que aplican a esta app:
- `GHSA-3g8h-86w9-wvmq` — cache poisoning en redirects de middleware. **Aplica**: `middleware.ts:17-22` hace un redirect 308.
- `GHSA-ffhc-5mcf-pf4q` — XSS con nonces CSP en App Router. Aplica solo si se implementa CSP (hoy no hay).
- `GHSA-m99w-x7hq-7vfj` — DoS vía Server Actions. **Aplica** (hay 2 server actions).
- `GHSA-955p-x3mx-jcvp` — exposición de endpoints internos de Server Functions. **Aplica.**

**No aplican**: todos los de Image Optimization (`next/image` no se usa: el proyecto usa `<img>` directo), i18n (no configurado), custom server (Vercel), rewrites (`next.config.js` no define ninguno).

**Acción:** actualizar a la última 14.2.x. Es un patch, riesgo bajo. **P1.**

### Riesgo potencial, contexto limitante

**`xlsx@0.18.5`** — `GHSA-4r6h-8v6p-xvw6` (prototype pollution) y `GHSA-5pgg-2g8v-p4x9` (ReDoS). **Sin fix upstream.** Contexto real:
- Lectura (`XLSX.read`) ocurre **solo en el navegador**, sobre un archivo que el propio usuario eligió (`src/components/ImportarPacientesModal.tsx:46-49`). El vector requiere que el usuario abra un archivo malicioso, y el daño queda en su propia pestaña.
- En el servidor, `xlsx` solo **escribe** (`src/app/api/pacientes/exportar/route.ts:3`). No parsea entrada no confiable.

No es una alta explotable en este código. Migrar a `exceljs` si se quiere cerrarla, pero no es urgente. **P3.**

**`@sentry/nextjs` / `resend`→`svix`** — vulnerabilidades transitivas (OpenTelemetry, `uuid`), DoS/memoria. Impacto bajo. Patch cuando toque. **P3.**

### Falso positivo en este contexto

**`vitest` (crítica, `GHSA-5xrq-8626-4rwp`)** — *"When Vitest UI server is listening"*. El proyecto corre `vitest run` (`package.json`), nunca `--ui`. Es devDependency y no llega a producción. **Ignorar.** No inflar la métrica con esto.

**`ws` (alta)** — transitiva de tooling de desarrollo. No está en el runtime de producción. **P3.**

### Dependencia innecesaria

**`@supabase/auth-helpers-nextjs@0.15.0`** — declarada en `package.json` pero `grep -rn "auth-helpers" src/` → **0 resultados**. Está deprecada en favor de `@supabase/ssr`, que es lo que el código efectivamente usa. Eliminarla. **P3, esfuerzo 5 min.**

---

## I10 · Duplicación del patrón de autorización

**Evidencia — HECHO.** El bloque

```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
const { data: membership } = await supabase.from('tenant_users')
  .select('role').eq('user_id', user.id).eq('tenant_id', tenantId).single()
if (!membership) return NextResponse.json({ error: '...' }, { status: 403 })
```

está copiado con variaciones en **21 rutas**. Las variaciones no son cosméticas: unas usan `.single()`, otras `.maybeSingle()`; unas seleccionan `role` y lo ignoran, otras lo verifican; los códigos y mensajes de error difieren. Esa inconsistencia es exactamente el origen de C5.

`src/app/api/equipo/miembros/route.ts:26-40` sí extrajo un helper `verificarMembresia()`, pero es local al archivo.

**Solución recomendada.** Un helper compartido `requireMembership(req, tenantId, rolesPermitidos?)` en `src/lib/`, con retorno tipado. Es prerequisito natural del arreglo de C5.
**Esfuerzo:** 1 día. **Prioridad: P2.**

---

# D. PRODUCTO

Separado deliberadamente de lo técnico. Oportunidades observadas leyendo los flujos, no una lista de buenas prácticas.

### D1 · El paciente no controla su propio acceso
El portal (`/paciente/[token]`) no ofrece al paciente ninguna forma de renovar o revocar su link, ni de ver desde dónde se accedió. Un simple "generar un link nuevo y desactivar el anterior" en el portal resuelve la parte operativa de C3 y además es un argumento de venta frente a clínicas preocupadas por el resguardo de la historia clínica.

### D2 · Ambigüedad entre factura simulada y real
`facturas.simulada` distingue el CAE ficticio del real, y el modo lo decide el servidor según haya credenciales ARCA (`emitir/route.ts:~285`). **NO VERIFICADO** si la UI de `/facturas` lo señaliza con suficiente contundencia. Es alto riesgo de producto: una clínica que cree estar facturando y no lo está. Merece una revisión visual específica y un aviso persistente mientras el modo simulación esté activo.

### D3 · La emisión de comprobantes no tiene fricción proporcional
Cualquier miembro puede emitir un comprobante fiscal (C5). Independientemente del arreglo de permisos, el flujo se beneficiaría de una confirmación explícita que muestre importe, tipo y receptor antes de llamar a ARCA — el acto es irreversible.

### D4 · El enlace corto de turno está bien resuelto y se puede capitalizar
`/t/[codigo]` (12 caracteres base32, server action que funciona sin JS dentro del WebView de WhatsApp, metadata sin datos del paciente) es una pieza notablemente cuidada. Extender el mismo patrón a la firma de consentimientos —hoy `/firmar/<UUID>`, 36 caracteres— mejoraría la tasa de firma remota, que es un cuello de botella real en clínicas.

### D5 · Retención: el CRM ya calcula las señales pero depende de credenciales de plataforma
`/api/crm-campanas` computa cumpleaños, recall por `meses_control` y reactivación, con deduplicación vía `crm_envios.clave_dedupe`. Es la funcionalidad de mayor valor demostrable para una clínica (recuperar pacientes inactivos), y hoy queda inerte si faltan las credenciales de WhatsApp. Vale la pena exponer en la UI el impacto estimado ("X pacientes reactivables este mes") aunque el envío no esté configurado: convierte una feature invisible en un argumento de upgrade.

### D6 · Importación de pacientes sin vista previa de duplicados
`/api/pacientes/importar` deduplica por documento y teléfono server-side (`route.ts:49-56`) pero el resultado se conoce recién después de importar. Un preview de "N nuevos, M duplicados detectados" antes de confirmar reduce la ansiedad del onboarding, que es el momento de mayor abandono.

---

# E. DEUDA TÉCNICA

| # | Item | Evidencia |
|---|---|---|
| E1 | `tenant_users.role` sin `CHECK constraint` y con `DEFAULT 'admin'` | `remote_schema.sql:865` — cualquier string es un rol válido, y el default es el privilegiado |
| E2 | `get_tenant_admin_email()` usa `LIMIT 1` sin `ORDER BY` | `remote_schema.sql:393-403` — devuelve un miembro arbitrario, no necesariamente el owner |
| E3 | 57 `console.log`/`console.error` sin logger estructurado ni niveles | `grep` sobre `src/` |
| E4 | Sin timeout explícito en las llamadas a ARCA y MercadoPago | `emitir/route.ts:366`, `checkout/route.ts:54` |
| E5 | `src/types/index.ts` tiene 242 bytes; el resto del proyecto usa `any` para las filas de Supabase | Sin tipos generados de la base |
| E6 | Estilos 100 % inline (`style={{...}}`) en componentes de 2.000 líneas | Imposibilita CSP estricta y duplica tokens de diseño |
| E7 | `supabase/.temp/` versionado en el repo | Artefactos de CLI |
| E8 | 7 archivos markdown de auditorías y planes previos en la raíz | Ruido en el repo; mover a `docs/` |
| E9 | `dentaldesk/` es un directorio vacío | Residuo |

---

# F. QUICK WINS

Cambios de bajo esfuerzo y alto impacto, ordenados por relación beneficio/coste:

| # | Cambio | Archivo | Esfuerzo | Impacto |
|---|---|---|---|---|
| F1 | `sendDefaultPii: false` y bajar `tracesSampleRate` | 3 configs de Sentry | **15 min** | Corta la fuga de tokens y PII (C2) |
| F2 | Quitar `?token=` de la llamada del cron | `api/cron/route.ts:31` | **30 min** | Saca el secreto de los logs (I3) |
| F3 | Setear `token_expira` al generar el token | 7 puntos de generación | **2 h** | Convierte el acceso permanente en temporal (C3) |
| F4 | Eliminar el trigger `sync_turnos_to_sheets` | migración nueva | **30 min** | Quita 5 s de timeout por operación de agenda y cierra el riesgo de C6 |
| F5 | Exigir `admin`/`owner` en `/api/facturacion/emitir` | `emitir/route.ts:78` | **15 min** | Alinea el permiso con `/anular` (parte de C5) |
| F6 | Validar fecha y estado en el cambio de estado del paciente | `paciente/[token]/estado/route.ts` | **1 h** | Cierra C9 |
| F7 | Quitar `token` y `antecedentes` del `select` del listado | `pacientes/page.tsx:50` | **15 min** | Deja de exponer tokens en el cliente |
| F8 | Eliminar `@supabase/auth-helpers-nextjs` | `package.json` | **5 min** | Dependencia deprecada sin uso |
| F9 | Reemplazar el fallback a `DEFAULT_TENANT_ID` por 404 | 4 archivos | **2 h** | Cierra C7 y expone los datos huérfanos |

**F1 a F3 juntos son ~3 h y neutralizan la peor parte de la exposición de datos clínicos.**

---

# G. ROADMAP PRIORIZADO

### P0 — Crítico (antes de sumar la segunda clínica)

| ID | Problema | Archivos | Esfuerzo |
|---|---|---|---|
| C2 | Sentry: PII + tokens a terceros | `sentry.*.config.ts`, `instrumentation-client.ts` | 3 h |
| C3 | Tokens de paciente sin expiración | 7 puntos de generación + `security_fix.sql` | 4 h |
| C1 | Trigger `sync_turno_to_cita` sin tenant | `remote_schema.sql:419-465,1201` | 2 h + verificación |
| C6 | Google Sheets global | `api/sync-sheet/route.ts`, `remote_schema.sql:1197` | 1 h (eliminar) |
| C7 | Fallbacks a tenant por defecto | 4 rutas API | 2 h |
| C4+C8 | Factura huérfana + numeración sin lock | `api/facturacion/emitir/route.ts` | 2-3 días |
| C5 | Roles sin enforcement en DB | policies RLS + 21 rutas | 1 semana |

### P1 — Alto (próximas 4 semanas)

| ID | Problema | Esfuerzo |
|---|---|---|
| C9 | Cambio de estado de citas pasadas desde el portal | 1 h |
| I3 | `CRON_SECRET` en query string | 30 min |
| I9 | Actualizar `next` a la última 14.2.x | 2 h + regresión |
| I4 | Headers de seguridad HTTP | 3 h |
| I2 | Rate limit persistente en `/api/reserva/crear` | 4 h |
| I7 | Test de aislamiento sobre el esquema real | 1-2 días |
| I1 | Invertir el default de autenticación en `/api/` | 1 día |
| I6 | Allowlist de columnas + paginación | 2-3 días |
| I5 | Server Components en las 3 páginas más pesadas | 3-5 días |

### P2 — Medio

| ID | Problema | Esfuerzo |
|---|---|---|
| I10 | Helper unificado de autorización | 1 día |
| I8 | Consolidar migraciones | 1 día |
| E1 | `CHECK constraint` en `tenant_users.role` | 1 h |
| E4 | Timeouts en integraciones externas | 4 h |
| E5 | Tipos generados de Supabase | 1 día |

### P3 — Bajo

E2, E3, E6, E7, E8, E9, `xlsx`→`exceljs`, patches de `@sentry/nextjs` y `resend`.

---

# H. TESTS FALTANTES

El proyecto tiene **18 archivos de test** y algunos son muy buenos: `tenant-isolation.test.ts` levanta PGlite y hace `SET ROLE authenticated` para replicar el runtime de Supabase; `guardas-multitenant.test.ts` lee el código fuente y falla ante patrones prohibidos; `pagos.test.ts` + `multitratamiento.test.ts` cubren la aritmética en centavos y la desagregación de IVA con seriedad.

Lo que falta antes de considerar cada módulo seguro:

### Multi-tenancy
- Aislamiento sobre las tablas **no cubiertas**: `facturas`, `factura_items`, `factura_pagos`, `arca_config`, `consentimientos_firmados`, `plantillas_consentimiento`, `crm_campanas`, `crm_envios`, `enlaces_turno`.
- Que el test lea el esquema **desplegado** y no `supabase_migration_perf_2_rls.sql` (I7).
- Que cada función `SECURITY DEFINER` rechace un `p_*_id` de otro tenant: `fn_ajustar_puntos_manual`, `fn_aprobar_asistencia`, `fn_canjear_premio`, `fn_registrar_inasistencia`, `emitir_factura_con_detalle`, `emitir_enlace_turno`. *(Las cuatro primeras sí revalidan `tenant_users` — verificado — pero no hay test que lo blinde ante una edición futura.)*
- Test que falle si una tabla nueva tiene RLS habilitado y ninguna policy, o policy sin filtro de `tenant_id`.

### Roles
- **No existe ni un solo test de roles.** Mínimo: `staff` NO puede leer `historial_dental`, NO puede escribir `ingresos_manuales`, NO puede emitir factura, NO puede exportar pacientes. Hoy todos esos casos **fallarían**, que es precisamente el valor de escribirlos.

### Portal público
- Token expirado → 410.
- Token de paciente A no accede a datos de paciente B (el filtro existe; falta el test).
- `PATCH /estado` con una cita pasada → rechazo (hoy pasa).
- `PATCH /estado` con `citaId` de otro paciente → 404.
- El JSON de respuesta **no** contiene `notas` de citas ni columnas nuevas de `tenants`.

### Facturación
- Simular fallo del RPC tras un CAE exitoso y verificar que el comprobante queda registrado y recuperable (hoy **no** hay dónde verificarlo: es el test que obliga a arreglar C4).
- Dos emisiones concurrentes para el mismo `(tenant, punto_venta, tipo)` → numeración correlativa sin pérdida.
- ARCA con timeout → estado consistente.
- Que `monto` se recalcule siempre desde la base y nunca desde el body (el código lo hace bien; hay que blindarlo).

### Pagos / MercadoPago
- Firma inválida → 401.
- Firma válida pero `external_reference` de otro tenant → no debe actualizar.
- Webhook duplicado (MP reintenta) → idempotencia. *(Hoy el UPDATE es idempotente por naturaleza, pero no hay test.)*
- `mock-preapp-` en `NODE_ENV=production` → 401.

### Autenticación
- Ruta privada sin sesión → redirect a `/login`.
- Cada `route.ts` de la API responde 401 sin sesión (test que recorra el directorio, en la línea de `guardas-multitenant.test.ts`).

---

# I. COSAS QUE NO DEBEMOS TOCAR

Partes que están bien resueltas y donde el riesgo de tocarlas supera el beneficio.

### 1. Aritmética de dinero e IVA — `src/lib/pagos.ts`
`sumarMontos`, `desagregarIva`, `condicionVentaDominante`, `agruparPagos`, `desglosarFacturable`. Suma en centavos enteros, IVA por diferencia para garantizar `ImpTotal == ImpNeto + ImpIVA` (error 10048 de ARCA). Respaldado por `pagos.test.ts` (295 líneas) y `multitratamiento.test.ts` (468 líneas). **Es la pieza mejor cubierta del proyecto.** No tocar sin un motivo funcional explícito.

### 2. Verificación de firma de MercadoPago — `api/webhooks/mercadopago/route.ts:12-41`
Manifest correcto (`id:...;request-id:...;ts:...;`), `crypto.timingSafeEqual`, rechazo si falta el secreto, y —lo más importante— **consulta el estado real a la API de MP en vez de confiar en el body** (`route.ts:80-91`). La ruta mock está bloqueada en producción. Está bien hecho.

### 3. `emitir_factura_con_detalle` — `20260804120000_pagos_y_multitratamiento.sql:203-267`
Inserta factura + ítems + pagos en una transacción, y **revalida la pertenencia al tenant dentro de la función `SECURITY DEFINER`** (donde RLS no aplica). `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`. La atomicidad local es correcta; el problema de C4 está *afuera*, en el orden respecto de ARCA.

### 4. Storage de fotos clínicas
Bucket privado, URLs firmadas a 1 hora (`api/paciente/[token]/route.ts:130-140`), policies por carpeta donde el primer segmento es el `tenant_id` (`supabase_migration_seguridad_lanzamiento.sql:177-215`), y `storagePathFromUrl()` que tolera URLs públicas legadas sin necesidad de migrar datos. Migración de un modelo inseguro a uno seguro bien ejecutada.

### 5. Enlace corto de turno — `/t/[codigo]` + `lib/turno-publico.ts`
12 caracteres base32 sin I/L/O/U derivados de `gen_random_uuid()` (~60 bits), **deliberadamente no expone el token del paciente**, `generateMetadata` sin datos de salud para no filtrárselos al crawler de Meta, server action que funciona sin JS dentro del WebView de WhatsApp, y `emitir_enlace_turno` con `REVOKE` para todos los roles. Es la pieza mejor diseñada del sistema.

### 6. `src/lib/rutas-publicas.ts`
Lista única compartida entre middleware y gate de suscripción, con comparación por segmento (`coincide()`) que resolvió el bug real de `/paciente` vs `/pacientes`. Los comentarios documentan el porqué. Tocarlo reintroduce bugs ya pagados.

### 7. `guardas-multitenant.test.ts` y `rutas-publicas.test.ts`
Tests que leen el código fuente y fallan ante patrones prohibidos (por ejemplo, un archivo de cara al paciente que arme URLs con el dominio de la plataforma). Es el mecanismo correcto para este tipo de invariante y conviene **extenderlo**, no reemplazarlo.

### 8. Singleton del cliente de browser — `src/lib/supabase/client.ts`
La condición `typeof window === 'undefined'` que evita cachear durante el SSR de un Client Component es sutil y correcta. Quitarla causaría filtración de sesión entre usuarios. No tocar.

---

## Nota de cierre

Este sistema no está mal construido. Hay decisiones de ingeniería claramente por encima del promedio: el test de RLS con PGlite, los tests que analizan el propio código fuente, la aritmética de dinero en centavos, el diseño del enlace corto, la migración del bucket de fotos a privado. Los comentarios explican el *porqué* de las decisiones, incluidos los bugs que las motivaron — eso es raro y valioso.

El patrón que agrupa casi todos los hallazgos P0 es uno solo: **restos de la etapa mono-tenant que sobrevivieron a la migración multi-tenant**. El trigger sin `tenant_id` (C1), los fallbacks a un tenant por defecto (C7), la planilla de Google única (C6), los roles que nunca llegaron a la base (C5). Todos son invisibles mientras haya **una** clínica en producción, y todos se manifiestan el día que entra la segunda — que es el peor momento posible para descubrirlos. El propio `guardas-multitenant.test.ts` lo dice con estas palabras en su cabecera; la observación era correcta y el trabajo quedó a mitad de camino.

La recomendación operativa: hacer los quick wins F1-F3 esta semana (3 horas, cierra lo peor de la exposición de datos clínicos), resolver C1/C6/C7 antes de cualquier alta de cliente nuevo, y tratar C4 y C5 como proyectos con su propio ciclo de diseño, test y despliegue.

---

*Auditoría realizada sobre el código del repositorio, sin acceso a la base de datos de producción ni a los paneles de Vercel, Supabase, Sentry, MercadoPago o ARCA. Los puntos marcados como NO VERIFICADO requieren esa confirmación. No se modificó ningún archivo, no se ejecutaron migraciones, no se actualizaron dependencias y no se hicieron commits.*
