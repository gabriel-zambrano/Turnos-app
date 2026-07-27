import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { duracionPorDefecto } from '@/lib/constants'
import { slotsLibres, estadoDeSlots, esFechaValida, MINUTOS_POR_SLOT, OFFSET_AR, type Ocupacion } from '@/lib/reserva'

// ─────────────────────────────────────────────────────────────
// Datos públicos para la página de reserva: qué consultorio es, qué
// tratamientos ofrece y qué horarios tiene libres una fecha.
//
// Es una ruta anónima a propósito (el paciente no tiene cuenta), así que no
// expone nada sensible: nombre, branding y horarios libres. Nunca devuelve
// quién tiene turno ni ningún dato de otros pacientes.
// ─────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest, { params }: { params: { clinica: string } }) {
  const ip = getClientIp(req)
  const rl = rateLimit(`reserva-info:${ip}`, 60, 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Esperá un momento.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  const clinica = (params.clinica || '').toLowerCase()
  if (!/^[a-z0-9-]{2,60}$/.test(clinica)) {
    return NextResponse.json({ error: 'Consultorio inválido' }, { status: 400 })
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, nombre, direccion, telefono, logourl, primarycolor, secondarycolor, accentcolor, activo')
    .or(`subdominio_generico.eq.${clinica},subdominio.eq.${clinica}`)
    .maybeSingle()

  if (!tenant || tenant.activo === false) {
    return NextResponse.json({ error: 'Consultorio no encontrado' }, { status: 404 })
  }

  const { data: tratamientos } = await supabaseAdmin
    .from('tratamientos')
    .select('nombre, duracion_default')
    .eq('tenant_id', tenant.id)
    .eq('activo', true)
    .order('nombre')

  const clinicaPublica = {
    nombre: tenant.nombre,
    direccion: tenant.direccion || '',
    telefono: tenant.telefono || '',
    logoUrl: tenant.logourl || null,
    primaryColor: tenant.primarycolor || '#0a1e3d',
    secondaryColor: tenant.secondarycolor || '#185FA5',
    accentColor: tenant.accentcolor || '#138A6B',
  }

  const tratamientosPublicos = (tratamientos || []).map(t => ({
    nombre: t.nombre,
    duracion: t.duracion_default || duracionPorDefecto(t.nombre),
  }))

  // Sin fecha, solo devolvemos los datos del consultorio.
  const fecha = req.nextUrl.searchParams.get('fecha')
  if (!fecha) {
    return NextResponse.json({ clinica: clinicaPublica, tratamientos: tratamientosPublicos })
  }

  if (!esFechaValida(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }

  const duracion = Number(req.nextUrl.searchParams.get('duracion')) || MINUTOS_POR_SLOT

  // La ventana del día se pide con el huso de Argentina explícito. Sin el
  // offset, Postgres interpreta el texto en el huso de la sesión (UTC), y el
  // rango se corre 3 horas: turnos reales quedaban fuera de la consulta y el
  // horario aparecía libre.
  const { data: citas, error: errCitas } = await supabaseAdmin
    .from('citas')
    .select('fecha_hora, duracion_minutos, estado')
    .eq('tenant_id', tenant.id)
    .gte('fecha_hora', `${fecha}T00:00:00${OFFSET_AR}`)
    .lte('fecha_hora', `${fecha}T23:59:59${OFFSET_AR}`)

  if (errCitas) {
    // Si no podemos saber qué está ocupado, no ofrecemos nada: es preferible
    // que el paciente llame por teléfono antes que darle un turno pisado.
    console.error('Error consultando disponibilidad:', errCitas.message)
    return NextResponse.json({ error: 'No pudimos consultar la disponibilidad.' }, { status: 503 })
  }

  // Un turno cancelado libera el horario; el resto de los estados lo ocupan.
  // El filtro se hace acá y no en la query porque `estado=not.eq.cancelado`
  // descarta también las filas con estado nulo, que sí ocupan la agenda.
  const ocupados: Ocupacion[] = (citas || [])
    .filter(c => (c.estado || '').toLowerCase() !== 'cancelado')
    .map(c => ({
      fechaHora: c.fecha_hora,
      duracionMinutos: c.duracion_minutos || MINUTOS_POR_SLOT,
    }))

  return NextResponse.json({
    clinica: clinicaPublica,
    tratamientos: tratamientosPublicos,
    fecha,
    libres: slotsLibres(fecha, ocupados, duracion),
    // Grilla completa con el estado de cada horario, para poder mostrar los
    // ocupados en gris en vez de esconderlos.
    slots: estadoDeSlots(fecha, ocupados, duracion),
    // Cuántos turnos se tuvieron en cuenta. No expone datos de nadie y sirve
    // para detectar al toque si la consulta no está viendo la agenda real.
    ocupados: ocupados.length,
  })
}
