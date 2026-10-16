# Auditoría pre-lanzamiento — DentalDesk

**Fecha:** 30/07/2026 · **Alcance:** fugas de datos, estructura, deuda técnica
y bloqueantes para abrir el SaaS a clientes pagos.

Todo lo que sigue está verificado contra el código de este repo (commit
`e73c10e`), no inferido de la documentación. Cuando un hallazgo contradice lo
que dice un `.md` del repo, lo aclaro.

---

## Resumen ejecutivo

**El código está mejor de lo que suele estar un SaaS de un solo desarrollador.**
224 tests pasan, `tsc --noEmit` limpio, RLS activo en 25 tablas, el webhook de
MercadoPago verifica firma HMAC en tiempo constante, el bucket de fotos clínicas
es privado y hay tests que leen el propio código fuente para impedir que vuelvan
bugs de multi-tenant. Eso es disciplina poco común.

**Pero hay 5 cosas que hay que arreglar antes de cobrarle a la segunda clínica.**
Ninguna es un rediseño; todas se resuelven en 1–2 días de trabajo. Dos de ellas
son fugas reales de datos de salud, y en Argentina eso cae bajo la Ley 25.326
(datos sensibles) y la Ley 26.529 (historia clínica).

| # | Hallazgo | Severidad | Esfuerzo |
|---|---|---|---|
| 1 | Sentry envía PII de pacientes a un tercero (`sendDefaultPii: true`, sampling 100%) | 🔴 Crítica | 1 h |
| 2 | Next.js 14.2.29 con CVEs altos sin parchear (SSRF en middleware, cache poisoning, XSS) | 🔴 Crítica | 2 h |
| 3 | Sin cabeceras de seguridad: el token del paciente se filtra por `Referer` | 🔴 Crítica | 2 h |
| 4 | RLS no distingue roles: una secretaria ve toda la facturación de la clínica | 🟠 Alta | 4 h |
| 5 | `xlsx` (SheetJS) con prototype pollution sin fix, y procesa archivos que sube el usuario | 🟠 Alta | 3 h |
| 6 | Rate limiting en memoria: no frena fuerza bruta real en serverless | 🟡 Media | 2 h |
| 7 | Token de paciente permanente, sin expiración por defecto ni rotación | 🟡 Media | 3 h |
| 8 | Sin backups: Supabase Free no hace ninguno | 🟠 Alta | 0 h (es plata) |
| 9 | Componentes de 2.000 líneas, 22 de 26 páginas son `use client` | 🟡 Media | continuo |
| 10 | `ESTADO-PROYECTO.md` desactualizado (migraciones "pendientes" que ya se movieron) | 🟢 Baja | 15 min |

---

## 1. 🔴 Sentry se lleva los datos de los pacientes

**Dónde:** `sentry.server.config.ts:18`, `sentry.edge.config.ts:19`,
`src/instrumentation-client.ts:17`.

```ts
sendDefaultPii: true,
tracesSampleRate: 1,
```

**Qué significa exactamente.** `sendDefaultPii: true` le dice a Sentry que
adjunte a cada evento la IP del usuario, las cookies, las cabeceras HTTP y —en
el SDK de Next— la URL completa de la request. Con `tracesSampleRate: 1` eso no
pasa solo cuando hay un error: pasa en **el 100% de las requests**.

La consecuencia concreta en esta app:

- Cada visita al portal del paciente manda a Sentry la URL
  `/paciente/<token-uuid>`. **Ese token es la credencial completa del portal.**
  Cualquiera con acceso al proyecto de Sentry —o un breach de Sentry— puede
  abrir la historia clínica de cualquier paciente que haya entrado alguna vez.
- Lo mismo con `/firmar/<token>` (consentimientos informados) y
  `/api/consentimientos/pdf/[id]`.
- Las cookies de sesión de Supabase de los odontólogos viajan en cada traza.
- Los datos van a servidores de Sentry en EE.UU. Transferencia internacional de
  datos de salud sin base legal ni consentimiento del paciente.

**Arreglo:**

