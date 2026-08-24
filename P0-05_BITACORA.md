# P0-05 · Bitácora de implementación

Registro acumulativo. **Una entrada por paso.** Cada entrada dice qué se hizo, con qué comando, qué devolvió, cómo se verificó y cómo se revierte.

Se escribe **después** de ejecutar y verificar, nunca antes.

---

## Tablero

### Etapas

| Etapa | Estado | Entradas |
|---|---|---|
| **FASE 0 · solo lectura** | 🟢 **CERRADA** — evidencia completa y 9 decisiones tomadas | 001-008 |
| **B1.1 · default privileges + `tiene_rol()`** | 🟡 **APLICADO con limitación** — tablas y secuencias cerradas; funciones no (**R-17**) | 009 |
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
| **R-1** | 34 de 35 tablas con `anon=arwdDxtm` | Crítica | 🟢 **CERRADO** — B1.6, entrada 011 |
| **R-18** | **Los ACL de P0-07 y R-10 aparecieron revertidos en producción el 20/08. Causa NO VERIFICADA** | **Crítica** | 🔴 **ABIERTO** — entrada 011 |
| **R-2** | `role` sin whitelist en `/api/equipo/invitar` → escalada admin→owner | Alta | DO-7 |
| **R-3** | El modelo de `role` no representa al dueño que ejerce | Alta | DO-6 |
| **R-5** | ~~`generar_codigo_enlace` es SECURITY DEFINER~~ → **CORREGIDO: es INVOKER.** Ejecutable por `anon`, sin `search_path`, no toca tablas | **Baja** *(era falso positivo de mi regex)* | Higiene |
| **R-11** | `emitir_factura_con_detalle` tiene `anon=X`: el `REVOKE FROM PUBLIC` no borró el grant explícito del default privilege. **Se defiende sola** con `auth.uid()` | Media *(estructural)* | B1.1 + B1.6 |
| **R-12** | 9 de 13 funciones DEFINER con `search_path=public` sin `pg_temp`. `anon` y `authenticated` **tienen TEMP** | Media-baja | B1.2/B1.3 |
| **R-6** | `/api/clinicas:114` borra tenant con `service_role`, 19 FK cascadean | Baja | Fase 3 |
| **R-7** | Asimetría 19 CASCADE / 12 NO ACTION hacia `tenants` | **Media** *(subió: era el único freno del DELETE de R-10)* | Fase 3 |
| **R-8** | Trigger `sync_turnos_to_sheets` → dominio ajeno, sin auth. **Confirmado: devuelve 401, sin fuga** | **Media** | P0-08 / inventario v2 |
| **R-13** | Cron horario contra ruta borrada · ~24 fallos/día | Media | 🟢 **CERRADO** — entrada 010 |
| **R-14** | Secretos en texto plano en `cron.job` | Alta | 🟡 **PARCIAL** — token custom eliminado (010); falta `sb_publishable_` del jobid 3 y rotar `CRON_SECRET` |
| **R-15** | Edge Function `enviar-recordatorios` sin versionar | Media | F1-3 del release board |
| **R-9** | `FORCE RLS` en ninguna tabla — **confirmado en producción** (N-1, 43/43) | Baja-Media | Fase 2 |
| **R-17** | **El default de `PUBLIC` sobre funciones no es suprimible por `ALTER DEFAULT PRIVILEGES`** en este entorno. Toda función nueva nace ejecutable por `anon` | **Media** | Mitigado por G-2 + N-2 · entrada 009 |

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

### Prueba de efecto — resultado parcial, y una limitación de plataforma

**La prueba se justificó sola.** `pg_default_acl` mostraba las seis filas limpias. Con esa sola verificación habríamos cerrado B1.1 dando por resuelta la causa raíz de R-11 — y estaba resuelta a medias.

```sql
CREATE TABLE public.__prueba_b11 (id int);
CREATE FUNCTION public.__prueba_b11_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';
SELECT has_table_privilege   ('anon','public.__prueba_b11','SELECT')                 AS t1,
       has_function_privilege('anon','public.__prueba_b11_fn()','EXECUTE')           AS t2,
       has_function_privilege('authenticated','public.__prueba_b11_fn()','EXECUTE')  AS t3,
       has_table_privilege   ('authenticated','public.__prueba_b11','SELECT')        AS t4;
```

| | Esperado | Obtenido | |
|---|---|---|---|
| `anon` lee tabla nueva | `false` | **`false`** | ✅ |
| `anon` ejecuta función nueva | `false` | **`true`** | ❌ |
| `authenticated` ejecuta función nueva | `false` | **`true`** | ❌ |
| `authenticated` lee tabla nueva | `true` | **`true`** | ✅ *(DO-1)* |

**Tablas y secuencias: cerradas. Funciones: no.**

### Causa — medida, no inferida

El ACL crudo de una función recién creada:

```
=X/postgres            ← PUBLIC tiene EXECUTE
postgres=X/postgres
service_role=X/postgres
```

