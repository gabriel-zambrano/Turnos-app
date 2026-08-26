# DentalDesk · Qué falta para lanzar

**25/08/2026, cierre del día.** Estado real, sin optimismo.

---

## 🔴 BLOQUEANTE — uno solo

### No existen backups automáticos

212 pacientes reales. Sin PITR, sin snapshots. **Si la base se corrompe, no hay a dónde volver.**

Lo único que hay hoy es un dump manual verificado, con RTO medido de 154 s. Eso es un ejercicio, no un backup.

| | |
|---|---|
| **Costo** | Supabase Pro · 25 USD/mes |
| **Tiempo** | 15 min de configuración + 15 de verificación |
| **Pasos** | Settings → Billing → Upgrade to Pro · Settings → Database → PITR |
| **Verificar** | Database → Backups debe listar al menos uno · después `./probar-restore.sh` |
| **Criterio** | Los 6 conteos del restore idénticos a producción |

**No lanzaría sin esto.** Todo lo demás de esta lista tiene arreglo después; perder 212 historias clínicas no.

---

## 🟡 IMPORTANTE antes del primer cliente ajeno

Ninguno bloquea el lanzamiento técnico. Todos importan cuando los datos dejen de ser tuyos.

| | Qué | Tiempo | Por qué |
|---|---|---|---|
| 1 | **Purgar Sentry histórico** | 15 min | Eventos previos a P0-06 con tokens de paciente e IPs. Los nuevos ya están saneados |
| 2 | **Declarar el acceso de mantenimiento** en `/legal/privacidad` | 10 min | Decidiste conservarlo. Sin declararlo, una clínica podría descubrirlo por su cuenta |
| 3 | **Documentar el job 3 de pg_cron** | 5 min | Corre a diario, no escribe nada, llama a una Edge Function que no está en el repo. Candidato a que alguien lo "arregle" y duplique recordatorios |
| 4 | **Prueba manual pendiente** — marcar asistencia con cobro | 5 min | Única de las 7 que quedó sin verificar tras aplicar R-12 |
| 5 | **Commitear la documentación** | 2 min | `P0-05_BITACORA.md` y `AUDITORIA-ACTUALIZACION.md` sin commitear |

---

## 🟠 BLOQUEADO POR UNA DECISIÓN TUYA

### DO-6 · modelo multirol

**No arranca hasta que definas dos cosas.** El diseño está completo y auditado en `P0-10_MULTIROL_FINAL.md`.

**1 · ¿Cómo se recupera una clínica que pierde a su último `owner`?**
Nadie puede otorgar `owner` salvo por transferencia, y transferir exige *ser* owner. Si el titular se pierde —renuncia, pierde el mail, fallece— esa clínica queda sin propietario para siempre. `admin_users` ya existe y es el lugar natural para la excepción.

**2 · ¿Qué significa `odontologo`?**
Ese rol **no aparece en ninguna línea del código**. Si se implementa hoy, es "un admin sin acceso administrativo": ve exactamente la misma historia clínica, las mismas fotos y los mismos datos que un admin.

⚠️ **Y esto no cambia con DO-6:** 43 de las 47 policies RLS son de pertenencia al tenant, no de rol. **DO-6 mejora el control administrativo, no el clínico.** Anunciar "roles diferenciados" a una clínica sugiriendo que limitan el acceso a datos de salud sería falso.

**DO-6 no bloquea el lanzamiento** si el piloto son clínicas donde todos son `admin`. Pero entonces **los 4 roles no se anuncian como funcionalidad.**

---

## ⚪ DESPUÉS DEL LANZAMIENTO

**Seguridad:** `FORCE RLS` ausente en 43/43 tablas (R-9) · autorización clínica por rol (Fase 2) · suite IDOR por HTTP sobre las 22 rutas con `service_role` — el análisis estático no encontró agujeros, pero eso no es una prueba.

**Deuda:** las 13 escrituras de finanzas que informan éxito sin mirar el resultado · la Edge Function `enviar-recordatorios` sin versionar (R-15) · migrar a Next 15 o 16 — varias advertencias recientes podrían no backportearse a 14.x · el export omite la historia clínica · no existe baja de tenant.

**Higiene:** `npm audit` antes de cada release · `npx supabase db reset` **obligatorio** antes de cada `db push` — hoy encontró tres errores que en producción habrían quedado invisibles.

---

## Cerrado hoy

**En producción y verificado:**

R-1 · R-2 · R-10 · R-11 · R-12 · R-13 · P0-07 · B1.2 · B1.3 · B1.4 · B1.6 · Storage H-0/H-2/H-3/H-4 · disponibilidad del middleware · región de funciones · React #310 en finanzas · logo del portal · source maps de Sentry · ESLint · Next 14.2.35 · `owner` definido · `CRON_SECRET` rotado

**R-18: MITIGADO.** El mecanismo estaba en el dump inicial del repositorio —30 `GRANT` a `anon` que se re-aplicaban sin dar error— y quedó neutralizado, con la guarda G-5 impidiendo que vuelva. **Criterio de cierre: cuatro semanas del control N-1 en cero.**

```sql
SELECT c.relname, array_to_string(c.relacl, E'\n') AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
  AND array_to_string(c.relacl, ',') LIKE '%anon%'
  AND c.relname <> 'tenants_public';
```

**Cero filas = sano.** Correr semanal y en cada deploy.

**H-1 · no accionable.** Los privilegios de `anon` sobre `storage.objects` los otorga `supabase_storage_admin` y `postgres` no puede revocarlos ni asumir ese rol. **No es configuración de este proyecto: es cómo Supabase entrega todos sus proyectos.** Mitigado por RLS y porque `storage` no está expuesto en PostgREST.

**Verificación:** `tsc` 0 errores · **674 tests** en 29 archivos · `next build` limpio, 50/50 páginas.

---

## El camino más corto

1. **Commitear la documentación** — 2 min
2. **Pagar Supabase Pro, activar PITR, probar el restore** — 30 min · **25 USD**
3. **Purgar Sentry + declarar el acceso en privacidad** — 25 min
4. **Los 12 smoke tests** de `RELEASE-CHECKLIST.md` §15
5. **GO**

**Todo salvo el punto 2 es gratis.** Y el punto 2 es el único que separa "un sistema con buena higiene" de "un sistema que puede perder 212 historias clínicas sin forma de recuperarlas".
