-- Finanzas del profesor: clases por cobro, gastos e ingresos, resumen, guía de cobro y demo
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000bb01','pro@test'),('00000000-0000-0000-0000-00000000bb02','basico@test'),('00000000-0000-0000-0000-00000000bb09','admin@test');
insert into plataforma_admins(user_id) values ('00000000-0000-0000-0000-00000000bb09');
create temp table r(k text, v jsonb); grant all on r to authenticated;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb02';
insert into r select 'B', d360_crear_cuenta('profesor','Básico','Ana','prof_basico', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='B'); begin
  begin insert into movimientos(cuenta_id, tipo, concepto, monto) values (c, 'gasto', 'Copias', 50); raise exception 'FALLO básico registró gasto';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; raise notice 'OK Básico: finanzas con candado en el servidor'; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
insert into r select 'P', d360_crear_cuenta('profesor','Pro','Luis','prof_profesional', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='P'); e uuid; x jsonb; s jsonb; g jsonb; begin
  insert into estudiantes(cuenta_id, nombres, apellidos, tarifa_clase) values (c, 'Eva', 'Uno', 300) returning id into e;
  x := d360_cobro_clase(c, e, current_date, 'Repaso de álgebra', 300, true, 'transferencia');
  if x->>'recibo' is null or (select estado from cargos where id = (x->>'cargo_id')::uuid) <> 'pagado' then raise exception 'FALLO clase pagada %', x; end if;
  x := d360_cobro_clase(c, e, current_date, null, 300, false);
  if x->>'pago_id' is not null or (select estado from cargos where id = (x->>'cargo_id')::uuid) <> 'pendiente' then raise exception 'FALLO clase pendiente %', x; end if;
  raise notice 'OK una clase particular se cobra pagada (con recibo) o queda pendiente';
  insert into movimientos(cuenta_id, tipo, concepto, categoria, monto) values (c, 'gasto', 'Fotocopias', 'Fotocopias e impresión', 120), (c, 'gasto', 'Internet', 'Internet y teléfono', 400), (c, 'ingreso', 'Taller', 'Talleres', 1000);
  s := d360_finanzas_resumen(c, date_trunc('month', current_date)::date, current_date);
  if (s->>'cobrado')::numeric <> 300 or (s->>'gastos')::numeric <> 520 or (s->>'otros_ingresos')::numeric <> 1000 or (s->'por_tipo'->>'clase')::numeric <> 300
     or jsonb_array_length(s->'gastos_por_categoria') <> 2 then raise exception 'FALLO resumen %', s; end if;
  raise notice 'OK el resumen suma lo cobrado por tipo, otros ingresos y gastos por categoría';
  g := d360_guia_guardar(c, '{"cobro":"clase"}');
  if g->>'cobro' <> 'clase' then raise exception 'FALLO guía cobro %', g; end if;
  g := d360_guia_guardar(c, '{"cobro":"siempre"}');
  if g->>'cobro' <> 'clase' then raise exception 'FALLO aceptó valor inválido'; end if;
  raise notice 'OK la guía recuerda si el profesor cobra por mes, por clase, ambas o no cobra';
end $$;
reset role;
select d360_sembrar_demos(); select d360_sembrar_demo_aula(); select d360_sembrar_demo_extras(); select d360_sembrar_demo_extras();
do $$ declare c uuid := (select id from cuentas where codigo = 'DEMOPR'); begin
  if (select count(*) from cargos where cuenta_id = c and tipo = 'mensualidad') < 20 or (select count(*) from cargos where cuenta_id = c and tipo = 'clase') <> 3
     or (select count(*) from pagos where cuenta_id = c) < 10 or (select count(*) from movimientos where cuenta_id = c) <> 8
     or (select count(*) from rubricas where cuenta_id = c) <> 2 or (select count(*) from banco_preguntas where cuenta_id = c) <> 8
     or not exists(select 1 from calificaciones where cuenta_id = c and rubrica_detalle is not null) then
    raise exception 'FALLO demo extras';
  end if;
  if exists(select 1 from cargos where cuenta_id = c and estado = 'pendiente' and vence < current_date) is not true then raise exception 'FALLO demo sin atrasados'; end if;
  raise notice 'OK la demo trae mensualidades, clases, pagos, atrasados, gastos, rúbricas con notas y banco de preguntas (y se puede repetir)';
end $$;
