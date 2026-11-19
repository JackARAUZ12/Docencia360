-- Academias: aula virtual por plan, comunicados en el aula, familias y pago a instructores
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000ac001','duena@test'),('00000000-0000-0000-0000-0000000ac002','inst1@test'),
  ('00000000-0000-0000-0000-0000000ac003','inst2@test'),('00000000-0000-0000-0000-0000000ac004','ini@test');
create temp table r(k text, v jsonb); grant all on r to authenticated, anon;
set role authenticated;

-- Plan Inicial: aula sí (150), banco no, familias no
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ac004';
insert into r select 'I', d360_crear_cuenta('academia','Academia Inicial','Dueño','acad_inicial', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='I'); e uuid; res jsonb; begin
  if not d360_tiene_funcion(c, 'portal_estudiantes') or d360_tiene_funcion(c, 'banco_preguntas') then raise exception 'FALLO flags Inicial'; end if;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Ana', 'Inicial') returning id into e;
  res := d360_alumnos_activar(c, array[e]);
  if jsonb_array_length(res) <> 1 then raise exception 'FALLO activar en Inicial %', res; end if;
  begin insert into banco_preguntas(cuenta_id, tema, tipo, enunciado, correcta) values (c, 'T', 'vf', '¿Sí?', 'true'); raise exception 'FALLO banco en Inicial';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform d360_crear_miembro(c, 'Mamá', 'tutor', null, '8888', null, null); raise exception 'FALLO familias en Inicial';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK plan Inicial: aula virtual incluida; banco y familias con candado en el servidor';
end $$;

-- Plan Empresarial: todo
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ac001';
insert into r select 'C', d360_crear_cuenta('academia','Academia Total','Dueña','acad_empresarial', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); g1 uuid; g2 uuid; g3 uuid; e uuid; i1 jsonb; i2 jsonb; res jsonb; t jsonb; begin
  if not d360_tiene_funcion(c, 'banco_preguntas') or not d360_tiene_funcion(c, 'portal_familias') then raise exception 'FALLO flags Empresarial'; end if;
  insert into grupos(cuenta_id, nombre) values (c, 'Inglés A1') returning id into g1;
  insert into grupos(cuenta_id, nombre) values (c, 'Guitarra') returning id into g2;
  insert into grupos(cuenta_id, nombre) values (c, 'Excel') returning id into g3;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Eva', 'Menor') returning id into e;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado) values (g1, e, c, current_date, 'activo');
  res := d360_alumnos_activar(c, array[e]);
  insert into comunicados(cuenta_id, titulo, cuerpo, audiencia) values (c, 'Feriado', 'El lunes no hay clases.', 'todos');
  insert into comunicados(cuenta_id, titulo, cuerpo, audiencia, grupo_id) values (c, 'Cambio de aula', 'Inglés A1 pasa al aula 3.', 'grupo', g1);
  insert into comunicados(cuenta_id, titulo, cuerpo, audiencia, grupo_id) values (c, 'Otro grupo', 'Solo Guitarra.', 'grupo', g2);
  insert into comunicados(cuenta_id, titulo, cuerpo, audiencia) values (c, 'Reunión de instructores', 'Viernes 5 pm.', 'personal');
  insert into comunicados(cuenta_id, titulo, cuerpo, audiencia) values (c, 'Para familias', 'Entrega de notas.', 'tutores');
  t := d360_vincular_tutor(c, e, 'Mamá de Eva', '8888', 'Madre');
  i1 := d360_crear_miembro(c, 'Instructor Hora', 'docente', null, null, 'Inglés', null);
  i2 := d360_crear_miembro(c, 'Instructora Fija', 'docente', null, null, 'Guitarra', null);
  insert into grupo_docentes(cuenta_id, grupo_id, miembro_id) values (c, g1, (i1->>'miembro_id')::uuid), (c, g2, (i2->>'miembro_id')::uuid);
  -- horario: lunes a domingo 2 h para Inglés; Guitarra sin horario
  insert into horarios(cuenta_id, grupo_id, dia, hora_inicio, hora_fin) select c, g1, d, '16:00', '18:00' from generate_series(1, 7) d;
  insert into r values ('X', jsonb_build_object('c', c, 'g1', g1, 'g2', g2, 'g3', g3, 'e', e, 'pin', res->0->>'codigo', 'esp', (select codigo from cuentas where id = c),
    'i1', i1->>'miembro_id', 'i2', i2->>'miembro_id', 'tutor', t->>'miembro_id'));
end $$;

