# P0 — Plan de implementación

**Fecha:** 7 de agosto de 2026
**Estado:** diseño técnico. **No se modificó ningún archivo, no se ejecutó ninguna migración, no se tocó `package.json`.**
**Precondición:** `AUDITORIA-PROFUNDA-2026-08.md`

---

## 0. Correcciones a la auditoría previa

Antes de nada: al diseñar la solución encontré dos cosas que obligan a corregir el informe anterior. Un plan que arrastre un diagnóstico equivocado hace perder días.

### 0.1 — CORRECCIÓN a C1: no hay `tenant_id` NULL, hay un DEFAULT hardcodeado

La auditoría afirmó que `sync_turno_to_cita()` crea filas con `tenant_id` NULL. **Es incorrecto.**

**HECHO** — `supabase/migrations/20260722120000_remote_schema.sql`:

```sql
-- tabla pacientes
"tenant_id" "uuid" DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a'::"uuid" NOT NULL

-- tabla citas
"tenant_id" "uuid" DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a'::"uuid" NOT NULL

-- tabla turnos
"tenant_id" "uuid" DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a'::"uuid" NOT NULL
```

Las tres columnas son `NOT NULL` **con un DEFAULT que apunta a una clínica real de producción**.

**Qué cambia esto:**

| Diagnóstico previo | Diagnóstico correcto |
|---|---|
| El trigger crea huérfanos invisibles a RLS | El trigger crea filas **asignadas silenciosamente a la clínica `2845c423`** |
| Detectás el problema buscando NULLs | Los NULLs no existen; hay que detectar por inconsistencia de tenant entre tablas relacionadas |
| El fallback `NEXT_PUBLIC_DEFAULT_TENANT_ID` del portal se dispara con huérfanos | Ese fallback es prácticamente inalcanzable para pacientes (la columna es NOT NULL) |

**Y el problema es más grande de lo que decía la auditoría.** El DEFAULT no es del trigger: es de la columna. Cualquier `INSERT` en `pacientes`, `citas` o `turnos` que omita `tenant_id` —desde el trigger, desde un script, desde el SQL Editor, desde una integración futura— **aterriza en la clínica `2845c423` sin error, sin warning y sin rastro**. El trigger es un consumidor de ese defecto, no su causa.

El fix central de P0-01 pasa a ser: **quitar el DEFAULT de las tres columnas**, para convertir un error silencioso en un error ruidoso.

**HECHO** — el código de aplicación ya pasa `tenant_id` explícitamente en todos los INSERT verificados (`src/app/pacientes/page.tsx:108`, `src/app/dashboard/page.tsx:101`, `src/app/api/pacientes/importar/route.ts:95`, `src/app/agenda/page.tsx:573`, `src/app/api/reserva/crear/route.ts:174`). Quitar el DEFAULT no rompe la aplicación.

### 0.2 — HALLAZGO NUEVO: las vistas `bi_*` saltan RLS y están abiertas a `anon`

Esto no estaba en la auditoría. Es P0 y probablemente el más fácil de explotar de todos.

**HECHO** — seis vistas en `remote_schema.sql:508-614`:

```sql
CREATE OR REPLACE VIEW "public"."bi_ingresos_por_mes" AS
 SELECT to_char(date_trunc('month', ...)) AS mes,
    count(*) AS citas,
    COALESCE(sum(valor) ...) AS ingresos,
    COALESCE(sum(sena) ...) AS senas
   FROM "public"."citas"          -- ← sin WHERE tenant_id
  GROUP BY ...;

ALTER VIEW "public"."bi_ingresos_por_mes" OWNER TO "postgres";
```

Y los grants (`remote_schema.sql:1672-1710`):

```sql
GRANT ALL ON TABLE "public"."bi_citas_por_dia"            TO "anon";
GRANT ALL ON TABLE "public"."bi_citas_por_tratamiento"    TO "anon";
GRANT ALL ON TABLE "public"."bi_ingresos_por_mes"         TO "anon";
GRANT ALL ON TABLE "public"."bi_kpis_mes"                 TO "anon";
GRANT ALL ON TABLE "public"."bi_ocupacion_por_hora"       TO "anon";
GRANT ALL ON TABLE "public"."bi_pacientes_nuevos_por_mes" TO "anon";
```

Tres condiciones que se combinan:

1. **`OWNER TO postgres` y ninguna vista declara `security_invoker`.** En PostgreSQL, una vista sin `security_invoker = on` se ejecuta con los privilegios de su **dueño**. `postgres` es superusuario y **los superusuarios saltan RLS**. Las policies `tenant_isolation_citas` y `tenant_isolation_pacientes` no se aplican al consultar a través de estas vistas.
2. **Ninguna de las seis tiene columna ni filtro `tenant_id`.** Agregan sobre `citas` y `pacientes` **de todas las clínicas**.
3. **`GRANT ... TO anon`.** La `anon` key viaja en el bundle del navegador. PostgREST expone toda vista con grant como endpoint REST.

**Consecuencia — INFERENCIA de alta confianza** (deducida del modelo de permisos de PostgreSQL y de PostgREST; no ejecuté la consulta contra producción): un `GET /rest/v1/bi_ingresos_por_mes` con la anon key, **sin iniciar sesión**, devuelve la facturación mensual consolidada de todas las clínicas de la plataforma. `bi_kpis_mes` devuelve ingresos del mes en curso y cantidad de pacientes únicos. `bi_citas_por_tratamiento` devuelve el precio promedio por tratamiento.

No es PII de pacientes: son agregados. Pero es **información comercial de los clientes del SaaS**, accesible por cualquiera y sin autenticar. Para un competidor es el volumen de negocio de la plataforma entera.

**Atenuantes — HECHO.** `bi_resumen` (materializada) sí tiene `tenant_id`, solo tiene grant a `service_role`, y está `WITH NO DATA`. `tenants_public` es intencional y está acotada a branding. **La aplicación no consulta ninguna vista `bi_*`**: `/bi/page.tsx` consulta las tablas base. Son código muerto con la puerta abierta.

Se trata como **P0-07** en este plan.

### 0.3 — Sobre la clasificación de los P0

Reviso los seis que pediste. Cinco están bien clasificados. Uno lo dividiría:

**P0-05 (roles y RLS) no es un P0 homogéneo.** Contiene dos cosas de urgencia distinta:

- **P0-05a — Inconsistencias puntuales de permiso en la API.** Que `/api/facturacion/emitir` pida menos que `/anular` es un bug concreto, de arreglo inmediato y bajo riesgo.
- **P0-05b — Ausencia de un modelo de roles en la base.** Es un cambio de arquitectura que necesita una decisión de producto (qué puede ver un higienista sobre la historia clínica), toca ~20 policies y tiene alto riesgo de romper la operación de la clínica que ya está en producción.

Meterlos en el mismo bucket obliga a esperar la decisión de producto para arreglar lo que se arregla en 15 minutos. Los separo en el roadmap.

**Un P1 que subo a P0:** C9 (el paciente puede cancelar citas pasadas desde el portal, `src/app/api/paciente/[token]/estado/route.ts`). Corrompe estado financiero de citas ya facturadas y se arregla en una hora. No justifica esperar a la fase P1. Va como **P0-08**.

---

## 1. Objetivo

Dejar el sistema en condiciones de **incorporar una segunda clínica sin riesgo de cruce de datos, de pérdida de comprobantes fiscales ni de exposición de información clínica a terceros.**

Es un objetivo deliberadamente acotado. No es "arreglar todo lo que encontró la auditoría": es cerrar los caminos por los que hoy los datos de una clínica pueden llegar a otra, a un tercero o a ninguna parte.

Un criterio para decidir si algo entra en esta fase: **¿el daño es reversible?** Una página lenta es reversible. Una historia clínica filtrada, un comprobante fiscal perdido y un paciente asignado a la clínica equivocada no lo son.

---

## 2. Principios de seguridad

Los seis principios que gobiernan todas las decisiones de este plan. Cuando dos opciones técnicas empatan, gana la que respeta más de estos.

**P1 — El `tenant_id` nunca se infiere; se deriva de una fuente confiable.**
Fuentes confiables: la sesión (`auth.uid()` → `tenant_users`), la fila de la base leída por su clave primaria con service-role, o un webhook autenticado del que se re-lee la fila. Fuentes no confiables: el body del request, un query param, un header, un DEFAULT de columna.

**P2 — Ante la ausencia de `tenant_id`, se falla; no se adivina.**
Todo fallback a un tenant por defecto es una vía de cruce. Es preferible un 404 a un dato mostrado bajo la identidad equivocada.

**P3 — La base de datos es la última barrera y debe sostenerse sola.**
Si una policy RLS o un constraint no alcanzan para impedir una operación indebida, el chequeo en la API es un parche, no una solución. El frontend no es una barrera bajo ninguna circunstancia.

**P4 — Los secretos no viajan en la URL.**
Ni en el path, ni en el query string. Las URLs se registran en logs de proxy, en el historial del navegador, en el `Referer` y en Sentry. Van en headers o en cookies `httpOnly`.

**P5 — Toda escritura en un sistema externo se registra localmente *antes* de ejecutarse.**
Una llamada a ARCA o a Google no es transaccional con Postgres. La única forma de no perder el resultado es dejar constancia de la intención antes de emitirla, y reconciliar después.

**P6 — Un cambio de seguridad que rompe la operación se revierte y no se vuelve a intentar.**
Hay una clínica en producción. Cada cambio de este plan debe poder desactivarse sin un deploy. Lo que no tiene vuelta atrás, se hace en dos pasos.

---

## 3. Arquitectura actual relevante

Lo mínimo que otro desarrollador necesita saber para ejecutar este plan sin volver a descubrir el sistema.

### Los tres clientes de Supabase

| Cliente | Archivo | Clave | RLS | Dónde se usa |
|---|---|---|---|---|
| Browser (singleton) | `src/lib/supabase/client.ts` | anon | **sí** | 42 componentes `'use client'` |
| Server con cookies | `src/lib/supabase/server.ts` | anon + JWT | **sí** | 16 API routes |
| Admin | `createClient(url, SERVICE_ROLE_KEY)` inline | service_role | **no** | 22 API routes |

**HECHO** — las 22 rutas con service_role:

```
admin/tenants          billing/cancelar      clinicas              confirmar-turno
consentimientos/firmar/[token]               crm-campanas          daily-briefing
enlaces-turno          equipo/invitar        equipo/miembros       horas-ocupadas
paciente/[token]       paciente/[token]/estado                     paciente/[token]/feedback
recordatorios          registro              reserva/[clinica]     reserva/crear
send-recordatorios     sync-sheet            webhooks/mercadopago  webhooks/resend
```

### Cómo se resuelve el tenant hoy

**HECHO** — no hay resolución server-side. `src/middleware.ts:36-38` la eliminó explícitamente. El flujo real:

1. `src/components/TenantContext.tsx:120-160` resuelve en el **cliente**:
   - Con sesión: lee `tenant_users` (protegido por RLS: `tenant_users_select_own`), toma `localStorage.getItem('active_tenant_id')` y **lo valida contra la lista de membresías** (`:132` — `if (!activeId || !misIds.includes(activeId))`).
   - Sin sesión: resuelve por hostname vía la vista `tenants_public`.
2. El `tenantId` viaja al backend **en el body de cada request**.
3. Cada ruta lo revalida contra `tenant_users`.

**Este patrón es correcto y hay que preservarlo.** El cliente propone, el servidor dispone. La validación en `localStorage` es de UX, no de seguridad; la de verdad ocurre en el paso 3. Es la respuesta a la pregunta de P0-04 sobre confiabilidad del `tenant_id`, y se desarrolla ahí.

### Estado de RLS por tabla

| Grupo | Tablas | Filtro |
|---|---|---|
| Aislamiento por tenant, **sin rol** | `citas`, `pacientes`, `bloqueos`, `tratamientos`, `historial_dental`, `historial_puntos`, `paciente_fotos`, `presupuestos`, `ingresos_manuales`, `egresos_manuales`, `costos_fijos`, `meta_mensual`, `config_fidelizacion`, `premios`, `perfil_doctor`, `logs_envios`, `recordatorios_log`, `whatsapp_contactos`, `tratamiento_items`, `pagos` | `tenant_id` |
| Aislamiento **con rol** | `arca_config`, `plantillas_consentimiento`, `crm_campanas`, `tenants` (UPDATE) | `tenant_id` + `role IN ('admin','owner')` |
| Solo SELECT + INSERT | `facturas`, `consentimientos_firmados`, `factura_items`, `factura_pagos` | `tenant_id` |
| Solo service_role | `admin_users`, `enlaces_turno` | — |
| **Sin RLS efectivo** | vistas `bi_*` | **ninguno** (§0.2) |

