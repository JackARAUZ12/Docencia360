-- =====================================================================
-- DOCENCIA360 · 15 · Demo de colegio
-- "Colegio Nueva Esperanza": primaria y secundaria, 7 secciones, ~175
-- estudiantes, docentes por asignatura, horarios sin choques, 4 cortes
-- evaluativos, colegiaturas, familias con acceso y comunicados.
-- Se reinicia cada noche junto con las otras demos.
-- =====================================================================
insert into public.demo_perfiles values
 ('colegio-direccion', 'colegio', 'DEMOCO', 'Lic. Rosa Martínez', 'director', 'Colegio · Dirección', 'Estructura, matrícula, horarios, boletines, finanzas, comunicados e informes.', 5),
 ('colegio-docente', 'colegio', 'DEMOCO', 'Prof. Julio Herrera', 'docente', 'Colegio · Docente', 'Matemática de secundaria y maestro guía de 7mo A: lista, notas por corte y boletines.', 6),
 ('colegio-familia', 'colegio', 'DEMOCO', 'Mariana Pérez', 'tutor', 'Colegio · Familia', 'El portal de padres: notas, asistencia, comunicados y pagos de sus dos hijos.', 7)
on conflict (perfil) do update set titulo = excluded.titulo, detalle = excluded.detalle, miembro = excluded.miembro, rol = excluded.rol;

create or replace function public.d360_sembrar_demo_colegio()
returns int language plpgsql security definer set search_path = public as $$
declare
  c uuid; v_anio int := extract(year from current_date)::int;
  n_pri uuid; n_sec uuid; grs uuid[] := '{}'; secs uuid[] := '{}'; g uuid; s uuid; a uuid;
  per uuid[] := '{}'; p uuid; ests uuid[]; e uuid; i int; j int; k int; d int; sl int;
  doc jsonb := '{}'::jsonb; m uuid; asig_ids uuid[]; nasig int; v_ev uuid; v_f date; capacidad int;
  v_cargo record; r float8; tutora uuid; hijo1 uuid; hijo2 uuid; v_ini date; v_fin date; nombres text[];
  pri_materias text[] := array['Lengua y Literatura','Matemática','Ciencias Naturales','Estudios Sociales','Inglés','Educación Física'];
  sec_materias text[] := array['Lengua y Literatura','Matemática','Ciencias Naturales','Historia','Inglés','Educación Física','Computación'];
  horas text[][] := array[['07:00','07:45'],['07:45','08:30'],['08:50','09:35'],['09:35','10:20'],['10:30','11:15']];
