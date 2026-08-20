# P0-05 · Bitácora de implementación

Registro acumulativo. **Una entrada por paso.** Cada entrada dice qué se hizo, con qué comando, qué devolvió, cómo se verificó y cómo se revierte.

Se escribe **después** de ejecutar y verificar, nunca antes.

---

## Tablero

### Etapas

| Etapa | Estado | Entradas |
|---|---|---|
| **FASE 0 · solo lectura** | 🟢 **CERRADA** — evidencia completa y 9 decisiones tomadas | 001-008 |
| **B1.1 · default privileges + `tiene_rol()`** | 🟢 **APLICADO** — falta prueba de efecto | 009 |
| Diseño P0-05 v2 | ⬜ bloqueado por A-1, A-2, A-3, A-7 | — |
| Revisión final | ⬜ | — |
| B1.1 + B1.6 · privilegios | ⬜ | — |
| B1.2 + B1.3 · roles en funciones | ⬜ | — |
| B1.4 + B1.5a · RLS y esquema | ⬜ | — |
| B1.7 · guardas de patrón | ⬜ | — |
| Integración staging | ⬜ | — |
| Cierre | ⬜ | — |

### Bloqueantes

| # | Bloqueante | Estado | Resuelve |
|---|---|---|---|
| **A-1** | Definición viva de las 14 funciones | 🟢 **CERRADO** | entrada 007 · N-2 + A-1.2, huellas md5 idénticas |
| **A-2** | ACL vivo de tablas, funciones y default privileges | 🟢 **CERRADO** | entrada 007 · N-1 + N-2 + A-2.6 |
| **A-3** | Distribución de `historial_puntos` | 🟢 **CERRADO** | entrada 007 · 251 filas, **0 ajustes manuales** |
| **A-4** | Harness PGlite sin columna `role` | 🟢 **resuelto** | entrada 003 |
| **A-5** | `vistas-bi.test.ts` sin versionar | 🟢 **resuelto** | entrada 002 |
| **A-6** | Modelo owner | 🟢 **CERRADO** | DO-6 · **multirol con tabla de asociación**, 20/08 |
| **A-7** | ¿`presupuestos` bloquea el DELETE? | 🟢 **CERRADO** | entrada 007 · **0 filas**, bloqueo teórico |

### Hallazgos abiertos

| # | Hallazgo | Severidad | Destino |
|---|---|---|---|
| **R-10** | **`anon` con `GRANT ALL` sobre `tenants_public`, vista actualizable sin `security_invoker`** | **Crítica** | 🟢 **CERRADO** — entrada 006 |
| **R-1** | **34 de 35 tablas con `anon=arwdDxtm`** *(no 12 — confirmado en producción, N-1)* | Crítica | B1.6 |
| **R-2** | `role` sin whitelist en `/api/equipo/invitar` → escalada admin→owner | Alta | DO-7 |
| **R-3** | El modelo de `role` no representa al dueño que ejerce | Alta | DO-6 |
| **R-5** | ~~`generar_codigo_enlace` es SECURITY DEFINER~~ → **CORREGIDO: es INVOKER.** Ejecutable por `anon`, sin `search_path`, no toca tablas | **Baja** *(era falso positivo de mi regex)* | Higiene |
| **R-11** | `emitir_factura_con_detalle` tiene `anon=X`: el `REVOKE FROM PUBLIC` no borró el grant explícito del default privilege. **Se defiende sola** con `auth.uid()` | Media *(estructural)* | B1.1 + B1.6 |
| **R-12** | 9 de 13 funciones DEFINER con `search_path=public` sin `pg_temp`. `anon` y `authenticated` **tienen TEMP** | Media-baja | B1.2/B1.3 |
| **R-6** | `/api/clinicas:114` borra tenant con `service_role`, 19 FK cascadean | Baja | Fase 3 |
| **R-7** | Asimetría 19 CASCADE / 12 NO ACTION hacia `tenants` | **Media** *(subió: era el único freno del DELETE de R-10)* | Fase 3 |
| **R-8** | Trigger `sync_turnos_to_sheets` → dominio ajeno, sin auth | **Media** | P0-08 / inventario v2 |
| **R-9** | `FORCE RLS` en ninguna tabla — **confirmado en producción** (N-1, 43/43) | Baja-Media | Fase 2 |

### Decisiones del owner

**🟢 Las nueve cerradas el 20/08/2026.** Análisis en `P0-05_DECISIONES_ANALISIS_FINAL.md`.

| # | Decisión | Resultado |
|---|---|---|
| DO-1 | `TABLES FROM authenticated` | ✅ **Fase 2** |
| DO-2 | Límite de ajuste de puntos | ✅ **±500 por operación** |
| DO-3 | Nota obligatoria | ✅ **Sí, mínimo 10 caracteres** |
| DO-4 | ¿Odontólogo canjea premios? | ✅ **No** → `owner`, `admin`, `staff` |
| DO-5 | ¿Aplicar B1.4? | ✅ **Sí**, con corrección de UI |
| DO-6 | Modelo de roles | ✅ **MULTIROL con tabla de asociación** — `owner`, `admin`, `odontologo`, `staff` |
| DO-7 | Excepción de contención para R-2 | ✅ **Sin excepción.** Vocabulario en P0-05; jerarquía a Fase 2 |
| DO-8 | ¿Odontólogo administra plantillas? | ✅ **No** — política actual ya correcta, sin cambio |
| DO-9 | ¿`storage` en B1.1? | ✅ **Sí** |

**Dos cambios de alcance derivados:**

