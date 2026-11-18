-- =====================================================================
-- DOCENCIA360 · 30 · Aula virtual del estudiante
-- · El estudiante entra con el código del espacio + su código personal y el
--   aparato lo recuerda (sesión propia, 30 días o 12 horas). Sin correo.
-- · En su aula: actividades (exámenes y tareas), entrega de archivos, sus
--   notas y asistencia, materiales y avisos del profesor de SUS grupos.
-- · Archivos en modo ahorro: fotos (se comprimen en el navegador) y PDF,
--   máximo 5 MB cada uno y 5 por entrega. Se suben con URL firmada que
--   entrega la función «aula-archivos» solo tras validar en el servidor.
-- · Todo bajo la función del plan «portal_estudiantes» (Profesional/Premium).
-- =====================================================================

-- ---------- 0. Almacenamiento: 5 MB, fotos y PDF ----------
update storage.buckets set file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id = 'd360';

-- ---------- 1. Tablas ----------
create table if not exists public.alumno_sesiones (
  id            uuid primary key default gen_random_uuid(),
  hash          text not null unique,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  creado        timestamptz not null default now(),
  expira        timestamptz not null,
  ultimo_uso    timestamptz not null default now()
);
create index if not exists alumno_sesiones_est on public.alumno_sesiones(estudiante_id);
alter table public.alumno_sesiones enable row level security;
revoke all on public.alumno_sesiones from anon, authenticated;

alter table public.actividades add column if not exists permite_archivos boolean not null default false;
alter table public.actividades add column if not exists puntos_archivo numeric(6,2) not null default 0 check (puntos_archivo between 0 and 100);

create table if not exists public.entrega_archivos (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  entrega_id uuid not null references public.entregas(id) on delete cascade,
  path       text not null unique,
  nombre     text not null check (length(nombre) between 1 and 160),
  tamano     int not null check (tamano between 1 and 5242880),
  tipo       text not null check (tipo in ('image/jpeg','image/png','image/webp','application/pdf')),
  creado     timestamptz not null default now()
);
create index if not exists entrega_archivos_entrega on public.entrega_archivos(entrega_id);
alter table public.entrega_archivos enable row level security;
revoke all on public.entrega_archivos from anon;
revoke insert, update, delete on public.entrega_archivos from authenticated;
drop policy if exists leer on public.entrega_archivos;
create policy leer on public.entrega_archivos for select to authenticated
  using (exists(select 1 from entregas e join actividades a on a.id = e.actividad_id
                where e.id = entrega_id and public.d360_ve_estudiante(e.cuenta_id, e.estudiante_id) and public.d360_ve_grupo(a.cuenta_id, a.grupo_id)));

create table if not exists public.materiales (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references public.cuentas(id) on delete cascade,
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  titulo         text not null check (length(trim(titulo)) between 2 and 140),
  descripcion    text check (length(descripcion) <= 2000),
  url            text check (url is null or url ~* '^https?://'),
  archivo_path   text,
  archivo_nombre text,
  archivo_tamano int,
  archivo_tipo   text,
  creado         timestamptz not null default now(),
  creado_por     uuid default auth.uid(),
  check (url is not null or archivo_path is not null or descripcion is not null)
);
create index if not exists materiales_grupo on public.materiales(grupo_id, creado desc);
alter table public.materiales enable row level security;
revoke all on public.materiales from anon;
create policy leer on public.materiales for select to authenticated using (public.d360_ve_grupo(cuenta_id, grupo_id));
create policy escribir on public.materiales for all to authenticated
  using (public.d360_puede_grupo(cuenta_id, grupo_id) and public.d360_tiene_funcion(cuenta_id, 'portal_estudiantes'))
  with check (public.d360_puede_grupo(cuenta_id, grupo_id) and public.d360_tiene_funcion(cuenta_id, 'portal_estudiantes')
              and (archivo_path is null or split_part(archivo_path, '/', 1) = cuenta_id::text));
create trigger t_mc before insert or update on public.materiales for each row execute function public.d360_misma_cuenta('grupo_id:grupos');
create trigger t_ci before update on public.materiales for each row execute function public.d360_cuenta_inmutable();

