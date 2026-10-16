# P0-05 — Decisiones P1 a P7

**Fecha:** 13 de agosto de 2026
**Estado:** análisis para decisión. **Sin migraciones, sin cambios en policies, sin funciones modificadas, sin deploy, sin tocar Supabase.**
Solo lectura del repositorio.

---

## 0. Una corrección a lo que dije antes

En el informe anterior planteé el `ALTER DEFAULT PRIVILEGES` (`remote_schema.sql:1896`) como la causa de que las cinco funciones estén abiertas. **Es más preciso decir otra cosa.**

Las cinco tienen `REVOKE ... FROM PUBLIC` seguido de `GRANT ... TO authenticated` **explícito** (`remote_schema.sql:1616-1641`, `pagos_y_multitratamiento.sql:267-268`). O sea: están abiertas **a propósito**, porque la aplicación necesita llamarlas.

El problema real es doble y conviene separarlo:

- **Riesgo presente:** las cinco están concedidas a `authenticated` y **ninguna verifica rol**. Eso es lo que rompe el RBAC.
- **Riesgo futuro:** el `ALTER DEFAULT PRIVILEGES` hace que **toda función nueva** nazca concedida a `authenticated` sin que nadie lo escriba. Es una trampa para la próxima función `SECURITY DEFINER` que alguien agregue.

Los dos hay que cerrarlos, pero son problemas distintos.

---

## 1. Diagnóstico de las cinco funciones

**Diagnóstico únicamente. Ninguna fue modificada.**

| | `fn_canjear_premio` | `fn_ajustar_puntos_manual` | `fn_aprobar_asistencia` | `fn_registrar_inasistencia` | `emitir_factura_con_detalle` |
|---|---|---|---|---|---|
| **DEFINER / INVOKER** | `SECURITY DEFINER` | `SECURITY DEFINER` | `SECURITY DEFINER` | `SECURITY DEFINER` | `SECURITY DEFINER` |
| **`search_path`** | `public, pg_temp` | `public, pg_temp` | `public, pg_temp` | `public, pg_temp` | `public` ⚠️ |
| **Quién ejecuta hoy** | `authenticated`, `service_role` | ídem | ídem | ídem | `authenticated` |
| **`REVOKE FROM PUBLIC`** | Sí | Sí | Sí | Sí | Sí |
| **Tablas que modifica** | `premios` (stock)<br>`pacientes` (saldo)<br>`historial_puntos` | `pacientes` (saldo)<br>`historial_puntos` | `citas` (estado)<br>`pacientes` (saldo, visitas, racha)<br>`historial_puntos` ×2 | `pacientes` (racha)<br>`citas` (estado) | `facturas`<br>`factura_items`<br>`factura_pagos` |
| **Verifica autenticación** | Sí — `auth.uid()` | Sí | Sí | Sí | Implícito |
| **Verifica tenant** | **Sí** — vía `premios.tenant_id` | **Sí** — vía `pacientes.tenant_id` | **Sí** — vía `citas.tenant_id` | **Sí** — vía `citas.tenant_id` | **Sí** — `p_tenant_id` |
| **Verifica rol** | **NO** | **NO** | **NO** | **NO** | **NO** |
| **¿Saltea RLS?** | **Sí** | **Sí** | **Sí** | **Sí** | **Sí** |
| **¿`authenticated` la ejecuta directo?** | **Sí** | **Sí** | **Sí** | **Sí** | **Sí** |
| **Si implementamos RBAC sin tocarla** | Recepción bloqueada en `premios` por RLS **pero canjea igual por la función** | **Cualquier miembro modifica saldos sin límite** | Sin impacto — la matriz permite a todos | Sin impacto | Sin impacto — la matriz permite a todos |

### 1.1 · Interpretación función por función

**`fn_canjear_premio` — bypass real.**
La matriz dice Odontólogo `—` para canjear. Si bloqueamos `premios` con RLS pero no tocamos la función, el odontólogo canjea igual: la función lee `premios` como `postgres` y escribe el ledger. **RLS no lo detiene.**

**`fn_ajustar_puntos_manual` — el más grave.**
Permite sumar puntos **sin ningún límite superior**. La única validación es que el saldo no quede negativo. Con `config_fidelizacion.ars_valor_canje` en 50 ARS por defecto, 1.000 puntos son $50.000 en premios.

Hoy la ejecuta cualquier miembro. La matriz propuesta la restringe a owner/admin. **Sin verificación de rol dentro de la función, esa restricción no existe.**

