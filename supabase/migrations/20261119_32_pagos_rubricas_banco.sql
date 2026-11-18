-- =====================================================================
-- DOCENCIA360 · 32 · Control de pagos, rúbricas y banco de preguntas
-- · Control de pagos (Profesional y Premium): mensualidad por grupo,
--   descuento por estudiante, cobros del mes de un toque, pagos con recibo.
--   Usa las mismas tablas y reglas de cobros de las academias (cargos, pagos,
--   recibos numerados, saldos automáticos y recordatorios).
-- · Rúbricas (Profesional y Premium): criterios con niveles y puntos; se usan
--   al calificar en Notas y al revisar entregas en línea. El estudiante ve el
--   detalle en su aula.
-- · Banco de preguntas (Premium): guarda preguntas por tema y reúsalas en
--   cualquier examen o tarea en línea.
-- =====================================================================

-- ---------- 0. Funciones de los planes ----------
update public.planes set funciones = funciones || '{"finanzas": false, "rubricas": false, "banco_preguntas": false}' where id = 'prof_basico';
update public.planes set funciones = funciones || '{"finanzas": true,  "rubricas": true,  "banco_preguntas": false}' where id = 'prof_profesional';
update public.planes set funciones = funciones || '{"finanzas": true,  "rubricas": true,  "banco_preguntas": true}'  where id = 'prof_premium';
update public.planes set funciones = funciones || '{"rubricas": true}' where modalidad in ('academia', 'colegio');

-- ---------- 1. Control de pagos ----------
alter table public.grupos add column if not exists mensualidad numeric(12,2) not null default 0 check (mensualidad >= 0);
alter table public.estudiantes add column if not exists descuento_pct numeric(5,2) not null default 0 check (descuento_pct between 0 and 100);
alter table public.cargos add column if not exists grupo_id uuid references public.grupos(id) on delete set null;
alter table public.cargos add column if not exists periodo text check (periodo is null or periodo ~ '^\d{4}-(0[1-9]|1[0-2])$');
create unique index if not exists cargos_mensualidad_unica on public.cargos(estudiante_id, grupo_id, periodo)
  where periodo is not null and estado <> 'anulado';
drop trigger if exists t_mc on public.cargos;
create trigger t_mc before insert or update on public.cargos for each row
  execute function public.d360_misma_cuenta('estudiante_id:estudiantes','matricula_id:matriculas','grupo_id:grupos');

-- Genera las mensualidades de un mes para los grupos con mensualidad (no duplica)
create or replace function public.d360_cobros_generar(p_cuenta uuid, p_periodo text, p_grupos uuid[] default null, p_dia int default 5)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_anio int; v_mes int; v_vence date; g grupos; n int := 0; v_n int; v_total int := 0;
        v_meses text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
