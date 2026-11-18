-- =====================================================================
-- DOCENCIA360 · 28 · Reporte a padres por WhatsApp (Profesional y Premium)
-- El mensaje se arma en el navegador con datos que el profesor ya puede ver
-- (asistencia, promedio y última observación) y se abre en WhatsApp para
-- que él lo revise y lo envíe. No se envía nada automáticamente.
-- =====================================================================
update public.planes set funciones = funciones || '{"reporte_whatsapp": false}' where id = 'prof_basico';
update public.planes set funciones = funciones || '{"reporte_whatsapp": true}'  where id in ('prof_profesional', 'prof_premium');
update public.planes set funciones = funciones || '{"reporte_whatsapp": true}'  where modalidad in ('academia', 'colegio');

-- Nombre legible en la vista previa del cambio de plan
create or replace function public.d360_admin_impacto_plan(p_cuenta uuid, p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c cuentas; a planes; n planes; est int; gr int; acc int; asis int; gana jsonb := '[]'; pierde jsonb := '[]'; avisos jsonb := '[]'; k text;
        nombres jsonb := '{"reportes_pdf":"Informes en PDF","exportar":"Exportar a Excel","asistentes":"Asistente con su propio acceso","portal_estudiantes":"Exámenes y tareas en línea","reporte_whatsapp":"Reporte a padres por WhatsApp",
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
