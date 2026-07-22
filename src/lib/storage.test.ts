import { describe, it, expect } from 'vitest'
import { storagePathFromUrl, BUCKET_FOTOS } from './storage'

const RUTA = 'aaaa-1111/bbbb-2222/1750000000000.jpg'

describe('storagePathFromUrl', () => {
  it('extrae la ruta de una URL pública legada', () => {
    const url = `https://abc.supabase.co/storage/v1/object/public/${BUCKET_FOTOS}/${RUTA}`
    expect(storagePathFromUrl(url)).toBe(RUTA)
  })

  it('extrae la ruta de una URL firmada (descartando el token)', () => {
    const url = `https://abc.supabase.co/storage/v1/object/sign/${BUCKET_FOTOS}/${RUTA}?token=abc.def.ghi`
    expect(storagePathFromUrl(url)).toBe(RUTA)
  })

  it('deja intacta una ruta que ya es relativa', () => {
    expect(storagePathFromUrl(RUTA)).toBe(RUTA)
  })

  it('limpia barras iniciales de una ruta relativa', () => {
    expect(storagePathFromUrl(`/${RUTA}`)).toBe(RUTA)
  })

  it('decodifica caracteres escapados en el nombre', () => {
    const url = `https://abc.supabase.co/storage/v1/object/public/${BUCKET_FOTOS}/t1/p1/foto%20final.jpg`
    expect(storagePathFromUrl(url)).toBe('t1/p1/foto final.jpg')
  })

  it('devuelve cadena vacía para null, undefined o vacío', () => {
    expect(storagePathFromUrl(null)).toBe('')
    expect(storagePathFromUrl(undefined)).toBe('')
    expect(storagePathFromUrl('   ')).toBe('')
  })

  it('no rompe con una URL de formato desconocido', () => {
    const url = 'https://otro-dominio.com/algo/raro.jpg'
    expect(storagePathFromUrl(url)).toBe(url)
  })
})
