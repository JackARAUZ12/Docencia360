-- =====================================================================
-- DOCENCIA360 · 20 · El código de acceso ya trae el pago
-- El administrador entrega el código cuando el cliente ya pagó. Al
-- generarlo indica los meses pagados (y el monto recibido); al crear la
-- cuenta con ese código, la cuenta nace ACTIVA, con el pago registrado
-- en el historial y su fecha de vencimiento. Sin pasos pendientes.
-- Un código con 0 meses pagados se comporta como antes (pendiente/prueba).
-- =====================================================================
alter table public.codigos_registro
  add column if not exists meses_pagados int not null default 0 check (meses_pagados between 0 and 24),
  add column if not exists monto numeric(12,2) check (monto >= 0),
  add column if not exists moneda text not null default 'NIO' check (moneda in ('NIO','USD')),
  add column if not exists metodo text not null default 'transferencia' check (length(metodo) <= 40);
alter table public.codigos_registro drop constraint if exists codigos_registro_pagado_con_plan;
alter table public.codigos_registro add constraint codigos_registro_pagado_con_plan check (meses_pagados = 0 or plan_id is not null);

-- ---------- Validación: también dice si ya está pagado ----------
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
  return jsonb_build_object('ok', true, 'requiere', true, 'codigo', v_c.codigo, 'modalidad', v_c.modalidad, 'plan', v_c.plan_id,
                            'meses_pagados', v_c.meses_pagados);
end $$;
revoke execute on function public.d360_validar_codigo_registro(text) from public;
grant execute on function public.d360_validar_codigo_registro(text) to anon, authenticated;

