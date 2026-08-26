# DentalDesk · Operación

**Cosas que hay que saber para operar el sistema y que no se deducen del código.**

Última actualización: 25/08/2026.

---

## 1 · Recordatorios · hay dos caminos y solo uno funciona

**Verificado el 25/08 sobre 9 días de `recordatorios_log`: `por_cita = 1.00` todos los días. No hay duplicación.**

### El camino que funciona

```
Vercel Cron  0 11 * * *  →  /api/cron  →  /api/send-recordatorios
```

Coincide con los registros: el log de Vercel muestra `/api/cron` a las 08:17 (hora argentina) y `recordatorios_log` tiene sus filas a las 11:17 UTC, el mismo minuto.

### El camino muerto

```
pg_cron jobid 3 · "recordatorios-diarios" · 0 11 * * *
  → Edge Function `enviar-recordatorios`
```

**Corre todos los días y no escribe nada en `recordatorios_log`.**

⚠️ **NO LO REPARES sin verificar primero.** Es el candidato perfecto a que alguien lo encuentre, lo crea roto y lo "arregle" — y ahí **cada paciente empieza a recibir dos recordatorios**.

Su comando invoca `enviar-recordatorios`, una Edge Function que **no está en el repositorio** (`supabase/functions/` está vacío). Ese comando es el último rastro de que existe. **Por eso no se borra el job.**

**No se pudo desactivar:** `cron.alter_job` falla con `grant options cannot be granted back to your own grantor`, un conflicto del event trigger `issue_pg_cron_access` de Supabase. Y `UPDATE cron.job` da `permission denied`: Supabase revoca todo salvo `SELECT` a `postgres`.

### Horario real de los recordatorios

**Los crons de Vercel en plan Hobby son "best effort".** Se ejecutan dentro de la hora siguiente, no a la hora exacta. Observado: **11:17 y 11:59 UTC** para un cron programado a las 11:00.

**En hora argentina, los recordatorios salen entre las 8 y las 9 de la mañana.** No a las 8 en punto. Para recordatorios de turno da igual; si alguna vez hace falta precisión horaria, esto es un límite del plan.

### Los tres crons de Vercel

| Ruta | UTC | Argentina |
|---|---|---|
| `/api/cron` → recordatorios | `0 11 * * *` | ~8:00-9:00 |
| `/api/crm-campanas` | `0 12 * * *` | ~9:00-10:00 |
| `/api/daily-briefing` | `0 22 * * *` | ~19:00-20:00 |

**Todos los envíos son `email`.** No hay un solo registro de WhatsApp en 9 días, aunque la columna `tipo_mensaje` tenga ese default.

---

## 2 · Control N-1 · privilegios de `anon`

**Correr semanalmente y después de cada deploy.**

```sql
SELECT c.relname, c.relkind, array_to_string(c.relacl, E'\n') AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
  AND array_to_string(c.relacl, ',') LIKE '%anon%'
  AND c.relname <> 'tenants_public';
```

**Cero filas = sano.** Cualquier fila significa que R-18 reincidió.

**Criterio de cierre de R-18: cuatro semanas consecutivas en cero.** Anotar cada corrida en `P0-05_BITACORA.md`.

---

## 3 · Cuentas con acceso

| Email | Rol | Qué es |
|---|---|---|
| `odbenegaswalter@gmail.com` | **`owner`** | El titular del consultorio |
| `studioandbrand@gmail.com` | `admin` | **Cuenta de mantenimiento del proveedor** |

**La cuenta de mantenimiento es una decisión tomada, no un descuido.** Tiene acceso completo a historia clínica, fotos y facturación.

⚠️ **Pendiente:** declararla en `/legal/privacidad` antes del primer cliente ajeno.

⚠️ **Aparece listada en la pantalla de Equipo de la clínica.** Eso es transparencia y **no debe ocultarse**: esconder la cuenta de soporte empeora la situación en vez de mejorarla.

---

## 4 · Rollback

`~/rollback-dentaldesk/ROLLBACK-20260825.sql` — **fuera del repositorio a propósito.** Es una foto de un momento; commiteado, invita a que alguien lo aplique meses después cuando ya no describe nada.

Cuatro bloques independientes: R-12 · policies de `logos` · límites de buckets · las de `fotos_clinicas` (no requieren reversión).

**Antes de cada `db push` a producción, sacar un snapshot nuevo.**

---

## 5 · Reglas de despliegue

**`npx supabase db reset` es obligatorio antes de cada `db push`.**

El 25/08 encontró **tres defectos** en una migración que en producción habrían quedado invisibles, porque el estado previo los tapaba:

1. Asumía que las policies de `fotos_clinicas` existían en vez de crearlas — **reveló que nunca estuvieron versionadas**
2. Revocaba solo a `anon` y no a `PUBLIC` — es R-11, documentado tres días antes
3. No devolvía privilegios a `authenticated` — habría roto Storage para todos

**`npm audit` antes de cada release.** Se salteó durante toda la auditoría inicial; lo encontró un warning de npm en un build. Next 14.2.29 tenía tres CVE.

**Una preocupación por migración.** Storage y R-12 se aplicaron juntas; cuando Storage falló en el reset, bloqueó la verificación de R-12.

**No regenerar `remote_schema.sql` con `supabase db dump`.** Vuelve a traer los 30 `GRANT` a `anon` que causaban R-18. La guarda G-5.3 lo detecta, pero mejor no provocarlo.

---

## 6 · Límites conocidos de la plataforma

**`anon` tiene privilegios de tabla sobre `storage.objects` y no se pueden revocar.** El ACL dice `anon=arwdDxtm/supabase_storage_admin`: solo el otorgante puede revocar, y `postgres` no puede asumir ese rol.

**No es configuración de este proyecto: es cómo Supabase entrega todos sus proyectos.** El diseño de la plataforma asume que el control de Storage son las policies, no los privilegios de tabla. Sumado a que `storage` no está expuesto en PostgREST —verificado, HTTP 406— no hay camino desde internet.

**No queda como pendiente porque no se puede cerrar.**

---

## 7 · `sync-sheet` · ⚠️ verificar antes de la segunda clínica

`src/app/api/sync-sheet/route.ts` escribe turnos en **una única planilla de Google** (`GOOGLE_SHEET_ID`), sin dimensión de tenant. Exporta nombre, email, teléfono **y `record.notas`** — las anotaciones internas del profesional.

**Con dos clínicas activas, los datos de ambas caen en la misma planilla.** RLS no interviene: usa `service_role` y escribe fuera de la base.

**Estado: NO VERIFICADO si el Database Webhook está activo.** Supabase → Database → Webhooks.

**Antes de sumar una segunda clínica: desactivarlo, o resolver `GOOGLE_SHEET_ID` por `tenant_id`.**

---

## 8 · Rutas cuya única defensa es RLS

`/api/consentimientos/pdf/[id]` y `/api/facturacion/pdf/[id]` consultan por `id` **sin filtrar por tenant**. Están protegidas porque corren como `authenticated` y RLS filtra.

**Si alguna vez hay que cambiarlas a `service_role`, agregar el filtro de tenant PRIMERO.**

Fijado por `src/lib/guardas-rutas-sensibles.test.ts` (G-6).
