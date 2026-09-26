'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'
import { NuevaCitaModal } from '@/components/NuevaCitaModal'

interface Paciente {
  id: string
  nombre: string
  telefono: string
}

interface PaletteAction {
  type: 'action' | 'nav'
  id: string
  group: string
  label: string
  hint?: string
  icon: string
  href?: string
  action?: () => void
}

interface PalettePatient extends Paciente {
  type: 'patient'
  group: 'Pacientes'
}

type PaletteItem = PalettePatient | PaletteAction

const ICONS: Record<string, React.ReactNode> = {
  plus: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  grid: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  cal: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  users: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  bell: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  chart: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  money: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  invoice: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 2h11l5 5v15l-3-2-3 2-3-2-3 2V2z" /><line x1="8" y1="8" x2="14" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function CommandPalette() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { tenant } = useTenantContext()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Paciente[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [openNuevaCita, setOpenNuevaCita] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Listen for ⌘K, Ctrl+K, Escape, custom open event, and 'N' shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setIsOpen(prev => !prev)
        setQuery('')
        setSelectedIndex(0)
        return
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
        return
      }

      // Shortcut 'N': agendar nuevo turno rápidamente si no está escribiendo en campos de formulario
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isEditable = target?.isContentEditable
      if (
        e.key.toLowerCase() === 'n' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        tag !== 'input' &&
        tag !== 'textarea' &&
        tag !== 'select' &&
        !isEditable &&
        !isOpen &&
        !openNuevaCita
      ) {
        e.preventDefault()
        setOpenNuevaCita(true)
      }
    }

    function handleCustomOpen() {
      setIsOpen(true)
      setQuery('')
      setSelectedIndex(0)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('open-command-palette', handleCustomOpen)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('open-command-palette', handleCustomOpen)
    }
  }, [isOpen, openNuevaCita])

  // Auto-focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Patient search query (seguro y multi-tenant)
  useEffect(() => {
    if (!tenant || query.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const timeout = setTimeout(async () => {
      const termino = query.trim().replace(/[,()]/g, '')
      const digitos = termino.replace(/\D/g, '')
      const filtros = [`nombre.ilike.%${termino}%`]
      if (digitos.length >= 2) filtros.push(`telefono.ilike.%${digitos}%`)

      const { data } = await supabase
        .from('pacientes')
        .select('id,nombre,telefono')
        .eq('tenant_id', tenant.id)
        .or(filtros.join(','))
        .limit(5)

      if (data) {
        setResults(data)
      }
      setLoading(false)
      setSelectedIndex(0)
    }, 250)

    return () => clearTimeout(timeout)
  }, [query, tenant, supabase])

  const staticActions: PaletteAction[] = [
    { type: 'action', id: 'act-nueva-cita', group: 'Acciones rápidas', label: 'Agendar nuevo turno', hint: 'N', icon: 'plus', action: () => setOpenNuevaCita(true) },
    { type: 'nav', id: 'nav-dashboard', group: 'Navegación', label: 'Ir a Dashboard', icon: 'grid', href: '/dashboard' },
    { type: 'nav', id: 'nav-agenda', group: 'Navegación', label: 'Ver Agenda completa', icon: 'cal', href: '/agenda' },
    { type: 'nav', id: 'nav-pacientes', group: 'Navegación', label: 'Lista de Pacientes', icon: 'users', href: '/pacientes' },
    { type: 'nav', id: 'nav-alertas', group: 'Navegación', label: 'Ver Alertas y Seguimiento', icon: 'bell', href: '/seguimiento' },
    { type: 'nav', id: 'nav-bi', group: 'Navegación', label: 'Analítica y Rendimiento', icon: 'chart', href: '/bi' },
    { type: 'nav', id: 'nav-finanzas', group: 'Navegación', label: 'Finanzas y Caja', icon: 'money', href: '/finanzas' },
    { type: 'nav', id: 'nav-facturas', group: 'Navegación', label: 'Facturas emitidas', icon: 'invoice', href: '/facturas' },
    { type: 'nav', id: 'nav-config', group: 'Navegación', label: 'Configuración de clínica', icon: 'settings', href: '/configuracion' },
  ]

  // Filter actions based on query
  const filteredActions = query.trim() 
    ? staticActions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
    : staticActions

  const patientItems: PalettePatient[] = results.map(r => ({
    type: 'patient',
    group: 'Pacientes',
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono
  }))

  const allItems: PaletteItem[] = [...patientItems, ...filteredActions]

  // Handle keyboard navigation inside list
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (allItems.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % allItems.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + allItems.length) % allItems.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      triggerSelection(allItems[selectedIndex])
    }
  }

  const triggerSelection = (item: PaletteItem | undefined) => {
    if (!item) return
    setIsOpen(false)
    if (item.type === 'patient') {
      router.push(`/pacientes/${item.id}`)
    } else if (item.type === 'nav' && item.href) {
      router.push(item.href)
    } else if (item.type === 'action' && item.action) {
      item.action()
    }
  }

  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  const secondaryColor = tenant?.secondaryColor || '#185FA5'

  if (!isOpen && !openNuevaCita) return null

  return (
    <>
      {isOpen && (
        <>
          {/* Backdrop con desenfoque de alta fidelidad */}
          <div 
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(8, 15, 30, 0.55)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 99999,
              animation: 'palette-backdrop-in 0.15s ease-out'
            }}
          />

          {/* Palette Container estilo Raycast / Linear */}
          <div 
            style={{
              position: 'fixed',
              top: '16%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'calc(100% - 32px)',
              maxWidth: 540,
              background: 'var(--bg-modal, #ffffff)',
              borderRadius: 16,
              border: '1px solid var(--border-color, rgba(15,30,61,0.12))',
              boxShadow: '0 24px 60px -12px rgba(10,30,61,0.28), 0 0 0 1px var(--border-light, rgba(15,30,61,0.06))',
              zIndex: 100000,
              fontFamily: 'var(--font-sans)',
              overflow: 'hidden',
              padding: '8px',
              animation: 'palette-modal-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onKeyDown={handleListKeyDown}
          >
            {/* Search Input Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--bg-input, #f8fafc)',
              border: '1px solid var(--border-color, rgba(15,30,61,0.08))',
              marginBottom: 8
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted, #8fa3bc)" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input 
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Busca pacientes por nombre o celular, o escribe una acción..."
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-dark, #0a1e3d)',
                  fontFamily: 'inherit',
                  padding: '2px 0'
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 6px',
                    fontSize: 11,
                    color: 'var(--text-muted, #8fa3bc)',
                    cursor: 'pointer',
                    borderRadius: 4
                  }}
                >
                  Limpiar
                </button>
              )}
              <kbd style={{
                fontSize: 10.5,
                fontWeight: 600,
                padding: '2px 6px',
                background: 'var(--bg-card, #ffffff)',
                color: 'var(--text-muted, #8fa3bc)',
                borderRadius: 5,
                border: '1px solid var(--border-color, #e2e8f0)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
              }}>
                ESC
              </kbd>
            </div>

            {/* Items List */}
            <div ref={listRef} style={{ maxHeight: 310, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {loading && (
                <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted, #8fa3bc)', fontSize: 13 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'palette-spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Buscando en ficha médica...
                </div>
              )}

              {!loading && allItems.length === 0 && (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted, #8fa3bc)', fontSize: 13 }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🔍</div>
                  No se encontraron resultados para &ldquo;{query}&rdquo;
                </div>
              )}

              {!loading && allItems.map((item, idx) => {
                const isSelected = selectedIndex === idx
                const prevItem = allItems[idx - 1]
                const isFirstOfGroup = !prevItem || prevItem.group !== item.group

                return (
                  <div key={item.id}>
                    {isFirstOfGroup && (
                      <div style={{
                        padding: '6px 12px 4px',
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted, #8fa3bc)'
                      }}>
                        {item.group}
                      </div>
                    )}
                    <div
                      onClick={() => triggerSelection(item)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 12px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: isSelected ? `${secondaryColor}12` : 'transparent',
                        border: isSelected ? `1px solid ${secondaryColor}25` : '1px solid transparent',
                        transition: 'background-color 0.12s ease, border-color 0.12s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      {item.type === 'patient' ? (
                        <>
                          <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            background: `${secondaryColor}15`,
                            color: secondaryColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            flexShrink: 0
                          }}>
                            {item.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13.5,
                              fontWeight: isSelected ? 700 : 600,
                              color: isSelected ? secondaryColor : 'var(--text-dark, #0a1e3d)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {item.nombre}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted, #8fa3bc)', fontVariantNumeric: 'tabular-nums' }}>
                              Ficha clínica · {item.telefono || 'Sin teléfono'}
                            </div>
                          </div>
                          {isSelected && (
                            <span style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: secondaryColor,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              Ver ficha <kbd style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--bg-modal, #fff)', border: '1px solid var(--border-color)', fontSize: 10 }}>↵</kbd>
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            background: isSelected ? `${secondaryColor}20` : 'var(--border-lighter, rgba(15,30,61,0.04))',
                            color: isSelected ? secondaryColor : 'var(--text-dark, #0a1e3d)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {ICONS[item.icon] || ICONS.grid}
                          </div>
                          <div style={{
                            flex: 1,
                            fontSize: 13.5,
                            fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? secondaryColor : 'var(--text-dark, #0a1e3d)'
                          }}>
                            {item.label}
                          </div>
                          {item.hint && (
                            <kbd style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              padding: '2px 5px',
                              background: 'var(--border-lighter, #f1f5f9)',
                              color: 'var(--text-muted, #8fa3bc)',
                              borderRadius: 4,
                              border: '1px solid var(--border-color, #e2e8f0)'
                            }}>
                              {item.hint}
                            </kbd>
                          )}
                          {isSelected && (
                            <span style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: secondaryColor,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              Ejecutar <kbd style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--bg-modal, #fff)', border: '1px solid var(--border-color)', fontSize: 10 }}>↵</kbd>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* Guide footer */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px 4px',
              borderTop: '1px solid var(--border-light, #f1f5f9)',
              marginTop: 6,
              fontSize: 10.5,
              color: 'var(--text-muted, #8fa3bc)',
              fontWeight: 500
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Navegar</span>
                <kbd style={{ padding: '1px 4px', background: 'var(--border-lighter, #f1f5f9)', border: '1px solid var(--border-color)', borderRadius: 4 }}>↑↓</kbd>
                <span>Seleccionar</span>
                <kbd style={{ padding: '1px 4px', background: 'var(--border-lighter, #f1f5f9)', border: '1px solid var(--border-color)', borderRadius: 4 }}>↵</kbd>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Turno rápido</span>
                <kbd style={{ padding: '1px 4px', background: 'var(--border-lighter, #f1f5f9)', border: '1px solid var(--border-color)', borderRadius: 4 }}>N</kbd>
              </span>
            </div>
          </div>
        </>
      )}

      {openNuevaCita && (
        <NuevaCitaModal
          onClose={() => setOpenNuevaCita(false)}
          onSuccess={() => {
            setOpenNuevaCita(false)
            router.refresh()
          }}
        />
      )}

      <style>{`
        @keyframes palette-backdrop-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes palette-modal-in {
          from { opacity: 0; transform: translate(-50%, -6px) scale(0.98); }
          to { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
        @keyframes palette-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}