```ts
// en los tres archivos de config de Sentry
sendDefaultPii: false,
tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

beforeSend(event) {
  // Nunca mandar tokens de paciente ni de firma, ni siquiera en la URL.
  const limpiar = (u?: string) =>
    u?.replace(/\/(paciente|firmar)\/[0-9a-f-]{36}/gi, '/$1/[REDACTADO]')
  if (event.request?.url) event.request.url = limpiar(event.request.url)!
  delete event.request?.cookies
  delete event.request?.headers
  return event
},
```

Bonus: con sampling al 10% dejás de quemar la cuota gratuita de Sentry en el
primer mes.

---

## 2. 🔴 Next.js 14.2.29 con vulnerabilidades altas

`npm audit --omit=dev` devuelve 17 vulnerabilidades, 6 de severidad alta. Las
que importan para esta app:

- **GHSA-4342-x723-ch2f** — SSRF por manejo incorrecto de redirects en
  middleware. Este proyecto **tiene** middleware con un `NextResponse.redirect`
  construido desde el header `Host` (`src/middleware.ts:20`). Es exactamente el
  patrón afectado.
- **GHSA-3g8h-86w9-wvmq** — los redirects del middleware se pueden envenenar en
  caché. Un atacante podría hacer que la CDN sirva una respuesta suya a otros
  usuarios.
- **GHSA-ffhc-5mcf-pf4q** — XSS en App Router con nonces de CSP.
- **GHSA-ggv3-7p47-pfv8** — HTTP request smuggling en rewrites.

**Arreglo:** subir a la última 14.2.x (o planificar el salto a 15). Es un cambio
de versión de parche dentro de la misma minor, riesgo bajo:

```bash
npm i next@^14.2.35
npm run typecheck && npm run test && npm run build
```

Después corré `npm audit fix` para `ws`, `qs` y `uuid` (los tres tienen fix sin
breaking changes).

---

## 3. 🔴 No hay ninguna cabecera de seguridad

`next.config.js` no define `headers()`. La app se sirve sin `Strict-Transport-Security`,
sin `X-Frame-Options`, sin `Referrer-Policy`, sin `X-Content-Type-Options` y sin CSP.

**El impacto real no es teórico.** El modelo de acceso del portal es
*token-en-la-URL*: `/paciente/1f4c…-…`. Sin `Referrer-Policy`, el navegador manda
esa URL completa en el header `Referer` a **cualquier dominio externo** que la
página cargue: fuentes, scripts, imágenes, píxeles de analytics. Y si el paciente
hace clic en un link saliente desde el portal, el sitio de destino recibe su
token de historia clínica en los logs.

Es la misma clase de fuga que el punto 1, por otra vía.

**Arreglo** — en `next.config.js`, antes de envolver con Sentry:

```js
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        // 'no-referrer' a secas: ninguna URL de esta app debería salir nunca.
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
      ],
    }]
  },
}
```

CSP dejala para después: con 22 páginas `use client` y estilos inline vas a
romper cosas. Las cinco cabeceras de arriba son gratis y cubren el 80%.

Complementario: agregá `rel="noreferrer"` a todo link externo que salga de
`/paciente/[token]` y `/firmar/[token]`.

---

## 4. 🟠 Una secretaria puede ver (y borrar) toda la facturación

**El chequeo de rol existe, pero solo en la capa de API.** Ejemplos correctos:

- `src/app/api/pacientes/exportar/route.ts:19` — exige `admin` u `owner`.
- `src/app/api/facturacion/anular/route.ts:41` — idem.
- `src/app/api/billing/cancelar/route.ts:40` — idem.

**Las políticas RLS, en cambio, no miran el rol.** Todas siguen este patrón
(`supabase/migrations/20260722120000_remote_schema.sql:1454`):

```sql
CREATE POLICY "tenant_isolation_costos_fijos" ON costos_fijos
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));
```

Es decir: **cualquier miembro de la clínica, con cualquier rol.**

Y `src/app/finanzas/page.tsx` es `'use client'` y consulta Supabase directo desde
el navegador, sin pasar por ninguna API:

