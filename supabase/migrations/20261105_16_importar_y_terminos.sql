-- =====================================================================
-- DOCENCIA360 · 16 · Importación de estudiantes y aceptación de términos
--  - d360_importar_estudiantes: alta masiva desde Excel/CSV en una sola
--    llamada, con validación, detección de duplicados y límite del plan.
--  - Términos y privacidad: versión vigente en config_global; la cuenta
--    guarda qué versión aceptó su propietario y cuándo.
-- =====================================================================

-- ---------- 1. Términos ----------
alter table public.cuentas add column if not exists terminos_version text;
alter table public.cuentas add column if not exists terminos_aceptados timestamptz;

insert into public.config_global(clave, valor, descripcion) values
  ('publico.terminos_version', '"2026-11-05"', 'Versión vigente de los términos y la política de privacidad. Al cambiarla, cada propietario debe aceptarlos de nuevo.'),
  ('publico.titular', '""', 'Nombre de la persona o empresa titular del servicio (aparece en los términos y la privacidad)'),
  ('publico.correo_contacto', '""', 'Correo para consultas legales y de privacidad')
on conflict (clave) do nothing;

create or replace function public._d360_terminos_vigentes()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select valor #>> '{}' from config_global where clave = 'publico.terminos_version'), '');
$$;
revoke execute on function public._d360_terminos_vigentes() from public, anon, authenticated;

