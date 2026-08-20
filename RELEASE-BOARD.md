# Release Board — DentalDesk RC comercial

**Abierto:** 20/08/2026 · **Objetivo:** primer cliente pago sin comprometer recuperación, aislamiento ni seguridad.
**Regla:** una tarea = una verificación = una evidencia = un cierre. `DONE` exige evidencia, no que compile.

---

## Estado real al abrir el board

| | |
|---|---|
| Commit | `ecb41b9` · *feat(caja): flujo formal de apertura y cierre de caja diaria* |
| Tests | **475 verdes** · 21 archivos *(el audit decía 471 — desactualizado)* |
| `tsc --noEmit` | exit 0 |
| Locks de `.git` | ✅ **resueltos** |
| A-4 | ✅ **versionado** — arrastrado dentro de `ecb41b9`, no en commit propio |
| `src/` | limpio |
| Tablas | **36** *(entró `cajas_diarias` — el audit decía 35)* |

### 🔴 CORRECCIÓN AL AUDIT — D-1 y D-2 bajan de severidad

El audit afirmó *"no se puede reconstruir producción desde Git"* apoyándose en el runbook (*"el baseline capturó 23 tablas"*). **Verifiqué objeto por objeto y es inexacto.**

| Tipo | En producción | En migraciones | Estado |
|---|:---:|:---:|---|
| Tablas | 35 | **35** | ✅ completas |
| Vistas + matview | 8 | **8** | ✅ completas |
| Funciones | 14 | **14** | ✅ completas |
| Triggers | 5 | **5** | ✅ completos |

El baseline capturó 23 tablas **y las migraciones posteriores agregaron las 12 restantes.** El DDL está completo.

*(Nota metodológica: mi primera pasada reportó 7 vistas ausentes. Era un falso positivo — el regex ponía `OR REPLACE` después de `VIEW` en vez de antes. Lo detecté al contrastar contra `remote_schema.sql`, donde sabía que `tenants_public` estaba. **Registrado para que no se tome la primera salida como buena.**)*

**Lo que realmente falta en Git no es el esquema: son los privilegios y los objetos fuera de banda.**

| # | Ausente | Origen |
|---|---|---|
| 1 | `REVOKE` de P0-07 sobre las 6 vistas `bi_*` | SQL Editor |
| 2 | `REVOKE` de R-10 sobre `tenants_public` y `bi_resumen` | SQL Editor · entrada 006 |
| 3 | **B1.1** · 7 `ALTER DEFAULT PRIVILEGES` + `tiene_rol()` | SQL Editor · entrada 009 |
| 4 | `pg_cron` jobid 3 → Edge Function *(con secreto)* | Panel |
| 5 | `pg_cron` jobid 4 → ruta borrada *(R-13, secreto R-14)* | Panel |
| 6 | Edge Function `enviar-recordatorios` *(R-15)* | Panel |
| 7 | `cajas_diarias` **sin `GRANT`** | Migración de hoy |

**Reformulación honesta:** *el esquema es reconstruible; el estado de privilegios y los jobs, no.* Sigue siendo **P0** —una base reconstruida quedaría con los privilegios abiertos que veníamos cerrando— pero es un problema mucho más acotado que el que describí.

---

## El board

