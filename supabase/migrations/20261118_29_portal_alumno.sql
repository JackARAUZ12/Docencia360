-- =====================================================================
-- DOCENCIA360 · 29 · Portal del estudiante sin enlace
-- El estudiante entra en alumno.html con el código del espacio de su
-- profesor (6 letras/números, no es secreto) y su código personal
-- (6 números, secreto) y ve sus tareas y exámenes publicados.
-- · Mismo control de intentos que al entrar a un examen (8 fallos = 15 min).
-- · Un código equivocado y un espacio inexistente dan el mismo mensaje.
-- · No inicia ningún examen: solo lista; el examen empieza al entrar a él.
-- =====================================================================
create or replace function public.d360_alumno_portal(p_espacio text, p_codigo text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_esp text := upper(regexp_replace(coalesce(p_espacio, ''), '[^A-Za-z0-9]', '', 'g'));
        v_pin text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
        v_clave text := 'alumno|' || _d360_ip() || '|portal'; v_min int; v_int acceso_intentos;
        c cuentas; v_est uuid; v_nom text; v_acts jsonb;
begin
  if v_esp !~ '^[A-Z0-9]{6}$' or v_pin !~ '^\d{6}$' then return jsonb_build_object('ok', false, 'motivo', 'formato'); end if;
  v_min := _d360_registro_bloqueado(v_clave);
  if v_min is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', v_min); end if;
  select * into c from cuentas where codigo = v_esp;
  if c.id is not null then
    select ac.estudiante_id into v_est from estudiantes_acceso ac
     where ac.cuenta_id = c.id and ac.activo and ac.codigo_hash = _d360_hash_codigo(c.id, 'e:' || v_pin);
  end if;
  if v_est is null then
    v_int := _d360_registro_fallo(v_clave);
    if v_int.bloqueado_hasta is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', 15); end if;
    return jsonb_build_object('ok', false, 'motivo', 'codigo');
  end if;
  delete from acceso_intentos where clave = v_clave;
  if not d360_tiene_funcion(c.id, 'portal_estudiantes') then return jsonb_build_object('ok', false, 'motivo', 'no_disponible'); end if;
  select trim(nombres) into v_nom from estudiantes where id = v_est;
  update estudiantes_acceso set ultimo_acceso = now() where estudiante_id = v_est;
  select coalesce(jsonb_agg(x.j order by x.orden, x.fecha desc), '[]'::jsonb) into v_acts from (
    select jsonb_build_object('token', a.token, 'titulo', a.titulo, 'tipo', a.tipo, 'grupo', g.nombre,
             'estado', e.estado, 'abre', a.abre, 'cierra', a.cierra, 'duracion_min', a.duracion_min,
             'entregada', en.id is not null, 'mostrar_nota', a.mostrar_nota,
             'puntaje', case when a.mostrar_nota and en.id is not null and not en.pendiente then en.puntaje end,
             'puntaje_max', case when a.mostrar_nota and en.id is not null then en.puntaje_max end,
             'pendiente', coalesce(en.pendiente, false)) j,
           case e.estado when 'abierta' then case when en.id is null then 0 else 1 end when 'pronto' then 2 else 3 end orden,
           coalesce(a.cierra, a.abre, a.creado) fecha
    from actividades a
    join grupos g on g.id = a.grupo_id
    join grupo_estudiantes ge on ge.grupo_id = a.grupo_id and ge.estudiante_id = v_est and ge.estado = 'activo'
    cross join lateral (select case when a.estado = 'cerrada' or (a.cierra is not null and a.cierra < now()) then 'cerrada'
                                    when a.abre is not null and a.abre > now() then 'pronto' else 'abierta' end estado) e
    left join lateral (select * from entregas x where x.actividad_id = a.id and x.estudiante_id = v_est and x.estado = 'enviada'
                       order by x.puntaje desc nulls last limit 1) en on true
    where a.cuenta_id = c.id and a.estado <> 'borrador' and a.token is not null
    limit 60) x;
  return jsonb_build_object('ok', true, 'nombre', v_nom, 'institucion', c.nombre, 'actividades', v_acts,
                            'cuenta_activa', d360_cuenta_operativa(c.id));
end $$;
revoke all on function public.d360_alumno_portal(text, text) from public;
grant execute on function public.d360_alumno_portal(text, text) to anon, authenticated;