```ts
// finanzas/page.tsx:109-112
supabase.from('costos_fijos').select('*').eq('tenant_id', tenant.id)
supabase.from('ingresos_manuales').select('*')...
supabase.from('egresos_manuales').select('*')...
// y líneas 290-315: insert, update y delete, también desde el cliente
```

Resultado: una usuaria con rol `staff` (secretaria) que abra `/finanzas` ve la
rentabilidad completa del consultorio, y puede **borrar** costos e ingresos.
Tampoco hay gate de rol en la UI ni en el `Sidebar` — el link está a la vista.

No es un cruce entre clínicas (eso está bien resuelto), pero sí una escalada de
privilegios *dentro* de la clínica. Para vender a consultorios con equipo, esto
es un problema comercial además de técnico: es lo primero que va a preguntar un
odontólogo con dos empleadas.

**Arreglo (elegí uno, no los dos):**

*Opción A — RLS con rol (recomendada).* Una función y policies nuevas:

```sql
CREATE OR REPLACE FUNCTION public.rol_en_tenant(t uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = t LIMIT 1
$$;

DROP POLICY IF EXISTS "tenant_isolation_costos_fijos" ON costos_fijos;
CREATE POLICY "finanzas_solo_admin" ON costos_fijos TO authenticated
  USING      (public.rol_en_tenant(tenant_id) IN ('owner','admin'))
  WITH CHECK (public.rol_en_tenant(tenant_id) IN ('owner','admin'));
```

Repetir para `ingresos_manuales`, `egresos_manuales`, `meta_mensual`,
`facturas`, `presupuestos`. La defensa queda en la base: aunque mañana escribas
una página nueva y te olvides del chequeo, no se filtra.

*Opción B — mover finanzas a server.* Convertir `/finanzas` en Server Component
que lea por API con `requireRol()`. Más trabajo, y deja la base igual de
permisiva para el próximo descuido.

Además: exponé el rol en `TenantContext` y ocultá los links de Finanzas,
Facturación y Configuración para `staff`. Es cosmético (la seguridad real es la
RLS), pero evita que la secretaria vea pantallas que le van a tirar error.

---

## 5. 🟠 `xlsx` (SheetJS) tiene prototype pollution y no hay parche

```
xlsx  *   Severity: high
  Prototype Pollution in sheetJS — GHSA-4r6h-8v6p-xvw6
  ReDoS — GHSA-5pgg-2g8v-p4x9
  No fix available
```

Lo grave es **dónde** se usa: `src/app/api/pacientes/importar/route.ts` parsea
planillas que sube el usuario. Es la superficie de ataque exacta que describen
los advisories. El paquete `xlsx` de npm está congelado hace años; SheetJS
publica las versiones parcheadas solo en su propio CDN.

**Arreglo, dos caminos:**

1. **Rápido** — apuntar al CDN oficial en `package.json`:
   `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`.
   Elimina el advisory, misma API, cero cambios de código. Contra: no resuelve
   desde el registry de npm (hay que verificar que el build de Vercel lo baje).
2. **Sólido** — migrar a `exceljs` para leer, y dejar `xlsx` fuera. Es más
   trabajo (la API es distinta) pero el paquete está mantenido.

En cualquier caso, en el endpoint de importación: limitar el tamaño del archivo
(hoy no hay tope explícito), validar la extensión y envolver el parseo en un
try/catch que no filtre el stack al cliente.

---

## 6. 🟡 El rate limiting no limita gran cosa

`src/lib/rate-limit.ts` usa un `Map` en memoria del proceso. El propio comentario
lo admite. En Vercel, cada invocación puede caer en una instancia distinta: si hay
10 instancias tibias, el límite efectivo de 30/min pasa a ser 300/min. Y un cold
start reinicia el contador a cero.

Para el endpoint que más importa —`/api/paciente/[token]`, que protege historias
clínicas contra fuerza bruta de tokens— eso no alcanza.

Ojo: adivinar un UUID v4 es inviable (122 bits), así que **no es una brecha
inminente**. Es defensa en profundidad que hoy no está donde creés que está.

**Arreglo barato:** Upstash Redis tiene un free tier de 10.000 comandos/día, que
te sobra. `@upstash/ratelimit` mantiene una interfaz casi idéntica a la actual,
así que el cambio es de una función. Costo: USD 0.

