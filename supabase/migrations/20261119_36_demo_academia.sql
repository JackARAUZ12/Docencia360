-- Demo de academia (DEMOAC): formas de pago de instructores (por hora, por clase
-- y salario fijo), pagos del mes pasado y un adelanto de este mes, gastos fijos
-- y comunicados. Se vuelve a sembrar cada noche con las demás demos.
create or replace function public.d360_sembrar_demo_academia()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c uuid; m record; i int := 0; l jsonb; x jsonb; mes_ant date; mes_act date; v_ant text; v_act text; g1 uuid;
        v_meses text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
begin
  perform set_config('d360.mantenimiento', 'on', true);
  select id into c from cuentas where codigo = 'DEMOAC' and es_demo;
  if c is null then return jsonb_build_object('ok', false, 'motivo', 'sin_demo'); end if;
  delete from movimientos where cuenta_id = c;
  delete from tarifas_instructor where cuenta_id = c;
  delete from comunicados where cuenta_id = c;
  mes_ant := (date_trunc('month', current_date) - interval '1 month')::date; mes_act := date_trunc('month', current_date)::date;
  v_ant := to_char(mes_ant, 'YYYY-MM'); v_act := to_char(mes_act, 'YYYY-MM');

  -- Formas de pago: por hora, por clase, salario fijo y por hora
  for m in select id from miembros where cuenta_id = c and rol = 'docente' order by nombre loop
    i := i + 1;
    insert into tarifas_instructor(miembro_id, cuenta_id, forma, monto)
    values (m.id, c, (array['hora','clase','fijo','hora'])[1 + (i - 1) % 4], (array[180, 350, 9000, 150])[1 + (i - 1) % 4]);
  end loop;

  -- Mes pasado: pagado completo; este mes: un adelanto al primero
  l := _d360_liquidacion(c, v_ant, true, null);
  for x in select * from jsonb_array_elements(l -> 'instructores') loop
    if coalesce((x ->> 'calculado')::numeric, 0) > 0 then
      insert into movimientos(cuenta_id, tipo, fecha, concepto, categoria, monto, miembro_id, periodo, detalle)
      values (c, 'gasto', (mes_act + 1), left('Pago a ' || (x ->> 'nombre') || ' · ' || v_meses[extract(month from mes_ant)::int] || ' ' || extract(year from mes_ant)::int, 140),
              'Pago a instructores', (x ->> 'calculado')::numeric, (x ->> 'id')::uuid, v_ant,
              jsonb_build_object('metodo', 'transferencia', 'forma', x ->> 'forma', 'tarifa', x -> 'tarifa', 'clases', x -> 'clases', 'horas', x -> 'horas', 'calculado', x -> 'calculado'));
    end if;
  end loop;
  insert into movimientos(cuenta_id, tipo, fecha, concepto, categoria, monto, nota, miembro_id, periodo, detalle)
  select c, 'gasto', greatest(mes_act + 14, mes_act), left('Pago a ' || m2.nombre || ' · ' || v_meses[extract(month from mes_act)::int] || ' ' || extract(year from mes_act)::int, 140),
         'Pago a instructores', 1500, 'Adelanto de quincena', m2.id, v_act, '{"metodo": "efectivo"}'::jsonb
    from miembros m2 where m2.cuenta_id = c and m2.rol = 'docente' order by m2.nombre limit 1;
  update movimientos set fecha = least(fecha, current_date) where cuenta_id = c;

  -- Gastos fijos y otros ingresos, mes pasado y este mes
  insert into movimientos(cuenta_id, tipo, fecha, concepto, categoria, monto)
  select c, t.tipo, least(f.d + t.dia, current_date), t.concepto || ' · ' || v_meses[extract(month from f.d)::int], t.categoria, t.monto
    from (values (mes_ant), (mes_act)) f(d)
    cross join (values ('gasto', 1, 'Alquiler del local', 'Alquiler del local', 12000), ('gasto', 4, 'Luz, agua e internet', 'Luz, agua e internet', 2600),
                       ('gasto', 6, 'Anuncios en Facebook', 'Publicidad', 1800), ('gasto', 9, 'Limpieza', 'Mantenimiento y limpieza', 1200),
                       ('ingreso', 11, 'Venta de libros de inglés', 'Venta de libros o material', 2400)) t(tipo, dia, concepto, categoria, monto);

  -- Comunicados
  select id into g1 from grupos where cuenta_id = c and estado = 'activo' order by nombre limit 1;
  insert into comunicados(cuenta_id, titulo, cuerpo, audiencia, grupo_id, publicado) values
    (c, 'Inscripciones abiertas para enero', 'Ya puedes reservar tu cupo para los cursos de enero. Pregunta en recepción por el descuento de pronto pago.', 'todos', null, now() - interval '2 days'),
    (c, 'Cambio de aula', 'Desde la próxima clase, este grupo pasa al aula 3 (segundo piso).', 'grupo', g1, now() - interval '1 day'),
    (c, 'Reunión de instructores', 'El viernes a las 5:00 p. m. revisamos avance de grupos y fechas de exámenes.', 'personal', null, now() - interval '3 hours');
  return jsonb_build_object('ok', true, 'tarifas', i, 'movimientos', (select count(*) from movimientos where cuenta_id = c));
end $$;
revoke all on function public.d360_sembrar_demo_academia() from public, anon, authenticated;

create or replace function public.d360_admin_reiniciar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  r := d360_sembrar_demos();
  perform d360_sembrar_demo_aula();
  perform d360_sembrar_demo_extras();
  perform d360_sembrar_demo_academia();
  return r || jsonb_build_object('estudiantes', (r ->> 'estudiantes')::int + d360_sembrar_demo_colegio());
end $$;
revoke execute on function public.d360_admin_reiniciar_demos() from public, anon;
select cron.schedule('d360-reiniciar-demos', '20 6 * * *', $$select public.d360_sembrar_demos(); select public.d360_sembrar_demo_aula(); select public.d360_sembrar_demo_extras(); select public.d360_sembrar_demo_academia();$$);
