import * as Sentry from '@sentry/nextjs'
import type { Metadata, Viewport } from 'next'
import { TenantProvider } from '@/components/TenantContext'
import { SubscriptionGate } from '@/components/SubscriptionGate'
import { PWARegister } from '@/components/PWARegister'
import './globals.css'

export function generateMetadata(): Metadata {
  return {
    title: 'DentalDesk',
    description: 'Sistema de gestión de turnos odontológicos',
    // PWA: con esto el navegador ofrece "Agregar a pantalla de inicio" y la app
    // se abre sin barra de direcciones, como una app nativa.
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      title: 'DentalDesk',
      statusBarStyle: 'black-translucent',
    },
    icons: {
      icon: '/icons/icon-192.png',
      apple: '/icons/apple-touch-icon.png',
    },
    other: {
      // `appleWebApp.capable` emite el meta viejo de Apple, que Chrome marca
      // como obsoleto. El estándar actual es este, y hay que declarar los dos:
      // iOS todavía lee el de Apple.
      'mobile-web-app-capable': 'yes',
      ...Sentry.getTraceData()
    }
  }
}

export const viewport: Viewport = {
  themeColor: '#0a1e3d',
  width: 'device-width',
  initialScale: 1,
  // El odontólogo trabaja con esto en el celular con una mano: dejamos que
  // pueda hacer zoom si necesita leer un dato chico.
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Fuentes: preconnect acelera el handshake; el link carga en paralelo
            (mucho mejor que el @import render-blocking que había en el CSS). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Solo los pesos realmente usados (400/500/600/700); el 300 no se usaba. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" />
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
        <PWARegister />
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