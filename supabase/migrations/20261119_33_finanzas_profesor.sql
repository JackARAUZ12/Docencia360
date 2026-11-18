-- =====================================================================
-- DOCENCIA360 · 33 · Finanzas del profesor
-- · Clases particulares cobradas por clase (con o sin pago en el momento).
-- · Gastos e ingresos propios (materiales, transporte, internet, talleres…).
-- · Resumen del mes: ingresos (mensualidades, clases y otros), gastos y ganancia.
-- · La guía recuerda si el profesor cobra (por mes, por clase, ambas o no
--   cobra porque enseña en un colegio) para mostrar solo lo que le aplica.
-- · Demo del profesor con finanzas, rúbricas y banco de preguntas.
-- =====================================================================

-- ---------- 1. Clases particulares ----------
alter table public.cargos drop constraint if exists cargos_tipo_check;
alter table public.cargos add constraint cargos_tipo_check
  check (tipo in ('matricula','mensualidad','colegiatura','material','clase','otro'));
alter table public.estudiantes add column if not exists tarifa_clase numeric(12,2) not null default 0 check (tarifa_clase >= 0);

-- Registra una clase cobrada; si ya pagó, deja el pago con su recibo
create or replace function public.d360_cobro_clase(p_cuenta uuid, p_estudiante uuid, p_fecha date, p_detalle text, p_monto numeric,
                                                   p_pagado boolean default false, p_metodo text default 'efectivo')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cargo uuid; v_pago pagos; v_nom text;
begin
  if not (d360_es_finanzas(p_cuenta) and d360_cuenta_operativa(p_cuenta)) then
    raise exception 'No tienes permiso para registrar cobros, o la suscripción no está vigente.' using errcode = '42501';
  end if;
  if not d360_tiene_funcion(p_cuenta, 'finanzas') then raise exception 'Tu plan no incluye las finanzas.' using hint = 'limite_plan'; end if;
  select trim(nombres || ' ' || apellidos) into v_nom from estudiantes where id = p_estudiante and cuenta_id = p_cuenta;
  if v_nom is null then raise exception 'Estudiante no válido.'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'Escribe cuánto cobras por la clase.'; end if;
  if p_metodo not in ('efectivo','transferencia','tarjeta','deposito','otro') then raise exception 'Forma de pago no válida.'; end if;
  insert into cargos(cuenta_id, estudiante_id, concepto, tipo, monto, vence)
  values (p_cuenta, p_estudiante, left('Clase particular · ' || to_char(coalesce(p_fecha, current_date), 'DD/MM/YYYY') || coalesce(' · ' || nullif(trim(p_detalle), ''), ''), 200),
          'clase', p_monto, coalesce(p_fecha, current_date))
  returning id into v_cargo;
  if p_pagado then
    insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha)
    values (p_cuenta, p_estudiante, v_cargo, p_monto, p_metodo, coalesce(p_fecha, current_date)) returning * into v_pago;
  end if;
  return jsonb_build_object('cargo_id', v_cargo, 'pago_id', v_pago.id, 'recibo', v_pago.recibo);
end $$;
revoke all on function public.d360_cobro_clase(uuid, uuid, date, text, numeric, boolean, text) from public, anon;
grant execute on function public.d360_cobro_clase(uuid, uuid, date, text, numeric, boolean, text) to authenticated;

