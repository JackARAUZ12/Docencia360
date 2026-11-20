-- 41 · Modo sin internet (híbrido): cobros que se suben después sin duplicarse ni perderse.
--
-- Cuando se cobra sin conexión, el navegador guarda el cobro con una «clave» única
-- (p_clave) y lo envía al volver el internet. Si el envío se repite (se cortó la
-- respuesta, otro intento automático…), el servidor reconoce la clave y devuelve el
-- mismo resultado: NUNCA se registra dos veces.
--
-- Si mientras tanto ese concepto ya se pagó en otro equipo, el dinero recibido no se
-- pierde ni se rechaza: lo que exceda el saldo queda como «abono a cuenta» (saldo a
-- favor) y se informa. Así la caja cuadra con el dinero real.

alter table public.pagos  add column if not exists clave_offline uuid;
alter table public.pagos  add column if not exists cobrado_en timestamptz;   -- hora real del cobro (si fue sin conexión)
alter table public.cargos add column if not exists clave_offline uuid;
create index if not exists pagos_clave_offline  on public.pagos(cuenta_id, clave_offline)  where clave_offline is not null;
create index if not exists cargos_clave_offline on public.cargos(cuenta_id, clave_offline) where clave_offline is not null;

-- Hora real del cobro: nunca en el futuro (las funciones rechazan las de más de 45 días)
create or replace function public._d360_hora_cobro(p timestamptz)
returns timestamptz language sql stable set search_path = public as $$
  select case when p is null then null else least(p, now()) end
$$;
revoke all on function public._d360_hora_cobro(timestamptz) from public, anon;
grant execute on function public._d360_hora_cobro(timestamptz) to authenticated;   -- solo recorta la hora; no lee datos

-- ---------- Cobrar varios conceptos (ahora con clave para subir sin duplicar) ----------
drop function if exists public.d360_cobrar_varios(uuid, uuid, jsonb, text, date, text);
create or replace function public.d360_cobrar_varios(p_cuenta uuid, p_estudiante uuid, p_items jsonb,
  p_metodo text default 'efectivo', p_fecha date default current_date, p_referencia text default null,
  p_clave uuid default null, p_cobrado_en timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare it jsonb; v_c cargos; v_p pagos; res jsonb := '[]'::jsonb; v_vistos uuid[] := '{}'; v_monto numeric; v_saldo numeric;
        v_favor numeric := 0; v_aj jsonb := '[]'::jsonb; v_hora timestamptz := _d360_hora_cobro(p_cobrado_en);
        v_ref text := nullif(trim(coalesce(p_referencia, '')), ''); v_fecha date := coalesce(p_fecha, current_date);
begin
  if not (d360_es_finanzas(p_cuenta) and d360_cuenta_operativa(p_cuenta) and d360_tiene_funcion(p_cuenta, 'finanzas')) then
    raise exception 'No tienes permiso para cobrar.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 24 then raise exception 'Elige entre 1 y 24 conceptos.'; end if;
  if p_metodo not in ('efectivo','transferencia','tarjeta','deposito','otro') then raise exception 'Forma de pago no válida.'; end if;
  if v_fecha > current_date then raise exception 'La fecha del pago no puede ser futura.'; end if;
  if v_hora is not null and v_hora < now() - interval '45 days' then raise exception 'Ese cobro sin conexión es demasiado antiguo para subirlo; regístralo de nuevo.'; end if;

  if p_clave is not null then
    -- Un mismo cobro sin conexión no se registra dos veces (aunque llegue repetido a la vez)
    perform pg_advisory_xact_lock(hashtextextended('cobro:' || p_clave::text, 0));
    if exists (select 1 from pagos where cuenta_id = p_cuenta and clave_offline = p_clave) then
      return (select jsonb_build_object('pagos', jsonb_agg(jsonb_build_object('id', p.id, 'recibo', p.recibo, 'monto', p.monto, 'cargo_id', p.cargo_id,
                'concepto', coalesce(c.concepto, 'Abono a cuenta'), 'saldo', case when c.id is null then null else c.monto - c.descuento - c.pagado end) order by p.recibo),
                'total', sum(p.monto), 'fecha', min(p.fecha), 'metodo', min(p.metodo), 'referencia', min(p.referencia), 'repetido', true)
                from pagos p left join cargos c on c.id = p.cargo_id where p.cuenta_id = p_cuenta and p.clave_offline = p_clave);
    end if;
    if not exists (select 1 from estudiantes where id = p_estudiante and cuenta_id = p_cuenta) then raise exception 'Estudiante no válido.'; end if;
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_monto := round(coalesce((it ->> 'monto')::numeric, 0), 2);
    if v_monto <= 0 then raise exception 'Cada monto debe ser mayor que cero.'; end if;
    select * into v_c from cargos where id = (it ->> 'cargo_id')::uuid and cuenta_id = p_cuenta and estudiante_id = p_estudiante for update;
    if v_c.id is not null and v_c.id = any(v_vistos) then raise exception 'Un concepto está repetido.'; end if;
    if p_clave is null then
      if v_c.id is null then raise exception 'Un concepto no pertenece a este estudiante.'; end if;
    else
      -- Subida de un cobro sin conexión: el dinero ya se recibió. Lo que no quepa en el
      -- concepto (ya pagado en otro equipo, anulado o borrado) queda como saldo a favor.
      v_saldo := case when v_c.id is null or v_c.estado = 'anulado' then 0 else greatest(v_c.monto - v_c.descuento - v_c.pagado, 0) end;
      if v_monto > v_saldo + 0.005 then
        v_favor := v_favor + (v_monto - v_saldo);
        v_aj := v_aj || jsonb_build_object('concepto', coalesce(v_c.concepto, 'Concepto que ya no existe'), 'monto', v_monto, 'aplicado', v_saldo, 'a_favor', v_monto - v_saldo);
        v_monto := v_saldo;
      end if;
      if v_monto <= 0 then continue; end if;
    end if;
    v_vistos := v_vistos || v_c.id;
    insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha, referencia, clave_offline, cobrado_en)
    values (p_cuenta, p_estudiante, v_c.id, v_monto, p_metodo, v_fecha, v_ref, p_clave, v_hora)
    returning * into v_p;
    res := res || jsonb_build_object('id', v_p.id, 'recibo', v_p.recibo, 'monto', v_p.monto, 'cargo_id', v_c.id, 'concepto', v_c.concepto,
                                     'saldo', (select monto - descuento - pagado from cargos where id = v_c.id));
  end loop;
  if v_favor > 0 then
    insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha, referencia, clave_offline, cobrado_en)
    values (p_cuenta, p_estudiante, null, round(v_favor, 2), p_metodo, v_fecha, left(coalesce(v_ref || ' · ', '') || 'Saldo a favor (cobro sin conexión)', 200), p_clave, v_hora)
    returning * into v_p;
    res := res || jsonb_build_object('id', v_p.id, 'recibo', v_p.recibo, 'monto', v_p.monto, 'cargo_id', null, 'concepto', 'Abono a cuenta (saldo a favor)', 'saldo', null);
  end if;
  return jsonb_build_object('pagos', res, 'total', (select sum((x ->> 'monto')::numeric) from jsonb_array_elements(res) x), 'fecha', v_fecha,
    'metodo', p_metodo, 'referencia', v_ref, 'ajustes', case when v_favor > 0 then v_aj end);
