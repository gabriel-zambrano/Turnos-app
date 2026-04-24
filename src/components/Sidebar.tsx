'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const NAV = [
  { href: '/dashboard',     label: 'Dashboard',  icon: 'grid'  },
  { href: '/agenda',        label: 'Agenda',     icon: 'cal'   },
  { href: '/pacientes',     label: 'Pacientes',  icon: 'users' },
  { href: '/seguimiento',   label: 'Seguim.',    icon: 'radar' },
  { href: '/recordatorios', label: 'Turnos',     icon: 'bell'  },
  { href: '/bi',            label: 'Analítica',  icon: 'chart' },
]

const ICONS: Record<string, React.ReactNode> = {
  grid:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  cal:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  users: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  bell:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  radar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  chart: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  out:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
}

export function Sidebar({ pendientes }: { pendientes?: number }) {
  const path = usePathname()
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (isMobile) {
    return (
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 64, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(56,138,221,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 100, padding: '0 8px' }}>
        {NAV.map(item => {
          const active = path === item.href || (item.href !== '/dashboard' && path?.startsWith(item.href))
          return (
            <button key={item.href} onClick={() => router.push(item.href)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 12, border: 'none', background: active ? 'linear-gradient(135deg,#e8f0fc,#dbeeff)' : 'transparent', color: active ? '#185FA5' : '#8fa3bc', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', position: 'relative', minWidth: 0 }}>
              {item.icon === 'bell' && pendientes && pendientes > 0
                ? <span style={{ position: 'relative', display: 'inline-flex' }}>
                    {ICONS[item.icon]}
                    <span style={{ position: 'absolute', top: -4, right: -6, background: '#185FA5', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{pendientes}</span>
                  </span>
                : ICONS[item.icon]
              }
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{item.label}</span>
            </button>
          )
        })}
      </nav>
    )
  }

  return (
    <aside style={{ width: 240, minHeight: '100vh', position: 'fixed', top: 0, left: 0, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', borderRight: '1px solid rgba(56,138,221,0.12)', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
      <div style={{ padding: '1.5rem 1.25rem 1rem', borderBottom: '1px solid rgba(56,138,221,0.08)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0a1e3d', letterSpacing: '-0.3px' }}>DentalDesk</div>
        <div style={{ fontSize: 11, color: '#8fa3bc', marginTop: 2 }}>Od. Walter Benegas</div>
      </div>

      <nav style={{ flex: 1, padding: '0.75rem 0.75rem' }}>
        {NAV.map(item => {
          const active = path === item.href || (item.href !== '/dashboard' && path?.startsWith(item.href))
          return (
            <button key={item.href} onClick={() => router.push(item.href)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: active ? '1px solid rgba(56,138,221,0.2)' : '1px solid transparent', background: active ? 'linear-gradient(135deg,#e8f0fc,#dbeeff)' : 'transparent', color: active ? '#185FA5' : '#8fa3bc', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: active ? 600 : 400, marginBottom: 2, textAlign: 'left', position: 'relative' }}>
              {ICONS[item.icon]}
              {item.label}
              {item.icon === 'grid' && pendientes && pendientes > 0
                ? <span style={{ marginLeft: 'auto', background: 'linear-gradient(135deg,#185FA5,#378ADD)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{pendientes}</span>
                : null
              }
            </button>
          )
        })}
      </nav>

      <div style={{ padding: '1rem 0.75rem', borderTop: '1px solid rgba(56,138,221,0.08)' }}>
        <div style={{ fontSize: 10, color: '#c5d4e8', textAlign: 'center', letterSpacing: '0.05em' }}>DentalDesk v1.0</div>
      </div>
    </aside>
  )
}
