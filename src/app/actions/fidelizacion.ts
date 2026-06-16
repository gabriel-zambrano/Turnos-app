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
