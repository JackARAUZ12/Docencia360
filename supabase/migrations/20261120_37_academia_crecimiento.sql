-- Academias, bloque 3: interesados con clase de prueba, inscripción en línea
-- (enlace o QR público), recuperación de clases y cambio de nivel.

-- ---------- 1. Interesados ----------
create table if not exists public.interesados (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid not null references public.cuentas(id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) between 2 and 120),
  telefono        text check (length(telefono) <= 30),
  email           text check (length(email) <= 120),
  curso_id        uuid references public.cursos(id) on delete set null,
  grupo_id        uuid references public.grupos(id) on delete set null,
  origen          text not null default 'manual' check (origen in ('manual','en_linea','whatsapp','facebook','recomendacion','visita','otro')),
  estado          text not null default 'nuevo' check (estado in ('nuevo','contactado','prueba','matriculado','descartado')),
  prueba_fecha    date,
  prueba_grupo_id uuid references public.grupos(id) on delete set null,
  prueba_resultado text check (prueba_resultado in ('asistio','no_vino')),
  nota            text check (length(nota) <= 1000),
  datos           jsonb not null default '{}'::jsonb,
  estudiante_id   uuid references public.estudiantes(id) on delete set null,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);
create index if not exists interesados_cuenta on public.interesados(cuenta_id, estado, creado desc);
drop trigger if exists t_mc on public.interesados;
create trigger t_mc before insert or update on public.interesados for each row execute function public.d360_misma_cuenta('curso_id:cursos','grupo_id:grupos','prueba_grupo_id:grupos','estudiante_id:estudiantes');
drop trigger if exists t_ci on public.interesados;
create trigger t_ci before update on public.interesados for each row execute function public.d360_cuenta_inmutable();
drop trigger if exists t_aud on public.interesados;
create trigger t_aud after insert or update or delete on public.interesados for each row execute function public.t_auditar();
alter table public.interesados enable row level security;
revoke all on public.interesados from anon;
drop policy if exists leer on public.interesados;
create policy leer on public.interesados for select to authenticated
  using (public.d360_es_gestor(cuenta_id) or public.d360_es_finanzas(cuenta_id));
drop policy if exists escribir on public.interesados;
create policy escribir on public.interesados for all to authenticated
  using ((public.d360_es_gestor(cuenta_id) or public.d360_es_finanzas(cuenta_id)) and public.d360_cuenta_operativa(cuenta_id))
  with check ((public.d360_es_gestor(cuenta_id) or public.d360_es_finanzas(cuenta_id)) and public.d360_cuenta_operativa(cuenta_id));

