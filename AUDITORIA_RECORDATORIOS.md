# Auditoría · Envío de recordatorios

**26/08/2026** · Disparador: a un paciente no le llegó el recordatorio.

Ruta completa: `Vercel Cron 0 11 * * *` → `/api/cron` → `/api/send-recordatorios` → Resend.

---

# 1 · Empezá por acá — el árbol de decisión

**No adivines cuál de las causas fue.** Una sola consulta la determina.

```sql
-- Reemplazá el nombre. Devuelve la cita y si hubo intento de envío.
SELECT
  c.id            AS cita_id,
  c.fecha_hora,
  c.estado,
  p.nombre,
  p.email,
  r.estado_envio,
  r.enviado_en,
  r.resend_email_id
FROM citas c
JOIN pacientes p ON p.id = c.paciente_id
LEFT JOIN recordatorios_log r ON r.cita_id = c.id
WHERE p.nombre ILIKE '%APELLIDO_DEL_PACIENTE%'
ORDER BY c.fecha_hora DESC
LIMIT 10;
```

## Cómo leer el resultado

| Lo que ves | Qué pasó | Andá a |
|---|---|---|
| **`email` vacío o NULL** | Nunca hubo a dónde mandarlo. **Se contó como enviado igual** | §2.1 |
| **Sin fila en `recordatorios_log`** | La cita nunca entró al bucle | §2.2 · §3.1 · §3.2 |
| **`estado_envio = 'fallido'`** | Resend rechazó el envío | §3.3 |
| **`estado_envio = 'enviado'` + `resend_email_id`** | **Resend lo aceptó.** El problema está después: rebote, spam o buzón lleno | §3.4 |

**El último caso es el más común y el sistema no tiene la culpa** — pero tampoco te entera, que es el problema real (§2.3).

---

# 2 · Defectos confirmados en el código

## 2.1 🔴 Los saltos se cuentan como envíos

`send-recordatorios/route.ts:146`

```ts
if (!paciente?.email) return { skip: true }
```

Ese `return` **resuelve la promesa**. Y línea 210:

```ts
const enviados = resultados.filter(r => r.status === 'fulfilled').length
```

`{ skip: true }` es `fulfilled`. **Un paciente sin email se cuenta como enviado.**

Peor: **no se escribe ninguna fila en `recordatorios_log`.** El salto no deja rastro en ningún lado. La respuesta dice `enviados: 12` y puede que hayan salido 9.

> Es exactamente la familia de B1.4 — informar éxito sobre una operación que no ocurrió. Ahí era un `DELETE` que RLS negaba; acá es un envío que nunca se intentó.

**Cuántos pacientes están en esa situación:**

```sql
SELECT count(*) FILTER (WHERE email IS NULL OR email = '') AS sin_email,
       count(*) AS total
FROM pacientes WHERE tenant_id = '2845c423-affa-4ca2-9c5f-f4ec8e35701a';
```

## 2.2 🔴 El `select` de tenants está roto y cae al fallback

`send-recordatorios/route.ts:71` y `:85`

```ts
.select('id, nombre, direccion, telefono, custom_domain, logoUrl, primaryColor, secondaryColor, accentColor, whatsappTemplate')
```

**Las columnas reales son minúsculas:** `logourl`, `primarycolor`, `secondarycolor`, `accentcolor`, `whatsapptemplate`. PostgREST distingue mayúsculas y devuelve error `42703`.

**Y el error no se mira:**

```ts
const { data: activeTenants } = await supabase.from('tenants')...
//     ↑ no se desestructura `error`

if (activeTenants && activeTenants.length > 0) { ... }
else { tenantsToProcess = [{ id: DEFAULT_TENANT_ID, nombre: '' }] }   // ← acá cae
```

**Evidencia de que es un error y no una suposición mía:** todas las demás rutas del proyecto piden estas columnas en minúscula. `cuidados/enviar/route.ts` usa `select('nombre, direccion, logourl, accentcolor')`. **`send-recordatorios` es la única en camelCase.**

### Consecuencias hoy, con una sola clínica

Los recordatorios **igual salen** —`DEFAULT_TENANT_ID` es tu consultorio— pero con el branding de fallback:

- Nombre: **"Consultorio Dental"**, no el de tu clínica
- Sin logo, sin dirección, sin teléfono
- `urlDeClinica()` recibe un objeto sin `custom_domain` ni subdominio

Ese último punto **anula la corrección documentada en las líneas 109-111**, que dice textualmente que antes los links salían por la URL de la plataforma y el paciente terminaba en el sitio de otra clínica con su token a cuestas. El arreglo está escrito; el `select` roto lo desactiva.

### Comprobalo en diez segundos

**Abrí cualquier recordatorio que haya llegado.** Si dice *"Consultorio Dental"* y no tiene tu logo, el defecto está confirmado.

### Consecuencia con dos clínicas

**Grave.** El fallback procesa **un solo tenant hardcodeado**. La segunda clínica no recibiría ningún recordatorio, y nada lo avisaría.

## 2.3 🟠 Un fallo de Resend no se reintenta ni se notifica

Se registra `estado_envio = 'fallido'` y ahí termina. **Nadie mira esa tabla.** No hay reintento, ni alerta, ni resumen diario.

Un paciente que no recibió su recordatorio se entera faltando al turno.