**`fn_aprobar_asistencia` y `fn_registrar_inasistencia` — sin impacto de RBAC.**
La matriz permite a los cuatro roles marcar asistencia, así que no verificar rol es correcto según la matriz.

**Pero hay algo aparte:** `fn_aprobar_asistencia` escribe `citas.estado = 'asistio'` y acredita puntos con impacto económico. `fn_registrar_inasistencia` marca `cancelado` — **y no valida que la cita sea futura ni que no esté facturada**. Es el mismo problema que P0-08 en el portal del paciente, por otro camino. **NO VERIFICADO** si en la práctica se usa sobre citas pasadas.

**`emitir_factura_con_detalle` — correcta según la matriz.**
Los cuatro roles emiten. No verificar rol es lo que corresponde. **Detalle menor:** su `search_path` es `public` y no `public, pg_temp`, a diferencia de las otras cuatro. Es una inconsistencia de endurecimiento, no una vulnerabilidad conocida.

### 1.2 · Conclusión del diagnóstico

**Dos funciones bloquean el RBAC:** `fn_canjear_premio` y `fn_ajustar_puntos_manual`.
**Tres no lo bloquean**, pero conviene que su permisividad sea explícita y no accidental.

---

## 2. Ejemplo de policy — la regla del AND

Antes de escribir ninguna, dejo el patrón fijado.

### ✅ Correcto — tenant y rol en la misma subconsulta

```sql
-- historial_dental · lectura: todos los miembros
CREATE POLICY tenant_read_historial_dental ON historial_dental
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tu.tenant_id
      FROM tenant_users tu
      WHERE tu.user_id = (select auth.uid())
    )
  );

-- historial_dental · escritura: owner, admin, odontologo
CREATE POLICY tenant_write_historial_dental ON historial_dental
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tu.tenant_id
      FROM tenant_users tu
      WHERE tu.user_id = (select auth.uid())
        AND tu.role IN ('owner','admin','odontologo')   -- ← AND, misma subconsulta
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tu.tenant_id
      FROM tenant_users tu
      WHERE tu.user_id = (select auth.uid())
        AND tu.role IN ('owner','admin','odontologo')
    )
  );
```

**Por qué es seguro:** el conjunto de `tenant_id` que devuelve la subconsulta es un **subconjunto estricto** del que devolvía la policy anterior. Agregar `AND role IN (...)` solo puede quitar filas, nunca sumar un tenant que antes no estuviera.

### ❌ Incorrecto — el error a evitar

```sql
USING (
  tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = (select auth.uid()))
  OR auth_has_role(ARRAY['owner'])        -- ← sin tenant, y con OR
)
```

Dos fallas juntas: el `OR` hace que cumplir **una sola** de las condiciones alcance, y `auth_has_role` sin `tenant_id` responde "sí" si el usuario es owner **de cualquier clínica**. Resultado: un owner del tenant A accede al tenant B.

### La firma del helper importa

```sql
-- ✅ Recibe el tenant y filtra por él
auth_has_role(p_tenant_id uuid, p_roles text[]) RETURNS boolean

-- ❌ Sin tenant: responde por el rol en cualquier clínica
auth_has_role(p_roles text[]) RETURNS boolean
```

**Regla obligatoria:** `tenant isolation AND role authorization`, siempre dentro de la misma subconsulta sobre `tenant_users`. Nunca en cláusulas separadas, nunca con `OR`.

---

## 3. Fidelización desagregada

Separada en cinco sub-recursos —los cuatro que pediste más el camino automático de acreditación:

| Sub-recurso | Objeto técnico | Naturaleza | Owner | Admin | Odontólogo | Recepción |
|---|---|---|:---:|:---:|:---:|:---:|
| **Consultar puntos** | `pacientes.puntos_saldo_cache`<br>`historial_puntos` SELECT | Información | **L** | **L** | **L** | **L** |
| **Administrar catálogo** | `premios`<br>`config_fidelizacion` | Configuración comercial | **E** | **E** | **L** | **L** |
| **Canjear premio** | `fn_canjear_premio` | Operación de mostrador | **E** | **E** | **—** | **E** |
| **Acreditar por asistencia** | `fn_aprobar_asistencia` | Automático al marcar asistencia | **E** | **E** | **E** | **E** |
| **Ajustar puntos a mano** | `fn_ajustar_puntos_manual` | Corrección con impacto económico | **E** | **E** | **—** | **—** |

### Fundamento de cada fila