**Arreglo gratis-gratis:** si no querés otra dependencia, contá los accesos
fallidos en una tabla de Postgres con un índice por IP + ventana. Más lento pero
compartido entre instancias.

---

## 7. 🟡 El token del paciente no vence

`src/app/api/paciente/[token]/route.ts:67` **sí** respeta `token_expira` — bien.
Pero `supabase_migration_security_fix.sql:51` deja el campo en `NULL` para todos
los pacientes existentes, y el código lo trata como "válido para siempre"
(línea 53 del SQL lo dice explícitamente). Y en los seis lugares donde se genera
un token (`pacientes/page.tsx:99`, `dashboard/page.tsx:86`, `agenda/page.tsx:1537`,
`NuevaCitaModal.tsx:183`, `reserva/crear/route.ts:145`, `importar/route.ts:105`)
**ninguno setea `token_expira`**.

O sea: en la práctica, hoy todos los links de paciente son eternos. Un link que
un paciente reenvió por WhatsApp en 2025 sigue abriendo su historia clínica.

**Arreglo:** al generar el token, `token_expira: now() + 90 días`. Y en el portal,
cuando el token está vencido, mostrar un botón "pedir link nuevo" que dispare un
mail al consultorio en vez de un 410 seco. Además, un job que rote los tokens de
pacientes inactivos hace más de un año.

Detalle menor del mismo archivo: la rama de *fallback* (líneas 44–59, para cuando
la columna `token_expira` todavía no existe) fuerza `token_expira: null`, o sea
desactiva la expiración. Ya corriste la migración, así que ese fallback es código
muerto peligroso: borralo.

---

## 8. 🟠 No hay backups

Supabase Free **no hace backups de ningún tipo** y pausa el proyecto tras una
semana sin actividad. Estás guardando historias clínicas —que por Ley 26.529 hay
que conservar 10 años— en una base sin copia de respaldo.

Esto no es un bug: es una línea del presupuesto. Supabase Pro (USD 25/mes)
incluye snapshots diarios con 7 días de retención. Está detallado en
`PLAN-NAXAD.md`.

Mientras tanto, hoy mismo: `pg_dump` semanal a Google Drive con un cron. Diez
minutos de trabajo y dormís mejor.

---

## 9. 🟡 Estructura: buena base, componentes obesos

**Lo que está bien resuelto** (y conviene no tocar):

- `src/lib/` con reglas de negocio puras y testeadas. `planes.ts` como única
  fuente de la grilla comercial es una decisión correcta y poco frecuente.
- `guardas-multitenant.test.ts` — tests que leen el código fuente y fallan si
  vuelve un patrón peligroso. Esto es infraestructura de calidad de verdad.
- `rutas-publicas.ts` como lista única compartida entre middleware y
  `SubscriptionGate`, con test que impide que alguien vuelva a duplicarla.
- Separación limpia entre config de plataforma (`lib/config.ts`) y config por
  clínica (tabla `tenants`).

**Lo que va a doler cuando entren más clientes:**

| Archivo | Líneas |
|---|---|
| `pacientes/[id]/page.tsx` | 2.094 |
| `agenda/page.tsx` | 1.817 |
| `paciente/[token]/page.tsx` | 1.179 |
| `dashboard/page.tsx` | 902 |
| `finanzas/page.tsx` | 871 |

Un componente de 2.000 líneas no es un problema de estética: es un archivo que no
podés modificar sin releer entero, y donde un bug de estado se esconde bien. Son
además `'use client'` completos (22 de 26 páginas), lo que explica el LCP de la
web pública que menciona `ESTADO-PROYECTO.md`.

**No refactorices por refactorizar.** La regla útil: cuando toques una de estas
páginas por otro motivo, extraé la sección que estabas tocando a su propio
componente en `src/components/`. En tres meses el archivo bajó a la mitad sin
haber parado nunca a "refactorizar".

Prioridad si querés atacarlo de frente: `pacientes/[id]` primero (es la pantalla
donde el odontólogo pasa el día) y `agenda` después.

