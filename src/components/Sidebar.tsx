'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useTenantContext } from '@/components/TenantContext'
import { CommandPalette } from '@/components/CommandPalette'

const NAV = [
  { href: '/dashboard',              label: 'Dashboard',    icon: 'grid'  },
  { href: '/agenda',                 label: 'Agenda',       icon: 'cal'   },
  { href: '/pacientes',              label: 'Pacientes',    icon: 'users' },
  { href: '/seguimiento',            label: 'Alertas',      icon: 'radar' },
  { href: '/recordatorios',          label: 'Recordatorios',       icon: 'bell'  },
  { href: '/bi',                     label: 'Analitica',    icon: 'chart' },
  { href: '/finanzas',               label: 'Finanzas',     icon: 'money' },
  { href: '/admin/tratamientos',     label: 'Precios',      icon: 'trat', adminOnly: true },
  { href: '/equipo',                 label: 'Equipo',       icon: 'users', adminOnly: true },
  { href: '/configuracion',          label: 'Configuración',icon: 'settings' },
]

const ICONS: Record<string, React.ReactNode> = {
  grid:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  cal:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  users: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  bell:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  radar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  chart: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  out:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  trat:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  money: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  sun:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
  moon:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>,
  more:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.0" strokeLinecap="round"><circle cx="12" cy="12" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>,
  chevronLeft: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  chevronRight: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
}

