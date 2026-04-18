import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Tenant {
  id: string
  nombre: string
  plan: string
  activo: boolean
  feature_bi: boolean
  feature_whatsapp: boolean
  feature_recordatorios: boolean
  max_pacientes: number
  max_citas_mes: number
  custom_domain: string | null
  subdominio_generico: string | null
}

interface UseTenantReturn {
  tenant: Tenant | null
  loading: boolean
  canUseBi: boolean
  canUseWhatsapp: boolean
  canUseRecordatorios: boolean
}

export function useTenant(): UseTenantReturn {
  const supabase = createClient()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadTenant() {
      const hostname = window.location.hostname

      const { data } = await supabase
        .from('tenants')
        .select('*')
        .or(`custom_domain.eq.${hostname},subdominio_generico.eq.${hostname.split('.')[0]}`)
        .eq('activo', true)
        .single()

      setTenant(data)
      setLoading(false)
    }

    loadTenant()
  }, [])

  return {
    tenant,
    loading,
    canUseBi: tenant?.feature_bi ?? false,
    canUseWhatsapp: tenant?.feature_whatsapp ?? false,
    canUseRecordatorios: tenant?.feature_recordatorios ?? false,
  }
}
