-- ── INTENCIÓN DE FACTURAR, REGISTRADA AL COBRAR ──
--
-- Hasta acá, si un cobro se facturaba o no se deducía del medio de pago en el
-- momento de emitir. Dos problemas:
--
--   1. El paciente que pagó en efectivo y pide factura (reintegro de obra
--      social, por ejemplo) no tenía forma de quedar marcado.
--   2. Si la clínica cambiaba su criterio, cambiaba retroactivamente el
--      tratamiento de cobros viejos. Para algo con efecto fiscal, la decisión
--      tiene que quedar congelada tal como se tomó ese día.
--
-- Ahora la decisión se guarda con el cobro. El medio de pago pasa a ser solo
-- la sugerencia con la que la UI pre-marca el check.
--
-- Idempotente.

-- ─────────────────────────────────────────────────────────────
-- 1. La marca en los pagos de una cita
-- ─────────────────────────────────────────────────────────────
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS requiere_factura BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN pagos.requiere_factura IS
    'Si este cobro se factura. Se decide al registrarlo: la UI lo pre-marca '
    'según arca_config.formas_pago_facturables, pero el profesional puede '
    'cambiarlo (paciente que paga en efectivo y necesita el comprobante).';

-- Backfill: los pagos ya cargados se marcan según el criterio vigente de su
-- clínica, que es exactamente como se venían tratando hasta ahora.
UPDATE pagos p SET requiere_factura = true
WHERE EXISTS (
    SELECT 1 FROM arca_config a
    WHERE a.tenant_id = p.tenant_id
      AND p.forma_pago = ANY(a.formas_pago_facturables)
);

CREATE INDEX IF NOT EXISTS pagos_facturables_idx
    ON pagos (cita_id) WHERE requiere_factura = true;

-- ─────────────────────────────────────────────────────────────
-- 2. Forma de pago en los ingresos sueltos de caja
-- ─────────────────────────────────────────────────────────────
-- Sin esto, un ingreso manual se facturaba siempre sin importar cómo entró
-- la plata: era el agujero por donde se escapaba el criterio.
ALTER TABLE ingresos_manuales ADD COLUMN IF NOT EXISTS forma_pago TEXT;
ALTER TABLE ingresos_manuales ADD COLUMN IF NOT EXISTS requiere_factura BOOLEAN NOT NULL DEFAULT true;

-- El default es `true` a propósito: preserva el comportamiento que ya tenían
-- los ingresos existentes (se podían facturar todos). Los nuevos los define
-- la UI según el medio elegido.

ALTER TABLE ingresos_manuales DROP CONSTRAINT IF EXISTS ingresos_manuales_forma_pago_check;
ALTER TABLE ingresos_manuales ADD CONSTRAINT ingresos_manuales_forma_pago_check
    CHECK (forma_pago IS NULL OR forma_pago IN (
        'Efectivo', 'Tarjeta de Débito', 'Tarjeta de Crédito',
        'Transferencia', 'Cheque', 'Mercado Pago', 'Obra Social', 'Otro'
    ));

-- ─────────────────────────────────────────────────────────────
-- 3. Trazar de dónde vino cada pago
-- ─────────────────────────────────────────────────────────────
-- Los cobros entran por varias pantallas (detalle de la cita, cobro rápido,
-- ficha del paciente, saldar deuda). Saber cuál lo generó ayuda a auditar
-- diferencias sin tener que adivinar.
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS origen TEXT;

COMMENT ON COLUMN pagos.origen IS
    'Pantalla que registró el cobro: detalle, cobro_rapido, ficha_paciente, '
    'saldar_deuda, sena_reserva. NULL en los cargados antes de trazarlo.';

-- ── Rollback ──
-- ALTER TABLE pagos DROP COLUMN IF EXISTS requiere_factura, DROP COLUMN IF EXISTS origen;
-- ALTER TABLE ingresos_manuales DROP COLUMN IF EXISTS forma_pago, DROP COLUMN IF EXISTS requiere_factura;
