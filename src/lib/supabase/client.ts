import { createBrowserClient } from '@supabase/ssr'

// Cliente singleton para el navegador.
//
// Antes cada llamada a createClient() instanciaba un cliente nuevo, y como en
// ~23 componentes se llama en el cuerpo del render, se recreaba en cada render
// (con su propio listener de auth, su propia conexión, etc.). Reusar una sola
// instancia por pestaña es el patrón recomendado por Supabase y elimina ese
// costo repetido sin cambiar la interfaz: createClient() se sigue llamando igual.

// Fábrica interna. Tipamos el singleton con ReturnType de ESTA función (una
// invocación real) y no con ReturnType<typeof createBrowserClient> (el tipo
// genérico), para conservar exactamente la misma inferencia de tipos que antes.
function newClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

let browserClient: ReturnType<typeof newClient> | undefined

export function createClient() {
  // En el servidor (SSR de un client component) nunca cacheamos: cada request
  // debe tener su propio cliente para no compartir estado entre usuarios.
  if (typeof window === 'undefined') {
    return newClient()
  }

  if (!browserClient) {
    browserClient = newClient()
  }
  return browserClient
}
