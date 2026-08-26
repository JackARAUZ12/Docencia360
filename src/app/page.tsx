'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Home() {
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        window.location.href = '/onboarding'
      } else {
        window.location.href = '/auth'
      }
      setChecking(false)
    }
    checkSession()
  }, [])

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--primary)] text-lg font-black text-white">D</div>
        <p className="mt-4 text-sm font-bold tracking-[0.18em] text-[var(--primary)]">DOCENCIA360</p>
        <p className="mt-2 text-sm text-[var(--muted)]">{checking ? 'Preparando tu espacio…' : 'Redirigiendo…'}</p>
      </div>
    </main>
  )
}
