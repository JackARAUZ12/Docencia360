-- Pruebas de cuentas demo y alta sin prueba gratis
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';   -- estas pruebas no tratan del código de registro
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000d0','dueno@test'),('00000000-0000-0000-0000-0000000000d1','demo-academia-direccion@demo.docencia360.app'),('00000000-0000-0000-0000-0000000000d2','nuevo@test');
insert into plataforma_admins(user_id) values ('00000000-0000-0000-0000-0000000000d0');
select d360_sembrar_demos();
select d360_sembrar_demos();  -- el reinicio debe poder repetirse
do $$ begin
  if (select count(*) from cuentas where es_demo) <> 2 then raise exception 'FALLO cuentas demo'; end if;
  if (select count(*) from estudiantes e join cuentas c on c.id=e.cuenta_id where c.codigo='DEMOAC') <> 44 then raise exception 'FALLO estudiantes academia'; end if;
  if (select count(*) from pagos p join cuentas c on c.id=p.cuenta_id where c.codigo='DEMOAC') < 20 then raise exception 'FALLO pagos'; end if;
  if (select count(*) from cargos g join cuentas c on c.id=g.cuenta_id where c.codigo='DEMOAC' and g.estado in ('pendiente','parcial') and g.vence < current_date) = 0 then raise exception 'FALLO morosos'; end if;
  if (select count(*) from calificaciones k join cuentas c on c.id=k.cuenta_id where c.codigo='DEMOPR') < 50 then raise exception 'FALLO notas'; end if;
  if (select count(*) from asistencias k join cuentas c on c.id=k.cuenta_id where c.codigo='DEMOPR') < 50 then raise exception 'FALLO asistencia'; end if;
  if (select count(*) from certificados) < 2 then raise exception 'FALLO certificados'; end if;
  raise notice 'OK demos sembradas y reiniciables (% estudiantes, % pagos)', (select count(*) from estudiantes), (select count(*) from pagos);
end $$;
-- Acceso a la demo (como lo hace la Edge Function)
do $$ declare r jsonb; begin
  r := d360_demo_miembro('academia-direccion', '9.9.9.9');
  if not (r->>'ok')::boolean then raise exception 'FALLO demo_miembro %', r; end if;
  perform d360_demo_vincular((r->>'miembro_id')::uuid, '00000000-0000-0000-0000-0000000000d1');
  if (select user_id from miembros where id=(r->>'miembro_id')::uuid) <> '00000000-0000-0000-0000-0000000000d1' then raise exception 'FALLO vincular'; end if;
  raise notice 'OK acceso de demo por perfil';
end $$;
select d360_sembrar_demos();  -- el vínculo con el usuario se conserva tras reiniciar
do $$ begin
  if (select user_id from miembros where nombre='Roberto Castillo') is null then raise exception 'FALLO vínculo perdido'; end if;
  raise notice 'OK el reinicio conserva los accesos';
end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
do $$ declare c uuid := (select id from cuentas where codigo='DEMOAC'); begin
  if (select count(*) from d360_mis_cuentas() where es_demo) <> 1 then raise exception 'FALLO mis_cuentas demo'; end if;
  begin delete from estudiantes where cuenta_id = c; raise exception 'FALLO borró';
  exception when raise_exception then raise notice 'OK demo: no se borran estudiantes'; end;
  begin update cuentas set nombre = 'X' where id = c; raise exception 'FALLO editó cuenta';
  exception when raise_exception then raise notice 'OK demo: datos de la cuenta fijos'; end;
  begin perform d360_crear_miembro(c, 'Intruso', 'finanzas'); raise exception 'FALLO creó miembro';
  exception when raise_exception then raise notice 'OK demo: no se crean usuarios'; end;
  begin perform d360_regenerar_codigo((select id from miembros where nombre='Karla Mendoza')); raise exception 'FALLO regeneró';
  exception when raise_exception then raise notice 'OK demo: no se generan códigos'; end;
  perform d360_matricular(c, (select e.id from estudiantes e where e.cuenta_id = c and e.estado='activo' and not exists (select 1 from grupo_estudiantes ge join grupos g on g.id=ge.grupo_id where ge.estudiante_id=e.id and g.nombre like 'Piano%') limit 1),
    null, (select id from grupos where cuenta_id = c and nombre like 'Piano%'), current_date, 300, 1100, 2, 10);
  insert into pagos(cuenta_id, estudiante_id, cargo_id, monto) select c, estudiante_id, id, 100 from cargos where cuenta_id = c and estado='pendiente' limit 1;
  raise notice 'OK demo: sí se puede matricular y cobrar para probar';
end $$;
-- Alta sin días gratis: queda pendiente y en solo lectura
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
do $$ declare r jsonb; begin
  r := d360_crear_cuenta('profesor','Nueva','Nuevo','prof_basico', p_terminos => '2026-11-05');
  if r->>'estado' <> 'pendiente' then raise exception 'FALLO estado %', r; end if;
  begin insert into estudiantes(cuenta_id,nombres) values ((r->>'cuenta_id')::uuid,'X'); raise exception 'FALLO escribe sin pagar';
  exception when insufficient_privilege then raise notice 'OK cuenta nueva pendiente: solo lectura hasta el pago'; end;
end $$;
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d0';
do $$ begin
  perform d360_admin_registrar_pago((select id from cuentas where nombre='Nueva'), 'prof_basico', 1, 149, 'NIO', 'transferencia', 'T-1');
  if not d360_cuenta_operativa((select id from cuentas where nombre='Nueva')) then raise exception 'FALLO activar'; end if;
  raise notice 'OK al registrar el pago la cuenta se activa';
end $$;
