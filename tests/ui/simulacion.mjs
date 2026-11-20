// Simulación de Supabase para pruebas de interfaz y para el video tutorial:
// datos de ejemplo y respuestas falsas (nada sale a internet).
// Variables: PLAN, ESTADO y ROL simulan otro plan, estado o rol del profesor.
const hoy = new Date().toISOString().slice(0, 10);
const U = "11111111-1111-1111-1111-111111111111", C = "22222222-2222-2222-2222-222222222222";
const G1 = "33333333-3333-3333-3333-333333333331", G2 = "33333333-3333-3333-3333-333333333332";
const E = (n) => `44444444-4444-4444-4444-44444444444${n}`;
const EV1 = "55555555-5555-5555-5555-555555555551", EV2 = "55555555-5555-5555-5555-555555555552";
const est = [["Ana", "López"], ["Luis", "Pérez"], ["María José", "Gutiérrez Castillo"], ["Carlos", "Ruiz"]].map(([n, a], i) => ({
  id: E(i + 1), cuenta_id: C, nombres: n, apellidos: a, estado: i === 3 ? "retirado" : "activo", telefono: "8888-000" + i,
  contacto_nombre: "Responsable " + i, contacto_telefono: "7777-000" + i, creado: hoy + "T10:00:00Z", fecha_nacimiento: "2010-05-0" + (i + 1) }));