**Consultar puntos → `L` para todos.** El saldo se muestra en la ficha del paciente y en el portal público. No hay motivo para ocultarlo a ningún rol interno.

**Administrar catálogo → owner/admin.** Definir qué premios existen y cuántos puntos cuestan es una decisión comercial. `config_fidelizacion` fija cuánto vale un punto en pesos: es parametrización del negocio.

**Canjear premio → Recepción sí, Odontólogo no.** El canje ocurre en el mostrador, cuando el paciente se va. Es operación diaria de recepción. El odontólogo, en el sillón, no canjea.

**Acreditar por asistencia → los cuatro.** Marcar que un paciente asistió es operación normal, y la acreditación es un efecto automático. Restringirlo rompería la agenda.

**Ajustar puntos a mano → solo owner/admin.**

Es la fila que más importa. La función:

- No tiene **límite superior**. La única validación es que el saldo no quede negativo.
- Con `ars_valor_canje = 50` (valor por defecto), 1.000 puntos = **$50.000** en premios.
- Es el equivalente a una caja abierta: permite regalar valor sin contrapartida.

Sí registra en el ledger (`historial_puntos.aprobado_por_usuario_id`), así que es auditable. Pero auditable no es lo mismo que restringido.

**→ Recomendación adicional, fuera de la matriz:** evaluar un tope por ajuste (por ejemplo, 500 puntos) y exigir `nota` no vacía. Hoy `p_nota` acepta `NULL` y la función lo reemplaza por un texto genérico.

---

## 4. Eliminación de pacientes — hard vs soft

### 4.1 · Qué destruye un DELETE hoy

| Objeto | Mecanismo | Resultado |
|---|---|---|
| `citas` | `ON DELETE CASCADE` | **Todos los turnos, borrados** |
| `historial_dental` | `ON DELETE CASCADE` | **Odontograma completo, borrado** |
| `paciente_fotos` | `ON DELETE CASCADE` | **Registros borrados** |
| `historial_puntos` | `ON DELETE CASCADE` | Ledger de fidelización, borrado |
| `feedback_post_visita` | `ON DELETE CASCADE` | Feedback, borrado |
| `pagos` | vía `citas` → CASCADE | **Cobros, borrados** |
| `tratamiento_items` | vía `citas` → CASCADE | Renglones de tratamiento, borrados |
| `recordatorios_log` | vía `citas` → CASCADE | **Auditoría de envíos, borrada** |
| `enlaces_turno` | vía `citas` → CASCADE | Códigos cortos, borrados |
| `presupuestos` | **sin cascade** | **Bloquea el DELETE** si hay filas |
| `facturas` | `cita_id ON DELETE SET NULL` | **Sobrevive, huérfana** |
| **Storage `fotos_clinicas`** | **ninguno** | **Los archivos quedan** |

### 4.2 · Los tres problemas del hard delete

**1 · Fotos clínicas huérfanas en Storage.**
El CASCADE borra las filas de `paciente_fotos`, que son las que guardan la ruta del archivo. Los objetos quedan en el bucket **sin ninguna referencia que permita encontrarlos**. No hay forma de listarlos ni de borrarlos después: se pierde el índice.

Es la consecuencia menos evidente y la más difícil de revertir.

**2 · Descuadre entre facturación y cobranza.**
`facturas` sobrevive (correcto: es comprobante fiscal, y guarda `paciente_nombre` y `paciente_doc_nro` desnormalizados). Pero `pagos` se borra vía `citas`. Queda una factura emitida **sin rastro del cobro que la respalda**.

**3 · Historia clínica irrecuperable.**
Odontograma y turnos, destruidos. Para datos de salud hay plazos de conservación, y un borrado accidental no se deshace.

**Y hoy se ejecuta desde el navegador**, sin API: `pacientes/page.tsx:139`.

### 4.3 · Comparación

| | Hard delete | Soft delete (`archivado_en`) |
|---|---|---|
| Historia clínica | **Destruida** | Conservada |
| Fotos en Storage | **Huérfanas** | Conservadas |
| Trazabilidad de facturas | **Rota** | Intacta |
| Auditoría de cobros | **Destruida** | Intacta |
| Reversible | No | Sí |
| Cumple pedido de borrado del titular | Sí | Requiere purga real aparte |
| Complejidad de implementación | Ya existe | `archivado_en` + filtro en ~10 archivos |
| Riesgo de regresión | — | Medio: hay que filtrar en todas las consultas |

### 4.4 · Recomendación

**Soft delete, en tres etapas:**

