-- =====================================================================
-- DOCENCIA360 · 03 · Integridad entre cuentas, límites de plan y RLS
-- de las tablas académicas y operativas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Integridad: toda referencia debe apuntar a la MISMA cuenta.
--    Evita que alguien inserte una fila en su cuenta apuntando a un
--    estudiante/grupo de otra cuenta (ataque por IDs ajenos).
--    Uso: trigger con argumentos 'columna:tabla', ...
-- ---------------------------------------------------------------------
create or replace function public.d360_misma_cuenta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  par text; col text; tabla text; v_id uuid; v_cuenta uuid;
begin
  foreach par in array tg_argv loop
    col   := split_part(par, ':', 1);
    tabla := split_part(par, ':', 2);
    execute format('select ($1).%I', col) using new into v_id;
    if v_id is not null then
      execute format('select cuenta_id from public.%I where id = $1', tabla) using v_id into v_cuenta;
      if v_cuenta is distinct from new.cuenta_id then
        raise exception 'Referencia inválida: % no pertenece a esta cuenta', col using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end $$;

create trigger t_mc before insert or update on public.grados            for each row execute function public.d360_misma_cuenta('nivel_id:niveles');
create trigger t_mc before insert or update on public.asignaturas       for each row execute function public.d360_misma_cuenta('grado_id:grados');
create trigger t_mc before insert or update on public.cursos            for each row execute function public.d360_misma_cuenta('asignatura_id:asignaturas');
create trigger t_mc before insert or update on public.grupos            for each row execute function public.d360_misma_cuenta('curso_id:cursos','asignatura_id:asignaturas','grado_id:grados','aula_id:aulas');
create trigger t_mc before insert or update on public.grupo_docentes    for each row execute function public.d360_misma_cuenta('grupo_id:grupos','miembro_id:miembros','asignatura_id:asignaturas');
create trigger t_mc before insert or update on public.grupo_estudiantes for each row execute function public.d360_misma_cuenta('grupo_id:grupos','estudiante_id:estudiantes');
create trigger t_mc before insert or update on public.horarios          for each row execute function public.d360_misma_cuenta('grupo_id:grupos','asignatura_id:asignaturas','miembro_id:miembros','aula_id:aulas');
create trigger t_mc before insert or update on public.asistencias       for each row execute function public.d360_misma_cuenta('grupo_id:grupos','estudiante_id:estudiantes');
create trigger t_mc before insert or update on public.asistencia_docentes for each row execute function public.d360_misma_cuenta('miembro_id:miembros');
create trigger t_mc before insert or update on public.evaluaciones      for each row execute function public.d360_misma_cuenta('grupo_id:grupos','asignatura_id:asignaturas','periodo_id:periodos');
create trigger t_mc before insert or update on public.calificaciones    for each row execute function public.d360_misma_cuenta('evaluacion_id:evaluaciones','estudiante_id:estudiantes');
create trigger t_mc before insert or update on public.eventos           for each row execute function public.d360_misma_cuenta('grupo_id:grupos');
create trigger t_mc before insert or update on public.observaciones     for each row execute function public.d360_misma_cuenta('estudiante_id:estudiantes');
create trigger t_mc before insert or update on public.matriculas        for each row execute function public.d360_misma_cuenta('estudiante_id:estudiantes','curso_id:cursos','grupo_id:grupos');
create trigger t_mc before insert or update on public.cargos            for each row execute function public.d360_misma_cuenta('estudiante_id:estudiantes','matricula_id:matriculas');
create trigger t_mc before insert or update on public.pagos             for each row execute function public.d360_misma_cuenta('estudiante_id:estudiantes','cargo_id:cargos');
create trigger t_mc before insert or update on public.certificados      for each row execute function public.d360_misma_cuenta('estudiante_id:estudiantes','curso_id:cursos');
create trigger t_mc before insert or update on public.tutores_estudiantes for each row execute function public.d360_misma_cuenta('miembro_id:miembros','estudiante_id:estudiantes');
create trigger t_mc before insert or update on public.comunicados       for each row execute function public.d360_misma_cuenta('grupo_id:grupos');

