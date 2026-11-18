-- Portal del estudiante sin enlace: entra con el código del espacio y su código personal
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000e1','prof@test');
create temp table r(k text, v jsonb); grant all on r to authenticated, anon;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
insert into r select 'C', d360_crear_cuenta('profesor','Clases','Prof','prof_profesional', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); g1 uuid; g2 uuid; e uuid; a1 uuid; a2 uuid; a3 uuid; res jsonb; begin
  insert into grupos(cuenta_id, nombre) values (c, 'Mío') returning id into g1;
  insert into grupos(cuenta_id, nombre) values (c, 'Otro') returning id into g2;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Eva', 'Uno') returning id into e;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado) values (g1, e, c, current_date, 'activo');
  res := d360_alumnos_activar(c, array[e]);
  insert into actividades(cuenta_id, grupo_id, titulo) values (c, g1, 'Examen mío') returning id into a1;
  insert into preguntas(cuenta_id, actividad_id, tipo, enunciado, correcta) values (c, a1, 'vf', '¿Sí?', 'true');
  perform d360_actividad_publicar(a1);
  insert into actividades(cuenta_id, grupo_id, titulo) values (c, g2, 'Examen ajeno') returning id into a2;
  insert into preguntas(cuenta_id, actividad_id, tipo, enunciado, correcta) values (c, a2, 'vf', '¿Sí?', 'true');
  perform d360_actividad_publicar(a2);
  insert into actividades(cuenta_id, grupo_id, titulo) values (c, g1, 'Borrador') returning id into a3;
  insert into r values ('X', jsonb_build_object('pin', res->0->>'codigo', 'esp', (select codigo from cuentas where id = c)));
end $$;
reset role; set role anon; set request.headers = '{"x-forwarded-for": "9.9.9.9"}';
do $$ declare x jsonb := (select v from r where k='X'); p jsonb; n int; begin
  p := d360_alumno_portal(lower(x->>'esp'), x->>'pin');
  if not (p->>'ok')::boolean or p->>'nombre' <> 'Eva' then raise exception 'FALLO entrar %', p; end if;
  raise notice 'OK el estudiante entra con el código del espacio (sin importar mayúsculas) y su código personal';
  if jsonb_array_length(p->'actividades') <> 1 or p->'actividades'->0->>'titulo' <> 'Examen mío' or p->'actividades'->0->>'token' is null then raise exception 'FALLO lista %', p; end if;
  raise notice 'OK solo ve las actividades publicadas de sus grupos (no borradores ni de otros grupos)';
  p := d360_alumno_portal('ZZZZZZ', x->>'pin');
  if p->>'motivo' <> 'codigo' then raise exception 'FALLO espacio inexistente %', p; end if;
  p := d360_alumno_portal(x->>'esp', '000000');
  if p->>'motivo' <> 'codigo' then raise exception 'FALLO pin malo %', p; end if;
  raise notice 'OK espacio inexistente y código malo dan el mismo mensaje';
  for n in 1..8 loop p := d360_alumno_portal(x->>'esp', '111111'); end loop;
  p := d360_alumno_portal(x->>'esp', x->>'pin');
  if p->>'motivo' <> 'bloqueado' then raise exception 'FALLO sin bloqueo %', p; end if;
  raise notice 'OK tras varios intentos fallidos se bloquea 15 minutos, aunque luego ponga el código bueno';
end $$;
reset role;
do $$ begin
  if exists(select 1 from entregas) then raise exception 'FALLO inició un examen'; end if;
  raise notice 'OK ver la lista no inicia ningún examen';
end $$;
-- Al bajar a Básico, el portal no está disponible
update suscripciones set plan_id = 'prof_basico';
delete from acceso_intentos;
set role anon;
do $$ declare x jsonb := (select v from r where k='X'); p jsonb; begin
  p := d360_alumno_portal(x->>'esp', x->>'pin');
  if p->>'motivo' <> 'no_disponible' then raise exception 'FALLO plan sin portal %', p; end if;
  raise notice 'OK si el plan no incluye el portal, avisa que no está disponible';
end $$;
