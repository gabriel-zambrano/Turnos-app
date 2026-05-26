'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NuevaCitaRedirect() {
  const router = useRouter()
  
  useEffect(() => {
    router.replace('/dashboard?nueva=true')
  }, [router])

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-page,#f0f4f8)',fontFamily:'DM Sans, sans-serif'}}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin 1s linear infinite'}}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span style={{fontSize:13,color:'#8fa3bc',fontWeight:500}}>Redirigiendo...</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}