**B1.5a se elimina** como bloque independiente. El valor inicial del rol se define dentro del diseño multirol de DO-6, no como migración suelta.

**La regla de contención cambia:** de *"cero archivos de `src/` modificados"* a **"un solo archivo autorizado: `src/app/pacientes/page.tsx`"**, exclusivamente para corregir el falso mensaje de éxito del borrado. Cualquier otro archivo de `src/` en el `git diff --stat` del cierre es una violación.

**Riesgo residual aceptado — R-2 parcial.** El vocabulario de roles se cierra en P0-05 por integridad referencial. **La escalada `admin → owner` NO se cierra**: `owner` es un valor válido del vocabulario. Requiere política de autorización jerárquica en **Fase 2**. Registrado como aceptado con alcance definido, **no como cerrado**.

### Métricas

| | Baseline | Actual | Δ |
|---|---|---|---|
| Tests en verde | 468 | **471** | +3 |
| Archivos de test | 21 | 21 | — |
| `tsc --noEmit` | exit 0 | **exit 0** | — |
| Archivos de `src/` modificados por P0-05 | 0 | **1** *(solo test)* | +1 |

---

# Entradas

## 001 · Baseline de la suite

**Fecha:** 14/08/2026 · **Etapa:** FASE 0 · **Tipo:** verificación

**Por qué.** Antes de tocar nada hacía falta el número real de tests en verde. Los documentos anteriores citaban "468 tests" sin haberlo medido en esta sesión.

**Comando.**
```bash
npx vitest run --reporter=basic
```

**Resultado.**
```
Test Files  21 passed (21)
     Tests  468 passed (468)
  Duration  13.01s
```

Commit de partida: `7dd8c3b` — *Merge P0-03: saneo de PII y secretos en Sentry*, rama `main`.

**Verificación.** El número citado en los documentos previos era correcto.

**Rollback.** N/A — solo lectura.

---

## 002 · A-5 · Versionar la guarda de vistas BI

**Fecha:** 14/08/2026 · **Etapa:** FASE 0 · **Tipo:** repositorio · **Bloqueante:** A-5

**Por qué.** `src/lib/vistas-bi.test.ts` existía en el árbol de trabajo pero estaba **untracked**. Contiene la guarda que impide volver a conceder vistas `bi_*` a `anon` — la protección de P0-07. Al no estar versionado, **no corría en CI**: la protección dependía de que el archivo sobreviviera localmente.

**Comando.**
```bash
git add src/lib/vistas-bi.test.ts     # ruta explícita, para no arrastrar
                                      # los 4 archivos de src/ del usuario
git commit -m "P0-07: versionar la guarda de vistas BI"
```

**Resultado.** Commit `3af93d3`. Un archivo, 441 líneas, 20 tests.

**Verificación.**
```bash
git ls-files src/lib/vistas-bi.test.ts   # → src/lib/vistas-bi.test.ts
git status --porcelain src/              # → solo los 4 archivos del usuario, intactos
```

**Limitación conocida.** La guarda sigue siendo **parcial**: solo mira vistas `bi_*` y solo el rol `anon`. No habría detectado R-1 (12 tablas con `GRANT` heredado) ni R-5 (`generar_codigo_enlace` ejecutable por `anon`). Generalizarla es **B1.7**.

**Rollback.**
```bash
git reset --soft HEAD~1 && git restore --staged src/lib/vistas-bi.test.ts
```

---

## 003 · A-4 · Extender el harness PGlite con la columna `role`

**Fecha:** 14/08/2026 · **Etapa:** FASE 0 · **Tipo:** test · **Bloqueante:** A-4

**Por qué.** El harness creaba `tenant_users (tenant_id uuid, user_id uuid)` — **sin rol**. Ninguna política ni función que discrimine por rol podía probarse ahí: los 27 tests de la Fase 1 **no compilaban** contra este harness.

**Cambio.** `src/lib/tenant-isolation.test.ts`, solo test, sin tocar producción:

1. `tenant_users` pasa a tener `role text NOT NULL DEFAULT 'admin'` — **replicando producción exactamente**, `DEFAULT` incluido.
2. La siembra pasa `role = 'admin'` explícito para los dos usuarios, que es lo que hay hoy en producción.
3. Tres tests nuevos que **fijan el estado actual**, no que prueban una defensa.

**Los tres tests y para qué sirven.**

| Test | Qué fija | Cuándo debe fallar |
|---|---|---|
| *una fila insertada sin rol nace como admin* | El `DEFAULT 'admin'` vigente | **Cuando aterrice B1.5a.** Esa falla es la señal de que el cambio llegó, no un test roto |
| *no hay CHECK: admite cualquier texto* | Documenta R-2 — la base no frena un rol arbitrario | Cuando aterrice B1.5b |
| *el rol no interviene en el aislamiento* | Que agregar la columna es inerte | Si alguien mete el rol en las políticas de tenant |

**Decisión de diseño.** Repliqué `DEFAULT 'admin'` **a propósito**, aunque sea el hueco que B1.5a viene a cerrar. Un harness que ya tuviera `'staff'` mentiría sobre el estado de producción y haría que B1.5a pareciera innecesario.

**Comando de verificación.**
```bash
npx vitest run src/lib/tenant-isolation.test.ts   # 84 passed (era 81)
npx vitest run                                    # 471 passed (era 468)
npx tsc --noEmit                                  # exit 0
```

**Verificación.** Los 81 tests de aislamiento **siguen todos en verde**. El aislamiento por tenant no depende del rol —las políticas solo miran la pertenencia a `tenant_users`— así que el cambio es inerte, como se esperaba.

