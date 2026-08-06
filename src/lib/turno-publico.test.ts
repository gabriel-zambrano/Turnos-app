import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────
// El bug que motivó estos tests: el botón "Agregar a mi calendario" del portal
// no hacía nada. La causa era una consulta que pedía `pacientes.token_expira`
// —una columna que agrega una migración suelta, no versionada— y que además
// descartaba el `error` de Supabase. Con la columna ausente, la consulta
// fallaba entera y el resultado era `data: null`, indistinguible de "este
// paciente no existe": la ruta devolvía 404 "Link inválido" sin dejar rastro.
// ─────────────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-prueba'

/** Respuestas encoladas por tabla, en el orden en que se consultan. */
let respuestas: Record<string, any[]>

function encolar(tabla: string, respuesta: any) {
  respuestas[tabla] = respuestas[tabla] || []
  respuestas[tabla].push(respuesta)
}

/**
 * Cliente mínimo con la forma encadenable de supabase-js. Solo implementa lo
 * que usa `leerTurnoPublico`: from().select().eq().maybeSingle().
 */
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const cadena: any = {
        select: () => cadena,
        eq: () => cadena,
        maybeSingle: async () =>
          (respuestas[tabla] || []).shift() || { data: null, error: null },
      }
      return cadena
    },
  }),
}))

// El import va después de `vi.mock` a propósito, pero sin `await import`:
// el tsconfig del proyecto no habilita top-level await. Vitest iza las
// llamadas a `vi.mock` por encima de los imports, así que el mock ya está
// puesto cuando este módulo se evalúa.
import { leerTurnoPublico, HTTP_POR_MOTIVO } from './turno-publico'

const TOKEN = '11111111-1111-4111-8111-111111111111'
const CITA = '22222222-2222-4222-8222-222222222222'

const PACIENTE = { data: { id: 'pac-1', nombre: 'Ana', tenant_id: 'ten-1' }, error: null }
const CITA_OK = {
  data: {
    id: CITA,
    fecha_hora: '2026-08-20T13:30:00.000Z',
    tipo_tratamiento: 'Limpieza',
    duracion_minutos: 45,
    estado: 'confirmado',
  },
  error: null,
}
const TENANT = { data: { nombre: 'Consultorio Benegas', direccion: 'Siempreviva 742' }, error: null }

/** Error tal como lo devuelve Postgres cuando la columna no existe. */
const COLUMNA_AUSENTE = {
  data: null,
  error: { message: 'column pacientes.token_expira does not exist' },
}

beforeEach(() => {
  respuestas = {}
})

describe('validación del enlace', () => {
  it('rechaza lo que no es un uuid sin llegar a consultar', async () => {
    for (const [token, cita] of [['', CITA], [TOKEN, ''], ['abc-123', CITA], [TOKEN, 'no-uuid']]) {
      const res = await leerTurnoPublico(token, cita)
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.motivo).toBe('parametros')
    }
  })

  it('un token que no existe es 404 y no 500', async () => {
    encolar('pacientes', { data: null, error: null })
    const res = await leerTurnoPublico(TOKEN, CITA)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.motivo).toBe('token')
      expect(HTTP_POR_MOTIVO[res.motivo]).toBe(404)
    }
  })
})

