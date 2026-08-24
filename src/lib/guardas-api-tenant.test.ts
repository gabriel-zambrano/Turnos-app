import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// ─────────────────────────────────────────────────────────────
// G-4 · Guardas de autorización por tenant en las rutas de API.
//
// EL PROBLEMA QUE PREVIENEN
//
// El audit de IDOR sobre las 36 rutas no encontró un hueco explotable. Pero
// encontró una fragilidad: 17 rutas están protegidas por RLS, y lo están
// SOLO porque usan el cliente con cookies (rol `authenticated`). No validan
// tenant explícitamente.
//
// El caso concreto: /api/facturacion/pdf/[id] hace
//
//     supabase.from('facturas').select('*').eq('id', params.id)
//
// sin filtrar tenant. Hoy es seguro porque RLS filtra. Pero si alguien
// cambia `createClient()` por `supabaseAdmin` —por ejemplo "para traer más
// datos"— el IDOR se abre en el acto y ningún test lo detecta.
//
// Es el mismo patrón que produjo R-11: una protección que depende de un
// detalle que nadie mira.
//
// QUÉ HACEN ESTOS TESTS
//
// Leen el código fuente de cada `route.ts` y fallan si aparece el patrón
// peligroso. No reemplazan pensar ni prueban explotabilidad: avisan.
// ─────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, '..')
const DIR_API = join(RAIZ, 'app', 'api')

interface Ruta {
  /** Ruta pública, ej. "/api/facturacion/pdf/[id]" */
  nombre: string
  texto: string
  /** Parámetros dinámicos del path, ej. ["id"] */
  params: string[]
}

function recolectar(dir: string, acumulado: Ruta[] = []): Ruta[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) {
      recolectar(ruta, acumulado)
    } else if (entrada === 'route.ts') {
      const nombre = '/api' + dir.replace(DIR_API, '').replace(/\\/g, '/')
      acumulado.push({
        nombre: nombre === '/api' ? '/api' : nombre,
        texto: readFileSync(ruta, 'utf8'),
        params: Array.from(nombre.matchAll(/\[([a-zA-Z_]+)\]/g)).map(m => m[1]),
      })
    }
  }
  return acumulado
}

const RUTAS = recolectar(DIR_API)

// ── Detectores ──
//
// Cada uno responde una pregunta concreta sobre el código de la ruta.
// Se buscan formas, no palabras sueltas, para bajar los falsos positivos.

/** ¿Crea un cliente con la service_role key, que saltea RLS? */
function usaServiceRole(r: Ruta): boolean {
  return /SUPABASE_SERVICE_ROLE_KEY|supabaseAdmin|\badmin\(\)/.test(r.texto)
}

