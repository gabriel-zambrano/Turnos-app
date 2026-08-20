# P0-05 — Matriz de permisos: de decisión de negocio a especificación técnica

**Fecha:** 13 de agosto de 2026
**Estado:** especificación. **Sin código escrito, sin migraciones, sin cambios.**

---

## 1. El modelo, en una línea

> **Owner/Admin administran el negocio · Odontólogo administra la atención clínica · Recepción administra la operación diaria.**

Cuatro roles: `owner`, `admin`, `odontologo`, `recepcion`.

*(El rol que hoy se llama `staff` pasa a llamarse `recepcion`. Ver §6.)*

---

## 2. La matriz aprobada

`E` = leer y escribir · `L` = solo leer · `—` = sin acceso

| Recurso | Owner | Admin | Odontólogo | Recepción |
|---|:---:|:---:|:---:|:---:|
| Pacientes (contacto) | E | E | E | E |
| Historia clínica | E | E | E | **L** |
| Fotos clínicas | E | E | E | **L** |
| Consentimientos (solicitar/firmar) | E | E | E | E |
| Plantillas de consentimiento | E | E | L | L |
| Agenda / turnos | E | E | E | E |
| Cobros de un turno | E | E | E | E |
| Finanzas | E | E | **—** | **—** |
| Emitir factura | E | E | E | E |
| Anular factura | E | E | — | — |
| Configuración fiscal (ARCA) | E | E | L | L |
| Configuración general | E | E | L | L |
| Campañas CRM | E | E | L | L |
| Equipo | E | E | L | L |
| Suscripción / plan | E | E | — | — |
| Exportar / importar pacientes | E | E | — | — |

---

## 3. El hallazgo del mapeo

**La tabla `pacientes` mezcla datos de contacto con datos clínicos.**

```sql
CREATE TABLE pacientes (
    nombre, telefono, email, fecha_nacimiento,   -- ← contacto: Recepción E
    alergias, antecedentes, recomendaciones,     -- ← CLÍNICO: Recepción L
    dni_cuit, tipo_documento,                    -- ← fiscal
    token, puntos_saldo_cache, ...
);
```

La fila "Pacientes (contacto)" dice `E` para Recepción. La fila "Historia clínica" dice `L`. **Pero `alergias` y `antecedentes` viven en la misma tabla que `nombre` y `telefono`.**

RLS opera **por fila, no por columna**. Una policy no puede decir "esta persona puede actualizar estas tres columnas pero no aquellas dos". Con RLS sola, las opciones son ambas o ninguna.

### Por qué importa

Es la celda que da sentido al rol Recepción. Sin resolverla, quedan dos salidas y las dos son malas:

- Recepción **escribe todo** → puede modificar antecedentes médicos. Se pierde la distinción.
- Recepción **no escribe nada** → no puede corregir un teléfono mal cargado. Deja de servir.

### Tres formas de resolverlo

**Opción A · Grants a nivel de columna**

Postgres los soporta, y **este proyecto ya usa el patrón**:

```sql
-- supabase_migration_.../fix_branding.sql:26
GRANT UPDATE (nombre, direccion, telefono, primarycolor, ...) ON tenants TO authenticated;
```

**Limitación que lo descarta:** los grants son por rol **de base de datos** (`authenticated`), no por rol de aplicación. Todos los usuarios logueados usan `authenticated`, así que no se puede diferenciar Recepción de Odontólogo por esta vía.

**Opción B · Trigger de validación** — *recomendada*

Un `BEFORE UPDATE` que rechaza cambios en las columnas clínicas si el rol no está autorizado:

```
si (OLD.alergias IS DISTINCT FROM NEW.alergias
    OR OLD.antecedentes IS DISTINCT FROM NEW.antecedentes
    OR OLD.recomendaciones IS DISTINCT FROM NEW.recomendaciones)
   y el rol del usuario no está en (owner, admin, odontologo)
→ RAISE EXCEPTION
```

