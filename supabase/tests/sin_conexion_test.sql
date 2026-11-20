-- Sin conexión: cobros con clave (no se duplican), saldo a favor si ya se pagó en otro equipo, caja tras cierre
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000cb001','duena@test'),('00000000-0000-0000-0000-0000000cb002','prof@test');
create temp table r(k text, v jsonb); grant all on r to authenticated;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000cb001';
insert into r select 'C', d360_crear_cuenta('academia','Academia Offline','Dueña','acad_profesional', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); cu uuid; g uuid; e uuid; res jsonb; begin
  insert into cursos(cuenta_id, nombre, precio_matricula, mensualidad) values (c, 'Inglés', 500, 1200) returning id into cu;
  insert into grupos(cuenta_id, nombre, curso_id) values (c, 'Inglés noche', cu) returning id into g;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Olga', 'Sinred') returning id into e;
  res := d360_matricular(c, e, cu, g, current_date, 500, 1200, 2, 5);
  insert into r values ('X', jsonb_build_object('c', c, 'e', e));
end $$;

do $$ declare x jsonb := (select v from r where k='X'); c uuid := (x->>'c')::uuid; e uuid := (x->>'e')::uuid; mat uuid; men uuid;
  k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); a jsonb; b jsonb; n int; begin
  select id into mat from cargos where estudiante_id = e and tipo = 'matricula';
  select id into men from cargos where estudiante_id = e and tipo = 'mensualidad' order by vence limit 1;
  -- Cobro sin conexión que llega dos veces: se registra una sola
  a := d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', mat, 'monto', 500)), 'efectivo', current_date, null, k1, now() - interval '2 hours');
  b := d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', mat, 'monto', 500)), 'efectivo', current_date, null, k1, now() - interval '2 hours');
  select count(*) into n from pagos where clave_offline = k1;
  if n <> 1 or (b->>'repetido')::boolean is not true or (a->'pagos'->0->>'recibo') <> (b->'pagos'->0->>'recibo') or (select pagado from cargos where id = mat) <> 500 then
    raise exception 'FALLO cobro repetido % %', a, b; end if;
  raise notice 'OK un cobro sin conexión enviado dos veces se registra una sola vez (mismo recibo)';
  if (select cobrado_en from pagos where clave_offline = k1) > now() - interval '1 hour' then raise exception 'FALLO hora real'; end if;
  raise notice 'OK se guarda la hora real del cobro sin conexión';
  -- Otro equipo ya cobró la mensualidad; el cobro sin conexión llega después: no se rechaza, queda saldo a favor
  perform d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', men, 'monto', 1000)), 'efectivo');
  b := d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', men, 'monto', 1200)), 'efectivo', current_date, null, k2, now());
  if (select pagado from cargos where id = men) <> 1200 or (select sum(monto) from pagos where clave_offline = k2) <> 1200
     or (select monto from pagos where clave_offline = k2 and cargo_id is null) <> 1000 or b->'ajustes' is null then
    raise exception 'FALLO saldo a favor %', b; end if;
  raise notice 'OK si el concepto ya se pagó en otro equipo, el dinero queda como saldo a favor (no se pierde ni se duplica la deuda)';
  -- Sin clave sigue igual de estricto
  begin perform d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', men, 'monto', 10)), 'efectivo');
    raise exception 'FALLO sobrepago aceptado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK con internet se sigue rechazando cobrar más del saldo';
  begin perform d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', men, 'monto', 10)), 'efectivo', current_date + 1, null, gen_random_uuid(), null);
    raise exception 'FALLO fecha futura';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', men, 'monto', 10)), 'efectivo', current_date, null, gen_random_uuid(), now() - interval '60 days');
    raise exception 'FALLO muy antiguo';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK rechaza fechas futuras y cobros sin conexión de hace más de 45 días';
end $$;

-- Caja: un cobro sin conexión que se sube después del cierre queda señalado
do $$ declare x jsonb := (select v from r where k='X'); c uuid := (x->>'c')::uuid; begin
  perform d360_caja_cerrar(c, current_date, null, 0, null);
end $$;
do $$ declare x jsonb := (select v from r where k='X'); c uuid := (x->>'c')::uuid; e uuid := (x->>'e')::uuid; men2 uuid; d jsonb; begin
  select id into men2 from cargos where estudiante_id = e and tipo = 'mensualidad' order by vence desc limit 1;
  perform d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', men2, 'monto', 300)), 'efectivo', current_date, null, gen_random_uuid(), now() - interval '3 hours');
  d := d360_caja_dia(c, current_date, null);
  if (d->'tras_cierre'->>'cantidad')::int <> 1 or (d->'tras_cierre'->>'total')::numeric <> 300 then raise exception 'FALLO tras cierre %', d->'tras_cierre'; end if;
  if not exists (select 1 from jsonb_array_elements(d->'pagos') p where (p->>'sin_conexion')::boolean) then raise exception 'FALLO marca sin conexión'; end if;
  raise notice 'OK la caja avisa de los cobros sin conexión que llegaron después del cierre';
end $$;
reset role;

-- Profesor: clase particular cobrada sin conexión, enviada dos veces
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000cb002';
insert into r select 'P', d360_crear_cuenta('profesor','Prof Offline','Profe','prof_profesional', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='P'); e uuid; k uuid := gen_random_uuid(); a jsonb; b jsonb; begin
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Tito', 'Clase') returning id into e;
  a := d360_cobro_clase(c, e, current_date, 'Repaso', 300, true, 'efectivo', k, now());
  b := d360_cobro_clase(c, e, current_date, 'Repaso', 300, true, 'efectivo', k, now());
  if (select count(*) from cargos where clave_offline = k) <> 1 or (select count(*) from pagos where clave_offline = k) <> 1 or a->>'recibo' <> b->>'recibo' then
    raise exception 'FALLO clase repetida % %', a, b; end if;
  raise notice 'OK la clase particular cobrada sin conexión no se duplica';
end $$;
reset role;
