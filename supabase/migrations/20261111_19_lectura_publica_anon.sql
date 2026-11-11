-- =====================================================================
-- DOCENCIA360 · 19 · Lectura pública para visitantes sin sesión
-- Error corregido: desde la migración 06, «anon» no puede ejecutar
-- ninguna función. Las reglas de lectura de planes y config_global
-- llamaban a d360_es_plataforma_admin(), así que todo visitante sin
-- sesión recibía 401 (42501) al leer precios, términos o el registro.
-- Solución sin abrir funciones a anon: una regla propia para anon que
-- no llama a ninguna función, y la regla con la función queda solo
-- para usuarios con sesión.
-- =====================================================================
drop policy if exists cg_leer on public.config_global;
drop policy if exists cg_leer_publico on public.config_global;
create policy cg_leer_publico on public.config_global for select to anon using (clave like 'publico.%');
create policy cg_leer on public.config_global for select to authenticated
  using (clave like 'publico.%' or public.d360_es_plataforma_admin());

drop policy if exists planes_leer on public.planes;
drop policy if exists planes_leer_publico on public.planes;
create policy planes_leer_publico on public.planes for select to anon using (activo);
create policy planes_leer on public.planes for select to authenticated
  using (activo or public.d360_es_plataforma_admin());
