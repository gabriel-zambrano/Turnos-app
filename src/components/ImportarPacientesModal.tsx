'use client'
import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'

// Campos destino de DentalDesk. 'nombre' es obligatorio.
const CAMPOS: { key: string; label: string; oblig?: boolean; claves: string[] }[] = [
  { key: 'nombre', label: 'Nombre y apellido', oblig: true, claves: ['nombre', 'apellido', 'paciente', 'name'] },
  { key: 'telefono', label: 'Teléfono', claves: ['tel', 'celular', 'cel', 'phone', 'whatsapp', 'movil'] },
  { key: 'email', label: 'Email', claves: ['mail', 'correo', 'e-mail'] },
  { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', claves: ['nac', 'nacimiento', 'birth', 'fecha nac'] },
  { key: 'dni_cuit', label: 'DNI / CUIT', claves: ['dni', 'documento', 'cuit', 'cuil', 'doc'] },
  { key: 'tipo_documento', label: 'Tipo de documento', claves: ['tipo doc', 'tipo_doc', 'tipo documento'] },
  { key: 'alergias', label: 'Alergias', claves: ['alergia'] },
  { key: 'antecedentes', label: 'Antecedentes / Observaciones', claves: ['antecedente', 'observ', 'nota', 'historia', 'comentario'] },
]

const NADA = '__nada__'

function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const campo of CAMPOS) {
    const idx = headers.findIndex(h => {
      const hl = h.toLowerCase().trim()
      return campo.claves.some(c => hl.includes(c))
    })
    map[campo.key] = idx >= 0 ? String(idx) : NADA
  }
  return map
}

export function ImportarPacientesModal({ tenantId, onClose, onDone }: { tenantId: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [headers, setHeaders] = useState<string[]>([])
  const [datos, setDatos] = useState<any[][]>([])
  const [mapa, setMapa] = useState<Record<string, string>>({})
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<{ insertados: number; duplicados: number; totalErrores: number } | null>(null)
  const [error, setError] = useState('')

  function leerArchivo(file: File) {
    setError('')
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, raw: false })
        if (rows.length < 2) { setError('El archivo no tiene datos suficientes.'); return }
        const hs = (rows[0] as any[]).map(h => String(h ?? '').trim())
        setHeaders(hs)
        setDatos(rows.slice(1) as any[][])
        setMapa(autoMap(hs))
        setNombreArchivo(file.name)
        setResultado(null)
      } catch {
        setError('No se pudo leer el archivo. Verificá que sea un Excel (.xlsx) o CSV válido.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // Filas mapeadas a objetos {campo: valor}
  const filasMapeadas = useMemo(() => {
    return datos.map(row => {
      const obj: Record<string, string> = {}
      for (const campo of CAMPOS) {
        const idx = mapa[campo.key]
        obj[campo.key] = idx && idx !== NADA ? String(row[Number(idx)] ?? '').trim() : ''
      }
      return obj
    }).filter(o => o.nombre) // descarta filas sin nombre
  }, [datos, mapa])

  const nombreMapeado = mapa['nombre'] && mapa['nombre'] !== NADA

  async function importar() {
    if (!nombreMapeado) { setError('Tenés que mapear al menos la columna "Nombre y apellido".'); return }
    setImportando(true)
    setError('')
    try {
      const res = await fetch('/api/pacientes/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, filas: filasMapeadas }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al importar')
      setResultado(d)
      onDone(`Importación lista: ${d.insertados} pacientes agregados${d.duplicados ? `, ${d.duplicados} duplicados omitidos` : ''}.`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setImportando(false)
    }
  }

  function descargarPlantilla() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['nombre', 'telefono', 'email', 'fecha_nacimiento', 'dni_cuit', 'tipo_documento', 'alergias', 'antecedentes'],
      ['Juan Pérez', '+5491134567890', 'juan@mail.com', '15/03/1985', '30123456', 'DNI', 'Penicilina', 'Hipertenso'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pacientes')
    XLSX.writeFile(wb, 'plantilla-pacientes-dentaldesk.xlsx')
  }

  const inputSt: React.CSSProperties = { fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontFamily: 'DM Sans, sans-serif', color: '#0a1e3d', width: '100%', outline: 'none' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0a1e3d' }}>Importar pacientes</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12.5, color: '#64748b', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Subí un archivo Excel (.xlsx) o CSV con tus pacientes. Detectamos las columnas y las asociás a los campos de DentalDesk.
        </p>

        {resultado ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ fontSize: 44 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0a1e3d', margin: '8px 0' }}>Importación completada</div>
            <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
              <strong style={{ color: '#1D9E75' }}>{resultado.insertados}</strong> pacientes agregados<br />
              {resultado.duplicados > 0 && <>{resultado.duplicados} duplicados omitidos<br /></>}
              {resultado.totalErrores > 0 && <>{resultado.totalErrores} filas con datos incompletos<br /></>}
            </div>
            <button onClick={onClose} style={{ marginTop: 18, padding: '9px 22px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Listo</button>
          </div>
        ) : (
          <>
            {/* Paso 1: subir archivo */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <label style={{ padding: '9px 16px', borderRadius: 8, border: '1.5px solid #1D9E75', background: '#ecfdf5', color: '#1D9E75', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {nombreArchivo || 'Seleccionar archivo…'}
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && leerArchivo(e.target.files[0])} />
              </label>
              <button onClick={descargarPlantilla} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                Descargar plantilla
              </button>
            </div>

            {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

            {/* Paso 2: mapeo */}
            {headers.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0a1e3d', marginBottom: 8 }}>Asociá las columnas ({datos.length} filas detectadas)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {CAMPOS.map(campo => (
                    <div key={campo.key}>
                      <label style={{ fontSize: 11.5, fontWeight: 600, color: campo.oblig ? '#0a1e3d' : '#64748b', display: 'block', marginBottom: 3 }}>
                        {campo.label}{campo.oblig && ' *'}
                      </label>
                      <select value={mapa[campo.key] ?? NADA} onChange={e => setMapa({ ...mapa, [campo.key]: e.target.value })} style={inputSt}>
                        <option value={NADA}>— sin asociar —</option>
                        {headers.map((h, i) => <option key={i} value={String(i)}>{h || `Columna ${i + 1}`}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Preview */}
                <div style={{ fontSize: 12, color: '#8fa3bc', marginBottom: 6 }}>Vista previa (primeras 3):</div>
                <div style={{ border: '1px solid #e8edf2', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                  {filasMapeadas.slice(0, 3).map((f, i) => (
                    <div key={i} style={{ padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', fontSize: 12 }}>
                      <strong style={{ color: '#0a1e3d' }}>{f.nombre || '(sin nombre)'}</strong>
                      <span style={{ color: '#8fa3bc' }}>
                        {f.telefono && ` · ${f.telefono}`}{f.dni_cuit && ` · DNI ${f.dni_cuit}`}{f.email && ` · ${f.email}`}
                      </span>
                    </div>
                  ))}
                  {filasMapeadas.length === 0 && <div style={{ padding: '12px', fontSize: 12, color: '#94a3b8' }}>No hay filas con nombre para importar.</div>}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Cancelar</button>
                  <button onClick={importar} disabled={importando || !nombreMapeado || filasMapeadas.length === 0} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: importando || !nombreMapeado ? '#94a3b8' : '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 700, cursor: importando ? 'wait' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    {importando ? 'Importando…' : `Importar ${filasMapeadas.length} pacientes`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
