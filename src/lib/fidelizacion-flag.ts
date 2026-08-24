/**
 * Interruptor único del programa de fidelización (Club de Puntos).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTADO: APAGADO — decisión del owner, 22/08/2026
 * ─────────────────────────────────────────────────────────────────────────
 *
 * POR QUÉ SE APAGÓ
 *
 *   El catálogo quedó fuera de alcance. Con datos de producción al 22/08:
 *
 *     premio más barato ............ 800 puntos
 *     saldo máximo del sistema ..... 475 puntos
 *     pacientes que podían canjear . 0 de 212
 *     canjes en toda la historia ... 0
 *
 *   A ~59 puntos/mes para un paciente activo, el primer premio quedaba a más
 *   de un año. El programa acumulaba correctamente y nunca entregaba nada.
 *
 * QUÉ APAGA ESTE FLAG
 *
 *   - Canje de premios (ficha del paciente, sección 2)
 *   - Ajuste manual de puntos (sección 3)
 *   - Historial del ledger (sección 4)
 *   - Tarjeta "Puntos VIP" del portal público del paciente
 *   - El saldo en la etiqueta de la pestaña
 *
 * QUÉ **NO** APAGA — y por qué
 *
 *   La aprobación de visita (sección 1) sigue visible. Esa pantalla parece
 *   parte del club, pero es donde se registra el COBRO y se decide si se
 *   FACTURA: llama a registrarPago() con forma de pago y requiereFactura
 *   antes de tocar nada de puntos. Ocultarla dejaría a la clínica sin poder
 *   cargar un pago desde la ficha.
 *
 *   La acumulación sigue corriendo en la base (fn_aprobar_asistencia). Es
 *   deliberado: si el programa se reactiva con un catálogo bien calibrado,
 *   los saldos no tienen un hueco de meses. Acumular no cuesta nada y no se
 *   le muestra a nadie.
 *
 * QUÉ NO SE TOCÓ
 *
 *   Cero cambios en la base de datos. Las tablas `historial_puntos` y
 *   `premios`, las funciones y las 4 columnas de `pacientes` siguen intactas.
 *   El ledger de los 212 pacientes está completo.
 *
 * CÓMO SE REVIERTE
 *
 *   Poner `true` acá. Nada más. No hay migración que correr ni datos que
 *   restaurar.
 *
 * CÓMO SE ELIMINA DE VERDAD
 *
 *   Recién cuando existan backups automáticos (hoy no hay: RPO infinito).
 *   Borrar sin poder restaurar es irreversible sobre datos de 212 pacientes
 *   reales. El orden es: primero backups, después el DROP.
 */
export const FIDELIZACION_HABILITADA = false
