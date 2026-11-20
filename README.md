# Docencia360

Toda la gestión educativa, en un solo lugar. SaaS para **profesores independientes**, **academias** y **colegios** de Nicaragua y Latinoamérica.

## Estado del proyecto

| Parte | Estado |
|---|---|
| Base de datos, seguridad (RLS), planes y suscripciones | ✅ Etapa 1 |
| Acceso con código (institución + código personal) | ✅ Etapa 1 |
| Registro, recuperación de contraseña, selector de cuentas | ✅ Etapa 1 |
| Panel **Profesor independiente** (todos sus módulos) | ✅ Etapa 1 |
| Panel de administrador (dueño del SaaS, entra por `admin/entrar.html`) | ✅ Etapa 1 |
| Panel **Academias** (matrículas, finanzas, instructores, certificados, informes) | ✅ Etapa 2 |
| Panel **Colegios** (estructura, horarios, notas por corte, boletines, matrícula escolar) | ✅ Etapa 3 |
| **Portal de familias** para padres y tutores | ✅ Etapa 3 |
| Cuentas de **demostración** (profesor, academia y colegio, por rol) | ✅ |
| **Importar estudiantes** desde Excel (.xlsx) o CSV | ✅ |
| Términos de uso y política de privacidad, con aceptación registrada | ✅ (revisar con un abogado) |
| Cobro en línea con tarjeta | ❌ No implementado: los pagos se registran a mano en el panel de administrador |

## Tecnología

- **Frontend:** HTML + JavaScript (módulos ES) sin paso de compilación. Se publica en cualquier hosting estático (GitHub Pages, Netlify, dominio propio).
- **Backend:** Supabase (Postgres + Auth + Edge Functions), proyecto `srhgoiovnnpaiddfehah` (organización Agenda360).
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
admin/entrar.html     Entrada del administrador (correo y contraseña)
admin/index.html      Panel de administrador (solo plataforma_admins)
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
4. En el panel de administrador (`admin/entrar.html`) → Parámetros, escribe tu número en `publico.contacto_whatsapp`, tu nombre o empresa en `publico.titular` y tu correo en `publico.correo_contacto` (aparecen en los términos y la privacidad).

## Modo sin internet (híbrido)

Docencia360 funciona con y sin conexión. Internet sirve para registrarse, entrar por primera vez y **guardar y proteger** la información en el servidor.

- **Con internet** todo va directo a Supabase y se guarda una copia de lo consultado en el equipo (IndexedDB, por usuario).
- **Sin internet** se ve la última copia y se puede: pasar lista, poner notas, crear y editar estudiantes, grupos y horarios, y cobrar con **comprobante provisional** (código `P-XXXXXX`).
- Lo guardado sin conexión queda en una bandeja y **se sube solo y en orden** al volver el internet, con la sesión del usuario: el servidor vuelve a revisar permisos (RLS).
- **Cobros sin duplicados:** cada cobro lleva una clave única (`p_clave`). Si se reenvía, el servidor devuelve el mismo recibo. Si el concepto ya se pagó en otro equipo, el dinero queda como saldo a favor (no se pierde). La caja no deja cerrar con cobros sin subir y avisa de los que llegaron después del cierre.
- Lo que el servidor rechace se muestra en el aviso de arriba con el motivo y las opciones «Reintentar» o «Descartar».
- **Siempre necesitan internet:** registro, primer inicio de sesión, matricular, aula de estudiantes, inscripción en línea, cambiar de plan y cerrar caja.
- **Al cerrar sesión** se borra la copia de consulta del equipo. Los cambios sin subir se conservan para la próxima vez que esa cuenta entre en el mismo equipo.
- **La app se guarda en el equipo** (`sw.js`, instalable con `manifest.webmanifest`). Con internet siempre usa la versión más nueva.
- **Al cambiar archivos de la app** hay que regenerar la lista que usa `sw.js`. La prueba `tests/ui/sin_internet.mjs` falla si quedó desactualizada.

```bash
node herramientas/generar-sw.mjs
```

Código: `assets/js/core/offline.js` (copia, bandeja y subida), `assets/js/core/conexion.js` (aviso y bandeja), migración `41_sin_conexion`.

## Programa de escritorio (Windows)

Docencia360 también se instala como programa de Windows (`escritorio/`, hecho con Electron).

- **Funciona sin internet:** abre desde sus propios archivos, no desde la página web, e incluye el modo sin internet completo (copia local, bandeja de cambios, cobros con comprobante provisional).
- **Con internet:** guarda y protege todo en Supabase, igual que la web.
- **Ventana y enlaces:** una sola ventana a la vez. Los enlaces externos (WhatsApp, correo, página web) se abren en el navegador.
- **Impresión:** se imprime con la impresora instalada en Windows (térmica USB o Bluetooth ya agregada).
- **Actualizaciones:** se actualiza solo desde «Releases» de GitHub (menú Ayuda → Buscar actualizaciones). La versión nueva se instala al cerrar el programa.
- **Enlaces de los correos:** al confirmar la cuenta o recuperar la contraseña, el enlace abre la página web. Configura la dirección en `assets/js/config.js` (`sitioWeb`). Si queda vacía, se usa la «Site URL» de Supabase.

**Publicar una versión** (GitHub la construye en Windows y la publica en Releases con instalador, versión portable y actualización automática):

```bash
git tag escritorio-v1.0.1
```

```bash
git push origin escritorio-v1.0.1
```

**Probar o construir en Linux:**

```bash
cd escritorio
```

```bash
npm install
```

```bash
npm run portable
```

Eso genera `dist/Docencia360-Portable-x.y.z.exe`. El instalador completo (`npm run instalador`) necesita Windows o el flujo de GitHub.

La prueba automática del programa se corre con `xvfb-run -a node tests/ui/escritorio.mjs`.

Sin certificado de firma de código, Windows muestra «Windows protegió su PC» la primera vez. El usuario toca «Más información» y luego «Ejecutar de todas formas». Con un certificado (de 100 a 400 USD al año) el aviso desaparece.

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
