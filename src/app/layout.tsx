import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DentalDesk — Od. Walter Benegas',
  description: 'Sistema de gestión odontológica',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
