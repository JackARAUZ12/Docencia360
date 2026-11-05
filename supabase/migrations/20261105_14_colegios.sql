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
