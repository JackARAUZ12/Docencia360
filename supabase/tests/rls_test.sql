-- Pruebas de aislamiento y permisos. Cada bloque falla con excepción si algo está mal.
\set ON_ERROR_STOP 1
update planes set max_estudiantes = 30 where id = 'prof_basico';   -- el plan real ya no limita estudiantes; aquí se prueba el mecanismo de límite
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';   -- estas pruebas no tratan del código de registro
-- Estas pruebas usan cuentas en período de prueba (escritura habilitada)
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@test'),('00000000-0000-0000-0000-00000000000b','b@test'),
 ('00000000-0000-0000-0000-00000000000c','c@test');

create temp table r(k text, v jsonb); grant all on r to authenticated;

-- Profesor A
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into r select 'A', public.d360_crear_cuenta('profesor','Clases de Ana','Ana','prof_basico', p_terminos => '2026-11-05');
insert into estudiantes(cuenta_id,nombres,apellidos) select (v->>'cuenta_id')::uuid,'Luis','Pérez' from r where k='A';
insert into grupos(cuenta_id,nombre) select (v->>'cuenta_id')::uuid,'Mate 1' from r where k='A';
-- Colegio B
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into r select 'B', public.d360_crear_cuenta('colegio','Colegio Beta','Berta','col_avanzado', p_terminos => '2026-11-05');
insert into estudiantes(cuenta_id,nombres) select (v->>'cuenta_id')::uuid,'Sofía' from r where k='B';

do $$ begin
  -- B no ve nada de A
  if (select count(*) from estudiantes) <> 1 then raise exception 'FALLO: B ve estudiantes ajenos'; end if;
  if (select count(*) from cuentas) <> 1 then raise exception 'FALLO: B ve cuentas ajenas'; end if;
  raise notice 'OK aislamiento lectura';
end $$;

-- B intenta insertar en la cuenta de A
do $$ begin
  begin
    insert into estudiantes(cuenta_id,nombres) select (v->>'cuenta_id')::uuid,'Intruso' from r where k='A';
    raise exception 'FALLO: B insertó en A';
  exception when insufficient_privilege then raise notice 'OK B no inserta en A'; end;
end $$;

-- B intenta meter a un estudiante de A en su propio grupo (referencia cruzada)
reset role;
create temp table ids as select (select id from estudiantes where nombres='Luis') luis, (select (v->>'cuenta_id')::uuid from r where k='B') cb;
grant all on ids to authenticated;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into grupos(cuenta_id,nombre) select cb,'7mo A' from ids;
do $$ begin
  begin
    insert into grupo_estudiantes(grupo_id,estudiante_id,cuenta_id)
      select (select id from grupos where nombre='7mo A'), luis, cb from ids;
    raise exception 'FALLO: referencia cruzada aceptada';
  exception when insufficient_privilege then raise notice 'OK referencias cruzadas bloqueadas'; end;
end $$;

-- B no puede canjear códigos ni leer secretos
do $$ begin
  begin perform public.d360_canjear_codigo('AAAAAA','123456','x'); raise exception 'FALLO canjear';
  exception when insufficient_privilege then raise notice 'OK canjear restringido'; end;
  if (select count(*) from miembros_secretos) <> 0 then raise exception 'FALLO: secretos visibles'; end if;
  if (select count(*) from secretos_servidor) <> 0 then raise exception 'FALLO: pepper visible'; end if;
  raise notice 'OK secretos cerrados';
end $$;

-- B no es admin de plataforma
do $$ begin
  begin perform public.d360_admin_cuentas(); raise exception 'FALLO admin';
  exception when insufficient_privilege then raise notice 'OK panel maestro protegido'; end;
  begin update planes set precio_usd = 0; if found then raise exception 'FALLO: cambió precios'; end if; end;
  raise notice 'OK precios protegidos';
end $$;

-- Docente de B: solo califica en sus grupos
insert into r select 'D', public.d360_crear_miembro((select cb from ids),'Doce Uno','docente');
reset role;
update miembros set user_id='00000000-0000-0000-0000-00000000000c' where id=(select (v->>'miembro_id')::uuid from r where k='D');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  if (select count(*) from estudiantes) <> 0 then raise exception 'FALLO un docente sin grupos ve alumnos'; end if;
  raise notice 'OK un docente sin grupos asignados no ve expedientes';
  begin
    insert into evaluaciones(cuenta_id,grupo_id,titulo) select cb,(select id from grupos where nombre='7mo A'),'Examen' from ids;
    raise exception 'FALLO: docente sin asignar creó evaluación';
  exception when insufficient_privilege then raise notice 'OK docente no asignado bloqueado'; end;
  begin
    insert into estudiantes(cuenta_id,nombres) select cb,'X' from ids;
    raise exception 'FALLO docente crea estudiantes';
  exception when insufficient_privilege then raise notice 'OK docente no crea expedientes'; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into grupo_docentes(cuenta_id,grupo_id,miembro_id) select cb,(select id from grupos where nombre='7mo A'),(select (v->>'miembro_id')::uuid from r where k='D') from ids;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into evaluaciones(cuenta_id,grupo_id,titulo,peso) select cb,(select id from grupos where nombre='7mo A'),'Examen',40 from ids;
