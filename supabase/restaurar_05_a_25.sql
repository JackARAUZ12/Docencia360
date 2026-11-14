-- =====================================================================
-- DOCENCIA360 · Restauración en un proyecto nuevo: migraciones 05 a 25
-- Requiere que las migraciones 01 a 04 ya estén aplicadas.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este
-- archivo → Run. Se ejecuta completo o no se aplica nada.
-- =====================================================================

-- >>>>>>>>>> Permisos de la migración 04 (se aplicó sin ellos para no pedir confirmación)
revoke all on function public._d360_asignar_codigo(uuid) from public, anon, authenticated;
revoke all on function public._d360_hash_codigo(uuid, text) from public, anon, authenticated;
revoke all on function public._d360_codigo_aleatorio(int) from public, anon, authenticated;
revoke all on function public._d360_pin_aleatorio() from public, anon, authenticated;
revoke all on function public.d360_canjear_codigo(text, text, text) from public, anon, authenticated;
revoke all on function public.d360_vincular_usuario(uuid, uuid) from public, anon, authenticated;
grant execute on function public.d360_canjear_codigo(text, text, text) to service_role;
grant execute on function public.d360_vincular_usuario(uuid, uuid) to service_role;
revoke all on function public.d360_tareas_diarias() from public, anon, authenticated;
revoke all on function public.d360_misma_cuenta() from public, anon, authenticated;
revoke all on function public.d360_log(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.d360_validar_limite(uuid, text) from anon;

-- >>>>>>>>>> 20261102_05_planes_config.sql
-- =====================================================================
-- DOCENCIA360 · 05 · Planes iniciales, configuración y tareas programadas
-- Los precios y límites se editan desde el Panel Maestro; estos son
-- solo los valores de arranque (ver docs/PRECIOS.md).
-- =====================================================================
insert into public.planes(id, modalidad, nombre, orden, resumen, precio_usd, precio_nio,
  max_estudiantes, max_docentes, max_grupos, max_admins, almacenamiento_mb, funciones) values
('prof_basico','profesor','Básico',1,'Para empezar con tus primeras clases particulares',
  4, 149, 30, 0, 4, 0, 200,
  '{"tareas":true,"calendario":true,"reportes_pdf":false,"exportar":false,"asistentes":false}'),
('prof_profesional','profesor','Profesional',2,'Para tutores con varios grupos y reportes',
  8, 295, 120, 0, 15, 0, 1024,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"asistentes":false}'),
('prof_premium','profesor','Premium',3,'Sin límite de grupos y con un asistente',
  14, 515, 400, 1, null, 0, 3072,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"asistentes":true}'),

('acad_inicial','academia','Inicial',1,'Academias pequeñas que empiezan a ordenarse',
  19, 699, 150, 5, 12, 1, 2048,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"finanzas":true,"certificados":false,"comunicados":false,"portal_familias":false,"horarios":true}'),
('acad_profesional','academia','Profesional',2,'Cobros, certificados y comunicación con alumnos',
  39, 1429, 500, 20, 60, 4, 10240,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"finanzas":true,"certificados":true,"comunicados":true,"portal_familias":false,"horarios":true}'),
('acad_empresarial','academia','Empresarial',3,'Varias áreas, muchos instructores y portal de familias',
  69, 2529, 2000, null, null, 15, 51200,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"finanzas":true,"certificados":true,"comunicados":true,"portal_familias":true,"horarios":true,"auditoria":true}'),

('col_esencial','colegio','Esencial',1,'Lo académico del colegio: notas, asistencia y boletines',
  49, 1795, 400, 30, null, 4, 10240,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"boletines":true,"horarios":true,"finanzas":false,"certificados":true,"comunicados":true,"portal_familias":false}'),
('col_avanzado','colegio','Avanzado',2,'Suma cobros de colegiatura y el portal de padres',
  99, 3625, 1200, 80, null, 10, 51200,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"boletines":true,"horarios":true,"finanzas":true,"certificados":true,"comunicados":true,"portal_familias":true,"auditoria":true}'),
('col_institucional','colegio','Institucional',3,'Instituciones grandes, varias sedes y sin límites de personal',
  179, 6555, 5000, null, null, null, 204800,
  '{"tareas":true,"calendario":true,"reportes_pdf":true,"exportar":true,"boletines":true,"horarios":true,"finanzas":true,"certificados":true,"comunicados":true,"portal_familias":true,"auditoria":true,"sedes":true}');

insert into public.config_global(clave, valor, descripcion) values
('publico.dias_prueba', '14', 'Días de prueba gratis para cuentas nuevas'),
('publico.tipo_cambio', '36.62', 'Córdobas por dólar (referencial)'),
('publico.contacto_whatsapp', '""', 'Número de WhatsApp de ventas, con código de país'),
('publico.inactividad_minutos', '60', 'Minutos sin actividad antes de cerrar la sesión'),
('dias_gracia_defecto', '5', 'Días de gracia tras el vencimiento antes de suspender');

-- Administrador del panel maestro (propietario del SaaS)
insert into public.plataforma_admins(user_id)
select id from auth.users where email = 'jackarauz2008@gmail.com';

-- Tarea diaria (06:05 UTC = 00:05 en Nicaragua)
create extension if not exists pg_cron;
select cron.schedule('d360-tareas-diarias', '5 6 * * *', $$select public.d360_tareas_diarias()$$);

-- >>>>>>>>>> 20261103_06_endurecer_permisos.sql
-- =====================================================================
-- DOCENCIA360 · 06 · Endurecimiento según el asesor de seguridad
-- - Ninguna función d360 es invocable sin sesión (anon).
-- - Funciones de trigger: nadie las invoca por la API.
-- - search_path fijo en todas.
-- Las funciones auxiliares de RLS siguen disponibles para
-- "authenticated" porque las políticas las evalúan como ese rol.
-- =====================================================================
alter function public.d360_cuenta_inmutable() set search_path = public;
alter function public.t_limite_estudiantes() set search_path = public;
alter function public.t_limite_grupos() set search_path = public;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    if f.proname ~ '^t_' or f.proname in ('d360_cuenta_inmutable','d360_misma_cuenta') then
      execute format('revoke execute on function %s from authenticated', f.firma);
    end if;
  end loop;
end $$;

-- Las funciones nuevas no quedan abiertas por defecto
alter default privileges in schema public revoke execute on functions from public, anon;

-- >>>>>>>>>> 20261103_07_auditoria_admin.sql
-- =====================================================================
-- DOCENCIA360 · 07 · Auditoría de cambios administrativos
-- (suscripciones, planes, promociones, parámetros, cuentas, miembros)
-- =====================================================================
create or replace function public.t_auditar_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(coalesce(new, old));
begin
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (nullif(j ->> 'cuenta_id', '')::uuid, auth.uid(), lower(tg_op), tg_table_name,
          coalesce(j ->> 'id', j ->> 'clave', j ->> 'cuenta_id', j ->> 'user_id'),
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new)) else j end);
  return null;
end $$;
revoke execute on function public.t_auditar_admin() from public, anon, authenticated;

create trigger t_aud after insert or update or delete on public.suscripciones     for each row execute function public.t_auditar_admin();
create trigger t_aud after insert or update or delete on public.planes            for each row execute function public.t_auditar_admin();
create trigger t_aud after insert or update or delete on public.promociones       for each row execute function public.t_auditar_admin();
create trigger t_aud after insert or update or delete on public.config_global     for each row execute function public.t_auditar_admin();
create trigger t_aud after insert or update or delete on public.plataforma_admins for each row execute function public.t_auditar_admin();
create trigger t_aud after update                     on public.cuentas           for each row execute function public.t_auditar_admin();

-- Registro de actividad para el panel maestro (paginado)
create or replace function public.d360_admin_actividad(p_limite int default 100, p_cuenta uuid default null)
returns table(id bigint, creado timestamptz, cuenta text, accion text, entidad text, entidad_id text, usuario text, detalle jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return query
  select a.id, a.creado, c.nombre, a.accion, a.entidad, a.entidad_id,
         coalesce(m.nombre, u.email::text, 'sistema'), a.detalle
  from auditoria a
  left join cuentas c on c.id = a.cuenta_id
  left join auth.users u on u.id = a.user_id
  left join miembros m on m.user_id = a.user_id and m.cuenta_id = a.cuenta_id
  where p_cuenta is null or a.cuenta_id = p_cuenta
  order by a.creado desc
  limit least(greatest(p_limite, 1), 500);
end $$;
revoke execute on function public.d360_admin_actividad(int, uuid) from public, anon;

-- >>>>>>>>>> 20261103_08_academias.sql
-- =====================================================================
-- DOCENCIA360 · 08 · Operación de academias
--  - Matrícula transaccional: inscribe en el grupo y genera los cobros.
--  - Renovación y retiro con anulación de cobros futuros.
--  - Pagos validados (sin sobrepago) e inmutables (solo se anulan).
--  - Certificados con folio único y verificación pública.
--  - Carga de instructores e informes operativos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidad: fecha de vencimiento de la mensualidad n (0 = primer mes)
-- ---------------------------------------------------------------------
create or replace function public._d360_vence_mes(p_inicio date, p_n int, p_dia int)
returns date language sql immutable as $$
  select (date_trunc('month', p_inicio) + make_interval(months => p_n))::date
         + (least(greatest(coalesce(p_dia, 5), 1),
                  extract(day from (date_trunc('month', p_inicio) + make_interval(months => p_n + 1) - interval '1 day'))::int) - 1);
$$;

create or replace function public._d360_puede_operar(p_cuenta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (d360_es_gestor(p_cuenta) or d360_es_finanzas(p_cuenta)) and d360_cuenta_operativa(p_cuenta);
$$;

-- Genera mensualidades consecutivas para una matrícula
create or replace function public._d360_generar_mensualidades(p_matricula uuid, p_desde date, p_meses int, p_dia int)
returns int language plpgsql security definer set search_path = public as $$
declare v_m matriculas; v_curso text; v_desc numeric; v_vence date; n int := 0;
begin
  select * into v_m from matriculas where id = p_matricula;
  if v_m.mensualidad <= 0 or p_meses <= 0 then return 0; end if;
  if not d360_tiene_funcion(v_m.cuenta_id, 'finanzas') then return 0; end if;
  select nombre into v_curso from cursos where id = v_m.curso_id;
  v_desc := round(v_m.mensualidad * v_m.descuento_pct / 100, 2);
  for i in 0 .. p_meses - 1 loop
    v_vence := _d360_vence_mes(p_desde, i, p_dia);
    insert into cargos(cuenta_id, estudiante_id, matricula_id, concepto, tipo, monto, descuento, vence)
    values (v_m.cuenta_id, v_m.estudiante_id, v_m.id,
            'Mensualidad ' || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from v_vence)::int]
              || ' ' || extract(year from v_vence)::int || coalesce(' · ' || v_curso, ''),
            'mensualidad', v_m.mensualidad, v_desc, v_vence);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Matricular
-- ---------------------------------------------------------------------
create or replace function public.d360_matricular(
  p_cuenta uuid, p_estudiante uuid, p_curso uuid, p_grupo uuid, p_fecha date,
  p_monto_matricula numeric, p_mensualidad numeric, p_meses int, p_dia_pago int,
  p_descuento_pct numeric default 0, p_beca text default null, p_notas text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_g grupos; v_cargos int := 0; v_fecha date := coalesce(p_fecha, current_date);
begin
  if not _d360_puede_operar(p_cuenta) then
    raise exception 'No tienes permiso para matricular, o la suscripción no está vigente.' using errcode = '42501';
  end if;
  if not exists(select 1 from estudiantes where id = p_estudiante and cuenta_id = p_cuenta and estado = 'activo') then
    raise exception 'El estudiante no existe o no está activo.';
  end if;
  if p_curso is null and p_grupo is null then raise exception 'Elige un curso o un grupo.'; end if;
  if p_grupo is not null then
    select * into v_g from grupos where id = p_grupo and cuenta_id = p_cuenta;
    if v_g.id is null then raise exception 'Grupo no válido.'; end if;
    if v_g.estado not in ('activo','planificado') then raise exception 'El grupo no está abierto a matrículas.'; end if;
    if p_curso is not null and v_g.curso_id is not null and v_g.curso_id <> p_curso then
      raise exception 'El grupo elegido pertenece a otro curso.';
    end if;
  end if;
  if p_curso is not null and not exists(select 1 from cursos where id = p_curso and cuenta_id = p_cuenta) then
    raise exception 'Curso no válido.';
  end if;
  if exists(select 1 from matriculas where cuenta_id = p_cuenta and estudiante_id = p_estudiante and estado in ('activa','pendiente')
            and ((p_grupo is not null and grupo_id = p_grupo) or (p_grupo is null and p_curso is not null and curso_id = p_curso))) then
    raise exception 'El estudiante ya tiene una matrícula activa en ese curso o grupo.';
  end if;
  if coalesce(p_meses, 0) < 0 or coalesce(p_meses, 0) > 36 then raise exception 'Meses a generar: entre 0 y 36.'; end if;
  if coalesce(p_descuento_pct, 0) not between 0 and 100 then raise exception 'Descuento entre 0 y 100%%.'; end if;

  insert into matriculas(cuenta_id, estudiante_id, curso_id, grupo_id, anio, fecha, estado,
                         monto_matricula, mensualidad, descuento_pct, beca, notas)
  values (p_cuenta, p_estudiante, coalesce(p_curso, v_g.curso_id), p_grupo, extract(year from v_fecha)::text, v_fecha, 'activa',
          coalesce(p_monto_matricula, 0), coalesce(p_mensualidad, 0), coalesce(p_descuento_pct, 0),
          nullif(trim(p_beca), ''), nullif(trim(p_notas), ''))
  returning id into v_id;

  if p_grupo is not null then
    insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado)
    values (p_grupo, p_estudiante, p_cuenta, v_fecha, 'activo')
    on conflict (grupo_id, estudiante_id) do update set estado = 'activo', desde = excluded.desde;
  end if;

  if d360_tiene_funcion(p_cuenta, 'finanzas') then
    if coalesce(p_monto_matricula, 0) > 0 then
      insert into cargos(cuenta_id, estudiante_id, matricula_id, concepto, tipo, monto, vence)
      values (p_cuenta, p_estudiante, v_id,
              'Matrícula' || coalesce(' · ' || (select nombre from cursos where id = coalesce(p_curso, v_g.curso_id)), ''),
              'matricula', p_monto_matricula, v_fecha);
      v_cargos := 1;
    end if;
    v_cargos := v_cargos + _d360_generar_mensualidades(v_id, v_fecha, coalesce(p_meses, 0), p_dia_pago);
  end if;

  perform d360_log(p_cuenta, 'matricula_creada', 'matriculas', v_id::text,
                   jsonb_build_object('estudiante', p_estudiante, 'grupo', p_grupo, 'cargos', v_cargos));
  return jsonb_build_object('matricula_id', v_id, 'cargos', v_cargos);
end $$;

-- Renovar: agrega mensualidades a continuación de la última
create or replace function public.d360_renovar_matricula(p_matricula uuid, p_meses int, p_dia_pago int default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_m matriculas; v_ult date; v_desde date; n int;
begin
  select * into v_m from matriculas where id = p_matricula;
  if v_m.id is null or not _d360_puede_operar(v_m.cuenta_id) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if v_m.estado not in ('activa','completada') then raise exception 'Solo se renuevan matrículas activas o completadas.'; end if;
  if p_meses not between 1 and 36 then raise exception 'Meses entre 1 y 36.'; end if;
  select max(vence) into v_ult from cargos where matricula_id = p_matricula and tipo = 'mensualidad' and estado <> 'anulado';
  v_desde := case when v_ult is null then current_date else (date_trunc('month', v_ult) + interval '1 month')::date end;
  n := _d360_generar_mensualidades(p_matricula, v_desde, p_meses, coalesce(p_dia_pago, extract(day from coalesce(v_ult, current_date))::int));
  update matriculas set estado = 'activa' where id = p_matricula;
  if v_m.grupo_id is not null then
    update grupo_estudiantes set estado = 'activo' where grupo_id = v_m.grupo_id and estudiante_id = v_m.estudiante_id;
  end if;
  perform d360_log(v_m.cuenta_id, 'matricula_renovada', 'matriculas', p_matricula::text, jsonb_build_object('meses', p_meses));
  return n;
end $$;

-- Retirar: cierra la matrícula, retira del grupo y anula cobros futuros sin abonos
create or replace function public.d360_retirar_matricula(p_matricula uuid, p_motivo text, p_anular_pendientes boolean default true)
returns int language plpgsql security definer set search_path = public as $$
declare v_m matriculas; n int := 0;
begin
  select * into v_m from matriculas where id = p_matricula;
  if v_m.id is null or not _d360_puede_operar(v_m.cuenta_id) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if v_m.estado in ('retirada','cancelada') then raise exception 'La matrícula ya está cerrada.'; end if;
  update matriculas set estado = 'retirada',
    notas = trim(both from coalesce(notas, '') || E'\nRetiro ' || to_char(current_date, 'DD/MM/YYYY') || ': ' || coalesce(p_motivo, 'sin motivo'))
  where id = p_matricula;
  if v_m.grupo_id is not null then
    update grupo_estudiantes set estado = 'retirado' where grupo_id = v_m.grupo_id and estudiante_id = v_m.estudiante_id;
  end if;
  if p_anular_pendientes then
    update cargos set estado = 'anulado'
     where matricula_id = p_matricula and estado = 'pendiente' and pagado = 0 and vence > current_date;
    get diagnostics n = row_count;
  end if;
  perform d360_log(v_m.cuenta_id, 'matricula_retirada', 'matriculas', p_matricula::text,
                   jsonb_build_object('motivo', p_motivo, 'cargos_anulados', n));
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Integridad de pagos y cobros
-- ---------------------------------------------------------------------
create or replace function public.t_validar_pago()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_c cargos; v_saldo numeric;
begin
  if tg_op = 'UPDATE' then
    -- Un pago registrado no se modifica: solo se puede anular (una vez)
    if new.monto <> old.monto or new.cargo_id is distinct from old.cargo_id or new.estudiante_id <> old.estudiante_id
       or new.fecha <> old.fecha or new.recibo is distinct from old.recibo or (old.anulado and not new.anulado) then
      raise exception 'Un pago registrado no se puede modificar; anúlalo y registra uno nuevo.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.cargo_id is not null then
    select * into v_c from cargos where id = new.cargo_id;
    if v_c.estado = 'anulado' then raise exception 'Ese cobro está anulado.' using errcode = 'P0001'; end if;
    if v_c.estudiante_id <> new.estudiante_id then raise exception 'El cobro pertenece a otro estudiante.' using errcode = 'P0001'; end if;
    v_saldo := v_c.monto - v_c.descuento - v_c.pagado;
    if new.monto > v_saldo + 0.005 then
      raise exception 'El monto (%) supera el saldo pendiente (%).', new.monto, v_saldo using errcode = 'P0001';
    end if;
  end if;
  new.registrado_por := auth.uid();
  return new;
end $$;
create trigger t_val before insert or update on public.pagos for each row execute function public.t_validar_pago();

create or replace function public.t_validar_cargo()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.estado = 'anulado' and old.estado <> 'anulado' and old.pagado > 0 then
      raise exception 'No se puede anular un cobro con abonos. Anula primero sus pagos.' using errcode = 'P0001';
    end if;
    if old.estado = 'anulado' and new.estado <> 'anulado' then
      raise exception 'Un cobro anulado no se reactiva; crea uno nuevo.' using errcode = 'P0001';
    end if;
    if new.monto - new.descuento < new.pagado - 0.005 then
      raise exception 'El monto no puede quedar por debajo de lo ya pagado.' using errcode = 'P0001';
    end if;
  end if;
  if new.descuento > new.monto then raise exception 'El descuento no puede ser mayor al monto.' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger t_val before insert or update on public.cargos for each row execute function public.t_validar_cargo();

-- ---------------------------------------------------------------------
-- Certificados
-- ---------------------------------------------------------------------
create or replace function public.d360_emitir_certificado(
  p_cuenta uuid, p_estudiante uuid, p_curso uuid, p_tipo text, p_titulo text, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_folio text; v_id uuid; v_cod text;
begin
  if not d360_gestor_operativo(p_cuenta) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if not d360_tiene_funcion(p_cuenta, 'certificados') then
    raise exception 'Tu plan no incluye certificados.' using hint = 'limite_plan';
  end if;
  if not exists(select 1 from estudiantes where id = p_estudiante and cuenta_id = p_cuenta) then raise exception 'Estudiante no válido.'; end if;
  if coalesce(length(trim(p_titulo)), 0) < 3 then raise exception 'Escribe el título del certificado.'; end if;
  select codigo into v_cod from cuentas where id = p_cuenta;
  loop
    v_folio := v_cod || '-' || to_char(current_date, 'YY') || '-' || _d360_codigo_aleatorio(6);
    exit when not exists(select 1 from certificados where folio = v_folio);
  end loop;
  insert into certificados(cuenta_id, estudiante_id, curso_id, tipo, titulo, folio, datos)
  values (p_cuenta, p_estudiante, p_curso, coalesce(p_tipo, 'certificado'), trim(p_titulo), v_folio, coalesce(p_datos, '{}'::jsonb))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'folio', v_folio);
end $$;

-- Verificación pública (cualquiera con el folio): solo datos mínimos
create or replace function public.d360_verificar_certificado(p_folio text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('valido', not c.anulado, 'anulado', c.anulado, 'folio', c.folio, 'tipo', c.tipo,
           'titulo', c.titulo, 'emitido', c.emitido, 'institucion', cu.nombre,
           'estudiante', trim(e.nombres || ' ' || e.apellidos), 'curso', cr.nombre)
    from certificados c
    join cuentas cu on cu.id = c.cuenta_id
    join estudiantes e on e.id = c.estudiante_id
    left join cursos cr on cr.id = c.curso_id
    where c.folio = upper(trim(p_folio))), jsonb_build_object('valido', false, 'encontrado', false));
