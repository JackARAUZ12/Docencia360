-- =====================================================================
-- DOCENCIA360 · 31 · Demo del aula virtual y limpieza automática de archivos
-- · La demo del profesor trae aula: estudiantes con acceso (uno con código
--   fijo 246810 para probar como estudiante), una tarea con archivo, un
--   examen, un quiz ya calificado, avisos y materiales (enlaces y texto).
-- · En las demos no se suben archivos (no se acumulan en el almacenamiento).
-- · Archivos de entregas: se borran solos al año. Todo archivo que deja de
--   usarse (entrega, material, grupo o cuenta borrados) pasa a una cola y la
--   función «aula-limpieza» lo quita del almacenamiento cada noche.
-- =====================================================================

-- ---------- 1. Cola de archivos por borrar ----------
create table if not exists public.archivos_por_borrar (
  path   text primary key,
  creado timestamptz not null default now()
);
alter table public.archivos_por_borrar enable row level security;
revoke all on public.archivos_por_borrar from anon, authenticated;

create or replace function public.t_archivo_a_cola()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text := coalesce(to_jsonb(old) ->> 'path', to_jsonb(old) ->> 'archivo_path');
begin
  if v is not null then insert into archivos_por_borrar(path) values (v) on conflict do nothing; end if;
  return old;
end $$;
revoke all on function public.t_archivo_a_cola() from public, anon, authenticated;
drop trigger if exists t_cola on public.entrega_archivos;
create trigger t_cola after delete on public.entrega_archivos for each row execute function public.t_archivo_a_cola();
drop trigger if exists t_cola on public.materiales;
create trigger t_cola after delete on public.materiales for each row execute function public.t_archivo_a_cola();

