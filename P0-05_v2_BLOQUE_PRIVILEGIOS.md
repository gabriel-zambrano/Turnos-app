# P0-05 v2 · Bloque de privilegios — B1.1 + B1.6

**Fecha:** 15/08/2026
**Estado:** 🟠 **DISEÑO. No implementado. Requiere tu autorización explícita.**

> **Por qué este bloque se puede diseñar ahora:** no depende de ninguna decisión abierta.
> DO-1 solo afecta `TABLES FROM authenticated`, que queda **fuera** por recomendación.
> DO-9 quedó verificado. DO-4 a DO-8 no tocan privilegios.
>
> **Lo que sigue bloqueado:** B1.2/B1.3 *(DO-2, DO-3, DO-4)* · B1.4 *(DO-5)* · B1.5b *(DO-6)* · R-2 *(DO-7)*

---

## 1 · Qué resuelve

| Hallazgo | Evidencia de producción | Estado |
|---|---|---|
| **R-1** | **34 de 35 tablas** con `anon=arwdDxtm` — N-1 | Abierto |
| **R-11** | `emitir_factura_con_detalle` con `anon=X` — N-2 | Abierto |
| **R-5** | `generar_codigo_enlace` ejecutable por `anon`, INVOKER — N-2 | Abierto *(bajo)* |
| **Default privileges** | **Dos `defaclrole`: `postgres` y `supabase_admin`** — A-2.6 | Abierto |
| **`storage`** | Mismo patrón, ningún objeto propio de `postgres` — DO-9 | Abierto |

**Fuera de alcance:** `force_rls` (R-9) · `search_path` (R-12) · `authenticated` sobre tablas (DO-1) · esquemas de plataforma.

---

## 2 · Verificación de seguridad funcional — hecha

**La pregunta que decide todo: ¿qué necesita leer `anon`?**

Recorrí las 11 rutas públicas de `RUTAS_PUBLICAS` (`/paciente`, `/t`, `/agendar`, `/reserva`, `/firmar`, `/legal`, `/precios`, `/login`, `/registro`, `/auth`, `/recuperar-password`).

**Ninguna consulta una tabla directamente.** Cero coincidencias de `.from('…')` fuera de `/api/`. Todo el portal público pasa por rutas de API con `service_role`.

**La única excepción es `TenantContext`**, que se monta en todas las rutas:

```ts
const { data: { session } } = await supabase.auth.getSession()   // :82
if (session?.user) {
  … .from('tenant_users') …    // :92   ← requiere sesión
  … .from('tenants') …         // :117  ← requiere sesión
  … .from('tenants') …         // :139  ← requiere sesión
}
if (!tenantData) {
  … .from('tenants_public') …  // :154  ← ÚNICA consulta sin sesión
}
```

Las tres primeras están dentro de `if (session?.user)`. **Solo la línea 154 corre como `anon`.**

### Conclusión

> **`anon` necesita exactamente un objeto en todo el esquema: `SELECT` sobre `tenants_public`.**

Y eso es precisamente lo que quedó tras la mitigación de R-10 (entrada 006). **Revocar `anon` del resto no tiene impacto funcional verificable.**

Los demás componentes que consultan tablas desde el navegador —`ChecklistBienvenida`, `CommandPalette`, `DetalleCitaCobro`, `AvisoPedidosOnline`, `NuevaCitaModal`— viven dentro del panel autenticado y corren como `authenticated`, que **no se toca**.

---

## 3 · Precondición dura — puede hacer fallar B1.1

`ALTER DEFAULT PRIVILEGES FOR ROLE X` **solo se puede ejecutar si sos X o miembro de X.**

El SQL Editor corre como `postgres`. Los seis statements de `supabase_admin` requieren que `postgres` sea miembro de `supabase_admin` — **y en Supabase habitualmente no lo es**, porque `supabase_admin` está por encima.

**Si no lo es, la mitad de B1.1 no se puede aplicar** y hay que decidir otro camino.