$$;

-- ---------------------------------------------------------------------
-- Informes (SECURITY INVOKER: respetan RLS del usuario)
-- ---------------------------------------------------------------------
create or replace function public.d360_carga_instructores(p_cuenta uuid)
returns table(miembro_id uuid, nombre text, especialidad text, activo boolean, grupos int, estudiantes int, horas_semana numeric)
language sql stable security invoker set search_path = public as $$
  select m.id, m.nombre, m.especialidad, m.activo,
         (select count(distinct gd.grupo_id) from grupo_docentes gd join grupos g on g.id = gd.grupo_id
           where gd.miembro_id = m.id and g.estado in ('activo','planificado'))::int,
         (select count(distinct ge.estudiante_id) from grupo_docentes gd join grupo_estudiantes ge on ge.grupo_id = gd.grupo_id
           join grupos g on g.id = gd.grupo_id
           where gd.miembro_id = m.id and ge.estado = 'activo' and g.estado = 'activo')::int,
         coalesce((select round(sum(extract(epoch from (h.hora_fin - h.hora_inicio)) / 3600)::numeric, 1)
           from horarios h join grupos g on g.id = h.grupo_id
           where h.miembro_id = m.id and g.estado = 'activo'), 0)
  from miembros m
  where m.cuenta_id = p_cuenta and m.rol = 'docente'
  order by m.activo desc, m.nombre;
$$;

create or replace function public.d360_informe_operativo(p_cuenta uuid, p_desde date, p_hasta date)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'ingresos_mes', (select coalesce(jsonb_agg(x order by mes), '[]') from (
        select to_char(date_trunc('month', fecha), 'YYYY-MM') mes, sum(monto) total, count(*) pagos
        from pagos where cuenta_id = p_cuenta and not anulado and fecha between p_desde and p_hasta group by 1) x),
    'metodos', (select coalesce(jsonb_object_agg(metodo, total), '{}') from (
        select metodo, sum(monto) total from pagos where cuenta_id = p_cuenta and not anulado and fecha between p_desde and p_hasta group by 1) x),
    'matriculas_mes', (select coalesce(jsonb_agg(x order by mes), '[]') from (
        select to_char(date_trunc('month', fecha), 'YYYY-MM') mes, count(*) nuevas,
               count(*) filter (where estado = 'retirada') retiradas
        from matriculas where cuenta_id = p_cuenta and fecha between p_desde and p_hasta group by 1) x),
    'cursos', (select coalesce(jsonb_agg(x order by activas desc, total desc), '[]') from (
        select c.id, c.nombre, count(m.*) filter (where m.estado = 'activa') activas, count(m.*) total,
               count(m.*) filter (where m.estado = 'completada') completadas, count(m.*) filter (where m.estado = 'retirada') retiradas
        from cursos c left join matriculas m on m.curso_id = c.id
        where c.cuenta_id = p_cuenta group by c.id, c.nombre) x),
    'morosos', (select coalesce(jsonb_agg(x order by saldo desc), '[]') from (
        select e.id, trim(e.nombres || ' ' || e.apellidos) nombre, e.telefono, e.contacto_telefono,
               sum(c.monto - c.descuento - c.pagado) saldo, min(c.vence) desde, count(*) cobros
        from cargos c join estudiantes e on e.id = c.estudiante_id
        where c.cuenta_id = p_cuenta and c.estado in ('pendiente','parcial') and c.vence < current_date
        group by e.id, e.nombres, e.apellidos, e.telefono, e.contacto_telefono limit 100) x),
    'por_vencer', (select coalesce(sum(monto - descuento - pagado), 0) from cargos
        where cuenta_id = p_cuenta and estado in ('pendiente','parcial') and vence between current_date and current_date + 15)
  );
$$;

-- Permisos: nada sin sesión; las internas, nadie por API
revoke execute on function public._d360_vence_mes(date, int, int) from public, anon, authenticated;
revoke execute on function public._d360_puede_operar(uuid) from public, anon, authenticated;
revoke execute on function public._d360_generar_mensualidades(uuid, date, int, int) from public, anon, authenticated;
revoke execute on function public.t_validar_pago() from public, anon, authenticated;
revoke execute on function public.t_validar_cargo() from public, anon, authenticated;
revoke execute on function public.d360_matricular(uuid, uuid, uuid, uuid, date, numeric, numeric, int, int, numeric, text, text) from public, anon;
revoke execute on function public.d360_renovar_matricula(uuid, int, int) from public, anon;
revoke execute on function public.d360_retirar_matricula(uuid, text, boolean) from public, anon;
revoke execute on function public.d360_emitir_certificado(uuid, uuid, uuid, text, text, jsonb) from public, anon;
revoke execute on function public.d360_carga_instructores(uuid) from public, anon;
revoke execute on function public.d360_informe_operativo(uuid, date, date) from public, anon;
-- La verificación de certificados sí es pública a propósito
grant execute on function public.d360_verificar_certificado(text) to anon, authenticated;

-- >>>>>>>>>> 20261103_09_recordatorios_cobro.sql
-- =====================================================================
-- DOCENCIA360 · 09 · Recordatorio diario de cobros próximos a vencer
-- (academias y colegios con finanzas). Se ejecuta junto a la tarea diaria.
-- =====================================================================
create or replace function public.d360_recordatorios_cobro()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notificaciones(cuenta_id, tipo, titulo, cuerpo, enlace, clave)
  select c.cuenta_id, 'cobro', 'Cobros por vencer',
         count(*) || ' cobro(s) vencen el ' || to_char(current_date + 3, 'DD/MM') || ' por un total de '
           || to_char(sum(c.monto - c.descuento - c.pagado), 'FM999G999G990D00') || '. Avisa a las familias.',
         '#/finanzas?vista=cobrar', 'porvencer-' || (current_date + 3)
  from cargos c
  where c.estado in ('pendiente','parcial') and c.vence = current_date + 3
  group by c.cuenta_id
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.d360_recordatorios_cobro() from public, anon, authenticated;

-- 06:10 UTC (00:10 en Nicaragua), después de la tarea diaria general
select cron.schedule('d360-recordatorios-cobro', '10 6 * * *', $$select public.d360_recordatorios_cobro()$$);

-- >>>>>>>>>> 20261103_10_search_path_vence_mes.sql
-- DOCENCIA360 · 10 · search_path fijo (asesor de seguridad)
alter function public._d360_vence_mes(date, int, int) set search_path = public;

-- >>>>>>>>>> 20261103_11_demos_sin_prueba.sql
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

-- >>>>>>>>>> 20261103_12_demos_datos.sql
-- =====================================================================
-- DOCENCIA360 · 12 · Datos de las cuentas de demostración
-- d360_sembrar_demos() crea las cuentas demo si no existen y reinicia
-- sus datos con fechas relativas a hoy. Se ejecuta cada noche.
-- Los miembros (y sus usuarios de acceso) se conservan entre reinicios.
-- =====================================================================
create or replace function public._d360_demo_cuenta(p_codigo text, p_modalidad text, p_nombre text, p_plan text, p_tel text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_dueno uuid;
begin
  select id into v_id from cuentas where codigo = p_codigo;
  if v_id is null then
    select user_id into v_dueno from plataforma_admins order by creado limit 1;
    if v_dueno is null then raise exception 'Se necesita un administrador de plataforma para crear las demos.'; end if;
    insert into cuentas(modalidad, nombre, codigo, propietario, telefono, email, moneda, es_demo, onboarding_completo)
    values (p_modalidad, p_nombre, p_codigo, v_dueno, p_tel, 'demo@docencia360.app', 'NIO', true, true)
    returning id into v_id;
  end if;
  insert into suscripciones(cuenta_id, plan_id, estado, inicio, vence, dias_gracia)
  values (v_id, p_plan, 'activa', current_date - 60, date '2099-12-31', 5)
  on conflict (cuenta_id) do update set plan_id = excluded.plan_id, estado = 'activa', vence = excluded.vence;
  return v_id;
end $$;

create or replace function public._d360_demo_miembro(p_cuenta uuid, p_nombre text, p_rol text, p_esp text default null, p_tel text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from miembros where cuenta_id = p_cuenta and nombre = p_nombre;
  if v_id is null then
    insert into miembros(cuenta_id, nombre, rol, especialidad, telefono, activo)
    values (p_cuenta, p_nombre, p_rol, p_esp, p_tel, true) returning id into v_id;
  else
    update miembros set rol = p_rol, especialidad = p_esp, telefono = p_tel, activo = true where id = v_id;
  end if;
  return v_id;
end $$;

-- Borra los datos (no los miembros) de una cuenta demo
create or replace function public._d360_demo_vaciar(p_cuenta uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _d360_es_demo(p_cuenta) then raise exception 'Solo se vacían cuentas demo'; end if;
  delete from pagos where cuenta_id = p_cuenta;
  delete from cargos where cuenta_id = p_cuenta;
  delete from certificados where cuenta_id = p_cuenta;
  delete from matriculas where cuenta_id = p_cuenta;
  delete from notificaciones where cuenta_id = p_cuenta;
  delete from comunicados where cuenta_id = p_cuenta;
  delete from eventos where cuenta_id = p_cuenta;
  delete from observaciones where cuenta_id = p_cuenta;
  delete from grupos where cuenta_id = p_cuenta;          -- en cascada: horarios, asistencia, evaluaciones, notas, docentes
  delete from estudiantes where cuenta_id = p_cuenta;
  delete from cursos where cuenta_id = p_cuenta;
  delete from asignaturas where cuenta_id = p_cuenta;
  delete from periodos where cuenta_id = p_cuenta;
  delete from asistencia_docentes where cuenta_id = p_cuenta;
  -- miembros creados por visitantes (no previstos en la demo) se eliminan
  delete from miembros where cuenta_id = p_cuenta and nombre not in
    (select miembro from demo_perfiles where codigo = (select codigo from cuentas where id = p_cuenta))
    and rol <> 'docente';
end $$;

-- Crea estudiantes con nombres reales nicaragüenses (determinista por semilla)
create or replace function public._d360_demo_estudiantes(p_cuenta uuid, p_n int, p_semilla float8)
returns setof uuid language plpgsql security definer set search_path = public as $$
declare
  nom text[] := array['Ana Sofía','Luis Fernando','María José','Carlos Andrés','Valeria','José Daniel','Camila','Kevin Alexander','Fernanda','Jonathan','Ximena','Erick','Daniela','Bryan','Allison','Josué','Nicole','Joel','Mariela','Axel','Génesis','Francisco','Katherine','Moisés','Hellen','Gabriel','Scarleth','Noel','Ashley','Isaac','Melissa','Óscar','Yaritza','Ernesto','Fátima','Javier','Dayana','Marcos','Abigail','Rodrigo','Hazel','Ezequiel','Celeste','Samuel','Tatiana'];
  ape text[] := array['López','Pérez','Gutiérrez','Martínez','Rodríguez','Hernández','Ruiz','Castillo','Mendoza','Rivas','Chávez','Flores','Gómez','Lacayo','Sandino','Téllez','Zelaya','Obando','Bermúdez','Espinoza','Rocha','Aguirre','Salazar','Vanegas','Montenegro','Cruz','Blandón','Arauz','Morales','Somarriba'];
  v_id uuid; i int;
begin
  perform setseed(p_semilla);
  for i in 1..p_n loop
    insert into estudiantes(cuenta_id, nombres, apellidos, fecha_nacimiento, genero, telefono, contacto_nombre, contacto_telefono, contacto_parentesco, estado, direccion)
    values (p_cuenta, nom[1 + ((i * 7 + floor(random() * 3)::int) % array_length(nom, 1))],
            ape[1 + floor(random() * array_length(ape, 1))::int] || ' ' || ape[1 + floor(random() * array_length(ape, 1))::int],
            current_date - (365 * (12 + floor(random() * 8)::int) + floor(random() * 300)::int),
            case when i % 2 = 0 then 'M' else 'F' end,
            '8' || lpad((floor(random() * 9999999))::int::text, 7, '0'),
            case when random() < .5 then 'Sra. ' else 'Sr. ' end || ape[1 + floor(random() * array_length(ape, 1))::int],
            '5' || lpad((floor(random() * 9999999))::int::text, 7, '0'),
            case when random() < .55 then 'Madre' when random() < .8 then 'Padre' else 'Tutor legal' end,
            'activo',
            (array['Managua','León','Masaya','Granada','Estelí','Matagalpa','Chinandega','Jinotepe'])[1 + floor(random() * 8)::int])
    returning id into v_id;
    return next v_id;
  end loop;
end $$;

-- Asistencia de las últimas p_dias jornadas de clase, según el horario del grupo
create or replace function public._d360_demo_asistencia(p_grupo uuid, p_dias int)
returns void language plpgsql security definer set search_path = public as $$
declare v_c uuid; d date; r float8;
begin
  select cuenta_id into v_c from grupos where id = p_grupo;
  for d in select g::date from generate_series(current_date - p_dias, current_date - 1, interval '1 day') g
           where extract(isodow from g)::int in (select dia from horarios where grupo_id = p_grupo) loop
    insert into asistencias(cuenta_id, grupo_id, estudiante_id, fecha, estado, nota)
    select v_c, p_grupo, ge.estudiante_id, d, x.estado, case when x.estado = 'justificado' then 'Cita médica' end
    from grupo_estudiantes ge,
         lateral (select random() r) rr,
         lateral (select case when rr.r < .86 then 'presente' when rr.r < .93 then 'ausente' when rr.r < .98 then 'tarde' else 'justificado' end estado) x
    where ge.grupo_id = p_grupo and ge.estado = 'activo' and ge.desde <= d;
  end loop;
end $$;

-- Evaluaciones con notas (las futuras quedan sin calificar)
create or replace function public._d360_demo_evaluaciones(p_grupo uuid, p_evals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_c uuid; e jsonb; v_ev uuid; v_f date; v_max numeric;
begin
  select cuenta_id into v_c from grupos where id = p_grupo;
  for e in select * from jsonb_array_elements(p_evals) loop
    v_f := current_date + (e ->> 'dias')::int;
    v_max := coalesce((e ->> 'max')::numeric, 100);
    insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max, descripcion)
    values (v_c, p_grupo, e ->> 't', e ->> 'tipo', v_f, (e ->> 'peso')::numeric, v_max, e ->> 'desc')
    returning id into v_ev;
    if v_f < current_date then
      insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje, entregado)
      select v_c, v_ev, ge.estudiante_id,
             round(least(v_max, greatest(v_max * .35, v_max * (.58 + random() * .45)))::numeric, 0), true
      from grupo_estudiantes ge where ge.grupo_id = p_grupo and ge.estado = 'activo' and random() < .95;
    end if;
  end loop;
end $$;

create or replace function public.d360_sembrar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c uuid; a uuid; ests uuid[]; m_prof uuid; g1 uuid; g2 uuid; g3 uuid; s_mat uuid; s_fis uuid; c_uni uuid;
  ar_ing uuid; ar_mus uuid; ar_comp uuid; cu_a1 uuid; cu_a2 uuid; cu_gui uuid; cu_pia uuid; cu_ofi uuid;
  i1 uuid; i2 uuid; i3 uuid; i4 uuid; ga uuid; gb uuid; gc uuid; gd uuid; ge uuid; gf uuid;
  e uuid; n int := 0; v_mat uuid; v_cargo record; r float8;
begin
  perform set_config('d360.mantenimiento', 'on', true);

  -- ================= PROFESOR INDEPENDIENTE =================
  c := _d360_demo_cuenta('DEMOPR', 'profesor', 'Clases de Matemática y Física · Prof. Marcela Rivas', 'prof_premium', '8888-0000');
  m_prof := _d360_demo_miembro(c, 'Marcela Rivas', 'propietario', 'Matemática y Física', '8888-0000');
  perform _d360_demo_miembro(c, 'Andrés Rivas', 'docente', 'Asistente de Física', '8777-1212');
  perform _d360_demo_vaciar(c);

  insert into asignaturas(cuenta_id, nombre, descripcion) values (c, 'Matemática', 'Álgebra, geometría y aritmética de secundaria') returning id into s_mat;
  insert into asignaturas(cuenta_id, nombre, descripcion) values (c, 'Física', 'Cinemática, dinámica y energía') returning id into s_fis;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, horas_totales, mensualidad, descripcion)
  values (c, 'Preparación para examen de admisión UNI', s_mat, 12, 72, 1200, 'Aritmética, álgebra, geometría y razonamiento lógico. Simulacros cada dos semanas.') returning id into c_uni;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, mensualidad, descripcion)
  values (c, 'Reforzamiento escolar', s_mat, 16, 900, 'Apoyo en tareas y preparación de exámenes del colegio.');

  insert into grupos(cuenta_id, nombre, asignatura_id, cupo, fecha_inicio, estado) values (c, 'Matemática 9no · lunes y miércoles', s_mat, 10, current_date - 70, 'activo') returning id into g1;
  insert into grupos(cuenta_id, nombre, asignatura_id, cupo, fecha_inicio, estado) values (c, 'Física 11mo · martes y jueves', s_fis, 8, current_date - 70, 'activo') returning id into g2;
  insert into grupos(cuenta_id, nombre, asignatura_id, curso_id, cupo, fecha_inicio, fecha_fin, estado) values (c, 'Admisión UNI · sábados', s_mat, c_uni, 12, current_date - 49, current_date + 35, 'activo') returning id into g3;
  insert into horarios(cuenta_id, grupo_id, miembro_id, dia, hora_inicio, hora_fin) values
    (c, g1, m_prof, 1, '16:00', '17:30'), (c, g1, m_prof, 3, '16:00', '17:30'),
    (c, g2, m_prof, 2, '16:00', '17:30'), (c, g2, m_prof, 4, '16:00', '17:30'),
    (c, g3, m_prof, 6, '08:00', '11:00');
  insert into grupo_docentes(cuenta_id, grupo_id, miembro_id)
  select c, g2, id from miembros where cuenta_id = c and nombre = 'Andrés Rivas';

  select array_agg(x) into ests from _d360_demo_estudiantes(c, 20, 0.21) x;
  insert into grupo_estudiantes(cuenta_id, grupo_id, estudiante_id, desde)
  select c, g1, ests[i], current_date - 70 from generate_series(1, 8) i
  union all select c, g2, ests[i], current_date - 70 from generate_series(7, 13) i
  union all select c, g3, ests[i], current_date - 49 from generate_series(12, 20) i;
  update estudiantes set estado = 'inactivo' where id = ests[20];
  update grupo_estudiantes set estado = 'retirado' where estudiante_id = ests[20];

  perform _d360_demo_asistencia(g, 35) from unnest(array[g1, g2, g3]) g;
  perform _d360_demo_evaluaciones(g1, '[{"t":"Examen: ecuaciones lineales","tipo":"examen","dias":-30,"peso":30},
    {"t":"Tarea: problemas de proporciones","tipo":"tarea","dias":-21,"peso":15,"max":20},
    {"t":"Examen: sistemas de ecuaciones","tipo":"examen","dias":-9,"peso":30},
    {"t":"Tarea: factorización","tipo":"tarea","dias":-3,"peso":15,"max":20},
    {"t":"Proyecto: geometría en mi casa","tipo":"proyecto","dias":6,"peso":10,"desc":"Medir tres objetos y calcular áreas."}]');
  perform _d360_demo_evaluaciones(g2, '[{"t":"Prueba: movimiento rectilíneo","tipo":"examen","dias":-26,"peso":35},
    {"t":"Práctica de laboratorio: caída libre","tipo":"practica","dias":-14,"peso":25},
    {"t":"Tarea: leyes de Newton","tipo":"tarea","dias":-2,"peso":15,"max":20},
    {"t":"Examen: dinámica","tipo":"examen","dias":5,"peso":25}]');
  perform _d360_demo_evaluaciones(g3, '[{"t":"Simulacro 1","tipo":"examen","dias":-35,"peso":25},
    {"t":"Simulacro 2","tipo":"examen","dias":-21,"peso":25},
    {"t":"Guía de razonamiento lógico","tipo":"tarea","dias":-7,"peso":20,"max":20},
    {"t":"Simulacro 3","tipo":"examen","dias":-1,"peso":30}]');
  insert into eventos(cuenta_id, titulo, fecha, hora_inicio, tipo, grupo_id, descripcion) values
    (c, 'Reunión con padres de 9no', current_date + 4, '17:45', 'reunion', g1, 'Entrega de avances del primer corte.'),
    (c, 'Simulacro final UNI', current_date + 13, '08:00', 'evaluacion', g3, 'Duración: 3 horas. Traer calculadora.'),
    (c, 'Sin clases (feriado)', current_date + 18, null, 'feriado', null, null);
  insert into observaciones(cuenta_id, estudiante_id, tipo, texto, creado) values
    (c, ests[2], 'academica', 'Le cuesta despejar ecuaciones con fracciones. Reforzar con ejercicios extra.', now() - interval '12 days'),
    (c, ests[5], 'familia', 'La mamá pidió informe mensual por WhatsApp.', now() - interval '20 days'),
    (c, ests[14], 'academica', 'Excelente en razonamiento lógico; puede apoyar a compañeros.', now() - interval '5 days');
  n := n + 20;

  -- ================= ACADEMIA =================
  a := _d360_demo_cuenta('DEMOAC', 'academia', 'Academia Horizonte · Inglés, Música y Computación', 'acad_empresarial', '2270-5050');
  perform _d360_demo_miembro(a, 'Roberto Castillo', 'director', null, '8811-2233');
  perform _d360_demo_miembro(a, 'Karla Mendoza', 'finanzas', null, '8822-3344');
  i1 := _d360_demo_miembro(a, 'Daniel Ortega Ruiz', 'docente', 'Inglés', '8833-4455');
  i2 := _d360_demo_miembro(a, 'Sarah Johnson', 'docente', 'Inglés conversacional', '8844-5566');
  i3 := _d360_demo_miembro(a, 'Iván Zeledón', 'docente', 'Guitarra y piano', '8855-6677');
  i4 := _d360_demo_miembro(a, 'Lucía Pineda', 'docente', 'Ofimática', '8866-7788');
  perform _d360_demo_vaciar(a);

  insert into asignaturas(cuenta_id, nombre) values (a, 'Inglés') returning id into ar_ing;
  insert into asignaturas(cuenta_id, nombre) values (a, 'Música') returning id into ar_mus;
  insert into asignaturas(cuenta_id, nombre) values (a, 'Computación') returning id into ar_comp;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, horas_totales, precio_matricula, mensualidad, certifica, requisitos, descripcion)
  values (a, 'Inglés General · Nivel A1', ar_ing, 16, 96, 500, 1200, true, 'Desde 12 años', 'Vocabulario básico, presente simple y conversación cotidiana.') returning id into cu_a1;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, horas_totales, precio_matricula, mensualidad, certifica, requisitos)
  values (a, 'Inglés General · Nivel A2', ar_ing, 16, 96, 500, 1300, true, 'Haber aprobado A1 o prueba de ubicación') returning id into cu_a2;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, precio_matricula, mensualidad, certifica, modalidad_clase)
  values (a, 'Guitarra para principiantes', ar_mus, 12, 300, 1000, false, 'presencial') returning id into cu_gui;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, precio_matricula, mensualidad, certifica)
  values (a, 'Piano inicial', ar_mus, 12, 300, 1100, false) returning id into cu_pia;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, horas_totales, precio_matricula, mensualidad, certifica, modalidad_clase)
  values (a, 'Ofimática: Word, Excel y PowerPoint', ar_comp, 8, 48, 400, 950, true, 'mixta') returning id into cu_ofi;

  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, turno, fecha_inicio, estado) values (a, 'Inglés A1 · sábado mañana', cu_a1, ar_ing, 12, 'sabatino', current_date - 63, 'activo') returning id into ga;
  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, turno, fecha_inicio, estado) values (a, 'Inglés A1 · lunes y miércoles noche', cu_a1, ar_ing, 12, 'nocturno', current_date - 63, 'activo') returning id into gb;
  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, turno, fecha_inicio, estado) values (a, 'Inglés A2 · martes y jueves', cu_a2, ar_ing, 10, 'vespertino', current_date - 63, 'activo') returning id into gc;
  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, fecha_inicio, estado) values (a, 'Guitarra · viernes', cu_gui, ar_mus, 8, current_date - 42, 'activo') returning id into gd;
  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, fecha_inicio, estado) values (a, 'Piano · sábado tarde', cu_pia, ar_mus, 6, current_date - 42, 'activo') returning id into ge;
  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, fecha_inicio, fecha_fin, estado) values (a, 'Ofimática · intensivo de octubre', cu_ofi, ar_comp, 10, current_date - 90, current_date - 34, 'finalizado') returning id into gf;
  insert into grupo_docentes(cuenta_id, grupo_id, miembro_id) values (a, ga, i1), (a, gb, i1), (a, gc, i2), (a, gd, i3), (a, ge, i3), (a, gf, i4);
  insert into horarios(cuenta_id, grupo_id, miembro_id, dia, hora_inicio, hora_fin) values
    (a, ga, i1, 6, '08:00', '11:00'), (a, gb, i1, 1, '18:00', '19:30'), (a, gb, i1, 3, '18:00', '19:30'),
    (a, gc, i2, 2, '17:00', '18:30'), (a, gc, i2, 4, '17:00', '18:30'), (a, gd, i3, 5, '16:00', '17:30'),
    (a, ge, i3, 6, '14:00', '15:30');

  select array_agg(x) into ests from _d360_demo_estudiantes(a, 44, 0.47) x;
  -- Matrículas: el servidor genera la matrícula y las mensualidades (incluidas las ya vencidas)
  for i in 1..44 loop
    e := ests[i];
    v_mat := ((public.d360_matricular_interno(a, e,
      case when i <= 11 then ga when i <= 22 then gb when i <= 31 then gc when i <= 37 then gd when i <= 41 then ge else gf end,
      case when i <= 37 then current_date - 63 + (i % 5) else current_date - 90 end,
      case when i % 9 = 0 then 15 else 0 end,
      case when i % 9 = 0 then 'Beca hermanos' end)) ->> 'matricula_id')::uuid;
  end loop;
  -- Pagos: lo vencido casi todo pagado; algunos atrasados y algunos abonos parciales
  for v_cargo in select cg.*, row_number() over (order by cg.vence, cg.id) rn from cargos cg
                 where cg.cuenta_id = a and cg.vence <= current_date + 3 order by cg.vence loop
    r := random();
    if v_cargo.vence < current_date - 45 or r < .62 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha, referencia)
      values (a, v_cargo.estudiante_id, v_cargo.id, v_cargo.monto - v_cargo.descuento,
              (array['efectivo','transferencia','transferencia','deposito','tarjeta'])[1 + floor(random() * 5)::int],
              least(current_date, v_cargo.vence + floor(random() * 6)::int),
              case when random() < .5 then 'BAC-' || floor(100000 + random() * 899999)::int end);
    elsif r < .82 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha)
      values (a, v_cargo.estudiante_id, v_cargo.id, round((v_cargo.monto - v_cargo.descuento) / 2), 'efectivo', least(current_date, v_cargo.vence + 2));
    end if;
  end loop;
  -- Un retiro y los certificados del intensivo de Ofimática ya terminado
  update matriculas set estado = 'retirada', notas = 'Retiro: se mudó a otra ciudad' where cuenta_id = a and estudiante_id = ests[30];
  update grupo_estudiantes set estado = 'retirado' where cuenta_id = a and estudiante_id = ests[30];
  update cargos set estado = 'anulado' where cuenta_id = a and estudiante_id = ests[30] and pagado = 0 and vence > current_date;
  update matriculas set estado = 'completada' where cuenta_id = a and grupo_id = gf;
  insert into certificados(cuenta_id, estudiante_id, curso_id, tipo, titulo, folio, emitido, datos)
  select a, m.estudiante_id, cu_ofi, 'certificado', 'Ofimática: Word, Excel y PowerPoint',
         'DEMOAC-' || to_char(current_date, 'YY') || '-' || upper(substr(md5(m.estudiante_id::text), 1, 6)), current_date - 30,
         jsonb_build_object('curso', 'Ofimática: Word, Excel y PowerPoint', 'detalle', 'Duración: 48 horas')
  from matriculas m where m.cuenta_id = a and m.grupo_id = gf and m.estudiante_id <> ests[44];

  perform _d360_demo_asistencia(g, 35) from unnest(array[ga, gb, gc, gd, ge]) g;
  perform _d360_demo_evaluaciones(ga, '[{"t":"Unit 1 test: greetings","tipo":"examen","dias":-28,"peso":25},{"t":"Speaking: introduce yourself","tipo":"participacion","dias":-14,"peso":25},{"t":"Unit 3 test: daily routines","tipo":"examen","dias":-5,"peso":25},{"t":"Project: my family","tipo":"proyecto","dias":9,"peso":25}]');
  perform _d360_demo_evaluaciones(gb, '[{"t":"Unit 1 test: greetings","tipo":"examen","dias":-27,"peso":30},{"t":"Homework: verb to be","tipo":"tarea","dias":-12,"peso":20,"max":20},{"t":"Unit 3 test: daily routines","tipo":"examen","dias":-2,"peso":30},{"t":"Oral exam","tipo":"examen","dias":12,"peso":20}]');
  perform _d360_demo_evaluaciones(gc, '[{"t":"Past simple quiz","tipo":"examen","dias":-24,"peso":30},{"t":"Writing: my last vacation","tipo":"tarea","dias":-10,"peso":30,"max":20},{"t":"Midterm","tipo":"examen","dias":3,"peso":40}]');
  perform _d360_demo_evaluaciones(gd, '[{"t":"Acordes básicos","tipo":"practica","dias":-20,"peso":50},{"t":"Primera canción completa","tipo":"proyecto","dias":-3,"peso":50}]');
  perform _d360_demo_evaluaciones(ge, '[{"t":"Escalas y postura","tipo":"practica","dias":-17,"peso":50},{"t":"Pieza corta","tipo":"proyecto","dias":10,"peso":50}]');
  insert into eventos(cuenta_id, titulo, fecha, hora_inicio, tipo, descripcion) values
    (a, 'Inicio de inscripciones: Inglés A2 (nuevo grupo)', current_date + 7, null, 'actividad', 'Promoción: matrícula a mitad de precio la primera semana.'),
    (a, 'Recital de música', current_date + 16, '16:00', 'actividad', 'Estudiantes de guitarra y piano. Invitar a las familias.'),
    (a, 'Reunión de instructores', current_date + 2, '19:45', 'reunion', null);
  n := n + 44;

  return jsonb_build_object('ok', true, 'estudiantes', n, 'fecha', current_date);
