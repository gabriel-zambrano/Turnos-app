'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { FIDELIZACION_HABILITADA } from '@/lib/fidelizacion-flag'

const MSG_YA_PROCESADA = 'La cita ya fue procesada para acumulación de puntos.'

/**
 * Cierra una cita como "asistió" después de un cobro.
 *
 * Con FIDELIZACION_HABILITADA = false NO llama a fn_aprobar_asistencia:
 * solo marca la cita. Así ningún cobro vuelve a depender del ledger de
 * puntos, y cobrar una cita que ya estaba aprobada (segundo pago, pago
 * parcial, o cita marcada "asistió" antes) deja de tirar error.
 *
 * Con el flag en true, la RPC corre como antes, pero "ya procesada" se
 * trata como éxito: el resultado buscado (puntos acreditados una sola vez)
 * ya se cumplió, y devolver error inducía a reintentar el cobro.
 */
export async function aprobarAsistenciaAction(citaId: string) {
  const supabase = createClient()
  try {
    if (!FIDELIZACION_HABILITADA) {
      const { error } = await supabase
        .from('citas')
        .update({ estado: 'asistio' })
        .eq('id', citaId)
      if (error) return { success: false, error: error.message }
      revalidar()
      return { success: true, data: null }
    }

    const { data, error } = await supabase.rpc('fn_aprobar_asistencia', {
      p_cita_id: citaId,
    })

    if (error) {
      if (error.message?.includes(MSG_YA_PROCESADA)) {
        revalidar()
        return { success: true, data: null }
      }
      return { success: false, error: error.message }
    }

    revalidar()
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado' }
  }
}

function revalidar() {
  revalidatePath(`/pacientes`)
  revalidatePath(`/agenda`)
  revalidatePath(`/dashboard`)
}

export async function registrarInasistenciaAction(citaId: string, estado: 'ausente' | 'cancelado') {
  const supabase = createClient()
  try {
    const { data, error } = await supabase.rpc('fn_registrar_inasistencia', {
      p_cita_id: citaId,
      p_estado: estado,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/pacientes`)
    revalidatePath(`/agenda`)
    revalidatePath(`/dashboard`)

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado' }
  }
}

export async function canjearPremioAction(pacienteId: string, premioId: string) {
  const supabase = createClient()
  try {
    const { data, error } = await supabase.rpc('fn_canjear_premio', {
      p_paciente_id: pacienteId,
      p_premio_id: premioId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/pacientes`)
    revalidatePath(`/pacientes/${pacienteId}`)

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado' }
  }
}

export async function ajustarPuntosManualAction(
  pacienteId: string,
  puntos: number,
  tipo: 'ajuste_manual' | 'ajuste_reverso',
  nota: string
) {
  const supabase = createClient()
  try {
    const { data, error } = await supabase.rpc('fn_ajustar_puntos_manual', {
      p_paciente_id: pacienteId,
      p_puntos_afectados: puntos,
      p_tipo_movimiento: tipo,
      p_nota: nota,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/pacientes`)
    revalidatePath(`/pacientes/${pacienteId}`)

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado' }
  }
}
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function aprobarAsistenciaAction(citaId: string) {
  const supabase = createClient()
  try {
    const { data, error } = await supabase.rpc('fn_aprobar_asistencia', {
      p_cita_id: citaId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/pacientes`)
    revalidatePath(`/agenda`)
    revalidatePath(`/dashboard`)

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado' }
  }
}

export async function registrarInasistenciaAction(citaId: string, estado: 'ausente' | 'cancelado') {
  const supabase = createClient()
  try {
    const { data, error } = await supabase.rpc('fn_registrar_inasistencia', {
      p_cita_id: citaId,
      p_estado: estado,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/pacientes`)
    revalidatePath(`/agenda`)
    revalidatePath(`/dashboard`)

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado' }
  }
}

export async function canjearPremioAction(pacienteId: string, premioId: string) {
  const supabase = createClient()
  try {
    const { data, error } = await supabase.rpc('fn_canjear_premio', {
      p_paciente_id: pacienteId,
      p_premio_id: premioId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/pacientes`)
    revalidatePath(`/pacientes/${pacienteId}`)

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado' }
  }
}

export async function ajustarPuntosManualAction(
  pacienteId: string,
  puntos: number,
  tipo: 'ajuste_manual' | 'ajuste_reverso',
  nota: string
) {
  const supabase = createClient()
  try {
    const { data, error } = await supabase.rpc('fn_ajustar_puntos_manual', {
      p_paciente_id: pacienteId,
      p_puntos_afectados: puntos,
      p_tipo_movimiento: tipo,
      p_nota: nota,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/pacientes`)
    revalidatePath(`/pacientes/${pacienteId}`)

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error inesperado' }
  }
}