**A favor:** no toca el esquema, no rompe ninguna consulta existente, granularidad exacta, y funciona igual desde la app o desde cualquier cliente.
**En contra:** un trigger más que mantener. Y hay que acordarse de sumar columnas clínicas nuevas.

**Opción C · Separar en dos tablas**

Mover `alergias`, `antecedentes` y `recomendaciones` a `pacientes_clinico`.

**A favor:** el más limpio conceptualmente. RLS por tabla, sin triggers.
**En contra:** migración de datos, y toca `/api/paciente/[token]`, la ficha del paciente, la importación y la exportación. Es un refactor, no un ajuste de permisos.

**Recomendación: B ahora, C cuando haya que tocar esa tabla por otro motivo.**

---

## 4. Estado actual, tabla por tabla

### 4.1 · Ya cumplen la matriz — no se tocan

| Recurso | Objeto | Control actual |
|---|---|---|
| Config fiscal | `arca_config` | `arca_config_write`: `role IN ('admin','owner')` ✅ |
| Plantillas consentimiento | `plantillas_consentimiento` | `plantillas_write`: `role IN ('admin','owner')` ✅ |
| Campañas CRM | `crm_campanas` | `crm_campanas_write`: `role IN ('admin','owner')` ✅ |
| Config general | `tenants` | `tenants_update_own`: `role IN ('owner','admin')` + grant por columna ✅ |
| Anular factura | `/api/facturacion/anular` | `role !== 'admin' && role !== 'owner'` → 403 ✅ |
| Config fiscal (API) | `/api/facturacion/config` POST | ídem ✅ |
| Exportar pacientes | `/api/pacientes/exportar` | ídem ✅ |
| Suscripción (cancelar) | `/api/billing/cancelar` | `['owner','admin']` ✅ |
| Equipo | `/api/equipo/invitar`, `/miembros` | owner/admin ✅ |

**Nueve controles ya alineados.** Con 4 roles siguen siendo correctos: ni Odontólogo ni Recepción entran en esas listas, que es lo que dice la matriz.

### 4.2 · Correctos por omisión — confirmados, no se tocan

Estos no verifican rol, y **según la matriz está bien**, porque los cuatro roles tienen `E`:

| Recurso | Objeto |
|---|---|
| Agenda | `citas`, `bloqueos` |
| Cobros | `pagos`, `tratamiento_items` |
| Emitir factura | `facturas` INSERT · `emitir_factura_con_detalle` · `/api/facturacion/emitir` |
| Consentimientos | `consentimientos_firmados` · `/api/consentimientos` |
| Recordatorios | `/api/recordatorios`, `/api/send-recordatorios`, `/api/confirmar-turno`, `/api/enlaces-turno` |
| Cuidados | `/api/cuidados/enviar` |

> **Corrección a lo que dije antes.** En la auditoría marqué como inconsistencia que `/api/facturacion/emitir` pidiera menos permisos que `/anular`. Con la matriz cerrada, **emitir para los cuatro roles es lo correcto**. No era un error: era una decisión sin tomar. **Ese "quick win" queda descartado.**

### 4.3 · Necesitan cambio

| # | Recurso | Objeto | Hoy | Debe ser |
|---|---|---|---|---|
| **C1** | Historia clínica (odontograma) | `historial_dental` | `tenant_isolation_historial_dental` FOR ALL, sin rol | SELECT todos · escritura owner/admin/odontologo |
| **C2** | Fotos clínicas | `paciente_fotos` + bucket `fotos_clinicas` | Ídem, sin rol | Ídem. **Y las policies de Storage** |
| **C3** | Historia clínica (campos) | `pacientes.alergias`, `.antecedentes`, `.recomendaciones` | Sin control por columna | **Trigger (§3, opción B)** |
| **C4** | Finanzas | `ingresos_manuales`, `egresos_manuales`, `costos_fijos`, `meta_mensual` | FOR ALL, sin rol | Solo owner/admin, lectura y escritura |
| **C5** | Config general | `tratamientos` | FOR ALL, sin rol | SELECT todos · escritura owner/admin |
| **C6** | Suscripción | `/api/billing/checkout` | Solo membresía | owner/admin |
| **C7** | Importar pacientes | `/api/pacientes/importar` | Solo membresía | owner/admin |
| **C8** | Fidelización | `premios`, `config_fidelizacion` | FOR ALL, sin rol | **Decisión pendiente** (§7) |
| **C9** | Presupuestos | `presupuestos` | FOR ALL, sin rol | **Decisión pendiente** (§7) |

