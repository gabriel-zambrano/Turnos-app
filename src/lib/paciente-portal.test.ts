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

function encolar(tabla: string, respuesta: any) {
  respuestas[tabla] = respuestas[tabla] || []
  respuestas[tabla].push(respuesta)
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const cadena: any = {
        select: () => cadena,
        insert: () => cadena,
        update: () => cadena,
        eq: () => cadena,
        gte: () => cadena,
        lt: () => cadena,
        order: () => cadena,
        limit: () => cadena,
        single: async () => (respuestas[tabla] || []).shift() || { data: null, error: null },
        maybeSingle: async () => (respuestas[tabla] || []).shift() || { data: null, error: null },
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
