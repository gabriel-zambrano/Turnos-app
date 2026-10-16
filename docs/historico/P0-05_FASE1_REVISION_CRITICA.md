# P0-05 · FASE 1 — Revisión crítica del diseño

**Fecha:** 14 de agosto de 2026
**Estado:** revisión. **Ningún archivo modificado, ninguna migración creada, nada ejecutado sobre Supabase.**
**Ninguna decisión pendiente asumida.**

> Intenté romper el diseño de `P0-05_FASE1_DISENO.md`. Lo rompí en cinco puntos.
> Tres son errores míos de la entrega anterior. Dos son bypasses que no había encontrado.

---

## Resumen de lo que se rompió

| # | Qué | Gravedad | Efecto sobre el diseño |
|---|---|---|---|
| **R-1** | **12 tablas no tienen `GRANT` explícito.** Afirmé lo contrario | **Crítica** | B1.1 no las protege. Falta una tarea |
| **R-2** | **`role` es entrada de usuario sin whitelist** en `/api/equipo/invitar` | **Alta** | Escalada de privilegios. B1.5 no la cierra |
| **R-3** | **El modelo de `role` no representa "dueño que además es odontólogo"** — que es tu caso | **Alta** | B1.5 cementaría un modelo que ya no alcanza |
| **R-4** | **El harness PGlite no tiene columna `role`** y concede DELETE explícitamente | **Alta** | Los 27 tests no corren. Dos darían falso positivo |
| **R-5** | **`generar_codigo_enlace` es `SECURITY DEFINER` ejecutable por `anon`.** La clasifiqué como no-DEFINER | Baja | Corrige el inventario |

Además: el mapa de CASCADE de §B.2 estaba **incompleto** — faltaban cuatro tablas, dos de ellas sobreviven con PII.

---

# 1 · DEFAULT PRIVILEGES

## 1.1 · Lo que afirmé y era falso

En `P0-05_FASE1_DISENO.md` §A.2 escribí:

> *"Nada existente se rompe. Las 16 tablas actuales tienen sus grants explícitos en el dump (`remote_schema.sql:1660-1880`)."*

**Es falso.** Verifiqué tabla por tabla, cruzando cada `CREATE TABLE` de todas las migraciones contra cada `GRANT`:

```
35 tablas creadas · 23 con GRANT explícito · 12 SIN GRANT explícito
```

**Las 12 sin `GRANT` explícito:**

| Tabla | Migración que la crea | Contenido |
|---|---|---|
| `pagos` | `20260804120000_pagos_y_multitratamiento` | **Cobros** |
| `facturas` | `20260723180351_arca` | **Comprobantes fiscales** |
| `factura_items` | `20260804120000` | **Detalle fiscal** |
| `factura_pagos` | `20260804120000` | **Imputación de cobros** |
| `tratamiento_items` | `20260804120000` | **Clínico + importes** |
| `arca_config` | `20260723180351_arca` | **Config AFIP** |
| `consentimientos_firmados` | `20260723190856_consentimientos` | **PII + firma + IP** |
| `plantillas_consentimiento` | `20260723190856` | Plantillas |
| `crm_campanas` | `20260724171401` | Campañas |
| `crm_envios` | `20260724171401` | **Contactos enviados** |
| `enlaces_turno` | `20260806160000` | **Códigos de acceso** |
| `ingresos_manuales_duplicados_respaldo` | `20260805140000` | **Respaldo financiero** |

### Por qué importa

Estas 12 tablas se crearon **después** del dump `remote_schema.sql`. Nadie les escribió un `GRANT`. **Recibieron sus privilegios del default privilege de la línea 1905** — `GRANT ALL ON TABLES TO anon`.

**Hoy, `anon` tiene `GRANT ALL` sobre las 12.** Lo único que las protege es RLS.

Es exactamente el mismo mecanismo que expuso las vistas `bi_*`. La diferencia es que las vistas **no tenían RLS** y las tablas **sí**.

### Verifiqué que RLS esté activa en las 12

| Tabla | RLS | Políticas | Estado |
|---|:---:|:---:|---|
| `pagos` | ✅ | 1 | Protegida |
| `facturas` | ✅ | 2 | Protegida |
| `factura_items` | ✅ | 1 | Protegida |
| `factura_pagos` | ✅ | 1 | Protegida |
| `tratamiento_items` | ✅ | 1 | Protegida |
| `arca_config` | ✅ | 2 *(incl. rol)* | Protegida |
| `consentimientos_firmados` | ✅ | 2 | Protegida |
| `plantillas_consentimiento` | ✅ | 2 | Protegida |
| `crm_campanas` | ✅ | 2 *(incl. rol)* | Protegida |
| `crm_envios` | ✅ | 1 | Protegida |
| `enlaces_turno` | ✅ | **0** | **Cerrada por ausencia** |
| `ingresos_manuales_duplicados_respaldo` | ✅ | 1 | Protegida |

**Ninguna está desprotegida hoy.** `enlaces_turno` con RLS y cero políticas deniega todo a quien no sea dueño de la tabla — falla cerrada, que es lo correcto para una tabla de credenciales.

**Pero el margen es de una sola capa.** Si mañana alguien agrega una política mal escrita, o crea una tabla y se olvida del `ENABLE ROW LEVEL SECURITY`, esa tabla queda legible desde internet sin autenticar. Es el escenario `bi_*` otra vez.

### Respuestas puntuales a lo que pediste

**¿Revocar TABLES/FUNCTIONS para `anon` rompe algún flujo existente?**

**No.** Evidencia:

1. `ALTER DEFAULT PRIVILEGES` **solo afecta objetos futuros**. Las 35 tablas existentes conservan su ACL actual, tengan `GRANT` explícito o heredado.
2. El portal público (`/t/[codigo]`, `/agendar`, `/paciente/[token]`, `/reserva/[slug]`) accede **siempre por API con `service_role`**, no con `anon`. Lo verifiqué: las únicas lecturas del navegador sin sesión van contra `tenants_public`, que tiene `GRANT` explícito.
3. Las 8 llamadas `.rpc()` del código invocan 6 funciones, **todas con `REVOKE ALL … FROM PUBLIC` explícito**. Ninguna depende del default.

**¿Las tablas existentes tienen `GRANT` explícito?**

**No — 12 de 35 no lo tienen.** Es el hallazgo R-1.

**¿Alguna funcionalidad depende de una función pública sin `GRANT` explícito?**

Inventarié las 8 llamadas `.rpc()` del repositorio:

