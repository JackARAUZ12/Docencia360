-- =====================================================================
-- DOCENCIA360 · 25 · Subir o bajar de plan sin inconvenientes
-- · El cambio de plan se aplica SIEMPRE en el servidor (trigger), sin
--   importar por dónde se haga: editar suscripción, registrar pago o
--   código de registro pagado.
-- · Nunca se borran datos del cliente:
--   - Portal de estudiantes: se apaga o se enciende con el plan (lo decide
--     d360_tiene_funcion); exámenes, notas y códigos se conservan.
--   - Asistente del profesor (Premium): al bajar queda PAUSADO; al volver
--     a subir se reactiva solo (hasta el cupo del plan).
--   - Si sobran estudiantes con acceso o grupos, se conservan; solo no se
--     pueden agregar más hasta liberar cupo.
-- · Panel de administrador: vista previa de lo que gana o pierde la cuenta
--   antes de confirmar el cambio.
-- =====================================================================
alter table public.miembros add column if not exists pausado_por_plan boolean not null default false;

create or replace function public._d360_aplicar_plan(p_cuenta uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan planes; v_mod text; v_pausados int := 0; v_reactivados int := 0; v_cupo int; v_activos int;
        v_prev text := coalesce(current_setting('d360.mantenimiento', true), '');
begin
  perform set_config('d360.mantenimiento', 'on', true);   -- también en demos; es un ajuste del sistema, no del usuario
  v_plan := d360_plan_de(p_cuenta);
  select modalidad into v_mod from cuentas where id = p_cuenta;
  if v_mod = 'profesor' then
    if not coalesce((v_plan.funciones ->> 'asistentes')::boolean, false) or coalesce(v_plan.max_docentes, 0) = 0 then
      update miembros set activo = false, pausado_por_plan = true where cuenta_id = p_cuenta and rol = 'docente' and activo;
      get diagnostics v_pausados = row_count;
    else
      select count(*) into v_activos from miembros where cuenta_id = p_cuenta and rol = 'docente' and activo;
      v_cupo := greatest(coalesce(v_plan.max_docentes, 1000) - v_activos, 0);
      update miembros set activo = true, pausado_por_plan = false
       where id in (select id from miembros where cuenta_id = p_cuenta and rol = 'docente' and pausado_por_plan order by creado limit v_cupo);
      get diagnostics v_reactivados = row_count;
    end if;
  end if;
  perform set_config('d360.mantenimiento', v_prev, true);   -- se deja como estaba
  return jsonb_build_object('asistentes_pausados', v_pausados, 'asistentes_reactivados', v_reactivados);
end $$;
revoke all on function public._d360_aplicar_plan(uuid) from public, anon, authenticated;

create or replace function public.t_suscripcion_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if new.plan_id is distinct from old.plan_id then
    r := _d360_aplicar_plan(new.cuenta_id);
    insert into auditoria(cuenta_id, user_id, accion, entidad, entidad_id, detalle)
    values (new.cuenta_id, auth.uid(), 'plan_cambiado', 'suscripciones', new.cuenta_id::text,
            jsonb_build_object('antes', old.plan_id, 'despues', new.plan_id) || r);
  end if;
  return null;
end $$;
revoke all on function public.t_suscripcion_plan() from public, anon, authenticated;
drop trigger if exists t_plan on public.suscripciones;
create trigger t_plan after update of plan_id on public.suscripciones for each row execute function public.t_suscripcion_plan();

-- Qué cambia para la cuenta si pasa al plan p_plan (solo lectura; para el panel de administrador)
create or replace function public.d360_admin_impacto_plan(p_cuenta uuid, p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c cuentas; a planes; n planes; est int; gr int; acc int; asis int; gana jsonb := '[]'; pierde jsonb := '[]'; avisos jsonb := '[]'; k text;
        nombres jsonb := '{"reportes_pdf":"Informes en PDF","exportar":"Exportar a Excel","asistentes":"Asistente con su propio acceso","portal_estudiantes":"Exámenes y tareas en línea",
                           "finanzas":"Matrículas y cobros","certificados":"Certificados","comunicados":"Comunicados","portal_familias":"Portal de familias","boletines":"Boletines",
                           "sedes":"Varias sedes","tareas":"Tareas","calendario":"Calendario","horarios":"Horarios","auditoria":"Auditoría"}';
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  select * into c from cuentas where id = p_cuenta;
  a := d360_plan_de(p_cuenta);
  select * into n from planes where id = p_plan;
  if c.id is null or n.id is null then raise exception 'Cuenta o plan no encontrado'; end if;
  if n.modalidad <> c.modalidad then raise exception 'Ese plan es de otro tipo de cuenta.'; end if;
  select count(*) into est from estudiantes where cuenta_id = p_cuenta and estado = 'activo';
  select count(*) into gr from grupos where cuenta_id = p_cuenta and estado in ('planificado','activo');
  select count(*) into acc from estudiantes_acceso where cuenta_id = p_cuenta and activo;
  select count(*) into asis from miembros where cuenta_id = p_cuenta and rol = 'docente' and (activo or pausado_por_plan);
  for k in select jsonb_object_keys(coalesce(a.funciones, '{}') || coalesce(n.funciones, '{}')) loop
    if coalesce((n.funciones ->> k)::boolean, false) and not coalesce((a.funciones ->> k)::boolean, false) then gana := gana || to_jsonb(coalesce(nombres ->> k, k)); end if;
    if coalesce((a.funciones ->> k)::boolean, false) and not coalesce((n.funciones ->> k)::boolean, false) then pierde := pierde || to_jsonb(coalesce(nombres ->> k, k)); end if;
  end loop;
  if n.max_estudiantes is not null and est > n.max_estudiantes then
    avisos := avisos || to_jsonb(format('Tiene %s estudiantes activos y el plan permite %s: se conservan todos, pero no podrá agregar más.', est, n.max_estudiantes)); end if;
  if n.max_grupos is not null and gr > n.max_grupos then
    avisos := avisos || to_jsonb(format('Tiene %s grupos activos y el plan permite %s: se conservan, pero no podrá crear más hasta cerrar algunos.', gr, n.max_grupos)); end if;
  if acc > 0 and coalesce(n.max_estudiantes_portal, 0) = 0 then
    avisos := avisos || to_jsonb(format('%s estudiantes con acceso en línea ya no podrán entrar a exámenes. Sus códigos, exámenes y notas se guardan y vuelven a funcionar si sube de plan.', acc));
  elsif coalesce(n.max_estudiantes_portal, 0) > 0 and acc > n.max_estudiantes_portal then
    avisos := avisos || to_jsonb(format('Tiene %s estudiantes con acceso en línea y el plan permite %s: siguen entrando, pero no podrá activar nuevos hasta quitar acceso a %s.', acc, n.max_estudiantes_portal, acc - n.max_estudiantes_portal)); end if;
  if c.modalidad = 'profesor' and asis > 0 and (not coalesce((n.funciones ->> 'asistentes')::boolean, false) or coalesce(n.max_docentes, 0) = 0) then
    avisos := avisos || to_jsonb(format('%s asistente(s) quedarán pausados (sin borrar nada) y se reactivan solos si vuelve a subir de plan.', asis)); end if;
  if c.modalidad = 'profesor' and coalesce((n.funciones ->> 'asistentes')::boolean, false) and coalesce(n.max_docentes, 0) > 0
     and exists(select 1 from miembros where cuenta_id = p_cuenta and pausado_por_plan) then
    avisos := avisos || to_jsonb('El asistente pausado por el plan anterior se reactivará automáticamente.'::text); end if;
  return jsonb_build_object('actual', a.nombre, 'nuevo', n.nombre,
    'direccion', case when n.orden > a.orden then 'sube' when n.orden < a.orden then 'baja' else 'igual' end,
    'precio_actual', a.precio_nio, 'precio_nuevo', n.precio_nio, 'gana', gana, 'pierde', pierde, 'avisos', avisos,
    'uso', jsonb_build_object('estudiantes', est, 'grupos', gr, 'accesos', acc, 'asistentes', asis),
    'limites', jsonb_build_object('estudiantes', n.max_estudiantes, 'grupos', n.max_grupos, 'accesos', n.max_estudiantes_portal, 'asistentes', n.max_docentes));
end $$;
revoke execute on function public.d360_admin_impacto_plan(uuid, text) from public, anon;
grant execute on function public.d360_admin_impacto_plan(uuid, text) to authenticated;

create or replace function public.d360_admin_cambiar_plan(p_cuenta uuid, p_plan text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_imp jsonb;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  v_imp := d360_admin_impacto_plan(p_cuenta, p_plan);
  if not exists(select 1 from planes where id = p_plan and activo) then raise exception 'Ese plan no está activo.'; end if;
  update suscripciones set plan_id = p_plan, actualizado = now() where cuenta_id = p_cuenta;
  return v_imp;
end $$;
revoke execute on function public.d360_admin_cambiar_plan(uuid, text) from public, anon;
grant execute on function public.d360_admin_cambiar_plan(uuid, text) to authenticated;
