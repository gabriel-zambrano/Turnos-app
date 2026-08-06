'use client'
import { Sidebar } from '@/components/Sidebar'

// ─────────────────────────────────────────────────────────────
// El armazón de las pantallas del consultorio: menú + contenido.
//
// Reemplaza a este bloque, que estaba copiado en unas veinte pantallas —a
// veces tres veces en el mismo archivo, una por cada estado (cargando, error,
// normal)—:
//
//   <div style={{ display:'flex', minHeight:'100vh', fontFamily:'DM Sans' }}>
//     <Sidebar />
//     <main style={{ marginLeft: isMobile ? 0 : 'var(--sidebar-width, 240px)',
//                    paddingBottom: isMobile ? 80 : 0, flex:1, minWidth:0 }}>
//
// El problema no era la repetición: era que `isMobile` salía de
// window.innerWidth medido en un useEffect. El servidor no conoce el ancho de
// la pantalla, así que renderizaba siempre la versión de escritorio y el
// teléfono corregía el layout DESPUÉS de la primera pintura. Se veía como un
// salto del contenido en cada carga, y agregar una pantalla nueva significaba
// acordarse del conjuro: olvidarlo se veía como contenido tapado por el menú.
//
// Ahora el desplazamiento lo resuelve el navegador, que sí sabe el ancho antes
// de pintar. Ver `.app-main` en globals.css.
// ─────────────────────────────────────────────────────────────

export function AppShell({
  children,
  /** Cantidad para el globito de Recordatorios en el menú. */
  pendientes,
  /**
   * Centra el contenido en la pantalla. Para los estados de carga y de error,
   * que muestran una sola cosa en el medio.
   */
  centrado = false,
}: {
  children: React.ReactNode
  pendientes?: number
  centrado?: boolean
}) {
  return (
    <div className="app-shell">
      <Sidebar pendientes={pendientes} />
      <main className={centrado ? 'app-main app-main--centrado' : 'app-main'}>
        {children}
      </main>
    </div>
  )
}
