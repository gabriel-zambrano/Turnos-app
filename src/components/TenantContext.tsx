'use client'
import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
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
  subscriptionStatus?: string
  nextPaymentDate?: string | null
}


const DEFAULT_TENANT_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || ''

const defaultBranding = (id: string, name: string): TenantBranding => {
  return {
    id,
    nombre: name || 'Consultorio Dental',
    direccion: 'Av. Santa Fe 3329 1 B',
    telefono: '',
    logoUrl: undefined,
    primaryColor: '#0a1e3d',
    secondaryColor: '#185FA5',
    accentColor: '#138A6B',
    whatsappTemplate: `Hola {nombre_paciente},\n\nTe recordamos tu turno en *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n📍 Dirección: {direccion}\n\nConfirma o cancela tu turno acá:\n{link}`,
    plan: 'starter',
    feature_bi: true,
    feature_whatsapp: true,
    feature_recordatorios: true,
    subscriptionStatus: 'inactive',
    nextPaymentDate: null
  }
}

export interface TenantSummary {
  id: string
  nombre: string
}

interface TenantContextType {
  tenant: TenantBranding | null
  loading: boolean
  clinics: TenantSummary[]
}

const TenantContext = createContext<TenantContextType>({ tenant: null, loading: true, clinics: [] })

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantBranding | null>(null)
  const [loading, setLoading] = useState(true)
  const [clinics, setClinics] = useState<TenantSummary[]>([])
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function loadTenant() {
      try {
        const hostname = window.location.hostname

        // 1. Intentar resolver por usuario autenticado (para el dashboard)
        const { data: { session } } = await supabase.auth.getSession()

        let tenantData = null

        if (session?.user) {
          // Traemos de una sola vez la lista de tenant_id + nombre de cada clínica
          // a la que pertenece el usuario. Esto alimenta tanto la resolución del
          // tenant activo acá abajo, como el selector de clínicas del Sidebar
          // (así evitamos que el Sidebar tenga que repetir esta misma consulta).
          const { data: tuList } = await supabase
            .from('tenant_users')
            .select('tenant_id, tenants(id, nombre)')
            .eq('user_id', session.user.id)

          const misClinicas: TenantSummary[] = (tuList || [])
            .map((item: any) => {
              const t = Array.isArray(item.tenants) ? item.tenants[0] : item.tenants
              return t ? { id: t.id as string, nombre: t.nombre as string } : null
            })
            .filter((c): c is TenantSummary => c !== null)
          setClinics(misClinicas)

          if (tuList && tuList.length > 0) {
            let activeId = localStorage.getItem('active_tenant_id') || ''
            const isValidActive = activeId ? tuList.some(item => item.tenant_id === activeId) : false

            if (!activeId || !isValidActive) {
              activeId = tuList[0].tenant_id
              localStorage.setItem('active_tenant_id', activeId)
            }

            const { data: tData } = await supabase
              .from('tenants')
              .select('*')
              .eq('id', activeId)
              .single()
            tenantData = tData
          }
        }

        // 2. Si no hay usuario (ej. portal del paciente), resolver por hostname.
        //    Usamos la vista `tenants_public`, que expone SOLO columnas de branding.
        //    Antes esto leía `tenants` completo, lo que obligaba a una política
        //    permisiva que filtraba datos comerciales (plan, suscripción, MP) de
        //    todas las clínicas a cualquier visitante.
        if (!tenantData) {
          const { data } = await supabase
            .from('tenants_public')
            .select('*')
            .or(`custom_domain.eq.${hostname},subdominio_generico.eq.${hostname.split('.')[0]}`)
            .single()
          tenantData = data
        }

        if (tenantData) {
          const data = tenantData
          setTenant({
            id: data.id,
            nombre: data.nombre,
            direccion: data.direccion || 'Av. Santa Fe 3329 1 B',
            telefono: data.telefono || '',
            logoUrl: data.logourl || undefined,
            primaryColor: data.primarycolor || '#0a1e3d',
            secondaryColor: data.secondarycolor || '#185FA5',
            accentColor: data.accentcolor || '#138A6B',
            whatsappTemplate: data.whatsapptemplate || `Hola {nombre_paciente},\n\nTe recordamos tu turno en *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n📍 Dirección: {direccion}\n\nConfirma o cancela tu turno acá:\n{link}`,
            plan: data.plan || 'starter',
            feature_bi: data.feature_bi ?? false,
            feature_whatsapp: data.feature_whatsapp ?? false,
            feature_recordatorios: data.feature_recordatorios ?? false,
            subscriptionStatus: data.subscription_status || 'inactive',
            nextPaymentDate: data.next_payment_date || null
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
    <TenantContext.Provider value={{ tenant, loading, clinics }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenantContext() {
  return useContext(TenantContext)
}