| Función | Llamada desde | Cliente | `REVOKE FROM PUBLIC` |
|---|---|---|:---:|
| `fn_aprobar_asistencia` | `actions/fidelizacion.ts:9` | cookies → `authenticated` | ✅ |
| `fn_registrar_inasistencia` | `actions/fidelizacion.ts:30` | cookies → `authenticated` | ✅ |
| `fn_canjear_premio` | `actions/fidelizacion.ts:52` | cookies → `authenticated` | ✅ |
| `fn_ajustar_puntos_manual` | `actions/fidelizacion.ts:78` | cookies → `authenticated` | ✅ |
| `emitir_factura_con_detalle` | `api/facturacion/emitir:385` | `authenticated` | ✅ |
| `emitir_enlace_turno` | `lib/turno-publico.ts:196` | `service_role` | ✅ |
| `get_tenant_admin_email` | `api/reserva/crear:218`, `api/daily-briefing:70` | `service_role` | ✅ |
| `crear_tenant` | `api/admin/tenants:112` | `service_role` | ✅ |

**Ninguna funcionalidad depende del default privilege.** Revocar `FUNCTIONS` de `anon` y de `authenticated` no rompe nada existente. **Confirmado con evidencia.**

**¿Qué impacto real tendría diferir `TABLES FROM authenticated`?**

Ninguno inmediato — no toca objetos existentes. El impacto es **de proceso**: cada tabla que agregue P0-01, P0-05 o P0-06 seguiría naciendo con `GRANT ALL` para `authenticated`, que es lo que hoy hace que RLS sea el único control.

Como en Fase 2 vamos a poner RLS por rol sobre esas tablas igual, diferirlo no deja un hueco nuevo: deja el hueco que ya existe.

**Recomendación.**

| Statement | Fase | Motivo |
|---|:---:|---|
| `REVOKE ALL ON TABLES FROM anon` | **1** | Cero dependencias verificadas. Cierra la causa raíz de P0-07 |
| `REVOKE ALL ON FUNCTIONS FROM anon` | **1** | Cero dependencias verificadas |
| `REVOKE ALL ON FUNCTIONS FROM authenticated` | **1** | Falla ruidosa en desarrollo (`permission denied for function`) |
| `REVOKE ALL ON TABLES FROM authenticated` | **2** | Falla silenciosa en producción: la pantalla carga vacía, no tira error visible |

Mantengo la recomendación de diferir el cuarto, **ahora con una razón más fuerte**: mientras B1.6 (abajo) no esté hecho, revocarlo daría una falsa sensación de cierre sobre 12 tablas que ya están concedidas.

## 1.2 · Tarea faltante — B1.6

El diseño no tenía tarea para las 12 tablas. **La necesita.**

```
REVOKE ALL ON TABLE <las 12> FROM anon;
```

`authenticated` **no se toca** — 5 de las 12 se consultan desde el navegador.

**Riesgo:** ninguno verificado. El portal público no lee ninguna de las 12 como `anon`.
**Verificación previa obligatoria:** `curl` sin autenticar contra las 12 antes y después.

---

# 2 · Límite de `fn_ajustar_puntos_manual`

## 2.1 · No puedo darte los números

Pediste máximo histórico, percentiles, conteos e impacto económico **antes** de proponer un límite. **No tengo acceso a la base.** Toda la revisión es lectura del repositorio.

**No voy a estimar esos números.** Cualquier percentil que escribiera sería inventado, y me pediste explícitamente que no lo haga.

**Ejecutá esto y te propongo el límite con los datos a la vista:**

```sql
-- A · Distribución de ajustes manuales
SELECT
  count(*)                                                   AS total,
  max(abs(puntos_afectados))                                 AS maximo,
  round(avg(abs(puntos_afectados)))                          AS promedio,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY abs(puntos_afectados)) AS p50,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY abs(puntos_afectados)) AS p90,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY abs(puntos_afectados)) AS p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY abs(puntos_afectados)) AS p99,
  count(*) FILTER (WHERE abs(puntos_afectados) >  100)       AS mayores_100,
  count(*) FILTER (WHERE abs(puntos_afectados) >  250)       AS mayores_250,
  count(*) FILTER (WHERE abs(puntos_afectados) >  500)       AS mayores_500,
  count(*) FILTER (WHERE abs(puntos_afectados) > 1000)       AS mayores_1000
FROM historial_puntos
WHERE tipo_movimiento IN ('ajuste_manual','ajuste_reverso');

-- B · Los 20 más grandes, con su nota (para juzgar legitimidad)
SELECT creado_en::date, puntos_afectados, saldo_resultante,
       tipo_movimiento, left(coalesce(nota,'(sin nota)'), 90) AS nota
FROM historial_puntos
WHERE tipo_movimiento IN ('ajuste_manual','ajuste_reverso')
ORDER BY abs(puntos_afectados) DESC
LIMIT 20;

-- C · ¿Cuántos ajustes vienen sin nota real?
SELECT count(*) FILTER (WHERE nota IS NULL
                          OR trim(nota) = ''
                          OR nota = 'Ajuste manual de puntos') AS sin_nota_util,
       count(*)                                                AS total
FROM historial_puntos
WHERE tipo_movimiento IN ('ajuste_manual','ajuste_reverso');

-- D · Magnitud comparativa: cuánto se gana por vía legítima
SELECT tipo_movimiento, count(*), max(abs(puntos_afectados)) AS maximo,
       round(avg(abs(puntos_afectados))) AS promedio
FROM historial_puntos GROUP BY 1 ORDER BY 2 DESC;

-- E · Parámetros económicos vigentes
SELECT tenant_id, ars_por_punto, ars_valor_canje, racha_bonus_puntos
FROM config_fidelizacion;
```

**Sobre la consulta C:** hay un detalle del código que la hace necesaria. La función actual hace `COALESCE(p_nota, 'Ajuste manual de puntos')` — **inventa la nota cuando viene `NULL`**. Así que hoy no hay forma de distinguir "no puso nota" de "puso justo ese texto". La consulta C mide cuánto del histórico quedaría fuera si la nota pasa a ser obligatoria.

## 2.2 · Cómo se convierte en pesos

Del esquema, valores por defecto de `config_fidelizacion`:

```
ars_por_punto      = 1000    → se gana 1 punto por cada $1.000 de tratamiento
ars_valor_canje    =   50    → cada punto vale $50 al canjear
racha_bonus_puntos =  150    → bonus por racha de 3 asistencias
```

**Fórmula:** `impacto_ARS = puntos × 50`

| Ajuste | Vale al canjear | Equivale a un tratamiento de |
|---|---|---|
| 100 pts | $5.000 | $100.000 |
| 250 pts | $12.500 | $250.000 |
| 500 pts | $25.000 | **$500.000** |
| 1.000 pts | $50.000 | **$1.000.000** |

**Anclas del propio sistema:** el bonus por racha —el mayor otorgamiento automático— es **150 puntos**. Ganar 500 puntos por la vía normal exige medio millón de pesos en tratamientos.

