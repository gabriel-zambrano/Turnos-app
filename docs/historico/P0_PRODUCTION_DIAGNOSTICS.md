# P0 Production Diagnostics

**Fecha:** 7 de agosto de 2026
**Commit analizado:** `a985422` (2026-08-06)
**Documentos previos:** `AUDITORIA-PROFUNDA-2026-08.md`, `P0_IMPLEMENTATION_PLAN.md`
**Nota:** este archivo reemplaza la versión anterior del mismo nombre, reestructurada según las 18 secciones solicitadas y con la clasificación obligatoria aplicada a cada hallazgo.

**Nada fue modificado.** Sin migraciones, sin INSERT/UPDATE/DELETE/ALTER/DROP/GRANT/REVOKE, sin cambios de entorno, sin deploys, sin correcciones.

---

## Alcance real de esta verificación

El sandbox **no tiene salida de red**. Reverificado al inicio de esta sesión:

```
$ curl -s -o /dev/null -w "%{http_code}" https://supabase.com  →  000
```

No puedo alcanzar la base de producción ni el panel de Sentry. Todo lo que sigue se apoya en **esquema, código y configuración del repositorio**, que para la mayoría de los P0 alcanza para clasificar con certeza.

Leí los nombres de las variables de `.env.local` para inventariar secretos; **no extraje ni utilicé ningún valor**.

### Clasificación empleada

| Etiqueta | Significado |
|---|---|
| **CONFIRMADO** | Evidencia directa en código, esquema o configuración |
| **INFERIDO** | La evidencia apunta con fuerza, falta la prueba de ejecución |
| **NO VERIFICADO** | Sin información suficiente desde este entorno |
| **DESCARTADO** | Señalado antes; la verificación muestra que no es un problema |

---

## 1. Executive Summary

**Se puede empezar a implementar.** De los ocho P0 en juego, **seis quedan CONFIRMADOS con evidencia directa** y no necesitan nada de la base para arrancar. Los dos restantes dependen de consultas SQL que no cambian el *qué* sino el *cómo*.

### Estado de los P0

| ID | Hallazgo | Clasificación | ¿Bloqueado? |
|---|---|---|---|
| P0-01a | Seis tablas con `tenant_id DEFAULT` hardcodeado | **CONFIRMADO** | No |
| P0-01b | `sync_turno_to_cita` sin filtro de tenant | **CONFIRMADO** (código) / **NO VERIFICADO** (uso) | Solo el `DROP` |
| P0-01c | Cruces de tenant ya materializados en datos | **NO VERIFICADO** | Sí — SQL |
| P0-02 | Tokens de portal sin expiración | **CONFIRMADO** | No |
| P0-03 | Sentry con PII y tokens | **CONFIRMADO** (config) / **NO VERIFICADO** (contenido) | No |
| P0-04 | Google Sheets global | **CONFIRMADO** — y la feature **no funciona** | No |
| P0-05 | Roles sin enforcement en la base | **CONFIRMADO** | Parcial — D4 |
| P0-06 | ARCA: facturas huérfanas y concurrencia | **CONFIRMADO** (código) / **NO VERIFICADO** (datos) | Sí — SQL |
| P0-07 | Vistas BI expuestas | **CONFIRMADO** en 6 vistas — **alcance corregido** | No |
| P0-08 | Cambio de estado de citas pasadas | **CONFIRMADO** | No |

### Los cinco resultados que más cambian el panorama

**1. Dos de las tres vistas que mencionaste no existen.** `bi_rentabilidad` y `bi_resumen_financiero` no aparecen en ningún archivo del repositorio. **DESCARTADAS.** Las expuestas son otras seis, y `bi_ingresos_por_mes` sí está entre ellas. El problema es real; el inventario era distinto.

**2. Los defaults son seis tablas, no tres.** Y cuatro tablas admiten `tenant_id` NULL — algo que mi propio plan daba por imposible. En tablas financieras, una fila con NULL queda **invisible bajo RLS**: la plata está en la base y no está en el reporte.

**3. Google Sheets no puede funcionar.** El trigger no envía el header que el endpoint exige. Cada invocación recibe 401. La fuga cross-tenant que describí **nunca se materializó**, y la feature está muerta desde su despliegue sin que nadie la reclamara.

**4. MercadoPago está mejor de lo que la auditoría sugería.** No confía en el body: reconsulta el estado a la API de MP. Eso neutraliza el problema clásico de webhooks fuera de orden. Lo que falta es registro de eventos, no idempotencia.

**5. Aparecieron dos hallazgos nuevos.** `/api/ics` es la única ruta pública por token **sin rate limit**. Y `pacientes.token` **sí tiene constraint UNIQUE**, lo que descarta la hipótesis de tokens duplicados.

### Qué falta para arrancar

Una consulta SQL —`D1.4`, cruces entre cita y paciente— decide si esto es un plan de refactor o un incidente de integridad. **Es la única verificación con poder de cambiar el orden de trabajo.** Todo lo demás está listo.

---

## 2. BI / Data Exposure

**Prioridad máxima, según lo pedido.**

### 2.0 Corrección del inventario — DESCARTADO

Mencionaste tres vistas. Verificación exhaustiva (`grep` sobre `.sql`, `.ts`, `.tsx`, `.md`, excluyendo `node_modules`):

| Vista mencionada | Resultado |
|---|---|
| `bi_ingresos_por_mes` | **EXISTE** — `remote_schema.sql:538` |
| `bi_rentabilidad` | **NO EXISTE** — 0 coincidencias · **DESCARTADO** |
| `bi_resumen_financiero` | **NO EXISTE** — 0 coincidencias · **DESCARTADO** |

Las dos inexistentes no aparecen ni en migraciones, ni en código, ni en los informes previos. Presumo confusión con `bi_resumen` (materializada, existe) o con la pantalla `/finanzas`.

### 2.1 Inventario real — CONFIRMADO

**Ocho vistas** en el esquema (`remote_schema.sql:508-616, 903`):

| # | Vista | Tipo | Tabla base | ¿`tenant_id`? |
|---|---|---|---|---|
| 1 | `bi_citas_por_dia` | vista | `citas` | **NO** |
| 2 | `bi_citas_por_tratamiento` | vista | `citas` | **NO** |
| 3 | `bi_ingresos_por_mes` | vista | `citas` | **NO** |
| 4 | `bi_kpis_mes` | vista | `citas` | **NO** |
| 5 | `bi_ocupacion_por_hora` | vista | `citas` | **NO** |
| 6 | `bi_pacientes_nuevos_por_mes` | vista | `pacientes` | **NO** |
| 7 | `bi_resumen` | **materializada** | `citas` | **SÍ** |
| 8 | `tenants_public` | vista | `tenants` | N/A |

### 2.2 Definiciones SQL — CONFIRMADO

Las dos de mayor impacto, textuales:

```sql
-- remote_schema.sql:538
CREATE OR REPLACE VIEW "public"."bi_ingresos_por_mes" AS
 SELECT to_char(date_trunc('month', (fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires')), 'YYYY-MM') AS mes,
    count(*) AS citas,
    COALESCE(sum(valor) FILTER (WHERE valor IS NOT NULL), 0) AS ingresos,
    COALESCE(sum(sena)  FILTER (WHERE sena  IS NOT NULL), 0) AS senas
   FROM "public"."citas"        -- ← SIN WHERE tenant_id
  GROUP BY date_trunc('month', ...) ORDER BY ... DESC LIMIT 6;

-- remote_schema.sql:552
CREATE OR REPLACE VIEW "public"."bi_kpis_mes" AS
 SELECT count(*) AS citas_mes, ...,
    COALESCE(sum(valor) ..., 0) AS ingresos_mes,
    COALESCE(sum(sena)  ..., 0) AS senas_mes,
    count(DISTINCT paciente_id) AS pacientes_unicos
   FROM "public"."citas"        -- ← SIN WHERE tenant_id
  WHERE date_trunc('month', fecha_hora) = date_trunc('month', now());
```

### 2.3 Propietarios — CONFIRMADO

Las ocho declaran `ALTER VIEW ... OWNER TO "postgres"`. `postgres` es superusuario en Supabase.

### 2.4 Grants — CONFIRMADO

`remote_schema.sql:1672-1716, 1854-1856`:

| Vista | `anon` | `authenticated` | `service_role` |
|---|:--:|:--:|:--:|
| `bi_citas_por_dia` | **ALL** | ALL | ALL |
| `bi_citas_por_tratamiento` | **ALL** | ALL | ALL |
| `bi_ingresos_por_mes` | **ALL** | ALL | ALL |
| `bi_kpis_mes` | **ALL** | ALL | ALL |
| `bi_ocupacion_por_hora` | **ALL** | ALL | ALL |
| `bi_pacientes_nuevos_por_mes` | **ALL** | ALL | ALL |
| `bi_resumen` | — | — | ALL |
| `tenants_public` | ALL | ALL | ALL |

### 2.5 ¿Tienen RLS? — CONFIRMADO: no, y no pueden tenerla

Las vistas no soportan RLS propia: heredan la de sus tablas base **solo si** se declara `security_invoker = on`. **Ninguna de las ocho lo declara** (verificado: `grep security_invoker` sobre las 37 migraciones → 0 resultados).

Sin `security_invoker`, la vista se ejecuta con los privilegios de su **dueño**. Dueño = `postgres` = superusuario = **saltea RLS**. Las policies `tenant_isolation_citas` y `tenant_isolation_pacientes` **no se aplican** al consultar por estas vistas.

### 2.6 ¿PostgREST puede acceder? — INFERIDO (alta confianza)

PostgREST expone automáticamente toda relación del esquema `public` sobre la que el rol tenga grant. Las seis tienen grant a `anon` y `authenticated`. **Deberían responder en `/rest/v1/<vista>`.** No ejecutado: sin red.

### 2.7 ¿`anon` puede consultarlas? — INFERIDO (alta confianza)

`GRANT ALL TO anon` + sin RLS efectiva ⇒ sí. La `anon` key viaja en el bundle del navegador, así que el "atacante" no necesita credenciales: las toma del sitio público.

### 2.8 ¿`authenticated` puede consultarlas? — INFERIDO (alta confianza)

Sí, y **sin filtro de su propio tenant**: un usuario legítimo de la Clínica A ve los agregados de todas.

### 2.9 ¿Filtro por `tenant_id`? — CONFIRMADO: ninguno

Seis de seis agregan sobre la tabla completa. Ni columna, ni `WHERE`, ni `GROUP BY` por tenant. **`bi_resumen` sí lo tiene** (`GROUP BY tenant_id`), y además solo tiene grant a `service_role` y está `WITH NO DATA`: no representa riesgo.

### 2.10 ¿Puede devolver datos de más de un tenant? — CONFIRMADO: sí, por construcción

No es un caso límite: **es lo único que puede hacer**. `sum(valor)` sobre `citas` sin filtro es la suma de todas las clínicas.

### 2.11 ¿La aplicación las usa? — CONFIRMADO: no

`/bi/page.tsx` consulta `.from('citas')` en las líneas 133 y 155. **Ninguna referencia a las vistas `bi_*` en todo `src/`.** Las únicas menciones son comentarios en `src/lib/multitratamiento.test.ts:14-15`.

**Son código muerto con la puerta abierta.** Eliminarlas no rompe nada.

### 2.12 Prueba con cuatro perfiles — NO VERIFICADO

Requiere red. Predicción, para contrastar al ejecutar:

| Perfil | Predicción | Fundamento |
|---|---|---|
| Anónimo (anon key) | **Devuelve datos de todos los tenants** | Grant + sin `security_invoker` |
| Autenticado (cualquiera) | **Ídem** | Mismo motivo |
| Usuario Tenant A | **Ve también datos de B** | La vista no discrimina |
| Usuario Tenant B | **Ve también datos de A** | Ídem |

Comprobación mínima, sin credenciales privilegiadas:
```
curl "https://lbaqbhpjjhhzplijxilp.supabase.co/rest/v1/bi_ingresos_por_mes?select=*" \
     -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
```
Devuelve datos ⇒ CONFIRMADO. Devuelve 401/403 ⇒ el esquema desplegado difiere del dump y esto pasa a DESCARTADO.

