-- Academias, bloque 3: interesados, inscripción en línea, recuperaciones y cambio de nivel
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000cc001','duena@test'),('00000000-0000-0000-0000-0000000cc002','inst@test'),
  ('00000000-0000-0000-0000-0000000cc003','otra@test'),('00000000-0000-0000-0000-0000000cc009','admin@test');
insert into plataforma_admins(user_id) values ('00000000-0000-0000-0000-0000000cc009');
create temp table r(k text, v jsonb); grant all on r to authenticated, anon;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000cc001';
insert into r select 'C', d360_crear_cuenta('academia','Academia Crece','Dueña','acad_profesional', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); a1 uuid; a2 uuid; g1 uuid; g2 uuid; g3 uuid; tok text; i jsonb; begin
  insert into cursos(cuenta_id, nombre, precio_matricula, mensualidad, certifica) values (c, 'Inglés A1', 500, 1200, true) returning id into a1;
  insert into cursos(cuenta_id, nombre, precio_matricula, mensualidad, certifica) values (c, 'Inglés A2', 500, 1300, true) returning id into a2;
  update cursos set siguiente_curso_id = a2 where id = a1;
  begin update cursos set siguiente_curso_id = a1 where id = a1; raise exception 'FALLO curso siguiente de sí mismo';
  exception when check_violation then null; end;
  insert into grupos(cuenta_id, nombre, curso_id) values (c, 'A1 noche', a1) returning id into g1;
  insert into grupos(cuenta_id, nombre, curso_id) values (c, 'A1 sábado', a1) returning id into g2;
  insert into grupos(cuenta_id, nombre, curso_id, cupo) values (c, 'A2 noche', a2, 30) returning id into g3;
  insert into horarios(cuenta_id, grupo_id, dia, hora_inicio, hora_fin) values (c, g1, 1, '18:00', '19:30'), (c, g1, 3, '18:00', '19:30');
  tok := d360_inscripcion_enlace(c);
  if length(tok) <> 10 or d360_inscripcion_enlace(c) <> tok or d360_inscripcion_enlace(c, true) = tok then raise exception 'FALLO enlace'; end if;
  tok := d360_inscripcion_enlace(c);
  insert into r values ('X', jsonb_build_object('c', c, 'a1', a1, 'a2', a2, 'g1', g1, 'g2', g2, 'g3', g3, 'tok', tok));
  raise notice 'OK la academia activa su enlace de inscripción y puede cambiarlo';
end $$;

-- Público (sin cuenta): ve cursos y se inscribe; nada más
reset role; set role anon; set request.headers = '{"x-forwarded-for": "9.9.9.1"}';
do $$ declare x jsonb := (select v from r where k='X'); v jsonb; s jsonb; n int; begin
  v := d360_inscripcion_ver(x->>'tok');
  if not (v->>'ok')::boolean or jsonb_array_length(v->'cursos') <> 2 or v::text like '%Dueña%' then raise exception 'FALLO ver %', v; end if;
  if (select g->>'horario' from jsonb_array_elements(v->'cursos') cu, jsonb_array_elements(cu->'grupos') g where g->>'nombre' = 'A1 noche') <> 'Lun 18:00–19:30, Mié 18:00–19:30' then raise exception 'FALLO horario público %', v; end if;
  if (d360_inscripcion_ver('noexiste')->>'ok')::boolean then raise exception 'FALLO token falso'; end if;
  s := d360_inscripcion_enviar(x->>'tok', jsonb_build_object('nombre', 'Laura Pérez', 'telefono', '8888-1234', 'curso_id', x->>'a1', 'grupo_id', x->>'g1', 'responsable', 'Mamá Pérez', 'quiere_prueba', true));
  if not (s->>'ok')::boolean then raise exception 'FALLO enviar %', s; end if;
  if d360_inscripcion_enviar(x->>'tok', jsonb_build_object('nombre', 'L', 'telefono', '8888-1234', 'curso_id', x->>'a1'))->>'motivo' <> 'nombre'
     or d360_inscripcion_enviar(x->>'tok', jsonb_build_object('nombre', 'Laura', 'telefono', '12', 'curso_id', x->>'a1'))->>'motivo' <> 'telefono'
     or d360_inscripcion_enviar(x->>'tok', jsonb_build_object('nombre', 'Laura', 'telefono', '88881234', 'curso_id', gen_random_uuid()))->>'motivo' <> 'curso' then
    raise exception 'FALLO validaciones';
  end if;
  s := d360_inscripcion_enviar(x->>'tok', jsonb_build_object('nombre', 'Robot', 'telefono', '88881234', 'curso_id', x->>'a1', 'web', 'http://spam'));
  for n in 1..6 loop s := d360_inscripcion_enviar(x->>'tok', jsonb_build_object('nombre', 'Repetido ' || n, 'telefono', '88881234', 'curso_id', x->>'a1')); end loop;
  if s->>'motivo' <> 'muchas' then raise exception 'FALLO límite por conexión %', s; end if;
  begin perform count(*) from interesados; raise exception 'FALLO anon lee interesados';
  exception when insufficient_privilege then null; end;
  raise notice 'OK el público ve solo cursos y horarios, se inscribe con validaciones, anti-robots y límite por conexión';
