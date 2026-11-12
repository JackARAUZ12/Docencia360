-- Subir y bajar de plan: el portal y el asistente se apagan y se reactivan solos, sin perder datos
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000c1','dueno@test'),('00000000-0000-0000-0000-0000000000c2','asis@test'),('00000000-0000-0000-0000-0000000000c9','admin@test');
insert into plataforma_admins(user_id) values ('00000000-0000-0000-0000-0000000000c9');
create temp table r(k text, v jsonb); grant all on r to authenticated, anon;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into r select 'C', d360_crear_cuenta('profesor','Clases Premium','Dueño','prof_premium', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); g uuid; e uuid; act uuid; res jsonb; mi uuid; begin
  insert into grupos(cuenta_id, nombre) values (c, 'Grupo') returning id into g;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Eva', 'Uno') returning id into e;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado) values (g, e, c, current_date, 'activo');
  res := d360_alumnos_activar(c, array[e]);
  insert into actividades(cuenta_id, grupo_id, titulo) values (c, g, 'Prueba') returning id into act;
  insert into preguntas(cuenta_id, actividad_id, tipo, enunciado, correcta) values (c, act, 'vf', '¿Sí?', 'true');
  mi := (d360_crear_miembro(c, 'Asistente', 'docente')->>'miembro_id')::uuid;
  insert into r values ('X', jsonb_build_object('pin', res->0->>'codigo', 'tok', d360_actividad_publicar(act), 'mi', mi, 'act', act));
end $$;

-- El administrador ve el impacto antes de bajar a Básico
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c9';
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); i jsonb; begin
  i := d360_admin_impacto_plan(c, 'prof_basico');
  if i->>'direccion' <> 'baja' or not (i->'pierde') ? 'Exámenes y tareas en línea' or not (i->'pierde') ? 'Asistente con su propio acceso'
     or jsonb_array_length(i->'avisos') < 2 then raise exception 'FALLO impacto %', i; end if;
  raise notice 'OK antes de bajar, el administrador ve qué pierde la cuenta y qué pasará';
  begin perform d360_admin_impacto_plan(c, 'col_avanzado'); raise exception 'FALLO plan de otra modalidad';
  exception when raise_exception then raise notice 'OK no se puede pasar a un plan de otro tipo de cuenta'; end;
  perform d360_admin_cambiar_plan(c, 'prof_basico');
end $$;
reset role;
do $$ begin
  if (select activo from miembros where id = (select (v->>'mi')::uuid from r where k='X'))
     or not (select pausado_por_plan from miembros where id = (select (v->>'mi')::uuid from r where k='X')) then raise exception 'FALLO asistente no pausado'; end if;
  raise notice 'OK al bajar a Básico, el asistente queda pausado (no se borra)';
  if not exists(select 1 from auditoria where accion = 'plan_cambiado') then raise exception 'FALLO sin auditoría'; end if;
  raise notice 'OK el cambio de plan queda en la auditoría';
end $$;
set role anon; set request.headers = '{"x-forwarded-for": "7.7.7.7"}';
do $$ declare t text := (select v->>'tok' from r where k='X'); begin
  if d360_alumno_ver(t)->>'estado' <> 'no_disponible' or d360_alumno_entrar(t, (select v->>'pin' from r where k='X'))->>'motivo' <> 'no_disponible' then raise exception 'FALLO portal sigue abierto'; end if;
  raise notice 'OK con Básico, los estudiantes ya no entran (pero nada se borró)';
end $$;
reset role;
do $$ begin
  if not exists(select 1 from estudiantes_acceso where activo) or not exists(select 1 from actividades) then raise exception 'FALLO se borraron datos'; end if;
  raise notice 'OK los códigos y exámenes se conservan';
end $$;

-- Sube de nuevo a Premium (por «Editar suscripción», un update directo): todo vuelve solo
update suscripciones set plan_id = 'prof_premium' where cuenta_id = (select (v->>'cuenta_id')::uuid from r where k='C');
do $$ begin
  if not (select activo from miembros where id = (select (v->>'mi')::uuid from r where k='X')) then raise exception 'FALLO asistente no reactivado'; end if;
  raise notice 'OK al volver a Premium, el asistente se reactiva solo';
end $$;
set role anon;
do $$ declare res jsonb; begin
  res := d360_alumno_entrar((select v->>'tok' from r where k='X'), (select v->>'pin' from r where k='X'));
  if not (res->>'ok')::boolean or res->>'sesion' is null then raise exception 'FALLO no vuelve a entrar %', res; end if;
  raise notice 'OK el estudiante vuelve a entrar con el MISMO código';
end $$;
reset role;
-- Profesional (sin asistente) → el asistente se pausa; portal sigue
update suscripciones set plan_id = 'prof_profesional' where cuenta_id = (select (v->>'cuenta_id')::uuid from r where k='C');
do $$ begin
  if (select activo from miembros where id = (select (v->>'mi')::uuid from r where k='X')) then raise exception 'FALLO asistente activo en Profesional'; end if;
  if not d360_tiene_funcion((select (v->>'cuenta_id')::uuid from r where k='C'), 'portal_estudiantes') then raise exception 'FALLO portal en Profesional'; end if;
  raise notice 'OK en Profesional: portal activo y asistente pausado';
end $$;
