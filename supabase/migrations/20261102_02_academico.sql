-- =====================================================================
-- DOCENCIA360 · 02 · Estructura académica compartida por las tres
-- modalidades. Cada modalidad usa el subconjunto que necesita:
--   profesor: asignaturas, cursos, grupos, estudiantes, asistencia,
--             evaluaciones/tareas, calificaciones, eventos.
--   academia: + cursos con precio, matrículas, finanzas, certificados.
--   colegio : + niveles, grados, secciones, periodos, aulas, horarios,
--             tutores, comunicados, boletines.
-- =====================================================================

create table public.periodos (
  id        uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  nombre    text not null,
  anio      text not null default extract(year from current_date)::text,
  inicio    date not null,
  fin       date not null check (fin >= inicio),
  orden     int  not null default 1,
  cerrado   boolean not null default false
);
create index on public.periodos(cuenta_id);

create table public.niveles (
  id        uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  nombre    text not null,
  orden     int not null default 1
);
create index on public.niveles(cuenta_id);

create table public.grados (
  id        uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  nivel_id  uuid references public.niveles(id) on delete set null,
  nombre    text not null,
  orden     int not null default 1
);
create index on public.grados(cuenta_id);

create table public.aulas (
  id        uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  nombre    text not null,
  capacidad int check (capacidad > 0)
);
create index on public.aulas(cuenta_id);

create table public.asignaturas (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 2 and 100),
  codigo      text,
  descripcion text,
  grado_id    uuid references public.grados(id) on delete set null,
  activo      boolean not null default true,
  creado      timestamptz not null default now()
);
create index on public.asignaturas(cuenta_id);

create table public.cursos (
  id               uuid primary key default gen_random_uuid(),
  cuenta_id        uuid not null references public.cuentas(id) on delete cascade,
  nombre           text not null check (length(trim(nombre)) between 2 and 120),
  descripcion      text,
  asignatura_id    uuid references public.asignaturas(id) on delete set null,
  duracion_semanas int check (duracion_semanas > 0),
  horas_totales    int check (horas_totales > 0),
  precio_matricula numeric(12,2) not null default 0 check (precio_matricula >= 0),
  mensualidad      numeric(12,2) not null default 0 check (mensualidad >= 0),
  modalidad_clase  text not null default 'presencial' check (modalidad_clase in ('presencial','virtual','mixta')),
  requisitos       text,
  certifica        boolean not null default false,
  activo           boolean not null default true,
  creado           timestamptz not null default now()
);
create index on public.cursos(cuenta_id);

-- Grupo (profesor/academia) o sección (colegio)
create table public.grupos (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  nombre        text not null check (length(trim(nombre)) between 1 and 100),
  curso_id      uuid references public.cursos(id) on delete set null,
  asignatura_id uuid references public.asignaturas(id) on delete set null,
  grado_id      uuid references public.grados(id) on delete set null,
  aula_id       uuid references public.aulas(id) on delete set null,
  turno         text check (turno in ('matutino','vespertino','nocturno','sabatino','dominical')),
  cupo          int check (cupo > 0),
  fecha_inicio  date,
  fecha_fin     date,
  estado        text not null default 'activo' check (estado in ('planificado','activo','finalizado','cancelado')),
  creado        timestamptz not null default now()
);
create index on public.grupos(cuenta_id);

