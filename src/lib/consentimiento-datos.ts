// ─────────────────────────────────────────────────────────────
// Consentimiento para el tratamiento de datos de salud (Ley 25.326).
//
// Los datos de salud son "datos sensibles": para tratarlos hace falta
// consentimiento previo, expreso e informado del titular, y hay que poder
// demostrar qué aceptó y cuándo.
//
// Por eso el texto vive versionado acá y no suelto en un JSX: cuando cambie,
// se sube la versión y los consentimientos viejos siguen siendo auditables
// contra el texto que estaba vigente cuando se firmaron.
// ─────────────────────────────────────────────────────────────

/** Subir esta versión cada vez que cambie el texto. */
export const VERSION_CONSENTIMIENTO_DATOS = '2026-07-v1'

export const TEXTO_CONSENTIMIENTO_DATOS = `
Autorizo al consultorio a registrar y tratar mis datos personales y de salud
(historia clínica, odontograma, imágenes y datos de contacto) con el fin de
brindarme atención odontológica y gestionar mis turnos y pagos.

Entiendo que mis datos se conservan bajo confidencialidad, que no se ceden a
terceros sin mi autorización salvo obligación legal, y que puedo pedir en
cualquier momento acceder a ellos, rectificarlos o solicitar su supresión.
`.trim()

/** Resumen de una línea para mostrar al lado del checkbox. */
export const RESUMEN_CONSENTIMIENTO_DATOS =
  'El paciente autoriza el registro y tratamiento de sus datos de salud para su atención odontológica.'

export interface RegistroConsentimiento {
  consentimiento_datos_en: string
  consentimiento_datos_ver: string
  consentimiento_datos_ip: string | null
  consentimiento_datos_origen: 'consultorio' | 'paciente'
}

/**
 * Arma las columnas a guardar cuando alguien presta el consentimiento.
 * Devuelve null si no lo prestó: nunca se completa por defecto.
 */
export function registrarConsentimiento(
  presto: boolean,
  origen: 'consultorio' | 'paciente',
  ip?: string | null
): RegistroConsentimiento | null {
  if (!presto) return null
  return {
    consentimiento_datos_en: new Date().toISOString(),
    consentimiento_datos_ver: VERSION_CONSENTIMIENTO_DATOS,
    consentimiento_datos_ip: ip || null,
    consentimiento_datos_origen: origen,
  }
}

/** ¿Este paciente tiene el consentimiento al día con la versión vigente? */
export function tieneConsentimientoVigente(paciente: {
  consentimiento_datos_en?: string | null
  consentimiento_datos_ver?: string | null
}): boolean {
  return !!paciente.consentimiento_datos_en
}

/**
 * ¿Hay que volver a pedírselo porque cambió el texto?
 *
 * Se separa de `tieneConsentimientoVigente` a propósito: un paciente con un
 * consentimiento de una versión anterior **no** queda desprotegido ni bloqueado
 * —consintió de buena fe bajo el texto de entonces—, pero conviene actualizarlo
 * en la próxima visita.
 */
export function consentimientoDesactualizado(paciente: {
  consentimiento_datos_en?: string | null
  consentimiento_datos_ver?: string | null
}): boolean {
  if (!paciente.consentimiento_datos_en) return false
  return paciente.consentimiento_datos_ver !== VERSION_CONSENTIMIENTO_DATOS
}
