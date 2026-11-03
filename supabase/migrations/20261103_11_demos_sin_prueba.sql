-- =====================================================================
-- DOCENCIA360 · 11 · Cuentas de demostración y alta sin días gratis
--  - Cuentas nuevas: estado 'pendiente' hasta registrar el primer pago
--    (los días de prueba quedan como parámetro opcional, 0 por defecto).
--  - Cuentas demo (es_demo): datos de ejemplo realistas, acceso sin
--    contraseña por Edge Function, protegidas contra acciones
--    destructivas y reiniciadas cada noche.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estado 'pendiente' y marca de demo
-- ---------------------------------------------------------------------
alter table public.suscripciones drop constraint if exists suscripciones_estado_check;
alter table public.suscripciones add constraint suscripciones_estado_check
  check (estado in ('pendiente','prueba','activa','vencida','suspendida','cancelada'));
alter table public.cuentas add column if not exists es_demo boolean not null default false;
update public.config_global set valor = '0', descripcion = 'Días de prueba gratis (0 = sin prueba: la cuenta espera su primer pago)'
 where clave = 'publico.dias_prueba';

create or replace function public._d360_es_demo(p_cuenta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_demo from cuentas where id = p_cuenta), false);
$$;
revoke execute on function public._d360_es_demo(uuid) from public, anon, authenticated;

create or replace function public._d360_mantenimiento()
returns boolean language sql stable as $$
  select coalesce(current_setting('d360.mantenimiento', true), '') = 'on';
$$;

-- ---------------------------------------------------------------------
-- 2. Alta de cuentas: sin prueba salvo que el parámetro lo indique
-- ---------------------------------------------------------------------
create or replace function public.d360_crear_cuenta(
  p_modalidad text, p_nombre text, p_tu_nombre text, p_plan text,
  p_telefono text default null, p_moneda text default 'NIO')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cuenta uuid; v_miembro uuid; v_codigo text; v_pin text;
        v_plan planes; v_dias int; v_email text;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
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
  insert into cuentas(modalidad, nombre, codigo, propietario, telefono, email, moneda)
  values (p_modalidad, trim(p_nombre), v_codigo, v_uid, nullif(trim(p_telefono),''), v_email,
          case when p_moneda = 'USD' then 'USD' else 'NIO' end)
  returning id into v_cuenta;
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
  perform d360_log(v_cuenta, 'cuenta_creada', 'cuentas', v_cuenta::text, jsonb_build_object('plan', p_plan, 'dias_prueba', v_dias));
  return jsonb_build_object('cuenta_id', v_cuenta, 'codigo_institucion', v_codigo, 'codigo_personal', v_pin,
                            'estado', case when v_dias > 0 then 'prueba' else 'pendiente' end, 'dias_prueba', v_dias);
end $$;
revoke execute on function public.d360_crear_cuenta(text, text, text, text, text, text) from public, anon;

-- El primer pago de una cuenta pendiente empieza a contar desde hoy
create or replace function public.d360_admin_registrar_pago(
  p_cuenta uuid, p_plan text, p_meses int, p_monto numeric, p_moneda text, p_metodo text, p_referencia text)
