-- ── RENGLÓN AUTOMÁTICO AL CREAR UNA CITA CON VALOR ──
--
-- Problema que resuelve: las citas que entran por reserva online o por el
-- modal rápido se crean con `valor` cargado pero sin renglones de detalle.
-- Si después alguien abre esa cita y agrega un tratamiento, el trigger
-- `sync_valor_cita` recalcula el total desde los renglones y el valor
-- original desaparece: el monto BAJA en vez de sumar.
--
-- Se resuelve en la base y no en la app a propósito: hay cuatro caminos que
-- crean citas (agenda, modal rápido, reserva online, API) y un trigger los
-- cubre a todos sin que haya que acordarse en cada uno.
--
-- Idempotente.

CREATE OR REPLACE FUNCTION sembrar_renglon_cita() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Solo si la cita nace con importe. Las que se crean sin valor (el caso
    -- normal de un turno agendado) no necesitan renglón hasta que se cobren.
    IF NEW.valor IS NOT NULL AND NEW.valor > 0 THEN
        INSERT INTO tratamiento_items (
            tenant_id, paciente_id, cita_id, descripcion, cantidad, precio_unitario, orden
        ) VALUES (
            NEW.tenant_id, NEW.paciente_id, NEW.id,
            COALESCE(NULLIF(TRIM(NEW.tipo_tratamiento), ''), 'Consulta'),
            1, NEW.valor, 0
        );
    END IF;
    RETURN NULL;
END $$;

-- AFTER INSERT y no BEFORE: la fila de `citas` tiene que existir antes de
-- que el renglón la referencie por FK.
--
-- No hay recursión: el INSERT en tratamiento_items dispara `sync_valor_cita`,
-- que hace UPDATE sobre citas — y este trigger es solo de INSERT.
DROP TRIGGER IF EXISTS trg_sembrar_renglon_cita ON citas;
CREATE TRIGGER trg_sembrar_renglon_cita
    AFTER INSERT ON citas
    FOR EACH ROW EXECUTE FUNCTION sembrar_renglon_cita();

-- ── Rollback ──
-- DROP TRIGGER IF EXISTS trg_sembrar_renglon_cita ON citas;
-- DROP FUNCTION IF EXISTS sembrar_renglon_cita;