**Estado.** ⚠️ **En disco y verificado, SIN COMMITEAR.** El commit falló por el lock de `.git` (ver 004).

**Rollback.**
```bash
git checkout -- src/lib/tenant-isolation.test.ts
```

---

## 004 · Incidente · Locks de `.git` sin borrar

**Fecha:** 14/08/2026 · **Etapa:** FASE 0 · **Tipo:** incidente

**Qué pasó.** El sandbox puede **crear** archivos dentro de `.git/` pero no **borrarlos**. Git crea `index.lock` al escribir y lo elimina al terminar; acá la eliminación falla con `Operation not permitted`. El commit de 002 igual se completó, pero dejó los locks.

**Consecuencia.** El commit de 003 falló:
```
fatal: Unable to create '.git/index.lock': File exists.
```
**Cualquier operación de escritura de git queda bloqueada hasta limpiar.**

**Residuos.**
```
.git/index.lock
.git/HEAD.lock
.git/objects/maintenance.lock
.git/objects/9b/tmp_obj_0O2Gdf
.git/objects/34/tmp_obj_y5tcG9
.git/objects/d6/tmp_obj_IbRCSf
.git/objects/3a/tmp_obj_ovWZOe
.git/objects/0a/tmp_obj_Ccn0Ae
```

**Cómo limpiar** — desde una terminal del usuario, no del sandbox:
```bash
cd ~/Turnos-app
rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock
rm -f .git/objects/*/tmp_obj_*
git status
```

Los `tmp_obj_*` son objetos huérfanos, inofensivos pero sucios. `git gc` también los limpia.

**Integridad.** Verificada: `3af93d3` está bien formado, el árbol está sano y los 4 archivos del usuario no se tocaron. **No hubo pérdida de datos.**

**Prevención.** Mientras el sandbox tenga esta limitación, **los commits los hace el usuario**. Yo dejo los cambios en disco verificados y el mensaje de commit redactado.

**Commit pendiente de 003:**
```bash
git add src/lib/tenant-isolation.test.ts
git commit -m "A-4: extender el harness PGlite con la columna role

El harness creaba tenant_users(tenant_id, user_id), sin rol. Ninguna
politica ni funcion que discrimine por rol podia probarse: los tests de
RBAC de la Fase 1 no compilaban contra este harness.

Agrega la columna replicando produccion, DEFAULT 'admin' incluido, y tres
tests que fijan el estado actual:
  - una fila sin rol nace admin (B1.5a lo cambiara a 'staff')
  - no hay CHECK: la base admite cualquier texto como rol (hallazgo R-2)
  - el rol no interviene en el aislamiento entre clinicas

Cambio inerte para el aislamiento: 81 tests siguen en verde, 84 en total."
```

---

## 005 · Auditoría del estado local y del script de lectura

**Fecha:** 15/08/2026 · **Etapa:** FASE 0 · **Tipo:** verificación · **Bloqueante:** A-1, A-2, A-3, A-7

**Por qué.** Antes de correr nada contra producción había que confirmar tres cosas: que el árbol local esté donde lo dejó la entrada 004, que A-4 y A-5 sigan en pie, y que el script de lectura sea **demostrablemente** de solo lectura. Lo último no se había verificado: se había *escrito* con esa intención, que no es lo mismo.

**Comando.**

```bash
# 1 · estado del árbol
git status --porcelain
git diff --numstat -- src/app/bi/page.tsx src/app/crm/page.tsx \
                      src/app/finanzas/page.tsx src/app/globals.css

# 2 · A-5 sigue versionado
git ls-files --error-unmatch src/lib/vistas-bi.test.ts
git log --oneline -1 -- src/lib/vistas-bi.test.ts

# 3 · A-4 sigue en disco
grep -n "role      text NOT NULL DEFAULT 'admin'" src/lib/tenant-isolation.test.ts
git diff --numstat -- src/lib/tenant-isolation.test.ts

# 4 · auditoría de seguridad del script (verbos de escritura fuera de comentarios)
python3 - <<'PY'
import re
t=open('P0-05_FASE0_LECTURA_v2.sql',encoding='utf-8').read()
codigo='\n'.join(l.split('--')[0] for l in t.split('\n'))
sent=[x.strip() for x in codigo.split(';') if x.strip()]
print(len(sent), all(x.upper().startswith('SELECT') for x in sent))
PY
```

**Resultado.**

| Verificación | Resultado |
|---|---|
| Árbol de trabajo | 5 archivos modificados: los 4 del usuario + `tenant-isolation.test.ts` |
| Los 4 del usuario | `bi/page.tsx` +1−1 · `crm/page.tsx` +1−1 · `finanzas/page.tsx` +1−1 · `globals.css` +30−5. **Sin tocar por P0-05** |
| A-5 | ✅ trackeado, commit `3af93d3` |
| A-4 | ✅ en disco, línea 80, diff +73−4, **sigue sin commitear** por el lock de 004 |
| Script v2 | **27 sentencias, las 27 empiezan con `SELECT`** |

**Auditoría del script.** Contrastarlo contra los requisitos completos de A-1, A-3 y A-7 mostró **cuatro huecos**: faltaban `return type` / `language` / `volatility` / `strict` y EXECUTE por rol (A-1); volumen y reparto por clínica de `historial_puntos` (A-3); **triggers** (no se miraban en absoluto); y `condeferrable` en las FK (A-7 — una FK diferible no bloquearía dentro de una transacción).