end $$;

-- Matrícula para el sembrado (mismo motor que d360_matricular, sin la verificación de sesión)
create or replace function public.d360_matricular_interno(p_cuenta uuid, p_estudiante uuid, p_grupo uuid, p_fecha date,
                                                          p_desc numeric, p_beca text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_g grupos; v_c cursos; v_id uuid; v_meses int;
begin
  if not _d360_es_demo(p_cuenta) then raise exception 'Solo para cuentas demo'; end if;
  select * into v_g from grupos where id = p_grupo;
  select * into v_c from cursos where id = v_g.curso_id;
  insert into matriculas(cuenta_id, estudiante_id, curso_id, grupo_id, anio, fecha, estado, monto_matricula, mensualidad, descuento_pct, beca)
  values (p_cuenta, p_estudiante, v_c.id, p_grupo, extract(year from p_fecha)::text, p_fecha, 'activa', v_c.precio_matricula, v_c.mensualidad, p_desc, p_beca)
  returning id into v_id;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado) values (p_grupo, p_estudiante, p_cuenta, p_fecha, 'activo')
  on conflict (grupo_id, estudiante_id) do nothing;
  if v_c.precio_matricula > 0 then
    insert into cargos(cuenta_id, estudiante_id, matricula_id, concepto, tipo, monto, vence)
    values (p_cuenta, p_estudiante, v_id, 'Matrícula · ' || v_c.nombre, 'matricula', v_c.precio_matricula, p_fecha);
  end if;
  v_meses := greatest(1, ceil(coalesce(v_c.duracion_semanas, 8) / 4.3)::int);
  perform _d360_generar_mensualidades(v_id, p_fecha, v_meses, 10);
  return jsonb_build_object('matricula_id', v_id);
end $$;

revoke execute on function public._d360_demo_cuenta(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public._d360_demo_miembro(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public._d360_demo_vaciar(uuid) from public, anon, authenticated;
revoke execute on function public._d360_demo_estudiantes(uuid, int, float8) from public, anon, authenticated;
revoke execute on function public._d360_demo_asistencia(uuid, int) from public, anon, authenticated;
revoke execute on function public._d360_demo_evaluaciones(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.d360_matricular_interno(uuid, uuid, uuid, date, numeric, text) from public, anon, authenticated;
revoke execute on function public.d360_sembrar_demos() from public, anon, authenticated;

-- Reinicio desde el panel maestro
create or replace function public.d360_admin_reiniciar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return d360_sembrar_demos();
end $$;
revoke execute on function public.d360_admin_reiniciar_demos() from public, anon;
-- Programado también en producción: select cron.schedule('d360-reiniciar-demos', '20 6 * * *', $$select public.d360_sembrar_demos()$$);

-- >>>>>>>>>> 20261103_13_auditoria_borrado_cuenta.sql
-- =====================================================================
-- DOCENCIA360 · 13 · La auditoría no impide borrar una cuenta.
-- Al eliminar una cuenta, sus filas se borran en cascada y los
-- disparadores de auditoría intentaban registrar la cuenta ya inexistente.
-- Ahora se registra sin cuenta asociada (queda el detalle completo).
-- =====================================================================
create or replace function public.t_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old); v_cuenta uuid;
begin
  if _d360_mantenimiento() then return null; end if;
  v_cuenta := r.cuenta_id;
  if tg_op = 'DELETE' and not exists(select 1 from cuentas where id = v_cuenta) then v_cuenta := null; end if;
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (v_cuenta, auth.uid(), lower(tg_op), tg_table_name, r.id::text,
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
               else to_jsonb(r) end);
  return null;
end $$;

create or replace function public.t_auditar_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(coalesce(new, old)); v_cuenta uuid;
begin
  if _d360_mantenimiento() then return null; end if;
  v_cuenta := nullif(j ->> 'cuenta_id', '')::uuid;
  if v_cuenta is not null and not exists(select 1 from cuentas where id = v_cuenta) then v_cuenta := null; end if;
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (v_cuenta, auth.uid(), lower(tg_op), tg_table_name,
          coalesce(j ->> 'id', j ->> 'clave', j ->> 'cuenta_id', j ->> 'user_id'),
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new)) else j end);
  return null;
end $$;

-- >>>>>>>>>> 20261105_14_colegios.sql
-- =====================================================================
-- DOCENCIA360 · 14 · Colegios
--  - Aranceles por grado, sedes, documentos del estudiante.
--  - Recuperaciones y permisos de docente POR ASIGNATURA en cada sección.
--  - Notas por corte (período) y boletines con escala cualitativa.
--  - Matrícula escolar con colegiaturas y traslado de sección.
--  - Vinculación de padres y tutores (portal de familias).
--  - Comentarios de boletín (conducta y observación del maestro guía).
--  - Resumen institucional y almacenamiento de fotos y logos.
-- =====================================================================

-- ---------- 1. Estructura ----------
alter table public.grados add column if not exists matricula numeric(12,2) not null default 0 check (matricula >= 0);
alter table public.grados add column if not exists colegiatura numeric(12,2) not null default 0 check (colegiatura >= 0);
alter table public.estudiantes add column if not exists documentos jsonb not null default '{}'::jsonb;
alter table public.evaluaciones drop constraint if exists evaluaciones_tipo_check;
alter table public.evaluaciones add constraint evaluaciones_tipo_check
  check (tipo in ('examen','tarea','proyecto','practica','participacion','recuperacion','otro'));

create table if not exists public.sedes (
  id        uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  nombre    text not null,
  direccion text,
  telefono  text
);
create index if not exists sedes_cuenta on public.sedes(cuenta_id);
alter table public.sedes enable row level security;
create policy leer on public.sedes for select to authenticated using (public.d360_es_personal(cuenta_id) or public.d360_es_plataforma_admin());
create policy escribir on public.sedes for all to authenticated
  using (public.d360_gestor_operativo(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'sedes'))
  with check (public.d360_gestor_operativo(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'sedes'));
create trigger t_ci before update on public.sedes for each row execute function public.d360_cuenta_inmutable();

alter table public.grupos add column if not exists sede_id uuid references public.sedes(id) on delete set null;
drop trigger if exists t_mc on public.grupos;
create trigger t_mc before insert or update on public.grupos for each row
  execute function public.d360_misma_cuenta('curso_id:cursos','asignatura_id:asignaturas','grado_id:grados','aula_id:aulas','sede_id:sedes');

