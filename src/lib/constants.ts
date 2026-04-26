export const TRATAMIENTOS = ['Limpieza','Ortodoncia','Implante','Cirugia','Endodoncia','Blanqueamiento','Consulta','Otro']
export const ESTADOS      = ['pendiente','confirmado','asistio','cancelado']
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

export function hoyISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function normalizarTelefono(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('549')) return digits
  if (digits.startsWith('0'))   return '549' + digits.slice(1)
  return '549' + digits
}