Eso sugiere que el umbral razonable está más cerca de **150-300** que de 500. **Pero no lo fijo hasta ver la consulta B**, porque una migración inicial de saldos o la corrección de un tratamiento grande podrían ser legítimamente mayores.

**Un matiz que sale del esquema:** existe el tipo `migracion_inicial`, separado de `ajuste_manual`. Si las cargas iniciales usaron ese tipo, el histórico de `ajuste_manual` debería ser chico y el límite puede ser bajo. **La consulta D lo responde.**

## 2.3 · Nota obligatoria

**Queda como propuesta, sin implementar.** Requiere quitar el `COALESCE` y agregar la validación. La consulta C dice cuánto del histórico no cumpliría.

**→ DECISIÓN DEL OWNER (DO-2): límite, después de ver A-E. No propongo número sin los datos.**
**→ DECISIÓN DEL OWNER (DO-3): ¿nota obligatoria?**

---

# 3 · Modelo `owner` vs `odontologo`

## 3.1 · El esquema real

```sql
CREATE TABLE tenant_users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  tenant_id  uuid NOT NULL,
  role       text NOT NULL DEFAULT 'admin',   -- ← una sola columna, sin CHECK
  creado_en  timestamptz DEFAULT now()
);
```

**Un solo `role` de texto libre por par (usuario, clínica).** Sin `CHECK`. Default `'admin'`.

## 3.2 · Las cinco personas contra el modelo

| Persona | ¿Representable? | Cómo |
|---|:---:|---|
| Dueño **no** odontólogo | ✅ | `owner` |
| Odontólogo contratado | ✅ | `odontologo` |
| Administrador no clínico | ✅ | `admin` |
| Recepción | ✅ | `staff` |
| **Dueño que además es odontólogo** | ❌ | **No hay forma** |

**El caso que no entra es el tuyo.** DentalDesk hoy tiene dos usuarios `admin` en una clínica cuyo dueño ejerce. Con la matriz de 4 roles hay que elegir:

- `owner` → administra el negocio pero **la matriz no le da permisos clínicos como odontólogo**
- `odontologo` → atiende pero **pierde facturación, equipo, configuración, exportar pacientes**

**Ninguna de las dos lo describe.** Y no es un caso de borde: en una clínica chica es *el* caso.

## 3.3 · Por qué el modelo actual no da para más

`owner` y `odontologo` **responden preguntas distintas**:

- `owner` es **propiedad**: quién es dueño del negocio. Uno solo, no delegable, no rotativo.
- `odontologo` es **función**: qué hace la persona. Varios, contratable, rotativo.

Están en la misma columna porque históricamente `owner` y `admin` eran los dos únicos valores y ambos describían jerarquía administrativa. **Al agregar roles funcionales, la columna pasa a mezclar dos ejes.**

**Veredicto: `owner` y `odontologo` NO deberían ser mutuamente excluyentes.** `owner` debería ser una propiedad independiente del rol funcional.

Dos formas de arreglarlo (ambas **fuera de Fase 1**):

**Opción A — columna booleana**
```
role text        ∈ {admin, odontologo, staff}
es_dueno boolean                                  -- único por tenant
```
Chico, migrable (`es_dueno = (role='owner')`), y las 4 políticas que hoy dicen `role IN ('admin','owner')` pasan a `role='admin' OR es_dueno`.

**Opción B — roles múltiples**
Tabla `tenant_user_roles` con N filas por usuario. Más flexible, mucho más costoso.

**→ DECISIÓN DEL OWNER (DO-6): ¿A, B, o convivir con la limitación?**

## 3.4 · Consecuencia directa sobre B1.5 — cambio al diseño

**B1.5 proponía un `CHECK (role IN ('owner','admin','odontologo','staff'))`.**

Ese `CHECK` **cementa el modelo de un solo eje** justo cuando acabamos de comprobar que no alcanza para tu propio caso. Es barato de revertir, pero pone en el esquema una decisión que todavía no tomaste.

**Cambio propuesto: partir B1.5 en dos.**

| | Qué | Fase | Motivo |
|---|---|:---:|---|
| **B1.5a** | `ALTER COLUMN role SET DEFAULT 'staff'` | **1** | Cierra un hueco real: hoy una fila insertada sin `role` **nace `admin`** |
| **B1.5b** | `CHECK` sobre el vocabulario | **2** | Esperar a DO-6 |

`B1.5a` es seguro: verifiqué las tres rutas que insertan en `tenant_users` y **ninguna omite `role`** (`api/clinicas:109` → `'owner'`; `api/registro:145` → `'owner'`; `api/equipo/invitar:96,118` → `role || 'staff'`).

## 3.5 · Bypass R-2 — escalada de privilegios en `/api/equipo/invitar`

Buscando el modelo de roles encontré esto:

```ts
// src/app/api/equipo/invitar/route.ts
const { email, role, tenantId } = await req.json()     // :14  ← rol del cliente
…
if (!ownerTenant || (ownerTenant.role !== 'owner' && ownerTenant.role !== 'admin')) { … }  // :49
…
await supabaseAdmin.from('tenant_users').insert({       // :96 y :118
  tenant_id: ownerTenant.tenant_id,
  user_id:   …,
  role: role || 'staff'                                 // ← sin whitelist
})
```

**`role` viaja desde el cliente y se inserta sin validar, con `supabaseAdmin` (`service_role`, que saltea RLS).**

**Consecuencias:**

1. Un `admin` puede invitar a alguien como **`owner`**. Se asigna un rol superior al propio.
2. Puede inventar un rol (`"superadmin"`, `""`, `"ODONTOLOGO"`). Hoy eso no rompe nada porque nadie compara contra la lista completa — **pero en Fase 2, con RLS por rol, un rol desconocido produce comportamiento indefinido**.
3. Y puede auto-invitarse con otro email para escalar.

**Está en producción hoy.** No lo había encontrado en la auditoría.

**El `CHECK` de B1.5b lo mitiga a medias**: acota el vocabulario, pero `'owner'` es un valor válido, así que **la escalada admin → owner sigue abierta**. Hace falta una whitelist en la ruta.

**Eso implica modificar `src/`** — y la regla de contención que puse dice que entonces sale de Fase 1.

**→ DECISIÓN DEL OWNER (DO-7): ¿se hace una excepción a la regla de contención para cerrar R-2 en Fase 1, o va a Fase 2 asumiendo el riesgo?**

Mi lectura: el riesgo real hoy es bajo —los dos usuarios son de tu confianza y la ruta exige ser `admin`/`owner`— pero **es escalada de privilegios en producción** y la corrección es de unas pocas líneas. Difiere de todo lo demás de Fase 1 solo en que toca `src/`.