### 2.13 Qué datos quedarían expuestos

| Vista | Datos | Sensibilidad |
|---|---|---|
| `bi_ingresos_por_mes` | Ingresos y señas mensuales, últimos 6 meses, **todas las clínicas** | **Comercial alta** |
| `bi_kpis_mes` | Ingresos del mes, tasa de confirmación, **pacientes únicos** | **Comercial alta** |
| `bi_citas_por_tratamiento` | **Precio promedio por tratamiento** y volumen | **Comercial alta** |
| `bi_citas_por_dia` | Volumen diario y tasa de confirmación, 30 días | Media |
| `bi_ocupacion_por_hora` | Distribución horaria y duración promedio | Baja |
| `bi_pacientes_nuevos_por_mes` | Altas de pacientes por mes | Media |

**No hay PII de pacientes** — son agregados, sin nombres, emails ni identificadores. Lo expuesto es el **volumen de negocio de los clientes del SaaS**: facturación mensual, ticket promedio por tratamiento y cantidad de pacientes.

Para un competidor de una clínica, es su facturación. Para un competidor de la plataforma, es el tamaño del negocio entero.

### Veredicto

**CONFIRMADO** que las seis vistas carecen de aislamiento por tenant, de `security_invoker` y de restricción de grants, y que la aplicación no las usa.
**INFERIDO** que son consultables sin autenticar.
**DESCARTADO** que existan `bi_rentabilidad` y `bi_resumen_financiero`.

Un `curl` de cinco minutos convierte el INFERIDO en CONFIRMADO o en DESCARTADO. **Es la verificación de mayor valor por minuto de todo este documento.**

---

## 3. Multi-Tenant Integrity

### 3.1 NULLs — parcialmente CONFIRMADO por esquema

| Tabla | `tenant_id` | ¿NULL posible? | Clasificación |
|---|---|---|---|
| `pacientes` | `NOT NULL DEFAULT '2845c423…'` | **No** | **DESCARTADO** por esquema |
| `citas` | `NOT NULL DEFAULT '2845c423…'` | **No** | **DESCARTADO** por esquema |
| `turnos` | `NOT NULL DEFAULT '2845c423…'` | **No** | **DESCARTADO** por esquema |
| **`costos_fijos`** | `DEFAULT '2845c423…'`, **nullable** | **SÍ** | **CONFIRMADO** como riesgo |
| **`ingresos_manuales`** | `DEFAULT '2845c423…'`, **nullable** | **SÍ** | **CONFIRMADO** como riesgo |
| **`meta_mensual`** | `DEFAULT '2845c423…'`, **nullable** | **SÍ** | **CONFIRMADO** como riesgo |
| **`feedback_post_visita`** | nullable, sin default | **SÍ** | **CONFIRMADO** como riesgo |

Las otras 15 tablas con `tenant_id` son `NOT NULL` sin default: estado correcto.

**Esto corrige mi plan.** Yo escribí que NULL era imposible por esquema; era cierto solo para las tres primeras.

**Por qué importa.** Con `tenant_id IN (SELECT …)`, una fila con NULL evalúa a **NULL, no a TRUE** ⇒ queda invisible para todos los roles salvo `service_role`. Un ingreso de caja en ese estado **desaparece de `/finanzas` sin error ni aviso**. Para una tabla financiera, un dato ausente es peor que un dato mal atribuido: el segundo se nota.

Cuántas filas hay así: **NO VERIFICADO** (consulta D1.8, §16).

### 3.2 Cruces — NO VERIFICADO, camino CONFIRMADO

| Cruce | ¿Posible hoy? | Evidencia |
|---|---|---|
| Cita con tenant distinto al del paciente | **Sí** | No existe FK compuesta `(paciente_id, tenant_id)` |
| Turno con tenant distinto al del paciente | **Sí** | El trigger no propaga `tenant_id` (§5) |
| Tablas hijas inconsistentes | **Sí** | Mismo motivo: FK simple por `id` |

**Nada en el esquema lo impide.** Si ya ocurrió es una cuestión de datos y **no puedo responderla desde acá**.

La consulta decisiva:
```sql
SELECT c.id, c.tenant_id AS tenant_cita, p.id, p.tenant_id AS tenant_paciente, c.creado_en
FROM citas c JOIN pacientes p ON p.id = c.paciente_id
WHERE c.tenant_id <> p.tenant_id;
```

**Es la única consulta con poder de cambiar el orden de trabajo.** Si devuelve filas, esto deja de ser un plan de refactor y pasa a ser un incidente de integridad de datos clínicos.

### 3.3 Duplicados

| Caso | Clasificación | Nota |
|---|---|---|
| Mismo email dentro del mismo tenant | **NO VERIFICADO** | Nada lo impide: no hay constraint |
| Mismo email en tenants distintos | **NO VERIFICADO** — y **probablemente legítimo** | Una persona puede ser paciente de dos clínicas |
| Pacientes duplicados (otros criterios) | **NO VERIFICADO** | `importar` deduplica por documento y teléfono (`route.ts:49-56`), las altas manuales no |

**Matiz sobre el segundo caso:** por sí solo no es anomalía. La señal es su **combinación** con un cruce: un paciente en la clínica `2845c423` cuyo email aparece en un `turnos` de otra clínica — la huella exacta del trigger.

### Veredicto

**CONFIRMADO:** cuatro tablas admiten `tenant_id` NULL, y nada en el esquema impide los cruces.
**NO VERIFICADO:** si ya se materializaron. Requiere SQL.

---

## 4. Tenant Defaults

### CONFIRMADO — seis tablas

| # | Tabla | Default | `NOT NULL` | Declaración | Migración de origen |
|---|---|---|:--:|---|---|
| 1 | `citas` | `'2845c423-affa-4ca2-9c5f-f4ec8e35701a'` | sí | `remote_schema.sql:496` | **No rastreable** |
| 2 | `pacientes` | ídem | sí | `remote_schema.sql:589` | **No rastreable** |
| 3 | `turnos` | ídem | sí | `remote_schema.sql:947` | **No rastreable** |
| 4 | `costos_fijos` | ídem | **no** | `remote_schema.sql:669` | `supabase_migration.sql:6` |
| 5 | `ingresos_manuales` | ídem | **no** | `remote_schema.sql:748` | `supabase_migration.sql:10` |
| 6 | `meta_mensual` | ídem | **no** | `remote_schema.sql:777` | `supabase_migration.sql:14` |

El UUID `2845c423-affa-4ca2-9c5f-f4ec8e35701a` corresponde a una clínica **real de producción** (aparece también en `supabase_migration_billing.sql:11` y `supabase_migration_odontograma.sql:34`, ajustando su suscripción y su odontograma).

### Motivo aparente — CONFIRMADO para las tablas 4-6

`supabase_migration.sql:6-15`:
```sql
ALTER TABLE costos_fijos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  DEFAULT '2845c423-affa-4ca2-9c5f-f4ec8e35701a';
UPDATE costos_fijos SET tenant_id = '2845c423-...' WHERE tenant_id IS NULL;
```

Retrofit de multi-tenancy sobre un sistema mono-tenant: el DEFAULT evitaba que el `ADD COLUMN` fallara y el `UPDATE` rellenaba lo existente. **Era correcto como herramienta de migración. El error fue no retirarlo.**

Para `citas`, `pacientes` y `turnos` el default ya venía en el dump: **no hay migración en el repositorio que lo haya creado**. Su origen es anterior al control de versiones del esquema.

### Riesgo — dos clases distintas

**Clase A (1-3): `NOT NULL` + DEFAULT.** Omitir `tenant_id` no falla: la fila aterriza en la clínica `2845c423`. Contaminación silenciosa.

**Clase B (4-6) + `feedback_post_visita`: nullable.** Dos modos de falla. Con el DEFAULT, igual que A. Pasando `tenant_id: null` explícito, el DEFAULT no aplica y la fila queda invisible bajo RLS (§3.1).

**Consecuencia para el plan:** `DROP DEFAULT` es necesario pero **insuficiente** en clase B. Hace falta también `SET NOT NULL`, condicionado a que no haya NULLs previos.

### Código que depende del default — CONFIRMADO: ninguno

Los 10 INSERT verificados en `src/` pasan `tenant_id` explícito:

| Tabla | Archivo:línea |
|---|---|
| `pacientes` | `pacientes/page.tsx:108` · `dashboard/page.tsx:101` · `api/pacientes/importar/route.ts:95` |
| `citas` | `agenda/page.tsx:573` · `api/reserva/crear/route.ts:174` |
| `ingresos_manuales` | `finanzas/page.tsx:409` · `dashboard/page.tsx:135` |
| `costos_fijos` | `finanzas/page.tsx:393` |
| `meta_mensual` | `finanzas/page.tsx:384` |
| `turnos` | **ningún INSERT en `src/`** |

**Quitar los defaults no rompe la aplicación.** El único consumidor conocido es `sync_turno_to_cita()`.

**NO VERIFICADO:** procesos fuera del repositorio (Edge Functions, snippets del SQL Editor, integraciones externas).

**No se eliminó ningún default.**

---

## 5. sync_turno_to_cita

### 5.1 ¿Activo? — CONFIRMADO en el dump / NO VERIFICADO en la base actual

`remote_schema.sql:1201`:
```sql
CREATE OR REPLACE TRIGGER "trigger_turno_to_cita" AFTER INSERT ON "public"."turnos"
  FOR EACH ROW EXECUTE FUNCTION "public"."sync_turno_to_cita"();
```
Ninguna de las 37 migraciones lo elimina. El dump es del 22/07/2026: alguien pudo haberlo quitado a mano desde entonces.

### 5.2 Tabla — CONFIRMADO
`public.turnos`, `AFTER INSERT`, `FOR EACH ROW`.
*(`sync_turnos_to_sheets` sobre `citas` es otro trigger, sin relación — §11.)*

### 5.3 Función — CONFIRMADO
`public.sync_turno_to_cita()`, definida en `remote_schema.sql:419-465`.

### 5.4 Código SQL completo — CONFIRMADO

```sql
CREATE OR REPLACE FUNCTION "public"."sync_turno_to_cita"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_paciente_id UUID;
  v_nombre_completo TEXT;
  v_fecha_hora TIMESTAMPTZ;
BEGIN
  v_nombre_completo := NEW.nombre || ' ' || NEW.apellido;

  v_fecha_hora := (NEW.fecha::TEXT || ' ' || NEW.hora || ':00')::TIMESTAMP
                  AT TIME ZONE 'America/Argentina/Buenos_Aires';

  SELECT id INTO v_paciente_id
  FROM pacientes
  WHERE email = NEW.email            -- (7) solo email, sin tenant
  LIMIT 1;

  IF v_paciente_id IS NULL THEN
    INSERT INTO pacientes (nombre, email, telefono)      -- (8) sin tenant_id
    VALUES (v_nombre_completo, NEW.email, NEW.telefono)
    RETURNING id INTO v_paciente_id;
  END IF;

  INSERT INTO citas (
    paciente_id, fecha_hora, tipo_tratamiento, estado, notas, duracion_minutos
  ) VALUES (                                              -- (9) sin tenant_id
    v_paciente_id, v_fecha_hora, NEW.servicio, 'pendiente',
    COALESCE(NEW.notas, ''), 30
  );

  RETURN NEW;
END;
$$;
```

### 5.5 ¿`SECURITY DEFINER`? — CONFIRMADO: sí
Con `SET search_path TO 'public'`. **Omite `pg_temp`**, a diferencia de las funciones `fn_*` del mismo esquema, que sí lo incluyen. Es una inconsistencia de endurecimiento.

### 5.6 ¿Cómo determina el tenant? — CONFIRMADO: no lo determina
**No lee `NEW.tenant_id` en ningún punto**, pese a que `turnos.tenant_id` existe y es `NOT NULL` (`remote_schema.sql:947`). El dato está disponible y la función lo ignora. No es una limitación del esquema: es un olvido.

