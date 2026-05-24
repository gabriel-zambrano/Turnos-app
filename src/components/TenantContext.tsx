'use client'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface TenantBranding {
  id: string
  nombre: string
  direccion: string
  telefono: string
  logoUrl?: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  whatsappTemplate: string
  plan: string
  feature_bi: boolean
  feature_whatsapp: boolean
  feature_recordatorios: boolean
}

// Registro estático de marcas por ID de tenant para máxima seguridad y evitar alteraciones a la BD
export const TENANT_REGISTRY: Record<string, Omit<TenantBranding, 'id' | 'plan' | 'feature_bi' | 'feature_whatsapp' | 'feature_recordatorios'>> = {
  '2845c423-affa-4ca2-9c5f-f4ec8e35701a': {
    nombre: 'Dr. Walter Benegas',
    direccion: 'Av. Santa Fe 3329 1° B, Palermo, CABA',
    telefono: '+5491123972395',
    logoUrl: '/walterlogo-transparent.png',
    primaryColor: '#0a1e3d',
    secondaryColor: '#185FA5',
    accentColor: '#138A6B',
    whatsappTemplate: `Hola {nombre_paciente},\n\nTe recordamos tu turno con el *Dr. Walter Benegas*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n\nConfirma o cancela tu turno acá:\n{link}\n\nRecordá que los turnos no cancelados con más de 48hs de anticipación o no asistidos deben ser abonados.\n\n_Consultorio Dr. Walter Benegas - Av. Santa Fe 3329 1 B - Palermo, CABA_`
  }
}

const DEFAULT_TENANT_ID = '2845c423-affa-4ca2-9c5f-f4ec8e35701a'

const defaultBranding = (id: string, name: string): TenantBranding => {
  const registry = TENANT_REGISTRY[id] || {
    nombre: name || 'Consultorio Dental',
    direccion: 'Dirección del consultorio',
    telefono: '',
    logoUrl: undefined,
    primaryColor: '#0a1e3d',
    secondaryColor: '#185FA5',
    accentColor: '#138A6B',
    whatsappTemplate: `Hola {nombre_paciente},\n\nTe recordamos tu turno en *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n\nConfirma o cancela tu turno acá:\n{link}`
  }
  return {
    id,
    ...registry,
    plan: 'pro',
    feature_bi: true,
    feature_whatsapp: true,
    feature_recordatorios: true
  }
}

interface TenantContextType {
  tenant: TenantBranding | null
  loading: boolean
}

const TenantContext = createContext<TenantContextType>({ tenant: null, loading: true })

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantBranding | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadTenant() {
      try {
        const hostname = window.location.hostname
        
        // Intentar resolver desde base de datos
        const { data, error } = await supabase
          .from('tenants')
          .select('*')
          .or(`custom_domain.eq.${hostname},subdominio_generico.eq.${hostname.split('.')[0]}`)
          .eq('activo', true)
          .single()

        if (data) {
          const registry = TENANT_REGISTRY[data.id] || {
            nombre: data.nombre,
            direccion: 'Dirección del consultorio',
            telefono: '',
            logoUrl: undefined,
            primaryColor: '#0a1e3d',
            secondaryColor: '#185FA5',
            accentColor: '#138A6B',
            whatsappTemplate: `Hola {nombre_paciente},\n\nTe recordamos tu turno en *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n\nConfirma o cancela tu turno acá:\n{link}`
          }
          setTenant({
            id: data.id,
            nombre: data.nombre,
            direccion: registry.direccion,
            telefono: registry.telefono,
            logoUrl: registry.logoUrl,
            primaryColor: registry.primaryColor,
            secondaryColor: registry.secondaryColor,
            accentColor: registry.accentColor,
            whatsappTemplate: registry.whatsappTemplate,
            plan: data.plan || 'starter',
            feature_bi: data.feature_bi ?? false,
            feature_whatsapp: data.feature_whatsapp ?? false,
            feature_recordatorios: data.feature_recordatorios ?? false
          })
        } else {
          // Fallback a Dr. Walter Benegas en localhost/dev
          setTenant(defaultBranding(DEFAULT_TENANT_ID, 'Dr. Walter Benegas'))
        }
      } catch (err) {
        console.error('Error resolving tenant:', err)
        setTenant(defaultBranding(DEFAULT_TENANT_ID, 'Dr. Walter Benegas'))
      } finally {
        setLoading(false)
      }
    }
    loadTenant()
  }, [])

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenantContext() {
  return useContext(TenantContext)
}