## 3.6 · Contradicción con la matriz — políticas ya atadas al rol

**Ya existen 4 políticas RLS que discriminan por rol.** Cuando existan `odontologo` y `staff`, esos usuarios quedan **inmediatamente denegados** en:

| Tabla | Política | Comando | Roles permitidos |
|---|---|---|---|
| `arca_config` | `arca_config_write` | ALL | `admin`, `owner` |
| `plantillas_consentimiento` | `plantillas_write` | ALL | `admin`, `owner` |
| `crm_campanas` | `crm_campanas_write` | ALL | `admin`, `owner` |
| `tenants` | `tenants_update_own` | UPDATE | `admin`, `owner` |

**Esto no es hipotético: pasa el día que exista el primer usuario `odontologo` o `staff`**, sin cambiar una línea.

Tres son coherentes con la matriz. **Una no lo es**: `plantillas_consentimiento`. Un odontólogo que no puede editar las plantillas de consentimiento que él mismo hace firmar es discutible.

**→ DECISIÓN DEL OWNER (DO-8): ¿el odontólogo administra las plantillas de consentimiento?**

---

# 4 · B1.4 · Qué se pierde al eliminar un paciente

Mapeé **todas** las FK que apuntan a `pacientes(id)` y a `citas(id)`. **El mapa de §B.2 del diseño estaba incompleto.**

## 4.1 · Datos SQL eliminados

**Por CASCADE directo desde `pacientes`:**

| Tabla | Contenido |
|---|---|
| `citas` | Toda la agenda histórica |
| `historial_dental` | **Odontograma e historia clínica** |
| `paciente_fotos` | Registros de fotos clínicas |
| `historial_puntos` | Ledger de fidelización |
| `feedback_post_visita` | Encuestas |
| `tratamiento_items` | **Renglones de tratamiento con importes** |
| `pagos` | **Cobros** |

**Por CASCADE en segundo nivel, vía `citas`:**

| Tabla | Contenido |
|---|---|
| `recordatorios_log` | **Evidencia de qué se le comunicó** |
| `enlaces_turno` | Códigos de acceso emitidos |
| `tratamiento_items` | *(también por `cita_id`)* |
| `pagos` | *(también por `cita_id`)* |
| `feedback_post_visita` | *(también por `cita_id`)* |

## 4.2 · Datos que sobreviven

**Esto es lo que faltaba en §B.2.**

| Tabla | FK | Qué queda |
|---|---|---|
| `facturas` | `cita_id → SET NULL` | Comprobante completo. Conserva `paciente_nombre` y `paciente_doc_nro` **desnormalizados** |
| **`consentimientos_firmados`** | `paciente_id → SET NULL` | **`firmante_nombre`, `firmante_doc`, `firma_png`, `ip_firma`, `user_agent`, `contenido_snapshot`, `hash_sha256`** |
| **`crm_envios`** | `paciente_id → SET NULL` | Registro del envío |
| `historial_puntos` | `cita_id → SET NULL` | *(muere igual por `paciente_id`)* |
| `logs_envios` | sin FK | Registro de envíos |
| **`presupuestos`** | **sin acción** | **BLOQUEA el DELETE** |

**Dos hallazgos que no estaban:**

**`consentimientos_firmados` sobrevive con PII completa.** Un consentimiento firmado guarda nombre, documento, la firma en PNG, la IP y el user-agent del firmante. Al borrar el paciente, `paciente_id` queda `NULL` y **todo ese contenido persiste sin vínculo**. Es lo contrario del problema de Storage: no se pierde un dato, se retiene PII que debería haberse ido. Relevante si alguna vez alguien ejerce derecho de supresión bajo la Ley 25.326.

**`presupuestos` bloquea el borrado.** La FK no tiene acción, así que si el paciente tiene presupuestos, el `DELETE` falla con error de FK y la UI muestra `"Error al eliminar: …"`. **El borrado ya está parcialmente roto en producción** y probablemente nadie lo notó.

*(Nota: `fotos_progreso` aparece con CASCADE en `supabase_migration_portal_feedback.sql`, un archivo suelto de la raíz que no está en `supabase/migrations/`. **NO VERIFICADO** si existe en producción.)*

## 4.3 · Archivos de Storage huérfanos

```ts
// src/app/pacientes/[id]/page.tsx:719-736
const fileName = `${tenant.id}/${paciente.id}/${Date.now()}.${ext}`
await supabase.storage.from('fotos_clinicas').upload(fileName, file)
await supabase.from('paciente_fotos').insert({ url: fileName, … })
```

`paciente_fotos.url` es **el único índice** de los objetos. El CASCADE borra la fila; **el archivo queda en el bucket para siempre**.

El borrado en la UI no toca Storage en absoluto:

```ts
// src/app/pacientes/page.tsx:139
async function saveBorrar() {
  const {error} = await supabase.from('pacientes').delete().eq('id',sel.id)
  …
}
```

Verifiqué las 5 referencias a `.storage` del repositorio: dos suben (`fotos_clinicas`, `logos`), dos firman URLs, una lee. **Ninguna borra.** No hay limpieza de Storage en ninguna parte del código.

**Los consentimientos no usan Storage** — `firma_png` es base64 en la base. No generan huérfanos.

## 4.4 · Impacto sobre facturación

| | |
|---|---|
| **Sobrevive** | `facturas` con importes, CAE y datos del paciente desnormalizados |
| **Muere** | `pagos` (por FK directa **y** por `citas`) |
| **Muere** | `factura_items` — vía `facturas`? **NO**: `facturas` sobrevive, así que sus items también |
| **Resultado** | **Comprobantes fiscales emitidos sin rastro del cobro que los originó** |

Contablemente queda un ingreso facturado que no se puede conciliar. Y el comprobante ya fue a ARCA, así que la asimetría es permanente.

## 4.5 · Impacto sobre auditoría

- **`recordatorios_log` desaparece** (vía `citas`): se pierde la evidencia de qué se le comunicó al paciente y cuándo.
- **`historial_puntos` desaparece**: se pierde el ledger, incluido `aprobado_por_usuario_id` — **quién ajustó puntos y por qué**. Justamente lo que B1.2 busca hacer auditable.
- **`consentimientos_firmados` sobrevive pero desvinculado**: hay evidencia de que alguien firmó, sin poder decir quién era en el sistema.
- **No hay log de la eliminación misma.** Nadie registra que se borró un paciente, ni quién.

**Un `DELETE` desde el navegador destruye la trazabilidad de forma irreversible y sin dejar rastro de que ocurrió.**

**No implemento soft delete.** Refuerza que B1.4 —restringir *quién* puede disparar el DELETE— es lo mínimo defendible hasta la Fase 3.

---

# 5 · Segunda revisión de las funciones SECURITY DEFINER