1. **Ahora (parche, 1 h):** restringir el DELETE a owner/admin vía RLS `FOR DELETE`. No arregla la destrucción, pero limita quién puede provocarla.
2. **P0-05 o inmediatamente después:** `pacientes.archivado_en timestamptz`. El botón "eliminar" archiva. Las consultas filtran `archivado_en IS NULL`.
3. **Aparte:** un procedimiento de purga real para pedidos de borrado del titular, que **también borre los objetos de Storage** antes del DELETE.

**Matriz resultante:**

| Operación | Owner | Admin | Odontólogo | Recepción |
|---|:---:|:---:|:---:|:---:|
| Archivar paciente | E | E | — | — |
| Eliminar definitivamente | **E** | **—** | — | — |

**Eliminar definitivamente solo owner**, con confirmación explícita y limpieza previa de Storage. Es la primera operación donde Owner y Admin dejan de ser equivalentes.

**NO VERIFICADO:** cuántos pacientes archivados esperaría la clínica, ni si la pantalla de pacientes necesita una vista de archivados. Es diseño de producto.

---

## 5. Decisiones P1 a P7

### P1 — ¿Se acepta partir "Fidelización" en sub-recursos?

| | |
|---|---|
| **Decisión requerida** | Tratar fidelización como 5 recursos con permisos distintos, en vez de uno |
| **Estado actual** | `premios` y `config_fidelizacion` con `FOR ALL` sin rol. 3 funciones `SECURITY DEFINER` sin verificación de rol |
| **Opciones** | **A ·** Partir en 5 (§3) · **B ·** Un solo recurso owner/admin `E`, resto `L` · **C ·** Dejar como está |
| **Recomendación** | **A** |
| **Riesgo A** | Bajo. Más policies y verificaciones, pero cada una simple |
| **Riesgo B** | **Rompe la operación:** Recepción no podría canjear un premio en el mostrador |
| **Riesgo C** | Cualquier miembro ajusta saldos sin límite |
| **Impacto técnico** | 2 policies nuevas + verificación de rol dentro de 2 funciones |
| **Afecta** | `premios`, `config_fidelizacion`, `historial_puntos` · `fn_canjear_premio`, `fn_ajustar_puntos_manual` · `pacientes/[id]/page.tsx:604,611,1330` · `src/app/actions/fidelizacion.ts` |

**→ TU RESPUESTA: _____________**

---

### P2 — Presupuestos: ¿policy preventiva, excluir, o eliminar?

| | |
|---|---|
| **Decisión requerida** | Qué hacer con una tabla que existe y nadie usa |
| **Estado actual** | `presupuestos` existe con RLS sin rol. `grep "from('presupuestos')" src/` → **0 resultados**. Sin API, sin UI. `citas.presupuesto_id` existe y nadie lo escribe |
| **Opciones** | **A ·** Policy preventiva ahora · **B ·** Excluir de P0-05 · **C ·** Eliminar la tabla |
| **Recomendación** | **A** |
| **Riesgo A** | Nulo — tabla vacía, sin consumidores |
| **Riesgo B** | La funcionalidad nace sin permisos cuando se implemente. Es exactamente cómo llegamos acá |
| **Riesgo C** | Si está en el roadmap, hay que rehacerla. **NO VERIFICADO** si lo está |
| **Impacto técnico** | 2 policies. Cero cambios de código |
| **Afecta** | `presupuestos` · `citas.presupuesto_id` (FK sin cascade, bloquea el DELETE de pacientes) |

**→ TU RESPUESTA: _____________**

---

### P3 — Soft delete: ¿dentro de P0-05 o separado?

| | |
|---|---|
| **Decisión requerida** | Alcance y momento del cambio de estrategia de borrado |
| **Estado actual** | Hard delete desde el navegador (`pacientes/page.tsx:139`), sin API, sin rol. Cascadea a 9 tablas. **Deja fotos huérfanas en Storage** |
| **Opciones** | **A ·** Parche ahora (RLS owner/admin) + soft delete después · **B ·** Soft delete completo dentro de P0-05 · **C ·** Solo el parche |
| **Recomendación** | **A** |
| **Riesgo A** | Bajo. Cierra el acceso ya, difiere el rediseño |
| **Riesgo B** | Alarga P0-05 en 2-3 días y agrega riesgo de regresión en ~10 archivos |
| **Riesgo C** | Owner/Admin siguen pudiendo destruir historia clínica sin recuperación |
| **Impacto técnico** | **A:** 1 policy `FOR DELETE`. **B:** columna + filtro en ~10 archivos + purga de Storage |
| **Afecta** | `pacientes` + 9 tablas en cascada · bucket `fotos_clinicas` · `pacientes/page.tsx:139` · `facturas.cita_id` |

