'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (!session) {
          router.replace('/login')
        }
        setLoading(false)
      } else if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
    })
  }, [router])

  return { loading }
}