### 5.7 ¿Busca solo por email? — CONFIRMADO: sí
`WHERE email = NEW.email LIMIT 1`. Sin `tenant_id`, sin normalización (`lower`/`trim`), sin desempate. Con dos coincidencias, `LIMIT 1` elige de forma arbitraria.

### 5.8 ¿Puede crear pacientes sin tenant? — CONFIRMADO, con matiz importante
No los crea **sin** tenant: los crea **en la clínica `2845c423`**, por el DEFAULT de columna (§4). El efecto no es un huérfano invisible sino una **asignación silenciosa a una clínica real**.

### 5.9 ¿Puede crear citas sin tenant? — CONFIRMADO, mismo matiz
Idéntico. Y la cita queda apuntando a un `paciente_id` que puede pertenecer a **otra** clínica — el cruce de §3.2.

### 5.10 Dependencias — CONFIRMADO: ninguna identificable

- Un trigger no se invoca desde código; se dispara por INSERT.
- La función no es llamada desde ninguna otra parte del esquema (solo su definición, el `CREATE TRIGGER` y los `REVOKE`/`GRANT` de `:1655-1656`).
- **`grep -rn "from('turnos')" src/` → 0 resultados.** La aplicación no lee ni escribe `turnos`.
- **`/api/reserva/crear/route.ts` implementa el mismo flujo funcional** (reserva pública → buscar/crear paciente → crear cita) correctamente: filtra por tenant (`:95,108,135`), lo propaga en ambos INSERT (`:149,174`), valida consentimiento, aplica rate limit y envía confirmación. **`turnos` + trigger son la versión legacy de un flujo que ya tiene reemplazo operativo.**

**Detalle sobre permisos — CONFIRMADO:** `turnos` tiene `GRANT ALL TO anon` (`:1866`), pero RLS está habilitado (`:1595`) y sus dos policies son `TO authenticated` (`:1598`) y `TO service_role` (`:1370`). **Con RLS activo y sin policy aplicable, la operación se deniega: `anon` no puede insertar.** El GRANT es ruido heredado, no una puerta abierta. Vías vivas: `service_role` o un usuario autenticado miembro del tenant.

### 5.11 ¿Datos históricos creados por el trigger? — NO VERIFICADO

`turnos` tiene `created_at`, así que la respuesta existe en la base. Consultas D3.2 y D1.9 (§16).

### Veredicto

**CONFIRMADO:** la función es defectuosa exactamente como se describió.
**NO VERIFICADO:** si sigue instalada y si llegó a producir daño.

Todo lo verificable apunta a que está **dormida**. Pero dormida no es muerta: mientras exista, cualquier escritura futura en `turnos` dispara la lógica defectuosa. **No se modificó.**

---

## 6. Patient Tokens

### 6.1 Generación — CONFIRMADO: siete lugares, ninguno fija expiración

| # | Archivo:línea | Contexto |
|---|---|---|
| 1 | `src/app/pacientes/page.tsx:99` | Alta manual |
| 2 | `src/app/pacientes/page.tsx:209` | Botón "Generar link" (vista escritorio) |
| 3 | `src/app/pacientes/page.tsx:249` | Botón "Generar link" (vista móvil) |
| 4 | `src/app/dashboard/page.tsx:93` | Alta rápida |
| 5 | `src/app/agenda/page.tsx:1603` | Alta desde agenda |
| 6 | `src/components/NuevaCitaModal.tsx:183` | Alta desde modal |
| 7 | `src/app/api/reserva/crear/route.ts:145` | Reserva online |
| 8 | `src/app/api/pacientes/importar/route.ts:105` | Importación masiva |

Ocho puntos si se cuentan por línea; siete contextos funcionales. **Todos `crypto.randomUUID()`, ninguno escribe `token_expira`.**

**Entropía: adecuada.** UUIDv4 = 122 bits. La enumeración es inviable. El problema no es adivinar el token.

### 6.2 Almacenamiento — CONFIRMADO

`pacientes.token TEXT`, **en claro**, con `UNIQUE`:
```sql
-- remote_schema.sql:1054
ADD CONSTRAINT "pacientes_token_key" UNIQUE ("token");
```
`consentimientos_firmados.token_firma UUID UNIQUE DEFAULT gen_random_uuid()` (`consentimientos.sql:32`).

**Exposición adicional — CONFIRMADO:** `src/app/pacientes/page.tsx:50` hace `select('*')` sobre `pacientes`. **El token de todos los pacientes de la clínica viaja al navegador** cada vez que se abre el listado.

### 6.3 Validación — CONFIRMADO, con un bypass

`src/app/api/paciente/[token]/route.ts:66-69`:
```ts
if (pac.token_expira && new Date(pac.token_expira).getTime() < Date.now()) {
  return NextResponse.json({ error: 'Este enlace ha expirado...' }, { status: 410 })
}
```

**Bypass CONFIRMADO** — `route.ts:41-61`: si el `select` principal falla (por ejemplo, si la columna `token_expira` no existiera), un `catch` de respaldo consulta un conjunto reducido de columnas y fija `token_expira: null` **de forma explícita**. Ese camino **omite por completo la validación de expiración**. Es un bypass silencioso del control que el plan pretende construir, y hay que eliminarlo junto con el resto.

### 6.4 ¿Todos fijan `token_expira`? — CONFIRMADO: ninguno

```
grep -rn "token_expira" src/ | grep -iE "update|set|insert"  →  0 resultados
```

`supabase_migration_security_fix.sql:50-58` lo documenta como decisión consciente:
> *"NO expiramos los tokens existentes… `token_expira` queda NULL para todos = los enlaces actuales NO caducan… No se aplica ninguna expiración automática."*

### 6.5 ¿Qué ocurre con `token_expira` NULL? — CONFIRMADO
El `if` no entra y **el acceso se concede sin límite temporal**. NULL significa "válido para siempre".

### 6.6 ¿Tokens vencidos pero usables? — DESCARTADO por construcción
No pueden existir: si `token_expira` está poblado y venció, el endpoint devuelve 410. El problema es el inverso — **ningún token tiene expiración**, así que ninguno vence.

### 6.7 ¿Tokens sin expiración? — CONFIRMADO: todos
INFERIDO que en producción el 100 % tiene `token_expira IS NULL`. Confirmable con:
```sql
SELECT count(*) FILTER (WHERE token IS NOT NULL) AS con_token,
       count(*) FILTER (WHERE token IS NOT NULL AND token_expira IS NULL) AS sin_expiracion
FROM pacientes;
```

### 6.8 ¿Tokens duplicados? — DESCARTADO
`pacientes_token_key UNIQUE (token)` lo hace **imposible a nivel de base**. `token_firma` también es `UNIQUE`. La hipótesis queda descartada.

### 6.9 ¿Los endpoints públicos verifican la expiración?

| Endpoint | ¿Verifica? | Clasificación |
|---|---|---|
| `GET /api/paciente/[token]` | **Sí**, salvo por el bypass de §6.3 | CONFIRMADO parcial |
| `PATCH /api/paciente/[token]/estado` | **NO** — solo `.eq('token', token)` | **CONFIRMADO: no verifica** |
| `POST /api/paciente/[token]/feedback` | **NO** | **CONFIRMADO: no verifica** |
| `GET/POST /api/consentimientos/firmar/[token]` | **NO** — `token_firma` no tiene expiración | CONFIRMADO |
| `GET /api/ics` | Vía `leerTurnoPublico` — `turno-publico.ts:80-95` consulta `token_expira` aparte | CONFIRMADO: sí |

**Hallazgo:** la validación de expiración está en **una sola** de las cuatro rutas del portal. Aunque se poblara `token_expira` mañana, `/estado` y `/feedback` seguirían aceptando tokens vencidos. El plan debe cubrir las cuatro, no solo la principal.

### 6.10 Qué abre el token — CONFIRMADO
Nombre, teléfono, **alergias**, **antecedentes**, historial dental completo, turnos pasados y futuros, **fotos clínicas** (URLs firmadas a 1 h), saldo de puntos, recomendaciones.

### Veredicto

**CONFIRMADO:** los tokens no expiran, se guardan en claro, viajan al navegador en el listado, y tres de cuatro endpoints públicos no validan expiración. Existe además un camino que la saltea por completo.
**DESCARTADO:** duplicación de tokens y tokens vencidos aún usables.

---

## 7. Roles & RLS

### 7.1 Roles reales — NO VERIFICADO en datos / CONFIRMADO en código

`SELECT DISTINCT role, count(*) FROM tenant_users GROUP BY role` requiere la base.

**Roles referenciados en el código: exactamente tres.**

| Rol | Evidencia |
|---|---|
| `owner` | `clinicas/route.ts:109`, `registro/route.ts:145`, `equipo/page.tsx:154` |
| `admin` | DEFAULT de la columna, 8 rutas, 4 policies RLS |
| `staff` | `equipo/invitar/route.ts:96,118` (`role \|\| 'staff'`), `equipo/page.tsx:182` |

**"Odontólogo" NO EXISTE** — `grep -niE "odontolog" src/ | grep -iE "role|rol\b"` → 0 resultados. **DESCARTADO** como rol implementado; es una decisión de producto abierta.

**CONFIRMADO — la columna no tiene CHECK:**
```sql
"role" "text" DEFAULT 'admin'::"text" NOT NULL   -- remote_schema.sql:865
```
Dos consecuencias: cualquier string es un rol válido, y **el default es el rol privilegiado**.

Por qué hay que correr la consulta igual: el plan aplica un `CHECK` sobre la premisa de tres valores. Un cuarto valor en producción hace fallar la migración, o peor, la aplica y deja usuarios sin poder operar.

### 7.2 Comparación rol declarado ↔ permisos reales

**Nivel base de datos — CONFIRMADO:**

| Grupo | Tablas | ¿Filtra por rol? |
|---|---|---|
| Principal | `citas`, `pacientes`, `bloqueos`, `tratamientos`, `historial_dental`, `historial_puntos`, `paciente_fotos`, `presupuestos`, `ingresos_manuales`, `egresos_manuales`, `costos_fijos`, `meta_mensual`, `config_fidelizacion`, `premios`, `perfil_doctor`, `logs_envios`, `recordatorios_log`, `whatsapp_contactos`, `tratamiento_items`, `pagos` | **NO** — 20 tablas |
| Con rol | `arca_config` (`arca.sql:82-91`), `plantillas_consentimiento` (`consentimientos.sql:51-53`), `crm_campanas` (`crm_automatizacion.sql:41-43`), `tenants` UPDATE (`fix_branding.sql:12-22`) | **SÍ** — 4 |

**Nivel API — CONFIRMADO, inconsistente:**

| Ruta | Exige | Archivo:línea |
|---|---|---|
| `facturacion/emitir` | **solo membresía** ⚠️ | `:72-80` |
| `facturacion/anular` | admin/owner | `:41-43` |
| `facturacion/config` POST | admin/owner | `:95-97` |
| `facturacion/config` GET | solo membresía | `:28-30` |
| `pacientes/exportar` | admin/owner | `:19-21` |
| `pacientes/importar` | **solo membresía** ⚠️ | `:45-46` |
| `consentimientos` POST | solo membresía | `:62-63` |
| `billing/cancelar` | owner/admin | `:40-43` |
| `equipo/invitar` | owner/admin | `:49-50` |
| `equipo/miembros` DELETE | owner/admin | `:100-101` |

**Nivel middleware — CONFIRMADO:** `src/middleware.ts` no verifica roles. Solo distingue con sesión / sin sesión.

**Nivel Server Actions — CONFIRMADO:** dos en total (`src/app/actions/fidelizacion.ts`, `src/app/t/[codigo]/page.tsx:67`). Ninguna verifica rol; delegan en RPC (`fn_*`) que revalidan pertenencia al tenant pero **no rol**.

**Nivel frontend — CONFIRMADO:** `Sidebar.tsx:106-117` oculta el panel de plataforma según `/api/admin/me`. Es ocultamiento de UI, **no una barrera**.

### 7.3 Inconsistencia principal — CONFIRMADO