-- cuenta_id no se puede cambiar de una fila existente
create or replace function public.d360_cuenta_inmutable()
returns trigger language plpgsql as $$
begin
  if new.cuenta_id is distinct from old.cuenta_id then
    raise exception 'No se puede mover un registro a otra cuenta' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['periodos','niveles','grados','aulas','asignaturas','cursos','grupos','grupo_docentes',
    'estudiantes','grupo_estudiantes','horarios','asistencias','asistencia_docentes','evaluaciones','calificaciones',
    'eventos','observaciones','matriculas','cargos','pagos','certificados','tutores_estudiantes','comunicados',
    'notificaciones','miembros']
  loop
    execute format('create trigger t_ci before update on public.%I for each row execute function public.d360_cuenta_inmutable()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Límites del plan (validados en el servidor)
-- ---------------------------------------------------------------------
create or replace function public.d360_validar_limite(p_cuenta uuid, p_recurso text)
returns void language plpgsql security definer set search_path = public as $$
declare v_plan planes; v_max int; v_actual int; v_txt text;
begin
  select p.* into v_plan from suscripciones s join planes p on p.id = s.plan_id where s.cuenta_id = p_cuenta;
  if v_plan.id is null then raise exception 'La cuenta no tiene un plan asignado'; end if;
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
    v_txt := 'docentes';
  elsif p_recurso = 'admins' then
    v_max := v_plan.max_admins;
    select count(*) into v_actual from miembros where cuenta_id = p_cuenta and activo
      and rol in ('director','subdirector','coordinador','administrativo','finanzas');
    v_txt := 'usuarios administrativos';
  else
    return;
  end if;
  if v_max is not null and v_actual >= v_max then
    raise exception 'Tu plan % permite hasta % %. Cambia de plan para agregar más.', v_plan.nombre, v_max, v_txt
      using errcode = 'P0001', hint = 'limite_plan';
  end if;
end $$;

create or replace function public.t_limite_estudiantes()
returns trigger language plpgsql as $$
begin
  if new.estado = 'activo' and (tg_op = 'INSERT' or old.estado <> 'activo') then
    perform public.d360_validar_limite(new.cuenta_id, 'estudiantes');
  end if;
  new.actualizado := now();
  return new;
end $$;
create trigger t_lim before insert or update on public.estudiantes for each row execute function public.t_limite_estudiantes();

create or replace function public.t_limite_grupos()
returns trigger language plpgsql as $$
begin
  if new.estado in ('planificado','activo') and (tg_op = 'INSERT' or old.estado not in ('planificado','activo')) then
    perform public.d360_validar_limite(new.cuenta_id, 'grupos');
  end if;
  return new;
end $$;
create trigger t_lim before insert or update on public.grupos for each row execute function public.t_limite_grupos();

create or replace function public.t_cupo_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cupo int; v_n int;
begin
  if new.estado = 'activo' then
    select cupo into v_cupo from grupos where id = new.grupo_id;
    if v_cupo is not null then
      select count(*) into v_n from grupo_estudiantes
       where grupo_id = new.grupo_id and estado = 'activo' and estudiante_id <> new.estudiante_id;
      if v_n >= v_cupo then
        raise exception 'El grupo ya está lleno (cupo de %).', v_cupo using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger t_cupo before insert or update on public.grupo_estudiantes for each row execute function public.t_cupo_grupo();

-- Conflictos de horario: mismo docente, misma aula o mismo grupo a la vez
create or replace function public.t_conflicto_horario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select case
    when h.grupo_id = new.grupo_id then 'el grupo ya tiene clase'
    when h.miembro_id = new.miembro_id then 'el docente ya tiene clase'
    else 'el aula ya está ocupada' end
  into v
  from horarios h
  where h.cuenta_id = new.cuenta_id and h.dia = new.dia and h.id <> new.id
    and h.hora_inicio < new.hora_fin and new.hora_inicio < h.hora_fin
    and (h.grupo_id = new.grupo_id
         or (new.miembro_id is not null and h.miembro_id = new.miembro_id)
         or (new.aula_id is not null and h.aula_id = new.aula_id))
  limit 1;
  if v is not null then
    raise exception 'Choque de horario: % en ese momento.', v using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger t_conf before insert or update on public.horarios for each row execute function public.t_conflicto_horario();

-- ---------------------------------------------------------------------
-- 3. Finanzas: número de recibo correlativo y saldo del cargo
-- ---------------------------------------------------------------------
create or replace function public.t_recibo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('recibo' || new.cuenta_id::text));
  select coalesce(max(recibo), 0) + 1 into new.recibo from pagos where cuenta_id = new.cuenta_id;
  return new;
