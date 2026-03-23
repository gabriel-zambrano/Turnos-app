import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = {
  title: 'DentalDesk — Od. Walter Benegas',
  description: 'Sistema de gestión odontológica',
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <style>{`
          @media (max-width: 767px) {
            .modal-box {
              border-radius: 12px !important;
              padding: 1.25rem !important;
              margin: 0.75rem !important;
              max-width: calc(100vw - 1.5rem) !important;
              width: calc(100vw - 1.5rem) !important;
            }
            .modal-overlay {
              align-items: center !important;
              padding: 0 !important;
            }
            .grid2 {
              grid-template-columns: 1fr !important;
              gap: 0 !important;
            }
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
