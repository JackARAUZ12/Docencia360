-- =====================================================================
-- DOCENCIA360 · 17 · Registro solo con código de acceso
-- Como en Negocio360: nadie crea una cuenta por su cuenta. El panel
-- maestro genera un código (modalidad, plan, usos, vencimiento) y la
-- persona lo escribe al registrarse. El servidor valida el código con
-- límite de intentos y lo consume en el mismo instante en que crea la
-- cuenta: si ya no sirve, la cuenta NO se crea.
-- No cambia: acceso del personal/familias con código, demostraciones,
-- ni las cuentas existentes.
-- =====================================================================

create table if not exists public.codigos_registro (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique check (codigo ~ '^D360-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  modalidad  text check (modalidad in ('profesor','academia','colegio')),   -- null = cualquiera
  plan_id    text references public.planes(id),                            -- null = la persona elige
  usos_max   int not null default 1 check (usos_max between 1 and 500),
  usos       int not null default 0 check (usos >= 0),
  vence      date,                                                         -- null = no vence
  activo     boolean not null default true,
  nota       text check (length(nota) <= 200),
  creado_por uuid,
  creado     timestamptz not null default now()
);
alter table public.codigos_registro enable row level security;
revoke all on public.codigos_registro from anon;
drop policy if exists cr_admin on public.codigos_registro;
create policy cr_admin on public.codigos_registro for select to authenticated using (public.d360_es_plataforma_admin());

alter table public.cuentas add column if not exists codigo_registro_id uuid references public.codigos_registro(id) on delete set null;

insert into config_global(clave, valor, descripcion) values
  ('publico.registro_con_codigo', 'true', 'Crear una cuenta exige un código de acceso generado en el panel maestro')
on conflict (clave) do nothing;

-- ---------- Ayudas internas ----------
create or replace function public._d360_registro_requiere_codigo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (valor #>> '{}')::boolean from config_global where clave = 'publico.registro_con_codigo'), true);
$$;
revoke all on function public._d360_registro_requiere_codigo() from public, anon, authenticated;

-- Motivo por el que un código no sirve (null = sirve). No escribe nada.
create or replace function public._d360_motivo_codigo(c public.codigos_registro)
returns text language sql stable set search_path = public as $$
  select case when c.id is null then 'invalido'
              when not c.activo then 'desactivado'
              when c.vence is not null and c.vence < current_date then 'vencido'
              when c.usos >= c.usos_max then 'usado'
              when c.plan_id is not null and not exists(select 1 from planes where id = c.plan_id and activo) then 'desactivado'
         end;
$$;
revoke all on function public._d360_motivo_codigo(public.codigos_registro) from public, anon, authenticated;

create or replace function public._d360_normalizar_codigo(p text)
returns text language sql immutable as $$
  select case when length(x) = 12 and left(x, 4) = 'D360' then 'D360-' || substr(x, 5, 4) || '-' || substr(x, 9, 4) else x end
  from (select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) x) s;
$$;

-- Intentos fallidos (misma tabla que el acceso con código): 8 fallos => 15 min de bloqueo
create or replace function public._d360_registro_bloqueado(p_clave text)
returns int language sql stable security definer set search_path = public as $$
  select ceil(extract(epoch from bloqueado_hasta - now()) / 60)::int from acceso_intentos
  where clave = p_clave and bloqueado_hasta > now();
$$;
revoke all on function public._d360_registro_bloqueado(text) from public, anon, authenticated;

create or replace function public._d360_registro_fallo(p_clave text)
returns acceso_intentos language plpgsql security definer set search_path = public as $$
declare v acceso_intentos;
begin
  insert into acceso_intentos(clave, fallos, actualizado) values (p_clave, 1, now())
  on conflict (clave) do update set
    fallos = case when acceso_intentos.actualizado < now() - interval '1 hour'
                    or (acceso_intentos.bloqueado_hasta is not null and acceso_intentos.bloqueado_hasta <= now())
                  then 1 else acceso_intentos.fallos + 1 end,
    bloqueado_hasta = case when acceso_intentos.bloqueado_hasta is not null and acceso_intentos.bloqueado_hasta <= now() then null
                           when acceso_intentos.fallos + 1 >= 8 and acceso_intentos.actualizado >= now() - interval '1 hour'
                           then now() + interval '15 minutes' else null end,
    actualizado = now()
  returning * into v;
  return v;
end $$;
revoke all on function public._d360_registro_fallo(text) from public, anon, authenticated;

-- ---------- Validación pública (paso 1 del registro) ----------
create or replace function public.d360_validar_codigo_registro(p_codigo text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_cod text := _d360_normalizar_codigo(p_codigo);
        v_ip text := coalesce(nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), ''), 'sin-ip');
        v_clave text := 'registro|' || v_ip; v_min int; v_c codigos_registro; v_mot text; v_int acceso_intentos;
