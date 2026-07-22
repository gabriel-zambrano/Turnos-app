import * as Sentry from '@sentry/nextjs'
import type { Metadata } from 'next'
import { TenantProvider } from '@/components/TenantContext'
import { SubscriptionGate } from '@/components/SubscriptionGate'
import './globals.css'

export function generateMetadata(): Metadata {
  return {
    title: 'DentalDesk',
    description: 'Sistema de gestión de turnos odontológicos',
    other: {
      ...Sentry.getTraceData()
    }
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              const saved = localStorage.getItem('theme');
              if (saved) {
                document.documentElement.setAttribute('data-theme', saved);
              } else {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
              }
            } catch (e) {}
          })();
        ` }} />
      </head>
      <body>
        <div className="aurora-bg">
          <div className="aurora-blob aurora-1"/>
          <div className="aurora-blob aurora-2"/>
          <div className="aurora-blob aurora-3"/>
          <div className="aurora-blob aurora-4"/>
        </div>
        <TenantProvider>
          <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
            <SubscriptionGate>
              {children}
            </SubscriptionGate>
          </div>
        </TenantProvider>
      </body>
    </html>
  )
}