**→ TU RESPUESTA: _____________**

---

### P4 — ¿A quién se asigna `owner`?

| | |
|---|---|
| **Decisión requerida** | Cuál de los dos usuarios es el titular |
| **Estado actual** | 2 usuarios, **ambos `admin`, ningún `owner`**. Causa: `role text DEFAULT 'admin'` (`remote_schema.sql:865`). No existe columna que identifique al titular |
| **Opciones** | **A ·** `odbenegaswalter@…` (el odontólogo) · **B ·** `studioandbrand@…` (plataforma) · **C ·** Ambos owner |
| **Recomendación** | **A** |
| **Riesgo A** | Nulo hoy. Si en el futuro solo owner elimina definitivamente, la plataforma pierde esa capacidad — que probablemente sea correcto |
| **Riesgo B** | El titular del consultorio no es dueño de su propia clínica en el sistema |
| **Riesgo C** | Diluye el concepto. Owner deja de significar algo |
| **Impacto técnico** | Un `UPDATE` de una fila |
| **Afecta** | `tenant_users` · las 11 verificaciones que aceptan `owner` o `admin` (sin cambio funcional hoy) |

**→ TU RESPUESTA: _____________**

---

### P5 — ¿RLS + trigger como punto principal, en vez de API?

**La más importante. Contradice tu preferencia inicial.**

| | |
|---|---|
| **Decisión requerida** | Dónde vive el límite de confianza del sistema |
| **Estado actual** | El navegador consulta Postgres **directamente** para: `pacientes` (10 archivos), `historial_dental`, `paciente_fotos`, las 4 tablas de finanzas, `premios`, `config_fidelizacion`, `tratamientos`. **Ninguno tiene API** |
| **Opciones** | **A ·** RLS + trigger como principal · **B ·** Construir capa de API y revocar acceso directo · **C ·** Híbrido: API para lo nuevo, RLS para lo existente |
| **Recomendación** | **A** |

**Qué habría que revocar en la opción B, y qué se rompe:**

```sql
REVOKE SELECT, INSERT, UPDATE, DELETE ON pacientes        FROM authenticated;
REVOKE ...                            ON historial_dental FROM authenticated;
REVOKE ...                            ON paciente_fotos   FROM authenticated;
REVOKE ...                            ON ingresos_manuales, egresos_manuales,
                                         costos_fijos, meta_mensual FROM authenticated;
```

Con eso, **dejan de funcionar hasta migrarse**:

| Archivo | Qué se rompe |
|---|---|
| `pacientes/page.tsx` | Listado, alta, borrado, generar link |
| `pacientes/[id]/page.tsx` | Ficha completa: odontograma, fotos, fidelización, consentimientos |
| `dashboard/page.tsx` | Alta rápida, cobro suelto, métricas |
| `agenda/page.tsx` | Alta de paciente desde la agenda |
| `finanzas/page.tsx` | La pantalla entera |
| `crm/page.tsx`, `seguimiento/page.tsx`, `recordatorios/page.tsx` | Listados |
| `NuevaCitaModal`, `CommandPalette`, `ChecklistBienvenida` | Búsqueda y alta |

**Son ~12 archivos y varias semanas.** Y hasta completarlo, el sistema queda a medias: los que no migraron dejan de andar.

| | |
|---|---|
| **Riesgo A** | La lógica de permisos vive en SQL, no en TypeScript. Menos familiar, más difícil de leer en un PR. **Pero es el único punto que cubre los 12 archivos sin tocarlos** |
| **Riesgo B** | **Alto.** Semanas de refactor, riesgo de regresión en toda la app, y sin el REVOKE no aporta seguridad — solo apariencia |
| **Riesgo C** | La peor: dos modelos conviviendo, y nadie sabe cuál aplica dónde |
| **Impacto técnico** | **A:** ~15 policies + 1 trigger, cero cambios de código. **B:** ~10 rutas nuevas + 12 archivos migrados + REVOKE |
| **Afecta** | **A:** solo migraciones SQL. **B:** prácticamente toda la app |

**Sobre tu preferencia.** *"Autorización en API + RLS como defensa + trigger como última barrera"* es el orden correcto **cuando existe una capa de API**. Acá el cliente es consumidor directo de la base: no hay una capa donde poner la autorización sin construirla primero.