`anon` y `authenticated` **no** figuran como entradas explícitas — **nuestros `REVOKE` sí funcionaron**. Pero PostgreSQL concede `EXECUTE` a **`PUBLIC`** en toda función nueva, y eso **no sale de `pg_default_acl`**: es el default incorporado del tipo de objeto. Como todo rol pertenece a `PUBLIC`, `anon` lo hereda.

Por eso el catálogo se veía limpio y el comportamiento no.

### R-17 · Tres intentos de suprimirlo, sin efecto

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES                   IN SCHEMA public  REVOKE ALL     ON FUNCTIONS FROM PUBLIC;
```

**Los tres devolvieron éxito. Ninguno tuvo efecto.** Verificado creando y midiendo una función después de cada uno: `=X/postgres` siempre presente, `anon_exec = true` siempre.

**R-17 · el default de `PUBLIC` sobre funciones no es suprimible por `ALTER DEFAULT PRIVILEGES` en este entorno.** Causa exacta: NO VERIFICADA. Podría ser comportamiento de PostgreSQL, de la capa de Supabase, o algo del rol con que ejecuta el editor. **No lo sé, y no lo doy por sabido.**

### Mitigación — la que el proyecto ya usa

La protección de funciones pasa a ser **por migración, no por default**: todo `CREATE FUNCTION` incluye su `REVOKE ALL … FROM PUBLIC` y su `GRANT` explícito.

**No es un parche improvisado.** 13 de las 14 funciones del esquema ya siguen ese patrón. La única que no lo tenía —`generar_codigo_enlace`— es exactamente la que quedó ejecutable por `anon`. Y `tiene_rol()`, creada hoy con ese patrón, tiene `anon_exec = false` — **verificado**.

Lo que cambia es que deja de depender de la memoria de quien escribe la migración: **la guarda G-2 de B1.7 lo vuelve obligatorio en CI.**

**Riesgo residual:** una función creada a mano desde el SQL Editor, fuera de una migración, nace ejecutable por `anon` y el CI no la ve. Se detecta corriendo **N-2** periódicamente.

### Estado de B1.1

| Protección | Estado |
|---|---|
| Tablas nuevas cerradas a `anon` | 🟢 **Verificado por comportamiento** |
| Secuencias nuevas cerradas a `anon` | 🟢 Mismo mecanismo |
| Funciones nuevas cerradas a `anon` | 🔴 **R-17** — vía G-2 + N-2 |
| `authenticated` conserva tablas | 🟢 Verificado *(DO-1)* |
| `tiene_rol()` creada y protegida | 🟢 Verificado |

**B1.1 se da por cerrado con la limitación documentada.** No se declara resuelto lo que no lo está.

**Limpieza:** los objetos de prueba fueron eliminados. Confirmado: `0` objetos `__prueba%` en `public`.

⚠️ **El `DROP` multi-sentencia se ejecutó a medias dos veces** — borró la tabla y no la función, sin devolver error. Segunda confirmación del incidente. **La regla de un statement por vez aplica también a la limpieza.**

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

## 010 · F1-4 · Eliminar el job horario roto — cierra R-13 y media R-14

**Fecha:** 20/08/2026 · **Etapa:** release · **Tipo:** cambio en producción · **Cierra:** R-13 · **Parcial:** R-14

**Por qué.** `pg_cron` jobid 4 corría cada hora contra `https://turnos.walterbenegas.com.ar/api/recordatorio-email`. Esa ruta **fue borrada** —el historial de git muestra la eliminación de `src/app/api/recordatorio-email/route.ts`— y el job sobrevivió al refactor. Venía devolviendo **404 unas 24 veces por día**, sin que nadie se enterara, porque `pg_cron` no notifica fallos.

Además, su `command` contenía un **bearer token en texto plano** con formato `<producto>_<palabra>_<año>` — R-14. Ese token quedó expuesto en la conversación de auditoría.

**Por qué se borró en vez de rotarlo.** No tiene sentido rotar el secreto de un job que apunta a una ruta inexistente. Eliminarlo resuelve las dos cosas de una vez.

**Comando.**

```sql
SELECT cron.unschedule(4);

SELECT jobid, schedule, active, left(command, 70) AS comando
FROM cron.job ORDER BY jobid;
```

**Resultado.**

```
unschedule: true

jobid | schedule    | active | comando
------+-------------+--------+--------------------------------------
    3 | 0 11 * * *  | true   | select net.http_post( url := 'https://…
```

**Verificación.** Solo queda el jobid 3. El horario desapareció, y con él las ~24 llamadas fallidas diarias y el token en claro.

**Lo que NO cierra — R-14 queda a medias.**

El jobid 3 conserva una clave `sb_publishable_…` en texto plano en su `command`. Las claves *publishable* de Supabase **son públicas por diseño**, así que no es una fuga de secreto. Pero un valor de autenticación escrito en una tabla queda en los backups y a la vista de cualquiera con acceso al SQL Editor. **Moverlo a Supabase Vault es P2.**

