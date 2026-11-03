-- =====================================================================
-- DOCENCIA360 · 12 · Datos de las cuentas de demostración
-- d360_sembrar_demos() crea las cuentas demo si no existen y reinicia
-- sus datos con fechas relativas a hoy. Se ejecuta cada noche.
-- Los miembros (y sus usuarios de acceso) se conservan entre reinicios.
-- =====================================================================
create or replace function public._d360_demo_cuenta(p_codigo text, p_modalidad text, p_nombre text, p_plan text, p_tel text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_dueno uuid;
begin
  select id into v_id from cuentas where codigo = p_codigo;
  if v_id is null then
    select user_id into v_dueno from plataforma_admins order by creado limit 1;
    if v_dueno is null then raise exception 'Se necesita un administrador de plataforma para crear las demos.'; end if;
    insert into cuentas(modalidad, nombre, codigo, propietario, telefono, email, moneda, es_demo, onboarding_completo)
    values (p_modalidad, p_nombre, p_codigo, v_dueno, p_tel, 'demo@docencia360.app', 'NIO', true, true)
    returning id into v_id;
  end if;
  insert into suscripciones(cuenta_id, plan_id, estado, inicio, vence, dias_gracia)
  values (v_id, p_plan, 'activa', current_date - 60, date '2099-12-31', 5)
  on conflict (cuenta_id) do update set plan_id = excluded.plan_id, estado = 'activa', vence = excluded.vence;
  return v_id;
end $$;

create or replace function public._d360_demo_miembro(p_cuenta uuid, p_nombre text, p_rol text, p_esp text default null, p_tel text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from miembros where cuenta_id = p_cuenta and nombre = p_nombre;
  if v_id is null then
    insert into miembros(cuenta_id, nombre, rol, especialidad, telefono, activo)
    values (p_cuenta, p_nombre, p_rol, p_esp, p_tel, true) returning id into v_id;
  else
    update miembros set rol = p_rol, especialidad = p_esp, telefono = p_tel, activo = true where id = v_id;
  end if;
  return v_id;
end $$;

-- Borra los datos (no los miembros) de una cuenta demo
create or replace function public._d360_demo_vaciar(p_cuenta uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _d360_es_demo(p_cuenta) then raise exception 'Solo se vacían cuentas demo'; end if;
  delete from pagos where cuenta_id = p_cuenta;
  delete from cargos where cuenta_id = p_cuenta;
  delete from certificados where cuenta_id = p_cuenta;
  delete from matriculas where cuenta_id = p_cuenta;
  delete from notificaciones where cuenta_id = p_cuenta;
  delete from comunicados where cuenta_id = p_cuenta;
  delete from eventos where cuenta_id = p_cuenta;
  delete from observaciones where cuenta_id = p_cuenta;
  delete from grupos where cuenta_id = p_cuenta;          -- en cascada: horarios, asistencia, evaluaciones, notas, docentes
  delete from estudiantes where cuenta_id = p_cuenta;
  delete from cursos where cuenta_id = p_cuenta;
  delete from asignaturas where cuenta_id = p_cuenta;
  delete from periodos where cuenta_id = p_cuenta;
  delete from asistencia_docentes where cuenta_id = p_cuenta;
  -- miembros creados por visitantes (no previstos en la demo) se eliminan
  delete from miembros where cuenta_id = p_cuenta and nombre not in
    (select miembro from demo_perfiles where codigo = (select codigo from cuentas where id = p_cuenta))
    and rol <> 'docente';
end $$;

-- Crea estudiantes con nombres reales nicaragüenses (determinista por semilla)
create or replace function public._d360_demo_estudiantes(p_cuenta uuid, p_n int, p_semilla float8)
returns setof uuid language plpgsql security definer set search_path = public as $$
declare
  nom text[] := array['Ana Sofía','Luis Fernando','María José','Carlos Andrés','Valeria','José Daniel','Camila','Kevin Alexander','Fernanda','Jonathan','Ximena','Erick','Daniela','Bryan','Allison','Josué','Nicole','Joel','Mariela','Axel','Génesis','Francisco','Katherine','Moisés','Hellen','Gabriel','Scarleth','Noel','Ashley','Isaac','Melissa','Óscar','Yaritza','Ernesto','Fátima','Javier','Dayana','Marcos','Abigail','Rodrigo','Hazel','Ezequiel','Celeste','Samuel','Tatiana'];
  ape text[] := array['López','Pérez','Gutiérrez','Martínez','Rodríguez','Hernández','Ruiz','Castillo','Mendoza','Rivas','Chávez','Flores','Gómez','Lacayo','Sandino','Téllez','Zelaya','Obando','Bermúdez','Espinoza','Rocha','Aguirre','Salazar','Vanegas','Montenegro','Cruz','Blandón','Arauz','Morales','Somarriba'];
  v_id uuid; i int;
begin
  perform setseed(p_semilla);
  for i in 1..p_n loop
    insert into estudiantes(cuenta_id, nombres, apellidos, fecha_nacimiento, genero, telefono, contacto_nombre, contacto_telefono, contacto_parentesco, estado, direccion)
    values (p_cuenta, nom[1 + ((i * 7 + floor(random() * 3)::int) % array_length(nom, 1))],
            ape[1 + floor(random() * array_length(ape, 1))::int] || ' ' || ape[1 + floor(random() * array_length(ape, 1))::int],
            current_date - (365 * (12 + floor(random() * 8)::int) + floor(random() * 300)::int),
            case when i % 2 = 0 then 'M' else 'F' end,
            '8' || lpad((floor(random() * 9999999))::int::text, 7, '0'),
            case when random() < .5 then 'Sra. ' else 'Sr. ' end || ape[1 + floor(random() * array_length(ape, 1))::int],
            '5' || lpad((floor(random() * 9999999))::int::text, 7, '0'),
            case when random() < .55 then 'Madre' when random() < .8 then 'Padre' else 'Tutor legal' end,
            'activo',
            (array['Managua','León','Masaya','Granada','Estelí','Matagalpa','Chinandega','Jinotepe'])[1 + floor(random() * 8)::int])
    returning id into v_id;
    return next v_id;
  end loop;
end $$;

-- Asistencia de las últimas p_dias jornadas de clase, según el horario del grupo
create or replace function public._d360_demo_asistencia(p_grupo uuid, p_dias int)
returns void language plpgsql security definer set search_path = public as $$
declare v_c uuid; d date; r float8;
begin
  select cuenta_id into v_c from grupos where id = p_grupo;
  for d in select g::date from generate_series(current_date - p_dias, current_date - 1, interval '1 day') g
           where extract(isodow from g)::int in (select dia from horarios where grupo_id = p_grupo) loop
    insert into asistencias(cuenta_id, grupo_id, estudiante_id, fecha, estado, nota)
    select v_c, p_grupo, ge.estudiante_id, d, x.estado, case when x.estado = 'justificado' then 'Cita médica' end
    from grupo_estudiantes ge,
         lateral (select random() r) rr,
         lateral (select case when rr.r < .86 then 'presente' when rr.r < .93 then 'ausente' when rr.r < .98 then 'tarde' else 'justificado' end estado) x
    where ge.grupo_id = p_grupo and ge.estado = 'activo' and ge.desde <= d;
  end loop;
end $$;

-- Evaluaciones con notas (las futuras quedan sin calificar)
create or replace function public._d360_demo_evaluaciones(p_grupo uuid, p_evals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_c uuid; e jsonb; v_ev uuid; v_f date; v_max numeric;
begin
  select cuenta_id into v_c from grupos where id = p_grupo;
  for e in select * from jsonb_array_elements(p_evals) loop
    v_f := current_date + (e ->> 'dias')::int;
    v_max := coalesce((e ->> 'max')::numeric, 100);
    insert into evaluaciones(cuenta_id, grupo_id, titulo, tipo, fecha, peso, puntaje_max, descripcion)
    values (v_c, p_grupo, e ->> 't', e ->> 'tipo', v_f, (e ->> 'peso')::numeric, v_max, e ->> 'desc')
    returning id into v_ev;
    if v_f < current_date then
      insert into calificaciones(cuenta_id, evaluacion_id, estudiante_id, puntaje, entregado)
      select v_c, v_ev, ge.estudiante_id,
             round(least(v_max, greatest(v_max * .35, v_max * (.58 + random() * .45)))::numeric, 0), true
      from grupo_estudiantes ge where ge.grupo_id = p_grupo and ge.estado = 'activo' and random() < .95;
    end if;
  end loop;
end $$;

create or replace function public.d360_sembrar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c uuid; a uuid; ests uuid[]; m_prof uuid; g1 uuid; g2 uuid; g3 uuid; s_mat uuid; s_fis uuid; c_uni uuid;
  ar_ing uuid; ar_mus uuid; ar_comp uuid; cu_a1 uuid; cu_a2 uuid; cu_gui uuid; cu_pia uuid; cu_ofi uuid;
  i1 uuid; i2 uuid; i3 uuid; i4 uuid; ga uuid; gb uuid; gc uuid; gd uuid; ge uuid; gf uuid;
  e uuid; n int := 0; v_mat uuid; v_cargo record; r float8;
begin
  perform set_config('d360.mantenimiento', 'on', true);

  -- ================= PROFESOR INDEPENDIENTE =================
  c := _d360_demo_cuenta('DEMOPR', 'profesor', 'Clases de Matemática y Física · Prof. Marcela Rivas', 'prof_premium', '8888-0000');
  m_prof := _d360_demo_miembro(c, 'Marcela Rivas', 'propietario', 'Matemática y Física', '8888-0000');
  perform _d360_demo_miembro(c, 'Andrés Rivas', 'docente', 'Asistente de Física', '8777-1212');
  perform _d360_demo_vaciar(c);

  insert into asignaturas(cuenta_id, nombre, descripcion) values (c, 'Matemática', 'Álgebra, geometría y aritmética de secundaria') returning id into s_mat;
  insert into asignaturas(cuenta_id, nombre, descripcion) values (c, 'Física', 'Cinemática, dinámica y energía') returning id into s_fis;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, horas_totales, mensualidad, descripcion)
  values (c, 'Preparación para examen de admisión UNI', s_mat, 12, 72, 1200, 'Aritmética, álgebra, geometría y razonamiento lógico. Simulacros cada dos semanas.') returning id into c_uni;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, mensualidad, descripcion)
  values (c, 'Reforzamiento escolar', s_mat, 16, 900, 'Apoyo en tareas y preparación de exámenes del colegio.');

  insert into grupos(cuenta_id, nombre, asignatura_id, cupo, fecha_inicio, estado) values (c, 'Matemática 9no · lunes y miércoles', s_mat, 10, current_date - 70, 'activo') returning id into g1;
  insert into grupos(cuenta_id, nombre, asignatura_id, cupo, fecha_inicio, estado) values (c, 'Física 11mo · martes y jueves', s_fis, 8, current_date - 70, 'activo') returning id into g2;
  insert into grupos(cuenta_id, nombre, asignatura_id, curso_id, cupo, fecha_inicio, fecha_fin, estado) values (c, 'Admisión UNI · sábados', s_mat, c_uni, 12, current_date - 49, current_date + 35, 'activo') returning id into g3;
  insert into horarios(cuenta_id, grupo_id, miembro_id, dia, hora_inicio, hora_fin) values
    (c, g1, m_prof, 1, '16:00', '17:30'), (c, g1, m_prof, 3, '16:00', '17:30'),
    (c, g2, m_prof, 2, '16:00', '17:30'), (c, g2, m_prof, 4, '16:00', '17:30'),
    (c, g3, m_prof, 6, '08:00', '11:00');
  insert into grupo_docentes(cuenta_id, grupo_id, miembro_id)
  select c, g2, id from miembros where cuenta_id = c and nombre = 'Andrés Rivas';

  select array_agg(x) into ests from _d360_demo_estudiantes(c, 20, 0.21) x;
  insert into grupo_estudiantes(cuenta_id, grupo_id, estudiante_id, desde)
  select c, g1, ests[i], current_date - 70 from generate_series(1, 8) i
  union all select c, g2, ests[i], current_date - 70 from generate_series(7, 13) i
  union all select c, g3, ests[i], current_date - 49 from generate_series(12, 20) i;
  update estudiantes set estado = 'inactivo' where id = ests[20];
  update grupo_estudiantes set estado = 'retirado' where estudiante_id = ests[20];

  perform _d360_demo_asistencia(g, 35) from unnest(array[g1, g2, g3]) g;
  perform _d360_demo_evaluaciones(g1, '[{"t":"Examen: ecuaciones lineales","tipo":"examen","dias":-30,"peso":30},
    {"t":"Tarea: problemas de proporciones","tipo":"tarea","dias":-21,"peso":15,"max":20},
    {"t":"Examen: sistemas de ecuaciones","tipo":"examen","dias":-9,"peso":30},
    {"t":"Tarea: factorización","tipo":"tarea","dias":-3,"peso":15,"max":20},
    {"t":"Proyecto: geometría en mi casa","tipo":"proyecto","dias":6,"peso":10,"desc":"Medir tres objetos y calcular áreas."}]');
  perform _d360_demo_evaluaciones(g2, '[{"t":"Prueba: movimiento rectilíneo","tipo":"examen","dias":-26,"peso":35},
    {"t":"Práctica de laboratorio: caída libre","tipo":"practica","dias":-14,"peso":25},
    {"t":"Tarea: leyes de Newton","tipo":"tarea","dias":-2,"peso":15,"max":20},
    {"t":"Examen: dinámica","tipo":"examen","dias":5,"peso":25}]');
  perform _d360_demo_evaluaciones(g3, '[{"t":"Simulacro 1","tipo":"examen","dias":-35,"peso":25},
    {"t":"Simulacro 2","tipo":"examen","dias":-21,"peso":25},
    {"t":"Guía de razonamiento lógico","tipo":"tarea","dias":-7,"peso":20,"max":20},
    {"t":"Simulacro 3","tipo":"examen","dias":-1,"peso":30}]');
  insert into eventos(cuenta_id, titulo, fecha, hora_inicio, tipo, grupo_id, descripcion) values
    (c, 'Reunión con padres de 9no', current_date + 4, '17:45', 'reunion', g1, 'Entrega de avances del primer corte.'),
    (c, 'Simulacro final UNI', current_date + 13, '08:00', 'evaluacion', g3, 'Duración: 3 horas. Traer calculadora.'),
    (c, 'Sin clases (feriado)', current_date + 18, null, 'feriado', null, null);
  insert into observaciones(cuenta_id, estudiante_id, tipo, texto, creado) values
    (c, ests[2], 'academica', 'Le cuesta despejar ecuaciones con fracciones. Reforzar con ejercicios extra.', now() - interval '12 days'),
    (c, ests[5], 'familia', 'La mamá pidió informe mensual por WhatsApp.', now() - interval '20 days'),
    (c, ests[14], 'academica', 'Excelente en razonamiento lógico; puede apoyar a compañeros.', now() - interval '5 days');
  n := n + 20;

  -- ================= ACADEMIA =================
  a := _d360_demo_cuenta('DEMOAC', 'academia', 'Academia Horizonte · Inglés, Música y Computación', 'acad_empresarial', '2270-5050');
  perform _d360_demo_miembro(a, 'Roberto Castillo', 'director', null, '8811-2233');
  perform _d360_demo_miembro(a, 'Karla Mendoza', 'finanzas', null, '8822-3344');
  i1 := _d360_demo_miembro(a, 'Daniel Ortega Ruiz', 'docente', 'Inglés', '8833-4455');
  i2 := _d360_demo_miembro(a, 'Sarah Johnson', 'docente', 'Inglés conversacional', '8844-5566');
  i3 := _d360_demo_miembro(a, 'Iván Zeledón', 'docente', 'Guitarra y piano', '8855-6677');
  i4 := _d360_demo_miembro(a, 'Lucía Pineda', 'docente', 'Ofimática', '8866-7788');
  perform _d360_demo_vaciar(a);

  insert into asignaturas(cuenta_id, nombre) values (a, 'Inglés') returning id into ar_ing;
  insert into asignaturas(cuenta_id, nombre) values (a, 'Música') returning id into ar_mus;
  insert into asignaturas(cuenta_id, nombre) values (a, 'Computación') returning id into ar_comp;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, horas_totales, precio_matricula, mensualidad, certifica, requisitos, descripcion)
  values (a, 'Inglés General · Nivel A1', ar_ing, 16, 96, 500, 1200, true, 'Desde 12 años', 'Vocabulario básico, presente simple y conversación cotidiana.') returning id into cu_a1;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, horas_totales, precio_matricula, mensualidad, certifica, requisitos)
  values (a, 'Inglés General · Nivel A2', ar_ing, 16, 96, 500, 1300, true, 'Haber aprobado A1 o prueba de ubicación') returning id into cu_a2;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, precio_matricula, mensualidad, certifica, modalidad_clase)
  values (a, 'Guitarra para principiantes', ar_mus, 12, 300, 1000, false, 'presencial') returning id into cu_gui;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, precio_matricula, mensualidad, certifica)
  values (a, 'Piano inicial', ar_mus, 12, 300, 1100, false) returning id into cu_pia;
  insert into cursos(cuenta_id, nombre, asignatura_id, duracion_semanas, horas_totales, precio_matricula, mensualidad, certifica, modalidad_clase)
  values (a, 'Ofimática: Word, Excel y PowerPoint', ar_comp, 8, 48, 400, 950, true, 'mixta') returning id into cu_ofi;

  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, turno, fecha_inicio, estado) values (a, 'Inglés A1 · sábado mañana', cu_a1, ar_ing, 12, 'sabatino', current_date - 63, 'activo') returning id into ga;
  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, turno, fecha_inicio, estado) values (a, 'Inglés A1 · lunes y miércoles noche', cu_a1, ar_ing, 12, 'nocturno', current_date - 63, 'activo') returning id into gb;
  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, turno, fecha_inicio, estado) values (a, 'Inglés A2 · martes y jueves', cu_a2, ar_ing, 10, 'vespertino', current_date - 63, 'activo') returning id into gc;
  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, fecha_inicio, estado) values (a, 'Guitarra · viernes', cu_gui, ar_mus, 8, current_date - 42, 'activo') returning id into gd;
  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, fecha_inicio, estado) values (a, 'Piano · sábado tarde', cu_pia, ar_mus, 6, current_date - 42, 'activo') returning id into ge;
  insert into grupos(cuenta_id, nombre, curso_id, asignatura_id, cupo, fecha_inicio, fecha_fin, estado) values (a, 'Ofimática · intensivo de octubre', cu_ofi, ar_comp, 10, current_date - 90, current_date - 34, 'finalizado') returning id into gf;
  insert into grupo_docentes(cuenta_id, grupo_id, miembro_id) values (a, ga, i1), (a, gb, i1), (a, gc, i2), (a, gd, i3), (a, ge, i3), (a, gf, i4);
  insert into horarios(cuenta_id, grupo_id, miembro_id, dia, hora_inicio, hora_fin) values
    (a, ga, i1, 6, '08:00', '11:00'), (a, gb, i1, 1, '18:00', '19:30'), (a, gb, i1, 3, '18:00', '19:30'),
    (a, gc, i2, 2, '17:00', '18:30'), (a, gc, i2, 4, '17:00', '18:30'), (a, gd, i3, 5, '16:00', '17:30'),
    (a, ge, i3, 6, '14:00', '15:30');

  select array_agg(x) into ests from _d360_demo_estudiantes(a, 44, 0.47) x;
  -- Matrículas: el servidor genera la matrícula y las mensualidades (incluidas las ya vencidas)
  for i in 1..44 loop
    e := ests[i];
    v_mat := ((public.d360_matricular_interno(a, e,
      case when i <= 11 then ga when i <= 22 then gb when i <= 31 then gc when i <= 37 then gd when i <= 41 then ge else gf end,
      case when i <= 37 then current_date - 63 + (i % 5) else current_date - 90 end,
      case when i % 9 = 0 then 15 else 0 end,
      case when i % 9 = 0 then 'Beca hermanos' end)) ->> 'matricula_id')::uuid;
  end loop;
  -- Pagos: lo vencido casi todo pagado; algunos atrasados y algunos abonos parciales
  for v_cargo in select cg.*, row_number() over (order by cg.vence, cg.id) rn from cargos cg
                 where cg.cuenta_id = a and cg.vence <= current_date + 3 order by cg.vence loop
    r := random();
    if v_cargo.vence < current_date - 45 or r < .62 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha, referencia)
      values (a, v_cargo.estudiante_id, v_cargo.id, v_cargo.monto - v_cargo.descuento,
              (array['efectivo','transferencia','transferencia','deposito','tarjeta'])[1 + floor(random() * 5)::int],
              least(current_date, v_cargo.vence + floor(random() * 6)::int),
              case when random() < .5 then 'BAC-' || floor(100000 + random() * 899999)::int end);
    elsif r < .82 then
      insert into pagos(cuenta_id, estudiante_id, cargo_id, monto, metodo, fecha)
      values (a, v_cargo.estudiante_id, v_cargo.id, round((v_cargo.monto - v_cargo.descuento) / 2), 'efectivo', least(current_date, v_cargo.vence + 2));
    end if;
  end loop;
  -- Un retiro y los certificados del intensivo de Ofimática ya terminado
  update matriculas set estado = 'retirada', notas = 'Retiro: se mudó a otra ciudad' where cuenta_id = a and estudiante_id = ests[30];
  update grupo_estudiantes set estado = 'retirado' where cuenta_id = a and estudiante_id = ests[30];
  update cargos set estado = 'anulado' where cuenta_id = a and estudiante_id = ests[30] and pagado = 0 and vence > current_date;
  update matriculas set estado = 'completada' where cuenta_id = a and grupo_id = gf;
  insert into certificados(cuenta_id, estudiante_id, curso_id, tipo, titulo, folio, emitido, datos)
  select a, m.estudiante_id, cu_ofi, 'certificado', 'Ofimática: Word, Excel y PowerPoint',
         'DEMOAC-' || to_char(current_date, 'YY') || '-' || upper(substr(md5(m.estudiante_id::text), 1, 6)), current_date - 30,
         jsonb_build_object('curso', 'Ofimática: Word, Excel y PowerPoint', 'detalle', 'Duración: 48 horas')
  from matriculas m where m.cuenta_id = a and m.grupo_id = gf and m.estudiante_id <> ests[44];

  perform _d360_demo_asistencia(g, 35) from unnest(array[ga, gb, gc, gd, ge]) g;
  perform _d360_demo_evaluaciones(ga, '[{"t":"Unit 1 test: greetings","tipo":"examen","dias":-28,"peso":25},{"t":"Speaking: introduce yourself","tipo":"participacion","dias":-14,"peso":25},{"t":"Unit 3 test: daily routines","tipo":"examen","dias":-5,"peso":25},{"t":"Project: my family","tipo":"proyecto","dias":9,"peso":25}]');
  perform _d360_demo_evaluaciones(gb, '[{"t":"Unit 1 test: greetings","tipo":"examen","dias":-27,"peso":30},{"t":"Homework: verb to be","tipo":"tarea","dias":-12,"peso":20,"max":20},{"t":"Unit 3 test: daily routines","tipo":"examen","dias":-2,"peso":30},{"t":"Oral exam","tipo":"examen","dias":12,"peso":20}]');
  perform _d360_demo_evaluaciones(gc, '[{"t":"Past simple quiz","tipo":"examen","dias":-24,"peso":30},{"t":"Writing: my last vacation","tipo":"tarea","dias":-10,"peso":30,"max":20},{"t":"Midterm","tipo":"examen","dias":3,"peso":40}]');
  perform _d360_demo_evaluaciones(gd, '[{"t":"Acordes básicos","tipo":"practica","dias":-20,"peso":50},{"t":"Primera canción completa","tipo":"proyecto","dias":-3,"peso":50}]');
  perform _d360_demo_evaluaciones(ge, '[{"t":"Escalas y postura","tipo":"practica","dias":-17,"peso":50},{"t":"Pieza corta","tipo":"proyecto","dias":10,"peso":50}]');
  insert into eventos(cuenta_id, titulo, fecha, hora_inicio, tipo, descripcion) values
    (a, 'Inicio de inscripciones: Inglés A2 (nuevo grupo)', current_date + 7, null, 'actividad', 'Promoción: matrícula a mitad de precio la primera semana.'),
    (a, 'Recital de música', current_date + 16, '16:00', 'actividad', 'Estudiantes de guitarra y piano. Invitar a las familias.'),
    (a, 'Reunión de instructores', current_date + 2, '19:45', 'reunion', null);
  n := n + 44;

  return jsonb_build_object('ok', true, 'estudiantes', n, 'fecha', current_date);