Se creó **`P0-05_FASE0_LECTURA_v2.sql`** = original intacto + anexo con 6 consultas nuevas (N-1 a N-6). **El original no se modificó.**

**Verificación.** Diez apariciones de `INSERT`/`UPDATE`/`DELETE` en el archivo, todas confirmadas como **literales de texto** dentro de `has_table_privilege(...)` y de expresiones `CASE` — ninguna es una sentencia. Las 27 sentencias ejecutables empiezan con `SELECT`. **El script es demostrablemente de solo lectura**, no solo por intención.

**Hallazgos nuevos de esta sesión** — registrados, **no corregidos**:

- **R-8** *(media)*: `sync_turnos_to_sheets`, trigger `AFTER INSERT OR UPDATE` sobre `citas`, hace `POST` a `https://turnos-app-delta.vercel.app/api/sync-sheet` con headers solo `Content-type`. El endpoint exige `Authorization: Bearer $SYNC_SHEET_SECRET` → **cada escritura de `citas` dispara un POST que recibe 401**. El dominio tampoco es el de producción (`dentaldesk.app`). Timeout 5000 ms en la ruta caliente de escritura, y afecta a los 9 caminos de P0-08.
- **R-9** *(baja-media)*: `FORCE ROW LEVEL SECURITY` no está declarado en ninguna de las 35 tablas. Sin `FORCE`, el dueño ignora sus propias políticas → toda `SECURITY DEFINER` saltea RLS. Es una propiedad global del esquema, no un detalle de dos funciones.

**Correcciones a documentos previos:**

- Son **14** funciones `SECURITY DEFINER`, no 12. `generar_codigo_enlace` sí lo es (`P0-05_FASE1_DISENO.md` §A.1 dice lo contrario).
- **`presupuestos` no aparece en ningún archivo de `src/`**, solo en dos listas de tests. Es una tabla sin código.
- **A-7 pasa de 🔴 a 🟡**: FK, FK entrantes, triggers, ausencia de rutas `service_role` y mensaje de error quedan verificados. Falta el `count(*)`.

**Riesgo detectado para B1.4** — RLS deniega devolviendo **0 filas con `error = null`**, y `pacientes/page.tsx:141` muestra `"Paciente eliminado"` cuando no hay error. **Aplicar B1.4 sin tocar la UI daría un mensaje de éxito falso.** No estaba contemplado en el diseño de Fase 1.

**Estado de FASE 0 tras esta entrada:** A-1 🔴 · A-2 🔴 · A-3 🔴 · A-4 🟢 · A-5 🟢 · A-6 🔴 · A-7 🟡

**Rollback.** N/A — solo lectura. El único archivo creado es `P0-05_FASE0_LECTURA_v2.sql`, que se borra sin consecuencias.

---

## 006 · R-10 · Cerrar la escritura de `anon` sobre `tenants_public`

**Fecha:** 15/08/2026 · **Etapa:** FASE 0 *(excepción autorizada por el owner)* · **Tipo:** mitigación en producción · **Hallazgo:** R-10

**Por qué.** La primera consulta de evidencia viva (N-1) destapó que `tenants_public` —una vista— tenía `anon=arwdDxtm`: lectura **y escritura**. La excepción acordada era solo de lectura.

Cuatro datos medidos en producción lo volvieron explotable, no teórico:

| Dato | Valor | Consecuencia |
|---|---|---|
| `is_updatable` / `is_insertable_into` | **YES** | La vista acepta DML |
| `reloptions` | **NULL** | Sin `security_invoker` |
| `relowner` | **postgres** | La vista corre como superusuario |
| `force_rls` en `tenants` | **false** | El dueño no está sujeto a RLS |

Sumado a `anon` con `a`, `w` y `d` sobre la vista: **un cliente sin autenticar podía escribir en `tenants`**. Y `anon` no es una credencial privilegiada — `NEXT_PUBLIC_SUPABASE_ANON_KEY` viaja al navegador en cada carga.

Alcance del `UPDATE`, sobre cualquier clínica activa, sin filtro de tenant: `nombre`, `direccion`, `telefono`, `logourl`, los tres colores, `whatsapptemplate`, **`subdominio_generico`** y **`custom_domain`**. Las dos últimas resuelven el tenant en el portal público.

`20260722190555_cerrar_lectura_publica_tenants.sql` había revocado el `SELECT` de `tenants` a `anon`. La vista quedó con más privilegios que la tabla que protegía.

**Verificación previa del alcance funcional.** `tenants_public` tiene **un solo consumidor** en todo el repositorio: `src/components/TenantContext.tsx:153-157`, cliente del navegador, `.select('*')`. Ninguna escritura en ningún archivo.

**Comando.**

```sql
-- Paso 1 · ACL antes (rollback)
SELECT relname, coalesce(array_to_string(relacl, E'\n'),'(nulo)') AS acl_antes
FROM pg_class WHERE relnamespace='public'::regnamespace
  AND relname IN ('tenants_public','bi_resumen');

-- Paso 2 · corrección
BEGIN;
REVOKE ALL ON TABLE public.tenants_public FROM anon, authenticated;
GRANT  SELECT ON TABLE public.tenants_public TO anon, authenticated;
REVOKE ALL ON TABLE public.bi_resumen FROM anon, authenticated;
COMMIT;

-- Paso 3 · ACL después
SELECT c.relname,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_lee,
       has_table_privilege('anon', c.oid, 'UPDATE') AS anon_actualiza,
       has_table_privilege('anon', c.oid, 'DELETE') AS anon_borra,
       has_table_privilege('anon', c.oid, 'INSERT') AS anon_inserta,
       coalesce(array_to_string(c.relacl, E'\n'),'(nulo)') AS acl_despues
FROM pg_class c WHERE c.relnamespace='public'::regnamespace
  AND c.relname IN ('tenants_public','bi_resumen');
```