-- El estudiante ve en su aula los comunicados para todos y para su grupo, no los demás
reset role; set role anon; set request.headers = '{"x-forwarded-for": "7.2.2.2"}';
do $$ declare x jsonb := (select v from r where k='X'); s jsonb; a jsonb; txt text; begin
  s := d360_aula_entrar(x->>'esp', x->>'pin');
  a := d360_aula_inicio(s->>'sesion');
  txt := (select string_agg(v->>'texto', ' | ') from jsonb_array_elements(a->'avisos') v);
  if a->>'modalidad' <> 'academia' or txt not like '%Feriado%' or txt not like '%Cambio de aula%' or txt like '%Solo Guitarra%'
     or txt like '%instructores%' or txt like '%Entrega de notas%' then raise exception 'FALLO avisos del aula: %', txt; end if;
  raise notice 'OK el aula del estudiante muestra comunicados para todos y su grupo, no los del personal, familias u otros grupos';
end $$;
reset role;

-- La familia (tutor) de una academia ve solo a su hijo
update miembros set user_id = '00000000-0000-0000-0000-0000000ac003' where id = (select (v->>'tutor')::uuid from r where k='X');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ac003';
do $$ declare x jsonb := (select v from r where k='X'); begin
  if (select count(*) from estudiantes) <> 1 or (select count(*) from comunicados where titulo = 'Reunión de instructores') <> 0
     or (select count(*) from comunicados where titulo = 'Para familias') <> 1 then raise exception 'FALLO lectura tutor academia'; end if;
  raise notice 'OK la familia de una academia ve solo a su hijo y los comunicados para familias';
end $$;
reset role;
update miembros set user_id = null where id = (select (v->>'tutor')::uuid from r where k='X');

-- Clases dadas en el mes: el instructor 1 pasa lista 3 días (2 h c/u); Guitarra 2 días por la dueña (sin horario); Excel sin instructor
update miembros set user_id = '00000000-0000-0000-0000-0000000ac002' where id = (select (v->>'i1')::uuid from r where k='X');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ac002';
do $$ declare x jsonb := (select v from r where k='X'); c uuid := (x->>'c')::uuid; d date; begin
  foreach d in array array[date_trunc('month', current_date)::date, date_trunc('month', current_date)::date + 1, date_trunc('month', current_date)::date + 2] loop
    insert into asistencias(cuenta_id, grupo_id, estudiante_id, fecha, estado) values (c, (x->>'g1')::uuid, (x->>'e')::uuid, d, 'presente');
  end loop;
  -- un instructor no puede ver la liquidación de otros ni pagar
  if jsonb_array_length(d360_instructores_liquidacion(c, to_char(current_date, 'YYYY-MM'))->'instructores') <> 1 then raise exception 'FALLO instructor ve a otros'; end if;
  begin perform d360_instructor_pagar(c, (x->>'i1')::uuid, to_char(current_date, 'YYYY-MM'), 100); raise exception 'FALLO instructor se paga';
  exception when insufficient_privilege then null; end;
  begin insert into tarifas_instructor(miembro_id, cuenta_id, forma, monto) values ((x->>'i1')::uuid, c, 'hora', 9999); raise exception 'FALLO instructor fija su tarifa';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK un instructor solo ve sus propios pagos y no puede pagarse ni fijar su tarifa';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ac001';
