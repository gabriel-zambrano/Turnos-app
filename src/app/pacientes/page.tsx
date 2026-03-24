'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Badge, Toast, PageHeader, BtnPrimary, BtnSm, DataTable, TR, TD, Spinner, MetricCard, inputCss, selectCss, overlayCss, modalCss, modalTitleCss, footerCss, groupCss, labelCss, grid2Css, btnDarkCss, btnLightCss, btnRedCss } from '@/components/UI'
import { TRAT_STYLE, AVATAR_COLORS, TRATAMIENTOS, calcEdad, initials } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

// ── Tipos ────────────────────────────────────────
interface PacDB {
  id: string
  nombre: string
  telefono: string
  email: string | null
  fecha_nacimiento: string | null
  ultimo_tratamiento: string | null
  creado_en: string
  token: string | null
}
interface Pac {
  id: string
  nombre: string
  telefono: string
  email: string
  nacimiento: string
  tratamiento: string
  alta: string
  token: string | null
}
function toPac(p: PacDB): Pac {
  return {
    id: p.id,
    nombre: p.nombre,
    telefono: p.telefono,
    email: p.email ?? '',
    nacimiento: p.fecha_nacimiento ?? '',
    tratamiento: p.ultimo_tratamiento ?? 'Consulta',
    alta: p.creado_en?.split('T')[0] ?? '',
    token: p.token ?? null,
  }
}

