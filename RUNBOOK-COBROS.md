# Runbook · Multi-tratamiento y formas de pago

Puesta en producción de la rama `feat/pagos-multitratamiento`
(commits `d852164` y `ca9fd03`).

Qué habilita: una cita puede tener N tratamientos que se suman y N formas de
pago; la factura muestra el detalle renglón por renglón; y cada clínica define
qué medios de pago factura.

---

## ⚠️ El orden importa

**La migración va primero, el código después.**

El código nuevo llama a la función `emitir_factura_con_detalle`. Si Vercel
despliega antes de que exista, **toda emisión de factura falla**.

Al revés es seguro: la migración sola convive con el código viejo, porque los
triggers solo se disparan cuando cambian renglones o pagos, y el código viejo
no los toca.

Como Vercel despliega solo al pushear a `main`, no mergees la rama hasta
después del paso 2.

---

## Paso 1 — Revisar qué va a tocar la migración

`supabase/migrations/20260804120000_pagos_y_multitratamiento.sql` no solo crea
tablas: los pasos 7 y 8 **modifican datos existentes**.

- **Paso 7** normaliza `citas.medio_pago`. Hoy conviven `"EFECTIVO"`,
  `"Efectivo"` y `"efectivo"` como categorías distintas en `/bi`.
- **Paso 8** convierte cada cita con valor cargado en un renglón de detalle
  equivalente, con el mismo importe.

Para ver el alcance antes de aplicar, en el SQL Editor de Supabase:

```sql
-- Cuántas citas van a recibir su renglón
SELECT count(*) FROM citas WHERE valor IS NOT NULL AND valor > 0;

-- Qué variantes de medio_pago hay hoy
SELECT medio_pago, count(*) FROM citas
WHERE medio_pago IS NOT NULL GROUP BY medio_pago ORDER BY 2 DESC;
```

### La red de seguridad

El **paso 9** de la migración se auto-verifica: comprueba que toda cita cuadre
contra la suma de sus renglones y que ninguna con importe haya quedado sin
detalle. Si algo no da, lanza `RAISE EXCEPTION` y **la transacción revierte la
migración entera** — tablas, triggers y backfill. No queda a medio aplicar.

Esa guarda tiene sus propios tests (`src/lib/multitratamiento.test.ts`), que la
ejecutan contra un Postgres real con el escenario roto forzado.

---

## Paso 2 — Aplicar la migración

```bash
git checkout feat/pagos-multitratamiento
npx supabase db push
```

Tiene que imprimir el `NOTICE` de verificación con la cantidad de citas
migradas. Si en cambio ves `Migración abortada:`, no se aplicó nada: mandame el
mensaje y lo revisamos.

> El branching de Supabase pide plan Pro. Si querés probar contra tus datos
> reales sin pagarlo, mirá el apéndice al final.

### Verificación

```sql
-- 1. La invariante que sostiene el BI: tiene que devolver 0 filas
SELECT c.id, c.valor, SUM(ti.subtotal) AS suma_items
FROM citas c JOIN tratamiento_items ti ON ti.cita_id = c.id
GROUP BY c.id, c.valor HAVING c.valor <> SUM(ti.subtotal);

-- 2. Los medios de pago quedaron normalizados
SELECT DISTINCT medio_pago FROM citas WHERE medio_pago IS NOT NULL;

-- 3. El criterio de facturación quedó con su default
SELECT tenant_id, formas_pago_facturables FROM arca_config;
-- Esperado: {Transferencia,"Tarjeta de Crédito"}
```

Con el código viejo todavía en producción, abrí `/bi` y `/finanzas` y confirmá
que los totales del mes son los mismos que antes de migrar. Ese es el chequeo
que importa: si el trigger fallara, el dashboard se vacía **sin dar error**.

---

## Paso 3 — Desplegar el código

```bash
git checkout main
git merge feat/pagos-multitratamiento
git push
```

CI corre `typecheck` + `test` (286 tests) y Vercel despliega solo.

---

## Paso 4 — Prueba de humo

1. **Agenda** → abrí una cita → cargá tres tratamientos con precios distintos y
   dos formas de pago (una Transferencia, una Efectivo).
2. Confirmá que el resumen muestre bien total, pagado y saldo.
3. **Finanzas** → esa cita tiene que mostrar el botón ámbar
   **"Facturar parcial"**, porque el cobro fue mixto.
4. Emitila. Sin credenciales de ARCA sale **simulada**, sin validez fiscal.
5. Abrí el PDF: tiene que verse el importe de la porción por transferencia, el
   renglón de pago parcial y la condición de venta "Transferencia Bancaria".
6. Repetí con una cita cobrada 100% en efectivo: el botón tiene que salir
   atenuado y pedir confirmación antes de emitir.

---

## Pendiente de decisión con el contador

Dos criterios que el sistema aplica y conviene validar:

1. **Qué medios se facturan.** El default es Transferencia + Tarjeta de Crédito.
   En Argentina la obligación de emitir comprobante corre por operación, no por
   medio de pago.
2. **Condición de venta con pago mixto.** El comprobante declara la del medio
   con el que más se pagó, entre los que se facturan. El desglose completo se
   imprime como bloque **informativo, no fiscal**, porque ARCA acepta una sola
   condición de venta por comprobante.

Ambos se ajustan sin tocar código: el primero desde `arca_config`, el segundo
está en `condicionVentaDominante` (`src/lib/pagos.ts`).

---

## Si hay que volver atrás

El rollback está comentado al final de la migración. Ojo con dos cosas:

- **El backfill de `medio_pago` no se deshace solo.** Es una normalización de
  texto; volver atrás exige un dump previo.
- **Revertí primero el código, después la base.** Al revés dejás la app
  llamando a una función que ya no existe.

---

## Apéndice — Probar contra datos reales sin plan Pro

Replica producción en un Postgres local y corre la migración ahí. Necesita
Docker.

```bash
# 1. Datos de producción (el esquema ya vive en supabase/migrations)
npx supabase db dump --linked --data-only -f /tmp/prod-data.sql

# 2. Postgres local SIN la migración nueva, para partir del estado actual
mv supabase/migrations/20260804120000_pagos_y_multitratamiento.sql /tmp/
npx supabase start
npx supabase db reset

# 3. Cargar los datos reales
psql "$(npx supabase status --output json | jq -r .DB_URL)" -f /tmp/prod-data.sql

# 4. Ahora sí, la migración — con los datos de verdad adentro
mv /tmp/20260804120000_pagos_y_multitratamiento.sql supabase/migrations/
npx supabase migration up
```

Si el paso 4 termina con el `NOTICE` de verificación, la migración es segura
contra tus datos. Corré también las tres consultas del Paso 2 contra la base
local antes de tocar producción.

> `/tmp/prod-data.sql` tiene datos de pacientes. Borralo cuando termines.
