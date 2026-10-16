# P0-03 — Verificación de producción

**Fecha:** 8 de agosto de 2026
**Estado de P0-03:** IMPLEMENTADO LOCALMENTE — sin deploy, sin secretos rotados, sin eventos purgados.
**Documentos previos:** `AUDITORIA-PROFUNDA-2026-08.md`, `P0_IMPLEMENTATION_PLAN.md`, `P0_PRODUCTION_DIAGNOSTICS.md`

Este documento es **solo una guía de ejecución manual**. No modifica nada.

---

## Datos del entorno (para no buscarlos dos veces)

| Qué | Valor |
|---|---|
| Proyecto Sentry | `andbrand-studio / javascript-nextjs` |
| Región Sentry | `us` (`o4511264226541568`, proyecto `4511264235913216`) |
| Project ref Supabase | `lbaqbhpjjhhzplijxilp` |
| Cookie de sesión | `sb-lbaqbhpjjhhzplijxilp-auth-token` |
| Crons en `vercel.json` | `/api/cron` 11:00 UTC · `/api/daily-briefing` 22:00 UTC · `/api/crm-campanas` 12:00 UTC |
| Equivalente Argentina (UTC-3) | 08:00 · 19:00 · 09:00 |

**Orden recomendado:** §1 (Sentry) → §2 (decidir rotación) → §3 (disparadores) → §6 (BI, antes de tocar nada) → §5 (Supabase) → §4 (deploy).

La razón de ese orden: Sentry y BI **miden el estado actual**. Si deployás primero, perdés la medición para siempre y ya no vas a poder distinguir "nunca estuvo expuesto" de "lo acabamos de cerrar".

---

## 1. Sentry

Entrar a `andbrand-studio / javascript-nextjs` → **Discover** (o **Issues** con la barra de búsqueda).

**Antes de empezar, tres cosas:**

1. **No borres ni purgues nada.** Primero medir, después decidir. Purgar destruye la evidencia que define si hay que rotar secretos y notificar.
2. **Poné el rango en el máximo disponible.** Por defecto Discover muestra 14 días; la retención suele ser de 30 o 90. Lo que importa es el histórico completo.
3. **Mirá `request.url`, no solo `transaction`.** Next normaliza el nombre de la transacción a `/paciente/[token]`, pero **`request.url` conserva el valor resuelto**. Es el error más común al auditar esto: ver la transacción limpia y concluir que no hay exposición.

En Discover, agregá estas columnas: `timestamp`, `transaction`, `request.url`, `user.ip`, `environment`.

---

### V1 · Tokens del portal de paciente en la URL

**Qué buscar**
```
url:*/paciente/*
url:*/api/paciente/*
transaction:*paciente*
```

**Crítico** — aparece un UUID resuelto en `request.url`, por ejemplo `https://…/api/paciente/8f3a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8`. Cada uno de esos es una credencial de acceso permanente (los tokens no expiran hasta que se haga P0-02) a alergias, antecedentes, historial dental y fotos clínicas.

**Aceptable** — cero resultados, o resultados donde el segmento aparece como `[token]` / `[redacted]`.

**Acción**
- Anotar **cuántos eventos** y **cuántos tokens distintos**. Esta última cifra es la que importa: es la cantidad de pacientes cuyo acceso quedó expuesto.
- Exportar la lista de tokens distintos (sin publicarla) → es el insumo para la rotación selectiva en P0-02.
- Si son pocos (< 20), rotación selectiva. Si son muchos, rotación masiva y aviso a la clínica.

---

### V2 · Tokens de firma de consentimiento

**Qué buscar**
```
url:*/firmar/*
url:*/api/consentimientos/firmar/*
```

**Crítico** — un `token_firma` resuelto. Permite firmar un consentimiento en nombre de otra persona, si todavía está `pendiente`.

**Aceptable** — cero, o segmento redactado.

**Acción** — para cada token encontrado, verificar el estado del consentimiento en la base:

```sql
SELECT id, estado, firmado_en, tenant_id
FROM consentimientos_firmados
WHERE token_firma = '<token-encontrado>';
```