returns date language plpgsql security definer set search_path = public as $$
declare v_s suscripciones; v_desde date; v_hasta date;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  if p_meses not between 1 and 24 then raise exception 'Meses inválidos'; end if;
  select * into v_s from suscripciones where cuenta_id = p_cuenta for update;
  if v_s.cuenta_id is null then raise exception 'Cuenta sin suscripción'; end if;
  if not exists(select 1 from planes pl join cuentas c on c.modalidad = pl.modalidad where pl.id = p_plan and c.id = p_cuenta) then
    raise exception 'El plan no corresponde a la modalidad de la cuenta';
  end if;
  v_desde := greatest(v_s.vence, current_date);
  if v_s.estado in ('prueba','pendiente','suspendida','cancelada') then v_desde := current_date; end if;
  v_hasta := (v_desde + make_interval(months => p_meses))::date;
  insert into pagos_suscripcion(cuenta_id, plan_id, monto, moneda, metodo, referencia, periodo_desde, periodo_hasta, registrado_por)
  values (p_cuenta, p_plan, p_monto, p_moneda, coalesce(p_metodo,'transferencia'), p_referencia, v_desde, v_hasta, auth.uid());
  update suscripciones set plan_id = p_plan, estado = 'activa', vence = v_hasta,
    dias_gracia = case when dias_gracia = 0 then coalesce((select (valor #>> '{}')::int from config_global where clave = 'dias_gracia_defecto'), 5) else dias_gracia end,
    actualizado = now() where cuenta_id = p_cuenta;
  perform d360_log(p_cuenta, 'suscripcion_pagada', 'suscripciones', p_cuenta::text,
                   jsonb_build_object('plan', p_plan, 'meses', p_meses, 'monto', p_monto, 'moneda', p_moneda));
  return v_hasta;
end $$;
revoke execute on function public.d360_admin_registrar_pago(uuid, text, int, numeric, text, text, text) from public, anon;

-- ---------------------------------------------------------------------
-- 3. Listados con la marca de demo
-- ---------------------------------------------------------------------
drop function if exists public.d360_mis_cuentas();
create function public.d360_mis_cuentas()
returns table(cuenta_id uuid, nombre text, modalidad text, codigo text, rol text, miembro_id uuid,
              miembro_nombre text, plan_id text, plan_nombre text, estado text, vence date,
              dias_gracia int, operativa boolean, funciones jsonb, onboarding_completo boolean,
              moneda text, logo_url text, es_demo boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.modalidad, c.codigo, m.rol, m.id, m.nombre, p.id, p.nombre, s.estado, s.vence,
         s.dias_gracia, d360_cuenta_operativa(c.id), p.funciones, c.onboarding_completo, c.moneda, c.logo_url, c.es_demo
  from miembros m
  join cuentas c on c.id = m.cuenta_id
  left join suscripciones s on s.cuenta_id = c.id
  left join planes p on p.id = s.plan_id
  where m.user_id = auth.uid() and m.activo
  order by c.creado;
$$;
revoke execute on function public.d360_mis_cuentas() from public, anon;
grant execute on function public.d360_mis_cuentas() to authenticated;

drop function if exists public.d360_admin_cuentas();
create function public.d360_admin_cuentas()
returns table(cuenta_id uuid, nombre text, modalidad text, codigo text, propietario_email text, telefono text,
              plan_id text, plan_nombre text, estado text, inicio date, vence date, dias_gracia int,
              estudiantes bigint, miembros bigint, ultimo_acceso timestamptz, creado timestamptz, es_demo boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return query
  select c.id, c.nombre, c.modalidad, c.codigo, u.email::text, c.telefono, s.plan_id, p.nombre, s.estado, s.inicio,
         s.vence, s.dias_gracia,
         (select count(*) from estudiantes e where e.cuenta_id = c.id and e.estado = 'activo'),
         (select count(*) from miembros m where m.cuenta_id = c.id and m.activo),
         (select max(m.ultimo_acceso) from miembros m where m.cuenta_id = c.id),
         c.creado, c.es_demo
  from cuentas c
  left join auth.users u on u.id = c.propietario
  left join suscripciones s on s.cuenta_id = c.id
  left join planes p on p.id = s.plan_id
  order by c.es_demo, c.creado desc;
end $$;
revoke execute on function public.d360_admin_cuentas() from public, anon;

create or replace function public.d360_admin_metricas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return jsonb_build_object(
    'cuentas', (select count(*) from cuentas where not es_demo),
    'por_modalidad', (select coalesce(jsonb_object_agg(modalidad, n), '{}') from (select modalidad, count(*) n from cuentas where not es_demo group by 1) x),
    'por_estado', (select coalesce(jsonb_object_agg(estado, n), '{}') from (select s.estado, count(*) n from suscripciones s join cuentas c on c.id = s.cuenta_id where not c.es_demo group by 1) x),
    'mrr_usd', (select coalesce(sum(p.precio_usd), 0) from suscripciones s join planes p on p.id = s.plan_id join cuentas c on c.id = s.cuenta_id where s.estado = 'activa' and not c.es_demo),
    'vencen_7d', (select count(*) from suscripciones s join cuentas c on c.id = s.cuenta_id where not c.es_demo and s.estado in ('activa','prueba') and s.vence between current_date and current_date + 7),
    'demo_accesos_7d', (select count(*) from auditoria a join cuentas c on c.id = a.cuenta_id where c.es_demo and a.accion = 'acceso_demo' and a.creado > now() - interval '7 days'),
    'ingresos_mes', (select coalesce(jsonb_object_agg(moneda, total), '{}') from
                      (select moneda, sum(monto) total from pagos_suscripcion where creado >= date_trunc('month', now()) group by 1) x),
    'ingresos_12m', (select coalesce(jsonb_agg(x order by mes), '[]') from
                      (select to_char(date_trunc('month', creado), 'YYYY-MM') mes, moneda, sum(monto) total
                       from pagos_suscripcion where creado >= date_trunc('month', now()) - interval '11 months' group by 1, 2) x)
  );
end $$;
revoke execute on function public.d360_admin_metricas() from public, anon;

-- ---------------------------------------------------------------------
-- 4. Protección de las demos
-- ---------------------------------------------------------------------
-- 4a. No se borran estudiantes, grupos, cursos, etc. (sí se puede probar todo lo demás)
create or replace function public.t_demo_sin_borrar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not _d360_mantenimiento() and _d360_es_demo(old.cuenta_id) then
    raise exception 'En la demostración no se puede eliminar. Crea tu cuenta para tener tus propios datos.' using errcode = 'P0001';
  end if;
  return old;
end $$;
revoke execute on function public.t_demo_sin_borrar() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['estudiantes','grupos','cursos','asignaturas','matriculas','certificados','cargos','miembros','periodos']
  loop
    execute format('create trigger t_demo before delete on public.%I for each row execute function public.t_demo_sin_borrar()', t);
  end loop;
end $$;

-- 4b. Los datos de la cuenta demo no se editan
create or replace function public.t_demo_cuenta_fija()
returns trigger language plpgsql as $$
begin
  if old.es_demo and not public._d360_mantenimiento() then
    raise exception 'Los datos de la cuenta de demostración no se pueden cambiar.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger t_demo before update on public.cuentas for each row execute function public.t_demo_cuenta_fija();

-- 4c. Ni usuarios ni códigos nuevos dentro de una demo
create or replace function public._d360_no_en_demo(p_cuenta uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _d360_es_demo(p_cuenta) and not _d360_mantenimiento() then
    raise exception 'En la demostración no se crean usuarios ni códigos. Crea tu cuenta para invitar a tu equipo.' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public._d360_no_en_demo(uuid) from public, anon, authenticated;

create or replace function public.t_demo_miembros()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _d360_no_en_demo(new.cuenta_id);
  return new;
end $$;
revoke execute on function public.t_demo_miembros() from public, anon, authenticated;
create trigger t_demo_ins before insert on public.miembros for each row execute function public.t_demo_miembros();
create trigger t_demo_upd before update of nombre, rol, activo, email, telefono, documento, especialidad
  on public.miembros for each row execute function public.t_demo_miembros();

create or replace function public.t_demo_secretos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _d360_no_en_demo(new.cuenta_id);
  return new;
end $$;
revoke execute on function public.t_demo_secretos() from public, anon, authenticated;
create trigger t_demo before insert or update on public.miembros_secretos for each row execute function public.t_demo_secretos();

-- 4d. Usuarios de demo: sin cambio de contraseña ni de correo
create or replace function public.t_demo_usuarios_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email like '%@demo.docencia360.app' and not public._d360_mantenimiento() then
    if tg_op = 'DELETE' then raise exception 'Los usuarios de demostración no se eliminan.'; end if;
    if new.encrypted_password is distinct from old.encrypted_password or new.email is distinct from old.email
       or new.phone is distinct from old.phone then
      raise exception 'Los usuarios de demostración no se pueden modificar.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function public.t_demo_usuarios_auth() from public, anon, authenticated;
create trigger d360_demo_protegida before update or delete on auth.users for each row execute function public.t_demo_usuarios_auth();

-- 4e. La auditoría no registra el mantenimiento nocturno
create or replace function public.t_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  if _d360_mantenimiento() then return null; end if;
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (r.cuenta_id, auth.uid(), lower(tg_op), tg_table_name, r.id::text,
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
               else to_jsonb(r) end);
  return null;
end $$;
create or replace function public.t_auditar_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(coalesce(new, old));
begin
  if _d360_mantenimiento() then return null; end if;
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (nullif(j ->> 'cuenta_id', '')::uuid, auth.uid(), lower(tg_op), tg_table_name,
          coalesce(j ->> 'id', j ->> 'clave', j ->> 'cuenta_id', j ->> 'user_id'),
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new)) else j end);
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 5. Perfiles de demostración
-- ---------------------------------------------------------------------
create table public.demo_perfiles (
  perfil    text primary key,
  modalidad text not null,
  codigo    text not null,           -- código de institución de la cuenta demo
  miembro   text not null,           -- nombre del miembro con el que se entra
  rol       text not null,
  titulo    text not null,
  detalle   text not null,
  orden     int  not null default 1
);
alter table public.demo_perfiles enable row level security;
create policy leer on public.demo_perfiles for select to anon, authenticated using (true);
insert into public.demo_perfiles values
 ('profesor', 'profesor', 'DEMOPR', 'Marcela Rivas', 'propietario', 'Profesora independiente', 'Clases de Matemática y Física: grupos, asistencia, notas y tareas.', 1),
 ('academia-direccion', 'academia', 'DEMOAC', 'Roberto Castillo', 'director', 'Academia · Dirección', 'Ve todo: cursos, grupos, matrículas, finanzas, certificados e informes.', 2),
 ('academia-caja', 'academia', 'DEMOAC', 'Karla Mendoza', 'finanzas', 'Academia · Caja', 'Matrículas, cobros, recibos y morosidad, sin tocar notas.', 3),
 ('academia-instructor', 'academia', 'DEMOAC', 'Daniel Ortega Ruiz', 'docente', 'Academia · Instructor', 'Solo sus grupos: pasa lista y califica.', 4);

-- Solo la Edge Function: devuelve el miembro de la demo (con límite por IP)
create or replace function public.d360_demo_miembro(p_perfil text, p_origen text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p demo_perfiles; v_m miembros; v_c cuentas; v_clave text := 'demo|' || coalesce(p_origen, '-'); v_int acceso_intentos;
begin
  select * into v_p from demo_perfiles where perfil = p_perfil;
  if v_p.perfil is null then return jsonb_build_object('ok', false, 'motivo', 'perfil'); end if;
  select * into v_int from acceso_intentos where clave = v_clave;
  if v_int.clave is not null and v_int.actualizado > now() - interval '1 hour' and v_int.fallos >= 40 then
    return jsonb_build_object('ok', false, 'motivo', 'limite');
  end if;
  insert into acceso_intentos(clave, fallos, actualizado) values (v_clave, 1, now())
  on conflict (clave) do update set
    fallos = case when acceso_intentos.actualizado < now() - interval '1 hour' then 1 else acceso_intentos.fallos + 1 end,
    actualizado = now();
  select * into v_c from cuentas where codigo = v_p.codigo and es_demo;
  if v_c.id is null then return jsonb_build_object('ok', false, 'motivo', 'sin_demo'); end if;
  select * into v_m from miembros where cuenta_id = v_c.id and nombre = v_p.miembro and rol = v_p.rol limit 1;
  if v_m.id is null then return jsonb_build_object('ok', false, 'motivo', 'sin_demo'); end if;
  update miembros set ultimo_acceso = now() where id = v_m.id;
  insert into auditoria(cuenta_id, accion, entidad, entidad_id, detalle)
  values (v_c.id, 'acceso_demo', 'miembros', v_m.id::text, jsonb_build_object('perfil', p_perfil, 'origen', p_origen));
  return jsonb_build_object('ok', true, 'miembro_id', v_m.id, 'user_id', v_m.user_id, 'cuenta_id', v_c.id, 'modalidad', v_c.modalidad,
                            'email', 'demo-' || p_perfil || '@demo.docencia360.app');
end $$;

create or replace function public.d360_demo_vincular(p_miembro uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('d360.mantenimiento', 'on', true);
  update miembros set user_id = p_user
   where id = p_miembro and cuenta_id in (select id from cuentas where es_demo);
end $$;
revoke execute on function public.d360_demo_miembro(text, text) from public, anon, authenticated;
revoke execute on function public.d360_demo_vincular(uuid, uuid) from public, anon, authenticated;
grant execute on function public.d360_demo_miembro(text, text) to service_role;
grant execute on function public.d360_demo_vincular(uuid, uuid) to service_role;
