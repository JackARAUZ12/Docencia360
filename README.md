# Docencia360

Toda la gestión educativa, en un solo lugar. SaaS para **profesores independientes**, **academias** y **colegios** de Nicaragua y Latinoamérica.

## Estado del proyecto

| Parte | Estado |
|---|---|
| Base de datos, seguridad (RLS), planes y suscripciones | ✅ Etapa 1 |
| Acceso con código (institución + código personal) | ✅ Etapa 1 |
| Registro, recuperación de contraseña, selector de cuentas | ✅ Etapa 1 |
| Panel **Profesor independiente** (todos sus módulos) | ✅ Etapa 1 |
| Panel maestro (dueño del SaaS) | ✅ Etapa 1 |
| Panel **Academias** (matrículas, finanzas, instructores, certificados, informes) | ✅ Etapa 2 |
| Panel **Colegios** (estructura, horarios, notas por corte, boletines, matrícula escolar) | ✅ Etapa 3 |
| **Portal de familias** para padres y tutores | ✅ Etapa 3 |
| Cuentas de **demostración** (profesor, academia y colegio, por rol) | ✅ |
| Cobro en línea con tarjeta | ❌ No implementado: los pagos se registran a mano en el panel maestro |

## Tecnología

- **Frontend:** HTML + JavaScript (módulos ES) sin paso de compilación. Se publica en cualquier hosting estático (GitHub Pages, Netlify, dominio propio).
- **Backend:** Supabase (Postgres + Auth + Edge Functions), proyecto `mxsfdvpxsbakvsometpk`.
- **Librería:** `@supabase/supabase-js` 2.45.4, incluida en `assets/vendor/` (sin CDN).
- **Tipografía:** Atkinson Hyperlegible (Google Fonts).

## Estructura

```
index.html            Página pública con precios reales (de la base)
entrar.html           Acceso con código o con correo
registro.html         Alta de cuenta en 3 pasos
recuperar.html        Recuperar contraseña (dueños de cuenta)
cuentas.html          Elegir cuenta si perteneces a varias
verificar.html        Verificación pública de certificados por folio
app/profesor.html     Panel del profesor (módulos en assets/js/profesor/)
app/academia.html     Panel de academias (módulos en assets/js/academia/)
app/colegio.html      Panel de colegios (módulos en assets/js/colegio/)
app/familias.html     Portal de padres y tutores (assets/js/familias/)
admin/index.html      Panel maestro (solo plataforma_admins)
assets/css/           Sistema de diseño (d360.css) + estilos por modalidad
assets/js/core/       Conexión, sesión, componentes, iconos, núcleo de paneles
assets/js/comun/      Módulos compartidos entre modalidades (estudiantes, grupos, asistencia, notas…)
supabase/migrations/  Esquema completo, en orden
supabase/functions/   Edge Function acceso-codigo
supabase/tests/       Pruebas de seguridad en SQL
tests/ui/             Prueba de humo de la interfaz (Playwright)
docs/                 Arquitectura, seguridad y precios
```

## Publicar

1. Sube el repositorio a un hosting estático (en GitHub Pages: Settings → Pages → rama principal).
2. En Supabase → Authentication → URL Configuration, agrega la URL del sitio en **Site URL** y **Redirect URLs** (para confirmación de correo y recuperación).
3. Opcional: en la Edge Function `acceso-codigo`, define el secreto `D360_ORIGENES` con tu dominio (por ejemplo `https://docencia360.com`) para restringir CORS.
4. En el panel maestro → Parámetros, escribe tu número en `publico.contacto_whatsapp`.

## Pruebas

```bash
# Seguridad de la base (Postgres local con un stub mínimo de Supabase)
psql -d prueba -f supabase/tests/stub_supabase.sql
psql -d prueba -f supabase/migrations/<cada archivo en orden>
psql -d prueba -f supabase/tests/rls_test.sql
psql -d prueba -f supabase/tests/academia_test.sql
# o todo junto, con Postgres 16 instalado:
bash supabase/tests/correr.sh
```

```bash
# Interfaz (requiere servidor estático en :8080)
python3 -m http.server 8080 &
node tests/ui/prueba-interfaz.mjs
```

Más detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md), [docs/SEGURIDAD.md](docs/SEGURIDAD.md) y [docs/PRECIOS.md](docs/PRECIOS.md).
