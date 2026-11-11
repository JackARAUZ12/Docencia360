// Prueba de humo de la interfaz: abre cada pantalla en teléfono y computadora
// con respuestas simuladas de Supabase y reporta errores de JavaScript.
// Uso: node tests/ui/prueba-interfaz.mjs  (requiere servidor estático en :8080)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:8080";
const OUT = process.env.OUT || "tests/ui/capturas";
fs.mkdirSync(OUT, { recursive: true });
const hoy = new Date().toISOString().slice(0, 10);
const U = "11111111-1111-1111-1111-111111111111", C = "22222222-2222-2222-2222-222222222222";
const G1 = "33333333-3333-3333-3333-333333333331", G2 = "33333333-3333-3333-3333-333333333332";
const E = (n) => `44444444-4444-4444-4444-44444444444${n}`;
const EV1 = "55555555-5555-5555-5555-555555555551", EV2 = "55555555-5555-5555-5555-555555555552";
const est = [["Ana", "López"], ["Luis", "Pérez"], ["María José", "Gutiérrez Castillo"], ["Carlos", "Ruiz"]].map(([n, a], i) => ({
  id: E(i + 1), cuenta_id: C, nombres: n, apellidos: a, estado: i === 3 ? "retirado" : "activo", telefono: "8888-000" + i,
  contacto_nombre: "Responsable " + i, contacto_telefono: "7777-000" + i, creado: hoy + "T10:00:00Z", fecha_nacimiento: "2010-05-0" + (i + 1) }));