-- ---------- 2. Permisos de evaluación por asignatura ----------
-- En un colegio, el docente de Matemática de 7mo A no califica Lengua de 7mo A.
-- Asignaciones sin asignatura (profesor, academia) siguen valiendo para todo el grupo.
create or replace function public.d360_puede_evaluar(p_cuenta uuid, p_grupo uuid, p_asignatura uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.d360_cuenta_operativa(p_cuenta) and (
    public.d360_es_gestor(p_cuenta) or exists(
      select 1 from grupo_docentes gd join miembros m on m.id = gd.miembro_id
      where gd.grupo_id = p_grupo and m.user_id = auth.uid() and m.activo
        and (gd.asignatura_id is null or p_asignatura is null or gd.asignatura_id = p_asignatura)));
$$;
create or replace function public.d360_asignatura_de_evaluacion(p_eval uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select asignatura_id from evaluaciones where id = p_eval;
$$;
revoke execute on function public.d360_puede_evaluar(uuid, uuid, uuid) from public, anon;
revoke execute on function public.d360_asignatura_de_evaluacion(uuid) from public, anon;

drop policy if exists escribir on public.evaluaciones;
create policy escribir on public.evaluaciones for all to authenticated
  using (public.d360_puede_evaluar(cuenta_id, grupo_id, asignatura_id))
  with check (public.d360_puede_evaluar(cuenta_id, grupo_id, asignatura_id));
drop policy if exists escribir on public.calificaciones;
create policy escribir on public.calificaciones for all to authenticated
  using (public.d360_puede_evaluar(cuenta_id, public.d360_grupo_de_evaluacion(evaluacion_id), public.d360_asignatura_de_evaluacion(evaluacion_id)))
  with check (public.d360_puede_evaluar(cuenta_id, public.d360_grupo_de_evaluacion(evaluacion_id), public.d360_asignatura_de_evaluacion(evaluacion_id)));

-- ---------- 3. Notas por corte ----------
-- Promedio ponderado por asignatura en el período; la recuperación reemplaza
-- la nota si es mayor. Escala 0–100.
create or replace function public.d360_notas_seccion(p_grupo uuid, p_periodo uuid)
returns table(estudiante_id uuid, asignatura_id uuid, promedio numeric, recuperacion numeric, final numeric, evaluadas int, total int)
language sql stable security invoker set search_path = public as $$
  with ev as (
    select * from evaluaciones e where e.grupo_id = p_grupo and e.asignatura_id is not null
      and (p_periodo is null or e.periodo_id = p_periodo)
  ), al as (
    select ge.estudiante_id from grupo_estudiantes ge where ge.grupo_id = p_grupo and ge.estado = 'activo'
  ), n as (
    select al.estudiante_id, ev.asignatura_id, ev.tipo, ev.peso, ev.puntaje_max, c.puntaje
    from al cross join ev
    left join calificaciones c on c.evaluacion_id = ev.id and c.estudiante_id = al.estudiante_id
  ), p as (
    select n.estudiante_id, n.asignatura_id,
      case when count(n.puntaje) filter (where n.tipo <> 'recuperacion') = 0 then null
           when coalesce(sum(n.peso) filter (where n.puntaje is not null and n.tipo <> 'recuperacion'), 0) > 0
             then round(sum(n.puntaje / n.puntaje_max * 100 * n.peso) filter (where n.puntaje is not null and n.tipo <> 'recuperacion')
                        / sum(n.peso) filter (where n.puntaje is not null and n.tipo <> 'recuperacion'), 1)
           else round(avg(n.puntaje / n.puntaje_max * 100) filter (where n.tipo <> 'recuperacion'), 1) end as promedio,
      round(max(n.puntaje / n.puntaje_max * 100) filter (where n.tipo = 'recuperacion'), 1) as recuperacion,
      (count(n.puntaje) filter (where n.tipo <> 'recuperacion'))::int as evaluadas,
      (count(*) filter (where n.tipo <> 'recuperacion'))::int as total
    from n group by n.estudiante_id, n.asignatura_id
  )
  select p.estudiante_id, p.asignatura_id, p.promedio, p.recuperacion,
         case when p.promedio is null then p.recuperacion else greatest(p.promedio, coalesce(p.recuperacion, 0)) end,
         p.evaluadas, p.total
  from p;
$$;
revoke execute on function public.d360_notas_seccion(uuid, uuid) from public, anon;

-- Comentarios del boletín: conducta y observación por estudiante y período
create table if not exists public.boletin_comentarios (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  periodo_id    uuid not null references public.periodos(id) on delete cascade,
  conducta      text check (conducta in ('AA','AS','AF','AI')),
  comentario    text,
  autor         uuid default auth.uid(),
  actualizado   timestamptz not null default now(),
  unique (estudiante_id, periodo_id)
);
create or replace function public.d360_docente_de_estudiante(p_estudiante uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from grupo_estudiantes ge join grupo_docentes gd on gd.grupo_id = ge.grupo_id
    join miembros m on m.id = gd.miembro_id
    where ge.estudiante_id = p_estudiante and ge.estado = 'activo' and m.user_id = auth.uid() and m.activo);
$$;
revoke execute on function public.d360_docente_de_estudiante(uuid) from public, anon;
alter table public.boletin_comentarios enable row level security;
create policy leer on public.boletin_comentarios for select to authenticated
  using (public.d360_es_personal(cuenta_id) or public.d360_es_tutor_de(estudiante_id));
create policy escribir on public.boletin_comentarios for all to authenticated
  using (public.d360_cuenta_operativa(cuenta_id) and (public.d360_es_gestor(cuenta_id) or public.d360_docente_de_estudiante(estudiante_id)))
  with check (public.d360_cuenta_operativa(cuenta_id) and (public.d360_es_gestor(cuenta_id) or public.d360_docente_de_estudiante(estudiante_id)));
create trigger t_mc before insert or update on public.boletin_comentarios for each row
  execute function public.d360_misma_cuenta('estudiante_id:estudiantes','periodo_id:periodos');
create trigger t_ci before update on public.boletin_comentarios for each row execute function public.d360_cuenta_inmutable();

-- ---------- 4. Matrícula escolar ----------
create or replace function public.d360_matricular_colegio(
  p_cuenta uuid, p_estudiante uuid, p_seccion uuid, p_anio int, p_meses int default 10, p_mes_inicio int default 2,
  p_dia int default 10, p_descuento_pct numeric default 0, p_beca text default null, p_notas text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_g grupos; v_gr grados; v_id uuid; v_cargos int := 0; v_vence date; v_mes int; v_anio int;
        v_meses text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        v_otra text;
begin
  if not (_d360_puede_operar(p_cuenta) or (_d360_mantenimiento() and _d360_es_demo(p_cuenta))) then
    raise exception 'No tienes permiso para matricular, o la suscripción no está vigente.' using errcode = '42501';
  end if;
  select * into v_g from grupos where id = p_seccion and cuenta_id = p_cuenta;
  if v_g.id is null then raise exception 'Sección no válida.'; end if;
  if v_g.estado not in ('activo','planificado') then raise exception 'La sección no está abierta.'; end if;
  select * into v_gr from grados where id = v_g.grado_id;
  if not exists(select 1 from estudiantes where id = p_estudiante and cuenta_id = p_cuenta and estado = 'activo') then
    raise exception 'El estudiante no existe o no está activo.';
  end if;
  select g.nombre into v_otra from matriculas m join grupos g on g.id = m.grupo_id
   where m.cuenta_id = p_cuenta and m.estudiante_id = p_estudiante and m.anio = p_anio::text and m.estado in ('activa','pendiente') limit 1;
  if v_otra is not null then
    raise exception 'El estudiante ya está matriculado este año en %. Usa «Trasladar de sección».', v_otra;
  end if;
  if coalesce(p_meses, 0) not between 0 and 12 or coalesce(p_mes_inicio, 2) not between 1 and 12 then raise exception 'Meses no válidos.'; end if;
  if coalesce(p_descuento_pct, 0) not between 0 and 100 then raise exception 'Descuento entre 0 y 100%%.'; end if;

  insert into matriculas(cuenta_id, estudiante_id, grupo_id, anio, fecha, estado, monto_matricula, mensualidad, descuento_pct, beca, notas)
  values (p_cuenta, p_estudiante, p_seccion, p_anio::text, current_date, 'activa', coalesce(v_gr.matricula, 0), coalesce(v_gr.colegiatura, 0),
          coalesce(p_descuento_pct, 0), nullif(trim(p_beca), ''), nullif(trim(p_notas), ''))
  returning id into v_id;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado)
  values (p_seccion, p_estudiante, p_cuenta, current_date, 'activo')
  on conflict (grupo_id, estudiante_id) do update set estado = 'activo';

  if d360_tiene_funcion(p_cuenta, 'finanzas') then
    if coalesce(v_gr.matricula, 0) > 0 then
      insert into cargos(cuenta_id, estudiante_id, matricula_id, concepto, tipo, monto, vence)
      values (p_cuenta, p_estudiante, v_id, 'Matrícula ' || p_anio || ' · ' || v_gr.nombre, 'matricula', v_gr.matricula,
              least(current_date, make_date(p_anio, greatest(p_mes_inicio - 1, 1), 15)));
      v_cargos := 1;
    end if;
    if coalesce(v_gr.colegiatura, 0) > 0 then
      for i in 0 .. coalesce(p_meses, 10) - 1 loop
        v_mes := ((p_mes_inicio - 1 + i) % 12) + 1;
        v_anio := p_anio + ((p_mes_inicio - 1 + i) / 12);
        v_vence := make_date(v_anio, v_mes, least(greatest(coalesce(p_dia, 10), 1),
                   extract(day from (make_date(v_anio, v_mes, 1) + interval '1 month - 1 day'))::int));
        insert into cargos(cuenta_id, estudiante_id, matricula_id, concepto, tipo, monto, descuento, vence)
        values (p_cuenta, p_estudiante, v_id, 'Colegiatura ' || v_meses[v_mes] || ' ' || v_anio || ' · ' || v_gr.nombre, 'colegiatura',
                v_gr.colegiatura, round(v_gr.colegiatura * coalesce(p_descuento_pct, 0) / 100, 2), v_vence);
        v_cargos := v_cargos + 1;
      end loop;
    end if;
  end if;
  if not _d360_mantenimiento() then
    perform d360_log(p_cuenta, 'matricula_colegio', 'matriculas', v_id::text, jsonb_build_object('seccion', v_g.nombre, 'anio', p_anio, 'cargos', v_cargos));
  end if;
  return jsonb_build_object('matricula_id', v_id, 'cargos', v_cargos);
end $$;

create or replace function public.d360_trasladar_seccion(p_matricula uuid, p_seccion uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_m matriculas; v_g grupos;
begin
  select * into v_m from matriculas where id = p_matricula;
  if v_m.id is null or not _d360_puede_operar(v_m.cuenta_id) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if v_m.estado <> 'activa' then raise exception 'Solo se trasladan matrículas activas.'; end if;
  select * into v_g from grupos where id = p_seccion and cuenta_id = v_m.cuenta_id;
  if v_g.id is null or v_g.estado not in ('activo','planificado') then raise exception 'Sección destino no válida.'; end if;
  if v_g.id = v_m.grupo_id then raise exception 'El estudiante ya está en esa sección.'; end if;
  if v_m.grupo_id is not null then
    update grupo_estudiantes set estado = 'retirado' where grupo_id = v_m.grupo_id and estudiante_id = v_m.estudiante_id;
  end if;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado)
  values (p_seccion, v_m.estudiante_id, v_m.cuenta_id, current_date, 'activo')
  on conflict (grupo_id, estudiante_id) do update set estado = 'activo', desde = current_date;
  update matriculas set grupo_id = p_seccion,
    notas = trim(both from coalesce(notas, '') || E'\nTraslado ' || to_char(current_date, 'DD/MM/YYYY') || ' a ' || v_g.nombre || coalesce(': ' || p_motivo, ''))
  where id = p_matricula;
  perform d360_log(v_m.cuenta_id, 'traslado_seccion', 'matriculas', p_matricula::text, jsonb_build_object('a', v_g.nombre, 'motivo', p_motivo));
end $$;
revoke execute on function public.d360_matricular_colegio(uuid, uuid, uuid, int, int, int, int, numeric, text, text) from public, anon;
revoke execute on function public.d360_trasladar_seccion(uuid, uuid, text) from public, anon;

-- ---------- 5. Padres y tutores ----------
-- Crea (o reutiliza) un tutor con su código de acceso y lo vincula al estudiante.
create or replace function public.d360_vincular_tutor(
  p_cuenta uuid, p_estudiante uuid, p_nombre text, p_telefono text, p_parentesco text, p_tutor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tutor uuid := p_tutor; v_pin text; r jsonb;
begin
  if not d360_gestor_operativo(p_cuenta) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if not exists(select 1 from estudiantes where id = p_estudiante and cuenta_id = p_cuenta) then raise exception 'Estudiante no válido.'; end if;
  if v_tutor is null then
    r := d360_crear_miembro(p_cuenta, p_nombre, 'tutor', null, p_telefono, null, null);
    v_tutor := (r ->> 'miembro_id')::uuid; v_pin := r ->> 'codigo_personal';
  elsif not exists(select 1 from miembros where id = v_tutor and cuenta_id = p_cuenta and rol = 'tutor') then
    raise exception 'Tutor no válido.';
  end if;
  insert into tutores_estudiantes(miembro_id, estudiante_id, cuenta_id, parentesco)
  values (v_tutor, p_estudiante, p_cuenta, nullif(trim(p_parentesco), ''))
  on conflict (miembro_id, estudiante_id) do update set parentesco = excluded.parentesco;
  perform d360_log(p_cuenta, 'tutor_vinculado', 'tutores_estudiantes', p_estudiante::text, jsonb_build_object('tutor', v_tutor));
  return jsonb_build_object('miembro_id', v_tutor, 'codigo_personal', v_pin);
end $$;
revoke execute on function public.d360_vincular_tutor(uuid, uuid, text, text, text, uuid) from public, anon;

-- ---------- 6. Resumen institucional ----------
create or replace function public.d360_resumen_colegio(p_cuenta uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_per periodos; v_min numeric; v_anio text := extract(year from current_date)::text; res jsonb;
begin
  select * into v_per from periodos where cuenta_id = p_cuenta and current_date between inicio and fin order by orden limit 1;
  if v_per.id is null then select * into v_per from periodos where cuenta_id = p_cuenta and fin < current_date order by fin desc limit 1; end if;
  select coalesce((config ->> 'nota_minima')::numeric, 60) into v_min from cuentas where id = p_cuenta;
  res := jsonb_build_object(
    'periodo', case when v_per.id is null then null else jsonb_build_object('id', v_per.id, 'nombre', v_per.nombre, 'inicio', v_per.inicio, 'fin', v_per.fin) end,
    'nota_minima', v_min,
    'estudiantes_activos', (select count(*) from estudiantes where cuenta_id = p_cuenta and estado = 'activo'),
    'matriculados_anio', (select count(*) from matriculas where cuenta_id = p_cuenta and anio = v_anio and estado in ('activa','completada')),
    'docentes', (select count(*) from miembros where cuenta_id = p_cuenta and activo and rol = 'docente'),
    'personal', (select count(*) from miembros where cuenta_id = p_cuenta and activo and rol not in ('docente','tutor')),
    'familias', (select count(*) from miembros where cuenta_id = p_cuenta and activo and rol = 'tutor'),
    'niveles', (select count(*) from niveles where cuenta_id = p_cuenta),
    'grados', (select count(*) from grados where cuenta_id = p_cuenta),
    'secciones', (select count(*) from grupos where cuenta_id = p_cuenta and estado = 'activo' and grado_id is not null),
    'asistencia_hoy', (select round(100.0 * count(*) filter (where estado <> 'ausente') / nullif(count(*), 0), 1) from asistencias where cuenta_id = p_cuenta and fecha = current_date),
    'secciones_con_lista_hoy', (select count(distinct grupo_id) from asistencias where cuenta_id = p_cuenta and fecha = current_date),
    'asistencia_30d', (select round(100.0 * count(*) filter (where estado <> 'ausente') / nullif(count(*), 0), 1) from asistencias where cuenta_id = p_cuenta and fecha >= current_date - 30),
    'docentes_ausentes_hoy', (select count(*) from asistencia_docentes where cuenta_id = p_cuenta and fecha = current_date and estado = 'ausente'),
    'por_grado', (select coalesce(jsonb_agg(x order by x.nivel_orden, x.orden), '[]') from (
        select gr.id, gr.nombre, gr.orden, coalesce(nv.orden, 0) nivel_orden, nv.nombre nivel,
               (select count(*) from grupos g where g.grado_id = gr.id and g.estado = 'activo') secciones,
               (select count(*) from grupo_estudiantes ge join grupos g on g.id = ge.grupo_id where g.grado_id = gr.id and g.estado = 'activo' and ge.estado = 'activo') estudiantes
        from grados gr left join niveles nv on nv.id = gr.nivel_id where gr.cuenta_id = p_cuenta) x),
    'ingresos_mes', (select coalesce(sum(monto), 0) from pagos where cuenta_id = p_cuenta and not anulado and fecha >= date_trunc('month', current_date)),
    'pendiente_cobro', (select coalesce(sum(monto - descuento - pagado), 0) from cargos where cuenta_id = p_cuenta and estado in ('pendiente','parcial') and vence <= current_date + 30),
    'vencido_cobro', (select coalesce(sum(monto - descuento - pagado), 0) from cargos where cuenta_id = p_cuenta and estado in ('pendiente','parcial') and vence < current_date),
    'familias_morosas', (select count(distinct estudiante_id) from cargos where cuenta_id = p_cuenta and estado in ('pendiente','parcial') and vence < current_date)
  );
  if v_per.id is not null then
    res := res || (select jsonb_build_object(
        'notas_registradas', count(*) filter (where n.final is not null),
        'reprobados', count(*) filter (where n.final < v_min),
        'estudiantes_en_riesgo', count(distinct n.estudiante_id) filter (where n.final < v_min),
        'promedio_general', round(avg(n.final), 1))
      from grupos g cross join lateral d360_notas_seccion(g.id, v_per.id) n
      where g.cuenta_id = p_cuenta and g.estado = 'activo' and g.grado_id is not null);
  end if;
  return res;
end $$;
revoke execute on function public.d360_resumen_colegio(uuid) from public, anon;

-- ---------- 7. Fotos y logos (Storage privado, carpeta por cuenta) ----------
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('d360', 'd360', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function public.d360_uuid_seguro(p text)
returns uuid language plpgsql immutable set search_path = public as $$
begin return p::uuid; exception when others then return null; end $$;

create policy d360_archivos_leer on storage.objects for select to authenticated
  using (bucket_id = 'd360' and (public.d360_es_personal(public.d360_uuid_seguro((storage.foldername(name))[1]))
         or public.d360_mi_rol(public.d360_uuid_seguro((storage.foldername(name))[1])) = 'tutor'));
create policy d360_archivos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'd360' and public.d360_gestor_operativo(public.d360_uuid_seguro((storage.foldername(name))[1]))
              and not public._d360_es_demo(public.d360_uuid_seguro((storage.foldername(name))[1])));
create policy d360_archivos_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'd360' and public.d360_gestor_operativo(public.d360_uuid_seguro((storage.foldername(name))[1])));
create policy d360_archivos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'd360' and public.d360_gestor_operativo(public.d360_uuid_seguro((storage.foldername(name))[1])));

-- La demo no permite subir archivos: _d360_es_demo debe poder evaluarse en la política
grant execute on function public._d360_es_demo(uuid) to authenticated;

-- ---------- 8. Auditoría de cambios de notas en boletines ----------
create trigger t_aud after update or delete on public.boletin_comentarios for each row execute function public.t_auditar();

-- ---------- 9. Cortes cerrados: solo la dirección modifica notas ----------
create or replace function public.t_corte_cerrado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_per uuid; v_cuenta uuid;
begin
  if tg_table_name = 'evaluaciones' then
    v_per := coalesce(new.periodo_id, old.periodo_id); v_cuenta := coalesce(new.cuenta_id, old.cuenta_id);
  else
    select e.periodo_id, e.cuenta_id into v_per, v_cuenta from evaluaciones e where e.id = coalesce(new.evaluacion_id, old.evaluacion_id);
  end if;
  if v_per is not null and exists(select 1 from periodos where id = v_per and cerrado)
     and not _d360_mantenimiento() and coalesce(d360_mi_rol(v_cuenta), '') not in ('propietario','director','subdirector') then
    raise exception 'Este corte está cerrado: solo la dirección puede modificar sus notas.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.t_corte_cerrado() from public, anon, authenticated;
create trigger t_cerrado before insert or update or delete on public.evaluaciones for each row execute function public.t_corte_cerrado();
create trigger t_cerrado before insert or update or delete on public.calificaciones for each row execute function public.t_corte_cerrado();

-- >>>>>>>>>> 20261105_15_demo_colegio.sql
-- =====================================================================
-- DOCENCIA360 · 15 · Demo de colegio
-- "Colegio Nueva Esperanza": primaria y secundaria, 7 secciones, ~175
-- estudiantes, docentes por asignatura, horarios sin choques, 4 cortes
-- evaluativos, colegiaturas, familias con acceso y comunicados.
-- Se reinicia cada noche junto con las otras demos.
-- =====================================================================
insert into public.demo_perfiles values
 ('colegio-direccion', 'colegio', 'DEMOCO', 'Lic. Rosa Martínez', 'director', 'Colegio · Dirección', 'Estructura, matrícula, horarios, boletines, finanzas, comunicados e informes.', 5),
 ('colegio-docente', 'colegio', 'DEMOCO', 'Prof. Julio Herrera', 'docente', 'Colegio · Docente', 'Matemática de secundaria y maestro guía de 7mo A: lista, notas por corte y boletines.', 6),
 ('colegio-familia', 'colegio', 'DEMOCO', 'Mariana Pérez', 'tutor', 'Colegio · Familia', 'El portal de padres: notas, asistencia, comunicados y pagos de sus dos hijos.', 7)
on conflict (perfil) do update set titulo = excluded.titulo, detalle = excluded.detalle, miembro = excluded.miembro, rol = excluded.rol;

create or replace function public.d360_sembrar_demo_colegio()
returns int language plpgsql security definer set search_path = public as $$
declare
  c uuid; v_anio int := extract(year from current_date)::int;
  n_pri uuid; n_sec uuid; grs uuid[] := '{}'; secs uuid[] := '{}'; g uuid; s uuid; a uuid;
  per uuid[] := '{}'; p uuid; ests uuid[]; e uuid; i int; j int; k int; d int; sl int;
  doc jsonb := '{}'::jsonb; m uuid; asig_ids uuid[]; nasig int; v_ev uuid; v_f date; capacidad int;
  v_cargo record; r float8; tutora uuid; hijo1 uuid; hijo2 uuid; v_ini date; v_fin date; nombres text[];
  pri_materias text[] := array['Lengua y Literatura','Matemática','Ciencias Naturales','Estudios Sociales','Inglés','Educación Física'];
  sec_materias text[] := array['Lengua y Literatura','Matemática','Ciencias Naturales','Historia','Inglés','Educación Física','Computación'];
  horas text[][] := array[['07:00','07:45'],['07:45','08:30'],['08:50','09:35'],['09:35','10:20'],['10:30','11:15']];
begin
  perform set_config('d360.mantenimiento', 'on', true);
  c := _d360_demo_cuenta('DEMOCO', 'colegio', 'Colegio Nueva Esperanza', 'col_institucional', '2250-1010');
  update cuentas set config = jsonb_build_object('nota_minima', 60, 'escala_cualitativa', true, 'anio_lectivo', v_anio,
      'lema', 'Educando con valores para la vida', 'certificado', jsonb_build_object('firma1', 'Lic. Rosa Martínez', 'cargo1', 'Directora',
      'firma2', 'Lic. Óscar Téllez', 'cargo2', 'Secretario académico')),
      direccion = 'Del parque central 2 cuadras al sur, Masaya', email = 'demo@docencia360.app' where id = c;

  -- Vaciar datos (no miembros)
  delete from boletin_comentarios where cuenta_id = c;
  delete from tutores_estudiantes where cuenta_id = c;
  delete from asistencia_docentes where cuenta_id = c;
  delete from sedes where cuenta_id = c;
  perform _d360_demo_vaciar(c);
  delete from niveles where cuenta_id = c;
  delete from grados where cuenta_id = c;
  delete from aulas where cuenta_id = c;

  -- Personal (los vinculados a la demo conservan su acceso entre reinicios)
  perform _d360_demo_miembro(c, 'Lic. Rosa Martínez', 'director', null, '8800-1001');
  perform _d360_demo_miembro(c, 'Lic. Óscar Téllez', 'coordinador', 'Coordinación académica', '8800-1002');
  perform _d360_demo_miembro(c, 'Sra. Patricia Lacayo', 'finanzas', 'Caja y cobranza', '8800-1003');
  doc := jsonb_build_object(
    'guia4',  _d360_demo_miembro(c, 'Profa. Ana Lucía Rocha', 'docente', 'Primaria · maestra guía de 4to', '8811-0001'),
    'guia5',  _d360_demo_miembro(c, 'Profa. Carmen Obando', 'docente', 'Primaria · maestra guía de 5to', '8811-0002'),
    'guia6',  _d360_demo_miembro(c, 'Prof. Ernesto Zelaya', 'docente', 'Primaria · maestro guía de 6to', '8811-0003'),
    'ingpri', _d360_demo_miembro(c, 'Teacher Melissa Arauz', 'docente', 'Inglés primaria', '8811-0004'),
    'efi',    _d360_demo_miembro(c, 'Prof. Noel Blandón', 'docente', 'Educación Física', '8811-0005'),
    'len',    _d360_demo_miembro(c, 'Profa. Hazel Montenegro', 'docente', 'Lengua y Literatura', '8811-0006'),
    'mat',    _d360_demo_miembro(c, 'Prof. Julio Herrera', 'docente', 'Matemática', '8811-0007'),
    'cie',    _d360_demo_miembro(c, 'Profa. Fátima Somarriba', 'docente', 'Ciencias Naturales', '8811-0008'),
    'his',    _d360_demo_miembro(c, 'Prof. Rodrigo Vanegas', 'docente', 'Historia y Estudios Sociales', '8811-0009'),
    'ingsec', _d360_demo_miembro(c, 'Teacher Kevin Salazar', 'docente', 'Inglés secundaria', '8811-0010'),
    'comp',   _d360_demo_miembro(c, 'Prof. Axel Espinoza', 'docente', 'Computación', '8811-0011'));
  tutora := _d360_demo_miembro(c, 'Mariana Pérez', 'tutor', null, '8899-5566');


  -- Cortes evaluativos del año
  insert into periodos(cuenta_id, nombre, anio, inicio, fin, orden) values
    (c, 'I Corte', v_anio::text, make_date(v_anio, 2, 3), make_date(v_anio, 4, 11), 1),
    (c, 'II Corte', v_anio::text, make_date(v_anio, 4, 14), make_date(v_anio, 6, 27), 2),
    (c, 'III Corte', v_anio::text, make_date(v_anio, 7, 14), make_date(v_anio, 9, 12), 3),
    (c, 'IV Corte', v_anio::text, make_date(v_anio, 9, 15), make_date(v_anio, 11, 28), 4);
  select array_agg(id order by orden) into per from periodos where cuenta_id = c;

  insert into sedes(cuenta_id, nombre, direccion, telefono) values (c, 'Sede central', 'Masaya, del parque central 2 c. al sur', '2250-1010');
  insert into niveles(cuenta_id, nombre, orden) values (c, 'Primaria', 1) returning id into n_pri;
  insert into niveles(cuenta_id, nombre, orden) values (c, 'Secundaria', 2) returning id into n_sec;
  -- grados: 4to, 5to, 6to (primaria) y 7mo, 8vo, 9no (secundaria)
  for i in 1..6 loop
    insert into grados(cuenta_id, nivel_id, nombre, orden, matricula, colegiatura)
    values (c, case when i <= 3 then n_pri else n_sec end,
            (array['4to grado','5to grado','6to grado','7mo grado','8vo grado','9no grado'])[i], i,
            case when i <= 3 then 900 else 1100 end, case when i <= 3 then 1450 else 1750 end)
    returning id into g;
    grs := grs || g;
  end loop;
  -- Plan de estudios por grado
  for i in 1..6 loop
    nombres := case when i <= 3 then pri_materias else sec_materias end;
    for j in 1..array_length(nombres, 1) loop
      insert into asignaturas(cuenta_id, nombre, grado_id, codigo) values (c, nombres[j], grs[i], upper(left(nombres[j], 3)) || (i + 3));
    end loop;
  end loop;
  -- Secciones: una por grado y dos en 7mo (A y B)
  for i in 1..7 loop
    insert into aulas(cuenta_id, nombre, capacidad) values (c, 'Aula ' || (100 + i), 32) returning id into a;
    insert into grupos(cuenta_id, nombre, grado_id, aula_id, turno, cupo, fecha_inicio, fecha_fin, estado, sede_id)
    values (c, (array['4to A','5to A','6to A','7mo A','7mo B','8vo A','9no A'])[i],
            grs[(array[1,2,3,4,4,5,6])[i]], a, 'matutino', 30, make_date(v_anio, 2, 3), make_date(v_anio, 11, 28), 'activo',
            (select id from sedes where cuenta_id = c limit 1))
    returning id into s;
    secs := secs || s;
  end loop;

  -- Asignación de docentes por sección y asignatura (+ maestro guía)
  for i in 1..7 loop
    s := secs[i];
    for a in select id from asignaturas where grado_id = (select grado_id from grupos where id = s) order by codigo loop
      m := case
        when i <= 3 and (select nombre from asignaturas where id = a) = 'Inglés' then (doc ->> 'ingpri')::uuid
        when (select nombre from asignaturas where id = a) = 'Educación Física' then (doc ->> 'efi')::uuid
        when i <= 3 then (doc ->> ('guia' || (i + 3)))::uuid
        else (doc ->> (case (select nombre from asignaturas where id = a)
               when 'Lengua y Literatura' then 'len' when 'Matemática' then 'mat' when 'Ciencias Naturales' then 'cie'
               when 'Historia' then 'his' when 'Inglés' then 'ingsec' else 'comp' end))::uuid end;
      insert into grupo_docentes(cuenta_id, grupo_id, miembro_id, asignatura_id, es_guia)
      values (c, s, m, a, (i <= 3 and m = (doc ->> ('guia' || (i + 3)))::uuid) or (i = 4 and m = (doc ->> 'mat')::uuid) or
                           (i = 5 and m = (doc ->> 'len')::uuid) or (i = 6 and m = (doc ->> 'cie')::uuid) or (i = 7 and m = (doc ->> 'his')::uuid))
      on conflict do nothing;
    end loop;
  end loop;

  -- Horario semanal sin choques: rotación por sección (cada sección con desfase distinto)
  for i in 1..7 loop
    s := secs[i];
    select array_agg(asignatura_id order by asignatura_id) into asig_ids from (select distinct asignatura_id from grupo_docentes where grupo_id = s) x;
    nasig := array_length(asig_ids, 1);
    for d in 1..5 loop
      for sl in 1..5 loop
        a := asig_ids[1 + ((d * 5 + sl + i * 2) % nasig)];
        begin
          insert into horarios(cuenta_id, grupo_id, asignatura_id, miembro_id, aula_id, dia, hora_inicio, hora_fin)
          values (c, s, a, (select miembro_id from grupo_docentes where grupo_id = s and asignatura_id = a limit 1),
                  (select aula_id from grupos where id = s), d, horas[sl][1]::time, horas[sl][2]::time);
        exception when others then null;   -- si un docente ya tiene clase a esa hora, se deja la hora libre
        end;
      end loop;
    end loop;
  end loop;

  -- Estudiantes: 25 por sección (primaria con edades menores)
  for i in 1..7 loop
    select array_agg(x) into ests from _d360_demo_estudiantes(c, 25, 0.1 + i * 0.07) x;
    update estudiantes set fecha_nacimiento = make_date(v_anio - (9 + (array[0,1,2,3,3,4,5])[i]), 1 + (abs(hashtext(id::text)) % 12), 1 + (abs(hashtext(id::text)) % 27)),
           codigo = 'NE-' || v_anio || '-' || lpad(((i - 1) * 25 + (abs(hashtext(id::text)) % 25) + 1)::text, 3, '0') || substr(md5(id::text), 1, 2),
           documentos = jsonb_build_object('partida', true, 'notas_anteriores', random() < .85, 'fotos', random() < .9, 'cedula_tutor', random() < .8)
     where id = any(ests);
    for k in 1..25 loop
      perform d360_matricular_colegio(c, ests[k], secs[i], v_anio, 10, 2, 10,
        case when k % 11 = 0 then 25 when k % 17 = 0 then 50 else 0 end,
        case when k % 11 = 0 then 'Beca hermanos (25%)' when k % 17 = 0 then 'Beca académica (50%)' end, null);
    end loop;
    update grupo_estudiantes set desde = make_date(v_anio, 2, 3) where grupo_id = secs[i];
    update matriculas set fecha = make_date(v_anio, 1, 15 + (abs(hashtext(estudiante_id::text)) % 15)) where grupo_id = secs[i];
  end loop;

  -- Familia de la demo: Mariana Pérez con dos hijos (4to A y 7mo A)
  select ge.estudiante_id into hijo1 from grupo_estudiantes ge where ge.grupo_id = secs[1] order by ge.estudiante_id limit 1;
  select ge.estudiante_id into hijo2 from grupo_estudiantes ge where ge.grupo_id = secs[4] order by ge.estudiante_id limit 1;
  update estudiantes set nombres = 'Sofía Valentina', apellidos = 'Pérez Rocha', contacto_nombre = 'Mariana Pérez', contacto_telefono = '8899-5566', contacto_parentesco = 'Madre' where id = hijo1;
  update estudiantes set nombres = 'Diego Alejandro', apellidos = 'Pérez Rocha', contacto_nombre = 'Mariana Pérez', contacto_telefono = '8899-5566', contacto_parentesco = 'Madre' where id = hijo2;
  insert into tutores_estudiantes(miembro_id, estudiante_id, cuenta_id, parentesco) values (tutora, hijo1, c, 'Madre'), (tutora, hijo2, c, 'Madre');

  -- Evaluaciones y notas por corte: cada estudiante tiene su propio nivel de desempeño
  for i in 1..7 loop
    s := secs[i];
    for a in select distinct asignatura_id from grupo_docentes where grupo_id = s loop
      for k in 1..4 loop
        select pe.inicio, pe.fin into v_ini, v_fin from periodos pe where pe.id = per[k];
        if v_ini > current_date then continue; end if;
        for j in 1..3 loop
          v_f := least(v_ini + (j * ((v_fin - v_ini) / 4)), v_fin);
          insert into evaluaciones(cuenta_id, grupo_id, asignatura_id, periodo_id, titulo, tipo, fecha, peso, puntaje_max)
          values (c, s, a, per[k], (array['Prueba corta','Trabajo práctico','Examen de corte'])[j] || ' ' || (array['I','II','III','IV'])[k],
                  (array['examen','practica','examen'])[j], v_f, (array[30, 30, 40])[j], 100)
          returning id into v_ev;
          if v_f < current_date then
            insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje, entregado)
            select c, v_ev, ge.estudiante_id,
                   least(100, greatest(30, round(55 + (abs(hashtext(ge.estudiante_id::text)) % 43) + (random() * 18 - 9)))), true
            from grupo_estudiantes ge where ge.grupo_id = s and ge.estado = 'activo' and random() < .97;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
  -- Recuperaciones del III corte para quienes reprobaron Matemática en secundaria
  for i in 4..7 loop
    s := secs[i];
    select id into a from asignaturas where grado_id = (select grado_id from grupos where id = s) and nombre = 'Matemática';
    insert into evaluaciones(cuenta_id, grupo_id, asignatura_id, periodo_id, titulo, tipo, fecha, peso, puntaje_max)
    values (c, s, a, per[3], 'Recuperación III corte', 'recuperacion', make_date(v_anio, 9, 19), 0, 100) returning id into v_ev;
    insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje)
    select c, v_ev, n.estudiante_id, 60 + floor(random() * 15) from d360_notas_seccion(s, per[3]) n
    where n.asignatura_id = a and n.final < 60 and random() < .7;
  end loop;

  -- Asistencia de las últimas 5 semanas (una lista diaria por sección) y de docentes
  for i in 1..7 loop
    for v_f in select x::date from generate_series(current_date - 35, current_date - 1, interval '1 day') x where extract(isodow from x) <= 5 loop
      insert into asistencias(cuenta_id, grupo_id, estudiante_id, fecha, estado, nota)
      select c, secs[i], ge.estudiante_id, v_f, x.estado, case when x.estado = 'justificado' then 'Constancia médica' end
      from grupo_estudiantes ge, lateral (select random() rr) q,
           lateral (select case when q.rr < .9 then 'presente' when q.rr < .95 then 'ausente' when q.rr < .985 then 'tarde' else 'justificado' end estado) x
      where ge.grupo_id = secs[i] and ge.estado = 'activo';
    end loop;
  end loop;
  insert into asistencia_docentes(cuenta_id, miembro_id, fecha, estado, nota)
  select c, mm.id, x::date, case when random() < .95 then 'presente' when random() < .5 then 'tarde' else 'justificado' end, null
  from miembros mm, generate_series(current_date - 14, current_date - 1, interval '1 day') x
  where mm.cuenta_id = c and mm.rol = 'docente' and extract(isodow from x) <= 5;

  -- Pagos: casi todo lo vencido pagado; algunas familias atrasadas
  for v_cargo in select cg.* from cargos cg where cg.cuenta_id = c and cg.vence <= current_date + 2 order by cg.vence loop
    r := random();
    if v_cargo.vence < current_date - 60 or r < .8 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha, referencia)
      values (c, v_cargo.estudiante_id, v_cargo.id, v_cargo.monto - v_cargo.descuento,
              (array['efectivo','transferencia','transferencia','deposito'])[1 + floor(random() * 4)::int],
              least(current_date, v_cargo.vence + floor(random() * 8)::int),
              case when random() < .5 then 'LAFISE-' || floor(100000 + random() * 899999)::int end);
    elsif r < .88 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha)
      values (c, v_cargo.estudiante_id, v_cargo.id, round((v_cargo.monto - v_cargo.descuento) / 2), 'efectivo', least(current_date, v_cargo.vence + 3));
    end if;
  end loop;

  -- Comentarios de boletín del III corte (sección 7mo A, maestro guía)
  insert into boletin_comentarios(cuenta_id, estudiante_id, periodo_id, conducta, comentario)
  select c, ge.estudiante_id, per[3], (array['AA','AA','AS','AS','AF'])[1 + (abs(hashtext(ge.estudiante_id::text)) % 5)],
         (array['Muy participativo y responsable.','Debe mejorar la puntualidad en la entrega de tareas.','Excelente compañerismo.',
                'Se recomienda reforzar Matemática en casa.','Ha mostrado avances notables en este corte.'])[1 + (abs(hashtext(ge.estudiante_id::text)) % 5)]
  from grupo_estudiantes ge where ge.grupo_id = secs[4];

  -- Comunicados
  insert into comunicados(cuenta_id, titulo, cuerpo, audiencia, grupo_id, publicado) values
    (c, 'Entrega de boletines del III corte', 'Estimadas familias: la entrega de boletines será el viernes a las 4:00 p. m. en cada aula. Les esperamos.', 'tutores', null, now() - interval '20 days'),
    (c, 'Feria científica', 'Los estudiantes de secundaria presentarán sus proyectos el próximo jueves. ¡Están invitados!', 'todos', null, now() - interval '6 days'),
    (c, 'Reunión de docentes', 'Reunión de evaluación del IV corte el miércoles a las 12:30 p. m. en la biblioteca.', 'personal', null, now() - interval '2 days'),
    (c, 'Excursión educativa de 4to A', 'El 4to grado visitará el Museo Nacional. Enviar la autorización firmada antes del lunes.', 'grupo', secs[1], now() - interval '1 day');
  insert into eventos(cuenta_id, titulo, fecha, tipo, descripcion) values
    (c, 'Exámenes del IV corte', current_date + 10, 'evaluacion', 'Semana de exámenes de cierre del año escolar.'),
    (c, 'Clausura del año escolar', make_date(v_anio, 12, 5), 'actividad', 'Acto de graduación y clausura.'),
    (c, 'Asueto: Día de la Purísima', make_date(v_anio, 12, 8), 'feriado', null);
  insert into certificados(cuenta_id, estudiante_id, tipo, titulo, folio, emitido, datos)
  select c, ge.estudiante_id, 'constancia', 'Constancia de estudios', 'DEMOCO-' || to_char(current_date, 'YY') || '-' || upper(substr(md5(ge.estudiante_id::text), 1, 6)),
         current_date - 15, jsonb_build_object('curso', 'Constancia de estudios · año lectivo ' || v_anio, 'detalle', 'Estudiante activo de ' || g2.nombre)
  from grupo_estudiantes ge join grupos g2 on g2.id = ge.grupo_id where ge.grupo_id = secs[6] limit 3;
  return 175;
