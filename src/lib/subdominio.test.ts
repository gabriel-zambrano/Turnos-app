import { describe, it, expect } from 'vitest'
import { slugifySubdominio, esSubdominioValido, baseSubdominioDesdeNombre } from './subdominio'

describe('slugifySubdominio', () => {
  it('pasa a minúsculas y reemplaza espacios por guiones', () => {
    expect(slugifySubdominio('Consultorio Dental Norte')).toBe('consultorio-dental-norte')
  })

  it('quita acentos y eñes', () => {
    expect(slugifySubdominio('Odontología Muñoz')).toBe('odontologia-munoz')
  })

  it('descarta signos y puntuación', () => {
    expect(slugifySubdominio('Dra. Tamara Suju!')).toBe('dra-tamara-suju')
  })

  it('no deja guiones al principio ni al final', () => {
    expect(slugifySubdominio('  ¡Clínica!  ')).toBe('clinica')
  })

  it('trunca nombres muy largos sin dejar guion colgando', () => {
    const largo = 'Centro Odontologico Integral de Alta Complejidad Buenos Aires'
    const slug = slugifySubdominio(largo)
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('devuelve cadena vacía si no queda nada usable', () => {
    expect(slugifySubdominio('¡!¿?')).toBe('')
    expect(slugifySubdominio('')).toBe('')
  })
})

describe('esSubdominioValido', () => {
  it('rechaza los reservados', () => {
    expect(esSubdominioValido('admin')).toBe(false)
    expect(esSubdominioValido('api')).toBe(false)
  })

  it('rechaza los muy cortos', () => {
    expect(esSubdominioValido('ab')).toBe(false)
    expect(esSubdominioValido('')).toBe(false)
  })

  it('acepta uno normal', () => {
    expect(esSubdominioValido('walterbenegas')).toBe(true)
  })
})

describe('baseSubdominioDesdeNombre', () => {
  it('usa el slug del nombre cuando sirve', () => {
    expect(baseSubdominioDesdeNombre('Consultorio Walter Benegas')).toBe('consultorio-walter-benegas')
  })

  it('cae a "clinica" si el nombre no da nada usable', () => {
    expect(baseSubdominioDesdeNombre('¡!')).toBe('clinica')
    expect(baseSubdominioDesdeNombre('ab')).toBe('clinica')
  })

  it('desambigua si el nombre coincide con un reservado', () => {
    expect(baseSubdominioDesdeNombre('Admin')).toBe('admin-clinica')
  })
})