describe('token_expira, la columna que puede no existir', () => {
  it('si la consulta del vencimiento falla, el turno se devuelve igual', async () => {
    // Este es el corazón del arreglo. Antes, `token_expira` iba en el SELECT
    // principal: si la migración no estaba corrida, fallaba TODO y el paciente
    // veía "Link inválido". Ahora se consulta aparte y su falla no arrastra
    // nada: un link sin vencimiento es exactamente el comportamiento que había
    // antes de esa migración.
    encolar('pacientes', PACIENTE)
    encolar('pacientes', COLUMNA_AUSENTE)
    encolar('citas', CITA_OK)
    encolar('tenants', TENANT)

    const res = await leerTurnoPublico(TOKEN, CITA)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.turno.tratamiento).toBe('Limpieza')
  })

  it('con la columna presente y vencida, corta', async () => {
    encolar('pacientes', PACIENTE)
    encolar('pacientes', { data: { token_expira: '2020-01-01T00:00:00.000Z' }, error: null })

    const res = await leerTurnoPublico(TOKEN, CITA)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.motivo).toBe('vencido')
      expect(HTTP_POR_MOTIVO[res.motivo]).toBe(410)
    }
  })

  it('con la columna presente y a futuro, deja pasar', async () => {
    encolar('pacientes', PACIENTE)
    encolar('pacientes', { data: { token_expira: '2099-01-01T00:00:00.000Z' }, error: null })
    encolar('citas', CITA_OK)
    encolar('tenants', TENANT)

    expect((await leerTurnoPublico(TOKEN, CITA)).ok).toBe(true)
  })

  it('token_expira en null es "no vence nunca"', async () => {
    encolar('pacientes', PACIENTE)
    encolar('pacientes', { data: { token_expira: null }, error: null })
    encolar('citas', CITA_OK)
    encolar('tenants', TENANT)

    expect((await leerTurnoPublico(TOKEN, CITA)).ok).toBe(true)
  })
})

describe('los errores de base no se disfrazan de "link inválido"', () => {
  it('una consulta caída devuelve motivo de servidor, no 404', async () => {
    encolar('pacientes', { data: null, error: { message: 'connection reset' } })

    const res = await leerTurnoPublico(TOKEN, CITA)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.motivo).toBe('base')
      expect(HTTP_POR_MOTIVO[res.motivo]).toBe(500)
      // El detalle tiene que sobrevivir hasta los logs: sin él, este bug es
      // invisible desde afuera.
      expect(res.detalle).toBe('connection reset')
    }
  })

  it('lo mismo para la consulta de la cita', async () => {
    encolar('pacientes', PACIENTE)
    encolar('pacientes', { data: { token_expira: null }, error: null })
    encolar('citas', { data: null, error: { message: 'timeout' } })

    const res = await leerTurnoPublico(TOKEN, CITA)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.motivo).toBe('base')
  })
})

describe('la cita', () => {
  it('una cita que no es del paciente no se devuelve', async () => {
    encolar('pacientes', PACIENTE)
    encolar('pacientes', { data: { token_expira: null }, error: null })
    encolar('citas', { data: null, error: null })

    const res = await leerTurnoPublico(TOKEN, CITA)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.motivo).toBe('cita')
  })

  it('una cita cancelada no se agenda', async () => {
    encolar('pacientes', PACIENTE)
    encolar('pacientes', { data: { token_expira: null }, error: null })
    encolar('citas', { data: { ...CITA_OK.data, estado: 'cancelado' }, error: null })

    const res = await leerTurnoPublico(TOKEN, CITA)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.motivo).toBe('cancelada')
  })

  it('sin duración usa 30 minutos y sin tratamiento dice "Consulta"', async () => {
    encolar('pacientes', PACIENTE)
    encolar('pacientes', { data: { token_expira: null }, error: null })
    encolar('citas', { data: { ...CITA_OK.data, duracion_minutos: null, tipo_tratamiento: null }, error: null })
    encolar('tenants', TENANT)

    const res = await leerTurnoPublico(TOKEN, CITA)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.turno.duracionMinutos).toBe(30)
      expect(res.turno.tratamiento).toBe('Consulta')
    }
  })

  it('si el tenant no se puede leer, el turno igual sirve', async () => {
    // La clínica es para mostrar nombre y dirección. Que falte no es motivo
    // para dejar al paciente sin poder agendar.
    encolar('pacientes', PACIENTE)
    encolar('pacientes', { data: { token_expira: null }, error: null })
    encolar('citas', CITA_OK)
    encolar('tenants', { data: null, error: { message: 'vaya' } })

    const res = await leerTurnoPublico(TOKEN, CITA)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.turno.clinica).toBe('')
  })
})
