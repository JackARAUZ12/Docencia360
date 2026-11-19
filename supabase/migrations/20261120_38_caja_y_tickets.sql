-- Caja: cobrar varios conceptos en un solo paso (p. ej. matrícula + mensualidad,
-- un solo comprobante), caja del día por cajero y método, cierre de caja con
-- efectivo contado y diferencia (inmutable), y datos del ticket de cada cuenta.
-- No cambia cómo se numeran, validan o anulan los pagos: usa las mismas reglas.

-- ---------- 1. Cobrar varios cobros de un estudiante a la vez ----------
-- Corre con los permisos de quien cobra (RLS y validaciones de siempre).
-- Todo o nada: si un concepto falla, no se registra ninguno.
create or replace function public.d360_cobrar_varios(p_cuenta uuid, p_estudiante uuid, p_items jsonb,
  p_metodo text default 'efectivo', p_fecha date default current_date, p_referencia text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare it jsonb; v_c cargos; v_p pagos; res jsonb := '[]'::jsonb; n int := 0; v_vistos uuid[] := '{}';
begin
  if not (d360_es_finanzas(p_cuenta) and d360_cuenta_operativa(p_cuenta) and d360_tiene_funcion(p_cuenta, 'finanzas')) then
    raise exception 'No tienes permiso para cobrar.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 24 then raise exception 'Elige entre 1 y 24 conceptos.'; end if;
  if p_metodo not in ('efectivo','transferencia','tarjeta','deposito','otro') then raise exception 'Forma de pago no válida.'; end if;
  if coalesce(p_fecha, current_date) > current_date then raise exception 'La fecha del pago no puede ser futura.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_c from cargos where id = (it ->> 'cargo_id')::uuid and cuenta_id = p_cuenta and estudiante_id = p_estudiante;
    if v_c.id is null then raise exception 'Un concepto no pertenece a este estudiante.'; end if;
    if v_c.id = any(v_vistos) then raise exception 'Un concepto está repetido.'; end if;
    v_vistos := v_vistos || v_c.id;
    if coalesce((it ->> 'monto')::numeric, 0) <= 0 then raise exception 'Cada monto debe ser mayor que cero.'; end if;
    insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha, referencia)
    values (p_cuenta, p_estudiante, v_c.id, round((it ->> 'monto')::numeric, 2), p_metodo, coalesce(p_fecha, current_date), nullif(trim(coalesce(p_referencia, '')), ''))
    returning * into v_p;
    res := res || jsonb_build_object('id', v_p.id, 'recibo', v_p.recibo, 'monto', v_p.monto, 'cargo_id', v_c.id, 'concepto', v_c.concepto,
                                     'saldo', (select monto - descuento - pagado from cargos where id = v_c.id));
    n := n + 1;
  end loop;
  return jsonb_build_object('pagos', res, 'total', (select sum((x ->> 'monto')::numeric) from jsonb_array_elements(res) x), 'fecha', coalesce(p_fecha, current_date),
    'metodo', p_metodo, 'referencia', nullif(trim(coalesce(p_referencia, '')), ''));
end $$;
revoke all on function public.d360_cobrar_varios(uuid, uuid, jsonb, text, date, text) from public, anon;
grant execute on function public.d360_cobrar_varios(uuid, uuid, jsonb, text, date, text) to authenticated;

-- ---------- 2. Cierres de caja (no se editan ni se borran) ----------
create table if not exists public.cierres_caja (
  id               uuid primary key default gen_random_uuid(),
  cuenta_id        uuid not null references public.cuentas(id) on delete cascade,
  fecha            date not null,
  cajero           uuid,                 -- usuario que cobró; null = toda la caja
  cajero_nombre    text,
  por_metodo       jsonb not null default '{}'::jsonb,
  total            numeric(12,2) not null default 0,
  recibos          int not null default 0,
  anulados         numeric(12,2) not null default 0,
  efectivo_contado numeric(12,2) check (efectivo_contado >= 0),
  diferencia       numeric(12,2),
  nota             text check (length(nota) <= 500),
  cerrado_por      uuid default auth.uid(),
  cerrado_por_nombre text,
  creado           timestamptz not null default now()
);
create unique index if not exists cierres_caja_unico on public.cierres_caja(cuenta_id, fecha, coalesce(cajero, '00000000-0000-0000-0000-000000000000'::uuid));
drop trigger if exists t_aud on public.cierres_caja;
create trigger t_aud after insert or update or delete on public.cierres_caja for each row execute function public.t_auditar();
alter table public.cierres_caja enable row level security;
revoke all on public.cierres_caja from anon;
drop policy if exists leer on public.cierres_caja;
create policy leer on public.cierres_caja for select to authenticated using (public.d360_es_finanzas(cuenta_id));
-- Sin políticas de escritura: solo se crea con d360_caja_cerrar.