end $$;

-- Matrícula para el sembrado (mismo motor que d360_matricular, sin la verificación de sesión)
create or replace function public.d360_matricular_interno(p_cuenta uuid, p_estudiante uuid, p_grupo uuid, p_fecha date,
                                                          p_desc numeric, p_beca text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_g grupos; v_c cursos; v_id uuid; v_meses int;
begin
  if not _d360_es_demo(p_cuenta) then raise exception 'Solo para cuentas demo'; end if;
  select * into v_g from grupos where id = p_grupo;
  select * into v_c from cursos where id = v_g.curso_id;
  insert into matriculas(cuenta_id, estudiante_id, curso_id, grupo_id, anio, fecha, estado, monto_matricula, mensualidad, descuento_pct, beca)
  values (p_cuenta, p_estudiante, v_c.id, p_grupo, extract(year from p_fecha)::text, p_fecha, 'activa', v_c.precio_matricula, v_c.mensualidad, p_desc, p_beca)
  returning id into v_id;
  insert into grupo_estudiantes(grupo_id, estudiante_id, cuenta_id, desde, estado) values (p_grupo, p_estudiante, p_cuenta, p_fecha, 'activo')
  on conflict (grupo_id, estudiante_id) do nothing;
  if v_c.precio_matricula > 0 then
    insert into cargos(cuenta_id, estudiante_id, matricula_id, concepto, tipo, monto, vence)
    values (p_cuenta, p_estudiante, v_id, 'Matrícula · ' || v_c.nombre, 'matricula', v_c.precio_matricula, p_fecha);
  end if;
  v_meses := greatest(1, ceil(coalesce(v_c.duracion_semanas, 8) / 4.3)::int);
  perform _d360_generar_mensualidades(v_id, p_fecha, v_meses, 10);
  return jsonb_build_object('matricula_id', v_id);
end $$;

revoke execute on function public._d360_demo_cuenta(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public._d360_demo_miembro(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public._d360_demo_vaciar(uuid) from public, anon, authenticated;
revoke execute on function public._d360_demo_estudiantes(uuid, int, float8) from public, anon, authenticated;
revoke execute on function public._d360_demo_asistencia(uuid, int) from public, anon, authenticated;
revoke execute on function public._d360_demo_evaluaciones(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.d360_matricular_interno(uuid, uuid, uuid, date, numeric, text) from public, anon, authenticated;
revoke execute on function public.d360_sembrar_demos() from public, anon, authenticated;

-- Reinicio desde el panel maestro
create or replace function public.d360_admin_reiniciar_demos()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not d360_es_plataforma_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return d360_sembrar_demos();
end $$;
revoke execute on function public.d360_admin_reiniciar_demos() from public, anon;