end $$;
revoke execute on function public.d360_sembrar_demo_colegio() from public, anon, authenticated;

-- Las demos se siembran juntas (profesor, academia y colegio)
create or replace function public.d360_admin_reiniciar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  r := d360_sembrar_demos();
  return r || jsonb_build_object('estudiantes', (r ->> 'estudiantes')::int + d360_sembrar_demo_colegio());
end $$;
revoke execute on function public.d360_admin_reiniciar_demos() from public, anon;

-- Reinicio nocturno de la demo de colegio (00:25 en Nicaragua)
select cron.schedule('d360-reiniciar-demo-colegio', '25 6 * * *', $$select public.d360_sembrar_demo_colegio()$$);

-- >>>>>>>>>> 20261105_16_importar_y_terminos.sql
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

-- >>>>>>>>>> 20261109_17_codigos_registro.sql
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

-- >>>>>>>>>> 20261111_18_registro_sin_confirmar_correo.sql
-- =====================================================================
-- DOCENCIA360 · 18 · Registro con código, sin confirmar el correo
-- El código de acceso que entrega el administrador ya prueba que la
-- persona está autorizada, así que no hace falta el correo de
-- confirmación: la función de servidor «registro-codigo» valida el
-- código, crea el usuario ya confirmado y crea la cuenta (gastando el
-- código con d360_crear_cuenta, igual que siempre).
-- Esta función solo la puede usar el servidor (service_role): recibe la
-- IP del visitante para el límite de intentos, que no se puede leer de
-- forma fiable cuando la llamada viene de otra función del servidor.
-- No cambia ninguna función existente.
-- =====================================================================
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
  return jsonb_build_object('ok', true, 'requiere', true, 'codigo', v_c.codigo, 'modalidad', v_c.modalidad, 'plan', v_c.plan_id);
end $$;
revoke all on function public.d360_srv_validar_codigo(text, text) from public, anon, authenticated;
grant execute on function public.d360_srv_validar_codigo(text, text) to service_role;

-- >>>>>>>>>> 20261111_19_lectura_publica_anon.sql
-- =====================================================================
-- DOCENCIA360 · 19 · Lectura pública para visitantes sin sesión
-- Error corregido: desde la migración 06, «anon» no puede ejecutar
-- ninguna función. Las reglas de lectura de planes y config_global
-- llamaban a d360_es_plataforma_admin(), así que todo visitante sin
-- sesión recibía 401 (42501) al leer precios, términos o el registro.
-- Solución sin abrir funciones a anon: una regla propia para anon que
-- no llama a ninguna función, y la regla con la función queda solo
-- para usuarios con sesión.
-- =====================================================================
drop policy if exists cg_leer on public.config_global;
drop policy if exists cg_leer_publico on public.config_global;
create policy cg_leer_publico on public.config_global for select to anon using (clave like 'publico.%');
create policy cg_leer on public.config_global for select to authenticated
  using (clave like 'publico.%' or public.d360_es_plataforma_admin());

drop policy if exists planes_leer on public.planes;
drop policy if exists planes_leer_publico on public.planes;
create policy planes_leer_publico on public.planes for select to anon using (activo);
create policy planes_leer on public.planes for select to authenticated
  using (activo or public.d360_es_plataforma_admin());

-- >>>>>>>>>> 20261111_20_codigo_pagado.sql
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

