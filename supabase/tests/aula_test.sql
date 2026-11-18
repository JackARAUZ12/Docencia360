-- Aula virtual: sesión del estudiante, su panel, actividades desde el aula, archivos y calificación del archivo
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000f1','prof@test');
create temp table r(k text, v jsonb); grant all on r to authenticated, anon, service_role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
insert into r select 'C', d360_crear_cuenta('profesor','Clases','Prof','prof_profesional', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); g1 uuid; g2 uuid; e uuid; e2 uuid; a1 uuid; a2 uuid; res jsonb; begin
  insert into grupos(cuenta_id, nombre) values (c, 'Mío') returning id into g1;
  insert into grupos(cuenta_id, nombre) values (c, 'Otro') returning id into g2;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Eva', 'Uno') returning id into e;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Leo', 'Dos') returning id into e2;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado) values (g1, e, c, current_date, 'activo'), (g2, e2, c, current_date, 'activo');
  res := d360_alumnos_activar(c, array[e, e2]);
  -- Tarea solo con archivo (10 puntos) y examen con una pregunta
  insert into actividades(cuenta_id, grupo_id, titulo, tipo, permite_archivos, puntos_archivo) values (c, g1, 'Foto de la tarea', 'tarea', true, 10) returning id into a1;
  insert into actividades(cuenta_id, grupo_id, titulo) values (c, g2, 'Examen del otro grupo') returning id into a2;
  insert into preguntas(cuenta_id, actividad_id, tipo, enunciado, correcta) values (c, a2, 'vf', '¿Sí?', 'true');
  insert into r values ('X', jsonb_build_object('pin', (select x->>'codigo' from jsonb_array_elements(res) x where x->>'nombre' like 'Eva%'),
    'esp', (select codigo from cuentas where id = c), 'tok', d360_actividad_publicar(a1), 'tok2', d360_actividad_publicar(a2), 'a1', a1, 'g1', g1, 'c', c));
  insert into avisos_aula(cuenta_id, grupo_id, texto) values (c, g1, 'Mañana hay examen'), (c, g2, 'Aviso de otro grupo');
  insert into materiales(cuenta_id, grupo_id, titulo, url) values (c, g1, 'Video de repaso', 'https://youtu.be/x');
  insert into materiales(cuenta_id, grupo_id, titulo, url) values (c, g2, 'Material ajeno', 'https://ejemplo.com');
  raise notice 'OK una tarea solo con archivo (sin preguntas) se puede publicar si el archivo tiene puntos';
  begin
    insert into materiales(cuenta_id, grupo_id, titulo, archivo_path, archivo_nombre) values (c, g1, 'Ruta ajena', gen_random_uuid() || '/x.pdf', 'x.pdf');
    raise exception 'FALLO material con ruta de otra cuenta';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; raise notice 'OK un material no puede apuntar a archivos de otra cuenta'; end;
end $$;
reset role; set role anon; set request.headers = '{"x-forwarded-for": "7.1.1.1"}';
do $$ declare x jsonb := (select v from r where k='X'); s text; i jsonb; act jsonb; f jsonb; begin
  i := d360_aula_entrar(x->>'esp', '000000');
  if i->>'motivo' <> 'codigo' then raise exception 'FALLO código malo %', i; end if;
  i := d360_aula_entrar(x->>'esp', x->>'pin', true);
  if not (i->>'ok')::boolean or length(i->>'sesion') <> 48 then raise exception 'FALLO entrar %', i; end if;
  s := i->>'sesion';
  raise notice 'OK el estudiante entra con sus códigos y recibe una sesión que el aparato recuerda';
  i := d360_aula_inicio(s);
  if i->>'nombre' <> 'Eva Uno' or jsonb_array_length(i->'actividades') <> 1 or jsonb_array_length(i->'avisos') <> 1 or jsonb_array_length(i->'materiales') <> 1
     or i->'avisos'->0->>'texto' <> 'Mañana hay examen' then raise exception 'FALLO panel %', i; end if;
  raise notice 'OK su aula muestra solo actividades, avisos y materiales de sus grupos';
  if i->'notas' is null or i->'asistencia' is null then raise exception 'FALLO sin notas/asistencia'; end if;
  raise notice 'OK su aula trae sus notas y su asistencia';
  act := d360_aula_actividad(s, x->>'tok2');
  if act->>'motivo' <> 'otro_grupo' then raise exception 'FALLO abrió actividad de otro grupo %', act; end if;
  raise notice 'OK no puede abrir actividades de otros grupos aunque tenga el enlace';
  act := d360_aula_actividad(s, x->>'tok');
  if not (act->>'ok')::boolean or not (act->>'permite_archivos')::boolean or act->>'sesion' is null then raise exception 'FALLO abrir tarea %', act; end if;
  raise notice 'OK abre su tarea desde el aula sin volver a escribir el código';
  insert into r values ('S', jsonb_build_object('aula', s, 'ent', act->>'sesion'));
  if d360_aula_inicio('x' || repeat('0', 47))->>'motivo' <> 'sesion' then raise exception 'FALLO sesión falsa'; end if;
  raise notice 'OK una sesión inventada no entra';
  begin perform d360_srv_archivo_subir(act->>'sesion', 'a.jpg', 100, 'image/jpeg'); raise exception 'FALLO anon reserva archivo';
  exception when insufficient_privilege then raise notice 'OK sin el servidor de archivos nadie puede reservar archivos'; end;
