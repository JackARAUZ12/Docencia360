-- Prueba de volumen (no forma parte de la batería normal): una academia del plan
-- Empresarial al máximo y la medición de las consultas de cada pantalla, por rol.
-- Uso: bash supabase/tests/volumen.sh
\set ON_ERROR_STOP 1
\timing off
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
update config_global set valor = '14' where clave = 'publico.dias_prueba';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000f0001','duena@vol'),('00000000-0000-0000-0000-0000000f0002','inst@vol'),('00000000-0000-0000-0000-0000000f0003','caja@vol');
create table public._vol(k text primary key, v jsonb);
grant all on public._vol to authenticated;

-- Medir: ejecuta una consulta 3 veces y devuelve el mejor tiempo en milisegundos
create or replace function public._medir(p_nombre text, p_sql text) returns table(consulta text, ms numeric, filas bigint)
language plpgsql security invoker as $$
declare t0 timestamptz; mejor numeric := 1e9; n bigint;
begin
  for i in 1..3 loop
    t0 := clock_timestamp();
    execute 'select count(*) from (select md5(x::text) h from (' || p_sql || ') x) y where h is not null' into n;   -- obliga a calcular cada fila completa
    mejor := least(mejor, extract(epoch from clock_timestamp() - t0) * 1000);
  end loop;
  return query select p_nombre, round(mejor, 1), n;
end $$;
grant execute on function public._medir(text, text) to authenticated;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000f0001';
set role authenticated;
insert into _vol select 'C', d360_crear_cuenta('academia','Academia Volumen','Dueña','acad_empresarial', p_terminos => '2026-11-05');
reset role;

do $$
declare c uuid := (select (v->>'cuenta_id')::uuid from _vol where k='C'); i int; g uuid; cu uuid; m uuid; e uuid; d date; r record;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f0001', true);
  -- 12 cursos, 60 grupos con horario de 2 días, 40 instructores
  for i in 1..12 loop insert into cursos(cuenta_id, nombre, precio_matricula, mensualidad, certifica) values (c, 'Curso ' || i, 500, 1200, true); end loop;
  for i in 1..40 loop
    perform d360_crear_miembro(c, 'Instructor ' || i, 'docente', null, null, null, null);
  end loop;
  update miembros set user_id = '00000000-0000-0000-0000-0000000f0002' where cuenta_id = c and nombre = 'Instructor 1';
  perform d360_crear_miembro(c, 'Cajera', 'finanzas', null, null, null, null);
  update miembros set user_id = '00000000-0000-0000-0000-0000000f0003' where cuenta_id = c and nombre = 'Cajera';
  for i in 1..60 loop
    select id into cu from cursos where cuenta_id = c order by nombre offset (i % 12) limit 1;
    insert into grupos(cuenta_id, nombre, curso_id, estado) values (c, 'Grupo ' || i, cu, 'activo') returning id into g;
    insert into horarios(cuenta_id, grupo_id, dia, hora_inicio, hora_fin) values (c, g, 1 + (i % 5), '08:00', '10:00'), (c, g, 1 + ((i + 2) % 5), '08:00', '10:00');
    insert into grupo_docentes(cuenta_id, grupo_id, miembro_id) select c, g, id from miembros where cuenta_id = c and rol = 'docente' order by nombre offset (i % 40) limit 1;
  end loop;
  -- 2,000 estudiantes, cada uno matriculado en un grupo (matrícula + 6 mensualidades)
  insert into estudiantes(cuenta_id, nombres, apellidos, telefono, contacto_nombre, contacto_telefono)
  select c, 'Estudiante' || n, 'Apellido' || n, '8' || lpad(n::text, 7, '0'), 'Tutor ' || n, '7' || lpad(n::text, 7, '0') from generate_series(1, 2000) n;
  i := 0;
  for r in select id from estudiantes where cuenta_id = c order by nombres loop
    i := i + 1;
    select id into g from grupos where cuenta_id = c order by nombre offset (i % 60) limit 1;
    perform d360_matricular(c, r.id, null, g, current_date - 120, 500, 1200, 6, 5, case when i % 10 = 0 then 50 else 0 end);
  end loop;
end $$;

-- Pagos: matrícula y las mensualidades vencidas de casi todos (unos 10 mil recibos)
do $$
declare c uuid := (select (v->>'cuenta_id')::uuid from _vol where k='C'); r record; n int := 0;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f0003', true);
  for r in select id, estudiante_id, monto - descuento - pagado saldo, vence from cargos where cuenta_id = c and vence <= current_date and estado <> 'pagado' order by vence loop
    n := n + 1;
    continue when n % 7 = 0;   -- algunos quedan debiendo (morosos)
    insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha)
    values (c, r.estudiante_id, r.id, r.saldo, (array['efectivo','efectivo','transferencia','tarjeta'])[1 + n % 4], least(r.vence + (n % 9), current_date));
  end loop;
end $$;