El usuario etiquetado *"Staff (Secretaria)"* (`equipo/page.tsx:182`) puede leer **y modificar** `alergias`, `antecedentes`, `historial_dental` y `paciente_fotos` de todos los pacientes, y editar `ingresos_manuales`, `egresos_manuales` y `costos_fijos` — **directamente desde el cliente Supabase del navegador**, sin pasar por ninguna pantalla ni API.

Y **emitir un comprobante fiscal exige menos permisos que anularlo o que exportar un listado de pacientes.**

### Veredicto

**CONFIRMADO:** no existe autorización por rol en la base para las 20 tablas principales, y los chequeos de API son inconsistentes entre sí.
**NO VERIFICADO:** qué roles y cuántos usuarios hay en producción — necesario para dimensionar el riesgo de cerrar permisos.
**DESCARTADO:** el rol "Odontólogo" como entidad existente.

---

## 8. Service Role

**CONFIRMADO — 22 rutas** usan `SUPABASE_SERVICE_ROLE_KEY`. Todas instancian el cliente admin inline; no hay un módulo compartido.

### Grupo 1 — Bypass legítimo: operan sin sesión por diseño (12)

| Ruta | Operación | Motivo | Auth previa | Tenant | Rol | Riesgo |
|---|---|---|---|---|---|---|
| `webhooks/mercadopago` | UPDATE `tenants` | Webhook externo | **HMAC** + reconsulta a MP | `external_reference` | — | **Bajo** ✅ |
| `webhooks/resend` | UPDATE `recordatorios_log` | Webhook externo | **Firma svix** | — | — | Bajo |
| `crm-campanas` | R/W multi-tenant | Cron | `CRON_SECRET` header **o query** | itera por tenant | — | Medio ⚠️ |
| `daily-briefing` | R multi-tenant | Cron | `CRON_SECRET` solo header | filtra por tenant | — | Bajo |
| `sync-sheet` | R `pacientes` | Webhook de base | `SYNC_SHEET_SECRET` | **ninguna** | — | **Alto** ⚠️ |
| `paciente/[token]` | R datos clínicos | Portal sin login | Token + rate limit | vía paciente | — | Medio |
| `paciente/[token]/estado` | UPDATE `citas` | Portal sin login | Token + rate limit | `.eq('paciente_id')` | — | Medio ⚠️ |
| `paciente/[token]/feedback` | INSERT | Portal sin login | Token + rate limit | vía paciente | — | Bajo |
| `consentimientos/firmar/[token]` | R/UPDATE | Firma sin login | Token + rate limit | vía token | — | Medio |
| `reserva/[clinica]` | R pública | Reserva sin login | Rate limit | por slug | — | Bajo |
| `reserva/crear` | INSERT `pacientes`+`citas` | Reserva sin login | Rate limit + consentimiento | por slug | — | Medio |
| `horas-ocupadas` | R disponibilidad | Widget público | Origin + rate limit | `tenant_id` obligatorio | — | Bajo |

**`sync-sheet` es el de mayor riesgo del grupo:** única ruta con service_role y **cero validación de tenant**. Lee `pacientes` por `record.paciente_id` sin verificar clínica y escribe en una planilla global. Atenuante: hoy nunca se ejecuta (§11).

**`crm-campanas`** acepta el secreto por **query param** además de header (`:22-24`); combinado con Sentry, termina en las trazas.

### Grupo 2 — Bypass necesario: acceso a `auth.users` (4)

| Ruta | Motivo | Auth previa | Tenant | Rol | Riesgo |
|---|---|---|---|---|---|
| `equipo/miembros` | Emails en `auth.users` | `getUser()` **antes** | **sí** (`:26-40`) | **sí** | **Bajo** ✅ |
| `equipo/invitar` | `inviteUserByEmail` | `getUser()` antes | **sí** | **sí** | Bajo |
| `registro` | `createUser` sin sesión previa | Rate limit | crea el tenant | — | Medio |
| `clinicas` | INSERT tenant + RPC | `getUser()` antes | crea el tenant | — | Medio |

`equipo/miembros:26-40` extrae `verificarMembresia()` y valida **antes** de tocar el cliente admin. **Es el patrón correcto y el modelo del helper unificado.**

### Grupo 3 — Bypass por conveniencia: convertibles (6)

| Ruta | ¿Por qué evitable? | Tenant | Rol | Riesgo |
|---|---|---|---|---|
| `enlaces-turno` | El cliente de cookies bastaría | **sí** (`.in('tenant_id')`) | no | **Medio** ⚠️ |
| `confirmar-turno` | Ídem | sí | no | Medio |
| `recordatorios` | Ídem | sí | no | Medio |
| `send-recordatorios` | Necesario en la rama cron, **no** en la de usuario | sí | no | Medio |
| `billing/cancelar` | `tenants` tiene policy UPDATE para owner/admin | sí | **sí** | Bajo |
| `admin/tenants` | Legítimo (admin de plataforma) | N/A | `esAdminDePlataforma()` | Medio |

### Dónde `service_role` puede saltarse RLS — CONFIRMADO

**En las 22, por definición.** `service_role` bypasea RLS siempre. La pregunta útil es **dónde eso deja de estar compensado por una validación explícita**:

| Situación | Rutas | Evaluación |
|---|---|---|
| Sin validación de tenant | **`sync-sheet`** | **Riesgo real** — mitigado solo porque no se ejecuta |
| Con validación, pero única barrera | Grupo 3 (6 rutas) | **Riesgo estructural** |
| Con validación + secreto/firma/token | Grupos 1 y 2 (15 rutas) | Aceptable |

El riesgo del Grupo 3 es estructural, no actual: todas validan bien hoy. `enlaces-turno:49-63` lo ilustra —hace el filtro correcto y hasta lo comenta— pero **si alguien borra `.in('tenant_id', tenants)` en un refactor, no hay nada debajo**. Con el cliente de cookies, RLS actuaría de red.

`admin/tenants` merece nota: es legítimo, pero **no registra auditoría**. Un admin de plataforma desactiva clínicas (`PATCH :126-146`) sin dejar rastro.

**No se modificó ninguna ruta.**

---

## 9. ARCA

### 9.1 Consultas de datos — NO VERIFICADO

Seis verificaciones requieren la base: facturas sin CAE, CAE duplicados, numeración duplicada, facturas duplicadas, citas con múltiples facturas, estados imposibles. SQL en §16.

**Lo que el esquema anticipa — CONFIRMADO:**

| Verificación | Predicción | Fundamento |
|---|---|---|
| Facturas sin CAE | Improbable | `cae TEXT NOT NULL` (`arca.sql:44`). Pero `NOT NULL` no impide `''` |
| CAE duplicados | **Posible** | No hay constraint de unicidad sobre `cae` |
| Numeración duplicada en reales | Improbable | Índice único parcial (`arca.sql:63-66`) |
| Facturas duplicadas por cita | **Posible** | Chequeo aplicativo, no de base |
| Estados imposibles | Improbable | Solo `emitida`/`error` hoy |

**Detalle sobre el índice único — CONFIRMADO:**
```sql
CREATE UNIQUE INDEX facturas_numeracion_unica
    ON facturas (tenant_id, punto_venta, tipo_comprobante, nro_comprobante)
    WHERE estado = 'emitida' AND simulada = false;
```
El `WHERE` excluye simuladas (deliberado y documentado) **y** excluye cualquier estado intermedio. No protege reservas.

**Nota metodológica:** una cita facturada y luego anulada tiene **dos** filas (original + nota de crédito, vinculadas por `anula_factura_id`, `arca.sql:57`). Es correcto. La consulta de duplicados debe excluir NC por `tipo_comprobante NOT IN (3,8,13)`.

### 9.2 Análisis del flujo — CONFIRMADO

**1. ¿Dónde se obtiene el próximo número?**
- Real: `emitir/route.ts:309-310` — `getLastVoucher(puntoVenta, cbteTipo)` a ARCA, `+1` en memoria.
- Simulado: `~:290` — `max(nro_comprobante)` local `+1`.

**2. ¿Existe locking?** — **CONFIRMADO: no.**
Ni advisory lock, ni `SELECT … FOR UPDATE`, ni tabla de secuencias. Entre leer el último número y emitir no hay exclusión mutua.

**3. ¿Dónde se llama a ARCA?** — `:366`, `afip.ElectronicBilling.createVoucher(invoiceData)`. **Sin timeout explícito.**

**4. ¿Dónde se persiste el CAE?** — `:384-405`, RPC `emitir_factura_con_detalle`. **Después** de la llamada. No hay escritura previa.

**5. ¿Qué ocurre si Supabase falla después del CAE?** — **CONFIRMADO: el comprobante se pierde.**
```ts
406: if (insertError) {
408:   if ((insertError as any).code === '23505') {
409:     return NextResponse.json({ error: 'Otra factura se emitió al mismo tiempo...' }, { status: 409 })
410:   }
413:   : `Factura autorizada por ARCA (CAE: ${cae}) pero falló el registro local`
414:   return NextResponse.json({ error: `${prefijo}: ${insertError.message}` }, { status: 500 })
```
**El CAE se devuelve dentro del texto de un mensaje de error HTTP y no se persiste en ningún lado.** Sin cola, sin tabla de pendientes, sin reintento. Queda autorizado ante el fisco y ausente del sistema.

El caso `23505` es peor: llega **después** de que ARCA autorizó. El mensaje dice "reintentá en unos segundos", pero el número ya se consumió y el reintento genera un **segundo** comprobante fiscal.

**6. ¿Timeout?** — **CONFIRMADO: no hay.**
Si la función serverless muere en el límite de la plataforma, **no corre ningún código de manejo**. Es el peor escenario: ARCA autorizó y no queda rastro local.

**7. ¿Retry?** — **CONFIRMADO: no hay reintento automático.** El reintento es manual (el usuario vuelve a apretar) y **genera un comprobante nuevo**, porque no hay clave de idempotencia.

**8. ¿Doble click?** — **CONFIRMADO: no está protegido.**
El chequeo de "ya facturado" (`:96-110`) es un `SELECT` seguido de la emisión. Dos requests concurrentes pueden ambos leer "no existe" y ambos emitir. Es una condición de carrera lectura-escritura clásica, y **el único lugar donde se resuelve con certeza es un constraint de base**, que no existe.

**9. ¿Idempotencia?** — **CONFIRMADO: no existe.**
No hay `idempotency_key`, ni constraint `UNIQUE (tenant_id, cita_id)`, ni deduplicación por hash de payload.

### 9.3 Lo que está bien y no debe tocarse — CONFIRMADO

- **El monto siempre se recalcula desde la base** (`:117-119`), nunca se toma del body. El cliente no puede inflar un comprobante fiscal.
- `emitir_factura_con_detalle` **revalida el tenant dentro de la función `SECURITY DEFINER`** (`pagos_y_multitratamiento.sql:227-232`), donde RLS no llega.
- La atomicidad local factura+ítems+pagos está correctamente resuelta.
- La aritmética en centavos garantiza `ImpTotal == ImpNeto + ImpIVA` (error 10048 de ARCA).

### Veredicto

**CONFIRMADO:** ausencia total de locking, timeout, idempotencia y persistencia previa al CAE. Los siete escenarios del plan (A-G) son alcanzables con el código actual.
**NO VERIFICADO:** si ya produjeron inconsistencias en los datos.

---

## 10. MercadoPago

### 10.1 Validación HMAC — CONFIRMADO: correcta

