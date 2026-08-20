# P0-05 — Cierre de especificación

**Fecha:** 13 de agosto de 2026
**Estado:** auditoría de cierre. **Repositorio sin modificar. Sin migraciones. Sin git. Sin Supabase. Sin deploy.**
Solo comandos de lectura sobre el repositorio.

---

## 1. Resumen ejecutivo

La matriz de negocio está bien planteada. **La arquitectura actual no permite implementarla como está**, y no por un detalle: por dos hallazgos estructurales.

**Hallazgo 1 — No hay capa de API donde imponer permisos.**

Tu preferencia era *"autorización en API + RLS como defensa + trigger como última barrera"*. Auditado contra el código: **para la mayoría de los recursos de la matriz no existe ninguna API**. El navegador consulta Postgres directamente con la clave anónima.

| Recurso de la matriz | ¿Tiene API? | Cómo se accede hoy |
|---|---|---|
| Historia clínica (`historial_dental`) | **No** | `pacientes/[id]/page.tsx:556,671` |
| Fotos clínicas | **No** | `pacientes/[id]/page.tsx:721` |
| Finanzas (4 tablas) | **No** | `finanzas/page.tsx:127-135` |
| Fidelización | **No** | `pacientes/[id]/page.tsx:604,611` |
| Eliminar paciente | **No** | `pacientes/page.tsx:139` |
| Pacientes (contacto + clínico) | **No** | 10 archivos distintos |

**RLS no es la defensa: es la única barrera.** Construir la capa de API que tu preferencia asume sería un refactor de semanas sobre 42 componentes cliente.

**Hallazgo 2 — Hay un bypass sistémico de RBAC.**

