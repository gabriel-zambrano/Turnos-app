# P0-05 v2 · Trabajo preparatorio — NO IMPLEMENTADO

**Fecha:** 15/08/2026
**Estado:** 🟠 **NOTAS. Nada de esto está implementado ni debe implementarse.**

---

## Qué es este documento y qué no es

**Es** un depósito de tres piezas de diseño cuya evidencia **ya está cerrada** y que no dependen de los datos vivos. Se registran acá para no perderlas y para que se incorporen al diseño v2 cuando llegue el momento.

**No es** el diseño P0-05 v2. Ese se escribe **después** de A-1, A-2, A-3 y A-7, y **después** de DO-1 a DO-8.

### Regla vigente

> **Ninguna implementación antes de cerrar FASE 0.**

Nada de lo que sigue toca el repositorio. No hay migraciones, ni cambios en `src/`, ni cambios en tests, ni cambios de estrategia aplicados. **Son notas.**

### Cadena de evidencia

```
REPO → DATOS VIVOS → DECISIONES → DISEÑO → IMPLEMENTACIÓN → VERIFICACIÓN → BITÁCORA
  ▲                                                    
  └── este documento vive acá, y solo acá
```

Las tres piezas se apoyan **exclusivamente en evidencia del repositorio**, ya verificada. Ninguna asume nada de producción. Por eso pueden documentarse sin romper la cadena: no saltan etapas, se quedan en la primera.

**Siguiente paso, sin cambios:** correr `P0-05_FASE0_LECTURA_v2.sql`. Prioridad absoluta **N-1**.

---

# 1 · B1.4 — Mensaje de éxito falso en el borrado

## Estado observado

Verificado en `src/app/pacientes/page.tsx:136-143`:

```ts
async function saveBorrar() {
  if(!sel) return
  setSaving(true)
  const {error} = await supabase.from('pacientes').delete().eq('id',sel.id)
  setSaving(false)
  if(error) return msg('Error al eliminar: '+error.message,'error')
  setModal(null); msg('Paciente eliminado'); load()
}
```

**El éxito se infiere de la ausencia de error.** No se mira cuántas filas se borraron.

Hoy eso no falla nunca, porque la política vigente es `FOR ALL` sin distinción de rol: quien pertenece al tenant borra.

## Por qué B1.4 lo rompe

Los dos mecanismos de denegación de PostgreSQL producen respuestas **opuestas**:

| Mecanismo | Respuesta | Qué ve el usuario |
|---|---|---|
| FK violada *(`presupuestos`)* | excepción `23503` | `Error al eliminar: …` ✅ |
| **RLS deniega** | **0 filas, `error = null`** | **"Paciente eliminado"** ❌ |

RLS **no lanza excepción**. Filtra filas. Un `DELETE` que no alcanza ninguna fila es un `DELETE` exitoso que borró cero.

**Consecuencia si B1.4 se aplica tal cual:** un odontólogo intenta borrar un paciente, la política lo deniega, y la UI le dice *"Paciente eliminado"*. El paciente sigue ahí. El usuario cree que hizo algo que no hizo.

**Es peor que no aplicar B1.4.** Un control que deniega en silencio y reporta éxito produce una creencia falsa sobre el estado de los datos clínicos.

## Comportamiento deseado

*"Paciente eliminado"* solo cuando efectivamente se eliminó un paciente.

## Cambio propuesto — NO IMPLEMENTADO

**a) Pedir el conteo de filas afectadas.** El cliente Supabase no lo devuelve por defecto; hay que solicitarlo explícitamente. La forma exacta se define al implementar, contra la versión de `@supabase/supabase-js` del proyecto — **no la fijo acá para no escribir código sin verificar la API**.

**b) Distinguir tres desenlaces, no dos:**

| Desenlace | Condición | Mensaje |
|---|---|---|
| Borrado | sin error, filas > 0 | `Paciente eliminado` |
| **Denegado por permisos** | **sin error, filas = 0** | *"No tenés permiso para eliminar pacientes."* |
| Error de base | error presente | Mensaje traducido |

**c) Traducir el error de FK.** Hoy se muestra `error.message` crudo de PostgREST, en inglés, con nombres de tabla y constraint:

```
update or delete on table "pacientes" violates foreign key constraint
"presupuestos_paciente_id_fkey" on table "presupuestos"
```

Detectar `code === '23503'` y mostrar algo comprensible. **El texto exacto es decisión del owner.**

## Test correspondiente — NO IMPLEMENTADO