end $$;
reset role;
do $$ declare x jsonb := (select v from r where k='X'); begin
  if (select count(*) from interesados where cuenta_id = (x->>'c')::uuid and origen = 'en_linea') <> 5 or exists(select 1 from interesados where nombre = 'Robot') then
    raise exception 'FALLO cantidad de solicitudes %', (select count(*) from interesados);
  end if;
  if not exists(select 1 from notificaciones where cuenta_id = (x->>'c')::uuid and tipo = 'inscripcion') then raise exception 'FALLO aviso'; end if;
  raise notice 'OK cada solicitud queda como interesado «en línea» y avisa a la academia';
end $$;

-- La academia convierte al interesado en estudiante matriculado
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000cc001';
do $$ declare x jsonb := (select v from r where k='X'); i uuid; res jsonb; e estudiantes; begin
  select id into i from interesados where nombre = 'Laura Pérez';
  update interesados set estado = 'prueba', prueba_fecha = current_date, prueba_grupo_id = (x->>'g1')::uuid, prueba_resultado = 'asistio' where id = i;
  res := d360_interesado_matricular(i, 'Laura', 'Pérez', (x->>'g1')::uuid, 500, 1200, 2, 5, 0);
  select * into e from estudiantes where id = (res->>'estudiante_id')::uuid;
  if e.contacto_nombre <> 'Mamá Pérez' or (res->>'cargos')::int <> 3 or (select estado from interesados where id = i) <> 'matriculado'
     or not exists(select 1 from grupo_estudiantes where grupo_id = (x->>'g1')::uuid and estudiante_id = e.id) then raise exception 'FALLO convertir %', res; end if;
  begin perform d360_interesado_matricular(i, 'Laura', 'Pérez', (x->>'g1')::uuid, 0, 0, 0, 5); raise exception 'FALLO matriculó dos veces';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  insert into r values ('E', jsonb_build_object('e', e.id));
  raise notice 'OK un interesado se matricula en un paso (estudiante, grupo y cobros) y no se duplica';
end $$;

-- Recuperación: falta en A1 noche, recupera en A1 sábado; el instructor del sábado la marca
do $$ declare x jsonb := (select v from r where k='X'); e uuid := (select (v->>'e')::uuid from r where k='E'); m jsonb; rid uuid; begin
  insert into asistencias(cuenta_id, grupo_id, estudiante_id, fecha, estado) values ((x->>'c')::uuid, (x->>'g1')::uuid, e, current_date - 2, 'ausente');
  insert into recuperaciones(cuenta_id, estudiante_id, grupo_origen, fecha_falta, grupo_destino, fecha) values ((x->>'c')::uuid, e, (x->>'g1')::uuid, current_date - 2, (x->>'g2')::uuid, current_date) returning id into rid;
  begin insert into recuperaciones(cuenta_id, estudiante_id, grupo_origen, grupo_destino, fecha) values ((x->>'c')::uuid, e, (x->>'g1')::uuid, (x->>'g1')::uuid, current_date); raise exception 'FALLO mismo grupo';
  exception when check_violation then null; end;
  m := d360_crear_miembro((x->>'c')::uuid, 'Instructor Sábado', 'docente', null, null, null, null);
  insert into grupo_docentes(cuenta_id, grupo_id, miembro_id) values ((x->>'c')::uuid, (x->>'g2')::uuid, (m->>'miembro_id')::uuid);
  insert into r values ('R', jsonb_build_object('id', rid, 'inst', m->>'miembro_id'));