**Verificar ANTES de escribir la migración:**

```sql
SELECT pg_has_role('postgres', 'supabase_admin', 'MEMBER') AS postgres_es_miembro_de_supabase_admin,
       current_user                                        AS usuario_del_editor,
       pg_has_role(current_user, 'supabase_admin', 'MEMBER') AS editor_es_miembro;
```

### RESUELTO — verificado en producción

```
postgres_es_miembro   = false
usuario_del_editor    = postgres
editor_es_miembro     = false
```

**`postgres` NO es miembro de `supabase_admin`.** Los cuatro statements de ese rol **fallarían** con `must be member of role`. **Salen del diseño.**

### Cuánto importa — también verificado

Un default privilege `FOR ROLE X` solo aplica a objetos **creados por X**. La pregunta es quién crea objetos en `public`:

| owner | tablas | vistas | matviews | funciones |
|---|---:|---:|---:|---:|
| **`postgres`** | **35** | **7** | **1** | **14** |
| `supabase_admin` | 0 | 0 | 0 | 0 |

**Los 43 objetos y las 14 funciones son de `postgres`. Ninguno de `supabase_admin`.**

En toda la vida del proyecto, `supabase_admin` **nunca creó nada en `public`**. Su entrada en `pg_default_acl` es residuo del bootstrap del proyecto, no un camino de creación activo.

Y las dos vías por las que creamos objetos terminan en `postgres`: las migraciones por CLI y el SQL Editor — confirmado arriba, `current_user = postgres`.

### Conclusión

> **Revocar `FOR ROLE postgres` cubre el 100% de los objetos que este proyecto crea.**

**Riesgo residual, honesto:** si algún día la plataforma crease algo en `public` como `supabase_admin`, nacería concedido a `anon` y no podríamos evitarlo desde acá. No hay evidencia de que eso haya pasado nunca. **La guarda G-1 de B1.7 y la consulta N-1 corrida periódicamente son la defensa contra ese caso.**

**No es un bloqueante.** B1.1 sigue adelante con 8 statements en vez de 12.

---

## 4 · B1.6 · Revocar `anon` de los objetos existentes

**Va primero.** Cierra el agujero actual; B1.1 evita que vuelva.

```sql
BEGIN;

-- Un solo statement en vez de 34: N-1 enumeró los 43 objetos de public,
-- así que el alcance es conocido y no hay sorpresas.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Lo único que anon necesita en todo el esquema.
-- Verificado: TenantContext.tsx:154 es la única consulta sin sesión.
GRANT SELECT ON TABLE public.tenants_public TO anon;

-- R-11: el REVOKE FROM PUBLIC de la migración original no borró
-- el grant explícito que el default privilege le había dado a anon.
REVOKE ALL ON FUNCTION public.emitir_factura_con_detalle(
    uuid, uuid, uuid, integer, integer, integer, text, date, numeric,
    text, text, text, text, text, boolean, jsonb, jsonb
) FROM anon;

-- R-5: INVOKER, no toca tablas. Higiene, no vulnerabilidad.
-- Su única llamada es interna, desde emitir_enlace_turno (DEFINER).
REVOKE ALL ON FUNCTION public.generar_codigo_enlace() FROM PUBLIC, anon;

-- Funciones de trigger: devuelven `trigger`, no son invocables desde SQL
-- normal ni PostgREST las expone. Higiene.
REVOKE ALL ON FUNCTION public.sembrar_renglon_cita() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_cobrado_cita()    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_valor_cita()      FROM PUBLIC, anon;

COMMIT;
```

### Por qué `ON ALL TABLES` y no 34 nombres

**A favor:** un statement, sin riesgo de olvidar una tabla, y alcanza también a las vistas `bi_*` y a `bi_resumen` — que ya están limpias, así que es idempotente ahí.

**El riesgo de este atajo** —revocar de algo que no conocíamos— **está cubierto**: N-1 enumeró los 43 objetos de `public`. No hay nada fuera del inventario.

