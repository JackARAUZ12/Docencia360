-- Pruebas de importación de estudiantes y aceptación de términos
\set ON_ERROR_STOP 1
update planes set max_estudiantes = 30 where id = 'prof_basico';   -- el plan real ya no limita estudiantes; aquí se prueba el mecanismo de límite
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';   -- estas pruebas no tratan del código de registro
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000e1','dir@test'),('00000000-0000-0000-0000-0000000000e2','doc@test'),
  ('00000000-0000-0000-0000-0000000000e3','prof@test'),('00000000-0000-0000-0000-0000000000e4','otra@test');
create temp table r(k text, v jsonb); grant all on r to authenticated;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';

-- Términos
do $$ begin
  begin perform d360_crear_cuenta('colegio','Sin términos','Dir','col_avanzado'); raise exception 'FALLO crea sin aceptar';
  exception when raise_exception then raise notice 'OK no se crea una cuenta sin aceptar los términos'; end;
  begin perform d360_crear_cuenta('colegio','Versión vieja','Dir','col_avanzado', p_terminos => '2020-01-01'); raise exception 'FALLO versión vieja';
  exception when raise_exception then raise notice 'OK exige la versión vigente de los términos'; end;
end $$;
insert into r select 'C', public.d360_crear_cuenta('colegio','Colegio Importa','Dir','col_avanzado', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); begin
  if (select terminos_version from cuentas where id = c) <> '2026-11-05' or (select terminos_aceptados from cuentas where id = c) is null then
    raise exception 'FALLO no guarda la aceptación'; end if;
  raise notice 'OK la cuenta guarda versión y fecha de aceptación';
end $$;

-- Importación en colegio, con matrícula en sección
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); gr uuid; s uuid; res jsonb; begin
  insert into grados(cuenta_id, nombre, matricula, colegiatura) values (c, '1er grado', 500, 800) returning id into gr;
  insert into grupos(cuenta_id, nombre, grado_id, cupo) values (c, '1ro A', gr, 3) returning id into s;
  insert into estudiantes(cuenta_id, nombres, apellidos, documento) values (c, 'Ya', 'Existe', '001-010101-0001A');
  res := d360_importar_estudiantes(c, jsonb_build_array(
    jsonb_build_object('_fila', 2, 'nombres', 'Ana', 'apellidos', 'López', 'fecha_nacimiento', '2019-03-04', 'genero', 'femenino', 'contacto_nombre', 'Rosa López'),
    jsonb_build_object('_fila', 3, 'nombres', 'Luis', 'apellidos', 'Mora', 'fecha_nacimiento', 'no es fecha', 'email', 'malo'),
    jsonb_build_object('_fila', 4, 'nombres', '', 'apellidos', 'Sin nombre'),
    jsonb_build_object('_fila', 5, 'nombres', 'Otro', 'apellidos', 'Duplicado', 'documento', '001-010101-0001a'),
    jsonb_build_object('_fila', 6, 'nombres', 'Ana', 'apellidos', 'López', 'fecha_nacimiento', '2019-03-04'),
    jsonb_build_object('_fila', 7, 'nombres', 'Eva', 'apellidos', 'Ruiz'),
    jsonb_build_object('_fila', 8, 'nombres', 'Sin', 'apellidos', 'Cupo')), s, '{"mes_inicio": 2, "meses": 10, "dia": 10}');
  if (res->>'creados')::int <> 3 or (res->>'inscritos')::int <> 3 then raise exception 'FALLO conteos %', res; end if;
  if jsonb_array_length(res->'omitidos') <> 4 then raise exception 'FALLO omitidos %', res; end if;
  if not exists(select 1 from jsonb_array_elements(res->'omitidos') o where (o->>'fila')::int = 8 and o->>'motivo' ilike '%cupo%') then raise exception 'FALLO cupo %', res; end if;
  raise notice 'OK importa, omite sin nombre y duplicados (documento y nombre+fecha) y respeta el cupo';
  if (select genero from estudiantes where nombres = 'Ana') <> 'F' or (select fecha_nacimiento from estudiantes where nombres = 'Luis') is not null
     or (select email from estudiantes where nombres = 'Luis') is not null then raise exception 'FALLO normalización'; end if;
  raise notice 'OK normaliza género y descarta fechas y correos inválidos';
  if (select count(*) from matriculas where cuenta_id = c) <> 3 or (select count(*) from cargos where cuenta_id = c) <> 33 then raise exception 'FALLO matrícula/cobros'; end if;
  raise notice 'OK en colegio, matricula y genera matrícula + colegiaturas';
  if not exists(select 1 from estudiantes where nombres = 'Sin' and apellidos = 'Cupo') then null; else raise exception 'FALLO fila fallida quedó a medias'; end if;
  raise notice 'OK una fila que falla no deja datos a medias';
  insert into r values ('S', jsonb_build_object('s', s));
