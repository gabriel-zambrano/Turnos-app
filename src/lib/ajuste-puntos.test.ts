import { describe, it, expect } from 'vitest'
import {
  validarAjustePuntos,
  LIMITE_AJUSTE_PUNTOS,
  NOTA_MINIMA_CARACTERES,
  NOTA_AUTOGENERADA,
} from './ajuste-puntos'

// ─────────────────────────────────────────────────────────────
// Validación del ajuste manual de puntos.
//
// Esto prueba la capa de UI, no la base. La autoridad final sigue siendo
// `fn_ajustar_puntos_manual`, que valida aunque el llamante venga de otro
// lado. Lo que se verifica acá es que el usuario reciba un mensaje que
// entienda ANTES de que la base le devuelva un error crudo.
//
// Si estos números dejan de coincidir con los de la función SQL, la UI
// empieza a mentir: rechaza lo que la base aceptaría, o al revés.
// ─────────────────────────────────────────────────────────────

const NOTA_VALIDA = 'error de carga en la visita del martes'

describe('validarAjustePuntos · la nota', () => {
  it('rechaza la nota vacía', () => {
    const r = validarAjustePuntos(100, '')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/obligatorio/i)
  })

  it('rechaza una nota que solo tiene espacios', () => {
    const r = validarAjustePuntos(100, '        ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/obligatorio/i)
  })

  it('rechaza una nota de menos del mínimo', () => {
    const r = validarAjustePuntos(100, 'ok')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/al menos 10 caracteres/i)
  })

  it('acepta una nota de exactamente el mínimo', () => {
    const diez = 'a'.repeat(NOTA_MINIMA_CARACTERES)
    expect(diez).toHaveLength(10)
    const r = validarAjustePuntos(100, diez)
    expect(r.ok).toBe(true)
  })

  it('rechaza una de 9 caracteres: el borde de abajo', () => {
    const nueve = 'a'.repeat(NOTA_MINIMA_CARACTERES - 1)
    expect(validarAjustePuntos(100, nueve).ok).toBe(false)
  })

  it('los espacios exteriores no cuentan para el mínimo', () => {
    // 9 caracteres reales rodeados de espacios: sigue sin alcanzar.
    const r = validarAjustePuntos(100, '     abcdefghi     ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/al menos 10 caracteres/i)
  })

  it('acepta si el contenido interno alcanza el mínimo, y devuelve la nota normalizada', () => {
    const r = validarAjustePuntos(100, `   ${NOTA_VALIDA}   `)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.nota).toBe(NOTA_VALIDA)
  })

  it('rechaza el texto de relleno que usaba la función SQL', () => {
    // Cumple la longitud mínima, así que sin este chequeo pasaría.
    expect(NOTA_AUTOGENERADA.length).toBeGreaterThan(NOTA_MINIMA_CARACTERES)
    const r = validarAjustePuntos(100, NOTA_AUTOGENERADA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/motivo real/i)
  })
})

describe('validarAjustePuntos · el monto', () => {
  it('rechaza el campo vacío', () => {
    const r = validarAjustePuntos('', NOTA_VALIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/cantidad de puntos válida/i)
  })

  it('rechaza cero', () => {
    expect(validarAjustePuntos(0, NOTA_VALIDA).ok).toBe(false)
  })

  it('rechaza negativos: el signo lo decide el tipo de movimiento, no el monto', () => {
    expect(validarAjustePuntos(-100, NOTA_VALIDA).ok).toBe(false)
  })

  it('rechaza NaN', () => {
    expect(validarAjustePuntos(Number.NaN, NOTA_VALIDA).ok).toBe(false)
  })

  it('acepta exactamente el límite', () => {
    const r = validarAjustePuntos(LIMITE_AJUSTE_PUNTOS, NOTA_VALIDA)
    expect(r.ok).toBe(true)
  })

  it('rechaza el límite más uno', () => {
    const r = validarAjustePuntos(LIMITE_AJUSTE_PUNTOS + 1, NOTA_VALIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no puede superar los 500/i)
  })

  it('acepta un valor intermedio típico', () => {
    expect(validarAjustePuntos(100, NOTA_VALIDA).ok).toBe(true)
  })
})

describe('validarAjustePuntos · orden de los mensajes', () => {
  it('con monto y nota inválidos, avisa primero del monto', () => {
    // El monto es el primer campo del formulario. Avisar del último error
    // obligaría al usuario a corregir dos veces.
    const r = validarAjustePuntos(999, 'x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no puede superar/i)
  })
})

describe('acoplamiento con la función SQL', () => {
  it('el límite coincide con el de fn_ajustar_puntos_manual (DO-2)', () => {
    // Si este número cambia, hay que cambiarlo también en la migración de B1.2.
    expect(LIMITE_AJUSTE_PUNTOS).toBe(500)
  })

  it('el mínimo de la nota coincide con el de fn_ajustar_puntos_manual (DO-3)', () => {
    expect(NOTA_MINIMA_CARACTERES).toBe(10)
  })
})