| ID | Tarea | P | Depende | Riesgo | Archivos / objetos | Entorno | Aceptación | Rollback | Estado |
|---|---|:---:|---|---|---|---|---|---|---|
| **F1-1** | Inventario producción vs Git | **P0** | — | Nulo | *(solo lectura)* | local | Lista exacta de ausentes | N/A | 🟢 **DONE** |
| **F1-2** | Migraciones de los cambios ya aplicados | **P0** | F1-1 | Bajo | 1 modificado + 4 nuevos + `vistas-bi.test.ts` | local | `db reset` limpio + `db diff` vacío + tests verdes | `git checkout` | 🟢 **DONE** |
| **F1-3** | Versionar `pg_cron` jobs + Edge Function | **P0** | F1-2 | Medio | `supabase/functions/`, migración | local | Todo job y función en Git, **sin secretos** | borrar | ⬜ |
| **F1-4** | **Rotar el secreto de R-14** | **P0** | — | **Alto** | `cron.job`, variables de entorno | **prod** | Ningún secreto en claro en la base | restaurar job previo | ⬜ |
| **F1-5** | Eliminar el job roto de R-13 | P1 | F1-3 | Bajo | `cron.unschedule(4)` | **prod** | Cero 404 horarios | re-crear job | ⬜ |
| **F1-6** | Decidir R-8 *(trigger a dominio ajeno)* | P2 | — | Bajo | trigger sobre `citas` | **prod** | Decisión registrada | `CREATE TRIGGER` | ⬜ |
| **F1-7** | `GRANT` explícito de `cajas_diarias` | P1 | — | Bajo | migración nueva | local+prod | ACL verificado | `REVOKE` | ⬜ |
| **F2-1** | Verificar PITR y política de backups | **P0** | — | — | *(config Supabase)* | **prod** | PITR confirmado o descartado | N/A | ⬜ |
| **F2-2** | Restore completo sobre 36 tablas | **P0** | F1-2, F2-1 | Medio | base de staging | staging | Esquema idéntico, datos íntegros | N/A | ⬜ |
| **F2-3** | Medir RTO · definir RPO | **P0** | F2-2 | — | documento | — | Números escritos | N/A | ⬜ |
| **F3-1** | Cerrar la ventana de B1.6 | **P0** | — | — | consulta | **prod** | Protocolo congelado aplicado | N/A | ⏳ **21/08 21:31 UTC** |
| **F3-2** | Aplicar B1.6 | P1 | F3-1 | **Alto** | 34 tablas | **prod** | `anon` lee solo `tenants_public` | `GRANT` | ⬜ |
| **F3-3** | Verificar que la UI exija nota ≥10 | P1 | — | Nulo | *(solo lectura)* | local | Sí/no con evidencia | N/A | ⬜ |
| **F3-4** | B1.2 · límite 500 + nota | P1 | F3-3 | Medio | migración | local+prod | 10 casos PGlite | `CREATE OR REPLACE` | ⬜ |
| **F3-5** | B1.3 · canje sin odontólogo | P1 | F3-4 | Medio | migración | local+prod | 6 casos PGlite | idem | ⬜ |
| **F3-6** | B1.4 · falso éxito al borrar | P1 | — | Medio | **`src/app/pacientes/page.tsx`** | local+prod | 4 casos + manual | `git checkout` | ⬜ |
| **F3-7** | B1.7 · guardas G-1/G-2/G-3 | P1 | F4-1 | Bajo | test nuevo | local | Detecta `cajas_diarias` sin `GRANT` | borrar test | ⬜ |
| **F4-1** | Diseño multirol *(DO-6)* | P1 | — | — | documento | — | Documento aprobado | N/A | ⬜ |
| **F4-2** | Implementar multirol | P1 | F4-1 | **Alto** | tabla, 4 policies, 5 rutas | local+prod | Los 4 roles operan | migración inversa | ⬜ |
| **F4-3** | **Probar con 4 roles reales** | **P0** | F4-2 | — | staging | staging | Flujos completos por rol | N/A | ⬜ |
| **F4-4** | Jerarquía admin → owner *(R-2)* | P1 | F4-2 | Medio | `equipo/invitar` | local+prod | Admin no crea owner | revertir | ⬜ |
| **F5-1** | Suite de IDOR sobre 36 rutas | **P0** | — | — | tests nuevos | local | Cero accesos cross-tenant | N/A | ⬜ |
| **F6-1** | Export completo de tenant | **P0** | — | Medio | ruta nueva | local+prod | Archivo con todo | — | ⬜ |
| **F6-2** | Baja de tenant + retención | **P0** | F6-1 | **Alto** | procedimiento | — | Documentado y probado | — | ⬜ |
| **F6-3** | Rate limiting compartido | P2 | — | Medio | `src/lib/rate-limit.ts` | local+prod | Límite global efectivo | revertir | ⬜ |
| **F6-4** | Índices por `tenant_id` | P2 | — | Bajo | migración | local+prod | Sin seq scan por tenant | `DROP INDEX` | ⬜ |
| **S-1** | Purgar Sentry histórico | P1 | — | Bajo | *(panel Sentry)* | **prod** | Sin tokens ni IPs previos a P0-03 | irreversible | ⬜ |
| **S-2** | Rotar tokens de paciente filtrados | P1 | S-1 | Medio | `pacientes.token` | **prod** | ≥4 tokens rotados | — | ⬜ |