**`authenticated` NO se toca.** `pacientes` y `citas` solos suman 22 puntos de acceso desde el navegador.

### Verificación

```sql
SELECT c.relname,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_lee,
       has_table_privilege('anon', c.oid, 'INSERT') AS anon_inserta,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_lee
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','v','m','p')
ORDER BY anon_lee DESC, c.relname;
```

**Esperado:** `anon_lee = true` en **una sola fila**, `tenants_public`. `auth_lee` sin cambios.

```sql
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' ORDER BY anon_exec DESC, p.proname;
```

**Esperado:** `anon_exec = false` en las 14. `auth_exec` sin cambios en las 4 `fn_*` y en `emitir_factura_con_detalle`.

### Verificación funcional

| # | Qué | Esperado |
|---|---|---|
| 1 | `turnos.walterbenegas.com.ar/reserva/walterbenegas` en ventana privada | Carga con nombre, logo y colores |
| 2 | Reservar un turno de prueba | Funciona *(va por API con `service_role`)* |
| 3 | Portal del paciente por token | Funciona |
| 4 | Enlace corto `/t/<codigo>` | Funciona |
| 5 | Login y panel: `/pacientes`, `/agenda`, `/dashboard`, `/finanzas` | Sin errores |
| 6 | Emitir una factura *(simulada)* | Funciona |
| 7 | Marcar asistencia | Acredita puntos |

**1 y 5 son las que importan.** Si 1 falla, el `GRANT SELECT` no quedó. Si 5 falla, se tocó `authenticated` sin querer.

### Rollback

```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT EXECUTE ON FUNCTION public.emitir_factura_con_detalle(
    uuid, uuid, uuid, integer, integer, integer, text, date, numeric,
    text, text, text, text, text, boolean, jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.generar_codigo_enlace()   TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sembrar_renglon_cita()    TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_cobrado_cita()       TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_valor_cita()         TO PUBLIC;
```

Total, sin datos, sin redeploy. **Guardar la salida de la verificación previa como línea base.**

---

## 5 · B1.1 · Cerrar los default privileges

**Va segundo.** Sin esto, cualquier objeto nuevo revierte B1.6 en silencio.

```sql
BEGIN;

-- ── public · FOR ROLE postgres ──
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM authenticated;   -- falla ruidosa en desarrollo

-- ── public · FOR ROLE supabase_admin ──  DESCARTADO
-- postgres NO es miembro de supabase_admin (§3): estos statements fallarían
-- con "must be member of role". Y no hacen falta: los 43 objetos de public y
-- las 14 funciones pertenecen a postgres. supabase_admin nunca creó nada acá.

-- ── storage · FOR ROLE postgres ──  (DO-9 = A)
-- Los 8 objetos de storage pertenecen a supabase_storage_admin, ninguno a
-- postgres. Este default privilege nunca se aplicó a nada y no puede romper
-- nada. Cierra el caso de crear un objeto ahí desde el SQL Editor.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  REVOKE ALL ON SEQUENCES FROM anon;

COMMIT;
```

**8 statements.** El diseño original tenía 3; llegué a proyectar 12 antes de verificar §3.

### Lo que queda deliberadamente afuera

| | Por qué |
|---|---|
| `TABLES FROM authenticated` | **DO-1.** Su falla es *"la pantalla carga vacía"* en producción, no un error en desarrollo |
| `graphql`, `graphql_public`, `supabase_functions` | Esquemas de plataforma. Tocarlos puede romper Supabase |
| `auth`, `cron`, `extensions`, `realtime` | **Ya están correctos** — solo `postgres` y `dashboard_user` |

### Verificación

```sql
SELECT pg_get_userbyid(d.defaclrole) AS rol_creador, n.nspname AS esquema,
       CASE d.defaclobjtype WHEN 'r' THEN 'TABLAS' WHEN 'S' THEN 'SECUENCIAS'
                            WHEN 'f' THEN 'FUNCIONES' END AS tipo,
       array_to_string(d.defaclacl, E'\n') AS privilegios
FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname IN ('public','storage')
ORDER BY n.nspname, tipo, rol_creador;
```