end $$;

-- Un docente no importa
insert into r select 'D', public.d360_crear_miembro((select (v->>'cuenta_id')::uuid from r where k='C'),'Doc','docente');
reset role;
update miembros set user_id = '00000000-0000-0000-0000-0000000000e2' where nombre = 'Doc';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
do $$ begin
  perform d360_importar_estudiantes((select (v->>'cuenta_id')::uuid from r where k='C'), '[{"nombres":"X"}]'::jsonb);
  raise exception 'FALLO docente importa';
exception when insufficient_privilege then raise notice 'OK un docente no puede importar';
end $$;

-- Otra cuenta no puede importar a esta ni usar su sección
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e4';
insert into r select 'O', public.d360_crear_cuenta('profesor','Otra','Otra','prof_basico', p_terminos => '2026-11-05');
do $$ begin
  begin perform d360_importar_estudiantes((select (v->>'cuenta_id')::uuid from r where k='C'), '[{"nombres":"X"}]'::jsonb); raise exception 'FALLO cruza cuentas';
  exception when insufficient_privilege then raise notice 'OK no importa en una cuenta ajena'; end;
end $$;
reset role;
update suscripciones set estado = 'activa', vence = current_date + 30 where cuenta_id = (select (v->>'cuenta_id')::uuid from r where k='O');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e4';
do $$ declare o uuid := (select (v->>'cuenta_id')::uuid from r where k='O'); res jsonb; g uuid; begin
  begin perform d360_importar_estudiantes(o, '[{"nombres":"X"}]'::jsonb, (select (v->>'s')::uuid from r where k='S')); raise exception 'FALLO usa sección ajena';
  exception when raise_exception then raise notice 'OK no usa grupos de otra cuenta'; end;
  -- Profesor: inscribe en su grupo
  insert into grupos(cuenta_id, nombre) values (o, 'Mate 1') returning id into g;
  res := d360_importar_estudiantes(o, '[{"nombres":"Pía","apellidos":"Gil"},{"nombres":"Teo"}]'::jsonb, g);
  if (res->>'inscritos')::int <> 2 or (select count(*) from grupo_estudiantes where grupo_id = g) <> 2 then raise exception 'FALLO profesor %', res; end if;
  raise notice 'OK profesor: importa e inscribe en su grupo';
  -- Límite del plan
  begin
    perform d360_importar_estudiantes(o, (select jsonb_agg(jsonb_build_object('nombres', 'E' || x)) from generate_series(1, 500) x));
    raise exception 'FALLO límite';
  exception when raise_exception then
    if sqlerrm not like 'Tu plan permite%' then raise exception 'FALLO mensaje límite: %', sqlerrm; end if;
    raise notice 'OK respeta el límite del plan con un mensaje claro';
  end;
  -- Aceptar términos: solo el propietario y la versión vigente
  perform d360_aceptar_terminos(o, '2026-11-05');
  begin perform d360_aceptar_terminos((select (v->>'cuenta_id')::uuid from r where k='C'), '2026-11-05'); raise exception 'FALLO acepta ajena';
  exception when insufficient_privilege then raise notice 'OK solo el propietario acepta los términos de su cuenta'; end;
end $$;