create table if not exists public.avisos_aula (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  texto      text not null check (length(trim(texto)) between 2 and 2000),
  creado     timestamptz not null default now(),
  creado_por uuid default auth.uid()
);
create index if not exists avisos_aula_grupo on public.avisos_aula(grupo_id, creado desc);
alter table public.avisos_aula enable row level security;
revoke all on public.avisos_aula from anon;
create policy leer on public.avisos_aula for select to authenticated using (public.d360_ve_grupo(cuenta_id, grupo_id));
create policy escribir on public.avisos_aula for all to authenticated
  using (public.d360_puede_grupo(cuenta_id, grupo_id) and public.d360_tiene_funcion(cuenta_id, 'portal_estudiantes'))
  with check (public.d360_puede_grupo(cuenta_id, grupo_id) and public.d360_tiene_funcion(cuenta_id, 'portal_estudiantes'));
create trigger t_mc before insert or update on public.avisos_aula for each row execute function public.d360_misma_cuenta('grupo_id:grupos');
create trigger t_ci before update on public.avisos_aula for each row execute function public.d360_cuenta_inmutable();

-- ---------- 2. Calificación: puntos por el archivo entregado ----------
create or replace function public._d360_calificar(p_entrega uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e entregas; a actividades; q preguntas; r jsonb; auto jsonb := '{}'::jsonb; total numeric := 0; maxp numeric := 0; pend boolean := false; pts numeric; acept jsonb; ok boolean;
begin
  select * into e from entregas where id = p_entrega for update;
  select * into a from actividades where id = e.actividad_id;
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
          if (acept #>> '{}') ~ '^\s*-?\d+([.,]\d+)?\s*$' and (r #>> '{}') ~ '^\s*-?\d+([.,]\d+)?\s*$'
             and replace(trim(acept #>> '{}'), ',', '.')::numeric = replace(trim(r #>> '{}'), ',', '.')::numeric then ok := true; exit; end if;
        end loop;
      end if;
      if ok then pts := q.puntos; end if;
    else
      if e.puntos_manual ? q.id::text then pts := least(greatest(coalesce((e.puntos_manual ->> q.id::text)::numeric, 0), 0), q.puntos);
      elsif r is not null and _d360_norm(r #>> '{}') <> '' then pend := true;
      end if;
      total := total + pts;
      continue;
    end if;
    auto := auto || jsonb_build_object(q.id::text, pts);
    total := total + pts;
  end loop;
  -- Archivo entregado: lo califica el profesor
  if a.permite_archivos and a.puntos_archivo > 0 then
    maxp := maxp + a.puntos_archivo;
    if e.puntos_manual ? 'archivo' then total := total + least(greatest(coalesce((e.puntos_manual ->> 'archivo')::numeric, 0), 0), a.puntos_archivo);
    elsif exists(select 1 from entrega_archivos where entrega_id = e.id) then pend := true;
    end if;
  end if;
  update entregas set puntos_auto = auto, puntaje = round(total, 2), puntaje_max = maxp, pendiente = pend where id = p_entrega;
end $$;
revoke all on function public._d360_calificar(uuid) from public, anon, authenticated;

create or replace function public.d360_actividad_publicar(p_actividad uuid)
returns text language plpgsql security definer set search_path = public as $$
declare a actividades; v_max numeric; v_n int; v_ev uuid;
begin
  select * into a from actividades where id = p_actividad for update;
  if a.id is null or not d360_puede_grupo(a.cuenta_id, a.grupo_id) then raise exception 'No tienes permiso sobre esta actividad.' using errcode = '42501'; end if;
  if not d360_tiene_funcion(a.cuenta_id, 'portal_estudiantes') then raise exception 'Tu plan no incluye tareas y exámenes en línea.' using hint = 'limite_plan'; end if;
  select count(*), coalesce(sum(puntos), 0) into v_n, v_max from preguntas where actividad_id = p_actividad;
  if a.permite_archivos then v_max := v_max + a.puntos_archivo; end if;
  if v_n = 0 and not (a.permite_archivos and a.puntos_archivo > 0) then
    raise exception 'Agrega al menos una pregunta, o pide un archivo y dale puntos, antes de publicar.';
  end if;
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

create or replace function public.d360_entrega_revisar(p_entrega uuid, p_puntos jsonb, p_comentario text default null)
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
  update entregas set puntos_manual = puntos_manual || limpio, comentario = nullif(trim(coalesce(p_comentario, comentario, '')), '') where id = p_entrega;
  perform _d360_calificar(p_entrega);
  perform _d360_volcar_nota(a.id, e.estudiante_id);
  perform d360_log(a.cuenta_id, 'entrega_revisada', 'entregas', p_entrega::text, jsonb_build_object('puntos', limpio));
  select * into e from entregas where id = p_entrega;
  return jsonb_build_object('puntaje', e.puntaje, 'puntaje_max', e.puntaje_max, 'pendiente', e.pendiente);
end $$;
revoke execute on function public.d360_entrega_revisar(uuid, jsonb, text) from public, anon;
grant execute on function public.d360_entrega_revisar(uuid, jsonb, text) to authenticated;

-- La página del examen sabe si se piden archivos y cuántos puntos valen
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
    'intentos', a.intentos, 'preguntas', n, 'permite_archivos', a.permite_archivos, 'puntos_archivo', a.puntos_archivo,
    'puntaje_max', coalesce((select sum(puntos) from preguntas where actividad_id = a.id), 0) + case when a.permite_archivos then a.puntos_archivo else 0 end);
end $$;

-- ---------- 3. Sesión del estudiante ----------
create or replace function public._d360_aula_est(p_sesion text)
returns alumno_sesiones language plpgsql volatile security definer set search_path = public as $$
declare s alumno_sesiones;
begin
  if length(coalesce(p_sesion, '')) <> 48 then return null; end if;
  select * into s from alumno_sesiones where hash = _d360_hash_sesion(p_sesion) and expira > now();
  if s.id is null then return null; end if;
  if not exists(select 1 from estudiantes_acceso where estudiante_id = s.estudiante_id and activo)
     or not exists(select 1 from estudiantes where id = s.estudiante_id and estado = 'activo') then
    delete from alumno_sesiones where id = s.id; return null;
  end if;
  if s.ultimo_uso < now() - interval '5 minutes' then update alumno_sesiones set ultimo_uso = now() where id = s.id; end if;
  return s;
end $$;
revoke all on function public._d360_aula_est(text) from public, anon, authenticated;

create or replace function public.d360_aula_entrar(p_espacio text, p_codigo text, p_recordar boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_esp text := upper(regexp_replace(coalesce(p_espacio, ''), '[^A-Za-z0-9]', '', 'g'));
        v_pin text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
        v_clave text := 'alumno|' || _d360_ip() || '|portal'; v_min int; v_int acceso_intentos;
        c cuentas; v_est uuid; v_ses text;
begin
  if v_esp !~ '^[A-Z0-9]{6}$' or v_pin !~ '^\d{6}$' then return jsonb_build_object('ok', false, 'motivo', 'formato'); end if;
  v_min := _d360_registro_bloqueado(v_clave);
  if v_min is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', v_min); end if;
  select * into c from cuentas where codigo = v_esp;
  if c.id is not null then
    select ac.estudiante_id into v_est from estudiantes_acceso ac
      join estudiantes e on e.id = ac.estudiante_id and e.estado = 'activo'
     where ac.cuenta_id = c.id and ac.activo and ac.codigo_hash = _d360_hash_codigo(c.id, 'e:' || v_pin);
  end if;
  if v_est is null then
    v_int := _d360_registro_fallo(v_clave);
    if v_int.bloqueado_hasta is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', 15); end if;
    return jsonb_build_object('ok', false, 'motivo', 'codigo');
  end if;
  delete from acceso_intentos where clave = v_clave;
  if not d360_tiene_funcion(c.id, 'portal_estudiantes') then return jsonb_build_object('ok', false, 'motivo', 'no_disponible'); end if;
  v_ses := encode(extensions.gen_random_bytes(24), 'hex');
  delete from alumno_sesiones where estudiante_id = v_est and (expira < now() or id in
    (select id from alumno_sesiones where estudiante_id = v_est order by ultimo_uso desc offset 9));
  insert into alumno_sesiones(hash, estudiante_id, cuenta_id, expira)
  values (_d360_hash_sesion(v_ses), v_est, c.id, now() + case when coalesce(p_recordar, true) then interval '30 days' else interval '12 hours' end);
  update estudiantes_acceso set ultimo_acceso = now() where estudiante_id = v_est;
  return jsonb_build_object('ok', true, 'sesion', v_ses);
end $$;

create or replace function public.d360_aula_salir(p_sesion text)
returns void language sql volatile security definer set search_path = public as $$
  delete from alumno_sesiones where hash = _d360_hash_sesion(coalesce(p_sesion, ''));
$$;

-- Todo lo del aula en una sola consulta
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
                                    'puntaje', ca.puntaje, 'puntaje_max', ev.puntaje_max) order by ev.fecha desc), '[]')
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
                   from asistencias where estudiante_id = s.estudiante_id and fecha >= current_date - 180));