-- ---------- 2. Gastos e ingresos propios ----------
create table if not exists public.movimientos (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  tipo       text not null check (tipo in ('gasto','ingreso')),
  fecha      date not null default current_date,
  concepto   text not null check (length(trim(concepto)) between 2 and 140),
  categoria  text not null default 'Otro' check (length(trim(categoria)) between 1 and 60),
  monto      numeric(12,2) not null check (monto > 0),
  nota       text check (length(nota) <= 500),
  creado     timestamptz not null default now(),
  creado_por uuid default auth.uid()
);
create index if not exists movimientos_cuenta on public.movimientos(cuenta_id, fecha desc);
create trigger t_ci before update on public.movimientos for each row execute function public.d360_cuenta_inmutable();
create trigger t_aud after insert or update or delete on public.movimientos for each row execute function public.t_auditar();
alter table public.movimientos enable row level security;
revoke all on public.movimientos from anon;
create policy leer on public.movimientos for select to authenticated using (public.d360_es_finanzas(cuenta_id));
create policy escribir on public.movimientos for all to authenticated
  using (public.d360_es_finanzas(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'finanzas'))
  with check (public.d360_es_finanzas(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'finanzas'));

-- ---------- 3. Resumen del período ----------
create or replace function public.d360_finanzas_resumen(p_cuenta uuid, p_desde date, p_hasta date)
returns jsonb language sql stable security invoker set search_path = public as $$
  with pg as (
    select p.monto, coalesce(c.tipo, 'otro') tipo, p.fecha from pagos p left join cargos c on c.id = p.cargo_id
     where p.cuenta_id = p_cuenta and not p.anulado and p.fecha between p_desde and p_hasta
  ), mv as (
    select * from movimientos where cuenta_id = p_cuenta and fecha between p_desde and p_hasta
  )
  select jsonb_build_object(
    'cobrado', (select coalesce(sum(monto), 0) from pg),
    'por_tipo', (select coalesce(jsonb_object_agg(tipo, total), '{}') from (select tipo, sum(monto) total from pg group by 1) x),
    'otros_ingresos', (select coalesce(sum(monto), 0) from mv where tipo = 'ingreso'),
    'gastos', (select coalesce(sum(monto), 0) from mv where tipo = 'gasto'),
    'gastos_por_categoria', (select coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'total', total) order by total desc), '[]')
                             from (select categoria, sum(monto) total from mv where tipo = 'gasto' group by 1) x),
    'ingresos_por_categoria', (select coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'total', total) order by total desc), '[]')
                             from (select categoria, sum(monto) total from mv where tipo = 'ingreso' group by 1) x));
$$;
revoke all on function public.d360_finanzas_resumen(uuid, date, date) from public, anon;
grant execute on function public.d360_finanzas_resumen(uuid, date, date) to authenticated;

