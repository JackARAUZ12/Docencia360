-- Pago a instructores (academias): cada instructor tiene su forma de pago
--   · por hora   → horas de clase dadas en el mes × tarifa
--   · por clase  → clases dadas en el mes × tarifa
--   · fijo       → salario fijo mensual
-- Las clases dadas salen de la asistencia (una clase = un grupo con lista en una fecha);
-- la duración, del horario del grupo ese día. Quien la dio: el instructor que pasó la
-- lista; si la pasó la administración, el instructor asignado al grupo.
-- Cada pago queda como gasto («Pago a instructores») en Finanzas, así la ganancia es real.

-- ---------- 1. Tarifa de cada instructor ----------
create table if not exists public.tarifas_instructor (
  id          uuid primary key default gen_random_uuid(),
  miembro_id  uuid not null unique references public.miembros(id) on delete cascade,
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  forma       text not null check (forma in ('hora','clase','fijo')),
  monto       numeric(12,2) not null check (monto >= 0 and monto <= 10000000),
  actualizado timestamptz not null default now()
);
create index if not exists tarifas_instructor_cuenta on public.tarifas_instructor(cuenta_id);
drop trigger if exists t_mc on public.tarifas_instructor;
create trigger t_mc before insert or update on public.tarifas_instructor for each row execute function public.d360_misma_cuenta('miembro_id:miembros');
drop trigger if exists t_ci on public.tarifas_instructor;
create trigger t_ci before update on public.tarifas_instructor for each row execute function public.d360_cuenta_inmutable();
drop trigger if exists t_aud on public.tarifas_instructor;
create trigger t_aud after insert or update or delete on public.tarifas_instructor for each row execute function public.t_auditar();
alter table public.tarifas_instructor enable row level security;
revoke all on public.tarifas_instructor from anon;
drop policy if exists leer on public.tarifas_instructor;
create policy leer on public.tarifas_instructor for select to authenticated
  using (public.d360_es_finanzas(cuenta_id) or miembro_id = public.d360_mi_miembro(cuenta_id));
drop policy if exists escribir on public.tarifas_instructor;
create policy escribir on public.tarifas_instructor for all to authenticated
  using (public.d360_es_finanzas(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'finanzas'))
  with check (public.d360_es_finanzas(cuenta_id) and public.d360_cuenta_operativa(cuenta_id) and public.d360_tiene_funcion(cuenta_id, 'finanzas'));

-- ---------- 2. Un pago a instructor es un gasto con su instructor y su mes ----------
alter table public.movimientos add column if not exists miembro_id uuid references public.miembros(id) on delete set null;
alter table public.movimientos add column if not exists periodo text check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$');
alter table public.movimientos add column if not exists detalle jsonb;
create index if not exists movimientos_miembro on public.movimientos(miembro_id, periodo) where miembro_id is not null;
drop trigger if exists t_mc on public.movimientos;
create trigger t_mc before insert or update on public.movimientos for each row execute function public.d360_misma_cuenta('miembro_id:miembros');

-- ---------- 3. Liquidación del mes ----------
-- Finanzas ve a todos; un instructor solo se ve a sí mismo («Mis pagos»).
-- Cálculo interno (sin revisar permisos): lo usan la función pública y la demo nocturna.
create or replace function public._d360_liquidacion(p_cuenta uuid, p_periodo text, v_fin boolean, v_yo uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ini date; v_hasta date; res jsonb;
begin
  v_ini := (p_periodo || '-01')::date; v_hasta := (v_ini + interval '1 month' - interval '1 day')::date;
  with cl as (
    select a.grupo_id, a.fecha, (array_agg(a.registrado_por order by a.creado))[1] reg
      from asistencias a where a.cuenta_id = p_cuenta and a.fecha between v_ini and v_hasta group by 1, 2
  ), quien as (
    select cl.grupo_id, cl.fecha, coalesce(
             (select m.id from miembros m where m.cuenta_id = p_cuenta and m.user_id = cl.reg and m.rol = 'docente' limit 1),
             (select gd.miembro_id from grupo_docentes gd join miembros m on m.id = gd.miembro_id
               where gd.grupo_id = cl.grupo_id and m.rol = 'docente' order by gd.es_guia desc, gd.id limit 1)) miembro_id
      from cl
  ), dur as (
    select q.*, g.nombre grupo,
           (select round(sum(extract(epoch from (h.hora_fin - h.hora_inicio)) / 3600.0)::numeric, 2) from horarios h
             where h.grupo_id = q.grupo_id and h.dia = extract(isodow from q.fecha)::int
               and (h.miembro_id is null or h.miembro_id = q.miembro_id)) horas
      from quien q join grupos g on g.id = q.grupo_id
  ), inst as (
    select m.id, m.nombre, m.telefono, m.activo, t.forma, t.monto
      from miembros m left join tarifas_instructor t on t.miembro_id = m.id
     where m.cuenta_id = p_cuenta and m.rol = 'docente' and (v_fin or m.id = v_yo)
       and (m.activo or exists(select 1 from dur where dur.miembro_id = m.id)
            or exists(select 1 from movimientos mv where mv.miembro_id = m.id and mv.periodo = p_periodo))
  ), calc as (
    select i.*,
           (select count(*) from dur where dur.miembro_id = i.id) clases,
           (select coalesce(sum(horas), 0) from dur where dur.miembro_id = i.id) horas,
           (select count(*) from dur where dur.miembro_id = i.id and horas is null) sin_horario,
           (select coalesce(sum(monto), 0) from movimientos mv where mv.miembro_id = i.id and mv.periodo = p_periodo and mv.tipo = 'gasto') pagado
      from inst i
  )
  select jsonb_build_object(
    'periodo', p_periodo, 'desde', v_ini, 'hasta', v_hasta, 'puede_pagar', v_fin and d360_cuenta_operativa(p_cuenta),
    'instructores', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'nombre', c.nombre, 'telefono', c.telefono, 'activo', c.activo, 'forma', c.forma, 'tarifa', c.monto,
        'clases', c.clases, 'horas', c.horas, 'sin_horario', c.sin_horario,
        'calculado', case c.forma when 'hora' then round(c.horas * c.monto, 2) when 'clase' then round(c.clases * c.monto, 2) when 'fijo' then c.monto end,
        'pagado', c.pagado,
        'detalle', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.fecha, 'grupo', d.grupo, 'horas', d.horas) order by d.fecha, d.grupo), '[]') from dur d where d.miembro_id = c.id),
        'pagos', (select coalesce(jsonb_agg(jsonb_build_object('id', mv.id, 'fecha', mv.fecha, 'monto', mv.monto, 'nota', mv.nota, 'detalle', mv.detalle) order by mv.fecha), '[]')
                    from movimientos mv where mv.miembro_id = c.id and mv.periodo = p_periodo and mv.tipo = 'gasto')
      ) order by c.activo desc, c.nombre), '[]') from calc c),
    'sin_instructor', case when v_fin then (select coalesce(jsonb_agg(jsonb_build_object('fecha', d.fecha, 'grupo', d.grupo) order by d.fecha), '[]') from dur d where d.miembro_id is null) else '[]'::jsonb end
  ) into res;
  return res;