-- Convertir en estudiante y matricular en un paso
create or replace function public.d360_interesado_matricular(p_interesado uuid, p_nombres text, p_apellidos text, p_grupo uuid,
  p_monto_matricula numeric, p_mensualidad numeric, p_meses int, p_dia_pago int, p_descuento_pct numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_i interesados; v_e uuid; r jsonb; v_curso uuid;
begin
  select * into v_i from interesados where id = p_interesado;
  if v_i.id is null or not _d360_puede_operar(v_i.cuenta_id) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if v_i.estado = 'matriculado' then raise exception 'Este interesado ya está matriculado.'; end if;
  if coalesce(length(trim(p_nombres)), 0) < 1 then raise exception 'Escribe los nombres.'; end if;
  select curso_id into v_curso from grupos where id = p_grupo and cuenta_id = v_i.cuenta_id;
  insert into estudiantes(cuenta_id, nombres, apellidos, telefono, email, contacto_nombre, contacto_telefono, fecha_nacimiento, observaciones)
  values (v_i.cuenta_id, left(trim(p_nombres), 80), left(trim(coalesce(p_apellidos, '')), 80), v_i.telefono, v_i.email,
          nullif(v_i.datos ->> 'responsable', ''), case when nullif(v_i.datos ->> 'responsable', '') is not null then v_i.telefono end,
          case when (v_i.datos ->> 'fecha_nacimiento') ~ '^\d{4}-\d{2}-\d{2}$' then (v_i.datos ->> 'fecha_nacimiento')::date end,
          'Llegó como interesado (' || v_i.origen || ') el ' || to_char(v_i.creado, 'DD/MM/YYYY'))
  returning id into v_e;
  r := d360_matricular(v_i.cuenta_id, v_e, v_curso, p_grupo, current_date, p_monto_matricula, p_mensualidad, p_meses, p_dia_pago, p_descuento_pct, null,
                       'Matrícula desde interesados');
  update interesados set estado = 'matriculado', estudiante_id = v_e, grupo_id = p_grupo, actualizado = now() where id = v_i.id;
  return r || jsonb_build_object('estudiante_id', v_e);
end $$;
revoke all on function public.d360_interesado_matricular(uuid, text, text, uuid, numeric, numeric, int, int, numeric) from public, anon;
grant execute on function public.d360_interesado_matricular(uuid, text, text, uuid, numeric, numeric, int, int, numeric) to authenticated;

-- ---------- 2. Inscripción en línea (enlace o QR público) ----------
create table if not exists public.inscripcion_publica (
  cuenta_id  uuid primary key references public.cuentas(id) on delete cascade,
  activo     boolean not null default true,
  token      text not null unique,
  mensaje    text check (length(mensaje) <= 500),
  precios    boolean not null default true,
  creado     timestamptz not null default now()
);
alter table public.inscripcion_publica enable row level security;
revoke all on public.inscripcion_publica from anon;
drop policy if exists leer on public.inscripcion_publica;
create policy leer on public.inscripcion_publica for select to authenticated using (public.d360_es_gestor(cuenta_id) or public.d360_es_finanzas(cuenta_id));
drop policy if exists editar on public.inscripcion_publica;
create policy editar on public.inscripcion_publica for update to authenticated
  using (public.d360_gestor_operativo(cuenta_id)) with check (public.d360_gestor_operativo(cuenta_id));

-- Activar (o crear el enlace) y generar uno nuevo si se compartió por error
create or replace function public.d360_inscripcion_enlace(p_cuenta uuid, p_nuevo boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v_tok text;
begin
  if not d360_gestor_operativo(p_cuenta) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if (select modalidad from cuentas where id = p_cuenta) <> 'academia' then raise exception 'La inscripción en línea es para academias.'; end if;
  if _d360_es_demo(p_cuenta) and exists(select 1 from inscripcion_publica where cuenta_id = p_cuenta) then
    return (select token from inscripcion_publica where cuenta_id = p_cuenta);
  end if;
  loop
    v_tok := lower(_d360_codigo_aleatorio(10));
    exit when not exists(select 1 from inscripcion_publica where token = v_tok);
  end loop;
  insert into inscripcion_publica(cuenta_id, token) values (p_cuenta, v_tok)
  on conflict (cuenta_id) do update set token = case when p_nuevo then excluded.token else inscripcion_publica.token end, activo = true
  returning token into v_tok;
  return v_tok;
end $$;
revoke all on function public.d360_inscripcion_enlace(uuid, boolean) from public, anon;
grant execute on function public.d360_inscripcion_enlace(uuid, boolean) to authenticated;

-- Lo que ve el público: solo nombre, mensaje y cursos abiertos (nunca datos de estudiantes)
create or replace function public.d360_inscripcion_ver(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p inscripcion_publica; c cuentas;
begin
  select * into v_p from inscripcion_publica where token = lower(trim(coalesce(p_token, ''))) and activo;
  if v_p.cuenta_id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  select * into c from cuentas where id = v_p.cuenta_id;
  if not d360_cuenta_operativa(c.id) then return jsonb_build_object('ok', false, 'motivo', 'no_disponible'); end if;
  return jsonb_build_object('ok', true, 'institucion', c.nombre, 'mensaje', v_p.mensaje, 'moneda', c.moneda, 'telefono', c.telefono,
    'cursos', (select coalesce(jsonb_agg(jsonb_build_object('id', cu.id, 'nombre', cu.nombre, 'descripcion', cu.descripcion,
                 'modalidad', cu.modalidad_clase, 'duracion_semanas', cu.duracion_semanas,
                 'mensualidad', case when v_p.precios then cu.mensualidad end, 'matricula', case when v_p.precios then cu.precio_matricula end,
                 'grupos', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'nombre', g.nombre, 'inicio', g.fecha_inicio,
                               'horario', (select string_agg((array['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'])[h.dia] || ' ' || to_char(h.hora_inicio, 'HH24:MI') || '–' || to_char(h.hora_fin, 'HH24:MI'), ', ' order by h.dia, h.hora_inicio) from horarios h where h.grupo_id = g.id),
                               'lleno', g.cupo is not null and (select count(*) from grupo_estudiantes ge where ge.grupo_id = g.id and ge.estado = 'activo') >= g.cupo) order by g.nombre), '[]')
                            from grupos g where g.curso_id = cu.id and g.estado in ('activo','planificado'))) order by cu.nombre), '[]')
               from cursos cu where cu.cuenta_id = c.id and cu.activo));