**En esta arquitectura, RLS y el trigger no son la última barrera: son la única.** No es una preferencia de estilo — es dónde está realmente el límite de confianza.

**→ TU RESPUESTA: _____________**

---

### P6 — ¿Recepción puede canjear premios?

| | |
|---|---|
| **Decisión requerida** | Si el canje es operación de mostrador o acto administrativo |
| **Estado actual** | Cualquier miembro canjea, vía `fn_canjear_premio` (`SECURITY DEFINER`, sin rol) |
| **Opciones** | **A ·** Recepción `E`, Odontólogo `—` · **B ·** Ambos `E` · **C ·** Solo owner/admin |
| **Recomendación** | **A** |
| **Riesgo A** | Bajo. Recepción descuenta stock y saldo — auditable en `historial_puntos` |
| **Riesgo B** | Ninguno de seguridad. Más superficie sin necesidad clara |
| **Riesgo C** | Fricción: habría que llamar al dueño para canjear un premio en el mostrador |
| **Impacto técnico** | Verificación de rol dentro de `fn_canjear_premio` |
| **Afecta** | `fn_canjear_premio` · `premios.stock` · `pacientes.puntos_saldo_cache` · `historial_puntos` · `pacientes/[id]/page.tsx:1330` |

**→ TU RESPUESTA: _____________**

---

### P7 — ¿Ahora o antes de la primera clínica con personal?

| | |
|---|---|
| **Decisión requerida** | Cuándo se ejecuta P0-05 |
| **Estado actual** | 2 usuarios, ambos `admin` **legítimos**. **Nadie está sobre-privilegiado.** Ninguna recepcionista, ningún odontólogo contratado |
| **Opciones** | **A ·** Ahora completo (10-14 días) · **B ·** Solo bypasses + higiene ahora (2-3 días), RBAC después · **C ·** Todo después |
| **Recomendación** | **B** |
| **Riesgo A** | Bajo de seguridad. **Alto costo de oportunidad:** 2 semanas en algo que hoy no protege a nadie, mientras P0-02 (llaves eternas) y P0-06 (facturas huérfanas) siguen abiertos |
| **Riesgo B** | Los bypasses quedan cerrados y el RBAC queda especificado. Es el equilibrio |
| **Riesgo C** | Los bypasses siguen abiertos, y `fn_ajustar_puntos_manual` sin límite es riesgo real hoy |
| **Impacto técnico** | **B:** cerrar 2 funciones + `CHECK` + `DEFAULT` + asignar owner + `DROP` de vistas BI |
| **Afecta** | `fn_canjear_premio`, `fn_ajustar_puntos_manual`, `tenant_users`, vistas `bi_*` |

**→ TU RESPUESTA: _____________**

---

## A. Matriz definitiva propuesta

| Recurso | Owner | Admin | Odontólogo | Recepción |
|---|:---:|:---:|:---:|:---:|
| Pacientes — contacto | E | E | E | E |
| Historia clínica — odontograma | E | E | E | L |
| Historia clínica — alergias/antecedentes | E | E | E | L |
| Fotos clínicas | E | E | E | L |
| Consentimientos — solicitar/firmar | E | E | E | E |
| Plantillas de consentimiento | E | E | L | L |
| Agenda / turnos | E | E | E | E |
| Cobros de turno | E | E | E | E |
| Finanzas | E | E | — | — |
| Emitir factura | E | E | E | E |
| Anular factura | E | E | — | — |
| Configuración fiscal ARCA | E | E | L | L |
| Configuración general | E | E | L | L |
| Tratamientos | E | E | L | L |
| Campañas CRM | E | E | L | L |
| Equipo | E | E | L | L |
| Suscripción / plan | E | E | — | — |
| Exportar pacientes | E | E | — | — |
| Importar pacientes | E | E | — | — |
| **Archivar paciente** | E | E | — | — |
| **Eliminar definitivamente** | **E** | **—** | — | — |
| Presupuestos | E | E | E | L |
| **Fidelización — consultar puntos** | L | L | L | L |
| **Fidelización — catálogo y parámetros** | E | E | L | L |
| **Fidelización — canjear premio** | E | E | **—** | **E** |
| **Fidelización — acreditar asistencia** | E | E | E | E |
| **Fidelización — ajustar puntos** | E | E | — | — |
| Perfil profesional | E | E | L | L |

**Owner ≡ Admin salvo en "Eliminar definitivamente".** Documentado a propósito. La arquitectura queda preparada para diferenciarlos: `auth_has_role()` acepta listas, así que separar una celda más es cambiar un array.

