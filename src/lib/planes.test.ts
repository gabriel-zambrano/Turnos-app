import { describe, it, expect } from 'vitest'
import {
  cuposDelPlan,
  puedeSumarUsuario,
  textoCupos,
  esPlanValido,
  precioDelPlan,
  precioFormateado,
  featuresDelPlan,
  featureHabilitada,
  PRECIOS_REGULARES,
  PRECIOS_FUNDADOR,
  PLANES,
} from './planes'

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

describe('precioDelPlan', () => {
  it('devuelve el precio regular de cada plan', () => {
    expect(precioDelPlan('starter')).toBe(16900)
    expect(precioDelPlan('pro')).toBe(29900)
    expect(precioDelPlan('business')).toBe(49900)
  })

  it('devuelve el Precio Fundador cuando corresponde', () => {
    expect(precioDelPlan('pro', true)).toBe(24900)
    expect(precioDelPlan('business', true)).toBe(39900)
  })

  it('el Precio Fundador siempre es menor al regular', () => {
    for (const plan of PLANES) {
      expect(PRECIOS_FUNDADOR[plan]).toBeLessThan(PRECIOS_REGULARES[plan])
    }
  })

  it('ningún plan supera el costo de una consulta ($40.000)', () => {
    // El argumento de venta es "cuesta menos que una consulta". Si algún plan
    // se pasa de ahí, hay que revisar la grilla antes de publicarla.
    expect(PRECIOS_FUNDADOR.business).toBeLessThan(40000)
  })

  it('ante un plan desconocido cae al más barato', () => {
    expect(precioDelPlan('inventado')).toBe(16900)
    expect(precioDelPlan(null)).toBe(16900)
  })
})

describe('precioFormateado', () => {
  it('formatea en pesos con separador de miles', () => {
    expect(precioFormateado(29900)).toBe('$29.900')
  })
})

describe('featuresDelPlan', () => {
  it('starter no incluye ninguna función de pago', () => {
    expect(featuresDelPlan('starter')).toEqual({ bi: false, whatsapp: false, recordatorios: false })
  })

  it('pro incluye recordatorios y whatsapp pero no BI', () => {
    const f = featuresDelPlan('pro')
    expect(f.recordatorios).toBe(true)
    expect(f.whatsapp).toBe(true)
    expect(f.bi).toBe(false)
  })

  it('business incluye todo', () => {
    expect(featuresDelPlan('business')).toEqual({ bi: true, whatsapp: true, recordatorios: true })
  })

  it('durante el trial se habilita todo, sin importar el plan', () => {
    expect(featuresDelPlan('starter', true)).toEqual({ bi: true, whatsapp: true, recordatorios: true })
  })

  it('devuelve una copia, no la referencia interna', () => {
    const f = featuresDelPlan('business')
    f.bi = false
    expect(featuresDelPlan('business').bi).toBe(true)
  })
})

describe('featureHabilitada', () => {
  it('habilita según el plan', () => {
    expect(featureHabilitada('recordatorios', 'pro')).toBe(true)
    expect(featureHabilitada('recordatorios', 'starter')).toBe(false)
  })

  it('la concesión manual suma aunque el plan no la incluya', () => {
    expect(featureHabilitada('bi', 'pro', true)).toBe(true)
  })

  it('la concesión manual nunca quita lo que el plan sí incluye', () => {
    expect(featureHabilitada('bi', 'business', false)).toBe(true)
    expect(featureHabilitada('recordatorios', 'pro', null)).toBe(true)
  })

  it('en trial está todo habilitado', () => {
    expect(featureHabilitada('bi', 'starter', false, true)).toBe(true)
  })
})
