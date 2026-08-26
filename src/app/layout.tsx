import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Docencia360',
  description: 'Plataforma para docentes y estudiantes.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
