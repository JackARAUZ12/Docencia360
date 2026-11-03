-- DOCENCIA360 · 10 · search_path fijo (asesor de seguridad)
alter function public._d360_vence_mes(date, int, int) set search_path = public;