Si `estado = 'firmado'`, el riesgo ya cerró: el endpoint rechaza la doble firma. Si sigue `pendiente`, **está vivo** y hay que regenerarlo.

---

### V3 · La ruta que cambia estado de turnos

**Qué buscar**
```
url:*/api/paciente/*/estado*
url:*/api/paciente/*/feedback*
```

**Crítico** — token resuelto. Este endpoint permite confirmar o **cancelar** turnos del paciente. Mientras P0-08 no esté hecho, también permite cancelar citas pasadas ya facturadas.

**Aceptable** — cero, o redactado.

**Acción** — sumar estos tokens al conjunto de V1. Son el mismo secreto por otra ruta.

---

### V4 · Cualquier secreto en query string

**Qué buscar**
```
url:*token=*
url:*secret=*
url:*apikey=*
url:*"?c="*
```

**Crítico** — cualquier valor legible después de `token=`. Dos casos distintos y hay que separarlos:

| Ruta en la URL | Qué secreto es | Gravedad |
|---|---|---|
| `/api/send-recordatorios?token=…` | **CRON_SECRET** | **Máxima** — ver V5 |
| `/api/cron?token=…` | **CRON_SECRET** | **Máxima** |
| `/api/crm-campanas?token=…` | **CRON_SECRET** | **Máxima** |
| `/api/ics?token=…` | Token de paciente | Alta — sumar a V1 |
| `/api/ics?c=…` | Código corto de turno | Media — da acceso a un turno, no a la ficha |

**Aceptable** — `token=[redacted]`, o cero resultados.

**Acción** — clasificar por ruta antes de decidir. No es lo mismo un código de turno que la llave que dispara los envíos de todas las clínicas.

---

### V5 · CRON_SECRET — la búsqueda que define si hay rotación

**Esta es la más importante de la sección.** Es la única con una consecuencia binaria e inmediata.

**Qué buscar**
```
url:*send-recordatorios*
transaction:/api/cron
transaction:/api/crm-campanas
```

Para `transaction:/api/cron`, abrir un evento y **mirar los spans** (pestaña *Trace* o *Spans*): el secreto viajaba en el `description` de un span `http.client`, no en la URL del request entrante. Es fácil pasarlo por alto mirando solo el nivel superior.

**Crítico** — aparece el valor de `CRON_SECRET` en cualquier lado: URL entrante, span `http.client`, breadcrumb o `data.http.url`.

**Aceptable** — cero resultados, o `token=[redacted]`.

**Acción**
- Si aparece → **rotar `CRON_SECRET`** (procedimiento en §2). El cambio de código lo saca de los eventos *futuros*; no lo saca del histórico.
- Anotar la **fecha del evento más antiguo**: define desde cuándo el secreto está expuesto y quién pudo verlo.

**Frecuencia esperada, para dimensionar:** el cron corre una vez por día. Con `tracesSampleRate: 1` cada corrida generaba 2 eventos con el secreto. Aproximadamente **2 × (días desde que se configuró el cron)**, acotado por la retención del plan.

---

### V6 · Cookie de sesión de Supabase

**Qué buscar** — no hay filtro de búsqueda sobre headers. Se hace a mano: abrir **3 a 5 eventos de rutas autenticadas** (`/api/facturacion/emitir`, `/dashboard`, `/api/pacientes/exportar`) → sección **Request → Headers**.

Buscar `cookie`, y dentro de ella `sb-lbaqbhpjjhhzplijxilp-auth-token`.

**Crítico** — la cookie aparece con contenido. **Es más grave que un token de portal**: es una sesión activa de un usuario del consultorio, con todos sus permisos. Y como no hay separación de roles en la base (P0-05), cualquier sesión equivale a acceso completo al tenant.

**Aceptable** — no hay sección `Headers`, o no incluye `cookie`.

