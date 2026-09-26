import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ═══════════════════════════════════════════════════════════════════════════
// Guardas del envío de recordatorios
//
// ORIGEN
//
//   Un paciente no recibió su recordatorio. La auditoría encontró tres
//   defectos, y ninguno se manifestaba como error: los tres informaban éxito.
//
//   1. Un paciente sin email devolvía `{ skip: true }`. `Promise.allSettled`
//      lo reporta como `fulfilled`, así que se contaba como ENVIADO. Encima no
//      escribía fila en `recordatorios_log`. La respuesta decía "enviados: 12"
//      con 9 salidos, y la métrica de recordatorios por cita daba 1.00 porque
//      promediaba únicamente las citas que sí habían generado una fila.
//      En producción: 25 de 222 pacientes sin email, 1 de cada 9.
//
//   2. El `select` de `tenants` pedía `logoUrl, primaryColor, …` en camelCase.
//      Las columnas reales están en minúscula y PostgREST distingue mayúsculas:
//      la consulta devolvía error 42703. Como el código no desestructuraba
//      `error`, `activeTenants` quedaba null y caía al tenant por defecto —
//      sin branding y sin dominio propio, anulando en silencio el arreglo de
//      `urlDeClinica`. Con dos clínicas, la segunda se quedaba sin nada.
//
//   3. `Promise.allSettled` sobre todas las citas disparaba los envíos en
//      paralelo contra un límite de 10 solicitudes por segundo.
//
// QUÉ FIJA ESTE ARCHIVO
//
//   Que los tres arreglos sigan en pie. Es análisis estático: verifica la
//   forma del código, no su comportamiento en runtime. Alcanza porque las tres
//   regresiones son estructurales — se reintroducen editando estas líneas.
// ═══════════════════════════════════════════════════════════════════════════

const RUTA = join(process.cwd(), 'src', 'app', 'api', 'send-recordatorios', 'route.ts')
const BRIEFING = join(process.cwd(), 'src', 'app', 'api', 'daily-briefing', 'route.ts')

const fuente = () => readFileSync(RUTA, 'utf8')

describe('R-1 · los pacientes sin email dejan rastro', () => {
  it('registra el salto en recordatorios_log con estado "omitido"', () => {
    const s = fuente()
    expect(
      /estado_envio:\s*'omitido'/.test(s),
      'El salto por falta de email ya no escribe una fila "omitido" en ' +
      'recordatorios_log. Sin esa fila el fallo vuelve a ser invisible: ' +
      'nadie puede saber que ese paciente no recibió nada.'
    ).toBe(true)
  })

  it('NO devuelve el marcador viejo `{ skip: true }`', () => {
    const s = fuente()
    expect(
      /return\s*\{\s*skip:\s*true\s*\}/.test(s),
      'Volvió `return { skip: true }`. Promise.allSettled lo reporta como ' +
      'fulfilled y el conteo lo suma como enviado.'
    ).toBe(false)
  })

  it('cuenta los omitidos aparte de los enviados', () => {
    const s = fuente()
    expect(/totalOmitidos/.test(s), 'Desapareció el contador totalOmitidos.').toBe(true)
    expect(
      /omitidos:\s*totalOmitidos/.test(s),
      'La respuesta ya no informa `omitidos`. Si se suman a `enviados`, ' +
      'volvemos al defecto original: informar éxito sobre un envío que no ocurrió.'
    ).toBe(true)
  })

  it('el conteo distingue los tres desenlaces', () => {
    const s = fuente()
    // Sin esta distinción, `omitido` volvería a caer del lado de los enviados.
    expect(/r\.value === 'omitido'/.test(s)).toBe(true)
    expect(/r\.status === 'rejected'/.test(s)).toBe(true)
  })
})

