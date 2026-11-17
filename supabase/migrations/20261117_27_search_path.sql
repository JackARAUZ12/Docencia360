-- =====================================================================
-- DOCENCIA360 · 27 · search_path fijo en las últimas funciones (asesor de seguridad)
-- =====================================================================
alter function public._d360_mantenimiento() set search_path = public;
alter function public.t_demo_cuenta_fija() set search_path = public;
alter function public._d360_ip() set search_path = public;
