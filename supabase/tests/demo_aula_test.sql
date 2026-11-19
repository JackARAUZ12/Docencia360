-- Demo con aula virtual, sin subidas en la demo, y limpieza de archivos
\set ON_ERROR_STOP 1
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000d0','dueno@test');
insert into plataforma_admins(user_id) values ('00000000-0000-0000-0000-0000000000d0');
select d360_sembrar_demos();
select d360_sembrar_demo_aula();
select d360_sembrar_demo_aula();   -- se puede repetir
do $$ declare c uuid := (select id from cuentas where codigo = 'DEMOPR'); begin
  if (select count(*) from actividades where cuenta_id = c and estado <> 'borrador') <> 4 then raise exception 'FALLO actividades demo %', (select count(*) from actividades where cuenta_id = c); end if;
  if (select count(*) from avisos_aula where cuenta_id = c) <> 2 or (select count(*) from materiales where cuenta_id = c) <> 2 then raise exception 'FALLO avisos/materiales'; end if;
  if (select count(*) from estudiantes_acceso where cuenta_id = c) < 10 then raise exception 'FALLO accesos %', (select count(*) from estudiantes_acceso where cuenta_id = c); end if;
  raise notice 'OK la demo del profesor trae aula: actividades, avisos, materiales y estudiantes con acceso';
end $$;
create temp table r(k text, v jsonb); grant all on r to anon, service_role;
set role anon; set request.headers = '{"x-forwarded-for": "3.3.3.3"}';
do $$ declare i jsonb; s text; act jsonb; tok text; begin
  i := d360_aula_entrar('DEMOPR', '246810');
  if not (i->>'ok')::boolean then raise exception 'FALLO entrar a la demo %', i; end if;
  s := i->>'sesion';
  i := d360_aula_inicio(s);
  if jsonb_array_length(i->'actividades') < 3 or jsonb_array_length(i->'avisos') <> 2 then raise exception 'FALLO aula demo %', i; end if;
  if not exists(select 1 from jsonb_array_elements(i->'actividades') x where x->>'titulo' = 'Quiz: proporciones' and (x->>'puntaje')::numeric = 1 and x->>'comentario' is not null) then
    raise exception 'FALLO quiz calificado %', i->'actividades'; end if;
  raise notice 'OK con DEMOPR y 246810 se entra al aula de la demo y se ve un quiz ya calificado con comentario';
  select x->>'token' into tok from jsonb_array_elements(i->'actividades') x where x->>'titulo' like 'Tarea: foto%';
  act := d360_aula_actividad(s, tok);
  insert into r values ('E', jsonb_build_object('ent', act->>'sesion'));
end $$;
reset role; set role service_role;
do $$ declare f jsonb; begin
  f := d360_srv_archivo_subir((select v->>'ent' from r where k='E'), 'foto.jpg', 1000, 'image/jpeg');
  if (f->>'ok')::boolean or f->>'error' not like '%demostración%' then raise exception 'FALLO subió en demo %', f; end if;
  raise notice 'OK en la demo no se suben archivos (aviso claro)';
end $$;
reset role;
-- Limpieza: archivo de más de un año y material borrado pasan a la cola
do $$ declare c uuid := (select id from cuentas where codigo = 'DEMOPR'); en uuid; m uuid; k text := (select valor from secretos_servidor where clave = 'clave_limpieza'); res jsonb; begin
  select id into en from entregas where cuenta_id = c limit 1;
  insert into entrega_archivos(cuenta_id, entrega_id, path, nombre, tamano, tipo, creado) values
    (c, en, c || '/entregas/viejo.jpg', 'viejo.jpg', 10, 'image/jpeg', now() - interval '400 days'),
    (c, en, c || '/entregas/nuevo.jpg', 'nuevo.jpg', 10, 'image/jpeg', now());
  insert into materiales(cuenta_id, grupo_id, titulo, archivo_path, archivo_nombre) select c, grupo_id, 'Temporal', c || '/materiales/t.pdf', 't.pdf' from materiales where cuenta_id = c limit 1 returning id into m;
  delete from materiales where id = m;
  res := d360_srv_limpieza(k);
  if (res->>'vencidos')::int <> 1 or not (res->'paths') ? (c || '/entregas/viejo.jpg') or not (res->'paths') ? (c || '/materiales/t.pdf')
     or (res->'paths') ? (c || '/entregas/nuevo.jpg') then raise exception 'FALLO limpieza %', res; end if;
  raise notice 'OK los archivos de más de un año y los materiales borrados pasan a la cola de borrado; los recientes se quedan';
  if d360_srv_limpieza_hecha(k, array[c || '/entregas/viejo.jpg']) <> 1 then raise exception 'FALLO confirmar'; end if;
  begin perform d360_srv_limpieza('clave-falsa'); raise exception 'FALLO aceptó clave falsa';
  exception when insufficient_privilege then raise notice 'OK la limpieza exige la clave secreta del servidor'; end;
end $$;
-- Demo de academia: aula con código fijo (también se puede repetir)
reset role;
select d360_sembrar_demo_academia(); select d360_sembrar_demo_crecimiento(); select d360_sembrar_demo_aula_academia(); select d360_sembrar_demo_aula_academia();
set role anon; set request.headers = '{"x-forwarded-for": "3.3.3.4"}';
do $$ declare i jsonb; s text; txt text; begin
  i := d360_aula_entrar('DEMOAC', '246810');
  if not (i->>'ok')::boolean then raise exception 'FALLO entrar al aula de la demo de academia %', i; end if;
  s := i->>'sesion';
  i := d360_aula_inicio(s);
  txt := (select string_agg(v->>'texto', ' | ') from jsonb_array_elements(i->'avisos') v);
  if i->>'modalidad' <> 'academia' or jsonb_array_length(i->'actividades') <> 3 or jsonb_array_length(i->'materiales') <> 2
     or not exists(select 1 from jsonb_array_elements(i->'actividades') x where x->>'titulo' = 'Quiz: los números del 1 al 20' and (x->>'puntaje')::numeric = 1 and x->>'comentario' is not null)
     or txt not like '%conversación en parejas%' or txt not like '%Inscripciones abiertas%' then raise exception 'FALLO aula demo academia %', i; end if;
  if jsonb_typeof(i->'cobros') <> 'array' or jsonb_array_length(i->'cobros') = 0 then raise exception 'FALLO pagos en aula demo academia'; end if;
  raise notice 'OK con DEMOAC y 246810 se entra al aula de la academia: tareas, quiz calificado, avisos, comunicados y pagos';
end $$;
reset role;
