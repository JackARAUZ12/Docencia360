-- Pruebas de la operación de academias
\set ON_ERROR_STOP 1
-- Estas pruebas usan cuentas en período de prueba (escritura habilitada)
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','acad@test'),('00000000-0000-0000-0000-0000000000a2','fin@test'),('00000000-0000-0000-0000-0000000000a3','inst@test');
create temp table r(k text, v jsonb); grant all on r to authenticated;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into r select 'C', public.d360_crear_cuenta('academia','Academia Prueba','Dueña','acad_profesional');
insert into cursos(cuenta_id,nombre,precio_matricula,mensualidad,certifica) select (v->>'cuenta_id')::uuid,'Inglés A1',500,1200,true from r where k='C';
insert into grupos(cuenta_id,nombre,curso_id,cupo) select (v->>'cuenta_id')::uuid,'Inglés A1 sábado',(select id from cursos),2 from r where k='C';
insert into estudiantes(cuenta_id,nombres,apellidos) select (v->>'cuenta_id')::uuid, x, 'Prueba' from r, unnest(array['Uno','Dos','Tres']) x where k='C';

do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); g uuid := (select id from grupos); cu uuid := (select id from cursos);
  res jsonb; m uuid; n int; begin
  res := public.d360_matricular(c, (select id from estudiantes where nombres='Uno'), cu, g, '2026-01-15', 500, 1200, 3, 10, 10, null, null);
  if (res->>'cargos')::int <> 4 then raise exception 'FALLO cargos %', res; end if;
  if (select count(*) from cargos where tipo='mensualidad' and descuento = 120) <> 3 then raise exception 'FALLO descuento'; end if;
  if (select min(vence) from cargos where tipo='mensualidad') <> '2026-01-10' then raise exception 'FALLO vence %', (select min(vence) from cargos where tipo='mensualidad'); end if;
  if not exists(select 1 from cargos where concepto like 'Mensualidad febrero 2026%') then raise exception 'FALLO concepto'; end if;
  raise notice 'OK matrícula genera 1 matrícula + 3 mensualidades con descuento';
  begin perform public.d360_matricular(c, (select id from estudiantes where nombres='Uno'), cu, g, null, 0, 0, 0, 5); raise exception 'FALLO duplicada';
  exception when raise_exception then raise notice 'OK no permite matrícula duplicada'; end;
  perform public.d360_matricular(c, (select id from estudiantes where nombres='Dos'), cu, g, null, 0, 1200, 1, 5);
  begin perform public.d360_matricular(c, (select id from estudiantes where nombres='Tres'), cu, g, null, 0, 1200, 1, 5); raise exception 'FALLO cupo';
  exception when raise_exception then raise notice 'OK respeta el cupo: %', sqlerrm; end;
  -- Pagos
  m := (select id from cargos where tipo='matricula');
  insert into pagos(cuenta_id,estudiante_id,cargo_id,monto) select c, estudiante_id, id, 200 from cargos where id = m;
  if (select estado from cargos where id=m) <> 'parcial' then raise exception 'FALLO parcial'; end if;
  begin insert into pagos(cuenta_id,estudiante_id,cargo_id,monto) select c, estudiante_id, id, 400 from cargos where id = m; raise exception 'FALLO sobrepago';
  exception when raise_exception then raise notice 'OK rechaza sobrepago: %', sqlerrm; end;
  insert into pagos(cuenta_id,estudiante_id,cargo_id,monto) select c, estudiante_id, id, 300 from cargos where id = m;
  if (select estado from cargos where id=m) <> 'pagado' then raise exception 'FALLO pagado'; end if;
  if (select max(recibo) from pagos) <> 2 then raise exception 'FALLO recibos'; end if;
  raise notice 'OK pagos parciales, saldo y recibos correlativos';
  begin update pagos set monto = 1 where recibo = 1; raise exception 'FALLO pago editable';
  exception when raise_exception then raise notice 'OK pago no editable'; end;
  update pagos set anulado = true where recibo = 2;
  if (select estado from cargos where id=m) <> 'parcial' then raise exception 'FALLO anular pago'; end if;
  begin update cargos set estado='anulado' where id = m; raise exception 'FALLO anula con abonos';
  exception when raise_exception then raise notice 'OK no anula cobro con abonos'; end;
  raise notice 'OK anular pago recalcula saldo';
  -- Retiro y renovación
  n := public.d360_retirar_matricula((select id from matriculas where estudiante_id=(select id from estudiantes where nombres='Dos')), 'Viaje', true);
  if (select estado from grupo_estudiantes where estudiante_id=(select id from estudiantes where nombres='Dos')) <> 'retirado' then raise exception 'FALLO retiro grupo'; end if;
  raise notice 'OK retiro (% cobros futuros anulados)', n;
  n := public.d360_renovar_matricula((select id from matriculas where estudiante_id=(select id from estudiantes where nombres='Uno')), 2);
  if (select max(vence) from cargos where matricula_id=(select id from matriculas where estudiante_id=(select id from estudiantes where nombres='Uno'))) <> '2026-05-10' then raise exception 'FALLO renovar %',
    (select max(vence) from cargos where tipo='mensualidad' and estudiante_id=(select id from estudiantes where nombres='Uno')); end if;
  raise notice 'OK renovación continúa después de la última mensualidad';
  -- Certificado
  res := public.d360_emitir_certificado(c, (select id from estudiantes where nombres='Uno'), cu, 'certificado', 'Certificado de aprobación', '{}');
  if not (public.d360_verificar_certificado(lower(res->>'folio'))->>'valido')::boolean then raise exception 'FALLO verificar'; end if;
  if (public.d360_verificar_certificado('NO-EXISTE')->>'valido')::boolean then raise exception 'FALLO verificar falso'; end if;
  raise notice 'OK certificado con folio % y verificación', res->>'folio';
  if (select count(*) from d360_carga_instructores(c)) <> 0 then raise exception 'FALLO carga'; end if;
  if jsonb_array_length(public.d360_informe_operativo(c, '2026-01-01', '2026-12-31')->'cursos') <> 1 then raise exception 'FALLO informe'; end if;
  raise notice 'OK informes operativos';
end $$;

-- Un instructor no ve finanzas ni matricula
insert into r select 'I', public.d360_crear_miembro((select (v->>'cuenta_id')::uuid from r where k='C'),'Instructor','docente');
insert into r select 'F', public.d360_crear_miembro((select (v->>'cuenta_id')::uuid from r where k='C'),'Cajera','finanzas');
reset role;
update miembros set user_id='00000000-0000-0000-0000-0000000000a3' where id=(select (v->>'miembro_id')::uuid from r where k='I');
update miembros set user_id='00000000-0000-0000-0000-0000000000a2' where id=(select (v->>'miembro_id')::uuid from r where k='F');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  if (select count(*) from cargos) <> 0 or (select count(*) from pagos) <> 0 then raise exception 'FALLO instructor ve finanzas'; end if;
  begin perform public.d360_matricular((select id from cuentas), (select id from estudiantes limit 1), null, (select id from grupos), null, 0,0,0,5); raise exception 'FALLO instructor matricula';
  exception when insufficient_privilege then raise notice 'OK instructor sin finanzas ni matrículas'; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  if (select count(*) from cargos) = 0 then raise exception 'FALLO finanzas no ve cobros'; end if;
  begin insert into grupos(cuenta_id,nombre) select id,'X' from cuentas; raise exception 'FALLO finanzas crea grupos';
  exception when insufficient_privilege then raise notice 'OK rol finanzas: cobra pero no edita lo académico'; end;
end $$;
