/**
 * Lógica pura del foco atrapado en modales: separada del componente para
 * poder testearla sin navegador.
 */

export const SELECTOR_ENFOCABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

/**
 * Índice al que va el foco al apretar Tab dentro de un modal.
 * Devuelve null si el navegador puede seguir solo (no hace falta envolver).
 *
 * @param total      cantidad de elementos enfocables del modal
 * @param actual     índice del elemento con foco, o -1 si el foco está fuera
 * @param haciaAtras Shift+Tab
 */
export function indiceFocoAtrapado(total: number, actual: number, haciaAtras: boolean): number | null {
  if (total === 0) return null
  if (actual === -1) return haciaAtras ? total - 1 : 0
  if (haciaAtras && actual === 0) return total - 1
  if (!haciaAtras && actual === total - 1) return 0
  return null
}
