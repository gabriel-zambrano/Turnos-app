# DentalDesk · Actualización de la auditoría

**25/08/2026** · Estado tras cinco días de trabajo sobre el informe original.

Todo lo afirmado acá está verificado contra el código o contra producción. Lo que no pude verificar está marcado.

---

## 1 · El resumen en una línea

El sistema pasó de **`anon` con acceso completo a 34 tablas** a **`anon` leyendo un solo objeto**, con guardas automáticas que impiden la regresión.

Queda **un solo bloqueante que no depende de trabajo técnico**: no existen backups.

---

## 2 · Lo que cambió respecto del informe original

### 2.1 · El hallazgo que reescribe R-18

El informe original decía que los privilegios se revertían **sin causa identificada**. Se identificó, y no estaba donde buscábamos.

**`supabase/migrations/20260722120000_remote_schema.sql`** —el dump inicial— contenía **30 sentencias `GRANT ... ON TABLE ... TO "anon"`** sobre `pacientes`, `historial_dental`, `paciente_fotos`, `tenant_users`, `tenants` y las 6 vistas `bi_*`. Más **`ALL` sobre `tenants_public`**, que es literalmente R-10.

Es **exactamente** el estado que B1.6 revocó.

Y el archivo usa `CREATE TABLE IF NOT EXISTS` y `CREATE OR REPLACE VIEW`: **re-ejecutarlo no produce ningún error**. Un `db reset --linked`, un `db push --include-all`, una reparación de historial o pegarlo en el editor lo restauraban en silencio.

**Por qué nadie lo vio:** las guardas G-1 y G-2 excluían ese archivo a propósito (`DUMP_INICIAL`). La red que debía atraparlo tenía ese caso exento.

**Estado: MITIGADO.** 30 GRANT comentados, `tenants_public` acotado a `SELECT`, guarda **G-5** con 12 tests que impide reintroducirlos. **No cerrado:** cubre 6 de 7 orígenes posibles; el séptimo —un proceso de plataforma— solo se descarta con **cuatro semanas del control N-1 en cero**.

### 2.2 · Una caída de producción que no estaba prevista

**24/08, 16:17–16:22.** Cinco minutos de **504 `MIDDLEWARE_INVOCATION_TIMEOUT`** en `/dashboard`, `/nueva-cita`, `/` y —tres veces— **`/sw.js`**. En los dos dominios. Se normalizó sola.

El diagnóstico encontró **dos defectos reales**:

**El middleware calculaba `isPublic` y lo ignoraba.** Llamaba a Supabase Auth en cada request antes de mirar si la ruta lo necesitaba. El portal del paciente, la reserva online y la firma de consentimientos —que entran por token, sin login— dependían de Auth sin usarla.

**El matcher solo excluía tres rutas.** El service worker, el manifest y los iconos del PWA atravesaban el middleware. **En una ventana sana de 3 segundos, 8 de 13 invocaciones eran archivos estáticos.**

Corregido y desplegado. Los `/sw.js` que dieron 504 ya no llegan al middleware.

⚠️ **La causa raíz del pico sigue sin demostrarse.** El log mostró `No outgoing requests` y **234 MB** de memoria: se colgó antes de tocar la red. Se midió un arranque en frío real de **1,1 s** — significativo pero lejos de 25 s. Mecanismo plausible, magnitud no reproducida.

### 2.3 · Un checkeo verde que no verificaba nada

**El proyecto no tenía ESLint.** Ni el paquete, ni configuración, ni script. Y el build imprimía en cada deploy:

```
✓ Linting and checking validity of types
```

Sin ESLint instalado, Next salta el linting **en silencio** y solo corre TypeScript.

Por eso llegó a producción un **React #310** que tiró la página de finanzas entera: un `useMemo` después de un return temprano. La regla `react-hooks/rules-of-hooks` lo detecta en el editor. **Verificado: la detecta en la línea 554 del archivo que estaba en producción.**

Es la misma clase de defecto que B1.4 y que las 13 escrituras de finanzas: **un cartel que dice que salió bien sin haberlo comprobado.**

### 2.4 · Dependencias — un frente que la auditoría original salteó

**Nunca se corrió `npm audit`.** Lo encontró un warning de npm que pasaba de largo en cada build.

`next@14.2.29` tenía **CVE-2025-55183, 55184 y 67779**: DoS en React Server Components y exposición de código fuente. Actualizado a **14.2.35**, la versión parcheada de la rama 14.

⚠️ **Señal de fondo:** varias advertencias recientes de Next —envenenamiento de caché, SSRF en rewrites, bypass de middleware— podrían no estar backporteándose a 14.x. **Planificar la migración a 15 o 16.**

---

## 3 · Estado de los riesgos

### 🟢 Cerrados y verificados en producción

| Riesgo | Evidencia |
|---|---|
| **R-1** · `anon` con acceso a 34 tablas | B1.6 aplicado y verificado |
| **R-10** · `anon` escribía `tenants` vía `tenants_public` | Migración aplicada · fijado por G-5.2 |
| **R-11** · `REVOKE FROM PUBLIC` no quitaba el grant a `anon` | Verificado en producción |
| **R-13** · job horario roto | Eliminado |
| **P0-07** · vistas BI expuestas | REVOKE aplicado |
| **R-2** · escalada `admin → owner` | 14 tests · validación server-side previa a todo efecto |
| **B1.2 / B1.3** · rol y límite en fidelización | Privilegios verificados en producción |
| **B1.4** · el borrado que reportaba éxito sin borrar | Corregido y desplegado |
| **IDOR · capa de datos** | **65 tests** · Postgres real, políticas reales, dos tenants |
| **React #310 · finanzas** | Corregido · ESLint lo previene |
| **Disponibilidad del middleware** | Matcher, corto-circuito y timeout desplegados |
| **`next` · CVEs de diciembre** | 14.2.35 |
| **Sentry · source maps** | Subiendo en los tres runtimes |

