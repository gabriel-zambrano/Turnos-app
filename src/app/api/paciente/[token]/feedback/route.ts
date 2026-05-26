import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params
  if (!token || !UUID_REGEX.test(token)) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
  }

  try {
    const { dolor, satisfaccion, comentario, citaId } = await req.json()

    if (!dolor || !satisfaccion || !citaId) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    // Verify patient
    const { data: pac, error: pacErr } = await supabaseAdmin
      .from('pacientes')
      .select('id, tenant_id')
      .eq('token', token)
      .single()

    if (pacErr || !pac) {
      return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
    }

    // Insert feedback
    const { error: insErr } = await supabaseAdmin
      .from('feedback_post_visita')
      .insert({
        paciente_id: pac.id,
        cita_id: citaId,
        dolor: Number(dolor),
        satisfaccion: Number(satisfaccion),
        comentario: comentario || null,
        tenant_id: pac.tenant_id
      })

    if (insErr) {
      return NextResponse.json({ error: 'Error al guardar el feedback: ' + insErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error: ' + err.message }, { status: 500 })
  }
}
