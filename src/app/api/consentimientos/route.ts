import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/rate-limit'
import crypto from 'crypto'

function calcularHash(contenido: string, doc: string, fechaISO: string, firmaPng: string) {
  return crypto.createHash('sha256').update(`${contenido}|${doc}|${fechaISO}|${firmaPng}`).digest('hex')
}

// GET: lista de consentimientos de un paciente, o plantillas del tenant
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const pacienteId = url.searchParams.get('pacienteId')
    const tenantId = url.searchParams.get('tenantId')
    const plantillas = url.searchParams.get('plantillas')

    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (plantillas && tenantId) {
      const { data } = await supabase
        .from('plantillas_consentimiento')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('titulo')
      return NextResponse.json({ plantillas: data || [] })
    }

    if (!pacienteId) return NextResponse.json({ error: 'Falta pacienteId' }, { status: 400 })

    const { data } = await supabase
      .from('consentimientos_firmados')
      .select('id, titulo, estado, contexto, firmante_nombre, firmado_en, solicitado_en, token_firma')
      .eq('paciente_id', pacienteId)
      .order('solicitado_en', { ascending: false })

    return NextResponse.json({ consentimientos: data || [] })
  } catch (err: any) {
    console.error('GET /api/consentimientos:', err?.message || err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST: crea un consentimiento. Presencial (con firma) queda firmado; remoto queda pendiente con token.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { tenantId, pacienteId, plantillaId, titulo, contenido, contexto, firmanteNombre, firmanteDoc, firmaPng } = body

    if (!tenantId || !titulo || !contenido) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: membership } = await supabase
      .from('tenant_users').select('role').eq('user_id', user.id).eq('tenant_id', tenantId).single()
    if (!membership) return NextResponse.json({ error: 'No autorizado para este consultorio' }, { status: 403 })

    const esRemota = contexto === 'remota'

    const registro: Record<string, unknown> = {
      tenant_id: tenantId,
      paciente_id: pacienteId || null,
      plantilla_id: plantillaId || null,
      titulo,
      contenido_snapshot: contenido,
      contexto: esRemota ? 'remota' : 'presencial',
    }

    if (!esRemota) {
      // Firma presencial: debe venir el trazo
      if (!firmaPng) return NextResponse.json({ error: 'Falta la firma del paciente' }, { status: 400 })
      const firmadoEn = new Date().toISOString()
      registro.firma_png = firmaPng
      registro.firmante_nombre = firmanteNombre || null
      registro.firmante_doc = firmanteDoc || null
      registro.estado = 'firmado'
      registro.firmado_en = firmadoEn
      registro.ip_firma = getClientIp(req)
      registro.user_agent = req.headers.get('user-agent') || null
      registro.hash_sha256 = calcularHash(contenido, firmanteDoc || '', firmadoEn, firmaPng)
    } else {
      registro.estado = 'pendiente'
      registro.firmante_nombre = firmanteNombre || null
    }

    const { data, error } = await supabase
      .from('consentimientos_firmados')
      .insert(registro)
      .select('id, token_firma, estado')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, consentimiento: data })
  } catch (err: any) {
    console.error('POST /api/consentimientos:', err?.message || err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
