-- =====================================================================
-- DOCENCIA360 · 01 · Núcleo: plataforma, planes, cuentas, miembros,
-- suscripciones, auditoría.
-- Toda tabla con datos de un cliente lleva cuenta_id y RLS activado.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Plataforma (dueño del SaaS)
-- ---------------------------------------------------------------------
create table public.plataforma_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creado  timestamptz not null default now()
);

create table public.config_global (
  clave       text primary key,
  valor       jsonb not null,
  descripcion text,
  actualizado timestamptz not null default now()
);

-- Secretos del servidor (pepper para códigos). Sin políticas: nadie
-- desde la API puede leerla; solo funciones SECURITY DEFINER.
create table public.secretos_servidor (
  clave text primary key,
  valor text not null
);
insert into public.secretos_servidor(clave, valor)
values ('pepper_codigos', encode(extensions.gen_random_bytes(32), 'hex'));

create table public.planes (
  id               text primary key,
  modalidad        text not null check (modalidad in ('profesor','academia','colegio')),
  nombre           text not null,
  orden            int  not null default 1,
  resumen          text,
  precio_usd       numeric(10,2) not null check (precio_usd >= 0),
  precio_nio       numeric(10,2) not null check (precio_nio >= 0),
  max_estudiantes  int,            -- null = ilimitado
  max_docentes     int,
  max_grupos       int,
  max_admins       int,
  almacenamiento_mb int not null default 200,
  funciones        jsonb not null default '{}'::jsonb,
  activo           boolean not null default true,
  actualizado      timestamptz not null default now()
);

create table public.promociones (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique check (codigo ~ '^[A-Z0-9-]{3,30}$'),
  descripcion   text,
  descuento_pct numeric(5,2) not null check (descuento_pct > 0 and descuento_pct <= 100),
  modalidad     text check (modalidad in ('profesor','academia','colegio')),
  meses         int not null default 1 check (meses between 1 and 24),
  valido_hasta  date,
  usos_max      int,
  usos          int not null default 0,
  activo        boolean not null default true,
  creado        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Cuentas (cada profesor, academia o colegio es una cuenta aislada)
-- ---------------------------------------------------------------------
create table public.cuentas (
  id          uuid primary key default gen_random_uuid(),
  modalidad   text not null check (modalidad in ('profesor','academia','colegio')),
  nombre      text not null check (length(trim(nombre)) between 2 and 120),
  codigo      text not null unique,          -- código de institución para el acceso
  propietario uuid not null references auth.users(id),
  pais        text not null default 'NI',
  moneda      text not null default 'NIO' check (moneda in ('NIO','USD')),
  telefono    text,
  email       text,
  direccion   text,
  logo_url    text,
  config      jsonb not null default '{}'::jsonb,
  onboarding_completo boolean not null default false,
  creado      timestamptz not null default now()
);
create index on public.cuentas(propietario);

create table public.suscripciones (
  cuenta_id   uuid primary key references public.cuentas(id) on delete cascade,
  plan_id     text not null references public.planes(id),
  estado      text not null default 'prueba'
              check (estado in ('prueba','activa','vencida','suspendida','cancelada')),
  inicio      date not null default current_date,
  vence       date not null,
  dias_gracia int  not null default 5 check (dias_gracia between 0 and 60),
  promocion_id uuid references public.promociones(id),
  notas       text,
  actualizado timestamptz not null default now()
);

create table public.pagos_suscripcion (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  plan_id       text not null references public.planes(id),
  monto         numeric(12,2) not null check (monto >= 0),
  moneda        text not null check (moneda in ('NIO','USD')),
  metodo        text not null default 'transferencia',
  referencia    text,
  periodo_desde date not null,
  periodo_hasta date not null,
  registrado_por uuid references auth.users(id),
  creado        timestamptz not null default now()
);
create index on public.pagos_suscripcion(cuenta_id);

-- ---------------------------------------------------------------------
-- Miembros: personas que entran a una cuenta (dueño, docentes,
-- coordinadores, padres...). Cada miembro tiene su propio usuario de
-- Auth, así RLS sabe exactamente quién es.
-- ---------------------------------------------------------------------
create table public.miembros (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  nombre        text not null check (length(trim(nombre)) between 2 and 120),
  email         text,
  telefono      text,
  rol           text not null check (rol in ('propietario','director','subdirector','coordinador',
                                              'administrativo','finanzas','docente','tutor')),
  especialidad  text,
  documento     text,
  activo        boolean not null default true,
  codigo_ultimos text,          -- últimos 2 dígitos del código para identificarlo, nunca el código
  ultimo_acceso timestamptz,
  creado        timestamptz not null default now(),
  unique (cuenta_id, user_id)
);
create index on public.miembros(user_id);
create index on public.miembros(cuenta_id, rol);

-- Hash del código personal. Sin políticas RLS: inaccesible por API.
create table public.miembros_secretos (
  miembro_id  uuid primary key references public.miembros(id) on delete cascade,
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  codigo_hash text not null,
  actualizado timestamptz not null default now(),
  unique (cuenta_id, codigo_hash)
);

create table public.acceso_intentos (
  clave           text primary key,
  fallos          int not null default 0,
  bloqueado_hasta timestamptz,
  actualizado     timestamptz not null default now()
);

create table public.auditoria (
  id         bigint generated always as identity primary key,
  cuenta_id  uuid references public.cuentas(id) on delete cascade,
  user_id    uuid,
  accion     text not null,
  entidad    text,
  entidad_id text,
  detalle    jsonb,
  creado     timestamptz not null default now()
);
create index on public.auditoria(cuenta_id, creado desc);

-- =====================================================================
-- Funciones de autorización (SECURITY DEFINER, search_path fijo)
-- =====================================================================
create or replace function public.d360_es_plataforma_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from plataforma_admins where user_id = auth.uid());
$$;

