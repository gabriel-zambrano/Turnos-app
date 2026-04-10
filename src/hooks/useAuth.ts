'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      console.log('AUTH EVENT:', event, 'SESSION:', session?.user?.email)
      if (event === 'INITIAL_SESSION') {
        if (!session) router.replace('/login')
      } else if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
    })
  }, [router])
}
