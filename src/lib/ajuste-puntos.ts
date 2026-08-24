/**
 * Validación del ajuste manual de puntos de fidelización.
 *
 * ⚠️  ESTAS REGLAS ESTÁN DUPLICADAS A PROPÓSITO.
 *
 * La autoridad final es `fn_ajustar_puntos_manual` en la base: es la única
 * capa que no se puede saltear, porque la función es SECURITY DEFINER y
 * valida aunque el llamante venga de otro lado. Lo de acá es una capa de
 * conveniencia para que el usuario del consultorio reciba un mensaje que
 * entienda, en vez del error crudo de PostgreSQL.
 *
 * Si cambiás un número acá, cambialo también en la función SQL. Y al revés.
 *
 * De dónde salen los valores:
 *
 *   LIMITE_AJUSTE_PUNTOS = 500  (decisión DO-2)
 *     El movimiento legítimo más grande registrado en la historia del sistema
 *     es un `gasto_tratamiento` de 390 puntos — un tratamiento de $390.000.
 *     500 cubre ese piso con 28% de margen. Se eligió por encima de 400
 *     porque `ars_por_punto` es fijo en 1000: con inflación, un tratamiento
 *     de $390.000 va a ser rutinario y acreditará más puntos.
 *
 *     A la fecha de escribir esto hay CERO ajustes manuales en el histórico,
 *     así que el límite no rompe nada retroactivamente.
 *
 *   NOTA_MINIMA_CARACTERES = 10  (decisión DO-3)
 *     La nota obligatoria ya existía en la UI. El mínimo evita notas que
 *     cumplen la letra y no el propósito: ".", "x", "ok". Diez caracteres
 *     obligan a una frase corta — "error de carga" son 14.
 *
 *     El ledger `historial_puntos` ya registra quién, cuándo, cuánto y sobre
 *     quién. La nota es lo único que aporta el POR QUÉ, que es lo que no se
 *     puede reconstruir después.
 */

/** Máximo de puntos por operación, en valor absoluto. Debe coincidir con la función SQL. */
export const LIMITE_AJUSTE_PUNTOS = 500

/** Longitud mínima de la nota, medida después de `trim()`. */
export const NOTA_MINIMA_CARACTERES = 10

/**
 * Texto que `fn_ajustar_puntos_manual` usaba como relleno cuando la nota
 * llegaba nula. Se rechaza explícitamente: si alguien lo copia y pega, cumple
 * la longitud mínima sin justificar nada.
 */
export const NOTA_AUTOGENERADA = 'Ajuste manual de puntos'

export type ResultadoValidacion =
  | { ok: true; nota: string }
  | { ok: false; error: string }

/**
 * Valida un ajuste manual antes de mandarlo a la base.
 *
 * Devuelve la nota ya normalizada con `trim()` para que el llamante mande
 * exactamente lo que se validó, sin re-normalizar por su cuenta.
 *
 * @param monto  Cantidad de puntos en valor absoluto. El signo lo decide el
 *               tipo de movimiento, no este valor.
 * @param nota   Motivo escrito por el usuario, sin normalizar.
 */
export function validarAjustePuntos(
  monto: number | '',
  nota: string
): ResultadoValidacion {
  if (monto === '' || !Number.isFinite(Number(monto)) || Number(monto) <= 0) {
    return { ok: false, error: 'Ingresá una cantidad de puntos válida.' }
  }

  if (Math.abs(Number(monto)) > LIMITE_AJUSTE_PUNTOS) {
    return {
      ok: false,
      error: `El ajuste no puede superar los ${LIMITE_AJUSTE_PUNTOS} puntos por operación.`,
    }
  }

  const notaLimpia = nota.trim()

  if (notaLimpia === '') {
    return { ok: false, error: 'Es obligatorio ingresar un motivo para el ajuste.' }
  }

  if (notaLimpia.length < NOTA_MINIMA_CARACTERES) {
    return {
      ok: false,
      error: `El motivo debe tener al menos ${NOTA_MINIMA_CARACTERES} caracteres.`,
    }
  }

  if (notaLimpia === NOTA_AUTOGENERADA) {
    return {
      ok: false,
      error: 'Escribí un motivo real: ese texto es el relleno que usaba el sistema.',
    }
  }

  return { ok: true, nota: notaLimpia }
}