Barrí **todas** las migraciones más los 20 `.sql` sueltos de la raíz, no solo las funciones ya identificadas.

**14 funciones. 14 son `SECURITY DEFINER`** — no 12. Me faltaba una y clasifiqué otra mal.

| # | Función | Ejecuta | Lee | Modifica | Saltea RLS | Tenant | Rol | Bypass |
|---|---|---|---|---|:---:|:---:|:---:|---|
| 1 | `fn_ajustar_puntos_manual` | `authenticated`, `service_role` | `pacientes`, `tenant_users` | `pacientes`, `historial_puntos` | ✅ | ✅ | ❌ | **B1.2** |
| 2 | `fn_canjear_premio` | `authenticated`, `service_role` | `premios`, `pacientes`, `tenant_users` | `premios`, `pacientes`, `historial_puntos` | ✅ | ✅ | ❌ | **B1.3** |
| 3 | `fn_aprobar_asistencia` | `authenticated`, `service_role` | `citas`, `pacientes`, `config_fidelizacion` | `citas`, `pacientes`, `historial_puntos` | ✅ | ✅ | ❌ | Recomendación B |
| 4 | `fn_registrar_inasistencia` | `authenticated`, `service_role` | `citas` | `citas`, `pacientes` | ✅ | ✅ | ❌ | Recomendación B |
| 5 | `emitir_factura_con_detalle` | `authenticated` | `tenant_users` | `facturas`, `factura_items`, `factura_pagos` | ✅ | ✅ | ❌ | Recomendación B |
| 6 | `crear_tenant` | **`service_role`** | — | `tenants` | ✅ | N/A | N/A | Cerrada |
| 7 | `emitir_enlace_turno` | **nadie** | `citas`, `enlaces_turno` | `enlaces_turno` | ✅ | ✅ | N/A | Cerrada |
| 8 | `get_user_email` | **`service_role`** | `auth.users` | — | ✅ | ❌ | ❌ | Cerrada |
| 9 | `get_tenant_admin_email` | **`service_role`** | `auth.users`, `tenant_users` | — | ✅ | ❌ | ❌ | Cerrada |
| 10 | `sync_turno_to_cita` | **`service_role`** *(trigger)* | `pacientes` | `pacientes`, `citas` | ✅ | **❌ NO** | ❌ | **P0-01** |
| 11 | `sync_valor_cita` | trigger | `tratamiento_items` | `citas` | ✅ | vía fila | ❌ | No invocable |
| 12 | `sync_cobrado_cita` | trigger | `pagos` | `citas` | ✅ | vía fila | ❌ | No invocable |
| 13 | `sembrar_renglon_cita` | trigger | `citas` | `tratamiento_items` | ✅ | vía fila | ❌ | No invocable |
| 14 | **`generar_codigo_enlace`** | **`PUBLIC` — incl. `anon`** | — | — | ✅ | N/A | N/A | **R-5** |

## 5.1 · Corrección — `generar_codigo_enlace` (R-5)

En el diseño la clasifiqué como **"No"** `SECURITY DEFINER`. **Es `SECURITY DEFINER`**, y además es la **única función del esquema sin `REVOKE ALL … FROM PUBLIC`**.

En PostgreSQL, `EXECUTE` sobre funciones se concede a `PUBLIC` por defecto. Sin el `REVOKE`, `anon` puede llamarla vía PostgREST:

```
POST /rest/v1/rpc/generar_codigo_enlace
```

**Riesgo real: bajo.** Leí el cuerpo completo. No accede a ninguna tabla: deriva 12 caracteres base32 de `gen_random_uuid()` y los devuelve. Un atacante obtiene un código aleatorio nuevo, que no le sirve — necesitaría adivinar uno *existente*, y son 122 bits de entropía.

**Pero:**
- El `SECURITY DEFINER` es **innecesario**: la función no toca nada que requiera privilegios.
- Es la única grieta en un esquema por lo demás disciplinado.
- Un atacante puede llamarla en bucle para forzar trabajo del servidor. Trivial, pero gratis.

**Propongo agregarlo a B1.1**, que ya es la tarea de privilegios:

```sql
REVOKE ALL ON FUNCTION generar_codigo_enlace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generar_codigo_enlace() TO service_role;
```

Verifiqué que la única llamada es interna, desde `emitir_enlace_turno` (`20260806160000:133`). Como esa función es `SECURITY DEFINER`, la llamada anidada corre con los privilegios del dueño. **Revocar no rompe nada.**

## 5.2 · Confirmación — las 4 funciones bien cerradas

Leí los `REVOKE`/`GRANT` línea por línea:

```
:1616  REVOKE ALL ON FUNCTION crear_tenant(…)           FROM PUBLIC;
:1617  GRANT  ALL ON FUNCTION crear_tenant(…)           TO service_role;
:1645  REVOKE ALL ON FUNCTION get_tenant_admin_email(…) FROM PUBLIC;
:1646  GRANT  ALL ON FUNCTION get_tenant_admin_email(…) TO service_role;
:1650  REVOKE ALL ON FUNCTION get_user_email(…)         FROM PUBLIC;
:1651  GRANT  ALL ON FUNCTION get_user_email(…)         TO service_role;
:161   REVOKE ALL ON FUNCTION emitir_enlace_turno(UUID) FROM PUBLIC;
:168   EXECUTE format('REVOKE ALL ON FUNCTION emitir_enlace_turno(UUID) FROM %I', r);
```

**Correctas.** El patrón `REVOKE FROM PUBLIC` + `GRANT` selectivo es el correcto, y `emitir_enlace_turno` además itera revocando a cada rol nominal.

## 5.3 · Las funciones de B1.2 y B1.3 ya validan más de lo que dije

Leí los cuerpos completos. Ambas hacen:

```sql
v_user_id := auth.uid();
IF v_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado.'; END IF;
…
SELECT … FROM pacientes WHERE id = p_paciente_id FOR UPDATE;   -- lock
…
IF NOT EXISTS (SELECT 1 FROM tenant_users
               WHERE user_id = v_user_id AND tenant_id = v_tenant_id)
THEN RAISE EXCEPTION 'No autorizado.'; END IF;
```

**Están bien escritas**: rechazan anónimos, toman lock `FOR UPDATE`, validan pertenencia al tenant, y `fn_ajustar_puntos_manual` impide saldo negativo. `fn_canjear_premio` valida además premio activo, stock y saldo suficiente.

**Lo único que falta es el `role`.** El bloque de B1.2/B1.3 entra justo debajo del `IF NOT EXISTS`, reusando `v_user_id` y `v_tenant_id`. Es una inserción limpia.

