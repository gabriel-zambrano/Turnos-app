'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useTenantContext } from '@/components/TenantContext'

const NAV = [
  { href: '/dashboard',              label: 'Dashboard',    icon: 'grid'  },
  { href: '/agenda',                 label: 'Agenda',       icon: 'cal'   },
  { href: '/pacientes',              label: 'Pacientes',    icon: 'users' },
  { href: '/seguimiento',            label: 'Seguim.',      icon: 'radar' },
  { href: '/recordatorios',          label: 'Turnos',       icon: 'bell'  },
  { href: '/bi',                     label: 'Analitica',    icon: 'chart' },
  { href: '/finanzas',               label: 'Finanzas',     icon: 'money' },
  { href: '/admin/tratamientos',     label: 'Precios',      icon: 'trat', adminOnly: true },
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
  sun:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
  moon:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>,
}

export function Sidebar({ pendientes }: { pendientes?: number }) {
  const path = usePathname()
  const router = useRouter()
  const { tenant, loading: tenantLoading } = useTenantContext()
  const [isMobile, setIsMobile] = useState(false)
  const [theme, setTheme] = useState<'light'|'dark'>('light')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as 'light'|'dark' || 'light'
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  if (isMobile) {
    const activeColor = tenant?.secondaryColor || '#185FA5'
    return (
      <nav className="mobile-nav-floating">
        {NAV.filter(item => !item.adminOnly).map(item => {
          const active = path === item.href || (item.href !== '/dashboard' && path?.startsWith(item.href))
          return (
            <button key={item.href} onClick={() => router.push(item.href)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 4px', borderRadius: 14, border: 'none', background: active ? `linear-gradient(135deg, ${activeColor}15, ${activeColor}25)` : 'transparent', color: active ? activeColor : '#8fa3bc', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', position: 'relative', minWidth: 0 }}>
              {item.icon === 'bell' && pendientes && pendientes > 0
                ? <span style={{ position: 'relative', display: 'inline-flex' }}>
                    {ICONS[item.icon]}
                    <span style={{ position: 'absolute', top: -4, right: -6, background: activeColor, color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{pendientes}</span>
                  </span>
                : ICONS[item.icon]
              }
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{item.label}</span>
            </button>
          )
        })}
        <button onClick={toggleTheme} style={{ flex: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 4px', borderRadius: 14, border: 'none', background: 'transparent', color: '#8fa3bc', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          {theme === 'light' ? ICONS.moon : ICONS.sun}
          <span style={{ fontSize: 10, fontWeight: 500 }}>Tema</span>
        </button>
      </nav>
    )
  }

  const secondaryColor = tenant?.secondaryColor || '#185FA5'
  const primaryColor = tenant?.primaryColor || '#0a1e3d'
  const accentColor = tenant?.accentColor || '#138A6B'

  return (
    <aside style={{ width: 240, minHeight: '100vh', position: 'fixed', top: 0, left: 0, background: 'var(--bg-container, rgba(255,255,255,0.72))', backdropFilter: 'blur(20px)', borderRight: '1px solid var(--border-light, rgba(56,138,221,0.12))', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
      <div style={{ padding: '1.5rem 1.25rem 1rem', borderBottom: '1px solid var(--border-light, rgba(56,138,221,0.08))' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark, #0a1e3d)', letterSpacing: '-0.3px' }}>DentalDesk</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted, #8fa3bc)', marginTop: 2 }}>{tenantLoading ? 'Cargando...' : tenant?.nombre}</div>
      </div>

      <nav style={{ flex: 1, padding: '0.75rem 0.75rem' }}>
        {NAV.map(item => {
          const active = path === item.href || (item.href !== '/dashboard' && path?.startsWith(item.href))
          return (
            <button key={item.href} onClick={() => router.push(item.href)} className="btn-premium" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: active ? `1px solid ${secondaryColor}25` : '1px solid transparent', background: active ? `linear-gradient(135deg, ${secondaryColor}12, ${secondaryColor}22)` : 'transparent', color: active ? secondaryColor : 'var(--text-muted, #8fa3bc)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: active ? 600 : 400, marginBottom: 2, textAlign: 'left', position: 'relative' }}>
              {ICONS[item.icon]}
              {item.label}
              {item.icon === 'grid' && pendientes && pendientes > 0
                ? <span style={{ marginLeft: 'auto', background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})`, color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{pendientes}</span>
                : null
              }
            </button>
          )
        })}
      </nav>

      <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-light, rgba(56,138,221,0.08))' }}>
        <button onClick={toggleTheme} className="quick-action-btn" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-dark)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 500 }}>
          {theme === 'light' ? ICONS.moon : ICONS.sun}
          {theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}
        </button>
        <div style={{ fontSize: 10, color: 'var(--text-muted, #c5d4e8)', textAlign: 'center', letterSpacing: '0.05em', marginTop: 4 }}>DentalDesk v1.0</div>
      </div>
    </aside>
  )
}