`webhooks/mercadopago/route.ts:12-41`:
```ts
const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`
const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
```
Manifest según especificación, comparación en tiempo constante, y **rechazo si falta el secreto** (`:17-21`, falla cerrada). Bien implementado.

La ruta simulada (`mock-preapp-`) está **bloqueada en producción** (`:64-67`).

### 10.2 ID de evento — CONFIRMADO: no se usa como identidad de evento

Se lee `body.data?.id || body.id` (`:48`) — es el **id del preapproval**, no del evento. MercadoPago envía `x-request-id`, que **se usa para validar la firma pero no se almacena**.

### 10.3 Deduplicación — CONFIRMADO: no existe
No hay comprobación de si el evento ya fue procesado.

### 10.4 Almacenamiento de eventos — CONFIRMADO: no existe
No hay tabla de webhooks ni log de eventos (verificado sobre las 37 migraciones). **Sin traza de auditoría de cambios de suscripción.**

### 10.5 Retry — CONFIRMADO: se devuelve 500 ante fallo de base

`:118-120` lanza, y el `catch` (`:129-132`) devuelve 500. MercadoPago reintenta ante 5xx. **Es el comportamiento correcto**: el reintento vuelve a consultar el estado real y reconverge.

### 10.6 Webhook duplicado — DESCARTADO como riesgo real

Aquí la auditoría original era más pesimista de lo que corresponde. El código **no confía en el body**:

```ts
80: const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
81:   headers: { 'Authorization': `Bearer ${mpAccessToken}` } })
...
93: const preapproval = await mpRes.json()
96: const [refTenantId, refPlan] = String(preapproval.external_reference || '').split('|')
98: status = preapproval.status        // ← estado REAL, consultado ahora
```

Cada webhook **reconsulta el estado actual a la API de MercadoPago**. Consecuencias:

- **Webhook duplicado** → misma consulta, mismo estado, mismo UPDATE. Resultado idéntico.
- **Webhook fuera de orden** → se escribe el estado **actual**, no el del momento del evento. Un "pending" atrasado que llega después de un "authorized" **no revierte** la suscripción: al reconsultar, MP responde "authorized".

Es una defensa sólida, y es la razón por la que el problema clásico de webhooks de suscripción no aplica acá.

### 10.7 Consistencia de estados — CONFIRMADO, con un matiz

`:110` — `const planFinal: Plan = isAuthorized ? planContratado : 'starter'`. Cualquier estado distinto de `'authorized'` degrada a `starter`. Es conservador y defendible.

**Matiz:** el `external_reference` se parsea como `"<tenantId>|<plan>"` (`:96`). Si viniera vacío o malformado, `tenantId` queda `''` y el `if (tenantId)` de `:100` salta el UPDATE. **Falla cerrada.** Correcto.

**Confianza del `tenantId`:** proviene de la **respuesta de la API de MP**, no del body del request. Y se fijó en el checkout (`checkout/route.ts:62`), donde sí se valida membresía (`:25-33`). No es manipulable.

### 10.8 ¿Idempotencia real o UPDATE repetido? — La respuesta precisa

**Es un UPDATE repetido, pero converge al mismo estado — que en este diseño equivale a idempotencia funcional.**

La distinción importa: no hay idempotencia *por clave de evento* (no se registra qué eventos se procesaron), pero sí hay **convergencia**, porque la fuente de verdad se reconsulta en cada ejecución. Para un webhook de suscripción cuyo efecto es "sincronizar el estado del tenant con el de MP", la convergencia es suficiente.

**Lo que sí falta, y no es idempotencia:**

| Carencia | Impacto |
|---|---|
| Sin log de eventos | Sin auditoría de cambios de plan; imposible reconstruir por qué una clínica cambió de estado |
| Sin detección de webhooks perdidos | Si MP deja de notificar, el tenant queda congelado en su último estado conocido |
| Sin conciliación periódica | Nada compara el estado local con MP salvo cuando llega un webhook |

**Clasificación general de MercadoPago: riesgo BAJO.** Es la integración mejor construida del sistema. Las carencias son de observabilidad, no de corrección.

**No se implementó idempotencia.**

---

## 11. Google Sheets

### 11.1 Uso de `GOOGLE_SHEET_ID` — CONFIRMADO: global, único mecanismo
`src/app/api/sync-sheet/route.ts:57,66,76` — tres usos de `process.env.GOOGLE_SHEET_ID`. No hay otra fuente de identificador de planilla en el proyecto.

### 11.2 Lugares donde se utiliza — CONFIRMADO: una sola ruta
`/api/sync-sheet`. Credenciales (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`) usadas solo ahí (`:9-10`), scope `https://www.googleapis.com/auth/spreadsheets`.
*Las demás coincidencias de `googleapis` son `fonts.googleapis.com` en `layout.tsx:49,58` — Google Fonts, sin relación.*

### 11.3 Configuración por tenant — CONFIRMADO: no existe
Sin tabla `tenant_integraciones`, sin columna `google_sheet_id` en `tenants`, sin UI de configuración (verificado sobre las 37 migraciones y todo `src/`).

### 11.4 Triggers — CONFIRMADO
`remote_schema.sql:1197`:
```sql
CREATE OR REPLACE TRIGGER "sync_turnos_to_sheets" AFTER INSERT OR UPDATE ON "public"."citas"
  FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"(
    'https://turnos-app-delta.vercel.app/api/sync-sheet', 'POST',
    '{"Content-type":"application/json"}', '{}', '5000');
```
Sobre `citas`, **todos los tenants**, INSERT y UPDATE, por fila, timeout 5000 ms.

### 11.5 Cron — CONFIRMADO: ninguno
`vercel.json` completo:
```json
{ "crons": [
    { "path": "/api/cron",           "schedule": "0 11 * * *" },
    { "path": "/api/daily-briefing", "schedule": "0 22 * * *" },
    { "path": "/api/crm-campanas",   "schedule": "0 12 * * *" } ] }
```
**Ninguno invoca `/api/sync-sheet`.** `.github/workflows/ci.yml` solo corre typecheck y tests. El único invocador es el trigger.

### 11.6 OAuth / tokens — CONFIRMADO: no hay
Sin flujo OAuth de Google en el proyecto. Solo una service account de plataforma. Sin refresh tokens almacenados.

### 11.7 Sincronizaciones — CONFIRMADO: la feature NO FUNCIONA

La cadena está rota en un punto verificable:
- El trigger envía **solo** `{"Content-type":"application/json"}`.
- La ruta exige `Authorization: Bearer <SYNC_SHEET_SECRET>` (`:19-22`) y devuelve **401** si falta.

**Toda invocación del trigger recibe 401.** La sincronización nunca ocurrió desde su despliegue. Falla cerrada — y esa es la razón por la que la fuga cross-tenant descrita en la auditoría **no se materializó**.

Dato adicional: la URL del trigger apunta a `turnos-app-delta.vercel.app`, un dominio de preview de Vercel **hardcodeado en el esquema**. Si el dominio de producción cambió, el trigger además apunta a otro lugar.

### 11.8 Dependencia de procesos actuales — CONFIRMADO: ninguna
Ningún componente lee de la planilla. Ninguna ruta depende de `/api/sync-sheet`. Ningún test la cubre. El único acoplamiento es trigger → ruta, y está roto.

### 11.9 ¿Puede Tenant A escribir en el Sheet de Tenant B? — La respuesta precisa

**Hoy: no, porque nadie escribe en ningún Sheet.**

**Si el header se agregara: no exactamente — sería peor.** No es que A escriba en el Sheet de B: es que **A, B y todos escriben en la misma planilla**. No hay Sheet de A ni Sheet de B. Hay uno solo, y `sync-sheet` vuelca ahí `nombre`, `email`, `telefono`, `tipo_tratamiento`, fecha, hora, estado y **`record.notas`** (notas internas del profesional) de cada cita de cada clínica.

El riesgo no es un cruce puntual sino **agregación total de PII y notas clínicas de todas las clínicas en un único destino externo**.

**Severidad: BAJA en explotabilidad, ALTA en riesgo latente.** Alguien que "arregle" el trigger agregando el header activa la fuga de golpe. El arreglo se ve como una mejora y es un incidente.

### Veredicto

**CONFIRMADO:** configuración global sin aislamiento, sin configuración por tenant, sin OAuth.
**DESCARTADO como fuga activa:** la feature no funciona y nunca funcionó.
**Decisión desbloqueada:** nada depende de ella, nunca operó y nadie la reclamó. **La evidencia sostiene eliminarla.**

**No se modificó nada.**

---

## 12. API Security

### 12.1 Punto de partida — CONFIRMADO

`src/lib/rutas-publicas.ts:33-39` incluye `'/api/'` en `RUTAS_DE_SISTEMA`, y `esRutaPublica()` devuelve `true` para todo path que empiece así.

**Ninguna de las 36 rutas depende del middleware.** El modelo es *deny by default* en páginas y *allow by default* en API.

### 12.2 Inventario completo — 36 rutas

**SR** service_role · **CK** cliente cookies · **GU** `getUser()` · **TU** valida `tenant_users` · **ROL** valida rol · **RL** rate limit · **SEC** secreto

| Ruta | Métodos | SR | CK | GU | TU | ROL | RL | SEC | Público | Datos | Riesgo |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|---|
| `/api/admin/me` | GET | · | ✓ | ✓ | · | · | · | · | no | — | Bajo |
| `/api/admin/tenants` | GET,POST,PATCH | ✓ | ✓ | ✓ | ✓ | ✓¹ | · | · | no | Plataforma | Medio |
| `/api/billing/cancelar` | POST | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | no | **Pagos** | Bajo |
| `/api/billing/checkout` | POST | · | ✓ | ✓ | ✓ | · | · | · | no | **Pagos** | Bajo |
| `/api/citas-futuras` | GET | · | ✓ | ✓ | ·² | · | · | · | no | Clínica | Bajo |
| `/api/clinicas` | POST | ✓ | ✓ | ✓ | ✓ | · | · | · | no | Alta | Medio |
| `/api/confirmar-turno` | POST | ✓ | ✓ | ✓ | ✓ | · | · | · | no | Clínica | Medio |
| `/api/consentimientos` | GET,POST | · | ✓ | ✓ | ✓ | · | · | · | no | **Clínica** | Bajo |
| `/api/consentimientos/firmar/[token]` | GET,POST | ✓ | · | · | · | · | ✓ | · | **sí** | **Firma** | Medio |
| `/api/consentimientos/pdf/[id]` | GET | · | ✓ | ✓ | ·² | · | · | · | no | **Clínica** | Bajo |
| `/api/crm-campanas` | GET | ✓ | · | · | · | · | · | ✓ | **sí** | PII | Medio |
| `/api/cron` | GET | · | · | · | · | · | · | ✓ | **sí** | — | Medio |
| `/api/cuidados/enviar` | POST | · | ✓ | ✓ | ✓ | · | · | · | no | PII | Bajo |
| `/api/daily-briefing` | GET | ✓ | · | · | · | · | · | ✓ | **sí** | PII | Bajo |
| `/api/enlaces-turno` | POST | ✓ | ✓ | ✓ | ✓ | · | · | · | no | **Tokens** | Medio |
| `/api/equipo/invitar` | POST | ✓ | · | ✓ | ✓ | ✓ | · | · | no | Usuarios | Bajo |
| `/api/equipo/miembros` | GET,DELETE | ✓ | ✓ | ✓ | ✓ | ✓ | · | · | no | Usuarios | Bajo |
| `/api/facturacion/anular` | POST | · | ✓ | ✓ | ✓ | ✓ | · | · | no | **Fiscal** | Bajo |
| `/api/facturacion/config` | GET,POST | · | ✓ | ✓ | ✓ | ✓³ | · | · | no | **Fiscal** | Medio |
| `/api/facturacion/emitir` | POST | · | ✓ | ✓ | ✓ | **·** | · | · | no | **Fiscal** | **Alto** ⚠️ |
| `/api/facturacion/pdf/[id]` | GET | · | ✓ | ✓ | ·² | · | · | · | no | **Fiscal** | Bajo |
| `/api/horas-ocupadas` | GET | ✓ | · | · | · | · | ✓ | · | **sí** | Agenda | Bajo |
| **`/api/ics`** | GET | · | · | · | · | · | **·** | · | **sí** | Turno | **Medio** ⚠️ |
| `/api/paciente/[token]` | GET | ✓ | · | · | · | · | ✓ | · | **sí** | **Clínica** | Alto |
| `/api/paciente/[token]/estado` | PATCH | ✓ | · | · | · | · | ✓ | · | **sí** | Agenda | Medio ⚠️ |
| `/api/paciente/[token]/feedback` | POST | ✓ | · | · | · | · | ✓ | · | **sí** | — | Bajo |
| `/api/pacientes/exportar` | GET | · | ✓ | ✓ | ✓ | ✓ | · | · | no | **PII masiva** | Bajo |
| `/api/pacientes/importar` | POST | · | ✓ | ✓ | ✓ | · | · | · | no | **PII masiva** | Medio |
| `/api/recordatorios` | POST | ✓ | ✓ | ✓ | ✓ | · | · | · | no | PII | Medio |
| `/api/registro` | POST | ✓ | · | · | ✓ | · | ✓ | · | **sí** | Alta | Medio |
| `/api/reserva/[clinica]` | GET | ✓ | · | · | · | · | ✓ | · | **sí** | — | Bajo |
| `/api/reserva/crear` | POST | ✓ | · | · | · | · | ✓ | · | **sí** | PII | Medio |
| `/api/send-recordatorios` | POST | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | **sí**⁴ | PII | Medio |
| `/api/sync-sheet` | POST | ✓ | · | · | · | · | · | ✓ | **sí** | **PII** | **Alto** ⚠️ |
| `/api/webhooks/mercadopago` | POST | ✓ | · | · | · | · | · | ✓ | **sí** | **Pagos** | Bajo ✅ |
| `/api/webhooks/resend` | POST | ✓ | · | · | · | · | · | ✓ | **sí** | — | Bajo |

