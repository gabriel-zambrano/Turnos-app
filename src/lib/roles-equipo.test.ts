import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validarInvitacion, ROLES_EQUIPO } from './roles-equipo'

// ═══════════════════════════════════════════════════════════════════════════
// R-2 · Escalada admin → owner
//
// Hasta el 22/08/2026, `/api/equipo/invitar` insertaba el rol tal como venía
// del cuerpo del request. Un `admin` podía invitar a alguien como `owner`.
//
// Los tests de "estado previo" al final de este archivo son los que le dan
// sentido a todo lo demás: prueban que el defecto EXISTÍA. Sin ellos, los
// otros verificarían una restricción que quizá siempre estuvo.
// ═══════════════════════════════════════════════════════════════════════════

describe('R-2 · los 6 casos autorizados', () => {
  it('1 · admin → owner = DENEGADO', () => {
    const r = validarInvitacion('admin', 'owner')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(403)
    expect(r.error).toMatch(/propietario/i)
  })

  it('2 · owner → owner = permitido', () => {
    // Decisión provisional del owner. DO-6.2 propone sacarlo de la invitación
    // normal y moverlo a una transferencia explícita — pero DO-6 está
    // congelado, y este bloque no lo anticipa.
    expect(validarInvitacion('owner', 'owner')).toEqual({ ok: true, rol: 'owner' })
  })

  it('3 · admin → admin = se mantiene el comportamiento actual', () => {
    // Prohibirlo es DO-6.2. Este cambio NO lo toca: cerrar R-2 y decidir la
    // jerarquía son dos cosas distintas y se pidieron separadas.
    expect(validarInvitacion('admin', 'admin')).toEqual({ ok: true, rol: 'admin' })
  })

  it('4 · admin → rol inválido = DENEGADO', () => {
    for (const basura of ['superadmin', 'Admin', 'OWNER', 'odontologo', 'pepe', 'staff ext']) {
      const r = validarInvitacion('admin', basura)
      expect(r.ok, `"${basura}" fue aceptado`).toBe(false)
      if (!r.ok) expect(r.status).toBe(400)
    }
  })

  it('4b · `Admin` con mayúscula se rechaza, no se normaliza', () => {
    // Normalizar a minúsculas sería cómodo y sería un error: si el cliente
    // manda algo que no está en el catálogo, quiero saberlo, no adivinarlo.
    expect(validarInvitacion('owner', 'Admin').ok).toBe(false)
  })

  it('5 · role vacío o undefined → `staff`, explícito', () => {
    for (const vacio of [undefined, null, '', '   ']) {
      expect(validarInvitacion('admin', vacio), `con ${JSON.stringify(vacio)}`)
        .toEqual({ ok: true, rol: 'staff' })
    }
  })

  it('5b · un tipo que no es string se rechaza, no se convierte', () => {
    // String({}) === '[object Object]'. Convertir enmascararía un cliente roto.
    for (const raro of [42, {}, [], true, { role: 'owner' }]) {
      const r = validarInvitacion('admin', raro)
      expect(r.ok, `${JSON.stringify(raro)} fue aceptado`).toBe(false)
      if (!r.ok) expect(r.status).toBe(400)
    }
  })

  it('6 · tenant incorrecto = DENEGADO', () => {
    // La ruta consulta tenant_users filtrando por user_id Y tenant_id. Si el
    // tenantId del body no es del usuario, no hay fila y llega null.
    const r = validarInvitacion(null, 'staff')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.error).toMatch(/permisos/i)
    }
    expect(validarInvitacion(undefined, 'staff').ok).toBe(false)
  })

  it('6b · staff no puede invitar, ni siquiera a otro staff', () => {
    expect(validarInvitacion('staff', 'staff').ok).toBe(false)
    // Y un rol que no existe tampoco habilita nada: falla cerrado.
    expect(validarInvitacion('odontologo', 'staff').ok).toBe(false)
  })
})

describe('R-2 · el catálogo no se estira sin querer', () => {
  it('sigue teniendo exactamente los 3 roles que el sistema entiende', () => {
    // `odontologo` NO está a propósito: no aparece en ninguna línea del código
    // ni del esquema. Sumarlo pertenece a DO-6. Si este test se pone rojo,
    // alguien amplió el catálogo — y hay que confirmar que los controles que
    // leen `role` reconozcan el valor nuevo.
    expect([...ROLES_EQUIPO]).toEqual(['owner', 'admin', 'staff'])
  })

  it('el orden de validación rechaza el rol inválido antes que la escalada', () => {
    // Un rol inexistente da 400 (petición mal formada), no 403 (prohibido).
    // La distinción importa: 403 le confirmaría al cliente que el rol existe.
    const r = validarInvitacion('admin', 'superowner')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })
})

describe('R-2 · la ruta usa el rol validado, no el crudo', () => {
  const RUTA = join(process.cwd(), 'src', 'app', 'api', 'equipo', 'invitar', 'route.ts')
  const fuente = readFileSync(RUTA, 'utf8')

  it('ningún insert usa `role` del body', () => {
    // Son DOS inserts —usuario nuevo y usuario ya existente— con indentación
    // distinta. Un reemplazo descuidado corrige uno solo y deja el otro
    // abierto, que es exactamente el agujero original.
    expect(
      /role:\s*role\b/.test(fuente),
      'Algún insert sigue usando el `role` crudo del request'
    ).toBe(false)
    expect((fuente.match(/role:\s*rolAsignado/g) || []).length).toBe(2)
  })

  it('la validación ocurre antes de inviteUserByEmail', () => {
    // Si validara después, el mail ya salió y el usuario ya existe en Auth:
    // el rechazo dejaría basura que nadie limpia.
    // Se busca la LLAMADA (`auth.admin.inviteUserByEmail`), no el nombre suelto:
    // los comentarios de la ruta mencionan `inviteUserByEmail` al explicar por
    // qué la validación va antes, y un `indexOf` ingenuo encuentra el comentario
    // primero y falla contra código correcto. La primera versión de este test
    // se rompió exactamente así.
    const iValida = fuente.indexOf('validarInvitacion(')
    const iInvita = fuente.indexOf('auth.admin.inviteUserByEmail')
    expect(iValida, 'no se llama a validarInvitacion').toBeGreaterThan(-1)
    expect(iInvita, 'no se encontró la llamada a inviteUserByEmail').toBeGreaterThan(-1)
    expect(iValida, 'la validación quedó DESPUÉS de enviar la invitación').toBeLessThan(iInvita)
  })
})

describe('R-2 · estado previo — estos prueban que el defecto existía', () => {
  it('el código anterior aceptaba `owner` de un admin sin mirarlo', () => {
    // Reproducción literal de lo que hacía la ruta antes:
    //     .insert({ ..., role: role || 'staff' })
    const comportamientoAnterior = (rolPedido: unknown) => rolPedido || 'staff'

    expect(comportamientoAnterior('owner')).toBe('owner')      // ← la escalada
    expect(comportamientoAnterior('superadmin')).toBe('superadmin')
    expect(comportamientoAnterior('')).toBe('staff')

    // Y lo mismo, ahora:
    expect(validarInvitacion('admin', 'owner').ok).toBe(false)
    expect(validarInvitacion('admin', 'superadmin').ok).toBe(false)
  })
})