**Y sigue pendiente rotar `CRON_SECRET`**, por dos motivos independientes:

1. **No se pudo determinar si era el mismo valor** que el token del jobid 4. Está marcado *Sensitive* en Vercel, que lo vuelve write-only. **Determinarlo salía más caro que rotarlo igual.**
2. **Pendiente viejo sin cerrar:** durante la verificación de P0-03 nunca se confirmó si `CRON_SECRET` viajaba a Sentry en los spans de las llamadas salientes — la ventana de exportación no alcanzó la corrida del cron. **Rotarlo cierra esa duda también.**

**Procedimiento pendiente:** generar valor con `openssl rand -base64 32`, actualizarlo en Vercel → Settings → Environment Variables → Production, y **hacer redeploy** — las variables se enlazan en el momento del deploy, sin redeploy el valor nuevo no toma efecto. Verificar al día siguiente que los tres crons de Vercel siguen ejecutando.

**Riesgo asumido al borrar.** Si alguien esperaba recordatorios por email desde ese job, dejan de intentarse. **En la práctica no cambia nada: llevaban meses devolviendo 404.** Lo que sí cambia es que el fallo deja de ser silencioso — antes fallaba, ahora directamente no existe.

**Rollback.**

```sql
SELECT cron.schedule(
  'recordatorio_email_horario',
  '0 * * * *',
  $$ SELECT net.http_post(
       url := 'https://turnos.walterbenegas.com.ar/api/recordatorio-email',
       headers := '{"Content-Type": "application/json", "Authorization": "Bearer <TOKEN>"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
```

⚠️ **Reconstruye el job con el token expuesto.** Solo con motivo explícito, y con un token nuevo. **El `jobid` no se puede reusar** — `cron.schedule` asigna uno nuevo.

**Pendiente de versionado.** El job no estaba en Git y su eliminación tampoco lo está. Los jobs de `pg_cron` son **F1-3** del release board.

---

## 011 · B1.6 · Revocar `anon` de todo el esquema — y un incidente de reversión

**Fecha:** 20/08/2026 · **Etapa:** B1.6 · **Tipo:** cambio en producción · **Cierra:** R-1, R-5, R-11

**Por qué.** `anon` tenía `arwdDxtm` sobre 34 de 35 tablas y podía ejecutar funciones que no debía. Lo único que lo contenía era RLS. B1.6 elimina esa dependencia: `anon` pasa a poder leer **un solo objeto en todo el esquema**.

> ⚠️ **PRECISIÓN AGREGADA EL 22/08.** Al repetir la consulta a las **62,5 h** del reset, el resultado se confirmó: `tenants_public` 49 llamadas, **cero tablas de negocio**. Pero la cobertura efectiva fue menor de lo que el protocolo pedía: **B1.6 se aplicó a las ~24 h**, así que solo ese primer tramo midió con `anon` operativo. Las 39 h restantes transcurrieron con `anon` ya revocado, donde un consumidor externo habría fallado sin necesariamente quedar registrado.
>
> **El protocolo pedía 48 h de observación con `anon` activo. Hubo ~24.** Decisión del owner: **no revertir** para conseguir una ventana más limpia — revertir reabriría R-1 a cambio de mejorar una evidencia cuyo riesgo residual es bajo. **Se compensa con el control de detección N-1 diario.**
>
> Dato favorable: `tenants_public` pasó de 20 a 49 llamadas, o sea **39 h de portal público funcionando después de B1.6**, con tráfico creciente.

**Precondición cumplida.** La ventana de observación de `pg_stat_statements` cerró con **CASO 1 — AVANZA** según el protocolo congelado: V-1 PASS *(reset intacto)*, V-2 PASS *(`tenants_public` con 20 llamadas: el flujo anónimo fue ejercitado)*, V-3 contaminación declarada y evaluada como no relevante, y **cero entradas de tablas de negocio en 48 h de uso real**.

---

### 🔴 INCIDENTE — P0-07 y R-10 aparecieron revertidos

**Al capturar la línea base de B1.6 apareció esto:**

```
tenants_public              anon=arwdDxtm    ← escritura completa
bi_citas_por_dia            anon=arwdDxtm
bi_citas_por_tratamiento    anon=arwdDxtm
bi_ingresos_por_mes         anon=arwdDxtm
bi_kpis_mes                 anon=arwdDxtm
bi_ocupacion_por_hora       anon=arwdDxtm
bi_pacientes_nuevos_por_mes anon=arwdDxtm
bi_resumen                  anon=arwdDxtm
```

**Contradice directamente dos verificaciones previas de producción:**

