/**
 * R-2 · Validación de rol al invitar a alguien al equipo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE CIERRA
 *
 *   `/api/equipo/invitar` leía `role` del cuerpo del request y lo insertaba
 *   tal cual:
 *
 *       const { email, role, tenantId } = await req.json()
 *       ...
 *       .insert({ tenant_id, user_id, role: role || 'staff' })
 *
 *   Sin validación. Un `admin` autenticado podía invitar a alguien como
 *   `owner` y escalar privilegios — eso es R-2, confirmado en el código, no
 *   inferido. Y podía guardar cualquier cadena: un rol que ningún control
 *   reconoce deja a la persona sin permisos, en silencio.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ **NO** ES ESTO
 *
 *   No es DO-6. No hay tabla de roles, ni jerarquía numérica, ni multirol,
 *   ni `puede_otorgar_rol()`. Esto cierra la escalada y la inyección con el
 *   catálogo que el sistema ya entiende hoy, y nada más.
 *
 *   `odontologo` NO está en el catálogo a propósito: no aparece en ninguna
 *   línea del código ni del esquema. Agregarlo es parte de DO-6 y es una
 *   palabra en la constante de abajo.
 *
 *   `admin → admin` sigue permitido. Prohibirlo es DO-6.2 y está congelado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UNA FUNCIÓN PURA
 *
 *   Para poder probarla sin mockear Supabase, cookies ni Next. La ruta hace
 *   la parte que sí necesita la base —verificar que quien invita pertenezca
 *   a ESE tenant— y le pasa el rol resultante a esta función.
 */

/** Los únicos roles que el sistema entiende hoy. Verificado en `src/` y `supabase/`. */
export const ROLES_EQUIPO = ['owner', 'admin', 'staff'] as const
export type RolEquipo = typeof ROLES_EQUIPO[number]

/** Los únicos roles que pueden invitar. Espeja la guarda que ya existía en la ruta. */
const PUEDEN_INVITAR: readonly string[] = ['owner', 'admin']

export type ResultadoInvitacion =
  | { ok: true; rol: RolEquipo }
  | { ok: false; status: 400 | 403; error: string }

/**
 * Decide si una invitación es válida.
 *
 * @param rolDelQueInvita  rol del usuario autenticado EN ESE TENANT. La ruta
 *                         lo obtiene de `tenant_users` filtrando por
 *                         `user_id` y `tenant_id`; si no pertenece, llega
 *                         `null` y esto lo rechaza.
 * @param rolPedido        valor crudo del cuerpo del request. Puede ser
 *                         cualquier cosa: `undefined`, un número, un objeto.
 *
 * Falla cerrado: todo lo que no reconoce, lo rechaza.
 */
export function validarInvitacion(
  rolDelQueInvita: string | null | undefined,
  rolPedido: unknown
): ResultadoInvitacion {
  // 1 · Quien invita tiene que pertenecer al tenant y poder invitar.
  //     `null` llega cuando la consulta a tenant_users no encontró fila:
  //     el tenantId del body no es de este usuario.
  if (!rolDelQueInvita || !PUEDEN_INVITAR.includes(rolDelQueInvita)) {
    return {
      ok: false,
      status: 403,
      error: 'No tenés permisos para invitar al equipo de esta clínica',
    }
  }

  // 2 · Normalizar. `undefined`, cadena vacía o sólo espacios → 'staff',
  //     que es el mínimo y el comportamiento que la ruta ya tenía.
  //     Cualquier tipo que no sea string se rechaza en el paso 3: no se
  //     convierte con String(), porque `String({})` da '[object Object]' y
  //     eso enmascara un cliente que manda basura.
  const crudo = typeof rolPedido === 'string' ? rolPedido.trim() : rolPedido
  const solicitado = crudo === undefined || crudo === null || crudo === '' ? 'staff' : crudo

  // 3 · Lista blanca. Todo lo que no está, no entra.
  if (typeof solicitado !== 'string' || !ROLES_EQUIPO.includes(solicitado as RolEquipo)) {
    return {
      ok: false,
      status: 400,
      error: `Rol inválido. Los roles válidos son: ${ROLES_EQUIPO.join(', ')}.`,
    }
  }

  // 4 · La escalada. Es el único caso que este bloque agrega respecto del
  //     comportamiento anterior: sólo un owner puede designar a otro owner.
  if (solicitado === 'owner' && rolDelQueInvita !== 'owner') {
    return {
      ok: false,
      status: 403,
      error: 'Solo el propietario puede designar a otro propietario.',
    }
  }

  return { ok: true, rol: solicitado as RolEquipo }
}
