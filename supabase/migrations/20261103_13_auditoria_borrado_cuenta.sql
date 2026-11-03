-- =====================================================================
-- DOCENCIA360 · 13 · La auditoría no impide borrar una cuenta.
-- Al eliminar una cuenta, sus filas se borran en cascada y los
-- disparadores de auditoría intentaban registrar la cuenta ya inexistente.
-- Ahora se registra sin cuenta asociada (queda el detalle completo).
-- =====================================================================
create or replace function public.t_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old); v_cuenta uuid;
begin
  if _d360_mantenimiento() then return null; end if;
  v_cuenta := r.cuenta_id;
  if tg_op = 'DELETE' and not exists(select 1 from cuentas where id = v_cuenta) then v_cuenta := null; end if;
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (v_cuenta, auth.uid(), lower(tg_op), tg_table_name, r.id::text,
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
               else to_jsonb(r) end);
  return null;
end $$;

create or replace function public.t_auditar_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(coalesce(new, old)); v_cuenta uuid;
begin
  if _d360_mantenimiento() then return null; end if;
  v_cuenta := nullif(j ->> 'cuenta_id', '')::uuid;
  if v_cuenta is not null and not exists(select 1 from cuentas where id = v_cuenta) then v_cuenta := null; end if;
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (v_cuenta, auth.uid(), lower(tg_op), tg_table_name,
          coalesce(j ->> 'id', j ->> 'clave', j ->> 'cuenta_id', j ->> 'user_id'),
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new)) else j end);
  return null;
end $$;