| Cuándo | Qué se verificó | Evidencia |
|---|---|---|
| 09/08 | Las 6 vistas `bi_*` devuelven `401` + `42501` a `anon` | curl · P0-07 |
| 15/08 | `tenants_public` → `anon=r`, sin escritura | entrada 006 |
| 20/08 | N-1 mostró las `bi_*` con solo `postgres` y `service_role` | entrada 007 |

**Entre la consulta N-1 y la línea base de B1.6 —el mismo día— los ACL volvieron a su estado original.**

**Gravedad: R-10 estuvo abierto de nuevo.** `anon` podía volver a escribir en `tenants` a través de `tenants_public`: nombre, teléfono, colores, `subdominio_generico` y `custom_domain`. Se detectó y cerró en el acto, pero **estuvo abierto un tiempo indeterminado**.

**Un detalle del propio diseño de B1.6 casi lo oculta.** El bloque `DO` excluye `tenants_public` a propósito, para no dejar el portal público sin resolver el tenant. Como consecuencia, **no revocó su escritura**. Y la consulta de verificación miraba solo `SELECT`, así que devolvió el resultado esperado con la vulnerabilidad abierta.

> **La verificación de B1.6 daba PASS con R-10 reabierto.** Se detectó solo porque la línea base se leyó entera en vez de mirar únicamente el resultado esperado.

**CAUSA: ⚪ NO VERIFICADA.** La hipótesis principal es `supabase db push`: el runbook registra que el historial de migraciones remoto estaba vacío, así que un `push` aplicaría todas las migraciones desde `remote_schema.sql` — que contiene `GRANT ALL ON TABLE … TO anon` para cada objeto. Eso restauraría exactamente lo observado. **No confirmado.** Se determina consultando `supabase_migrations.schema_migrations`.

**Si se confirma, es P0 y va antes que todo lo demás:** mientras el historial remoto esté desincronizado, cualquier `db push` puede revertir semanas de trabajo de privilegios en segundos, sin aviso.

---

**Comando.**

```sql
-- 1 · Cerrar R-10 nuevamente (de a uno)
REVOKE ALL    ON TABLE public.tenants_public FROM anon, authenticated;
GRANT  SELECT ON TABLE public.tenants_public TO   anon, authenticated;

-- 2 · B1.6 — una sola sentencia atómica, que NUNCA toca tenants_public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p')
      AND c.relname <> 'tenants_public'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', r.relname);
  END LOOP;
END $$;

-- 3 · Funciones, de a una
REVOKE ALL ON FUNCTION public.emitir_factura_con_detalle(
  uuid, uuid, uuid, integer, integer, integer, text, date, numeric,
  text, text, text, text, text, boolean, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.generar_codigo_enlace()   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sembrar_renglon_cita()    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_cobrado_cita()       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_valor_cita()         FROM PUBLIC, anon;
```

**Se usó un bloque `DO` en vez de `REVOKE ALL ON ALL TABLES … FROM anon` + `GRANT`** por el incidente de la entrada 009: el SQL Editor puede ejecutar parte de un bloque y no el resto, sin devolver error. Con dos sentencias sueltas, si corría el `REVOKE` y no el `GRANT`, **el portal público quedaba sin resolver el tenant**. El bucle es una sola sentencia atómica y excluye `tenants_public` por construcción.

**Resultado — verificado en producción.**

| Verificación | Resultado |
|---|---|
| Relaciones que `anon` puede leer | **1** — `tenants_public`, con `anon=r` |
| Relaciones con escritura para `anon` | **0 filas** |
| Funciones ejecutables por `anon` | **0 filas** |

**Verificación funcional — OK.** Confirmado por el owner: portal público, reserva de turno, enlace de paciente por token, panel completo, facturación y acreditación de puntos. **Todo funciona.**

**Hallazgos cerrados:** **R-1** *(34 tablas con `anon=arwdDxtm`)* · **R-5** *(`generar_codigo_enlace` ejecutable por `anon`)* · **R-11** *(`emitir_factura_con_detalle` con `anon=X`)*. Las 3 funciones de trigger también perdieron el `EXECUTE` de `PUBLIC`.

**Rollback.**

```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
```

Un comando, inmediato, sin datos. La línea base completa con el ACL previo de las 44 relaciones quedó registrada en la sesión.

---

### Consecuencias para el release board

| # | Qué | Prioridad |
|---|---|---|
| 1 | **Determinar qué revirtió los ACL.** Sin esto no se puede volver a usar `db push` | **P0 — nuevo, va primero** |
| 2 | Sincronizar el historial de migraciones remoto | **P0** |
| 3 | **Una verificación que solo mira el resultado esperado puede ocultar el problema.** Toda verificación de privilegios debe leer el ACL completo, no responder sí/no | **Regla nueva** |

---

## 012 · Prueba de restore, RTO medido, y el hallazgo que bloquea el lanzamiento

**Fecha:** 22/08/2026 · **Tipo:** verificación de recuperación · **Cierra:** RTO · **Abre:** B-2 confirmado

