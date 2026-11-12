-- Portal de estudiantes: planes, accesos con límite, actividades, entrada con código, calificación automática y revisión
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','pro@test'),('00000000-0000-0000-0000-0000000000a2','basico@test');
create temp table r(k text, v jsonb); grant all on r to authenticated, anon;

do $$ begin
  if (select max_estudiantes from planes where id = 'prof_basico') is not null then raise exception 'FALLO básico con límite de estudiantes'; end if;
  if (select max_estudiantes_portal from planes where id = 'prof_profesional') <> 250 or (select max_estudiantes_portal from planes where id = 'prof_premium') <> 600
     or (select max_estudiantes_portal from planes where id = 'prof_basico') <> 0 then raise exception 'FALLO límites del portal'; end if;
  raise notice 'OK planes del profesor: estudiantes sin límite; portal 0 / 250 / 600';
end $$;

-- Básico: no incluye el portal
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into r select 'B', d360_crear_cuenta('profesor','Básico','Bea','prof_basico', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='B'); e uuid; begin
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Uno', 'Básico') returning id into e;
  begin perform d360_alumnos_activar(c, array[e]); raise exception 'FALLO básico activa accesos';
  exception when raise_exception then if sqlerrm not like '%no incluye tareas y exámenes en línea%' then raise exception 'FALLO mensaje: %', sqlerrm; end if; end;
  raise notice 'OK el plan Básico no incluye accesos en línea (mensaje claro)';
  for i in 1..40 loop insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'E' || i, 'X'); end loop;
  raise notice 'OK el plan Básico registra más de 30 estudiantes (sin límite)';
end $$;

-- Profesional: grupo, estudiantes, accesos
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into r select 'C', d360_crear_cuenta('profesor','Clases Pro','Pro','prof_profesional', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); g uuid; a uuid; b uuid; x uuid; fuera uuid; res jsonb; begin
  insert into grupos(cuenta_id, nombre) values (c, 'Física 11mo') returning id into g;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Ana', 'Uno') returning id into a;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Beto', 'Dos') returning id into b;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Ceci', 'Tres') returning id into x;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Fuera', 'Grupo') returning id into fuera;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado) values (g, a, c, current_date, 'activo'), (g, b, c, current_date, 'activo'), (g, x, c, current_date, 'activo');
  res := d360_alumnos_activar(c, array[a, b, fuera]);
  if jsonb_array_length(res) <> 3 or (res->0->>'codigo') !~ '^\d{6}$' then raise exception 'FALLO activar %', res; end if;
  raise notice 'OK activa accesos y entrega un código de 6 dígitos por estudiante';
  if (select count(*) from estudiantes_acceso where cuenta_id = c and activo) <> 3 then raise exception 'FALLO conteo'; end if;
  if jsonb_array_length(d360_alumnos_activar(c, array[a])) <> 0 then raise exception 'FALLO reactivar sin pedirlo'; end if;
  raise notice 'OK no cambia el código de quien ya tiene acceso (salvo que se pida uno nuevo)';
  insert into r values ('G', jsonb_build_object('c', c, 'g', g, 'a', a, 'b', b, 'x', x, 'fuera', fuera,
    'pa', res->0->>'codigo', 'pb', res->1->>'codigo', 'pf', res->2->>'codigo'));
  begin perform 1 from estudiantes_acceso where codigo_hash is not null; raise exception 'FALLO se lee el hash';
  exception when insufficient_privilege then raise notice 'OK el código cifrado no se puede leer ni con sesión'; end;
end $$;
-- Límite del plan (se baja a 3 para probar)
reset role; update planes set max_estudiantes_portal = 3 where id = 'prof_profesional';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ declare c uuid := (select (v->>'c')::uuid from r where k='G'); begin
  begin perform d360_alumnos_activar(c, array[(select (v->>'x')::uuid from r where k='G')]); raise exception 'FALLO pasa el límite';
  exception when raise_exception then if sqlerrm not like '%permite 3 estudiantes con acceso en línea%' then raise exception 'FALLO mensaje límite: %', sqlerrm; end if; end;
  raise notice 'OK respeta el límite de estudiantes con acceso del plan';
  perform d360_alumnos_desactivar(c, array[(select (v->>'fuera')::uuid from r where k='G')]);
  perform d360_alumnos_activar(c, array[(select (v->>'x')::uuid from r where k='G')]);
  raise notice 'OK desactivar a uno libera su cupo';
end $$;
reset role; update planes set max_estudiantes_portal = 250 where id = 'prof_profesional';