Dato relevante para P0-06: **`facturas` no tiene policy de UPDATE**. Es intencional (comprobante inmutable desde el cliente) y condiciona todo el diseño de máquina de estados.

### Roles reales

**HECHO** — existen tres: `owner`, `admin`, `staff`.
- `src/app/equipo/page.tsx:154,182` — etiquetas de UI: *Propietario*, *Administrador*, *Staff (Secretaria)*.
- `src/app/api/equipo/invitar/route.ts:96,118` — `role: role || 'staff'`.
- `remote_schema.sql:865` — `"role" "text" DEFAULT 'admin'::"text" NOT NULL`, **sin CHECK constraint**.

**`grep -niE "odontolog" src/ | grep -iE "role|rol\b"` → 0 resultados. El rol "Odontólogo" que aparece en la matriz solicitada NO EXISTE en el sistema.** Es una decisión de producto pendiente (§8).

### PostgreSQL 17.6

**HECHO** — `supabase/.temp/postgres-version` → `17.6.1.084`. Habilita `security_invoker` en vistas (PG15+), `MERGE`, y las funciones `pg_advisory_*`. Todo lo que propone este plan es compatible.

---

## 4. P0-01 — Multi-tenancy

### Problema

Existe un camino por el cual un paciente de la Clínica A puede quedar asociado a la Clínica B, y por el cual filas nuevas caen en una clínica de producción concreta sin que nadie lo decida.

Son **dos problemas encadenados**, y el orden importa porque el segundo es la causa raíz:

1. **La causa raíz:** `pacientes.tenant_id`, `citas.tenant_id` y `turnos.tenant_id` tienen `DEFAULT '2845c423-...'`. Todo INSERT que omita la columna aterriza en esa clínica, silenciosamente.
2. **El síntoma:** `sync_turno_to_cita()` es un `SECURITY DEFINER` que busca pacientes por email sin filtrar tenant y omite `tenant_id` en sus dos INSERT — explotando (1).

### Evidencia

**HECHO** — `remote_schema.sql:419-465`:

```sql
CREATE OR REPLACE FUNCTION "public"."sync_turno_to_cita"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public'
    AS $$
BEGIN
  ...
  SELECT id INTO v_paciente_id
  FROM pacientes
  WHERE email = NEW.email            -- (a) sin tenant_id
  LIMIT 1;

  IF v_paciente_id IS NULL THEN
    INSERT INTO pacientes (nombre, email, telefono)   -- (b) sin tenant_id → DEFAULT
    VALUES (v_nombre_completo, NEW.email, NEW.telefono)
    RETURNING id INTO v_paciente_id;
  END IF;

  INSERT INTO citas (paciente_id, fecha_hora, tipo_tratamiento, estado, notas, duracion_minutos)
  VALUES (...);                       -- (c) sin tenant_id → DEFAULT
  RETURN NEW;
END; $$;
```

**HECHO** — trigger activo, `remote_schema.sql:1201`:
```sql
CREATE OR REPLACE TRIGGER "trigger_turno_to_cita" AFTER INSERT ON "public"."turnos"
  FOR EACH ROW EXECUTE FUNCTION "public"."sync_turno_to_cita"();
```

**HECHO** — `turnos` **sí tiene** `tenant_id` (`remote_schema.sql`, NOT NULL DEFAULT). La función tiene `NEW.tenant_id` disponible y no lo usa. No es una limitación del esquema: es un olvido.

**HECHO** — ninguna migración posterior elimina trigger ni función (verificado con `grep DROP TRIGGER` / `DROP FUNCTION` sobre las 37 migraciones).

**HECHO** — `grep -rn "from('turnos')" src/` → **0 resultados**. La aplicación no escribe en `turnos`.

**HECHO** — `/api/reserva/crear/route.ts` implementa **el mismo flujo funcional** (reserva pública → buscar/crear paciente → crear cita) de forma correcta: filtra por `tenant.id` (`:95,108,135`), pasa `tenant_id` en ambos INSERT (`:149,174`), valida consentimiento, aplica rate limit. **`turnos` + trigger son la versión legacy de un flujo que ya tiene reemplazo moderno.**

**NO VERIFICADO** — si algo externo al repositorio (un formulario embebido, un Zapier, una carga manual) sigue insertando en `public.turnos`. Es la única incógnita que condiciona la decisión.

### Solución

#### Los 8 casos que pediste

Con el diseño propuesto, este es el comportamiento esperado:

| # | Caso | Comportamiento diseñado |
|---|---|---|
| 1 | Clínica A crea turno | Paciente y cita quedan en A. `turnos.tenant_id` se propaga explícitamente. |
| 2 | Clínica B crea turno | Idem en B. Sin interferencia con A. |
| 3 | **Mismo email en A y B** | Dos pacientes distintos, uno por clínica. La búsqueda filtra por tenant, así que B nunca encuentra al paciente de A. **Es el caso que hoy falla.** |
| 4 | Email nuevo | Se crea paciente en el tenant del turno, con `tenant_id` explícito. |
| 5 | Paciente existente (mismo tenant) | Se reutiliza. Match por `lower(trim(email))` + `tenant_id`. |
| 6 | Paciente inexistente | Se crea. Con token del portal generado por la función centralizada de P0-02. |
| 7 | **`tenant_id` = NULL** | **Imposible por esquema** (`NOT NULL`). Y sin DEFAULT, omitirlo lanza `23502 not_null_violation`: la operación falla ruidosamente en vez de aterrizar en `2845c423`. |
| 8 | **Intento de acceso cruzado** | Bloqueado en tres capas: RLS (`turnos_tenant_isolation`), FK compuesta `(paciente_id, tenant_id)`, y filtro explícito en la función. |

#### Decisión sobre el trigger — comparación de opciones

| | **A. Eliminar trigger y función** | **B. Corregir la función** |
|---|---|---|
| Esfuerzo | 30 min | 2 h |
| Riesgo si `turnos` está vivo | **Alto** — turnos entrantes dejan de generar citas, en silencio | Bajo |
| Riesgo si `turnos` está muerto | Nulo | Nulo, pero mantiene código muerto con privilegios |
| Deuda resultante | Ninguna | Un `SECURITY DEFINER` más que auditar |

**Recomendación: B primero, A después.** Secuencia:

1. **Paso 1 — corregir la función** (bajo riesgo, no rompe nada esté viva o muerta la tabla). Deja de ser un vector inmediatamente.
2. **Paso 2 — instrumentar**: agregar `RAISE LOG` en la función y observar 14 días. Responde de forma empírica lo NO VERIFICADO, sin depender de la memoria de nadie.
3. **Paso 3 — decidir**: si no hubo invocaciones, `DROP TRIGGER` + `DROP FUNCTION` + `REVOKE INSERT ON turnos FROM anon, authenticated`. **La tabla no se borra** — es historial. Si sí hubo invocaciones, hay que identificar el origen y migrarlo a `/api/reserva/crear`.

Esto respeta P6: el paso 1 es reversible, el paso 3 se toma con datos.

#### Qué información debe recibir la función

Ninguna adicional. `NEW.tenant_id` ya está disponible en el trigger. La corrección es de tres líneas:

- La búsqueda pasa a filtrar por `tenant_id = NEW.tenant_id` y a comparar `lower(trim(email))`.
- Ambos INSERT pasan `NEW.tenant_id` explícitamente.
- Se agrega `SET search_path = public, pg_temp` (hoy tiene solo `'public'`, a diferencia de las `fn_*` que sí incluyen `pg_temp`).

### Cambios de DB

Cinco bloques, en este orden.

**1. Quitar los DEFAULT (la causa raíz).**
`pacientes.tenant_id`, `citas.tenant_id`, `turnos.tenant_id` → `DROP DEFAULT`. Las columnas siguen `NOT NULL`.
*Precondición verificada:* todo INSERT del código pasa `tenant_id` explícito.
*Efecto:* cualquier omisión futura lanza `23502` en vez de contaminar la clínica `2845c423`.

**2. FK compuesta tenant-scoped (el invariante estructural).**
Es el cambio de mayor valor de todo P0-01: hace **estructuralmente imposible** que una cita apunte a un paciente de otra clínica.

- `UNIQUE (id, tenant_id)` en `pacientes` (redundante para Postgres, requerido como destino de la FK).
- En `citas`: `FOREIGN KEY (paciente_id, tenant_id) REFERENCES pacientes(id, tenant_id)`.
- Mismo patrón, en una segunda tanda, para `historial_dental`, `paciente_fotos`, `tratamiento_items`, `pagos`, `presupuestos` → `pacientes`/`citas`.

*Precondición:* la consulta de detección D1 (abajo) debe devolver 0 filas.

**3. Unicidad de email por clínica.**
`UNIQUE (tenant_id, lower(trim(email))) WHERE email IS NOT NULL AND email <> ''`.
Convierte en invariante la premisa que la función asume. **Requiere deduplicación previa** — ver D3.
*Decisión de producto:* si una clínica legítimamente tiene dos pacientes con el mismo email (madre e hijo menor), este constraint la rompe. Ver §13.

**4. Índice de soporte.**
`pacientes (tenant_id, lower(trim(email)))`. Sostiene la búsqueda de la función y el constraint del punto 3.

**5. Corrección de la función.** Según §Solución.

### Cambios backend

Ninguno para P0-01. La aplicación ya pasa `tenant_id` en todos los INSERT. Este P0 se resuelve **enteramente en la base**, que es exactamente lo que pide el principio P3.

Único ajuste asociado, y pertenece a C7 (fallbacks): eliminar `NEXT_PUBLIC_DEFAULT_TENANT_ID` de `api/paciente/[token]/route.ts:71`, `api/confirmar-turno/route.ts:42`, `api/recordatorios/route.ts:42`, y el UUID hardcodeado de `api/send-recordatorios/route.ts:11,88`. Con los DEFAULT de columna eliminados, estos fallbacks quedan sin propósito y solo pueden hacer daño (P2).

### Migración de datos

Consultas de detección. **Todas son SELECT.** Hay que ejecutarlas y archivar el resultado *antes* de tocar nada.

**D1 — Cruces reales entre clínicas (la consulta decisiva).**
```sql
SELECT c.id AS cita_id, c.tenant_id AS tenant_cita,
       p.id AS paciente_id, p.tenant_id AS tenant_paciente, c.creado_en
FROM citas c JOIN pacientes p ON p.id = c.paciente_id
WHERE c.tenant_id <> p.tenant_id;
```
Si devuelve filas, **hay datos cruzados hoy** y hay que resolverlos a mano antes de la FK compuesta. Si devuelve 0, el trigger nunca produjo daño y la FK se aplica sin fricción.

**D2 — Sospechosos de haber nacido del DEFAULT.**
```sql
SELECT p.id, p.nombre, p.email, p.creado_en
FROM pacientes p
WHERE p.tenant_id = '2845c423-affa-4ca2-9c5f-f4ec8e35701a'
  AND EXISTS (SELECT 1 FROM turnos t
              WHERE lower(trim(t.email)) = lower(trim(p.email))
                AND t.tenant_id <> p.tenant_id);
```
Pacientes en la clínica por defecto cuyo email aparece en un turno de **otra** clínica. Es el patrón exacto que deja el trigger.

**D3 — Colisiones de email dentro de una misma clínica** (bloquean el constraint del punto 3).
```sql
SELECT tenant_id, lower(trim(email)) AS email_norm, count(*), array_agg(id)
FROM pacientes
WHERE email IS NOT NULL AND trim(email) <> ''
GROUP BY tenant_id, lower(trim(email))
HAVING count(*) > 1;
```

**D4 — Actividad de `turnos`** (responde el NO VERIFICADO).
```sql
SELECT count(*) AS total, max(created_at) AS ultimo,
       count(*) FILTER (WHERE created_at > now() - interval '90 days') AS ultimos_90d
FROM turnos;
```

**D5 — Otras tablas con `tenant_id` inconsistente respecto de su padre.** Misma forma que D1 para `historial_dental`, `paciente_fotos`, `tratamiento_items`, `pagos`, `facturas`.

