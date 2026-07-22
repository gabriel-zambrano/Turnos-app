# Runbook de lanzamiento — DentalDesk (tu parte)

Todo lo de este documento lo hacés vos, fuera del código. Está ordenado por
prioridad de lanzamiento. Cada bloque tiene los comandos exactos para copiar y
pegar. Reemplazá lo que está entre `<...>` por tus valores reales.

> Convención: `PROD_REF` = el "Project ref" de tu proyecto Supabase de
> producción (lo ves en Dashboard → Project Settings → General → Reference ID).

---

## Parte 0 — Prerequisitos (una sola vez)

- **Node y git**: ya los tenés.
- **Docker Desktop**: necesario SOLO para el workflow de migraciones del CLI
  (`supabase db pull` levanta un Postgres local para comparar). Descarga gratis
  en https://www.docker.com/products/docker-desktop/. Si no querés instalar
  Docker, saltá a la **Parte 1-B** (camino sin Docker).
- **Cliente de Postgres** (`psql` y `pg_dump`): para los backups.
  - Mac: `brew install libpq && brew link --force libpq`
  - Windows: instalá "PostgreSQL" y usá los binarios de `bin/`.

---

## Parte 1-A — Versionar el esquema con Supabase CLI (con Docker)

Objetivo: convertir tus 18 SQL sueltos en migraciones versionadas y
reproducibles. Se hace **una sola vez** para tomar el estado actual como base.

```bash
# 1. Instalar el CLI como dependencia de dev del proyecto
cd <carpeta-del-proyecto>
npm install --save-dev supabase

# 2. Iniciar sesión (abre el navegador)
npx supabase login

# 3. Inicializar la config del CLI en el repo (crea la carpeta supabase/)
npx supabase init

# 4. Linkear tu proyecto de producción
npx supabase link --project-ref <PROD_REF>
#    Te va a pedir la contraseña de la base (Dashboard → Project Settings →
#    Database → Database password). Si no la recordás, reseteala ahí.

# 5. Traer el esquema actual como migración base (necesita Docker corriendo)
npx supabase db pull
#    Esto crea supabase/migrations/<timestamp>_remote_schema.sql con TODO tu
#    esquema actual, y lo marca como "ya aplicado" en producción.

# 6. Commitear la base al repo
git add supabase/
git commit -m "chore(db): baseline de migraciones desde producción (Supabase CLI)"
```

**De acá en adelante, cada cambio de base se hace así (nunca más pegando SQL a mano):**

```bash
npx supabase migration new <nombre_descriptivo>   # crea un archivo .sql vacío
# ... editás el archivo en supabase/migrations/ con tu SQL ...
npx supabase db push                              # lo aplica a producción linkeada
git add supabase/ && git commit -m "db: <qué cambió>"
```

---

## Parte 1-B — Alternativa SIN Docker (si no instalás Docker)

No podés usar `db pull`, pero igual versionás todo de forma ordenada:

1. Creá la carpeta `supabase/migrations/` en el repo.
2. Copiá tus 18 archivos `supabase_migration_*.sql` ahí, renombrados con el
   formato que espera el CLI: `<AAAAMMDDHHMMSS>_<nombre>.sql`
   (ej: `20260702110000_perf_1_indices.sql`), **en el orden en que los corriste**.
3. Commitealo. Ya tenés un historial reproducible y legible, aunque lo apliques
   a mano. Para futuros cambios podés seguir con `npx supabase migration new` +
   `npx supabase db push` (push NO necesita Docker).

---

## Parte 2 — Entorno de staging (gratis)

Objetivo: probar migraciones y deploys sin tocar producción.

**2.1 — Crear el proyecto de staging en Supabase**
1. Dashboard → New project → nombre `dentaldesk-staging` (free tier).
2. Anotá su `Project ref` → lo llamamos `STAGING_REF`.

**2.2 — Aplicarle el mismo esquema que producción**
```bash
npx supabase link --project-ref <STAGING_REF>
npx supabase db push          # aplica todas las migraciones versionadas a staging
# Cuando termines de probar, volvé a linkear producción:
npx supabase link --project-ref <PROD_REF>
```

**2.3 — Deploy de staging en Vercel**
- Opción simple: en Vercel, creá un segundo proyecto apuntando al mismo repo
  pero a la rama `staging` (creá esa rama en git). En sus Environment Variables
  usá las claves del proyecto Supabase de **staging** (ver Parte 4).
- Así, `staging` deploya contra la base de staging y `main` contra producción.

---

## Parte 3 — Backup y restore PROBADO (gratis, con pg_dump)

Un backup que nunca restauraste no es un backup. Hacelo al menos una vez.

**3.1 — Conseguir el connection string**
Dashboard → Connect (botón arriba) → "Connection string" → URI. Se ve así:
`postgresql://postgres.<ref>:<password>@aws-0-xx.pooler.supabase.com:5432/postgres`

**3.2 — Hacer el dump completo (esquema + datos)**
```bash
pg_dump "<CONNECTION_STRING_DE_PRODUCCION>" \
  --no-owner --no-privileges \
  -f backup_prod_$(date +%Y%m%d).sql
```