¹ `esAdminDePlataforma()`, no rol de tenant. ² Sin chequeo explícito: **se apoya en RLS**. ³ Solo en POST. ⁴ Con `CRON_SECRET`.

### 12.3 Detecciones específicas solicitadas

**Endpoints sin autenticación — CONFIRMADO: ninguno desprotegido.**
Las 12 accesibles sin sesión lo son por diseño: 4 con secreto compartido, 2 con firma criptográfica, 6 con token + rate limit. La excepción es `/api/ics` (abajo).

**Endpoints que confían en datos del frontend — CONFIRMADO: ninguno de forma insegura.**
Revisado punto por punto: en todos los casos donde el body aporta un identificador, el servidor revalida contra la base. El caso más relevante es `facturacion/emitir`, que **recalcula el monto desde la base** (`:117-119`) e ignora cualquier importe del body.

**Endpoints que reciben `tenant_id` del cliente — CONFIRMADO: 14, todos revalidados.**
`billing/cancelar`, `billing/checkout`, `clinicas`, `confirmar-turno`, `consentimientos`, `cuidados/enviar`, `enlaces-turno`, `equipo/invitar`, `equipo/miembros`, `facturacion/*` (4), `pacientes/exportar`, `pacientes/importar`, `recordatorios`, `send-recordatorios`.

**Todos verifican membresía contra `tenant_users` antes de operar.** El patrón —el cliente propone, el servidor dispone— es correcto. El defecto es que la verificación está **copiada a mano en 21 lugares** con variaciones (`.single()` vs `.maybeSingle()`, con y sin chequeo de rol, códigos de error distintos), y esa inconsistencia es el origen del problema de roles (§7).

**Endpoints que usan un tenant por defecto — CONFIRMADO: 4.**

| Archivo:línea | Fallback |
|---|---|
| `api/paciente/[token]/route.ts:71` | `pac.tenant_id \|\| NEXT_PUBLIC_DEFAULT_TENANT_ID \|\| ''` |
| `api/confirmar-turno/route.ts:42` | `tenantId \|\| NEXT_PUBLIC_DEFAULT_TENANT_ID \|\| ''` |
| `api/recordatorios/route.ts:42` | ídem |
| `api/send-recordatorios/route.ts:11,88` | **UUID de producción hardcodeado en el código fuente** |

### 12.4 Hallazgos

**H1 — `/api/ics` sin rate limit · CONFIRMADO · NUEVO**
Ni `api/ics/route.ts` ni `lib/turno-publico.ts` importan `rateLimit` (verificado con `grep`). Acepta `?c=<codigo>` o `?token=<token>&cita=<id>` y devuelve clínica, tratamiento, fecha/hora y **dirección del consultorio**. Es la **única** ruta pública por token sin límite: sus vecinas tienen 30/min, 5/h y 60/min. Las páginas `/t/[codigo]` y `/agendar/[token]/[cita]` tampoco limitan.
**Severidad BAJA-MEDIA:** el código corto tiene ~60 bits y el token 122, así que la enumeración no es viable. El riesgo es abuso de recursos: un endpoint sin tope que consulta la base en cada llamada.

**H2 — `facturacion/emitir` sin validación de rol · CONFIRMADO**
Única ruta fiscal sin chequeo. Contrasta con `anular` y `config` POST.

**H3 — `facturacion/config` GET expone datos fiscales a cualquier miembro · CONFIRMADO**
POST exige admin/owner (`:95-97`), GET solo membresía (`:28-30`), y devuelve `select('*')` de `arca_config`: CUIT, razón social, domicilio comercial, punto de venta, ingresos brutos. **Consistente con la policy RLS** (`arca_config_select` permite a todos los miembros), así que no es un bypass — es una decisión de producto a revisar.

**H4 — Las rutas que se apoyan en RLS lo hacen bien · DESCARTADO como vulnerabilidad**
`citas-futuras`, `consentimientos/pdf/[id]` y `facturacion/pdf/[id]` verifican sesión y consultan por `id` sin filtro de tenant explícito. **No es IDOR:** usan el cliente de cookies y las policies (`facturas_select`, `consentimientos_select`, `tenant_isolation_citas`) filtran en la base. Es el patrón correcto.

---

## 13. Sentry

### 13.1 Configuración — CONFIRMADO

Los tres archivos comparten exactamente la misma configuración:

| Archivo | `sendDefaultPii` | `tracesSampleRate` | `enableLogs` | `beforeSend` |
|---|---|---|---|---|
| `sentry.server.config.ts` | **`true`** | **`1`** | **`true`** | **ausente** |
| `sentry.edge.config.ts` | **`true`** | **`1`** | **`true`** | **ausente** |
| `src/instrumentation-client.ts` | **`true`** | **`1`** | **`true`** | **ausente** |

Proyecto: `andbrand-studio / javascript-nextjs` (`next.config.js:19-20`). DSN hardcodeado, región `us`.

### 13.2 `beforeSend` — CONFIRMADO: no existe
`grep -rn "beforeSend\|beforeSendTransaction\|beforeBreadcrumb" .` sobre los configs → **0 resultados**. **No hay ninguna sanitización.**

### 13.3 URLs — CONFIRMADO: contienen secretos
```
/paciente/<token>                     → historia clínica completa
/api/paciente/<token>                 → idem
/api/paciente/<token>/estado          → PATCH de estado
/api/paciente/<token>/feedback
/firmar/<token>  ·  /api/consentimientos/firmar/<token>
/t/<codigo>  ·  /agendar/<token>/<cita>  ·  /api/ics?token=…&cita=…
/api/send-recordatorios?token=<CRON_SECRET>   ← generada en api/cron/route.ts:31
/api/cron?token=<CRON_SECRET>
/api/crm-campanas?token=<CRON_SECRET>
```

### 13.4 Cookies y headers — INFERIDO
`sendDefaultPii: true` hace que el SDK adjunte headers de request (incluida `cookie`) e IP. **Deducido de la documentación del SDK, no observado.**
La cookie relevante sería `sb-lbaqbhpjjhhzplijxilp-auth-token`: **una sesión activa de un usuario de la clínica**, más grave que un token de portal.

### 13.5 Sampling — CONFIRMADO
`tracesSampleRate: 1` = **el 100 % de las transacciones** genera un evento con su URL. No es el caso de error ocasional: es cada request.

### 13.6 Información sensible en el `<head>` — CONFIRMADO
`src/app/layout.tsx:29` inyecta `...Sentry.getTraceData()` en el `<head>` de **todas** las páginas, incluido el portal público del paciente.

### 13.7 ¿Hay tokens o PII en los eventos?

**NO VERIFICADO — requiere revisión en Sentry.**

No tengo acceso al panel y **no voy a estimar volúmenes ni afirmar qué contienen los eventos.**

Checklist para ejecutar manualmente (`andbrand-studio / javascript-nextjs`), **solo lectura — no borrar nada antes de medir**:

| # | Verificación | Dónde | Qué registrar |
|---|---|---|---|
| V1 | Tokens en URLs | Discover: `url:*/paciente/*`, `url:*/firmar/*`, `url:*token=*` | Cantidad, rango de fechas, y **si el segmento aparece resuelto (UUID) o normalizado (`[token]`)**. Next suele normalizar `transaction` pero **no** `request.url`: revisar ambos |
| V2 | Cookies | Abrir 3-5 eventos → Request → Headers | Presencia de `cookie` y de `sb-lbaqbhpjjhhzplijxilp-auth-token` |
| V3 | IP | Cualquier evento → User → IP Address | Si está poblado |
| V4 | Tipos de evento | Segmentar `error` / `transaction` / `log` | El volumen mayor será `transaction` |
| V5 | Volumen y retención | Settings → Subscription y Security & Privacy | Eventos aceptados, período de retención, si **Data Scrubbing** ya está activo |
| V6 | `CRON_SECRET` expuesto | Buscar `send-recordatorios` y `crm-campanas` | Si aparece `?token=`, **el secreto está en Sentry y debe rotarse** |
| V7 | Alcance de acceso | Settings → Members | Quiénes pueden ver estos eventos |

### Veredicto

**CONFIRMADO:** la configuración que produce el problema, en los tres entornos, sin ninguna sanitización.
**INFERIDO:** que los tokens de pacientes están hoy en Sentry.
**NO VERIFICADO:** el contenido y el volumen reales.

**El fix de configuración no depende de esta verificación** y debe hacerse igual. Lo que sí depende es la **remediación de lo ya ocurrido**: purga de eventos y rotación de secretos. El fix corta la hemorragia; la verificación dice cuánta sangre se perdió.

**No se modificó la configuración.**

---

## 14. Dependencies

### 14.1 Versiones — CONFIRMADO

| Paquete | Declarado | Instalado | Notas |
|---|---|---|---|
| `next` | `14.2.29` | **14.2.29** | Fijado sin `^` |
| `react` | `^18.2.0` | **18.3.1** | |
| `react-dom` | `^18.2.0` | **18.3.1** | |
| `xlsx` | `^0.18.5` | **0.18.5** | Última publicada en npm |
| `@supabase/supabase-js` | `^2.39.0` | **2.103.0** | |
| `@supabase/ssr` | `^0.10.2` | **0.10.2** | En uso |
| `@supabase/auth-helpers-nextjs` | `^0.15.0` | **0.15.0** | **Sin uso — 0 referencias en `src/`** |
| `@afipsdk/afip.js` | `^1.2.3` | **1.2.3** | |
| `@sentry/nextjs` | `^10.49.0` | **10.49.0** | |
| `resend` | `^6.9.4` | **6.9.4** | |
| `googleapis` | `^171.4.0` | **171.4.0** | |
| `pdf-lib` | `^1.17.1` | **1.17.1** | |
| `recharts` | `^3.8.1` | **3.8.1** | |
| `svix` | `^1.92.2` | **1.92.2** | |
| `vitest` | `^2.1.9` | **2.1.9** | devDependency |

**MercadoPago: no hay SDK.** Se usa `fetch` directo contra `api.mercadopago.com`. **Es una decisión acertada**: menos superficie de dependencia en el camino de pagos.

`npm audit`: 22 vulnerabilidades (1 crítica, 7 altas, 13 moderadas, 1 baja). El número bruto no es la señal.

### 14.2 Vulnerabilidad real y aplicable

**`next@14.2.29` — actualizar a la última 14.2.x. P1.**
De ~27 advisories en rango, los que aplican a esta app:

| Advisory | Aplica | Por qué |
|---|---|---|
| `GHSA-3g8h-86w9-wvmq` — cache poisoning en redirects de middleware | **Sí** | `middleware.ts:17-22` hace un redirect 308 |
| `GHSA-m99w-x7hq-7vfj` — DoS vía Server Actions | **Sí** | Hay 2 server actions |
| `GHSA-955p-x3mx-jcvp` — exposición de endpoints internos de Server Functions | **Sí** | Ídem |
| `GHSA-ffhc-5mcf-pf4q` — XSS con nonces CSP | Solo si se implementa CSP | No hay CSP hoy |

