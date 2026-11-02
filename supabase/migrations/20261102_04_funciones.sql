-- =====================================================================
-- DOCENCIA360 · 04 · Funciones: cuentas, miembros, códigos de acceso,
-- cálculos académicos, panel maestro y automatizaciones.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Generadores de códigos
-- ---------------------------------------------------------------------
-- Alfabeto sin caracteres confusos (0/O, 1/I/L)
create or replace function public._d360_codigo_aleatorio(p_largo int)
returns text language plpgsql volatile set search_path = public, extensions as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; r text := ''; b bytea := gen_random_bytes(p_largo);
begin
  for i in 0..p_largo-1 loop
    r := r || substr(a, (get_byte(b, i) % length(a)) + 1, 1);
  end loop;
  return r;
end $$;

create or replace function public._d360_pin_aleatorio()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare b bytea := gen_random_bytes(4);
begin
  return lpad(((get_byte(b,0)::bigint << 24 | get_byte(b,1) << 16 | get_byte(b,2) << 8 | get_byte(b,3)) % 1000000)::text, 6, '0');
end $$;

-- HMAC con pepper del servidor: búsqueda directa sin exponer el código
create or replace function public._d360_hash_codigo(p_cuenta uuid, p_pin text)
returns text language sql stable security definer set search_path = public, extensions as $$
  select encode(hmac(p_cuenta::text || ':' || p_pin,
                     (select valor from secretos_servidor where clave = 'pepper_codigos'), 'sha256'), 'hex');
$$;