end $$;

-- Abrir una actividad desde el aula (sin volver a escribir el código)
create or replace function public.d360_aula_actividad(p_sesion text, p_token text, p_nuevo_intento boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s alumno_sesiones := _d360_aula_est(p_sesion); a actividades; v_est uuid; v_nom text; e entregas; v_ses text; v_n int; v_lim timestamptz;
begin
  if s.id is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
  select * into a from actividades where token = lower(trim(coalesce(p_token, ''))) and estado <> 'borrador' and cuenta_id = s.cuenta_id;
  if a.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if not d360_tiene_funcion(a.cuenta_id, 'portal_estudiantes') then return jsonb_build_object('ok', false, 'motivo', 'no_disponible'); end if;
  v_est := s.estudiante_id;
  if not exists(select 1 from grupo_estudiantes where grupo_id = a.grupo_id and estudiante_id = v_est and estado = 'activo') then
    return jsonb_build_object('ok', false, 'motivo', 'otro_grupo');
  end if;
  select trim(nombres) into v_nom from estudiantes where id = v_est;
  perform _d360_cerrar_vencidas(a.id);
  select * into e from entregas where actividad_id = a.id and estudiante_id = v_est and estado = 'en_curso' order by intento desc limit 1;
  if e.id is null then
    select count(*) into v_n from entregas where actividad_id = a.id and estudiante_id = v_est;
    if v_n > 0 and (not p_nuevo_intento or v_n >= a.intentos or a.estado = 'cerrada' or (a.cierra is not null and a.cierra < now())) then
      select * into e from entregas where actividad_id = a.id and estudiante_id = v_est order by intento desc limit 1;
      return jsonb_build_object('ok', true, 'nombre', v_nom, 'resultado', _d360_resultado_alumno(e, a) || jsonb_build_object('comentario', e.comentario));
    end if;
    if a.estado = 'cerrada' or (a.cierra is not null and a.cierra < now()) then return jsonb_build_object('ok', false, 'motivo', 'cerrada'); end if;
    if a.abre is not null and a.abre > now() then return jsonb_build_object('ok', false, 'motivo', 'pronto', 'abre', a.abre); end if;
    if not d360_cuenta_operativa(a.cuenta_id) then return jsonb_build_object('ok', false, 'motivo', 'cuenta_inactiva'); end if;
    v_lim := case when a.duracion_min is not null then now() + make_interval(mins => a.duracion_min) end;
    if a.cierra is not null then v_lim := least(coalesce(v_lim, a.cierra), a.cierra); end if;
    insert into entregas(cuenta_id, actividad_id, estudiante_id, intento, limite, origen)
    values (a.cuenta_id, a.id, v_est, v_n + 1, v_lim, 'aula') returning * into e;
  end if;
  v_ses := encode(extensions.gen_random_bytes(24), 'hex');
  update entregas set sesion_hash = _d360_hash_sesion(v_ses) where id = e.id;
  return jsonb_build_object('ok', true, 'nombre', v_nom, 'sesion', v_ses, 'intento', e.intento, 'intentos', a.intentos,
    'limite', e.limite, 'ahora', now(), 'respuestas', e.respuestas, 'preguntas', _d360_preguntas_alumno(a.id),
    'titulo', a.titulo, 'instrucciones', a.instrucciones, 'permite_archivos', a.permite_archivos,
    'archivos', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'nombre', f.nombre, 'tamano', f.tamano, 'tipo', f.tipo) order by f.creado), '[]')
                 from entrega_archivos f where f.entrega_id = e.id));
