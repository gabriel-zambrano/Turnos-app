import React from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
  PLANES,
  PRECIOS_REGULARES,
  PRECIOS_FUNDADOR,
  CUPO_FUNDADORES,
  FEATURES_POR_PLAN,
  CUPOS_POR_PLAN,
  precioFormateado,
  type Plan,
} from '@/lib/planes'

export const metadata: Metadata = {
  title: 'Precios — DentalDesk',
  description:
    'Planes de DentalDesk en pesos, sin cotización ni vendedor de por medio. Cuesta menos que una consulta y se prueba gratis 14 días.',
}

// El contenido comercial de cada plan. Los precios, cupos y features vienen de
// planes.ts para que esta página no se desincronice de lo que cobra el checkout.
const COPY: Record<Plan, { nombre: string; para: string; destacado?: boolean }> = {
  starter: { nombre: 'Starter', para: 'Para el que arranca solo y quiere ordenar la agenda.' },
  pro: { nombre: 'Pro', para: 'Para el consultorio que quiere dejar de perder turnos.', destacado: true },
  business: { nombre: 'Business', para: 'Para varias sedes o equipos que miden todo.' },
}

const BASE = [
  'Agenda con detección de sobreturnos',
  'Ficha clínica y odontograma',
  'Portal del paciente',
  'Historia clínica y consentimientos firmados',
  'Facturación electrónica ARCA',
]

function featuresDeCopy(plan: Plan): { texto: string; incluido: boolean }[] {
  const f = FEATURES_POR_PLAN[plan]
  const cupos = CUPOS_POR_PLAN[plan]
  return [
    { texto: Number.isFinite(cupos) ? `${cupos} usuario${cupos === 1 ? '' : 's'}` : 'Usuarios ilimitados', incluido: true },
    ...BASE.map(texto => ({ texto, incluido: true })),
    { texto: 'Recordatorios automáticos de turno', incluido: f.recordatorios },
    { texto: 'Campañas por WhatsApp y CRM', incluido: f.whatsapp },
    { texto: 'Analítica del consultorio (BI)', incluido: f.bi },
  ]
}

const FAQ = [
  {
    p: '¿Por qué cobran en pesos?',
    r: 'Porque los sistemas que cobran en dólares te suben el precio cada vez que salta el tipo de cambio. Acá sabés exactamente qué vas a pagar el mes que viene.',
  },
  {
    p: '¿Cuánto dura la prueba?',
    r: '14 días con todas las funciones habilitadas, sin tarjeta. Si no seguís, no se te cobra nada.',
  },
  {
    p: '¿Puedo cambiar de plan?',
    r: 'Sí, cuando quieras. Al subir de plan se habilitan las funciones en el momento; al bajar, se mantienen hasta que termina el período pago.',
  },
  {
    p: '¿Qué pasa con mis datos si me voy?',
    r: 'Son tuyos. Exportás pacientes, turnos y facturas a Excel cuando quieras, sin pedir permiso ni esperar a soporte.',
  },
]

export default function Precios() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a122c', color: '#cbd5e1', fontFamily: 'Outfit, Inter, sans-serif', padding: '60px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 40, fontWeight: 800, color: '#fff', marginBottom: 12, letterSpacing: '-1px' }}>
            Cuesta menos que una consulta
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, maxWidth: 620, margin: '0 auto 20px' }}>
            Si te evita un solo ausente al mes, ya se pagó. Precios en pesos, publicados,
            sin cotización ni vendedor de por medio.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
            Precio Fundador para las primeras {CUPO_FUNDADORES} clínicas — congelado mientras sigas suscripto
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 64, alignItems: 'start' }}>
          {PLANES.map(plan => {
            const copy = COPY[plan]
            return (
              <div
                key={plan}
                style={{
                  background: copy.destacado ? 'rgba(56, 189, 248, 0.06)' : 'rgba(15, 23, 42, 0.6)',
                  border: copy.destacado ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 24,
                  padding: '32px 28px',
                  backdropFilter: 'blur(10px)',
                  position: 'relative',
                }}
              >
                {copy.destacado && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#38bdf8', color: '#0a122c', fontSize: 11, fontWeight: 800, padding: '5px 14px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    El más elegido
                  </div>
                )}

                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{copy.nombre}</h2>
                <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 24, minHeight: 40 }}>{copy.para}</p>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-1px' }}>
                      {precioFormateado(PRECIOS_FUNDADOR[plan])}
                    </span>
                    <span style={{ fontSize: 14, color: '#94a3b8' }}>/ mes</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    después {precioFormateado(PRECIOS_REGULARES[plan])} — el tuyo queda congelado
                  </div>
                </div>

                <Link
                  href="/registro"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    background: copy.destacado ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                    color: copy.destacado ? '#0a122c' : '#fff',
                    padding: '13px',
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: 'none',
                    marginBottom: 24,
                  }}
                >
                  Probar 14 días gratis
                </Link>

                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {featuresDeCopy(plan).map((f, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, color: f.incluido ? '#cbd5e1' : '#475569' }}>
                      <span style={{ color: f.incluido ? '#38bdf8' : '#334155', fontWeight: 700, flexShrink: 0 }}>
                        {f.incluido ? '✓' : '—'}
                      </span>
                      <span style={{ textDecoration: f.incluido ? 'none' : 'line-through' }}>{f.texto}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 24, padding: '40px 32px', marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 28, textAlign: 'center' }}>Preguntas frecuentes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
            {FAQ.map((f, i) => (
              <div key={i}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{f.p}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>{f.r}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b' }}>
          Precios en pesos argentinos, IVA incluido. Podés cancelar cuando quieras.{' '}
          <Link href="/legal/terminos" style={{ color: '#38bdf8', textDecoration: 'none' }}>Términos</Link>
          {' · '}
          <Link href="/legal/privacidad" style={{ color: '#38bdf8', textDecoration: 'none' }}>Privacidad</Link>
        </div>

      </div>
    </div>
  )
}