**No aplican:** todos los de Image Optimization (`next/image` no se usa — el proyecto usa `<img>` directo), i18n (no configurado), custom server (Vercel), rewrites (`next.config.js` no define ninguno).

### 14.3 Riesgo potencial con contexto limitante

**`xlsx@0.18.5` — P3, no P0.**
`GHSA-4r6h-8v6p-xvw6` (prototype pollution) y `GHSA-5pgg-2g8v-p4x9` (ReDoS). **Sin fix upstream.** Contexto real:
- **Lectura** (`XLSX.read`) ocurre **solo en el navegador**, sobre un archivo que el propio usuario eligió (`ImportarPacientesModal.tsx:46-49`). El vector exige que el usuario abra un archivo malicioso, y el daño queda en su pestaña.
- **En el servidor solo escribe** (`api/pacientes/exportar/route.ts:3`). No parsea entrada no confiable.

No es una alta explotable en este código. Migrar a `exceljs` si se quiere cerrar, sin urgencia.

**`@sentry/nextjs`, `resend`→`svix`** — transitivas (OpenTelemetry, `uuid`), DoS/memoria. Impacto bajo. **P3.**

### 14.4 Falso positivo en este contexto

**`vitest` (crítica, `GHSA-5xrq-8626-4rwp`)** — el advisory dice *"When Vitest UI server is listening"*. El proyecto corre `vitest run` (`package.json`), nunca `--ui`. Es devDependency y no llega a producción. **Ignorar.** No inflar la métrica con esto.

**`ws` (alta)** — transitiva de tooling de desarrollo, fuera del runtime de producción. **P3.**

### 14.5 Dependencia innecesaria

**`@supabase/auth-helpers-nextjs@0.15.0`** — declarada y **sin uso** (`grep -rn "auth-helpers" src/` → 0 resultados). Deprecada en favor de `@supabase/ssr`, que es lo que el código usa. **Eliminar. P3, 5 minutos.**

### 14.6 Incompatibilidades

**Ninguna detectada.** El proyecto compila (`npm run typecheck` en CI) y los tests pasan. `next@14.2.x` es compatible con React 18.3. `@supabase/ssr@0.10` es la vía recomendada actual.

**No se actualizó nada.**

---

## 15. Confirmed P0 Issues

Hallazgos con **evidencia directa**, listos para implementar sin verificación adicional.

| ID | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| **C-01** | Sentry con `sendDefaultPii: true`, `tracesSampleRate: 1`, `enableLogs: true` y **sin `beforeSend`** en los 3 entornos | `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` | **CRÍTICA** |
| **C-02** | Los tokens del portal **nunca expiran**: 8 puntos de generación, 0 escrituras de `token_expira` | `grep` → 0 resultados; `security_fix.sql:50-58` | **CRÍTICA** |
| **C-03** | **3 de 4** endpoints del portal no validan expiración, y el principal tiene un camino que la saltea | `paciente/[token]/route.ts:41-61`; `/estado`; `/feedback`; `/firmar` | **CRÍTICA** |
| **C-04** | **6 vistas BI** sin `security_invoker`, sin `tenant_id`, con `GRANT TO anon` | `remote_schema.sql:508-614, 1672-1710` | **CRÍTICA** |
| **C-05** | **6 tablas** con `tenant_id DEFAULT` a una clínica real | `remote_schema.sql:496,589,669,748,777,947` | **CRÍTICA** |
| **C-06** | **4 tablas** admiten `tenant_id` NULL → filas invisibles bajo RLS | `costos_fijos`, `ingresos_manuales`, `meta_mensual`, `feedback_post_visita` | **ALTA** |
| **C-07** | `sync_turno_to_cita` sin filtro de tenant, `SECURITY DEFINER` | `remote_schema.sql:419-465, 1201` | **ALTA** |
| **C-08** | ARCA: sin locking, sin timeout, sin idempotencia, CAE persistido **después** de emitir | `facturacion/emitir/route.ts:309,366,384,406-414` | **CRÍTICA** |
| **C-09** | Doble click en facturación no protegido (chequeo aplicativo, no constraint) | `facturacion/emitir/route.ts:96-110` | **ALTA** |
| **C-10** | 20 tablas sin filtro de rol en RLS; `staff` = `owner` a nivel de datos | `perf_2_rls.sql`, `remote_schema.sql:1436-1570` | **CRÍTICA** |
| **C-11** | `facturacion/emitir` sin validación de rol | `route.ts:72-80` | **ALTA** |
| **C-12** | `tenant_users.role` sin `CHECK`, `DEFAULT 'admin'` | `remote_schema.sql:865` | **MEDIA** |
| **C-13** | Google Sheets global, sin config por tenant — **y la feature no funciona** | `sync-sheet/route.ts:57,66,76`; `remote_schema.sql:1197` | **MEDIA** |
| **C-14** | `CRON_SECRET` viaja en query string | `api/cron/route.ts:31`; `crm-campanas:22-24` | **ALTA** |
| **C-15** | 4 fallbacks a tenant por defecto, uno con UUID hardcodeado | `paciente/[token]:71`, `confirmar-turno:42`, `recordatorios:42`, `send-recordatorios:11,88` | **ALTA** |
| **C-16** | `paciente/[token]/estado` no valida fecha ni estado de la cita | `route.ts:45-56` | **ALTA** |
| **C-17** | `/api/ics` sin rate limit — única ruta pública por token sin límite · **NUEVO** | `api/ics/route.ts`, `lib/turno-publico.ts` | **MEDIA** |
| **C-18** | Token del portal en claro y enviado al navegador en el listado | `pacientes/page.tsx:50` | **ALTA** |

**18 hallazgos confirmados. Ninguno requiere verificación previa para implementarse.**

---

## 16. Unverified Issues

Requieren acceso a producción. **No condicionan el *qué*, solo el *cómo*.**

### 16.1 Consultas SQL — solo lectura

```sql
-- ═══ U-01 · LA CONSULTA DECISIVA: citas adheridas a un paciente de otra clínica ═══
SELECT c.id AS cita_id, c.tenant_id AS tenant_cita,
       p.id AS paciente_id, p.tenant_id AS tenant_paciente, c.creado_en
FROM citas c JOIN pacientes p ON p.id = c.paciente_id
WHERE c.tenant_id <> p.tenant_id ORDER BY c.creado_en DESC;

-- ═══ U-02 · Tablas hijas inconsistentes ═══
SELECT 'historial_dental' AS tabla, count(*) FROM historial_dental h
  JOIN pacientes p ON p.id = h.paciente_id WHERE h.tenant_id <> p.tenant_id
UNION ALL SELECT 'paciente_fotos', count(*) FROM paciente_fotos f
  JOIN pacientes p ON p.id = f.paciente_id WHERE f.tenant_id <> p.tenant_id
UNION ALL SELECT 'tratamiento_items', count(*) FROM tratamiento_items ti
  JOIN citas c ON c.id = ti.cita_id WHERE ti.tenant_id <> c.tenant_id
UNION ALL SELECT 'pagos', count(*) FROM pagos pg
  JOIN citas c ON c.id = pg.cita_id WHERE pg.tenant_id <> c.tenant_id
UNION ALL SELECT 'facturas', count(*) FROM facturas f
  JOIN citas c ON c.id = f.cita_id WHERE f.cita_id IS NOT NULL AND f.tenant_id <> c.tenant_id;

-- ═══ U-03 · NULLs en las 4 tablas nullable (datos invisibles) ═══
SELECT 'costos_fijos' AS tabla, count(*) FROM costos_fijos WHERE tenant_id IS NULL
UNION ALL SELECT 'ingresos_manuales',    count(*) FROM ingresos_manuales    WHERE tenant_id IS NULL
UNION ALL SELECT 'meta_mensual',         count(*) FROM meta_mensual         WHERE tenant_id IS NULL
UNION ALL SELECT 'feedback_post_visita', count(*) FROM feedback_post_visita WHERE tenant_id IS NULL;

-- ═══ U-04 · Emails duplicados dentro de una misma clínica (bloquea el UNIQUE) ═══
SELECT tenant_id, left(md5(lower(trim(email))),8) AS email_hash,
       count(*) AS repeticiones, array_agg(id) AS paciente_ids
FROM pacientes WHERE email IS NOT NULL AND trim(email) <> ''
GROUP BY tenant_id, lower(trim(email)) HAVING count(*) > 1;

-- ═══ U-05 · Huella del trigger ═══
SELECT p.id, p.tenant_id, p.creado_en, left(md5(lower(trim(p.email))),8) AS email_hash
FROM pacientes p
WHERE p.tenant_id = '2845c423-affa-4ca2-9c5f-f4ec8e35701a' AND p.email IS NOT NULL
  AND EXISTS (SELECT 1 FROM turnos t
              WHERE lower(trim(t.email)) = lower(trim(p.email)) AND t.tenant_id <> p.tenant_id);

-- ═══ U-06 · ¿El trigger sigue instalado? ═══
SELECT c.relname AS tabla, t.tgname AS trigger, p.proname AS funcion, t.tgenabled
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace ORDER BY c.relname;

-- ═══ U-07 · ¿turnos recibió escrituras alguna vez? ═══
SELECT count(*) AS total, min(created_at) AS primero, max(created_at) AS ultimo,
       count(*) FILTER (WHERE created_at > now() - interval '90 days') AS ultimos_90d,
       count(DISTINCT tenant_id) AS clinicas
FROM turnos;

-- ═══ U-08 · Roles reales ═══
SELECT role, count(*) AS usuarios, count(DISTINCT tenant_id) AS clinicas
FROM tenant_users GROUP BY role ORDER BY count(*) DESC;

-- ═══ U-09 · Facturación: las seis verificaciones ═══
SELECT id, tenant_id, punto_venta, nro_comprobante, simulada FROM facturas
  WHERE estado='emitida' AND (cae IS NULL OR trim(cae)='');            -- sin CAE

SELECT cae, count(*), array_agg(id) FROM facturas
  WHERE simulada=false AND cae IS NOT NULL AND trim(cae)<>''
  GROUP BY cae HAVING count(*)>1;                                       -- CAE duplicado

SELECT cita_id, tenant_id, count(*), array_agg(id) FROM facturas
  WHERE cita_id IS NOT NULL AND estado <> 'anulada' AND tipo_comprobante NOT IN (3,8,13)
  GROUP BY cita_id, tenant_id HAVING count(*)>1;                        -- cita con 2+ facturas

SELECT tenant_id, punto_venta, tipo_comprobante, nro_comprobante, count(*), array_agg(id)
  FROM facturas WHERE simulada=false AND estado='emitida'
  GROUP BY 1,2,3,4 HAVING count(*)>1;                                   -- numeración duplicada

SELECT estado, simulada, count(*), min(creada_en), max(creada_en)
  FROM facturas GROUP BY estado, simulada;                              -- panorama

WITH s AS (SELECT tenant_id, punto_venta, tipo_comprobante, nro_comprobante,
    nro_comprobante - lag(nro_comprobante) OVER (
      PARTITION BY tenant_id, punto_venta, tipo_comprobante ORDER BY nro_comprobante) AS salto
  FROM facturas WHERE simulada=false AND estado='emitida')
SELECT * FROM s WHERE salto > 1 ORDER BY salto DESC;                    -- saltos = posibles pérdidas

-- ═══ U-10 · Tokens sin expiración ═══
SELECT count(*) FILTER (WHERE token IS NOT NULL) AS con_token,
       count(*) FILTER (WHERE token IS NOT NULL AND token_expira IS NULL) AS sin_expiracion
FROM pacientes;

-- ═══ U-11 · Confirmar el estado real de las vistas BI ═══
SELECT c.relname AS vista,
       COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                 WHERE option_name='security_invoker'), 'off') AS security_invoker,
       has_table_privilege('anon', c.oid, 'SELECT')          AS anon_lee,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_lee
FROM pg_class c
WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('v','m') ORDER BY c.relname;

-- ═══ U-12 · Defaults reales en la base (contrastar con el repo) ═══
SELECT table_name, column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND column_name='tenant_id'
ORDER BY (column_default IS NOT NULL) DESC, table_name;
```

