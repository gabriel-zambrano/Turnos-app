'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'
import { NuevaCitaModal } from '@/components/NuevaCitaModal'

const supabase = createClient()

interface Paciente {
  id: string
  nombre: string
  telefono: string
}

export function CommandPalette() {
  const router = useRouter()
  const { tenant } = useTenantContext()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Paciente[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [openNuevaCita, setOpenNuevaCita] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Listen for ⌘K or Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setIsOpen(prev => !prev)
        setQuery('')
        setSelectedIndex(0)
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Patient search query
  useEffect(() => {
    if (!tenant || query.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('pacientes')
        .select('id,nombre,telefono')
        .eq('tenant_id', tenant.id)
        .ilike('nombre', `%${query}%`)
        .limit(5)
      
      if (data) {
        setResults(data)
      }
      setLoading(false)
      setSelectedIndex(0)
    }, 250)

    return () => clearTimeout(timeout)
  }, [query, tenant])

  const staticActions = [
    { type: 'action', label: '📅 Agendar nuevo turno', action: () => setOpenNuevaCita(true) },
    { type: 'nav', label: '🗂️ Ir a Dashboard', href: '/dashboard' },
    { type: 'nav', label: '📆 Ver Agenda', href: '/agenda' },
    { type: 'nav', label: '👥 Lista de Pacientes', href: '/pacientes' },
    { type: 'nav', label: '🚨 Ver Alertas', href: '/seguimiento' },
    { type: 'nav', label: '📈 Analítica del consultorio', href: '/bi' },
    { type: 'nav', label: '💰 Finanzas y Caja', href: '/finanzas' },
  ]

  // Filter actions based on query
  const filteredActions = query.trim() 
    ? staticActions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
    : staticActions

  const allItems = [...results.map(r => ({ type: 'patient', ...r })), ...filteredActions]

  // Handle keyboard navigation inside list
  const handleListKeyDown = (e: React.KeyboardEvent) => {
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

  const triggerSelection = (item: any) => {
    if (!item) return
    setIsOpen(false)
    if (item.type === 'patient') {
      router.push(`/pacientes/${item.id}`)
    } else if (item.type === 'nav') {
      router.push(item.href)
    } else if (item.type === 'action') {
      item.action()
    }
  }

  useEffect(() => {
    // Scroll selected item into view inside the dropdown scroll container
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  const primaryColor = tenant?.primaryColor || '#0a1e3d'
  const secondaryColor = tenant?.secondaryColor || '#185FA5'

  if (!isOpen && !openNuevaCita) return null

  return (
    <>
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(10,30,61,0.45)', 
              backdropFilter: 'blur(5px)', zIndex: 99999
            }}
          />

          {/* Palette Container */}
          <div 
            style={{
              position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
              width: '100%', maxWidth: 520, background: 'var(--bg-modal, #fff)',
              borderRadius: 16, border: '1px solid var(--border-light, rgba(56,138,221,0.15))',
              boxShadow: '0 20px 50px rgba(10,30,61,0.2)', zIndex: 100000,
              fontFamily: 'DM Sans, sans-serif', overflow: 'hidden', padding: '10px'
            }}
            onKeyDown={handleListKeyDown}
          >
            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-light, #dde5ef)', marginBottom: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted, #8fa3bc)" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input 
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Busca pacientes o escribe acciones (ej: 'agendar')..."
                style={{
                  flex: 1, border: 'none', background: 'transparent', outline: 'none',
                  fontSize: 15, color: 'var(--text-dark, #0a1e3d)', fontFamily: 'DM Sans, sans-serif',
                  padding: '6px 0'
                }}
              />
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 7px', background: 'var(--border-lighter, #f4f7fb)', color: 'var(--text-muted, #8fa3bc)', borderRadius: 6, border: '1px solid var(--border-light, #dde5ef)' }}>ESC</span>
            </div>

            {/* List */}
            <div ref={listRef} style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {loading && (
                <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#8fa3bc', fontSize: 13 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Buscando en ficha médica...
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              )}

              {!loading && allItems.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted, #8fa3bc)', fontSize: 13 }}>
                  No se encontraron resultados para "{query}"
                </div>
              )}

              {!loading && allItems.map((item: any, idx) => {
                const isSelected = selectedIndex === idx
                return (
                  <div
                    key={item.id || item.label}
                    onClick={() => triggerSelection(item)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                      borderRadius: 10, cursor: 'pointer',
                      background: isSelected ? `linear-gradient(135deg, ${secondaryColor}12, ${secondaryColor}22)` : 'transparent',
                      border: isSelected ? `1px solid ${secondaryColor}25` : '1px solid transparent',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    {item.type === 'patient' ? (
                      <>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${secondaryColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: secondaryColor, flexShrink: 0 }}>
                          👤
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? secondaryColor : 'var(--text-dark, #0a1e3d)' }}>{item.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted, #8fa3bc)' }}>Paciente · {item.telefono}</div>
                        </div>
                        {isSelected && <span style={{ fontSize: 11, color: secondaryColor, fontWeight: 700 }}>Ficha clínica ↵</span>}
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 15, width: 28, display: 'flex', justifyContent: 'center' }}>
                          {item.label.split(' ')[0]}
                        </div>
                        <div style={{ flex: 1, fontSize: 13.5, fontWeight: isSelected ? 700 : 500, color: isSelected ? secondaryColor : 'var(--text-dark, #0a1e3d)' }}>
                          {item.label.substring(item.label.indexOf(' ') + 1)}
                        </div>
                        {isSelected && <span style={{ fontSize: 11, color: secondaryColor, fontWeight: 700 }}>Ejecutar ↵</span>}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            
            {/* Guide footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px 4px', borderTop: '1px solid var(--border-lighter, #f1f5f9)', marginTop: 8, fontSize: 10, color: 'var(--text-muted, #8fa3bc)', fontWeight: 500 }}>
              <span>Navega con <kbd style={{ padding: '1px 4px', background: '#f1f5f9', borderRadius: 4 }}>↑↓</kbd> y selecciona con <kbd style={{ padding: '1px 4px', background: '#f1f5f9', borderRadius: 4 }}>Enter</kbd></span>
              <span>Cerrar con <kbd style={{ padding: '1px 4px', background: '#f1f5f9', borderRadius: 4 }}>ESC</kbd></span>
            </div>
          </div>
        </>
      )}

      {openNuevaCita && (
        <NuevaCitaModal
          onClose={() => setOpenNuevaCita(false)}
          onSuccess={() => {
            setOpenNuevaCita(false)
            // Reload page dynamically depending on where we are
            router.refresh()
          }}
        />
      )}
    </>
  )
}
