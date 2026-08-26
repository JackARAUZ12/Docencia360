'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function OnboardingPage() {
  const [name, setName] = useState('')
  const [teacher, setTeacher] = useState(false)
  const [student, setStudent] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth'; return }
      const { data } = await supabase.from('profiles').select('full_name,is_teacher,is_student').eq('id', user.id).single()
      if (data) { setName(data.full_name || ''); setTeacher(data.is_teacher); setStudent(data.is_student) }
      setLoading(false)
    }
    load()
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!teacher && !student) { setMessage('Selecciona al menos una modalidad.'); return }
    setSaving(true); setMessage('')
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), is_teacher: teacher, is_student: student }).eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    if (error) setMessage(error.message)
    else window.location.href = '/'
    setSaving(false)
  }

  if (loading) return <main className="min-h-dvh grid place-items-center p-6 text-sm text-[var(--muted)]">Cargando…</main>

  return (
    <main className="min-h-dvh grid place-items-center p-5">
      <section className="w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
        <p className="text-sm font-bold tracking-wide text-[var(--primary)]">DOCENCIA360</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Configuremos tu espacio</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Puedes usar Docencia360 como profesor, estudiante o ambos.</p>
        <form onSubmit={save} className="mt-8 space-y-5">
          <label className="block text-sm font-medium">Nombre completo<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5 w-full rounded-xl border border-[var(--border)] px-4 py-3" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setTeacher(!teacher)} className={`rounded-2xl border p-5 text-left ${teacher ? 'border-[var(--primary)]' : 'border-[var(--border)]'}`}><span className="text-2xl">👨‍🏫</span><strong className="mt-2 block">Profesor</strong><span className="mt-1 block text-xs text-[var(--muted)]">Crea clases, actividades y evalúa.</span></button>
            <button type="button" onClick={() => setStudent(!student)} className={`rounded-2xl border p-5 text-left ${student ? 'border-[var(--primary)]' : 'border-[var(--border)]'}`}><span className="text-2xl">🎓</span><strong className="mt-2 block">Estudiante</strong><span className="mt-1 block text-xs text-[var(--muted)]">Únete a clases y completa actividades.</span></button>
          </div>
          {message && <p className="rounded-xl bg-[var(--background)] p-3 text-sm">{message}</p>}
          <button disabled={saving} className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)] disabled:opacity-60">{saving ? 'Guardando…' : 'Continuar'}</button>
        </form>
      </section>
    </main>
  )
}