**6 P0 abiertos · 12 P1 · 5 P2**

---

## F1-1 · Inventario producción vs Git — 🟢 DONE

**Ejecutado:** 20/08/2026 · **Entorno:** local, solo lectura

**Método.** Cruce programático de los objetos medidos en producción *(bitácora 007 y 009)* contra el texto de las 19 migraciones versionadas, por tipo de objeto.

**Comando.**
```bash
# Cruce de tablas / vistas / funciones / triggers contra supabase/migrations/*.sql
python3 <<'PY' … PY     # detalle completo en el historial de la sesión

npx vitest run --reporter=basic     # 475 passed (21 archivos)
npx tsc --noEmit                    # exit 0
```

**Resultado.** DDL completo: 35 tablas, 8 vistas, 14 funciones, 5 triggers — **todos presentes**. Ausentes: **7 elementos de privilegios y jobs**, listados arriba.

**Verificación.** Contraste cruzado contra `remote_schema.sql` detectó un falso positivo de mi primera pasada (7 vistas reportadas como ausentes por un error de regex). Corregido y re-verificado.

**Rollback.** N/A — solo lectura, sin cambios.

---

## F1-2 · Versionar los cambios aplicados fuera de Git — 🟢 DONE

**Ejecutado:** 20/08/2026 · **Entorno:** local + validación contra producción

### El hallazgo que justificó la tarea sola

`20260807120000_cerrar_vistas_bi_expuestas.sql` estaba **versionada en Git** (commit `3995193`) con seis `DROP VIEW` activos. **Nunca se aplicó** — en producción se hizo `REVOKE`, por decisión explícita del owner.

**Un `supabase db push` habría borrado las seis vistas `bi_*` en producción.** Era una mina cargada esperando a que alguien corriera el comando natural para desplegar migraciones.

### Archivos

| Archivo | Acción |
|---|---|
| `20260807120000_cerrar_vistas_bi_expuestas.sql` | **Neutralizado.** `DROP` a comentarios; se conserva como registro de la opción descartada |
| `20260820180000_p0_07_revoke_vistas_bi.sql` | Nuevo · 7 sentencias · versiona el `REVOKE` del 09/08 |
| `20260820180100_r10_revoke_escritura_tenants_public.sql` | Nuevo · 4 sentencias · versiona el `REVOKE` del 15/08 |
| `20260820180200_b1_1_default_privileges_y_tiene_rol.sql` | Nuevo · 13 sentencias · versiona B1.1 del 20/08 |
| `20260820180300_cajas_diarias_privilegios.sql` | Nuevo · **NO aplicado** · cierra el `GRANT` faltante de la tabla nueva |

Las tres primeras son **idempotentes**: documentan cambios ya en producción y correrlas de nuevo no altera nada.

### Verificación

```bash
npx supabase start
npx supabase db reset                          # 23 migraciones sobre base vacía
npx supabase db diff --linked --schema public  # → "No schema changes found"
```

**Las 23 aplicaron limpio**, incluidas las 4 nuevas. **Los bloques `DO` de verificación pasaron todos** — en la base reconstruida las vistas `bi_*` no son legibles por `anon`, `tenants_public` tiene `SELECT` sin escritura, `tiene_rol()` no es ejecutable por `anon`, y `cajas_diarias` tiene RLS sin acceso anónimo.

**`db diff --linked` → `No schema changes found`.**

### ⚠️ Precisión sobre el alcance de esa evidencia

