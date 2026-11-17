-- =====================================================================
-- DOCENCIA360 · 26 · Primeros pasos guardados en el servidor
-- El avance de la guía (bienvenida, guía oculta, ayudas ya leídas) se
-- guarda por usuario y por cuenta, así se respeta en cualquier equipo.
-- Solo se aceptan claves conocidas; nada de datos libres del cliente.
-- En las cuentas de demostración no se guarda (la demo es compartida).
-- =====================================================================
alter table public.miembros add column if not exists guia jsonb not null default '{}'::jsonb;

create or replace function public.d360_guia(p_cuenta uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select guia from miembros where cuenta_id = p_cuenta and user_id = auth.uid() and activo limit 1), '{}'::jsonb);
$$;
revoke all on function public.d360_guia(uuid) from public, anon;
grant execute on function public.d360_guia(uuid) to authenticated;

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
    elsif k in ('oculta', 'completa') and jsonb_typeof(v) = 'boolean' then
      v_g := v_g || jsonb_build_object(k, v);
    elsif k = 'ayudas' and jsonb_typeof(v) = 'object' then
      v_aud := coalesce(v_g -> 'ayudas', '{}'::jsonb);
      select v_aud || coalesce(jsonb_object_agg(x.key, true), '{}'::jsonb) into v_aud
        from jsonb_each(v) x where x.key ~ '^[a-z_]{1,30}$' and x.value = 'true'::jsonb;
      if (select count(*) from jsonb_object_keys(v_aud)) <= 40 then v_g := v_g || jsonb_build_object('ayudas', v_aud); end if;
    end if;
  end loop;
  perform set_config('d360.mantenimiento', 'on', true);   -- preferencia personal: no se audita
  update miembros set guia = v_g where id = v_m.id;
  perform set_config('d360.mantenimiento', v_prev, true);
  return v_g;
end $$;
revoke all on function public.d360_guia_guardar(uuid, jsonb) from public, anon;
grant execute on function public.d360_guia_guardar(uuid, jsonb) to authenticated;