const planes = [
  { id: "prof_basico", modalidad: "profesor", nombre: "Básico", orden: 1, resumen: "Para empezar", precio_usd: 4, precio_nio: 149, max_estudiantes: null, max_estudiantes_portal: 0, max_docentes: 0, max_grupos: 4, max_admins: 0, almacenamiento_mb: 200, funciones: { tareas: true, exportar: false, asistentes: false, calendario: true, reportes_pdf: false, portal_estudiantes: false, reporte_whatsapp: false, finanzas: false, rubricas: false, banco_preguntas: false }, activo: true },
  { id: "prof_profesional", modalidad: "profesor", nombre: "Profesional", orden: 2, resumen: "Varios grupos", precio_usd: 8, precio_nio: 295, max_estudiantes: null, max_estudiantes_portal: 250, max_docentes: 0, max_grupos: 15, max_admins: 0, almacenamiento_mb: 1024, funciones: { tareas: true, exportar: true, asistentes: false, calendario: true, reportes_pdf: true, portal_estudiantes: true, reporte_whatsapp: true, finanzas: true, rubricas: true, banco_preguntas: false }, activo: true },
  { id: "prof_premium", modalidad: "profesor", nombre: "Premium", orden: 3, resumen: "Con asistente", precio_usd: 14, precio_nio: 515, max_estudiantes: null, max_estudiantes_portal: 600, max_docentes: 1, max_grupos: null, max_admins: 0, almacenamiento_mb: 3072, funciones: { tareas: true, exportar: true, asistentes: true, calendario: true, reportes_pdf: true, portal_estudiantes: true, reporte_whatsapp: true, finanzas: true, rubricas: true, banco_preguntas: true }, activo: true },
  { id: "col_avanzado", modalidad: "colegio", nombre: "Avanzado", orden: 2, resumen: "Colegios", precio_usd: 99, precio_nio: 3625, max_estudiantes: 1200, max_docentes: 80, max_grupos: null, max_admins: 10, almacenamiento_mb: 51200, funciones: {}, activo: true },
];
const grupos = [
  { id: G1, cuenta_id: C, nombre: "Matemática 9no", estado: "activo", cupo: 10, curso_id: "c1", asignatura_id: "a1", asignaturas: { nombre: "Matemática" }, cursos: null, fecha_inicio: "2026-02-01" },
  { id: G2, cuenta_id: C, nombre: "Física sabatino", estado: "activo", curso_id: "c2", asignatura_id: null, asignaturas: null, cursos: null },
];
const dia = ((new Date().getDay() + 6) % 7) + 1;
const A1 = "99999999-9999-9999-9999-999999999991", A2 = "99999999-9999-9999-9999-999999999992";
const Q = (n) => `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa${n}`;
const PREGUNTAS = [
  { id: Q(1), actividad_id: A1, cuenta_id: C, orden: 0, tipo: "opcion", enunciado: "¿Cuál es la unidad de velocidad en el SI?", opciones: ["m/s", "km", "kg"], correcta: 0, puntos: 2 },
  { id: Q(2), actividad_id: A1, cuenta_id: C, orden: 1, tipo: "vf", enunciado: "La aceleración es una magnitud vectorial.", opciones: [], correcta: true, puntos: 1 },
  { id: Q(3), actividad_id: A1, cuenta_id: C, orden: 2, tipo: "corta", enunciado: "Si un auto recorre 100 m en 10 s, ¿cuál es su rapidez en m/s?", opciones: [], correcta: ["10"], puntos: 3 },
  { id: Q(4), actividad_id: A1, cuenta_id: C, orden: 3, tipo: "desarrollo", enunciado: "Explica con tus palabras qué es la inercia.", opciones: [], correcta: null, puntos: 4 },
];
const sinCorrecta = PREGUNTAS.map(({ correcta, ...p }) => p);
const F = {
  rubricas: [{ id: "rb1", cuenta_id: C, nombre: "Exposición oral", criterios: [{ nombre: "Dominio del tema", niveles: [{ nombre: "Excelente", puntos: 4 }, { nombre: "Bueno", puntos: 3 }, { nombre: "Regular", puntos: 2 }] }, { nombre: "Claridad", niveles: [{ nombre: "Excelente", puntos: 4 }, { nombre: "Regular", puntos: 2 }] }] }],
  banco_preguntas: [{ id: "bp1", cuenta_id: C, tema: "Fracciones", tipo: "vf", enunciado: "1/2 es mayor que 1/3.", opciones: [], correcta: true, puntos: 1, usada: 2 },
                    { id: "bp2", cuenta_id: C, tema: "Ecuaciones", tipo: "corta", enunciado: "Si 2x = 10, ¿cuánto vale x?", opciones: [], correcta: ["5"], puntos: 2, usada: 0 }],
  interesados: [
    { id: "in1", cuenta_id: C, nombre: "Valeria Sánchez López", telefono: "84561122", curso_id: "c1", grupo_id: G1, origen: "en_linea", estado: "nuevo", datos: { quiere_prueba: true, responsable: "Marta López" }, nota: "Pregunta por descuento", creado: hoy + "T10:00:00Z", actualizado: hoy + "T10:00:00Z" },
    { id: "in2", cuenta_id: C, nombre: "Andrés Molina", telefono: "83334545", curso_id: "c1", origen: "whatsapp", estado: "prueba", prueba_fecha: hoy, prueba_grupo_id: G1, prueba_resultado: null, datos: {}, creado: hoy + "T09:00:00Z", actualizado: hoy + "T09:00:00Z" },
    { id: "in3", cuenta_id: C, nombre: "Sofía Herrera", telefono: "89991212", curso_id: "c2", origen: "visita", estado: "matriculado", estudiante_id: E(3), datos: {}, creado: hoy + "T08:00:00Z", actualizado: hoy + "T08:00:00Z" }],
  inscripcion_publica: [{ cuenta_id: C, activo: true, token: "abc1234567", mensaje: "¡La primera clase es gratis!", precios: true }],
  recuperaciones: [{ id: "rc1", cuenta_id: C, estudiante_id: E(2), grupo_origen: G2, fecha_falta: hoy, grupo_destino: G1, fecha: hoy, estado: "agendada", nota: null, estudiantes: { id: E(2), nombres: "Luis", apellidos: "Pérez", telefono: "88887777" } }],
  movimientos: [{ id: "mv1", cuenta_id: C, tipo: "gasto", fecha: hoy, concepto: "Fotocopias del examen", categoria: "Fotocopias e impresión", monto: 250, nota: null },
                { id: "mv2", cuenta_id: C, tipo: "ingreso", fecha: hoy, concepto: "Taller de repaso", categoria: "Talleres", monto: 400, nota: null }],
  tutores_estudiantes: [{ parentesco: "Madre", miembro_id: "m1", estudiante_id: E(1), estudiantes: { id: E(1), nombres: "Ana", apellidos: "López", codigo: "E-001", foto_url: null, estado: "activo" } }],
  avisos_aula: [{ id: "av1", cuenta_id: C, grupo_id: G1, texto: "Mañana hay examen de fracciones.", creado: hoy + "T14:00:00Z" }],
  materiales: [{ id: "ma1", cuenta_id: C, grupo_id: G1, titulo: "Guía unidad 3", descripcion: "Resolver del 1 al 10", url: null, archivo_path: C + "/materiales/x.pdf", archivo_nombre: "guia.pdf", archivo_tamano: 120000, archivo_tipo: "application/pdf", creado: hoy + "T13:00:00Z" }],
  entrega_archivos: [{ id: "ea1", path: C + "/entregas/e/f.jpg", nombre: "cuaderno.jpg", tamano: 250000, tipo: "image/jpeg" }],
  planes, config_global: [{ clave: "publico.dias_prueba", valor: 14 }, { clave: "publico.inactividad_minutos", valor: 60 }, { clave: "publico.tipo_cambio", valor: 36.62, descripcion: "Tipo de cambio", actualizado: hoy }, { clave: "publico.terminos_version", valor: "2026-11-05" }, { clave: "publico.registro_con_codigo", valor: true }],
  grupos, asignaturas: [{ id: "a1", cuenta_id: C, nombre: "Matemática", activo: true }], cursos: [{ id: "c1", cuenta_id: C, nombre: "Álgebra intensiva", mensualidad: 800, precio_matricula: 300, duracion_semanas: 8, modalidad_clase: "presencial", activo: true, certifica: true, siguiente_curso_id: "c2" },
           { id: "c2", cuenta_id: C, nombre: "Álgebra avanzada", mensualidad: 900, precio_matricula: 0, duracion_semanas: 8, modalidad_clase: "presencial", activo: true, certifica: true }],
  estudiantes: est,
  grupo_estudiantes: est.slice(0, 3).map((e) => ({ grupo_id: G1, estudiante_id: e.id, cuenta_id: C, estado: "activo", desde: "2026-02-01", estudiantes: e, grupos: { id: G1, nombre: "Matemática 9no", estado: "activo" } })),
  horarios: [{ id: "h1", dia, hora_inicio: "08:00:00", hora_fin: "09:30:00", grupo_id: G1, grupos: { nombre: "Matemática 9no", estado: "activo" } }],
  actividades: [
    { id: A1, cuenta_id: C, grupo_id: G1, evaluacion_id: EV1, tipo: "examen", titulo: "Examen de cinemática", instrucciones: "Lee con calma. Tienes 30 minutos.", abre: null, cierra: null, duracion_min: 30, intentos: 1, mostrar_nota: true, peso: 20, estado: "publicada", token: "fisica2026", creado: hoy + "T09:00:00Z" },
    { id: A2, cuenta_id: C, grupo_id: G1, evaluacion_id: null, tipo: "tarea", titulo: "Tarea: movimiento rectilíneo", instrucciones: null, abre: null, cierra: null, duracion_min: null, intentos: 2, mostrar_nota: true, peso: 10, estado: "borrador", token: null, creado: hoy + "T10:00:00Z" },
  ],
  preguntas: PREGUNTAS,
  entregas: [
    { id: "en1", actividad_id: A1, estudiante_id: E(1), estado: "enviada", pendiente: true, intento: 1, enviada: hoy + "T09:40:00Z", puntaje: 6, puntaje_max: 10, comentario: null,
      respuestas: { [Q(1)]: 0, [Q(2)]: false, [Q(3)]: "10", [Q(4)]: "Es cuando un cuerpo tiende a seguir en reposo o en movimiento." }, puntos_auto: { [Q(1)]: 2, [Q(2)]: 0, [Q(3)]: 3 }, puntos_manual: {} },
    { id: "en2", actividad_id: A1, estudiante_id: E(2), estado: "enviada", pendiente: false, intento: 1, enviada: hoy + "T09:42:00Z", puntaje: 9, puntaje_max: 10, comentario: null,
      respuestas: { [Q(1)]: 0, [Q(2)]: true, [Q(3)]: "10", [Q(4)]: "Resistencia al cambio de movimiento." }, puntos_auto: { [Q(1)]: 2, [Q(2)]: 1, [Q(3)]: 3 }, puntos_manual: { [Q(4)]: 3 } }],
  estudiantes_acceso: [{ estudiante_id: E(1), cuenta_id: C, activo: true, ultimos: "42", ultimo_acceso: hoy + "T09:30:00Z" }, { estudiante_id: E(2), cuenta_id: C, activo: true, ultimos: "17", ultimo_acceso: null }],
  evaluaciones: [
    { id: EV1, cuenta_id: C, grupo_id: G1, titulo: "Examen parcial", tipo: "examen", fecha: hoy, peso: 60, puntaje_max: 100, grupos: { nombre: "Matemática 9no" } },
    { id: EV2, cuenta_id: C, grupo_id: G1, titulo: "Tarea de ecuaciones", tipo: "tarea", fecha: hoy, peso: 40, puntaje_max: 20, rubrica_id: "rb1", grupos: { nombre: "Matemática 9no" } }],
  calificaciones: [{ id: "k1", evaluacion_id: EV1, estudiante_id: E(1), puntaje: 85, entregado: true, evaluaciones: { titulo: "Examen parcial", tipo: "examen", fecha: hoy, peso: 60, puntaje_max: 100, grupo_id: G1, grupos: { nombre: "Matemática 9no" } } }],
  asistencias: [{ fecha: hoy, estado: "ausente", estudiante_id: E(2), grupo_id: G1, nota: "Enfermo", grupos: { nombre: "Matemática 9no" }, estudiantes: { id: E(2), nombres: "Luis", apellidos: "Pérez", telefono: "88887777" } }],
  eventos: [{ id: "ev1", cuenta_id: C, titulo: "Reunión de padres", fecha: hoy, tipo: "reunion", hora_inicio: "17:00:00" }],
  notificaciones: [], observaciones: [{ id: "o1", texto: "Muy participativa", tipo: "academica", creado: hoy + "T10:00:00Z" }],
  cuentas: [{ id: C, nombre: "Clases de la Prof. Ana", codigo: "K7M2QP", moneda: "NIO", telefono: "8888-1111", email: "ana@ejemplo.com", terminos_version: "2026-11-05" }],
  suscripciones: [{ cuenta_id: C, plan_id: process.env.PLAN || "prof_premium", estado: process.env.ESTADO || "prueba", vence: "2026-12-01", dias_gracia: 5 }],
  pagos_suscripcion: [], miembros: [{ id: "m1", user_id: U, nombre: "Ana Martínez", rol: "propietario", activo: true, codigo_ultimos: "42" }, { id: "m2", nombre: "Asistente Uno", rol: "docente", activo: true }],
  grupo_docentes: [{ grupo_id: G1, miembro_id: "m2", miembros: { nombre: "Asistente Uno" }, grupos: { id: G1, nombre: "Matemática 9no", estado: "activo" } }], promociones: [],
  matriculas: [{ id: "mt1", cuenta_id: C, estudiante_id: E(1), curso_id: "c1", grupo_id: G1, fecha: hoy, estado: "activa", mensualidad: 800, descuento_pct: 10, beca: "Hermanos",
    estudiantes: { id: E(1), nombres: "Ana", apellidos: "López" }, cursos: { nombre: "Álgebra intensiva" }, grupos: { nombre: "Matemática 9no" } },
    { id: "mt2", cuenta_id: C, estudiante_id: E(2), curso_id: "c1", fecha: hoy, estado: "completada", mensualidad: 800, descuento_pct: 0, estudiantes: { id: E(2), nombres: "Luis", apellidos: "Pérez" }, cursos: { nombre: "Álgebra intensiva" }, grupos: null }],
  cargos: [{ id: "cg1", cuenta_id: C, estudiante_id: E(1), concepto: "Mensualidad octubre 2026 · Álgebra", tipo: "mensualidad", monto: 800, descuento: 80, pagado: 0, vence: "2026-10-05", estado: "pendiente" },
    { id: "cg2", cuenta_id: C, estudiante_id: E(2), concepto: "Matrícula · Álgebra", tipo: "matricula", monto: 500, descuento: 0, pagado: 200, vence: "2026-12-05", estado: "parcial" }],
  pagos: [{ id: "pg1", cuenta_id: C, estudiante_id: E(2), cargo_id: "cg2", monto: 200, metodo: "efectivo", fecha: hoy, recibo: 1, anulado: false, cargos: { concepto: "Matrícula · Álgebra" } }],
  certificados: [{ id: "ct1", cuenta_id: C, estudiante_id: E(2), curso_id: "c1", tipo: "certificado", titulo: "Álgebra intensiva", folio: "K7M2QP-26-ABC123", emitido: hoy, datos: { curso: "Álgebra intensiva", detalle: "Duración: 40 horas" }, anulado: false }],
};
// Datos del colegio (se usan cuando la modalidad simulada es "colegio")
const GR = "66666666-6666-6666-6666-666666666661", P1 = "77777777-7777-7777-7777-777777777771", P2 = "77777777-7777-7777-7777-777777777772";
const AS1 = "88888888-8888-8888-8888-888888888881", AS2 = "88888888-8888-8888-8888-888888888882";
const FC = {
  niveles: [{ id: "n1", cuenta_id: C, nombre: "Secundaria", orden: 1 }],
  grados: [{ id: GR, cuenta_id: C, nivel_id: "n1", nombre: "7mo grado", orden: 1, matricula: 1100, colegiatura: 1750 }],
  grupos: [{ id: G1, cuenta_id: C, nombre: "7mo A", grado_id: GR, estado: "activo", cupo: 30, turno: "matutino", aula_id: "au1" }],
  asignaturas: [{ id: AS1, cuenta_id: C, nombre: "Matemática", grado_id: GR, activo: true }, { id: AS2, cuenta_id: C, nombre: "Lengua y Literatura", grado_id: GR, activo: true }],
  periodos: [{ id: P1, cuenta_id: C, nombre: "I Corte", inicio: "2026-02-01", fin: "2026-04-10", orden: 1 }, { id: P2, cuenta_id: C, nombre: "IV Corte", inicio: "2026-09-15", fin: "2026-11-28", orden: 2 }],
  aulas: [{ id: "au1", cuenta_id: C, nombre: "Aula 101", capacidad: 32 }], sedes: [],
  grupo_docentes: [{ id: "gd1", grupo_id: G1, miembro_id: "m2", asignatura_id: AS1, es_guia: true, miembros: { nombre: "Asistente Uno" } }],
  miembros: [{ id: "m1", user_id: U, nombre: "Ana Martínez", rol: "director", activo: true }, { id: "m2", nombre: "Prof. Julio Herrera", rol: "docente", activo: true, especialidad: "Matemática" }, { id: "t1", nombre: "Mariana Pérez", rol: "tutor", activo: true }],
  horarios: [{ id: "h1", grupo_id: G1, asignatura_id: AS1, miembro_id: "m2", aula_id: "au1", dia, hora_inicio: "07:00:00", hora_fin: "07:45:00", grupos: { nombre: "7mo A", estado: "activo" } }],
  evaluaciones: [{ id: EV1, cuenta_id: C, grupo_id: G1, asignatura_id: AS1, periodo_id: P2, titulo: "Examen de corte", tipo: "examen", fecha: hoy, peso: 40, puntaje_max: 100 }],
  boletin_comentarios: [{ id: "bc1", estudiante_id: E(1), periodo_id: P2, conducta: "AA", comentario: "Muy responsable." }],
  comunicados: [{ id: "co1", cuenta_id: C, titulo: "Entrega de boletines", cuerpo: "El viernes a las 4:00 p. m.", audiencia: "tutores", publicado: hoy + "T10:00:00Z" }],
  tutores_estudiantes: [{ miembro_id: "t1", estudiante_id: E(1), parentesco: "Madre", estudiantes: { id: E(1), nombres: "Ana", apellidos: "López", codigo: "NE-001" }, miembros: { id: "t1", nombre: "Mariana Pérez", telefono: "8899", activo: true } }],
  cuentas: [{ id: C, nombre: "Colegio Nueva Esperanza", codigo: "DEMOCO", moneda: "NIO", config: { nota_minima: 60, escala_cualitativa: true, lema: "Educando con valores" }, terminos_version: "2026-11-05" }],
  asistencia_docentes: [],
};
const RPC = {
  d360_admin_impacto_plan: { actual: "Premium", nuevo: "Básico", direccion: "baja", precio_actual: 515, precio_nuevo: 149, gana: [], pierde: ["Exámenes y tareas en línea", "Asistente con su propio acceso", "Informes en PDF"],
    avisos: ["2 estudiantes con acceso en línea ya no podrán entrar a exámenes. Sus códigos, exámenes y notas se guardan y vuelven a funcionar si sube de plan.", "1 asistente(s) quedarán pausados (sin borrar nada) y se reactivan solos si vuelve a subir de plan."],
    uso: {}, limites: {} },
  d360_admin_cambiar_plan: {},
  d360_actividad_resultados: [
    { estudiante_id: E(1), nombre: "Ana López", acceso: true, intentos: 1, entrega: { id: "en1", estado: "enviada", puntaje: 6, puntaje_max: 10, pendiente: true, enviada: hoy + "T09:40:00Z", intento: 1 } },
    { estudiante_id: E(2), nombre: "Luis Pérez", acceso: true, intentos: 1, entrega: { id: "en2", estado: "enviada", puntaje: 9, puntaje_max: 10, pendiente: false, enviada: hoy + "T09:42:00Z", intento: 1 } },
    { estudiante_id: E(3), nombre: "María José Gutiérrez Castillo", acceso: false, intentos: 0, entrega: null },
  ],
  d360_actividad_publicar: "tarea20261",
  d360_alumnos_activar: [{ estudiante_id: E(3), nombre: "María José Gutiérrez Castillo", codigo: "583920" }],
  d360_alumno_ver: { ok: true, estado: "abierta", titulo: "Examen de cinemática", tipo: "examen", instrucciones: "Lee con calma. Tienes 30 minutos.", institucion: "Clases de la Prof. Ana", grupo: "Matemática 9no", abre: null, cierra: null, duracion_min: 30, intentos: 1, preguntas: 4, puntaje_max: 10 },
  d360_alumno_guardar: { ok: true, guardado: hoy },
  d360_alumno_enviar: { ok: true, resultado: { estado: "enviada", enviada: new Date().toISOString(), pendiente: true, puntaje: 6, puntaje_max: 10, mostrar_nota: true, intento: 1, intentos: 1, quedan: 0 } },
  d360_importar_estudiantes: { creados: 2, inscritos: 2, omitidos: [{ fila: 4, nombre: "Ya Existe", motivo: "Ya existe un estudiante con el mismo documento, código o nombre" }] },
  d360_aceptar_terminos: null,
  d360_guia: {}, d360_guia_guardar: {},
  d360_aula_salir: null,
  d360_instructores_liquidacion: { periodo: hoy.slice(0, 7), puede_pagar: true, sin_instructor: [{ fecha: hoy, grupo: "Excel básico" }], instructores: [
    { id: "m2", nombre: "Asistente Uno", telefono: "88887777", activo: true, forma: "hora", tarifa: 150, clases: 3, horas: 6, sin_horario: 1, calculado: 900, pagado: 400,
      detalle: [{ fecha: hoy, grupo: "Matemática 9no", horas: 2 }, { fecha: hoy, grupo: "Física sabatino", horas: null }], pagos: [{ id: "mvp1", fecha: hoy, monto: 400, nota: "Adelanto", detalle: { metodo: "efectivo" } }] },
    { id: "m3", nombre: "Instructora Fija", telefono: null, activo: true, forma: "fijo", tarifa: 8000, clases: 8, horas: 12, sin_horario: 0, calculado: 8000, pagado: 0, detalle: [], pagos: [] },
    { id: "m4", nombre: "Nuevo Instructor", telefono: null, activo: true, forma: null, tarifa: null, clases: 0, horas: 0, sin_horario: 0, calculado: null, pagado: 0, detalle: [], pagos: [] }] },
  d360_instructor_pagar: "mvp2",
  d360_crear_miembro: { miembro_id: "m9", codigo_personal: "482915" },
  d360_cobrar_varios: { pagos: [{ id: "pv1", recibo: 41, monto: 300, cargo_id: "cg1", concepto: "Matrícula · Álgebra", saldo: 0 }, { id: "pv2", recibo: 42, monto: 720, cargo_id: "cg2", concepto: "Mensualidad octubre 2026 · Álgebra", saldo: 0 }],
    total: 1020, fecha: hoy, metodo: "efectivo", referencia: null },
  d360_caja_dia: { fecha: hoy, cajero: null, total: 2000, recibos: 3, anulados: 100, por_metodo: { efectivo: 1700, transferencia: 300 },
    cajeros: [{ id: U, nombre: "Ana Martínez" }, { id: "u-cajera", nombre: "Cajera Rosa" }],
    pagos: [{ id: "p1", recibo: 41, hora: hoy + "T14:05:00Z", estudiante: "Ana López", estudiante_id: E(1), concepto: "Matrícula · Álgebra", metodo: "efectivo", monto: 500, anulado: false, cajero: U, cajero_nombre: "Ana Martínez" },
            { id: "p2", recibo: 42, hora: hoy + "T14:05:00Z", estudiante: "Ana López", estudiante_id: E(1), concepto: "Mensualidad noviembre · Álgebra", metodo: "efectivo", monto: 1200, anulado: false, cajero: U, cajero_nombre: "Ana Martínez" },
            { id: "p3", recibo: 43, hora: hoy + "T15:30:00Z", estudiante: "Luis Pérez", estudiante_id: E(2), concepto: "Mensualidad noviembre · Álgebra", metodo: "transferencia", referencia: "BAC-77", monto: 300, anulado: false, cajero: "u-cajera", cajero_nombre: "Cajera Rosa" },
            { id: "p4", recibo: 44, hora: hoy + "T16:00:00Z", estudiante: "Luis Pérez", estudiante_id: E(2), concepto: "Material", metodo: "efectivo", monto: 100, anulado: true, cajero: "u-cajera", cajero_nombre: "Cajera Rosa" }],
    cierres: [] },
  d360_caja_cerrar: { id: "k1", fecha: hoy, cajero: null, cajero_nombre: "Toda la caja", por_metodo: { efectivo: 1700, transferencia: 300 }, total: 2000, recibos: 3, anulados: 100,
    efectivo_contado: 1650, diferencia: -50, nota: null, cerrado_por_nombre: "Ana Martínez", creado: new Date().toISOString() },
  d360_ticket_guardar: { ruc: "J0310000000000", pie: "¡Gracias!" },
  d360_inscripcion_enlace: "abc1234567",
  d360_interesado_matricular: { matricula_id: "mtx", cargos: 4, estudiante_id: E(1) },
  d360_promover: { promovidos: 2, certificados: 2 },
  d360_recuperacion_marcar: null,
  d360_inscripcion_ver: { ok: true, institucion: "Academia Horizonte", mensaje: "¡La primera clase es gratis!", moneda: "NIO", telefono: "2222 3333", cursos: [
    { id: "c1", nombre: "Inglés A1", descripcion: "Conversación básica.", modalidad: "presencial", duracion_semanas: 12, mensualidad: 1200, matricula: 500,
      grupos: [{ id: "gx1", nombre: "A1 noche", horario: "Lun 18:00–19:30, Mié 18:00–19:30", inicio: "2027-01-10", lleno: false }, { id: "gx2", nombre: "A1 sábado", horario: "Sáb 08:00–11:00", lleno: true }] },
    { id: "c2", nombre: "Guitarra", descripcion: null, modalidad: "presencial", duracion_semanas: null, mensualidad: 900, matricula: 0, grupos: [] }] },
  d360_inscripcion_enviar: { ok: true },
  d360_finanzas_resumen: { cobrado: 1300, por_tipo: { mensualidad: 1000, clase: 300 }, otros_ingresos: 400, gastos: 450,
    gastos_por_categoria: [{ categoria: "Fotocopias e impresión", total: 250 }, { categoria: "Transporte", total: 200 }], ingresos_por_categoria: [{ categoria: "Talleres", total: 400 }] },
  d360_cobro_clase: { cargo_id: "cg-clase", pago_id: "pg-clase", recibo: "R-0009" },
  d360_cobros_generar: { creados: 3, ya_existian: 0 }, d360_banco_a_actividad: 2, d360_actividad_a_banco: 2,
  d360_alumno_archivos: { ok: true, archivos: [] },
  d360_aula_inicio: { ok: true, nombre: "Ana López", institucion: "Clases de la Prof. Ana", modalidad: "profesor", cuenta_activa: true,
    grupos: [{ id: G1, nombre: "Matemática 9no" }],
    actividades: [
      { token: "fisica2026", titulo: "Examen de cinemática", tipo: "examen", grupo: "Física sabatino", estado: "abierta", duracion_min: 30, entregada: false, en_curso: false },
      { token: "tareafoto1", titulo: "Ejercicios en el cuaderno", tipo: "tarea", grupo: "Matemática 9no", estado: "abierta", permite_archivos: true, entregada: false, en_curso: false },
      { token: "quiz00001", titulo: "Quiz de repaso", tipo: "examen", grupo: "Matemática 9no", estado: "cerrada", entregada: true, puntaje: 8, puntaje_max: 10, comentario: "¡Muy bien!" }],
    avisos: [{ texto: "Mañana hay examen de fracciones.", creado: hoy + "T14:00:00Z", grupo: "Matemática 9no" }],
    materiales: [{ id: "ma1", titulo: "Guía unidad 3", descripcion: "Resolver del 1 al 10", archivo: true, archivo_nombre: "guia.pdf", archivo_tipo: "application/pdf", creado: hoy + "T13:00:00Z", grupo: "Matemática 9no" },
                 { id: "ma2", titulo: "Video de repaso", url: "https://www.youtube.com/watch?v=x", archivo: false, creado: hoy + "T12:00:00Z", grupo: "Matemática 9no" }],
    notas: [{ grupo: "Matemática 9no", promedio: 85, evaluaciones: [{ titulo: "Examen parcial", tipo: "examen", fecha: hoy, puntaje: 85, puntaje_max: 100 },
      { titulo: "Exposición", tipo: "proyecto", fecha: hoy, puntaje: 7, puntaje_max: 8, rubrica: [{ criterio: "Dominio del tema", nivel: "Excelente", puntos: 4 }, { criterio: "Claridad", nivel: "Bueno", puntos: 3 }] }] }],
    cobros: [{ concepto: "Mensualidad noviembre 2026 · Matemática 9no", monto: 500, pagado: 0, vence: hoy, estado: "pendiente" }, { concepto: "Mensualidad octubre 2026 · Matemática 9no", monto: 500, pagado: 500, vence: "2026-10-05", estado: "pagado" }],
    asistencia: { presentes: 10, ausentes: 1, tardes: 1, justificados: 0, total: 12, porcentaje: 91.7, recientes: [{ fecha: hoy, estado: "ausente", grupo: "Matemática 9no" }] } },
  d360_alumno_portal: { ok: true, nombre: "Ana", institucion: "Clases de la Prof. Ana", cuenta_activa: true, actividades: [
    { token: "fisica2026", titulo: "Examen de cinemática", tipo: "examen", grupo: "Física sabatino", estado: "abierta", duracion_min: 30, entregada: false },
    { token: "tarea0001", titulo: "Tarea de fracciones", tipo: "tarea", grupo: "Matemática 9no", estado: "pronto", abre: new Date(Date.now() + 864e5).toISOString(), entregada: false },
    { token: "quiz00001", titulo: "Quiz de repaso", tipo: "examen", grupo: "Matemática 9no", estado: "cerrada", entregada: true, puntaje: 8, puntaje_max: 10, mostrar_nota: true }] },
  d360_mis_cuentas: [{ cuenta_id: C, nombre: "Clases de la Prof. Ana", modalidad: "profesor", codigo: "K7M2QP", rol: "propietario", miembro_id: "m1", miembro_nombre: "Ana Martínez",
    plan_id: "prof_premium", plan_nombre: "Premium", estado: "prueba", vence: "2026-12-01", dias_gracia: 5, operativa: true, funciones: planes[2].funciones, onboarding_completo: false, moneda: "NIO" }],
  d360_resumen_panel: { estudiantes_activos: 3, grupos_activos: 2, asistencia_30d: 91.5, evaluaciones_sin_nota: 1, docentes: 1 },
  d360_promedios_grupo: [{ estudiante_id: E(1), promedio: 85, calificadas: 1, total_evaluaciones: 2 }, { estudiante_id: E(2), promedio: 52, calificadas: 1, total_evaluaciones: 2 }, { estudiante_id: E(3), promedio: null, calificadas: 0, total_evaluaciones: 2 }],
  d360_resumen_asistencia: [{ estudiante_id: E(1), presentes: 10, ausentes: 1, tardes: 1, justificados: 0, total: 12, porcentaje: 91.7 }, { estudiante_id: E(2), presentes: 6, ausentes: 4, tardes: 0, justificados: 0, total: 10, porcentaje: 60 }],
  d360_marcar_acceso: null, d360_es_plataforma_admin: true,
  d360_carga_instructores: [{ miembro_id: "m2", nombre: "Asistente Uno", especialidad: "Matemática", activo: true, grupos: 1, estudiantes: 3, horas_semana: 1.5 }],
  d360_informe_operativo: { ingresos_mes: [{ mes: hoy.slice(0, 7), total: 200, pagos: 1 }], metodos: { efectivo: 200 }, matriculas_mes: [{ mes: hoy.slice(0, 7), nuevas: 2, retiradas: 0 }],
    cursos: [{ id: "c1", nombre: "Álgebra intensiva", activas: 1, total: 2, completadas: 1, retiradas: 0 }], morosos: [{ id: E(1), nombre: "Ana López", telefono: "8888", contacto_telefono: "7777", saldo: 720, desde: "2026-10-05", cobros: 1 }], por_vencer: 300 },
  d360_resumen_colegio: { periodo: { id: P2, nombre: "IV Corte" }, nota_minima: 60, estudiantes_activos: 3, matriculados_anio: 3, docentes: 2, personal: 1, familias: 1, niveles: 1, grados: 1, secciones: 1,
    asistencia_hoy: 92, asistencia_30d: 91, docentes_ausentes_hoy: 1, secciones_con_lista_hoy: 0, por_grado: [{ id: GR, nombre: "7mo grado", nivel: "Secundaria", secciones: 1, estudiantes: 3 }],
    ingresos_mes: 5000, pendiente_cobro: 3500, vencido_cobro: 1750, familias_morosas: 1, notas_registradas: 6, reprobados: 1, estudiantes_en_riesgo: 1, promedio_general: 78.5 },
  d360_notas_seccion: [{ estudiante_id: E(1), asignatura_id: AS1, promedio: 88, recuperacion: null, final: 88, evaluadas: 1, total: 1 }, { estudiante_id: E(2), asignatura_id: AS1, promedio: 44, recuperacion: 65, final: 65, evaluadas: 1, total: 1 },
    { estudiante_id: E(1), asignatura_id: AS2, promedio: 92, final: 92 }, { estudiante_id: E(3), asignatura_id: AS1, promedio: 52, final: 52 }],
  d360_verificar_certificado: { valido: true, folio: "K7M2QP-26-ABC123", titulo: "Álgebra intensiva", estudiante: "Luis Pérez", institucion: "Academia Prueba", emitido: hoy, tipo: "certificado" },
  d360_admin_metricas: { cuentas: 1, por_modalidad: { profesor: 1 }, por_estado: { prueba: 1 }, mrr_usd: 0, ingresos_mes: {}, ingresos_12m: [] },
  d360_admin_cuentas: [{ cuenta_id: C, nombre: "Clases de la Prof. Ana", modalidad: "profesor", codigo: "K7M2QP", propietario_email: "ana@ejemplo.com", plan_id: "prof_premium", plan_nombre: "Premium", estado: "prueba", vence: "2026-12-01", dias_gracia: 5, estudiantes: 3, miembros: 2, creado: hoy }],
  d360_admin_codigos: [
    { id: "k1", codigo: "D360-AB12-CD34", modalidad: "colegio", plan_id: "col_avanzado", plan_nombre: "Avanzado", usos_max: 1, usos: 0, vence: "2026-12-31", activo: true, nota: "Colegio San José", creado: hoy, estado: "disponible", cuentas: [] },
    { id: "k2", codigo: "D360-XY98-ZW76", modalidad: null, plan_id: null, plan_nombre: null, usos_max: 1, usos: 1, vence: null, activo: true, nota: null, creado: hoy, estado: "usado", cuentas: [{ id: C, nombre: "Clases de la Prof. Ana", creado: hoy }] }],
  d360_admin_crear_codigo: { id: "k3", codigo: "D360-NUEV-O001" },
  d360_admin_actividad: [{ id: 1, creado: hoy + "T10:00:00Z", cuenta: "Clases de la Prof. Ana", accion: "acceso_codigo", entidad: "miembros", usuario: "Ana", detalle: { origen: "1.2.3.4" } }],
};