**3.3 — Probar el restore contra STAGING**
```bash
# CUIDADO: esto sobreescribe staging, nunca lo corras contra producción.
psql "<CONNECTION_STRING_DE_STAGING>" -f backup_prod_$(date +%Y%m%d).sql
```

**3.4 — Verificar que restauró bien**
```bash
psql "<CONNECTION_STRING_DE_STAGING>" -c "SELECT count(*) FROM pacientes;"
psql "<CONNECTION_STRING_DE_STAGING>" -c "SELECT count(*) FROM citas;"
```
Si los números tienen sentido, tu backup/restore funciona. Guardá el `.sql` en
un lugar seguro (NO en el repo git — puede tener datos de pacientes).

> Recomendación: automatizá este dump semanal. En Supabase, el backup diario
> automático con recuperación punto-en-tiempo viene con el plan Pro (~USD 25/mes);
> mientras estés en free tier, este `pg_dump` manual es tu red.

---

## Parte 4 — Variables de entorno (checklist)

Estas van en Vercel (Project → Settings → Environment Variables), una vez para
**producción** y otra para **staging** (con las claves del proyecto que
corresponda). Referencia: `.env.example` del repo.

| Variable | De dónde sale | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard → Connect | Distinta en prod vs staging |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → API keys | Pública (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → API keys | **Secreta**, solo server |
| `NEXT_PUBLIC_APP_URL` | Tu dominio | Sin barra final |
| `NEXT_PUBLIC_DEFAULT_TENANT_ID` | ID del tenant por defecto | Opcional |
| `RESEND_API_KEY` | Panel de Resend | |
| `RESEND_WEBHOOK_SECRET` | Panel de Resend | |
| `CRON_SECRET` | Generá uno: `openssl rand -hex 32` | Ver Parte 5 |
| `SYNC_SHEET_SECRET` | Generá uno: `openssl rand -hex 32` | |
| `MERCADOPAGO_ACCESS_TOKEN` | Panel de MercadoPago | Usá credenciales de PROD al lanzar |
| `MERCADOPAGO_WEBHOOK_SECRET` | Panel MP al configurar el webhook | Valida la firma |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Cloud (opcional) | Solo si usás sync a Sheets |
| `GOOGLE_PRIVATE_KEY` | Google Cloud (opcional) | Con `\n` escapados |
| `GOOGLE_SHEET_ID` | ID de la planilla (opcional) | |

---

## Parte 5 — Cerrar la config de producción

**5.1 — CRON_SECRET (ya lo exige el código nuevo)**
1. Generá el valor: `openssl rand -hex 32`
2. Cargalo como `CRON_SECRET` en Vercel (prod).
3. Los crons de Vercel (`/api/cron`, `/api/daily-briefing`) mandan
   automáticamente `Authorization: Bearer $CRON_SECRET`, así que con setear la
   variable ya quedan autenticados. No hace falta tocar `vercel.json`.

**5.2 — Webhook de MercadoPago**
1. Panel de MP → tu aplicación → Webhooks → URL:
   `https://<tu-dominio>/api/webhooks/mercadopago`
2. Copiá la "clave secreta" que te da MP y cargala como
   `MERCADOPAGO_WEBHOOK_SECRET` en Vercel.
3. Probá el ciclo completo en staging con credenciales de prueba de MP:
   registro → trial → pago → renovación → **vencimiento** (verificá que el gate
   de suscripción que ya está en el código bloquea el acceso al vencer).

**5.3 — Webhook de Resend** (si usás tracking de emails)
- Panel de Resend → Webhooks → URL `https://<tu-dominio>/api/webhooks/resend`,
  y cargá el secret como `RESEND_WEBHOOK_SECRET`.

---

## Parte 6 — Verificaciones finales de seguridad

**6.1 — Ninguna tabla con `tenant_id` sin RLS** (corré en el SQL Editor de prod)
```sql
SELECT c.relname AS tabla, c.relrowsecurity AS rls_activado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_name = c.relname AND col.column_name = 'tenant_id'
  )
ORDER BY rls_activado, tabla;
```
Cualquier fila con `rls_activado = false` es una fuga entre clínicas: hay que
activarle RLS y su política antes de lanzar.

**6.2 — CI en verde**
- Al hacer push a GitHub, verificá que el Action "CI" pase (typecheck + 43 tests).
- Los tests corren solos; no necesitás configurar nada.

---

## Checklist de lanzamiento

- [ ] Migraciones versionadas y commiteadas (Parte 1)
- [ ] Proyecto de staging creado y con el esquema aplicado (Parte 2)
- [ ] Deploy de staging en Vercel apuntando a la base de staging (Parte 2.3)
- [ ] Backup hecho Y restore probado contra staging (Parte 3)
- [ ] Todas las env vars cargadas en prod y en staging (Parte 4)
- [ ] `CRON_SECRET` seteado en prod (Parte 5.1)
- [ ] Webhook de MercadoPago configurado y ciclo de pago probado en staging (5.2)
- [ ] Query de verificación RLS sin filas en rojo (Parte 6.1)
- [ ] CI en verde en GitHub (Parte 6.2)
- [ ] Revisión legal de privacidad para datos de salud (bloqueante externo)