**Cobertura de tests.** 224 tests, todos en `src/lib/`. Cero tests de componentes
y cero de rutas de API. Con las reglas de negocio cubiertas ya estás mejor que la
media, pero los endpoints de facturación ARCA no tienen ni un test: son los que
emiten comprobantes con validez fiscal. Un test que verifique que `esSimulada`
es `false` cuando hay credenciales, y que el CAE ficticio de
`emitir/route.ts:180` nunca se puede colar en producción, vale la pena.

---

## 10. 🟢 Documentación desincronizada

`ESTADO-PROYECTO.md` dice:

> Correr en Supabase las migraciones que falten: `supabase_migration_recall.sql`,
> `supabase_migration_crm_automatizacion.sql`, `supabase_migration_cuidados.sql`.
> `git push` de los últimos commits.

Ninguno de esos archivos existe ya: se movieron a `supabase/migrations/`
(`20260724164544_recall.sql`, etc.). Y `git log origin/main..HEAD` está vacío:
no hay nada sin pushear.

Es cosmético, pero cuando el `.md` de handoff miente, dejás de confiar en todos.
Actualizalo y borrá los `supabase_migration_*.sql` de la raíz que ya migraron a
`supabase/migrations/` (hoy conviven las dos convenciones y no se sabe cuál manda).

---

## Orden de ejecución sugerido

**Antes del segundo cliente pago (1 día de trabajo):**

1. Sentry: `sendDefaultPii: false` + `beforeSend` que borra tokens. (1 h)
2. `npm i next@^14.2.35` + `npm audit fix`. (2 h con testing)
3. Cabeceras de seguridad en `next.config.js`. (2 h)
4. Supabase Pro. Backups. (5 min y USD 25)

**Antes de vender a clínicas con equipo (1 día más):**

5. RLS por rol en las tablas de finanzas + ocultar links a `staff`.
6. `token_expira` al generar tokens + borrar el fallback muerto.
7. `xlsx` al CDN oficial + límite de tamaño en la importación.

**Cuando haya tráfico (no antes):**

8. Rate limit a Upstash.
9. Tests de las rutas de facturación.
10. Adelgazar `pacientes/[id]` y `agenda` oportunísticamente.

---

## Lo que revisé y está bien

Para que no vuelvas a auditarlo:

- ✅ Ningún secreto versionado. `.gitignore` cubre `.env*.local` y
  `.env.sentry-build-plugin`. Solo `.env.example` está en git, sin valores.
- ✅ `SUPABASE_SERVICE_ROLE_KEY` aparece en 21 archivos, **todos** bajo
  `src/app/api/` o `src/lib/admin.ts`. Nunca en un componente `'use client'`.
- ✅ El webhook de MercadoPago verifica la firma HMAC-SHA256 con
  `timingSafeEqual`, y rechaza los IDs `mock-` si `NODE_ENV === 'production'`.
- ✅ El webhook de Resend usa `svix` para validar.
- ✅ Bucket `fotos_clinicas` privado, servido con URLs firmadas, con policies de
  `storage.objects` por `tenant_id`.
- ✅ RLS habilitado en 25 tablas. Las policies `USING (true)` son las tres de
  `service_role`, que es correcto.
- ✅ El endpoint del portal filtra campos sensibles del tenant antes de
  devolverlo al paciente (`SENSITIVE` en `paciente/[token]/route.ts:80`).
- ✅ Los tokens usan `crypto.randomUUID()` (CSPRNG), no `Math.random()`. Los
  `Math.random()` que quedan son confetti y el CAE del modo simulación.
- ✅ Los `console.error` de las rutas de API loguean `err.message`, no objetos
  de paciente completos. La única excepción menor: `recordatorios/route.ts:144`
  loguea el email del paciente.
- ✅ `tsc --noEmit` sin errores. 224/224 tests pasan en 2,8 s.
- ✅ Jobs de cron protegidos con `CRON_SECRET`.
- ✅ El service worker no cachea `/api/`, `/paciente/` ni `/firmar/`.

---

*Auditoría generada el 30/07/2026 contra el commit `e73c10e`.*
