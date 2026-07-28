import { describe, it, expect } from 'vitest'
import { urlDeClinica, APP_URL, remitente } from './config'

describe('urlDeClinica', () => {
  it('usa el dominio propio de la clínica cuando lo tiene', () => {
    expect(urlDeClinica({ custom_domain: 'walterbenegas.com.ar' })).toBe('https://walterbenegas.com.ar')
  })

  it('cae a la URL de la plataforma si la clínica no tiene dominio', () => {
    expect(urlDeClinica({ custom_domain: null })).toBe(APP_URL)
    expect(urlDeClinica(null)).toBe(APP_URL)
    expect(urlDeClinica({})).toBe(APP_URL)
  })

  it('tolera que el dominio venga con protocolo o barra final', () => {
    expect(urlDeClinica({ custom_domain: 'https://walterbenegas.com.ar/' })).toBe('https://walterbenegas.com.ar')
    expect(urlDeClinica({ custom_domain: '  walterbenegas.com.ar  ' })).toBe('https://walterbenegas.com.ar')
  })

  it('no mezcla clínicas: cada una devuelve la suya', () => {
    expect(urlDeClinica({ custom_domain: 'clinica-a.com' })).not.toBe(urlDeClinica({ custom_domain: 'clinica-b.com' }))
  })
})

describe('remitente', () => {
  it('muestra el nombre de la clínica, no el de la plataforma', () => {
    expect(remitente('Consultorio Dr. Walter Benegas')).toContain('Consultorio Dr. Walter Benegas')
  })

  it('limpia los signos que romperían la cabecera del email', () => {
    expect(remitente('Clínica <hack>')).not.toContain('<hack>')
  })
})