end $$;
reset role;
update miembros set user_id = '00000000-0000-0000-0000-0000000cc002' where id = (select (v->>'inst')::uuid from r where k='R');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000cc002';
do $$ declare x jsonb := (select v from r where k='R'); begin
  if (select count(*) from recuperaciones) <> 1 then raise exception 'FALLO instructor no ve la recuperación de su grupo'; end if;
  perform d360_recuperacion_marcar((x->>'id')::uuid, 'asistio');
  if (select estado from recuperaciones where id = (x->>'id')::uuid) <> 'asistio' then raise exception 'FALLO marcar'; end if;
  begin insert into recuperaciones(cuenta_id, estudiante_id, grupo_destino, fecha) select cuenta_id, estudiante_id, grupo_destino, current_date from recuperaciones limit 1; raise exception 'FALLO instructor agenda';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK el instructor que recibe ve y marca la recuperación, pero no puede agendar';
end $$;

-- Cambio de nivel: A1 noche → A2 noche con certificado; mantiene el descuento
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000cc001';
do $$ declare x jsonb := (select v from r where k='X'); e uuid := (select (v->>'e')::uuid from r where k='E'); res jsonb; begin
  update matriculas set descuento_pct = 10 where estudiante_id = e and grupo_id = (x->>'g1')::uuid;
  res := d360_promover((x->>'g1')::uuid, array[e], (x->>'g3')::uuid, 2, 5, false, true);
  if (res->>'promovidos')::int <> 1 or (res->>'certificados')::int <> 1 then raise exception 'FALLO promover %', res; end if;
  if (select estado from matriculas where estudiante_id = e and grupo_id = (x->>'g1')::uuid) <> 'completada'
     or (select estado from grupo_estudiantes where grupo_id = (x->>'g1')::uuid and estudiante_id = e) <> 'retirado'
     or (select descuento_pct from matriculas where estudiante_id = e and grupo_id = (x->>'g3')::uuid and estado = 'activa') <> 10
     or (select count(*) from cargos where estudiante_id = e and tipo = 'mensualidad' and concepto like '%A2%') <> 2
     or exists(select 1 from cargos where estudiante_id = e and tipo = 'matricula' and concepto like '%A2%')
     or not exists(select 1 from certificados where estudiante_id = e and titulo = 'Inglés A1') then raise exception 'FALLO resultado del cambio de nivel'; end if;
  begin perform d360_promover((x->>'g1')::uuid, array[e], (x->>'g3')::uuid); raise exception 'FALLO promovió a quien ya no está';
  exception when raise_exception then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK cambio de nivel: completa la matrícula, emite el certificado, matricula en A2 con su descuento y sin cobrar matrícula';
end $$;

-- Otra academia no ve ni toca nada
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000cc003';
insert into r select 'O', d360_crear_cuenta('academia','Otra','Otro','acad_inicial', p_terminos => '2026-11-05');
do $$ declare x jsonb := (select v from r where k='X'); begin
  if (select count(*) from interesados) <> 0 or (select count(*) from recuperaciones) <> 0 or (select count(*) from inscripcion_publica) <> 0 then raise exception 'FALLO otra cuenta ve datos'; end if;
  begin perform d360_inscripcion_enlace((x->>'c')::uuid, true); raise exception 'FALLO cambia enlace ajeno';
  exception when insufficient_privilege then null; end;
  begin perform d360_promover((x->>'g2')::uuid, array[gen_random_uuid()], (x->>'g3')::uuid); raise exception 'FALLO promueve ajeno';
  exception when insufficient_privilege then null; end;
  raise notice 'OK otra academia no ve interesados, recuperaciones ni el enlace, ni puede promover';
end $$;
reset role;

-- Demo
select d360_sembrar_demos(); select d360_sembrar_demo_crecimiento(); select d360_sembrar_demo_crecimiento();
do $$ declare c uuid := (select id from cuentas where codigo = 'DEMOAC'); begin
  if (select count(*) from interesados where cuenta_id = c) <> 5 or (d360_inscripcion_ver('demoacademia')->>'ok')::boolean is not true
     or not exists(select 1 from cursos where cuenta_id = c and siguiente_curso_id is not null) then raise exception 'FALLO demo crecimiento'; end if;
  raise notice 'OK la demo trae interesados en cada etapa, enlace de inscripción y cursos con siguiente nivel';
end $$;
