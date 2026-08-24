import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function updateSession(
  request: NextRequest,
  response: NextResponse
) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // ───────────────────────────────────────────────────────────────────────────
  // `getUser()` valida el JWT contra el servidor de Supabase: es una llamada de
  // red, y antes se esperaba sin límite. Si Auth se demoraba, el middleware se
  // colgaba hasta que Vercel lo mataba a los 25 s y devolvía 504 — no una
  // página lenta: una caída.
  //
  // Con el race, a los 3 s se resuelve como "sin sesión" y la ruta privada
  // redirige al login. Es preferible pedirle a alguien que vuelva a entrar
  // antes que dejarlo 25 s frente a una pantalla en blanco.
  //
  // Falla CERRADO, y eso no debilita la seguridad: el redirect del middleware
  // es UX, no la barrera. Los datos los protege RLS en la base, que no depende
  // de esto.
  //
  // ⚠️  Honestidad sobre el alcance: en la caída del 24/08 el log de Vercel
  //     mostró `No outgoing requests`. El middleware se colgó ANTES de llegar
  //     acá, probablemente en el arranque en frío. Este timeout NO habría
  //     evitado esa caída puntual. Cubre el otro escenario —Auth lento— que
  //     también es real y hoy no tenía ninguna contención.
  // ───────────────────────────────────────────────────────────────────────────
  const TIMEOUT_MS = 3000

  const user = await Promise.race([
    supabase.auth.getUser().then(({ data }) => data.user),
    new Promise<null>(resolve => setTimeout(() => resolve(null), TIMEOUT_MS)),
  ]).catch(() => null)   // una excepción de red también cae a "sin sesión"

  return { response, user }
}
