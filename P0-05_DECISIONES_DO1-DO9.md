# P0-05 · Decisiones del owner — DO-1 a DO-9

**Fecha:** 15/08/2026
**Estado:** ⬜ **ninguna decidida.** Documento de decisión, no de diseño.

> **Evidencia de FASE 0: completa.** A-1 🟢 · A-2 🟢 · A-3 🟢 · A-4 🟢 · A-5 🟢 · A-7 🟢 · A-6 🔴
> Cada decisión de acá abajo ya tiene evidencia **de producción**, no del repositorio.
> **No se implementa nada hasta que estén resueltas y lo autorices.**

---

## ✅ DECISIONES TOMADAS — 20/08/2026

| # | Decisión | Resuelto | Habilita |
|---|---|---|---|
| **DO-1** | `TABLES FROM authenticated` | **Fase 2** | B1.1 |
| **DO-2** | Límite de ajuste de puntos | **500 puntos por operación** | B1.2 |
| **DO-3** | Nota obligatoria | **Sí, en todo ajuste manual** | B1.2 |
| **DO-4** | ¿Odontólogo canjea premios? | **No** | B1.3 → `owner`, `admin`, `staff` |
| **DO-5** | ¿Aplicar B1.4? | **Sí** | B1.4 *(ver nota ⚠️)* |
| **DO-6** | Modelo de roles | **RBAC MULTIROL** — `owner`, `admin`, `odontologo`, `staff`. Un usuario puede tener varios | B1.5b + toda la Fase 2 |
| **DO-7** | Excepción de contención para R-2 | **No.** Los roles fuera del vocabulario se rechazan | *(ver nota ⚠️)* |
| **DO-8** | ¿Odontólogo administra plantillas? | **No** — queda en `owner`/`admin` | Fase 2 · política actual **ya es correcta**, sin cambio |
| **DO-9** | ¿`storage` en B1.1? | **Sí** — verificado sin riesgo | B1.1 |

### ✅ Las tres consecuencias, cerradas el 20/08/2026

**DO-5 · Excepción de contención — AUTORIZADA, acotada.**

> *"Autorizo modificar `src/app/pacientes/page.tsx` para corregir el falso mensaje de éxito del borrado. Es una corrección de comportamiento de UI necesaria para que la aplicación no informe una eliminación cuando RLS realmente no eliminó ninguna fila. **No autoriza otros cambios en `src/`**."*

La regla de contención pasa de *"cero archivos de `src/` modificados"* a **"un solo archivo: `src/app/pacientes/page.tsx`"**. Cualquier otro archivo de `src/` en el `git diff --stat` del cierre es una violación.

**DO-7 · R-2 queda parcialmente abierto — RIESGO RESIDUAL ACEPTADO.**

> *"En P0-05 cerramos el vocabulario de roles y documentamos explícitamente que la escalada de privilegios entre roles queda pendiente de una política de autorización jerárquica en Fase 2. No la considero resuelta por el simple CHECK."*

| | |
|---|---|
| **Se cierra en P0-05** | El vocabulario: un rol inventado se rechaza por integridad referencial |
| **Queda abierto** | La escalada `admin → owner`. `owner` es un valor válido del vocabulario |
| **Destino** | Política de autorización jerárquica en **Fase 2** |
| **Estado** | **Riesgo residual aceptado, con alcance definido.** No se considera cerrado |

**B1.5a · ELIMINADO como bloque independiente.**

> *"Si el modelo de roles definitivo de DO-6 ya establece el valor inicial correcto y el vocabulario se va a imponer mediante el mecanismo elegido, no tiene sentido mantener B1.5a como una pieza separada. El cambio de `DEFAULT 'admin'` a `DEFAULT 'staff'` debe incorporarse al diseño de roles/RBAC correspondiente, no quedar como un parche aislado."*

El valor inicial del rol se define **dentro del diseño multirol de DO-6**, no como migración suelta.

---

## Resumen original de las opciones

---

# DO-1 · ¿`TABLES FROM authenticated` en Fase 1 o Fase 2?