**Acción** — si aparece:
1. Verificar si el JWT ya venció (los access tokens de Supabase duran ~1 h por defecto). Un token vencido no sirve; el **refresh token**, sí.
2. Si el refresh token está presente y vigente → considerar invalidar sesiones desde el panel de Supabase (Authentication → Users → cerrar sesión).
3. Anotar cuántos usuarios distintos y desde cuándo.

---

### V7 · Header Authorization

**Qué buscar** — mismo método manual que V6, en eventos de `/api/cron`, `/api/crm-campanas`, `/api/daily-briefing`, `/api/webhooks/*`.

**Crítico** — `authorization: Bearer <valor legible>`. En las rutas de cron ese valor **es CRON_SECRET** → dispara la acción de V5.

**Aceptable** — el header no está presente.

**Acción** — si aparece en rutas de cron, tratar igual que V5. Si aparece en webhooks, verificar también `x-signature` (MercadoPago) y `svix-signature` (Resend).

---

### V8 · IP del usuario

**Qué buscar** — abrir cualquier evento → sección **User** → campo `IP Address`. También la columna `user.ip` en Discover.

**Crítico** — IPs pobladas en eventos del **portal del paciente** (`/paciente/*`, `/firmar/*`). Una IP asociada a la consulta de una historia clínica es un dato de salud indirecto: revela que esa persona es paciente de esa clínica.

**Aceptable** — campo vacío o `{{auto}}` sin resolver.

**Acción** — cuantificar. No hay remediación posible más allá de la purga; el valor de esta verificación es dimensionar el alcance para la decisión de §2 y para saber qué se le informa a la clínica.

---

### V9 · PII en cuerpos y breadcrumbs

**Qué buscar** — en eventos de `POST` a `/api/consentimientos/firmar/*`, `/api/pacientes/importar`, `/api/facturacion/emitir`: sección **Request → Body / Data**. Y la sección **Breadcrumbs** de cualquier evento del portal.

**Crítico** — `firmaPng` (la firma manuscrita en base64), `alergias`, `antecedentes`, `notas` de citas, `pacienteDocNro`, `email`, `telefono`. Y en breadcrumbs, URLs con tokens resueltos.

**Aceptable** — campos ausentes o `[redacted]`.

**Acción** — si aparece `firmaPng`, es la firma ológrafa de un paciente almacenada en un tercero. Anotarlo por separado: tiene peso legal distinto al resto.

---

### V10 · Volumen, retención y scrubbing del servidor

**Dónde** — `Settings → Subscription` y `Settings → Security & Privacy`.

**Qué anotar**
- Eventos aceptados en el período → dimensiona la purga.
- **Período de retención** → define hasta cuándo persisten los eventos con tokens. Si es de 30 días y el problema es más viejo, parte ya se borró sola.
- **¿Data Scrubbing del lado servidor está activo?** Si lo está, puede haber estado mitigando parcialmente sin que el código lo refleje — y explicaría hallazgos menores a lo esperado.
- `Settings → Members`: quiénes pueden ver estos eventos. Define el alcance real de la exposición.

**Acción** — activar Data Scrubbing del lado servidor como segunda barrera, independiente del deploy. Es lo único de esta sección que conviene hacer **antes** de purgar.

---

### Planilla de resultados

| ID | Búsqueda | Eventos | Valores distintos | Más antiguo | Crítico | Acción |
|---|---|---|---|---|:--:|---|
| V1 | Tokens de portal | ☐ | ☐ | ☐ | ☐ | |
| V2 | Tokens de firma | ☐ | ☐ | ☐ | ☐ | |
| V3 | Ruta de estado | ☐ | ☐ | ☐ | ☐ | |
| V4 | Query strings | ☐ | ☐ | ☐ | ☐ | |
| **V5** | **CRON_SECRET** | ☐ | ☐ | ☐ | ☐ | |
| V6 | Cookie de sesión | ☐ | ☐ | ☐ | ☐ | |
| V7 | Authorization | ☐ | ☐ | ☐ | ☐ | |
| V8 | IP | ☐ | — | ☐ | ☐ | |
| V9 | PII en cuerpos | ☐ | — | ☐ | ☐ | |
| V10 | Volumen/retención | ☐ | — | — | — | |