do $$ declare x jsonb := (select v from r where k='X'); c uuid := (x->>'c')::uuid; p text := to_char(current_date, 'YYYY-MM'); l jsonb; a jsonb; b jsonb; m uuid; s jsonb; begin
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado) values ((x->>'g2')::uuid, (x->>'e')::uuid, c, current_date, 'activo'), ((x->>'g3')::uuid, (x->>'e')::uuid, c, current_date, 'activo');
  insert into asistencias(cuenta_id, grupo_id, estudiante_id, fecha, estado) values
    (c, (x->>'g2')::uuid, (x->>'e')::uuid, date_trunc('month', current_date)::date, 'presente'),
    (c, (x->>'g2')::uuid, (x->>'e')::uuid, date_trunc('month', current_date)::date + 1, 'presente'),
    (c, (x->>'g3')::uuid, (x->>'e')::uuid, date_trunc('month', current_date)::date, 'presente');
  insert into tarifas_instructor(miembro_id, cuenta_id, forma, monto) values ((x->>'i1')::uuid, c, 'hora', 150), ((x->>'i2')::uuid, c, 'fijo', 8000);
  l := d360_instructores_liquidacion(c, p);
  select v into a from jsonb_array_elements(l->'instructores') v where v->>'id' = x->>'i1';
  select v into b from jsonb_array_elements(l->'instructores') v where v->>'id' = x->>'i2';
  if (a->>'clases')::int <> 3 or (a->>'horas')::numeric <> 6 or (a->>'calculado')::numeric <> 900 then raise exception 'FALLO por hora %', a; end if;
  if (b->>'clases')::int <> 2 or (b->>'sin_horario')::int <> 2 or (b->>'calculado')::numeric <> 8000 then raise exception 'FALLO fijo %', b; end if;
  if jsonb_array_length(l->'sin_instructor') <> 1 then raise exception 'FALLO clases sin instructor %', l->'sin_instructor'; end if;
  raise notice 'OK liquidación: por hora (3 clases × 2 h × 150 = 900), salario fijo (8000) y clases sin instructor señaladas';
  update tarifas_instructor set forma = 'clase', monto = 200 where miembro_id = (x->>'i1')::uuid;
  select v into a from jsonb_array_elements(d360_instructores_liquidacion(c, p)->'instructores') v where v->>'id' = x->>'i1';
  if (a->>'calculado')::numeric <> 600 then raise exception 'FALLO por clase %', a; end if;
  raise notice 'OK por clase: 3 clases × 200 = 600';
  m := d360_instructor_pagar(c, (x->>'i1')::uuid, p, 400, current_date, 'transferencia', 'Adelanto');
  m := d360_instructor_pagar(c, (x->>'i1')::uuid, p, 200);
  select v into a from jsonb_array_elements(d360_instructores_liquidacion(c, p)->'instructores') v where v->>'id' = x->>'i1';
  if (a->>'pagado')::numeric <> 600 or jsonb_array_length(a->'pagos') <> 2 then raise exception 'FALLO pagado %', a; end if;
  s := d360_finanzas_resumen(c, date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
  if not exists(select 1 from jsonb_array_elements(s->'gastos_por_categoria') v where v->>'categoria' = 'Pago a instructores' and (v->>'total')::numeric = 600) then raise exception 'FALLO gasto en resumen %', s; end if;
  raise notice 'OK los pagos (adelanto + resto) se acumulan y cuentan como gasto «Pago a instructores» en el resumen';
  begin perform d360_instructor_pagar(c, (x->>'tutor')::uuid, p, 100); raise exception 'FALLO pagó a un tutor';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform d360_instructor_pagar(c, (x->>'i1')::uuid, '2026-13', 100); raise exception 'FALLO mes inválido';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform d360_instructor_pagar(c, (x->>'i1')::uuid, p, 0); raise exception 'FALLO monto cero';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK no se paga a quien no es instructor, ni con mes o monto inválido';
end $$;
-- Otra cuenta no puede ver ni pagar a instructores ajenos
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ac004';
do $$ declare x jsonb := (select v from r where k='X'); begin
  begin perform d360_instructores_liquidacion((x->>'c')::uuid, to_char(current_date, 'YYYY-MM')); raise exception 'FALLO otra cuenta ve liquidación';
  exception when insufficient_privilege then null; end;
  begin perform d360_instructor_pagar((select (v->>'cuenta_id')::uuid from r where k='I'), (x->>'i1')::uuid, to_char(current_date, 'YYYY-MM'), 50); raise exception 'FALLO pagó instructor ajeno';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if (select count(*) from tarifas_instructor) <> 0 then raise exception 'FALLO ve tarifas ajenas'; end if;
  raise notice 'OK otra academia no ve ni paga instructores ajenos';
end $$;
reset role;
-- Demo de academia: formas de pago, pagos, gastos y comunicados (repetible)
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000ac009','admin@test');
insert into plataforma_admins(user_id) values ('00000000-0000-0000-0000-0000000ac009');
select d360_sembrar_demos(); select d360_sembrar_demo_academia(); select d360_sembrar_demo_academia();
do $$ declare c uuid := (select id from cuentas where codigo = 'DEMOAC'); begin
  if (select count(distinct forma) from tarifas_instructor where cuenta_id = c) <> 3 then raise exception 'FALLO demo formas de pago'; end if;
  if (select count(*) from movimientos where cuenta_id = c and categoria = 'Pago a instructores' and periodo = to_char(current_date, 'YYYY-MM')) <> 1 then raise exception 'FALLO demo adelanto'; end if;
  if (select count(*) from movimientos where cuenta_id = c and miembro_id is null) <> 10 or (select count(*) from comunicados where cuenta_id = c) <> 3 then raise exception 'FALLO demo gastos/comunicados'; end if;
  if exists(select 1 from movimientos where cuenta_id = c and fecha > current_date) then raise exception 'FALLO demo con fechas futuras'; end if;
  raise notice 'OK la demo de academia trae formas de pago (hora, clase, fijo), pagos, gastos fijos y comunicados (y se puede repetir)';
end $$;