Sin `CASCADE`. Sin `DROP`. Sin tocar `tenants`, datos, RLS, `service_role` ni `postgres`. Sin deploy.

**Resultado.**

| Objeto | ACL antes | ACL después |
|---|---|---|
| `tenants_public` | `anon=arwdDxtm`<br>`authenticated=arwdDxtm` | **`anon=r`**<br>**`authenticated=r`** |
| `bi_resumen` | `anon=awdDxtm`<br>`authenticated=awdDxtm` | **(ninguno)** |

En ambos, `postgres` y `service_role` quedaron intactos con `arwdDxtm`.

**Verificación.**

- ✅ `tenants_public` → `anon_lee = true`, `anon_actualiza`/`anon_borra`/`anon_inserta` = **false**.
- ✅ `bi_resumen` → los cuatro en **false**. Solo `postgres` y `service_role`.
- ✅ **Verificación funcional — OK.** `https://turnos.walterbenegas.com.ar/reserva/walterbenegas` abre normal, sin autenticar. Confirmado por el owner el 15/08.

  Vale más de lo esperado: ese host resuelve por **`custom_domain`**, que es una de las columnas que `TenantContext.tsx:156` lee de `tenants_public` en el `.or(...)`. O sea que la verificación ejercitó exactamente el camino que el `REVOKE` podía romper — lectura anónima de la vista para resolver el tenant por hostname — y sigue funcionando.

**Entrada COMPLETA.** R-10 cerrado y verificado en producción, a nivel ACL y a nivel funcional.

**Lo que NO resuelve.** Acotado a R-10 a propósito. Siguen abiertos: las 34 tablas con `anon=arwdDxtm` (B1.6 — ahí RLS sí contiene), `force_rls` (R-9), y los default privileges (B1.1). **Ese último importa acá: si la vista se recreara sin revocar de nuevo, el agujero vuelve.**

**Riesgo residual anotado.** El `DELETE` a través de la vista habría cascadeado sobre 19 tablas. Lo único que lo impedía era que `pacientes.tenant_id` y `presupuestos.tenant_id` son `NO ACTION` — la asimetría R-7, que no es un control sino una casualidad. **R-7 sube de baja a media.**

**Rollback.**

```sql
GRANT ALL ON TABLE public.tenants_public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.bi_resumen TO anon, authenticated;
```

*(El segundo restaura `awdDxtm` — sin `SELECT`, que era el estado previo.)*

**Pendiente de versionado.** Igual que P0-07, se aplicó desde el SQL Editor. Falta la migración en el repositorio para que quede en la historia.

**Estado de FASE 0 tras esta entrada:** A-1 🔴 · A-2 🟡 · A-3 🔴 · A-4 🟢 · A-5 🟢 · A-6 🔴 · A-7 🟡

---

## 007 · Recolección de evidencia viva — cierre de A-1, A-2, A-3 y A-7

**Fecha:** 15/08/2026 · **Etapa:** FASE 0 · **Tipo:** SQL de solo lectura · **Bloqueantes:** A-1, A-2, A-3, A-7

**Por qué.** Todo el análisis previo se apoyaba en el repositorio, que ya había demostrado no ser fuente de verdad. Sin `pg_proc`, `relacl`, `proacl`, `pg_default_acl` y los datos reales, ningún diseño era defendible.

**Comando.** Bloques de `P0-05_FASE0_LECTURA_v2.sql`, ejecutados por el owner en el SQL Editor, en este orden: **N-1** → **N-2** → **A-2.6** → **N-6** → **A-3** (tipos + distribución + config) → **A-1.2**. Más dos consultas auxiliares: `is_updatable`/`reloptions` de las vistas, y `has_database_privilege(..., 'TEMP')`.

Todas `SELECT`. Ninguna escritura.

**Resultado.**

| Consulta | Cierra | Hallazgo principal |
|---|---|---|
| **N-1** | A-2 *(tablas)* | **34 de 35 tablas con `anon=arwdDxtm`** — no 12. `force_rls = false` en las 43. Vistas `bi_*` limpias |
| **N-2** | A-1 *(metadatos)* | **`emitir_factura_con_detalle` con `anon=X`** → R-11. **9 funciones sin `pg_temp`** → R-12. `generar_codigo_enlace` es **INVOKER** |
| **A-2.6** | A-2 *(defaults)* | **DOS `defaclrole` en `public`: `postgres` y `supabase_admin`** |
| **N-6** | **A-7** | `presupuestos` = **0 filas**. Bloqueo teórico |
| **A-3** | **A-3** | 251 movimientos. **0 ajustes manuales. 0 canjes** |
| **A-1.2** | **A-1** | Cuerpos vivos **idénticos** al repositorio |
| aux | R-10 | `tenants_public`: `is_updatable = YES`, `reloptions = NULL` |
| aux | R-12 | `anon` y `authenticated` **tienen TEMP** |

**Verificación de A-1 — la más importante.** Calculé el md5 del cuerpo normalizado de las dos funciones **antes** de ver producción, desde el repositorio. Comparación:

```
fn_ajustar_puntos_manual   PRODUCCION  5cbd955856  1505 ch
                           repo (x2)   5cbd955856  1505 ch   IDENTICA
fn_canjear_premio          PRODUCCION  7dc9bdecc5  2155 ch
                           repo (x2)   7dc9bdecc5  2155 ch   IDENTICA
```