**`db diff` compara estructura, no privilegios.** Verifica tablas, columnas, índices, constraints, políticas y funciones. **No compara ACLs ni `pg_default_acl`.**

Así que prueba que **el DDL está completo**, no que los `REVOKE` estén reflejados. La evidencia de eso viene por otro camino: los bloques `DO` de las tres migraciones nuevas se ejecutaron durante el `db reset` y ninguno abortó, lo que confirma que el estado de privilegios reconstruido es el correcto.

**Es evidencia buena, obtenida por una vía distinta a la que buscaba. Queda dicho para que nadie lea "No schema changes found" como prueba de paridad de privilegios.**

### Rollback

```bash
git checkout supabase/migrations/20260807120000_cerrar_vistas_bi_expuestas.sql
rm supabase/migrations/2026082018*.sql
```

Sin efecto sobre producción — ninguna de las cuatro se aplicó desde Git.

### `vistas-bi.test.ts` alineado con la realidad

El test verificaba que la migración hiciera `DROP`. **Estaba equivocado desde siempre:** afirmaba un comportamiento que nunca se aplicó a producción, y estuvo en verde durante semanas describiendo lo contrario de lo que hace el sistema.

Corregido por el owner:

| Cambio | Antes | Ahora |
|---|---|---|
| `MIGRACION` | `20260807120000` *(neutralizada)* | `20260820180000_p0_07_revoke_vistas_bi.sql` |
| Constante | `VISTAS_ELIMINADAS` | `VISTAS_REVOCADAS` |
| `describe` | *"la migración elimina las vistas expuestas"* | *"la migración revoca acceso a las vistas expuestas"* |
| Existencia | `.toBe(false)` | **`.toBe(true)`** — siguen existiendo |
| Acceso `anon` / `authenticated` | `.rejects.toThrow()` | **`.toBe(false)`** |
| Guarda | *"usa RESTRICT y no CASCADE"* | **"usa REVOKE y no DROP"** |

**La guarda nueva es mejor que la que había especificado.** Ahora afirma que la migración **no contiene ningún `DROP VIEW`** —protección directa contra reintroducir la mina— y que no hace cambios globales de permisos (`ON ALL TABLES IN SCHEMA`, `ALTER DEFAULT PRIVILEGES`). Eso acota el alcance de P0-07 y evita que crezca sin que nadie lo note.

**476 tests verdes, 0 rojos.** Uno más que el baseline: la guarda se partió en dos casos.

---

## Estado del board tras F1-2

| | |
|---|---|
| **P0 cerrados** | F1-1, **F1-2** |
| **P0 abiertos** | F1-4 *(rotar R-14)*, F2-1, F2-2, F2-3, F3-1, F4-3, F5-1, F6-1, F6-2 |
| Tests | **476 verdes · 0 rojos** · `tsc` exit 0 |
| Producción | **sin cambios en esta tarea** |
| Pendiente de commit | 4 migraciones nuevas + 1 modificada + `vistas-bi.test.ts` |

**El mayor riesgo del audit —"no se puede reconstruir producción desde Git"— queda cerrado en su parte de esquema.** Falta la parte de jobs y Edge Function: **F1-3**.

⚠️ **`src/app/agenda/page.tsx` está modificado** por trabajo ajeno a P0-05. **No debe entrar en el commit de esta tarea.** Usar `git add` con rutas explícitas.

---

## Siguiente tarea: F1-4 · Rotar el secreto de R-14

Es el P0 más urgente que queda y no depende de nada.

**Primer paso, y es una pregunta abierta desde hace días:** ¿el token que está en texto plano en `cron.job` es el mismo valor que `CRON_SECRET` en Vercel?

- **Si lo es** → la misma cadena protege `/api/cron`, `/api/daily-briefing` y `/api/crm-campanas`, y quedó expuesta. La rotación debe ser coordinada: primero Vercel, después los dos jobs de `pg_cron`, o los crons fallan en el intervalo.
- **Si no lo es** → se rota solo el job y el alcance es menor.

**No se puede diseñar la rotación sin esa respuesta.**
