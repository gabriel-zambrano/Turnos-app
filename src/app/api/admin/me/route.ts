import { NextResponse } from 'next/server'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'
import { esAdminDePlataforma } from '@/lib/admin'

/**
 * Dice si el usuario logueado es super-admin de la plataforma.
 * Lo usa el Sidebar para mostrar (o no) el acceso al panel /admin.
 * Nunca devuelve 403: responder `false` es una respuesta válida.
 */
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ esAdmin: false })
  }

  const esAdmin = await esAdminDePlataforma(user.id, user.email)
  return NextResponse.json({ esAdmin })
}