**Confirmación a tu pregunta del diseño:** sí, estas funciones operan aunque RLS bloquee al usuario. Son `SECURITY DEFINER` con dueño `postgres` (superusuario), que **no está sujeto a RLS**. Las políticas de `premios`, `pacientes` e `historial_puntos` **no se evalúan dentro del cuerpo**. Por eso el chequeo va adentro: una política sería decorativa.

## 5.4 · Riesgo de divergencia — bloqueante de implementación

Las 4 funciones `fn_*` están **definidas dos veces** en el repositorio:

- `supabase/migrations/20260722120000_remote_schema.sql` (dump de producción)
- `supabase_migration_sprint_5_fidelizacion.sql` (archivo suelto de la raíz)

Las diffeé: **solo difieren en formato** (comillas, indentación, líneas en blanco). El cuerpo es idéntico. Bien.

**Pero:** hay **20 archivos `.sql` en la raíz** fuera de `supabase/migrations/`. Se aplicaron a mano en algún momento. **La carpeta de migraciones no es la única fuente de verdad**, y no hay forma desde el repositorio de saber qué versión corre hoy en producción.

**→ BLOQUEANTE: antes de tocar cualquier función, dumpear su definición viva.**

```sql
SELECT p.proname,
       pg_get_functiondef(p.oid)                     AS definicion_viva,
       p.prosecdef                                   AS es_security_definer,
       pg_catalog.array_to_string(p.proacl, E'\n')   AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;
```

Si difiere del repositorio, **el `CREATE OR REPLACE` de B1.2/B1.3 pisaría lógica viva** y el rollback restauraría la versión equivocada.

## 5.5 · Bypasses adicionales encontrados

| ID | Bypass | Gravedad | ¿Estaba? |
|---|---|---|:---:|
| **R-2** | `role` sin whitelist en `/api/equipo/invitar` → escalada admin→owner | **Alta** | ❌ |
| **R-5** | `generar_codigo_enlace` ejecutable por `anon` | Baja | ❌ |
| **R-1** | 12 tablas con `GRANT ALL` a `anon` heredado | **Crítica** | ❌ |

Los tres son nuevos respecto del diseño y de la auditoría original.

---

# 6 · Testing — los 27 casos PGlite

Leí el harness real (`src/lib/tenant-isolation.test.ts`). **Los 27 tests no pueden correr como están diseñados.**

## 6.1 · Cómo funciona el harness

```ts
CREATE TABLE tenant_users (tenant_id uuid, user_id uuid);          // :70
CREATE TABLE pacientes    (id uuid primary key, tenant_id uuid, dato text);
…
for (const t of TABLAS) {
  await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO authenticated;`)  // :105
}
```

Dos hechos determinantes:

1. **`tenant_users` NO tiene columna `role`.** Los 27 tests la necesitan. Sin ella, ninguno compila.
2. **Las tablas son sintéticas** — `(id, tenant_id, dato)`. No existen `puntos_saldo_cache`, `costo_puntos`, `stock`, ni ninguna FK.

## 6.2 · Falsos positivos

| Test | Falso positivo | Por qué |
|---|---|---|
| **B1.1 · default privileges** | **Total** | La línea 105 concede explícitamente. El harness **nunca** puede detectar un privilegio faltante — la propiedad que B1.1 protege es invisible acá |
| **#19-20 · owner/admin SÍ pueden borrar** | **Sí** | El `pacientes` sintético no tiene FK hijas. En producción el DELETE dispara 7 CASCADE y **`presupuestos` puede bloquearlo**. El test diría "se puede borrar" cuando en producción falla |
| **#21-22 · odontologo/staff NO pueden** | **Parcial** | Verifica *0 filas*. Correcto acá — pero solo porque el harness concede `DELETE`. Si mañana alguien quita esa línea, el test seguiría en verde por el motivo equivocado (`42501` en vez de 0 filas) |
| **#1-18 · funciones** | **Sí, si transcribo** | Si escribo a mano el cuerpo en el test, valido **mi transcripción**, no la función. Con §5.4 sin resolver, podría ser una versión que no corre en producción |
| **#25-27 · CHECK y DEFAULT** | No | DDL puro. PGlite lo reproduce fielmente |
| **#5, #15, #23 · cross-tenant** | No | Es lo que el harness hace bien |

**El peor es #19-20**: afirma que el borrado funciona, cuando la FK de `presupuestos` puede impedirlo. Un test que da confianza falsa sobre pérdida de datos es peor que no tenerlo.

## 6.3 · Qué exige Supabase real

| Verificación | Motivo |
|---|---|
| **`ALTER DEFAULT PRIVILEGES` (B1.1)** | Roles `postgres`/`supabase_admin`/`authenticator` y el pooler. PGlite no los tiene |
| **Los 12 `REVOKE` de B1.6** | Hay que confirmar el ACL *vivo*, no el del repositorio |
| **`generar_codigo_enlace` desde `anon`** | Vía PostgREST |
| **Exposición de funciones por PostgREST** | PGlite no corre PostgREST |
| **DELETE con CASCADE real** | Requiere el esquema completo con las 7 FK |
| **`auth.uid()` real de GoTrue** | El harness usa un shim |

## 6.4 · Tests SQL de integración

Deberían ser SQL contra staging, no PGlite:

```sql
-- 1 · Nada nuevo nace concedido
CREATE FUNCTION public.__p() RETURNS int LANGUAGE sql AS 'SELECT 1';
CREATE TABLE   public.__t (id int);
SELECT has_function_privilege('authenticated','public.__p()','EXECUTE') AS debe_ser_false;
SELECT has_function_privilege('anon',         'public.__p()','EXECUTE') AS debe_ser_false;
SELECT has_table_privilege   ('anon',         'public.__t','SELECT')    AS debe_ser_false;
DROP FUNCTION public.__p(); DROP TABLE public.__t;

-- 2 · ACL vivo de las 12 tablas de B1.6
SELECT relname, pg_catalog.array_to_string(relacl, E'\n')
FROM pg_class WHERE relname IN ('pagos','facturas','factura_items','factura_pagos',
  'tratamiento_items','arca_config','consentimientos_firmados','plantillas_consentimiento',
  'crm_campanas','crm_envios','enlaces_turno','ingresos_manuales_duplicados_respaldo');

-- 3 · Ninguna tabla sin RLS
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;