/** ¿Usa el cliente con cookies, que corre como `authenticated` y respeta RLS? */
function usaClienteAutenticado(r: Ruta): boolean {
  return /from\s+['"]@\/lib\/supabase\/server['"]/.test(r.texto)
}

/** ¿Verifica explícitamente que el usuario pertenezca al tenant del recurso? */
function verificaTenantUsers(r: Ruta): boolean {
  return /from\(\s*['"]tenant_users['"]\s*\)/.test(r.texto)
}

/**
 * ¿La autorización es un token criptográfico que llega por el path?
 *
 * En esas rutas el token ES la credencial: quien lo tiene está autorizado,
 * igual que un magic link. `pacientes.token` y `consentimientos_firmados.
 * token_firma` son uuid con 122 bits de entropía.
 */
function autorizaPorTokenEnPath(r: Ruta): boolean {
  if (!r.params.includes('token')) return false
  return /\.eq\(\s*['"](token|token_firma)['"]/.test(r.texto)
}

/** ¿La autorización es una firma o un secreto compartido? */
function autorizaPorFirmaOSecreto(r: Ruta): boolean {
  return /esCron\(|verifyMpSignature|new Webhook\(|SYNC_SHEET_SECRET|svix-signature/.test(r.texto)
}

/**
 * Rutas exentas de G-4.1, con el motivo escrito.
 *
 * La lista vive acá y no en un comentario dentro de cada ruta para no tocar
 * archivos funcionales. El test G-4.2 impide que se pudra: si una ruta deja
 * de necesitar la excepción, falla.
 */
const EXENTAS: Record<string, string> = {
  '/api/reserva/[clinica]':
    'Portal público de reservas. El parámetro es el slug del consultorio, no ' +
    'un identificador de recurso: sirve para RESOLVER el tenant, no para ' +
    'saltearlo. Todas las consultas posteriores filtran por el tenant.id que ' +
    'ese slug resolvió, así que el alcance es de un solo tenant por construcción.',
}

// ─────────────────────────────────────────────────────────────

describe('G-4.1 · service_role con identificador por path exige verificar el tenant', () => {
  it('ninguna ruta accede a un recurso por id con service_role sin verificar pertenencia', () => {
    const infractores = RUTAS.filter(r => {
      if (r.params.length === 0) return false          // sin id por path, no aplica
      if (!usaServiceRole(r)) return false             // RLS es la protección
      if (verificaTenantUsers(r)) return false         // verifica pertenencia
      if (autorizaPorTokenEnPath(r)) return false      // el token es la credencial
      if (autorizaPorFirmaOSecreto(r)) return false    // firma o secreto compartido
      if (r.nombre in EXENTAS) return false            // excepción documentada
      return true
    }).map(r => `${r.nombre} (params: ${r.params.join(', ')})`)

    expect(
      infractores,
      'Estas rutas usan service_role con un id del path y no verifican que el ' +
      'recurso pertenezca al tenant del usuario. Agregá la verificación contra ' +
      'tenant_users, o documentá la excepción en EXENTAS explicando por qué es segura.'
    ).toEqual([])
  })
})

describe('G-4.2 · la lista de excepciones no se pudre', () => {
  it('toda ruta exenta sigue existiendo', () => {
    const nombres = RUTAS.map(r => r.nombre)
    const fantasmas = Object.keys(EXENTAS).filter(e => !nombres.includes(e))
    expect(fantasmas, 'Rutas exentas que ya no existen: sacalas de EXENTAS').toEqual([])
  })

  it('toda ruta exenta sigue necesitando la excepción', () => {
    // Si una ruta dejó de usar service_role, o empezó a verificar tenant_users,
    // la excepción sobra. Dejarla puesta oculta el hecho de que ya es segura,
    // y peor: la seguiría cubriendo si mañana vuelve a ser insegura.
    const innecesarias = Object.keys(EXENTAS).filter(nombre => {
      const r = RUTAS.find(x => x.nombre === nombre)
      if (!r) return false
      return !usaServiceRole(r) || verificaTenantUsers(r)
    })
    expect(
      innecesarias,
      'Estas rutas ya no necesitan la excepción de G-4. Sacalas de EXENTAS.'
    ).toEqual([])
  })

  it('cada excepción tiene un motivo escrito, no un placeholder', () => {
    for (const [ruta, motivo] of Object.entries(EXENTAS)) {
      expect(motivo.length, `${ruta}: el motivo es demasiado corto para explicar nada`)
        .toBeGreaterThan(60)
    }
  })
})

describe('G-4.3 · mezclar clientes exige verificar pertenencia', () => {
  it('toda ruta que combine cliente autenticado y service_role verifica tenant_users', () => {
    // El patrón legítimo, y el que usan las 8 rutas que hoy mezclan clientes:
    //
    //   1. cliente con cookies → getUser() y consulta a tenant_users
    //   2. recién entonces, service_role para el trabajo privilegiado
    //
    // Mezclar no es el problema; mezclar SIN verificar pertenencia sí lo es.
    // Ahí `service_role` saltea RLS y nada acota el alcance al tenant del
    // usuario.
    //
    // NOTA SOBRE ESTA REGLA: la primera versión prohibía mezclar clientes sin
    // más. Marcó 8 rutas, y las 8 resultaron correctas — 100% de falsos
    // positivos. Cuando una regla marca solo falsos positivos, la que está
    // mal es la regla. Se reformuló después de verificar una por una que el
    // código era seguro, no al revés.
    const sinVerificar = RUTAS
      .filter(r => usaClienteAutenticado(r) && usaServiceRole(r) && !verificaTenantUsers(r))
      .filter(r => !autorizaPorTokenEnPath(r) && !autorizaPorFirmaOSecreto(r))
      .map(r => r.nombre)

    expect(
      sinVerificar,
      'Estas rutas usan service_role (RLS no aplica) después de autenticar, pero ' +
      'no verifican que el usuario pertenezca al tenant del recurso. Agregá la ' +
      'consulta a tenant_users antes de operar con service_role.'
    ).toEqual([])
  })

  it('el patrón correcto está efectivamente en uso', () => {
    // Control del propio test: si nadie mezcla clientes, la regla de arriba
    // pasa sin haber mirado nada.
    const mezclan = RUTAS.filter(r => usaClienteAutenticado(r) && usaServiceRole(r))
    expect(mezclan.length).toBeGreaterThan(0)
  })
})

describe('G-4.4 · las rutas de documentos por id no escalan privilegios', () => {
  it('las rutas que devuelven PDFs por id usan el cliente autenticado', () => {
    // Devuelven un documento completo a partir de un identificador. Son el
    // vector de IDOR más directo del sistema: sin RLS, pedir el PDF de una
    // factura ajena funcionaría.
    const rutasPdf = RUTAS.filter(r => /\/pdf\//.test(r.nombre) && r.params.includes('id'))

    expect(rutasPdf.length, 'Se esperaban rutas de PDF por id; si desaparecieron, revisá este test')
      .toBeGreaterThan(0)

    for (const r of rutasPdf) {
      expect(usaClienteAutenticado(r), `${r.nombre} debe usar el cliente con cookies para que RLS filtre`)
        .toBe(true)
      expect(usaServiceRole(r), `${r.nombre} NO debe usar service_role: abriría un IDOR`)
        .toBe(false)
    }
  })
})

describe('G-4 · cobertura del propio análisis', () => {
  it('encuentra todas las rutas de API', () => {
    // Si el recolector se rompe y devuelve pocas rutas, los tests de arriba
    // pasarían sin haber mirado nada. Este control lo impide.
    expect(RUTAS.length).toBeGreaterThanOrEqual(30)
  })

  it('detecta parámetros dinámicos del path', () => {
    const conParams = RUTAS.filter(r => r.params.length > 0)
    expect(conParams.length).toBeGreaterThanOrEqual(5)
  })

  it('los detectores reconocen los dos tipos de cliente', () => {
    expect(RUTAS.some(usaServiceRole)).toBe(true)
    expect(RUTAS.some(usaClienteAutenticado)).toBe(true)
  })
})