**Esperado:** ninguna fila de `public` ni `storage` menciona `anon`. `authenticated` debe seguir en `TABLAS` *(DO-1)* y desaparecer de `FUNCIONES`.

**Y la prueba real** — después de aplicar, en **staging**, no en producción:

```sql
CREATE TABLE public.__prueba_b11 (id int);
CREATE FUNCTION public.__prueba_b11_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';

SELECT has_table_privilege('anon','public.__prueba_b11','SELECT')        AS debe_ser_false,
       has_function_privilege('anon','public.__prueba_b11_fn()','EXECUTE') AS debe_ser_false_2,
       has_function_privilege('authenticated','public.__prueba_b11_fn()','EXECUTE') AS debe_ser_false_3;

DROP TABLE public.__prueba_b11;
DROP FUNCTION public.__prueba_b11_fn();
```

**Los tres `false` o B1.1 no tuvo efecto.** Esto **crea objetos**, así que va en staging y no antes de aplicar B1.1.

### Rollback

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon;
-- … y su simétrico para cada uno de los 12
```

---

## 5-bis · `tiene_rol()` — la costura de compatibilidad

**Decisión del owner, 20/08:** `tiene_rol()` se crea y se protege **dentro de esta migración**, no en la de B1.2/B1.3.

Es la función auxiliar que concentra la definición de "tener un rol". Hoy lee `tenant_users.role`; en Fase 2 pasará a leer la tabla de asociación multirol, **y las funciones que la consumen no se vuelven a tocar**.

```sql
-- Va DESPUÉS de los ALTER DEFAULT PRIVILEGES de §5, para que nazca limpia.
CREATE FUNCTION public.tiene_rol(p_tenant_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
      AND role = ANY(p_roles)
  )
$$;

