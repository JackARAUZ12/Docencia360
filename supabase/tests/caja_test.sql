-- Caja: cobro de varios conceptos (todo o nada), caja del día por cajero, cierre inmutable y datos del ticket
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000ca001','duena@test'),('00000000-0000-0000-0000-0000000ca002','cajera@test'),
  ('00000000-0000-0000-0000-0000000ca003','inst@test'),('00000000-0000-0000-0000-0000000ca004','otra@test');
create temp table r(k text, v jsonb); grant all on r to authenticated;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ca001';
insert into r select 'C', d360_crear_cuenta('academia','Academia Caja','Dueña','acad_profesional', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); cu uuid; g uuid; e uuid; m jsonb; f jsonb; i jsonb; res jsonb; begin
  insert into cursos(cuenta_id, nombre, precio_matricula, mensualidad) values (c, 'Inglés', 500, 1200) returning id into cu;
  insert into grupos(cuenta_id, nombre, curso_id) values (c, 'Inglés noche', cu) returning id into g;
  insert into estudiantes(cuenta_id, nombres, apellidos) values (c, 'Eva', 'Caja') returning id into e;
  res := d360_matricular(c, e, cu, g, current_date, 500, 1200, 2, 5);
  f := d360_crear_miembro(c, 'Cajera Ana', 'finanzas', null, null, null, null);
  i := d360_crear_miembro(c, 'Instructor Leo', 'docente', null, null, null, null);
  insert into r values ('X', jsonb_build_object('c', c, 'e', e, 'f', f->>'miembro_id', 'i', i->>'miembro_id'));
end $$;
reset role;
update miembros set user_id = '00000000-0000-0000-0000-0000000ca002' where id = (select (v->>'f')::uuid from r where k='X');
update miembros set user_id = '00000000-0000-0000-0000-0000000ca003' where id = (select (v->>'i')::uuid from r where k='X');

-- La cajera cobra matrícula + primera mensualidad en un solo comprobante
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ca002';
do $$ declare x jsonb := (select v from r where k='X'); c uuid := (x->>'c')::uuid; e uuid := (x->>'e')::uuid; mat uuid; men uuid; men2 uuid; res jsonb; begin
  select id into mat from cargos where estudiante_id = e and tipo = 'matricula';
  select id into men from cargos where estudiante_id = e and tipo = 'mensualidad' order by vence limit 1;
  select id into men2 from cargos where estudiante_id = e and tipo = 'mensualidad' order by vence desc limit 1;
  res := d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', mat, 'monto', 500), jsonb_build_object('cargo_id', men, 'monto', 1200)), 'efectivo');
  if jsonb_array_length(res->'pagos') <> 2 or (res->>'total')::numeric <> 1700 or (res->'pagos'->1->>'recibo')::int <> (res->'pagos'->0->>'recibo')::int + 1
     or (select estado from cargos where id = mat) <> 'pagado' or (select estado from cargos where id = men) <> 'pagado' then raise exception 'FALLO cobro doble %', res; end if;
  raise notice 'OK cobra matrícula + mensualidad juntas: 2 recibos correlativos y un total';
  -- Todo o nada: si un concepto se pasa del saldo, no se registra ninguno
  begin perform d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', men2, 'monto', 100), jsonb_build_object('cargo_id', mat, 'monto', 50)), 'efectivo');
    raise exception 'FALLO sobrepago aceptado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  if (select pagado from cargos where id = men2) <> 0 then raise exception 'FALLO no fue todo o nada'; end if;
  begin perform d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', men2, 'monto', 100), jsonb_build_object('cargo_id', men2, 'monto', 100)), 'efectivo');
    raise exception 'FALLO repetido aceptado';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', men2, 'monto', 100)), 'efectivo', current_date + 1);
    raise exception 'FALLO fecha futura';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  perform d360_cobrar_varios(c, e, jsonb_build_array(jsonb_build_object('cargo_id', men2, 'monto', 300)), 'transferencia', current_date, 'BAC-123');
  raise notice 'OK todo o nada: sobrepago, concepto repetido o fecha futura no registran nada';
end $$;