end $$;
revoke all on function public.d360_cobrar_varios(uuid, uuid, jsonb, text, date, text, uuid, timestamptz) from public, anon;
grant execute on function public.d360_cobrar_varios(uuid, uuid, jsonb, text, date, text, uuid, timestamptz) to authenticated;

-- ---------- Clase particular cobrada (profesor), también con clave ----------
drop function if exists public.d360_cobro_clase(uuid, uuid, date, text, numeric, boolean, text);
create or replace function public.d360_cobro_clase(p_cuenta uuid, p_estudiante uuid, p_fecha date, p_detalle text, p_monto numeric,
                                                   p_pagado boolean default false, p_metodo text default 'efectivo',
                                                   p_clave uuid default null, p_cobrado_en timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cargo uuid; v_pago pagos; v_nom text; v_hora timestamptz := _d360_hora_cobro(p_cobrado_en);
begin
  if not (d360_es_finanzas(p_cuenta) and d360_cuenta_operativa(p_cuenta)) then
    raise exception 'No tienes permiso para registrar cobros, o la suscripción no está vigente.' using errcode = '42501';
  end if;
  if not d360_tiene_funcion(p_cuenta, 'finanzas') then raise exception 'Tu plan no incluye las finanzas.' using hint = 'limite_plan'; end if;
  if p_clave is not null then
    perform pg_advisory_xact_lock(hashtextextended('clase:' || p_clave::text, 0));
    select id into v_cargo from cargos where cuenta_id = p_cuenta and clave_offline = p_clave;
    if v_cargo is not null then
      select * into v_pago from pagos where cargo_id = v_cargo and clave_offline = p_clave limit 1;
      return jsonb_build_object('cargo_id', v_cargo, 'pago_id', v_pago.id, 'recibo', v_pago.recibo, 'repetido', true);
    end if;
  end if;
  select trim(nombres || ' ' || apellidos) into v_nom from estudiantes where id = p_estudiante and cuenta_id = p_cuenta;
  if v_nom is null then raise exception 'Estudiante no válido.'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'Escribe cuánto cobras por la clase.'; end if;
  if p_metodo not in ('efectivo','transferencia','tarjeta','deposito','otro') then raise exception 'Forma de pago no válida.'; end if;
  if v_hora is not null and v_hora < now() - interval '45 days' then raise exception 'Ese cobro sin conexión es demasiado antiguo para subirlo; regístralo de nuevo.'; end if;
  insert into cargos(cuenta_id, estudiante_id, concepto, tipo, monto, vence, clave_offline)
  values (p_cuenta, p_estudiante, left('Clase particular · ' || to_char(coalesce(p_fecha, current_date), 'DD/MM/YYYY') || coalesce(' · ' || nullif(trim(p_detalle), ''), ''), 200),
          'clase', p_monto, coalesce(p_fecha, current_date), p_clave)
  returning id into v_cargo;
  if p_pagado then
    insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha, clave_offline, cobrado_en)
    values (p_cuenta, p_estudiante, v_cargo, p_monto, p_metodo, least(coalesce(p_fecha, current_date), current_date), p_clave, v_hora) returning * into v_pago;
  end if;
  return jsonb_build_object('cargo_id', v_cargo, 'pago_id', v_pago.id, 'recibo', v_pago.recibo);
