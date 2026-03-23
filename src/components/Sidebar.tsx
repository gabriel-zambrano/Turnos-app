'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { DARK } from './UI'

const NAV = [
  { href: '/',              label: 'Dashboard',     icon: 'grid'  },
  { href: '/agenda',        label: 'Agenda',        icon: 'cal'   },
  { href: '/pacientes',     label: 'Pacientes',     icon: 'users' },
  { href: '/recordatorios', label: 'Recordatorios', icon: 'bell'  },
]

const ICONS: Record<string, React.ReactNode> = {
  grid:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  cal:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  users: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  bell:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  out:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
}

export function Sidebar({ pendientes = 0 }: { pendientes?: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Mobile: barra inferior
  if (isMobile) {
    return (
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 64, background: '#fff', borderTop: '1px solid #e2e8ed', display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 100, fontFamily: 'DM Sans, sans-serif' }}>
        {NAV.map(item => {
          const active = pathname === item.href
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0.5rem 1rem', border: 'none', background: 'transparent', cursor: 'pointer', color: active ? DARK : '#aaa', fontFamily: 'DM Sans, sans-serif', position: 'relative' }}>
              <span style={{ color: active ? DARK : '#aaa' }}>{ICONS[item.icon]}</span>
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{item.label}</span>
              {item.href === '/agenda' && pendientes > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 8, background: '#EF9F27', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10 }}>{pendientes}</span>
              )}
            </button>
          )
        })}
      </nav>
    )
  }

  // Desktop: sidebar lateral
  return (
    <aside style={{ width: 240, background: '#fff', borderRight: '1px solid #e2e8ed', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 100, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8ed' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
              <path d="M12 2C8.5 2 6 4.5 6 7.5c0 2 .8 3.8 1.5 5.5C8.5 15.5 9 19 9 21c0 .6.4 1 1 1s1-.4 1-1v-3c0-.6.4-1 1-1s1 .4 1 1v3c0 .6.4 1 1 1s1-.4 1-1c0-2 .5-5.5 1.5-8C17.2 11.3 18 9.5 18 7.5 18 4.5 15.5 2 12 2z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>DentalDesk</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>Gestión inteligente</div>
          </div>
        </div>
        <div style={{ background: '#f0f4f7', border: '1px solid #e2e8ed', borderRadius: 10, padding: '0.6rem 0.85rem', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#dce8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: DARK, flexShrink: 0 }}>WB</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: DARK }}>Od. Walter Benegas</div>
            <div style={{ fontSize: 10, color: '#aaa' }}>Odontología General</div>
          </div>
        </div>
      </div>
      <nav style={{ flex: 1, padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 10, color: '#b0bec5', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 0.5rem 0.25rem', fontWeight: 600 }}>Principal</div>
        {NAV.map(item => {
          const active = pathname === item.href
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.75rem', borderRadius: 8, fontSize: 13.5, fontWeight: active ? 600 : 400, color: active ? DARK : '#6b8a9e', cursor: 'pointer', border: 'none', background: active ? '#eaf0f5' : 'transparent', width: '100%', textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>
              <span style={{ opacity: active ? 1 : 0.6, display: 'flex' }}>{ICONS[item.icon]}</span>
              {item.label}
              {item.href === '/agenda' && pendientes > 0 && (
                <span style={{ marginLeft: 'auto', background: '#EF9F27', color: '#fff', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10 }}>{pendientes}</span>
              )}
            </button>
          )
        })}
      </nav>
      <div style={{ padding: '1rem 0.75rem', borderTop: '1px solid #e2e8ed' }}>
        <button onClick={() => router.push('/login')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.75rem', borderRadius: 8, fontSize: 13, color: '#b0bec5', cursor: 'pointer', border: 'none', background: 'transparent', width: '100%', fontFamily: 'DM Sans, sans-serif' }}>
          <span style={{ opacity: 0.6, display: 'flex' }}>{ICONS['out']}</span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
