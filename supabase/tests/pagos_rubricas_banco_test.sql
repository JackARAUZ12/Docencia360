-- Control de pagos, rúbricas y banco de preguntas del profesor, por plan
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000aa01','pro@test'),('00000000-0000-0000-0000-00000000aa02','basico@test'),('00000000-0000-0000-0000-00000000aa03','prem@test');
create temp table r(k text, v jsonb); grant all on r to authenticated, anon, service_role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa02';
insert into r select 'B', d360_crear_cuenta('profesor','Básico','Ana','prof_basico', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='B'); g uuid; begin
  insert into grupos(cuenta_id, nombre, mensualidad) values (c, 'G', 500) returning id into g;
  begin perform d360_cobros_generar(c, '2026-11'); raise exception 'FALLO básico generó cobros';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; raise notice 'OK Básico: el control de pagos tiene candado en el servidor'; end;
  begin insert into rubricas(cuenta_id, nombre, criterios) values (c, 'R', '[{"nombre":"A","niveles":[{"nombre":"x","puntos":1},{"nombre":"y","puntos":2}]}]'); raise exception 'FALLO básico creó rúbrica';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; raise notice 'OK Básico: rúbricas con candado'; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa01';
insert into r select 'P', d360_crear_cuenta('profesor','Pro','Luis','prof_profesional', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='P'); g uuid; e1 uuid; e2 uuid; res jsonb; cg cargos; rb uuid; ev uuid; begin
  insert into grupos(cuenta_id, nombre, mensualidad) values (c, 'Inglés', 1000) returning id into g;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Eva', 'Uno') returning id into e1;
  insert into estudiantes(cuenta_id, nombres, apellidos, descuento_pct) values (c, 'Leo', 'Dos', 50) returning id into e2;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado) values (g, e1, c, current_date, 'activo'), (g, e2, c, current_date, 'activo');
  res := d360_cobros_generar(c, '2026-11', null, 10);
  if (res->>'creados')::int <> 2 then raise exception 'FALLO generar %', res; end if;
  res := d360_cobros_generar(c, '2026-11');
  if (res->>'creados')::int <> 0 or (res->>'ya_existian')::int <> 2 then raise exception 'FALLO duplicó %', res; end if;
  raise notice 'OK Profesional: genera las mensualidades del mes una sola vez aunque se repita';
  select * into cg from cargos where estudiante_id = e2;
  if cg.descuento <> 500 or cg.vence <> date '2026-11-10' or cg.concepto not like 'Mensualidad noviembre 2026%' then raise exception 'FALLO cargo %', row_to_json(cg); end if;
  raise notice 'OK aplica el descuento del estudiante y el día de pago';
  insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo) values (c, e2, cg.id, 200, 'efectivo');
  select * into cg from cargos where id = cg.id;
  if cg.estado <> 'parcial' or cg.pagado <> 200 then raise exception 'FALLO saldo %', row_to_json(cg); end if;
  begin insert into pagos(cuenta_id, estudiante_id, cargo_id, monto) values (c, e2, cg.id, 400); raise exception 'FALLO pagó de más';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; raise notice 'OK un abono deja el cobro «parcial» y no se puede pagar más que el saldo'; end;
  -- Rúbricas
  insert into rubricas(cuenta_id, nombre, criterios) values (c, 'Exposición', '[{"nombre":"Claridad","niveles":[{"nombre":"Bajo","puntos":1},{"nombre":"Alto","puntos":4}]},{"nombre":"Contenido","niveles":[{"nombre":"Bajo","puntos":2},{"nombre":"Alto","puntos":6}]}]') returning id into rb;
  begin insert into rubricas(cuenta_id, nombre, criterios) values (c, 'Mala', '[{"nombre":"Solo un nivel","niveles":[{"nombre":"x","puntos":1}]}]'); raise exception 'FALLO rúbrica inválida';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; raise notice 'OK la rúbrica valida criterios y niveles'; end;
  insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, puntaje_max, rubrica_id) values (c, g, 'Exposición oral', 'proyecto', current_date, 100, rb) returning id into ev;
  insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje, rubrica_detalle) values (c, ev, e1, 70, '[{"criterio":"Claridad","nivel":"Alto","puntos":4},{"criterio":"Contenido","nivel":"Bajo","puntos":2}]');
  raise notice 'OK una evaluación usa la rúbrica y la nota guarda el detalle por criterio';
  begin insert into banco_preguntas(cuenta_id, tipo, enunciado, correcta) values (c, 'vf', '¿Sí?', 'true'); raise exception 'FALLO profesional usó banco';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; raise notice 'OK Profesional: banco de preguntas con candado (es de Premium)'; end;
  insert into r values ('X', jsonb_build_object('e1', e1, 'c', c));
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa03';
insert into r select 'M', d360_crear_cuenta('profesor','Premium','Sara','prof_premium', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='M'); g uuid; a1 uuid; a2 uuid; n int; ids uuid[]; begin
  insert into grupos(cuenta_id, nombre) values (c, 'Física') returning id into g;
  insert into actividades(cuenta_id, grupo_id, titulo) values (c, g, 'Examen 1') returning id into a1;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, correcta) values (c, a1, 0, 'vf', 'La Tierra es redonda.', 'true');
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, opciones, correcta) values (c, a1, 1, 'opcion', '2 + 2 =', '["3","4"]', '1');
  n := d360_actividad_a_banco(a1, 'Repaso');
  if n <> 2 then raise exception 'FALLO a banco %', n; end if;
  if d360_actividad_a_banco(a1, 'Repaso') <> 0 then raise exception 'FALLO duplicó en banco'; end if;
  raise notice 'OK Premium: guarda las preguntas de un examen en el banco sin duplicarlas';
  insert into actividades(cuenta_id, grupo_id, titulo) values (c, g, 'Examen 2') returning id into a2;
  select array_agg(id order by enunciado) into ids from banco_preguntas where cuenta_id = c;
  n := d360_banco_a_actividad(a2, ids);
  if n <> 2 or (select count(*) from preguntas where actividad_id = a2) <> 2 then raise exception $f$FALLO desde banco n=% ids=% cnt=%$f$, n, array_length(ids,1), (select count(*) from preguntas where actividad_id = a2); end if;
  if (select sum(usada) from banco_preguntas where cuenta_id = c) <> 2 then raise exception 'FALLO contador usada'; end if;
  raise notice 'OK arma otro examen con preguntas del banco y cuenta cuántas veces se usó cada una';
end $$;
reset role;
-- El estudiante ve sus pagos y el detalle de la rúbrica en su aula
do $$ declare x jsonb := (select v from r where k='X'); res jsonb; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa01', true);
  insert into r select 'K', jsonb_build_object('pin', (d360_alumnos_activar((x->>'c')::uuid, array[(x->>'e1')::uuid]))->0->>'codigo', 'esp', (select codigo from cuentas where id = (x->>'c')::uuid));
end $$;
set role anon; set request.headers = '{"x-forwarded-for": "5.5.5.5"}';
do $$ declare k jsonb := (select v from r where k='K'); s text; i jsonb; begin
  s := d360_aula_entrar(k->>'esp', k->>'pin')->>'sesion';
  i := d360_aula_inicio(s);
  if jsonb_array_length(i->'cobros') <> 1 or i->'notas'->0->'evaluaciones'->0->'rubrica' is null then raise exception 'FALLO aula %', i; end if;
  raise notice 'OK en su aula el estudiante ve sus mensualidades y el detalle de la rúbrica';
end $$;