end $$;
revoke all on function public.d360_inscripcion_ver(text) from public;
grant execute on function public.d360_inscripcion_ver(text) to anon, authenticated;

-- Enviar la solicitud: queda como interesado «en línea» y avisa a la academia
create or replace function public.d360_inscripcion_enviar(p_token text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p inscripcion_publica; v_clave text := 'inscripcion|' || _d360_ip(); v_int acceso_intentos;
        v_nom text := left(trim(coalesce(p_datos ->> 'nombre', '')), 120); v_tel text := left(regexp_replace(coalesce(p_datos ->> 'telefono', ''), '[^0-9+ ]', '', 'g'), 30);
        v_email text := left(lower(trim(coalesce(p_datos ->> 'email', ''))), 120); v_curso uuid; v_grupo uuid; v_id uuid;
begin
  -- Trampa para robots: un campo oculto que una persona no llena
  if coalesce(p_datos ->> 'web', '') <> '' then return jsonb_build_object('ok', true); end if;
  select * into v_p from inscripcion_publica where token = lower(trim(coalesce(p_token, ''))) and activo;
  if v_p.cuenta_id is null or not d360_cuenta_operativa(v_p.cuenta_id) then return jsonb_build_object('ok', false, 'motivo', 'no_disponible'); end if;
  -- Máximo 5 solicitudes por hora desde la misma conexión y 100 por día por academia
  select * into v_int from acceso_intentos where clave = v_clave;
  if v_int.clave is not null and v_int.actualizado > now() - interval '1 hour' and v_int.fallos >= 5 then return jsonb_build_object('ok', false, 'motivo', 'muchas'); end if;
  if (select count(*) from interesados where cuenta_id = v_p.cuenta_id and origen = 'en_linea' and creado > now() - interval '1 day') >= 100 then
    return jsonb_build_object('ok', false, 'motivo', 'muchas');
  end if;
  if length(v_nom) < 3 then return jsonb_build_object('ok', false, 'motivo', 'nombre'); end if;
  if length(regexp_replace(v_tel, '\D', '', 'g')) < 7 then return jsonb_build_object('ok', false, 'motivo', 'telefono'); end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'motivo', 'email'); end if;
  if (p_datos ->> 'curso_id') ~ '^[0-9a-f-]{36}$' then
    select id into v_curso from cursos where id = (p_datos ->> 'curso_id')::uuid and cuenta_id = v_p.cuenta_id and activo;
  end if;
  if v_curso is null then return jsonb_build_object('ok', false, 'motivo', 'curso'); end if;
  if (p_datos ->> 'grupo_id') ~ '^[0-9a-f-]{36}$' then
    select id into v_grupo from grupos where id = (p_datos ->> 'grupo_id')::uuid and curso_id = v_curso and estado in ('activo','planificado');
  end if;
  insert into acceso_intentos(clave, fallos, actualizado) values (v_clave, 1, now())
  on conflict (clave) do update set fallos = case when acceso_intentos.actualizado < now() - interval '1 hour' then 1 else acceso_intentos.fallos + 1 end, actualizado = now();
  insert into interesados(cuenta_id, nombre, telefono, email, curso_id, grupo_id, origen, nota, datos)
  values (v_p.cuenta_id, v_nom, nullif(v_tel, ''), nullif(v_email, ''), v_curso, v_grupo, 'en_linea', left(nullif(trim(coalesce(p_datos ->> 'mensaje', '')), ''), 1000),
          jsonb_strip_nulls(jsonb_build_object(
            'responsable', left(nullif(trim(coalesce(p_datos ->> 'responsable', '')), ''), 120),
            'fecha_nacimiento', case when (p_datos ->> 'fecha_nacimiento') ~ '^\d{4}-\d{2}-\d{2}$' then p_datos ->> 'fecha_nacimiento' end,
            'quiere_prueba', coalesce(p_datos ->> 'quiere_prueba', '') in ('true', '1'))))
  returning id into v_id;
  insert into notificaciones(cuenta_id, tipo, titulo, cuerpo, enlace)
  values (v_p.cuenta_id, 'inscripcion', 'Nueva solicitud de inscripción', v_nom || ' quiere ' || (select nombre from cursos where id = v_curso) || '.', '#/interesados');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.d360_inscripcion_enviar(text, jsonb) from public;