**Criterio:** si D1 y D5 devuelven 0 y D4 muestra actividad nula en 90 días, este P0 se cierra en una tarde. Si D1 devuelve filas, cada una necesita decisión manual — **no automatizar la reasignación**: adivinar a qué clínica pertenece una historia clínica es peor que dejarla marcada.

### Tests

Sobre PGlite, extendiendo `src/lib/tenant-isolation.test.ts` (que ya monta `auth.uid()` y `SET ROLE authenticated`):

1. `sync_turno_to_cita`: turno en A con email existente en B → se crea paciente **nuevo en A**; el de B queda intacto (caso 3).
2. Idem con email existente en A → **reutiliza** el paciente de A, no crea duplicado (caso 5).
3. `INSERT INTO citas` omitiendo `tenant_id` → falla con `23502` (caso 7). **Hoy este test fallaría**: es la prueba de que el DEFAULT se eliminó.
4. `INSERT INTO citas` con `tenant_id` de A y `paciente_id` de B → falla por FK compuesta (caso 8).
5. Invariante global: tras ejecutar la suite, D1 devuelve 0 filas.
6. Segundo paciente con el mismo email en la misma clínica → viola el constraint único.
7. **Test de patrón** (estilo `guardas-multitenant.test.ts`): fallar si alguna función `SECURITY DEFINER` en `supabase/migrations/` contiene `FROM pacientes`/`FROM citas` sin `tenant_id` en su `WHERE`. Es lo que evita que el problema vuelva.

### Riesgos

| Riesgo | Mitigación |
|---|---|
| `turnos` está viva y al eliminar el trigger se pierden turnos en silencio | No eliminar hasta tener D4 + 14 días de log. Paso 1 (corregir) es seguro en ambos escenarios |
| D1 devuelve filas: hay historias clínicas ya cruzadas | Resolución manual con la clínica. **No automatizar** |
| El constraint de email único rompe casos legítimos (familias) | Ejecutar D3 primero. Si aparecen casos reales → decisión de producto (§13) |
| La FK compuesta falla al aplicarse por datos previos | D1 y D5 son precondición dura. Aplicar `NOT VALID` + `VALIDATE CONSTRAINT` después, para no bloquear la tabla |
| Quitar el DEFAULT rompe un INSERT no auditado | Verificado en `src/`. **NO VERIFICADO** para scripts fuera del repo o para el SQL Editor |

---

## 5. P0-02 — Tokens del portal de pacientes

### Problema

El token del portal de paciente da acceso permanente a la historia clínica. La expiración está implementada del lado de la lectura y **nunca se escribe**.

### Evidencia

**HECHO** — se valida (`src/app/api/paciente/[token]/route.ts:66-69`):
```ts
if (pac.token_expira && new Date(pac.token_expira).getTime() < Date.now()) {
  return NextResponse.json({ error: 'Este enlace ha expirado...' }, { status: 410 })
}
```

**HECHO** — nunca se escribe: `grep -rn "token_expira" src/ | grep -iE "update|set|insert"` → **0 resultados**.

**HECHO** — la migración lo declara (`supabase_migration_security_fix.sql:50-58`): *"NO expiramos los tokens existentes... El portal trata token_expira NULL como válido para siempre... No se aplica ninguna expiración automática."*

**HECHO** — 7 puntos de generación, todos `crypto.randomUUID()` sin expiración:

| Archivo | Línea | Contexto |
|---|---|---|
| `src/app/pacientes/page.tsx` | 99 | alta manual |
| `src/app/pacientes/page.tsx` | 209, 249 | botón "Generar link" |
| `src/app/dashboard/page.tsx` | 93 | alta rápida |
| `src/app/agenda/page.tsx` | 1603 | alta desde agenda |
| `src/components/NuevaCitaModal.tsx` | 183 | alta desde modal |
| `src/app/api/reserva/crear/route.ts` | 145 | reserva online |
| `src/app/api/pacientes/importar/route.ts` | 105 | importación masiva |

**HECHO** — qué abre el token (`api/paciente/[token]/route.ts`): nombre, teléfono, **alergias**, **antecedentes**, historial dental completo, turnos, **fotos clínicas** (URLs firmadas a 1 h), puntos, recomendaciones.

**HECHO** — el token se almacena **en claro** en `pacientes.token`, y `src/app/pacientes/page.tsx:50` hace `select('*')`, así que **el token de todos los pacientes de la clínica viaja al navegador** cada vez que alguien abre el listado.

**HECHO** — entropía correcta: UUIDv4 = 122 bits. La enumeración es inviable. El problema no es adivinarlo: es que no caduca y que está en muchos lugares.

### Solución

#### Decisión 1 — ¿un token o dos?

**Ya son dos, y está bien.** `pacientes.token` (portal) y `consentimientos_firmados.token_firma` (firma remota, `UUID UNIQUE DEFAULT gen_random_uuid()`). Tienen ciclos de vida distintos y deben seguir separados:

| | Portal | Firma |
|---|---|---|
| Alcance | Toda la historia del paciente | Un documento |
| Uso | Recurrente | **Único** |
| Vida | Meses | Días |
| Revocación | Rotación | Automática al firmar |

#### Decisión 2 — duración

La clave está en un detalle de diseño que el sistema ya resolvió bien: **`/t/[codigo]` maneja el flujo de turno (confirmar, agendar, reprogramar) sin usar el token del paciente.** Está documentado en `src/app/t/[codigo]/page.tsx:17-19`: *"Deliberadamente no expone el token del paciente —que abre su ficha entera"*.

Es decir: el token del portal **no** es necesario para el flujo de alta frecuencia. Su único uso es consultar historia, fotos y puntos. Eso permite acortarlo sin afectar la operación.

**Recomendación: 30 días, con renovación automática en cada recordatorio enviado.**

- El envío de recordatorios ya toca la fila del paciente → extender la expiración ahí es gratis.
- Un paciente activo (con turnos) nunca ve un link vencido.
- Un paciente que dejó de venir pierde el acceso a los 30 días de su último contacto — que es el comportamiento deseado.
- Un link filtrado tiene una ventana acotada.

*Alternativa descartada:* 90 días fijos. Más cómodo, pero deja una ventana de exposición larga sin beneficio operativo real, dado que el flujo de turno ya está cubierto por `/t/`.

**Para `token_firma`: 7 días**, más invalidación al firmar. Un pedido de consentimiento es una acción acotada.

#### Decisión 3 — ¿hashear el token en la base?

**Sí. Recomendado, y es el cambio de mayor rendimiento de seguridad por hora invertida.**

Se guarda `token_hash = sha256(token)`. La búsqueda pasa de `WHERE token = $1` a `WHERE token_hash = sha256($1)` — sigue siendo un lookup exacto por índice, sin coste. **No hace falta bcrypt/argon**: eso protege secretos de baja entropía contra fuerza bruta; con 122 bits el ataque no existe.

Qué resuelve:

1. Neutraliza `select('*')` en `pacientes/page.tsx:50`: aunque el listado siga trayendo la columna, lo que llega al navegador es un hash inútil.
2. Neutraliza el acceso de `staff` (P0-05): hoy cualquier miembro lee todos los tokens.
3. Un dump de la base deja de ser un llavero de historias clínicas.

**La migración es limpia y no rompe ningún link vigente**: se calcula el hash de los tokens existentes en la misma base (`UPDATE pacientes SET token_hash = encode(sha256(token::bytea),'hex')`), se cambia el lookup, y recién entonces se descarta la columna en claro. Los links que ya tienen los pacientes siguen funcionando porque el hash se calcula sobre el valor entrante.

*Contrapartida honesta:* la clínica pierde la posibilidad de "ver" el link de un paciente en la base; solo puede **regenerarlo**. Es el comportamiento correcto y hay que reflejarlo en la UI (el botón pasa de "Ver link" a "Generar y copiar link", mostrándolo una sola vez).

#### Decisión 4 — sacar el token de la URL

Es el problema de fondo, y es lo que hace que P0-03 (Sentry) sea tan grave: mientras el token esté en el path, **cada request lo publica** en logs, historial, `Referer` y Sentry.

| | **A. Mitigar (inmediato)** | **B. Intercambio por cookie (objetivo)** |
|---|---|---|
| Qué | `Referrer-Policy: no-referrer` + scrubbing en Sentry + `X-Robots-Tag` (ya está) | `/paciente/<token>` valida, setea cookie `httpOnly` `SameSite=Lax` de sesión corta, redirige 302 a `/paciente` |
| Esfuerzo | 3 h | 1-2 días |
| Token en logs | Solo en la primera request | Solo en la primera request, y luego **nunca** |
| Token en Sentry | Depende del scrubber | Estructuralmente ausente |
| Riesgo | Nulo | Medio (afecta el flujo del paciente) |

**Recomendación: A ahora, B en la misma fase P0 si el calendario lo permite; si no, primer ítem de P1.** A es un parche que depende de que el scrubber no tenga agujeros; B elimina la clase de problema. No son excluyentes: B se apoya en A.

#### Decisión 5 — punto único de generación

Los 7 puntos actuales pasan a llamar a un helper único (`src/lib/token-paciente.ts`, a crear) que genera, hashea, fija expiración y devuelve el token en claro **una sola vez** para mostrarlo o enviarlo. Con eso, la política de expiración deja de depender de que cada nuevo call site se acuerde.

### Cambios de DB

- `pacientes`: agregar `token_hash text`, índice `UNIQUE` sobre él. Backfill desde `token`. Retirar `token` en un **segundo** deploy, nunca en el mismo (P6).
- Backfill de `token_expira` para los tokens existentes: `now() + interval '30 days'` — les da un mes de gracia en vez de cortarlos de golpe.
- `consentimientos_firmados`: agregar `token_expira timestamptz`, default 7 días.
- **No** hashear `token_firma` en esta fase: es de un solo uso y vida corta; el costo/beneficio no lo justifica todavía.

### Cambios backend

- **Nuevo** `src/lib/token-paciente.ts`: `generarTokenPaciente()`, `hashToken()`, `renovarToken()`.
- `api/paciente/[token]/route.ts`: lookup por hash; **eliminar el bloque de fallback de `:41-61`** (el `select` reducido que se dispara si falla el principal y que deja `token_expira: null`, es decir, que **omite la validación de expiración ante cualquier error de columna**). Ese fallback es un bypass silencioso del control que estamos construyendo.
- `api/consentimientos/firmar/[token]/route.ts`: validar expiración en GET y POST; **y dejar de devolver `contenido` cuando `estado === 'firmado'`** (hoy sigue sirviendo el documento completo tras la firma).
- `api/send-recordatorios/route.ts`: renovar expiración al enviar.
- 7 call sites → helper único.

### Cambios frontend

- `src/app/pacientes/page.tsx:50`: quitar `token`/`token_hash` del `select` (con hash deja de ser crítico, pero no hay razón para enviarlo).
- Botón "Generar link": mostrar el token **una sola vez**, con aviso de que no será recuperable.
- Portal: pantalla de 410 con un CTA claro para solicitar un link nuevo.

### Tests

1. Token con `token_expira` en el pasado → 410.
2. Token con `token_expira` NULL → **410** (tras el backfill, NULL deja de significar "eterno"). Test de la inversión de default.
3. Token de paciente A no devuelve datos de B.
4. La respuesta del portal **no** contiene `notas` de citas ni columnas nuevas de `tenants` (regresión sobre la denylist de `route.ts:85-97`).
5. Enviar un recordatorio extiende `token_expira`.
6. Rotar el token invalida el anterior de inmediato.
7. `token_firma` expirado → rechazo; ya firmado → GET no devuelve `contenido`.
8. **Test de patrón:** fallar si algún archivo fuera de `lib/token-paciente.ts` llama a `crypto.randomUUID()` y lo asigna a un campo `token`.
9. Que el hash almacenado corresponda a `sha256` del token emitido, y que el lookup por token en claro falle.

### Riesgos

| Riesgo | Mitigación |
|---|---|
| Pacientes con links en uso pierden acceso al activar la expiración | Backfill a `now() + 30 días`, no a `now()`. Avisar por el recordatorio de ese mes |
| El hash rompe el lookup y el portal cae para todos | Deploy en dos fases: escribir ambas columnas y leer por hash **con fallback a claro** durante un ciclo; retirar `token` recién después |
| Perder la capacidad de ver el link desde la base complica al soporte | Es intencional. La UI debe permitir regenerar y reenviar en un clic |
| La cookie de la opción B se pierde en el WebView de WhatsApp | Verificar en iOS y Android antes de eliminar el acceso por token. `SameSite=Lax` es lo que corresponde para una navegación top-level |