-- Asigna un código personal NUEVO y único al miembro; lo devuelve en claro una sola vez.
create or replace function public._d360_asignar_codigo(p_miembro uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_cuenta uuid; v_pin text; v_hash text; v_try int := 0;
begin
  select cuenta_id into v_cuenta from miembros where id = p_miembro;
  loop
    v_try := v_try + 1;
    v_pin := _d360_pin_aleatorio();
    v_hash := _d360_hash_codigo(v_cuenta, v_pin);
    exit when not exists(select 1 from miembros_secretos where cuenta_id = v_cuenta and codigo_hash = v_hash and miembro_id <> p_miembro);
    if v_try > 20 then raise exception 'No se pudo generar un código único'; end if;
  end loop;
  insert into miembros_secretos(miembro_id, cuenta_id, codigo_hash) values (p_miembro, v_cuenta, v_hash)
  on conflict (miembro_id) do update set codigo_hash = excluded.codigo_hash, actualizado = now();
  update miembros set codigo_ultimos = right(v_pin, 2) where id = p_miembro;
  return v_pin;
end $$;
revoke all on function public._d360_asignar_codigo(uuid) from public, anon, authenticated;
revoke all on function public._d360_hash_codigo(uuid, text) from public, anon, authenticated;
revoke all on function public._d360_codigo_aleatorio(int) from public, anon, authenticated;
revoke all on function public._d360_pin_aleatorio() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Registro de una cuenta nueva (lo llama el dueño recién registrado)
-- ---------------------------------------------------------------------
create or replace function public.d360_crear_cuenta(
  p_modalidad text, p_nombre text, p_tu_nombre text, p_plan text,
  p_telefono text default null, p_moneda text default 'NIO')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cuenta uuid; v_miembro uuid; v_codigo text; v_pin text;
        v_plan planes; v_dias int; v_email text;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  if (select count(*) from cuentas where propietario = v_uid) >= 3 then
    raise exception 'Ya tienes el máximo de cuentas permitidas (3).';
  end if;
  select * into v_plan from planes where id = p_plan and activo;
  if v_plan.id is null or v_plan.modalidad <> p_modalidad then
    raise exception 'El plan elegido no corresponde a la modalidad.';
  end if;
  if coalesce(length(trim(p_nombre)),0) < 2 or coalesce(length(trim(p_tu_nombre)),0) < 2 then
    raise exception 'Escribe tu nombre y el nombre de la cuenta.';
  end if;
  select coalesce((valor #>> '{}')::int, 14) into v_dias from config_global where clave = 'publico.dias_prueba';
  v_dias := coalesce(v_dias, 14);
  select email into v_email from auth.users where id = v_uid;

  loop
    v_codigo := _d360_codigo_aleatorio(6);
    exit when not exists(select 1 from cuentas where codigo = v_codigo);
  end loop;

  insert into cuentas(modalidad, nombre, codigo, propietario, telefono, email, moneda)
  values (p_modalidad, trim(p_nombre), v_codigo, v_uid, nullif(trim(p_telefono),''), v_email,
          case when p_moneda = 'USD' then 'USD' else 'NIO' end)
  returning id into v_cuenta;

  insert into suscripciones(cuenta_id, plan_id, estado, inicio, vence)
  values (v_cuenta, v_plan.id, 'prueba', current_date, current_date + v_dias);

  insert into miembros(cuenta_id, user_id, nombre, email, rol)
  values (v_cuenta, v_uid, trim(p_tu_nombre), v_email, 'propietario')
  returning id into v_miembro;

  v_pin := _d360_asignar_codigo(v_miembro);

  -- Estructura mínima según modalidad
  if p_modalidad = 'colegio' then
    insert into periodos(cuenta_id, nombre, inicio, fin, orden) values
      (v_cuenta, 'I Semestre', make_date(extract(year from current_date)::int, 2, 1), make_date(extract(year from current_date)::int, 6, 30), 1),
      (v_cuenta, 'II Semestre', make_date(extract(year from current_date)::int, 7, 1), make_date(extract(year from current_date)::int, 11, 30), 2);
  end if;

  perform d360_log(v_cuenta, 'cuenta_creada', 'cuentas', v_cuenta::text, jsonb_build_object('plan', p_plan));
  return jsonb_build_object('cuenta_id', v_cuenta, 'codigo_institucion', v_codigo, 'codigo_personal', v_pin);
end $$;

-- Cuentas a las que pertenece el usuario actual
create or replace function public.d360_mis_cuentas()
returns table(cuenta_id uuid, nombre text, modalidad text, codigo text, rol text, miembro_id uuid,
              miembro_nombre text, plan_id text, plan_nombre text, estado text, vence date,
              dias_gracia int, operativa boolean, funciones jsonb, onboarding_completo boolean,
              moneda text, logo_url text)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.modalidad, c.codigo, m.rol, m.id, m.nombre, p.id, p.nombre, s.estado, s.vence,
         s.dias_gracia, d360_cuenta_operativa(c.id), p.funciones, c.onboarding_completo, c.moneda, c.logo_url
  from miembros m
  join cuentas c on c.id = m.cuenta_id
  left join suscripciones s on s.cuenta_id = c.id
  left join planes p on p.id = s.plan_id
  where m.user_id = auth.uid() and m.activo
  order by c.creado;
$$;

-- ---------------------------------------------------------------------
-- Miembros (personal y familias) con código de acceso
-- ---------------------------------------------------------------------
create or replace function public.d360_crear_miembro(
  p_cuenta uuid, p_nombre text, p_rol text, p_email text default null,
  p_telefono text default null, p_especialidad text default null, p_documento text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_mi_rol text := d360_mi_rol(p_cuenta); v_id uuid; v_pin text; v_mod text;
begin
  if v_mi_rol is null or v_mi_rol not in ('propietario','director','subdirector','coordinador','administrativo') then
    raise exception 'No tienes permiso para agregar usuarios.' using errcode = '42501';
  end if;
  if not d360_cuenta_operativa(p_cuenta) then
    raise exception 'La suscripción de la cuenta no está vigente.' using errcode = '42501';
  end if;
  if p_rol not in ('director','subdirector','coordinador','administrativo','finanzas','docente','tutor') then
    raise exception 'Rol no válido.';
  end if;
  -- Solo propietario/director pueden crear cargos directivos
  if p_rol in ('director','subdirector') and v_mi_rol not in ('propietario','director') then
    raise exception 'Solo la dirección puede crear ese tipo de usuario.' using errcode = '42501';
  end if;
  select modalidad into v_mod from cuentas where id = p_cuenta;
  if v_mod = 'profesor' and p_rol not in ('docente') then
    raise exception 'En la modalidad de profesor independiente solo se pueden agregar asistentes.';
  end if;
  if p_rol = 'tutor' and not d360_tiene_funcion(p_cuenta, 'portal_familias') then
    raise exception 'Tu plan no incluye el portal de padres y tutores.' using hint = 'limite_plan';
  end if;
  if p_rol = 'docente' then perform d360_validar_limite(p_cuenta, 'docentes');
  elsif p_rol <> 'tutor' then perform d360_validar_limite(p_cuenta, 'admins'); end if;

  insert into miembros(cuenta_id, nombre, rol, email, telefono, especialidad, documento)
  values (p_cuenta, trim(p_nombre), p_rol, nullif(trim(p_email),''), nullif(trim(p_telefono),''),
          nullif(trim(p_especialidad),''), nullif(trim(p_documento),''))
  returning id into v_id;
  v_pin := _d360_asignar_codigo(v_id);
  perform d360_log(p_cuenta, 'miembro_creado', 'miembros', v_id::text, jsonb_build_object('rol', p_rol, 'nombre', p_nombre));
  return jsonb_build_object('miembro_id', v_id, 'codigo_personal', v_pin);
end $$;

create or replace function public.d360_editar_miembro(
  p_miembro uuid, p_nombre text, p_rol text, p_email text, p_telefono text,
  p_especialidad text, p_activo boolean, p_documento text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_m miembros; v_mi_rol text;
begin
  select * into v_m from miembros where id = p_miembro;
  if v_m.id is null then raise exception 'Usuario no encontrado.'; end if;
  v_mi_rol := d360_mi_rol(v_m.cuenta_id);
  if v_mi_rol is null or v_mi_rol not in ('propietario','director','subdirector','coordinador','administrativo') then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  if v_m.rol = 'propietario' and (p_rol <> 'propietario' or not p_activo) then
    raise exception 'La persona propietaria no se puede desactivar ni cambiar de rol.';
  end if;
  if p_rol = 'propietario' and v_m.rol <> 'propietario' then raise exception 'Rol no válido.'; end if;
  if v_m.rol in ('director','subdirector') and v_mi_rol not in ('propietario','director') then
    raise exception 'Solo la dirección puede modificar a otro directivo.' using errcode = '42501';
  end if;
  if p_activo and not v_m.activo then
    if p_rol = 'docente' then perform d360_validar_limite(v_m.cuenta_id, 'docentes');
    elsif p_rol not in ('tutor','propietario') then perform d360_validar_limite(v_m.cuenta_id, 'admins'); end if;
  end if;
  update miembros set nombre = trim(p_nombre), rol = p_rol, email = nullif(trim(p_email),''),
    telefono = nullif(trim(p_telefono),''), especialidad = nullif(trim(p_especialidad),''),
    documento = nullif(trim(p_documento),''), activo = p_activo
  where id = p_miembro;
  perform d360_log(v_m.cuenta_id, 'miembro_editado', 'miembros', p_miembro::text,
                   jsonb_build_object('rol', p_rol, 'activo', p_activo));
end $$;

-- Regenera el código de un miembro (o el propio). Invalida el anterior.
create or replace function public.d360_regenerar_codigo(p_miembro uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_m miembros; v_pin text;
begin
  select * into v_m from miembros where id = p_miembro;
  if v_m.id is null then raise exception 'Usuario no encontrado.'; end if;
  if not (v_m.user_id = auth.uid()
          or (d360_es_gestor(v_m.cuenta_id) and v_m.rol <> 'propietario')
          or d360_mi_rol(v_m.cuenta_id) = 'propietario') then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  v_pin := _d360_asignar_codigo(p_miembro);
  perform d360_log(v_m.cuenta_id, 'codigo_regenerado', 'miembros', p_miembro::text, null);
  return v_pin;
end $$;

-- ---------------------------------------------------------------------
-- Canje del código de acceso. SOLO la Edge Function (service_role)
-- puede llamarla: bloqueo por intentos, identificación y auditoría.
-- ---------------------------------------------------------------------
create or replace function public.d360_canjear_codigo(p_institucion text, p_pin text, p_origen text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inst text := upper(regexp_replace(coalesce(p_institucion,''), '[^A-Za-z0-9]', '', 'g'));
        v_clave text; v_int acceso_intentos; v_c cuentas; v_m miembros; v_max int := 5; v_min int := 15;
begin
  if v_inst !~ '^[A-Z0-9]{6}$' or coalesce(p_pin,'') !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'motivo', 'formato');
  end if;
  v_clave := v_inst || '|' || coalesce(p_origen, '-');
  -- Bloqueo global de la institución (ataques desde muchas IP)
  select * into v_int from acceso_intentos where clave = v_inst || '|*';
  if v_int.bloqueado_hasta is not null and v_int.bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado',
      'minutos', ceil(extract(epoch from v_int.bloqueado_hasta - now()) / 60));
  end if;
  select * into v_int from acceso_intentos where clave = v_clave;
  if v_int.bloqueado_hasta is not null and v_int.bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado',
      'minutos', ceil(extract(epoch from v_int.bloqueado_hasta - now()) / 60));
  end if;

  select * into v_c from cuentas where codigo = v_inst;
  if v_c.id is not null then
    select m.* into v_m from miembros_secretos s join miembros m on m.id = s.miembro_id
    where s.cuenta_id = v_c.id and s.codigo_hash = _d360_hash_codigo(v_c.id, p_pin);
  end if;

  if v_m.id is null then
    insert into acceso_intentos(clave, fallos, actualizado) values (v_clave, 1, now())
    on conflict (clave) do update set
      fallos = case when acceso_intentos.bloqueado_hasta is not null and acceso_intentos.bloqueado_hasta <= now()
                    then 1 else acceso_intentos.fallos + 1 end,
      bloqueado_hasta = case when acceso_intentos.bloqueado_hasta is not null and acceso_intentos.bloqueado_hasta <= now() then null
                             when acceso_intentos.fallos + 1 >= v_max then now() + make_interval(mins => v_min) else null end,
      actualizado = now()
    returning * into v_int;
    -- contador global: 30 fallos en la institución => 15 min de bloqueo
    insert into acceso_intentos(clave, fallos, actualizado) values (v_inst || '|*', 1, now())
    on conflict (clave) do update set
      fallos = case when acceso_intentos.actualizado < now() - interval '1 hour'
                      or (acceso_intentos.bloqueado_hasta is not null and acceso_intentos.bloqueado_hasta <= now())
                    then 1 else acceso_intentos.fallos + 1 end,
      bloqueado_hasta = case when acceso_intentos.bloqueado_hasta is not null and acceso_intentos.bloqueado_hasta <= now() then null
                             when acceso_intentos.fallos + 1 >= 30 and acceso_intentos.actualizado >= now() - interval '1 hour'
                             then now() + make_interval(mins => v_min) else null end,
      actualizado = now();
    if v_c.id is not null then
      insert into auditoria(cuenta_id, accion, entidad, detalle)
      values (v_c.id, 'acceso_fallido', 'acceso', jsonb_build_object('origen', p_origen, 'fallos', v_int.fallos));
    end if;
    if v_int.bloqueado_hasta is not null then
      return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', v_min);
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'incorrecto', 'restantes', greatest(v_max - v_int.fallos, 0));
  end if;

  if not v_m.activo then
    return jsonb_build_object('ok', false, 'motivo', 'inactivo');
  end if;
  if exists(select 1 from suscripciones where cuenta_id = v_c.id and estado in ('suspendida','cancelada')) then
    return jsonb_build_object('ok', false, 'motivo', 'cuenta_suspendida');
  end if;

  delete from acceso_intentos where clave = v_clave;
  update miembros set ultimo_acceso = now() where id = v_m.id;
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (v_c.id, v_m.user_id, 'acceso_codigo', 'miembros', v_m.id::text, jsonb_build_object('origen', p_origen));
  return jsonb_build_object('ok', true, 'miembro_id', v_m.id, 'user_id', v_m.user_id,
                            'email', (select email from auth.users where id = v_m.user_id),
                            'cuenta_id', v_c.id, 'modalidad', v_c.modalidad);
end $$;

create or replace function public.d360_vincular_usuario(p_miembro uuid, p_user uuid)
returns void language sql security definer set search_path = public as $$
  update miembros set user_id = p_user where id = p_miembro and user_id is null;
$$;

revoke all on function public.d360_canjear_codigo(text, text, text) from public, anon, authenticated;
revoke all on function public.d360_vincular_usuario(uuid, uuid) from public, anon, authenticated;
grant execute on function public.d360_canjear_codigo(text, text, text) to service_role;
grant execute on function public.d360_vincular_usuario(uuid, uuid) to service_role;

-- Registrar el último acceso cuando se entra con correo
create or replace function public.d360_marcar_acceso(p_cuenta uuid)
returns void language sql security definer set search_path = public as $$
  update miembros set ultimo_acceso = now() where cuenta_id = p_cuenta and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Cálculos académicos (SECURITY INVOKER: respetan RLS)
-- ---------------------------------------------------------------------
-- Promedio ponderado por estudiante dentro de un grupo.
-- Si las evaluaciones tienen pesos, se usa el peso relativo de las ya
-- calificadas; si no, promedio simple de porcentajes. Escala 0–100.
create or replace function public.d360_promedios_grupo(p_grupo uuid, p_periodo uuid default null)
returns table(estudiante_id uuid, promedio numeric, calificadas int, total_evaluaciones int, entregas_pendientes int)
language sql stable security invoker set search_path = public as $$
  with ev as (
    select * from evaluaciones e
    where e.grupo_id = p_grupo and (p_periodo is null or e.periodo_id = p_periodo)
  ), al as (
    select ge.estudiante_id from grupo_estudiantes ge where ge.grupo_id = p_grupo and ge.estado = 'activo'
  ), notas as (
    select al.estudiante_id, ev.id ev_id, ev.peso, ev.fecha, c.puntaje, ev.puntaje_max
    from al cross join ev
    left join calificaciones c on c.evaluacion_id = ev.id and c.estudiante_id = al.estudiante_id
  )
  select n.estudiante_id,
         case when count(n.puntaje) = 0 then null
              when sum(n.peso) filter (where n.puntaje is not null) > 0
                then round(sum(n.puntaje / n.puntaje_max * 100 * n.peso) filter (where n.puntaje is not null)
                           / sum(n.peso) filter (where n.puntaje is not null), 1)
              else round(avg(n.puntaje / n.puntaje_max * 100), 1) end,
         count(n.puntaje)::int,
         (select count(*) from ev)::int,
         count(*) filter (where n.puntaje is null and n.fecha < current_date)::int
  from notas n
  group by n.estudiante_id;
$$;

-- Resumen de asistencia por estudiante (opcionalmente de un grupo)
create or replace function public.d360_resumen_asistencia(p_cuenta uuid, p_grupo uuid default null,
                                                          p_desde date default null, p_hasta date default null)
returns table(estudiante_id uuid, presentes int, ausentes int, tardes int, justificados int, total int, porcentaje numeric)
language sql stable security invoker set search_path = public as $$
  select a.estudiante_id,
         count(*) filter (where estado = 'presente')::int,
         count(*) filter (where estado = 'ausente')::int,
         count(*) filter (where estado = 'tarde')::int,
         count(*) filter (where estado = 'justificado')::int,
         count(*)::int,
         round(100.0 * count(*) filter (where estado in ('presente','tarde','justificado')) / nullif(count(*),0), 1)
  from asistencias a
  where a.cuenta_id = p_cuenta
    and (p_grupo is null or a.grupo_id = p_grupo)
    and (p_desde is null or a.fecha >= p_desde)
    and (p_hasta is null or a.fecha <= p_hasta)
  group by a.estudiante_id;
$$;

-- Panel del profesor/academia/colegio: números reales en una sola llamada
create or replace function public.d360_resumen_panel(p_cuenta uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'estudiantes_activos', (select count(*) from estudiantes where cuenta_id = p_cuenta and estado = 'activo'),
    'grupos_activos',      (select count(*) from grupos where cuenta_id = p_cuenta and estado = 'activo'),
    'docentes',            (select count(*) from miembros where cuenta_id = p_cuenta and activo and rol = 'docente'),
    'personal',            (select count(*) from miembros where cuenta_id = p_cuenta and activo and rol not in ('docente','tutor')),
    'asistencia_30d',      (select round(100.0 * count(*) filter (where estado in ('presente','tarde','justificado')) / nullif(count(*),0), 1)
                              from asistencias where cuenta_id = p_cuenta and fecha >= current_date - 30),
    'asistencia_hoy_registrada', (select count(distinct grupo_id) from asistencias where cuenta_id = p_cuenta and fecha = current_date),
    'evaluaciones_sin_nota', (select count(*) from evaluaciones e where e.cuenta_id = p_cuenta and e.fecha <= current_date
                              and exists(select 1 from grupo_estudiantes ge where ge.grupo_id = e.grupo_id and ge.estado = 'activo'
                                         and not exists(select 1 from calificaciones c where c.evaluacion_id = e.id and c.estudiante_id = ge.estudiante_id))),
    'tareas_proximas',     (select count(*) from evaluaciones where cuenta_id = p_cuenta and tipo = 'tarea'
                              and fecha between current_date and current_date + 7),
    'matriculas_activas',  (select count(*) from matriculas where cuenta_id = p_cuenta and estado = 'activa'),
    'pendiente_cobro',     (select coalesce(sum(monto - descuento - pagado), 0) from cargos where cuenta_id = p_cuenta and estado in ('pendiente','parcial')),
    'vencido_cobro',       (select coalesce(sum(monto - descuento - pagado), 0) from cargos where cuenta_id = p_cuenta and estado in ('pendiente','parcial') and vence < current_date),
    'ingresos_mes',        (select coalesce(sum(monto), 0) from pagos where cuenta_id = p_cuenta and not anulado
                              and fecha >= date_trunc('month', current_date))
  );
$$;

-- ---------------------------------------------------------------------
-- Panel maestro (solo plataforma_admins)
-- ---------------------------------------------------------------------
create or replace function public.d360_admin_cuentas()
returns table(cuenta_id uuid, nombre text, modalidad text, codigo text, propietario_email text, telefono text,
              plan_id text, plan_nombre text, estado text, inicio date, vence date, dias_gracia int,
              estudiantes bigint, miembros bigint, ultimo_acceso timestamptz, creado timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return query
  select c.id, c.nombre, c.modalidad, c.codigo, u.email::text, c.telefono, s.plan_id, p.nombre, s.estado, s.inicio,
         s.vence, s.dias_gracia,
         (select count(*) from estudiantes e where e.cuenta_id = c.id and e.estado = 'activo'),
         (select count(*) from miembros m where m.cuenta_id = c.id and m.activo),
         (select max(m.ultimo_acceso) from miembros m where m.cuenta_id = c.id),
         c.creado
  from cuentas c
  left join auth.users u on u.id = c.propietario
  left join suscripciones s on s.cuenta_id = c.id
  left join planes p on p.id = s.plan_id
  order by c.creado desc;
end $$;

create or replace function public.d360_admin_metricas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return jsonb_build_object(
    'cuentas', (select count(*) from cuentas),
    'por_modalidad', (select coalesce(jsonb_object_agg(modalidad, n), '{}') from (select modalidad, count(*) n from cuentas group by 1) x),
    'por_estado', (select coalesce(jsonb_object_agg(estado, n), '{}') from (select estado, count(*) n from suscripciones group by 1) x),
    'mrr_usd', (select coalesce(sum(p.precio_usd), 0) from suscripciones s join planes p on p.id = s.plan_id where s.estado = 'activa'),
    'vencen_7d', (select count(*) from suscripciones where estado in ('activa','prueba') and vence between current_date and current_date + 7),
    'ingresos_mes', (select coalesce(jsonb_object_agg(moneda, total), '{}') from
                      (select moneda, sum(monto) total from pagos_suscripcion where creado >= date_trunc('month', now()) group by 1) x),
    'ingresos_12m', (select coalesce(jsonb_agg(x order by mes), '[]') from
                      (select to_char(date_trunc('month', creado), 'YYYY-MM') mes, moneda, sum(monto) total
                       from pagos_suscripcion where creado >= date_trunc('month', now()) - interval '11 months' group by 1, 2) x)
  );
end $$;

-- Registra el pago de una suscripción y extiende el vencimiento
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
  if v_s.estado = 'prueba' then v_desde := current_date; end if;
  v_hasta := (v_desde + make_interval(months => p_meses))::date;
  insert into pagos_suscripcion(cuenta_id, plan_id, monto, moneda, metodo, referencia, periodo_desde, periodo_hasta, registrado_por)
  values (p_cuenta, p_plan, p_monto, p_moneda, coalesce(p_metodo,'transferencia'), p_referencia, v_desde, v_hasta, auth.uid());
  update suscripciones set plan_id = p_plan, estado = 'activa', vence = v_hasta, actualizado = now() where cuenta_id = p_cuenta;
  perform d360_log(p_cuenta, 'suscripcion_pagada', 'suscripciones', p_cuenta::text,
                   jsonb_build_object('plan', p_plan, 'meses', p_meses, 'monto', p_monto, 'moneda', p_moneda));
  return v_hasta;
end $$;

-- ---------------------------------------------------------------------
-- Automatizaciones diarias (pg_cron)
-- ---------------------------------------------------------------------
create or replace function public.d360_tareas_diarias()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_venc int; n_susp int; n_alert int := 0; n_mat int; x int;
begin
  -- 1. Suscripciones: vencida al pasar la fecha; suspendida al agotar la gracia
  update suscripciones set estado = 'vencida', actualizado = now()
   where estado in ('activa','prueba') and vence < current_date;
  get diagnostics n_venc = row_count;
  update suscripciones set estado = 'suspendida', actualizado = now()
   where estado = 'vencida' and current_date > vence + dias_gracia;
  get diagnostics n_susp = row_count;

  -- 2. Aviso de vencimiento (7 y 2 días antes)
  insert into notificaciones(cuenta_id, tipo, titulo, cuerpo, enlace, clave)
  select s.cuenta_id, 'suscripcion', 'Tu plan vence pronto',
         'Tu plan vence el ' || to_char(s.vence, 'DD/MM/YYYY') || '. Renueva para no perder el acceso.', '#/cuenta',
         'venc-' || s.vence || '-' || (s.vence - current_date)
  from suscripciones s
  where s.estado in ('activa','prueba') and (s.vence - current_date) in (7, 2)
  on conflict do nothing;
  get diagnostics x = row_count; n_alert := n_alert + x;

  -- 3. Cobros vencidos (academia/colegio)
  insert into notificaciones(cuenta_id, tipo, titulo, cuerpo, enlace, clave)
  select c.cuenta_id, 'cobro', 'Pagos vencidos',
         count(*) || ' cobros vencidos por ' || to_char(sum(c.monto - c.descuento - c.pagado), 'FM999G999G990D00'),
         '#/finanzas', 'cobros-' || current_date
  from cargos c where c.estado in ('pendiente','parcial') and c.vence < current_date
  group by c.cuenta_id
  on conflict do nothing;
  get diagnostics x = row_count; n_alert := n_alert + x;

  -- 4. Evaluaciones de ayer sin calificar
  insert into notificaciones(cuenta_id, miembro_id, tipo, titulo, cuerpo, enlace, clave)
  select e.cuenta_id, gd.miembro_id, 'evaluacion', 'Evaluación sin calificar',
         e.titulo || ' (' || g.nombre || ') aún no tiene notas.', '#/calificaciones?grupo=' || g.id,
         'eval-' || e.id || '-' || coalesce(gd.miembro_id::text, 'g')
  from evaluaciones e
  join grupos g on g.id = e.grupo_id
  left join grupo_docentes gd on gd.grupo_id = g.id
  where e.fecha = current_date - 1
    and not exists(select 1 from calificaciones c where c.evaluacion_id = e.id)
  on conflict do nothing;
  get diagnostics x = row_count; n_alert := n_alert + x;

  -- 5. Matrículas de grupos finalizados pasan a completadas
  update matriculas m set estado = 'completada'
    from grupos g where g.id = m.grupo_id and m.estado = 'activa'
      and (g.estado = 'finalizado' or (g.fecha_fin is not null and g.fecha_fin < current_date));
  get diagnostics n_mat = row_count;
  update grupos set estado = 'finalizado' where estado = 'activo' and fecha_fin is not null and fecha_fin < current_date - 7;

  -- 6. Limpieza de intentos de acceso viejos
  delete from acceso_intentos where actualizado < now() - interval '2 days';

  return jsonb_build_object('vencidas', n_venc, 'suspendidas', n_susp, 'alertas', n_alert, 'matriculas_completadas', n_mat);
end $$;
revoke all on function public.d360_tareas_diarias() from public, anon, authenticated;

-- Las funciones internas no deben ser invocables desde la API pública
revoke all on function public.d360_misma_cuenta() from public, anon, authenticated;
revoke all on function public.d360_log(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.d360_validar_limite(uuid, text) from anon;