`remote_schema.sql:1896`:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT ALL ON FUNCTIONS TO "authenticated";
```

**Toda función creada en `public` queda ejecutable por cualquier usuario logueado, automáticamente.** Y las funciones `SECURITY DEFINER` ignoran RLS por definición.

Hoy hay **cinco** funciones así, y ninguna verifica rol — solo pertenencia al tenant. Cualquier RBAC construido sobre RLS es evitable llamándolas.

**Veredicto: la especificación NO está lista.** Hay 6 bloqueantes, listados en §14. Ninguno es irresoluble; tres necesitan una decisión tuya.

---

## 2. Estado actual encontrado

### 2.1 · Dónde se impone algo hoy

**Policies RLS con rol — 4 tablas:**

| Tabla | Policy | Regla |
|---|---|---|
| `arca_config` | `arca_config_write` | `role IN ('admin','owner')` |
| `plantillas_consentimiento` | `plantillas_write` | `role IN ('admin','owner')` |
| `crm_campanas` | `crm_campanas_write` | `role IN ('admin','owner')` |
| `tenants` | `tenants_update_own` | `role IN ('owner','admin')` + grant por columna |

**Rutas API con rol — 7:**

`/api/billing/cancelar` · `/api/equipo/invitar` · `/api/equipo/miembros` · `/api/facturacion/anular` · `/api/facturacion/config` (solo POST) · `/api/pacientes/exportar` · `/api/admin/tenants` (eje distinto: admin de plataforma)

**Todo lo demás: aislamiento por clínica, sin rol.** Son ~20 tablas con `FOR ALL` y filtro solo por `tenant_id`.

### 2.2 · El patrón de acceso real

42 componentes con `'use client'` consultan Supabase directamente. El `tenantId` se resuelve en el navegador (`TenantContext.tsx`) y RLS filtra en la base.

Es un patrón válido —el cliente propone, la base dispone— pero significa que **el punto de imposición es RLS, no la aplicación**.

### 2.3 · Storage

| Bucket | Público | Policies | ¿Rol? |
|---|---|---|---|
| `fotos_clinicas` | No | 4 (SELECT/INSERT/UPDATE/DELETE), scope por carpeta = `tenant_id` | **No** |
| `logos` | **Sí** | 4, definidas en `supabase_migration_sprint_2_logos.sql` | **No** |

---

## 3. Decisiones pendientes

### D1 — Fidelización

**Qué encontré.**

`premios`: catálogo de la clínica (`nombre`, `costo_puntos`, `stock`, `activo`).
`config_fidelizacion`: parámetros (`ars_por_punto`, `racha_objetivo`, `racha_bonus_puntos`). **Una fila por clínica.**

**Sin API.** Se leen desde `pacientes/[id]/page.tsx:604,611`. Las operaciones pasan por **4 funciones `SECURITY DEFINER`** (`src/app/actions/fidelizacion.ts`):

| Función | Qué hace | ¿Verifica rol? |
|---|---|---|
| `fn_aprobar_asistencia` | Marca `asistio`, acredita puntos, evalúa racha | No |
| `fn_registrar_inasistencia` | Marca `ausente`/`cancelado`, rompe la racha | No |
| `fn_canjear_premio` | Descuenta stock y puntos, escribe el ledger | No |
| `fn_ajustar_puntos_manual` | Suma o resta puntos a mano | No |

Las cuatro validan pertenencia al tenant (`tenant_users`) pero **ninguna verifica rol**. Y las cuatro tienen `GRANT ALL ... TO authenticated`.

**Respuestas a lo que preguntaste.**

*¿Qué puede hacer hoy un usuario?* Cualquier miembro puede editar el catálogo, cambiar los parámetros, canjear premios y ajustar puntos a mano.

*¿Qué necesita Recepción?* **Canjear un premio** —ocurre en el mostrador cuando el paciente se va— y **marcar asistencia**, que dispara la acreditación de puntos. Son operación diaria.

*¿Qué necesita Odontólogo?* Marcar asistencia. Canjear, probablemente no: es un momento administrativo.

**El problema con la celda `PENDIENTE`: la fila mezcla dos cosas distintas.**

| Sub-recurso | Naturaleza | Owner | Admin | Odontólogo | Recepción |
|---|---|:---:|:---:|:---:|:---:|
| **Catálogo y parámetros** (`premios`, `config_fidelizacion`) | Configuración comercial | E | E | **L** | **L** |
| **Canjear un premio** (`fn_canjear_premio`) | Operación diaria | E | E | **—** | **E** |
| **Marcar asistencia** (`fn_aprobar_asistencia`) | Operación diaria | E | E | **E** | **E** |
| **Ajustar puntos a mano** (`fn_ajustar_puntos_manual`) | Corrección con impacto económico | E | E | **—** | **—** |

`fn_ajustar_puntos_manual` permite regalar puntos sin límite. Es el equivalente a una caja abierta.

**→ Decisión requerida: partir la fila "Fidelización" en cuatro sub-recursos.** Propuesta arriba.

---

### D2 — Presupuestos

**La tabla existe y la aplicación no la usa.**

```
grep -rn "from('presupuestos')" src/  →  0 resultados
```

Sin API, sin página, sin componente. `citas.presupuesto_id` existe pero nadie lo escribe.

**Es esquema muerto.** La celda `Owner E / Admin E / Odontólogo E / Recepción L` no describe ningún comportamiento actual: no hay flujo que auditar.

**→ Decisión requerida.** Tres opciones:

- **Dejar la celda como definición a futuro** y aplicar la policy igual. Cuesta nada y queda lista.
- **Excluir presupuestos de P0-05** hasta que se implemente la funcionalidad.
- **Eliminar la tabla** si no está en el roadmap.

*Sugerencia: la primera.* Aplicar la policy sobre una tabla vacía no tiene riesgo y evita que la funcionalidad nazca sin permisos, que es exactamente cómo llegamos acá.

---

### D3 — Perfil profesional

**No es lo que el nombre sugiere.**

```sql
CREATE TABLE perfil_doctor (
    id, nombre, clinica, zona_horaria, creado_en, tenant_id
);
```

**No tiene matrícula, ni firma, ni título, ni `user_id`.** Son tres campos de presentación, y la clave es `tenant_id`: **una fila por clínica, no una por profesional**.

Uso: solo lectura, en `/api/daily-briefing/route.ts:54`, para poner el nombre en el mail matutino. **No hay ningún camino de escritura en la aplicación.**

**Sobre tu pregunta de "self-service por propietario del registro":** no aplica. No existe el concepto de "mi perfil" — no hay columna que vincule una fila a un usuario. Para que un odontólogo editara su propio perfil sin tocar el de otros, primero habría que rediseñar la tabla con `user_id`.

**→ Decisión requerida.**

- **Ahora:** `Owner E / Admin E / Odontólogo L / Recepción L` es correcto, y de hecho ya se cumple de facto porque nadie escribe.
- **Anotado para después:** si se implementan perfiles por profesional (firma para consentimientos, matrícula en las facturas), va a hacer falta `user_id` y una regla de self-service. **Eso es rediseño de tabla, no una celda de la matriz.**

---

### D4 — Owner real

**No cambié ningún rol.** Solo el estado actual:

| Usuario | Rol | Clínica | ¿Candidato a owner? | Motivo |
|---|---|---|---|---|
| `odbenegaswalter@…` | `admin` | Consultorio Dr. Walter Benegas | **Sí** | Es el titular del consultorio. La clínica lleva su nombre y su dominio es `turnos.walterbenegas.com.ar` |
| `studioandbrand@…` | `admin` | Consultorio Dr. Walter Benegas | No | Cuenta de plataforma (coincide con `andbrand-studio`, la organización de Sentry). Da soporte, no es titular |

**Total: 2 usuarios, ambos `admin`, ningún `owner`.**

**No existe ninguna columna que identifique al titular.** `tenants` no tiene `owner_user_id`. La única señal es el rol en `tenant_users`, y hoy no distingue.

**Por qué pasó:** `remote_schema.sql:865` → `"role" "text" DEFAULT 'admin'`. Toda alta que no especifique rol crea un administrador.

**Impacto funcional hoy: ninguno.** Las 11 verificaciones aceptan `owner` **o** `admin`, así que los dos pueden todo.

**→ Decisión tuya:** a quién asignar `owner`. Sugerencia: el odontólogo.

**Aparte, no técnico:** `studioandbrand@…` es un acceso permanente de administrador dentro de la clínica de un cliente — ve historia clínica y finanzas. Hoy es razonable. Con cinco clínicas conviene que sea una decisión deliberada, no inercia.

---

### D5 — DELETE de pacientes

**Qué se destruye al borrar un paciente:**

| Tabla | FK | Efecto |
|---|---|---|
| `citas` | `ON DELETE CASCADE` | **Se borran todos los turnos** |
| `historial_dental` | `ON DELETE CASCADE` | **Se borra el odontograma completo** |
| `paciente_fotos` | `ON DELETE CASCADE` | **Se borran los registros de fotos** |
| `historial_puntos` | `ON DELETE CASCADE` | Se borra el ledger de fidelización |
| `feedback_post_visita` | `ON DELETE CASCADE` | Se borra el feedback |
| `presupuestos` | sin cascade | **Bloquea el DELETE** si hay filas |
| `pagos` | vía `citas` → CASCADE | **Se borran los cobros** |
| `tratamiento_items` | vía `citas` → CASCADE | Se borran los renglones |
| `enlaces_turno` | vía `citas` → CASCADE | Se borran los códigos cortos |
| `recordatorios_log` | vía `citas` → CASCADE | Se borra la auditoría de envíos |
| `facturas` | `cita_id ON DELETE SET NULL` | **La factura sobrevive, huérfana** |

**Tres hallazgos graves:**

**1 · Los archivos de Storage NO se borran.** El CASCADE elimina las filas de `paciente_fotos`, pero los objetos quedan en el bucket `fotos_clinicas`. **Fotos clínicas huérfanas, sin ninguna referencia que permita encontrarlas o borrarlas.**

**2 · Las facturas quedan huérfanas.** `facturas.cita_id → ON DELETE SET NULL`. El comprobante fiscal sobrevive —correcto— pero pierde el vínculo con el paciente. `facturas.paciente_nombre` y `paciente_doc_nro` se guardan desnormalizados, así que el dato fiscal se conserva. **Pero se pierde la trazabilidad.**

**3 · Se destruye la auditoría de cobros.** `pagos` cascadea vía `citas`. Un paciente con historial de pagos deja de tener rastro, mientras la factura sigue existiendo. **Descuadre entre facturación y cobranza.**

**Y hoy se hace desde el navegador**, sin ninguna API: `pacientes/page.tsx:139`.

**¿`Owner/Admin → DELETE`, el resto `—` es suficiente? No.**

**→ Recomendación: soft delete.**

| | DELETE físico | Soft delete (`archivado_en`) |
|---|---|---|
| Historia clínica | **Se destruye** | Se conserva |
| Fotos en Storage | **Quedan huérfanas** | Se conservan |
| Trazabilidad de facturas | **Se rompe** | Intacta |
| Auditoría de cobros | **Se destruye** | Intacta |
| Reversible | No | Sí |
| Cumple "derecho al olvido" | Sí | Requiere un borrado real aparte |

Para datos de salud, el borrado físico rara vez es lo correcto. La historia clínica tiene plazos de conservación, y un borrado accidental no se recupera.

**Propuesta:**

- Agregar `pacientes.archivado_en timestamptz`
- El botón "eliminar" archiva; las consultas filtran `archivado_en IS NULL`
- El DELETE físico queda **solo para `owner`**, con confirmación explícita, y con limpieza previa de Storage
- Matriz: `Archivar` → Owner/Admin `E` · resto `—` · `Eliminar definitivamente` → solo Owner

**Esto excede P0-05** (es cambio de esquema y de comportamiento). **→ Decisión: ¿entra en P0-05 o se separa?**
*Sugerencia: separarlo.* Y mientras tanto, restringir el DELETE a owner/admin como parche.

---

## 4. Matriz definitiva propuesta

Cambios respecto de tu matriz base, todos señalados y ninguno aplicado por mi cuenta:

| Recurso | Owner | Admin | Odontólogo | Recepción | Nota |
|---|:---:|:---:|:---:|:---:|---|
| Pacientes — contacto | E | E | E | E | |
| Historia clínica | E | E | E | L | §5 |
| Fotos clínicas | E | E | E | L | §5 + Storage |
| Consentimientos | E | E | E | E | |
| Plantillas de consentimiento | E | E | L | L | ya cumple |
| Agenda / turnos | E | E | E | E | |
| Cobros de turno | E | E | E | E | |
| Finanzas | E | E | — | — | |
| Emitir factura | E | E | E | E | ya cumple |
| Anular factura | E | E | — | — | ya cumple |
| Configuración fiscal ARCA | E | E | L | L | ya cumple |
| Configuración general | E | E | L | L | parcial |
| Campañas CRM | E | E | L | L | ya cumple |
| Equipo | E | E | L | L | ya cumple |
| Suscripción / plan | E | E | — | — | falta `checkout` |
| Exportar pacientes | E | E | — | — | ya cumple |
| **Importar pacientes** | E | E | — | — | **agregado** |
| **Archivar paciente** | E | E | — | — | **reemplaza "Eliminar"** |
| **Eliminar definitivamente** | E | — | — | — | **nuevo** — D5 |
| Presupuestos | E | E | E | L | esquema muerto — D2 |
| **Fidelización — catálogo y parámetros** | E | E | L | L | **partido** — D1 |
| **Fidelización — canjear premio** | E | E | — | E | **partido** — D1 |
| **Fidelización — marcar asistencia** | E | E | E | E | **partido** — D1 |
| **Fidelización — ajustar puntos** | E | E | — | — | **partido** — D1 |
| Perfil profesional | E | E | L | L | correcto — D3 |

**Owner ≡ Admin.** Documentado a propósito: hoy no hay diferencia funcional salvo `Eliminar definitivamente`, que es la primera celda donde se separan. La arquitectura queda preparada —`auth_has_role()` acepta listas— para diferenciarlos sin tocar policies.

---

## 5. Arquitectura recomendada para `pacientes`

### El problema

```sql
CREATE TABLE pacientes (
    nombre, telefono, email, fecha_nacimiento,   -- contacto → Recepción E
    alergias, antecedentes, recomendaciones,     -- CLÍNICO  → Recepción L
    dni_cuit, tipo_documento,                    -- fiscal
    token, token_expira, puntos_saldo_cache, ...
);
```

RLS opera por fila. Una policy no puede autorizar unas columnas y no otras.

### Evaluación de las cuatro opciones

| | Seguridad | Complejidad | Impacto | Riesgo de regresión | Supabase/RLS | Testing |
|---|---|---|---|---|---|---|
| **A · Endpoints separados** | **Débil** | Alta | **10 archivos** | Alto | Mal encaje | Medio |
| **B · Endpoint único + auth por campo** | **Débil** | Media | 10 archivos | Alto | Mal encaje | Medio |
| **C · RLS + trigger** | **Fuerte** | Baja | **Cero** | Bajo | Nativo | Alto |
| **D · Separar en dos tablas** | **Fuerte** | Alta | 6-8 archivos | Alto | Nativo | Alto |

**Por qué A y B son débiles acá, aunque en otra arquitectura serían correctas.**

`pacientes` se consulta desde **10 archivos cliente** con la clave anónima. Poner autorización en una API nueva no impide que el navegador siga hablando directo con Postgres. Habría que:

1. Construir las rutas
2. Migrar los 10 archivos
3. **Revocar el acceso directo a `pacientes` para `authenticated`** — lo que rompería cualquier consulta que quedara sin migrar

Sin el paso 3 no hay seguridad, solo la apariencia. Y el paso 3 es la parte que rompe cosas.

**Sobre tu preferencia inicial.** Dijiste *"autorización en API + RLS como defensa + trigger solo como última barrera"*. Es el orden correcto **en una arquitectura con capa de API**. Este proyecto no la tiene: el cliente es el consumidor directo de la base.

En esta arquitectura, **RLS y el trigger no son la última barrera: son la única.** Invertir el orden no es una preferencia de estilo — es adaptarse a dónde está realmente el límite de confianza.

### Recomendación: C ahora, D cuando toque

**C — RLS separada por operación + trigger de columnas clínicas:**

```
tenant_isolation_pacientes   FOR SELECT   → todos los miembros
tenant_write_pacientes       FOR INSERT/UPDATE/DELETE → todos (el contacto lo edita cualquiera)
trg_pacientes_campos_clinicos  BEFORE UPDATE
    → si cambian alergias / antecedentes / recomendaciones
      y el rol no está en (owner, admin, odontologo)
      → RAISE EXCEPTION