**Por qué.** El audit marcaba backups como ⚪ NO VERIFICADO. El runbook documentaba un restore probado el 22/07, pero sobre un baseline de 23 tablas cuando hoy hay 36.

**Comando.** Script nuevo `probar-restore.sh`: dump de producción → base local limpia → 24 migraciones → restore → conteos. Cronometrado de punta a punta.

**Resultado — el procedimiento funciona.**

| | |
|---|---|
| **RTO medido** | **210 s** *(3m 30s, incluyendo descarga de imágenes; en régimen ~190 s)* |
| Integridad de datos de negocio | **6 de 6 exactos** |
| Metadatos de Storage | ✅ tras `supabase link` |
| Migración de B1.6 | ✅ aplicó limpio sobre base vacía, verificación incluida |

```
citas 623 · pacientes 212 · historial_puntos 256 · pagos 31 · facturas 5 · tenant_users 2
```

Los mismos seis números en producción y en la base restaurada.

**Incidente intermedio, resuelto.** El primer intento falló al restaurar `storage.buckets` y `storage.objects`: el CLI local tenía `storage-api v1.67.8` y producción corre **v1.70.4**. El dump traía columnas que la versión local no conocía. `npx supabase link` sincronizó las versiones y el segundo intento entró limpio. **Sin eso, el restore recuperaba todo menos las fotos clínicas.**

---

### 🔴 B-2 CONFIRMADO — no existen backups automáticos

Panel de Supabase, Database → Backups:

> **Free Plan does not include project backups.**

| Control | Estado |
|---|---|
| Backups programados | **CERO** |
| PITR | **No disponible en Free** |
| **RPO real** | **INFINITO** — sin backup automático, se pierde todo desde el último dump manual |
| RTO | 210 s — **pero solo si existe un backup que restaurar** |

**Hay 212 pacientes reales en producción.** Si el proyecto se corrompe, se borra por error o hay un incidente de plataforma, **se pierden historias clínicas, citas, consentimientos firmados y facturas, sin recuperación posible.**

**Es más grave que R-18.** Un privilegio mal puesto expone datos y RLS lo contiene en parte. Esto los borra, y no hay nada que lo contenga.

**La paradoja del hallazgo:** normalmente uno encuentra backups que nadie probó. Acá hay **un procedimiento de restore probado y medido, sin backups que restaurar**.

**→ DECISIÓN DEL OWNER: ¿se contrata plan Pro antes del lanzamiento?** Da 7 días de backups programados. PITR suele ser add-on aparte y baja el RPO de 24 h a segundos.

**Mitigación provisoria:** correr `probar-restore.sh` —o solo su `db dump`— de forma periódica, guardando el archivo cifrado fuera de la máquina. Con una clínica y 1 MB de dump es viable semanalmente. Con cinco, no.

---

### 🔴 R-18 se repitió

Durante esta sesión, `bi_citas_por_dia` volvió a aparecer con `anon=arwdDxtm` — **después** de B1.6.

`anon` figura **al final del ACL**, o sea que corrió un `GRANT`. Y fue **una sola vista**, no las ocho: descarta un grant masivo y apunta a algo que tocó ese objeto en particular.

**Hipótesis principal, NO confirmada:** cuando una vista se recrea con `DROP` + `CREATE`, hereda los default privileges del rol que la crea. B1.1 revocó los de `postgres`, pero **no se pudieron revocar los de `supabase_admin`** — `postgres` no es miembro de ese rol. Y los de `supabase_admin` siguen concediendo `anon=arwdDxtm`.

Si la plataforma recrea objetos como `supabase_admin` —mantenimiento, optimizaciones— **nacen expuestos y no hay forma de impedirlo desde el proyecto.**

**Dato favorable para el diagnóstico:** `log_statement = 'ddl'`, y PostgreSQL clasifica `GRANT` como `LOGSTMT_DDL`. **Los `GRANT` se están registrando.** El log de Postgres tiene la respuesta; falta mirarlo. Lo que decide es el `user_name` de la entrada: `postgres` significa que salió del editor o del CLI; `supabase_admin` confirma la hipótesis.

**Estado: `bi_citas_por_dia` pendiente de revocar al cierre de esta entrada.**

---

**Verificación.** Conteos comparados entre producción y base restaurada: idénticos. RTO cronometrado por el script.

**Rollback.** N/A — nada se modificó en producción. La base local se descarta con `npx supabase stop`.

⚠️ **El dump contiene PII real.** Guardado con permisos `600` en `~/backups-dentaldesk`. **Borrarlo al terminar.**

---

## 013 · B1.2 + B1.3 · Rol, límite y nota obligatoria — aplicado

**Fecha:** 22/08/2026
**Migración:** `20260822130000_b1_2_b1_3_rol_limite_y_nota.sql`
**Método:** `npx supabase db push` — no el editor SQL.

### Qué se aplicó

`db push` arrastró tres migraciones pendientes en una sola corrida:

| Migración | Naturaleza |
|---|---|
| `20260820180300_cajas_diarias_privilegios.sql` | `REVOKE` no-op (B1.6 ya lo había hecho) + `GRANT` explícito a `authenticated` |
| `20260822120000_b1_6_revocar_anon_del_esquema.sql` | Idempotente — versiona lo ya aplicado desde el editor |
| `20260822130000_b1_2_b1_3_rol_limite_y_nota.sql` | **Único cambio real de comportamiento** |

Las dos primeras no alteraron nada. Se pushearon para que el historial de migraciones deje de divergir de producción.

### Por qué el push era seguro

Tres razones, en orden de peso:

1. **Impacto operativo nulo hoy.** Los dos usuarios del sistema son `admin`. Las nuevas verificaciones de rol no le quitan capacidades a nadie: empiezan a morder recién cuando exista un `odontologo` o un `staff`. El cambio se instala antes de que haya a quién romperle algo.
2. **`CREATE OR REPLACE`, con rollback disponible.** Los cuerpos previos están en `remote_schema.sql` con md5 verificado contra producción en FASE 0 *(entrada 007)*. Revertir es un `CREATE OR REPLACE`, sin datos de por medio y sin redeploy.
3. **El bloque `DO` de B1.6 funciona como red.** Si R-18 hubiera vuelto a golpear entre la verificación y el push, la migración **aborta** en vez de aplicar sobre un esquema distinto del que asumimos.

### Verificación de privilegios — ejecutada

```sql
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_debe_true,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_debe_false
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_ajustar_puntos_manual', 'fn_canjear_premio', 'tiene_rol')
ORDER BY p.proname;
```

| función | `authenticated` | `anon` |
|---|---|---|
| `fn_ajustar_puntos_manual` | ✅ `true` | ✅ `false` |
| `fn_canjear_premio` | ✅ `true` | ✅ `false` |
| `tiene_rol` | ✅ `true` | ✅ `false` |

**Los seis valores son los esperados.** `authenticated` conserva `EXECUTE` —la app no se rompe— y `anon` no lo tiene.

**Y hay un dato que no es redundante con B1.6.** `has_function_privilege('anon', …)` devuelve `false` **incluyendo lo que `anon` heredaría de `PUBLIC`**. Que dé `false` prueba que el `REVOKE ALL … FROM PUBLIC` de esta migración surtió efecto. Bajo **R-17** los default privileges no protegen nada en este entorno: los `REVOKE` explícitos son la única defensa, y acá quedó demostrado que esa defensa opera.

### Cobertura de tests

`src/lib/fidelizacion-roles.test.ts` — 28 tests. Harness PGlite propio con el esquema real y 5 usuarios sembrados cubriendo los 4 roles en 2 tenants.

**Cuatro de esos 28 prueban el estado *previo*:** cargan los cuerpos viejos desde `remote_schema.sql` y verifican que antes un odontólogo sí podía ajustar, que 5000 puntos pasaban sin límite y que la nota `NULL` se rellenaba sola. Si esos cuatro no fallaran contra el estado anterior, los otros 24 no probarían nada — estarían verificando una restricción que ya existía.

Suite completa: **543 tests en 25 archivos, todos verdes.** `tsc --noEmit` en 0.

### Dos hallazgos del harness — ninguno del código

1. **`permission denied for table pacientes`.** `authenticated` no tenía privilegios sobre las tablas en PGlite. Supabase se los da por defecto; había que replicarlo en el harness.
2. **`permission denied for schema public`.** Un `SET ROLE authenticated` global rompía el `CREATE OR REPLACE FUNCTION` de las migraciones. Se acotó el cambio de rol a cada llamada: fuera de `comoUsuario()`, todo corre como superusuario.

Ambos anotados dentro del test, para que nadie los rediagnostique.

---

**Verificación.** Privilegios: ejecutada y correcta (tabla de arriba). **Funcional: PENDIENTE** — las 5 pruebas manuales del pie de la migración no se corrieron todavía.

**Rollback.** `CREATE OR REPLACE` con los cuerpos de `remote_schema.sql`. Total, sin datos, sin redeploy. `CREATE OR REPLACE` preserva el ACL, así que revertir no altera privilegios.

⚠️ **Esta entrada NO cierra B1.2/B1.3.** Los privilegios están verificados; el *comportamiento* no. Hasta que las 5 pruebas manuales pasen, el estado es **aplicado, no confirmado**.

---

## 014 · Fidelización apagada — decisión del owner

**Fecha:** 22/08/2026
**Decisión:** Gabriel — sacar el Club de Puntos del producto.
**Implementación:** ocultar ya, borrar después de tener backups.

### El dato que originó la decisión

Consultado en producción, no inferido:

| | |
|---|---|
| Puntos emitidos en 2 meses | 11.616 |
| Canjes en toda la historia | **0** |
| Premio más barato | 800 puntos |
| Saldo máximo del sistema | **475** |
| Pacientes que podían canjear | **0 de 212** |