**Qué se decide.** Los `ALTER DEFAULT PRIVILEGES` hacen que toda tabla nueva nazca concedida. B1.1 revoca eso. La pregunta es si además de `anon` se revoca también `authenticated` **para tablas**.

### Evidencia de producción

**A-2.6 — hay dos roles creadores, no uno:**

```
postgres        · public · TABLAS y VISTAS · anon=arwdDxtm, authenticated=arwdDxtm
supabase_admin  · public · TABLAS y VISTAS · anon=arwdDxtm, authenticated=arwdDxtm
```

Los seis statements de `supabase_admin` **no están en ninguna migración**. **B1.1 tiene que cubrir los dos roles** — eso no es una decisión, es una corrección obligatoria.

**N-1 — precedente real:** `tenants` es la única tabla acotada:

```
anon=Dxtm          (sin lectura ni escritura)
authenticated=rDxtm  (solo SELECT)
```

**Y la aplicación funciona.** Ya existe una tabla donde `authenticated` no puede escribir y nadie lo notó.

### Opciones

| | Qué hace | Riesgo |
|---|---|---|
| **A · Fase 1** | Revoca `anon` **y** `authenticated` para TABLAS, en los dos roles | Una tabla nueva sin `GRANT` explícito **no carga** en la UI. Falla **silenciosa en producción** |
| **B · Fase 2** | Revoca solo `anon` ahora | Toda tabla nueva sigue naciendo concedida a `authenticated` |

### Recomendación

**B.** El modo de falla de A es una pantalla vacía en producción, no un error en desarrollo. Y mientras B1.6 no revoque las 34 tablas existentes, revocar el default de `authenticated` no cierra nada real — solo da sensación de cierre.

La guarda G-1 de B1.7 cubre el hueco de B: obliga a declarar el `GRANT` en cada migración nueva.

**⬜ DECISIÓN DEL OWNER:** ______

---

# DO-2 · Límite de ajuste de puntos

**Qué se decide.** `fn_ajustar_puntos_manual` no acota la magnitud. Cuánto es el máximo por operación.

### DATOS OBSERVADOS

**251 movimientos, 209 pacientes:**

| tipo | filas | máximo | promedio |
|---|---:|---:|---:|
| `migracion_inicial` | 159 | 200 | 16 |
| `gasto_tratamiento` | 88 | **390** | 92 |
| `bonus_asistencia` | 4 | 150 | 150 |
| **`ajuste_manual`** | **0** | — | — |
| **`ajuste_reverso`** | **0** | — | — |

**Nunca se hizo un ajuste manual.** Las cargas iniciales usaron `migracion_inicial`, el tipo separado.

**Config viva:** `ars_por_punto = 1000` · `ars_valor_canje = 50` · `racha_bonus_puntos = 150`.

**Escala:** ~11.240 puntos emitidos entre 209 pacientes ≈ **54 puntos por paciente** ≈ $2.700 de saldo promedio.

### RECOMENDACIÓN

**Piso técnico: 390.** Menos que eso bloquea la corrección legítima más grande que el sistema necesitó: re-acreditar un tratamiento de $390.000 no registrado.

| Opción | Cobertura | En pesos | Comentario |
|---|---|---:|---|
| 250 | ❌ no cubre 390 | $12.500 | Bloquea correcciones reales |
| 400 | justo | $20.000 | Cero margen |
| **500** | 390 + 28% | $25.000 | **Recomiendo** |
| 1000 | amplio | $50.000 | 18× el saldo promedio |

**Por qué 500 y no 400:** `ars_por_punto` es **fijo en 1000**. Con inflación, un tratamiento de $390.000 va a ser rutinario pronto y acreditará más puntos. 400 quedaría corto solo por el paso del tiempo.

**Modo de falla favorable:** si 500 queda corto, el admin ve un error en la UI y consulta. Ruidoso, no silencioso. Con 0 ajustes históricos, la fricción esperada es casi nula.

**Sugerencia:** dejarlo como constante nombrada dentro de la función, y revisarlo si tocás `ars_por_punto`.

**⬜ DECISIÓN DEL OWNER:** ______ puntos

---

