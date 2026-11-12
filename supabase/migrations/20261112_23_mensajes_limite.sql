-- =====================================================================
-- DOCENCIA360 · 23 · Mensajes de límite del plan más claros
-- · Profesor: «asistentes» (antes decía «docentes»); academia: «instructores».
-- · Si el plan no incluye el recurso (máximo 0): «tu plan no lo incluye».
-- · Indica dónde se cambia el plan (Mi cuenta).
-- La lógica de los límites no cambia.
-- =====================================================================
create or replace function public.d360_validar_limite(p_cuenta uuid, p_recurso text)
returns void language plpgsql security definer set search_path = public as $$
declare v_plan planes; v_max int; v_actual int; v_txt text; v_mod text;
begin
  select p.* into v_plan from suscripciones s join planes p on p.id = s.plan_id where s.cuenta_id = p_cuenta;
  if v_plan.id is null then raise exception 'La cuenta no tiene un plan asignado'; end if;
  select modalidad into v_mod from cuentas where id = p_cuenta;
  if p_recurso = 'estudiantes' then
    v_max := v_plan.max_estudiantes;
    select count(*) into v_actual from estudiantes where cuenta_id = p_cuenta and estado = 'activo';
    v_txt := 'estudiantes activos';
  elsif p_recurso = 'grupos' then
    v_max := v_plan.max_grupos;
    select count(*) into v_actual from grupos where cuenta_id = p_cuenta and estado in ('planificado','activo');
    v_txt := 'grupos activos';
  elsif p_recurso = 'docentes' then
    v_max := v_plan.max_docentes;
    select count(*) into v_actual from miembros where cuenta_id = p_cuenta and activo and rol = 'docente';
    v_txt := case v_mod when 'profesor' then 'asistentes' when 'academia' then 'instructores' else 'docentes' end;
  elsif p_recurso = 'admins' then
    v_max := v_plan.max_admins;
    select count(*) into v_actual from miembros where cuenta_id = p_cuenta and activo
      and rol in ('director','subdirector','coordinador','administrativo','finanzas');
    v_txt := 'usuarios administrativos';
  else
    return;
  end if;
  if v_max = 0 then
    raise exception 'Tu plan % no incluye %. Puedes verlo en Mi cuenta → Renovar o cambiar de plan.', v_plan.nombre, v_txt
      using errcode = 'P0001', hint = 'limite_plan';
  elsif v_max is not null and v_actual >= v_max then
    raise exception 'Llegaste al máximo de % de tu plan % (%). Para agregar más, cambia de plan en Mi cuenta.', v_txt, v_plan.nombre, v_max
      using errcode = 'P0001', hint = 'limite_plan';
  end if;
end $$;
revoke all on function public.d360_validar_limite(uuid, text) from public, anon;
