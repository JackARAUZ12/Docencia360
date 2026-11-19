-- Demo de academia (DEMOAC): una estudiante con código fijo 246810 para probar el
-- aula virtual (tarea con foto, examen corto, quiz calificado, avisos y materiales),
-- igual que la demo del profesor. Se vuelve a sembrar cada noche.
create or replace function public.d360_sembrar_demo_aula_academia()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c uuid; g uuid; e_fijo uuid; ev uuid; a uuid; q1 uuid; q2 uuid; en uuid;
begin
  perform set_config('d360.mantenimiento', 'on', true);
  select id into c from cuentas where codigo = 'DEMOAC' and es_demo;
  if c is null then return jsonb_build_object('ok', false, 'motivo', 'sin_demo'); end if;
  select id into g from grupos where cuenta_id = c and nombre like 'Inglés A1%noche%' and estado = 'activo' limit 1;
  if g is null then select id into g from grupos where cuenta_id = c and estado = 'activo' order by nombre limit 1; end if;
  if g is null then return jsonb_build_object('ok', false, 'motivo', 'sin_grupos'); end if;
  delete from evaluaciones where id in (select evaluacion_id from actividades where cuenta_id = c and evaluacion_id is not null);
  delete from actividades where cuenta_id = c;
  delete from avisos_aula where cuenta_id = c;
  delete from materiales where cuenta_id = c;
  delete from alumno_sesiones where cuenta_id = c;
  delete from estudiantes_acceso where cuenta_id = c;

  -- Accesos: una estudiante con código fijo; el resto con códigos aleatorios
  select ge.estudiante_id into e_fijo from grupo_estudiantes ge join estudiantes e on e.id = ge.estudiante_id
   where ge.grupo_id = g and ge.estado = 'activo' and e.estado = 'activo' order by e.apellidos, e.nombres limit 1;
  if e_fijo is null then return jsonb_build_object('ok', false, 'motivo', 'sin_estudiantes'); end if;
  insert into estudiantes_acceso(estudiante_id, cuenta_id, codigo_hash, ultimos, activo)
  values (e_fijo, c, _d360_hash_codigo(c, 'e:246810'), '10', true);
  insert into estudiantes_acceso(estudiante_id, cuenta_id, codigo_hash, ultimos, activo)
  select distinct ge.estudiante_id, c, _d360_hash_codigo(c, 'e:' || x.pin), right(x.pin, 2), true
    from grupo_estudiantes ge join estudiantes e on e.id = ge.estudiante_id and e.estado = 'activo'
    cross join lateral (select _d360_pin_aleatorio() || ge.estudiante_id::text pin0) y
    cross join lateral (select left(y.pin0, 6) pin) x
   where ge.cuenta_id = c and ge.estado = 'activo' and ge.estudiante_id <> e_fijo and x.pin <> '246810'
  on conflict do nothing;

  -- Tarea con foto del cuaderno
  insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max, descripcion)
  values (c, g, 'Tarea: escribe tu rutina diaria en inglés', 'tarea', current_date + 4, 10, 10, 'Actividad en línea') returning id into ev;
  insert into actividades(cuenta_id, grupo_id, evaluacion_id, tipo, titulo, instrucciones, cierra, intentos, mostrar_nota, peso, estado, token, permite_archivos, puntos_archivo)
  values (c, g, ev, 'tarea', 'Tarea: escribe tu rutina diaria en inglés',
          'Escribe 8 oraciones sobre tu rutina (I wake up at…, I go to…) y sube una foto clara de tu cuaderno.',
          now() + interval '4 days', 1, true, 10, 'publicada', lower(_d360_codigo_aleatorio(10)), true, 10);

  -- Examen corto con calificación automática
  insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max, descripcion)
  values (c, g, 'Quiz: verb to be', 'examen', current_date + 6, 15, 5, 'Actividad en línea') returning id into ev;
  insert into actividades(cuenta_id, grupo_id, evaluacion_id, tipo, titulo, instrucciones, cierra, duracion_min, intentos, mostrar_nota, peso, estado, token)
  values (c, g, ev, 'examen', 'Quiz: verb to be', 'Tienes 15 minutos. Elige la respuesta correcta.',
          now() + interval '6 days', 15, 1, true, 15, 'publicada', lower(_d360_codigo_aleatorio(10))) returning id into a;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, opciones, correcta, puntos) values
    (c, a, 0, 'opcion', 'She ___ a teacher.', '["am","is","are","be"]', '1', 2),
    (c, a, 1, 'vf', '«They is my friends» es correcto.', '[]', 'false', 1),
    (c, a, 2, 'corta', 'Completa: I ___ from Nicaragua.', '[]', '["am"]', 2);

  -- Quiz ya cerrado y calificado (la estudiante de prueba ve su nota y el comentario)
  insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max, descripcion)
  values (c, g, 'Quiz: los números del 1 al 20', 'examen', current_date - 3, 10, 2, 'Actividad en línea') returning id into ev;
  insert into actividades(cuenta_id, grupo_id, evaluacion_id, tipo, titulo, abre, cierra, intentos, mostrar_nota, peso, estado, token)
  values (c, g, ev, 'examen', 'Quiz: los números del 1 al 20', now() - interval '4 days', now() - interval '3 days', 1, true, 10, 'cerrada', lower(_d360_codigo_aleatorio(10))) returning id into a;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, correcta, puntos) values (c, a, 0, 'vf', '«Twelve» es el número 12.', 'true', 1) returning id into q1;
  insert into preguntas(cuenta_id, actividad_id, orden, tipo, enunciado, correcta, puntos) values (c, a, 1, 'vf', '«Fifteen» es el número 50.', 'false', 1) returning id into q2;
  insert into entregas(cuenta_id, actividad_id, estudiante_id, intento, iniciada, enviada, estado, respuestas, comentario, origen)
  values (c, a, e_fijo, 1, now() - interval '3 days 1 hour', now() - interval '3 days 50 minutes', 'enviada',
          jsonb_build_object(q1::text, true, q2::text, true), 'Good job! Repasa la diferencia entre -teen y -ty.', 'aula') returning id into en;
  perform _d360_calificar(en);
  perform _d360_volcar_nota(a, e_fijo);

  -- Avisos y materiales
  insert into avisos_aula(cuenta_id, grupo_id, texto, creado) values
    (c, g, 'El miércoles practicamos conversación en parejas. Traigan su vocabulario de la unidad 3.', now() - interval '1 day'),
    (c, g, 'Recuerden subir la foto de la tarea antes del viernes.', now() - interval '2 hours');
  insert into materiales(cuenta_id, grupo_id, titulo, descripcion, url, creado) values
    (c, g, 'Video: verb to be paso a paso', 'Míralo antes del quiz.', 'https://www.youtube.com/results?search_query=verb+to+be+english+for+beginners', now() - interval '2 days'),
    (c, g, 'Vocabulario de la unidad 3', E'Morning – mañana\nAfternoon – tarde\nEvening – noche\nBreakfast – desayuno\nLunch – almuerzo\nDinner – cena', null, now() - interval '3 days');
  return jsonb_build_object('ok', true, 'estudiante', e_fijo, 'codigo', '246810');
end $$;
revoke all on function public.d360_sembrar_demo_aula_academia() from public, anon, authenticated;

create or replace function public.d360_admin_reiniciar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  r := d360_sembrar_demos();
  perform d360_sembrar_demo_aula();
  perform d360_sembrar_demo_extras();
  perform d360_sembrar_demo_academia();
  perform d360_sembrar_demo_crecimiento();
  perform d360_sembrar_demo_aula_academia();
  return r || jsonb_build_object('estudiantes', (r ->> 'estudiantes')::int + d360_sembrar_demo_colegio());
end $$;
revoke execute on function public.d360_admin_reiniciar_demos() from public, anon;
select cron.schedule('d360-reiniciar-demos', '20 6 * * *', $c$select public.d360_sembrar_demos(); select public.d360_sembrar_demo_aula(); select public.d360_sembrar_demo_extras(); select public.d360_sembrar_demo_academia(); select public.d360_sembrar_demo_crecimiento(); select public.d360_sembrar_demo_aula_academia();$c$);