---

## 6. P0-03 — Sentry y PII

### Problema

Sentry está configurado para capturar PII, muestrear el 100 % de las trazas y enviar logs. Como los secretos del sistema viajan en el path de la URL (P0-02), **Sentry es hoy un repositorio de tokens de acceso a historias clínicas**.

### Evidencia

**HECHO** — los tres archivos (`sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts`) contienen exactamente:
```ts
dsn: "https://c32ad30fdc6aebeaa36490bc645231d7@o4511264226541568.ingest.us.sentry.io/4511264235913216",
tracesSampleRate: 1,
enableLogs: true,
sendDefaultPii: true,
```

**HECHO** — `src/app/layout.tsx:29` inyecta `...Sentry.getTraceData()` en el `<head>` de **todas** las páginas, incluido el portal público.

**HECHO** — URLs que contienen secretos y que por tanto quedan en cada traza:
```
/paciente/<token>              → historia clínica completa
/api/paciente/<token>          → idem
/firmar/<token>                → firma de consentimiento
/t/<codigo>                    → turno
/api/send-recordatorios?token=<CRON_SECRET>   → dispara envíos de todas las clínicas
/api/cron?token=<CRON_SECRET>
```

**HECHO** — `src/app/api/cron/route.ts:31` construye la primera de esas URLs: `` fetch(`${base}/api/send-recordatorios?token=${secret}`) ``.

**INFERENCIA** — con `sendDefaultPii: true`, el SDK adjunta IP, headers de request y cookies. Combinado con `tracesSampleRate: 1`, cada request genera un evento con su URL completa. No verifiqué el contenido del proyecto de Sentry (no tengo acceso); la inferencia sale de la documentación del SDK y de la configuración leída.

### Solución

#### Configuración recomendada

Los tres archivos convergen a un módulo compartido con:

| Opción | Valor | Por qué |
|---|---|---|
| `sendDefaultPii` | `false` | Corta IP, cookies y headers en un solo cambio |
| `tracesSampleRate` | `0.1` prod / `1.0` dev | Con un solo cliente, el 10 % alcanza; a 1.0 el volumen crece linealmente con los tenants |
| `enableLogs` | `false` prod | Los 57 `console.*` del proyecto no están saneados |
| `beforeSend` | scrubber | Errores |
| `beforeSendTransaction` | scrubber | **Imprescindible**: las trazas son la principal fuente de URLs |
| `beforeBreadcrumb` | scrubber | Los breadcrumbs de `fetch`/navegación **también** llevan URLs |
| `environment` | `process.env.VERCEL_ENV` | Separar prod de preview |

**Los tres hooks son necesarios.** Sanear solo `beforeSend` es el error habitual: deja pasar los tokens por transacciones y breadcrumbs, que es justamente donde están.

#### Qué se sanea

Una función pura en `src/lib/sentry-scrub.ts` (a crear), testeable de forma aislada:

1. **Path:** reemplazar el segmento que sigue a `/paciente/`, `/firmar/`, `/api/paciente/`, `/api/consentimientos/firmar/`, `/t/` por `[redacted]`. Reemplazar cualquier UUID suelto en un path por `[uuid]`.
2. **Query:** eliminar el valor de `token`, `c`, `secret`, `key`, `access_token`, `preapproval_id`.
3. **Headers:** eliminar `cookie`, `authorization`, `x-signature`, `x-real-ip`, `x-forwarded-for`.
4. **Body:** eliminar `firmaPng`, `token`, `firmanteDoc`, `pacienteDocNro`, `alergias`, `antecedentes`, `notas`, `email`, `telefono`.
5. **Breadcrumbs:** aplicar 1 y 2 a `breadcrumb.data.url`.

Se implementa como **allowlist en el path** (normalizar a la ruta de Next: `/paciente/[token]`), no como denylist de valores. Una denylist se queda vieja; la forma de la ruta no.

#### Qué se conserva

Sanear de más deja Sentry inútil y garantiza que alguien lo apague. Lo que **sí** debe seguir llegando:

- Mensaje de error y stack trace completo.
- **Ruta normalizada** (`/paciente/[token]`), que es lo que sirve para agrupar.
- Método HTTP y status.
- `release` y `environment`.
- **`tenant_id` como tag explícito.** No es PII —identifica una clínica, no una persona— y es imprescindible para diagnosticar en multi-tenant. Enviarlo a propósito con `Sentry.setTag()` es mejor que recibirlo por accidente dentro de un body.
- `user.id` (UUID de Supabase). Con `sendDefaultPii: false` no arrastra email ni IP.

#### Cómo no romper Sentry

1. Un solo módulo de config compartido: tres archivos con la misma constante divergen.
2. El scrubber **nunca lanza**: envolver en `try/catch` y ante fallo devolver `null` (descartar el evento) en vez de dejar pasar uno sin sanear. Fallar cerrado.
3. Activar además el **Data Scrubbing del lado servidor de Sentry** (Settings → Security & Privacy). Segunda barrera independiente del deploy.
4. Verificar en preview antes de prod: provocar un error en `/paciente/<token>` y revisar el evento a mano.

### Cambios de DB

Ninguno.

### Cambios backend

- **Nuevo** `src/lib/sentry-scrub.ts` — función pura, sin dependencias del SDK.
- **Nuevo** `sentry.shared.ts` — config común.
- Los tres archivos de config pasan a consumirla.
- `src/app/api/cron/route.ts:31` — el secreto pasa al header `Authorization`. **El código ya acepta esa forma** (`:20,25`); solo hay que dejar de usar la variante por query param. Esto también es el fix de I3.

### Cambios frontend

`src/app/layout.tsx:29` — revisar si `Sentry.getTraceData()` es necesario en el portal público. **NO VERIFICADO** si se puede condicionar por ruta en `generateMetadata`; requiere probar.

### Tests

El scrubber es una función pura: es la parte fácil y la que da certeza.

1. `/paciente/8f3a...-uuid` → `/paciente/[redacted]`.
2. `?token=abc123` → `?token=[redacted]`.
3. Header `cookie` ausente en la salida.
4. `firmaPng` ausente del body saneado.
5. Breadcrumb con `data.url` conteniendo un token → saneado.
6. El scrubber recibe un evento malformado (`null`, sin `request`) → no lanza.
7. Se conservan `message`, `stack`, `tags.tenant_id`.
8. **Test de patrón:** fallar si algún `sentry*.config.ts` contiene `sendDefaultPii: true`.

Verificación manual, no automatizable: provocar un error real en preview y auditar el evento en el panel de Sentry.

### Riesgos

| Riesgo | Mitigación |
|---|---|
| El scrubber tiene un agujero y algún token sigue pasando | Allowlist por forma de ruta + Data Scrubbing del lado servidor + auditoría manual del primer evento |
| Bajar `tracesSampleRate` oculta un problema de performance | Es 0.1, no 0. Y hay un problema de performance real (I5/I6) que no se diagnostica con trazas |
| Sanear de más vuelve Sentry inútil y alguien lo desactiva | La lista de §"Qué se conserva" es parte del diseño, no un residuo |
| Los eventos **ya almacenados** en Sentry siguen conteniendo tokens | **El fix no es retroactivo.** Hay que purgar los datos existentes desde el panel y, si algún token quedó expuesto, rotarlo. Esto depende de P0-02 |

---

## 7. P0-04 — Google Sheets multi-tenant

### Problema

Una única planilla, definida por una env var global, recibe datos de pacientes de todas las clínicas.

### Evidencia

**HECHO** — `src/app/api/sync-sheet/route.ts`: `spreadsheetId: process.env.GOOGLE_SHEET_ID`, sin ninguna lectura de `tenant_id` en todo el archivo. Escribe `nombre`, `email`, `telefono`, `tipo_tratamiento`, fecha, hora, estado, **`record.notas`** (notas internas del profesional) y el id.

**HECHO** — el trigger dispara para todos los tenants (`remote_schema.sql:1197`):
```sql
CREATE OR REPLACE TRIGGER "sync_turnos_to_sheets" AFTER INSERT OR UPDATE ON "public"."citas"
  FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"(
    'https://turnos-app-delta.vercel.app/api/sync-sheet', 'POST',
    '{"Content-type":"application/json"}', '{}', '5000');
```

**HECHO** — el trigger envía **solo** `Content-type`. El endpoint exige `Authorization: Bearer <SYNC_SHEET_SECRET>` (`route.ts:19-22`). **Todas las invocaciones reciben 401: la sincronización no funciona.** Falla cerrada, que es la suerte que evitó la fuga.

**HECHO** — efecto colateral: cada INSERT/UPDATE en `citas`, de cualquier clínica, dispara una llamada HTTP con timeout de 5 s hacia un endpoint que devuelve 401. Es latencia en el camino de escritura de la agenda.