# DO-3 · ¿Nota obligatoria en los ajustes?

**Qué se decide.** Hoy la función hace `COALESCE(p_nota, 'Ajuste manual de puntos')` — **inventa la nota** si llega `NULL`.

### Evidencia de producción

**Cero ajustes manuales en el histórico.** El `COALESCE` nunca se disparó.

**Costo de migración: cero.** No hay una sola fila que incumpliría. El 100% de los ajustes futuros cumpliría desde el día uno.

### Opciones

| | Riesgo |
|---|---|
| **A · Obligatoria** | Si la UI no manda nota, el flujo se rompe. **Verificable antes de aplicar** |
| **B · Dejar como está** | El ledger sigue pudiendo registrar ajustes sin justificación real |

### Recomendación

**A.** El ledger ya guarda `aprobado_por_usuario_id`, `monto_gasto_origen` y `cita_id` — es una estructura de auditoría completa. Sin la nota, falta el *por qué*, que es lo único que no se puede reconstruir después.

Y es la decisión más barata de todo el conjunto: costo de migración cero, y refuerza justo la operación que DO-2 está acotando.

**⬜ DECISIÓN DEL OWNER:** ______

---

# DO-4 · ¿El odontólogo puede canjear premios?

**Qué se decide.** `fn_canjear_premio` valida autenticación, pertenencia al tenant, premio activo, stock y saldo. **No valida rol.** Hoy cualquier miembro del tenant canjea.

### Evidencia de producción

**`canje_premio` = 0 filas.** **Nadie canjeó un premio nunca.** La funcionalidad existe, está expuesta y no se usa.

Eso baja las apuestas: cualquiera de las dos opciones tiene impacto operativo nulo hoy.

### Opciones

| | |
|---|---|
| **A · Sí** | Coherente con "el odontólogo administra la atención" |
| **B · No** | Coherente con "recepción administra la operación diaria" |

### Recomendación

**Ninguna.** Es política del negocio. Un canje entrega valor económico ($50 por punto), así que es más cercano a caja que a clínica — pero también puede ser parte del cierre de la consulta. **Vos sabés cómo se trabaja en el consultorio.**

**⬜ DECISIÓN DEL OWNER:** ______

---

# DO-5 · ¿Aplicar B1.4?

**Qué se decide.** Política RLS `FOR DELETE` sobre `pacientes` restringida a `owner`/`admin`.

### Evidencia de producción

**A favor:**