-- >>>>>>>>>> 20261111_21_docente_solo_sus_estudiantes.sql
-- =====================================================================
-- DOCENCIA360 · 21 · Un docente/asistente solo lee a SUS estudiantes
-- Problema: las reglas de lectura usaban d360_es_personal(), que vale
-- para cualquier persona del equipo (también docentes y asistentes).
-- Así, un docente podía leer por la API los expedientes, notas,
-- asistencia, observaciones, matrículas, certificados y familiares de
-- TODOS los estudiantes de la cuenta. La pantalla filtraba, el servidor
-- no. La política de privacidad promete «un docente ve sus grupos».
-- Solución: d360_ve_estudiante(cuenta, estudiante):
--   · dirección, coordinación, administración, caja → todos (como antes)
--   · docente/asistente → solo estudiantes inscritos (o que estuvieron)
--     en grupos donde está asignado (grupo_docentes)
--   · familia y externos → no (tienen sus propias reglas)
-- Las escrituras no cambian (ya estaban restringidas por grupo), salvo
-- crear observaciones, que ahora exige ver al estudiante.
-- =====================================================================
create or replace function public.d360_ve_estudiante(p_cuenta uuid, p_estudiante uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when r is null or r = 'tutor' then false
    when r = 'docente' then exists(
      select 1 from grupo_estudiantes ge
      join grupo_docentes gd on gd.grupo_id = ge.grupo_id
      join miembros m on m.id = gd.miembro_id
      where ge.cuenta_id = p_cuenta and ge.estudiante_id = p_estudiante
        and m.cuenta_id = p_cuenta and m.user_id = auth.uid() and m.activo)
    else true end
  from (select public.d360_mi_rol(p_cuenta) as r) x;
$$;
revoke all on function public.d360_ve_estudiante(uuid, uuid) from public, anon;
grant execute on function public.d360_ve_estudiante(uuid, uuid) to authenticated;

drop policy if exists leer on public.estudiantes;
create policy leer on public.estudiantes for select to authenticated
  using (public.d360_ve_estudiante(cuenta_id, id) or public.d360_es_tutor_de(id) or public.d360_es_plataforma_admin());

do $$
declare t text;
begin
  foreach t in array array['grupo_estudiantes','asistencias','calificaciones','boletin_comentarios','certificados','matriculas']
  loop
    execute format('drop policy if exists leer on public.%I', t);
    execute format($p$create policy leer on public.%I for select to authenticated
      using (public.d360_ve_estudiante(cuenta_id, estudiante_id) or public.d360_es_tutor_de(estudiante_id))$p$, t);
  end loop;
end $$;

drop policy if exists leer on public.observaciones;
create policy leer on public.observaciones for select to authenticated
  using (public.d360_ve_estudiante(cuenta_id, estudiante_id));
drop policy if exists crear on public.observaciones;
create policy crear on public.observaciones for insert to authenticated
  with check (public.d360_ve_estudiante(cuenta_id, estudiante_id) and public.d360_cuenta_operativa(cuenta_id) and autor = auth.uid());

drop policy if exists leer on public.tutores_estudiantes;
create policy leer on public.tutores_estudiantes for select to authenticated
  using (public.d360_ve_estudiante(cuenta_id, estudiante_id) or miembro_id = public.d360_mi_miembro(cuenta_id));

-- Asesor de seguridad: ruta de búsqueda fija también en esta función auxiliar
alter function public._d360_normalizar_codigo(text) set search_path = public;

-- >>>>>>>>>> 20261111_22_demo_colegio_codigos.sql
-- =====================================================================
-- DOCENCIA360 · 22 · Demo del colegio: códigos de estudiante sin choques
-- El código se armaba con un número derivado de un hash (podía repetirse
-- dentro de la sección) más 2 caracteres al azar. A veces dos estudiantes
-- recibían el mismo código y la siembra nocturna de la demo fallaba
-- completa (la demo quedaba sin reiniciar esa noche). Ahora el número es
-- la posición del estudiante en su sección: NE-AAAA-001 … NE-AAAA-175.
-- Solo cambia esa línea; el resto de la función es idéntico a la 15.
-- =====================================================================
create or replace function public.d360_sembrar_demo_colegio()
returns int language plpgsql security definer set search_path = public as $$
declare
  c uuid; v_anio int := extract(year from current_date)::int;
  n_pri uuid; n_sec uuid; grs uuid[] := '{}'; secs uuid[] := '{}'; g uuid; s uuid; a uuid;
  per uuid[] := '{}'; p uuid; ests uuid[]; e uuid; i int; j int; k int; d int; sl int;
  doc jsonb := '{}'::jsonb; m uuid; asig_ids uuid[]; nasig int; v_ev uuid; v_f date; capacidad int;
  v_cargo record; r float8; tutora uuid; hijo1 uuid; hijo2 uuid; v_ini date; v_fin date; nombres text[];
  pri_materias text[] := array['Lengua y Literatura','Matemática','Ciencias Naturales','Estudios Sociales','Inglés','Educación Física'];
  sec_materias text[] := array['Lengua y Literatura','Matemática','Ciencias Naturales','Historia','Inglés','Educación Física','Computación'];
  horas text[][] := array[['07:00','07:45'],['07:45','08:30'],['08:50','09:35'],['09:35','10:20'],['10:30','11:15']];
begin
  perform set_config('d360.mantenimiento', 'on', true);
  c := _d360_demo_cuenta('DEMOCO', 'colegio', 'Colegio Nueva Esperanza', 'col_institucional', '2250-1010');
  update cuentas set config = jsonb_build_object('nota_minima', 60, 'escala_cualitativa', true, 'anio_lectivo', v_anio,
      'lema', 'Educando con valores para la vida', 'certificado', jsonb_build_object('firma1', 'Lic. Rosa Martínez', 'cargo1', 'Directora',
      'firma2', 'Lic. Óscar Téllez', 'cargo2', 'Secretario académico')),
      direccion = 'Del parque central 2 cuadras al sur, Masaya', email = 'demo@docencia360.app' where id = c;

  -- Vaciar datos (no miembros)
  delete from boletin_comentarios where cuenta_id = c;
  delete from tutores_estudiantes where cuenta_id = c;
  delete from asistencia_docentes where cuenta_id = c;
  delete from sedes where cuenta_id = c;
  perform _d360_demo_vaciar(c);
  delete from niveles where cuenta_id = c;
  delete from grados where cuenta_id = c;
  delete from aulas where cuenta_id = c;

  -- Personal (los vinculados a la demo conservan su acceso entre reinicios)
  perform _d360_demo_miembro(c, 'Lic. Rosa Martínez', 'director', null, '8800-1001');
  perform _d360_demo_miembro(c, 'Lic. Óscar Téllez', 'coordinador', 'Coordinación académica', '8800-1002');
  perform _d360_demo_miembro(c, 'Sra. Patricia Lacayo', 'finanzas', 'Caja y cobranza', '8800-1003');
  doc := jsonb_build_object(
    'guia4',  _d360_demo_miembro(c, 'Profa. Ana Lucía Rocha', 'docente', 'Primaria · maestra guía de 4to', '8811-0001'),
    'guia5',  _d360_demo_miembro(c, 'Profa. Carmen Obando', 'docente', 'Primaria · maestra guía de 5to', '8811-0002'),
    'guia6',  _d360_demo_miembro(c, 'Prof. Ernesto Zelaya', 'docente', 'Primaria · maestro guía de 6to', '8811-0003'),
    'ingpri', _d360_demo_miembro(c, 'Teacher Melissa Arauz', 'docente', 'Inglés primaria', '8811-0004'),
    'efi',    _d360_demo_miembro(c, 'Prof. Noel Blandón', 'docente', 'Educación Física', '8811-0005'),
    'len',    _d360_demo_miembro(c, 'Profa. Hazel Montenegro', 'docente', 'Lengua y Literatura', '8811-0006'),
    'mat',    _d360_demo_miembro(c, 'Prof. Julio Herrera', 'docente', 'Matemática', '8811-0007'),
    'cie',    _d360_demo_miembro(c, 'Profa. Fátima Somarriba', 'docente', 'Ciencias Naturales', '8811-0008'),
    'his',    _d360_demo_miembro(c, 'Prof. Rodrigo Vanegas', 'docente', 'Historia y Estudios Sociales', '8811-0009'),
    'ingsec', _d360_demo_miembro(c, 'Teacher Kevin Salazar', 'docente', 'Inglés secundaria', '8811-0010'),
    'comp',   _d360_demo_miembro(c, 'Prof. Axel Espinoza', 'docente', 'Computación', '8811-0011'));
  tutora := _d360_demo_miembro(c, 'Mariana Pérez', 'tutor', null, '8899-5566');


  -- Cortes evaluativos del año
  insert into periodos(cuenta_id, nombre, anio, inicio, fin, orden) values
    (c, 'I Corte', v_anio::text, make_date(v_anio, 2, 3), make_date(v_anio, 4, 11), 1),
    (c, 'II Corte', v_anio::text, make_date(v_anio, 4, 14), make_date(v_anio, 6, 27), 2),
    (c, 'III Corte', v_anio::text, make_date(v_anio, 7, 14), make_date(v_anio, 9, 12), 3),
    (c, 'IV Corte', v_anio::text, make_date(v_anio, 9, 15), make_date(v_anio, 11, 28), 4);
  select array_agg(id order by orden) into per from periodos where cuenta_id = c;

  insert into sedes(cuenta_id, nombre, direccion, telefono) values (c, 'Sede central', 'Masaya, del parque central 2 c. al sur', '2250-1010');
  insert into niveles(cuenta_id, nombre, orden) values (c, 'Primaria', 1) returning id into n_pri;
  insert into niveles(cuenta_id, nombre, orden) values (c, 'Secundaria', 2) returning id into n_sec;
  -- grados: 4to, 5to, 6to (primaria) y 7mo, 8vo, 9no (secundaria)
  for i in 1..6 loop
    insert into grados(cuenta_id, nivel_id, nombre, orden, matricula, colegiatura)
    values (c, case when i <= 3 then n_pri else n_sec end,
            (array['4to grado','5to grado','6to grado','7mo grado','8vo grado','9no grado'])[i], i,
            case when i <= 3 then 900 else 1100 end, case when i <= 3 then 1450 else 1750 end)
    returning id into g;
    grs := grs || g;
  end loop;
  -- Plan de estudios por grado
  for i in 1..6 loop
    nombres := case when i <= 3 then pri_materias else sec_materias end;
    for j in 1..array_length(nombres, 1) loop
      insert into asignaturas(cuenta_id, nombre, grado_id, codigo) values (c, nombres[j], grs[i], upper(left(nombres[j], 3)) || (i + 3));
    end loop;
  end loop;
  -- Secciones: una por grado y dos en 7mo (A y B)
  for i in 1..7 loop
    insert into aulas(cuenta_id, nombre, capacidad) values (c, 'Aula ' || (100 + i), 32) returning id into a;
    insert into grupos(cuenta_id, nombre, grado_id, aula_id, turno, cupo, fecha_inicio, fecha_fin, estado, sede_id)
    values (c, (array['4to A','5to A','6to A','7mo A','7mo B','8vo A','9no A'])[i],
            grs[(array[1,2,3,4,4,5,6])[i]], a, 'matutino', 30, make_date(v_anio, 2, 3), make_date(v_anio, 11, 28), 'activo',
            (select id from sedes where cuenta_id = c limit 1))
    returning id into s;
    secs := secs || s;
  end loop;

  -- Asignación de docentes por sección y asignatura (+ maestro guía)
  for i in 1..7 loop
    s := secs[i];
    for a in select id from asignaturas where grado_id = (select grado_id from grupos where id = s) order by codigo loop
      m := case
        when i <= 3 and (select nombre from asignaturas where id = a) = 'Inglés' then (doc ->> 'ingpri')::uuid
        when (select nombre from asignaturas where id = a) = 'Educación Física' then (doc ->> 'efi')::uuid
        when i <= 3 then (doc ->> ('guia' || (i + 3)))::uuid
        else (doc ->> (case (select nombre from asignaturas where id = a)
               when 'Lengua y Literatura' then 'len' when 'Matemática' then 'mat' when 'Ciencias Naturales' then 'cie'
               when 'Historia' then 'his' when 'Inglés' then 'ingsec' else 'comp' end))::uuid end;
      insert into grupo_docentes(cuenta_id, grupo_id, miembro_id, asignatura_id, es_guia)
      values (c, s, m, a, (i <= 3 and m = (doc ->> ('guia' || (i + 3)))::uuid) or (i = 4 and m = (doc ->> 'mat')::uuid) or
                           (i = 5 and m = (doc ->> 'len')::uuid) or (i = 6 and m = (doc ->> 'cie')::uuid) or (i = 7 and m = (doc ->> 'his')::uuid))
      on conflict do nothing;
    end loop;
  end loop;

  -- Horario semanal sin choques: rotación por sección (cada sección con desfase distinto)
  for i in 1..7 loop
    s := secs[i];
    select array_agg(asignatura_id order by asignatura_id) into asig_ids from (select distinct asignatura_id from grupo_docentes where grupo_id = s) x;
    nasig := array_length(asig_ids, 1);
    for d in 1..5 loop
      for sl in 1..5 loop
        a := asig_ids[1 + ((d * 5 + sl + i * 2) % nasig)];
        begin
          insert into horarios(cuenta_id, grupo_id, asignatura_id, miembro_id, aula_id, dia, hora_inicio, hora_fin)
          values (c, s, a, (select miembro_id from grupo_docentes where grupo_id = s and asignatura_id = a limit 1),
                  (select aula_id from grupos where id = s), d, horas[sl][1]::time, horas[sl][2]::time);
        exception when others then null;   -- si un docente ya tiene clase a esa hora, se deja la hora libre
        end;
      end loop;
    end loop;
  end loop;

  -- Estudiantes: 25 por sección (primaria con edades menores)
  for i in 1..7 loop
    select array_agg(x) into ests from _d360_demo_estudiantes(c, 25, 0.1 + i * 0.07) x;
    update estudiantes set fecha_nacimiento = make_date(v_anio - (9 + (array[0,1,2,3,3,4,5])[i]), 1 + (abs(hashtext(id::text)) % 12), 1 + (abs(hashtext(id::text)) % 27)),
           codigo = 'NE-' || v_anio || '-' || lpad(((i - 1) * 25 + array_position(ests, id))::text, 3, '0'),   -- único: posición del estudiante en su sección
           documentos = jsonb_build_object('partida', true, 'notas_anteriores', random() < .85, 'fotos', random() < .9, 'cedula_tutor', random() < .8)
     where id = any(ests);
    for k in 1..25 loop
      perform d360_matricular_colegio(c, ests[k], secs[i], v_anio, 10, 2, 10,
        case when k % 11 = 0 then 25 when k % 17 = 0 then 50 else 0 end,
        case when k % 11 = 0 then 'Beca hermanos (25%)' when k % 17 = 0 then 'Beca académica (50%)' end, null);
    end loop;
    update grupo_estudiantes set desde = make_date(v_anio, 2, 3) where grupo_id = secs[i];
    update matriculas set fecha = make_date(v_anio, 1, 15 + (abs(hashtext(estudiante_id::text)) % 15)) where grupo_id = secs[i];
  end loop;

  -- Familia de la demo: Mariana Pérez con dos hijos (4to A y 7mo A)
  select ge.estudiante_id into hijo1 from grupo_estudiantes ge where ge.grupo_id = secs[1] order by ge.estudiante_id limit 1;
  select ge.estudiante_id into hijo2 from grupo_estudiantes ge where ge.grupo_id = secs[4] order by ge.estudiante_id limit 1;
  update estudiantes set nombres = 'Sofía Valentina', apellidos = 'Pérez Rocha', contacto_nombre = 'Mariana Pérez', contacto_telefono = '8899-5566', contacto_parentesco = 'Madre' where id = hijo1;
  update estudiantes set nombres = 'Diego Alejandro', apellidos = 'Pérez Rocha', contacto_nombre = 'Mariana Pérez', contacto_telefono = '8899-5566', contacto_parentesco = 'Madre' where id = hijo2;
  insert into tutores_estudiantes(miembro_id, estudiante_id, cuenta_id, parentesco) values (tutora, hijo1, c, 'Madre'), (tutora, hijo2, c, 'Madre');

  -- Evaluaciones y notas por corte: cada estudiante tiene su propio nivel de desempeño
  for i in 1..7 loop
    s := secs[i];
    for a in select distinct asignatura_id from grupo_docentes where grupo_id = s loop
      for k in 1..4 loop
        select pe.inicio, pe.fin into v_ini, v_fin from periodos pe where pe.id = per[k];
        if v_ini > current_date then continue; end if;
        for j in 1..3 loop
          v_f := least(v_ini + (j * ((v_fin - v_ini) / 4)), v_fin);
          insert into evaluaciones(cuenta_id, grupo_id, asignatura_id, periodo_id, titulo, tipo, fecha, peso, puntaje_max)
          values (c, s, a, per[k], (array['Prueba corta','Trabajo práctico','Examen de corte'])[j] || ' ' || (array['I','II','III','IV'])[k],
                  (array['examen','practica','examen'])[j], v_f, (array[30, 30, 40])[j], 100)
          returning id into v_ev;
          if v_f < current_date then
            insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje, entregado)
            select c, v_ev, ge.estudiante_id,
                   least(100, greatest(30, round(55 + (abs(hashtext(ge.estudiante_id::text)) % 43) + (random() * 18 - 9)))), true
            from grupo_estudiantes ge where ge.grupo_id = s and ge.estado = 'activo' and random() < .97;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
  -- Recuperaciones del III corte para quienes reprobaron Matemática en secundaria
  for i in 4..7 loop
    s := secs[i];
    select id into a from asignaturas where grado_id = (select grado_id from grupos where id = s) and nombre = 'Matemática';
    insert into evaluaciones(cuenta_id, grupo_id, asignatura_id, periodo_id, titulo, tipo, fecha, peso, puntaje_max)
    values (c, s, a, per[3], 'Recuperación III corte', 'recuperacion', make_date(v_anio, 9, 19), 0, 100) returning id into v_ev;
    insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje)
    select c, v_ev, n.estudiante_id, 60 + floor(random() * 15) from d360_notas_seccion(s, per[3]) n
    where n.asignatura_id = a and n.final < 60 and random() < .7;
  end loop;

  -- Asistencia de las últimas 5 semanas (una lista diaria por sección) y de docentes
  for i in 1..7 loop
    for v_f in select x::date from generate_series(current_date - 35, current_date - 1, interval '1 day') x where extract(isodow from x) <= 5 loop
      insert into asistencias(cuenta_id, grupo_id, estudiante_id, fecha, estado, nota)
      select c, secs[i], ge.estudiante_id, v_f, x.estado, case when x.estado = 'justificado' then 'Constancia médica' end
      from grupo_estudiantes ge, lateral (select random() rr) q,
           lateral (select case when q.rr < .9 then 'presente' when q.rr < .95 then 'ausente' when q.rr < .985 then 'tarde' else 'justificado' end estado) x
      where ge.grupo_id = secs[i] and ge.estado = 'activo';
    end loop;
  end loop;
  insert into asistencia_docentes(cuenta_id, miembro_id, fecha, estado, nota)
  select c, mm.id, x::date, case when random() < .95 then 'presente' when random() < .5 then 'tarde' else 'justificado' end, null
  from miembros mm, generate_series(current_date - 14, current_date - 1, interval '1 day') x
  where mm.cuenta_id = c and mm.rol = 'docente' and extract(isodow from x) <= 5;

  -- Pagos: casi todo lo vencido pagado; algunas familias atrasadas
  for v_cargo in select cg.* from cargos cg where cg.cuenta_id = c and cg.vence <= current_date + 2 order by cg.vence loop
    r := random();
    if v_cargo.vence < current_date - 60 or r < .8 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha, referencia)
      values (c, v_cargo.estudiante_id, v_cargo.id, v_cargo.monto - v_cargo.descuento,
              (array['efectivo','transferencia','transferencia','deposito'])[1 + floor(random() * 4)::int],
              least(current_date, v_cargo.vence + floor(random() * 8)::int),
              case when random() < .5 then 'LAFISE-' || floor(100000 + random() * 899999)::int end);
    elsif r < .88 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha)
      values (c, v_cargo.estudiante_id, v_cargo.id, round((v_cargo.monto - v_cargo.descuento) / 2), 'efectivo', least(current_date, v_cargo.vence + 3));
    end if;
  end loop;

  -- Comentarios de boletín del III corte (sección 7mo A, maestro guía)
  insert into boletin_comentarios(cuenta_id, estudiante_id, periodo_id, conducta, comentario)
  select c, ge.estudiante_id, per[3], (array['AA','AA','AS','AS','AF'])[1 + (abs(hashtext(ge.estudiante_id::text)) % 5)],
         (array['Muy participativo y responsable.','Debe mejorar la puntualidad en la entrega de tareas.','Excelente compañerismo.',
                'Se recomienda reforzar Matemática en casa.','Ha mostrado avances notables en este corte.'])[1 + (abs(hashtext(ge.estudiante_id::text)) % 5)]
  from grupo_estudiantes ge where ge.grupo_id = secs[4];

  -- Comunicados
  insert into comunicados(cuenta_id, titulo, cuerpo, audiencia, grupo_id, publicado) values
    (c, 'Entrega de boletines del III corte', 'Estimadas familias: la entrega de boletines será el viernes a las 4:00 p. m. en cada aula. Les esperamos.', 'tutores', null, now() - interval '20 days'),
    (c, 'Feria científica', 'Los estudiantes de secundaria presentarán sus proyectos el próximo jueves. ¡Están invitados!', 'todos', null, now() - interval '6 days'),
    (c, 'Reunión de docentes', 'Reunión de evaluación del IV corte el miércoles a las 12:30 p. m. en la biblioteca.', 'personal', null, now() - interval '2 days'),
    (c, 'Excursión educativa de 4to A', 'El 4to grado visitará el Museo Nacional. Enviar la autorización firmada antes del lunes.', 'grupo', secs[1], now() - interval '1 day');
  insert into eventos(cuenta_id, titulo, fecha, tipo, descripcion) values
    (c, 'Exámenes del IV corte', current_date + 10, 'evaluacion', 'Semana de exámenes de cierre del año escolar.'),
    (c, 'Clausura del año escolar', make_date(v_anio, 12, 5), 'actividad', 'Acto de graduación y clausura.'),
    (c, 'Asueto: Día de la Purísima', make_date(v_anio, 12, 8), 'feriado', null);
  insert into certificados(cuenta_id, estudiante_id, tipo, titulo, folio, emitido, datos)
  select c, ge.estudiante_id, 'constancia', 'Constancia de estudios', 'DEMOCO-' || to_char(current_date, 'YY') || '-' || upper(substr(md5(ge.estudiante_id::text), 1, 6)),
         current_date - 15, jsonb_build_object('curso', 'Constancia de estudios · año lectivo ' || v_anio, 'detalle', 'Estudiante activo de ' || g2.nombre)
  from grupo_estudiantes ge join grupos g2 on g2.id = ge.grupo_id where ge.grupo_id = secs[6] limit 3;
  return 175;
end $$;
revoke execute on function public.d360_sembrar_demo_colegio() from public, anon, authenticated;

-- >>>>>>>>>> 20261112_23_mensajes_limite.sql
-- =====================================================================
-- DOCENCIA360 · 23 · Mensajes de límite del plan más claros
-- · Profesor: «asistentes» (antes decía «docentes»); academia: «instructores».
-- · Si el plan no incluye el recurso (máximo 0): «tu plan no lo incluye».
-- · Indica dónde se cambia el plan (Mi cuenta).
-- La lógica de los límites no cambia.
-- =====================================================================
create or replace function public.d360_validar_limite(p_cuenta uuid, p_recurso text)
returns void language plpgsql security definer set search_path = public as $$
declare v_plan planes; v_max int; v_actual int; v_txt text; v_mod text;
begin
  select p.* into v_plan from suscripciones s join planes p on p.id = s.plan_id where s.cuenta_id = p_cuenta;
  if v_plan.id is null then raise exception 'La cuenta no tiene un plan asignado'; end if;
  select modalidad into v_mod from cuentas where id = p_cuenta;
  if p_recurso = 'estudiantes' then
    v_max := v_plan.max_estudiantes;
    select count(*) into v_actual from estudiantes where cuenta_id = p_cuenta and estado = 'activo';
    v_txt := 'estudiantes activos';
  elsif p_recurso = 'grupos' then
    v_max := v_plan.max_grupos;
    select count(*) into v_actual from grupos where cuenta_id = p_cuenta and estado in ('planificado','activo');
    v_txt := 'grupos activos';
  elsif p_recurso = 'docentes' then
    v_max := v_plan.max_docentes;
    select count(*) into v_actual from miembros where cuenta_id = p_cuenta and activo and rol = 'docente';
    v_txt := case v_mod when 'profesor' then 'asistentes' when 'academia' then 'instructores' else 'docentes' end;
  elsif p_recurso = 'admins' then
    v_max := v_plan.max_admins;
    select count(*) into v_actual from miembros where cuenta_id = p_cuenta and activo
      and rol in ('director','subdirector','coordinador','administrativo','finanzas');
    v_txt := 'usuarios administrativos';
  else
    return;
  end if;
  if v_max = 0 then
    raise exception 'Tu plan % no incluye %. Puedes verlo en Mi cuenta → Renovar o cambiar de plan.', v_plan.nombre, v_txt
      using errcode = 'P0001', hint = 'limite_plan';
  elsif v_max is not null and v_actual >= v_max then
    raise exception 'Llegaste al máximo de % de tu plan % (%). Para agregar más, cambia de plan en Mi cuenta.', v_txt, v_plan.nombre, v_max
      using errcode = 'P0001', hint = 'limite_plan';
  end if;
end $$;
-- (create or replace conserva los permisos que ya tenía la función)

-- >>>>>>>>>> 20261112_24_portal_estudiantes.sql
-- =====================================================================
-- DOCENCIA360 · 24 · Portal de estudiantes: tareas y exámenes en línea
-- · Planes del profesor: estudiantes registrados SIN límite. El límite
--   ahora es de estudiantes CON ACCESO al portal: Básico 0 (no incluye),
--   Profesional 250, Premium 600 (planes.max_estudiantes_portal).
-- · El profesor crea una actividad (examen o tarea) con preguntas:
--   opción múltiple, verdadero/falso, respuesta corta (se califican
--   solas) y desarrollo (las revisa el profesor).
-- · El estudiante abre un enlace/QR de la actividad y entra con su
--   código personal de 6 dígitos. No tiene usuario de Auth: todo pasa
--   por funciones del servidor que validan una sesión secreta.
-- · Las respuestas correctas nunca salen del servidor hacia el alumno.
-- · Al enviar, la nota se escribe sola en Calificaciones (evaluación
--   vinculada). Si hay preguntas de desarrollo, queda pendiente de revisión.
-- =====================================================================

-- ---------- 1. Planes ----------
alter table public.planes add column if not exists max_estudiantes_portal int not null default 0 check (max_estudiantes_portal >= 0);
update public.planes set max_estudiantes = null where modalidad = 'profesor';
update public.planes set max_estudiantes_portal = 0,   funciones = funciones || '{"portal_estudiantes": false}' where id = 'prof_basico';
update public.planes set max_estudiantes_portal = 250, funciones = funciones || '{"portal_estudiantes": true}'  where id = 'prof_profesional';
update public.planes set max_estudiantes_portal = 600, funciones = funciones || '{"portal_estudiantes": true}'  where id = 'prof_premium';

-- ---------- 2. Acceso de estudiantes ----------
create table if not exists public.estudiantes_acceso (
  estudiante_id uuid primary key references public.estudiantes(id) on delete cascade,
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  codigo_hash   text,                         -- HMAC con pepper; null cuando está desactivado
  ultimos       text,                         -- 2 últimos dígitos, para reconocerlo
  activo        boolean not null default true,
  creado        timestamptz not null default now(),
  ultimo_acceso timestamptz
);
create unique index if not exists estudiantes_acceso_codigo on public.estudiantes_acceso(cuenta_id, codigo_hash) where codigo_hash is not null;
alter table public.estudiantes_acceso enable row level security;
revoke all on public.estudiantes_acceso from anon, authenticated;
grant select (estudiante_id, cuenta_id, ultimos, activo, creado, ultimo_acceso) on public.estudiantes_acceso to authenticated;
drop policy if exists leer on public.estudiantes_acceso;
create policy leer on public.estudiantes_acceso for select to authenticated using (public.d360_ve_estudiante(cuenta_id, estudiante_id));

