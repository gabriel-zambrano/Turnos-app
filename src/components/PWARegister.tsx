'use client'

// Registra el service worker que hace instalable la app.
//
// Se registra después del load para no competir con el primer render, y solo
// en producción: en desarrollo un SW cacheando assets vuelve loco al hot reload.

import { useEffect } from 'react'

export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.error('No se pudo registrar el service worker:', err)
      })
    }

    if (document.readyState === 'complete') registrar()
    else window.addEventListener('load', registrar)

    return () => window.removeEventListener('load', registrar)
  }, [])

  return null
}