El programa acumulaba bien y apuntaba a una meta inalcanzable. A ~59 puntos/mes para un paciente activo, el primer premio quedaba a más de un año.

**Cero canjes no era desinterés: era un catálogo fuera de alcance.**

### Por qué ocultar y no borrar

Borrar exigía `DROP` de `historial_puntos` y `premios`, cirugía sobre `fn_aprobar_asistencia` y `fn_registrar_inasistencia` —que también manejan asistencia— y 4 columnas de `pacientes`. Todo eso **sin backups** (blocker #1, entrada 012): un error no tiene vuelta atrás sobre datos de 212 pacientes reales.

Ocultar da el mismo resultado visible hoy, es reversible con un booleano, y no cierra la puerta al `DROP` cuando exista PITR.

### 🔴 Hallazgo · la pestaña no era solo puntos

La pestaña **"🪙 Club de Puntos"** contenía, en su Sección 1, el flujo de **cobro y facturación**:

```
handleAprobarAsistencia()
  → registrarPago(formaPago, monto, requiereFactura)   ← cobro + AFIP
  → aprobarAsistenciaAction()                          ← asistencia + puntos
```

**Ocultar la pestaña entera habría dejado a la clínica sin la pantalla donde carga un pago y decide si se factura.** El nombre decía "puntos"; el contenido era plata.

Se partió: Sección 1 se queda y se renombra la pestaña a **"💰 Cobros y Visitas"**; Secciones 2, 3 y 4 —canje, ajuste manual, historial— quedan detrás del flag.

### Qué se hizo

Un único punto de verdad: **`src/lib/fidelizacion-flag.ts`** → `FIDELIZACION_HABILITADA = false`.

| Archivo | Cambio |
|---|---|
| `src/lib/fidelizacion-flag.ts` | **Nuevo.** El flag y el porqué |
| `pacientes/[id]/page.tsx` | Secciones 2-4 tras el flag; pestaña renombrada; textos de puntos |
| `paciente/[token]/page.tsx` | Tarjeta "Puntos VIP" oculta |
| `api/paciente/[token]/route.ts` | **Deja de emitir `puntos` en el JSON** |
| `dashboard/page.tsx` | 3 textos que mencionaban puntos |

**La baja del portal es en el servidor, no en la UI.** Ocultar solo la tarjeta habría dejado el saldo viajando en el JSON, visible en las herramientas del navegador. Con el flag apagado el campo no se emite.

### Qué NO se tocó

**Cero cambios en la base.** Tablas, funciones y columnas intactas; el ledger de los 212 pacientes está completo. La acumulación sigue corriendo: no cuesta nada, no se le muestra a nadie, y evita un hueco de meses si el programa se reactiva con un catálogo calibrado.

B1.2/B1.3 —aplicados en la entrada 013— siguen vigentes y no se revierten. Protegen funciones que hoy nadie puede invocar desde la UI, y eso está bien: si el flag vuelve a `true`, las guardas ya están puestas.

### Verificación

- `npx tsc --noEmit` → **0 errores en los archivos tocados**
- Suite completa → **543 tests en 25 archivos, todos verdes**
- `git diff` → **`src/app/agenda/page.tsx` no fue modificado por este trabajo**

⚠️ **`tsc` reporta 2 errores en `src/app/agenda/page.tsx`** (JSX sin cerrar, líneas 1663 y 1704). **No son de este trabajo:** ese archivo tiene 63 inserciones y 173 borrados sin commitear, ajenos a P0-05, y al inicio de esta sesión `tsc` daba 0. Está a medio editar por Gabriel. **No se tocó** — sigue estando fuera de alcance.

---

**Verificación.** Tipos y tests, arriba. **Falta la visual:** abrir la ficha de un paciente y el portal con un token real.

**Rollback.** `FIDELIZACION_HABILITADA = true`. Nada más — no hay migración ni datos que restaurar.

**Pendiente que esto no cierra.** Si el programa se reactiva, el catálogo hay que recalibrarlo: con saldo máximo 475, el premio más barato debería costar entre 200 y 300, no 800. Y **DO-2 fijó el límite de ajuste manual en 500 mirando solo el tratamiento más grande (390), sin considerar el catálogo** — si un ajuste tiene que alcanzar para un premio, el número es otro. **DECISIÓN DEL OWNER**, para cuando corresponda.

---

## 015 · B1.4 · El borrado que mentía — y un patrón que lo excede

**Fecha:** 22/08/2026
**Autorización:** DO-5 — solo `src/app/pacientes/page.tsx`.

### El defecto

```ts
const {error} = await supabase.from('pacientes').delete().eq('id',sel.id)
if(error) return msg('Error al eliminar: '+error.message,'error')
msg('Paciente eliminado')          // ← se ejecutaba aunque no se borrara nada
```

**RLS no lanza excepción cuando deniega un DELETE.** Devuelve `error = null` y cero filas. Sin pedir las filas de vuelta, un borrado bloqueado es indistinguible de uno exitoso.

Consecuencia: la persona leía *"Paciente eliminado"*, se iba, y el paciente seguía en la base. Sobre historia clínica, esa creencia falsa es peor que un error visible.

### La corrección

`.select('id')` después del `delete()`. PostgREST devuelve las filas efectivamente borradas; cero filas significa que no se borró nada.

El modal **queda abierto** cuando falla, a propósito: la acción destructiva no se completó y el usuario tiene que ver sobre qué paciente falló.

### 🔴 Hallazgo · el mismo defecto en otros 13 lugares

Buscando el patrón apareció algo más grande: **13 escrituras que descartan el resultado por completo** — ni `error` ni filas. Nueve están en `finanzas/page.tsx`.

| Archivo | Operaciones | Qué toca |
|---|---|---|
| `finanzas/page.tsx` | **9** | `costos_fijos`, `ingresos_manuales`, `egresos_manuales`, `meta_mensual` |
| `dashboard/page.tsx` | 2 | estado de citas, `logs_envios` |
| `api/facturacion/emitir` | 1 | datos fiscales del paciente |
| `api/send-recordatorios` | 1 | `recordatorios_log` |

**Son peores que el que acabo de corregir.** El borrado de pacientes al menos miraba `error`. Estos no miran nada:

```ts
await supabase.from('ingresos_manuales').delete().eq('id', id); msg('Ingreso eliminado'); load()
```

Ahí un fallo de red, una violación de constraint o una denegación de RLS producen todos el mismo cartel verde. Y es plata: ingresos y egresos de caja. Un ingreso que se cree registrado y no se guardó deja la caja sin cuadrar, y nadie sabe por qué.

`load()` refresca después, así que la lista termina mostrando la verdad — pero **el mensaje ya mintió**, y nadie vuelve a leer una lista después de que le confirmaron la operación.

**DECISIÓN DEL OWNER:** corregir las 13 excede DO-5, que autoriza únicamente `pacientes/page.tsx`. No se tocaron. Las 9 de `finanzas` son las que manejan dinero.

---

**Verificación.** `tsc --noEmit` → 0 errores fuera de `agenda/page.tsx` *(roto por trabajo ajeno, ver entrada 014)*. Suite: **543 tests verdes**.

**Falta la manual:** intentar borrar un paciente de otro tenant y confirmar que ahora avisa que falló.

**Rollback.** Quitar `.select('id')` y el bloque de cero filas. Un archivo, sin datos de por medio.
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

## Próximo paso

### 🔴 Bloquean el lanzamiento

| | Qué | Quién |
|---|---|---|
| 1 | **`agenda/page.tsx` está roto** — JSX sin cerrar, líneas 1663 y 1704. Sin esto `next build` falla y no hay deploy | Gabriel |
| 2 | **No existen backups.** Plan Pro + PITR. 212 pacientes, RPO infinito | Gabriel |
| 3 | **R-18 sin explicar** — Logs → Postgres, filtrar `GRANT`, mirar `user_name` | Gabriel |
| 4 | **Storage nunca auditado** — fotos clínicas. No sabemos si las policies están bien *ni* mal | Claude prepara, Gabriel corre |

### 🟡 Verificaciones manuales pendientes

| | Qué | Origen |
|---|---|---|
| 1 | Marcar asistencia con cobro desde la ficha → sigue registrando el pago | Entradas 013 y 014 |
| 2 | Abrir la ficha de un paciente y el portal con token real → sin rastro de puntos | Entrada 014 |
| 3 | Intentar borrar un paciente de otro tenant → ahora avisa que falló | Entrada 015 |

*Las manuales #2, #3 y #4 de la entrada 013 —ajuste de 501, nota corta, canje— quedaron retiradas: la UI que las alcanzaba está oculta desde la entrada 014.*

### ⚪ Después del lanzamiento

Multirol (DO-6) · jerarquía `admin→owner` (R-2) · roles reales en staging · suite IDOR dinámica · export y baja de tenant · `FORCE RLS` (R-9) · `search_path` de 9 funciones (R-12) · las 13 escrituras que descartan el resultado *(entrada 015)* · recalibrar el catálogo de premios si fidelización vuelve *(entrada 014)*

### Sin commitear

Todo el trabajo de P0-05 sigue local. `agenda/page.tsx` y `globals.css` tienen cambios ajenos a este trabajo.

---

## Reglas de esta bitácora

1. Una entrada por paso, numerada, en orden cronológico. **No se reescriben las anteriores.**
2. Se escribe **después** de ejecutar y verificar.
3. Toda entrada lleva **rollback**, aunque sea `N/A`.
4. Los incidentes se registran igual que los éxitos.
5. Si una verificación falla, se registra la falla — **no se borra el intento**.
6. Los comandos van **literales**, no parafraseados.
