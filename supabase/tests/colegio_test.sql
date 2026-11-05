-- Pruebas de la modalidad colegio
\set ON_ERROR_STOP 1
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000c1','dir@test'),('00000000-0000-0000-0000-0000000000c2','mate@test'),
  ('00000000-0000-0000-0000-0000000000c3','lengua@test'),('00000000-0000-0000-0000-0000000000c4','mama@test'),('00000000-0000-0000-0000-0000000000c9','admin@test');
create temp table r(k text, v jsonb); grant all on r to authenticated;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into r select 'C', public.d360_crear_cuenta('colegio','Colegio Prueba','Directora','col_avanzado');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); gr uuid; s uuid; am uuid; al uuid; p uuid; e1 uuid; e2 uuid; res jsonb; begin
  insert into grados(cuenta_id, nombre, matricula, colegiatura) values (c, '7mo', 1000, 1500) returning id into gr;
  insert into asignaturas(cuenta_id, nombre, grado_id) values (c, 'Matemática', gr) returning id into am;
  insert into asignaturas(cuenta_id, nombre, grado_id) values (c, 'Lengua', gr) returning id into al;
  insert into grupos(cuenta_id, nombre, grado_id, cupo) values (c, '7mo A', gr, 30) returning id into s;
  insert into grupos(cuenta_id, nombre, grado_id, cupo) values (c, '7mo B', gr, 30);
  insert into estudiantes(cuenta_id, nombres) values (c, 'Uno') returning id into e1;
  insert into estudiantes(cuenta_id, nombres) values (c, 'Dos') returning id into e2;
  res := d360_matricular_colegio(c, e1, s, 2026, 10, 2, 10, 25, 'Beca', null);
  if (res->>'cargos')::int <> 11 then raise exception 'FALLO cargos colegio %', res; end if;
  if (select count(*) from cargos where tipo='colegiatura' and descuento = 375) <> 10 then raise exception 'FALLO beca'; end if;
  if not exists(select 1 from cargos where concepto like 'Colegiatura noviembre 2026%' and vence = '2026-11-10') then raise exception 'FALLO concepto/vence'; end if;
  raise notice 'OK matrícula escolar: matrícula + 10 colegiaturas con beca';
  begin perform d360_matricular_colegio(c, e1, (select id from grupos where nombre='7mo B'), 2026); raise exception 'FALLO doble matrícula';
  exception when raise_exception then raise notice 'OK no permite doble matrícula en el año'; end;
  perform d360_matricular_colegio(c, e2, s, 2026);
  perform d360_trasladar_seccion((select id from matriculas where estudiante_id = e2), (select id from grupos where nombre='7mo B'), 'Prueba');
  if (select estado from grupo_estudiantes where estudiante_id = e2 and grupo_id = s) <> 'retirado' then raise exception 'FALLO traslado'; end if;
  perform d360_trasladar_seccion((select id from matriculas where estudiante_id = e2), s, 'Regresa');
  raise notice 'OK traslado de sección';
  insert into periodos(cuenta_id, nombre, inicio, fin, orden) values (c, 'I Corte', '2026-02-01', '2026-04-10', 9) returning id into p;
  insert into r values ('ids', jsonb_build_object('s', s, 'am', am, 'al', al, 'p', p, 'e1', e1, 'e2', e2));
end $$;
-- Docentes: Matemática y Lengua en la misma sección
insert into r select 'DM', public.d360_crear_miembro((select (v->>'cuenta_id')::uuid from r where k='C'),'Profe Mate','docente');
insert into r select 'DL', public.d360_crear_miembro((select (v->>'cuenta_id')::uuid from r where k='C'),'Profe Lengua','docente');
insert into grupo_docentes(cuenta_id, grupo_id, miembro_id, asignatura_id) select (select (v->>'cuenta_id')::uuid from r where k='C'), (v->>'s')::uuid, (select (v->>'miembro_id')::uuid from r where k='DM'), (v->>'am')::uuid from r where k='ids';
insert into grupo_docentes(cuenta_id, grupo_id, miembro_id, asignatura_id) select (select (v->>'cuenta_id')::uuid from r where k='C'), (v->>'s')::uuid, (select (v->>'miembro_id')::uuid from r where k='DL'), (v->>'al')::uuid from r where k='ids';
reset role;
update miembros set user_id='00000000-0000-0000-0000-0000000000c2' where nombre='Profe Mate';
update miembros set user_id='00000000-0000-0000-0000-0000000000c3' where nombre='Profe Lengua';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
do $$ declare x jsonb := (select v from r where k='ids'); c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); ev uuid; rec uuid; n record; begin
  insert into evaluaciones(cuenta_id, grupo_id, asignatura_id, periodo_id, titulo, peso) values (c, (x->>'s')::uuid, (x->>'am')::uuid, (x->>'p')::uuid, 'Examen', 60) returning id into ev;
  insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje) values (c, ev, (x->>'e1')::uuid, 40), (c, ev, (x->>'e2')::uuid, 90);
  insert into evaluaciones(cuenta_id, grupo_id, asignatura_id, periodo_id, titulo, peso) values (c, (x->>'s')::uuid, (x->>'am')::uuid, (x->>'p')::uuid, 'Tarea', 40) returning id into ev;
  insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje) values (c, ev, (x->>'e1')::uuid, 50), (c, ev, (x->>'e2')::uuid, 80);
  raise notice 'OK el docente de Matemática califica su asignatura';
  begin
    insert into evaluaciones(cuenta_id, grupo_id, asignatura_id, periodo_id, titulo) values (c, (x->>'s')::uuid, (x->>'al')::uuid, (x->>'p')::uuid, 'Intruso');
    raise exception 'FALLO califica otra asignatura';
  exception when insufficient_privilege then raise notice 'OK no puede calificar Lengua en la misma sección'; end;
  select * into n from d360_notas_seccion((x->>'s')::uuid, (x->>'p')::uuid) where estudiante_id = (x->>'e1')::uuid;
  if n.final <> 44.0 then raise exception 'FALLO nota corte %', n.final; end if;    -- 40*.6 + 50*.4
  insert into evaluaciones(cuenta_id, grupo_id, asignatura_id, periodo_id, titulo, tipo, peso) values (c, (x->>'s')::uuid, (x->>'am')::uuid, (x->>'p')::uuid, 'Recuperación', 'recuperacion', 0) returning id into rec;
  insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje) values (c, rec, (x->>'e1')::uuid, 65);
  select * into n from d360_notas_seccion((x->>'s')::uuid, (x->>'p')::uuid) where estudiante_id = (x->>'e1')::uuid;
  if n.final <> 65.0 or n.promedio <> 44.0 then raise exception 'FALLO recuperación %', n; end if;
  raise notice 'OK nota de corte ponderada (44) y recuperación (65)';
  insert into boletin_comentarios(cuenta_id, estudiante_id, periodo_id, conducta, comentario) values (c, (x->>'e1')::uuid, (x->>'p')::uuid, 'AS', 'Bien');
  raise notice 'OK el docente de la sección escribe comentarios de boletín';
