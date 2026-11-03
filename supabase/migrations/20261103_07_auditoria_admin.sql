-- =====================================================================
-- DOCENCIA360 · 07 · Auditoría de cambios administrativos
-- (suscripciones, planes, promociones, parámetros, cuentas, miembros)
-- =====================================================================
create or replace function public.t_auditar_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(coalesce(new, old));
begin
  insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
  values (nullif(j ->> 'cuenta_id', '')::uuid, auth.uid(), lower(tg_op), tg_table_name,
          coalesce(j ->> 'id', j ->> 'clave', j ->> 'cuenta_id', j ->> 'user_id'),
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new)) else j end);
  return null;
end $$;
revoke execute on function public.t_auditar_admin() from public, anon, authenticated;

create trigger t_aud after insert or update or delete on public.suscripciones     for each row execute function public.t_auditar_admin();
create trigger t_aud after insert or update or delete on public.planes            for each row execute function public.t_auditar_admin();
create trigger t_aud after insert or update or delete on public.promociones       for each row execute function public.t_auditar_admin();
create trigger t_aud after insert or update or delete on public.config_global     for each row execute function public.t_auditar_admin();
create trigger t_aud after insert or update or delete on public.plataforma_admins for each row execute function public.t_auditar_admin();
create trigger t_aud after update                     on public.cuentas           for each row execute function public.t_auditar_admin();

-- Registro de actividad para el panel maestro (paginado)
create or replace function public.d360_admin_actividad(p_limite int default 100, p_cuenta uuid default null)
returns table(id bigint, creado timestamptz, cuenta text, accion text, entidad text, entidad_id text, usuario text, detalle jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return query
  select a.id, a.creado, c.nombre, a.accion, a.entidad, a.entidad_id,
         coalesce(m.nombre, u.email::text, 'sistema'), a.detalle
  from auditoria a
  left join cuentas c on c.id = a.cuenta_id
  left join auth.users u on u.id = a.user_id
  left join miembros m on m.user_id = a.user_id and m.cuenta_id = a.cuenta_id
  where p_cuenta is null or a.cuenta_id = p_cuenta
  order by a.creado desc
  limit least(greatest(p_limite, 1), 500);
end $$;
revoke execute on function public.d360_admin_actividad(int, uuid) from public, anon;
