import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─────────────────────────────────────────────────────────────
// Tests de resiliencia del Portal del Paciente (/api/paciente/[token]):
// Garantiza que cuando la columna opcional `token_expira` no existe
// en la base de datos (Postgres error 42703), la búsqueda del paciente
// tanto en GET como en POST nunca falle con 404 "Paciente no encontrado
// o enlace inválido".
// ─────────────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-prueba'

let respuestas: Record<string, any[]> = {}
// Respuesta para una consulta a `pacientes` filtrada por id = <clave>. Sirve
// para detectar si la ruta busca por id (lo que no debe hacer nunca).
let trampaPorId: Record<string, any> = {}

function encolar(tabla: string, respuesta: any) {
  respuestas[tabla] = respuestas[tabla] || []
  respuestas[tabla].push(respuesta)
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const filtros: Record<string, any> = {}
      const resolver = () => {
        if (tabla === 'pacientes' && filtros.id && trampaPorId[filtros.id]) return trampaPorId[filtros.id]
        return (respuestas[tabla] || []).shift() || { data: null, error: null }
      }
      const cadena: any = {
        select: () => cadena,
        insert: () => cadena,
        update: () => cadena,
        eq: (col: string, val: any) => { filtros[col] = val; return cadena },
        gte: () => cadena,
        lt: () => cadena,
        order: () => cadena,
        limit: () => cadena,
        single: async () => resolver(),
        maybeSingle: async () => resolver(),
      }
      return cadena
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: 'https://firmada.test' }, error: null }),
      }),
    },
  }),
}))

import { GET, POST } from '@/app/api/paciente/[token]/route'

const TOKEN_VALIDO = '11111111-1111-4111-8111-111111111111'
const ERROR_COLUMNA_TOKEN_EXPIRA = {
  data: null,
  error: { code: '42703', message: 'column pacientes.token_expira does not exist' },
}