---

## 2. CRON_SECRET — rotación condicional

**No rotar nada todavía.** Esta sección se ejecuta **si y solo si V5 o V7 dieron positivo**.

### Dónde vive el secreto

| Lugar | Cómo se actualiza | Obligatorio |
|---|---|---|
| **Vercel → Environment Variables → `CRON_SECRET`** | Panel de Vercel | **Sí** |
| **`.env.local`** (tu máquina) | A mano | Sí, para desarrollo |
| **Vercel Cron** | Automático: Vercel inyecta `Authorization: Bearer $CRON_SECRET` leyendo esa misma variable | No requiere acción |
| **Disparadores externos** | Uno por uno | Solo si existen (§3) |

**Detalle que evita un susto:** Vercel Cron toma el valor de la variable de entorno en cada ejecución. Cambiar `CRON_SECRET` en Vercel es suficiente para las tres tareas programadas; no hay que reconfigurar nada más. Lo que **sí** se rompe es cualquier disparador externo que tenga el valor viejo escrito a mano.

### Procedimiento, si corresponde

1. Generar el nuevo valor: `openssl rand -hex 32`.
2. Actualizarlo en Vercel (Production **y** Preview) **antes** del deploy de P0-03.
3. Redeploy para que las funciones tomen el valor nuevo.
4. Actualizar `.env.local`.
5. Actualizar los disparadores externos identificados en §3.
6. Verificar al día siguiente que las tres tareas corrieron (§4, pasos 6-9).

### Otros secretos — evaluar solo si aparecen

`CRON_SECRET` es el único que la auditoría confirmó viajando en una URL. Los demás **no deberían** aparecer, pero si V6/V7/V9 los muestran:

| Secreto | Dónde vive | Cuándo rotar |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + Supabase (Settings → API) | **Si aparece en cualquier lado.** Es la llave maestra: saltea todo RLS |
| `RESEND_API_KEY` | Vercel + panel de Resend | Si aparece |
| `RESEND_WEBHOOK_SECRET` | Vercel + panel de Resend | Si aparece |
| `MERCADOPAGO_ACCESS_TOKEN` | Vercel + panel de MP | Si aparece |
| `SYNC_SHEET_SECRET` | Vercel | Si aparece (baja prioridad: la feature no funciona) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | **Nunca.** Es pública por diseño: viaja en el bundle |

**Nota sobre el DSN de Sentry:** está hardcodeado en el código y es público por diseño (viaja al navegador). No es un secreto y no se rota.

---

## 3. Disparadores externos

### Qué cambió

| Endpoint | Antes | Ahora |
|---|---|---|
| `/api/cron` | `Authorization: Bearer` **o** `?token=` | **Solo `Authorization: Bearer`** |
| `/api/send-recordatorios` | `?token=` (camino cron) | **Solo `Authorization: Bearer`** |
| `/api/crm-campanas` | `Authorization: Bearer` **o** `?token=` | **Solo `Authorization: Bearer`** |
| `/api/daily-briefing` | `Authorization: Bearer` | Sin cambio de mecanismo (solo comparación en tiempo constante) |

**Impacto:** cualquier llamador que use `?token=` empezará a recibir **401**. Y como los recordatorios corren una vez por día, una rotura tarda hasta 24 h en notarse — y eso significa pacientes sin recordar su turno.

### Checklist — no asumir que existen

**Nada en el repositorio indica que haya disparadores externos.** `vercel.json` define las tres tareas y ningún archivo referencia un servicio de terceros. Esta checklist es para **descartar**, no para corregir algo conocido.