-- ---------- 3. Actividades, preguntas y entregas ----------
create table if not exists public.actividades (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  evaluacion_id uuid references public.evaluaciones(id) on delete set null,
  tipo          text not null default 'examen' check (tipo in ('examen','tarea')),
  titulo        text not null check (length(trim(titulo)) between 2 and 140),
  instrucciones text check (length(instrucciones) <= 4000),
  abre          timestamptz,                  -- null = desde que se publica
  cierra        timestamptz,                  -- null = sin fecha de cierre
  duracion_min  int check (duracion_min between 1 and 600),   -- null = sin límite de tiempo
  intentos      int not null default 1 check (intentos between 1 and 5),
  mostrar_nota  boolean not null default true,
  peso          numeric(6,2) not null default 0 check (peso between 0 and 100),
  estado        text not null default 'borrador' check (estado in ('borrador','publicada','cerrada')),
  token         text unique,
  creado        timestamptz not null default now(),
  creado_por    uuid default auth.uid()
);
create index if not exists actividades_grupo on public.actividades(grupo_id);
create index if not exists actividades_cuenta on public.actividades(cuenta_id, creado desc);

create table if not exists public.preguntas (
  id           uuid primary key default gen_random_uuid(),
  cuenta_id    uuid not null references public.cuentas(id) on delete cascade,
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  orden        int not null default 0,
  tipo         text not null check (tipo in ('opcion','vf','corta','desarrollo')),
  enunciado    text not null check (length(trim(enunciado)) between 1 and 2000),
  opciones     jsonb not null default '[]'::jsonb,   -- opción múltiple: arreglo de textos
  correcta     jsonb,                                -- opcion: índice · vf: true/false · corta: arreglo de respuestas aceptadas
  puntos       numeric(6,2) not null default 1 check (puntos > 0 and puntos <= 100),
  check (tipo <> 'opcion' or (jsonb_typeof(opciones) = 'array' and jsonb_array_length(opciones) between 2 and 8
                              and jsonb_typeof(correcta) = 'number' and (correcta)::text::int between 0 and jsonb_array_length(opciones) - 1)),
  check (tipo <> 'vf' or jsonb_typeof(correcta) = 'boolean'),
  check (tipo <> 'corta' or (jsonb_typeof(correcta) = 'array' and jsonb_array_length(correcta) >= 1))
);
create index if not exists preguntas_actividad on public.preguntas(actividad_id, orden);

create table if not exists public.entregas (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references public.cuentas(id) on delete cascade,
  actividad_id   uuid not null references public.actividades(id) on delete cascade,
  estudiante_id  uuid not null references public.estudiantes(id) on delete cascade,
  intento        int not null default 1,
  sesion_hash    text,
  iniciada       timestamptz not null default now(),
  limite         timestamptz,                         -- hora máxima para enviar (duración o cierre)
  enviada        timestamptz,
  respuestas     jsonb not null default '{}'::jsonb,  -- { pregunta_id: valor }
  puntos_auto    jsonb not null default '{}'::jsonb,  -- { pregunta_id: puntos } calculados solos
  puntos_manual  jsonb not null default '{}'::jsonb,  -- { pregunta_id: puntos } puestos por el profesor
  puntaje        numeric(7,2),
  puntaje_max    numeric(7,2),
  pendiente      boolean not null default false,      -- hay desarrollo sin revisar
  estado         text not null default 'en_curso' check (estado in ('en_curso','enviada')),
  comentario     text,
  origen         text,
  unique (actividad_id, estudiante_id, intento)
);
create index if not exists entregas_actividad on public.entregas(actividad_id);
create unique index if not exists entregas_sesion on public.entregas(sesion_hash) where sesion_hash is not null;

-- Integridad entre cuentas y cuenta inmutable
create trigger t_mc before insert or update on public.actividades for each row execute function public.d360_misma_cuenta('grupo_id:grupos','evaluacion_id:evaluaciones');
create trigger t_mc before insert or update on public.preguntas   for each row execute function public.d360_misma_cuenta('actividad_id:actividades');
create trigger t_mc before insert or update on public.entregas    for each row execute function public.d360_misma_cuenta('actividad_id:actividades','estudiante_id:estudiantes');
create trigger t_mc before insert or update on public.estudiantes_acceso for each row execute function public.d360_misma_cuenta('estudiante_id:estudiantes');
create trigger t_ci before update on public.actividades for each row execute function public.d360_cuenta_inmutable();
create trigger t_ci before update on public.preguntas   for each row execute function public.d360_cuenta_inmutable();
create trigger t_ci before update on public.entregas    for each row execute function public.d360_cuenta_inmutable();
create trigger t_ci before update on public.estudiantes_acceso for each row execute function public.d360_cuenta_inmutable();