---

## B. Recursos que requieren RBAC

| # | Recurso | Objeto | Cambio |
|---|---|---|---|
| 1 | Historia clínica — odontograma | `historial_dental` | RLS: SELECT todos · WRITE owner/admin/odontologo |
| 2 | Historia clínica — campos | `pacientes.alergias/antecedentes/recomendaciones` | **Trigger** |
| 3 | Fotos — registro | `paciente_fotos` | RLS por rol |
| 4 | Fotos — archivo | Storage `fotos_clinicas` | **4 policies con rol** |
| 5 | Finanzas | `ingresos_manuales`, `egresos_manuales`, `costos_fijos`, `meta_mensual` | RLS `FOR ALL` owner/admin |
| 6 | Tratamientos | `tratamientos` | RLS: SELECT todos · WRITE owner/admin |
| 7 | Fidelización — catálogo | `premios`, `config_fidelizacion` | RLS: SELECT todos · WRITE owner/admin |
| 8 | Fidelización — canjear | `fn_canjear_premio` | **Rol dentro de la función** |
| 9 | Fidelización — ajustar | `fn_ajustar_puntos_manual` | **Rol dentro de la función** |
| 10 | Archivar / eliminar paciente | `pacientes` | RLS `FOR DELETE` owner/admin |
| 11 | Suscripción | `/api/billing/checkout` | Chequeo de rol en la ruta |
| 12 | Importar pacientes | `/api/pacientes/importar` | Chequeo de rol en la ruta |
| 13 | Presupuestos | `presupuestos` | RLS por rol *(preventivo — P2)* |

**13 recursos.** 9 por RLS, 2 por función, 2 por ruta, 1 por trigger, 1 por Storage.

---

## C. Bypasses a cerrar ANTES del RBAC

| # | Bypass | Severidad | Por qué antes |
|---|---|---|---|
| **1** | `fn_ajustar_puntos_manual` sin rol ni límite | **Crítica** | Modificación arbitraria de saldos. Riesgo **hoy**, sin esperar al RBAC |
| **2** | `fn_canjear_premio` sin rol | **Alta** | Saltea la policy de `premios`. El RBAC sería decorativo |
| **3** | `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO authenticated` | **Alta** | Toda función nueva nace abierta. Trampa para la próxima |
| **4** | Storage sin rol (4 policies) | **Alta** | La matriz exige Odontólogo `E` / Recepción `L`. Sin esto no hay forma de distinguirlos |
| **5** | Vistas `bi_*` sin `security_invoker` | **Media** | Acceso ya revocado. Siguen existiendo: se cierra con el `DROP` |
| **6** | 22 rutas con `service_role` | **Media** | `service_role` saltea RLS. El `if` es la única barrera. Ya inventariadas |

---

## D. Decisiones P1–P7 · tu respuesta pendiente

| # | Pregunta | Recomendación | Bloquea | Tu respuesta |
|---|---|---|---|---|
| **P1** | ¿Partir fidelización en 5? | **Sí** | Fases 2 y 5 | ☐ |
| **P2** | Presupuestos: ¿policy preventiva? | **Sí** | Fase 5 | ☐ |
| **P3** | Soft delete: ¿parche ahora, rediseño después? | **Sí** | Fase 5 | ☐ |
| **P4** | ¿Owner al odontólogo? | **Sí** | Fase 1 | ☐ |
| **P5** | **¿RLS+trigger como punto principal?** | **Sí** | **Toda la arquitectura** | ☐ |
| **P6** | ¿Recepción canjea premios? | **Sí** | Fase 2 | ☐ |
| **P7** | ¿Solo bypasses ahora, RBAC después? | **Sí** | El calendario | ☐ |

**No completé ninguna por inferencia.**

---

## E. Orden de implementación recomendado

### Bloque 1 · Cerrar bypasses — 2 a 3 días · **independiente del RBAC**

1. Rol dentro de `fn_ajustar_puntos_manual` **(el más urgente)**
2. Rol dentro de `fn_canjear_premio`
3. Revocar `ALTER DEFAULT PRIVILEGES` sobre funciones + inventariar y conceder explícitamente
4. `DROP` de las vistas `bi_*` (migración ya escrita y testeada)
5. `CHECK` de rol + `DEFAULT 'staff'` + asignar `owner`
6. RLS `FOR DELETE` en `pacientes` → owner/admin

**Este bloque tiene valor por sí solo**, aunque el RBAC completo se posponga. Cierra riesgo real de hoy.