### 16.2 Verificaciones fuera de SQL

| ID | Qué | Cómo | Tiempo |
|---|---|---|---|
| **U-13** | ¿Las vistas BI responden sin autenticar? | `curl ".../rest/v1/bi_ingresos_por_mes?select=*" -H "apikey: <ANON_KEY>"` | 5 min |
| **U-14** | ¿Hay tokens/PII en Sentry? | Checklist V1-V7 (§13.7) | 30 min |
| **U-15** | ¿Hay procesos fuera del repo que inserten sin `tenant_id`? | Revisar Edge Functions, Database Webhooks y snippets del SQL Editor | 15 min |

### 16.3 Qué bloquea cada uno

| Verificación | Bloquea |
|---|---|
| **U-01, U-02** | FK compuestas · **y define si esto es un plan o un incidente** |
| U-03 | `SET NOT NULL` en las 4 tablas nullable |
| U-04 | `UNIQUE (tenant_id, lower(trim(email)))` |
| U-06, U-07 | `DROP TRIGGER` (no la corrección de la función) |
| U-08 | `CHECK` en `tenant_users.role` · dimensiona el riesgo de la fase de roles |
| U-09 | Migración de estados de `facturas` y constraints de idempotencia |
| U-13 | Prioridad de C-04 (no su existencia) |
| U-14 | Purga de eventos y rotación de secretos (no el fix de config) |

---

## 17. Issues That Do NOT Require Immediate Action

### 17.1 DESCARTADOS — señalados antes, verificación negativa

| Hallazgo | Por qué se descarta |
|---|---|
| **`bi_rentabilidad` y `bi_resumen_financiero` expuestas** | **No existen.** 0 coincidencias en todo el repositorio |
| **Tokens de paciente duplicados** | `pacientes_token_key UNIQUE (token)` (`remote_schema.sql:1054`) lo hace imposible. `token_firma` también es UNIQUE |
| **Tokens vencidos aún utilizables** | Imposible por construcción: si `token_expira` está poblado y venció, se devuelve 410. El problema es el inverso |
| **`tenant_id` NULL en `pacientes`/`citas`/`turnos`** | `NOT NULL` en las tres |
| **`anon` puede insertar en `turnos`** | RLS activo y ninguna policy alcanza a `anon`. El `GRANT ALL TO anon` es ruido heredado |
| **IDOR en `facturacion/pdf/[id]` y `consentimientos/pdf/[id]`** | Usan el cliente de cookies; RLS filtra por tenant. Es el patrón correcto |
| **Webhook de MercadoPago sin idempotencia** | Reconsulta el estado real a MP en cada ejecución ⇒ converge. No es idempotencia por clave, pero es funcionalmente equivalente |
| **Fuga activa por Google Sheets** | La feature **no funciona**: el trigger no manda el header que la ruta exige. 401 en cada invocación |
| **`vitest` crítica** | Solo aplica al UI server (`--ui`), que no se usa. devDependency |
| **`xlsx` alta explotable** | Solo parsea en el navegador, sobre archivos que el propio usuario elige. En servidor solo escribe |
| **El rol "Odontólogo" tiene permisos mal configurados** | El rol **no existe**. Es una decisión de producto, no un bug |
| **Endpoints API desprotegidos** | Las 36 rutas se autentican solas. Ninguna queda abierta por descuido |

### 17.2 Confirmados pero NO urgentes

| Hallazgo | Por qué puede esperar |
|---|---|
| `@supabase/auth-helpers-nextjs` sin uso | Higiene. 5 minutos, cuando toque |
| `xlsx`, `@sentry/nextjs`, `resend`→`svix` | Sin explotabilidad real en este código. P3 |
| `facturacion/config` GET expone datos fiscales a miembros | Consistente con la policy RLS. Decisión de producto, no bypass |
| `admin/tenants` sin auditoría | Riesgo interno acotado; requiere ser admin de plataforma |
| Falta de headers HTTP (CSP, HSTS, `Referrer-Policy`) | Real, pero el `Referer` está mitigado por el default de los navegadores (`strict-origin-when-cross-origin`). P1, no P0 |
| Rate limit en memoria | Solo importa en `/api/reserva/crear`. P1 |
| Componentes de 2.000 líneas, sin paginación, 35 `select('*')` | Performance y mantenibilidad. **Ninguno pone datos en riesgo** salvo `pacientes/page.tsx:50`, ya en C-18 |

### 17.3 Lo que funciona bien — no tocar

Verificado en esta sesión y confirmado:

1. **`lib/pagos.ts`** — aritmética en centavos, IVA por diferencia, 763 líneas de test.
2. **Firma de MercadoPago** — HMAC correcto, `timingSafeEqual`, reconsulta a la API. **La mejor integración del sistema.**
3. **`emitir_factura_con_detalle`** — atomicidad local correcta, revalida tenant dentro del `SECURITY DEFINER`. El problema de ARCA está *afuera*.
4. **Storage de fotos** — bucket privado, URLs firmadas a 1 h, policies por carpeta = `tenant_id`.
5. **`/t/[codigo]` y `lib/turno-publico.ts`** — 12 caracteres base32 de `gen_random_uuid()`, no expone el token del paciente, metadata sin datos de salud, server action sin JS.
6. **`lib/rutas-publicas.ts`** — lista única, comparación por segmento.
7. **`equipo/miembros:26-40`** — el patrón correcto de validación previa al cliente admin.
8. **Singleton de `lib/supabase/client.ts`** — la condición `typeof window === 'undefined'` evita filtrar sesión entre usuarios en SSR.
9. **`guardas-multitenant.test.ts` y `tenant-isolation.test.ts`** — tests que leen el código fuente y que montan PGlite con `SET ROLE authenticated`. Extender, no reemplazar.

---

## 18. Recommended Implementation Order

### Respuesta a la pregunta de fondo

**Sí, se puede empezar a implementar.**

De los 18 hallazgos confirmados, **ninguno necesita verificación previa**. Lo que falta verificar no cambia *qué* hay que arreglar; cambia *cómo* se aplican tres migraciones de esquema y define si hay un incidente de datos que atender antes.

### Paso 0 — Tres verificaciones, ~1 hora (recomendado, no bloqueante)

| # | Qué | Tiempo | Por qué antes |
|---|---|---|---|
| 1 | Ejecutar U-01 y U-02 | 10 min | **Define si esto es un plan o un incidente.** Es la única verificación con poder de cambiar el orden |
| 2 | `curl` a `bi_ingresos_por_mes` (U-13) | 5 min | Convierte C-04 de INFERIDO a CONFIRMADO o DESCARTADO |
| 3 | Checklist de Sentry V1-V7 (U-14) | 30 min | **Medir antes de purgar.** Si V6 muestra `CRON_SECRET`, rotarlo es urgente |

**Bifurcación:** si U-01 devuelve filas, **detener el plan**. Es un incidente de integridad de datos clínicos: cuantificar, revisar caso por caso con la clínica, y evaluar si corresponde notificar. El refactor puede esperar; eso no.

### Fase 1 — Contención, ~5 horas · sin dependencias

Todo reversible, sin migración de datos, sin decisión de producto.

| # | Acción | Cubre |
|---|---|---|
| 1 | `sendDefaultPii: false`, `tracesSampleRate: 0.1`, `enableLogs: false` en los 3 configs | C-01 |
| 2 | `REVOKE ALL ON bi_* FROM anon, authenticated` | C-04 |
| 3 | `DROP TRIGGER sync_turnos_to_sheets ON citas` | C-13 |
| 4 | `CRON_SECRET` al header en `api/cron:31` y `crm-campanas:22-24` | C-14 |
| 5 | Exigir admin/owner en `facturacion/emitir` | C-11 |
| 6 | Validar fecha y estado en `paciente/[token]/estado` | C-16 |
| 7 | Rate limit en `/api/ics` | C-17 |

**Los puntos 1 y 2 son quince minutos y cierran las dos exposiciones de datos más graves.** Si el trabajo se interrumpiera acá, el sistema ya estaría materialmente mejor.

### Fase 2 — Fundaciones, 3-5 días · requiere U-01, U-03, U-04, U-08

| # | Acción | Cubre | Requiere |
|---|---|---|---|
| 1 | Corregir `sync_turno_to_cita` (tenant + `pg_temp`) | C-07 | — |
| 2 | `DROP DEFAULT` en las 6 tablas | C-05 | — |
| 3 | `SET NOT NULL` en las 4 nullable | C-06 | U-03 |
| 4 | FK compuestas tenant-scoped | C-07 | **U-01, U-02** |
| 5 | `CHECK` en `role` + default a `'staff'` | C-12 | U-08 |
| 6 | `src/lib/sentry-scrub.ts` con tests | C-01 | — |
| 7 | `src/lib/autorizacion.ts` + migrar 21 rutas | C-10 | — |
| 8 | Eliminar los 4 fallbacks a tenant por defecto | C-15 | — |

El punto 7 es **prerequisito de la fase de roles**: sin helper único, cerrar permisos significa editar 21 archivos a mano.

### Fase 3 — Tokens, 3-4 días · requiere U-10

Helper único → columna hash → backfill → lookup con fallback → 8 call sites → renovación en recordatorios → expiración en las **cuatro** rutas del portal (no solo la principal) → eliminar el bypass de `route.ts:41-61`. Retirar la columna en claro en un **deploy posterior**.

Cubre C-02, C-03, C-18.

### Fase 4 — Roles, 7-10 días · requiere decisión de producto + U-08

1. Decidir las 4 celdas abiertas de la matriz.
2. **Fase de observación:** policies nuevas en modo permisivo con logging, 5-7 días sobre la clínica real.
3. Analizar el log antes de denegar.
4. Denegar por tandas: primero finanzas, después historia clínica.

Cubre C-10. **Es la fase más lenta y la menos técnica**: el cuello de botella es la conversación con el cliente.

### Fase 5 — ARCA, 10-15 días · en paralelo a la 4 · requiere U-09

Estados y constraints → funciones `SECURITY DEFINER` → refactor de `emitir` → reconciliador → suite de los 7 casos → homologación → producción.

Cubre C-08, C-09. **El cambio de mayor riesgo del plan.** No desplegar sin la suite completa en verde.

### Fase 6 — Google Sheets · opcional

La Fase 1 ya la neutralizó. Si se elimina definitivamente, esta fase no existe. **La evidencia sostiene eliminar.**

### Diagrama

```
Paso 0 (1 h) ──┬── U-01 = 0 ──> Fase 1 (5 h) ──> Fase 2 (3-5 d) ──┬──> Fase 3 (3-4 d)
               │                                                   ├──> Fase 4 (7-10 d) [DECISIÓN]
               │                                                   └──> Fase 5 (10-15 d) [paralelo a 4]
               │                                                          └──> Fase 6 (opcional)
               └── U-01 > 0 ──> INCIDENTE: cuantificar y resolver primero
```

### Criterio de arranque

| Condición | Acción |
|---|---|
| U-01 = 0 | Fase 1 hoy mismo. No hay nada que esperar |
| U-01 > 0 | Fase 1 igual (no depende de datos), pero la Fase 2 espera a resolver el incidente |
| Sin acceso a la base todavía | **Fase 1 igual.** Ninguno de sus 7 puntos toca datos |

**La Fase 1 no está bloqueada por nada.** Son cinco horas y cierran las exposiciones más graves.

---

*Diagnóstico de solo lectura. No se modificó ningún archivo del proyecto, no se crearon migraciones, no se ejecutó ninguna sentencia de escritura, no se alteraron variables de entorno, no hubo deploys y no se implementó ninguna corrección. Las consultas del §16 son exclusivamente `SELECT` y **no fueron ejecutadas**: el entorno no tiene conectividad de red. Los valores de `.env.local` no fueron leídos ni utilizados.*

**Esperando instrucciones para comenzar la implementación.**