create or replace function public.d360_srv_validar_codigo(p_codigo text, p_origen text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_clave text := 'registro|' || coalesce(nullif(trim(p_origen), ''), 'sin-ip');
        v_min int; v_c codigos_registro; v_mot text; v_int acceso_intentos;
begin
  if not _d360_registro_requiere_codigo() then return jsonb_build_object('ok', true, 'requiere', false); end if;
  v_min := _d360_registro_bloqueado(v_clave);
  if v_min is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', v_min); end if;
  select * into v_c from codigos_registro where codigo = _d360_normalizar_codigo(p_codigo);
  v_mot := _d360_motivo_codigo(v_c);
  if v_mot is not null then
    v_int := _d360_registro_fallo(v_clave);
    if v_int.bloqueado_hasta is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', 15); end if;
    return jsonb_build_object('ok', false, 'motivo', v_mot);
  end if;
  delete from acceso_intentos where clave = v_clave;
  return jsonb_build_object('ok', true, 'requiere', true, 'codigo', v_c.codigo, 'modalidad', v_c.modalidad, 'plan', v_c.plan_id,
                            'meses_pagados', v_c.meses_pagados);
end $$;
revoke all on function public.d360_srv_validar_codigo(text, text) from public, anon, authenticated;
grant execute on function public.d360_srv_validar_codigo(text, text) to service_role;

-- ---------- Crear cuenta: si el código trae pago, la cuenta nace activa ----------
create or replace function public.d360_crear_cuenta(
  p_modalidad text, p_nombre text, p_tu_nombre text, p_plan text,
  p_telefono text default null, p_moneda text default 'NIO', p_terminos text default null, p_codigo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cuenta uuid; v_miembro uuid; v_codigo text; v_pin text;
        v_plan planes; v_dias int; v_email text; v_ver text := _d360_terminos_vigentes();
        v_cr codigos_registro; v_mot text; v_clave text; v_min int;
        v_estado text; v_vence date; v_gracia int; v_monto numeric;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  if coalesce(p_terminos, '') <> v_ver then
    raise exception 'Para crear la cuenta debes aceptar los términos de uso y la política de privacidad.';
  end if;

  if _d360_registro_requiere_codigo() then
    v_clave := 'registro|u:' || v_uid;
    v_min := _d360_registro_bloqueado(v_clave);
    if v_min is not null then
      return jsonb_build_object('error', format('Demasiados intentos con códigos no válidos. Espera %s min.', v_min));
    end if;
    select * into v_cr from codigos_registro where codigo = _d360_normalizar_codigo(p_codigo) for update;
    v_mot := _d360_motivo_codigo(v_cr);
    if v_mot is not null then
      perform _d360_registro_fallo(v_clave);
      return jsonb_build_object('error', case v_mot
        when 'usado' then 'Ese código de acceso ya fue utilizado. Solicita uno nuevo.'
        when 'vencido' then 'Ese código de acceso venció. Solicita uno nuevo.'
        when 'desactivado' then 'Ese código de acceso fue desactivado. Solicita uno nuevo.'
        else 'El código de acceso no es válido. Revísalo o solicita uno nuevo.' end, 'motivo', v_mot);
    end if;
    if v_cr.modalidad is not null and v_cr.modalidad <> p_modalidad then
      raise exception 'Tu código de acceso es para otro tipo de cuenta.';
    end if;
    if v_cr.plan_id is not null then p_plan := v_cr.plan_id; end if;
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

  if coalesce(v_cr.meses_pagados, 0) > 0 then
    -- Ya pagó: cuenta activa con su pago registrado (a nombre de quien generó el código)
    v_estado := 'activa';
    v_vence := (current_date + make_interval(months => v_cr.meses_pagados))::date;
    v_gracia := coalesce((select (valor #>> '{}')::int from config_global where clave = 'dias_gracia_defecto'), 5);
    v_monto := coalesce(v_cr.monto, case when v_cr.moneda = 'USD' then v_plan.precio_usd else v_plan.precio_nio end * v_cr.meses_pagados);
    insert into suscripciones(cuenta_id, plan_id, estado, inicio, vence, dias_gracia)
    values (v_cuenta, v_plan.id, v_estado, current_date, v_vence, v_gracia);
    insert into pagos_suscripcion(cuenta_id, plan_id, monto, moneda, metodo, referencia, periodo_desde, periodo_hasta, registrado_por)
    values (v_cuenta, v_plan.id, v_monto, v_cr.moneda, v_cr.metodo, 'Código ' || v_cr.codigo, current_date, v_vence, v_cr.creado_por);
  else
    v_estado := case when v_dias > 0 then 'prueba' else 'pendiente' end;
    v_vence := current_date + v_dias;
    insert into suscripciones(cuenta_id, plan_id, estado, inicio, vence, dias_gracia)
    values (v_cuenta, v_plan.id, v_estado, current_date, v_vence, case when v_dias > 0 then 5 else 0 end);
  end if;

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
    jsonb_build_object('plan', p_plan, 'dias_prueba', v_dias, 'terminos', v_ver, 'codigo_registro', v_cr.codigo,
                       'meses_pagados', coalesce(v_cr.meses_pagados, 0), 'monto', v_monto, 'moneda', v_cr.moneda));
  return jsonb_build_object('cuenta_id', v_cuenta, 'codigo_institucion', v_codigo, 'codigo_personal', v_pin,
                            'estado', v_estado, 'vence', v_vence, 'dias_prueba', v_dias, 'plan_nombre', v_plan.nombre);
end $$;
revoke execute on function public.d360_crear_cuenta(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.d360_crear_cuenta(text, text, text, text, text, text, text, text) to authenticated;

-- ---------- Panel de administrador ----------
drop function if exists public.d360_admin_crear_codigo(text, text, int, date, text);
create or replace function public.d360_admin_crear_codigo(
  p_modalidad text default null, p_plan text default null, p_usos int default 1, p_vence date default null, p_nota text default null,
  p_meses int default 0, p_monto numeric default null, p_moneda text default 'NIO', p_metodo text default 'transferencia')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cod text; v_id uuid; v_mod text := nullif(p_modalidad, ''); v_meses int := coalesce(p_meses, 0);
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
  if v_meses not between 0 and 24 then raise exception 'Los meses pagados van de 0 a 24'; end if;
  if v_meses > 0 and nullif(p_plan, '') is null then raise exception 'Para un código ya pagado, elige el plan que pagó el cliente.'; end if;
  if p_monto is not null and p_monto < 0 then raise exception 'El monto no puede ser negativo'; end if;
  if coalesce(p_moneda, 'NIO') not in ('NIO','USD') then raise exception 'Moneda inválida'; end if;
  loop
    v_cod := 'D360-' || _d360_codigo_aleatorio(4) || '-' || _d360_codigo_aleatorio(4);
    exit when not exists(select 1 from codigos_registro where codigo = v_cod);
  end loop;
  insert into codigos_registro(codigo, modalidad, plan_id, usos_max, vence, nota, creado_por, meses_pagados, monto, moneda, metodo)
  values (v_cod, v_mod, nullif(p_plan, ''), p_usos, p_vence, nullif(trim(coalesce(p_nota, '')), ''), auth.uid(),
          v_meses, case when v_meses > 0 then p_monto end, coalesce(p_moneda, 'NIO'), left(coalesce(nullif(trim(p_metodo), ''), 'transferencia'), 40))
  returning id into v_id;
  perform d360_log(null, 'codigo_registro_creado', 'codigos_registro', v_id::text,
    jsonb_build_object('codigo', v_cod, 'modalidad', v_mod, 'plan', nullif(p_plan, ''), 'usos', p_usos, 'vence', p_vence,
                       'meses_pagados', v_meses, 'monto', p_monto, 'moneda', p_moneda));
  return jsonb_build_object('id', v_id, 'codigo', v_cod);
end $$;
revoke execute on function public.d360_admin_crear_codigo(text, text, int, date, text, int, numeric, text, text) from public, anon;
grant execute on function public.d360_admin_crear_codigo(text, text, int, date, text, int, numeric, text, text) to authenticated;

drop function if exists public.d360_admin_codigos();
create function public.d360_admin_codigos()
returns table(id uuid, codigo text, modalidad text, plan_id text, plan_nombre text, usos_max int, usos int,
              vence date, activo boolean, nota text, creado timestamptz, estado text, cuentas jsonb,
              meses_pagados int, monto numeric, moneda text, metodo text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return query
  select c.id, c.codigo, c.modalidad, c.plan_id, p.nombre, c.usos_max, c.usos, c.vence, c.activo, c.nota, c.creado,
         coalesce(_d360_motivo_codigo(c), 'disponible'),
         coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'nombre', k.nombre, 'creado', k.creado) order by k.creado)
                   from cuentas k where k.codigo_registro_id = c.id), '[]'::jsonb),
         c.meses_pagados,
         case when c.meses_pagados > 0 then coalesce(c.monto, case when c.moneda = 'USD' then p.precio_usd else p.precio_nio end * c.meses_pagados) end,
         c.moneda, c.metodo
  from codigos_registro c left join planes p on p.id = c.plan_id
  order by c.creado desc;
end $$;
revoke execute on function public.d360_admin_codigos() from public, anon;
grant execute on function public.d360_admin_codigos() to authenticated;
