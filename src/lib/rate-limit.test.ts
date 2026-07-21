import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rateLimit, getClientIp } from './rate-limit'

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('permite hasta el límite y bloquea el siguiente', () => {
    const key = `test-a-${Math.random()}`
    // límite 3 por ventana
    expect(rateLimit(key, 3, 1000).ok).toBe(true)
    expect(rateLimit(key, 3, 1000).ok).toBe(true)
    expect(rateLimit(key, 3, 1000).ok).toBe(true)
    const cuarto = rateLimit(key, 3, 1000)
    expect(cuarto.ok).toBe(false)
    expect(cuarto.remaining).toBe(0)
    expect(cuarto.retryAfterSec).toBeGreaterThan(0)
  })

  it('decrementa remaining en cada llamada', () => {
    const key = `test-b-${Math.random()}`
    expect(rateLimit(key, 5, 1000).remaining).toBe(4)
    expect(rateLimit(key, 5, 1000).remaining).toBe(3)
  })

  it('resetea la ventana pasado el tiempo', () => {
    const key = `test-c-${Math.random()}`
    expect(rateLimit(key, 1, 1000).ok).toBe(true)
    expect(rateLimit(key, 1, 1000).ok).toBe(false)
    // avanzamos más allá de la ventana
    vi.advanceTimersByTime(1001)
    expect(rateLimit(key, 1, 1000).ok).toBe(true)
  })

  it('aísla claves distintas (no comparten bucket)', () => {
    const a = `test-d-${Math.random()}`
    const b = `test-e-${Math.random()}`
    expect(rateLimit(a, 1, 1000).ok).toBe(true)
    expect(rateLimit(a, 1, 1000).ok).toBe(false)
    // b tiene su propio contador
    expect(rateLimit(b, 1, 1000).ok).toBe(true)
  })
})

describe('getClientIp', () => {
  it('toma la primera IP de x-forwarded-for', () => {
    const req = new Request('https://x.com', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    })
    expect(getClientIp(req)).toBe('203.0.113.5')
  })

  it('cae a x-real-ip si no hay x-forwarded-for', () => {
    const req = new Request('https://x.com', {
      headers: { 'x-real-ip': '198.51.100.7' },
    })
    expect(getClientIp(req)).toBe('198.51.100.7')
  })

  it("devuelve 'unknown' si no hay headers de IP", () => {
    const req = new Request('https://x.com')
    expect(getClientIp(req)).toBe('unknown')
  })
})