begin
  if not (d360_es_finanzas(p_cuenta) and d360_cuenta_operativa(p_cuenta)) then
    raise exception 'No tienes permiso para generar cobros, o la suscripción no está vigente.' using errcode = '42501';
  end if;
  if not d360_tiene_funcion(p_cuenta, 'finanzas') then
    raise exception 'Tu plan no incluye el control de pagos. Puedes verlo en Mi cuenta → Renovar o cambiar de plan.' using hint = 'limite_plan';
  end if;
  if coalesce(p_periodo, '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Elige el mes.'; end if;
  v_anio := split_part(p_periodo, '-', 1)::int; v_mes := split_part(p_periodo, '-', 2)::int;
  v_vence := make_date(v_anio, v_mes, least(greatest(coalesce(p_dia, 5), 1), extract(day from (make_date(v_anio, v_mes, 1) + interval '1 month - 1 day'))::int));
  for g in select * from grupos where cuenta_id = p_cuenta and estado = 'activo' and mensualidad > 0
           and (p_grupos is null or id = any(p_grupos)) order by nombre loop
    insert into cargos(cuenta_id, estudiante_id, grupo_id, periodo, concepto, tipo, monto, descuento, vence)
    select p_cuenta, e.id, g.id, p_periodo,
           'Mensualidad ' || v_meses[v_mes] || ' ' || v_anio || ' · ' || g.nombre, 'mensualidad',
           g.mensualidad, round(g.mensualidad * e.descuento_pct / 100, 2), v_vence
      from grupo_estudiantes ge join estudiantes e on e.id = ge.estudiante_id and e.estado = 'activo'
     where ge.grupo_id = g.id and ge.estado = 'activo'
    on conflict do nothing;
    get diagnostics v_n = row_count;
    n := n + v_n;
    v_total := v_total + (select count(*) from grupo_estudiantes ge join estudiantes e on e.id = ge.estudiante_id and e.estado = 'activo'
                           where ge.grupo_id = g.id and ge.estado = 'activo')::int;
  end loop;
  perform d360_log(p_cuenta, 'cobros_generados', 'cargos', null, jsonb_build_object('periodo', p_periodo, 'creados', n));
  return jsonb_build_object('creados', n, 'ya_existian', v_total - n);
end $$;
revoke all on function public.d360_cobros_generar(uuid, text, uuid[], int) from public, anon;
grant execute on function public.d360_cobros_generar(uuid, text, uuid[], int) to authenticated;

-- ---------- 2. Rúbricas ----------
create table if not exists public.rubricas (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 2 and 120),
  descripcion text check (length(descripcion) <= 1000),
  criterios   jsonb not null,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid()
);
create index if not exists rubricas_cuenta on public.rubricas(cuenta_id, nombre);
create or replace function public.t_validar_rubrica()
returns trigger language plpgsql set search_path = public as $$
declare c jsonb; n jsonb;
begin
  if jsonb_typeof(new.criterios) <> 'array' or jsonb_array_length(new.criterios) not between 1 and 12 then
    raise exception 'La rúbrica debe tener entre 1 y 12 criterios.' using errcode = 'P0001';
  end if;
  for c in select value from jsonb_array_elements(new.criterios) loop
    if coalesce(length(trim(c ->> 'nombre')), 0) not between 1 and 120 then raise exception 'Cada criterio necesita un nombre.' using errcode = 'P0001'; end if;
    if jsonb_typeof(c -> 'niveles') <> 'array' or jsonb_array_length(c -> 'niveles') not between 2 and 6 then
      raise exception 'Cada criterio necesita entre 2 y 6 niveles.' using errcode = 'P0001';
    end if;
    for n in select value from jsonb_array_elements(c -> 'niveles') loop
      if coalesce(length(trim(n ->> 'nombre')), 0) not between 1 and 60 or jsonb_typeof(n -> 'puntos') <> 'number' or (n ->> 'puntos')::numeric < 0 or (n ->> 'puntos')::numeric > 100 then
        raise exception 'Cada nivel necesita un nombre y puntos entre 0 y 100.' using errcode = 'P0001';
      end if;
    end loop;
  end loop;
  return new;
end $$;
create trigger t_val before insert or update on public.rubricas for each row execute function public.t_validar_rubrica();
create trigger t_ci before update on public.rubricas for each row execute function public.d360_cuenta_inmutable();
alter table public.rubricas enable row level security;
revoke all on public.rubricas from anon;
create policy leer on public.rubricas for select to authenticated using (public.d360_es_personal(cuenta_id));
create policy escribir on public.rubricas for all to authenticated
  using (public.d360_es_personal(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'rubricas'))
  with check (public.d360_es_personal(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'rubricas'));

alter table public.evaluaciones add column if not exists rubrica_id uuid references public.rubricas(id) on delete set null;
alter table public.calificaciones add column if not exists rubrica_detalle jsonb;
alter table public.actividades add column if not exists rubrica_id uuid references public.rubricas(id) on delete set null;
alter table public.entregas add column if not exists rubrica_detalle jsonb;
drop trigger if exists t_mc on public.evaluaciones;
create trigger t_mc before insert or update on public.evaluaciones for each row
  execute function public.d360_misma_cuenta('grupo_id:grupos','asignatura_id:asignaturas','periodo_id:periodos','rubrica_id:rubricas');