### Bloque 2 · Infraestructura — 1 día

7. `auth_tenant_ids()` y `auth_has_role(tenant_id, roles[])`
8. `src/lib/autorizacion.ts` + migrar las 21 rutas *(refactor sin cambio de comportamiento)*

### Bloque 3 · Observación — 5 a 7 días

9. Policies en modo permisivo con logging, contra la clínica real

### Bloque 4 · RLS por tandas — 2 a 3 días

10. Finanzas → 11. Tratamientos, premios, config → 12. Storage + `paciente_fotos` → 13. `historial_dental` → 14. Trigger de campos clínicos

### Bloque 5 · Cierre — 3 a 4 días

15. Rutas (`checkout`, `importar`) → 16. UI → 17. Tests → 18. Enforcement

**Bloque 1: 2-3 días. Total: 13-18 días.**

---

## F. Tests requeridos

### Unit — vitest, sin base

- `auth_has_role()` con tenant correcto e incorrecto
- `requireMembership()` para cada combinación rol/ruta
- **La lista de columnas del trigger contra el esquema real** — falla si aparece una columna clínica nueva

### RLS — PGlite

**44 casos: 4 roles × 11 operaciones**, permitido y denegado.

| Operación | Owner | Admin | Odontólogo | Recepción |
|---|:---:|:---:|:---:|:---:|
| Leer contacto | ✓ | ✓ | ✓ | ✓ |
| Editar contacto | ✓ | ✓ | ✓ | ✓ |
| Leer historia clínica | ✓ | ✓ | ✓ | ✓ |
| **Editar odontograma** | ✓ | ✓ | ✓ | **✗** |
| **Editar `pacientes.alergias`** | ✓ | ✓ | ✓ | **✗** |
| Leer fotos | ✓ | ✓ | ✓ | ✓ |
| **Editar fotos** | ✓ | ✓ | ✓ | **✗** |
| **Ver finanzas** | ✓ | ✓ | **✗** | **✗** |
| Emitir factura | ✓ | ✓ | ✓ | ✓ |
| **Anular factura** | ✓ | ✓ | **✗** | **✗** |
| **Eliminar paciente** | ✓ | ✓ | **✗** | **✗** |

### Tenant isolation — PGlite · **la regresión más peligrosa**

Por **cada** tabla que cambie: `owner` del tenant A escribiendo en el tenant B → **denegado**.

Más un test de patrón: **ninguna policy puede tener `OR` entre la condición de tenant y la de rol.**

### Bypass — PGlite + guardas de código

- Recepción llamando `fn_ajustar_puntos_manual` → denegado
- Odontólogo llamando `fn_canjear_premio` → denegado *(según P6)*
- Patrón: ninguna función sin `REVOKE ... FROM PUBLIC` explícito
- Patrón: ninguna vista sobre tabla con RLS sin `security_invoker`

### Storage — **NO se puede probar en PGlite**

Las policies viven en `storage.objects`, que PGlite no reproduce. **Requiere Supabase real (staging) o verificación manual documentada.** Es un hueco conocido del plan de testing, no lo voy a disimular.

### Integration — rutas API

Las 21 rutas: 401 sin sesión · 403 con rol insuficiente · 200 con rol correcto.

### E2E — manual

Una jornada completa de Recepción: agendar, cobrar, marcar asistencia, canjear un premio, enviar recordatorio. **Sin ningún 403 inesperado.**

---

## Lo que no pude determinar con el repositorio

Lo marco explícito en vez de inferirlo:

1. **Si `fn_registrar_inasistencia` se usa sobre citas pasadas o facturadas.** La función no lo valida. Requiere mirar `historial_puntos` y `citas` en producción.
2. **Si presupuestos está en el roadmap.** La tabla existe sin uso. No hay documento que lo diga.
3. **Cuántos pacientes archivados esperaría la clínica** ni si hace falta una vista de archivados. Es diseño de producto.
4. **Si algún proceso fuera del repositorio** (Edge Functions, snippets del SQL Editor) llama a las funciones `SECURITY DEFINER`. Revocar o restringir podría romperlo.
5. **El impacto real en performance** de agregar `AND role IN (...)` a las policies. Requiere `EXPLAIN ANALYZE` contra datos de producción.

---

*Análisis para decisión. No se ejecutaron migraciones, no se modificaron policies ni funciones, no hubo deploy, no se tocó Supabase. Todos los comandos fueron de lectura sobre el repositorio.*
