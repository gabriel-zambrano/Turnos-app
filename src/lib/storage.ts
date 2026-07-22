// ─────────────────────────────────────────────────────────────
// Utilidades de Supabase Storage para fotos clínicas.
//
// Contexto: históricamente en `paciente_fotos.url` se guardaba la URL PÚBLICA
// del archivo, porque el bucket era público (cualquiera con el link veía fotos
// clínicas de pacientes). Ahora el bucket es privado y se sirve con URLs
// firmadas que vencen.
//
// Para no tener que migrar los datos viejos, este helper acepta las dos formas
// y devuelve siempre la ruta dentro del bucket:
//   - URL pública legada:  https://xxx.supabase.co/storage/v1/object/public/fotos_clinicas/<ruta>
//   - URL firmada:         https://xxx.supabase.co/storage/v1/object/sign/fotos_clinicas/<ruta>?token=...
//   - Ruta nueva:          <tenant_id>/<paciente_id>/<archivo>
// ─────────────────────────────────────────────────────────────

export const BUCKET_FOTOS = 'fotos_clinicas'

// Formatos que los navegadores muestran de forma confiable. HEIC (el formato
// por defecto del iPhone) queda afuera a propósito: ni Chrome ni Firefox lo
// renderizan, así que una foto HEIC se sube "bien" pero después no se ve.
export const FORMATOS_IMAGEN_WEB = ['image/jpeg', 'image/png', 'image/webp']

export function esImagenSoportada(file: { name: string; type: string }): boolean {
  const tipo = (file.type || '').toLowerCase()
  if (FORMATOS_IMAGEN_WEB.includes(tipo)) return true
  // Algunos navegadores no completan `type`; caemos a la extensión.
  if (!tipo) return /\.(jpe?g|png|webp)$/i.test(file.name || '')
  return false
}

export function storagePathFromUrl(
  value: string | null | undefined,
  bucket: string = BUCKET_FOTOS
): string {
  if (!value) return ''
  const v = String(value).trim()
  if (!v) return ''

  // Ya es una ruta relativa: solo limpiamos barras iniciales.
  if (!/^https?:\/\//i.test(v)) return v.replace(/^\/+/, '')

  const sinQuery = (s: string) => s.split('?')[0]
  const decodificar = (s: string) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  }

  for (const marcador of [`/object/public/${bucket}/`, `/object/sign/${bucket}/`, `/${bucket}/`]) {
    const i = v.indexOf(marcador)
    if (i >= 0) return decodificar(sinQuery(v.slice(i + marcador.length)))
  }

  // No reconocemos el formato: devolvemos el valor tal cual para no romper nada.
  return v
}