**El repositorio refleja producción para estas dos funciones.** B1.2/B1.3 se pueden diseñar sobre el cuerpo del repo sin riesgo de pisar lógica viva. Era el bloqueante A-1 completo.

**Correcciones a análisis previos.** Se registran, no se ocultan:

1. **R-5 era un falso positivo mío.** Afirmé que `generar_codigo_enlace` es `SECURITY DEFINER`. Es **INVOKER**, en producción y en el repositorio. Mi detección usaba una ventana de 3000 caracteres tras el `CREATE FUNCTION` que se solapaba con la función siguiente. Son **13 DEFINER + 1 INVOKER**, no 14 DEFINER.
2. **R-1 era más grande.** Dije 12 tablas; son **34 de 35**. Las 23 con `GRANT` explícito lo tenían como `GRANT ALL … TO anon`. La distinción explícito/heredado era real pero irrelevante para el resultado. **B1.6 pasa de 12 a 34 tablas.**
3. **`REVOKE ALL … FROM PUBLIC` no revoca un grant explícito a `anon`.** Afirmé tres veces que 13 de 14 funciones estaban protegidas por tenerlo. R-11 lo desmiente: `emitir_factura_con_detalle` conservó `anon=X` del default privilege.
4. **B1.1 se duplica.** Diseñado para `FOR ROLE postgres`. Producción tiene **también `supabase_admin`**, que no está en ninguna migración. Revocar solo el primero habría dejado el problema abierto y declarado cerrado.
5. **`emitir_enlace_turno`:** dije que nadie podía ejecutarla; `service_role` sí, y debe ser así (`turno-publico.ts:196`).

**Hallazgos nuevos:** R-11 y R-12 *(ver tablero)*. **R-7 sube a media** — con `presupuestos` vacía, el único freno del `DELETE` de tenants es `pacientes.tenant_id` con `NO ACTION`.

**Evidencia para DO-2.** 251 movimientos: `migracion_inicial` 159 (máx 200), `gasto_tratamiento` 88 (máx **390**), `bonus_asistencia` 4 (máx 150). **Cero `ajuste_manual`, cero `ajuste_reverso`, cero `canje_premio`.** Config viva: `ars_por_punto=1000`, `ars_valor_canje=50`, `racha_bonus_puntos=150`, un solo tenant. Piso técnico del límite: **390**. Nota obligatoria: **costo cero**, no hay histórico que incumpla.

**Verificación.** Cada consulta devolvió filas coherentes con su esquema. Ninguna dio error. Ninguna escribió.

**Rollback.** N/A — solo lectura.

**Estado de FASE 0 tras esta entrada:** A-1 🟢 · A-2 🟢 · A-3 🟢 · A-4 🟢 · A-5 🟢 · A-6 🔴 · A-7 🟢

**La evidencia de FASE 0 está completa.** Lo único abierto es A-6, que es una decisión de producto, no un dato.

---

## 008 · Análisis de `pg_stat_statements` y reinicio del contador

**Fecha:** 19/08/2026 · **Etapa:** pre-B1.6 · **Tipo:** SQL de lectura + reinicio de estadísticas · **Bloquea:** B1.6

**Por qué.** El diseño de B1.6 revoca `anon` de 34 tablas. La verificación del código decía que `anon` solo necesita `tenants_public` (`TenantContext.tsx:154`), pero el repositorio no puede descartar un consumidor externo —un script, una automatización, una integración— que use la clave `anon`, que es pública.

**Comando.**

```sql
-- 1 · ¿el rol queda atribuido correctamente?
SELECT r.rolname, count(*) AS consultas_distintas, sum(s.calls) AS llamadas
FROM pg_stat_statements s JOIN pg_roles r ON r.oid = s.userid
GROUP BY r.rolname ORDER BY sum(s.calls) DESC;

-- 2 · qué ejecutó anon, con antigüedad
SELECT s.calls, s.rows,
       substring(s.query from '"public"\."([a-z_]+)"') AS tabla,
       s.stats_since, left(s.query, 80) AS muestra
FROM pg_stat_statements s JOIN pg_roles r ON r.oid = s.userid
WHERE r.rolname = 'anon'
ORDER BY s.stats_since DESC NULLS LAST, s.calls DESC;

-- 3 · reinicio
SELECT pg_stat_statements_reset();
```

**Resultado — la ventana iba del 20/03/2026 19:32 al 19/08/2026.** `anon`: 89 consultas distintas, 18.148 llamadas.

*Tráfico contra tablas de negocio, concentrado al inicio de la ventana:*

| Tabla | Operaciones | `stats_since` | Llamadas |
|---|---|---|---:|
| `citas` | SELECT · INSERT · UPDATE · DELETE | 20/03 – 08/06 | ~1.890 |
| `tenants` | SELECT | 17/04 – 28/05 | ~1.720 |
| `pacientes` | SELECT · INSERT · UPDATE · **DELETE** | 20/03 – 07/04 | ~1.340 |
| `bloqueos` | SELECT · INSERT · DELETE | 23/03 – 08/06 | 626 |
| `logs_envios` | SELECT · INSERT | 24/03 – 24/05 | 349 |
| `recordatorios_log` | SELECT · INSERT | 21/03 – 17/04 | 121 |
| `turnos` | SELECT · INSERT | 01/04 – 02/04 | 69 |
| `tratamientos`, `perfil_doctor`, `tenant_users`, `get_tenant_admin_email` | SELECT | 18/04 – 26/05 | 48 |