## 2.4 🟠 Envío en paralelo contra un límite de 10/segundo

```ts
await Promise.allSettled(citas.map(async (cita) => { ... await resend.emails.send(...) }))
```

`Promise.allSettled` dispara **todos los envíos a la vez**. Resend limita a **10 solicitudes por segundo** por equipo; la número 11 en esa ventana recibe **429**.

**Con más de 10 turnos mañana, los que sobran fallan.** Es la causa que mejor explica *"a uno no le llegó"* mientras al resto sí.

```sql
-- ¿Cuántos turnos por día se procesan?
SELECT date(fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires') AS dia,
       count(*) AS turnos
FROM citas
WHERE estado IN ('pendiente','confirmado')
  AND fecha_hora > now() - interval '30 days'
GROUP BY 1 ORDER BY 1 DESC LIMIT 15;
```

**Si algún día pasa de 10, ahí está tu respuesta.**

## 2.5 🟡 Cuota diaria de Resend

El plan gratuito permite **100 emails por día y 3.000 por mes**, y ese cupo lo comparten recordatorios, campañas de CRM, briefing diario, confirmaciones y facturas.

```sql
SELECT date(enviado_en) AS dia, count(*)
FROM recordatorios_log
WHERE enviado_en > now() - interval '15 days'
GROUP BY 1 ORDER BY 1 DESC;
```

Sumale el resto de los envíos. Si te acercás a 100, los últimos del día se rechazan.

---

# 3 · Causas probables, ordenadas

## 3.1 🥇 El turno se cargó después de que corrió el cron

**Los recordatorios son solo del día anterior**, y salen entre las 8 y las 9 de la mañana.

**Un turno cargado hoy a las 10:00 para mañana nunca recibe recordatorio.** No hay una segunda pasada. No es un fallo: es un hueco de diseño, y es la explicación más frecuente.

**Verificalo:** si `creado_en` de la cita es posterior a las 08:00 del día previo al turno, es esto.

```sql
SELECT c.creado_en, c.fecha_hora, p.nombre
FROM citas c JOIN pacientes p ON p.id = c.paciente_id
WHERE p.nombre ILIKE '%APELLIDO%'
ORDER BY c.fecha_hora DESC LIMIT 5;
```

## 3.2 🥈 El estado de la cita no era `pendiente` ni `confirmado`

```ts
.in('estado', ['pendiente', 'confirmado'])
```

Cualquier otro estado se salta **en silencio**.

```sql
SELECT estado, count(*) FROM citas GROUP BY 1 ORDER BY 2 DESC;
```

Si aparece un estado fuera de esos dos, decidí si debería recibir recordatorio.

## 3.3 🥉 429 de Resend por el envío en paralelo

Ver §2.4. Deja rastro: `estado_envio = 'fallido'`.

## 3.4 El email salió y no llegó al buzón

Si hay `resend_email_id`, **Resend lo aceptó**. Buscá ese ID en el panel de Resend: te dice si rebotó, si fue marcado como spam o si quedó entregado.

Causas habituales: dominio remitente sin verificar, SPF/DKIM incompletos, o el proveedor del paciente filtrando por reputación. El texto *"no respondas este email"* con un `from` no monitoreado también empuja a spam.

## 3.5 El cron no corrió

Los crons del plan Hobby son **best effort**: se observaron a las 11:17 y 11:59 UTC para uno programado a las 11:00. Pueden saltearse.

**Si nadie recibió el recordatorio ese día, es esto.** Verificable en Vercel → Logs, filtrando `/api/cron`.

---

# 4 · Qué arreglar, por orden

| | Qué | Esfuerzo | Por qué |
|---|---|---|---|
| **1** | **Minúsculas en el `select` de tenants** y desestructurar `error` | 5 min | Recupera el branding y el dominio propio. **Imprescindible antes de la segunda clínica** |
| **2** | **Registrar los saltos** en `recordatorios_log` con `estado_envio='omitido'` y no contarlos como enviados | 20 min | Hoy las fallas son invisibles |
| **3** | **Serializar los envíos** o limitarlos a 5 concurrentes | 20 min | Elimina los 429 |
| **4** | **Segunda pasada** del cron a media tarde para turnos cargados el mismo día | 30 min | Cierra §3.1, la causa más frecuente |
| **5** | **Alerta** si `fallido + omitido > 0` en el briefing diario | 30 min | Enterarte vos, no el paciente |
| **6** | Reintento con backoff ante 429 y 5xx | 1 h | Robustez |

**El 1 es de cinco minutos y no puede esperar al segundo cliente.**

---

# 5 · Lo que está bien

No todo es defecto, y conviene no tocarlo:

- **No hay duplicación.** Verificado sobre 9 días: `por_cita = 1.00`
- **El email se envía antes de escribir el log**, así que un fallo del log no impide el envío
- **La ventana de fechas es correcta.** El cálculo con `toLocaleString` y las constantes 3 / 02:59:59 produce 00:00–23:59 hora argentina *porque el servidor corre en UTC*. Funciona en Vercel — pero es frágil: correrlo local en una máquina en horario argentino desplaza la ventana tres horas
- **La autorización es sólida:** `Bearer` con `timingSafeEqual` para el cron, y pertenencia a `tenant_users` para el usuario logueado
- **El aislamiento por tenant en la consulta de citas es correcto:** `.eq('tenant_id', tenant.id)`