| # | Dónde mirar | Qué buscar | Estado |
|---|---|---|---|
| 1 | **Vercel → Settings → Cron Jobs** | Que estén las tres de `vercel.json` y ninguna más | ☐ |
| 2 | **cron-job.org** | ¿Existe cuenta? ¿Algún job apuntando al dominio? | ☐ |
| 3 | **UptimeRobot / Better Uptime** | Monitores sobre `/api/*`. Un monitor con `?token=` en la URL es tanto un disparador como una fuga | ☐ |
| 4 | **Zapier** | Zaps con acción Webhooks → POST al dominio | ☐ |
| 5 | **n8n / Make / Integromat** | Workflows con nodos HTTP al dominio | ☐ |
| 6 | **GitHub Actions** | Workflows con `schedule:` que hagan `curl`. *(Verificado en el repo: `ci.yml` solo corre typecheck y tests. Confirmar que no haya otros en la organización.)* | ☐ |
| 7 | **Supabase → Database → Webhooks** | Webhooks apuntando a `/api/*`. **Ojo:** hay uno documentado hacia `/api/sync-sheet` (P0-04, no tocar en esta fase) | ☐ |
| 8 | **Supabase → Edge Functions** | Funciones que llamen a la API de la app | ☐ |
| 9 | **Logs de Vercel** | La búsqueda empírica, y la más confiable: filtrar por `/api/cron`, `/api/send-recordatorios`, `/api/crm-campanas` en los últimos 30 días y mirar el `user-agent` de cada llamada. `vercel-cron/1.0` es el legítimo; **cualquier otro origen es un disparador externo que nadie recordaba** | ☐ |

**El paso 9 vale más que los ocho anteriores.** Los otros dependen de acordarse de dónde se configuró algo; este lo lee de los hechos.

### Si aparece uno

Actualizarlo a:

```bash
curl -X POST "https://TU-DOMINIO/api/cron" \
     -H "Authorization: Bearer $CRON_SECRET"
```

Y **quitar el `?token=` de la URL configurada** — si queda, sigue publicando el secreto en los logs del servicio externo aunque la app ya no lo lea.

---

## 4. Deploy

### 1 · Build con red ☐

```bash
cd ~/Turnos-app
rm -f .git/index.lock      # residuo de la sesión anterior; bloquea git add/commit
npm run build
```

**Nunca se completó en el entorno del agente** (sin salida de red). Es el único paso de validación que quedó pendiente. Si falla, **no seguir**.

Esperado: compila y genera las rutas. Prestar atención a que `sentry.server.config.ts`, `sentry.edge.config.ts` e `instrumentation-client.ts` resuelvan el import de `sentry-config` — es el cambio estructural de esta fase.

### 2 · Deploy a preview ☐

```bash
npx vercel               # sin --prod
```

Verificar que `CRON_SECRET` esté definido en el entorno Preview. Si no está, `esCron()` devuelve `false` siempre (falla cerrado) y los endpoints darán 401.

### 3 · Probar endpoints en preview ☐

```bash
BASE="https://<url-de-preview>"
SECRET="<CRON_SECRET del entorno Preview>"

# a) Sin credenciales → 401
curl -s -o /dev/null -w "sin auth:            %{http_code}\n" "$BASE/api/cron"

# b) Con el mecanismo VIEJO (query param) → 401. Es la prueba de que se cerró.
curl -s -o /dev/null -w "query param (viejo): %{http_code}\n" "$BASE/api/cron?token=$SECRET"

# c) Con el mecanismo NUEVO → 200
curl -s -o /dev/null -w "header (nuevo):      %{http_code}\n" \
     -H "Authorization: Bearer $SECRET" "$BASE/api/cron"

# d) Secreto incorrecto → 401
curl -s -o /dev/null -w "secreto incorrecto:  %{http_code}\n" \
     -H "Authorization: Bearer incorrecto" "$BASE/api/cron"

# e) Las otras dos rutas de cron
curl -s -o /dev/null -w "crm-campanas:        %{http_code}\n" \
     -H "Authorization: Bearer $SECRET" "$BASE/api/crm-campanas"
curl -s -o /dev/null -w "daily-briefing:      %{http_code}\n" \
     -H "Authorization: Bearer $SECRET" "$BASE/api/daily-briefing"
```

**Esperado:** `401, 401, 200, 401, 200, 200`.

