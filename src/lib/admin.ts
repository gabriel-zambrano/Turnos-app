import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────
// Verificación de super-admin de la PLATAFORMA (no de una clínica).
//
// Se resuelve siempre del lado del servidor y con service-role. El cliente
// nunca decide esto: solo consulta /api/admin/me para saber si mostrar el
// acceso al panel.
//
// Orden de resolución:
//   1. Fila en admin_users por id (columnas: id, email, creado_en)
//   2. Fila en admin_users por email
//   3. Variable de entorno ADMIN_EMAIL (último recurso)
// ─────────────────────────────────────────────────────────────

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''

function clienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function esAdminDePlataforma(
  userId: string,
  email?: string | null
): Promise<boolean> {
  const supabaseAdmin = clienteAdmin()

  const { data: porId } = await supabaseAdmin
    .from('admin_users')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (porId) return true

  if (email) {
    const { data: porEmail } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (porEmail) return true

    if (ADMIN_EMAIL) return email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  }

  return false
}