-- Redundante si los ALTER DEFAULT PRIVILEGES funcionaron. Va igual:
-- es lo único que impide que nazca ejecutable por anon si aquello falló.
REVOKE ALL ON FUNCTION public.tiene_rol(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiene_rol(uuid, text[]) TO authenticated, service_role;
```

**Tres decisiones de diseño, justificadas:**

**`SECURITY DEFINER`** — si fuera `INVOKER` y alguna vez se usa en una política sobre `tenant_users`, la lectura interna dispararía esa misma política → recursión infinita. Con `DEFINER` y dueño `postgres`, la lectura salta RLS. Es el mismo motivo por el que las cuatro funciones existentes son `DEFINER`.

**`search_path = public, pg_temp`** — cierra el vector de R-12 desde el origen. `anon` y `authenticated` **tienen privilegio `TEMP`**, confirmado en producción, así que una `DEFINER` sin `pg_temp` anclado es secuestrable por tabla temporal.

**`STABLE`** — no modifica nada y devuelve lo mismo dentro de una sentencia. Permite que el planificador la cachee cuando se use en políticas RLS.

**Verificación:**

```sql
SELECT has_function_privilege('anon',          'public.tiene_rol(uuid,text[])', 'EXECUTE') AS debe_ser_false,
       has_function_privilege('authenticated', 'public.tiene_rol(uuid,text[])', 'EXECUTE') AS debe_ser_true;
```

**Rollback:** `DROP FUNCTION public.tiene_rol(uuid, text[]);` — nada la consume hasta que aterricen B1.2/B1.3.

---

## 6 · Orden y criterios de aceptación

| # | Paso | Bloquea al siguiente |
|---|---|---|
| 0 | ~~**§3** — ¿`postgres` es miembro de `supabase_admin`?~~ | ✅ **RESUELTO** — no lo es; sin impacto |
| 1 | ACL previo de las 43 relaciones y las 14 funciones *(línea base)* | Sí |
| 2 | **B1.1** — default privileges + `tiene_rol()` | No |
| 3 | Verificación de `pg_default_acl` + ACL de `tiene_rol` | Sí |
| 4 | Prueba de objeto nuevo **en staging** | Sí |
| 5 | *(espera del cierre de la ventana de observación)* | — |
| 6 | **B1.6** — revocar `anon` de lo existente | No |
| 7 | Verificación SQL + las 7 pruebas funcionales | **Sí** |
| 8 | Versionar como migración + bitácora | — |

### ⚠️ Cambio de orden — B1.1 pasa a ir primero

El diseño original ponía **B1.6 antes que B1.1**, con el criterio de "cerrar primero el agujero actual". Eso ya no sirve, por dos razones:

**B1.6 está bloqueado y B1.1 no.** La ventana de observación existe para saber si revocar `anon` de **34 tablas existentes** rompe algún consumidor vivo. **B1.1 no revoca nada existente**: solo cambia lo que heredan los objetos *futuros*. Su riesgo funcional sobre el sistema actual es **cero**.

**Y `tiene_rol()` ahora vive en B1.1.** Si B1.1 esperara a B1.6, `tiene_rol()` esperaría también, y con ella **B1.2 y B1.3** — que no tienen ninguna relación con la ventana de observación. Sería una dependencia artificial.

**Con este orden:** B1.1 se aplica ahora, `tiene_rol()` queda disponible, B1.2/B1.3 avanzan en paralelo, y B1.6 entra cuando la ventana cierre. **Además, cualquier objeto que se cree entre hoy y B1.6 ya nace limpio.**

### Aceptación

- [ ] `anon` lee **exactamente un objeto**: `tenants_public`
- [ ] `anon` no ejecuta **ninguna** de las 14 funciones
- [ ] `authenticated` **sin cambios** en tablas y funciones
- [ ] Las 7 pruebas funcionales pasan
- [ ] Una tabla nueva y una función nueva nacen **sin privilegio para `anon`**
- [ ] Los 471 tests siguen verdes · `tsc --noEmit` exit 0
- [ ] **Cero archivos de `src/` modificados**
- [ ] 24 h sin errores nuevos en Sentry

---

## 7 · Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| ~~`postgres` no puede alterar los defaults de `supabase_admin`~~ | **CONFIRMADO** | No puede. Pero los 43 objetos y las 14 funciones son de `postgres` → sin impacto práctico. Residuo cubierto por G-1 |
| Alguna ruta pública lee una tabla como `anon` y no la vi | **Baja** | Verificado en las 11 rutas + `TenantContext`. Prueba funcional 1 lo confirma |
| `REVOKE … ON ALL TABLES` alcanza algo desconocido | **Muy baja** | N-1 enumeró los 43 objetos |
| El portal público deja de resolver el tenant | Baja | Prueba 1. Rollback en un `GRANT` |
| Una integración externa usa la clave `anon` contra alguna tabla | **NO VERIFICADO** | Ver abajo |

**El último merece atención.** No puedo descartar desde el repositorio que exista un script, una automatización o una integración fuera de este código usando la clave `anon` contra alguna tabla. **DECISIÓN DEL OWNER: ¿existe algo así?** Si no lo sabés con certeza, la prueba es aplicar B1.6 y observar 24 h antes de B1.1 — el rollback es inmediato.

---

## 8 · Lo que este bloque NO cierra

| | Destino |
|---|---|
| `authenticated` con `arwdDxtm` en 34 tablas | **RLS sigue siendo el único control.** Fase 2 |
| `force_rls = false` en las 43 (R-9) | Fase 2 |
| 9 funciones sin `pg_temp` (R-12) | B1.2/B1.3 |
| Escalada admin→owner (R-2) | DO-7 |
| Trigger a dominio ajeno (R-8) | P0-08 |
| `DELETE` de tenant con `service_role` (R-6, R-7) | Fase 3 |

---

*Diseño. Ninguna migración creada, nada ejecutado contra Supabase, ningún archivo de `src/` modificado, ningún commit. Requiere autorización explícita del owner y el resultado de §3 antes de convertirse en migración.*
