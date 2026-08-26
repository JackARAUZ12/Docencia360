'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isTeacher, setIsTeacher] = useState(true)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const supabase = createClient()

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, is_teacher: isTeacher } },
      })
      if (error) setMessage(error.message)
      else setMessage('Cuenta creada. Revisa tu correo si la confirmación está activada.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
      else window.location.href = '/'
    }
    setLoading(false)
  }

  return (
    <main className="min-h-dvh grid place-items-center p-5">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <div className="mb-8">
          <p className="text-sm font-bold tracking-wide text-[var(--primary)]">DOCENCIA360</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {mode === 'login' ? 'Entra a tu espacio de trabajo.' : 'Empieza a construir tu espacio docente.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <label className="block text-sm font-medium">
              Nombre completo
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1.5 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none" />
            </label>
          )}
          <label className="block text-sm font-medium">
            Correo electrónico
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="mt-1.5 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none" />
          </label>
          <label className="block text-sm font-medium">
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="mt-1.5 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none" />
          </label>

          {mode === 'signup' && (
            <button type="button" onClick={() => setIsTeacher(!isTeacher)} className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-left text-sm">
              {isTeacher ? '👨‍🏫 Me estoy registrando como profesor' : '🎓 Me estoy registrando como estudiante'}
              <span className="mt-1 block text-xs text-[var(--muted)]">Puedes habilitar ambas capacidades después.</span>
            </button>
          )}

          {message && <p className="rounded-xl bg-[var(--background)] p-3 text-sm text-[var(--muted)]">{message}</p>}

          <button disabled={loading} className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)] disabled:opacity-60">
            {loading ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }} className="mt-5 w-full text-center text-sm font-medium text-[var(--primary)]">
          {mode === 'login' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Iniciar sesión'}
        </button>
      </section>
    </main>
  )
}
