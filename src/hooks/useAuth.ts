'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('AUTH:', event, !!session)
      if (event === 'INITIAL_SESSION') {
        if (!session) router.replace('/login')
        setReady(true)
      }
      if (event === 'SIGNED_OUT') router.replace('/login')
    })
    return () => subscription.unsubscribe()
  }, [])

  return { ready }
}
