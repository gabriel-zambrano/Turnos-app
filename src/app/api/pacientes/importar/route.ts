import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Normaliza un teléfono a un formato comparable (solo dígitos, con 54 al frente si es AR)
function normTel(t: string): string {
  const d = String(t || '').replace(/\D/g, '')
  if (!d) return ''
  return d
}

function normDoc(d: string): string {
  return String(d || '').replace(/\D/g, '')
}

interface Fila {
  nombre?: string
  telefono?: string
  email?: string
  fecha_nacimiento?: string
  dni_cuit?: string
  tipo_documento?: string
  alergias?: string
  antecedentes?: string
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, filas } = await req.json() as { tenantId: string; filas: Fila[] }

    if (!tenantId || !Array.isArray(filas)) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
    }
    if (filas.length === 0) {
      return NextResponse.json({ error: 'No hay filas para importar' }, { status: 400 })
    }
    if (filas.length > 5000) {
      return NextResponse.json({ error: 'Máximo 5000 pacientes por importación' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: membership } = await supabase
      .from('tenant_users').select('role').eq('user_id', user.id).eq('tenant_id', tenantId).single()
    if (!membership) return NextResponse.json({ error: 'No autorizado para este consultorio' }, { status: 403 })

    // Traer los existentes del tenant para deduplicar (por doc y por teléfono)
    const { data: existentes } = await supabase
      .from('pacientes')
      .select('dni_cuit, telefono')
      .eq('tenant_id', tenantId)

    const docsExistentes = new Set<string>()
    const telsExistentes = new Set<string>()
    for (const e of existentes || []) {
      if (e.dni_cuit) docsExistentes.add(normDoc(e.dni_cuit))
      if (e.telefono) telsExistentes.add(normTel(e.telefono))
    }

    const aInsertar: Record<string, unknown>[] = []
    const errores: { fila: number; motivo: string }[] = []
    let duplicados = 0
    // Sets locales para no duplicar dentro del mismo archivo
    const docsLote = new Set<string>()
    const telsLote = new Set<string>()

    filas.forEach((f, i) => {
      const nombre = (f.nombre || '').trim()
      const telefono = (f.telefono || '').trim()

      if (!nombre) { errores.push({ fila: i + 1, motivo: 'Falta el nombre' }); return }

      const docN = normDoc(f.dni_cuit || '')
      const telN = normTel(telefono)

      // Deduplicación: por documento si hay, si no por teléfono
      if (docN && (docsExistentes.has(docN) || docsLote.has(docN))) { duplicados++; return }
      if (!docN && telN && (telsExistentes.has(telN) || telsLote.has(telN))) { duplicados++; return }

      if (docN) docsLote.add(docN)
      if (telN) telsLote.add(telN)

      // Fecha: aceptar YYYY-MM-DD o DD/MM/YYYY
      let fnac: string | null = null
      const raw = (f.fecha_nacimiento || '').trim()
      if (raw) {
        const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
        const m2 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        if (m1) fnac = `${m1[1]}-${m1[2]}-${m1[3]}`
        else if (m2) fnac = `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`
      }

      aInsertar.push({
        tenant_id: tenantId,
        nombre,
        telefono: telefono || 'sin dato',
        email: (f.email || '').trim() || null,
        fecha_nacimiento: fnac,
        dni_cuit: f.dni_cuit ? String(f.dni_cuit).trim() : null,
        tipo_documento: (f.tipo_documento || '').trim() || 'DNI',
        alergias: (f.alergias || '').trim() || null,
        antecedentes: (f.antecedentes || '').trim() || null,
        ultimo_tratamiento: 'Consulta',
        token: crypto.randomUUID(),
      })
    })

    let insertados = 0
    if (aInsertar.length > 0) {
      // Insertar en tandas de 500
      for (let i = 0; i < aInsertar.length; i += 500) {
        const tanda = aInsertar.slice(i, i + 500)
        const { error, count } = await supabase.from('pacientes').insert(tanda, { count: 'exact' })
        if (error) return NextResponse.json({ error: `Error al insertar: ${error.message}`, insertados }, { status: 500 })
        insertados += count ?? tanda.length
      }
    }

    return NextResponse.json({
      success: true,
      insertados,
      duplicados,
      errores: errores.slice(0, 50),
      totalErrores: errores.length,
    })
  } catch (err: any) {
    console.error('POST /api/pacientes/importar:', err?.message || err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
