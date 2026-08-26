# Docencia360 — Arquitectura inicial

## Objetivo

Docencia360 es un SaaS mobile-first para profesores y estudiantes. La primera versión debe priorizar claridad, velocidad y acciones frecuentes con pocos pasos.

## Principios de producto

- Mobile-first: diseñar primero para 360–430 px.
- Responsive real: tablet y desktop amplían la experiencia, no la redefinen.
- Una acción frecuente debe poder completarse en 2–4 pasos.
- Interfaz basada en tarjetas, estados, acciones contextuales y navegación inferior en móvil.
- Datos privados por usuario y clase mediante RLS.
- No crear tablas o módulos futuros hasta que sus relaciones estén claras.

## Roles

Un usuario puede ser estudiante, profesor o ambos. No se debe modelar como un único rol excluyente.

- `is_student`: acceso a clases en las que participa como estudiante.
- `is_teacher`: capacidad de crear y administrar sus propias clases.

## Núcleo de datos

```text
profiles
  ├── subjects
  └── classes
         └── class_members
                └── profiles (student)
```

### `profiles`
Identidad pública de aplicación vinculada 1:1 con `auth.users`.

### `subjects`
Catálogo reutilizable de materias.

### `classes`
Grupo académico creado por un profesor. Contiene materia, grado/grupo, código de acceso y estado.

### `class_members`
Relación muchos-a-muchos entre clases y estudiantes.

## Próximos módulos

Los módulos siguientes dependerán del núcleo anterior:

```text
classes
  ├── attendance
  ├── assignments
  │      └── assignment_submissions
  ├── exams
  │      ├── exam_questions
  │      └── exam_attempts
  ├── grades
  ├── lesson_plans
  └── materials
```

## Orden de implementación

1. Auth + sesión.
2. Onboarding de perfil.
3. Activación de profesor/estudiante.
4. Crear clase.
5. Unirse a clase mediante código.
6. Vista de miembros.
7. Asistencia.
8. Tareas y entregas.
9. Calificaciones.
10. Exámenes virtuales.
11. Planificación y materiales.
12. Notificaciones y analítica.
13. IA como capa opcional.

## Seguridad

- Todas las tablas de negocio deben tener RLS.
- Nunca confiar en `user_metadata` para autorización.
- Las funciones `SECURITY DEFINER` deben tener `search_path` controlado y privilegios mínimos.
- El cliente solo usa una clave publicable; secretos nunca se envían al frontend.
- Cada política debe responder explícitamente: quién puede leer, crear, modificar y eliminar.

## UX móvil

Navegación principal prevista:

`Inicio | Clases | + | Actividad | Perfil`

El botón central `+` será contextual para crear rápidamente clase, tarea, examen, asistencia u otra actividad.

## Estado actual

La base inicial de Supabase ya contiene `profiles`, `subjects`, `classes` y `class_members`, con RLS y función de unión por código. El frontend todavía no se ha construido; primero se completa y endurece la base central.
