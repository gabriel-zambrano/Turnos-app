import { describe, it, expect } from 'vitest'
import { cuposDelPlan, puedeSumarUsuario, textoCupos, esPlanValido } from './planes'

describe('cuposDelPlan', () => {
  it('devuelve los cupos de cada plan', () => {
    expect(cuposDelPlan('starter')).toBe(1)
    expect(cuposDelPlan('pro')).toBe(3)
    expect(cuposDelPlan('business')).toBe(Number.POSITIVE_INFINITY)
  })

  it('es case-insensitive', () => {
    expect(cuposDelPlan('PRO')).toBe(3)
  })

  it('ante un plan desconocido o vacío aplica el más restrictivo', () => {
    expect(cuposDelPlan('inventado')).toBe(1)
    expect(cuposDelPlan(null)).toBe(1)
    expect(cuposDelPlan(undefined)).toBe(1)
  })
})

describe('puedeSumarUsuario', () => {
  it('bloquea cuando el cupo está lleno', () => {
    expect(puedeSumarUsuario('starter', 1)).toBe(false)
    expect(puedeSumarUsuario('pro', 3)).toBe(false)
  })

  it('permite cuando queda lugar', () => {
    expect(puedeSumarUsuario('starter', 0)).toBe(true)
    expect(puedeSumarUsuario('pro', 2)).toBe(true)
  })

  it('business nunca se llena', () => {
    expect(puedeSumarUsuario('business', 500)).toBe(true)
  })

  it('un plan desconocido no permite sumar si ya hay alguien', () => {
    expect(puedeSumarUsuario('raro', 1)).toBe(false)
  })
})

describe('textoCupos', () => {
  it('muestra uso sobre total en planes con límite', () => {
    expect(textoCupos('pro', 2)).toBe('2 de 3')
  })

  it('en business muestra solo la cantidad', () => {
    expect(textoCupos('business', 5)).toBe('5 usuarios')
    expect(textoCupos('business', 1)).toBe('1 usuario')
  })
})

describe('esPlanValido', () => {
  it('reconoce los planes existentes', () => {
    expect(esPlanValido('starter')).toBe(true)
    expect(esPlanValido('business')).toBe(true)
  })

  it('rechaza cualquier otra cosa', () => {
    expect(esPlanValido('gratis')).toBe(false)
    expect(esPlanValido(null)).toBe(false)
  })
})