end $$;
create trigger t_recibo before insert on public.pagos for each row execute function public.t_recibo();

create or replace function public.t_saldo_cargo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cargo uuid := coalesce(new.cargo_id, old.cargo_id); v_pag numeric; v_total numeric; v_estado text;
begin
  if v_cargo is null then return null; end if;
  select coalesce(sum(monto), 0) into v_pag from pagos where cargo_id = v_cargo and not anulado;
  select monto - descuento, estado into v_total, v_estado from cargos where id = v_cargo;
  if v_estado = 'anulado' then return null; end if;
  update cargos set pagado = v_pag,
    estado = case when v_pag <= 0 then 'pendiente' when v_pag >= v_total then 'pagado' else 'parcial' end
  where id = v_cargo;
  return null;
end $$;
create trigger t_saldo after insert or update or delete on public.pagos for each row execute function public.t_saldo_cargo();

-- ---------------------------------------------------------------------
-- 4. Helpers de RLS académica
-- ---------------------------------------------------------------------
create or replace function public.d360_docente_de_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from grupo_docentes gd
    join miembros m on m.id = gd.miembro_id
    where gd.grupo_id = p_grupo and m.user_id = auth.uid() and m.activo);
$$;

create or replace function public.d360_puede_grupo(p_cuenta uuid, p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.d360_cuenta_operativa(p_cuenta)
     and (public.d360_es_gestor(p_cuenta) or public.d360_docente_de_grupo(p_grupo));
$$;

create or replace function public.d360_grupo_de_evaluacion(p_eval uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select grupo_id from evaluaciones where id = p_eval;
$$;

create or replace function public.d360_es_tutor_de(p_estudiante uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from tutores_estudiantes te join miembros m on m.id = te.miembro_id
    where te.estudiante_id = p_estudiante and m.user_id = auth.uid() and m.activo);
$$;

create or replace function public.d360_tutor_en_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from grupo_estudiantes ge
    join tutores_estudiantes te on te.estudiante_id = ge.estudiante_id
    join miembros m on m.id = te.miembro_id
    where ge.grupo_id = p_grupo and m.user_id = auth.uid() and m.activo);
$$;

create or replace function public.d360_gestor_operativo(p_cuenta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.d360_es_gestor(p_cuenta) and public.d360_cuenta_operativa(p_cuenta);
$$;

-- ---------------------------------------------------------------------
-- 5. Políticas
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  -- Estructura: el personal lee, el gestor escribe (si la cuenta está al día)
  foreach t in array array['periodos','niveles','grados','aulas','asignaturas','cursos','grupo_docentes','horarios']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy leer on public.%I for select to authenticated
      using (public.d360_es_personal(cuenta_id) or public.d360_es_plataforma_admin())$p$, t);
    execute format($p$create policy escribir on public.%I for all to authenticated
      using (public.d360_gestor_operativo(cuenta_id)) with check (public.d360_gestor_operativo(cuenta_id))$p$, t);
  end loop;
end $$;

-- Los padres también ven periodos y asignaturas (para boletines)
create policy tutor_leer on public.periodos    for select to authenticated using (public.d360_mi_rol(cuenta_id) = 'tutor');
create policy tutor_leer on public.asignaturas for select to authenticated using (public.d360_mi_rol(cuenta_id) = 'tutor');

alter table public.grupos enable row level security;
create policy leer on public.grupos for select to authenticated
  using (public.d360_es_personal(cuenta_id) or public.d360_tutor_en_grupo(id) or public.d360_es_plataforma_admin());
create policy escribir on public.grupos for all to authenticated
  using (public.d360_gestor_operativo(cuenta_id)) with check (public.d360_gestor_operativo(cuenta_id));

alter table public.estudiantes enable row level security;
create policy leer on public.estudiantes for select to authenticated
  using (public.d360_es_personal(cuenta_id) or public.d360_es_tutor_de(id) or public.d360_es_plataforma_admin());
create policy escribir on public.estudiantes for all to authenticated
  using (public.d360_gestor_operativo(cuenta_id)) with check (public.d360_gestor_operativo(cuenta_id));

alter table public.grupo_estudiantes enable row level security;
create policy leer on public.grupo_estudiantes for select to authenticated
  using (public.d360_es_personal(cuenta_id) or public.d360_es_tutor_de(estudiante_id));
create policy escribir on public.grupo_estudiantes for all to authenticated
  using (public.d360_gestor_operativo(cuenta_id)) with check (public.d360_gestor_operativo(cuenta_id));

alter table public.asistencias enable row level security;
create policy leer on public.asistencias for select to authenticated
  using (public.d360_es_personal(cuenta_id) or public.d360_es_tutor_de(estudiante_id));
create policy escribir on public.asistencias for all to authenticated
  using (public.d360_puede_grupo(cuenta_id, grupo_id)) with check (public.d360_puede_grupo(cuenta_id, grupo_id));

alter table public.asistencia_docentes enable row level security;
create policy leer on public.asistencia_docentes for select to authenticated
  using (public.d360_es_gestor(cuenta_id) or miembro_id = public.d360_mi_miembro(cuenta_id));
create policy escribir on public.asistencia_docentes for all to authenticated
  using (public.d360_gestor_operativo(cuenta_id)) with check (public.d360_gestor_operativo(cuenta_id));

alter table public.evaluaciones enable row level security;
create policy leer on public.evaluaciones for select to authenticated
  using (public.d360_es_personal(cuenta_id) or public.d360_tutor_en_grupo(grupo_id));
create policy escribir on public.evaluaciones for all to authenticated
  using (public.d360_puede_grupo(cuenta_id, grupo_id)) with check (public.d360_puede_grupo(cuenta_id, grupo_id));

alter table public.calificaciones enable row level security;
create policy leer on public.calificaciones for select to authenticated
  using (public.d360_es_personal(cuenta_id) or public.d360_es_tutor_de(estudiante_id));
create policy escribir on public.calificaciones for all to authenticated
  using (public.d360_puede_grupo(cuenta_id, public.d360_grupo_de_evaluacion(evaluacion_id)))
  with check (public.d360_puede_grupo(cuenta_id, public.d360_grupo_de_evaluacion(evaluacion_id)));

alter table public.eventos enable row level security;
create policy leer on public.eventos for select to authenticated
  using (public.d360_es_personal(cuenta_id)
         or (public.d360_mi_rol(cuenta_id) = 'tutor' and (grupo_id is null or public.d360_tutor_en_grupo(grupo_id))));
create policy escribir on public.eventos for all to authenticated
  using (public.d360_gestor_operativo(cuenta_id) or (grupo_id is not null and public.d360_puede_grupo(cuenta_id, grupo_id)))
  with check (public.d360_gestor_operativo(cuenta_id) or (grupo_id is not null and public.d360_puede_grupo(cuenta_id, grupo_id)));

alter table public.observaciones enable row level security;
create policy leer on public.observaciones for select to authenticated
  using (public.d360_es_personal(cuenta_id));
create policy crear on public.observaciones for insert to authenticated
  with check (public.d360_es_personal(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and autor = auth.uid());
create policy borrar on public.observaciones for delete to authenticated
  using (autor = auth.uid() or public.d360_es_gestor(cuenta_id));

alter table public.matriculas enable row level security;
create policy leer on public.matriculas for select to authenticated
  using (public.d360_es_personal(cuenta_id) or public.d360_es_tutor_de(estudiante_id));
create policy escribir on public.matriculas for all to authenticated
  using ((public.d360_es_gestor(cuenta_id) or public.d360_es_finanzas(cuenta_id)) and public.d360_cuenta_operativa(cuenta_id))
  with check ((public.d360_es_gestor(cuenta_id) or public.d360_es_finanzas(cuenta_id)) and public.d360_cuenta_operativa(cuenta_id));

alter table public.cargos enable row level security;
create policy leer on public.cargos for select to authenticated
  using (public.d360_es_finanzas(cuenta_id) or public.d360_es_tutor_de(estudiante_id));
create policy escribir on public.cargos for all to authenticated
  using (public.d360_es_finanzas(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'finanzas'))
  with check (public.d360_es_finanzas(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'finanzas'));

alter table public.pagos enable row level security;
create policy leer on public.pagos for select to authenticated
  using (public.d360_es_finanzas(cuenta_id) or public.d360_es_tutor_de(estudiante_id));
create policy crear on public.pagos for insert to authenticated
  with check (public.d360_es_finanzas(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'finanzas'));
-- Un pago no se borra: se anula (queda rastro)
create policy anular on public.pagos for update to authenticated
  using (public.d360_es_finanzas(cuenta_id)) with check (public.d360_es_finanzas(cuenta_id));

alter table public.certificados enable row level security;
create policy leer on public.certificados for select to authenticated
  using (public.d360_es_personal(cuenta_id) or public.d360_es_tutor_de(estudiante_id));
create policy escribir on public.certificados for all to authenticated
  using (public.d360_gestor_operativo(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'certificados'))
  with check (public.d360_gestor_operativo(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'certificados'));

alter table public.tutores_estudiantes enable row level security;
create policy leer on public.tutores_estudiantes for select to authenticated
  using (public.d360_es_personal(cuenta_id) or miembro_id = public.d360_mi_miembro(cuenta_id));
create policy escribir on public.tutores_estudiantes for all to authenticated
  using (public.d360_gestor_operativo(cuenta_id)) with check (public.d360_gestor_operativo(cuenta_id));

alter table public.comunicados enable row level security;
create policy leer on public.comunicados for select to authenticated
  using (
    (public.d360_es_personal(cuenta_id) and audiencia <> 'tutores')
    or public.d360_es_gestor(cuenta_id)
    or (public.d360_mi_rol(cuenta_id) = 'tutor' and (audiencia in ('todos','tutores')
         or (audiencia = 'grupo' and public.d360_tutor_en_grupo(grupo_id)))));
create policy escribir on public.comunicados for all to authenticated
  using (public.d360_gestor_operativo(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'comunicados'))
  with check (public.d360_gestor_operativo(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'comunicados'));

alter table public.notificaciones enable row level security;
create policy leer on public.notificaciones for select to authenticated
  using ((miembro_id is null and public.d360_es_gestor(cuenta_id)) or miembro_id = public.d360_mi_miembro(cuenta_id));
create policy marcar on public.notificaciones for update to authenticated
  using ((miembro_id is null and public.d360_es_gestor(cuenta_id)) or miembro_id = public.d360_mi_miembro(cuenta_id))
  with check ((miembro_id is null and public.d360_es_gestor(cuenta_id)) or miembro_id = public.d360_mi_miembro(cuenta_id));

-- Auditoría automática de operaciones sensibles
create or replace function public.t_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (r.cuenta_id, auth.uid(), lower(tg_op), tg_table_name, r.id::text,
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
               else to_jsonb(r) end);
  return null;
end $$;
create trigger t_aud after insert or update or delete on public.pagos        for each row execute function public.t_auditar();
create trigger t_aud after insert or update or delete on public.cargos       for each row execute function public.t_auditar();
create trigger t_aud after update or delete           on public.calificaciones for each row execute function public.t_auditar();
create trigger t_aud after delete                     on public.estudiantes  for each row execute function public.t_auditar();
create trigger t_aud after insert or update or delete on public.certificados for each row execute function public.t_auditar();
create trigger t_aud after update or delete           on public.matriculas   for each row execute function public.t_auditar();
