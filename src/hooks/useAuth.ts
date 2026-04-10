'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const router = useRouter()
  const checked = useRef(false)

  useEffect(() => {
    // Primero intentar getSession (sincrónico desde localStorage)
    supabase.auth.getSession().then(({ data: { session } }) => {
      checked.current = true
      if (!session) {
        router.replace('/login')
      }
    })

    // Escuchar cambios posteriores
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [])
}
