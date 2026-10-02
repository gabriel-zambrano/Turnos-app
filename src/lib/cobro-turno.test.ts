import { describe, it, expect, vi } from 'vitest'
import { cobrarTurno, mensajeCobro, type EntradaCobroTurno } from './cobro-turno'

/** Supabase falso: estado de la caja y pagos previos configurables. */
function fakeSupabase(o: { caja?: string | null; pagos?: number[] | null; errorPagos?: boolean } = {}) {
  return {
    from(tabla: string) {
      const q: any = { select: () => q, eq: () => q }
      if (tabla === 'cajas_diarias') {
        q.maybeSingle = async () => ({ data: o.caja ? { estado: o.caja } : null, error: null })
      } else {
        q.then = (r: any) => r(o.errorPagos
          ? { data: null, error: { message: 'timeout' } }
          : { data: (o.pagos ?? []).map(m => ({ monto: m })), error: null })
      }
      return q
    },
  } as any
}

function entrada(over: Partial<EntradaCobroTurno> = {}, sb = fakeSupabase()) {
  const registrarPago = vi.fn(async () => ({ error: null as string | null }))
  const cerrarTurno = vi.fn(async () => ({ success: true }))
  const e: EntradaCobroTurno = {
    supabase: sb, tenantId: 't', citaId: 'c', pacienteId: 'p', fechaCaja: '2026-10-01',
    pago: { monto: 85000, formaPago: 'Efectivo', requiereFactura: false, origen: 'cobro_rapido' },
    cerrarTurno, registrarPago, ...over,
  }
  return { e, registrarPago: e.registrarPago as any, cerrarTurno: e.cerrarTurno as any }
}

describe('cobrarTurno: caminos que NO registran dinero', () => {
  it('caja cerrada', async () => {
    const { e, registrarPago, cerrarTurno } = entrada({}, fakeSupabase({ caja: 'cerrada' }))
    expect(await cobrarTurno(e)).toEqual({ tipo: 'caja_cerrada' })
    expect(registrarPago).not.toHaveBeenCalled()
    expect(cerrarTurno).not.toHaveBeenCalled()
  })
  it('no se pudo leer lo ya cobrado', async () => {
    const { e, registrarPago } = entrada({}, fakeSupabase({ errorPagos: true }))
    expect(await cobrarTurno(e)).toEqual({ tipo: 'sin_verificar' })
    expect(registrarPago).not.toHaveBeenCalled()
  })
  it('turno con cobro previo y sin confirmar: pide confirmación', async () => {
    const { e, registrarPago } = entrada({}, fakeSupabase({ pagos: [85000] }))
    expect(await cobrarTurno(e)).toEqual({ tipo: 'requiere_confirmacion', cobradoPrevio: 85000 })
    expect(registrarPago).not.toHaveBeenCalled()
  })
  it('pago rechazado: no intenta cerrar el turno', async () => {
    const { e, cerrarTurno } = entrada({ registrarPago: vi.fn(async () => ({ error: 'sin conexión' })) })
    expect(await cobrarTurno(e)).toEqual({ tipo: 'pago_rechazado', motivo: 'sin conexión' })
    expect(cerrarTurno).not.toHaveBeenCalled()
  })
})

describe('cobrarTurno: caminos que registran', () => {
  it('cobro normal: registra una vez y cierra el turno', async () => {
    const { e, registrarPago, cerrarTurno } = entrada()
    expect(await cobrarTurno(e)).toEqual({ tipo: 'cobrado', monto: 85000 })
    expect(registrarPago).toHaveBeenCalledTimes(1)
    expect(registrarPago.mock.calls[0][1]).toMatchObject({ tenantId: 't', citaId: 'c', pacienteId: 'p', monto: 85000, formaPago: 'Efectivo' })
    expect(cerrarTurno).toHaveBeenCalledWith('c')
  })
  it('con cobro previo y confirmado: registra igual', async () => {
    const { e, registrarPago } = entrada({ confirmadoPagoExtra: true }, fakeSupabase({ pagos: [85000] }))
    expect(await cobrarTurno(e)).toEqual({ tipo: 'cobrado', monto: 85000 })
    expect(registrarPago).toHaveBeenCalledTimes(1)
  })
  it('pago guardado pero el cierre falla', async () => {
    const { e } = entrada({ cerrarTurno: vi.fn(async () => ({ success: false })) })
    expect(await cobrarTurno(e)).toEqual({ tipo: 'cobrado_sin_cerrar', monto: 85000 })
  })
  it('pago guardado y el cierre lanza una excepción', async () => {
    const { e } = entrada({ cerrarTurno: vi.fn(async () => { throw new Error('red') }) })
    expect(await cobrarTurno(e)).toEqual({ tipo: 'cobrado_sin_cerrar', monto: 85000 })
  })
  it('sin fecha de caja no la consulta', async () => {
    const sb = fakeSupabase({ caja: 'cerrada' })
    const { e } = entrada({ fechaCaja: undefined }, sb)
    expect(await cobrarTurno(e)).toEqual({ tipo: 'cobrado', monto: 85000 })
  })
})

describe('cobrarTurno sin pago (solo cerrar)', () => {
  it('cierra sin registrar ni consultar', async () => {
    const { e, registrarPago } = entrada({ pago: null }, fakeSupabase({ caja: 'cerrada', pagos: [85000] }))
    expect(await cobrarTurno(e)).toEqual({ tipo: 'cerrado' })
    expect(registrarPago).not.toHaveBeenCalled()
  })
  it('si el cierre falla, avisa sin hablar de cobros', async () => {
    const { e } = entrada({ pago: null, cerrarTurno: vi.fn(async () => ({ success: false })) })
    expect(await cobrarTurno(e)).toEqual({ tipo: 'cierre_fallido' })
  })
})

describe('mensajeCobro', () => {
  it('cierra el formulario siempre que el pago quedó guardado', () => {
    expect(mensajeCobro({ tipo: 'cobrado', monto: 1 }, false)?.cerrarFormulario).toBe(true)
    expect(mensajeCobro({ tipo: 'cobrado_sin_cerrar', monto: 1 }, false)?.cerrarFormulario).toBe(true)
  })
  it('deja el formulario abierto si no se guardó nada', () => {
    for (const r of [{ tipo: 'caja_cerrada' }, { tipo: 'sin_verificar' }, { tipo: 'pago_rechazado', motivo: 'x' }, { tipo: 'cierre_fallido' }] as const) {
      expect(mensajeCobro(r, false)?.cerrarFormulario).toBe(false)
    }
  })
  it('no menciona puntos con el programa apagado', () => {
    expect(mensajeCobro({ tipo: 'cobrado', monto: 85000 }, false)?.texto).toBe('Cobro de $ 85.000 registrado · turno cerrado')
    expect(mensajeCobro({ tipo: 'cobrado', monto: 85000 }, true)?.texto).toContain('puntos acreditados')
  })
  it('si el pago quedó guardado, lo dice y pide no volver a cobrar', () => {
    const t = mensajeCobro({ tipo: 'cobrado_sin_cerrar', monto: 85000 }, false)!.texto
    expect(t).toContain('$ 85.000 quedó registrado')
    expect(t).toContain('No vuelvas a cobrarlo')
  })
  it('la confirmación no es un mensaje: se muestra como aviso en el formulario', () => {
    expect(mensajeCobro({ tipo: 'requiere_confirmacion', cobradoPrevio: 1 }, false)).toBeNull()
  })
})
