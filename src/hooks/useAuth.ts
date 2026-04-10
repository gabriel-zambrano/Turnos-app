'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    // Si hay flag de sessionStorage, confiar en que está autenticado
    // y verificar en background
    const flag = sessionStorage.getItem('authed')
    if (flag) {
      setAuthed(true)
      setLoading(false)
      // Verificar en background igual
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          sessionStorage.removeItem('authed')
          setAuthed(false)
          router.replace('/login')
        }
      })
      return
    }

    // Sin flag, verificar normalmente
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