drop trigger if exists t_mc on public.actividades;
create trigger t_mc before insert or update on public.actividades for each row
  execute function public.d360_misma_cuenta('grupo_id:grupos','evaluacion_id:evaluaciones','rubrica_id:rubricas');

-- Revisión de entregas en línea: puede guardar el detalle de la rúbrica del archivo
drop function if exists public.d360_entrega_revisar(uuid, jsonb, text);
create or replace function public.d360_entrega_revisar(p_entrega uuid, p_puntos jsonb, p_comentario text default null, p_rubrica jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e entregas; a actividades; k text; v numeric; q preguntas; limpio jsonb := '{}'::jsonb;
begin
  select * into e from entregas where id = p_entrega;
  select * into a from actividades where id = e.actividad_id;
  if a.id is null or not d360_puede_grupo(a.cuenta_id, a.grupo_id) then raise exception 'No tienes permiso para revisar esta entrega.' using errcode = '42501'; end if;
  if e.estado <> 'enviada' then raise exception 'La entrega todavía no se ha enviado.'; end if;
  for k, v in select key, (value #>> '{}')::numeric from jsonb_each(coalesce(p_puntos, '{}'::jsonb)) loop
    if k = 'archivo' then
      if not a.permite_archivos or a.puntos_archivo = 0 then continue; end if;
      if v < 0 or v > a.puntos_archivo then raise exception 'Los puntos del archivo van de 0 a %.', a.puntos_archivo; end if;
      limpio := limpio || jsonb_build_object(k, v);
      continue;
    end if;
    select * into q from preguntas where id = k::uuid and actividad_id = a.id;
    if q.id is null or q.tipo <> 'desarrollo' then continue; end if;
    if v < 0 or v > q.puntos then raise exception 'Los puntos de una pregunta van de 0 a %.', q.puntos; end if;
    limpio := limpio || jsonb_build_object(k, v);
  end loop;
  if p_rubrica is not null and jsonb_typeof(p_rubrica) <> 'array' then raise exception 'Detalle de rúbrica inválido.'; end if;
  update entregas set puntos_manual = puntos_manual || limpio, comentario = nullif(trim(coalesce(p_comentario, comentario, '')), ''),
    rubrica_detalle = coalesce(p_rubrica, rubrica_detalle) where id = p_entrega;
  perform _d360_calificar(p_entrega);
  perform _d360_volcar_nota(a.id, e.estudiante_id);
  perform d360_log(a.cuenta_id, 'entrega_revisada', 'entregas', p_entrega::text, jsonb_build_object('puntos', limpio));
  select * into e from entregas where id = p_entrega;
  return jsonb_build_object('puntaje', e.puntaje, 'puntaje_max', e.puntaje_max, 'pendiente', e.pendiente);
end $$;
revoke execute on function public.d360_entrega_revisar(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.d360_entrega_revisar(uuid, jsonb, text, jsonb) to authenticated;

-- La nota de la entrega pasa a Notas con el detalle de la rúbrica
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
  insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje, entregado, comentario, rubrica_detalle)
  values (a.cuenta_id, a.evaluacion_id, p_estudiante,
          round(case when coalesce(mejor.puntaje_max, 0) = 0 then 0 else mejor.puntaje / mejor.puntaje_max * v_max end, 2), true,
          coalesce(mejor.comentario, 'En línea'), mejor.rubrica_detalle)
  on conflict (evaluacion_id, estudiante_id) do update set puntaje = excluded.puntaje, entregado = true,
    comentario = coalesce(excluded.comentario, calificaciones.comentario), rubrica_detalle = coalesce(excluded.rubrica_detalle, calificaciones.rubrica_detalle), actualizado = now();
end $$;
revoke all on function public._d360_volcar_nota(uuid, uuid) from public, anon, authenticated;

-- ---------- 3. Banco de preguntas ----------
create table if not exists public.banco_preguntas (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  tema       text not null default 'General' check (length(trim(tema)) between 1 and 80),
  tipo       text not null check (tipo in ('opcion','vf','corta','desarrollo')),
  enunciado  text not null check (length(trim(enunciado)) between 1 and 2000),
  opciones   jsonb not null default '[]'::jsonb,
  correcta   jsonb,
  puntos     numeric(6,2) not null default 1 check (puntos > 0 and puntos <= 100),
  usada      int not null default 0,
  creado     timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  check (tipo <> 'opcion' or (jsonb_typeof(opciones) = 'array' and jsonb_array_length(opciones) between 2 and 8
                              and jsonb_typeof(correcta) = 'number' and (correcta)::text::int between 0 and jsonb_array_length(opciones) - 1)),
  check (tipo <> 'vf' or jsonb_typeof(correcta) = 'boolean'),
  check (tipo <> 'corta' or (jsonb_typeof(correcta) = 'array' and jsonb_array_length(correcta) >= 1))
);
create index if not exists banco_cuenta on public.banco_preguntas(cuenta_id, tema);
create trigger t_ci before update on public.banco_preguntas for each row execute function public.d360_cuenta_inmutable();
alter table public.banco_preguntas enable row level security;
revoke all on public.banco_preguntas from anon;
create policy leer on public.banco_preguntas for select to authenticated using (public.d360_es_personal(cuenta_id));
create policy escribir on public.banco_preguntas for all to authenticated
  using (public.d360_es_personal(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'banco_preguntas'))
  with check (public.d360_es_personal(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'banco_preguntas'));

-- Copia preguntas del banco a una actividad (al final, en el orden elegido)
create or replace function public.d360_banco_a_actividad(p_actividad uuid, p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare a actividades; v_orden int; n int := 0; b banco_preguntas; i int;
begin
  select * into a from actividades where id = p_actividad;
  if a.id is null or not d360_puede_grupo(a.cuenta_id, a.grupo_id) then raise exception 'No tienes permiso sobre esta actividad.' using errcode = '42501'; end if;
  if not d360_tiene_funcion(a.cuenta_id, 'banco_preguntas') then raise exception 'Tu plan no incluye el banco de preguntas.' using hint = 'limite_plan'; end if;
  select coalesce(max(orden), -1) + 1 into v_orden from preguntas where actividad_id = p_actividad;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    select * into b from banco_preguntas where id = p_ids[i] and cuenta_id = a.cuenta_id;
    if b.id is null then continue; end if;
    insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, opciones, correcta, puntos)
    values (a.cuenta_id, a.id, v_orden + n, b.tipo, b.enunciado, b.opciones, b.correcta, b.puntos);
    update banco_preguntas set usada = usada + 1 where id = b.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.d360_banco_a_actividad(uuid, uuid[]) from public, anon;
grant execute on function public.d360_banco_a_actividad(uuid, uuid[]) to authenticated;

-- Guarda en el banco las preguntas de una actividad (sin duplicar)
create or replace function public.d360_actividad_a_banco(p_actividad uuid, p_tema text)
returns int language plpgsql security definer set search_path = public as $$
declare a actividades; n int;
begin
  select * into a from actividades where id = p_actividad;
  if a.id is null or not d360_ve_grupo(a.cuenta_id, a.grupo_id) then raise exception 'No tienes permiso sobre esta actividad.' using errcode = '42501'; end if;
  if not (d360_tiene_funcion(a.cuenta_id, 'banco_preguntas') and d360_cuenta_operativa(a.cuenta_id)) then raise exception 'Tu plan no incluye el banco de preguntas.' using hint = 'limite_plan'; end if;
  insert into banco_preguntas(cuenta_id, tema, tipo, enunciado, opciones, correcta, puntos)
  select a.cuenta_id, left(coalesce(nullif(trim(p_tema), ''), a.titulo), 80), p.tipo, p.enunciado, p.opciones, p.correcta, p.puntos
    from preguntas p where p.actividad_id = a.id
     and not exists(select 1 from banco_preguntas b where b.cuenta_id = a.cuenta_id and b.tipo = p.tipo and b.enunciado = p.enunciado);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.d360_actividad_a_banco(uuid, text) from public, anon;
grant execute on function public.d360_actividad_a_banco(uuid, text) to authenticated;

-- ---------- 4. Aula del estudiante: detalle de rúbrica y sus pagos ----------
create or replace function public.d360_aula_inicio(p_sesion text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s alumno_sesiones := _d360_aula_est(p_sesion); c cuentas; v_nom text; v_grupos uuid[];
begin
  if s.id is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
  select * into c from cuentas where id = s.cuenta_id;
  if not d360_tiene_funcion(c.id, 'portal_estudiantes') then return jsonb_build_object('ok', false, 'motivo', 'no_disponible'); end if;
  select trim(nombres || ' ' || apellidos) into v_nom from estudiantes where id = s.estudiante_id;
  select coalesce(array_agg(ge.grupo_id), '{}') into v_grupos from grupo_estudiantes ge join grupos g on g.id = ge.grupo_id
   where ge.estudiante_id = s.estudiante_id and ge.estado = 'activo' and g.estado in ('activo','planificado');
  return jsonb_build_object('ok', true, 'nombre', v_nom, 'institucion', c.nombre, 'cuenta_activa', d360_cuenta_operativa(c.id),
    'grupos', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'nombre', g.nombre) order by g.nombre), '[]') from grupos g where g.id = any(v_grupos)),
    'actividades', (select coalesce(jsonb_agg(x.j order by x.orden, x.fecha desc), '[]'::jsonb) from (
        select jsonb_build_object('token', a.token, 'titulo', a.titulo, 'tipo', a.tipo, 'grupo', g.nombre, 'grupo_id', g.id,
                 'estado', e.estado, 'abre', a.abre, 'cierra', a.cierra, 'duracion_min', a.duracion_min, 'permite_archivos', a.permite_archivos,
                 'entregada', en.id is not null, 'en_curso', exists(select 1 from entregas y where y.actividad_id = a.id and y.estudiante_id = s.estudiante_id and y.estado = 'en_curso'),
                 'puntaje', case when a.mostrar_nota and en.id is not null and not en.pendiente then en.puntaje end,
                 'puntaje_max', case when a.mostrar_nota and en.id is not null then en.puntaje_max end,
                 'pendiente', coalesce(en.pendiente, false), 'comentario', en.comentario) j,
               case e.estado when 'abierta' then case when en.id is null then 0 else 1 end when 'pronto' then 2 else 3 end orden,
               coalesce(a.cierra, a.abre, a.creado) fecha
        from actividades a join grupos g on g.id = a.grupo_id
        cross join lateral (select case when a.estado = 'cerrada' or (a.cierra is not null and a.cierra < now()) then 'cerrada'
                                        when a.abre is not null and a.abre > now() then 'pronto' else 'abierta' end estado) e
        left join lateral (select * from entregas x where x.actividad_id = a.id and x.estudiante_id = s.estudiante_id and x.estado = 'enviada'
                           order by x.puntaje desc nulls last limit 1) en on true
        where a.grupo_id = any(v_grupos) and a.estado <> 'borrador' and a.token is not null limit 100) x),
    'avisos', (select coalesce(jsonb_agg(jsonb_build_object('texto', v.texto, 'creado', v.creado, 'grupo', g.nombre) order by v.creado desc), '[]')
               from (select * from avisos_aula where grupo_id = any(v_grupos) order by creado desc limit 20) v join grupos g on g.id = v.grupo_id),
    'materiales', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'titulo', m.titulo, 'descripcion', m.descripcion, 'url', m.url,
                     'archivo', m.archivo_path is not null, 'archivo_nombre', m.archivo_nombre, 'archivo_tamano', m.archivo_tamano, 'archivo_tipo', m.archivo_tipo,
                     'creado', m.creado, 'grupo', g.nombre) order by m.creado desc), '[]')
                   from (select * from materiales where grupo_id = any(v_grupos) order by creado desc limit 100) m join grupos g on g.id = m.grupo_id),
    'notas', (select coalesce(jsonb_agg(jsonb_build_object('grupo', g.nombre, 'promedio', p.promedio,
                 'evaluaciones', (select coalesce(jsonb_agg(jsonb_build_object('titulo', ev.titulo, 'tipo', ev.tipo, 'fecha', ev.fecha,
                                    'puntaje', ca.puntaje, 'puntaje_max', ev.puntaje_max, 'rubrica', ca.rubrica_detalle) order by ev.fecha desc), '[]')
                                  from evaluaciones ev left join calificaciones ca on ca.evaluacion_id = ev.id and ca.estudiante_id = s.estudiante_id
                                  where ev.grupo_id = g.id and (ev.fecha <= current_date or ca.puntaje is not null))) order by g.nombre), '[]')
              from grupos g left join lateral (select x.promedio from d360_promedios_grupo(g.id) x where x.estudiante_id = s.estudiante_id) p on true
              where g.id = any(v_grupos)),
    'asistencia', (select jsonb_build_object('presentes', count(*) filter (where estado = 'presente'), 'ausentes', count(*) filter (where estado = 'ausente'),
                     'tardes', count(*) filter (where estado = 'tarde'), 'justificados', count(*) filter (where estado = 'justificado'), 'total', count(*),
                     'porcentaje', round(100.0 * count(*) filter (where estado <> 'ausente') / nullif(count(*), 0), 1),
                     'recientes', (select coalesce(jsonb_agg(jsonb_build_object('fecha', y.fecha, 'estado', y.estado, 'grupo', gg.nombre) order by y.fecha desc), '[]')
                                   from (select * from asistencias where estudiante_id = s.estudiante_id and estado <> 'presente' order by fecha desc limit 10) y
                                   join grupos gg on gg.id = y.grupo_id))
                   from asistencias where estudiante_id = s.estudiante_id and fecha >= current_date - 180),
    'cobros', case when d360_tiene_funcion(c.id, 'finanzas') then
      (select coalesce(jsonb_agg(jsonb_build_object('concepto', g.concepto, 'monto', g.monto - g.descuento, 'pagado', g.pagado, 'vence', g.vence, 'estado', g.estado) order by g.vence desc), '[]')
         from (select * from cargos where estudiante_id = s.estudiante_id and estado <> 'anulado' order by vence desc limit 12) g) end);
end $$;

revoke all on function public.d360_aula_inicio(text) from public;
grant execute on function public.d360_aula_inicio(text) to anon, authenticated;

-- ---------- 5. Nombres legibles en la vista previa del cambio de plan ----------
create or replace function public.d360_admin_impacto_plan(p_cuenta uuid, p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c cuentas; a planes; n planes; est int; gr int; acc int; asis int; gana jsonb := '[]'; pierde jsonb := '[]'; avisos jsonb := '[]'; k text;
        nombres jsonb := '{"reportes_pdf":"Informes en PDF","exportar":"Exportar a Excel","asistentes":"Asistente con su propio acceso","portal_estudiantes":"Exámenes y tareas en línea","reporte_whatsapp":"Reporte a padres por WhatsApp",
                           "finanzas":"Control de pagos y cobros","rubricas":"Rúbricas","banco_preguntas":"Banco de preguntas","certificados":"Certificados","comunicados":"Comunicados","portal_familias":"Portal de familias","boletines":"Boletines",
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