-- 4 · Ninguna función ejecutable por anon salvo lista blanca
SELECT p.proname, pg_catalog.array_to_string(p.proacl, ', ')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proacl IS NULL OR array_to_string(p.proacl,',') ~ '(^|,)=|anon=');
```

La consulta 4 es la que habría encontrado R-5 sola. **La 3 es la que habría encontrado P0-07 antes de que pasara.**

## 6.5 · Regresiones que faltan

| Falta | Por qué importa |
|---|---|
| **Los 81 tests de aislamiento con `role` en `tenant_users`** | Agregar la columna no debe alterarlos. Sin esto no se sabe si B1.5a rompió algo |
| **`historial_puntos` registra el ajuste** | B1.2 podría rechazar y dejar el ledger inconsistente |
| **Saldo negativo sigue bloqueado** | La guarda actual no debe perderse en el `CREATE OR REPLACE` |
| **Stock decrementa una sola vez** | El `FOR UPDATE` no debe perderse |
| **DELETE de paciente con `presupuestos`** | **Documenta que hoy falla.** No existe |
| **DELETE deja fotos huérfanas** | Documenta la pérdida antes de la Fase 3 |
| **Ningún `.rpc()` nuevo sin `REVOKE FROM PUBLIC`** | Guarda de patrón — habría encontrado R-5 |
| **Ninguna tabla nueva sin `GRANT` explícito** | Guarda de patrón — habría encontrado R-1 |
| **`role` insertado ∈ vocabulario** | Guarda de patrón — habría encontrado R-2 |

## 6.6 · La guarda que ya existe está incompleta y fuera de CI

`src/lib/vistas-bi.test.ts:388` ya tiene una guarda de grants:

```ts
if (/\banon\b/i.test(destinatarios) && /\bbi_\w+/i.test(objeto)) { … }
```

**Dos problemas:**

1. **Solo mira vistas `bi_*` y solo `anon`.** No habría detectado R-1 ni R-5.
2. **El archivo está sin versionar** — `git status` lo da como `??`. **No corre en CI.** La protección de P0-07 no está activa.

**→ BLOQUEANTE: versionar `vistas-bi.test.ts` antes de cualquier otra cosa.**

---

# A · BLOQUEANTES

| # | Bloqueante | Bloquea | Cómo se resuelve |
|---|---|---|---|
| **A-1** | **Definición viva de las 14 funciones sin dumpear.** 20 `.sql` sueltos aplicados a mano; el repositorio no es fuente de verdad | **B1.2, B1.3** | `pg_get_functiondef` (§5.4) y diff contra el repositorio |
| **A-2** | **ACL vivo de las 12 tablas sin `GRANT` explícito** | **B1.6** | Consulta 2 de §6.4 |
| **A-3** | **Sin datos de `historial_puntos`** | **B1.2** | Consultas A-E de §2.1 |
| **A-4** | **Harness PGlite sin columna `role`**; dos tests darían falso positivo | **Todos los tests** | Extender el harness; mover B1.1/B1.6 a integración |
| **A-5** | **`vistas-bi.test.ts` sin versionar** — la guarda de P0-07 no corre en CI | Cierre de Fase 1 | `git add` |
| **A-6** | **DO-6 sin decidir** (modelo owner/odontólogo) | **B1.5b** | Decisión tuya |
| **A-7** | **No sé si `presupuestos` bloquea el DELETE hoy** | **B1.4** | `SELECT count(*) FROM presupuestos;` |

**A-1 y A-2 son los duros.** Son la misma clase de error que la auditoría cometió con las vistas `bi_*`: confiar en el repositorio en vez de mirar la base.

---

# B · DECISIONES QUE NECESITÁS TOMAR

| # | Decisión | Bloquea | Mi lectura |
|---|---|---|---|
| **DO-1** | ¿`TABLES FROM authenticated` en Fase 1 o Fase 2? | B1.1 | **Fase 2.** Falla silenciosa en producción; además no cierra nada mientras B1.6 no esté |
| **DO-2** | Límite de ajuste de puntos | B1.2 | **No propongo número sin las consultas A-E.** El bonus de racha es 150 pts; 500 pts equivalen a $500.000 de tratamiento |
| **DO-3** | ¿Nota obligatoria? | B1.2 | Sí — pero la consulta C dice cuánto histórico no cumpliría |
| **DO-4** | ¿Odontólogo canjea premios? *(=P6)* | B1.3 | Sin recomendación: es política del negocio |
| **DO-5** | ¿Aplicar B1.4 aunque hoy no cambie nada? | B1.4 | Sí. Cierra la puerta antes de que entre alguien |
| **DO-6** | **Modelo `owner`: ¿opción A (booleano), B (roles múltiples), o convivir?** | **B1.5b, Fase 2** | **A.** Tu caso —dueño que ejerce— no entra en el modelo actual |
| **DO-7** | **¿Excepción a la regla de contención para cerrar R-2 (escalada de privilegios) en Fase 1?** | R-2 | Es escalada de privilegios en producción y son pocas líneas, pero toca `src/` |
| **DO-8** | ¿El odontólogo administra plantillas de consentimiento? | Fase 2 | La política actual dice que no. Discutible |

**Ninguna asumida.**

---

# C · SUFICIENTEMENTE CERRADO

| Qué | Evidencia |
|---|---|
| **Revocar `anon` de los default privileges no rompe nada** | Las 8 llamadas `.rpc()` usan funciones con `REVOKE FROM PUBLIC`; el portal público va por `service_role` |
| **Revocar `FUNCTIONS FROM authenticated` no rompe nada** | Las 5 funciones llamadas como `authenticated` tienen `GRANT` explícito |
| **Las 12 tablas sin `GRANT` tienen RLS activa** | Verificado una por una |
| **`enlaces_turno` está cerrada** | RLS activa, cero políticas → deniega todo. Falla cerrada |
| **Las 4 funciones `service_role` están bien** | `REVOKE FROM PUBLIC` + `GRANT` selectivo, verificado línea por línea |
| **Los cuerpos de B1.2/B1.3 son idénticos en las dos copias** | Diff: solo formato |
| **Las funciones ya validan tenant, auth y concurrencia** | Falta solo `role` |
| **El punto de inserción de B1.2/B1.3 es limpio** | Debajo del `IF NOT EXISTS`, reusa `v_user_id` y `v_tenant_id` |
| **Las funciones de trigger no son superficie de ataque** | Devuelven `trigger`, no invocables desde SQL normal |
| **`B1.5a` (DEFAULT `'staff'`) es seguro** | Las 3 rutas que insertan pasan `role` explícito |
| **`generar_codigo_enlace` es de riesgo bajo** | No accede a ninguna tabla; 122 bits de entropía |
| **No existe soft delete** | Sin `archivado_en`, `deleted_at` ni `activo` |
| **Ninguna ruta del código borra de Storage** | Las 5 referencias a `.storage`: 2 suben, 2 firman, 1 lee |

---

# D · CAMBIOS AL DISEÑO

| # | Cambio | Motivo |
|---|---|---|
| **D-1** | **Agregar B1.6** — `REVOKE ALL ON TABLE <las 12> FROM anon` | R-1. Sin esto, B1.1 protege el futuro y deja el presente abierto |
| **D-2** | **Agregar a B1.1** el `REVOKE` de `generar_codigo_enlace` | R-5 |
| **D-3** | **Partir B1.5** → **B1.5a** (`DEFAULT 'staff'`, Fase 1) y **B1.5b** (`CHECK`, Fase 2 tras DO-6) | R-3. El `CHECK` cementaría un modelo que no representa tu caso |
| **D-4** | **Corregir §A.2**: la afirmación "las 16 tablas tienen grants explícitos" es falsa | R-1 |
| **D-5** | **Corregir §A.1**: `generar_codigo_enlace` **es** `SECURITY DEFINER`. Son 14, no 12 | R-5 |
| **D-6** | **Completar §B.2**: agregar `consentimientos_firmados` y `crm_envios` (SET NULL, sobreviven con PII), `tratamiento_items` y `pagos` (FK directa a `pacientes`) | §4.2 |
| **D-7** | **Documentar que `presupuestos` bloquea el DELETE** | El borrado ya falla en producción |
| **D-8** | **Mover B1.1 y B1.6 de PGlite a integración SQL** | §6.2: el harness concede privilegios explícitamente |
| **D-9** | **Reemplazar los tests #19-20** por integración | Falso positivo sobre pérdida de datos |
| **D-10** | **Generalizar la guarda de grants** más allá de `bi_*`/`anon`; **versionar el archivo** | §6.6 |
| **D-11** | **Agregar A-1 (dump de funciones vivas) como precondición dura** | §5.4 |
| **D-12** | **Registrar R-2 como hallazgo de seguridad abierto** | Escalada de privilegios en producción |
| **D-13** | **Registrar la contradicción de `plantillas_consentimiento`** | §3.6 |

---

# E · PLAN FINAL DE FASE 1

*Sujeto a DO-1 a DO-8. Ninguna tarea empieza sin sus precondiciones.*

## Etapa 0 · Precondiciones — solo lectura

| | Acción | Resuelve |
|---|---|---|
| 0.1 | Dumpear las 14 funciones vivas y diffear | **A-1** |
| 0.2 | ACL vivo de las 12 tablas + de las 14 funciones | **A-2** |
| 0.3 | Consultas A-E sobre `historial_puntos` | **A-3** |
| 0.4 | `SELECT DISTINCT role FROM tenant_users` | B1.5a |
| 0.5 | `SELECT count(*) FROM presupuestos` | **A-7** |
| 0.6 | Ninguna tabla `public` sin RLS *(consulta 3 de §6.4)* | Regresión P0-07 |
| 0.7 | `git add src/lib/vistas-bi.test.ts` | **A-5** |
| 0.8 | Guardar policy `tenant_isolation_pacientes` para rollback | B1.4 |
| 0.9 | Decidir DO-1 a DO-8 | Todas |

## Etapa 1 · Privilegios — sin dependencias funcionales

| Tarea | Qué | Rollback |
|---|---|---|
| **B1.1** | Revocar default privileges `TABLES`/`FUNCTIONS` de `anon` y `FUNCTIONS` de `authenticated`. Revocar `generar_codigo_enlace` de `PUBLIC` | Re-aplicar los `GRANT` de `:1895`, `:1896`, `:1905` |
| **B1.6** | `REVOKE ALL ON TABLE <las 12> FROM anon` | `GRANT ALL … TO anon` |

**Verificación:** integración SQL de §6.4 (1 y 2) + `curl` sin autenticar contra las 12, antes y después.

## Etapa 2 · Roles en funciones — requiere 0.1 y 0.3

| Tarea | Qué | Depende |
|---|---|---|
| **B1.2** | `role IN ('owner','admin')` + límite + nota en `fn_ajustar_puntos_manual` | DO-2, DO-3, A-1, A-3 |
| **B1.3** | Verificación de rol en `fn_canjear_premio` | DO-4, A-1 |

**Verificación:** 18 casos PGlite sobre harness extendido, **con el cuerpo cargado desde el dump vivo, no transcrito.**

## Etapa 3 · RLS y esquema

| Tarea | Qué | Depende |
|---|---|---|
| **B1.4** | Policy `FOR DELETE` en `pacientes` → owner/admin | DO-5, A-7 |
| **B1.5a** | `ALTER COLUMN role SET DEFAULT 'staff'` | 0.4 |

**Verificación:** 9 casos PGlite (#19-24 movidos a integración) + los 81 de aislamiento en verde con la columna `role` presente.

## Etapa 4 · Guardas de patrón

| Tarea | Qué |
|---|---|
| **B1.7** | Generalizar la guarda: toda tabla/vista nueva con `GRANT` explícito o ausencia documentada; toda función nueva con `REVOKE FROM PUBLIC`; todo `role` insertado dentro del vocabulario |

**Es lo que convierte la Fase 1 en una red y no en una limpieza puntual.** Las tres reglas habrían encontrado R-1, R-5 y R-2 solas.

## Etapa 5 · Cierre

- [ ] 468 tests + los nuevos en verde
- [ ] 81 tests de aislamiento en verde con `role` presente
- [ ] `npx tsc --noEmit` y `npm run build` exit 0
- [ ] Integración SQL de §6.4 (1-4) en staging
- [ ] Las 6 pruebas manuales de §D.6 del diseño
- [ ] **`git diff --stat` → cero archivos de `src/` modificados**, salvo `vistas-bi.test.ts` y los tests nuevos *(y la corrección de R-2 si DO-7 = sí)*
- [ ] 24 h sin errores nuevos en Sentry

## Fuera de Fase 1 — riesgos aceptados

| Riesgo | Destino |
|---|---|
| `TABLES FROM authenticated` sigue concediendo | **Fase 2** *(DO-1)* |
| **R-2 · escalada admin→owner** | **Fase 2** *(salvo DO-7)* |
| El modelo `owner`/`odontologo` no representa al dueño que ejerce | **Fase 2** *(DO-6)* |
| `plantillas_consentimiento` deniega al odontólogo | **Fase 2** *(DO-8)* |
| El DELETE destruye historia clínica, ledger y recordatorios | **Fase 3** |
| `consentimientos_firmados` retiene PII tras el borrado | **Fase 3** |
| Fotos huérfanas en `fotos_clinicas` | **Fase 3** |
| `presupuestos` bloquea el DELETE sin mensaje claro | **Fase 3** |
| 9 caminos mutan `citas.estado` sin validar | **P0-08** |
| `sync_turno_to_cita` sin filtro de tenant | **P0-01** |
| SQL Editor y `service_role` pueden todo | Límite de plataforma |

---

*Revisión crítica. Ningún archivo modificado, ninguna migración creada, ninguna función alterada, ninguna política tocada, nada ejecutado sobre Supabase, ninguna decisión asumida. Todos los comandos fueron de lectura sobre el repositorio.*
