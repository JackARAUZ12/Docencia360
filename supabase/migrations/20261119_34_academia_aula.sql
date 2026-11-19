-- Academias: aula virtual, exámenes en línea y banco de preguntas según plan;
-- los comunicados de la academia también llegan al aula del estudiante.
--   Inicial      → aula para 150 estudiantes (sin banco)
--   Profesional  → aula para 500 estudiantes + banco de preguntas
--   Empresarial  → aula para 2000 estudiantes + banco de preguntas

update public.planes set max_estudiantes_portal = 150,  funciones = funciones || '{"portal_estudiantes": true, "banco_preguntas": false}' where id = 'acad_inicial';
update public.planes set max_estudiantes_portal = 500,  funciones = funciones || '{"portal_estudiantes": true, "banco_preguntas": true}'  where id = 'acad_profesional';
update public.planes set max_estudiantes_portal = 2000, funciones = funciones || '{"portal_estudiantes": true, "banco_preguntas": true}'  where id = 'acad_empresarial';

-- Aula del estudiante: avisos del grupo + comunicados para todos o para su grupo; y el tipo de cuenta
create or replace function public.d360_aula_inicio(p_sesion text)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare s alumno_sesiones := _d360_aula_est(p_sesion); c cuentas; v_nom text; v_grupos uuid[];
begin
  if s.id is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
  select * into c from cuentas where id = s.cuenta_id;
  if not d360_tiene_funcion(c.id, 'portal_estudiantes') then return jsonb_build_object('ok', false, 'motivo', 'no_disponible'); end if;
  select trim(nombres || ' ' || apellidos) into v_nom from estudiantes where id = s.estudiante_id;
  select coalesce(array_agg(ge.grupo_id), '{}') into v_grupos from grupo_estudiantes ge join grupos g on g.id = ge.grupo_id
   where ge.estudiante_id = s.estudiante_id and ge.estado = 'activo' and g.estado in ('activo','planificado');
  return jsonb_build_object('ok', true, 'nombre', v_nom, 'institucion', c.nombre, 'modalidad', c.modalidad, 'cuenta_activa', d360_cuenta_operativa(c.id),
    'grupos', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'nombre', g.nombre) order by g.nombre), '[]') from grupos g where g.id = any(v_grupos)),
    'actividades', (select coalesce(jsonb_agg(x.j order by x.orden, x.fecha desc), '[]'::jsonb) from (
        select jsonb_build_object('token', a.token, 'titulo', a.titulo, 'tipo', a.tipo, 'grupo', g.nombre, 'grupo_id', g.id,
                 'estado', e.estado, 'abre', a.abre, 'cierra', a.cierra, 'duracion_min', a.duracion_min, 'permite_archivos', a.permite_archivos,
                 'entregada', en.id is not null, 'en_curso', exists(select 1 from entregas y where y.actividad_id = a.id and y.estudiante_id = s.estudiante_id and y.estado = 'en_curso'),
                 'puntaje', case when a.mostrar_nota and en.id is not null and not en.pendiente then en.puntaje end,
                 'puntaje_max', case when a.mostrar_nota and en.id is not null then en.puntaje_max end,
                 'pendiente', coalesce(en.pendiente, false), 'comentario', en.comentario) j,
               case e.estado when 'abierta' then case when en.id is null then 0 else 1 end when 'pronto' then 2 else 3 end orden,
               coalesce(a.cierra, a.abre, a.creado) fecha
        from actividades a join grupos g on g.id = a.grupo_id
        cross join lateral (select case when a.estado = 'cerrada' or (a.cierra is not null and a.cierra < now()) then 'cerrada'
                                        when a.abre is not null and a.abre > now() then 'pronto' else 'abierta' end estado) e
        left join lateral (select * from entregas x where x.actividad_id = a.id and x.estudiante_id = s.estudiante_id and x.estado = 'enviada'
                           order by x.puntaje desc nulls last limit 1) en on true
        where a.grupo_id = any(v_grupos) and a.estado <> 'borrador' and a.token is not null limit 100) x),
    'avisos', (select coalesce(jsonb_agg(jsonb_build_object('texto', v.texto, 'creado', v.creado, 'grupo', v.grupo) order by v.creado desc), '[]')
               from (select * from (
                       select av.texto, av.creado, g.nombre grupo from avisos_aula av join grupos g on g.id = av.grupo_id where av.grupo_id = any(v_grupos)
                       union all
                       select co.titulo || ': ' || co.cuerpo, co.publicado, coalesce(g.nombre, c.nombre)
                         from comunicados co left join grupos g on g.id = co.grupo_id
                        where co.cuenta_id = c.id and (co.audiencia = 'todos' or (co.audiencia = 'grupo' and co.grupo_id = any(v_grupos)))
                     ) t order by creado desc limit 20) v),
    'materiales', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'titulo', m.titulo, 'descripcion', m.descripcion, 'url', m.url,
                     'archivo', m.archivo_path is not null, 'archivo_nombre', m.archivo_nombre, 'archivo_tamano', m.archivo_tamano, 'archivo_tipo', m.archivo_tipo,
                     'creado', m.creado, 'grupo', g.nombre) order by m.creado desc), '[]')
                   from (select * from materiales where grupo_id = any(v_grupos) order by creado desc limit 100) m join grupos g on g.id = m.grupo_id),
    'notas', (select coalesce(jsonb_agg(jsonb_build_object('grupo', g.nombre, 'promedio', p.promedio,
                 'evaluaciones', (select coalesce(jsonb_agg(jsonb_build_object('titulo', ev.titulo, 'tipo', ev.tipo, 'fecha', ev.fecha,
                                    'puntaje', ca.puntaje, 'puntaje_max', ev.puntaje_max, 'rubrica', ca.rubrica_detalle) order by ev.fecha desc), '[]')
                                  from evaluaciones ev left join calificaciones ca on ca.evaluacion_id = ev.id and ca.estudiante_id = s.estudiante_id
                                  where ev.grupo_id = g.id and (ev.fecha <= current_date or ca.puntaje is not null))) order by g.nombre), '[]')
              from grupos g left join lateral (select x.promedio from d360_promedios_grupo(g.id) x where x.estudiante_id = s.estudiante_id) p on true
              where g.id = any(v_grupos)),
    'asistencia', (select jsonb_build_object('presentes', count(*) filter (where estado = 'presente'), 'ausentes', count(*) filter (where estado = 'ausente'),
                     'tardes', count(*) filter (where estado = 'tarde'), 'justificados', count(*) filter (where estado = 'justificado'), 'total', count(*),
                     'porcentaje', round(100.0 * count(*) filter (where estado <> 'ausente') / nullif(count(*), 0), 1),
                     'recientes', (select coalesce(jsonb_agg(jsonb_build_object('fecha', y.fecha, 'estado', y.estado, 'grupo', gg.nombre) order by y.fecha desc), '[]')
                                   from (select * from asistencias where estudiante_id = s.estudiante_id and estado <> 'presente' order by fecha desc limit 10) y
                                   join grupos gg on gg.id = y.grupo_id))
                   from asistencias where estudiante_id = s.estudiante_id and fecha >= current_date - 180),
    'cobros', case when d360_tiene_funcion(c.id, 'finanzas') then
      (select coalesce(jsonb_agg(jsonb_build_object('concepto', g.concepto, 'monto', g.monto - g.descuento, 'pagado', g.pagado, 'vence', g.vence, 'estado', g.estado) order by g.vence desc), '[]')
         from (select * from cargos where estudiante_id = s.estudiante_id and estado <> 'anulado' order by vence desc limit 12) g) end);
end $function$;
revoke execute on function public.d360_aula_inicio(text) from public;
grant execute on function public.d360_aula_inicio(text) to anon, authenticated;
