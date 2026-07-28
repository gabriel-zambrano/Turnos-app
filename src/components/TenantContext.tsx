'use client'
import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { featureHabilitada, FEATURES_TRIAL } from '@/lib/planes'

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
  /** Dominio propio de la clínica, si tiene. Los links del paciente salen de acá. */
  customDomain?: string | null
  /** Identificador de la clínica en las URLs públicas: /reserva/<slug>. */
  slug?: string | null
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
    direccion: '',
    telefono: '',
    logoUrl: undefined,
    primaryColor: '#0a1e3d',
    secondaryColor: '#185FA5',
    accentColor: '#138A6B',
    whatsappTemplate: `Hola {nombre_paciente},\n\nTe recordamos tu turno en *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n📍 Dirección: {direccion}\n\nConfirma o cancela tu turno acá:\n{link}`,
    // Fallback de desarrollo: se comporta como un trial, con todo habilitado.
    plan: 'starter',
    customDomain: null,
    slug: null,
    feature_bi: FEATURES_TRIAL.bi,
    feature_whatsapp: FEATURES_TRIAL.whatsapp,
    feature_recordatorios: FEATURES_TRIAL.recordatorios,
    subscriptionStatus: 'trial',
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
        // Se saca el www: la clínica tiene cargado el dominio sin él, y si no
        // lo quitáramos, `hostname.split('.')[0]` daría "www" y no resolvería
        // ninguna clínica.
        const hostname = window.location.hostname.replace(/^www\./, '')

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
            const misIds = tuList.map(item => item.tenant_id)

            // El dominio manda por encima de la clínica guardada.
            //
            // Antes esto miraba solo `active_tenant_id` del localStorage, así
            // que entrando a turnos.walterbenegas.com.ar se podía cargar otra
            // clínica —la última que se hubiera elegido en ese dispositivo— con
            // su agenda vacía y su nombre en el saludo. Si el host corresponde a
            // una clínica del usuario, esa gana: es lo que el usuario pidió al
            // escribir esa dirección.
            let activeId = ''
            const { data: porDominio } = await supabase
              .from('tenants')
              .select('id')
              .or(`custom_domain.eq.${hostname},subdominio_generico.eq.${hostname.split('.')[0]}`)
              .limit(1)
              .maybeSingle()

            if (porDominio?.id && misIds.includes(porDominio.id)) {
              activeId = porDominio.id
              localStorage.setItem('active_tenant_id', activeId)
            }

            // Sin coincidencia por dominio (dominio de la plataforma, localhost),
            // vale la última clínica elegida.
            if (!activeId) {
              activeId = localStorage.getItem('active_tenant_id') || ''
              if (!activeId || !misIds.includes(activeId)) {
                activeId = tuList[0].tenant_id
                localStorage.setItem('active_tenant_id', activeId)
              }
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
          // Lo que la clínica puede usar sale del plan contratado. Las columnas
          // feature_* son concesiones manuales del panel de admin: solo suman.
          // Durante el trial se habilita todo, para que vea el producto entero.
          const plan = data.plan || 'starter'
          const enTrial = (data.subscription_status || '') === 'trial'
          setTenant({
            id: data.id,
            nombre: data.nombre,
            direccion: data.direccion || '',
            telefono: data.telefono || '',
            logoUrl: data.logourl || undefined,
            primaryColor: data.primarycolor || '#0a1e3d',
            secondaryColor: data.secondarycolor || '#185FA5',
            accentColor: data.accentcolor || '#138A6B',
            whatsappTemplate: data.whatsapptemplate || `Hola {nombre_paciente},\n\nTe recordamos tu turno en *{nombre_clinica}*:\n\n{dia_semana} {fecha} a las *{hora}hs*\n{tratamiento}\n📍 Dirección: {direccion}\n\nConfirma o cancela tu turno acá:\n{link}`,
            plan,
            customDomain: data.custom_domain || null,
            slug: data.subdominio_generico || data.subdominio || null,
            feature_bi: featureHabilitada('bi', plan, data.feature_bi, enTrial),
            feature_whatsapp: featureHabilitada('whatsapp', plan, data.feature_whatsapp, enTrial),
            feature_recordatorios: featureHabilitada('recordatorios', plan, data.feature_recordatorios, enTrial),
            // Sin dato, se deja indefinido a propósito, NO 'inactive'.
            //
            // Un visitante anónimo resuelve la clínica por la vista
            // `tenants_public`, que expone solo branding y no trae el estado de
            // suscripción. Al convertir ese hueco en 'inactive' —un estado que
            // el gate considera cortado— la página pública de reserva mostraba
            // "Tu suscripción está vencida" a los pacientes de una clínica que
            // estaba al día. `isSubscriptionActive` ya trata la ausencia de
            // datos como activo, que es el criterio correcto: no cortarle el
            // acceso a nadie por falta de información.
            subscriptionStatus: data.subscription_status ?? undefined,
            nextPaymentDate: data.next_payment_date || null
          })
        } else if (DEFAULT_TENANT_ID) {
          // Fallback genérico al tenant por defecto (localhost/dev)
          setTenant(defaultBranding(DEFAULT_TENANT_ID, ''))
        } else {
          setTenant(null)
        }
      } catch (err) {
        console.error('Error resolving tenant:', err)
        if (DEFAULT_TENANT_ID) {
          setTenant(defaultBranding(DEFAULT_TENANT_ID, ''))
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