end $$;
revoke all on function public.d360_cobro_clase(uuid, uuid, date, text, numeric, boolean, text, uuid, timestamptz) from public, anon;
grant execute on function public.d360_cobro_clase(uuid, uuid, date, text, numeric, boolean, text, uuid, timestamptz) to authenticated;

-- ---------- Caja del día: hora real del cobro y cobros que llegaron después del cierre ----------
create or replace function public.d360_caja_dia(p_cuenta uuid, p_fecha date, p_cajero uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not d360_es_finanzas(p_cuenta) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  with pg as (
    select p.*, coalesce(c.concepto, 'Abono a cuenta') concepto, trim(e.nombres || ' ' || e.apellidos) estudiante,
           (select m.nombre from miembros m where m.cuenta_id = p_cuenta and m.user_id = p.registrado_por limit 1) cajero_nombre
      from pagos p join estudiantes e on e.id = p.estudiante_id left join cargos c on c.id = p.cargo_id
     where p.cuenta_id = p_cuenta and p.fecha = p_fecha and (p_cajero is null or p.registrado_por = p_cajero)
  ), ci as (
    select max(k.creado) ultimo from cierres_caja k
     where k.cuenta_id = p_cuenta and k.fecha = p_fecha and (p_cajero is null or k.cajero is not distinct from p_cajero)
  )
  select jsonb_build_object('fecha', p_fecha, 'cajero', p_cajero,
    'pagos', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'recibo', recibo, 'hora', coalesce(cobrado_en, creado), 'estudiante', estudiante, 'estudiante_id', estudiante_id,
                 'concepto', concepto, 'metodo', metodo, 'referencia', referencia, 'monto', monto, 'anulado', anulado, 'sin_conexion', clave_offline is not null,
                 'cajero', registrado_por, 'cajero_nombre', coalesce(cajero_nombre, 'Otro usuario')) order by recibo), '[]') from pg),
    'por_metodo', (select coalesce(jsonb_object_agg(metodo, t), '{}') from (select metodo, sum(monto) t from pg where not anulado group by 1) x),
    'total', (select coalesce(sum(monto), 0) from pg where not anulado),
    'recibos', (select count(*) from pg where not anulado),
    'anulados', (select coalesce(sum(monto), 0) from pg where anulado),
    'cajeros', (select coalesce(jsonb_agg(distinct jsonb_build_object('id', registrado_por, 'nombre', coalesce(cajero_nombre, 'Otro usuario'))), '[]')
                  from pg where registrado_por is not null),
    'cierres', (select coalesce(jsonb_agg(to_jsonb(k) order by k.creado), '[]') from cierres_caja k
                 where k.cuenta_id = p_cuenta and k.fecha = p_fecha and (p_cajero is null or k.cajero is not distinct from p_cajero)),
    -- Cobros hechos sin conexión que se subieron DESPUÉS de cerrar la caja de ese día
    'tras_cierre', (select jsonb_build_object('cantidad', count(*), 'total', coalesce(sum(monto), 0)) from pg, ci
                     where ci.ultimo is not null and pg.creado > ci.ultimo and not pg.anulado))
  into res;
  return res;
end $$;
revoke all on function public.d360_caja_dia(uuid, date, uuid) from public, anon;
grant execute on function public.d360_caja_dia(uuid, date, uuid) to authenticated;
