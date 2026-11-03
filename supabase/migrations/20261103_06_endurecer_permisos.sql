-- =====================================================================
-- DOCENCIA360 · 06 · Endurecimiento según el asesor de seguridad
-- - Ninguna función d360 es invocable sin sesión (anon).
-- - Funciones de trigger: nadie las invoca por la API.
-- - search_path fijo en todas.
-- Las funciones auxiliares de RLS siguen disponibles para
-- "authenticated" porque las políticas las evalúan como ese rol.
-- =====================================================================
alter function public.d360_cuenta_inmutable() set search_path = public;
alter function public.t_limite_estudiantes() set search_path = public;
alter function public.t_limite_grupos() set search_path = public;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    if f.proname ~ '^t_' or f.proname in ('d360_cuenta_inmutable','d360_misma_cuenta') then
      execute format('revoke execute on function %s from authenticated', f.firma);
    end if;
  end loop;
end $$;

-- Las funciones nuevas no quedan abiertas por defecto
alter default privileges in schema public revoke execute on functions from public, anon;