-- Actividad con los 4 tipos de pregunta
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ declare c uuid := (select (v->>'c')::uuid from r where k='G'); g uuid := (select (v->>'g')::uuid from r where k='G'); act uuid; q1 uuid; q2 uuid; q3 uuid; q4 uuid; tok text; begin
  insert into actividades(cuenta_id, grupo_id, tipo, titulo, peso, mostrar_nota) values (c, g, 'examen', 'Examen de cinemática', 20, true) returning id into act;
  begin perform d360_actividad_publicar(act); raise exception 'FALLO publica sin preguntas';
  exception when raise_exception then raise notice 'OK no se publica una actividad sin preguntas'; end;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, opciones, correcta, puntos) values
    (c, act, 1, 'opcion', '¿Unidad de velocidad?', '["m/s","kg","N"]', '0', 2) returning id into q1;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, correcta, puntos) values (c, act, 2, 'vf', 'La aceleración es un vector', 'true', 1) returning id into q2;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, correcta, puntos) values (c, act, 3, 'corta', 'Capital de Francia', '["Paris","Parí"]', 3) returning id into q3;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, puntos) values (c, act, 4, 'desarrollo', 'Explica la inercia', 4) returning id into q4;
  begin insert into preguntas(cuenta_id, actividad_id, tipo, enunciado, opciones, correcta) values (c, act, 'opcion', 'Mala', '["a","b"]', '5');
    raise exception 'FALLO acepta respuesta fuera de rango';
  exception when check_violation then raise notice 'OK no acepta una opción correcta que no existe'; end;
  tok := d360_actividad_publicar(act);
  if tok !~ '^[a-z0-9]{10}$' then raise exception 'FALLO token %', tok; end if;
  if (select puntaje_max from evaluaciones e join actividades a on a.evaluacion_id = e.id where a.id = act) <> 10 then raise exception 'FALLO evaluación vinculada'; end if;
  raise notice 'OK al publicar crea la evaluación (sobre 10 puntos) y un enlace propio';
  insert into r values ('A', jsonb_build_object('act', act, 'tok', tok, 'q1', q1, 'q2', q2, 'q3', q3, 'q4', q4));
end $$;

-- El estudiante, sin sesión
reset role; set role anon; set request.jwt.claim.sub = ''; set request.headers = '{"x-forwarded-for": "9.9.9.9"}';
do $$ declare t text := (select v->>'tok' from r where k='A'); res jsonb; s text; q jsonb := (select v from r where k='A'); begin
  begin perform 1 from preguntas; raise exception 'FALLO anon lee preguntas';
  exception when insufficient_privilege then raise notice 'OK sin sesión no se pueden leer las preguntas ni sus respuestas'; end;
  res := d360_alumno_ver(t);
  if res->>'estado' <> 'abierta' or (res->>'preguntas')::int <> 4 then raise exception 'FALLO ver %', res; end if;
  if d360_alumno_ver('noexiste00')->>'motivo' <> 'no_existe' then raise exception 'FALLO token falso'; end if;
  if d360_alumno_entrar(t, '000000')->>'motivo' <> 'codigo' then raise exception 'FALLO código falso'; end if;
  if d360_alumno_entrar(t, (select v->>'pf' from r where k='G'))->>'motivo' is null then raise exception 'FALLO entra desactivado'; end if;
  raise notice 'OK un código falso o desactivado no entra';
  res := d360_alumno_entrar(t, (select v->>'pa' from r where k='G'));
  if not (res->>'ok')::boolean or res->>'nombre' <> 'Ana' or jsonb_array_length(res->'preguntas') <> 4 then raise exception 'FALLO entrar %', res; end if;
  if res::text like '%correcta%' or res::text like '%"Paris"%' then raise exception 'FALLO se filtran respuestas correctas'; end if;
  raise notice 'OK entra con su código y recibe las preguntas SIN las respuestas correctas';
  s := res->>'sesion';
  if not (d360_alumno_guardar(s, jsonb_build_object(q->>'q1', 0, 'basura', 'x'))->>'ok')::boolean then raise exception 'FALLO guardar'; end if;
  res := d360_alumno_enviar(s, jsonb_build_object(q->>'q1', 0, q->>'q2', false, q->>'q3', '  parís ', q->>'q4', 'Es la tendencia a seguir igual'));
  if (res->'resultado'->>'pendiente')::boolean is not true or (res->'resultado'->>'puntaje')::numeric <> 5 then raise exception 'FALLO enviar %', res; end if;
  raise notice 'OK califica solo: opción (2) + V/F mal (0) + corta sin importar tildes ni mayúsculas (3) = 5; desarrollo queda pendiente';
  if (d360_alumno_guardar(s, '{}')->>'motivo') <> 'sesion' then raise exception 'FALLO sesión reutilizable'; end if;
  raise notice 'OK después de enviar, la sesión ya no sirve';
  res := d360_alumno_entrar(t, (select v->>'pa' from r where k='G'));
  if res->'resultado'->>'estado' <> 'enviada' or res ? 'sesion' then raise exception 'FALLO segundo intento %', res; end if;
  raise notice 'OK con 1 intento, al volver a entrar ve su resultado (no puede repetir)';
  -- Beto: deja el desarrollo en blanco → nota inmediata
  res := d360_alumno_entrar(t, (select v->>'pb' from r where k='G'));
  res := d360_alumno_enviar(res->>'sesion', jsonb_build_object(q->>'q1', 1, q->>'q2', true, q->>'q3', '3,0'));
  if (res->'resultado'->>'pendiente')::boolean or (res->'resultado'->>'puntaje')::numeric <> 1 then raise exception 'FALLO beto %', res; end if;