end $$;
reset role; set role service_role;
do $$ declare y jsonb := (select v from r where k='S'); f jsonb; begin
  f := d360_srv_archivo_subir(y->>'ent', 'tarea.exe', 100, 'application/x-msdownload');
  if (f->>'ok')::boolean then raise exception 'FALLO aceptó .exe'; end if;
  f := d360_srv_archivo_subir(y->>'ent', 'grande.pdf', 6000000, 'application/pdf');
  if (f->>'ok')::boolean then raise exception 'FALLO aceptó 6 MB'; end if;
  raise notice 'OK solo fotos y PDF de hasta 5 MB';
  f := d360_srv_archivo_subir(y->>'ent', 'foto.jpg', 300000, 'image/jpeg');
  if not (f->>'ok')::boolean or f->>'path' not like (select v->>'c' from r where k='X') || '/entregas/%' then raise exception 'FALLO subir %', f; end if;
  raise notice 'OK el archivo se guarda en la carpeta privada de la cuenta';
  if not (d360_srv_archivo_ver(y->>'aula', null, (f->>'id')::uuid)->>'ok')::boolean then raise exception 'FALLO no ve su archivo'; end if;
  raise notice 'OK el estudiante puede volver a ver su propio archivo';
end $$;
reset role; set role anon;
do $$ declare y jsonb := (select v from r where k='S'); res jsonb; begin
  res := d360_alumno_enviar(y->>'ent', '{}'::jsonb);
  if not (res->>'ok')::boolean or not (res->'resultado'->>'pendiente')::boolean then raise exception 'FALLO enviar %', res; end if;
  raise notice 'OK al entregar solo con archivo queda pendiente de revisión del profesor';
end $$;
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ declare x jsonb := (select v from r where k='X'); en uuid; res jsonb; n int; begin
  select id into en from entregas where actividad_id = (x->>'a1')::uuid and estado = 'enviada';
  select count(*) into n from entrega_archivos where entrega_id = en;
  if n <> 1 then raise exception 'FALLO el profesor no ve el archivo'; end if;
  res := d360_entrega_revisar(en, '{"archivo": 8}'::jsonb, 'Buen trabajo');
  if (res->>'puntaje')::numeric <> 8 or (res->>'pendiente')::boolean then raise exception 'FALLO revisar %', res; end if;
  raise notice 'OK el profesor ve el archivo, lo califica (8/10) y la nota pasa al cuaderno';
  if (select puntaje from calificaciones where evaluacion_id = (select evaluacion_id from actividades where id = (x->>'a1')::uuid)) <> 8 then raise exception 'FALLO no volcó la nota'; end if;
end $$;
reset role; set role anon;
do $$ declare y jsonb := (select v from r where k='S'); i jsonb; begin
  i := d360_aula_inicio(y->>'aula');
  if (i->'actividades'->0->>'puntaje')::numeric <> 8 or i->'actividades'->0->>'comentario' <> 'Buen trabajo' then raise exception 'FALLO no ve su nota %', i->'actividades'; end if;
  raise notice 'OK el estudiante ve su nota y el comentario del profesor en su aula';
  perform d360_aula_salir(y->>'aula');
  if d360_aula_inicio(y->>'aula')->>'motivo' <> 'sesion' then raise exception 'FALLO salir'; end if;
  raise notice 'OK «Salir» cierra la sesión del aparato';
end $$;
reset role;
update estudiantes_acceso set activo = false;
set role anon;
do $$ declare x jsonb := (select v from r where k='X'); i jsonb; begin
  i := d360_aula_entrar(x->>'esp', x->>'pin');
  if (i->>'ok')::boolean then raise exception 'FALLO entra con acceso quitado'; end if;
  raise notice 'OK si el profesor le quita el acceso, ya no entra';
end $$;
