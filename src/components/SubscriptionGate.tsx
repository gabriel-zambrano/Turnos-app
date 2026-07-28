'use client'
import React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTenantContext } from './TenantContext'
import { isSubscriptionActive } from '@/lib/subscription'
import { esRutaSinSuscripcion } from '@/lib/rutas-publicas'

// La lista de rutas exentas vivía acá, duplicada de la del middleware, y las
// dos se desincronizaron: /reserva era pública para el middleware pero no para
// este gate, así que un paciente que entraba por el link de Instagram veía
// "Tu suscripción está vencida" en vez de poder pedir turno. Ahora sale de
// lib/rutas-publicas.ts, que es la única lista.

/**
 * Gate de suscripción en un único punto (montado en el layout raíz).
 * Bloquea las rutas privadas de la app cuando la suscripción de la clínica
 * activa está vencida o cancelada, y ofrece ir a renovar.
 *
 * Nota: es una barrera de negocio del lado del cliente. Los datos ya están
 * protegidos por RLS a nivel de base; este gate fuerza la renovación en la UI.
 * Un corte "duro" server-side (middleware) queda como endurecimiento futuro.
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/'
  const { tenant, loading } = useTenantContext()

  // No bloqueamos en rutas exentas, durante la carga, ni si no hay tenant
  // resuelto (las páginas ya muestran su propio spinner mientras carga).
  if (esRutaSinSuscripcion(pathname) || loading || !tenant) {
    return <>{children}</>
  }

  if (isSubscriptionActive(tenant.subscriptionStatus, tenant.nextPaymentDate)) {
    return <>{children}</>
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          background: '#fff',
          border: '1px solid #e8edf2',
          borderRadius: 20,
          padding: '2.5rem 2rem',
          textAlign: 'center',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0a1e3d', margin: '0 0 8px' }}>
          Tu suscripción está vencida
        </h1>
        <p style={{ fontSize: 14, color: '#4a6080', lineHeight: 1.5, margin: '0 0 24px' }}>
          Para seguir usando <strong>{tenant.nombre}</strong> necesitás renovar tu plan.
          Tus datos están a salvo y vas a recuperar el acceso apenas se confirme el pago.
        </p>
        <Link
          href="/configuracion?tab=suscripcion"
          style={{
            display: 'inline-block',
            background: '#185FA5',
            color: '#fff',
            padding: '12px 28px',
            borderRadius: 10,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Renovar suscripción
        </Link>
      </div>
    </div>
  )
}