describe('R-2 · las columnas de tenants se piden como existen', () => {
  it('no pide columnas en camelCase', () => {
    const s = fuente()
    for (const col of ['logoUrl', 'primaryColor', 'secondaryColor', 'accentColor', 'whatsappTemplate']) {
      expect(
        new RegExp(`select\\([^)]*${col}`).test(s),
        `El select volvió a pedir "${col}". En la base la columna es ` +
        `"${col.toLowerCase()}" y PostgREST distingue mayúsculas: la consulta ` +
        `falla con 42703, activeTenants queda null y el envío cae al tenant ` +
        `por defecto sin branding ni dominio propio.`
      ).toBe(false)
    }
  })

  it('pide las columnas en minúscula', () => {
    const s = fuente()
    expect(/logourl/.test(s)).toBe(true)
    expect(/accentcolor/.test(s)).toBe(true)
  })

  it('mira el error de la consulta de tenants', () => {
    const s = fuente()
    expect(
      /error:\s*errorTenants/.test(s),
      'Volvió a desestructurarse solo `data`. Ese es el motivo por el que el ' +
      'defecto anterior sobrevivió meses: el fallback al tenant por defecto ' +
      'se activaba sin que nada lo dijera.'
    ).toBe(true)
  })

  it('el fallback avisa en lugar de activarse en silencio', () => {
    const s = fuente()
    expect(
      /console\.error\([^)]*DEFAULT_TENANT_ID|DEFAULT_TENANT_ID[\s\S]{0,400}console\.error/.test(s),
      'El fallback a DEFAULT_TENANT_ID volvió a ser silencioso. Con más de ' +
      'una clínica, procesar solo la de por defecto deja al resto sin avisos.'
    ).toBe(true)
  })
})

describe('R-3 · los envíos salen en tandas, no todos juntos', () => {
  it('define un tamaño de tanda dentro del límite de Resend', () => {
    const s = fuente()
    const m = s.match(/const TANDA_TAM\s*=\s*(\d+)/)
    expect(m, 'Desapareció TANDA_TAM.').not.toBeNull()
    const tam = Number(m![1])
    expect(
      tam <= 10,
      `TANDA_TAM es ${tam}. Resend corta en 10 solicitudes por segundo por ` +
      `equipo, y esa cuota se comparte con confirmaciones, facturas y briefing.`
    ).toBe(true)
  })

  it('pausa entre tandas', () => {
    const s = fuente()
    const m = s.match(/const PAUSA_MS\s*=\s*(\d+)/)
    expect(m, 'Desapareció PAUSA_MS.').not.toBeNull()
    expect(
      Number(m![1]) >= 1000,
      'La pausa bajó de un segundo. El límite de Resend es por ventana de ' +
      'un segundo: pausar menos no evita el 429.'
    ).toBe(true)
    expect(/await dormir\(PAUSA_MS\)/.test(s)).toBe(true)
  })

  it('recorre las citas por tandas y no de una sola vez', () => {
    const s = fuente()
    expect(
      /for\s*\(let i = 0; i < citas\.length; i \+= TANDA_TAM\)/.test(s),
      'Volvió el envío en un solo Promise.allSettled sobre todas las citas.'
    ).toBe(true)
    expect(
      /Promise\.allSettled\(\s*citas\.map/.test(s),
      'Hay un Promise.allSettled directo sobre `citas`: eso dispara todos los ' +
      'envíos a la vez, que es justamente lo que produce los 429.'
    ).toBe(false)
  })

  it('declara maxDuration, porque enviar en tandas tarda más', () => {
    const s = fuente()
    expect(
      /export const maxDuration/.test(s),
      'Sin maxDuration explícito, una clínica con muchos turnos se corta a la mitad.'
    ).toBe(true)
  })
})

describe('R-4 · el briefing avisa de los turnos sin recordatorio', () => {
  it('consulta los turnos de mañana con su paciente', () => {
    const s = readFileSync(BRIEFING, 'utf8')
    expect(/citasManana/.test(s), 'Desapareció la consulta de turnos de mañana.').toBe(true)
    expect(/pacientes\(nombre, email, telefono\)/.test(s)).toBe(true)
  })

  it('filtra los que no tienen email', () => {
    const s = readFileSync(BRIEFING, 'utf8')
    expect(/sinEmail/.test(s)).toBe(true)
    expect(/!c\.pacientes\?\.email/.test(s)).toBe(true)
  })

  it('incluye el teléfono, que es la única vía que queda', () => {
    const s = readFileSync(BRIEFING, 'utf8')
    expect(
      /pacientes\?\.telefono/.test(s),
      'El aviso ya no muestra el teléfono. Sin él no es accionable: el punto ' +
      'del aviso es poder llamar a esa persona esta noche.'
    ).toBe(true)
  })
})
