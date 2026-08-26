import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ═══════════════════════════════════════════════════════════════════════════
// G-6 · Rutas cuya única defensa es RLS
//
// POR QUÉ EXISTE
//
//   Hay rutas que reciben un identificador del cliente y consultan la base sin
//   filtrar por tenant:
//
//     src/app/api/consentimientos/pdf/[id]/route.ts   L34
//       .from('consentimientos_firmados').select('*').eq('id', params.id)
//
//     src/app/api/facturacion/pdf/[id]/route.ts       L40
//       .from('facturas').select('*').eq('id', params.id)
//
//   HOY están protegidas. Usan `createClient()` de `@/lib/supabase/server`, que
//   instancia con la anon key y las cookies de sesión, así que la consulta corre
//   como `authenticated` y RLS filtra las filas de otros tenants. Un `id` ajeno
//   devuelve null y la ruta responde 404.
//
//   EL PROBLEMA es que esa defensa es de UNA SOLA CAPA y el código no lo dice.
//   Basta cambiar `createClient()` por un cliente con `SUPABASE_SERVICE_ROLE_KEY`
//   —algo que ya ocurrió en `equipo/miembros/route.ts` por buenas razones— para
//   que ambas se conviertan en IDOR abierto: `service_role` ignora RLS, y sin
//   filtro de tenant la consulta devuelve la factura o el consentimiento de
//   CUALQUIER clínica.
//
//   Ese cambio no rompería ningún test de los 674. Este archivo es el que falta.
//
// QUÉ NO HACE
//
//   No prueba el aislamiento en runtime: para eso hace falta HTTP con dos
//   tenants reales, y está anotado como pendiente en el runbook. Esto detecta
//   la regresión estructural, que es la vía realista por la que se rompería.
// ═══════════════════════════════════════════════════════════════════════════

const API = join(process.cwd(), 'src', 'app', 'api')

/**
 * Rutas que reciben un id del cliente y NO lo acotan por tenant en la consulta.
 * Su seguridad depende enteramente de que corran como `authenticated`.
 */
const DEPENDEN_DE_RLS = [
  'consentimientos/pdf/[id]',
  'facturacion/pdf/[id]',
] as const

function fuente(ruta: string): string {
  return readFileSync(join(API, ruta, 'route.ts'), 'utf8')
}

describe('G-6.1 · las rutas que dependen de RLS no usan service_role', () => {
  it.each(DEPENDEN_DE_RLS)('%s corre como `authenticated`, no como service_role', (ruta) => {
    const s = fuente(ruta)

    expect(
      /SERVICE_ROLE_KEY/.test(s),
      `/api/${ruta} usa SUPABASE_SERVICE_ROLE_KEY.\n\n` +
      `Esa ruta consulta por \`id\` SIN filtrar por tenant, y hoy la protege RLS.\n` +
      `Con service_role, RLS no se evalúa: devolvería el registro de CUALQUIER\n` +
      `clínica a cualquier usuario autenticado.\n\n` +
      `Si el cambio es necesario, agregá el filtro explícito de tenant a la\n` +
      `consulta ANTES de cambiar el cliente, y sacá la ruta de DEPENDEN_DE_RLS.`
    ).toBe(false)
  })

  it.each(DEPENDEN_DE_RLS)('%s usa el cliente de servidor con cookies', (ruta) => {
    const s = fuente(ruta)
    expect(
      /from '@\/lib\/supabase\/server'/.test(s),
      `/api/${ruta} dejó de importar el cliente de @/lib/supabase/server. ` +
      `Ese cliente es el que aplica la sesión del usuario y activa RLS.`
    ).toBe(true)
  })

  it.each(DEPENDEN_DE_RLS)('%s exige sesión antes de consultar', (ruta) => {
    const s = fuente(ruta)
    const iUser = s.indexOf('auth.getUser()')
    const iFrom = s.indexOf('.from(')
    expect(iUser, `/api/${ruta} no llama a auth.getUser()`).toBeGreaterThan(-1)
    expect(
      iUser,
      `/api/${ruta} consulta la base ANTES de verificar la sesión.`
    ).toBeLessThan(iFrom)
  })

  it.each(DEPENDEN_DE_RLS)('%s devuelve 404 cuando no encuentra la fila', (ruta) => {
    // Es el comportamiento correcto ante un id de otro tenant: RLS lo filtra,
    // la consulta vuelve vacía, y la ruta tiene que cortar ahí. Si en cambio
    // siguiera adelante con un objeto nulo, rompería con un 500 que filtra
    // información sobre la existencia del registro.
    const s = fuente(ruta)
    expect(
      /maybeSingle\(\)/.test(s),
      `/api/${ruta} no usa maybeSingle(): con .single() un id ajeno lanza ` +
      `excepción en vez de devolver null.`
    ).toBe(true)
    expect(
      /status:\s*404/.test(s),
      `/api/${ruta} no responde 404 ante una fila ausente.`
    ).toBe(true)
  })
})

describe('G-6.2 · el cliente de servidor sigue siendo el de sesión', () => {
  it('createClient() usa la anon key, no la service role', () => {
    // Si este archivo cambiara a service_role, TODAS las rutas que lo importan
    // dejarían de estar sujetas a RLS de una sola vez — incluidas las dos de
    // arriba. Es el punto único de falla de esta garantía.
    const s = readFileSync(join(process.cwd(), 'src', 'lib', 'supabase', 'server.ts'), 'utf8')
    expect(s).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
    expect(
      /SERVICE_ROLE_KEY/.test(s),
      'lib/supabase/server.ts pasó a usar service_role. Eso desactiva RLS ' +
      'para todas las rutas que lo importan.'
    ).toBe(false)
  })
})

describe('G-6 · cobertura del propio análisis', () => {
  // Sin esto, el archivo pasaría en verde si las rutas desaparecieran o
  // cambiaran de nombre — que es exactamente cuando más haría falta.

  it('las rutas vigiladas existen', () => {
    for (const ruta of DEPENDEN_DE_RLS) {
      expect(() => fuente(ruta), `no existe /api/${ruta}`).not.toThrow()
    }
  })

  it('el detector reconoce service_role cuando está presente', () => {
    // Una ruta que SÍ lo usa, como control positivo del detector.
    const s = readFileSync(join(API, 'equipo', 'miembros', 'route.ts'), 'utf8')
    expect(/SERVICE_ROLE_KEY/.test(s)).toBe(true)
  })

  it('no aparecieron rutas nuevas con id en el path sin revisar', () => {
    // Si alguien agrega otra ruta con [id] o [token], hay que decidir si su
    // defensa es RLS o una verificación explícita — y anotarlo acá.
    function rutas(dir: string, acc: string[] = []): string[] {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) rutas(p, acc)
        else if (e.name === 'route.ts' && /\[[^\]]+\]/.test(p)) {
          acc.push(p.split('/api/')[1].replace('/route.ts', ''))
        }
      }
      return acc
    }
    expect(rutas(API).sort()).toEqual([
      'consentimientos/firmar/[token]',
      'consentimientos/pdf/[id]',
      'facturacion/pdf/[id]',
      'paciente/[token]',
      'paciente/[token]/estado',
      'paciente/[token]/feedback',
      'reserva/[clinica]',
    ])
  })
})