-- Asistencia: 12 semanas × 2 clases por grupo; notas: 8 evaluaciones por grupo; gastos, interesados, comunicados
do $$
declare c uuid := (select (v->>'cuenta_id')::uuid from _vol where k='C'); g record; d date; ev uuid; k int;
begin
  perform set_config('d360.mantenimiento', 'on', true);
  for g in select id from grupos where cuenta_id = c loop
    for d in select x::date from generate_series(current_date - 84, current_date, '1 day') x
             where extract(isodow from x) in (select dia from horarios where grupo_id = g.id) loop
      insert into asistencias(cuenta_id, grupo_id, estudiante_id, fecha, estado)
      select c, g.id, ge.estudiante_id, d, (array['presente','presente','presente','presente','presente','presente','tarde','ausente','presente','justificado'])[1 + (abs(hashtext(ge.estudiante_id::text || d::text)) % 10)]
        from grupo_estudiantes ge where ge.grupo_id = g.id and ge.estado = 'activo';
    end loop;
    for k in 1..8 loop
      insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max) values (c, g.id, 'Evaluación ' || k, 'examen', current_date - 84 + k * 10, 12.5, 100) returning id into ev;
      insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje)
      select c, ev, ge.estudiante_id, 50 + abs(hashtext(ge.estudiante_id::text || ev::text)) % 51 from grupo_estudiantes ge where ge.grupo_id = g.id and ge.estado = 'activo';
    end loop;
  end loop;
  insert into movimientos(cuenta_id, tipo, fecha, concepto, categoria, monto)
  select c, 'gasto', current_date - (n % 90), 'Gasto ' || n, (array['Alquiler del local','Publicidad','Materiales','Luz, agua e internet'])[1 + n % 4], 100 + n from generate_series(1, 300) n;
  insert into interesados(cuenta_id, nombre, telefono, origen, estado, creado)
  select c, 'Interesado ' || n, '8888' || lpad(n::text, 4, '0'), (array['whatsapp','facebook','en_linea','visita'])[1 + n % 4], (array['nuevo','contactado','prueba','matriculado','descartado'])[1 + n % 5], now() - (n % 120) * interval '1 day' from generate_series(1, 800) n;
  insert into comunicados(cuenta_id, titulo, cuerpo, audiencia) select c, 'Comunicado ' || n, 'Texto ' || n, 'todos' from generate_series(1, 60) n;
  insert into _vol values ('G', (select to_jsonb(id) from grupos where cuenta_id = c order by nombre limit 1)),
                          ('E', (select to_jsonb(estudiante_id) from grupo_estudiantes where cuenta_id = c limit 1));
end $$;
analyze;

\echo '== Volumen generado'
select (select count(*) from estudiantes) estudiantes, (select count(*) from grupos) grupos, (select count(*) from cargos) cargos, (select count(*) from pagos) pagos,
       (select count(*) from asistencias) asistencias, (select count(*) from calificaciones) calificaciones, (select count(*) from interesados) interesados;

-- Lo que cada pantalla consulta, con los permisos reales (RLS) de cada rol
\echo '== Dirección (propietaria)'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000f0001';
select * from _medir('Inicio: resumen del panel', format('select d360_resumen_panel(%L)', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Estudiantes: lista completa', format('select * from estudiantes where cuenta_id = %L order by apellidos, nombres', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Grupos con sus estudiantes', format('select g.*, (select count(*) from grupo_estudiantes ge where ge.grupo_id = g.id) from grupos g where cuenta_id = %L', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Finanzas: por cobrar', format('select * from cargos where cuenta_id = %L and estado in (''pendiente'',''parcial'') order by vence', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Finanzas: pagos de 120 días', format('select p.*, c.concepto from pagos p left join cargos c on c.id = p.cargo_id where p.cuenta_id = %L and p.fecha >= current_date - 120 order by recibo desc', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Finanzas: resumen del mes', format('select d360_finanzas_resumen(%L, date_trunc(''month'', current_date)::date, current_date)', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Caja del día', format('select d360_caja_dia(%L, current_date - 3, null)', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Pagos a instructores (mes)', format('select d360_instructores_liquidacion(%L, to_char(current_date, ''YYYY-MM''))', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Carga de instructores', format('select * from d360_carga_instructores(%L)', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Notas: promedios de un grupo', format('select * from d360_promedios_grupo(%L)', (select v #>> '{}' from _vol where k='G')))
union all select * from _medir('Asistencia: lista de un grupo', format('select * from asistencias where grupo_id = %L and fecha = current_date - 7', (select v #>> '{}' from _vol where k='G')))
union all select * from _medir('Asistencia: resumen del grupo', format('select * from d360_resumen_asistencia(%L, %L, current_date - 90)', (select v->>'cuenta_id' from _vol where k='C'), (select v #>> '{}' from _vol where k='G')))
union all select * from _medir('Interesados', format('select * from interesados where cuenta_id = %L order by creado desc limit 500', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Informe operativo', format('select d360_informe_operativo(%L, current_date - 365, current_date)', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Resumen de asistencia de toda la academia', format('select * from d360_resumen_asistencia(%L, null, current_date - 30)', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Ficha: estado de cuenta', format('select * from cargos where estudiante_id = %L and estado <> ''anulado''', (select v #>> '{}' from _vol where k='E')));

\echo '== Instructor (solo sus grupos)'
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000f0002';
select * from _medir('Instructor: estudiantes visibles', format('select * from estudiantes where cuenta_id = %L', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Instructor: asistencias visibles (30 días)', format('select * from asistencias where cuenta_id = %L and fecha >= current_date - 30', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Instructor: calificaciones visibles', format('select * from calificaciones where cuenta_id = %L', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Instructor: mis pagos', format('select d360_instructores_liquidacion(%L, to_char(current_date, ''YYYY-MM''))', (select v->>'cuenta_id' from _vol where k='C')));

\echo '== Cajera'
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000f0003';
select * from _medir('Cajera: su caja del día', format('select d360_caja_dia(%L, current_date - 3, ''00000000-0000-0000-0000-0000000f0003'')', (select v->>'cuenta_id' from _vol where k='C')))
union all select * from _medir('Cajera: por cobrar', format('select * from cargos where cuenta_id = %L and estado in (''pendiente'',''parcial'') order by vence', (select v->>'cuenta_id' from _vol where k='C')));
reset role;
