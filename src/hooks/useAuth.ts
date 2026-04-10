'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthed(true)
      } else {
        router.replace('/login')
      }
      setLoading(false)
    })
  }, [])

  return { loading, authed }
}