describe('Portal del Paciente: Resiliencia frente a ausencia de token_expira', () => {
  beforeEach(() => {
    respuestas = {}
    trampaPorId = {}
  })

  it('GET: devuelve los datos clínicos sin limpiarlos a null aunque token_expira no exista en DB', async () => {
    // 1. Consulta estándar de paciente por token (éxito)
    encolar('pacientes', {
      data: {
        id: 'pac-123',
        nombre: 'Gabriel Zambrano',
        telefono: '1122334455',
        tenant_id: 'ten-1',
        dni_cuit: '38123456',
        alergias: 'Penicilina',
        antecedentes: 'Hipertensión',
        consentimiento_datos_en: '2026-08-01T12:00:00Z',
        consentimiento_datos_ver: '2026-07-27-v1',
        progreso_plan_porcentaje: 80,
        puntos_saldo_cache: 150,
        recomendaciones: 'Cepillado suave',
      },
      error: null,
    })

    // 2. Consulta tolerante de token_expira (la columna no existe)
    encolar('pacientes', ERROR_COLUMNA_TOKEN_EXPIRA)

    // Consultas accesorias de GET:
    encolar('tenants', { data: { id: 'ten-1', nombre: 'Clínica Benegas' }, error: null })
    encolar('citas', { data: [], error: null }) // futuras
    encolar('historial_dental', { data: [], error: null })
    encolar('citas', { data: [], error: null }) // pasadas
    encolar('paciente_fotos', { data: [], error: null })
    encolar('citas', { data: [], error: null }) // pastCitas48h
    encolar('consentimientos_firmados', { data: null, error: null })

    const req = new NextRequest(`https://turnos.test/api/paciente/${TOKEN_VALIDO}`)
    const res = await GET(req, { params: { token: TOKEN_VALIDO } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.paciente.nombre).toBe('Gabriel Zambrano')
    expect(body.paciente.dni_cuit).toBe('38123456')
    expect(body.paciente.alergias).toBe('Penicilina')
    expect(body.paciente.antecedentes).toBe('Hipertensión')
  })

  it('POST: guarda anamnesis y consentimiento con éxito cuando token_expira no existe en DB', async () => {
    // 1. Búsqueda de paciente por token (éxito)
    encolar('pacientes', {
      data: {
        id: 'pac-123',
        nombre: 'Gabriel Zambrano',
        tenant_id: 'ten-1',
        dni_cuit: null,
      },
      error: null,
    })

    // 2. Consulta tolerante de token_expira (la columna no existe)
    encolar('pacientes', ERROR_COLUMNA_TOKEN_EXPIRA)

    // 3. Update en pacientes (éxito)
    encolar('pacientes', { data: null, error: null })

    // 4. Insert en consentimientos_firmados (éxito)
    encolar('consentimientos_firmados', {
      data: {
        id: 'cf-999',
        titulo: 'Declaración Jurada de Salud y Consentimiento Digital',
        firmado_en: '2026-10-02T16:00:00Z',
        hash_sha256: 'abc123hash',
      },
      error: null,
    })

    const payload = {
      dni: '38123456',
      alergias: 'Penicilina',
      antecedentes: 'Ninguno',
      medicacionHabitual: 'Ibuprofeno',
      contactoEmergencia: '1199887766',
      aceptaConsentimiento: true,
      firmaPng: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    }

    const req = new NextRequest(`https://turnos.test/api/paciente/${TOKEN_VALIDO}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const res = await POST(req, { params: { token: TOKEN_VALIDO } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.paciente.dni_cuit).toBe('38123456')
    expect(body.consentimiento.id).toBe('cf-999')
  })

  it('POST: realiza fallback progresivo si faltan columnas opcionales en update', async () => {
    // 1. Paciente encontrado
    encolar('pacientes', {
      data: { id: 'pac-123', nombre: 'Gabriel', tenant_id: 'ten-1', dni_cuit: null },
      error: null,
    })

    // 2. token_expira no existe
    encolar('pacientes', ERROR_COLUMNA_TOKEN_EXPIRA)

    // 3. Fallo en update con IP/origen
    encolar('pacientes', { data: null, error: { message: 'column consentimiento_datos_ip does not exist' } })

    // 4. Éxito en update fallback 2 (sin IP/origen)
    encolar('pacientes', { data: null, error: null })

    // 5. Insert en consentimientos_firmados
    encolar('consentimientos_firmados', {
      data: { id: 'cf-1', titulo: 'Test', firmado_en: '2026-10-02T16:00:00Z' },
      error: null,
    })

    const payload = {
      dni: '38123456',
      alergias: 'Ninguna',
      antecedentes: '',
      aceptaConsentimiento: true,
      firmaPng: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    }

    const req = new NextRequest(`https://turnos.test/api/paciente/${TOKEN_VALIDO}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const res = await POST(req, { params: { token: TOKEN_VALIDO } })
    expect(res.status).toBe(200)
  })

  it('POST: valida campos obligatorios (DNI, firma y consentimiento)', async () => {
    // Sin DNI
    const reqSinDni = new NextRequest(`https://turnos.test/api/paciente/${TOKEN_VALIDO}`, {
      method: 'POST',
      body: JSON.stringify({
        dni: '',
        aceptaConsentimiento: true,
        firmaPng: 'data:image/png;base64,abc',
      }),
    })
    encolar('pacientes', { data: { id: 'pac-1', nombre: 'Ana' }, error: null })
    encolar('pacientes', { data: null, error: null })
    const resSinDni = await POST(reqSinDni, { params: { token: TOKEN_VALIDO } })
    expect(resSinDni.status).toBe(400)
    const bodySinDni = await resSinDni.json()
    expect(bodySinDni.error).toContain('DNI')

    // Sin firma válida
    const reqSinFirma = new NextRequest(`https://turnos.test/api/paciente/${TOKEN_VALIDO}`, {
      method: 'POST',
      body: JSON.stringify({
        dni: '12345678',
        aceptaConsentimiento: true,
        firmaPng: '',
      }),
    })
    encolar('pacientes', { data: { id: 'pac-1', nombre: 'Ana' }, error: null })
    encolar('pacientes', { data: null, error: null })
    const resSinFirma = await POST(reqSinFirma, { params: { token: TOKEN_VALIDO } })
    expect(resSinFirma.status).toBe(400)
    const bodySinFirma = await resSinFirma.json()
    expect(bodySinFirma.error).toContain('firma manuscrita digital')
  })

  it('POST: devuelve 404 si el paciente realmente no existe en la base', async () => {
    // Buscar por token -> null
    encolar('pacientes', { data: null, error: null })
    // Buscar por id -> null
    encolar('pacientes', { data: null, error: null })
    // Buscar mínimo -> null
    encolar('pacientes', { data: null, error: null })

    const req = new NextRequest(`https://turnos.test/api/paciente/${TOKEN_VALIDO}`, {
      method: 'POST',
      body: JSON.stringify({
        dni: '38123456',
        aceptaConsentimiento: true,
        firmaPng: 'data:image/png;base64,abc',
      }),
    })

    const res = await POST(req, { params: { token: TOKEN_VALIDO } })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Paciente no encontrado o enlace inválido')
  })
})

// ── Seguridad: el portal se abre SOLO con el token secreto ──────────────────
// El commit a1e5b2b agregó una búsqueda por id "por retrocompatibilidad". El
// id del paciente no es secreto (aparece en /pacientes/<id>), y esta ruta es
// pública con service_role: con un id se leían datos clínicos y se podía
// escribir la anamnesis de cualquier paciente, sin login.
describe('Portal del Paciente: no se accede por id', () => {
  const ID_DE_OTRO_PACIENTE = '22222222-2222-4222-8222-222222222222'
  const AJENO = { id: ID_DE_OTRO_PACIENTE, nombre: 'Paciente Ajeno', telefono: '1100000000', tenant_id: 'ten-1', dni_cuit: '30111222', alergias: 'Látex', antecedentes: 'Diabetes' }

  beforeEach(() => {
    respuestas = {}
    // Si la ruta consulta pacientes por id = ID_DE_OTRO_PACIENTE, encuentra al ajeno.
    trampaPorId = { [ID_DE_OTRO_PACIENTE]: { data: AJENO, error: null } }
  })

  it('GET con un id (no un token) devuelve 404 y no expone datos', async () => {
    const req = new NextRequest(`https://turnos.test/api/paciente/${ID_DE_OTRO_PACIENTE}`)
    const res = await GET(req, { params: { token: ID_DE_OTRO_PACIENTE } })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('Paciente Ajeno')
    expect(JSON.stringify(body)).not.toContain('Látex')
  })

  it('POST con un id (no un token) devuelve 404 y no escribe', async () => {
    const req = new NextRequest(`https://turnos.test/api/paciente/${ID_DE_OTRO_PACIENTE}`, {
      method: 'POST',
      body: JSON.stringify({ dni: '30111222', aceptaConsentimiento: true, firmaPng: 'data:image/png;base64,AAAA' }),
    })
    const res = await POST(req, { params: { token: ID_DE_OTRO_PACIENTE } })
    expect(res.status).toBe(404)
  })
})

