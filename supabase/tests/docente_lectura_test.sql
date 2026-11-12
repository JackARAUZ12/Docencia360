-- Un docente/asistente solo lee a los estudiantes de sus grupos; el dueño y la dirección ven todo
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000b1','profe@test'),('00000000-0000-0000-0000-0000000000b2','asis@test');
create temp table r(k text, v jsonb); grant all on r to authenticated;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into r select 'C', d360_crear_cuenta('profesor','Clases Premium','Profe','prof_premium', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); g1 uuid; g2 uuid; a uuid; b uuid; ev uuid; mi uuid; begin
  insert into grupos(cuenta_id, nombre) values (c, 'Grupo del asistente') returning id into g1;
  insert into grupos(cuenta_id, nombre) values (c, 'Grupo solo del profe') returning id into g2;
  insert into estudiantes(cuenta_id, nombres, apellidos, documento) values (c, 'Ana', 'Visible', 'DOC-A') returning id into a;
  insert into estudiantes(cuenta_id, nombres, apellidos, documento, direccion) values (c, 'Beto', 'Oculto', 'DOC-B', 'Casa de Beto') returning id into b;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado) values (g1, a, c, current_date, 'activo'), (g2, b, c, current_date, 'activo');
  insert into evaluaciones(cuenta_id, grupo_id, titulo, fecha, peso) values (c, g2, 'Examen', current_date, 10) returning id into ev;
  insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje) values (c, ev, b, 55);
  insert into asistencias(cuenta_id, grupo_id, estudiante_id, fecha, estado) values (c, g2, b, current_date, 'ausente');
  insert into observaciones(cuenta_id, estudiante_id, texto, autor) values (c, b, 'Observación privada de Beto', auth.uid());
  insert into r values ('G', jsonb_build_object('g1', g1, 'g2', g2, 'a', a, 'b', b));
  mi := (d360_crear_miembro(c, 'Asistente', 'docente')->>'miembro_id')::uuid;
  insert into grupo_docentes(cuenta_id, grupo_id, miembro_id) values (c, g1, mi);
  insert into r values ('M', jsonb_build_object('m', mi));
end $$;
reset role;
update miembros set user_id = '00000000-0000-0000-0000-0000000000b2' where id = (select (v->>'m')::uuid from r where k='M');

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); b uuid := (select (v->>'b')::uuid from r where k='G'); begin
  if (select count(*) from estudiantes where cuenta_id = c) <> 1 or not exists(select 1 from estudiantes where nombres = 'Ana') then
    raise exception 'FALLO el asistente ve estudiantes ajenos a sus grupos'; end if;
  raise notice 'OK el asistente solo ve a los estudiantes de su grupo';
  if exists(select 1 from calificaciones where estudiante_id = b) or exists(select 1 from asistencias where estudiante_id = b)
     or exists(select 1 from observaciones where estudiante_id = b) or exists(select 1 from grupo_estudiantes where estudiante_id = b) then
    raise exception 'FALLO el asistente ve notas, asistencia, observaciones o inscripciones de otros grupos'; end if;
  raise notice 'OK no ve notas, asistencia, observaciones ni inscripciones de estudiantes ajenos';
  begin insert into observaciones(cuenta_id, estudiante_id, texto, autor) values (c, b, 'intruso', auth.uid()); raise exception 'FALLO escribe observación ajena';
  exception when insufficient_privilege then raise notice 'OK no puede escribir observaciones de estudiantes ajenos'; end;
  if (select count(*) from grupos where cuenta_id = c) <> 2 then raise exception 'FALLO estructura'; end if;
  raise notice 'OK sigue viendo la estructura (grupos, horarios) para trabajar';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); b uuid := (select (v->>'b')::uuid from r where k='G'); begin
  if (select count(*) from estudiantes where cuenta_id = c) <> 2 or not exists(select 1 from calificaciones where estudiante_id = b)
     or not exists(select 1 from observaciones where estudiante_id = b) then raise exception 'FALLO el dueño perdió acceso'; end if;
  raise notice 'OK el profesor dueño sigue viendo todo';
end $$;

-- Si al asistente lo quitan del grupo, deja de ver a esos estudiantes
reset role;
delete from grupo_docentes where miembro_id = (select (v->>'m')::uuid from r where k='M');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  if exists(select 1 from estudiantes where cuenta_id = (select (v->>'cuenta_id')::uuid from r where k='C')) then raise exception 'FALLO conserva acceso tras quitarlo del grupo'; end if;
  raise notice 'OK al quitarlo del grupo deja de ver a esos estudiantes';
end $$;

-- Mensajes de límite claros para el profesor
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  perform d360_crear_miembro((select (v->>'cuenta_id')::uuid from r where k='C'), 'Segundo asistente', 'docente');
  raise exception 'FALLO crea un segundo asistente';
exception when raise_exception then
  if sqlerrm not like 'Llegaste al máximo de asistentes de tu plan Premium (1)%' then raise exception 'FALLO mensaje: %', sqlerrm; end if;
  raise notice 'OK el límite de asistentes se explica con palabras claras';
end $$;