*Tráfico reciente:*

| Entrada | `stats_since` | Interpretación |
|---|---|---|
| `tenants_public` · 348 | **22/07 17:42** | El portal público. Camino legítimo |
| 6 vistas `bi_*` · 11 | **09/08 13:56** | **Nuestros propios curl de diagnóstico de P0-07** |
| `tenants_public` · 1 | 09/08 14:17 | Idem |
| `pacientes` · 1 · `pacientes` · 3 · `citas` · 3 | 22/07, 29/07, 01/08 | **No explicadas.** Volumen mínimo |

**Interpretación — hipótesis, no hecho probado.** El patrón temporal coincide con una etapa previa del producto: CRUD completo desde el navegador sobre `citas`, `pacientes` y `bloqueos`, más `INSERT INTO turnos` del agendamiento público viejo, todo concentrado en marzo–abril, **antes** de que existieran autenticación y multi-tenancy.

**Prueba dura de que el grueso ya no ocurre:** `tenants` acumula ~1.720 llamadas de `anon` entre abril y mayo. Hoy `anon` tiene `Dxtm` sobre esa tabla —**sin `SELECT`**— desde la migración `20260722190555` del 22/07. **Esas consultas son imposibles hoy.**

**Corrección propia.** Anticipé que la columna `rows` sería decisiva para saber si RLS estaba filtrando. **No lo es:** PostgREST envuelve cada consulta en un agregado que devuelve exactamente una fila, así que `rows = calls` en todas las entradas. El dato no informa nada.

**Limitación que motivó el reinicio.** `stats_since` marca la **primera** vez que se vio la consulta, no la última. Una entrada de marzo podría seguir recibiendo llamadas hoy y se vería idéntica. No hay forma de distinguirlo con la ventana acumulada.

**Verificación.** `pg_stat_statements_reset()` devolvió `2026-08-19 21:31:44.446407+00`. El contador arranca de cero desde ese momento.

⚠️ **ROLLBACK: NO EXISTE.** El reinicio borra estadísticas de forma irreversible. Los cinco meses de historial **solo sobreviven en esta entrada**. No se tocaron datos, esquema, privilegios ni RLS.

**Criterio de cierre.** A partir del **21/08 21:31 UTC** (48 h de uso normal), repetir la consulta 2. Si `anon` solo muestra `tenants_public`, la hipótesis histórica queda confirmada y **B1.6 puede avanzar**. Si aparece cualquier tabla de negocio, hay un consumidor vivo y hay que identificarlo antes de revocar.

**Estado:** B1.6 sigue **DETENIDO**.

---

## 009 · B1.1 · Cerrar default privileges + crear `tiene_rol()`

**Fecha:** 20/08/2026 · **Etapa:** B1.1 · **Tipo:** migración en producción · **Cierra:** causa raíz de R-1, R-11 y P0-07

**Por qué.** Los `ALTER DEFAULT PRIVILEGES` hacían que **todo objeto nuevo** creado por `postgres` en `public` naciera con `GRANT ALL` para `anon`. Es la causa raíz de que las vistas `bi_*` quedaran expuestas (P0-07) y de que `emitir_factura_con_detalle` conservara `anon=X` pese al `REVOKE FROM PUBLIC` (R-11). Sin cerrarlo, cualquier corrección se revierte sola al siguiente objeto.

**Se aplicó antes que B1.6, invirtiendo el orden del diseño original.** Justificación: B1.1 **no revoca nada existente** —solo cambia lo que heredan los objetos futuros— así que no depende de la ventana de observación. Y `tiene_rol()` vive acá por decisión del owner, de modo que postergarlo habría bloqueado B1.2/B1.3 sin motivo.

**Comando.** 7 `ALTER DEFAULT PRIVILEGES` + la función. **Ejecutados de a uno** *(ver incidente abajo)*.

```sql
-- public · FOR ROLE postgres
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;

-- storage · FOR ROLE postgres
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage REVOKE ALL ON SEQUENCES FROM anon;

-- costura de compatibilidad hacia el modelo multirol de Fase 2
CREATE FUNCTION public.tiene_rol(p_tenant_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id AND role = ANY(p_roles)
  )
$$;
REVOKE ALL ON FUNCTION public.tiene_rol(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiene_rol(uuid, text[]) TO authenticated, service_role;
```

**Resultado — default privileges, antes y después.**

| esquema · tipo | ANTES *(rol `postgres`)* | DESPUÉS |
|---|---|---|
| `public` · FUNCIONES | `postgres`, **`anon`**, **`authenticated`**, `service_role` | `postgres`, `service_role` |
| `public` · SECUENCIAS | `postgres`, **`anon`**, `authenticated`, `service_role` | `postgres`, `authenticated`, `service_role` |
| `public` · TABLAS | `postgres`, **`anon`**, `authenticated`, `service_role` | `postgres`, `authenticated`, `service_role` |
| `storage` · FUNCIONES | `postgres`, **`anon`**, `authenticated`, `service_role` | `postgres`, `authenticated`, `service_role` |
| `storage` · SECUENCIAS | `postgres`, **`anon`**, `authenticated`, `service_role` | `postgres`, `authenticated`, `service_role` |
| `storage` · TABLAS | `postgres`, **`anon`**, `authenticated`, `service_role` | `postgres`, `authenticated`, `service_role` |

**`anon` eliminado de las seis.** `authenticated` conserva TABLAS y SECUENCIAS por **DO-1** y pierde FUNCIONES a propósito: una función nueva sin `GRANT` explícito falla **ruidosamente en desarrollo**, no con una pantalla vacía en producción.