begin
  if not _d360_registro_requiere_codigo() then return jsonb_build_object('ok', true, 'requiere', false); end if;
  v_min := _d360_registro_bloqueado(v_clave);
  if v_min is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', v_min); end if;
  select * into v_c from codigos_registro where codigo = v_cod;
  v_mot := _d360_motivo_codigo(v_c);
  if v_mot is not null then
    v_int := _d360_registro_fallo(v_clave);
    if v_int.bloqueado_hasta is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', 15); end if;
    return jsonb_build_object('ok', false, 'motivo', v_mot);
  end if;
  delete from acceso_intentos where clave = v_clave;
  return jsonb_build_object('ok', true, 'requiere', true, 'codigo', v_c.codigo, 'modalidad', v_c.modalidad, 'plan', v_c.plan_id);
end $$;
revoke execute on function public.d360_validar_codigo_registro(text) from public;
grant execute on function public.d360_validar_codigo_registro(text) to anon, authenticated;

-- ---------- Crear cuenta: ahora consume el código ----------
drop function if exists public.d360_crear_cuenta(text, text, text, text, text, text, text);
create or replace function public.d360_crear_cuenta(
  p_modalidad text, p_nombre text, p_tu_nombre text, p_plan text,
  p_telefono text default null, p_moneda text default 'NIO', p_terminos text default null, p_codigo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cuenta uuid; v_miembro uuid; v_codigo text; v_pin text;
        v_plan planes; v_dias int; v_email text; v_ver text := _d360_terminos_vigentes();
        v_cr codigos_registro; v_mot text; v_clave text; v_min int;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  if coalesce(p_terminos, '') <> v_ver then
    raise exception 'Para crear la cuenta debes aceptar los términos de uso y la política de privacidad.';
  end if;

  -- Código de acceso: se bloquea la fila para que dos registros no gasten el mismo uso
  if _d360_registro_requiere_codigo() then
    v_clave := 'registro|u:' || v_uid;
    v_min := _d360_registro_bloqueado(v_clave);
    if v_min is not null then
      return jsonb_build_object('error', format('Demasiados intentos con códigos no válidos. Espera %s min.', v_min));
    end if;
    select * into v_cr from codigos_registro where codigo = _d360_normalizar_codigo(p_codigo) for update;
    v_mot := _d360_motivo_codigo(v_cr);
    if v_mot is not null then
      perform _d360_registro_fallo(v_clave);   -- se devuelve (no se lanza) para que el intento quede contado
      return jsonb_build_object('error', case v_mot
        when 'usado' then 'Ese código de acceso ya fue utilizado. Solicita uno nuevo.'
        when 'vencido' then 'Ese código de acceso venció. Solicita uno nuevo.'
        when 'desactivado' then 'Ese código de acceso fue desactivado. Solicita uno nuevo.'
        else 'El código de acceso no es válido. Revísalo o solicita uno nuevo.' end, 'motivo', v_mot);
    end if;
    if v_cr.modalidad is not null and v_cr.modalidad <> p_modalidad then
      raise exception 'Tu código de acceso es para otro tipo de cuenta.';
    end if;
    if v_cr.plan_id is not null then p_plan := v_cr.plan_id; end if;   -- el plan sale del código, no del navegador
  end if;

  if (select count(*) from cuentas where propietario = v_uid and not es_demo) >= 3 then
    raise exception 'Ya tienes el máximo de cuentas permitidas (3).';
  end if;
  select * into v_plan from planes where id = p_plan and activo;
  if v_plan.id is null or v_plan.modalidad <> p_modalidad then
    raise exception 'El plan elegido no corresponde a la modalidad.';
  end if;
  if coalesce(length(trim(p_nombre)),0) < 2 or coalesce(length(trim(p_tu_nombre)),0) < 2 then
    raise exception 'Escribe tu nombre y el nombre de la cuenta.';
  end if;
  select coalesce((valor #>> '{}')::int, 0) into v_dias from config_global where clave = 'publico.dias_prueba';
  v_dias := greatest(coalesce(v_dias, 0), 0);
  select email into v_email from auth.users where id = v_uid;
  loop
    v_codigo := _d360_codigo_aleatorio(6);
    exit when not exists(select 1 from cuentas where codigo = v_codigo);
  end loop;
  insert into cuentas(modalidad, nombre, codigo, propietario, telefono, email, moneda, terminos_version, terminos_aceptados, codigo_registro_id)
  values (p_modalidad, trim(p_nombre), v_codigo, v_uid, nullif(trim(p_telefono),''), v_email,
          case when p_moneda = 'USD' then 'USD' else 'NIO' end, v_ver, now(), v_cr.id)
  returning id into v_cuenta;
  if v_cr.id is not null then update codigos_registro set usos = usos + 1 where id = v_cr.id; end if;
  insert into suscripciones(cuenta_id, plan_id, estado, inicio, vence, dias_gracia)
  values (v_cuenta, v_plan.id, case when v_dias > 0 then 'prueba' else 'pendiente' end,
          current_date, current_date + v_dias, case when v_dias > 0 then 5 else 0 end);
  insert into miembros(cuenta_id, user_id, nombre, email, rol)
  values (v_cuenta, v_uid, trim(p_tu_nombre), v_email, 'propietario')
  returning id into v_miembro;
  v_pin := _d360_asignar_codigo(v_miembro);
  if p_modalidad = 'colegio' then
    insert into periodos(cuenta_id, nombre, inicio, fin, orden) values
      (v_cuenta, 'I Semestre', make_date(extract(year from current_date)::int, 2, 1), make_date(extract(year from current_date)::int, 6, 30), 1),
      (v_cuenta, 'II Semestre', make_date(extract(year from current_date)::int, 7, 1), make_date(extract(year from current_date)::int, 11, 30), 2);
  end if;
  perform d360_log(v_cuenta, 'cuenta_creada', 'cuentas', v_cuenta::text,
    jsonb_build_object('plan', p_plan, 'dias_prueba', v_dias, 'terminos', v_ver, 'codigo_registro', v_cr.codigo));
  return jsonb_build_object('cuenta_id', v_cuenta, 'codigo_institucion', v_codigo, 'codigo_personal', v_pin,
                            'estado', case when v_dias > 0 then 'prueba' else 'pendiente' end, 'dias_prueba', v_dias);
end $$;
revoke execute on function public.d360_crear_cuenta(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.d360_crear_cuenta(text, text, text, text, text, text, text, text) to authenticated;

-- ---------- Panel maestro ----------
create or replace function public.d360_admin_crear_codigo(
  p_modalidad text default null, p_plan text default null, p_usos int default 1, p_vence date default null, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cod text; v_id uuid; v_mod text := nullif(p_modalidad, '');
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  if v_mod is not null and v_mod not in ('profesor','academia','colegio') then raise exception 'Tipo de cuenta inválido'; end if;
  if nullif(p_plan, '') is not null then
    if not exists(select 1 from planes where id = p_plan and activo) then raise exception 'El plan no existe o está inactivo'; end if;
    if v_mod is null then select modalidad into v_mod from planes where id = p_plan; end if;
    if (select modalidad from planes where id = p_plan) <> v_mod then raise exception 'El plan no corresponde al tipo de cuenta'; end if;
  end if;
  if coalesce(p_usos, 0) not between 1 and 500 then raise exception 'Los usos van de 1 a 500'; end if;
  if p_vence is not null and p_vence < current_date then raise exception 'La fecha de vencimiento ya pasó'; end if;
  loop
    v_cod := 'D360-' || _d360_codigo_aleatorio(4) || '-' || _d360_codigo_aleatorio(4);
    exit when not exists(select 1 from codigos_registro where codigo = v_cod);
  end loop;
  insert into codigos_registro(codigo, modalidad, plan_id, usos_max, vence, nota, creado_por)
  values (v_cod, v_mod, nullif(p_plan, ''), p_usos, p_vence, nullif(trim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_id;
  perform d360_log(null, 'codigo_registro_creado', 'codigos_registro', v_id::text,
    jsonb_build_object('codigo', v_cod, 'modalidad', v_mod, 'plan', nullif(p_plan, ''), 'usos', p_usos, 'vence', p_vence));
  return jsonb_build_object('id', v_id, 'codigo', v_cod);
end $$;
revoke execute on function public.d360_admin_crear_codigo(text, text, int, date, text) from public, anon;
grant execute on function public.d360_admin_crear_codigo(text, text, int, date, text) to authenticated;

create or replace function public.d360_admin_codigo_activo(p_id uuid, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  update codigos_registro set activo = p_activo where id = p_id;
  if not found then raise exception 'El código no existe'; end if;
  perform d360_log(null, case when p_activo then 'codigo_registro_activado' else 'codigo_registro_desactivado' end,
                   'codigos_registro', p_id::text, null);
end $$;
revoke execute on function public.d360_admin_codigo_activo(uuid, boolean) from public, anon;
grant execute on function public.d360_admin_codigo_activo(uuid, boolean) to authenticated;

-- Solo se borra un código que nadie usó; los usados se desactivan (quedan en el historial)
create or replace function public.d360_admin_borrar_codigo(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v codigos_registro;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  select * into v from codigos_registro where id = p_id for update;
  if v.id is null then raise exception 'El código no existe'; end if;
  if v.usos > 0 or exists(select 1 from cuentas where codigo_registro_id = p_id) then
    raise exception 'Este código ya se usó para crear cuentas: desactívalo en lugar de borrarlo.';
  end if;
  delete from codigos_registro where id = p_id;
  perform d360_log(null, 'codigo_registro_borrado', 'codigos_registro', p_id::text, jsonb_build_object('codigo', v.codigo));
end $$;
revoke execute on function public.d360_admin_borrar_codigo(uuid) from public, anon;
grant execute on function public.d360_admin_borrar_codigo(uuid) to authenticated;

create or replace function public.d360_admin_codigos()
returns table(id uuid, codigo text, modalidad text, plan_id text, plan_nombre text, usos_max int, usos int,
              vence date, activo boolean, nota text, creado timestamptz, estado text, cuentas jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return query
  select c.id, c.codigo, c.modalidad, c.plan_id, p.nombre, c.usos_max, c.usos, c.vence, c.activo, c.nota, c.creado,
         coalesce(_d360_motivo_codigo(c), 'disponible'),
         coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'nombre', k.nombre, 'creado', k.creado) order by k.creado)
                   from cuentas k where k.codigo_registro_id = c.id), '[]'::jsonb)
  from codigos_registro c left join planes p on p.id = c.plan_id
  order by c.creado desc;
end $$;
revoke execute on function public.d360_admin_codigos() from public, anon;
grant execute on function public.d360_admin_codigos() to authenticated;
