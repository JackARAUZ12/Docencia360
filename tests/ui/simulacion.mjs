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
  { id: "prof_basico", modalidad: "profesor", nombre: "Básico", orden: 1, resumen: "Para empezar", precio_usd: 4, precio_nio: 149, max_estudiantes: null, max_estudiantes_portal: 0, max_docentes: 0, max_grupos: 4, max_admins: 0, almacenamiento_mb: 200, funciones: { tareas: true, exportar: false, asistentes: false, calendario: true, reportes_pdf: false, portal_estudiantes: false }, activo: true },
  { id: "prof_profesional", modalidad: "profesor", nombre: "Profesional", orden: 2, resumen: "Varios grupos", precio_usd: 8, precio_nio: 295, max_estudiantes: null, max_estudiantes_portal: 250, max_docentes: 0, max_grupos: 15, max_admins: 0, almacenamiento_mb: 1024, funciones: { tareas: true, exportar: true, asistentes: false, calendario: true, reportes_pdf: true, portal_estudiantes: true }, activo: true },
  { id: "prof_premium", modalidad: "profesor", nombre: "Premium", orden: 3, resumen: "Con asistente", precio_usd: 14, precio_nio: 515, max_estudiantes: null, max_estudiantes_portal: 600, max_docentes: 1, max_grupos: null, max_admins: 0, almacenamiento_mb: 3072, funciones: { tareas: true, exportar: true, asistentes: true, calendario: true, reportes_pdf: true, portal_estudiantes: true }, activo: true },
  { id: "col_avanzado", modalidad: "colegio", nombre: "Avanzado", orden: 2, resumen: "Colegios", precio_usd: 99, precio_nio: 3625, max_estudiantes: 1200, max_docentes: 80, max_grupos: null, max_admins: 10, almacenamiento_mb: 51200, funciones: {}, activo: true },
];
const grupos = [
  { id: G1, cuenta_id: C, nombre: "Matemática 9no", estado: "activo", cupo: 10, asignatura_id: "a1", asignaturas: { nombre: "Matemática" }, cursos: null, fecha_inicio: "2026-02-01" },
  { id: G2, cuenta_id: C, nombre: "Física sabatino", estado: "activo", asignatura_id: null, asignaturas: null, cursos: null },
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
  planes, config_global: [{ clave: "publico.dias_prueba", valor: 14 }, { clave: "publico.inactividad_minutos", valor: 60 }, { clave: "publico.tipo_cambio", valor: 36.62, descripcion: "Tipo de cambio", actualizado: hoy }, { clave: "publico.terminos_version", valor: "2026-11-05" }, { clave: "publico.registro_con_codigo", valor: true }],
  grupos, asignaturas: [{ id: "a1", cuenta_id: C, nombre: "Matemática", activo: true }], cursos: [{ id: "c1", cuenta_id: C, nombre: "Álgebra intensiva", mensualidad: 800, duracion_semanas: 8, modalidad_clase: "presencial", activo: true }],
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
    { id: EV2, cuenta_id: C, grupo_id: G1, titulo: "Tarea de ecuaciones", tipo: "tarea", fecha: hoy, peso: 40, puntaje_max: 20, grupos: { nombre: "Matemática 9no" } }],
  calificaciones: [{ id: "k1", evaluacion_id: EV1, estudiante_id: E(1), puntaje: 85, entregado: true, evaluaciones: { titulo: "Examen parcial", tipo: "examen", fecha: hoy, peso: 60, puntaje_max: 100, grupo_id: G1, grupos: { nombre: "Matemática 9no" } } }],
  asistencias: [{ fecha: hoy, estado: "ausente", estudiante_id: E(2), grupo_id: G1, nota: "Enfermo", grupos: { nombre: "Matemática 9no" } }],
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
      if (fn === "d360_alumno_enviar") registro.alumno = JSON.parse(route.request().postData() || "{}").p_respuestas;
      if (fn === "d360_validar_codigo_registro") {
        const cod = (JSON.parse(route.request().postData() || "{}").p_codigo || "").toUpperCase();
        body = cod === "D360-PRUE-BA01" ? { ok: true, requiere: true, codigo: cod, modalidad: "profesor", plan: "prof_basico", meses_pagados: 1 } : { ok: false, motivo: "usado" };
      }
      // PLAN=prof_basico|prof_profesional|prof_premium y ESTADO=activa|pendiente|vencida simulan el plan del profesor
      const planSim = modalidad === "profesor" && process.env.PLAN ? planes.find((p) => p.id === process.env.PLAN) : null;
      if (fn === "d360_mis_cuentas") body = body.map((c) => ({ ...c, modalidad, rol,
        ...(planSim ? { plan_id: planSim.id, plan_nombre: planSim.nombre } : {}),
        ...(process.env.ESTADO ? { estado: process.env.ESTADO, operativa: !["pendiente", "vencida", "suspendida"].includes(process.env.ESTADO) } : {}), nombre: modalidad === "academia" ? "Academia Horizonte" : c.nombre,
        plan_nombre: modalidad === "academia" ? "Profesional" : (planSim?.nombre ?? c.plan_nombre),
        funciones: modalidad === "colegio" ? { finanzas: true, certificados: true, exportar: true, reportes_pdf: true, comunicados: true, portal_familias: true, boletines: true, sedes: true } : modalidad === "academia" ? { finanzas: true, certificados: true, exportar: true, reportes_pdf: true, comunicados: true, tareas: true } : (planSim?.funciones ?? c.funciones) }));
    }
    else if (u.pathname.startsWith("/rest/v1/")) {
      const t = u.pathname.split("/").pop();
      body = route.request().method() === "GET" ? ((modalidad === "colegio" && FC[t]) || F[t] || []) : [];
      // Aplica filtros simples col=eq.valor (como PostgREST)
      for (const [k, v] of u.searchParams) if (v.startsWith("eq.") && Array.isArray(body) && body.some((x) => k in x)) body = body.filter((x) => String(x[k]) === v.slice(3));
      if (single) body = body[0] ?? null;
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
