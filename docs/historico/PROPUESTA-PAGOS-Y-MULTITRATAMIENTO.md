# Propuesta: formas de pago + múltiples tratamientos por paciente en la factura

Análisis previo a implementar. **No se tocó código todavía.**
Fecha: 2026-08-04

---

## 1. Cómo está hoy (lo que ya existe y hay que respetar)

### Modelo de datos actual

| Tabla | Rol hoy | Campos relevantes |
|---|---|---|
| `citas` | Es a la vez turno **y** unidad de cobro | `tipo_tratamiento` (TEXT, **uno solo**), `valor`, `sena`, `descuento`, `saldo` (**GENERATED** = `valor - sena`), `medio_pago` (TEXT libre), `precio_cobrado`, `presupuesto_id` |
| `tratamientos` | Catálogo de precios por tenant | `nombre`, `precio_base`, `duracion_default`, `activo` |
| `facturas` | Comprobante ARCA emitido | `cita_id` **(FK única, 1 factura ↔ 1 cita)**, `monto`, `concepto` (TEXT, **un solo renglón**), `condicion_venta` |
| `presupuestos` | **Existe pero no se usa en la UI** | `tratamiento`, `monto`, `estado`, `convertido_en` |
| `ingresos_manuales` | Ingreso de caja suelto, también facturable | `concepto`, `monto` |

### Flujo actual de facturación

`finanzas/page.tsx` → `POST /api/facturacion/emitir` → (ARCA o simulado) → `INSERT facturas` → `GET /api/facturacion/pdf/[id]` dibuja el PDF.

Tres detalles críticos de ese flujo:

1. **El monto se recalcula en el servidor** desde `citas.precio_cobrado ?? citas.valor`. El cliente no puede inflar el importe. Hay que conservar esa propiedad.
2. **El PDF dibuja exactamente 1 renglón** de ítem (línea ~186 de `pdf/[id]/route.ts`), con `y` calculado a mano. Más ítems desbordan la hoja.
3. **`facturas` es inmutable desde el cliente**: las políticas RLS solo permiten `SELECT` e `INSERT`, nunca `UPDATE`/`DELETE`. Es una decisión correcta (trazabilidad fiscal) y cualquier tabla hija tiene que seguir el mismo patrón.

---

## 2. Qué se rompe si lo hacemos "de la forma obvia"

Estos son los ocho puntos donde una implementación directa rompe algo en silencio.

### 🔴 Alto riesgo

**2.1 — Las vistas de BI leen `citas.valor` directamente.**
`bi_ingresos_por_mes`, `bi_kpis_mes` y `bi_citas_por_tratamiento` suman `citas.valor` y agrupan por `citas.tipo_tratamiento`. Si movemos el importe a una tabla hija, esas vistas siguen compilando y **devuelven cero sin dar error**. El dashboard, `/bi` y el daily-briefing se vacían de a poco y nadie se entera hasta fin de mes.
→ *Regla dura:* `citas.valor` sigue siendo el total autoritativo, mantenido por trigger desde el detalle.

**2.2 — `citas.saldo` es una columna GENERATED (`valor - sena`).**
No se puede convertir en "valor − suma de pagos" sin `DROP COLUMN` + recrear, y hay que verificar qué la consume antes. Con la regla 2.1 el problema desaparece: si `valor` y `sena` los mantiene un trigger, `saldo` sigue siendo correcta sin tocarla.

**2.3 — ARCA rechaza si los centavos no cuadran (error 10048).**
`ImpTotal` tiene que ser exactamente `ImpNeto + ImpIVA`, y con N ítems, redondear renglón por renglón y después sumar ≠ redondear la suma. El código actual ya lo maneja bien para 1 ítem (calcula el IVA como `total − neto`, no al revés). Con N ítems hay que sumar **en centavos enteros** y ajustar la diferencia en el último renglón.

**2.4 — "Múltiples formas de pago" no existe en la factura fiscal.**
ARCA/wsfe acepta **una sola** condición de venta por comprobante. Si el paciente paga $30.000 en efectivo y $20.000 con tarjeta, la factura legalmente lleva *una* condición.
→ Solución: guardar el desglose real en una tabla `pagos` (uso interno, caja y BI), y en el comprobante imprimir la condición dominante — con el desglose como bloque informativo no fiscal. Esto hay que **validarlo con el contador de la clínica** antes de salir a producción.

### 🟡 Riesgo medio

**2.5 — `facturas.cita_id` es un FK simple.**
Si "varios tratamientos" significa *varios turnos distintos en una misma factura*, esa columna es la forma equivocada. Si significa *varios tratamientos dentro de un mismo turno*, alcanza. **Es la decisión de producto que define todo el resto.**