El punto **(b)** es el que demuestra que P0-03 cumplió su objetivo. Si devuelve 200, el cambio no se aplicó.

**Cuidado:** ejecutar (c) dispara el envío real de recordatorios si el entorno de preview apunta a la base de producción. Revisar a qué Supabase apunta el preview antes de correrlo. Si apunta a producción, saltear (c) y (e) y validarlos recién en el paso 6.

### 4 · Verificar Sentry en preview ☐

Provocar un error en una ruta con token:

```bash
curl "$BASE/api/paciente/00000000-0000-4000-8000-000000000000"
```

Y abrir el portal en el navegador con un token válido de prueba, para generar la transacción del cliente.

En Sentry, filtrar por `environment:preview` y abrir el evento. Verificar:

- ☐ `request.url` muestra `[redacted]`, no el UUID
- ☐ **no** hay sección `cookies`
- ☐ `headers` no incluye `cookie` ni `authorization`
- ☐ `User → IP Address` vacío
- ☐ el stack trace **sí** está completo
- ☐ `transaction` y `environment` presentes

**Sacar captura de pantalla.** Es la evidencia de que P0-03 funciona en un entorno real, que es lo único que los tests locales no pueden demostrar.

### 5 · Deploy a producción ☐

```bash
npx vercel --prod
```

Momento recomendado: **después de las 11:00 UTC** (08:00 ART), con el cron del día ya ejecutado. Así hay 24 h de margen para detectar un problema antes de la próxima corrida.

Si se rotó `CRON_SECRET` (§2), actualizarlo en Vercel **antes** de este paso.

### 6 · Verificar el cron ☐ — al día siguiente, después de las 11:00 UTC

Vercel → Deployments → Functions → filtrar `/api/cron`.

- ☐ Se ejecutó a las 11:00 UTC
- ☐ Status 200 (no 401)
- ☐ El `user-agent` es `vercel-cron/1.0`
- ☐ En los logs, la llamada interna a `/api/send-recordatorios` respondió 200

**Un 401 acá significa que `CRON_SECRET` no coincide entre la variable de entorno y lo que Vercel Cron envía.** Es el modo de falla más probable de todo el deploy.

### 7 · Verificar recordatorios ☐

```sql
SELECT count(*), max(created_at)
FROM recordatorios_log
WHERE created_at > now() - interval '1 day';
```

- ☐ Hay filas del día
- ☐ El volumen es comparable al de días anteriores

Confirmar con la clínica que los pacientes recibieron el recordatorio. Es la verificación que ninguna consulta reemplaza.

### 8 · Verificar el briefing ☐ — después de las 22:00 UTC (19:00 ART)

- ☐ `/api/daily-briefing` con status 200 en los logs
- ☐ El mail llegó a la casilla del odontólogo

### 9 · Verificar campañas CRM ☐ — después de las 12:00 UTC (09:00 ART)

- ☐ `/api/crm-campanas` con status 200

```sql
SELECT tipo, count(*) FROM crm_envios
WHERE creado_en > now() - interval '1 day' GROUP BY tipo;
```

**Sin ruido esperable:** si WhatsApp no está configurado, la ruta responde 200 con `{ok:false, motivo:'WhatsApp no configurado'}` y no envía nada. Eso es correcto, no una falla.

### Rollback

Si algo falla: Vercel → Deployments → el deploy anterior → **Promote to Production**. Segundos, sin tocar la base. P0-03 no modifica esquema ni datos, así que el rollback es completo.

---

## 5. Supabase — U-01

> **Nota:** U-01 **ya se ejecutó** y devolvió **0**. Queda documentada acá para reejecución y porque las dos consultas hermanas siguen abiertas.

### U-01 — Citas cuyo tenant no coincide con el del paciente