end $$;

-- Archivos de la entrega en curso (también para quien entró con enlace + código)
create or replace function public.d360_alumno_archivos(p_sesion text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e entregas := _d360_entrega_por_sesion(p_sesion);
begin
  if e.id is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
  return jsonb_build_object('ok', true, 'archivos', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'nombre', f.nombre, 'tamano', f.tamano, 'tipo', f.tipo) order by f.creado), '[]')
                                                     from entrega_archivos f where f.entrega_id = e.id));
end $$;

do $$
declare f text;
begin
  foreach f in array array['d360_aula_entrar(text, text, boolean)', 'd360_aula_salir(text)', 'd360_aula_inicio(text)',
                           'd360_aula_actividad(text, text, boolean)', 'd360_alumno_archivos(text)']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- ---------- 4. Funciones que solo usa el servidor de archivos (service_role) ----------
-- Reserva el lugar de un archivo de la entrega en curso y devuelve la ruta.
create or replace function public.d360_srv_archivo_subir(p_entrega_sesion text, p_nombre text, p_tamano int, p_tipo text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e entregas := _d360_entrega_por_sesion(p_entrega_sesion); a actividades; v_id uuid := gen_random_uuid(); v_path text; v_ext text;
begin
  if e.id is null or e.estado <> 'en_curso' then return jsonb_build_object('ok', false, 'error', 'Tu sesión del examen terminó. Vuelve a abrirlo.'); end if;
  select * into a from actividades where id = e.actividad_id;
  if not a.permite_archivos then return jsonb_build_object('ok', false, 'error', 'Esta actividad no pide archivos.'); end if;
  if e.limite is not null and now() > e.limite + interval '1 minute' then return jsonb_build_object('ok', false, 'error', 'Se terminó el tiempo.'); end if;
  if p_tipo not in ('image/jpeg','image/png','image/webp','application/pdf') then return jsonb_build_object('ok', false, 'error', 'Solo se aceptan fotos (JPG, PNG) y PDF.'); end if;
  if coalesce(p_tamano, 0) < 1 or p_tamano > 5242880 then return jsonb_build_object('ok', false, 'error', 'Cada archivo puede pesar máximo 5 MB.'); end if;
  if (select count(*) from entrega_archivos where entrega_id = e.id) >= 5 then return jsonb_build_object('ok', false, 'error', 'Puedes subir máximo 5 archivos por entrega.'); end if;
  v_ext := case p_tipo when 'application/pdf' then 'pdf' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'jpg' end;
  v_path := e.cuenta_id || '/entregas/' || e.id || '/' || v_id || '.' || v_ext;
  insert into entrega_archivos(id, cuenta_id, entrega_id, path, nombre, tamano, tipo)
  values (v_id, e.cuenta_id, e.id, v_path, left(coalesce(nullif(trim(p_nombre), ''), 'archivo.' || v_ext), 160), p_tamano, p_tipo);
  return jsonb_build_object('ok', true, 'id', v_id, 'path', v_path);
end $$;

create or replace function public.d360_srv_archivo_quitar(p_entrega_sesion text, p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e entregas := _d360_entrega_por_sesion(p_entrega_sesion); v_path text;
begin
  if e.id is null or e.estado <> 'en_curso' then return jsonb_build_object('ok', false, 'error', 'Ya no puedes cambiar esta entrega.'); end if;
  delete from entrega_archivos where id = p_id and entrega_id = e.id returning path into v_path;
  if v_path is null then return jsonb_build_object('ok', false, 'error', 'Ese archivo no existe.'); end if;
  return jsonb_build_object('ok', true, 'path', v_path);
end $$;

-- ¿Puede este estudiante descargar esta ruta? (material de sus grupos o archivo de su propia entrega)
create or replace function public.d360_srv_archivo_ver(p_sesion text, p_material uuid, p_archivo uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s alumno_sesiones := _d360_aula_est(p_sesion); v_path text; v_nombre text;
begin
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'Tu sesión terminó. Vuelve a entrar.'); end if;
  if p_material is not null then
    select m.archivo_path, m.archivo_nombre into v_path, v_nombre from materiales m
     where m.id = p_material and m.archivo_path is not null and exists(select 1 from grupo_estudiantes ge where ge.grupo_id = m.grupo_id and ge.estudiante_id = s.estudiante_id and ge.estado = 'activo');
  elsif p_archivo is not null then
    select f.path, f.nombre into v_path, v_nombre from entrega_archivos f join entregas e on e.id = f.entrega_id
     where f.id = p_archivo and e.estudiante_id = s.estudiante_id;
  end if;
  if v_path is null then return jsonb_build_object('ok', false, 'error', 'No encontramos ese archivo.'); end if;
  return jsonb_build_object('ok', true, 'path', v_path, 'nombre', v_nombre);
end $$;

do $$
declare f text;
begin
  foreach f in array array['d360_srv_archivo_subir(text, text, int, text)', 'd360_srv_archivo_quitar(text, uuid)', 'd360_srv_archivo_ver(text, uuid, uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Sesiones vencidas: limpieza diaria
create or replace function public._d360_limpiar_sesiones_aula()
returns int language sql volatile security definer set search_path = public as $$
  with x as (delete from alumno_sesiones where expira < now() returning 1) select count(*)::int from x;
$$;
revoke all on function public._d360_limpiar_sesiones_aula() from public, anon, authenticated;
select cron.schedule('d360-limpiar-sesiones-aula', '35 6 * * *', $$select public._d360_limpiar_sesiones_aula()$$);