**Dónde va importa.** Es una regresión de UI, no de RLS. Los tests PGlite prueban la base, no el componente. Este test tiene que verificar **que la UI distingue 0 filas de error**, y eso vive del lado del cliente.

Casos mínimos:

| # | Escenario | Esperado |
|---|---|---|
| 1 | `error = null`, filas = 1 | `Paciente eliminado` |
| 2 | **`error = null`, filas = 0** | **mensaje de permiso denegado, NO éxito** |
| 3 | `error.code = '23503'` | mensaje traducido, no el crudo |
| 4 | Otro error | `Error al eliminar: …` |

**El caso 2 es el que existe para esto.** Debe fallar contra el código actual.

## Alcance y contención

⚠️ **Esto toca `src/`.** La regla de contención de Fase 1 dice *"cero archivos de `src/` modificados"*.

**→ DECISIÓN DEL OWNER:** o B1.4 se aplica junto con el arreglo de la UI y se acepta la excepción, o B1.4 se difiere hasta que la corrección esté autorizada. **Aplicar B1.4 sin el arreglo no es una tercera opción defendible.**

---

# 2 · B1.7 — Guardas de patrón

## Estado observado

Existe **una** guarda, en `src/lib/vistas-bi.test.ts:388`:

```ts
if (/\banon\b/i.test(destinatarios) && /\bbi_\w+/i.test(objeto)) { … }
```

Solo mira **vistas `bi_*`** y solo el rol **`anon`**, y **excluye `remote_schema.sql`**.

**No habría detectado ninguno de los tres hallazgos:** R-1 (12 tablas sin `GRANT`), R-5 (`generar_codigo_enlace` sin `REVOKE`), R-2 (`role` sin whitelist).

Desde la entrada 002 el archivo está versionado y corre en CI. Antes ni siquiera eso.

## Comportamiento deseado

Que un objeto nuevo mal protegido **no llegue a producción sin que alguien lo haya decidido a propósito**.

## Las tres guardas — NO IMPLEMENTADAS

### G-1 · Tabla o vista nueva con `GRANT` indebido

Por cada `CREATE TABLE` / `CREATE VIEW` / `CREATE MATERIALIZED VIEW` en `supabase/migrations/`:

- exigir `GRANT` explícito **o** ausencia deliberada documentada con un comentario reconocible;
- **fallar** si concede a `anon` sin justificación en el mismo archivo;
- **fallar** si no declara `ENABLE ROW LEVEL SECURITY`.

*Origen: R-1. Las 12 tablas sin `GRANT` habrían aparecido.*

### G-2 · Función nueva sin `REVOKE` apropiado

Por cada `CREATE FUNCTION` / `CREATE OR REPLACE FUNCTION`:

- exigir `REVOKE ALL … FROM PUBLIC` en el mismo archivo;
- exigir al menos un `GRANT EXECUTE` explícito;
- **fallar** si es `SECURITY DEFINER` sin `SET search_path`.

*Origen: R-5. `generar_codigo_enlace` es la única de 14 sin `REVOKE`.*

### G-3 · Vocabulario de `role`

Por cada literal que se inserte o compare contra `tenant_users.role`, en migraciones **y en `src/`**:

- **fallar** si el valor está fuera del vocabulario acordado;
- **fallar** si una ruta de API inserta `role` **sin lista blanca**.

*Origen: R-2. `/api/equipo/invitar:14,96,118` toma `role` del request y lo inserta con `service_role`.*

**Precondición:** G-3 depende de **DO-6**. Sin el modelo de `owner` cerrado no hay vocabulario que validar.

## Limitación — hay que decirla en el propio test

**Las tres guardas leen el repositorio. No leen PostgreSQL.**

| Detectan | No detectan |
|---|---|
| Una migración nueva que concede de más | Un `GRANT` aplicado a mano desde el SQL Editor |
| Una función nueva sin `REVOKE` | Un privilegio heredado de `ALTER DEFAULT PRIVILEGES` |
| Un rol fuera del vocabulario | Un objeto creado fuera de las migraciones |

**No sustituyen la verificación de ACL contra PostgreSQL.** Este proyecto ya tiene la prueba: 20 archivos `.sql` sueltos en la raíz aplicados a mano, y el `REVOKE` de las vistas `bi_*` del 09/08 no está en ninguna migración. **Un CI en verde no significa que producción esté bien.**

**Esa advertencia debe ir escrita dentro del archivo de test**, no solo en la documentación. Quien lo lea dentro de un año tiene que ver el límite ahí.