-- crear_cuenta exige aceptar la versión vigente de los términos
drop function if exists public.d360_crear_cuenta(text, text, text, text, text, text);
create or replace function public.d360_crear_cuenta(
  p_modalidad text, p_nombre text, p_tu_nombre text, p_plan text,
  p_telefono text default null, p_moneda text default 'NIO', p_terminos text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cuenta uuid; v_miembro uuid; v_codigo text; v_pin text;
        v_plan planes; v_dias int; v_email text; v_ver text := _d360_terminos_vigentes();
begin
  if v_uid is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  if coalesce(p_terminos, '') <> v_ver then
    raise exception 'Para crear la cuenta debes aceptar los términos de uso y la política de privacidad.';
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
  insert into cuentas(modalidad, nombre, codigo, propietario, telefono, email, moneda, terminos_version, terminos_aceptados)
  values (p_modalidad, trim(p_nombre), v_codigo, v_uid, nullif(trim(p_telefono),''), v_email,
          case when p_moneda = 'USD' then 'USD' else 'NIO' end, v_ver, now())
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
  perform d360_log(v_cuenta, 'cuenta_creada', 'cuentas', v_cuenta::text, jsonb_build_object('plan', p_plan, 'dias_prueba', v_dias, 'terminos', v_ver));
  return jsonb_build_object('cuenta_id', v_cuenta, 'codigo_institucion', v_codigo, 'codigo_personal', v_pin,
                            'estado', case when v_dias > 0 then 'prueba' else 'pendiente' end, 'dias_prueba', v_dias);
end $$;
revoke execute on function public.d360_crear_cuenta(text, text, text, text, text, text, text) from public, anon;

-- Propietarios de cuentas existentes (o cuando cambia la versión)
create or replace function public.d360_aceptar_terminos(p_cuenta uuid, p_version text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ver text := _d360_terminos_vigentes();
begin
  if not exists(select 1 from cuentas where id = p_cuenta and propietario = auth.uid()) then
    raise exception 'Solo el propietario de la cuenta acepta los términos.' using errcode = '42501';
  end if;
  if coalesce(p_version, '') <> v_ver then raise exception 'Esa versión de los términos ya no está vigente. Recarga la página.'; end if;
  perform set_config('d360.mantenimiento', 'on', true);   -- permite el cambio también en cuentas de demostración
  update cuentas set terminos_version = v_ver, terminos_aceptados = now() where id = p_cuenta;
  perform d360_log(p_cuenta, 'terminos_aceptados', 'cuentas', p_cuenta::text, jsonb_build_object('version', v_ver));
end $$;
revoke execute on function public.d360_aceptar_terminos(uuid, text) from public, anon;

-- ---------- 2. Importación de estudiantes ----------
-- p_filas: arreglo JSON de objetos con nombres, apellidos, fecha_nacimiento (AAAA-MM-DD),
-- genero (F/M/O), documento, codigo, telefono, email, direccion, contacto_nombre,
-- contacto_telefono, contacto_parentesco, observaciones y _fila (número de fila del archivo).
-- p_grupo: opcional. Profesor → inscribe en el grupo. Colegio → matricula en la sección
-- (genera colegiaturas según p_opciones: mes_inicio, meses, dia). Academia → no se permite
-- (las inscripciones se hacen desde Matrículas para generar sus cobros).
create or replace function public.d360_importar_estudiantes(
  p_cuenta uuid, p_filas jsonb, p_grupo uuid default null, p_opciones jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_mod text; v_g grupos; v_plan planes; v_act int; v_n int; f jsonb; i int := 0; v_id uuid; v_dup uuid;
        creados int := 0; inscritos int := 0; omitidos jsonb := '[]'::jsonb; v_fila int;
        v_nom text; v_ape text; v_doc text; v_cod text; v_fn date; v_gen text; v_mail text;
        v_anio int := extract(year from current_date)::int;
begin
  if not d360_gestor_operativo(p_cuenta) then
    raise exception 'No tienes permiso para importar estudiantes, o la suscripción no está vigente.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'El archivo no tiene filas para importar.'; end if;
  v_n := jsonb_array_length(p_filas);
  if v_n > 500 then raise exception 'Importa como máximo 500 filas por envío.'; end if;
  select modalidad into v_mod from cuentas where id = p_cuenta;

  if p_grupo is not null then
    select * into v_g from grupos where id = p_grupo and cuenta_id = p_cuenta;
    if v_g.id is null or v_g.estado not in ('activo','planificado') then raise exception 'El grupo o la sección no está abierta.'; end if;
    if v_mod = 'academia' then raise exception 'En una academia, inscribe a los estudiantes desde Matrículas para que se generen sus cobros.'; end if;
    if v_mod = 'colegio' and v_g.grado_id is null then raise exception 'Elige una sección que pertenezca a un grado.'; end if;
  end if;

  -- Límite del plan: se revisa antes de empezar para dar un mensaje claro
  select p.* into v_plan from suscripciones s join planes p on p.id = s.plan_id where s.cuenta_id = p_cuenta;
  if v_plan.max_estudiantes is not null then
    select count(*) into v_act from estudiantes where cuenta_id = p_cuenta and estado = 'activo';
    if v_act + v_n > v_plan.max_estudiantes then
      raise exception 'Tu plan permite % estudiantes activos. Ya tienes % y el archivo trae %. Importa menos filas o cambia de plan.',
        v_plan.max_estudiantes, v_act, v_n;
    end if;
  end if;

  for f in select value from jsonb_array_elements(p_filas) loop
    i := i + 1;
    v_fila := coalesce(nullif(f ->> '_fila', '')::int, i);
    v_nom := left(trim(coalesce(f ->> 'nombres', '')), 80);
    v_ape := left(trim(coalesce(f ->> 'apellidos', '')), 80);
    v_doc := nullif(trim(coalesce(f ->> 'documento', '')), '');
    v_cod := nullif(trim(coalesce(f ->> 'codigo', '')), '');
    v_mail := nullif(lower(trim(coalesce(f ->> 'email', ''))), '');
    v_gen := case upper(left(trim(coalesce(f ->> 'genero', '')), 1)) when 'F' then 'F' when 'M' then 'M' when 'O' then 'O' end;
    begin v_fn := nullif(f ->> 'fecha_nacimiento', '')::date; exception when others then v_fn := null; end;
    if v_fn is not null and (v_fn > current_date or v_fn < date '1900-01-01') then v_fn := null; end if;

    if v_nom = '' then
      omitidos := omitidos || jsonb_build_object('fila', v_fila, 'nombre', v_ape, 'motivo', 'Falta el nombre');
      continue;
    end if;
    if v_mail is not null and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_mail := null; end if;

    select id into v_dup from estudiantes e where e.cuenta_id = p_cuenta and (
        (v_doc is not null and lower(e.documento) = lower(v_doc)) or
        (v_cod is not null and e.codigo = v_cod) or
        (lower(e.nombres) = lower(v_nom) and lower(e.apellidos) = lower(v_ape) and e.fecha_nacimiento is not distinct from v_fn))
      limit 1;
    if v_dup is not null then
      omitidos := omitidos || jsonb_build_object('fila', v_fila, 'nombre', trim(v_nom || ' ' || v_ape),
        'motivo', 'Ya existe un estudiante con el mismo documento, código o nombre');
      continue;
    end if;

    begin
      insert into estudiantes(cuenta_id, codigo, nombres, apellidos, fecha_nacimiento, genero, documento, email, telefono, direccion,
                              contacto_nombre, contacto_telefono, contacto_parentesco, observaciones)
      values (p_cuenta, v_cod, v_nom, v_ape, v_fn, v_gen, v_doc, v_mail,
              left(nullif(trim(coalesce(f ->> 'telefono', '')), ''), 40), left(nullif(trim(coalesce(f ->> 'direccion', '')), ''), 300),
              left(nullif(trim(coalesce(f ->> 'contacto_nombre', '')), ''), 120), left(nullif(trim(coalesce(f ->> 'contacto_telefono', '')), ''), 40),
              left(nullif(trim(coalesce(f ->> 'contacto_parentesco', '')), ''), 40), left(nullif(trim(coalesce(f ->> 'observaciones', '')), ''), 1000))
      returning id into v_id;
      if p_grupo is not null then
        if v_mod = 'colegio' then
          perform d360_matricular_colegio(p_cuenta, v_id, p_grupo, v_anio,
            coalesce((p_opciones ->> 'meses')::int, 10), coalesce((p_opciones ->> 'mes_inicio')::int, 2),
            coalesce((p_opciones ->> 'dia')::int, 10), 0, null, 'Importado desde archivo');
        else
          insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado)
          values (p_grupo, v_id, p_cuenta, current_date, 'activo');
        end if;
        inscritos := inscritos + 1;
      end if;
      creados := creados + 1;
    exception when others then
      omitidos := omitidos || jsonb_build_object('fila', v_fila, 'nombre', trim(v_nom || ' ' || v_ape), 'motivo', sqlerrm);
    end;
  end loop;

  perform d360_log(p_cuenta, 'importar_estudiantes', 'estudiantes', null,
    jsonb_build_object('filas', v_n, 'creados', creados, 'inscritos', inscritos, 'omitidos', jsonb_array_length(omitidos), 'grupo', v_g.nombre));
  return jsonb_build_object('creados', creados, 'inscritos', inscritos, 'omitidos', omitidos);
end $$;
revoke execute on function public.d360_importar_estudiantes(uuid, jsonb, uuid, jsonb) from public, anon;