grant execute on function public.d360_inscripcion_enviar(text, jsonb) to anon, authenticated;

-- ---------- 3. Recuperación de clases ----------
create table if not exists public.recuperaciones (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  grupo_origen  uuid references public.grupos(id) on delete set null,
  fecha_falta   date,
  grupo_destino uuid not null references public.grupos(id) on delete cascade,
  fecha         date not null,
  estado        text not null default 'agendada' check (estado in ('agendada','asistio','no_vino','cancelada')),
  nota          text check (length(nota) <= 300),
  creado        timestamptz not null default now(),
  check (grupo_origen is distinct from grupo_destino)
);
create index if not exists recuperaciones_destino on public.recuperaciones(grupo_destino, fecha);
create index if not exists recuperaciones_est on public.recuperaciones(estudiante_id, fecha_falta);
drop trigger if exists t_mc on public.recuperaciones;
create trigger t_mc before insert or update on public.recuperaciones for each row execute function public.d360_misma_cuenta('estudiante_id:estudiantes','grupo_origen:grupos','grupo_destino:grupos');
drop trigger if exists t_ci on public.recuperaciones;
create trigger t_ci before update on public.recuperaciones for each row execute function public.d360_cuenta_inmutable();
alter table public.recuperaciones enable row level security;
revoke all on public.recuperaciones from anon;
drop policy if exists leer on public.recuperaciones;
create policy leer on public.recuperaciones for select to authenticated
  using (public.d360_ve_grupo(cuenta_id, grupo_destino) or public.d360_ve_estudiante(cuenta_id, estudiante_id));
drop policy if exists escribir on public.recuperaciones;
create policy escribir on public.recuperaciones for all to authenticated
  using (public.d360_gestor_operativo(cuenta_id)) with check (public.d360_gestor_operativo(cuenta_id));

-- El instructor del grupo que recibe marca si vino o no
create or replace function public.d360_recuperacion_marcar(p_id uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare r recuperaciones;
begin
  select * into r from recuperaciones where id = p_id;
  if r.id is null or not (d360_puede_grupo(r.cuenta_id, r.grupo_destino) and d360_cuenta_operativa(r.cuenta_id)) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  if p_estado not in ('agendada','asistio','no_vino') then raise exception 'Estado no válido.'; end if;
  if p_estado <> 'agendada' and r.fecha > current_date then raise exception 'Se marca el día de la clase o después.'; end if;
  update recuperaciones set estado = p_estado where id = p_id;
end $$;
revoke all on function public.d360_recuperacion_marcar(uuid, text) from public, anon;
grant execute on function public.d360_recuperacion_marcar(uuid, text) to authenticated;

-- ---------- 4. Cambio de nivel ----------
alter table public.cursos add column if not exists siguiente_curso_id uuid references public.cursos(id) on delete set null;
do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'cursos_siguiente_distinto') then
    alter table public.cursos add constraint cursos_siguiente_distinto check (siguiente_curso_id is distinct from id);
  end if;