```sql
-- Cantidad total
SELECT count(*) AS citas_cruzadas
FROM citas c
JOIN pacientes p ON p.id = c.paciente_id
WHERE c.tenant_id <> p.tenant_id;

-- Tenants involucrados y ventana temporal. Sin nombres ni emails.
SELECT c.tenant_id AS tenant_cita,
       p.tenant_id AS tenant_paciente,
       count(*)    AS cantidad,
       min(c.creado_en) AS desde,
       max(c.creado_en) AS hasta
FROM citas c
JOIN pacientes p ON p.id = c.paciente_id
WHERE c.tenant_id <> p.tenant_id
GROUP BY c.tenant_id, p.tenant_id
ORDER BY cantidad DESC;

-- IDs, solo si el conteo es > 0
SELECT c.id AS cita_id, c.tenant_id AS tenant_cita,
       p.id AS paciente_id, p.tenant_id AS tenant_paciente, c.creado_en
FROM citas c
JOIN pacientes p ON p.id = c.paciente_id
WHERE c.tenant_id <> p.tenant_id
ORDER BY c.creado_en DESC;
```

| Resultado | Clasificación | Acción |
|---|---|---|
| **0** | **NO HAY EVIDENCIA DE CONTAMINACIÓN** ✅ *(resultado actual)* | La FK compuesta de P0-01 se aplica sin fricción |
| **> 0** | **P0 CRÍTICO / INCIDENTE DE INTEGRIDAD** | Detener el plan. Revisión manual caso por caso con la clínica. Evaluar notificación. **No automatizar la reasignación** |

### Consultas hermanas — siguen abiertas

**U-02 · Tablas hijas con tenant inconsistente**

```sql
SELECT 'historial_dental' AS tabla, count(*) FROM historial_dental h
  JOIN pacientes p ON p.id = h.paciente_id WHERE h.tenant_id <> p.tenant_id
UNION ALL SELECT 'paciente_fotos', count(*) FROM paciente_fotos f
  JOIN pacientes p ON p.id = f.paciente_id WHERE f.tenant_id <> p.tenant_id
UNION ALL SELECT 'tratamiento_items', count(*) FROM tratamiento_items ti
  JOIN citas c ON c.id = ti.cita_id WHERE ti.tenant_id <> c.tenant_id
UNION ALL SELECT 'pagos', count(*) FROM pagos pg
  JOIN citas c ON c.id = pg.cita_id WHERE pg.tenant_id <> c.tenant_id
UNION ALL SELECT 'facturas', count(*) FROM facturas f
  JOIN citas c ON c.id = f.cita_id
  WHERE f.cita_id IS NOT NULL AND f.tenant_id <> c.tenant_id;
```

**U-03 · NULLs en las cuatro tablas que los admiten** — la que más me sigue interesando:

```sql
SELECT 'costos_fijos' AS tabla, count(*) FROM costos_fijos WHERE tenant_id IS NULL
UNION ALL SELECT 'ingresos_manuales',    count(*) FROM ingresos_manuales    WHERE tenant_id IS NULL
UNION ALL SELECT 'meta_mensual',         count(*) FROM meta_mensual         WHERE tenant_id IS NULL
UNION ALL SELECT 'feedback_post_visita', count(*) FROM feedback_post_visita WHERE tenant_id IS NULL;
```

**Por qué importa:** bajo RLS, `tenant_id IN (SELECT …)` con NULL evalúa a NULL, no a TRUE. Esas filas quedan **invisibles para todos menos `service_role`**. Un ingreso de caja en ese estado existe en la base y **no aparece en `/finanzas`**. Para una tabla financiera, un dato ausente es peor que uno mal atribuido: el segundo se nota.

Todas son `SELECT`. Ninguna modifica nada.

---

## 6. P0-07 — Verificar `bi_ingresos_por_mes` antes de migrar

**Correr esto ANTES de aplicar la migración.** Después ya no distingue "nunca estuvo expuesta" de "la acabamos de cerrar", y se pierde la única medición del riesgo real.

### El intento anterior no fue válido

Se ejecutó con el placeholder literal en lugar de la clave:

```
-H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
→ sb-error-code: UNAUTHORIZED_INVALID_API_KEY
→ {"message":"Invalid API key"}
```

