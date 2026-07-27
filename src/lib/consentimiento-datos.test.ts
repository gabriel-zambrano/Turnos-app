import { describe, it, expect } from 'vitest'
import {
  registrarConsentimiento,
  tieneConsentimientoVigente,
  consentimientoDesactualizado,
  VERSION_CONSENTIMIENTO_DATOS,
  TEXTO_CONSENTIMIENTO_DATOS,
} from './consentimiento-datos'

describe('registrarConsentimiento', () => {
  it('no registra nada si el paciente no lo prestó', () => {
    expect(registrarConsentimiento(false, 'consultorio', '1.2.3.4')).toBeNull()
  })

  it('guarda momento, versión, IP y origen', () => {
    const r = registrarConsentimiento(true, 'consultorio', '1.2.3.4')!
    expect(r.consentimiento_datos_ver).toBe(VERSION_CONSENTIMIENTO_DATOS)
    expect(r.consentimiento_datos_ip).toBe('1.2.3.4')
    expect(r.consentimiento_datos_origen).toBe('consultorio')
    expect(new Date(r.consentimiento_datos_en).getTime()).not.toBeNaN()
  })

  it('sin IP disponible guarda null, no una cadena vacía', () => {
    expect(registrarConsentimiento(true, 'paciente')!.consentimiento_datos_ip).toBeNull()
  })
})

describe('tieneConsentimientoVigente', () => {
  it('un paciente viejo sin consentimiento queda marcado como pendiente', () => {
    expect(tieneConsentimientoVigente({ consentimiento_datos_en: null })).toBe(false)
    expect(tieneConsentimientoVigente({})).toBe(false)
  })

  it('con fecha registrada, está', () => {
    expect(tieneConsentimientoVigente({ consentimiento_datos_en: '2026-07-27T10:00:00Z' })).toBe(true)
  })
})

describe('consentimientoDesactualizado', () => {
  it('detecta que firmó una versión anterior del texto', () => {
    expect(consentimientoDesactualizado({
      consentimiento_datos_en: '2026-07-27T10:00:00Z',
      consentimiento_datos_ver: '2020-01-v0',
    })).toBe(true)
  })

  it('con la versión vigente no pide nada', () => {
    expect(consentimientoDesactualizado({
      consentimiento_datos_en: '2026-07-27T10:00:00Z',
      consentimiento_datos_ver: VERSION_CONSENTIMIENTO_DATOS,
    })).toBe(false)
  })

  it('quien nunca consintió no cuenta como "desactualizado" sino como pendiente', () => {
    expect(consentimientoDesactualizado({ consentimiento_datos_en: null })).toBe(false)
  })
})

describe('texto del consentimiento', () => {
  it('menciona los derechos de acceso, rectificación y supresión', () => {
    const t = TEXTO_CONSENTIMIENTO_DATOS.toLowerCase()
    expect(t).toContain('acceder')
    expect(t).toContain('rectificar')
    expect(t).toContain('supresión')
  })

  it('aclara la finalidad del tratamiento de los datos', () => {
    expect(TEXTO_CONSENTIMIENTO_DATOS.toLowerCase()).toContain('atención odontológica')
  })
})