end $$;
reset role;
do $$ declare ev uuid := (select evaluacion_id from actividades where id = (select (v->>'act')::uuid from r where k='A')); begin
  if exists(select 1 from calificaciones where evaluacion_id = ev and estudiante_id = (select (v->>'a')::uuid from r where k='G')) then raise exception 'FALLO nota antes de revisar'; end if;
  if (select puntaje from calificaciones where evaluacion_id = ev and estudiante_id = (select (v->>'b')::uuid from r where k='G')) <> 1 then raise exception 'FALLO nota de Beto'; end if;
  raise notice 'OK sin desarrollo pendiente, la nota pasa sola a Calificaciones';
end $$;

-- El profesor revisa el desarrollo de Ana
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ declare act uuid := (select (v->>'act')::uuid from r where k='A'); en uuid; res jsonb; ev uuid; begin
  res := d360_actividad_resultados(act);
  if jsonb_array_length(res) <> 3 then raise exception 'FALLO resultados %', res; end if;
  select id into en from entregas where actividad_id = act and estudiante_id = (select (v->>'a')::uuid from r where k='G');
  begin perform d360_entrega_revisar(en, jsonb_build_object((select v->>'q4' from r where k='A'), 9)); raise exception 'FALLO acepta más puntos';
  exception when raise_exception then null; end;
  res := d360_entrega_revisar(en, jsonb_build_object((select v->>'q4' from r where k='A'), 3), 'Bien explicado');
  if (res->>'puntaje')::numeric <> 8 or (res->>'pendiente')::boolean then raise exception 'FALLO revisar %', res; end if;
  select evaluacion_id into ev from actividades where id = act;
  if (select puntaje from calificaciones where evaluacion_id = ev and estudiante_id = (select (v->>'a')::uuid from r where k='G')) <> 8 then raise exception 'FALLO nota revisada'; end if;
  raise notice 'OK al revisar el desarrollo (3 de 4) la nota final 8/10 pasa a Calificaciones';
  begin update preguntas set puntos = 5 where actividad_id = act; raise exception 'FALLO edita preguntas con entregas';
  exception when raise_exception then raise notice 'OK con respuestas recibidas, las preguntas ya no se cambian'; end;
end $$;

-- Tiempo límite: se califica lo guardado
set role authenticated;
do $$ declare c uuid := (select (v->>'c')::uuid from r where k='G'); g uuid := (select (v->>'g')::uuid from r where k='G'); act uuid; q uuid; tok text; begin
  insert into actividades(cuenta_id, grupo_id, tipo, titulo, duracion_min) values (c, g, 'examen', 'Rápido', 5) returning id into act;
  insert into preguntas(cuenta_id, actividad_id, tipo, enunciado, correcta, puntos) values (c, act, 'vf', '¿Sí?', 'true', 1) returning id into q;
  tok := d360_actividad_publicar(act);
  insert into r values ('T', jsonb_build_object('act', act, 'tok', tok, 'q', q));
end $$;
reset role; set role anon;
do $$ declare res jsonb; s text; begin
  res := d360_alumno_entrar((select v->>'tok' from r where k='T'), (select v->>'pa' from r where k='G'));
  s := res->>'sesion';
  perform d360_alumno_guardar(s, jsonb_build_object((select v->>'q' from r where k='T'), true));
  insert into r values ('S', jsonb_build_object('s', s));
end $$;
reset role; update entregas set limite = now() - interval '10 minutes' where actividad_id = (select (v->>'act')::uuid from r where k='T');
set role anon;
do $$ declare res jsonb; begin
  res := d360_alumno_enviar((select v->>'s' from r where k='S'), jsonb_build_object((select v->>'q' from r where k='T'), false));
  if (res->'resultado'->>'puntaje')::numeric <> 1 then raise exception 'FALLO tiempo %', res; end if;
  raise notice 'OK fuera de tiempo no cambia respuestas: califica lo que quedó guardado';
end $$;

-- Otra cuenta no ve nada
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  if exists(select 1 from actividades) or exists(select 1 from entregas) then raise exception 'FALLO otra cuenta ve actividades'; end if;
  begin perform d360_actividad_resultados((select (v->>'act')::uuid from r where k='A')); raise exception 'FALLO resultados ajenos';
  exception when insufficient_privilege then raise notice 'OK otra cuenta no ve actividades, entregas ni resultados'; end;
end $$;