export const registro = { enviado: null };   // lo último que el registro mandó al servidor
const sesion = { access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, user: { id: U, email: "ana@ejemplo.com", aud: "authenticated", role: "authenticated" } };

export async function preparar(page, conSesion, modalidad = "profesor", rol = process.env.ROL || "propietario") {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/supabase\.co/, async (route) => {
    const u = new URL(route.request().url());
    const single = (route.request().headers()["accept"] || "").includes("vnd.pgrst.object");
    let body = null;
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = u.pathname.split("/").pop();
      body = RPC[fn] ?? null;
      if (fn === "d360_alumno_entrar") {
        const d = JSON.parse(route.request().postData() || "{}");
        body = d.p_codigo === "123456"
          ? { ok: true, nombre: "Ana", sesion: "s".repeat(48), intento: 1, intentos: 1, limite: new Date(Date.now() + 30 * 60000).toISOString(), ahora: new Date().toISOString(),
              respuestas: {}, preguntas: sinCorrecta, titulo: "Examen de cinemática", instrucciones: "Lee con calma. Tienes 30 minutos." }
          : { ok: false, motivo: "codigo" };
      }
      if (fn === "d360_aula_entrar") {
        const d = JSON.parse(route.request().postData() || "{}");
        body = String(d.p_espacio).toUpperCase() === "K7M2QP" && d.p_codigo === "123456" ? { ok: true, sesion: "a".repeat(48) } : { ok: false, motivo: "codigo" };
      }
      if (fn === "d360_aula_actividad") {
        const d = JSON.parse(route.request().postData() || "{}");
        body = { ok: true, nombre: "Ana", sesion: "e".repeat(48), intento: 1, intentos: 1, limite: null, ahora: new Date().toISOString(), respuestas: {},
          preguntas: d.p_token === "tareafoto1" ? [] : sinCorrecta, titulo: "Actividad", instrucciones: null, permite_archivos: d.p_token === "tareafoto1", archivos: [] };
      }
      if (fn === "d360_alumno_ver") {
        const d = JSON.parse(route.request().postData() || "{}");
        if (d.p_token === "tareafoto1") body = { ...body, titulo: "Ejercicios en el cuaderno", tipo: "tarea", preguntas: 0, duracion_min: null, permite_archivos: true, puntos_archivo: 10, puntaje_max: 10 };
      }
      if (fn === "d360_alumno_portal") {
        const d = JSON.parse(route.request().postData() || "{}");
        if (!(String(d.p_espacio).toUpperCase() === "K7M2QP" && d.p_codigo === "123456")) body = { ok: false, motivo: "codigo" };
      }
      if (fn === "d360_alumno_enviar") registro.alumno = JSON.parse(route.request().postData() || "{}").p_respuestas;
      if (fn === "d360_validar_codigo_registro") {
        const cod = (JSON.parse(route.request().postData() || "{}").p_codigo || "").toUpperCase();
        body = cod === "D360-PRUE-BA01" ? { ok: true, requiere: true, codigo: cod, modalidad: "profesor", plan: "prof_basico", meses_pagados: 1 } : { ok: false, motivo: "usado" };
      }
      // PLAN=prof_basico|prof_profesional|prof_premium y ESTADO=activa|pendiente|vencida simulan el plan del profesor
      const planSim = modalidad === "profesor" && process.env.PLAN ? planes.find((p) => p.id === process.env.PLAN) : null;
      if (fn === "d360_mis_cuentas") body = body.map((c) => ({ ...c, modalidad, rol, miembro_id: process.env.MIEMBRO || c.miembro_id,
        ...(planSim ? { plan_id: planSim.id, plan_nombre: planSim.nombre } : {}),
        ...(process.env.DEMO ? { es_demo: true } : {}),
        ...(process.env.ESTADO ? { estado: process.env.ESTADO, operativa: !["pendiente", "vencida", "suspendida"].includes(process.env.ESTADO) } : {}), nombre: modalidad === "academia" ? "Academia Horizonte" : c.nombre,
        plan_nombre: modalidad === "academia" ? "Profesional" : (planSim?.nombre ?? c.plan_nombre),
        funciones: modalidad === "colegio" ? { finanzas: true, certificados: true, exportar: true, reportes_pdf: true, comunicados: true, portal_familias: true, boletines: true, sedes: true } : modalidad === "academia" ? { finanzas: true, certificados: true, exportar: true, reportes_pdf: true, comunicados: true, tareas: true, rubricas: true, portal_estudiantes: true, banco_preguntas: true, portal_familias: process.env.SIN_FAMILIAS ? false : true, reporte_whatsapp: true } : (planSim?.funciones ?? c.funciones) }));
    }
    else if (u.pathname.startsWith("/rest/v1/")) {
      const t = u.pathname.split("/").pop();
      body = route.request().method() === "GET" ? ((modalidad === "colegio" && FC[t]) || F[t] || []) : [];
      // Un pago nuevo vuelve con su número de recibo (como lo hace el servidor)
      if (t === "pagos" && route.request().method() === "POST") {
        const d = JSON.parse(route.request().postData() || "{}");
        body = [{ ...(Array.isArray(d) ? d[0] : d), id: "pnuevo", recibo: 45, anulado: false, creado: new Date().toISOString() }];
      }
      // Aplica filtros simples col=eq.valor (como PostgREST)
      for (const [k, v] of u.searchParams) if (v.startsWith("eq.") && Array.isArray(body) && body.some((x) => k in x)) body = body.filter((x) => String(x[k]) === v.slice(3));
      if (single) body = body[0] ?? null;
    } else if (u.pathname === "/functions/v1/aula-archivos") {
      const d = JSON.parse(route.request().postData() || "{}");
      registro.archivos = (registro.archivos || []).concat([d]);
      body = d.accion === "subir" ? { id: "f" + Date.now(), path: C + "/entregas/x/" + Date.now() + ".jpg", token: "tok" } : d.accion === "ver" ? { url: "https://ejemplo.invalid/archivo" } : { ok: true };
    } else if (u.pathname.startsWith("/storage/v1/")) {
      registro.storage = (registro.storage || []).concat([u.pathname]);
      body = u.pathname.includes("/object/sign/") ? { signedURL: "/object/sign/x?token=t" } : { Key: "d360/x", path: "x" };
    } else if (u.pathname === "/functions/v1/registro-codigo") {
      const datos = JSON.parse(route.request().postData() || "{}");
      registro.enviado = datos;
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: U, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.firma`;
      body = { cuenta: { cuenta_id: C, codigo_institucion: "K7M2QP", codigo_personal: "482915", estado: "activa", vence: "2026-12-11", plan_nombre: "Básico", dias_prueba: 0 }, sesion: { access_token: jwt, refresh_token: "r" } };
    } else if (u.pathname === "/auth/v1/user") body = sesion.user;
    else if (u.pathname.startsWith("/auth/v1/")) body = {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  if (conSesion) await page.addInitScript((s) => localStorage.setItem("d360-sesion", JSON.stringify(s)), sesion);
}


export { hoy, U, C, G1, G2, E, EV1, EV2, planes, sesion, A1, A2, Q };
