// Tipos de la Ficha del paciente, compartidos entre la página y sus pestañas.

export interface Paciente {
  id: string
  nombre: string
  telefono: string
  email: string | null
  fecha_nacimiento: string | null
  ultimo_tratamiento: string | null
  creado_en: string
  alergias: string | null
  antecedentes: string | null
  progreso_plan_porcentaje: number | null
  puntos: number | null
  puntos_saldo_cache: number
  consentimiento_datos_en: string | null
  consentimiento_datos_ver: string | null
  visitas_consecutivas_sin_faltar: number
  total_visitas_asistidas: number
  recomendaciones: string | null
}


export interface HistorialLog {
  id: string
  paciente_id: string
  diente: number
  estado: string
  notas: string | null
  creado_en: string
}

export interface PacienteFoto {
  id: string
  url: string
  tipo: string
  creado_en: string
}