**Nueve cambios.** Siete son mecánicos; C3 necesita el trigger; C8 y C9 necesitan una decisión.

---

## 5. Infraestructura previa

### 5.1 · Funciones auxiliares

Hoy cada policy repite el subselect. Con 4 roles y ~25 policies, eso se vuelve inmanejable.

```
auth_tenant_ids()                          → uuid[]     STABLE SECURITY DEFINER
auth_has_role(tenant_id, roles text[])     → boolean    STABLE SECURITY DEFINER
```

**Detalle que no se puede omitir:** invocarlas siempre envueltas en `(select auth_has_role(...))`. Es la misma optimización que el proyecto ya aplicó en `supabase_migration_perf_2_rls.sql` — hace que Postgres evalúe una vez por consulta y no una vez por fila. Sin eso, se degradan todas las consultas del sistema.

### 5.2 · Separar policies por operación

Donde lectura y escritura difieren, hay que dejar de usar `FOR ALL`:

```
tenant_isolation_<tabla>   FOR SELECT                  → todos los miembros
tenant_write_<tabla>       FOR INSERT/UPDATE/DELETE    → roles habilitados
```

### 5.3 · Helper de autorización en el backend

Un solo `requireMembership(req, tenantId, rolesPermitidos?)` que reemplace las 21 copias del mismo bloque. Es prerequisito: sin él, cada cambio de la matriz significa editar 21 archivos.

`equipo/miembros:26-40` ya tiene una versión local — es el modelo a generalizar.

---

## 6. Migración de `staff` → `recepcion`

Hoy el rol se llama `staff` y la UI lo muestra como *"Staff (Secretaria)"*.

**Dos caminos:**

- **Renombrar** a `recepcion` — más claro, pero toca datos existentes y todas las verificaciones.
- **Conservar `staff`** como nombre interno y cambiar solo la etiqueta de la UI.

**Recomendación: conservar `staff`.** El nombre interno no aporta nada y renombrarlo agrega una migración de datos sin beneficio funcional. La matriz se implementa igual.

En este documento se usa "Recepción" por legibilidad; en la base sigue siendo `staff`.

---

## 7. Decisiones que faltan

| # | Pregunta | Contexto | Sugerencia |
|---|---|---|---|
| **D1** | ¿Cómo se resuelve el problema de columnas clínicas? | §3 | **Opción B** (trigger) |
| **D2** | ¿Quién gestiona premios y fidelización? | Es marketing, no clínica | Owner/Admin `E` · resto `L` |
| **D3** | ¿Quién arma presupuestos? | Tiene componente clínico y comercial | Owner/Admin/Odontólogo `E` · Recepción `L` |
| **D4** | ¿Quién ve `perfil_doctor`? | Datos del profesional (matrícula, firma) | Owner/Admin `E` · resto `L` |
| **D5** | ¿Recepción puede borrar un paciente? | Hoy sí. Cascadea a historia clínica y fotos | **No.** Solo owner/admin |

**D5 no estaba en la matriz y es importante:** `pacientes` tiene `ON DELETE CASCADE` hacia `historial_dental`, `paciente_fotos`, `citas` e `historial_puntos`. Borrar un paciente destruye su historia clínica completa. No debería poder hacerlo alguien con `L` sobre esos datos.