**Complemento obligatorio:** las consultas `N-1`, `N-2` y `A-2.6` corridas periódicamente contra producción. **G-1 a G-3 detectan intenciones; solo el ACL vivo detecta hechos.**

---

# 3 · Estrategia de tests

## Estado observado

| Herramienta | Qué prueba hoy | Archivos |
|---|---|---|
| PGlite | RLS funcional, aislamiento por tenant, migraciones | `tenant-isolation` (84), `multitratamiento` (31), `enlace-corto` (12), `vistas-bi` (20) |
| Unitarios | Lógica pura | 17 archivos |
| Integración SQL | **nada** | — |

**471 tests, 21 archivos, `tsc` exit 0.**

## El límite estructural de PGlite

Verificado en `src/lib/tenant-isolation.test.ts:104-106`:

```ts
for (const t of TABLAS) {
  await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO authenticated;`)
}
```

**El harness concede los privilegios él mismo.**

Para probar RLS eso es correcto —hay que tener el privilegio para que la política sea lo que decide—. Pero significa que **el harness nunca puede detectar un privilegio faltante o sobrante**. La propiedad que B1.1 y B1.6 protegen es literalmente invisible ahí.

Un test de B1.1 en PGlite daría verde sin probar nada.

## Reparto propuesto — NO IMPLEMENTADO

| Herramienta | Sí | No |
|---|---|---|
| **PGlite** | RLS funcional, aislamiento, lógica de funciones, semántica de migraciones | ACL, default privileges, PostgREST, Storage, roles reales de Supabase |
| **Integración SQL** | **B1.1, B1.6**, ACL vivo, `pg_default_acl`, RLS global, triggers | Lógica de negocio |
| **Unitarios** | Guardas de patrón G-1 a G-3, lógica pura | Cualquier cosa que necesite una base |
| **Manual** | Mensajes de la UI, flujos completos | Lo automatizable |

**Regla:** *si la propiedad a proteger es un privilegio, no se prueba en PGlite.*

## Los tests que deben fallar a propósito

La entrada 003 agregó tres tests que **fijan el estado actual** en vez de probar una defensa:

| Test | Qué fija | Debe fallar cuando |
|---|---|---|
| *una fila sin rol nace admin* | `DEFAULT 'admin'` vigente | **aterrice B1.5a** |
| *no hay CHECK: admite cualquier texto* | R-2 — la base no frena un rol arbitrario | **aterrice B1.5b** |
| *el rol no interviene en el aislamiento* | Que agregar la columna fue inerte | nunca — es regresión |

**Los dos primeros están para romperse.** Cuando fallen, la falla **es la confirmación de que el cambio llegó**, no un test roto que haya que arreglar.

**Hay que dejarlo escrito en el propio archivo.** Ya está en el comentario del bloque `describe`, pero conviene repetirlo en el diseño v2: alguien que vea el CI en rojo tras aplicar B1.5a tiene que entender en diez segundos que es lo esperado. Si no, lo va a "arreglar" cambiando el valor, y se pierde la señal.

---

# Resumen de estado

| Pieza | Evidencia | Diseño | Implementación | Bloqueada por |
|---|---|---|---|---|
| **B1.4 · mensaje falso** | 🟢 cerrada | 🟠 en notas | ❌ **no** | Decisión de contención + A-7 |
| **B1.7 · guardas** | 🟢 cerrada | 🟠 en notas | ❌ **no** | G-3 depende de DO-6 |
| **Estrategia de tests** | 🟢 cerrada | 🟠 en notas | ❌ **no** | — |

**Nada de esto entra al repositorio hasta que FASE 0 esté cerrada y vos lo apruebes explícitamente.**

---

## Lo que sigue, sin cambios

1. Correr **`P0-05_FASE0_LECTURA_v2.sql`**. Prioridad absoluta **N-1**.
2. Clasificar A-1, A-2, A-3, A-7 → confirmado / descartado / inconcluso / requiere decisión.
3. Cerrar o mantener abiertos los bloqueantes.
4. Plantear DO-1 a DO-8.
5. **Recién entonces** escribir P0-05 v2 definitivo, incorporando estas tres piezas.
6. **Solo con aprobación explícita**, empezar B1.x.

---

*Documento de notas. Ningún archivo del repositorio modificado. Ninguna migración. Ningún cambio en `src/`, en tests, en políticas ni en funciones. Ningún commit. Nada ejecutado contra Supabase.*