-- Quién ve y quién edita: dirección/dueño todo; docente/asistente solo sus grupos
create or replace function public.d360_ve_grupo(p_cuenta uuid, p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when r is null or r = 'tutor' then false when r = 'docente' then public.d360_docente_de_grupo(p_grupo) else true end
  from (select public.d360_mi_rol(p_cuenta) as r) x;
$$;
revoke all on function public.d360_ve_grupo(uuid, uuid) from public, anon;
grant execute on function public.d360_ve_grupo(uuid, uuid) to authenticated;

alter table public.actividades enable row level security;
create policy leer on public.actividades for select to authenticated using (public.d360_ve_grupo(cuenta_id, grupo_id));
create policy escribir on public.actividades for all to authenticated
  using (public.d360_puede_grupo(cuenta_id, grupo_id) and public.d360_tiene_funcion(cuenta_id, 'portal_estudiantes'))
  with check (public.d360_puede_grupo(cuenta_id, grupo_id) and public.d360_tiene_funcion(cuenta_id, 'portal_estudiantes'));

alter table public.preguntas enable row level security;
create policy leer on public.preguntas for select to authenticated
  using (exists(select 1 from actividades a where a.id = actividad_id and public.d360_ve_grupo(a.cuenta_id, a.grupo_id)));
create policy escribir on public.preguntas for all to authenticated
  using (exists(select 1 from actividades a where a.id = actividad_id and public.d360_puede_grupo(a.cuenta_id, a.grupo_id)))
  with check (exists(select 1 from actividades a where a.id = actividad_id and a.cuenta_id = preguntas.cuenta_id and public.d360_puede_grupo(a.cuenta_id, a.grupo_id)));

alter table public.entregas enable row level security;
create policy leer on public.entregas for select to authenticated
  using (public.d360_ve_estudiante(cuenta_id, estudiante_id)
         and exists(select 1 from actividades a where a.id = actividad_id and public.d360_ve_grupo(a.cuenta_id, a.grupo_id)));
-- (las entregas solo se escriben por las funciones del servidor)
revoke insert, update, delete on public.entregas from anon, authenticated;
revoke all on public.actividades, public.preguntas, public.entregas from anon;
-- La sesión del estudiante no se lee ni con permiso
revoke select on public.entregas from authenticated;
grant select (id, cuenta_id, actividad_id, estudiante_id, intento, iniciada, limite, enviada, respuestas, puntos_auto, puntos_manual,
              puntaje, puntaje_max, pendiente, estado, comentario) on public.entregas to authenticated;

-- Con entregas recibidas, las preguntas ya no se cambian (las notas dejarían de cuadrar)
create or replace function public.t_preguntas_bloqueadas()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_act uuid := coalesce(new.actividad_id, old.actividad_id);
begin
  -- Si se está borrando la actividad completa (cascada), se permite
  if tg_op = 'DELETE' and not exists(select 1 from actividades where id = v_act) then return old; end if;
  if exists(select 1 from entregas where actividad_id = v_act) then
    raise exception 'Esta actividad ya tiene respuestas de estudiantes: sus preguntas no se pueden cambiar. Crea una copia si necesitas otra versión.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.t_preguntas_bloqueadas() from public, anon, authenticated;
create trigger t_bloqueo before insert or update or delete on public.preguntas for each row execute function public.t_preguntas_bloqueadas();

-- ---------- 4. Ayudas internas ----------
create or replace function public._d360_norm(p text)
returns text language sql immutable set search_path = public as $$
  select lower(translate(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
$$;

create or replace function public._d360_hash_sesion(p text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(digest(coalesce(p, ''), 'sha256'), 'hex');
$$;
revoke all on function public._d360_hash_sesion(text) from public, anon, authenticated;

-- Califica lo automático, suma lo manual y deja la entrega lista
create or replace function public._d360_calificar(p_entrega uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e entregas; q preguntas; r jsonb; auto jsonb := '{}'::jsonb; total numeric := 0; maxp numeric := 0; pend boolean := false; pts numeric; acept jsonb; ok boolean;
begin
  select * into e from entregas where id = p_entrega for update;
  for q in select * from preguntas where actividad_id = e.actividad_id order by orden, id loop
    maxp := maxp + q.puntos;
    r := e.respuestas -> q.id::text;
    pts := 0;
    if q.tipo = 'opcion' then
      if r is not null and jsonb_typeof(r) = 'number' and r::text = q.correcta::text then pts := q.puntos; end if;
    elsif q.tipo = 'vf' then
      if r is not null and jsonb_typeof(r) = 'boolean' and r = q.correcta then pts := q.puntos; end if;
    elsif q.tipo = 'corta' then
      ok := false;
      if r is not null and jsonb_typeof(r) = 'string' and _d360_norm(r #>> '{}') <> '' then
        for acept in select value from jsonb_array_elements(q.correcta) loop
          if _d360_norm(acept #>> '{}') = _d360_norm(r #>> '{}') then ok := true; exit; end if;
          -- números: 3,5 = 3.5 = 3.50
          if (acept #>> '{}') ~ '^\s*-?\d+([.,]\d+)?\s*$' and (r #>> '{}') ~ '^\s*-?\d+([.,]\d+)?\s*$'
             and replace(trim(acept #>> '{}'), ',', '.')::numeric = replace(trim(r #>> '{}'), ',', '.')::numeric then ok := true; exit; end if;
        end loop;
      end if;
      if ok then pts := q.puntos; end if;
    else  -- desarrollo: lo pone el profesor
      if e.puntos_manual ? q.id::text then pts := least(greatest(coalesce((e.puntos_manual ->> q.id::text)::numeric, 0), 0), q.puntos);
      elsif r is not null and _d360_norm(r #>> '{}') <> '' then pend := true;   -- respondió y falta revisar
      end if;
      total := total + pts;
      continue;
    end if;
    auto := auto || jsonb_build_object(q.id::text, pts);
    total := total + pts;
  end loop;
  update entregas set puntos_auto = auto, puntaje = round(total, 2), puntaje_max = maxp, pendiente = pend where id = p_entrega;
end $$;
revoke all on function public._d360_calificar(uuid) from public, anon, authenticated;

-- Escribe en Calificaciones la mejor nota enviada y revisada del estudiante
create or replace function public._d360_volcar_nota(p_actividad uuid, p_estudiante uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a actividades; mejor entregas; v_max numeric;
begin
  select * into a from actividades where id = p_actividad;
  if a.evaluacion_id is null then return; end if;
  select * into mejor from entregas where actividad_id = p_actividad and estudiante_id = p_estudiante and estado = 'enviada' and not pendiente
    order by puntaje desc nulls last, enviada desc limit 1;
  if mejor.id is null then return; end if;
  select puntaje_max into v_max from evaluaciones where id = a.evaluacion_id;
  insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje, entregado, comentario)
  values (a.cuenta_id, a.evaluacion_id, p_estudiante,
          round(case when coalesce(mejor.puntaje_max, 0) = 0 then 0 else mejor.puntaje / mejor.puntaje_max * v_max end, 2), true, 'En línea')
  on conflict (evaluacion_id, estudiante_id) do update set puntaje = excluded.puntaje, entregado = true,
    comentario = coalesce(calificaciones.comentario, 'En línea'), actualizado = now();
end $$;
revoke all on function public._d360_volcar_nota(uuid, uuid) from public, anon, authenticated;

-- Cierra los intentos cuyo tiempo se acabó (se califica lo que guardaron)
create or replace function public._d360_cerrar_vencidas(p_actividad uuid)
returns int language plpgsql security definer set search_path = public as $$
declare e entregas; n int := 0;
begin
  for e in select * from entregas where actividad_id = p_actividad and estado = 'en_curso' and limite is not null and limite + interval '2 minutes' < now() loop
    update entregas set estado = 'enviada', enviada = e.limite, sesion_hash = null, origen = 'tiempo agotado' where id = e.id;
    perform _d360_calificar(e.id);
    perform _d360_volcar_nota(p_actividad, e.estudiante_id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public._d360_cerrar_vencidas(uuid) from public, anon, authenticated;

-- ---------- 5. Profesor: accesos de estudiantes ----------
create or replace function public.d360_alumnos_activar(p_cuenta uuid, p_estudiantes uuid[], p_regenerar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan planes; v_activos int; v_nuevos int; v_id uuid; v_pin text; v_hash text; v_try int; res jsonb := '[]'::jsonb; v_nom text; ya boolean;
begin
  if not d360_gestor_operativo(p_cuenta) then
    raise exception 'Solo la administración de la cuenta activa accesos, y la suscripción debe estar vigente.' using errcode = '42501';
  end if;
  perform _d360_no_en_demo(p_cuenta);
  v_plan := d360_plan_de(p_cuenta);
  if not d360_tiene_funcion(p_cuenta, 'portal_estudiantes') or coalesce(v_plan.max_estudiantes_portal, 0) = 0 then
    raise exception 'Tu plan % no incluye tareas y exámenes en línea. Puedes verlo en Mi cuenta → Renovar o cambiar de plan.', v_plan.nombre
      using errcode = 'P0001', hint = 'limite_plan';
  end if;
  if coalesce(array_length(p_estudiantes, 1), 0) = 0 then raise exception 'Elige al menos un estudiante.'; end if;
  select count(*) into v_activos from estudiantes_acceso where cuenta_id = p_cuenta and activo;
  select count(*) into v_nuevos from unnest(p_estudiantes) x(id)
    where not exists(select 1 from estudiantes_acceso a where a.estudiante_id = x.id and a.activo);
  if v_activos + v_nuevos > v_plan.max_estudiantes_portal then
    raise exception 'Tu plan % permite % estudiantes con acceso en línea. Ya tienes % y quieres activar %. Desactiva a quienes ya no lo usen o cambia de plan.',
      v_plan.nombre, v_plan.max_estudiantes_portal, v_activos, v_nuevos using errcode = 'P0001', hint = 'limite_plan';
  end if;
  foreach v_id in array p_estudiantes loop
    select trim(nombres || ' ' || apellidos) into v_nom from estudiantes where id = v_id and cuenta_id = p_cuenta and estado = 'activo';
    if v_nom is null then continue; end if;
    select activo into ya from estudiantes_acceso where estudiante_id = v_id;
    if coalesce(ya, false) and not p_regenerar then continue; end if;
    v_try := 0;
    loop
      v_try := v_try + 1; v_pin := _d360_pin_aleatorio(); v_hash := _d360_hash_codigo(p_cuenta, 'e:' || v_pin);
      exit when not exists(select 1 from estudiantes_acceso where cuenta_id = p_cuenta and codigo_hash = v_hash and estudiante_id <> v_id);
      if v_try > 30 then raise exception 'No se pudo generar un código único. Intenta de nuevo.'; end if;
    end loop;
    insert into estudiantes_acceso(estudiante_id, cuenta_id, codigo_hash, ultimos, activo)
    values (v_id, p_cuenta, v_hash, right(v_pin, 2), true)
    on conflict (estudiante_id) do update set codigo_hash = excluded.codigo_hash, ultimos = excluded.ultimos, activo = true;
    res := res || jsonb_build_object('estudiante_id', v_id, 'nombre', v_nom, 'codigo', v_pin);
  end loop;
  perform d360_log(p_cuenta, 'acceso_estudiantes_activado', 'estudiantes_acceso', null, jsonb_build_object('cantidad', jsonb_array_length(res), 'regenerar', p_regenerar));
  return res;
end $$;
revoke execute on function public.d360_alumnos_activar(uuid, uuid[], boolean) from public, anon;
grant execute on function public.d360_alumnos_activar(uuid, uuid[], boolean) to authenticated;

create or replace function public.d360_alumnos_desactivar(p_cuenta uuid, p_estudiantes uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not d360_es_gestor(p_cuenta) then raise exception 'Solo la administración de la cuenta desactiva accesos.' using errcode = '42501'; end if;
  update estudiantes_acceso set activo = false, codigo_hash = null
   where cuenta_id = p_cuenta and estudiante_id = any(p_estudiantes) and activo;
  get diagnostics n = row_count;
  update entregas set sesion_hash = null where cuenta_id = p_cuenta and estudiante_id = any(p_estudiantes);
  perform d360_log(p_cuenta, 'acceso_estudiantes_desactivado', 'estudiantes_acceso', null, jsonb_build_object('cantidad', n));
  return n;
end $$;
revoke execute on function public.d360_alumnos_desactivar(uuid, uuid[]) from public, anon;
grant execute on function public.d360_alumnos_desactivar(uuid, uuid[]) to authenticated;

-- ---------- 6. Profesor: publicar, cerrar, resultados, revisar ----------
create or replace function public.d360_actividad_publicar(p_actividad uuid)
returns text language plpgsql security definer set search_path = public as $$
declare a actividades; v_max numeric; v_n int; v_ev uuid;
begin
  select * into a from actividades where id = p_actividad for update;
  if a.id is null or not d360_puede_grupo(a.cuenta_id, a.grupo_id) then raise exception 'No tienes permiso sobre esta actividad.' using errcode = '42501'; end if;
  if not d360_tiene_funcion(a.cuenta_id, 'portal_estudiantes') then raise exception 'Tu plan no incluye tareas y exámenes en línea.' using hint = 'limite_plan'; end if;
  select count(*), coalesce(sum(puntos), 0) into v_n, v_max from preguntas where actividad_id = p_actividad;
  if v_n = 0 then raise exception 'Agrega al menos una pregunta antes de publicar.'; end if;
  if a.cierra is not null and a.cierra <= coalesce(a.abre, now()) then raise exception 'La fecha de cierre debe ser posterior a la de apertura.'; end if;
  if a.evaluacion_id is null then
    insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max, descripcion)
    values (a.cuenta_id, a.grupo_id, a.titulo, a.tipo, coalesce(a.cierra, a.abre, now())::date, a.peso, v_max, 'Actividad en línea')
    returning id into v_ev;
  else
    v_ev := a.evaluacion_id;
    update evaluaciones set titulo = a.titulo, puntaje_max = v_max, peso = a.peso where id = v_ev
      and not exists(select 1 from calificaciones where evaluacion_id = v_ev);
  end if;
  update actividades set estado = 'publicada', evaluacion_id = v_ev,
    token = coalesce(token, lower(_d360_codigo_aleatorio(10))) where id = p_actividad;
  perform d360_log(a.cuenta_id, 'actividad_publicada', 'actividades', p_actividad::text, jsonb_build_object('titulo', a.titulo, 'preguntas', v_n));
  return (select token from actividades where id = p_actividad);
end $$;
revoke execute on function public.d360_actividad_publicar(uuid) from public, anon;
grant execute on function public.d360_actividad_publicar(uuid) to authenticated;

create or replace function public.d360_actividad_cerrar(p_actividad uuid, p_reabrir boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare a actividades;
begin
  select * into a from actividades where id = p_actividad;
  if a.id is null or not d360_puede_grupo(a.cuenta_id, a.grupo_id) then raise exception 'No tienes permiso sobre esta actividad.' using errcode = '42501'; end if;
  if p_reabrir then
    update actividades set estado = 'publicada', cierra = case when cierra is not null and cierra < now() then null else cierra end where id = p_actividad;
  else
    update actividades set estado = 'cerrada' where id = p_actividad;
    update entregas set limite = least(coalesce(limite, now()), now()) where actividad_id = p_actividad and estado = 'en_curso';
    perform _d360_cerrar_vencidas(p_actividad);
  end if;
end $$;
revoke execute on function public.d360_actividad_cerrar(uuid, boolean) from public, anon;
grant execute on function public.d360_actividad_cerrar(uuid, boolean) to authenticated;

-- Lista para el profesor: cada estudiante del grupo con su estado (cierra antes los intentos vencidos)
create or replace function public.d360_actividad_resultados(p_actividad uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a actividades;
begin
  select * into a from actividades where id = p_actividad;
  if a.id is null or not d360_ve_grupo(a.cuenta_id, a.grupo_id) then raise exception 'No tienes permiso sobre esta actividad.' using errcode = '42501'; end if;
  perform _d360_cerrar_vencidas(p_actividad);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'estudiante_id', e.id, 'nombre', trim(e.nombres || ' ' || e.apellidos),
      'acceso', coalesce(ac.activo, false),
      'entrega', (select jsonb_build_object('id', en.id, 'estado', en.estado, 'puntaje', en.puntaje, 'puntaje_max', en.puntaje_max,
                    'pendiente', en.pendiente, 'enviada', en.enviada, 'iniciada', en.iniciada, 'intento', en.intento, 'origen', en.origen)
                  from entregas en where en.actividad_id = p_actividad and en.estudiante_id = e.id
                  order by (en.estado = 'enviada') desc, en.puntaje desc nulls last, en.intento desc limit 1),
      'intentos', (select count(*) from entregas en where en.actividad_id = p_actividad and en.estudiante_id = e.id)
    ) order by e.apellidos, e.nombres)
    from grupo_estudiantes ge join estudiantes e on e.id = ge.estudiante_id
    left join estudiantes_acceso ac on ac.estudiante_id = e.id
    where ge.grupo_id = a.grupo_id and ge.estado = 'activo' and d360_ve_estudiante(a.cuenta_id, e.id)), '[]'::jsonb);
end $$;
revoke execute on function public.d360_actividad_resultados(uuid) from public, anon;
grant execute on function public.d360_actividad_resultados(uuid) to authenticated;

create or replace function public.d360_entrega_revisar(p_entrega uuid, p_puntos jsonb, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e entregas; a actividades; k text; v numeric; q preguntas; limpio jsonb := '{}'::jsonb;
begin
  select * into e from entregas where id = p_entrega;
  select * into a from actividades where id = e.actividad_id;
  if a.id is null or not d360_puede_grupo(a.cuenta_id, a.grupo_id) then raise exception 'No tienes permiso para revisar esta entrega.' using errcode = '42501'; end if;
  if e.estado <> 'enviada' then raise exception 'La entrega todavía no se ha enviado.'; end if;
  for k, v in select key, (value #>> '{}')::numeric from jsonb_each(coalesce(p_puntos, '{}'::jsonb)) loop
    select * into q from preguntas where id = k::uuid and actividad_id = a.id;
    if q.id is null or q.tipo <> 'desarrollo' then continue; end if;
    if v < 0 or v > q.puntos then raise exception 'Los puntos de una pregunta van de 0 a %.', q.puntos; end if;
    limpio := limpio || jsonb_build_object(k, v);
  end loop;
  update entregas set puntos_manual = puntos_manual || limpio, comentario = nullif(trim(coalesce(p_comentario, comentario, '')), '') where id = p_entrega;
  perform _d360_calificar(p_entrega);
  perform _d360_volcar_nota(a.id, e.estudiante_id);
  perform d360_log(a.cuenta_id, 'entrega_revisada', 'entregas', p_entrega::text, jsonb_build_object('puntos', limpio));
  select * into e from entregas where id = p_entrega;
  return jsonb_build_object('puntaje', e.puntaje, 'puntaje_max', e.puntaje_max, 'pendiente', e.pendiente);
end $$;
revoke execute on function public.d360_entrega_revisar(uuid, jsonb, text) from public, anon;
grant execute on function public.d360_entrega_revisar(uuid, jsonb, text) to authenticated;

-- ---------- 7. Estudiante (sin sesión de Auth): ver, entrar, guardar, enviar ----------
create or replace function public._d360_ip()
returns text language sql stable as $$
  select coalesce(nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), ''), 'sin-ip');
$$;

-- Estado público de una actividad (sin preguntas ni respuestas)
create or replace function public.d360_alumno_ver(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a actividades; c cuentas; g grupos; n int; v_estado text;
begin
  select * into a from actividades where token = lower(trim(coalesce(p_token, ''))) and estado <> 'borrador';
  if a.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  select * into c from cuentas where id = a.cuenta_id;
  select * into g from grupos where id = a.grupo_id;
  select count(*) into n from preguntas where actividad_id = a.id;
  v_estado := case when not d360_tiene_funcion(a.cuenta_id, 'portal_estudiantes') then 'no_disponible'
                   when a.estado = 'cerrada' or (a.cierra is not null and a.cierra < now()) then 'cerrada'
                   when a.abre is not null and a.abre > now() then 'pronto'
                   when not d360_cuenta_operativa(a.cuenta_id) then 'cuenta_inactiva'
                   else 'abierta' end;
  return jsonb_build_object('ok', true, 'estado', v_estado, 'titulo', a.titulo, 'tipo', a.tipo, 'instrucciones', a.instrucciones,
    'institucion', c.nombre, 'grupo', g.nombre, 'abre', a.abre, 'cierra', a.cierra, 'duracion_min', a.duracion_min,
    'intentos', a.intentos, 'preguntas', n, 'puntaje_max', (select sum(puntos) from preguntas where actividad_id = a.id));
end $$;

-- Preguntas para el estudiante: SIN la respuesta correcta
create or replace function public._d360_preguntas_alumno(p_actividad uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'tipo', tipo, 'enunciado', enunciado,
    'opciones', case when tipo = 'opcion' then opciones else '[]'::jsonb end, 'puntos', puntos) order by orden, id), '[]'::jsonb)
  from preguntas where actividad_id = p_actividad;
$$;
revoke all on function public._d360_preguntas_alumno(uuid) from public, anon, authenticated;

create or replace function public._d360_resultado_alumno(e entregas, a actividades)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('estado', 'enviada', 'enviada', e.enviada, 'pendiente', e.pendiente,
    'puntaje', case when a.mostrar_nota then e.puntaje end, 'puntaje_max', case when a.mostrar_nota then e.puntaje_max end,
    'mostrar_nota', a.mostrar_nota, 'intento', e.intento, 'intentos', a.intentos,
    'quedan', greatest(a.intentos - (select count(*) from entregas x where x.actividad_id = a.id and x.estudiante_id = e.estudiante_id)::int, 0));
$$;
revoke all on function public._d360_resultado_alumno(entregas, actividades) from public, anon, authenticated;

create or replace function public.d360_alumno_entrar(p_token text, p_codigo text, p_nuevo_intento boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a actividades; v_pin text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g'); v_ip text := _d360_ip();
        v_clave text; v_glob text; v_min int; v_int acceso_intentos; v_est uuid; v_nom text; e entregas; v_ses text; v_n int; v_lim timestamptz;
begin
  select * into a from actividades where token = lower(trim(coalesce(p_token, ''))) and estado <> 'borrador';
  if a.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if v_pin !~ '^\d{6}$' then return jsonb_build_object('ok', false, 'motivo', 'formato'); end if;
  if not d360_tiene_funcion(a.cuenta_id, 'portal_estudiantes') then return jsonb_build_object('ok', false, 'motivo', 'no_disponible'); end if;
  v_clave := 'alumno|' || v_ip || '|' || a.id; v_glob := 'alumno|*|' || a.id;
  v_min := coalesce(_d360_registro_bloqueado(v_clave), _d360_registro_bloqueado(v_glob));
  if v_min is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', v_min); end if;

  select ac.estudiante_id into v_est from estudiantes_acceso ac
   where ac.cuenta_id = a.cuenta_id and ac.activo and ac.codigo_hash = _d360_hash_codigo(a.cuenta_id, 'e:' || v_pin);
  if v_est is null or not exists(select 1 from grupo_estudiantes where grupo_id = a.grupo_id and estudiante_id = v_est and estado = 'activo') then
    v_int := _d360_registro_fallo(v_clave);
    -- contador global de la actividad: 60 fallos en una hora la bloquean 15 min (ataques desde muchas IP)
    insert into acceso_intentos(clave, fallos, actualizado) values (v_glob, 1, now())
    on conflict (clave) do update set
      fallos = case when acceso_intentos.actualizado < now() - interval '1 hour' then 1 else acceso_intentos.fallos + 1 end,
      bloqueado_hasta = case when acceso_intentos.fallos + 1 >= 60 and acceso_intentos.actualizado >= now() - interval '1 hour'
                             then now() + interval '15 minutes' else acceso_intentos.bloqueado_hasta end,
      actualizado = now();
    if v_int.bloqueado_hasta is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', 15); end if;
    return jsonb_build_object('ok', false, 'motivo', case when v_est is null then 'codigo' else 'otro_grupo' end);
  end if;
  delete from acceso_intentos where clave = v_clave;
  select trim(nombres) into v_nom from estudiantes where id = v_est;
  update estudiantes_acceso set ultimo_acceso = now() where estudiante_id = v_est;
  perform _d360_cerrar_vencidas(a.id);

  -- ¿Tiene un intento en curso? Se retoma (nueva sesión: la anterior deja de valer)
  select * into e from entregas where actividad_id = a.id and estudiante_id = v_est and estado = 'en_curso' order by intento desc limit 1;
  if e.id is null then
    select count(*) into v_n from entregas where actividad_id = a.id and estudiante_id = v_est;
    if v_n > 0 and (not p_nuevo_intento or v_n >= a.intentos
                    or a.estado = 'cerrada' or (a.cierra is not null and a.cierra < now())) then
      select * into e from entregas where actividad_id = a.id and estudiante_id = v_est order by intento desc limit 1;
      return jsonb_build_object('ok', true, 'nombre', v_nom, 'resultado', _d360_resultado_alumno(e, a));
    end if;
    if a.estado = 'cerrada' or (a.cierra is not null and a.cierra < now()) then return jsonb_build_object('ok', false, 'motivo', 'cerrada'); end if;
    if a.abre is not null and a.abre > now() then return jsonb_build_object('ok', false, 'motivo', 'pronto', 'abre', a.abre); end if;
    if not d360_cuenta_operativa(a.cuenta_id) then return jsonb_build_object('ok', false, 'motivo', 'cuenta_inactiva'); end if;
    v_lim := case when a.duracion_min is not null then now() + make_interval(mins => a.duracion_min) end;
    if a.cierra is not null then v_lim := least(coalesce(v_lim, a.cierra), a.cierra); end if;
    insert into entregas(cuenta_id, actividad_id, estudiante_id, intento, limite, origen)
    values (a.cuenta_id, a.id, v_est, v_n + 1, v_lim, v_ip) returning * into e;
  end if;
  v_ses := encode(extensions.gen_random_bytes(24), 'hex');
  update entregas set sesion_hash = _d360_hash_sesion(v_ses) where id = e.id;
  return jsonb_build_object('ok', true, 'nombre', v_nom, 'sesion', v_ses, 'intento', e.intento, 'intentos', a.intentos,
    'limite', e.limite, 'ahora', now(), 'respuestas', e.respuestas, 'preguntas', _d360_preguntas_alumno(a.id),
    'titulo', a.titulo, 'instrucciones', a.instrucciones);
end $$;

create or replace function public._d360_entrega_por_sesion(p_sesion text)
returns entregas language sql stable security definer set search_path = public as $$
  select * from entregas where sesion_hash = _d360_hash_sesion(p_sesion) and length(coalesce(p_sesion, '')) = 48 limit 1;
$$;
revoke all on function public._d360_entrega_por_sesion(text) from public, anon, authenticated;

-- Solo se guardan respuestas a preguntas de esa actividad, con el tipo correcto
create or replace function public._d360_limpiar_respuestas(p_actividad uuid, p_resp jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q preguntas; r jsonb; res jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_resp) is distinct from 'object' then return res; end if;
  for q in select * from preguntas where actividad_id = p_actividad loop
    r := p_resp -> q.id::text;
    if r is null or jsonb_typeof(r) = 'null' then continue; end if;
    if q.tipo = 'opcion' and jsonb_typeof(r) = 'number' then res := res || jsonb_build_object(q.id::text, r);
    elsif q.tipo = 'vf' and jsonb_typeof(r) = 'boolean' then res := res || jsonb_build_object(q.id::text, r);
    elsif q.tipo in ('corta','desarrollo') and jsonb_typeof(r) = 'string' then
      res := res || jsonb_build_object(q.id::text, left(r #>> '{}', case when q.tipo = 'corta' then 300 else 8000 end));
    end if;
  end loop;
  return res;
end $$;
revoke all on function public._d360_limpiar_respuestas(uuid, jsonb) from public, anon, authenticated;

create or replace function public.d360_alumno_guardar(p_sesion text, p_respuestas jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e entregas := _d360_entrega_por_sesion(p_sesion);
begin
  if e.id is null or e.estado <> 'en_curso' then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
  if e.limite is not null and now() > e.limite + interval '1 minute' then return jsonb_build_object('ok', false, 'motivo', 'tiempo'); end if;
  update entregas set respuestas = _d360_limpiar_respuestas(e.actividad_id, p_respuestas) where id = e.id;
  return jsonb_build_object('ok', true, 'guardado', now());
end $$;

create or replace function public.d360_alumno_enviar(p_sesion text, p_respuestas jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e entregas := _d360_entrega_por_sesion(p_sesion); a actividades;
begin
  if e.id is null or e.estado <> 'en_curso' then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
  select * into a from actividades where id = e.actividad_id;
  -- Dentro del tiempo (con 2 minutos de tolerancia por la conexión) se aceptan las últimas respuestas;
  -- fuera de tiempo se califica lo que quedó guardado.
  if e.limite is null or now() <= e.limite + interval '2 minutes' then
    update entregas set respuestas = _d360_limpiar_respuestas(e.actividad_id, p_respuestas) where id = e.id;
  end if;
  update entregas set estado = 'enviada', enviada = least(now(), coalesce(limite + interval '2 minutes', now())), sesion_hash = null where id = e.id;
  perform _d360_calificar(e.id);
  perform _d360_volcar_nota(a.id, e.estudiante_id);
  select * into e from entregas where id = e.id;
  return jsonb_build_object('ok', true, 'resultado', _d360_resultado_alumno(e, a));
end $$;

do $$
declare f text;
begin
  foreach f in array array['d360_alumno_ver(text)', 'd360_alumno_entrar(text, text, boolean)', 'd360_alumno_guardar(text, jsonb)', 'd360_alumno_enviar(text, jsonb)']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
revoke all on function public._d360_ip() from public, anon, authenticated;

-- >>>>>>>>>> 20261112_25_cambio_de_plan.sql
-- =====================================================================
-- DOCENCIA360 · 25 · Subir o bajar de plan sin inconvenientes
-- · El cambio de plan se aplica SIEMPRE en el servidor (trigger), sin
--   importar por dónde se haga: editar suscripción, registrar pago o
--   código de registro pagado.
-- · Nunca se borran datos del cliente:
--   - Portal de estudiantes: se apaga o se enciende con el plan (lo decide
--     d360_tiene_funcion); exámenes, notas y códigos se conservan.
--   - Asistente del profesor (Premium): al bajar queda PAUSADO; al volver
--     a subir se reactiva solo (hasta el cupo del plan).
--   - Si sobran estudiantes con acceso o grupos, se conservan; solo no se
--     pueden agregar más hasta liberar cupo.
-- · Panel de administrador: vista previa de lo que gana o pierde la cuenta
--   antes de confirmar el cambio.
-- =====================================================================
alter table public.miembros add column if not exists pausado_por_plan boolean not null default false;

create or replace function public._d360_aplicar_plan(p_cuenta uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan planes; v_mod text; v_pausados int := 0; v_reactivados int := 0; v_cupo int; v_activos int;
        v_prev text := coalesce(current_setting('d360.mantenimiento', true), '');
begin
  perform set_config('d360.mantenimiento', 'on', true);   -- también en demos; es un ajuste del sistema, no del usuario
  v_plan := d360_plan_de(p_cuenta);
  select modalidad into v_mod from cuentas where id = p_cuenta;
  if v_mod = 'profesor' then
    if not coalesce((v_plan.funciones ->> 'asistentes')::boolean, false) or coalesce(v_plan.max_docentes, 0) = 0 then
      update miembros set activo = false, pausado_por_plan = true where cuenta_id = p_cuenta and rol = 'docente' and activo;
      get diagnostics v_pausados = row_count;
    else
      select count(*) into v_activos from miembros where cuenta_id = p_cuenta and rol = 'docente' and activo;
      v_cupo := greatest(coalesce(v_plan.max_docentes, 1000) - v_activos, 0);
      update miembros set activo = true, pausado_por_plan = false
       where id in (select id from miembros where cuenta_id = p_cuenta and rol = 'docente' and pausado_por_plan order by creado limit v_cupo);
      get diagnostics v_reactivados = row_count;
    end if;
  end if;
  perform set_config('d360.mantenimiento', v_prev, true);   -- se deja como estaba
  return jsonb_build_object('asistentes_pausados', v_pausados, 'asistentes_reactivados', v_reactivados);
end $$;
revoke all on function public._d360_aplicar_plan(uuid) from public, anon, authenticated;

create or replace function public.t_suscripcion_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if new.plan_id is distinct from old.plan_id then
    r := _d360_aplicar_plan(new.cuenta_id);
    insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
    values (new.cuenta_id, auth.uid(), 'plan_cambiado', 'suscripciones', new.cuenta_id::text,
            jsonb_build_object('antes', old.plan_id, 'despues', new.plan_id) || r);
  end if;
  return null;
end $$;
revoke all on function public.t_suscripcion_plan() from public, anon, authenticated;
drop trigger if exists t_plan on public.suscripciones;
create trigger t_plan after update of plan_id on public.suscripciones for each row execute function public.t_suscripcion_plan();

-- Qué cambia para la cuenta si pasa al plan p_plan (solo lectura; para el panel de administrador)
create or replace function public.d360_admin_impacto_plan(p_cuenta uuid, p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c cuentas; a planes; n planes; est int; gr int; acc int; asis int; gana jsonb := '[]'; pierde jsonb := '[]'; avisos jsonb := '[]'; k text;
        nombres jsonb := '{"reportes_pdf":"Informes en PDF","exportar":"Exportar a Excel","asistentes":"Asistente con su propio acceso","portal_estudiantes":"Exámenes y tareas en línea",
                           "finanzas":"Matrículas y cobros","certificados":"Certificados","comunicados":"Comunicados","portal_familias":"Portal de familias","boletines":"Boletines",
                           "sedes":"Varias sedes","tareas":"Tareas","calendario":"Calendario","horarios":"Horarios","auditoria":"Auditoría"}';
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  select * into c from cuentas where id = p_cuenta;
  a := d360_plan_de(p_cuenta);
  select * into n from planes where id = p_plan;
  if c.id is null or n.id is null then raise exception 'Cuenta o plan no encontrado'; end if;
  if n.modalidad <> c.modalidad then raise exception 'Ese plan es de otro tipo de cuenta.'; end if;
  select count(*) into est from estudiantes where cuenta_id = p_cuenta and estado = 'activo';
  select count(*) into gr from grupos where cuenta_id = p_cuenta and estado in ('planificado','activo');
  select count(*) into acc from estudiantes_acceso where cuenta_id = p_cuenta and activo;
  select count(*) into asis from miembros where cuenta_id = p_cuenta and rol = 'docente' and (activo or pausado_por_plan);
  for k in select jsonb_object_keys(coalesce(a.funciones, '{}') || coalesce(n.funciones, '{}')) loop
    if coalesce((n.funciones ->> k)::boolean, false) and not coalesce((a.funciones ->> k)::boolean, false) then gana := gana || to_jsonb(coalesce(nombres ->> k, k)); end if;
    if coalesce((a.funciones ->> k)::boolean, false) and not coalesce((n.funciones ->> k)::boolean, false) then pierde := pierde || to_jsonb(coalesce(nombres ->> k, k)); end if;
  end loop;
  if n.max_estudiantes is not null and est > n.max_estudiantes then
    avisos := avisos || to_jsonb(format('Tiene %s estudiantes activos y el plan permite %s: se conservan todos, pero no podrá agregar más.', est, n.max_estudiantes)); end if;
  if n.max_grupos is not null and gr > n.max_grupos then
    avisos := avisos || to_jsonb(format('Tiene %s grupos activos y el plan permite %s: se conservan, pero no podrá crear más hasta cerrar algunos.', gr, n.max_grupos)); end if;
  if acc > 0 and coalesce(n.max_estudiantes_portal, 0) = 0 then
    avisos := avisos || to_jsonb(format('%s estudiantes con acceso en línea ya no podrán entrar a exámenes. Sus códigos, exámenes y notas se guardan y vuelven a funcionar si sube de plan.', acc));
  elsif coalesce(n.max_estudiantes_portal, 0) > 0 and acc > n.max_estudiantes_portal then
    avisos := avisos || to_jsonb(format('Tiene %s estudiantes con acceso en línea y el plan permite %s: siguen entrando, pero no podrá activar nuevos hasta quitar acceso a %s.', acc, n.max_estudiantes_portal, acc - n.max_estudiantes_portal)); end if;
  if c.modalidad = 'profesor' and asis > 0 and (not coalesce((n.funciones ->> 'asistentes')::boolean, false) or coalesce(n.max_docentes, 0) = 0) then
    avisos := avisos || to_jsonb(format('%s asistente(s) quedarán pausados (sin borrar nada) y se reactivan solos si vuelve a subir de plan.', asis)); end if;
  if c.modalidad = 'profesor' and coalesce((n.funciones ->> 'asistentes')::boolean, false) and coalesce(n.max_docentes, 0) > 0
     and exists(select 1 from miembros where cuenta_id = p_cuenta and pausado_por_plan) then
    avisos := avisos || to_jsonb('El asistente pausado por el plan anterior se reactivará automáticamente.'::text); end if;
  return jsonb_build_object('actual', a.nombre, 'nuevo', n.nombre,
    'direccion', case when n.orden > a.orden then 'sube' when n.orden < a.orden then 'baja' else 'igual' end,
    'precio_actual', a.precio_nio, 'precio_nuevo', n.precio_nio, 'gana', gana, 'pierde', pierde, 'avisos', avisos,
    'uso', jsonb_build_object('estudiantes', est, 'grupos', gr, 'accesos', acc, 'asistentes', asis),
    'limites', jsonb_build_object('estudiantes', n.max_estudiantes, 'grupos', n.max_grupos, 'accesos', n.max_estudiantes_portal, 'asistentes', n.max_docentes));
end $$;
revoke execute on function public.d360_admin_impacto_plan(uuid, text) from public, anon;
grant execute on function public.d360_admin_impacto_plan(uuid, text) to authenticated;

create or replace function public.d360_admin_cambiar_plan(p_cuenta uuid, p_plan text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_imp jsonb;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  v_imp := d360_admin_impacto_plan(p_cuenta, p_plan);
  if not exists(select 1 from planes where id = p_plan and activo) then raise exception 'Ese plan no está activo.'; end if;
  update suscripciones set plan_id = p_plan, actualizado = now() where cuenta_id = p_cuenta;
  return v_imp;
end $$;
revoke execute on function public.d360_admin_cambiar_plan(uuid, text) from public, anon;
grant execute on function public.d360_admin_cambiar_plan(uuid, text) to authenticated;