### 🔵 Mitigado — requiere seguimiento

**R-18.** Mecanismo identificado y desactivado. Criterio de cierre: **cuatro semanas del control N-1 en cero.**

### 🟡 Pendientes con trabajo escrito

| | Estado |
|---|---|
| **Storage · bucket `logos`** | Migración escrita, **sin probar ni aplicar**. `fotos_clinicas` está bien: privada, con aislamiento por tenant en las 4 operaciones |
| **R-12 · `search_path` sin `pg_temp`** | 4 funciones. Migración de 213 líneas escrita, **sin aplicar** |
| **IDOR · 22 rutas con `service_role`** | Solo análisis estático. **No verde** |
| **`CRON_SECRET`** | Sin rotar |
| **Sentry histórico** | Eventos previos a P0-06 con tokens de paciente e IPs |

### 🟠 Bloqueados por una decisión tuya

**No existe ningún `owner` en producción.** Los 2 usuarios son ambos `admin`.

**DO-6 · recuperación del último owner.** Si el único owner de una clínica se pierde, no hay forma de recuperarla. Bloquea implementar multirol.

### 🔴 Bloqueado por dinero

**No existen backups automáticos.** 212 pacientes reales, RPO infinito. Único mitigante: un dump manual con RTO medido de 154 s — eso es un ejercicio, no un backup.

### 🟣 Aceptados, diferidos a Fase 2

`FORCE RLS` ausente en 43/43 tablas (R-9) · las 13 escrituras de finanzas que descartan el resultado · R-8 · R-14 · R-15 · las 43 policies de pertenencia que no distinguen rol.

---

## 4 · La advertencia que no debe perderse

> **El modelo multirol administrativo no constituye todavía un modelo de autorización clínica por rol.**

**43 de las 47 políticas RLS son de pertenencia al tenant.** Solo 4 consultan el rol, y las cuatro son administrativas.

Cuando DO-6 se implemente, un `odontologo` y una `staff` verán **exactamente lo mismo** que un `admin` en pacientes, historia clínica, odontograma y fotos.

DO-6 restringe quién factura, quién administra el equipo y quién exporta. **No restringe quién ve una historia clínica.** Ofrecerlo de otro modo a una clínica sería una afirmación falsa sobre protección de datos de salud.

---

## 5 · Verificación al cierre

```
tsc --noEmit     0 errores
vitest run       674 tests · 29 archivos · todos verdes
next build       limpio · 50/50 páginas
next             14.2.35
```

**Tests agregados en esta auditoría: 180.** G-5 privilegios (12) · IDOR dinámico (65) · roles de equipo (14) · resiliencia del middleware (40) · fidelización y roles (28) · ajuste de puntos (18) · guardas de API (10) · guardas de migraciones (11).

**Commits:** `81565fb` · `bd92f1f` · `9692827` · `63d3d27` · `f799bc9`

---

## 6 · Qué falta para lanzar

### Bloqueantes — unas 3 horas, más 25 USD

| | Qué | Tiempo |
|---|---|---|
| 1 | **Supabase Pro + PITR** y probar el restore | 30 min · **25 USD/mes** |
| 2 | Promover un `admin` a `owner` | 5 min |
| 3 | Revisar los logs de Postgres por R-18 | 20 min |
| 4 | Storage + R-12: `db reset` local, después `db push` | 1 h |
| 5 | Rotar `CRON_SECRET` + redeploy | 20 min |
| 6 | 3 verificaciones manuales + 12 smoke tests | 30 min |

**Todo salvo el punto 1 es gratis.**

### Antes del primer cliente ajeno

Purgar Sentry histórico · DO-6 **solo si se anuncian los 4 roles** · suite IDOR por HTTP.

### Después

Migrar a Next 15/16 · las 13 escrituras de finanzas · `FORCE RLS` · autorización clínica por rol.

---

## 7 · Lo que aprendió esta auditoría sobre sí misma

Vale registrarlo porque el patrón se repitió:

**Cinco diagnósticos míos fueron incorrectos y se corrigieron con datos.** R-5 (un falso `SECURITY DEFINER` por una ventana de regex demasiado ancha) · "7 vistas faltantes" (regex mal armada) · "R-1 afecta 12 tablas" (eran 34) · **R-12, mal reportado tres veces** por no leer el texto crudo · y la causa de la caída del 24/08, atribuida a latencia de Supabase y desmentida por un `No outgoing requests`.

**El patrón común:** confiar en un detector sin probar que puede fallar. Desde entonces toda guarda nueva incluye tests que verifican que **detecta el caso conocido** — el de finanzas se validó contra el archivo roto real antes de darlo por bueno.

**El otro patrón, del lado del sistema:** los checkeos verdes que no verifican nada. El borrado que decía "eliminado" sin borrar. Las 13 escrituras de finanzas que informan éxito sin mirar el resultado. El build que imprimía "Linting" sin lintear. **Los tres son la misma falla de diseño**, y es la que conviene vigilar de acá en adelante.
