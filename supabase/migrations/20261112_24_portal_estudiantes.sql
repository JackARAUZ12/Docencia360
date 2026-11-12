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