```

**Por qué funciona:** el trigger corre en la base, así que aplica **venga la escritura de donde venga** — cliente, API, RPC o el SQL Editor. Es el único punto que cubre los 10 archivos sin tocarlos.

**Detalle que evita falsos positivos:** comparar con `IS DISTINCT FROM`. Una actualización que no toca esas columnas pasa sin importar el rol, aunque las incluya en el `SET`.

**Deuda que genera:** hay que acordarse de sumar columnas clínicas nuevas al trigger. Se mitiga con un test que compare la lista del trigger contra las columnas de la tabla.

**D queda para cuando haya que tocar `pacientes` por otro motivo.** Es más limpio, pero es un refactor que toca el portal del paciente, la ficha, la importación y la exportación — y no aporta seguridad adicional sobre C.

---

## 6. Mapa Matriz → DB → API → UI → Storage

| Recurso | Tabla / Storage | API | Operación | UI | Rol | Dónde se impone |
|---|---|---|---|---|---|---|
| Pacientes — contacto | `pacientes` | **ninguna** | INSERT/UPDATE | `pacientes/page.tsx:100`<br>`dashboard/page.tsx:94`<br>`pacientes/[id]/page.tsx:814` | todos E | RLS `tenant_write_pacientes` |
| **Historia clínica — campos** | `pacientes.alergias`<br>`.antecedentes`<br>`.recomendaciones` | **ninguna** | UPDATE | `pacientes/[id]/page.tsx:814` | Recepción L | **Trigger** `trg_pacientes_campos_clinicos` |
| **Historia clínica — odontograma** | `historial_dental` | **ninguna** | INSERT/UPDATE | `pacientes/[id]/page.tsx:556,671` | Recepción L | RLS: SELECT todos · WRITE owner/admin/odontologo |
| **Fotos — registro** | `paciente_fotos` | **ninguna** | INSERT/DELETE | `pacientes/[id]/page.tsx:721` | Recepción L | RLS por rol |
| **Fotos — archivo** | Storage `fotos_clinicas` | **ninguna** | INSERT/UPDATE/DELETE | `pacientes/[id]/page.tsx:721` | Recepción L | **Policy de `storage.objects` con rol** |
| Consentimientos | `consentimientos_firmados` | `/api/consentimientos` GET/POST | INSERT | `pacientes/[id]` | todos E | ya cumple |
| Plantillas | `plantillas_consentimiento` | **ninguna** | UPDATE | `configuracion` | Od./Rec. L | ✅ `plantillas_write` |
| Agenda | `citas`, `bloqueos` | `/api/confirmar-turno` | ALL | `agenda/page.tsx:573,659`<br>`NuevaCitaModal:224` | todos E | sin cambio |
| Cobros | `pagos`, `tratamiento_items` | **ninguna** | INSERT/UPDATE | `DetalleCitaCobro.tsx` | todos E | sin cambio |
| **Finanzas** | `ingresos_manuales`<br>`egresos_manuales`<br>`costos_fijos`<br>`meta_mensual` | **ninguna** | ALL | `finanzas/page.tsx:127-135`<br>`dashboard/page.tsx:132` | Od./Rec. — | **RLS FOR ALL owner/admin** |
| Emitir factura | `facturas` + RPC | `/api/facturacion/emitir` | INSERT | `finanzas`, `facturas` | todos E | ya cumple |
| Anular | `facturas` | `/api/facturacion/anular` | INSERT (NC) | `facturas` | Od./Rec. — | ✅ ya cumple |
| Config ARCA | `arca_config` | `/api/facturacion/config` | UPDATE | `configuracion` | Od./Rec. L | ✅ ya cumple |
| **Config general** | `tenants` | **ninguna** | UPDATE | `configuracion` | Od./Rec. L | ✅ `tenants_update_own` |
| **Config — tratamientos** | `tratamientos` | **ninguna** | ALL | `admin/tratamientos/page.tsx:58` | Od./Rec. L | **RLS: SELECT todos · WRITE owner/admin** |
| CRM | `crm_campanas` | `/api/crm-campanas` (cron) | UPDATE | `crm`, `configuracion` | Od./Rec. L | ✅ ya cumple |
| Equipo | `tenant_users` | `/api/equipo/*` | INSERT/DELETE | `equipo` | Od./Rec. L | ✅ ya cumple |
| **Suscripción** | `tenants` | `/api/billing/checkout`<br>`/api/billing/cancelar` | UPDATE | `configuracion`, `precios` | Od./Rec. — | ⚠️ `cancelar` ✅ · **`checkout` falta** |
| Exportar | `pacientes` + otras | `/api/pacientes/exportar` | SELECT | `configuracion` | Od./Rec. — | ✅ ya cumple |
| **Importar** | `pacientes` | `/api/pacientes/importar` | INSERT masivo | `ImportarPacientesModal` | Od./Rec. — | **falta chequeo de rol** |
| **Archivar / eliminar paciente** | `pacientes` + cascadas | **ninguna** | DELETE | `pacientes/page.tsx:139` | Od./Rec. — | **RLS FOR DELETE + soft delete (D5)** |
| Presupuestos | `presupuestos` | **ninguna** | — | **ninguna** | Recepción L | esquema muerto (D2) |
| **Fidelización — catálogo** | `premios`, `config_fidelizacion` | **ninguna** | ALL | `pacientes/[id]:604,611` | Od./Rec. L | **RLS por rol** |
| **Fidelización — canjear** | RPC `fn_canjear_premio` | Server Action | RPC | `pacientes/[id]:1330` | Odont. — | **Rol DENTRO de la función** |
| **Fidelización — asistencia** | RPC `fn_aprobar_asistencia` | Server Action | RPC | `agenda`, `pacientes/[id]` | todos E | sin cambio |
| **Fidelización — ajustar puntos** | RPC `fn_ajustar_puntos_manual` | Server Action | RPC | `pacientes/[id]` | Od./Rec. — | **Rol DENTRO de la función** |
| Perfil profesional | `perfil_doctor` | `/api/daily-briefing` (lectura) | — | **ninguna** | Od./Rec. L | sin escritura hoy |

**Resumen: 9 controles ya cumplen · 6 son correctos por omisión · 11 requieren cambio.**

---

## 7. Bypass encontrados

### B1 — `ALTER DEFAULT PRIVILEGES` sobre funciones · **CRÍTICO**

```sql
-- remote_schema.sql:1896
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT ALL ON FUNCTIONS TO "authenticated";
```

**Toda función nueva en `public` queda ejecutable por cualquier usuario logueado.** Y `SECURITY DEFINER` ignora RLS.

Cualquier RBAC sobre RLS es evitable si existe una función que haga la operación. **Hay que revocar el default y hacer los GRANT explícitos.**

### B2 — Cinco funciones `SECURITY DEFINER` sin verificación de rol · **CRÍTICO**

| Función | Grant | Verifica tenant | Verifica rol |
|---|---|:---:|:---:|
| `fn_aprobar_asistencia` | `authenticated` | ✅ | ❌ |
| `fn_registrar_inasistencia` | `authenticated` | ✅ | ❌ |
| `fn_canjear_premio` | `authenticated` | ✅ | ❌ |
| `fn_ajustar_puntos_manual` | `authenticated` | ✅ | ❌ |
| `emitir_factura_con_detalle` | `authenticated` | ✅ | ❌ |

Las cuatro primeras escriben en `pacientes`, `citas`, `premios` e `historial_puntos` **salteando RLS**. Aunque bloqueemos esas tablas, la función sigue funcionando.

`emitir_factura_con_detalle` es correcta según la matriz (todos emiten), pero conviene que la verificación sea explícita y no accidental.

### B3 — Acceso directo del cliente a tablas sensibles · **ALTO**

10 archivos consultan `pacientes` directamente. `historial_dental`, `paciente_fotos`, `premios` y `config_fidelizacion` desde `pacientes/[id]/page.tsx`. Las 4 tablas de finanzas desde `finanzas/page.tsx`.

**No es un bypass de RLS** —RLS aplica igual— pero **sí de cualquier control que se ponga en la aplicación**. Confirma que RLS tiene que ser el punto de imposición.

### B4 — DELETE de paciente desde el navegador · **ALTO**

`pacientes/page.tsx:139`. Sin API, sin confirmación de rol, y cascadea a historia clínica, fotos, turnos y cobros. Ver D5.

### B5 — Storage sin rol · **ALTO**

Las 4 policies de `fotos_clinicas` scopean por `tenant_id` pero no por rol. **Hoy Recepción puede subir, sobrescribir y borrar fotos clínicas.** La matriz dice `L`.

### B6 — 22 rutas con `service_role` · **MEDIO**

Ya inventariadas en `P0_PRODUCTION_DIAGNOSTICS.md` §9. `service_role` saltea RLS por definición: en esas rutas el `if` es la única barrera. Ninguna verifica rol salvo las 7 listadas en §2.1.

### B7 — Vistas sin `security_invoker` · **MITIGADO**

Las 6 vistas `bi_*` corren como `postgres` y saltean RLS. **El acceso de `anon` y `authenticated` fue revocado el 09/08** (P0-07). Pero **siguen existiendo**: si alguien las vuelve a exponer, saltean también el RBAC. Se cierra con el `DROP` pendiente.

---

## 8. Tenant isolation

**Verificado: el RBAC propuesto no debilita P0-01.**

El patrón actual es:

```sql
tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
```

El propuesto:

```sql
tenant_id IN (SELECT tenant_id FROM tenant_users
              WHERE user_id = auth.uid() AND role IN ('owner','admin'))
```

**El filtro por rol se agrega a la misma subconsulta, que sigue anclada en `tenant_users`.** El conjunto resultante es un subconjunto estricto del actual: no puede incluir un tenant que antes no estuviera.

**El error que hay que evitar** —y por eso lo dejo escrito— es separar las condiciones:

```sql
-- ❌ INCORRECTO
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  OR auth_has_role(tenant_id, ARRAY['owner'])   -- ← un OR acá abre todo
)
```

Un `OR` mal puesto entre la condición de tenant y la de rol convierte el aislamiento en opcional.

**Regla para la implementación:** rol y tenant siempre en la **misma** subconsulta sobre `tenant_users`, unidos por `AND`. Nunca en cláusulas separadas.

**Y `auth_has_role(p_tenant_id, p_roles)` debe recibir el tenant como parámetro** y filtrar por él internamente. Una versión que solo mire el rol sin el tenant respondería "sí" para un rol en *otra* clínica.

**Test obligatorio:** usuario `owner` del tenant A intentando escribir en el tenant B → denegado. Para cada tabla que cambie.

---

## 9. Plan de implementación

### Fase 0 · Cerrar decisiones — sin código

D1, D2, D3, D5 y el alcance del soft delete. **Bloquea todo lo demás.**

### Fase 1 · Higiene de roles — 2 h, riesgo nulo

- `CHECK (role IN ('owner','admin','odontologo','staff'))`
- `DEFAULT 'staff'` en vez de `'admin'`
- Asignar `owner` (D4)
- Verificar `SELECT DISTINCT role FROM tenant_users` antes de aplicar el CHECK

### Fase 2 · Cerrar bypasses — 1 día · **antes que el RBAC**

- **B1:** revocar el default privilege sobre funciones y hacer los GRANT explícitos
- **B2:** agregar verificación de rol dentro de las 5 funciones `SECURITY DEFINER`
- **B7:** aplicar el `DROP` de las vistas BI

**Este orden no es negociable.** Construir RBAC sobre RLS antes de cerrar B1 y B2 es poner una cerradura en una puerta que tiene la ventana abierta al lado.

### Fase 3 · Infraestructura — 1 día

- `auth_tenant_ids()` y `auth_has_role(tenant_id, roles[])` — `STABLE SECURITY DEFINER`, envueltas en `(select ...)`
- `src/lib/autorizacion.ts` con `requireMembership()`
- Migrar las 21 rutas — **refactor sin cambio de comportamiento**

### Fase 4 · Observación — 5 a 7 días

Policies nuevas **en modo permisivo**, registrando qué habrían denegado, con una clínica trabajando.

**No se puede saltear.** Si Recepción viene escribiendo `alergias` como parte de su rutina, hay que enterarse antes de cortarle el acceso.

### Fase 5 · RLS por tandas — 2 a 3 días

De menor a mayor impacto:

1. Finanzas (nadie de recepción las usa hoy)
2. `tratamientos`, `premios`, `config_fidelizacion`
3. `paciente_fotos` + policies de Storage
4. `historial_dental`
5. Trigger de campos clínicos en `pacientes` ← **la última**

### Fase 6 · API — 0.5 día

`/api/billing/checkout` y `/api/pacientes/importar`. Es lo único que falta del lado de las rutas.

### Fase 7 · UI — 1 a 2 días

Ocultar lo que el rol no puede hacer y manejar los 403 con un mensaje claro. **Es comodidad, no seguridad** — el control ya está en la base.

### Fase 8 · Tests — 2 días

§10.

### Fase 9 · Enforcement — 1 día

Quitar el modo permisivo. Monitorear 48 h.

**Total: 10 a 14 días**, con la observación en paralelo.

---

## 10. Plan de testing

Hoy **no existe ni un test de roles**.

### Unit — `vitest`, sin base

`auth_has_role()`, `requireMembership()`, la lista de columnas clínicas del trigger contra el esquema real.

### RLS — PGlite, como `tenant-isolation.test.ts`

La matriz completa: **4 roles × 11 operaciones = 44 casos**, permitido y denegado.

| Operación | Owner | Admin | Odontólogo | Recepción |
|---|:---:|:---:|:---:|:---:|
| Leer contacto | ✓ | ✓ | ✓ | ✓ |
| Editar contacto | ✓ | ✓ | ✓ | ✓ |
| Leer historia clínica | ✓ | ✓ | ✓ | ✓ |
| **Editar historia clínica** | ✓ | ✓ | ✓ | **✗** |
| **Editar `pacientes.alergias`** | ✓ | ✓ | ✓ | **✗** |
| Leer fotos | ✓ | ✓ | ✓ | ✓ |
| **Editar fotos** | ✓ | ✓ | ✓ | **✗** |
| **Ver finanzas** | ✓ | ✓ | **✗** | **✗** |
| Emitir factura | ✓ | ✓ | ✓ | ✓ |
| **Anular factura** | ✓ | ✓ | **✗** | **✗** |
| **Exportar pacientes** | ✓ | ✓ | **✗** | **✗** |
| **Eliminar paciente** | ✓ | ✓ | **✗** | **✗** |

### Tenant isolation — PGlite

Por cada tabla que cambie: `owner` del tenant A escribiendo en el tenant B → denegado. **Es la regresión más peligrosa de todo P0-05.**

### Bypass — PGlite + guardas de código fuente

- Recepción llamando `fn_ajustar_puntos_manual` → denegado
- Recepción llamando `fn_canjear_premio` → denegado *(según D1)*
- Test de patrón: **ninguna función nueva sin `REVOKE ... FROM PUBLIC` explícito**
- Test de patrón: ninguna vista sobre tabla con RLS sin `security_invoker`

### Storage — requiere Supabase real

Las policies de `storage.objects` no se pueden probar en PGlite. **Verificación manual documentada**, o un test de integración contra un proyecto de staging.

### Integration — rutas API

Las 21 rutas: 401 sin sesión, 403 con rol insuficiente, 200 con rol correcto.

### E2E — manual

Una jornada completa de Recepción: agendar, cobrar, marcar asistencia, enviar recordatorio. **Sin ningún 403 inesperado.**

---

## 11. Criterios de aceptación

Modifico los tuyos en dos puntos y agrego tres.

| # | Criterio | Verificación |
|---|---|---|
| 1 | **Cero funciones con GRANT implícito** | `ALTER DEFAULT PRIVILEGES` revocado; toda función con `REVOKE`+`GRANT` explícito |
| 2 | **Cero `SECURITY DEFINER` sin verificación de rol** | Las 5 auditadas y corregidas |
| 3 | 100 % de la matriz cubierta | Cada fila mapeada a una policy, trigger o chequeo concreto |
| 4 | Tests RBAC en verde | 44 casos |
| 5 | **Tenant isolation intacta** | Los 81 tests actuales siguen pasando + los nuevos cross-tenant |
| 6 | Storage alineado | Policies con rol, verificadas contra Supabase real |
| 7 | Cero endpoints sensibles sin autorización | Inventario de §6 completo |
| 8 | UI consistente con backend | Ningún botón visible que dé 403 |
| 9 | **Observación sin bloqueos inesperados** | ≥5 días, log revisado |
| 10 | **Enforcement progresivo con rollback probado** | Cada tanda revertible sin deploy |
| 11 | **Test de patrón contra regresión** | Falla si aparece una función o vista nueva sin protección |

**Modificaciones a tus criterios:**

- *"0 bypass conocidos"* → lo reemplacé por los criterios 1 y 2, que son verificables. "Conocidos" depende de cuánto buscamos; "cero funciones con grant implícito" se comprueba con una consulta.
- Agregué el **11**, porque los otros diez verifican el estado al cerrar, no que se mantenga.

---

## 12. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Cerrar permisos rompe la operación diaria** | **Alto** | Fase 4 de observación + tandas + rollback por tanda |
| **Un `OR` mal puesto rompe tenant isolation** | **Crítico** | §8: rol y tenant en la misma subconsulta. Test cross-tenant por tabla |
| Las funciones auxiliares degradan la performance | Medio | `(select ...)`. `EXPLAIN ANALYZE` sobre `citas` antes y después |
| El trigger bloquea una actualización legítima | Medio | `IS DISTINCT FROM`. Test con update que no toca columnas clínicas |
| Storage queda desalineado | Medio | Fase 5 punto 3. Viven en `storage.objects`, fácil de olvidar |
| **Se implementa antes de que haya a quién restringir** | Medio | 2 usuarios, ambos admin legítimos. **Nadie está sobre-privilegiado hoy** |
| Aparece una columna clínica nueva sin sumar al trigger | Medio | Test que compare la lista contra el esquema |
| Revocar el default privilege rompe algo no auditado | Medio | Inventariar todas las funciones antes. Aplicar en staging |

---

## 13. Preguntas que necesito responder antes de implementar

| # | Pregunta | Bloquea |
|---|---|---|
| **P1** | ¿Se acepta partir "Fidelización" en 4 sub-recursos? (D1) | Fases 2 y 5 |
| **P2** | Presupuestos: ¿policy preventiva, excluir, o eliminar la tabla? (D2) | Fase 5 |
| **P3** | ¿Soft delete entra en P0-05 o se separa? (D5) | Fase 5 · **el de mayor impacto** |
| **P4** | ¿A quién se asigna `owner`? (D4) | Fase 1 |
| **P5** | ¿Se acepta que RLS+trigger sea el punto principal y no la API? (§5) | **Toda la arquitectura** |
| **P6** | ¿Recepción puede canjear premios? (D1) | Fase 2 |
| **P7** | ¿Se implementa ahora o antes de la primera clínica con personal? (§12) | El calendario |

**P5 es la que más pesa.** Contradice tu preferencia inicial, y quiero que la decisión sea explícita y no que se filtre por omisión.

---

## 14. VEREDICTO

## ¿La especificación está lista para implementación?

# NO

Falta poco, y nada es irresoluble. Pero hay **6 bloqueantes**:

### Bloqueantes técnicos — hay que resolverlos antes del RBAC

| # | Bloqueante | Por qué bloquea |
|---|---|---|
| **BL1** | `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO authenticated` | Cualquier función nueva puede saltear el RBAC. **Construir encima sería falsa seguridad** |
| **BL2** | 5 funciones `SECURITY DEFINER` sin verificación de rol | Escriben en las tablas que vamos a proteger, salteando RLS |
| **BL3** | Storage sin rol en las 4 policies | La matriz exige Odontólogo `E` / Recepción `L` sobre fotos. Hoy no hay forma de distinguirlos |

### Bloqueantes de decisión — tuyos

| # | Bloqueante | Referencia |
|---|---|---|
| **BL4** | Fidelización: la fila mezcla configuración con operación | D1 · P1 · P6 |
| **BL5** | DELETE de pacientes: destruye historia clínica y deja fotos huérfanas en Storage | D5 · P3 |
| **BL6** | Arquitectura: ¿RLS+trigger como punto principal en vez de API? | §5 · P5 |

### Lo que sí está cerrado

- ✅ La matriz de negocio, con las cuatro filas partidas señaladas
- ✅ D3 (perfil profesional) — resuelto: no aplica self-service, no existe la estructura
- ✅ D4 — inventario completo, decisión pendiente pero sin ambigüedad
- ✅ El mapa de 25 recursos a tabla, API, UI y punto de imposición
- ✅ Tenant isolation: verificado que el RBAC propuesto no lo debilita, con la regla del `AND`
- ✅ Plan de 9 fases, plan de testing, 11 criterios de aceptación

**Con BL1, BL2 y BL3 resueltos —son 1 a 2 días de trabajo acotado— y las tres decisiones tomadas, la especificación queda lista.**

---

*Auditoría de cierre. No se modificó ningún archivo, no se crearon migraciones, no se ejecutó git, no se tocó Supabase, no hubo deploy. Todos los comandos fueron de lectura sobre el repositorio.*