-- Caja del día y cierre
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ca001';
do $$ declare x jsonb := (select v from r where k='X'); c uuid := (x->>'c')::uuid; d jsonb; k jsonb; begin
  insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo) select c, (x->>'e')::uuid, id, 100, 'efectivo' from cargos where estudiante_id = (x->>'e')::uuid and tipo = 'mensualidad' and estado <> 'pagado' limit 1;
  update pagos set anulado = true where cuenta_id = c and monto = 100;
  d := d360_caja_dia(c, current_date, null);
  if (d->>'total')::numeric <> 2000 or (d->'por_metodo'->>'efectivo')::numeric <> 1700 or (d->'por_metodo'->>'transferencia')::numeric <> 300
     or (d->>'anulados')::numeric <> 100 or (d->>'recibos')::int <> 3 or jsonb_array_length(d->'cajeros') <> 2 then raise exception 'FALLO caja del día %', d; end if;
  d := d360_caja_dia(c, current_date, '00000000-0000-0000-0000-0000000ca002');
  if (d->>'total')::numeric <> 2000 or (d->'pagos'->0->>'cajero_nombre') <> 'Cajera Ana' then raise exception 'FALLO caja por cajero %', d; end if;
  raise notice 'OK caja del día: totales por forma de pago, anulados aparte y filtro por cajero';
  k := d360_caja_cerrar(c, current_date, '00000000-0000-0000-0000-0000000ca002', 1650, 'Faltaron 50 de cambio');
  if (k->>'diferencia')::numeric <> -50 or (k->>'total')::numeric <> 2000 or k->>'cajero_nombre' <> 'Cajera Ana' then raise exception 'FALLO cierre %', k; end if;
  begin perform d360_caja_cerrar(c, current_date, '00000000-0000-0000-0000-0000000ca002', 1700); raise exception 'FALLO doble cierre';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin update cierres_caja set diferencia = 0; if found then raise exception 'FALLO cierre editable'; end if; end;
  begin delete from cierres_caja; if found then raise exception 'FALLO cierre borrable'; end if; end;
  begin insert into cierres_caja(cuenta_id, fecha, total) values (c, current_date - 1, 1); raise exception 'FALLO cierre directo';
  exception when insufficient_privilege then null; end;
  begin perform d360_caja_cerrar(c, current_date + 1, null, 0); raise exception 'FALLO cierre futuro';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  raise notice 'OK cierre de caja con diferencia calculada por el servidor; no se repite, ni se edita, ni se borra';
  k := d360_ticket_guardar(c, '{"ruc": "J0310000000000", "pie": "¡Gracias!", "mostrar_saldo": true, "otra": "x"}');
  if k->>'ruc' <> 'J0310000000000' or k ? 'otra' or (select config->'ticket'->>'pie' from cuentas where id = c) <> '¡Gracias!' then raise exception 'FALLO ticket %', k; end if;
  raise notice 'OK datos del ticket: solo campos permitidos';
end $$;

-- Instructor y otra cuenta: sin acceso a caja
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ca003';
do $$ declare x jsonb := (select v from r where k='X'); begin
  begin perform d360_caja_dia((x->>'c')::uuid, current_date, null); raise exception 'FALLO instructor ve caja'; exception when insufficient_privilege then null; end;
  begin perform d360_cobrar_varios((x->>'c')::uuid, (x->>'e')::uuid, '[{"cargo_id":"00000000-0000-0000-0000-000000000000","monto":1}]'); raise exception 'FALLO instructor cobra';
  exception when insufficient_privilege then null; end;
  if (select count(*) from cierres_caja) <> 0 then raise exception 'FALLO instructor ve cierres'; end if;
  begin perform d360_ticket_guardar((x->>'c')::uuid, '{"pie":"x"}'); raise exception 'FALLO instructor cambia ticket'; exception when insufficient_privilege then null; end;
  raise notice 'OK un instructor no ve la caja, no cobra ni cambia el ticket';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000ca004';
insert into r select 'O', d360_crear_cuenta('academia','Otra','Otro','acad_inicial', p_terminos => '2026-11-05');
do $$ declare x jsonb := (select v from r where k='X'); begin
  begin perform d360_caja_cerrar((x->>'c')::uuid, current_date, null, 0); raise exception 'FALLO otra cuenta cierra'; exception when insufficient_privilege then null; end;
  begin perform d360_caja_dia((x->>'c')::uuid, current_date, null); raise exception 'FALLO otra cuenta ve caja'; exception when insufficient_privilege then null; end;
  raise notice 'OK otra academia no ve ni cierra la caja ajena';
end $$;
reset role;
