import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// ─────────────────────────────────────────────────────────────
// Guardas contra los cruces entre clínicas.
//
// En una sola jornada aparecieron cuatro bugs del mismo origen: código que
// confunde "la plataforma" con "la clínica". Ninguno era un descuido tonto;
// todos pasaban desapercibidos porque hoy hay un solo consultorio real y los
// dos dominios coinciden. Se ven recién con el segundo cliente, que es el peor
// momento para descubrirlos.
//
// Estos tests leen el código fuente y fallan si vuelve a aparecer alguno de
// esos patrones. No reemplazan pensar, pero avisan.
// ─────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, '..')

function archivosFuente(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'node_modules' || entrada === '.next') continue
      archivosFuente(ruta, acumulado)
    } else if (/\.(ts|tsx)$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
      acumulado.push(ruta)
    }
  }
  return acumulado
}

const FUENTES = archivosFuente(RAIZ).map(ruta => ({
  ruta: ruta.replace(RAIZ + '/', ''),
  texto: readFileSync(ruta, 'utf8'),
}))

/** Archivos que le mandan algo a un paciente (mail, WhatsApp, link copiado). */
const TOCAN_AL_PACIENTE = /(reserva|recordatorio|confirmar-turno|cuidados|consentimientos)/

describe('los links que recibe un paciente salen del dominio de su clínica', () => {
  it('ningún archivo de cara al paciente arma URLs con el dominio de la plataforma', () => {
    const infractores = FUENTES.filter(f =>
      TOCAN_AL_PACIENTE.test(f.ruta) &&
      /\$\{APP_URL\}|\$\{process\.env\.NEXT_PUBLIC_APP_URL\}/.test(f.texto)
    ).map(f => f.ruta)

    // APP_URL es el dominio de la PLATAFORMA. Para algo que ve un paciente va
    // urlDeClinica(tenant) —servidor— o urlPublicaDeClinica(tenant) —navegador—.
    expect(infractores).toEqual([])
  })

  it('las páginas del consultorio no arman links de paciente con el origen del navegador', () => {
    // window.location.origin es el dominio desde el que navega el odontólogo.
    // Hoy coincide con el de su clínica; cuando la plataforma tenga el suyo,
    // dejaría de coincidir y los links saldrían con la marca equivocada.
    const infractores = FUENTES.filter(f =>
      /\$\{window\.location\.origin\}\/(paciente|firmar|reserva)\//.test(f.texto)
    ).map(f => f.ruta)

    expect(infractores).toEqual([])
  })
})

describe('una sola lista de rutas públicas', () => {
  it('el middleware y el gate de suscripción no definen la suya', () => {
    // Estaban duplicadas y se desincronizaron: /reserva era pública para el
    // middleware pero no para el gate, así que un paciente veía la pantalla de
    // facturación del consultorio.
    const conListaPropia = FUENTES.filter(f =>
      /(middleware\.ts|SubscriptionGate\.tsx)$/.test(f.ruta) &&
      /(publicPrefixes|EXEMPT_PREFIXES)\s*=\s*\[/.test(f.texto)
    ).map(f => f.ruta)

    expect(conListaPropia).toEqual([])
  })

  it('los dos leen de lib/rutas-publicas', () => {
    // Coincidencia exacta: hay otro middleware.ts en lib/supabase/ que no
    // tiene nada que ver con las rutas públicas.
    for (const nombre of ['middleware.ts', 'components/SubscriptionGate.tsx']) {
      const archivo = FUENTES.find(f => f.ruta === nombre)
      expect(archivo, `falta ${nombre}`).toBeDefined()
      expect(archivo!.texto).toMatch(/rutas-publicas/)
    }
  })
})

describe('toda consulta a datos de una clínica filtra por tenant_id', () => {
  it('ningún endpoint con service-role lee citas o pacientes sin acotar', () => {
    // El foco es el cliente service-role, que ignora RLS: sin filtro devuelve
    // las filas de TODOS los consultorios. Con el cliente de sesión, en cambio,
    // RLS ya acota solo, así que no hace falta el filtro explícito.
    const sospechosos: string[] = []

    for (const f of FUENTES) {
      if (!f.ruta.startsWith('app/api/')) continue
      if (!/SUPABASE_SERVICE_ROLE_KEY/.test(f.texto)) continue

      for (const tabla of ['citas', 'pacientes']) {
        const consultas = f.texto.split(`.from('${tabla}')`).slice(1)
        for (const consulta of consultas) {
          const bloque = consulta.slice(0, 400)
          // Vale acotar por clínica, por paciente concreto o por token: en los
          // tres casos la consulta no puede cruzar a otro consultorio.
          const acota = /tenant_id|paciente_id|\.eq\('id'|\.eq\('token'|\.insert|\.update|\.delete/.test(bloque)
          if (!acota) sospechosos.push(`${f.ruta} → ${tabla}`)
        }
      }
    }

    expect(sospechosos).toEqual([])
  })
})

describe('el estado de suscripción no se inventa', () => {
  it('un dato ausente no se rellena con un estado que corta el acceso', () => {
    // La vista pública no expone subscription_status. Rellenar ese hueco con
    // 'inactive' le mostraba "suscripción vencida" a los pacientes de una
    // clínica que estaba al día.
    const contexto = FUENTES.find(f => f.ruta.endsWith('components/TenantContext.tsx'))
    expect(contexto).toBeDefined()
    expect(contexto!.texto).not.toMatch(/subscription_status\s*\|\|\s*'inactive'/)
  })
})