**Las entradas de `supabase_admin` quedan intactas** — `postgres` no es miembro de ese rol y no puede alterarlas. Sin impacto práctico: los 43 objetos de `public` y las 14 funciones pertenecen a `postgres`. **Riesgo residual:** si la plataforma creara algo en `public` como `supabase_admin`, nacería concedido a `anon`. Cubierto por la guarda G-1 de B1.7 y por correr N-1 periódicamente.

**Resultado — `tiene_rol()`.**

```
acl:      postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres
security: DEFINER          config: search_path=public, pg_temp
anon_exec: false     auth_exec: true     srole_exec: true
```

`SECURITY DEFINER` es necesario: si fuera `INVOKER` y alguna vez se usa en una política sobre `tenant_users`, la lectura interna dispararía esa misma política y entraría en recursión. `search_path` con `pg_temp` anclado cierra el vector de R-12 — `anon` y `authenticated` **tienen privilegio `TEMP`**, confirmado en producción.

---

### ⚠️ INCIDENTE · migración aplicada a medias, sin error en la parte que no corrió

**Qué pasó.** El bloque completo se envió al SQL Editor envuelto en `BEGIN`/`COMMIT`. El editor ejecutó **la cola y no la cabeza**: `CREATE FUNCTION`, `REVOKE` y `GRANT` se aplicaron; **los siete `ALTER DEFAULT PRIVILEGES` no tuvieron efecto alguno, y no devolvieron error**.

Se detectó recién al reintentar, cuando falló con:

```
ERROR: 42723: function "tiene_rol" already exists with same argument types
```

Ese error fue la única señal de que algo había corrido. **Sin él, la migración se habría dado por fallida y en realidad estaba a medias.**

**Descarta el rollback transaccional:** si el `BEGIN`/`COMMIT` hubiera revertido, `tiene_rol` no existiría.

**Diagnóstico.** Ejecutando **un solo statement aislado**, funcionó al instante. Los siete se aplicaron después de a uno, sin un solo error. **No era un problema de permisos: era de ejecución del editor con bloques multi-sentencia.**

**Consecuencia para el resto de P0-05 — regla nueva:**

> **Los `ALTER DEFAULT PRIVILEGES` y los DDL de privilegios se ejecutan de a un statement, verificando el catálogo después de cada uno.** No se confía en `BEGIN`/`COMMIT` dentro del SQL Editor.

**Por qué importa más allá de este caso.** Acá el bloque no era destructivo. Con un `REVOKE` sobre 34 tablas —B1.6— el mismo comportamiento dejaría el sistema en un estado intermedio **sin devolver error**, y nadie se enteraría hasta que algo fallara en producción.

---

**Verificación.** Consulta sobre `pg_default_acl` para `public` y `storage` — las seis filas de `postgres` sin `anon`. ACL de `tiene_rol` sin `anon`, con `authenticated` y `service_role`.

⏳ **PENDIENTE — prueba de efecto.** Crear una tabla y una función de prueba y confirmar que nacen sin privilegio para `anon`, que `authenticated` **no** puede ejecutar la función, y que **sí** puede leer la tabla. **Verificar el catálogo no es verificar el comportamiento** — es la lección de P0-07. **Esta entrada no está completa hasta registrar ese resultado.**

**Rollback.**

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  GRANT ALL ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  GRANT ALL ON TABLES    TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES    TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon;
DROP FUNCTION public.tiene_rol(uuid, text[]);
```

**De a uno.** Sin datos, sin redeploy. Nada consume `tiene_rol` todavía.

**Pendiente de versionado.** Igual que P0-07 y R-10, se aplicó desde el SQL Editor. **Van tres cambios de producción sin migración en el repositorio.**

---

## Próximo paso

1. **Prueba de efecto de B1.1** — completa la entrada 009.
2. **21/08 21:31 UTC** — consulta de cierre de la ventana *(entrada 008)*. Decide si **B1.6** avanza.
3. **B1.2 + B1.3** — diseñados en `P0-05_v2_BLOQUE_FUNCIONES.md`. Precondición: verificar que la UI de ajuste exija nota de ≥10 caracteres.
4. **B1.4** — autorizado a tocar `src/app/pacientes/page.tsx`, solo ese archivo.
5. **Fase 2** — modelo multirol, en documento separado.
6. **Versionar** los tres cambios aplicados desde el editor: P0-07, R-10 y B1.1.

| | Acción | Quién |
|---|---|---|
| 1 | Limpiar los locks de `.git` *(entrada 004)* | Gabriel |
| 2 | Commitear los 4 archivos de `src/` pendientes | Gabriel |
| 3 | Commitear A-4 con el mensaje de arriba | Gabriel |
| 4 | Correr **`P0-05_FASE0_LECTURA_v2.sql`** en el SQL Editor y pasar resultados | Gabriel |
| 5 | Decidir DO-1 a DO-8 | Gabriel |
| 6 | Escribir el diseño P0-05 v2 con los datos reales | Claude |

**Ninguna tarea de implementación arranca antes de cerrar FASE 0.**

---

## Reglas de esta bitácora

1. Una entrada por paso, numerada, en orden cronológico. **No se reescriben las anteriores.**
2. Se escribe **después** de ejecutar y verificar.
3. Toda entrada lleva **rollback**, aunque sea `N/A`.
4. Los incidentes se registran igual que los éxitos.
5. Si una verificación falla, se registra la falla — **no se borra el intento**.
6. Los comandos van **literales**, no parafraseados.
