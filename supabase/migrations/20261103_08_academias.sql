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
