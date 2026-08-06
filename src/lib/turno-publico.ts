import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────
// Lectura de un turno a partir del token del paciente.
//
// La usan las dos superficies que el paciente abre sin login: la descarga del
// .ics y la pantalla /agendar. Vivía duplicada dentro de /api/ics, y ahí
// arrastraba dos problemas que son la razón de este archivo:
//
//   1. Descartaba el `error` de Supabase (`const { data } = await ...`). Una
//      consulta que falla por una columna inexistente devuelve `data: null`,
//      exactamente igual que "este paciente no existe". El resultado era un
//      404 "Link inválido" indistinguible de un token vencido, y el botón de
//      "Agregar a mi calendario" no hacía nada sin dejar rastro de por qué.
//
//   2. Pedía `token_expira` en el SELECT principal. Esa columna la agrega
//      `supabase_migration_security_fix.sql`, que es un .sql suelto en la raíz
//      y no una migración versionada: en una base donde no se corrió a mano,
//      TODA la consulta falla. El portal sobrevivía porque tenía su propio
//      fallback; esta ruta no. Acá el vencimiento se consulta aparte y se
//      tolera que la columna no exista.
// ─────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MotivoTurnoPublico =
  | 'parametros'      // falta el token o el id de la cita, o no son uuid
  | 'token'           // el token no corresponde a ningún paciente
  | 'vencido'         // el token tenía fecha de expiración y ya pasó
  | 'cita'            // la cita no existe o no es de ese paciente
  | 'cancelada'       // la cita existe pero fue cancelada
  | 'base'            // la consulta falló: problema nuestro, no del paciente

export type ResultadoTurnoPublico =
  | { ok: true; turno: TurnoPublico }
  | { ok: false; motivo: MotivoTurnoPublico; detalle?: string }

export interface TurnoPublico {
  citaId: string
  pacienteNombre: string
  fechaHora: string
  tratamiento: string
  duracionMinutos: number
  estado: string
  clinica: string
  direccion: string
}

/** Códigos HTTP por motivo. `base` es 500 a propósito: el paciente no hizo nada mal. */
export const HTTP_POR_MOTIVO: Record<MotivoTurnoPublico, number> = {
  parametros: 400,
  token: 404,
  vencido: 410,
  cita: 404,
  cancelada: 410,
  base: 500,
}

export const MENSAJE_POR_MOTIVO: Record<MotivoTurnoPublico, string> = {
  parametros: 'Faltan datos en el enlace.',
  token: 'Este enlace no es válido.',
  vencido: 'Este enlace venció. Pedile uno nuevo a tu consultorio.',
  cita: 'No encontramos este turno.',
  cancelada: 'Este turno fue cancelado.',
  base: 'No pudimos leer el turno. Probá de nuevo en un momento.',
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * ¿El token está vencido?
 *
 * Se consulta aparte y con tolerancia: si `token_expira` todavía no existe en
 * la base, se trata como "sin vencimiento" en vez de tumbar la operación
 * entera. Un link que no vence es el comportamiento que había antes de la
 * migración, así que no se pierde nada; lo que se evita es que la ausencia de
 * una columna opcional rompa una función que no depende de ella.
 */
async function estaVencido(supabase: ReturnType<typeof admin>, pacienteId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('pacientes')
    .select('token_expira')
    .eq('id', pacienteId)
    .maybeSingle()

  if (error || !data) return false
  const expira = (data as { token_expira?: string | null }).token_expira
  return !!expira && new Date(expira).getTime() < Date.now()
}

export async function leerTurnoPublico(
  token: string,
  citaId: string
): Promise<ResultadoTurnoPublico> {
  const t = (token || '').trim()
  const c = (citaId || '').trim()

  // El token es un uuid. Validarlo acá evita una consulta por cada string
  // arbitrario que llegue, que es lo que haría un escaneo automatizado.
  if (!t || !c || !UUID_REGEX.test(t) || !UUID_REGEX.test(c)) {
    return { ok: false, motivo: 'parametros' }
  }

  const supabase = admin()

  const { data: paciente, error: errorPaciente } = await supabase
    .from('pacientes')
    .select('id, nombre, tenant_id')
    .eq('token', t)
    .maybeSingle()

  if (errorPaciente) {
    return { ok: false, motivo: 'base', detalle: errorPaciente.message }
  }
  if (!paciente) {
    return { ok: false, motivo: 'token' }
  }
  if (await estaVencido(supabase, paciente.id)) {
    return { ok: false, motivo: 'vencido' }
  }

  // La cita tiene que ser de ESE paciente. Sin este filtro, cualquier token
  // válido serviría para leer el turno de otro.
  const { data: cita, error: errorCita } = await supabase
    .from('citas')
    .select('id, fecha_hora, tipo_tratamiento, duracion_minutos, estado')
    .eq('id', c)
    .eq('paciente_id', paciente.id)
    .maybeSingle()

  if (errorCita) {
    return { ok: false, motivo: 'base', detalle: errorCita.message }
  }
  if (!cita) {
    return { ok: false, motivo: 'cita' }
  }
  if (cita.estado === 'cancelado') {
    return { ok: false, motivo: 'cancelada' }
  }

  // El tenant es para mostrar nombre y dirección. Si falla, el turno igual
  // sirve: se degrada a los datos que ya tenemos en vez de no devolver nada.
  const { data: tenant } = await supabase
    .from('tenants')
    .select('nombre, direccion')
    .eq('id', paciente.tenant_id)
    .maybeSingle()

  return {
    ok: true,
    turno: {
      citaId: cita.id,
      pacienteNombre: paciente.nombre,
      fechaHora: cita.fecha_hora,
      tratamiento: cita.tipo_tratamiento || 'Consulta',
      duracionMinutos: cita.duracion_minutos || 30,
      estado: cita.estado,
      clinica: tenant?.nombre || '',
      direccion: tenant?.direccion || '',
    },
  }
}