end $$;
-- Tutor: solo ve a su hijo
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into r select 'T', public.d360_vincular_tutor((select (v->>'cuenta_id')::uuid from r where k='C'), (select (v->>'e1')::uuid from r where k='ids'), 'Mamá de Uno', '8888', 'Madre');
reset role; update miembros set user_id='00000000-0000-0000-0000-0000000000c4' where nombre='Mamá de Uno';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c4';
do $$ begin
  if (select count(*) from estudiantes) <> 1 then raise exception 'FALLO tutor ve % estudiantes', (select count(*) from estudiantes); end if;
  if (select count(*) from calificaciones) <> 3 then raise exception 'FALLO tutor ve % notas', (select count(*) from calificaciones); end if;
  if (select count(*) from cargos) <> 11 then raise exception 'FALLO tutor ve % cobros', (select count(*) from cargos); end if;
  if (select count(*) from boletin_comentarios) <> 1 then raise exception 'FALLO tutor comentarios'; end if;
  if (select count(*) from miembros where rol = 'docente') <> 0 then raise exception 'FALLO tutor ve personal'; end if;
  begin insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje) select cuenta_id, evaluacion_id, estudiante_id, 100 from calificaciones limit 1;
    raise exception 'FALLO tutor escribe notas';
  exception when insufficient_privilege or unique_violation then raise notice 'OK tutor: solo su hijo, sin escribir notas'; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ declare r2 jsonb; begin
  r2 := d360_resumen_colegio((select (v->>'cuenta_id')::uuid from r where k='C'));
  if (r2->>'grados')::int <> 1 or (r2->>'secciones')::int <> 2 then raise exception 'FALLO resumen %', r2; end if;
  raise notice 'OK resumen institucional';
end $$;
-- Demo de colegio completa
reset role;
insert into plataforma_admins(user_id) values ('00000000-0000-0000-0000-0000000000c9');
select d360_sembrar_demo_colegio();
select d360_sembrar_demo_colegio();
do $$ declare c uuid := (select id from cuentas where codigo='DEMOCO'); begin
  if (select count(*) from estudiantes where cuenta_id = c) <> 175 then raise exception 'FALLO estudiantes demo %', (select count(*) from estudiantes where cuenta_id = c); end if;
  if (select count(*) from horarios where cuenta_id = c) < 120 then raise exception 'FALLO horarios demo %', (select count(*) from horarios where cuenta_id = c); end if;
  if (select count(*) from calificaciones where cuenta_id = c) < 5000 then raise exception 'FALLO notas demo'; end if;
  if (select count(*) from tutores_estudiantes where cuenta_id = c) <> 2 then raise exception 'FALLO familia demo'; end if;
  if not (d360_demo_miembro('colegio-familia', 'x')->>'ok')::boolean then raise exception 'FALLO perfil familia'; end if;
  raise notice 'OK demo de colegio (% horarios, % notas, % pagos)', (select count(*) from horarios where cuenta_id = c), (select count(*) from calificaciones where cuenta_id = c), (select count(*) from pagos where cuenta_id = c);
end $$;
-- Corte cerrado: el docente ya no puede cambiar notas; la dirección sí
reset role;
update periodos set cerrado = true where nombre = 'I Corte' and cuenta_id = (select (v->>'cuenta_id')::uuid from r where k='C');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
do $$ begin
  begin update calificaciones set puntaje = 99 where puntaje = 90; raise exception 'FALLO editó corte cerrado';
  exception when raise_exception then raise notice 'OK corte cerrado: el docente no puede cambiar notas'; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  update calificaciones set puntaje = 91 where puntaje = 90;
  if not found then raise exception 'FALLO dirección no pudo'; end if;
  raise notice 'OK la dirección sí puede corregir un corte cerrado';
end $$;