end $$;
drop trigger if exists t_mc on public.cursos;
create trigger t_mc before insert or update on public.cursos for each row execute function public.d360_misma_cuenta('asignatura_id:asignaturas','siguiente_curso_id:cursos');

-- Pasa a los estudiantes elegidos de un grupo al siguiente: cierra su matrícula
-- (completada), emite el certificado si se pide y los matricula en el grupo nuevo.
create or replace function public.d360_promover(p_grupo_origen uuid, p_estudiantes uuid[], p_grupo_destino uuid,
  p_meses int default 1, p_dia_pago int default 5, p_cobrar_matricula boolean default false, p_certificar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare go grupos; gd grupos; cu_o cursos; cu_d cursos; e uuid; n int := 0; nc int := 0; v_desc numeric;
begin
  select * into go from grupos where id = p_grupo_origen;
  select * into gd from grupos where id = p_grupo_destino;
  if go.id is null or gd.id is null or go.cuenta_id <> gd.cuenta_id or not d360_gestor_operativo(go.cuenta_id) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  if go.id = gd.id then raise exception 'Elige un grupo distinto.'; end if;
  if coalesce(array_length(p_estudiantes, 1), 0) = 0 then raise exception 'Elige al menos un estudiante.'; end if;
  select * into cu_o from cursos where id = go.curso_id;
  select * into cu_d from cursos where id = gd.curso_id;
  if p_certificar and not d360_tiene_funcion(go.cuenta_id, 'certificados') then raise exception 'Tu plan no incluye certificados.' using hint = 'limite_plan'; end if;
  foreach e in array p_estudiantes loop
    if not exists(select 1 from grupo_estudiantes where grupo_id = go.id and estudiante_id = e and estado = 'activo') then
      raise exception 'Un estudiante elegido no está en el grupo de origen.';
    end if;
    select descuento_pct into v_desc from matriculas where estudiante_id = e and grupo_id = go.id and estado in ('activa','pendiente') order by creado desc limit 1;
    update matriculas set estado = 'completada' where estudiante_id = e and grupo_id = go.id and estado in ('activa','pendiente');
    update grupo_estudiantes set estado = 'retirado' where grupo_id = go.id and estudiante_id = e;
    if p_certificar and cu_o.id is not null then
      perform d360_emitir_certificado(go.cuenta_id, e, cu_o.id, 'certificado', cu_o.nombre, jsonb_build_object('grupo', go.nombre));
      nc := nc + 1;
    end if;
    perform d360_matricular(go.cuenta_id, e, gd.curso_id, gd.id, current_date,
      case when p_cobrar_matricula then coalesce(cu_d.precio_matricula, 0) else 0 end,
      coalesce(cu_d.mensualidad, 0), greatest(coalesce(p_meses, 0), 0), coalesce(p_dia_pago, 5), coalesce(v_desc, 0), null,
      'Pasó de ' || go.nombre);
    n := n + 1;
  end loop;
  perform d360_log(go.cuenta_id, 'cambio_nivel', 'grupos', gd.id::text, jsonb_build_object('desde', go.id, 'estudiantes', n, 'certificados', nc));
  return jsonb_build_object('promovidos', n, 'certificados', nc);
end $$;
revoke all on function public.d360_promover(uuid, uuid[], uuid, int, int, boolean, boolean) from public, anon;
grant execute on function public.d360_promover(uuid, uuid[], uuid, int, int, boolean, boolean) to authenticated;

-- ---------- 5. Demo de academia: interesados, enlace de inscripción, recuperación y niveles ----------
create or replace function public.d360_sembrar_demo_crecimiento()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c uuid; a1 uuid; a2 uuid; g_a1 uuid; g_a1b uuid; g_gui uuid; e uuid; f date;
begin
  perform set_config('d360.mantenimiento', 'on', true);
  select id into c from cuentas where codigo = 'DEMOAC' and es_demo;
  if c is null then return jsonb_build_object('ok', false); end if;
  delete from interesados where cuenta_id = c;
  delete from recuperaciones where cuenta_id = c;
  select id into a1 from cursos where cuenta_id = c and nombre like 'Inglés%A1%' limit 1;
  select id into a2 from cursos where cuenta_id = c and nombre like 'Inglés%A2%' limit 1;
  if a1 is not null and a2 is not null then update cursos set siguiente_curso_id = a2 where id = a1; end if;
  select id into g_a1 from grupos where cuenta_id = c and curso_id = a1 and nombre like '%noche%' limit 1;
  select id into g_a1b from grupos where cuenta_id = c and curso_id = a1 and nombre like '%sábado%' limit 1;
  select id into g_gui from grupos where cuenta_id = c and nombre like 'Guitarra%' limit 1;
  insert into inscripcion_publica(cuenta_id, token, mensaje) values (c, 'demoacademia', 'Inscríbete en línea y te llamamos para confirmar tu cupo. ¡La primera clase de prueba es gratis!')
  on conflict (cuenta_id) do update set token = 'demoacademia', activo = true, mensaje = excluded.mensaje;
  insert into interesados(cuenta_id, nombre, telefono, curso_id, grupo_id, origen, estado, prueba_fecha, prueba_grupo_id, prueba_resultado, nota, datos, creado) values
    (c, 'Valeria Sánchez', '8456 1122', a1, g_a1b, 'en_linea', 'nuevo', null, null, null, 'Pregunta si hay descuento por pagar 3 meses.', '{"quiere_prueba": true}', now() - interval '3 hours'),
    (c, 'Roberto Gaitán', '8877 3344', a1, null, 'facebook', 'contactado', null, null, null, 'Lo llamé el lunes; decide esta semana.', '{}', now() - interval '4 days'),
    (c, 'Camila Torres', '8122 9090', a1, g_a1, 'whatsapp', 'prueba', current_date + 2, g_a1, null, 'Clase de prueba agendada.', '{"responsable": "Marta Torres"}', now() - interval '2 days'),
    (c, 'Andrés Molina', '8333 4545', (select curso_id from grupos where id = g_gui), g_gui, 'recomendacion', 'prueba', current_date - 3, g_gui, 'asistio', 'Le gustó la clase. Falta que confirme el horario.', '{}', now() - interval '8 days'),
    (c, 'Sofía Herrera', '8999 1212', a1, null, 'visita', 'descartado', null, null, null, 'El horario no le sirve.', '{}', now() - interval '15 days');
  -- Una recuperación: un ausente del grupo nocturno recupera en el del sábado
  select a.estudiante_id, a.fecha into e, f from asistencias a where a.grupo_id = g_a1 and a.estado = 'ausente' order by a.fecha desc limit 1;
  if e is not null and g_a1b is not null then
    insert into recuperaciones(cuenta_id, estudiante_id, grupo_origen, fecha_falta, grupo_destino, fecha, nota)
    values (c, e, g_a1, f, g_a1b, current_date + ((6 - extract(isodow from current_date)::int + 7) % 7), 'Recupera el tema de la semana');
  end if;
  return jsonb_build_object('ok', true, 'interesados', (select count(*) from interesados where cuenta_id = c));
end $$;
revoke all on function public.d360_sembrar_demo_crecimiento() from public, anon, authenticated;

create or replace function public.d360_admin_reiniciar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  r := d360_sembrar_demos();
  perform d360_sembrar_demo_aula();
  perform d360_sembrar_demo_extras();
  perform d360_sembrar_demo_academia();
  perform d360_sembrar_demo_crecimiento();
  return r || jsonb_build_object('estudiantes', (r ->> 'estudiantes')::int + d360_sembrar_demo_colegio());
end $$;
revoke execute on function public.d360_admin_reiniciar_demos() from public, anon;
select cron.schedule('d360-reiniciar-demos', '20 6 * * *', $c$select public.d360_sembrar_demos(); select public.d360_sembrar_demo_aula(); select public.d360_sembrar_demo_extras(); select public.d360_sembrar_demo_academia(); select public.d360_sembrar_demo_crecimiento();$c$);