Ese 401 lo devolvió el **gateway de Supabase**, rechazando la credencial. **El request nunca llegó a PostgREST ni a la base.** No probó nada sobre la vista.

### Comando correcto

Toma la clave de `.env.local`, así no hace falta pegarla a mano:

```bash
cd ~/Turnos-app
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)

curl -i "https://lbaqbhpjjhhzplijxilp.supabase.co/rest/v1/bi_ingresos_por_mes?select=*" \
     -H "apikey: $ANON"
```

Verificación previa de que la clave se leyó bien (sin exponerla):

```bash
echo "longitud de la clave: ${#ANON}"   # debe ser > 100, no 0
```

### Cómo leer el resultado

La clave está en **quién** responde:

| Respuesta | Quién responde | Clasificación | Acción |
|---|---|---|---|
| `200` con filas | PostgREST | **CONFIRMADO — expuesta** | P0-07 urgente. Anotar cuántos meses e importes se ven |
| `200` con `[]` | PostgREST | **CONFIRMADO — expuesta** | Igual de grave: el acceso existe |
| `401` + `PGRST301` o `42501` | PostgREST | **DESCARTADO** | Permiso denegado de verdad. P0-07 baja a P2 |
| `404` + `PGRST205` | PostgREST | **DESCARTADO** | La vista ya no existe |
| `401` + `UNAUTHORIZED_INVALID_API_KEY` | **Gateway** | **TEST INVÁLIDO** | Revisar la clave y repetir |

**Regla simple:** si el cuerpo trae un campo `code` tipo `PGRST…` o `42501`, llegó a la base y el resultado sirve. Si dice `Invalid API key`, no llegó.

### Las otras cinco vistas

Si la primera confirma la exposición, medir el alcance completo:

```bash
for v in bi_citas_por_dia bi_citas_por_tratamiento bi_kpis_mes \
         bi_ocupacion_por_hora bi_pacientes_nuevos_por_mes; do
  echo -n "$v -> "
  curl -s -o /dev/null -w "%{http_code}\n" \
       "https://lbaqbhpjjhhzplijxilp.supabase.co/rest/v1/$v?select=*" \
       -H "apikey: $ANON"
done
```

### Control desde el SQL Editor

Independiente del curl, y útil para contrastar el esquema desplegado contra el dump del repositorio:

```sql
SELECT c.relname AS vista,
       c.relkind AS tipo,
       COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                 WHERE option_name = 'security_invoker'), 'off') AS security_invoker,
       has_table_privilege('anon', c.oid, 'SELECT')          AS anon_lee,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_lee
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v','m')
ORDER BY c.relname;
```

**Esperado hoy** (antes de migrar): las seis `bi_*` con `security_invoker = off` y `anon_lee = true`.
**Esperado después de migrar:** solo `bi_resumen` (privada) y `tenants_public` (pública a propósito).

**La migración `20260807120000_cerrar_vistas_bi_expuestas.sql` NO se aplica en esta fase.** Está escrita y testeada, esperando instrucción.

---

## Resumen de decisiones que este documento desbloquea

| Verificación | Decide |
|---|---|
| **V5 / V7** | Si hay que **rotar `CRON_SECRET`** |
| V1 / V2 / V3 | Cuántos tokens de paciente rotar en P0-02, y si es selectivo o masivo |
| V6 | Si hay que invalidar sesiones de usuarios de la clínica |
| V10 | Alcance de la purga y si conviene esperar a que la retención venza sola |
| §3 paso 9 | Si existe algún disparador externo que el deploy va a romper |
| §6 | Prioridad real de P0-07 |
| §5 U-03 | Si hay dinero invisible en `/finanzas` |

**Ninguna de estas verificaciones bloquea el deploy de P0-03.** El código está listo; lo que falta medir es el daño ya ocurrido, que es una tarea distinta y paralela.

---

*Documento de verificación manual. No se modificó código, no se crearon migraciones, no se cambiaron variables de entorno, no se hizo deploy, no se purgó Sentry y no se rotó ningún secreto. Todas las consultas SQL incluidas son `SELECT`.*