---

## 8. Plan de implementación

### Fase 0 · Preparación — 2 h, sin riesgo

- `CHECK (role IN ('owner','admin','odontologo','staff'))` sobre `tenant_users`
- `DEFAULT 'staff'` en vez de `'admin'`
- Asignar `owner` a la clínica actual *(hoy tiene dos `admin` y ningún dueño)*
- Verificar: `SELECT DISTINCT role FROM tenant_users` debe dar solo valores esperados

### Fase 1 · Infraestructura — 1 día

- `auth_tenant_ids()` y `auth_has_role()`
- `src/lib/autorizacion.ts` con `requireMembership()`
- Migrar las 21 rutas al helper — **refactor sin cambio de comportamiento**
- Tests: cada ruta responde igual que antes

### Fase 2 · Observación — 5 a 7 días

Desplegar las policies nuevas **en modo permisivo**, registrando qué habrían denegado.

**Es el paso que no se puede saltear.** Hay una clínica trabajando todos los días. Si Recepción viene escribiendo `alergias` como parte de su rutina, hay que enterarse **antes** de cortarle el acceso, no después.

### Fase 3 · Aplicar — 2 a 3 días

Por tandas, de menor a mayor impacto operativo:

1. Finanzas (C4) — nadie de recepción las usa hoy
2. Config general (C5), suscripción (C6), importar (C7)
3. Fotos clínicas (C2)
4. Historia clínica (C1 + C3) — la última, es la más sensible

### Fase 4 · Tests — 2 días

Hoy **no existe ni un solo test de roles**. Por cada celda de la matriz, dos casos: permitido y denegado. Sobre PGlite con `SET ROLE authenticated`, como ya hace `tenant-isolation.test.ts`.

Prioridad:

- Recepción **no puede** escribir `historial_dental`
- Recepción **no puede** modificar `pacientes.alergias`
- Recepción **no puede** leer `costos_fijos` ni `meta_mensual`
- Odontólogo **no puede** leer finanzas
- Odontólogo **sí puede** escribir historia clínica
- Recepción **no puede** borrar un paciente
- Un rol inválido no se puede insertar en `tenant_users`

**Total estimado: 8 a 12 días**, con 5-7 de observación en paralelo.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Cerrar permisos rompe la operación diaria de la clínica** | Es el riesgo dominante. Fase 2 de observación, y aplicar por tandas |
| El trigger de C3 bloquea una actualización legítima | Que valide **solo** las columnas clínicas, comparando `IS DISTINCT FROM`. Una actualización que no las toca pasa sin importar el rol |
| Las funciones auxiliares degradan la performance de RLS | Envolver en `(select ...)`. Medir con `EXPLAIN ANALYZE` sobre `citas` antes y después |
| Storage queda desalineado con la base | C2 incluye las policies del bucket. Fácil de olvidar: viven en `storage.objects`, no con las demás |
| Se implementa antes de que haya a quién restringir | **Hoy la clínica tiene 2 usuarios, ambos admin.** Nadie está sobre-privilegiado. Esto es capacidad de producto, no una corrección urgente |

---

## 10. Sobre la prioridad

Con dos administradores legítimos y ninguna recepcionista, **P0-05 no está protegiendo a nadie hoy.**

Es una funcionalidad necesaria para vender a consultorios con personal —y un argumento comercial concreto: un odontólogo contratado no ve la rentabilidad del consultorio—. Pero no es una fuga abierta.

**Sugerencia: implementarlo antes de incorporar la primera clínica con más de un usuario, no antes de eso.**

La Fase 0 (2 horas) sí conviene hacerla ya: el `DEFAULT 'admin'` es lo que hizo que esta clínica tenga dos administradores y ningún dueño, y va a seguir pasando con cada alta nueva.

---

*Especificación. No se escribió código, no se crearon migraciones, no se modificó la base de datos.*
