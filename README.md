# DentalDesk

SaaS multi-tenant de gestión odontológica: agenda, ficha clínica con odontograma,
portal del paciente, facturación electrónica ARCA, CRM y analítica.

En producción con un consultorio real (Od. Walter Benegas), abriéndose como
producto multi-cliente.

**Stack:** Next.js 14 (App Router) · Supabase (Postgres + Auth + Storage) ·
Vercel · Resend (emails) · MercadoPago (suscripciones) · AfipSDK (ARCA).

---

## Arranque local

```bash
npm install
cp .env.example .env.local   # completar las variables (ver abajo)
npm run dev                  # http://localhost:3000
```

Antes de commitear, siempre:

```bash
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
```

---

## Variables de entorno

Están todas documentadas en `.env.example`. Las mínimas para levantar el
proyecto:

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública (cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio (solo server-side, **nunca** al cliente) |
| `NEXT_PUBLIC_APP_URL` | URL pública, sin barra final |
| `NEXT_PUBLIC_DEFAULT_TENANT_ID` | Clínica por defecto en desarrollo |

El resto habilita funciones concretas y se puede dejar vacío mientras no se usen:
`RESEND_*` (emails), `MERCADOPAGO_*` (suscripciones), `ARCA_*` (facturación),
`WHATSAPP_*` (campañas), `GOOGLE_*` (sincronización con Sheets),
`CRON_SECRET` y `SYNC_SHEET_SECRET` (autenticación de los jobs).

---

## Arquitectura

```
src/
├── app/
│   ├── (privadas)         dashboard, agenda, pacientes, bi, crm, finanzas…
│   ├── paciente/[token]   portal del paciente (público, sin cuenta)
│   ├── reserva/[clinica]  agendamiento online (público)
│   ├── precios, legal/    páginas públicas
│   └── api/               endpoints y jobs
├── components/            UI compartida y contexto de clínica
├── lib/                   reglas de negocio puras (testeadas)
└── types/
```

**Multi-tenant.** Cada clínica es una fila en `tenants`. La resolución por
subdominio ocurre en `TenantContext` (cliente), y el aislamiento real lo
garantizan las políticas RLS de Postgres: toda tabla con datos de clínica tiene
`tenant_id` y su policy.

**Dónde vive cada cosa.** Lo que cambia al instalar el sistema para otro dueño
va en `src/lib/config.ts` (variables de entorno). Lo que cambia por clínica
(nombre, dirección, colores, logo) sale de la tabla `tenants`.

**Reglas de negocio en `src/lib/`.** Planes y precios (`planes.ts`),
disponibilidad de turnos (`reserva.ts`), estado de suscripción
(`subscription.ts`), rate limiting (`rate-limit.ts`). Son funciones puras con
tests: si una regla se puede escribir sin tocar la base, va acá.

---

## Base de datos

Las migraciones son archivos `supabase_migration_*.sql` en la raíz, pensados
para correrse a mano desde el **SQL Editor de Supabase**, en orden cronológico.
Son idempotentes (`IF NOT EXISTS`), así que se pueden repetir sin romper nada.

Al clonar el proyecto contra una base nueva hay que correrlas todas. Al
actualizar, solo las que falten.

> **Ojo:** desplegar código que usa una tabla cuya migración no se corrió hace
> fallar la función en producción. Migración primero, deploy después.

---

## Jobs programados

Definidos en `vercel.json`, protegidos con `CRON_SECRET`:

| Job | Horario (UTC) | Qué hace |
|---|---|---|
| `/api/cron` | 11:00 | Recordatorios de turnos del día siguiente |
| `/api/daily-briefing` | 22:00 | Resumen diario por email a las clínicas con BI |
| `/api/crm-campanas` | 12:00 | Campañas de WhatsApp (cumpleaños, recall, reactivación) |

---

## Planes y features

La grilla comercial vive **solo** en `src/lib/planes.ts`: precios, cupos de
usuarios y qué incluye cada plan. El checkout, el webhook de MercadoPago, la
página `/precios` y los gates de la app leen todos de ahí.

Las columnas `feature_*` de `tenants` **no** son el interruptor: son concesiones
manuales que solo suman sobre lo que da el plan, para no revocarle una función a
una clínica que ya la venía usando. La decisión se toma al leer, con
`featureHabilitada()`.

Detalle y justificación de cada decisión en `DECISIONES-PRODUCTO.md`.

---

## Deploy

Push a `main` despliega en Vercel. Antes de pushear: typecheck, tests y correr
las migraciones pendientes en Supabase.

La app es PWA: se instala en el celular desde el navegador, sin App Store. El
service worker (`public/sw.js`) **no cachea nada de `/api/`, `/paciente/` ni
`/firmar/`**, porque son rutas con datos de salud.

---

## Documentación del repo

| Archivo | Contenido |
|---|---|
| `ESTADO-PROYECTO.md` | Handoff: qué está hecho y qué falta |
| `DECISIONES-PRODUCTO.md` | Decisiones de negocio y las que quedan pendientes |
| `PENDIENTES-ROADMAP.md` | Ideas y mejoras por área |
| `REVISION-MEJORAS-2026-07.md` | Auditoría verificada contra el código |
| `RUNBOOK-ARCA.md` | Certificados y facturación electrónica |
| `RUNBOOK-LANZAMIENTO.md` | Checklist de salida a producción |