-- ---------- 4. La guía recuerda cómo cobra el profesor ----------
create or replace function public.d360_guia_guardar(p_cuenta uuid, p_cambios jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m miembros; v_g jsonb; v_aud jsonb; k text; v jsonb;
        v_prev text := coalesce(current_setting('d360.mantenimiento', true), '');
begin
  select * into v_m from miembros where cuenta_id = p_cuenta and user_id = auth.uid() and activo limit 1;
  if v_m.id is null then raise exception 'No perteneces a esta cuenta.' using errcode = '42501'; end if;
  if _d360_es_demo(p_cuenta) then return v_m.guia; end if;
  if jsonb_typeof(p_cambios) is distinct from 'object' then raise exception 'Cambios no válidos.'; end if;
  v_g := v_m.guia;
  for k, v in select key, value from jsonb_each(p_cambios) loop
    if k = 'bienvenida' and jsonb_typeof(v) = 'string' and v #>> '{}' in ('hecha', 'omitida') then
      v_g := v_g || jsonb_build_object(k, v);
    elsif k = 'cobro' and jsonb_typeof(v) = 'string' and v #>> '{}' in ('mensual', 'clase', 'ambos', 'no') then
      v_g := v_g || jsonb_build_object(k, v);
    elsif k in ('oculta', 'completa') and jsonb_typeof(v) = 'boolean' then
      v_g := v_g || jsonb_build_object(k, v);
    elsif k = 'ayudas' and jsonb_typeof(v) = 'object' then
      v_aud := coalesce(v_g -> 'ayudas', '{}'::jsonb);
      select v_aud || coalesce(jsonb_object_agg(x.key, true), '{}'::jsonb) into v_aud
        from jsonb_each(v) x where x.key ~ '^[a-z_]{1,30}$' and x.value = 'true'::jsonb;
      if (select count(*) from jsonb_object_keys(v_aud)) <= 40 then v_g := v_g || jsonb_build_object('ayudas', v_aud); end if;
    end if;
  end loop;
  perform set_config('d360.mantenimiento', 'on', true);
  update miembros set guia = v_g where id = v_m.id;
  perform set_config('d360.mantenimiento', v_prev, true);
  return v_g;
end $$;
revoke all on function public.d360_guia_guardar(uuid, jsonb) from public, anon;
grant execute on function public.d360_guia_guardar(uuid, jsonb) to authenticated;

-- ---------- 5. Demo: finanzas, rúbricas y banco ----------
create or replace function public.d360_sembrar_demo_extras()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c uuid; g record; e record; ev uuid; rb uuid; i int := 0; v_ant text; v_act text; v_cg uuid; mes_ant date; mes_act date;
        v_meses text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
begin
  perform set_config('d360.mantenimiento', 'on', true);
  select id into c from cuentas where codigo = 'DEMOPR' and es_demo;
  if c is null then return jsonb_build_object('ok', false, 'motivo', 'sin_demo'); end if;
  delete from movimientos where cuenta_id = c;
  delete from banco_preguntas where cuenta_id = c;
  update evaluaciones set rubrica_id = null where cuenta_id = c;
  delete from rubricas where cuenta_id = c;
  delete from pagos where cuenta_id = c;
  delete from cargos where cuenta_id = c;

  -- Mensualidades por grupo y descuento de hermanos
  update grupos set mensualidad = case when nombre like 'Matemática%' then 900 when nombre like 'Física%' then 800 when nombre like 'Admisión%' then 1200 else 0 end where cuenta_id = c;
  update estudiantes set descuento_pct = 0, tarifa_clase = 0 where cuenta_id = c;
  update estudiantes set descuento_pct = 50 where id = (select id from estudiantes where cuenta_id = c and estado = 'activo' order by apellidos, nombres offset 3 limit 1);
  mes_ant := (date_trunc('month', current_date) - interval '1 month')::date; mes_act := date_trunc('month', current_date)::date;
  v_ant := to_char(mes_ant, 'YYYY-MM'); v_act := to_char(mes_act, 'YYYY-MM');
  for g in select * from grupos where cuenta_id = c and estado = 'activo' and mensualidad > 0 loop
    insert into cargos(cuenta_id, estudiante_id, grupo_id, periodo, concepto, tipo, monto, descuento, vence)
    select c, e2.id, g.id, x.per, 'Mensualidad ' || v_meses[extract(month from x.f)::int] || ' ' || extract(year from x.f)::int || ' · ' || g.nombre, 'mensualidad',
           g.mensualidad, round(g.mensualidad * e2.descuento_pct / 100, 2), x.f + 4
      from grupo_estudiantes ge join estudiantes e2 on e2.id = ge.estudiante_id and e2.estado = 'activo'
      cross join (values (v_ant, mes_ant), (v_act, mes_act)) x(per, f)
     where ge.grupo_id = g.id and ge.estado = 'activo'
    on conflict do nothing;
  end loop;
  -- Pagos: casi todo el mes anterior; parte del actual
  for e in select cg.*, row_number() over (order by cg.id) rn from cargos cg where cg.cuenta_id = c and cg.tipo = 'mensualidad' loop
    if (e.periodo = v_ant and e.rn % 6 <> 0) or (e.periodo = v_act and e.rn % 3 = 0 and e.vence <= current_date) then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha)
      values (c, e.estudiante_id, e.id, e.monto - e.descuento, (array['efectivo','transferencia','efectivo'])[1 + (e.rn % 3)::int], least(current_date, e.vence + (e.rn % 4)::int));
    elsif e.periodo = v_ant and e.rn % 12 = 0 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha)
      values (c, e.estudiante_id, e.id, round((e.monto - e.descuento) / 2), 'efectivo', least(current_date, e.vence + 2));
    end if;
  end loop;
  -- Clases particulares
  for e in select id, row_number() over (order by apellidos) rn from estudiantes where cuenta_id = c and estado = 'activo' order by apellidos limit 3 loop
    update estudiantes set tarifa_clase = 350 where id = e.id;
    insert into cargos(cuenta_id, estudiante_id, concepto, tipo, monto, vence)
    values (c, e.id, 'Clase particular · ' || to_char(current_date - (e.rn * 4)::int, 'DD/MM/YYYY') || ' · Repaso para examen', 'clase', 350, current_date - (e.rn * 4)::int)
    returning id into v_cg;
    if e.rn < 3 then insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha) values (c, e.id, v_cg, 350, 'efectivo', current_date - (e.rn * 4)::int); end if;
  end loop;
  -- Gastos e ingresos
  insert into movimientos(cuenta_id, tipo, fecha, concepto, categoria, monto) values
    (c, 'gasto', current_date - 2, 'Fotocopias de guías', 'Fotocopias e impresión', 180),
    (c, 'gasto', current_date - 6, 'Recarga de internet', 'Internet y teléfono', 450),
    (c, 'gasto', current_date - 9, 'Marcadores y borrador', 'Materiales', 220),
    (c, 'gasto', current_date - 12, 'Pasajes a clases a domicilio', 'Transporte', 300),
    (c, 'gasto', mes_ant + 10, 'Recarga de internet', 'Internet y teléfono', 450),
    (c, 'gasto', mes_ant + 15, 'Libro de ejercicios', 'Materiales', 600),
    (c, 'ingreso', current_date - 5, 'Taller de repaso UNI (sábado)', 'Talleres', 1500),
    (c, 'ingreso', mes_ant + 20, 'Venta de guías impresas', 'Venta de material', 400);

  -- Rúbricas y una evaluación calificada con rúbrica
  insert into rubricas(cuenta_id, nombre, criterios) values
    (c, 'Exposición oral', '[{"nombre":"Dominio del tema","niveles":[{"nombre":"Excelente","puntos":4},{"nombre":"Bueno","puntos":3},{"nombre":"Regular","puntos":2},{"nombre":"Por mejorar","puntos":1}]},{"nombre":"Claridad y orden","niveles":[{"nombre":"Excelente","puntos":4},{"nombre":"Bueno","puntos":3},{"nombre":"Regular","puntos":2},{"nombre":"Por mejorar","puntos":1}]},{"nombre":"Material de apoyo","niveles":[{"nombre":"Excelente","puntos":4},{"nombre":"Bueno","puntos":3},{"nombre":"Regular","puntos":2},{"nombre":"Por mejorar","puntos":1}]}]')
  returning id into rb;
  insert into rubricas(cuenta_id, nombre, criterios) values
    (c, 'Tarea en el cuaderno', '[{"nombre":"Ejercicios completos","niveles":[{"nombre":"Excelente","puntos":4},{"nombre":"Bueno","puntos":3},{"nombre":"Regular","puntos":2},{"nombre":"Por mejorar","puntos":1}]},{"nombre":"Procedimiento correcto","niveles":[{"nombre":"Excelente","puntos":4},{"nombre":"Bueno","puntos":3},{"nombre":"Regular","puntos":2},{"nombre":"Por mejorar","puntos":1}]},{"nombre":"Orden y limpieza","niveles":[{"nombre":"Excelente","puntos":4},{"nombre":"Bueno","puntos":3},{"nombre":"Regular","puntos":2},{"nombre":"Por mejorar","puntos":1}]}]');
  update evaluaciones set rubrica_id = rb, tipo = 'proyecto'
   where id = (select id from evaluaciones where cuenta_id = c and titulo like 'Proyecto: geometría%' limit 1) returning id into ev;
  if ev is not null then
    update evaluaciones set fecha = current_date - 1 where id = ev;
    insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje, entregado, rubrica_detalle)
    select c, ev, ge.estudiante_id, x.pts * 100.0 / 12, true,
           jsonb_build_array(jsonb_build_object('criterio', 'Dominio del tema', 'nivel', x.n1, 'puntos', x.p1),
                             jsonb_build_object('criterio', 'Claridad y orden', 'nivel', x.n2, 'puntos', x.p2),
                             jsonb_build_object('criterio', 'Material de apoyo', 'nivel', 'Bueno', 'puntos', 3))
      from (select ge0.*, row_number() over (order by ge0.estudiante_id) rn from grupo_estudiantes ge0
             where ge0.grupo_id = (select grupo_id from evaluaciones where id = ev) and ge0.estado = 'activo') ge
      cross join lateral (select case when ge.rn % 2 = 0 then 'Excelente' else 'Bueno' end n1, case when ge.rn % 2 = 0 then 4 else 3 end p1,
                                 case when ge.rn % 3 = 0 then 'Regular' else 'Bueno' end n2, case when ge.rn % 3 = 0 then 2 else 3 end p2,
                                 (case when ge.rn % 2 = 0 then 4 else 3 end) + (case when ge.rn % 3 = 0 then 2 else 3 end) + 3 pts) x
     where ge.rn <= 5
    on conflict (evaluacion_id, estudiante_id) do update set puntaje = excluded.puntaje, rubrica_detalle = excluded.rubrica_detalle;
  end if;

  -- Banco de preguntas
  insert into banco_preguntas(cuenta_id, tema, tipo, enunciado, opciones, correcta, puntos, usada) values
    (c, 'Ecuaciones', 'opcion', '¿Cuál es el valor de x en 3x − 6 = 9?', '["3","5","6","15"]', '1', 2, 3),
    (c, 'Ecuaciones', 'corta', 'Resuelve: x + 7 = 12. ¿Cuánto vale x?', '[]', '["5"]', 1, 2),
    (c, 'Ecuaciones', 'vf', 'Si 2x = 8, entonces x = 4.', '[]', 'true', 1, 1),
    (c, 'Fracciones', 'opcion', '¿Cuál fracción es equivalente a 1/2?', '["2/3","3/6","2/5","4/6"]', '1', 2, 2),
    (c, 'Fracciones', 'vf', '3/4 es mayor que 2/3.', '[]', 'true', 1, 0),
    (c, 'Física: cinemática', 'opcion', 'Un auto recorre 120 km en 2 horas. ¿Cuál es su rapidez media?', '["40 km/h","60 km/h","120 km/h","240 km/h"]', '1', 2, 1),
    (c, 'Física: cinemática', 'corta', '¿Cuál es la unidad de la velocidad en el Sistema Internacional?', '[]', '["m/s","metros por segundo"]', 1, 0),
    (c, 'Física: cinemática', 'desarrollo', 'Explica con tus palabras la diferencia entre rapidez y velocidad.', '[]', null, 3, 0);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.d360_sembrar_demo_extras() from public, anon, authenticated;

create or replace function public.d360_admin_reiniciar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  r := d360_sembrar_demos();
  perform d360_sembrar_demo_aula();
  perform d360_sembrar_demo_extras();
  return r || jsonb_build_object('estudiantes', (r ->> 'estudiantes')::int + d360_sembrar_demo_colegio());
end $$;
revoke execute on function public.d360_admin_reiniciar_demos() from public, anon;
select cron.schedule('d360-reiniciar-demos', '20 6 * * *', $$select public.d360_sembrar_demos(); select public.d360_sembrar_demo_aula(); select public.d360_sembrar_demo_extras();$$);
