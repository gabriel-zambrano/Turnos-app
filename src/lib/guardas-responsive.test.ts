import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// ─────────────────────────────────────────────────────────────
// Guardas contra volver a decidir el layout en JavaScript.
//
// El patrón que estos tests persiguen es este:
//
//   const isMobile = useIsMobile()          // window.innerWidth en un effect
//   <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width)' }}>
//
// El servidor no conoce el ancho de la pantalla, así que `isMobile` vale
// SIEMPRE false en la primera pintura. En el teléfono eso se veía como un
// salto del contenido en cada carga: primero el layout de escritorio, con su
// margen de 240px, y recién después el de móvil.
//
// Estaba copiado en unas veinte pantallas, así que agregar una nueva
// significaba acordarse del conjuro; olvidarlo se veía como contenido tapado
// por el menú. Ahora lo resuelve `.app-main` en CSS, vía <AppShell>.
//
// Estos tests leen el código fuente y fallan si el patrón vuelve. No
// reemplazan pensar, pero avisan.
// ─────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, '..')

function archivosFuente(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'node_modules' || entrada === '.next') continue
      archivosFuente(ruta, acumulado)
    } else if (/\.tsx$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

const FUENTES = archivosFuente(RAIZ).map(ruta => ({
  ruta: ruta.replace(RAIZ + '/', ''),
  texto: readFileSync(ruta, 'utf8'),
}))

/** Quita comentarios de línea y de bloque: ahí el patrón se cita a propósito. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Las pantallas del consultorio. El portal del paciente no lleva menú. */
const PANTALLAS_CON_MENU = /^app\/(?!paciente\/|reserva\/|firmar\/|t\/|agendar\/|api\/)/

/**
 * El desplazamiento del contenido por el ancho del menú, decidido en JS.
 *
 * Pide el ancho ademas de `isMobile`: un `marginLeft: isMobile ? 0 : 46` es
 * una sangría dentro de una lista y no tiene nada que ver con el armazón.
 * Confundirlos hacía que la guarda gritara por algo legítimo, y una guarda que
 * grita de más termina desactivada.
 */
const PATRON_ARMAZON = /marginLeft:\s*isMobile[^,\n]*(--sidebar-width|240)/

/**
 * Las que faltan migrar.
 *
 * La lista solo puede achicarse. Está acá y no como un `skip` para que se vea
 * cuánto queda y para que una pantalla nueva no pueda sumarse: si aparece un
 * archivo que no está en esta lista, el test falla.
 *
 * Se migran de a poco porque son las pantallas grandes —agenda tiene 1.974
 * líneas y la ficha del paciente 2.164— y cada una hay que mirarla a ojo
 * después.
 */
const PENDIENTES = [
  'app/agenda/page.tsx',
  'app/dashboard/page.tsx',
  'app/pacientes/[id]/page.tsx',
  'app/pacientes/page.tsx',
]

describe('el desplazamiento del contenido no se calcula en JavaScript', () => {
  it('ninguna pantalla nueva usa marginLeft condicional por isMobile', () => {
    const infractores = FUENTES
      .filter(f => PATRON_ARMAZON.test(sinComentarios(f.texto)))
      .map(f => f.ruta)
      .filter(ruta => !PENDIENTES.includes(ruta))

    // Va <AppShell>, que apoya el desplazamiento en --sidebar-width desde CSS.
    expect(infractores).toEqual([])
  })

  it('ninguna pantalla nueva monta su propio armazón de menú y <main>', () => {
    // Un <main> junto a un <Sidebar/> es el armazón copiado a mano. El único
    // lugar donde tienen que convivir es AppShell.
    const infractores = FUENTES
      .filter(f => {
        if (f.ruta === 'components/AppShell.tsx') return false
        const t = sinComentarios(f.texto)
        return /<Sidebar[\s/>]/.test(t) && /<main[\s>]/.test(t)
      })
      .map(f => f.ruta)
      .filter(ruta => !PENDIENTES.includes(ruta))

    expect(infractores).toEqual([])
  })

  it('la lista de pendientes no tiene fantasmas', () => {
    // Si una pantalla ya se migró, hay que sacarla de PENDIENTES. Si no, la
    // lista deja de contar lo que falta y las guardas de arriba se aflojan
    // solas sin que nadie se entere.
    const siguenSucias = FUENTES
      .filter(f => PATRON_ARMAZON.test(sinComentarios(f.texto)))
      .map(f => f.ruta)

    expect(PENDIENTES.filter(p => !siguenSucias.includes(p))).toEqual([])
  })
})

describe('AppShell existe y apoya el layout en CSS', () => {
  it('usa las clases y no estilos inline con el ancho del menú', () => {
    const shell = FUENTES.find(f => f.ruta === 'components/AppShell.tsx')
    expect(shell).toBeDefined()
    expect(shell!.texto).toMatch(/className="app-shell"/)
    expect(shell!.texto).toMatch(/app-main/)
    expect(sinComentarios(shell!.texto)).not.toMatch(/marginLeft/)
  })

  it('las clases están definidas en globals.css', () => {
    const css = readFileSync(join(RAIZ, 'app/globals.css'), 'utf8')
    for (const clase of ['.app-shell', '.app-main', '.app-content', '.app-toast']) {
      expect(css).toContain(clase)
    }
    // El desplazamiento tiene que salir de la variable, no de un número suelto.
    // Se lee el bloque entero de la regla en vez de una ventana de caracteres:
    // agregar un comentario adentro no debería hacer fallar el test.
    const regla = css.match(/\.app-main\s*\{([\s\S]*?)\}/)
    expect(regla).not.toBeNull()
    expect(regla![1]).toMatch(/margin-left:\s*var\(--sidebar-width/)
  })
})

describe('las pantallas migradas ya no miden la ventana para ubicarse', () => {
  it('las que usan AppShell no le pasan el ancho por prop', () => {
    const conShell = FUENTES.filter(f =>
      PANTALLAS_CON_MENU.test(f.ruta) && /<AppShell/.test(f.texto)
    )
    // Si alguna vuelve a necesitarlo, la decisión es de CSS y no de la página.
    expect(conShell.length).toBeGreaterThan(0)
    for (const f of conShell) {
      expect(f.texto, f.ruta).not.toMatch(/<AppShell[^>]*isMobile/)
    }
  })
})