create or replace function public.d360_mi_rol(p_cuenta uuid)
returns text language sql stable security definer set search_path = public as $$
  select rol from miembros
  where cuenta_id = p_cuenta and user_id = auth.uid() and activo
  limit 1;
$$;

create or replace function public.d360_mi_miembro(p_cuenta uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from miembros
  where cuenta_id = p_cuenta and user_id = auth.uid() and activo
  limit 1;
$$;

-- Personal de la institución (todo excepto padres/tutores)
create or replace function public.d360_es_personal(p_cuenta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.d360_mi_rol(p_cuenta) <> 'tutor', false);
$$;

-- Puede administrar la estructura académica y los expedientes
create or replace function public.d360_es_gestor(p_cuenta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.d360_mi_rol(p_cuenta) in
    ('propietario','director','subdirector','coordinador','administrativo'), false);
$$;

create or replace function public.d360_es_finanzas(p_cuenta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.d360_mi_rol(p_cuenta) in
    ('propietario','director','administrativo','finanzas'), false);
$$;

-- La suscripción permite escribir (prueba/activa, o vencida dentro de gracia)
create or replace function public.d360_cuenta_operativa(p_cuenta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from suscripciones s
    where s.cuenta_id = p_cuenta
      and s.estado in ('prueba','activa','vencida')
      and current_date <= s.vence + s.dias_gracia
  );
$$;

create or replace function public.d360_plan_de(p_cuenta uuid)
returns public.planes language sql stable security definer set search_path = public as $$
  select p.* from suscripciones s join planes p on p.id = s.plan_id where s.cuenta_id = p_cuenta;
$$;

create or replace function public.d360_tiene_funcion(p_cuenta uuid, p_funcion text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.d360_plan_de(p_cuenta)).funciones ->> p_funcion = 'true', false);
$$;

create or replace function public.d360_log(p_cuenta uuid, p_accion text, p_entidad text,
                                           p_entidad_id text, p_detalle jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (p_cuenta, auth.uid(), p_accion, p_entidad, p_entidad_id, p_detalle);
$$;

-- =====================================================================
-- RLS del núcleo
-- =====================================================================
alter table public.plataforma_admins   enable row level security;
alter table public.config_global       enable row level security;
alter table public.secretos_servidor   enable row level security;
alter table public.planes              enable row level security;
alter table public.promociones         enable row level security;
alter table public.cuentas             enable row level security;
alter table public.suscripciones       enable row level security;
alter table public.pagos_suscripcion   enable row level security;
alter table public.miembros            enable row level security;
alter table public.miembros_secretos   enable row level security;
alter table public.acceso_intentos     enable row level security;
alter table public.auditoria           enable row level security;

create policy pa_self on public.plataforma_admins for select to authenticated
  using (user_id = auth.uid());

-- Config pública: solo claves marcadas como públicas; admin lo ve todo
create policy cg_leer on public.config_global for select to anon, authenticated
  using (clave like 'publico.%' or public.d360_es_plataforma_admin());
create policy cg_admin on public.config_global for all to authenticated
  using (public.d360_es_plataforma_admin()) with check (public.d360_es_plataforma_admin());

-- Planes: visibles para todos (página de precios); solo admin edita
create policy planes_leer on public.planes for select to anon, authenticated using (activo or public.d360_es_plataforma_admin());
create policy planes_admin on public.planes for all to authenticated
  using (public.d360_es_plataforma_admin()) with check (public.d360_es_plataforma_admin());

create policy promo_admin on public.promociones for all to authenticated
  using (public.d360_es_plataforma_admin()) with check (public.d360_es_plataforma_admin());

create policy cuentas_leer on public.cuentas for select to authenticated
  using (public.d360_mi_rol(id) is not null or public.d360_es_plataforma_admin());
create policy cuentas_editar on public.cuentas for update to authenticated
  using (public.d360_mi_rol(id) in ('propietario','director') or public.d360_es_plataforma_admin())
  with check (public.d360_mi_rol(id) in ('propietario','director') or public.d360_es_plataforma_admin());

create policy sus_leer on public.suscripciones for select to authenticated
  using (public.d360_es_personal(cuenta_id) or public.d360_es_plataforma_admin());
create policy sus_admin on public.suscripciones for all to authenticated
  using (public.d360_es_plataforma_admin()) with check (public.d360_es_plataforma_admin());

create policy psus_leer on public.pagos_suscripcion for select to authenticated
  using (public.d360_mi_rol(cuenta_id) in ('propietario','director','finanzas') or public.d360_es_plataforma_admin());
create policy psus_admin on public.pagos_suscripcion for all to authenticated
  using (public.d360_es_plataforma_admin()) with check (public.d360_es_plataforma_admin());

-- Miembros: el personal ve a sus compañeros; un tutor solo se ve a sí mismo.
-- Altas/cambios se hacen por RPC (para generar códigos y validar límites).
create policy miembros_leer on public.miembros for select to authenticated
  using (public.d360_es_personal(cuenta_id) or user_id = auth.uid() or public.d360_es_plataforma_admin());

create policy audit_leer on public.auditoria for select to authenticated
  using (public.d360_mi_rol(cuenta_id) in ('propietario','director') or public.d360_es_plataforma_admin());

-- miembros_secretos, acceso_intentos, secretos_servidor: sin políticas => cerradas.
