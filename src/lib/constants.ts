export const TRATAMIENTOS = ['Limpieza','Ortodoncia','Implante','Cirugia','Endodoncia','Blanqueamiento','Consulta','Otro']

/**
 * Duración por defecto de cada tratamiento, en minutos.
 *
 * Es solo el respaldo: si la clínica cargó el tratamiento en la tabla
 * `tratamientos` con su `duracion_default`, manda ese valor. Este mapa se usa
 * cuando todavía no lo configuró.
 *
 * Blanqueamiento son 80 minutos porque va acompañado de una limpieza dental.
 */
export const DURACION_POR_TRATAMIENTO: Record<string, number> = {
  'Consulta': 20,
  'Ortodoncia': 60,
  'Blanqueamiento': 80,
  'Limpieza': 40,
  'Extracción': 40,
  'Caries': 40,
  'Implante': 80,
  'Otro': 20,
}

export function duracionPorDefecto(tratamiento: string): number {
  return DURACION_POR_TRATAMIENTO[tratamiento] ?? 20
}
export const ESTADOS      = ['pendiente','confirmado','asistio','cancelado','completado','ausente']
export const DURACIONES   = [20,40,60,80,120]
export const AVATAR_COLORS = ['#1D9E75','#7F77DD','#378ADD','#EF9F27','#D85A30','#E24B4A']

export const TRAT_STYLE: Record<string, {bg:string; color:string; dot:string}> = {
  Limpieza:       { bg:'#E1F5EE', color:'#085041', dot:'#1D9E75' },
  Ortodoncia:     { bg:'#EEEDFE', color:'#3C3489', dot:'#7F77DD' },
  Cirugia:        { bg:'#FAECE7', color:'#712B13', dot:'#D85A30' },
  Implante:       { bg:'#E6F1FB', color:'#0C447C', dot:'#378ADD' },
  Endodoncia:     { bg:'#FAEEDA', color:'#633806', dot:'#EF9F27' },
  Blanqueamiento: { bg:'#EAF3DE', color:'#27500A', dot:'#639922' },
  Consulta:       { bg:'#F1EFE8', color:'#444441', dot:'#888780' },
  Otro:           { bg:'#F1EFE8', color:'#444441', dot:'#888780' },
}

export const ESTADO_STYLE: Record<string, {bg:string; color:string; label:string}> = {
  confirmado: { bg:'#E1F5EE', color:'#085041', label:'Confirmado' },
  pendiente:  { bg:'#FAEEDA', color:'#633806', label:'Pendiente'  },
  asistio:    { bg:'#E6F1FB', color:'#0C447C', label:'Asistió'    },
  cancelado:  { bg:'#FAECE7', color:'#712B13', label:'Cancelado'  },
  completado: { bg:'#E2E3E5', color:'#41464B', label:'Completado' },
  ausente:    { bg:'#F8D7DA', color:'#842029', label:'Ausente'    },
}

export function horasDisponibles(): string[] {
  const h: string[] = []
  for (let hh = 8; hh <= 19; hh++)
    for (let mm = 0; mm < 60; mm += 20)
      h.push(`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`)
  return h
}

export function calcEdad(nac: string): string {
  if (!nac) return '—'
  const hoy = new Date(), n = new Date(nac)
  let e = hoy.getFullYear() - n.getFullYear()
  if (hoy.getMonth() < n.getMonth() || (hoy.getMonth() === n.getMonth() && hoy.getDate() < n.getDate())) e--
  return `${e} años`
}

export function initials(nombre: string): string {
  return nombre.split(' ').slice(0,2).map(p => p[0]).join('').toUpperCase()
}

/**
 * La fecha de hoy en el consultorio, formato AAAA-MM-DD.
 *
 * Se calcula en hora de Argentina y no en UTC. Con `toISOString()`, entre
 * las 21 y las 24 hs locales la app ya creía estar en el día siguiente:
 * la agenda abría en mañana y el dashboard mostraba los turnos del día
 * equivocado. Justo el horario en que un consultorio cierra y repasa la
 * jornada.
 */
export function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

/**
 * Nombre corto para el saludo del dashboard.
 *
 * Tomar la primera palabra del nombre de la clínica daba resultados raros:
 * "Consultorio Dr. Walter Benegas" saludaba con "¡Buenas tardes,
 * Consultorio!". Se descartan los prefijos genéricos y se conserva el
 * tratamiento junto al nombre de pila.
 */
export function nombreParaSaludo(nombre?: string | null): string {
  if (!nombre?.trim()) return 'Doctor'

  const limpio = nombre
    .replace(/^(consultorio|cl[ií]nica|centro|estudio|odontolog[ií]a|dental)\s+/i, '')
    .trim()

  const partes = limpio.split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'Doctor'

  // "Dr. Walter Benegas" → "Dr. Walter"
  if (/^dra?\.?$/i.test(partes[0]) && partes[1]) return `${partes[0]} ${partes[1]}`
  return partes[0]
}

export function normalizarTelefono(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('549')) return digits
  if (digits.startsWith('0'))   return '549' + digits.slice(1)
  return '549' + digits
}