export default function Pacientes() {
  const [rows,    setRows]    = useState<Pac[]>([])
  const [isMobile, setIsMobile] = useState(false)
  useEffect(()=>{ const check = () => setIsMobile(window.innerWidth < 768); check(); window.addEventListener("resize", check); return () => window.removeEventListener("resize", check) },[])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [modal,   setModal]   = useState<'nuevo' | 'editar' | 'borrar' | null>(null)
  const [sel,     setSel]     = useState<Pac | null>(null)
  const [busq,    setBusq]    = useState('')
  const [toast,   setToast]   = useState<{ msg: string; tipo: string } | null>(null)

  // Form — cada campo con su propio state para evitar bugs de React
  const [fNombre,      setFNombre]      = useState('')
  const [fTelefono,    setFTelefono]    = useState('+54911')
  const [fEmail,       setFEmail]       = useState('')
  const [fNacimiento,  setFNacimiento]  = useState('')
  const [fTratamiento, setFTratamiento] = useState('Consulta')

  function msg(m: string, tipo = 'ok') {
    setToast({ msg: m, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Cargar desde Supabase ───────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('pacientes')
      .select('*')
      .order('creado_en', { ascending: false })
    if (error) {
      msg('Error al cargar: ' + error.message, 'error')
    } else {
      setRows((data as PacDB[]).map(toPac))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtrados = rows.filter(p =>
    p.nombre.toLowerCase().includes(busq.toLowerCase()) ||
    p.telefono.includes(busq) ||
    p.email.toLowerCase().includes(busq.toLowerCase())
  )

  // ── Abrir modales ───────────────────────────────
  function openNuevo() {
    setFNombre('')
    setFTelefono('+54911')
    setFEmail('')
    setFNacimiento('')
    setFTratamiento('Consulta')
    setSel(null)
    setModal('nuevo')
  }

  function openEditar(p: Pac) {
    setFNombre(p.nombre)
    setFTelefono(p.telefono)
    setFEmail(p.email)
    setFNacimiento(p.nacimiento)
    setFTratamiento(p.tratamiento)
    setSel(p)
    setModal('editar')
  }

  // ── Guardar nuevo ───────────────────────────────
  async function saveNuevo() {
    if (!fNombre.trim()) return msg('El nombre es obligatorio', 'error')
    if (!fTelefono.startsWith('+')) return msg('El teléfono debe empezar con + (ej: +54911...)', 'error')
    setSaving(true)
    const { error } = await supabase.from('pacientes').insert({
      nombre: fNombre.trim(),
      telefono: fTelefono.trim(),
      email: fEmail.trim() || null,
      fecha_nacimiento: fNacimiento || null,
      ultimo_tratamiento: fTratamiento,
    })
    setSaving(false)
    if (error) return msg('Error al guardar: ' + error.message, 'error')
    setModal(null)
    msg('Paciente agregado correctamente ✓')
    load()
  }

  // ── Guardar edición ─────────────────────────────
  async function saveEditar() {
    if (!sel) return
    if (!fNombre.trim()) return msg('El nombre es obligatorio', 'error')
    setSaving(true)
    const { error } = await supabase.from('pacientes').update({
      nombre: fNombre.trim(),
      telefono: fTelefono.trim(),
      email: fEmail.trim() || null,
      fecha_nacimiento: fNacimiento || null,
      ultimo_tratamiento: fTratamiento,
    }).eq('id', sel.id)
    setSaving(false)
    if (error) return msg('Error al actualizar: ' + error.message, 'error')
    setModal(null)
    msg('Paciente actualizado ✓')
    load()
  }

  // ── Eliminar ────────────────────────────────────
  async function saveBorrar() {
    if (!sel) return
    setSaving(true)
    const { error } = await supabase.from('pacientes').delete().eq('id', sel.id)
    setSaving(false)
    if (error) return msg('Error al eliminar: ' + error.message, 'error')
    setModal(null)
    msg('Paciente eliminado')
    load()
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar/>
      <main style={{ marginLeft: isMobile?0:240, flex: 1, background: "#f4f6f8", paddingBottom: isMobile?64:0 }}>

        <PageHeader title="Pacientes"
          right={
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                value={busq}
                onChange={e => setBusq(e.target.value)}
                placeholder="Buscar nombre, teléfono o email..."
                style={{ ...inputCss, width: 300, padding: '0.5rem 0.85rem', fontSize: 13 }}
              />
              <BtnPrimary onClick={openNuevo}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Nuevo paciente
              </BtnPrimary>
            </div>
          }
        />

        <div style={{ padding: '1.75rem 2rem', maxWidth: 1100 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <MetricCard label="Total pacientes"    value={loading ? '…' : rows.length}      accent="#1D9E75"/>
            <MetricCard label="Resultado búsqueda" value={loading ? '…' : filtrados.length} accent="#378ADD"/>
          </div>

          {loading ? <Spinner/> : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0.75rem' }}>
              {filtrados.map((p, i) => {
                const color = AVATAR_COLORS[i % AVATAR_COLORS.length]
                const tc = TRAT_STYLE[p.tratamiento] || TRAT_STYLE.Consulta
                return (
                  <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: color + '22', border: `1.5px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color, flexShrink: 0 }}>
                        {initials(p.nombre)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{p.nombre}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{p.telefono}</div>
                      </div>
                      <Badge bg={tc.bg} color={tc.color}>{p.tratamiento}</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <BtnSm variant="edit" onClick={() => openEditar(p)}>Editar</BtnSm>
                      <BtnSm variant="delete" onClick={() => { setSel(p); setModal('borrar') }}>Eliminar</BtnSm>
                      {p.token && <BtnSm variant="edit" onClick={() => { const url = `${window.location.origin}/paciente/${p.token}`; const txt = encodeURIComponent(`Hola ${p.nombre}, te compartimos el link para ver y confirmar tu turno: ${url}`); window.open(`https://wa.me/${p.telefono?.replace(/\D/g,'')}?text=${txt}`, '_blank') }}>WhatsApp</BtnSm>}
                    </div>
                  </div>
                )
              })}
              {filtrados.length === 0 && <div style={{ textAlign: 'center', color: '#aaa', padding: '2rem' }}>No hay pacientes.</div>}
            </div>
          ) : (
            <DataTable
              headers={['Paciente', 'Contacto', 'Edad', 'Tratamiento', 'Alta', '']}
              empty={filtrados.length === 0}
              emptyMsg="No hay pacientes. Hacé click en + Nuevo paciente para agregar el primero."
            >
              {filtrados.map((p, i) => {
                const color = AVATAR_COLORS[i % AVATAR_COLORS.length]
                const tc    = TRAT_STYLE[p.tratamiento] || TRAT_STYLE.Consulta
                return (
                  <TR key={p.id}>
                    <TD first>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: color + '22', border: `1.5px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>
                          {initials(p.nombre)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: '#aaa' }}>Alta: {p.alta}</div>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <div style={{ fontSize: 13 }}>{p.telefono}</div>
                      <div style={{ fontSize: 12, color: '#aaa' }}>{p.email || '—'}</div>
                    </TD>
                    <TD muted>{calcEdad(p.nacimiento)}</TD>
                    <TD><Badge bg={tc.bg} color={tc.color}>{p.tratamiento}</Badge></TD>
                    <TD muted>{p.alta}</TD>
                    <TD>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <BtnSm variant="edit"   onClick={() => openEditar(p)}>Editar</BtnSm>
                        <BtnSm variant="delete" onClick={() => { setSel(p); setModal('borrar') }}>Eliminar</BtnSm>
                        {p.token&&<BtnSm variant="edit" onClick={()=>{const url=`${window.location.origin}/paciente/${p.token}`;const txt=encodeURIComponent(`Hola ${p.nombre}, te compartimos el link para ver y confirmar tu turno: ${url}`);window.open(`https://wa.me/${p.telefono?.replace(/\D/g,'')}?text=${txt}`,'_blank')}}>WhatsApp</BtnSm>}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </DataTable>
          )}
        </div>
      </main>

      {/* ── MODAL NUEVO ── */}
      {modal === 'nuevo' && (
        <div style={overlayCss(isMobile)} onClick={() => setModal(null)}>
          <div style={modalCss(isMobile)} onClick={e => e.stopPropagation()}>
            <div style={modalTitleCss}>Nuevo paciente</div>

            <div style={groupCss}>
              <label style={labelCss}>Nombre completo *</label>
              <input
                style={inputCss}
                value={fNombre}
                onChange={e => setFNombre(e.target.value)}
                placeholder="Ej: María González"
                autoFocus
              />
            </div>

            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Teléfono (WhatsApp) *</label>
                <input
                  style={inputCss}
                  value={fTelefono}
                  onChange={e => setFTelefono(e.target.value)}
                  placeholder="+5491123456789"
                />
                <span style={{ fontSize: 11, color: '#aaa', marginTop: 3, display: 'block' }}>Debe empezar con +</span>
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Email</label>
                <input
                  type="email"
                  style={inputCss}
                  value={fEmail}
                  onChange={e => setFEmail(e.target.value)}
                  placeholder="paciente@email.com"
                />
              </div>
            </div>

            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Fecha de nacimiento</label>
                <input
                  type="date"
                  style={inputCss}
                  value={fNacimiento}
                  onChange={e => setFNacimiento(e.target.value)}
                />
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Tratamiento</label>
                <select style={selectCss} value={fTratamiento} onChange={e => setFTratamiento(e.target.value)}>
                  {TRATAMIENTOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{ ...btnDarkCss, opacity: saving ? 0.6 : 1 }} onClick={saveNuevo} disabled={saving}>
                {saving ? 'Guardando...' : 'Agregar paciente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDITAR ── */}
      {modal === 'editar' && (
        <div style={overlayCss(isMobile)} onClick={() => setModal(null)}>
          <div style={modalCss(isMobile)} onClick={e => e.stopPropagation()}>
            <div style={modalTitleCss}>Editar paciente</div>

            <div style={groupCss}>
              <label style={labelCss}>Nombre completo *</label>
              <input style={inputCss} value={fNombre} onChange={e => setFNombre(e.target.value)} autoFocus/>
            </div>

            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Teléfono *</label>
                <input style={inputCss} value={fTelefono} onChange={e => setFTelefono(e.target.value)}/>
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Email</label>
                <input type="email" style={inputCss} value={fEmail} onChange={e => setFEmail(e.target.value)}/>
              </div>
            </div>

            <div style={grid2Css}>
              <div style={groupCss}>
                <label style={labelCss}>Fecha de nacimiento</label>
                <input type="date" style={inputCss} value={fNacimiento} onChange={e => setFNacimiento(e.target.value)}/>
              </div>
              <div style={groupCss}>
                <label style={labelCss}>Tratamiento</label>
                <select style={selectCss} value={fTratamiento} onChange={e => setFTratamiento(e.target.value)}>
                  {TRATAMIENTOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{ ...btnDarkCss, opacity: saving ? 0.6 : 1 }} onClick={saveEditar} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL BORRAR ── */}
      {modal === 'borrar' && (
        <div style={overlayCss(isMobile)} onClick={() => setModal(null)}>
          <div style={{...modalCss(isMobile), maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={modalTitleCss}>Eliminar paciente</div>
            <p style={{ fontSize: 14, color: '#666', marginBottom: '1.5rem' }}>
              Vas a eliminar a <strong>{sel?.nombre}</strong>. Esta acción no se puede deshacer.
            </p>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModal(null)} disabled={saving}>Cancelar</button>
              <button style={{ ...btnRedCss, opacity: saving ? 0.6 : 1 }} onClick={saveBorrar} disabled={saving}>
                {saving ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo}/>}
    </div>
  )
}