insert into public.secretos_servidor(clave, valor)
values ('clave_limpieza', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (clave) do nothing;

-- Pasa a la cola las entregas de más de un año y devuelve un lote por borrar
create or replace function public.d360_srv_limpieza(p_clave text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if p_clave is distinct from (select valor from secretos_servidor where clave = 'clave_limpieza') then
    raise exception 'Clave inválida' using errcode = '42501';
  end if;
  delete from entrega_archivos where creado < now() - interval '365 days';
  get diagnostics n = row_count;
  return jsonb_build_object('vencidos', n,
    'paths', (select coalesce(jsonb_agg(path), '[]') from (select path from archivos_por_borrar order by creado limit 500) x));
end $$;

create or replace function public.d360_srv_limpieza_hecha(p_clave text, p_paths text[])
returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if p_clave is distinct from (select valor from secretos_servidor where clave = 'clave_limpieza') then
    raise exception 'Clave inválida' using errcode = '42501';
  end if;
  delete from archivos_por_borrar where path = any(p_paths);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.d360_srv_limpieza(text) from public, anon, authenticated;
revoke all on function public.d360_srv_limpieza_hecha(text, text[]) from public, anon, authenticated;
grant execute on function public.d360_srv_limpieza(text) to service_role;
grant execute on function public.d360_srv_limpieza_hecha(text, text[]) to service_role;

-- ---------- 2. En la demo no se suben archivos ----------
create or replace function public.d360_srv_archivo_subir(p_entrega_sesion text, p_nombre text, p_tamano int, p_tipo text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e entregas := _d360_entrega_por_sesion(p_entrega_sesion); a actividades; v_id uuid := gen_random_uuid(); v_path text; v_ext text;
begin
  if e.id is null or e.estado <> 'en_curso' then return jsonb_build_object('ok', false, 'error', 'Tu sesión del examen terminó. Vuelve a abrirlo.'); end if;
  if _d360_es_demo(e.cuenta_id) then return jsonb_build_object('ok', false, 'error', 'En la demostración no se suben archivos. En una cuenta real tus estudiantes suben fotos o PDF aquí.'); end if;
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
revoke all on function public.d360_srv_archivo_subir(text, text, int, text) from public, anon, authenticated;
grant execute on function public.d360_srv_archivo_subir(text, text, int, text) to service_role;

-- ---------- 3. Aula en la demo del profesor ----------
create or replace function public.d360_sembrar_demo_aula()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c uuid; g1 uuid; g3 uuid; e_fijo uuid; ev uuid; a uuid; q1 uuid; q2 uuid; en uuid;
begin
  perform set_config('d360.mantenimiento', 'on', true);
  select id into c from cuentas where codigo = 'DEMOPR' and es_demo;
  if c is null then return jsonb_build_object('ok', false, 'motivo', 'sin_demo'); end if;
  select id into g1 from grupos where cuenta_id = c and nombre like 'Matemática 9no%' limit 1;
  select id into g3 from grupos where cuenta_id = c and nombre like 'Admisión UNI%' limit 1;
  if g1 is null then return jsonb_build_object('ok', false, 'motivo', 'sin_grupos'); end if;
  -- Por si se ejecuta sola (sin reiniciar la demo completa)
  delete from evaluaciones where id in (select evaluacion_id from actividades where cuenta_id = c and evaluacion_id is not null);
  delete from actividades where cuenta_id = c;
  delete from avisos_aula where cuenta_id = c;
  delete from materiales where cuenta_id = c;
  delete from alumno_sesiones where cuenta_id = c;
  delete from estudiantes_acceso where cuenta_id = c;

  -- Accesos: un estudiante con código fijo para probar el aula; el resto con códigos aleatorios
  select ge.estudiante_id into e_fijo from grupo_estudiantes ge join estudiantes e on e.id = ge.estudiante_id
   where ge.grupo_id = g1 and ge.estado = 'activo' and e.estado = 'activo' order by e.apellidos, e.nombres limit 1;
  insert into estudiantes_acceso(estudiante_id, cuenta_id, codigo_hash, ultimos, activo)
  values (e_fijo, c, _d360_hash_codigo(c, 'e:246810'), '10', true);
  insert into estudiantes_acceso(estudiante_id, cuenta_id, codigo_hash, ultimos, activo)
  select distinct ge.estudiante_id, c, _d360_hash_codigo(c, 'e:' || x.pin), right(x.pin, 2), true
    from grupo_estudiantes ge join estudiantes e on e.id = ge.estudiante_id and e.estado = 'activo'
    cross join lateral (select _d360_pin_aleatorio() || ge.estudiante_id::text pin0) y
    cross join lateral (select left(y.pin0, 6) pin) x
   where ge.cuenta_id = c and ge.estado = 'activo' and ge.estudiante_id <> e_fijo and x.pin <> '246810'
  on conflict do nothing;

  -- Tarea con foto del cuaderno
  insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max, descripcion)
  values (c, g1, 'Tarea: foto de tus ejercicios de factorización', 'tarea', current_date + 5, 10, 10, 'Actividad en línea') returning id into ev;
  insert into actividades(cuenta_id, grupo_id, evaluacion_id, tipo, titulo, instrucciones, cierra, intentos, mostrar_nota, peso, estado, token, permite_archivos, puntos_archivo)
  values (c, g1, ev, 'tarea', 'Tarea: foto de tus ejercicios de factorización',
          'Resuelve los ejercicios 1 al 8 de la página 45 en tu cuaderno y sube una foto clara de cada página.',
          now() + interval '5 days', 1, true, 10, 'publicada', lower(_d360_codigo_aleatorio(10)), true, 10);

  -- Examen corto con calificación automática
  insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max, descripcion)
  values (c, g1, 'Examen corto: ecuaciones lineales', 'examen', current_date + 7, 20, 5, 'Actividad en línea') returning id into ev;
  insert into actividades(cuenta_id, grupo_id, evaluacion_id, tipo, titulo, instrucciones, cierra, duracion_min, intentos, mostrar_nota, peso, estado, token)
  values (c, g1, ev, 'examen', 'Examen corto: ecuaciones lineales', 'Tienes 20 minutos. Lee con calma cada pregunta.',
          now() + interval '7 days', 20, 1, true, 20, 'publicada', lower(_d360_codigo_aleatorio(10))) returning id into a;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, opciones, correcta, puntos) values
    (c, a, 0, 'opcion', '¿Cuál es el valor de x en 2x + 4 = 10?', '["2","3","4","5"]', '1', 2),
    (c, a, 1, 'vf', 'En la ecuación x − 5 = 0, x vale 5.', '[]', 'true', 1),
    (c, a, 2, 'corta', 'Resuelve: 3x = 21. ¿Cuánto vale x?', '[]', '["7"]', 2);

  -- Quiz ya cerrado y calificado (el estudiante de prueba ve su nota y el comentario)
  insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max, descripcion)
  values (c, g1, 'Quiz: proporciones', 'examen', current_date - 3, 10, 2, 'Actividad en línea') returning id into ev;
  insert into actividades(cuenta_id, grupo_id, evaluacion_id, tipo, titulo, abre, cierra, intentos, mostrar_nota, peso, estado, token)
  values (c, g1, ev, 'examen', 'Quiz: proporciones', now() - interval '4 days', now() - interval '3 days', 1, true, 10, 'cerrada', lower(_d360_codigo_aleatorio(10))) returning id into a;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, correcta, puntos) values (c, a, 0, 'vf', 'Si 2 cuadernos cuestan C$60, 4 cuadernos cuestan C$120.', 'true', 1) returning id into q1;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, correcta, puntos) values (c, a, 1, 'vf', 'Una proporción compara dos sumas.', 'false', 1) returning id into q2;
  insert into entregas(cuenta_id, actividad_id, estudiante_id, intento, iniciada, enviada, estado, respuestas, comentario, origen)
  values (c, a, e_fijo, 1, now() - interval '3 days 1 hour', now() - interval '3 days 50 minutes', 'enviada',
          jsonb_build_object(q1::text, true, q2::text, true), '¡Bien! Repasa qué compara una proporción.', 'aula') returning id into en;
  perform _d360_calificar(en);
  perform _d360_volcar_nota(a, e_fijo);

  if g3 is not null then
    insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max, descripcion)
    values (c, g3, 'Simulacro en línea: razonamiento lógico', 'examen', current_date + 3, 25, 3, 'Actividad en línea') returning id into ev;
    insert into actividades(cuenta_id, grupo_id, evaluacion_id, tipo, titulo, abre, cierra, duracion_min, intentos, mostrar_nota, peso, estado, token)
    values (c, g3, ev, 'examen', 'Simulacro en línea: razonamiento lógico', now() + interval '1 day', now() + interval '3 days', 30, 1, true, 25, 'publicada', lower(_d360_codigo_aleatorio(10))) returning id into a;
    insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, opciones, correcta, puntos) values
      (c, a, 0, 'opcion', 'Sigue la serie: 2, 4, 8, 16, …', '["18","24","32","30"]', '2', 3);
  end if;

  -- Avisos y materiales
  insert into avisos_aula(cuenta_id, grupo_id, texto, creado) values
    (c, g1, 'El jueves repasamos factorización antes del examen. Traigan sus dudas anotadas.', now() - interval '1 day'),
    (c, g1, 'Recuerden subir la foto de la tarea antes del viernes.', now() - interval '2 hours');
  insert into materiales(cuenta_id, grupo_id, titulo, descripcion, url, creado) values
    (c, g1, 'Video: factorización paso a paso', 'Míralo antes de hacer la tarea.', 'https://www.youtube.com/results?search_query=factorizacion+paso+a+paso', now() - interval '2 days'),
    (c, g1, 'Guía de ejercicios: ecuaciones', E'1) 2x + 3 = 11\n2) 5x − 4 = 21\n3) x/3 = 6\n4) 4(x + 1) = 20', null, now() - interval '3 days');
  return jsonb_build_object('ok', true, 'estudiante', e_fijo, 'codigo', '246810');
end $$;
revoke all on function public.d360_sembrar_demo_aula() from public, anon, authenticated;

create or replace function public.d360_admin_reiniciar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  r := d360_sembrar_demos();
  perform d360_sembrar_demo_aula();
  return r || jsonb_build_object('estudiantes', (r ->> 'estudiantes')::int + d360_sembrar_demo_colegio());
end $$;
revoke execute on function public.d360_admin_reiniciar_demos() from public, anon;

-- ---------- 4. Tareas programadas (solo en Supabase) ----------
do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net no disponible: %', sqlerrm; end $$;
select cron.schedule('d360-reiniciar-demos', '20 6 * * *', $$select public.d360_sembrar_demos(); select public.d360_sembrar_demo_aula();$$);
select cron.schedule('d360-limpiar-archivos', '45 6 * * *', $$select net.http_post(url := (select valor from public.secretos_servidor where clave = 'url_funciones') || '/aula-limpieza', body := jsonb_build_object('clave', (select valor from public.secretos_servidor where clave = 'clave_limpieza')), headers := '{"Content-Type": "application/json"}'::jsonb)$$);