**HECHO** — no hay flujo OAuth de Google en el proyecto. El único uso es una service account de plataforma (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`) con scope `spreadsheets`.

### Solución

#### La pregunta central: ¿cómo garantizamos que el `tenant_id` es confiable?

Pediste explícitamente no aceptar "agregá `google_sheet_id` a `tenants`". Tenés razón en desconfiar: esa columna resuelve *dónde* está el ID y no resuelve nada de *quién elige* el ID. Si el `tenant_id` con el que se busca la planilla es manipulable, la columna solo cambia el lugar del problema.

Y hay un agravante que hace que esto importe más de lo que parece: con una service account compartida, **la plataforma tiene acceso a las planillas de todas las clínicas**. No hay una segunda barrera. Si el mapeo `tenant_id → sheet_id` se corrompe, la escritura en la planilla equivocada **funciona**. El mapeo es el único control.

Por eso la regla es categórica: **el `tenant_id` que selecciona la planilla nunca puede provenir del request.**

Tres orígenes posibles, y solo dos son admisibles:

| Origen | ¿Confiable? | Por qué |
|---|---|---|
| `body.tenant_id` / `record.tenant_id` del webhook | **No** | Quien controle el body elige la planilla destino |
| `record.id` → `SELECT tenant_id FROM citas WHERE id = $1` con service-role | **Sí** | La base es la autoridad. El atacante controla *qué* fila, no *a quién pertenece* |
| Sesión: `auth.getUser()` → `tenant_users` | **Sí** | Para configurar, no para sincronizar |

**Diseño resultante — la derivación en dos saltos:**

```
webhook → autenticar (Bearer)  →  tomar SOLO record.id
                               →  SELECT tenant_id FROM citas WHERE id = $1   ← autoridad
                               →  SELECT sheet_id FROM tenant_integraciones
                                    WHERE tenant_id = <derivado>              ← mapeo
                               →  escribir
```

El body aporta **un identificador de fila y nada más**. Todo lo demás se re-lee de la base. Aunque alguien conociera el secreto del webhook y forjara un payload con `tenant_id` de otra clínica, ese campo se ignora: el destino sale de la fila real.

Defensas complementarias:

- **`UNIQUE (google_sheet_id)`** en la tabla de integraciones: dos clínicas no pueden apuntar a la misma planilla. Cierra el ataque de "configuro la planilla de mi competidor para que me lleguen sus turnos".
- **Verificación al configurar:** al guardar el ID, escribir una celda de prueba y guardar `verificado_en`. Sin verificación, no se sincroniza.
- **Un secreto por tenant** en vez de uno global, para que el compromiso de una clínica no habilite forjar webhooks de otra.

#### Dónde vive el sheet ID: tabla aparte, no columna en `tenants`

`tenant_integraciones (tenant_id PK, google_sheet_id, secreto_webhook, verificado_en, activo, ...)`, **sin ninguna policy para `authenticated`** — accesible solo por `service_role`.

Razón: `tenants` es legible por sus miembros (`tenants_select_own`) y la vista `tenants_public` la expone a `anon`. Meter secretos ahí obliga a confiar en que ninguna consulta futura los arrastre — el mismo error de la denylist en `api/paciente/[token]/route.ts:85-97`. Una tabla separada hace que el default sea "nadie lo ve", y la configuración pasa por una API que valida rol.

#### OAuth vs service account

| | **Service account + compartir la planilla** | **OAuth por clínica** |
|---|---|---|
| Alta | La clínica comparte su planilla con un email de la plataforma | Flujo OAuth completo |
| Secretos a guardar | Ninguno por tenant | **Refresh tokens** por tenant (nuevo problema de secretos en reposo) |
| Revocación | La clínica deja de compartir. Un clic, unilateral | Revocar en la cuenta de Google |
| Alcance | Solo las planillas explícitamente compartidas | Según scope |
| Aislamiento | **Débil**: una sola identidad para todas | Fuerte |
| Esfuerzo | ~1 día | ~4 días + mantenimiento de refresh |

**Recomendación: service account para v1.** El aislamiento débil se compensa con la derivación de tenant descrita arriba y con `UNIQUE (google_sheet_id)`. Guardar refresh tokens de Google de todas las clínicas introduce un problema de secretos en reposo peor que el que resuelve, en un sistema que todavía no tiene cifrado a nivel de aplicación.

Migrar a OAuth cuando aparezca alguna de estas: una clínica exige que la plataforma no tenga acceso permanente; se necesita escribir en Calendar (donde compartir no alcanza); o se supera el rate limit de la service account.

#### Sacar la llamada HTTP del trigger — outbox

El problema estructural no es el sheet ID: es que **una escritura en `citas` hace una llamada HTTP sincrónica con 5 s de timeout**. Eso es latencia y acoplamiento en el camino crítico de la agenda.

Reemplazo: el trigger hace `INSERT INTO sheet_sync_queue (cita_id, tenant_id, operacion)` — local, microsegundos, transaccional. Un cron procesa la cola en lote.

Beneficios que se obtienen de arrastre:

- **Reintentos** reales, con `intentos` y backoff.
- **Deduplicación**: `UNIQUE (cita_id) WHERE estado = 'pendiente'` colapsa N updates de la misma cita en un envío.
- **Sin sincronización duplicada**: hoy dos updates concurrentes pueden ambos hacer `append` (la búsqueda de `route.ts:57-66` lee toda la planilla y busca el id — con race). La cola serializa por cita.
- **Sin lectura completa de la planilla por update**: `values.get("Turnos!A:I")` en cada UPDATE es O(n) y no escala.
- Si la clínica no tiene integración configurada, el worker descarta la fila sin ruido.

### Cambios de DB

- **Nueva** `tenant_integraciones` — solo `service_role`.
- **Nueva** `sheet_sync_queue` — solo `service_role`.
- Reemplazar el trigger `sync_turnos_to_sheets` por uno que inserte en la cola.
- **Paso previo e inmediato:** `DROP TRIGGER sync_turnos_to_sheets ON citas`. Hoy solo produce 401 y latencia. Eliminarlo es reversible, no rompe nada (la feature ya no funciona) y quita 5 s de timeout del camino de escritura. Va en el primer día de P0.

### Cambios backend

- `api/sync-sheet/route.ts` → se convierte en worker de cola (`api/cron/sync-sheets`), autenticado por `CRON_SECRET` **en header**.
- **Nueva** `api/integraciones/google-sheets` (GET/POST/DELETE): configuración, protegida por sesión + rol `admin`/`owner`.
- **Nuevo** `src/lib/google-sheets.ts`: cliente, verificación de acceso, escritura idempotente.

### Cambios frontend

Sección en `/configuracion` (solo admin/owner): pegar el ID, ver el email de la service account para compartir, botón "Verificar", estado de última sincronización y de errores.

### Tests

1. Webhook con `record.id` de la clínica A y `record.tenant_id` **forjado** de B → escribe en la planilla de **A**. *Es el test que valida el principio de derivación.*
2. Webhook sin `Authorization` → 401.
3. Clínica sin integración → se descarta sin error.
4. Dos clínicas intentan configurar el mismo `google_sheet_id` → la segunda es rechazada.
5. `staff` intenta configurar la integración → 403.
6. Cola: dos updates de la misma cita → un solo envío.
7. Fallo de la API de Google → la fila queda pendiente, `intentos` se incrementa, se reintenta.
8. Superado el máximo de intentos → estado `fallida`, no se reintenta indefinidamente.

### Riesgos

| Riesgo | Mitigación |
|---|---|
| Al eliminar el trigger, alguien nota que "la sincronización dejó de andar" | Ya no anda (401). Confirmar con la clínica antes |
| La service account queda con acceso a planillas de muchas clínicas | Inherente al modelo. Se compensa con derivación de tenant + `UNIQUE(sheet_id)` + verificación. Documentarlo en el contrato |
| La cola se atrasa y los datos llegan tarde | Es sincronización a una planilla, no un sistema transaccional. Un cron cada 5 min es suficiente |
| `GOOGLE_PRIVATE_KEY` en variable de entorno | Fuera del alcance de P0. Anotar para una revisión de gestión de secretos |

---

## 8. P0-05 — Roles y RLS

### Problema

El aislamiento por tenant funciona. La autorización por rol **no existe en la base**: cualquier miembro de una clínica tiene, a nivel de datos, los mismos permisos que su dueño.

### Evidencia

**HECHO** — las policies de las 20 tablas listadas en §3 filtran solo por `tenant_id`. Ejemplo canónico (`supabase_migration_perf_2_rls.sql`):
```sql
CREATE POLICY tenant_isolation_pacientes ON pacientes FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid())));
```
Sin `AND role IN (...)`.

**HECHO** — consecuencia directa: el usuario etiquetado *"Staff (Secretaria)"* en `src/app/equipo/page.tsx:182` puede leer **y modificar** `alergias`, `antecedentes`, `historial_dental` y `paciente_fotos` de todos los pacientes, y editar `ingresos_manuales`, `egresos_manuales` y `costos_fijos` — directamente desde el cliente Supabase del navegador, sin pasar por ninguna pantalla. **Ocultar el botón no es una barrera.**

**HECHO** — chequeos de rol en la API, inconsistentes:

| Ruta | Exige | Archivo:línea |
|---|---|---|
| `facturacion/emitir` | **solo membresía** | `route.ts:72-80` |
| `facturacion/anular` | admin/owner | `route.ts:41-43` |
| `facturacion/config` POST | admin/owner | `route.ts:95-97` |
| `facturacion/config` GET | solo membresía | `route.ts:28-30` |
| `pacientes/exportar` | admin/owner | `route.ts:19-21` |
| `pacientes/importar` | **solo membresía** | `route.ts:45-46` |
| `consentimientos` POST | solo membresía | `route.ts:62-63` |
| `billing/cancelar` | owner/admin | `route.ts:40-43` |
| `equipo/invitar` | owner/admin | `route.ts:49-50` |
| `equipo/miembros` DELETE | owner/admin | `route.ts:100-101` |

**Emitir un comprobante fiscal exige menos permisos que anularlo o que exportar un listado.**

**HECHO** — `remote_schema.sql:865`: `"role" "text" DEFAULT 'admin'::"text" NOT NULL`, sin CHECK. Cualquier string es un rol válido, y el default es el privilegiado.

**HECHO** — no existe rol "Odontólogo" (`grep` → 0 resultados).

### Solución

#### Matriz de permisos

Reglas de lectura: **Inferido** = deducido de un chequeo existente en el código. **DECISIÓN** = no hay evidencia; requiere decisión de producto. La columna "Odontólogo" corresponde a un rol **que no existe hoy**; se incluye porque lo pediste y porque la matriz es el lugar donde esa decisión se toma.

Nomenclatura: `L` leer · `E` escribir · `—` sin acceso.

| Recurso | Owner | Admin | Odontólogo *(no existe)* | Staff | Base |
|---|---|---|---|---|---|
| **Pacientes** (datos de contacto) | L+E | L+E | L+E | L+E | Inferido — `importar` solo pide membresía |
| **Pacientes** (exportación masiva) | L | L | **DECISIÓN** | **—** | Inferido — `exportar:19-21` |
| **Historias clínicas** (`historial_dental`, alergias, antecedentes) | L+E | L+E | L+E | **DECISIÓN** | **Sin evidencia.** Hoy todos escriben |
| **Fotos clínicas** | L+E | L+E | L+E | **DECISIÓN** | Ídem |
| **Turnos / agenda** | L+E | L+E | L+E | L+E | Inferido — operación diaria del staff |
| **Finanzas** (ingresos, egresos, costos, metas) | L+E | L+E | **DECISIÓN** | **DECISIÓN** | **Sin evidencia.** Hoy todos escriben |
| **Cobros** (`pagos` de una cita) | L+E | L+E | L+E | L+E | Inferido — la recepción cobra |
| **Facturas — emitir** | E | E | **DECISIÓN** | **DECISIÓN** | **Contradicción**: hoy cualquiera |
| **Facturas — anular** | E | E | — | — | Inferido — `anular:41-43` |
| **Facturas — ver/PDF** | L | L | L | L | Inferido — solo membresía |
| **Config. fiscal ARCA** | L+E | L+E | L | L | **HECHO** — ya en RLS (`arca.sql:82-91`) |
| **Configuración** (branding) | L+E | L+E | L | L | **HECHO** — `fix_branding.sql:12-22` |
| **Suscripción / billing** | E | E | — | — | Inferido — `billing/cancelar:40-43` |
| **Usuarios / equipo** | L+E | L+E | L | L | Inferido — `equipo/*` |
| **Campañas CRM** | L+E | L+E | L | L | **HECHO** — ya en RLS |
| **Consentimientos — plantillas** | L+E | L+E | L | L | **HECHO** — ya en RLS |
| **Consentimientos — solicitar firma** | E | E | E | E | Inferido — solo membresía |

**Las cuatro celdas que bloquean la implementación** (§13):

1. **¿`staff` accede a la historia clínica?** Es la decisión de fondo. Una recepcionista necesita ver alergias para triage telefónico, pero "Staff (Secretaria)" con escritura sobre antecedentes médicos es difícil de sostener frente a un cliente que pregunte por control de acceso. *Mi recomendación: lectura sí, escritura no.*
2. **¿`staff` ve finanzas?** Cobrar un turno (`pagos`) es distinto de ver la rentabilidad de la clínica (`costos_fijos`, `meta_mensual`). *Recomendación: `pagos` sí, el resto no.*
3. **¿`staff` emite facturas?** En una clínica chica la recepción factura. *Recomendación: sí, pero alinear la ruta con la matriz de forma explícita y consciente, no por omisión.*
4. **¿Se crea el rol Odontólogo?** *Recomendación: no en P0.* Agregar un cuarto rol multiplica la matriz y la superficie de test justo cuando estamos estabilizando. La distinción valiosa (quién toca la historia clínica) se cubre decidiendo el punto 1.

#### Arquitectura de permisos

**Base — dos funciones auxiliares.** Reemplazan el subselect repetido en 20 policies:

- `auth_tenant_ids() RETURNS uuid[]` — `STABLE SECURITY DEFINER`, devuelve los tenants del usuario.
- `auth_has_role(p_tenant_id uuid, p_roles text[]) RETURNS boolean` — `STABLE SECURITY DEFINER`.

Ambas con `SET search_path = public, pg_temp` y `REVOKE FROM PUBLIC` + `GRANT TO authenticated`.

**Crítico para performance:** invocarlas siempre envueltas en `(select auth_has_role(...))`. Es la misma optimización de initplan que el proyecto ya aplicó en `supabase_migration_perf_2_rls.sql` (evaluar una vez por consulta, no una vez por fila). Perder eso degrada todas las consultas.

**Policies — separar por operación.** Donde lectura y escritura difieren, dejar de usar `FOR ALL`:
```
tenant_isolation_<tabla>            → FOR SELECT   (todos los miembros)
tenant_write_<tabla>                → FOR INSERT/UPDATE/DELETE (roles habilitados)
```

**Backend — un helper único.** `src/lib/autorizacion.ts`:
```
requireMembership(req, tenantId, rolesPermitidos?) → { user, role } | NextResponse(401|403)
```
Reemplaza las 21 copias. Códigos y mensajes homogéneos. Elimina de raíz la clase de bug de la tabla de evidencia.

**Rutas con service_role — clasificación.** Es lo que pediste analizar. Las 22 se dividen en tres grupos:

**Grupo 1 — bypass legítimo, no tocar (10).** Operan sin sesión de usuario por diseño:
`webhooks/mercadopago`, `webhooks/resend`, `cron`, `daily-briefing`, `crm-campanas`, `sync-sheet`, `paciente/[token]`, `paciente/[token]/estado`, `paciente/[token]/feedback`, `consentimientos/firmar/[token]`, `reserva/[clinica]`, `reserva/crear`, `horas-ocupadas`.
Verificación aplicable: que **todos** validen secreto (cron/webhooks) o token + rate limit (públicos). Hoy lo hacen.

**Grupo 2 — bypass necesario por acceso a `auth.users` (4).** `equipo/invitar`, `equipo/miembros`, `registro`, `clinicas`. Los emails viven en `auth.users`, inaccesible con anon key. **Requisito:** verificar sesión y rol **antes** de usar el cliente admin. `equipo/miembros:26-40` ya lo hace bien y es el modelo a replicar.

**Grupo 3 — bypass por conveniencia, candidatos a conversión (5).** `enlaces-turno`, `confirmar-turno`, `recordatorios`, `send-recordatorios` (rama de usuario), `billing/cancelar`, `admin/tenants`.
Aquí el cliente de cookies con RLS bastaría, y RLS actuaría como segunda barrera. Hoy la única barrera es el `if` de la ruta. `enlaces-turno:49-63` es el caso ejemplar: hace bien el filtro `.in('tenant_id', tenants)`, pero **si alguien lo borra, no hay nada debajo**.

*Nota: `admin/tenants` es legítimo (admin de plataforma), pero merece log de auditoría.*

**Regla general propuesta:** service_role solo cuando (a) no hay sesión, o (b) se necesita `auth.users`, o (c) hay que escribir en una tabla deliberadamente sin policy de escritura (`facturas`). Fuera de eso, cliente de cookies.

### Cambios de DB

1. `CHECK (role IN ('owner','admin','staff'))` en `tenant_users`. Precondición: `SELECT DISTINCT role FROM tenant_users` no devuelve nada fuera de esa lista.
2. Cambiar el DEFAULT de `role` de `'admin'` a `'staff'` (mínimo privilegio).
3. Crear `auth_tenant_ids()` y `auth_has_role()`.
4. Reescribir las policies según la matriz, **por tandas** (ver §10).
5. `factura_eventos` / log de auditoría de operaciones sensibles (compartido con P0-06).

### Cambios backend

- **Nuevo** `src/lib/autorizacion.ts`.
- 21 rutas migradas al helper.
- **Fix inmediato (P0-05a):** `facturacion/emitir:78` alineado con la decisión sobre la celda 3.

### Cambios frontend

Ninguno obligatorio. La UI ya oculta opciones por rol; con la base cerrada, esa ocultación pasa de ser "la seguridad" a ser lo que debe ser: una comodidad. Deseable: cuando el backend devuelva 403, mostrar un mensaje claro en vez de un error genérico.

### Tests

Hoy **no existe ni un solo test de roles**. Es el módulo con mayor déficit relativo.

Por cada celda de la matriz, dos tests (permitido / denegado) sobre PGlite, con `SET ROLE authenticated` y el claim `sub` del usuario correspondiente. Prioridad:

1. `staff` NO puede `UPDATE historial_dental` *(sujeto a la decisión 1)*.
2. `staff` NO puede `SELECT costos_fijos` ni `meta_mensual` *(decisión 2)*.
3. `staff` NO puede `UPDATE arca_config` — **hoy ya debería pasar**; sirve de control de que el test funciona.
4. `admin` sí puede todo lo de su tenant.
5. `owner` no puede ser eliminado del equipo (`equipo/miembros:124-129` ya lo contempla).
6. Un rol inválido no se puede insertar en `tenant_users`.
7. **Test de patrón:** fallar si algún `route.ts` consulta `tenant_users` sin usar el helper.
8. **Test de patrón:** fallar si aparece un `createClient(url, SERVICE_ROLE_KEY)` en una ruta fuera de la lista blanca de los grupos 1 y 2.

### Riesgos

| Riesgo | Mitigación |
|---|---|
| **Cerrar permisos rompe la operación de la clínica en producción** | Es el riesgo dominante. Ver §10: fase de observación con logging antes de denegar |
| La decisión de producto se demora y bloquea todo | Por eso se separa P0-05a (inmediato) de P0-05b (con decisión) |
| Las funciones auxiliares degradan la performance de RLS | Envolver en `(select ...)`. Medir con `EXPLAIN ANALYZE` sobre `citas` antes y después |
| Un `role` fuera de la lista rompe el CHECK al aplicarlo | Ejecutar `SELECT DISTINCT role FROM tenant_users` primero |
| Cambiar el DEFAULT a `'staff'` altera altas existentes | Todas las rutas de alta pasan `role` explícito (`invitar:96,118`, `clinicas:109` → `'owner'`) |

---

## 9. P0-06 — ARCA / Facturación

### Problema

Entre obtener el CAE de ARCA y persistirlo hay una ventana donde el comprobante puede quedar **autorizado ante el fisco y ausente del sistema**. Y la numeración se calcula sin control de concurrencia.

### Evidencia

**HECHO** — `src/app/api/facturacion/emitir/route.ts`:
```ts
309:  const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, cbteTipo)
310:  nroComprobante = Number(lastVoucher) + 1        // ← sin lock
...
366:  const arcaRes = await afip.ElectronicBilling.createVoucher(invoiceData)   // ← irreversible
      cae = arcaRes.CAE
...
384:  const { data: factura, error: insertError } = await supabase
385:    .rpc('emitir_factura_con_detalle', {...})
406:  if (insertError) {
408:    if ((insertError as any).code === '23505') {
409:      return NextResponse.json({ error: 'Otra factura se emitió al mismo tiempo...' }, { status: 409 })
410:    }
413:    : `Factura autorizada por ARCA (CAE: ${cae}) pero falló el registro local`
414:    return NextResponse.json({ error: `${prefijo}: ${insertError.message}` }, { status: 500 })
```

**El CAE se devuelve dentro del texto de un mensaje de error HTTP y no se persiste en ninguna parte.**

**HECHO** — el chequeo de "ya facturado" (`:96-110`) es un `SELECT` seguido de la emisión: lectura y escritura no atómicas.

**HECHO** — `facturas` no tiene policy de UPDATE (`arca.sql:97-101`: solo SELECT e INSERT). Toda transición de estado debe pasar por `SECURITY DEFINER`.

**HECHO** — no hay timeout explícito en las llamadas a ARCA.

**HECHO** — lo que sí está bien y hay que preservar: el monto **siempre** se recalcula desde la base (`:117-119`), nunca se toma del body; `emitir_factura_con_detalle` revalida el tenant dentro de la función DEFINER; la aritmética en centavos garantiza `ImpTotal == ImpNeto + ImpIVA`.

### Solución

#### Por qué una transacción de Postgres no resuelve esto

Pediste explícitamente no proponerlo, y conviene dejar escrito el motivo para que nadie lo reintroduzca en el code review:

Una transacción da atomicidad sobre **recursos que participan del protocolo**. ARCA no participa. Envolver la llamada en `BEGIN/COMMIT` produce:

- Si ARCA autoriza y luego hace `ROLLBACK`: **la base queda limpia y ARCA tiene el comprobante emitido.** El rollback no des-emite nada. Es exactamente el bug que queremos evitar, con más pasos.
- Si el proceso muere **entre** `COMMIT` y la respuesta HTTP: la base está bien pero el usuario ve un error y reintenta.
- Y mantener una transacción abierta durante 5-10 s de I/O externo retiene una conexión del pooler por cada emisión en curso.

El problema no es de atomicidad: es de **consistencia entre dos sistemas que no comparten protocolo**. La única solución es la que usa cualquier integración con pasarelas de pago: **registrar la intención antes de actuar, y reconciliar después**.

#### El patrón: Reservar → Emitir → Confirmar → Reconciliar

```
1. RESERVAR   INSERT factura (estado='reservado', nro reservado, idempotency_key)
              ← el UNIQUE index actúa como lock distribuido. Sin transacción larga.
2. MARCAR     UPDATE estado='enviado_arca', enviado_en=now()
              ← COMMIT antes de la llamada. Si el proceso muere ahora, queda rastro.
3. EMITIR     afip.createVoucher(...)   con timeout explícito
4. CONFIRMAR  UPDATE estado='emitida', cae=..., cae_expira=...   (SECURITY DEFINER)
5. RECONCILIAR  cron: toda fila en 'enviado_arca' con más de N minutos
                → FECompConsultar(pv, tipo, nro) en ARCA
                → existe  → completar como 'emitida'
                → no existe → 'no_emitida', liberar el número
```

**La clave está en el paso 2.** Es la diferencia entre un sistema que puede perder comprobantes y uno que no: al escribir *antes* de llamar, cualquier muerte posterior deja una fila en `enviado_arca` que el reconciliador va a encontrar. No hay estado en el que "no sepamos que llamamos".

#### Numeración: el índice único como lock

En vez de un lock explícito, se usa la restricción que ya existe. Al reservar:

```
intento: INSERT (tenant, pv, tipo, nro = ultimo+1, estado='reservado')
  → éxito  : el número es nuestro
  → 23505  : otro lo tomó → releer último y reintentar (máx. 5, con jitter)
```

Requiere **ampliar el índice único** para cubrir los estados intermedios. Hoy es `WHERE estado = 'emitida' AND simulada = false` (`arca.sql:63-66`): no protege reservas. Pasa a `WHERE estado IN ('reservado','enviado_arca','emitida') AND simulada = false`.

Ventaja sobre `pg_advisory_xact_lock`: no mantiene transacción ni conexión durante la llamada externa. En serverless con pooler, eso importa.

ARCA sigue siendo la autoridad de la numeración: `getLastVoucher` se consulta al reservar, y el reconciliador corrige cualquier deriva.

#### Los siete casos

| Caso | Qué pasa hoy | Con el diseño |
|---|---|---|
| **A — ARCA falla** | 502, nada persistido. *Correcto por casualidad* | La reserva pasa a `rechazada` con el error. El número se libera. Auditable |
| **B — CAE OK, Supabase falla** | **Comprobante perdido.** CAE en un string de error | Fila en `enviado_arca`. El reconciliador consulta ARCA, encuentra el CAE, completa. **Recuperación automática** |
| **C — respuesta perdida** | Idéntico a B, sin saber si ARCA emitió | Ídem B. `FECompConsultar` es la fuente de verdad |
| **D — dos usuarios simultáneos** | Ambos leen el mismo `lastVoucher`, ambos llaman a ARCA. Uno se pierde | El segundo choca con `23505` **antes** de llamar a ARCA. Reintenta con nro+1. **Ninguno se pierde** |
| **E — reintento** | Genera un segundo comprobante | La `idempotency_key` encuentra la fila previa y devuelve su resultado |
| **F — doble click** | Dos requests, ambos pasan el `SELECT` de "ya facturado" | `UNIQUE (tenant_id, cita_id) WHERE estado <> 'anulada'` lo bloquea **en la base**. Es el único lugar donde se resuelve con certeza |
| **G — timeout tras autorizar** | Función muere, comprobante perdido | Fila en `enviado_arca` desde el paso 2 → reconciliador |

#### Estados

```
reservado ──> enviado_arca ──> emitida ──> anulada
    │              │
    │              ├──> rechazada    (ARCA respondió error)
    │              └──> no_emitida   (reconciliador: ARCA no lo tiene)
    └──> abandonada                  (reserva sin avance > 1 h)
```

Las transiciones van todas por `SECURITY DEFINER`, porque `facturas` no admite UPDATE desde el cliente. Esa restricción, que parecía un obstáculo, es una ventaja: **todas las transiciones pasan por un punto auditable**.

#### Auditoría

`factura_eventos (factura_id, evento, payload jsonb, creado_en, user_id)`, append-only, sin policy de UPDATE ni DELETE. Registra reserva, envío, respuesta cruda de ARCA, confirmación, reconciliación. Ante una discrepancia con el contador, es la única forma de reconstruir qué pasó.

### Cambios de DB

1. `facturas`: nuevas columnas `estado` ampliado, `idempotency_key text`, `enviado_en`, `reconciliado_en`, `intentos`, `error_detalle`.
2. Reemplazar `facturas_numeracion_unica` por la versión que cubre estados intermedios.
3. `UNIQUE (tenant_id, cita_id) WHERE cita_id IS NOT NULL AND estado <> 'anulada'` — y equivalente para `ingreso_manual_id`. **Mata el doble click.**
4. `UNIQUE (tenant_id, idempotency_key)`.
5. **Nueva** `factura_eventos`.
6. Funciones `SECURITY DEFINER`: `reservar_numero_factura()`, `marcar_factura_enviada()`, `confirmar_factura_emitida()`, `marcar_factura_fallida()`. Todas revalidan tenant como ya hace `emitir_factura_con_detalle`.
7. Refactor de `emitir_factura_con_detalle` para el paso 4 (mantiene la atomicidad de factura+items+pagos, que está bien resuelta).

### Cambios backend

- `api/facturacion/emitir/route.ts` reestructurado en los 5 pasos. Es el archivo de mayor riesgo del plan: 426 líneas con la lógica fiscal.
- **Timeout explícito** en la llamada a ARCA, menor que el límite de la función serverless. Si lo controlamos nosotros, la transición a `enviado_arca` la hacemos nosotros; si nos mata la plataforma, no corre ningún código.
- **Nueva** `api/cron/reconciliar-facturas` — worker, autenticado por header.
- **Nuevo** `src/lib/arca.ts` — aísla el SDK, y de paso permite testear sin red.

### Cambios frontend

- Botón de emisión con estado de envío y deshabilitado tras el primer click (defensa en profundidad; la real es el constraint 3).
- La UI debe enviar la `idempotency_key` y reusarla en los reintentos.
- Pantalla o aviso para facturas en `enviado_arca`/`no_emitida`: hoy no hay dónde ver que algo quedó a medias.

### Tests

Con un mock del SDK de ARCA (por eso conviene aislarlo en `src/lib/arca.ts`):

1. **Caso A** — ARCA lanza → estado `rechazada`, número liberado.
2. **Caso B** — CAE OK, el RPC de confirmación falla → queda `enviado_arca`; el reconciliador la completa.
3. **Caso C** — la llamada nunca resuelve → `enviado_arca`; ARCA sí lo tiene → `emitida` con el CAE correcto.
4. **Caso D** — dos emisiones concurrentes para la misma serie → dos números correlativos, cero pérdidas, cero duplicados en ARCA.
5. **Caso E** — reintento con la misma `idempotency_key` → devuelve la factura original, no llama a ARCA.
6. **Caso F** — dos POST simultáneos con el mismo `citaId` → uno emite, el otro recibe 409. **Hoy este test falla.**
7. **Caso G** — timeout → `enviado_arca` → reconciliación.
8. Reconciliador: ARCA no tiene el comprobante → `no_emitida`, número liberado, se puede reemitir.
9. Invariante: no existe ninguna fila `emitida` sin CAE, ni ningún CAE duplicado dentro de una serie.
10. Regresión: el monto se sigue recalculando desde la base y se ignora cualquier `monto` del body.

### Riesgos

| Riesgo | Mitigación |
|---|---|
| **Es el cambio de mayor riesgo del plan**: toca facturación fiscal en producción | Desarrollar con `ARCA_PRODUCTION=false` (homologación). No desplegar sin la suite de los 7 casos en verde |
| La migración de estados rompe facturas existentes | Backfill: todas las actuales pasan a `emitida`. El nuevo índice debe validar antes de aplicarse |
| El reconciliador completa mal una factura | `FECompConsultar` debe coincidir en pv, tipo, nro **y monto**. Ante discrepancia: no tocar, alertar |
| Se agota el rate limit de ARCA por reintentos | Backoff exponencial; máximo de intentos; el reconciliador corre cada 15 min, no cada minuto |
| El nuevo unique de `(tenant_id, cita_id)` falla por duplicados existentes | Consulta de detección previa: citas con más de una factura no anulada |

---

## 10. Orden de implementación

El orden no es por severidad: es por **dependencias, riesgo y reversibilidad**. Primero lo que reduce exposición sin poder romper nada; al final lo que necesita decisiones y toca dinero.

### Fase 0 — Contención (día 1, ~4 h)

Todo aquí es de bajo riesgo, reversible y no depende de nada.

| # | Acción | Ref |
|---|---|---|
| 1 | `sendDefaultPii: false`, `tracesSampleRate: 0.1`, `enableLogs: false` en los 3 configs | P0-03 |
| 2 | `REVOKE ALL ON bi_* FROM anon, authenticated` | P0-07 |
| 3 | `DROP TRIGGER sync_turnos_to_sheets ON citas` | P0-04 |
| 4 | `CRON_SECRET` al header en `api/cron/route.ts:31` | P0-03 |
| 5 | Alinear el rol de `facturacion/emitir` (P0-05a) | P0-05 |
| 6 | Validar fecha y estado en `paciente/[token]/estado` | P0-08 |

**Por qué primero.** El punto 1 son tres líneas y detiene una fuga activa. El 2 son grants y cierra una exposición no autenticada. El 3 elimina un trigger que hoy solo produce 401 y 5 s de timeout. Ninguno requiere migración de datos ni decisión de producto. **Si el plan se interrumpiera acá, el sistema ya estaría materialmente mejor.**

### Fase 1 — Diagnóstico (día 1-2, solo lectura)

Ejecutar D1-D5 (P0-01) y las detecciones de P0-06, y **archivar los resultados**. Son SELECT: no cambian nada.

**Por qué antes de tocar el esquema.** D1 decide si la FK compuesta se aplica sola o si hay datos cruzados que resolver a mano. D3 decide si el constraint de email es viable. D4 decide el destino del trigger. Aplicar constraints sin estas respuestas es cómo se rompe una base en producción.

Acá también arranca el **contador de 14 días** del logging de `sync_turno_to_cita`.

### Fase 2 — Fundaciones invisibles (días 2-5)

| # | Acción | Ref |
|---|---|---|
| 1 | Corregir `sync_turno_to_cita` (tenant + `pg_temp`) | P0-01 |
| 2 | `DROP DEFAULT` en `tenant_id` de `pacientes`, `citas`, `turnos` | P0-01 |
| 3 | FK compuestas tenant-scoped | P0-01 |
| 4 | `CHECK` en `tenant_users.role` + default a `'staff'` | P0-05 |
| 5 | `src/lib/sentry-scrub.ts` con sus tests | P0-03 |
| 6 | `src/lib/autorizacion.ts` + migración de las 21 rutas | P0-05 |
| 7 | Eliminar los fallbacks a `DEFAULT_TENANT_ID` | P0-01 / C7 |

**Por qué acá.** Ninguno cambia el comportamiento visible: son invariantes estructurales y refactors sin cambio funcional. El punto 6 es **prerequisito de la Fase 4**: sin helper único, cerrar permisos significa editar 21 archivos a mano.

### Fase 3 — Tokens (días 5-8)

`token-paciente.ts` → columna hash → backfill → cambio de lookup con fallback → 7 call sites → renovación en recordatorios → expiración de `token_firma`. **Retirar la columna en claro va en un deploy posterior** (P6).

**Por qué después de Sentry.** Rotar tokens antes de sanear Sentry manda los tokens nuevos al mismo lugar. Y porque, si algún token ya se filtró, la rotación es el remedio — conviene tenerla lista después de haber cerrado la canilla.

### Fase 4 — Roles (días 8-15) · requiere decisión de producto

1. **Decidir** las 4 celdas de §8.
2. **Fase de observación:** desplegar las policies nuevas en modo permisivo con logging de qué habrían denegado. Correr 5-7 días sobre la clínica real.
3. Analizar el log: si `staff` viene escribiendo en `historial_dental` todos los días, la decisión 1 se revisa **antes** de cortar, no después.
4. Recién entonces, denegar de verdad. Por tandas: primero finanzas (menos usado), después historia clínica.

**Por qué es la fase más lenta.** Es la única donde el fix correcto puede romper la operación diaria de un cliente que está pagando. La observación previa es lo que separa un cambio de seguridad de un incidente de disponibilidad.

### Fase 5 — ARCA (días 10-20, en paralelo a la 4)

Estados y constraints → funciones DEFINER → refactor de `emitir` → reconciliador → suite de 7 casos → homologación → producción.

**Por qué en paralelo y último.** No comparte archivos con la Fase 4 (una toca policies, la otra facturación), así que puede avanzar en paralelo. Va al final porque es el de mayor riesgo y conviene abordarlo con el resto estabilizado. Y porque **el escenario que arregla es raro pero caro**: perder un comprobante requiere que falle la red en una ventana de segundos.

### Fase 6 — Google Sheets (días 15-20)

Solo si la feature se quiere viva. Si se descarta, la Fase 0 ya la neutralizó y esta fase no existe.

### Diagrama de dependencias

```
Fase 0 ──> Fase 1 ──> Fase 2 ──┬──> Fase 3
(contención) (diagnóstico)     │
                               ├──> Fase 4  [DECISIÓN DE PRODUCTO]
                               │
                               └──> Fase 5  (paralelo a 4)
                                     └──> Fase 6 (opcional)
```

---

## 11. Tests de regresión

Qué tiene que seguir pasando después de cada fase. La suite actual (18 archivos) es el punto de partida y **no debe romperse en ningún momento**.

### Después de la Fase 0

- Suite completa en verde (`npm test`).
- Manual: `/paciente/<token>` carga; `/t/<codigo>` confirma un turno; el cron dispara recordatorios con el header nuevo.
- Manual: crear una cita en la agenda **y verificar que ya no tarda 5 s** (efecto de eliminar el trigger).
- `GET /rest/v1/bi_ingresos_por_mes` con la anon key → **401/403**. Es el test de que el `REVOKE` funcionó.

### Después de la Fase 2

- `tenant-isolation.test.ts` extendido, en verde.
- D1 y D5 siguen devolviendo 0 filas.
- Alta de paciente desde las 4 pantallas → `tenant_id` correcto.
- Reserva online end-to-end.
- Las 21 rutas migradas al helper responden 401/403/200 igual que antes. **Es un refactor: cualquier cambio de comportamiento es un bug.**
- `EXPLAIN ANALYZE` sobre `citas` filtrando por tenant: sin degradación frente a la medición previa.

### Después de la Fase 3

- Un token generado antes de la fase **sigue funcionando** (backfill a +30 días).
- Un token con expiración pasada → 410.
- Enviar un recordatorio extiende la expiración.
- El listado de `/pacientes` ya no expone tokens utilizables.
- Firma remota completa: solicitar → abrir → firmar → PDF.

### Después de la Fase 4

- Un `owner` puede hacer todo lo que hacía.
- Un `admin` puede hacer todo lo que hacía.
- Un `staff` puede completar **su jornada real**: agendar, cobrar, marcar asistencia, mandar recordatorios. Este es el test que hay que hacer con la clínica antes de cerrar, no después.
- El log de la fase de observación no muestra denegaciones sobre operaciones cotidianas.

### Después de la Fase 5

- Los 7 casos (A-G) en verde.
- Emisión real en homologación con CAE válido.
- El PDF sigue saliendo idéntico (`api/facturacion/pdf/[id]`).
- Anulación con nota de crédito sigue funcionando.
- `pagos.test.ts` y `multitratamiento.test.ts` **intactos** — si el refactor de `emitir` los toca, se rompió algo.
- Invariante: cero facturas `emitida` sin CAE; cero CAE duplicados por serie.

### Suite de regresión permanente

Los "tests de patrón" propuestos en cada sección (P0-01 §7, P0-02 §8, P0-03 §8, P0-05 §7-8) siguen el modelo de `guardas-multitenant.test.ts`: leen el código fuente y fallan ante patrones prohibidos. Son baratos y son lo que impide que estos problemas vuelvan en seis meses.

---

## 12. Criterios de aceptación

Condiciones objetivas y verificables. Nada de "quedó mejor".

### P0-01 — Multi-tenancy · ESTÁ RESUELTO cuando

1. `SELECT column_default FROM information_schema.columns WHERE table_name IN ('pacientes','citas','turnos') AND column_name='tenant_id'` → **NULL** en las tres.
2. D1 devuelve **0 filas**, y existe una FK compuesta que lo hace estructuralmente imposible.
3. Un `INSERT INTO citas` sin `tenant_id` falla con `23502`, demostrado por un test automatizado.
4. Un `INSERT INTO citas` con `paciente_id` de otro tenant falla por FK, demostrado por test.
5. `sync_turno_to_cita` filtra por `NEW.tenant_id` y lo propaga a ambos INSERT — o la función ya no existe.
6. No queda ninguna referencia a `NEXT_PUBLIC_DEFAULT_TENANT_ID` ni al UUID `2845c423-...` como fallback en `src/`.
7. Los 8 casos de la tabla de §4 tienen su test y están en verde.

### P0-02 — Tokens · ESTÁ RESUELTO cuando

1. `SELECT count(*) FROM pacientes WHERE token_expira IS NULL` → **0**.
2. Un token con expiración pasada devuelve **410**, con test.
3. `pacientes.token` en claro ya no existe (o no se usa en ningún lookup) y el acceso es por `token_hash`.
4. `grep -rn "crypto.randomUUID()" src/` no devuelve ninguna asignación a un campo `token` fuera de `src/lib/token-paciente.ts`.
5. Enviar un recordatorio extiende la expiración, con test.
6. `token_firma` tiene expiración y, una vez firmado, el GET no devuelve `contenido`.
7. El fallback de `api/paciente/[token]/route.ts:41-61` —que salteaba la validación de expiración— ya no existe.

### P0-03 — Sentry · ESTÁ RESUELTO cuando

1. Los tres configs tienen `sendDefaultPii: false`, con un test de patrón que lo verifica.
2. El scrubber tiene tests unitarios para path, query, headers, body y breadcrumbs.
3. **Verificación manual documentada:** un error provocado en `/paciente/<token>` en preview genera un evento en Sentry **sin el token, sin cookies y sin IP**. Con captura de pantalla en el PR.
4. `grep -rn "token=" src/app/api/` no devuelve secretos en query strings salientes.
5. El Data Scrubbing del lado servidor de Sentry está activo.
6. Los eventos históricos con tokens fueron purgados, y los tokens que aparecían en ellos, rotados.

### P0-04 — Google Sheets · ESTÁ RESUELTO cuando

**Si se descarta la feature:** el trigger no existe, `api/sync-sheet` no existe, y las env vars de Google fueron eliminadas. Fin.

**Si se mantiene:**
1. `GOOGLE_SHEET_ID` global ya no existe.
2. El worker deriva el tenant **de la fila leída de la base**, nunca del payload; con test que envía un `tenant_id` forjado y verifica que se ignora.
3. `UNIQUE (google_sheet_id)` aplicado.
4. `tenant_integraciones` no tiene ninguna policy para `authenticated`.
5. Un INSERT en `citas` **no** genera ninguna llamada HTTP sincrónica.
6. Solo `admin`/`owner` configuran la integración, con test.

### P0-05 — Roles · ESTÁ RESUELTO cuando

1. Las 4 celdas en DECISIÓN están resueltas y documentadas en `DECISIONES-PRODUCTO.md`.
2. Cada celda de la matriz tiene dos tests (permitido / denegado) en verde.
3. `CHECK` en `tenant_users.role` aplicado; el default es `'staff'`.
4. Las 21 rutas usan `requireMembership()`; test de patrón que lo verifica.
5. `staff` no puede escribir en las tablas que la matriz le veda, **verificado por SQL directo con `SET ROLE authenticated`**, no por la UI.
6. Toda ruta con service_role está en la lista blanca de los grupos 1 o 2, con test de patrón.
7. La fase de observación corrió ≥5 días y su log no muestra denegaciones sobre operaciones cotidianas.

### P0-06 — ARCA · ESTÁ RESUELTO cuando

1. Los casos A-G tienen test y están en verde.
2. `SELECT count(*) FROM facturas WHERE estado='emitida' AND (cae IS NULL OR cae='')` → **0**.
3. No existen dos filas `emitida` con el mismo `(tenant_id, punto_venta, tipo_comprobante, nro_comprobante)` y `simulada=false`.
4. Dos POST simultáneos con el mismo `citaId` → uno emite, el otro 409, **por constraint de base**.
5. El reconciliador corre programado y hay evidencia de que resolvió al menos un caso inducido en homologación.
6. `factura_eventos` registra el ciclo completo de cada emisión.
7. La llamada a ARCA tiene timeout explícito menor al de la función serverless.
8. Emisión real en homologación con CAE válido y PDF correcto.

### P0-07 — Vistas BI · ESTÁ RESUELTO cuando

1. `GET /rest/v1/bi_ingresos_por_mes` con la anon key → 401/403.
2. Las vistas fueron eliminadas, **o** tienen `security_invoker = on` **y** columna `tenant_id` **y** grants solo a `authenticated`.
3. Test de patrón: fallar si una migración crea una vista sobre una tabla con RLS sin `security_invoker`.

### P0-08 — Estado de citas · ESTÁ RESUELTO cuando

1. Un PATCH sobre una cita con `fecha_hora` pasada → rechazo, con test.
2. Un PATCH sobre una cita en estado `asistio` → rechazo, con test.
3. Un PATCH con `citaId` de otro paciente → 404, con test.

---

## 13. Riesgos y decisiones pendientes

### HECHO — verificado leyendo el código

- Las tres columnas `tenant_id` tienen `DEFAULT '2845c423-...'` y son `NOT NULL`.
- `sync_turno_to_cita` no filtra por tenant y omite `tenant_id` en ambos INSERT. Trigger activo, nunca eliminado.
- `turnos` tiene `tenant_id` disponible; la función no lo usa.
- Ningún archivo de `src/` escribe en `turnos`.
- `token_expira` nunca se escribe. 7 puntos de generación sin expiración.
- El token del portal se guarda en claro y `pacientes/page.tsx:50` lo envía al navegador.
- Los tres configs de Sentry: `sendDefaultPii: true`, `tracesSampleRate: 1`, `enableLogs: true`.
- `api/cron/route.ts:31` pasa `CRON_SECRET` por query string.
- Las 6 vistas `bi_*` son `OWNER postgres`, sin `security_invoker`, sin `tenant_id`, con `GRANT TO anon`.
- El trigger de Sheets no envía `Authorization`; el endpoint lo exige. La sincronización no funciona.
- Roles existentes: `owner`, `admin`, `staff`. **No existe "Odontólogo".**
- `tenant_users.role`: sin CHECK, `DEFAULT 'admin'`.
- Ninguna policy de las 20 tablas del grupo principal filtra por rol.
- `facturas` no tiene policy de UPDATE.
- `emitir/route.ts:414` devuelve el CAE dentro de un mensaje de error, sin persistirlo.
- PostgreSQL 17.6.
- Todo INSERT de `src/` pasa `tenant_id` explícito.

### INFERENCIA — deducción fundada, no ejecutada contra producción

- Las vistas `bi_*` son consultables sin autenticar con la anon key. Se deduce del modelo de permisos de PostgreSQL (vista sin `security_invoker` corre como su dueño; `postgres` saltea RLS) y de que PostgREST expone toda relación con grant. **Confirmar con un `curl` antes de dimensionar el incidente.**
- Sentry contiene hoy tokens de pacientes. Se deduce de la config leída y de la documentación del SDK. **Confirmar en el panel.**
- `staff` puede modificar historia clínica desde el cliente. Se deduce de la ausencia de filtro por rol en la policy. **Confirmar con `SET ROLE authenticated`.**

### NO VERIFICADO — requiere acceso a producción

| # | Pregunta | Cómo responderla | Qué bloquea |
|---|---|---|---|
| 1 | ¿`turnos` recibe escrituras? | Consulta D4 + 14 días de log | Eliminar el trigger (P0-01) |
| 2 | ¿Existen cruces de tenant hoy? | D1 y D5 | La FK compuesta (P0-01) |
| 3 | ¿Hay emails duplicados dentro de una clínica? | D3 | El constraint de email (P0-01) |
| 4 | ¿Hay roles fuera de `owner/admin/staff`? | `SELECT DISTINCT role FROM tenant_users` | El CHECK (P0-05) |
| 5 | ¿Hay citas con más de una factura activa? | Consulta de detección de P0-06 | El unique de idempotencia |
| 6 | ¿Cuántos eventos de Sentry contienen tokens? | Buscar en el panel | El alcance de la rotación (P0-02) |
| 7 | ¿Algún proceso fuera del repo inserta sin `tenant_id`? | Revisar Edge Functions, webhooks de Supabase, snippets guardados | `DROP DEFAULT` (P0-01) |
| 8 | ¿La UI distingue con claridad una factura simulada de una real? | Revisión visual de `/facturas` | Riesgo de producto independiente |
| 9 | ¿El WebView de WhatsApp conserva cookies `httpOnly` entre sesiones? | Prueba en iOS y Android | La opción B de P0-02 |

### DECISIÓN DE PRODUCTO — no las puede tomar un desarrollador

| # | Decisión | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| 1 | **¿`staff` accede a la historia clínica?** | (a) L+E como hoy · (b) solo lectura · (c) sin acceso | **(b)**. Una recepcionista necesita ver alergias para atender un llamado; no necesita editar antecedentes médicos | Fase 4 completa |
| 2 | **¿`staff` ve finanzas?** | (a) todo · (b) solo `pagos` · (c) nada | **(b)**. Cobrar un turno ≠ ver la rentabilidad de la clínica | Fase 4 |
| 3 | **¿`staff` emite facturas?** | (a) sí · (b) no | **(a)**, pero explícito. En una clínica chica la recepción factura. Lo que no puede ser es que suceda *por omisión* | P0-05a |
| 4 | **¿Se crea el rol Odontólogo?** | (a) sí ahora · (b) no en P0 · (c) nunca | **(b)**. Duplica la matriz y la superficie de test en el peor momento. La distinción valiosa se cubre con la decisión 1 | Alcance de la Fase 4 |
| 5 | **¿Se mantiene Google Sheets?** | (a) rehacer multi-tenant · (b) eliminar | **(b)** salvo que un cliente la pida. Está rota desde su despliegue y **nadie la reclamó** — es el mejor indicador de uso que hay | Existencia de la Fase 6 |
| 6 | **¿Duración del token del portal?** | 30 / 90 días / permanente con revocación | **30 con renovación en cada recordatorio.** El flujo de turno ya está cubierto por `/t/[codigo]` sin el token del paciente | Fase 3 |
| 7 | **¿Se acepta perder la visibilidad del token en la base?** | (a) hashear · (b) mantener en claro | **(a)**. Es lo que neutraliza la exposición vía `select('*')` y vía `staff` | Fase 3 |
| 8 | **¿Familias con un mismo email?** | (a) permitir (sin constraint) · (b) un email por paciente · (c) constraint parcial | Consultar con la clínica; D3 dice si el caso existe | El constraint de email (P0-01) |

### Riesgos transversales del plan

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Hay una clínica en producción usando esto a diario** | Alto | Toda fase debe poder revertirse sin deploy. La Fase 4 va con observación previa. Coordinar ventanas con la clínica |
| El plan se ejecuta a medias y queda inconsistente | Medio | Cada fase es autocontenida y deja el sistema en un estado válido. La Fase 0 sola ya mejora el sistema |
| Las decisiones de producto se demoran | Medio | Las fases 0, 1, 2, 3 y 5 **no dependen de ninguna decisión**. Solo la 4 y la 6 |
| El refactor de `emitir` introduce un bug fiscal | Alto | Homologación obligatoria. `pagos.test.ts` y `multitratamiento.test.ts` intactos como red |
| Se rompe algo que hoy funciona bien | Alto | La sección "COSAS QUE NO DEBEMOS TOCAR" de la auditoría sigue vigente: `lib/pagos.ts`, la firma de MercadoPago, el storage de fotos, `/t/[codigo]`, `rutas-publicas.ts`, el singleton de Supabase |
| Se subestima la Fase 4 | Medio | Es la más lenta y la menos técnica. El cuello de botella es la conversación con el cliente, no el SQL |

---

## Anexo — Resumen ejecutable

| Fase | Días | Depende de | Decisión de producto | Riesgo |
|---|---|---|---|---|
| 0 — Contención | 1 | — | No | **Bajo** |
| 1 — Diagnóstico | 1-2 | — | No | Nulo (solo lectura) |
| 2 — Fundaciones | 2-5 | Fase 1 | No | Medio |
| 3 — Tokens | 5-8 | Fase 2 | Sí (#6, #7) | Medio |
| 4 — Roles | 8-15 | Fase 2 | **Sí (#1-#4)** | **Alto** |
| 5 — ARCA | 10-20 | Fase 2 | No | **Alto** |
| 6 — Sheets | 15-20 | Fase 2 | **Sí (#5)** | Bajo |

**Camino crítico:** Fase 0 → 1 → 2, y desde ahí 3, 4 y 5 en paralelo.

**Si solo hubiera tiempo para una cosa: la Fase 0.** Son cuatro horas, no requiere migración ni decisión de nadie, y cierra una fuga de PII activa hacia un tercero más una exposición de datos comerciales sin autenticar.

---

*Documento de diseño. No se modificó ningún archivo del proyecto, no se ejecutaron migraciones, no se alteraron dependencias y no se hicieron commits. Todas las consultas SQL incluidas son de diagnóstico (`SELECT`) y no forman parte de la implementación.*