**2.6 — No hay transacciones desde Supabase JS.**
`INSERT factura` + `INSERT items` en dos llamadas puede dejar una factura con CAE de ARCA y sin renglones si falla la segunda. Y como `facturas` no tiene política de `UPDATE`, no se puede "arreglar" después desde el cliente.
→ Hay que meter la emisión en una función Postgres `SECURITY DEFINER` (una sola transacción). La ruta usa la anon key con la sesión del usuario, así que hoy corre bajo RLS: la función tiene que revalidar el `tenant_id` adentro.

**2.7 — `medio_pago` es TEXT libre y `/bi` agrupa por ese texto.**
Si normalizamos a un enum, las filas viejas ("efectivo", "Efectivo", "EFECTIVO") quedan como categorías separadas. Necesita backfill con normalización en la misma migración.

**2.8 — `tenant-isolation.test.ts` enumera las tablas a mano.**
Toda tabla nueva tiene que sumarse a `TABLAS_SECUNDARIAS` y usar el patrón canónico `tenant_isolation_<tabla>`, o queda sin cobertura de aislamiento entre clínicas.

---

## 3. Las tres alternativas

### Opción A — Extender `citas` (mínima)

`cita_items` (N tratamientos por turno) + `pagos` (N formas de pago por turno). Triggers mantienen `citas.valor` y `citas.precio_cobrado`.

- ✅ Cambio más chico, BI y agenda no se tocan, reversible.
- ❌ No sirve para facturar varios turnos juntos ni para ortodoncia en cuotas — que es justo el caso donde más plata hay.

### Opción B — Cuenta corriente del paciente (completa)

Promover `presupuestos` a `planes_tratamiento` + `plan_items`. Los pagos cuelgan del **paciente**, no del turno, y se imputan contra los ítems. La factura arma N ítems de N turnos.

- ✅ Es el modelo correcto para odontología: ortodoncia, implantes, tratamientos largos en cuotas.
- ❌ Migración de datos existentes, lógica de saldos nueva, BI a rehacer. Alto riesgo de una sola vez.

### Opción C — Modelo B, entrega por fases (recomendada) ⭐

Mismo modelo de datos que B, pero construido en tres fases donde **ninguna rompe nada** y cada una sale sola a producción. La clave: los ítems y los pagos llevan `paciente_id` **siempre** y `cita_id` **nullable**. Con eso la Fase 1 se comporta como la Opción A, y las fases 2–3 activan la cuenta corriente sin volver a migrar el esquema.

---

## 4. Plan recomendado (Opción C)

### Fase 1 — Detalle y pagos, invisible para el resto del sistema

Migración `2026XXXX_pagos_y_items.sql`:

```
tratamiento_items          pagos
├── tenant_id  (RLS)       ├── tenant_id  (RLS)
├── paciente_id  NOT NULL  ├── paciente_id  NOT NULL
├── cita_id      NULL      ├── cita_id      NULL
├── tratamiento_id NULL    ├── forma_pago   (CHECK contra lista fija)
├── descripcion            ├── monto        numeric(12,2)
├── cantidad    int        ├── fecha
├── precio_unitario        └── nota
├── descuento_pct
└── subtotal  GENERATED
```

- Trigger `AFTER INSERT/UPDATE/DELETE` que recalcula `citas.valor = SUM(subtotal)` y `citas.precio_cobrado = SUM(pagos)` cuando hay `cita_id`. **BI, agenda y dashboard siguen leyendo lo mismo de siempre.**
- `forma_pago` como lista fija en `src/lib/constants.ts` (no tabla) + mapa `forma_pago → condicion_venta ARCA`, con test unitario. Backfill normalizando `citas.medio_pago`.
- RLS con el patrón canónico + las dos tablas agregadas a `tenant-isolation.test.ts`.
- UI: en el modal de cita, el campo tratamiento pasa a lista de renglones; el campo pago pasa a lista de pagos. Si la cita no tiene renglones, se muestra el valor viejo (compatibilidad hacia atrás).

**Al terminar la Fase 1 el sistema funciona igual que hoy** — solo que ahora el detalle existe.

### Fase 2 — La factura muestra el detalle

- `factura_items`: snapshot inmutable de los renglones al momento de emitir (descripción, cantidad, precio, subtotal). Snapshot, no FK viva: si mañana cambia el precio del tratamiento, la factura vieja no puede mutar.
- `factura_pagos`: desglose informativo de formas de pago.
- RPC `emitir_factura(...)` `SECURITY DEFINER` que hace factura + ítems + pagos en **una transacción**, revalida tenant, y recalcula el total sumando en centavos enteros.
- `emitir/route.ts`: sigue calculando el monto **server-side** desde la base, nunca desde el body.
- PDF: tabla de ítems con loop, `y` dinámico, corte de página automática a partir del renglón ~18, y bloque "Forma de pago" con el desglose.

### Fase 3 — Cuenta corriente (opcional, cuando haga falta)