-- Pagos del día (con quién cobró), totales por método y cierres ya hechos
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
  )
  select jsonb_build_object('fecha', p_fecha, 'cajero', p_cajero,
    'pagos', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'recibo', recibo, 'hora', creado, 'estudiante', estudiante, 'estudiante_id', estudiante_id,
                 'concepto', concepto, 'metodo', metodo, 'referencia', referencia, 'monto', monto, 'anulado', anulado,
                 'cajero', registrado_por, 'cajero_nombre', coalesce(cajero_nombre, 'Otro usuario')) order by recibo), '[]') from pg),
    'por_metodo', (select coalesce(jsonb_object_agg(metodo, t), '{}') from (select metodo, sum(monto) t from pg where not anulado group by 1) x),
    'total', (select coalesce(sum(monto), 0) from pg where not anulado),
    'recibos', (select count(*) from pg where not anulado),
    'anulados', (select coalesce(sum(monto), 0) from pg where anulado),
    'cajeros', (select coalesce(jsonb_agg(distinct jsonb_build_object('id', registrado_por, 'nombre', coalesce(cajero_nombre, 'Otro usuario'))), '[]')
                  from pg where registrado_por is not null),
    'cierres', (select coalesce(jsonb_agg(to_jsonb(k) order by k.creado), '[]') from cierres_caja k
                 where k.cuenta_id = p_cuenta and k.fecha = p_fecha and (p_cajero is null or k.cajero is not distinct from p_cajero)))
  into res;
  return res;
end $$;
revoke all on function public.d360_caja_dia(uuid, date, uuid) from public, anon;
grant execute on function public.d360_caja_dia(uuid, date, uuid) to authenticated;

-- Cerrar caja: los totales los calcula el servidor (no se pueden alterar desde el navegador)
create or replace function public.d360_caja_cerrar(p_cuenta uuid, p_fecha date, p_cajero uuid, p_efectivo_contado numeric, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb; v_id uuid; v_ef numeric;
begin
  if not (d360_es_finanzas(p_cuenta) and d360_cuenta_operativa(p_cuenta)) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if p_fecha > current_date then raise exception 'No se puede cerrar un día futuro.'; end if;
  if p_efectivo_contado is null or p_efectivo_contado < 0 or p_efectivo_contado > 100000000 then raise exception 'Escribe el efectivo contado.'; end if;
  if exists(select 1 from cierres_caja where cuenta_id = p_cuenta and fecha = p_fecha and cajero is not distinct from p_cajero) then
    raise exception 'Esta caja ya se cerró ese día.';
  end if;
  d := d360_caja_dia(p_cuenta, p_fecha, p_cajero);
  v_ef := coalesce((d -> 'por_metodo' ->> 'efectivo')::numeric, 0);
  insert into cierres_caja(cuenta_id, fecha, cajero, cajero_nombre, por_metodo, total, recibos, anulados, efectivo_contado, diferencia, nota, cerrado_por_nombre)
  values (p_cuenta, p_fecha, p_cajero,
          case when p_cajero is null then 'Toda la caja' else (select nombre from miembros where cuenta_id = p_cuenta and user_id = p_cajero limit 1) end,
          d -> 'por_metodo', (d ->> 'total')::numeric, (d ->> 'recibos')::int, (d ->> 'anulados')::numeric,
          round(p_efectivo_contado, 2), round(p_efectivo_contado - v_ef, 2), left(nullif(trim(coalesce(p_nota, '')), ''), 500),
          (select nombre from miembros where cuenta_id = p_cuenta and user_id = auth.uid() limit 1))
  returning id into v_id;
  perform d360_log(p_cuenta, 'cierre_caja', 'cierres_caja', v_id::text, jsonb_build_object('fecha', p_fecha, 'total', d ->> 'total', 'diferencia', round(p_efectivo_contado - v_ef, 2)));
  return (select to_jsonb(k) from cierres_caja k where id = v_id);
end $$;
revoke all on function public.d360_caja_cerrar(uuid, date, uuid, numeric, text) from public, anon;
grant execute on function public.d360_caja_cerrar(uuid, date, uuid, numeric, text) to authenticated;

-- ---------- 3. Datos del ticket (encabezado y pie) ----------
create or replace function public.d360_ticket_guardar(p_cuenta uuid, p_cfg jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb := '{}'::jsonb; k text; v_prev text := coalesce(current_setting('d360.mantenimiento', true), '');
begin
  if not (d360_es_finanzas(p_cuenta) and d360_cuenta_operativa(p_cuenta)) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if jsonb_typeof(p_cfg) is distinct from 'object' then raise exception 'Datos no válidos.'; end if;
  foreach k in array array['ruc', 'direccion', 'telefono', 'pie'] loop
    if jsonb_typeof(p_cfg -> k) = 'string' and length(trim(p_cfg ->> k)) > 0 then v := v || jsonb_build_object(k, left(trim(p_cfg ->> k), case when k = 'pie' then 160 else 80 end)); end if;
  end loop;
  if jsonb_typeof(p_cfg -> 'mostrar_saldo') = 'boolean' then v := v || jsonb_build_object('mostrar_saldo', p_cfg -> 'mostrar_saldo'); end if;
  if _d360_es_demo(p_cuenta) then return v; end if;   -- en la demostración no se guarda
  perform set_config('d360.mantenimiento', 'on', true);
  update cuentas set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('ticket', v) where id = p_cuenta;
  perform set_config('d360.mantenimiento', v_prev, true);
  return v;
end $$;
revoke all on function public.d360_ticket_guardar(uuid, jsonb) from public, anon;
grant execute on function public.d360_ticket_guardar(uuid, jsonb) to authenticated;