export function Sidebar({ pendientes }: { pendientes?: number }) {
  const path = usePathname()
  const router = useRouter()
  const { tenant, loading: tenantLoading } = useTenantContext()
  const [isMobile, setIsMobile] = useState(false)
  const [theme, setTheme] = useState<'light'|'dark'>('light')
  
  // Desktop collapse state
  const [collapsed, setCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)
  
  // Mobile bottom sheet state
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as 'light'|'dark' || 'light'
      setTheme(savedTheme)
      document.documentElement.setAttribute('data-theme', savedTheme)

      const savedCollapse = localStorage.getItem('sidebar_collapsed') === 'true'
      setCollapsed(savedCollapse)
      document.documentElement.style.setProperty('--sidebar-width', isMobile ? '0px' : savedCollapse ? '52px' : '240px')
    }
  }, [isMobile])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar_collapsed', String(next))
    document.documentElement.style.setProperty('--sidebar-width', isMobile ? '0px' : next ? '52px' : '240px')
  }

  // Mobile Bottom Sheet Navigation
  if (isMobile) {
    const activeColor = tenant?.secondaryColor || '#185FA5'
    
    // Split navigation: 4 main actions + "Más"
    const mobileCoreItems = NAV.filter(item => !item.adminOnly).slice(0, 4)
    const mobileMoreItems = NAV.filter((item, idx) => item.adminOnly || idx >= 4)

    return (
      <>
        <nav className="mobile-nav-floating">
          {mobileCoreItems.map(item => {
            const active = path === item.href || (item.href !== '/dashboard' && path?.startsWith(item.href))
            return (
              <button key={item.href} onClick={() => router.push(item.href)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 4px', borderRadius: 14, border: 'none', background: active ? `linear-gradient(135deg, ${activeColor}15, ${activeColor}25)` : 'transparent', color: active ? activeColor : '#8fa3bc', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', position: 'relative', minWidth: 0 }}>
                {ICONS[item.icon]}
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{item.label}</span>
              </button>
            )}
          )}
          <button onClick={() => setShowMoreMenu(true)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 4px', borderRadius: 14, border: 'none', background: showMoreMenu ? `linear-gradient(135deg, ${activeColor}15, ${activeColor}25)` : 'transparent', color: showMoreMenu ? activeColor : '#8fa3bc', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', position: 'relative', minWidth: 0 }}>
            {ICONS.more}
            <span style={{ fontSize: 10, fontWeight: showMoreMenu ? 700 : 500 }}>Más</span>
            {pendientes && pendientes > 0 ? (
              <span style={{ position: 'absolute', top: 4, right: '25%', background: activeColor, color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{pendientes}</span>
            ) : null}
          </button>
        </nav>

        {/* Mobile "Más" Bottom Sheet Modal */}
        {showMoreMenu && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,61,0.55)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 env(safe-area-inset-bottom,0)' }} onClick={() => setShowMoreMenu(false)}>
            <div style={{ background: 'var(--bg-modal, #fff)', borderRadius: '24px 24px 0 0', padding: '1.5rem', width: '100%', maxWidth: 480, boxShadow: '0 -12px 40px rgba(10,30,61,0.18)' }} onClick={e => e.stopPropagation()}>
              <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--border-color, #e2e8f0)', margin: '0 auto 1.25rem' }}/>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-dark, #0a1e3d)', marginBottom: '1rem', textAlign: 'center' }}>Menú de Opciones</div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: '1rem' }}>
                {mobileMoreItems.map(item => {
                  const active = path === item.href || (item.href !== '/dashboard' && path?.startsWith(item.href))
                  return (
                    <button key={item.href} onClick={() => { router.push(item.href); setShowMoreMenu(false) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: active ? `1px solid ${activeColor}25` : '1px solid var(--border-color)', background: active ? `linear-gradient(135deg, ${activeColor}12, ${activeColor}22)` : 'var(--bg-card, #fff)', color: active ? activeColor : 'var(--text-dark, #0a1e3d)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: active ? 700 : 500, justifyContent: 'flex-start', textAlign: 'left' }}>
                      {ICONS[item.icon]}
                      <span>{item.label}</span>
                      {item.icon === 'bell' && pendientes && pendientes > 0 ? (
                        <span style={{ marginLeft: 'auto', background: activeColor, color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{pendientes}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={toggleTheme} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-dark)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  {theme === 'light' ? ICONS.moon : ICONS.sun}
                  <span>{theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}</span>
                </button>
                <button onClick={() => setShowMoreMenu(false)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'var(--text-dark)', color: 'var(--bg-modal, #fff)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
        <CommandPalette />
      </>
    )
  }

  const secondaryColor = tenant?.secondaryColor || '#185FA5'
  const primaryColor = tenant?.primaryColor || '#0a1e3d'
  const accentColor = tenant?.accentColor || '#138A6B'

  const showExpanded = !collapsed || hovered
  const currentWidth = showExpanded ? 240 : 52

  return (
    <aside 
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => collapsed && setHovered(false)}
      style={{ 
        width: currentWidth, 
        minHeight: '100vh', 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        background: 'var(--bg-container, rgba(255,255,255,0.72))', 
        backdropFilter: 'blur(20px)', 
        borderRight: '1px solid var(--border-light, rgba(56,138,221,0.12))', 
        display: 'flex', 
        flexDirection: 'column', 
        zIndex: 100,
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      {/* Header */}
      <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid var(--border-light, rgba(56,138,221,0.08))', display: 'flex', alignItems: 'center', justifyContent: showExpanded ? 'space-between' : 'center', gap: 6, minHeight: 63, overflow: 'hidden' }}>
        {showExpanded ? (
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark, #0a1e3d)', letterSpacing: '-0.3px' }}>DentalDesk</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted, #8fa3bc)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tenantLoading ? 'Cargando...' : tenant?.nombre}</div>
          </div>
        ) : (
          <div style={{ fontSize: 20, cursor: 'pointer', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.05))' }} onClick={toggleCollapse}>🦷</div>
        )}

        {showExpanded && (
          <button onClick={toggleCollapse} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #8fa3bc)', padding: 4, display: 'flex', borderRadius: '50%', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            {collapsed ? ICONS.chevronRight : ICONS.chevronLeft}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '0.75rem 0.5rem', overflowX: 'hidden' }}>
        {NAV.map(item => {
          const active = path === item.href || (item.href !== '/dashboard' && path?.startsWith(item.href))
          return (
            <button 
              key={item.href} 
              onClick={() => router.push(item.href)} 
              className="btn-premium" 
              title={collapsed && !hovered ? item.label : undefined}
              style={{ 
                width: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: showExpanded ? 'flex-start' : 'center', 
                gap: showExpanded ? 10 : 0, 
                padding: '10px 12px', 
                borderRadius: 10, 
                border: active ? `1px solid ${secondaryColor}25` : '1px solid transparent', 
                background: active ? `linear-gradient(135deg, ${secondaryColor}12, ${secondaryColor}22)` : 'transparent', 
                color: active ? secondaryColor : 'var(--text-muted, #8fa3bc)', 
                cursor: 'pointer', 
                fontFamily: 'DM Sans, sans-serif', 
                fontSize: 13, 
                fontWeight: active ? 700 : 500, 
                marginBottom: 4, 
                textAlign: 'left', 
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{ display: 'flex', flexShrink: 0 }}>
                {ICONS[item.icon]}
              </div>
              {showExpanded && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
              
              {/* Badges */}
              {item.icon === 'bell' && pendientes && pendientes > 0 ? (
                showExpanded ? (
                  <span style={{ marginLeft: 'auto', background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})`, color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{pendientes}</span>
                ) : (
                  <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})` }} />
                )
              ) : null}
            </button>
          )
        })}
      </nav>

      {/* Footer Actions */}
      <div style={{ padding: '0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border-light, rgba(56,138,221,0.08))', overflow: 'hidden' }}>
        <button 
          onClick={toggleTheme} 
          className="quick-action-btn" 
          title={collapsed && !hovered ? (theme === 'light' ? 'Modo Oscuro' : 'Modo Claro') : undefined}
          style={{ 
            width: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: showExpanded ? 'flex-start' : 'center', 
            gap: showExpanded ? 10 : 0, 
            padding: '10px 12px', 
            borderRadius: 10, 
            border: '1px solid var(--border-color)', 
            background: 'var(--bg-input)', 
            color: 'var(--text-dark)', 
            cursor: 'pointer', 
            fontFamily: 'DM Sans, sans-serif', 
            fontSize: 13, 
            fontWeight: 700 
          }}
        >
          <div style={{ display: 'flex', flexShrink: 0 }}>
            {theme === 'light' ? ICONS.moon : ICONS.sun}
          </div>
          {showExpanded && <span style={{ whiteSpace: 'nowrap' }}>{theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}</span>}
        </button>

        {collapsed && !hovered ? (
          <button 
            onClick={toggleCollapse} 
            className="quick-action-btn"
            title="Expandir menú"
            style={{ 
              width: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              padding: '10px 12px', 
              borderRadius: 10, 
              border: 'none', 
              background: 'transparent', 
              color: 'var(--text-muted, #8fa3bc)', 
              cursor: 'pointer' 
            }}
          >
            {ICONS.chevronRight}
          </button>
        ) : null}

        {showExpanded && (
          <div style={{ fontSize: 9, color: 'var(--text-muted, #c5d4e8)', textAlign: 'center', letterSpacing: '0.05em', marginTop: 4, whiteSpace: 'nowrap' }}>DentalDesk v1.0</div>
        )}
      </div>
      <CommandPalette />
    </aside>
  )
}