begin
  perform set_config('d360.mantenimiento', 'on', true);
  c := _d360_demo_cuenta('DEMOCO', 'colegio', 'Colegio Nueva Esperanza', 'col_institucional', '2250-1010');
  update cuentas set config = jsonb_build_object('nota_minima', 60, 'escala_cualitativa', true, 'anio_lectivo', v_anio,
      'lema', 'Educando con valores para la vida', 'certificado', jsonb_build_object('firma1', 'Lic. Rosa Martínez', 'cargo1', 'Directora',
      'firma2', 'Lic. Óscar Téllez', 'cargo2', 'Secretario académico')),
      direccion = 'Del parque central 2 cuadras al sur, Masaya', email = 'demo@docencia360.app' where id = c;

  -- Vaciar datos (no miembros)
  delete from boletin_comentarios where cuenta_id = c;
  delete from tutores_estudiantes where cuenta_id = c;
  delete from asistencia_docentes where cuenta_id = c;
  delete from sedes where cuenta_id = c;
  perform _d360_demo_vaciar(c);
  delete from niveles where cuenta_id = c;
  delete from grados where cuenta_id = c;
  delete from aulas where cuenta_id = c;

  -- Personal (los vinculados a la demo conservan su acceso entre reinicios)
  perform _d360_demo_miembro(c, 'Lic. Rosa Martínez', 'director', null, '8800-1001');
  perform _d360_demo_miembro(c, 'Lic. Óscar Téllez', 'coordinador', 'Coordinación académica', '8800-1002');
  perform _d360_demo_miembro(c, 'Sra. Patricia Lacayo', 'finanzas', 'Caja y cobranza', '8800-1003');
  doc := jsonb_build_object(
    'guia4',  _d360_demo_miembro(c, 'Profa. Ana Lucía Rocha', 'docente', 'Primaria · maestra guía de 4to', '8811-0001'),
    'guia5',  _d360_demo_miembro(c, 'Profa. Carmen Obando', 'docente', 'Primaria · maestra guía de 5to', '8811-0002'),
    'guia6',  _d360_demo_miembro(c, 'Prof. Ernesto Zelaya', 'docente', 'Primaria · maestro guía de 6to', '8811-0003'),
    'ingpri', _d360_demo_miembro(c, 'Teacher Melissa Arauz', 'docente', 'Inglés primaria', '8811-0004'),
    'efi',    _d360_demo_miembro(c, 'Prof. Noel Blandón', 'docente', 'Educación Física', '8811-0005'),
    'len',    _d360_demo_miembro(c, 'Profa. Hazel Montenegro', 'docente', 'Lengua y Literatura', '8811-0006'),
    'mat',    _d360_demo_miembro(c, 'Prof. Julio Herrera', 'docente', 'Matemática', '8811-0007'),
    'cie',    _d360_demo_miembro(c, 'Profa. Fátima Somarriba', 'docente', 'Ciencias Naturales', '8811-0008'),
    'his',    _d360_demo_miembro(c, 'Prof. Rodrigo Vanegas', 'docente', 'Historia y Estudios Sociales', '8811-0009'),
    'ingsec', _d360_demo_miembro(c, 'Teacher Kevin Salazar', 'docente', 'Inglés secundaria', '8811-0010'),
    'comp',   _d360_demo_miembro(c, 'Prof. Axel Espinoza', 'docente', 'Computación', '8811-0011'));
  tutora := _d360_demo_miembro(c, 'Mariana Pérez', 'tutor', null, '8899-5566');


  -- Cortes evaluativos del año
  insert into periodos(cuenta_id, nombre, anio, inicio, fin, orden) values
    (c, 'I Corte', v_anio::text, make_date(v_anio, 2, 3), make_date(v_anio, 4, 11), 1),
    (c, 'II Corte', v_anio::text, make_date(v_anio, 4, 14), make_date(v_anio, 6, 27), 2),
    (c, 'III Corte', v_anio::text, make_date(v_anio, 7, 14), make_date(v_anio, 9, 12), 3),
    (c, 'IV Corte', v_anio::text, make_date(v_anio, 9, 15), make_date(v_anio, 11, 28), 4);
  select array_agg(id order by orden) into per from periodos where cuenta_id = c;

  insert into sedes(cuenta_id, nombre, direccion, telefono) values (c, 'Sede central', 'Masaya, del parque central 2 c. al sur', '2250-1010');
  insert into niveles(cuenta_id, nombre, orden) values (c, 'Primaria', 1) returning id into n_pri;
  insert into niveles(cuenta_id, nombre, orden) values (c, 'Secundaria', 2) returning id into n_sec;
  -- grados: 4to, 5to, 6to (primaria) y 7mo, 8vo, 9no (secundaria)
  for i in 1..6 loop
    insert into grados(cuenta_id, nivel_id, nombre, orden, matricula, colegiatura)
    values (c, case when i <= 3 then n_pri else n_sec end,
            (array['4to grado','5to grado','6to grado','7mo grado','8vo grado','9no grado'])[i], i,
            case when i <= 3 then 900 else 1100 end, case when i <= 3 then 1450 else 1750 end)
    returning id into g;
    grs := grs || g;
  end loop;
  -- Plan de estudios por grado
  for i in 1..6 loop
    nombres := case when i <= 3 then pri_materias else sec_materias end;
    for j in 1..array_length(nombres, 1) loop
      insert into asignaturas(cuenta_id, nombre, grado_id, codigo) values (c, nombres[j], grs[i], upper(left(nombres[j], 3)) || (i + 3));
    end loop;
  end loop;
  -- Secciones: una por grado y dos en 7mo (A y B)
  for i in 1..7 loop
    insert into aulas(cuenta_id, nombre, capacidad) values (c, 'Aula ' || (100 + i), 32) returning id into a;
    insert into grupos(cuenta_id, nombre, grado_id, aula_id, turno, cupo, fecha_inicio, fecha_fin, estado, sede_id)
    values (c, (array['4to A','5to A','6to A','7mo A','7mo B','8vo A','9no A'])[i],
            grs[(array[1,2,3,4,4,5,6])[i]], a, 'matutino', 30, make_date(v_anio, 2, 3), make_date(v_anio, 11, 28), 'activo',
            (select id from sedes where cuenta_id = c limit 1))
    returning id into s;
    secs := secs || s;
  end loop;

  -- Asignación de docentes por sección y asignatura (+ maestro guía)
  for i in 1..7 loop
    s := secs[i];
    for a in select id from asignaturas where grado_id = (select grado_id from grupos where id = s) order by codigo loop
      m := case
        when i <= 3 and (select nombre from asignaturas where id = a) = 'Inglés' then (doc ->> 'ingpri')::uuid
        when (select nombre from asignaturas where id = a) = 'Educación Física' then (doc ->> 'efi')::uuid
        when i <= 3 then (doc ->> ('guia' || (i + 3)))::uuid
        else (doc ->> (case (select nombre from asignaturas where id = a)
               when 'Lengua y Literatura' then 'len' when 'Matemática' then 'mat' when 'Ciencias Naturales' then 'cie'
               when 'Historia' then 'his' when 'Inglés' then 'ingsec' else 'comp' end))::uuid end;
      insert into grupo_docentes(cuenta_id, grupo_id, miembro_id, asignatura_id, es_guia)
      values (c, s, m, a, (i <= 3 and m = (doc ->> ('guia' || (i + 3)))::uuid) or (i = 4 and m = (doc ->> 'mat')::uuid) or
                           (i = 5 and m = (doc ->> 'len')::uuid) or (i = 6 and m = (doc ->> 'cie')::uuid) or (i = 7 and m = (doc ->> 'his')::uuid))
      on conflict do nothing;
    end loop;
  end loop;

  -- Horario semanal sin choques: rotación por sección (cada sección con desfase distinto)
  for i in 1..7 loop
    s := secs[i];
    select array_agg(asignatura_id order by asignatura_id) into asig_ids from (select distinct asignatura_id from grupo_docentes where grupo_id = s) x;
    nasig := array_length(asig_ids, 1);
    for d in 1..5 loop
      for sl in 1..5 loop
        a := asig_ids[1 + ((d * 5 + sl + i * 2) % nasig)];
        begin
          insert into horarios(cuenta_id, grupo_id, asignatura_id, miembro_id, aula_id, dia, hora_inicio, hora_fin)
          values (c, s, a, (select miembro_id from grupo_docentes where grupo_id = s and asignatura_id = a limit 1),
                  (select aula_id from grupos where id = s), d, horas[sl][1]::time, horas[sl][2]::time);
        exception when others then null;   -- si un docente ya tiene clase a esa hora, se deja la hora libre
        end;
      end loop;
    end loop;
  end loop;

  -- Estudiantes: 25 por sección (primaria con edades menores)
  for i in 1..7 loop
    select array_agg(x) into ests from _d360_demo_estudiantes(c, 25, 0.1 + i * 0.07) x;
    update estudiantes set fecha_nacimiento = make_date(v_anio - (9 + (array[0,1,2,3,3,4,5])[i]), 1 + (abs(hashtext(id::text)) % 12), 1 + (abs(hashtext(id::text)) % 27)),
           codigo = 'NE-' || v_anio || '-' || lpad(((i - 1) * 25 + (abs(hashtext(id::text)) % 25) + 1)::text, 3, '0') || substr(md5(id::text), 1, 2),
           documentos = jsonb_build_object('partida', true, 'notas_anteriores', random() < .85, 'fotos', random() < .9, 'cedula_tutor', random() < .8)
     where id = any(ests);
    for k in 1..25 loop
      perform d360_matricular_colegio(c, ests[k], secs[i], v_anio, 10, 2, 10,
        case when k % 11 = 0 then 25 when k % 17 = 0 then 50 else 0 end,
        case when k % 11 = 0 then 'Beca hermanos (25%)' when k % 17 = 0 then 'Beca académica (50%)' end, null);
    end loop;
    update grupo_estudiantes set desde = make_date(v_anio, 2, 3) where grupo_id = secs[i];
    update matriculas set fecha = make_date(v_anio, 1, 15 + (abs(hashtext(estudiante_id::text)) % 15)) where grupo_id = secs[i];
  end loop;

  -- Familia de la demo: Mariana Pérez con dos hijos (4to A y 7mo A)
  select ge.estudiante_id into hijo1 from grupo_estudiantes ge where ge.grupo_id = secs[1] order by ge.estudiante_id limit 1;
  select ge.estudiante_id into hijo2 from grupo_estudiantes ge where ge.grupo_id = secs[4] order by ge.estudiante_id limit 1;
  update estudiantes set nombres = 'Sofía Valentina', apellidos = 'Pérez Rocha', contacto_nombre = 'Mariana Pérez', contacto_telefono = '8899-5566', contacto_parentesco = 'Madre' where id = hijo1;
  update estudiantes set nombres = 'Diego Alejandro', apellidos = 'Pérez Rocha', contacto_nombre = 'Mariana Pérez', contacto_telefono = '8899-5566', contacto_parentesco = 'Madre' where id = hijo2;
  insert into tutores_estudiantes(miembro_id, estudiante_id, cuenta_id, parentesco) values (tutora, hijo1, c, 'Madre'), (tutora, hijo2, c, 'Madre');

  -- Evaluaciones y notas por corte: cada estudiante tiene su propio nivel de desempeño
  for i in 1..7 loop
    s := secs[i];
    for a in select distinct asignatura_id from grupo_docentes where grupo_id = s loop
      for k in 1..4 loop
        select pe.inicio, pe.fin into v_ini, v_fin from periodos pe where pe.id = per[k];
        if v_ini > current_date then continue; end if;
        for j in 1..3 loop
          v_f := least(v_ini + (j * ((v_fin - v_ini) / 4)), v_fin);
          insert into evaluaciones(cuenta_id, grupo_id, asignatura_id, periodo_id, titulo, tipo, fecha, peso, puntaje_max)
          values (c, s, a, per[k], (array['Prueba corta','Trabajo práctico','Examen de corte'])[j] || ' ' || (array['I','II','III','IV'])[k],
                  (array['examen','practica','examen'])[j], v_f, (array[30, 30, 40])[j], 100)
          returning id into v_ev;
          if v_f < current_date then
            insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje, entregado)
            select c, v_ev, ge.estudiante_id,
                   least(100, greatest(30, round(55 + (abs(hashtext(ge.estudiante_id::text)) % 43) + (random() * 18 - 9)))), true
            from grupo_estudiantes ge where ge.grupo_id = s and ge.estado = 'activo' and random() < .97;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
  -- Recuperaciones del III corte para quienes reprobaron Matemática en secundaria
  for i in 4..7 loop
    s := secs[i];
    select id into a from asignaturas where grado_id = (select grado_id from grupos where id = s) and nombre = 'Matemática';
    insert into evaluaciones(cuenta_id, grupo_id, asignatura_id, periodo_id, titulo, tipo, fecha, peso, puntaje_max)
    values (c, s, a, per[3], 'Recuperación III corte', 'recuperacion', make_date(v_anio, 9, 19), 0, 100) returning id into v_ev;
    insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje)
    select c, v_ev, n.estudiante_id, 60 + floor(random() * 15) from d360_notas_seccion(s, per[3]) n
    where n.asignatura_id = a and n.final < 60 and random() < .7;
  end loop;

  -- Asistencia de las últimas 5 semanas (una lista diaria por sección) y de docentes
  for i in 1..7 loop
    for v_f in select x::date from generate_series(current_date - 35, current_date - 1, interval '1 day') x where extract(isodow from x) <= 5 loop
      insert into asistencias(cuenta_id, grupo_id, estudiante_id, fecha, estado, nota)
      select c, secs[i], ge.estudiante_id, v_f, x.estado, case when x.estado = 'justificado' then 'Constancia médica' end
      from grupo_estudiantes ge, lateral (select random() rr) q,
           lateral (select case when q.rr < .9 then 'presente' when q.rr < .95 then 'ausente' when q.rr < .985 then 'tarde' else 'justificado' end estado) x
      where ge.grupo_id = secs[i] and ge.estado = 'activo';
    end loop;
  end loop;
  insert into asistencia_docentes(cuenta_id, miembro_id, fecha, estado, nota)
  select c, mm.id, x::date, case when random() < .95 then 'presente' when random() < .5 then 'tarde' else 'justificado' end, null
  from miembros mm, generate_series(current_date - 14, current_date - 1, interval '1 day') x
  where mm.cuenta_id = c and mm.rol = 'docente' and extract(isodow from x) <= 5;

  -- Pagos: casi todo lo vencido pagado; algunas familias atrasadas
  for v_cargo in select cg.* from cargos cg where cg.cuenta_id = c and cg.vence <= current_date + 2 order by cg.vence loop
    r := random();
    if v_cargo.vence < current_date - 60 or r < .8 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha, referencia)
      values (c, v_cargo.estudiante_id, v_cargo.id, v_cargo.monto - v_cargo.descuento,
              (array['efectivo','transferencia','transferencia','deposito'])[1 + floor(random() * 4)::int],
              least(current_date, v_cargo.vence + floor(random() * 8)::int),
              case when random() < .5 then 'LAFISE-' || floor(100000 + random() * 899999)::int end);
    elsif r < .88 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha)
      values (c, v_cargo.estudiante_id, v_cargo.id, round((v_cargo.monto - v_cargo.descuento) / 2), 'efectivo', least(current_date, v_cargo.vence + 3));
    end if;
  end loop;

  -- Comentarios de boletín del III corte (sección 7mo A, maestro guía)
  insert into boletin_comentarios(cuenta_id, estudiante_id, periodo_id, conducta, comentario)
  select c, ge.estudiante_id, per[3], (array['AA','AA','AS','AS','AF'])[1 + (abs(hashtext(ge.estudiante_id::text)) % 5)],
         (array['Muy participativo y responsable.','Debe mejorar la puntualidad en la entrega de tareas.','Excelente compañerismo.',
                'Se recomienda reforzar Matemática en casa.','Ha mostrado avances notables en este corte.'])[1 + (abs(hashtext(ge.estudiante_id::text)) % 5)]
  from grupo_estudiantes ge where ge.grupo_id = secs[4];

  -- Comunicados
  insert into comunicados(cuenta_id, titulo, cuerpo, audiencia, grupo_id, publicado) values
    (c, 'Entrega de boletines del III corte', 'Estimadas familias: la entrega de boletines será el viernes a las 4:00 p. m. en cada aula. Les esperamos.', 'tutores', null, now() - interval '20 days'),
    (c, 'Feria científica', 'Los estudiantes de secundaria presentarán sus proyectos el próximo jueves. ¡Están invitados!', 'todos', null, now() - interval '6 days'),
    (c, 'Reunión de docentes', 'Reunión de evaluación del IV corte el miércoles a las 12:30 p. m. en la biblioteca.', 'personal', null, now() - interval '2 days'),
    (c, 'Excursión educativa de 4to A', 'El 4to grado visitará el Museo Nacional. Enviar la autorización firmada antes del lunes.', 'grupo', secs[1], now() - interval '1 day');
  insert into eventos(cuenta_id, titulo, fecha, tipo, descripcion) values
    (c, 'Exámenes del IV corte', current_date + 10, 'evaluacion', 'Semana de exámenes de cierre del año escolar.'),
    (c, 'Clausura del año escolar', make_date(v_anio, 12, 5), 'actividad', 'Acto de graduación y clausura.'),
    (c, 'Asueto: Día de la Purísima', make_date(v_anio, 12, 8), 'feriado', null);
  insert into certificados(cuenta_id, estudiante_id, tipo, titulo, folio, emitido, datos)
  select c, ge.estudiante_id, 'constancia', 'Constancia de estudios', 'DEMOCO-' || to_char(current_date, 'YY') || '-' || upper(substr(md5(ge.estudiante_id::text), 1, 6)),
         current_date - 15, jsonb_build_object('curso', 'Constancia de estudios · año lectivo ' || v_anio, 'detalle', 'Estudiante activo de ' || g2.nombre)
  from grupo_estudiantes ge join grupos g2 on g2.id = ge.grupo_id where ge.grupo_id = secs[6] limit 3;
  return 175;
end $$;
revoke execute on function public.d360_sembrar_demo_colegio() from public, anon, authenticated;

-- Las demos se siembran juntas (profesor, academia y colegio)
create or replace function public.d360_admin_reiniciar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  r := d360_sembrar_demos();
  return r || jsonb_build_object('estudiantes', (r ->> 'estudiantes')::int + d360_sembrar_demo_colegio());
end $$;
revoke execute on function public.d360_admin_reiniciar_demos() from public, anon;

-- Reinicio nocturno de la demo de colegio (00:25 en Nicaragua)
select cron.schedule('d360-reiniciar-demo-colegio', '25 6 * * *', $$select public.d360_sembrar_demo_colegio()$$);