- Vista `saldo_paciente` = Σ ítems − Σ pagos.
- Factura que agrupa ítems de varios turnos: tabla puente `factura_citas` (se deja `facturas.cita_id` como está, marcada deprecada, para no romper el chequeo de "ya facturado").
- Recién acá se conecta `presupuestos` como origen de los ítems.

### Verificación por fase

- `npm run typecheck` + `npm test` (el test de aislamiento tiene que pasar con las tablas nuevas).
- Test nuevo de suma en centavos: 3 ítems con decimales feos → total exacto, `neto + iva == total`.
- Emitir una factura simulada de 4 ítems y abrir el PDF antes de tocar el modo real de ARCA.
- Consulta de control: `SELECT` comparando `citas.valor` contra `SUM(tratamiento_items.subtotal)` — tiene que dar 0 filas de diferencia.

---

## 5. Decisiones tomadas

| Punto | Decisión |
|---|---|
| Alcance | Varios tratamientos **dentro de un mismo turno** (caries + ajuste de ortodoncia + limpieza de sarro). Fases 1 y 2. La Fase 3 queda para más adelante, sin necesidad de volver a migrar. |
| Pago dividido | **Sí**, `pagos` 1:N. En la factura fiscal se declara la condición dominante + desglose informativo. |
| Formas de pago | **Lista fija en código** (`src/lib/pagos.ts`), espejada en el CHECK de la tabla. |
| Condición de venta con pago mixto | Pendiente de validar con el contador antes de producción. |

---

## 6. Qué se implementó

### Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/20260804120000_pagos_y_multitratamiento.sql` | Tablas, triggers, RLS, RPC atómica, backfill |
| `src/lib/pagos.ts` | Formas de pago, mapeo a ARCA, aritmética en centavos |
| `src/lib/pagos.test.ts` | 26 tests |
| `src/lib/multitratamiento.test.ts` | 13 tests contra Postgres real (PGlite) |
| `src/components/DetalleCitaCobro.tsx` | Editor de renglones y pagos |

### Archivos modificados

- `src/app/api/facturacion/emitir/route.ts` — lee los renglones desde la base, suma en centavos, emite por RPC atómica, deriva la condición de venta de los pagos reales.
- `src/app/api/facturacion/pdf/[id]/route.ts` — tabla de ítems con loop, `y` dinámico, corte de página, numeración `Pág. N/M`, bloque de formas de pago.
- `src/app/agenda/page.tsx` — el modal de edición usa el editor nuevo; `saveEditar` dejó de escribir `valor` y `medio_pago`.
- `src/lib/tenant-isolation.test.ts` — `pagos` y `tratamiento_items` registradas.

### Cómo se resolvió cada riesgo del punto 2

| Riesgo | Cómo quedó resuelto |
|---|---|
| 2.1 BI en cero | Trigger `sync_valor_cita` mantiene `citas.valor`. Test: "citas.valor sigue siendo el total autoritativo". Las vistas no se tocaron. |
| 2.2 `saldo` GENERATED | No se toca. Test verifica que sigue dando `valor − seña`. |
| 2.3 Centavos de ARCA | `desagregarIva` calcula en enteros y el IVA sale por diferencia. 12 casos de test verifican `neto + iva == total`. |
| 2.4 Pago mixto | `condicionVentaDominante` elige el medio con el que más se pagó, con desempate determinista. El desglose va a `factura_pagos`, impreso como bloque **no fiscal**. |
| 2.5 FK de factura | Se mantiene `facturas.cita_id`; el chequeo de "ya facturado" no cambia. |
| 2.6 Sin transacciones | RPC `emitir_factura_con_detalle` `SECURITY DEFINER`, revalida tenant adentro. Test de usuario intruso incluido. |
| 2.7 `medio_pago` sucio | Backfill normalizador en la migración. Test sobre una fila `'EFECTIVO'` preexistente. |
| 2.8 Cobertura RLS | Ambas tablas en `TABLAS_SECUNDARIAS` (81 tests de aislamiento, antes 73). |

### Verificación

`npx tsc --noEmit` limpio · **271 tests pasan** (14 archivos).
La migración se ejecuta contra un Postgres real en los tests, incluyendo el backfill sobre datos preexistentes.

### Antes de aplicar en producción

1. Correr la migración en un branch de Supabase primero — los pasos 7 y 8 tocan datos existentes.
2. Consulta de control post-migración:
   ```sql
   SELECT c.id, c.valor, SUM(ti.subtotal) AS suma_items
   FROM citas c JOIN tratamiento_items ti ON ti.cita_id = c.id
   GROUP BY c.id, c.valor HAVING c.valor <> SUM(ti.subtotal);
   -- tiene que devolver 0 filas
   ```
3. Emitir una factura **simulada** de 3–4 renglones y abrir el PDF antes de habilitar el modo real de ARCA.
4. Validar con el contador el criterio de condición de venta en pagos mixtos.