do $$ begin raise notice 'OK docente asignado crea evaluación'; end $$;

-- Límite del plan Básico (30 estudiantes)
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare c uuid := (select id from cuentas limit 1); begin
  insert into estudiantes(cuenta_id,nombres) select c, 'E'||g from generate_series(1,29) g;
  begin insert into estudiantes(cuenta_id,nombres) values (c,'Sobra'); raise exception 'FALLO límite';
  exception when raise_exception then
    if sqlerrm like 'FALLO%' or sqlerrm not like '%estudiantes activos%' then raise exception 'FALLO el límite no se aplicó: %', sqlerrm; end if;
    raise notice 'OK límite de plan: %', sqlerrm; end;
end $$;

-- Promedio ponderado
do $$ declare c uuid := (select id from cuentas limit 1); g uuid := (select id from grupos limit 1);
  e uuid := (select id from estudiantes where nombres='Luis'); ev1 uuid; ev2 uuid; p numeric; begin
  insert into grupo_estudiantes(grupo_id,estudiante_id,cuenta_id) values (g,e,c);
  insert into evaluaciones(cuenta_id,grupo_id,titulo,peso,puntaje_max) values (c,g,'Ex1',60,100) returning id into ev1;
  insert into evaluaciones(cuenta_id,grupo_id,titulo,peso,puntaje_max) values (c,g,'Tarea',40,20) returning id into ev2;
  insert into calificaciones(cuenta_id,evaluacion_id,estudiante_id,puntaje) values (c,ev1,e,80),(c,ev2,e,10);
  select promedio into p from d360_promedios_grupo(g) where estudiante_id = e;
  if p <> 68.0 then raise exception 'FALLO promedio %', p; end if;  -- 80*.6 + 50*.4 = 68
  raise notice 'OK promedio ponderado = %', p;
end $$;

-- Suscripción vencida fuera de gracia: solo lectura
reset role;
update suscripciones set vence = current_date - 10, estado='vencida' where cuenta_id=(select id from cuentas where modalidad='profesor');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  begin insert into grupos(cuenta_id,nombre) select id,'Nuevo' from cuentas; raise exception 'FALLO escribe vencida';
  exception when insufficient_privilege then raise notice 'OK cuenta vencida en solo lectura'; end;
  if (select count(*) from estudiantes) = 0 then raise exception 'FALLO no puede leer'; end if;
end $$;

-- Canje de código (como service_role)
reset role;
select public.d360_canjear_codigo((select codigo from cuentas where modalidad='colegio'), '000000', '1.1.1.1') ->> 'motivo' as debe_ser_incorrecto;
do $$ declare pin text; c text := (select codigo from cuentas where modalidad='colegio'); res jsonb; begin
  pin := public._d360_asignar_codigo((select id from miembros where nombre='Doce Uno'));
  res := public.d360_canjear_codigo(lower(c), pin, '1.1.1.1');
  if not (res->>'ok')::boolean then raise exception 'FALLO canje correcto %', res; end if;
  raise notice 'OK canje correcto';
  for i in 1..5 loop res := public.d360_canjear_codigo(c, '999999', '2.2.2.2'); end loop;
  if res->>'motivo' <> 'bloqueado' then raise exception 'FALLO bloqueo %', res; end if;
  res := public.d360_canjear_codigo(c, pin, '2.2.2.2');
  if res->>'motivo' <> 'bloqueado' then raise exception 'FALLO bloqueo con pin bueno %', res; end if;
  raise notice 'OK bloqueo tras 5 intentos';
end $$;
select public.d360_tareas_diarias();
-- Al expirar el bloqueo, un error no vuelve a bloquear
reset role;
update acceso_intentos set bloqueado_hasta = now() - interval '1 minute';
do $$ declare c text := (select codigo from cuentas where modalidad='colegio'); res jsonb; begin
  res := public.d360_canjear_codigo(c, '999999', '2.2.2.2');
  if res->>'motivo' <> 'incorrecto' then raise exception 'FALLO rebloqueo %', res; end if;
  raise notice 'OK bloqueo expira correctamente';
end $$;