- **Una sola ruta borra pacientes** (`pacientes/page.tsx:139`) y usa el cliente `authenticated`. **No hay camino `service_role`.** Una policy RLS cubre el 100% de las rutas del código.
- **`presupuestos` = 0 filas** → el borrado funciona hoy. Se puede probar con normalidad. *(Retiro la objeción de que los tests #19-20 fueran falsos positivos.)*

**En contra — el hallazgo que cambia la decisión:**

RLS deniega devolviendo **0 filas y `error = null`**. Y la UI hace:

```ts
const {error} = await supabase.from('pacientes').delete().eq('id',sel.id)
if(error) return msg('Error al eliminar: '+error.message,'error')
setModal(null); msg('Paciente eliminado'); load()
```

**Aplicar B1.4 tal cual le mostraría a un odontólogo "Paciente eliminado" cuando el borrado fue denegado.** El paciente sigue ahí. Eso es peor que no tener el control.

### Opciones

| | Riesgo |
|---|---|
| **A · B1.4 + arreglo de UI** | **Toca `src/`** → rompe la contención de Fase 1 |
| **B · Diferir hasta autorizar el arreglo** | El borrado sigue disponible para los 4 roles |
| **C · B1.4 sin el arreglo** | ❌ **No es defendible.** Denegación silenciosa con mensaje de éxito |

### Recomendación

**A o B, nunca C.** Los dos usuarios actuales son `admin`, así que hoy B1.4 no cambia nada en la práctica: no hay urgencia. Si preferís mantener la contención, **B** es razonable.

**⬜ DECISIÓN DEL OWNER:** ______

---

# DO-6 · Modelo de `owner` 🔴

**La que más traba.** Bloquea B1.5b y todo el diseño de la Fase 2.

### Qué existe hoy — verificado en producción

```sql
tenant_users (
  id uuid PK, user_id uuid, tenant_id uuid,
  role text NOT NULL DEFAULT 'admin',   -- una columna, sin CHECK
  creado_en timestamptz
)
```

**N-1:** `tenant_users` tiene **3 políticas** RLS y `anon=arwdDxtm`.

**Lo que ya depende del rol:**

| tipo | dónde | condición |
|---|---|---|
| RLS | `arca_config_write` | `role IN ('admin','owner')` |
| RLS | `plantillas_write` | `role IN ('admin','owner')` |
| RLS | `crm_campanas_write` | `role IN ('admin','owner')` |
| RLS | `tenants_update_own` | `role IN ('admin','owner')` |
| API | `equipo/invitar:49` · `equipo/miembros:100,124` · `facturacion/anular:41` · `facturacion/config:95` · `pacientes/exportar:19` | idem |

**El día que exista el primer `odontologo` o `staff`, queda denegado en esas cuatro políticas sin cambiar una línea.**

### La inconsistencia

`owner` responde **quién es dueño** — propiedad, único, no delegable, no rotativo.
`odontologo` responde **qué hace** — función, varios posibles, contratable, rotativo.

**Son dos ejes en una sola columna.** Con un valor por usuario, "dueño que además ejerce" —tu caso— tiene que elegir entre administrar el negocio y atender clínicamente.

### Opciones

| | Cómo | Costo | Riesgo |
|---|---|---|---|
| **A · Booleano** | `role ∈ {admin, odontologo, staff}` + `es_dueno boolean` | Migración chica: `es_dueno = (role='owner')`. Reescribir 4 políticas + 5 rutas | Un solo eje funcional: un usuario sigue sin poder ser odontólogo **y** recepción |
| **B · Roles múltiples** | Tabla `tenant_user_roles`, N filas por usuario | Migración mayor. Reescribir 4 políticas + 5 rutas + toda consulta de rol | Complejidad que hoy no se necesita |
| **C · Convivir** | Dejar el modelo como está | Cero hoy | Se paga cada vez que se agregue una política por rol: hay que decidir caso por caso si `owner` cuenta como clínico |

**El costo de reescribir las 4 políticas y las 5 rutas es el mismo en A y en B.** Lo que las separa es si un usuario podrá tener más de una función.

### Recomendación

**Ninguna. No elijo.**

Depende de una pregunta de producto que el código no responde: **¿vas a tener usuarios con más de un rol funcional?** Si la respuesta es no y no la ves cambiando, A alcanza. Si tenés dudas, B evita una segunda migración.

Lo único que la evidencia sostiene: **el modelo actual no representa tu propio caso**, y el `CHECK` de B1.5b lo cementaría.

**⬜ DECISIÓN DEL OWNER:** ______

---

# DO-7 · ¿Excepción de contención para cerrar R-2?

**Qué se decide.** `/api/equipo/invitar` toma `role` del cuerpo del request y lo inserta con `supabaseAdmin` (`service_role`) sin lista blanca:

```ts
const { email, role, tenantId } = await req.json()        // :14
if (!ownerTenant || (ownerTenant.role !== 'owner' && ownerTenant.role !== 'admin')) { … }  // :49
await supabaseAdmin.from('tenant_users').insert({ …, role: role || 'staff' })  // :96, :118
```

Un `admin` puede crear un `owner`. **El `CHECK` de B1.5b no lo cierra** — `'owner'` es un valor válido.

### Evidencia de producción

Los dos usuarios actuales son `admin`, ambos de tu confianza. **Riesgo de explotación hoy: bajo.**

Pero R-11 mostró el patrón: un privilegio que "no debería estar" sobrevive años porque otra capa lo contiene. Acá la capa que contiene es que no hay usuarios hostiles.

### Opciones

| | Riesgo |
|---|---|
| **A · Corregir en Fase 1** | Rompe "cero archivos de `src/`". Son pocas líneas |
| **B · Fase 2** | La escalada `admin → owner` sigue abierta |

### Recomendación

**Ninguna. Es tu regla de contención, no una cuestión técnica.**

Un dato para ponderar: si DO-6 termina en A o B, esa ruta hay que tocarla igual para manejar el nuevo modelo. **Podría hacerse en el mismo cambio en vez de dos veces.**

**⬜ DECISIÓN DEL OWNER:** ______

---

# DO-8 · ¿El odontólogo administra plantillas de consentimiento?

**Qué se decide.** `plantillas_write` sobre `plantillas_consentimiento` permite `role IN ('admin','owner')`. Un `odontologo` no podría editar las plantillas que él mismo hace firmar.

### Evidencia de producción

**N-1:** `plantillas_consentimiento` tiene 2 políticas y RLS activa. La restricción por rol ya está viva — **se activa sola** el día que exista un `odontologo`.

### Opciones

| | Riesgo |
|---|---|
| **A · Sí** | Más superficie sobre documentos con valor legal |
| **B · No** *(estado actual)* | Fricción: el clínico depende del admin para corregir un texto que él usa |

### Recomendación

**Ninguna.** Depende de cómo entiendas la responsabilidad clínica. Un consentimiento informado es un documento legal **y** un instrumento clínico; el argumento existe de los dos lados.

**⬜ DECISIÓN DEL OWNER:** ______

---

# DO-9 · ¿El esquema `storage` entra en B1.1? *(nueva)*

**Qué se decide.** A-2.6 destapó algo que no estaba en el análisis previo:

```
postgres · storage · TABLAS y VISTAS · anon=arwdDxtm, authenticated=arwdDxtm
postgres · storage · FUNCIONES       · anon=X, authenticated=X
postgres · storage · SECUENCIAS      · anon=rwU, authenticated=rwU
```

**Cualquier tabla nueva en el esquema `storage` nacería con `GRANT ALL` para `anon`.**

### Evidencia de producción

Es el mismo patrón que en `public`. No sabemos si hay objetos propios en `storage` — **NO VERIFICADO**, y requeriría una consulta más.

Los esquemas de plataforma (`graphql`, `graphql_public`, `supabase_functions`) también conceden a `anon`, **pero no los administramos nosotros y tocarlos puede romper la plataforma**. `auth`, `cron`, `extensions` y `realtime` están correctamente cerrados.

### Opciones

| | Riesgo |
|---|---|
| **A · Incluir `storage` en B1.1** | Podría afectar el manejo de archivos si Supabase crea objetos ahí como `postgres` |
| **B · Solo `public`, `storage` a Fase 2** | Un objeto nuevo en `storage` nacería expuesto |
| **C · Verificar primero** | Una consulta más antes de decidir |

### Recomendación

**C, y después probablemente A.** La consulta es trivial y de solo lectura. Sin saber qué hay en `storage`, incluirlo a ciegas es exactamente el error que veníamos evitando.

**⬜ DECISIÓN DEL OWNER:** ______

---

## Lo que NO es decisión — correcciones obligatorias

Estas salen de la evidencia y no admiten opción. Van al diseño v2 tal cual:

| # | Corrección | Origen |
|---|---|---|
| 1 | **B1.1 cubre `postgres` Y `supabase_admin`** — 6 statements, no 3 | A-2.6 |
| 2 | **B1.6 alcanza 34 tablas**, no 12 | N-1 |
| 3 | **B1.6 debe revocar `anon` de `emitir_factura_con_detalle`** (R-11) | N-2 |
| 4 | **Agregar `, pg_temp` al `search_path` de 9 funciones** (R-12) | N-2 |
| 5 | **B1.1 y B1.6 se verifican con integración SQL**, nunca con PGlite | harness |
| 6 | **Los cuerpos vivos coinciden con el repo** → B1.2/B1.3 sin riesgo | A-1.2 |

---

## Qué pasa cuando decidas

1. Escribo **P0-05 v2** con B1.1 → B1.7, orden de migraciones, rollback por paso y criterios de aceptación.
2. Lo revisás.
3. **Solo con tu autorización explícita**, empieza B1.x.

**Nada se implementa antes de eso.**