-- Docente(s) asignados a un grupo; en colegio, uno por asignatura
create table public.grupo_docentes (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  miembro_id    uuid not null references public.miembros(id) on delete cascade,
  asignatura_id uuid references public.asignaturas(id) on delete cascade,
  es_guia       boolean not null default false
);
create unique index on public.grupo_docentes(grupo_id, miembro_id, coalesce(asignatura_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on public.grupo_docentes(miembro_id);

create table public.estudiantes (
  id                  uuid primary key default gen_random_uuid(),
  cuenta_id           uuid not null references public.cuentas(id) on delete cascade,
  codigo              text,
  nombres             text not null check (length(trim(nombres)) between 1 and 80),
  apellidos           text not null default '',
  fecha_nacimiento    date,
  genero              text check (genero in ('F','M','O')),
  documento           text,
  email               text,
  telefono            text,
  direccion           text,
  foto_url            text,
  contacto_nombre     text,
  contacto_telefono   text,
  contacto_parentesco text,
  estado              text not null default 'activo' check (estado in ('activo','inactivo','retirado','egresado')),
  observaciones       text,
  creado              timestamptz not null default now(),
  actualizado         timestamptz not null default now()
);
create index on public.estudiantes(cuenta_id, estado);
create unique index on public.estudiantes(cuenta_id, codigo) where codigo is not null;

create table public.grupo_estudiantes (
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  desde         date not null default current_date,
  estado        text not null default 'activo' check (estado in ('activo','retirado')),
  primary key (grupo_id, estudiante_id)
);
create index on public.grupo_estudiantes(estudiante_id);

create table public.horarios (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  asignatura_id uuid references public.asignaturas(id) on delete set null,
  miembro_id    uuid references public.miembros(id) on delete set null,
  aula_id       uuid references public.aulas(id) on delete set null,
  dia           smallint not null check (dia between 1 and 7),   -- 1 = lunes
  hora_inicio   time not null,
  hora_fin      time not null check (hora_fin > hora_inicio)
);
create index on public.horarios(cuenta_id, dia);

create table public.asistencias (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references public.cuentas(id) on delete cascade,
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  estudiante_id  uuid not null references public.estudiantes(id) on delete cascade,
  fecha          date not null,
  estado         text not null check (estado in ('presente','ausente','tarde','justificado')),
  nota           text,
  registrado_por uuid default auth.uid(),
  creado         timestamptz not null default now(),
  unique (grupo_id, estudiante_id, fecha)
);
create index on public.asistencias(cuenta_id, fecha);
create index on public.asistencias(estudiante_id);

create table public.asistencia_docentes (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  miembro_id uuid not null references public.miembros(id) on delete cascade,
  fecha      date not null,
  estado     text not null check (estado in ('presente','ausente','tarde','justificado')),
  nota       text,
  unique (miembro_id, fecha)
);

-- Evaluación o tarea dentro de un grupo
create table public.evaluaciones (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  asignatura_id uuid references public.asignaturas(id) on delete set null,
  periodo_id    uuid references public.periodos(id) on delete set null,
  titulo        text not null check (length(trim(titulo)) between 2 and 140),
  tipo          text not null default 'examen'
                check (tipo in ('examen','tarea','proyecto','practica','participacion','otro')),
  fecha         date not null default current_date,      -- fecha de aplicación o de entrega
  peso          numeric(6,2) not null default 0 check (peso >= 0 and peso <= 100),
  puntaje_max   numeric(6,2) not null default 100 check (puntaje_max > 0),
  descripcion   text,
  creado        timestamptz not null default now()
);
create index on public.evaluaciones(grupo_id);
create index on public.evaluaciones(cuenta_id, fecha);

create table public.calificaciones (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  evaluacion_id uuid not null references public.evaluaciones(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  puntaje       numeric(6,2) check (puntaje >= 0),
  entregado     boolean not null default true,
  comentario    text,
  actualizado   timestamptz not null default now(),
  unique (evaluacion_id, estudiante_id)
);
create index on public.calificaciones(estudiante_id);

create table public.eventos (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  titulo      text not null,
  fecha       date not null,
  hora_inicio time,
  hora_fin    time,
  tipo        text not null default 'general' check (tipo in ('general','clase','evaluacion','feriado','reunion','actividad')),
  grupo_id    uuid references public.grupos(id) on delete cascade,
  descripcion text
);
create index on public.eventos(cuenta_id, fecha);

create table public.observaciones (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  autor         uuid default auth.uid(),
  tipo          text not null default 'general' check (tipo in ('general','academica','conducta','salud','familia')),
  texto         text not null,
  creado        timestamptz not null default now()
);
create index on public.observaciones(estudiante_id);

-- ---------------------- Operación (academia / colegio) ----------------
create table public.matriculas (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  curso_id      uuid references public.cursos(id) on delete set null,
  grupo_id      uuid references public.grupos(id) on delete set null,
  anio          text,
  fecha         date not null default current_date,
  estado        text not null default 'activa'
                check (estado in ('pendiente','activa','completada','retirada','cancelada')),
  monto_matricula numeric(12,2) not null default 0,
  mensualidad   numeric(12,2) not null default 0,
  descuento_pct numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  beca          text,
  notas         text,
  creado        timestamptz not null default now()
);
create index on public.matriculas(cuenta_id, estado);
create index on public.matriculas(estudiante_id);

create table public.cargos (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  matricula_id  uuid references public.matriculas(id) on delete set null,
  concepto      text not null,
  tipo          text not null default 'mensualidad' check (tipo in ('matricula','mensualidad','colegiatura','material','otro')),
  monto         numeric(12,2) not null check (monto >= 0),
  descuento     numeric(12,2) not null default 0 check (descuento >= 0),
  vence         date not null,
  pagado        numeric(12,2) not null default 0,
  estado        text not null default 'pendiente' check (estado in ('pendiente','parcial','pagado','anulado')),
  creado        timestamptz not null default now()
);
create index on public.cargos(cuenta_id, estado, vence);
create index on public.cargos(estudiante_id);

create table public.pagos (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references public.cuentas(id) on delete cascade,
  estudiante_id  uuid not null references public.estudiantes(id) on delete cascade,
  cargo_id       uuid references public.cargos(id) on delete set null,
  monto          numeric(12,2) not null check (monto > 0),
  metodo         text not null default 'efectivo' check (metodo in ('efectivo','transferencia','tarjeta','deposito','otro')),
  referencia     text,
  fecha          date not null default current_date,
  recibo         bigint,
  anulado        boolean not null default false,
  registrado_por uuid default auth.uid(),
  creado         timestamptz not null default now(),
  unique (cuenta_id, recibo)
);
create index on public.pagos(cuenta_id, fecha);

create table public.certificados (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  curso_id      uuid references public.cursos(id) on delete set null,
  tipo          text not null default 'certificado' check (tipo in ('certificado','constancia','diploma')),
  titulo        text not null,
  folio         text not null unique,
  emitido       date not null default current_date,
  datos         jsonb not null default '{}'::jsonb,
  anulado       boolean not null default false,
  creado        timestamptz not null default now()
);

create table public.tutores_estudiantes (
  miembro_id    uuid not null references public.miembros(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  parentesco    text,
  primary key (miembro_id, estudiante_id)
);
create index on public.tutores_estudiantes(estudiante_id);

create table public.comunicados (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  titulo     text not null,
  cuerpo     text not null,
  audiencia  text not null default 'todos' check (audiencia in ('todos','personal','tutores','grupo')),
  grupo_id   uuid references public.grupos(id) on delete cascade,
  autor      uuid default auth.uid(),
  publicado  timestamptz not null default now()
);
create index on public.comunicados(cuenta_id, publicado desc);

create table public.notificaciones (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  miembro_id uuid references public.miembros(id) on delete cascade,   -- null = para gestores
  tipo       text not null,
  titulo     text not null,
  cuerpo     text,
  enlace     text,
  clave      text,          -- evita duplicar la misma alerta automática
  leida      boolean not null default false,
  creado     timestamptz not null default now()
);
create unique index on public.notificaciones(cuenta_id, clave) where clave is not null;
create index on public.notificaciones(cuenta_id, leida, creado desc);