end $$;
revoke all on function public._d360_liquidacion(uuid, text, boolean, uuid) from public, anon, authenticated;

create or replace function public.d360_instructores_liquidacion(p_cuenta uuid, p_periodo text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_fin boolean := d360_es_finanzas(p_cuenta); v_yo uuid := d360_mi_miembro(p_cuenta);
begin
  if not v_fin and v_yo is null then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if p_periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Mes no válido.'; end if;
  if not d360_tiene_funcion(p_cuenta, 'finanzas') then raise exception 'Tu plan no incluye finanzas.' using hint = 'limite_plan'; end if;
  return _d360_liquidacion(p_cuenta, p_periodo, v_fin, v_yo);
end $$;
revoke all on function public.d360_instructores_liquidacion(uuid, text) from public, anon;
grant execute on function public.d360_instructores_liquidacion(uuid, text) to authenticated;

-- ---------- 4. Registrar un pago ----------
create or replace function public.d360_instructor_pagar(p_cuenta uuid, p_miembro uuid, p_periodo text, p_monto numeric,
  p_fecha date default current_date, p_metodo text default 'efectivo', p_nota text default null, p_detalle jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_m miembros; v_id uuid; v_mes text;
begin
  if not d360_es_finanzas(p_cuenta) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  if not d360_cuenta_operativa(p_cuenta) then raise exception 'La cuenta no está activa.' using errcode = '42501'; end if;
  if not d360_tiene_funcion(p_cuenta, 'finanzas') then raise exception 'Tu plan no incluye finanzas.' using hint = 'limite_plan'; end if;
  if p_periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Mes no válido.'; end if;
  if p_monto is null or p_monto <= 0 or p_monto > 10000000 then raise exception 'El monto debe ser mayor que cero.'; end if;
  if p_metodo not in ('efectivo','transferencia','deposito','tarjeta','otro') then raise exception 'Forma de pago no válida.'; end if;
  select * into v_m from miembros where id = p_miembro and cuenta_id = p_cuenta and rol = 'docente';
  if v_m.id is null then raise exception 'Instructor no válido.'; end if;
  v_mes := (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[split_part(p_periodo, '-', 2)::int]
           || ' ' || split_part(p_periodo, '-', 1);
  insert into movimientos(cuenta_id, tipo, fecha, concepto, categoria, monto, nota, miembro_id, periodo, detalle)
  values (p_cuenta, 'gasto', coalesce(p_fecha, current_date), left('Pago a ' || v_m.nombre || ' · ' || v_mes, 140), 'Pago a instructores', round(p_monto, 2),
          left(nullif(trim(coalesce(p_nota, '')), ''), 500), p_miembro, p_periodo,
          coalesce(p_detalle, '{}'::jsonb) || jsonb_build_object('metodo', p_metodo))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.d360_instructor_pagar(uuid, uuid, text, numeric, date, text, text, jsonb) from public, anon;
grant execute on function public.d360_instructor_pagar(uuid, uuid, text, numeric, date, text, text, jsonb) to authenticated;