const planes = [
  { id: "prof_basico", modalidad: "profesor", nombre: "Básico", orden: 1, resumen: "Para empezar", precio_usd: 4, precio_nio: 149, max_estudiantes: 30, max_docentes: 0, max_grupos: 4, max_admins: 0, almacenamiento_mb: 200, funciones: { tareas: true }, activo: true },
  { id: "prof_profesional", modalidad: "profesor", nombre: "Profesional", orden: 2, resumen: "Varios grupos", precio_usd: 8, precio_nio: 295, max_estudiantes: 120, max_docentes: 0, max_grupos: 15, max_admins: 0, almacenamiento_mb: 1024, funciones: { tareas: true, reportes_pdf: true, exportar: true }, activo: true },
  { id: "prof_premium", modalidad: "profesor", nombre: "Premium", orden: 3, resumen: "Con asistente", precio_usd: 14, precio_nio: 515, max_estudiantes: 400, max_docentes: 1, max_grupos: null, max_admins: 0, almacenamiento_mb: 3072, funciones: { tareas: true, reportes_pdf: true, exportar: true, asistentes: true }, activo: true },
  { id: "col_avanzado", modalidad: "colegio", nombre: "Avanzado", orden: 2, resumen: "Colegios", precio_usd: 99, precio_nio: 3625, max_estudiantes: 1200, max_docentes: 80, max_grupos: null, max_admins: 10, almacenamiento_mb: 51200, funciones: {}, activo: true },
];
const grupos = [
  { id: G1, cuenta_id: C, nombre: "Matemática 9no", estado: "activo", cupo: 10, asignatura_id: "a1", asignaturas: { nombre: "Matemática" }, cursos: null, fecha_inicio: "2026-02-01" },
  { id: G2, cuenta_id: C, nombre: "Física sabatino", estado: "activo", asignatura_id: null, asignaturas: null, cursos: null },
];
const dia = ((new Date().getDay() + 6) % 7) + 1;
const F = {
  planes, config_global: [{ clave: "publico.dias_prueba", valor: 14 }, { clave: "publico.inactividad_minutos", valor: 60 }, { clave: "publico.tipo_cambio", valor: 36.62, descripcion: "Tipo de cambio", actualizado: hoy }, { clave: "publico.terminos_version", valor: "2026-11-05" }, { clave: "publico.registro_con_codigo", valor: true }],
  grupos, asignaturas: [{ id: "a1", cuenta_id: C, nombre: "Matemática", activo: true }], cursos: [{ id: "c1", cuenta_id: C, nombre: "Álgebra intensiva", mensualidad: 800, duracion_semanas: 8, modalidad_clase: "presencial", activo: true }],
  estudiantes: est,
  grupo_estudiantes: est.slice(0, 3).map((e) => ({ grupo_id: G1, estudiante_id: e.id, cuenta_id: C, estado: "activo", desde: "2026-02-01", estudiantes: e, grupos: { id: G1, nombre: "Matemática 9no", estado: "activo" } })),
  horarios: [{ id: "h1", dia, hora_inicio: "08:00:00", hora_fin: "09:30:00", grupo_id: G1, grupos: { nombre: "Matemática 9no", estado: "activo" } }],
  evaluaciones: [
    { id: EV1, cuenta_id: C, grupo_id: G1, titulo: "Examen parcial", tipo: "examen", fecha: hoy, peso: 60, puntaje_max: 100, grupos: { nombre: "Matemática 9no" } },
    { id: EV2, cuenta_id: C, grupo_id: G1, titulo: "Tarea de ecuaciones", tipo: "tarea", fecha: hoy, peso: 40, puntaje_max: 20, grupos: { nombre: "Matemática 9no" } }],
  calificaciones: [{ id: "k1", evaluacion_id: EV1, estudiante_id: E(1), puntaje: 85, entregado: true, evaluaciones: { titulo: "Examen parcial", tipo: "examen", fecha: hoy, peso: 60, puntaje_max: 100, grupo_id: G1, grupos: { nombre: "Matemática 9no" } } }],
  asistencias: [{ fecha: hoy, estado: "ausente", estudiante_id: E(2), grupo_id: G1, nota: "Enfermo", grupos: { nombre: "Matemática 9no" } }],
  eventos: [{ id: "ev1", cuenta_id: C, titulo: "Reunión de padres", fecha: hoy, tipo: "reunion", hora_inicio: "17:00:00" }],
  notificaciones: [], observaciones: [{ id: "o1", texto: "Muy participativa", tipo: "academica", creado: hoy + "T10:00:00Z" }],
  cuentas: [{ id: C, nombre: "Clases de la Prof. Ana", codigo: "K7M2QP", moneda: "NIO", telefono: "8888-1111", email: "ana@ejemplo.com", terminos_version: "2026-11-05" }],
  suscripciones: [{ cuenta_id: C, plan_id: "prof_premium", estado: "prueba", vence: "2026-12-01", dias_gracia: 5 }],
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

let registroEnviado = null;
const sesion = { access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, user: { id: U, email: "ana@ejemplo.com", aud: "authenticated", role: "authenticated" } };

async function preparar(page, conSesion, modalidad = "profesor", rol = "propietario") {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route(/supabase\.co/, async (route) => {
    const u = new URL(route.request().url());
    const single = (route.request().headers()["accept"] || "").includes("vnd.pgrst.object");
    let body = null;
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = u.pathname.split("/").pop();
      body = RPC[fn] ?? null;
      if (fn === "d360_validar_codigo_registro") {
        const cod = (JSON.parse(route.request().postData() || "{}").p_codigo || "").toUpperCase();
        body = cod === "D360-PRUE-BA01" ? { ok: true, requiere: true, codigo: cod, modalidad: "profesor", plan: "prof_basico" } : { ok: false, motivo: "usado" };
      }
      if (fn === "d360_mis_cuentas") body = body.map((c) => ({ ...c, modalidad, rol, nombre: modalidad === "academia" ? "Academia Horizonte" : c.nombre,
        plan_nombre: modalidad === "academia" ? "Profesional" : c.plan_nombre,
        funciones: modalidad === "colegio" ? { finanzas: true, certificados: true, exportar: true, reportes_pdf: true, comunicados: true, portal_familias: true, boletines: true, sedes: true } : modalidad === "academia" ? { finanzas: true, certificados: true, exportar: true, reportes_pdf: true, comunicados: true, tareas: true } : c.funciones }));
    }
    else if (u.pathname.startsWith("/rest/v1/")) {
      const t = u.pathname.split("/").pop();
      body = route.request().method() === "GET" ? ((modalidad === "colegio" && FC[t]) || F[t] || []) : [];
      // Aplica filtros simples col=eq.valor (como PostgREST)
      for (const [k, v] of u.searchParams) if (v.startsWith("eq.") && Array.isArray(body) && body.some((x) => k in x)) body = body.filter((x) => String(x[k]) === v.slice(3));
      if (single) body = body[0] ?? null;
    } else if (u.pathname === "/functions/v1/registro-codigo") {
      const datos = JSON.parse(route.request().postData() || "{}");
      registroEnviado = datos;
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: U, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.firma`;
      body = { cuenta: { cuenta_id: C, codigo_institucion: "K7M2QP", codigo_personal: "482915", estado: "pendiente", dias_prueba: 0 }, sesion: { access_token: jwt, refresh_token: "r" } };
    } else if (u.pathname === "/auth/v1/user") body = sesion.user;
    else if (u.pathname.startsWith("/auth/v1/")) body = {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  if (conSesion) await page.addInitScript((s) => localStorage.setItem("d360-sesion", JSON.stringify(s)), sesion);
}

const errores = [];
const ACAD = ["inicio", "estudiantes", `estudiantes/${E(1)}`, "cursos", "grupos", `grupos/${G1}`, "instructores", "asistencia", "calificaciones", "tareas", "calendario", "matriculas", "finanzas", "finanzas?vista=pagos", "certificados", "informes", "informes?tipo=matriculas", "informes?tipo=academico", "equipo", "cuenta"];
const COL = ["inicio", "estructura", "estructura?vista=plan", "estructura?vista=docentes", "estructura?vista=aulas", "institucion", "estudiantes", `estudiantes/${E(1)}`, "matriculas", "docentes", "docentes?vista=asistencia", "horarios", "asistencia", "calificaciones", "calificaciones?vista=cuadro", "boletines", "boletines?vista=comentarios", "familias", "comunicados", "informes", "informes?tipo=asistencia", "informes?tipo=matricula", "informes?tipo=finanzas", "finanzas", "certificados", "equipo", "cuenta"];
const PANTALLAS = [
  ...COL.map((r) => [`colegio-${r.replace(/[/?=]/g, "_").slice(0, 40)}`, `/app/colegio.html#/${r}`, true, "colegio", "director"]),
  ...["inicio", "calificaciones", "boletines", "horarios"].map((r) => [`colegio-docente-${r}`, `/app/colegio.html#/${r}`, true, "colegio", "docente"]),
  ...["inicio", "notas", "asistencia", "avisos", "pagos"].map((r) => [`familias-${r}`, `/app/familias.html#/${r}`, true, "colegio", "tutor"]),
  ...ACAD.map((r) => [`academia-${r.replace(/[/?=]/g, "_").slice(0, 40)}`, `/app/academia.html#/${r}`, true, "academia", "propietario"]),
  ...["inicio", "finanzas", "matriculas", "informes"].map((r) => [`academia-finanzas-${r}`, `/app/academia.html#/${r}`, true, "academia", "finanzas"]),
  ...["inicio", "grupos", "asistencia", "calificaciones"].map((r) => [`academia-instructor-${r}`, `/app/academia.html#/${r}`, true, "academia", "docente"]),
  ["verificar", "/verificar.html?folio=K7M2QP-26-ABC123", false],
  ["index", "/index.html", false], ["terminos", "/terminos.html", false], ["privacidad", "/privacidad.html", false], ["entrar", "/entrar.html", false], ["admin-entrar", "/admin/entrar.html", false], ["registro", "/registro.html?modalidad=profesor", false],
  ...["inicio", "asistencia", "calificaciones", "estudiantes", `estudiantes/${E(1)}`, "grupos", `grupos/${G1}`, "tareas", "cursos", "calendario", "informes", `informes?estudiante=${E(1)}`, "cuenta", "mas"]
    .map((r) => [`profesor-${r.replace(/[/?=]/g, "_").slice(0, 40)}`, `/app/profesor.html#/${r}`, true]),
  ...["resumen", "cuentas", "codigos", "planes", "promociones", "actividad", "parametros"].map((r) => [`admin-${r}`, `/admin/index.html#/${r}`, true]),
];
const browser = await chromium.launch();
const VISTAS = process.env.ANCHOS ? process.env.ANCHOS.split(",").map((x) => { const [w, hh, t] = x.split(/[x:]/); return [Number(w), Number(hh), t]; })
  : [[390, 844, "movil"], [1366, 900, "pc"]];
for (const [ancho, alto, tag] of VISTAS) {
  const ctxB = await browser.newContext({ viewport: { width: ancho, height: alto } });
  for (const [nombre, url, conSesion, modalidad, rol] of PANTALLAS.filter(([n]) => !process.env.SOLO || process.env.SOLO.split(",").some((x) => n.startsWith(x)))) {
    const page = await ctxB.newPage();
    page.on("pageerror", (e) => errores.push(`${tag} ${nombre}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" && !/fonts|favicon|ERR_|Failed to load resource/.test(m.text())) errores.push(`${tag} ${nombre} console: ${m.text()}`); });
    await preparar(page, conSesion, modalidad, rol);
    await page.goto(BASE + url, { waitUntil: "load", timeout: 20000 }).catch((e) => errores.push(`${tag} ${nombre}: ${e.message}`));
    await page.waitForTimeout(900);
    const alerta = await page.locator(".aviso.mal").first().textContent().catch(() => null);
    if (alerta && !/vencido|reprobadas/.test(alerta)) errores.push(`${tag} ${nombre} muestra error: ${alerta.slice(0, 160)}`);
    const anchoDoc = await page.evaluate(() => document.documentElement.scrollWidth);
    if (anchoDoc > ancho + 1) errores.push(`${tag} ${nombre}: desborde horizontal (${anchoDoc}px)`);
    await page.screenshot({ path: `${OUT}/${tag}-${nombre}.png`, fullPage: true, timeout: 5000 }).catch(() => {});
    await page.close();
  }
  await ctxB.close();
}
// Registro con código de acceso: sin código no avanza; con código salta a «Tus datos» con el plan del código
{
  const ctxB = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`registro-codigo: ${e.message}`));
  await preparar(page, false);
  await page.goto(BASE + "/registro.html", { waitUntil: "load" });
  await page.waitForSelector("input.codigo-acceso", { timeout: 8000 }).catch(() => errores.push("registro-codigo: no pide el código de acceso"));
  await page.locator("input.codigo-acceso").fill("D360-USAD-O999");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForTimeout(400);
  if (!/ya fue utilizado/.test(await page.locator("#aviso").innerText())) errores.push("registro-codigo: no avisa del código usado");
  await page.screenshot({ path: `${OUT}/registro-codigo-error.png`, fullPage: true });
  await page.locator("input.codigo-acceso").fill("d360-prue-ba01");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForTimeout(400);
  const txt = await page.locator("body").innerText();
  if (!/Tus datos/.test(txt) || !/D360-PRUE-BA01/.test(txt) || !/Básico/.test(txt)) errores.push("registro-codigo: con código bueno no pasa a «Tus datos» con su plan: " + txt.slice(0, 300));
  await page.screenshot({ path: `${OUT}/registro-codigo-datos.png`, fullPage: true });
  // Completar datos: entra directo, sin «Revisa tu correo»
  await page.locator("input[name=tu_nombre]").fill("Marta Ruiz");
  await page.locator("input[name=nombre]").fill("Clases de Marta");
  await page.locator("input[name=email]").fill("marta@ejemplo.com");
  await page.locator("input[name=clave]").fill("clave-segura-1");
  await page.locator("input[name=acepto]").check();
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await page.waitForTimeout(800);
  const fin = await page.locator("body").innerText();
  if (/Revisa tu correo/.test(fin) || !/Tu cuenta está creada/.test(fin) || !/482915/.test(fin)) errores.push("registro-codigo: no entra directo tras crear la cuenta: " + fin.slice(0, 300));
  if (registroEnviado?.codigo !== "D360-PRUE-BA01" || registroEnviado?.plan !== "prof_basico" || registroEnviado?.email !== "marta@ejemplo.com") errores.push("registro-codigo: datos enviados al servidor incorrectos: " + JSON.stringify(registroEnviado));
  await page.screenshot({ path: `${OUT}/registro-codigo-creada.png`, fullPage: true });
  await page.evaluate(() => localStorage.clear());   // volver a empezar sin la sesión recién abierta
  await page.goto(BASE + "/registro.html", { waitUntil: "load" });
  await page.locator("input.codigo-acceso").fill("D360-PRUE-BA01");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Atrás" }).click();
  if (!(await page.locator("input.codigo-acceso").count())) errores.push("registro-codigo: «Atrás» no vuelve al código cuando el código fija tipo y plan");
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 361) errores.push(`registro-codigo: desborde horizontal (${ancho}px)`);
  // Panel maestro: generar un código y ver cómo compartirlo
  const adm = await ctxB.newPage();
  adm.on("pageerror", (e) => errores.push(`admin-codigos: ${e.message}`));
  await preparar(adm, true);
  await adm.goto(BASE + "/admin/index.html#/codigos", { waitUntil: "load" });
  await adm.getByRole("button", { name: "Generar código" }).first().click();
  await adm.locator("dialog [name=usos]").fill("1");
  await adm.locator("dialog").getByRole("button", { name: "Generar código" }).click();
  await adm.waitForTimeout(600);
  const dlg = await adm.locator("dialog").last().innerText().catch(() => "");
  if (!/D360-NUEV-O001/.test(dlg) || !/Enviar por WhatsApp/.test(dlg)) errores.push("admin-codigos: no muestra el código generado para compartir: " + dlg.slice(0, 200));
  await adm.screenshot({ path: `${OUT}/admin-codigo-generado.png`, fullPage: false });
  const anchoA = await adm.evaluate(() => document.documentElement.scrollWidth);
  if (anchoA > 361) errores.push(`admin-codigos: desborde horizontal (${anchoA}px)`);
  await ctxB.close();
}
// Flujo de importación (profesor): elegir CSV, revisar, importar y ver el resultado
{
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`importar: ${e.message}`));
  await preparar(page, true, "profesor", "propietario");
  await page.goto(BASE + "/app/profesor.html#/estudiantes", { waitUntil: "load" });
  await page.getByRole("button", { name: "Importar Excel" }).click();
  const csv = "Nombre completo;Fecha de nacimiento;Sexo\r\nAna María López Pérez;04/03/2013;F\r\nLuis Mora;31/02/2012;M\r\n;;\r\nYa Existe;;\r\n";
  await page.locator("dialog input[type=file]").setInputFiles({ name: "lista.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.waitForTimeout(400);
  const txt = await page.locator("dialog").innerText();
  if (!/3 listos para importar/.test(txt)) errores.push("importar: no reconoce las filas: " + txt.slice(0, 300));
  if (!/fecha no reconocida/.test(txt)) errores.push("importar: no avisa la fecha inválida");
  await page.screenshot({ path: `${OUT}/movil-importar-revision.png`, fullPage: true });
  await page.getByRole("button", { name: /Importar 3 estudiantes/ }).click();
  await page.waitForTimeout(500);
  const fin = await page.locator("dialog").innerText();
  if (!/2 estudiantes importados/.test(fin) || !/Filas omitidas/.test(fin)) errores.push("importar: resultado incorrecto: " + fin.slice(0, 300));
  await page.screenshot({ path: `${OUT}/movil-importar-resultado.png`, fullPage: true });
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 391) errores.push(`importar: desborde horizontal (${ancho}px)`);
  await ctxB.close();
}
// Ciclo del profesor en el teléfono: calificar por evaluación, agregar al grupo, aviso de cambios sin guardar
{
  const ctxB = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await ctxB.newPage();
  page.on("pageerror", (e) => errores.push(`ciclo: ${e.message}`));
  await preparar(page, true, "profesor", "propietario");
  await page.goto(BASE + "/app/profesor.html#/calificaciones", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".calificar li", { timeout: 8000 }).catch(() => errores.push("ciclo: en el teléfono no abre «Por evaluación»"));
  const filas = await page.locator(".calificar li").count();
  if (filas < 1) errores.push("ciclo: la vista por evaluación no lista estudiantes");
  await page.locator(".calificar input").first().fill("77");
  if (!/Guardar 1 nota/.test(await page.locator(".pie-fijo .btn").innerText())) errores.push("ciclo: no cuenta la nota cambiada");
  await page.screenshot({ path: `${OUT}/ciclo-calificar.png`, fullPage: false });
  await page.getByRole("button", { name: "Cuadro completo" }).click();
  await page.waitForTimeout(300);
  if (!(await page.getByText("Notas sin guardar").isVisible())) errores.push("ciclo: no avisa notas sin guardar al cambiar de vista");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.goto(BASE + `/app/profesor.html#/grupos/${G1}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Agregar", exact: true }).first().click();
  await page.waitForTimeout(300);
  if (!(await page.getByRole("button", { name: "Registrar un estudiante nuevo" }).isVisible())) errores.push("ciclo: el grupo no ofrece registrar un estudiante nuevo");
  if (!(await page.getByRole("button", { name: /Importar una lista/ }).isVisible())) errores.push("ciclo: el grupo no ofrece importar");
  await page.screenshot({ path: `${OUT}/ciclo-agregar.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/app/profesor.html#/asistencia", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pase li", { timeout: 8000 }).catch(() => {});
  await page.locator(".pase .opc button").first().click();
  const opciones = await page.locator(".barra-filtros select option").count();
  if (opciones > 1) {
    await page.locator(".barra-filtros select").selectOption({ index: 1 });
    await page.waitForTimeout(300);
    if (!(await page.getByText("Cambios sin guardar").isVisible())) errores.push("ciclo: no avisa asistencia sin guardar al cambiar de grupo");
  }
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 361) errores.push(`ciclo: desborde horizontal (${ancho}px)`);
  await ctxB.close();
}
await browser.close();
console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "OK: todas las pantallas renderizan sin errores");
