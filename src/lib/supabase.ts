import { createClient } from '@supabase/supabase-js'
import type { Turno, TurnoFormData, TurnoEstado } from '@/lib/types'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Turnos ────────────────────────────────────────────────────
export async function crearTurno(data: TurnoFormData) {
  const { data: turno, error } = await supabase
    .from('turnos')
    .insert([data])
    .select()
    .single()
  if (error) throw error
  return turno as Turno
}

export async function getTurnos() {
  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .order('fecha', { ascending: true })
    .order('hora', { ascending: true })
  if (error) throw error
  return data as Turno[]
}

export async function getTurnosPorFecha(fecha: string): Promise<string[]> {
  const res = await fetch(`/api/turnos?fecha=${fecha}`)
  if (!res.ok) return []
  const { horarios } = await res.json()
  return horarios as string[]
}

export async function actualizarEstadoTurno(id: string, estado: TurnoEstado) {
  const { error } = await supabase
    .from('turnos')
    .update({ estado })
    .eq('id', id)
  if (error) throw error
}

// ── Admin auth helper ─────────────────────────────────────────
export async function signInAdmin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOutAdmin() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
