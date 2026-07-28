import { describe, it, expect } from 'vitest'
import { esRutaPublica, esRutaSinSuscripcion, RUTAS_PUBLICAS } from './rutas-publicas'

describe('esRutaPublica', () => {
  it('deja entrar al paciente sin cuenta', () => {
    expect(esRutaPublica('/reserva/walterbenegas')).toBe(true)
    expect(esRutaPublica('/paciente/abc-123')).toBe(true)
    expect(esRutaPublica('/firmar/token-xyz')).toBe(true)
  })

  it('deja entrar a las páginas institucionales', () => {
    expect(esRutaPublica('/precios')).toBe(true)
    expect(esRutaPublica('/legal/terminos')).toBe(true)
    expect(esRutaPublica('/login')).toBe(true)
  })

  it('no deja entrar a lo del consultorio', () => {
    expect(esRutaPublica('/dashboard')).toBe(false)
    expect(esRutaPublica('/agenda')).toBe(false)
    expect(esRutaPublica('/pacientes')).toBe(false)
    expect(esRutaPublica('/bi')).toBe(false)
    expect(esRutaPublica('/admin')).toBe(false)
  })

  it('deja pasar los archivos del sitio y la PWA', () => {
    expect(esRutaPublica('/manifest.json')).toBe(true)
    expect(esRutaPublica('/sw.js')).toBe(true)
    expect(esRutaPublica('/icons/icon-192.png')).toBe(true)
    expect(esRutaPublica('/api/reserva/walterbenegas')).toBe(true)
  })
})

describe('esRutaSinSuscripcion', () => {
  it('una suscripción vencida NUNCA bloquea a un paciente', () => {
    // El bug que motivó este módulo: alguien que entraba desde Instagram veía
    // la pantalla de facturación del consultorio.
    for (const ruta of ['/reserva/walterbenegas', '/paciente/abc', '/firmar/xyz']) {
      expect(esRutaSinSuscripcion(ruta)).toBe(true)
    }
  })

  it('deja entrar a Configuración, que es donde se paga', () => {
    expect(esRutaSinSuscripcion('/configuracion')).toBe(true)
  })

  it('sí bloquea el resto de la app', () => {
    expect(esRutaSinSuscripcion('/dashboard')).toBe(false)
    expect(esRutaSinSuscripcion('/agenda')).toBe(false)
  })
})

describe('coherencia entre las dos barreras', () => {
  it('toda ruta pública está exenta del gate de suscripción', () => {
    // Si esto falla, las listas volvieron a desincronizarse.
    for (const ruta of RUTAS_PUBLICAS) {
      expect(esRutaSinSuscripcion(ruta)).toBe(true)
    }
  })
})

describe('rutas que se parecen pero no son', () => {
  it('/paciente es público pero /pacientes no', () => {
    // El listado del consultorio empieza igual que el portal del paciente.
    expect(esRutaPublica('/paciente/abc-123')).toBe(true)
    expect(esRutaPublica('/pacientes')).toBe(false)
    expect(esRutaPublica('/pacientes/id-de-un-paciente')).toBe(false)
  })

  it('no alcanza con que la ruta arranque parecido', () => {
    expect(esRutaPublica('/registros-clinicos')).toBe(false)
    expect(esRutaPublica('/reservados')).toBe(false)
    expect(esRutaPublica('/loginhack')).toBe(false)
  })
})
