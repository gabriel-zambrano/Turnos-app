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


const DEFAULT_TENANT_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || ''

const defaultBranding = (id: string, name: string): TenantBranding => {
  return {
    id,
    nombre: name || 'Consultorio Dental',
    direccion: 'Dirección del consultorio',
    telefono: '',
    logoUrl: undefined,
    primaryColor: '#0a1e3d',
    secondaryColor: '#185FA5',
    accentColor: '#138A6B',
    whatsappTemplate: `Hola {nombre_paciente},\n\nTe recordamos tu turno en *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n\nConfirma o cancela tu turno acá:\n{link}`,
    plan: 'starter',
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
        
        // 1. Intentar resolver por usuario autenticado (para el dashboard)
        const { data: { session } } = await supabase.auth.getSession()
        
        let tenantData = null

        if (session?.user) {
          const { data: tuData } = await supabase
            .from('tenant_users')
            .select('tenant_id')
            .eq('user_id', session.user.id)
            .single()
            
          if (tuData?.tenant_id) {
            const { data: tData } = await supabase
              .from('tenants')
              .select('*')
              .eq('id', tuData.tenant_id)
              .single()
            tenantData = tData
          }
        }

        // 2. Si no hay usuario (ej. portal del paciente), intentar por hostname
        if (!tenantData) {
          const { data } = await supabase
            .from('tenants')
            .select('*')
            .or(`custom_domain.eq.${hostname},subdominio_generico.eq.${hostname.split('.')[0]}`)
            .eq('activo', true)
            .single()
          tenantData = data
        }

        if (tenantData) {
          const data = tenantData
          setTenant({
            id: data.id,
            nombre: data.nombre,
            direccion: data.direccion || 'Dirección del consultorio',
            telefono: data.telefono || '',
            logoUrl: data.logoUrl || undefined,
            primaryColor: data.primaryColor || '#0a1e3d',
            secondaryColor: data.secondaryColor || '#185FA5',
            accentColor: data.accentColor || '#138A6B',
            whatsappTemplate: data.whatsappTemplate || `Hola {nombre_paciente},\n\nTe recordamos tu turno en *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n\nConfirma o cancela tu turno acá:\n{link}`,
            plan: data.plan || 'starter',
            feature_bi: data.feature_bi ?? false,
            feature_whatsapp: data.feature_whatsapp ?? false,
            feature_recordatorios: data.feature_recordatorios ?? false
          })
        } else if (DEFAULT_TENANT_ID) {
          // Fallback a Dr. Walter Benegas en localhost/dev
          setTenant(defaultBranding(DEFAULT_TENANT_ID, 'Dr. Walter Benegas'))
        } else {
          setTenant(null)
        }
      } catch (err) {
        console.error('Error resolving tenant:', err)
        if (DEFAULT_TENANT_ID) {
          setTenant(defaultBranding(DEFAULT_TENANT_ID, 'Dr. Walter Benegas'))
        } else {
          setTenant(null)
        }
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
