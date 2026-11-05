// Docentes del colegio: expediente, asignaturas y secciones, carga horaria,
// acceso con código y asistencia docente.
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, confirmar, fecha, hoyISO, diaLargo } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { estructura, invalidarEstructura } from "./util.js";
import { mostrarCodigo } from "../academia/instructores.js";

export async function render(el, ctx, { params }) {
  const vista = params.get("vista") || "lista";
  const [E, carga, miembros, cuenta] = await Promise.all([estructura(ctx, true), q(sb.rpc("d360_carga_instructores", { p_cuenta: ctx.id })),
    q(sb.from("miembros").select("*").eq("cuenta_id", ctx.id).eq("rol", "docente").order("nombre")), q(sb.from("cuentas").select("codigo").eq("id", ctx.id).single())]);
  const K = Object.fromEntries(carga.map((c) => [c.miembro_id, c]));
  const segs = h("div.segmentos", { role: "group" }, [["lista", "Docentes"], ["asistencia", "Asistencia docente"]].map(([v, t]) =>
    h("button", { type: "button", "aria-pressed": String(v === vista), onclick: () => { history.replaceState(null, "", `#/docentes?vista=${v}`); ctx.recargar(); } }, t)));

  const editar = (m) => formularioModal(m ? `Editar · ${m.nombre}` : "Nuevo docente", [
    { name: "nombre", label: "Nombre completo", required: true, full: true },
    { name: "especialidad", label: "Especialidad", placeholder: "Ej.: Matemática, Primaria" },
    { name: "documento", label: "Cédula" },
    { name: "telefono", label: "Teléfono", type: "tel" },
    { name: "email", label: "Correo", type: "email" },
    m ? { name: "activo", label: "Acceso activo", type: "checkbox" } : null,
  ].filter(Boolean), m, async (d, cerrar) => {
    if (m) await q(sb.rpc("d360_editar_miembro", { p_miembro: m.id, p_nombre: d.nombre, p_rol: "docente", p_email: d.email, p_telefono: d.telefono, p_especialidad: d.especialidad, p_activo: d.activo, p_documento: d.documento }));
    else {
      const r = await q(sb.rpc("d360_crear_miembro", { p_cuenta: ctx.id, p_nombre: d.nombre, p_rol: "docente", p_email: d.email, p_telefono: d.telefono, p_especialidad: d.especialidad, p_documento: d.documento }));
      mostrarCodigo(ctx, "Docente registrado", d.nombre, r.codigo_personal, cuenta.codigo);
    }
    invalidarEstructura(ctx); cerrar(); ctx.toast("Guardado"); setTimeout(ctx.recargar, 300);
  }, { boton: m ? "Guardar" : "Registrar" });

  el.append(ctx.titulo("Docentes", vista === "lista" ? h("button.btn", { onclick: () => editar(null) }, h("span", { html: ICONOS.mas_add }), "Nuevo docente") : null),
    h("div", { style: "margin-bottom:1rem" }, segs));

  if (vista === "lista") {
    const asigDe = (id) => E.asignaciones.filter((x) => x.miembro_id === id);
    el.append(
      h("section.cifras",
        h("div.cifra", h("b", miembros.filter((m) => m.activo).length), h("span", "docentes activos")),
        h("div.cifra", h("b", E.secciones.filter((s) => !E.guiaDe(s.id)).length), h("span", "secciones sin maestro guía")),
        h("div.cifra", h("b", E.secciones.reduce((t, s) => t + E.planDe(s.grado_id).filter((a) => !E.docenteDe(s.id, a.id)).length, 0)), h("span", "asignaturas sin docente")),
        h("div.cifra", h("b", carga.reduce((s, c) => s + Number(c.horas_semana), 0).toFixed(0)), h("span", "horas de clase por semana"))),
      h("section.hoja", { style: "margin-top:1rem" }, tabla([
        { t: "Docente", v: (m) => [h("strong", m.nombre), h("div.tenue", [m.especialidad, m.telefono].filter(Boolean).join(" · "))] },
        { t: "Asignaturas y secciones", v: (m) => { const a = asigDe(m.id); return a.length ? a.slice(0, 6).map((x) => h("div", { style: "font-size:.9rem" }, `${E.asignatura(x.asignatura_id)?.nombre || "—"} · ${E.seccion(x.grupo_id)?.nombre || ""}${x.es_guia ? " (guía)" : ""}`)).concat(a.length > 6 ? [h("div.tenue", `y ${a.length - 6} más`)] : []) : h("span.estado.ojo", "Sin asignar"); } },
        { t: "Estudiantes", v: (m) => K[m.id]?.estudiantes ?? 0, clase: "derecha" },
        { t: "Horas/sem.", v: (m) => Number(K[m.id]?.horas_semana || 0).toFixed(1), clase: "derecha" },
        { t: "Último acceso", v: (m) => m.ultimo_acceso ? fecha(m.ultimo_acceso) : h("span.tenue", "Nunca") },
        { t: "", clase: "acciones", v: (m) => [
          h("a.btn.btn-texto.btn-sm", { href: `#/horarios?modo=docente&ref=${m.id}` }, "Horario"),
          h("button.btn.btn-texto.btn-sm", { onclick: () => editar(m) }, "Editar"),
          h("button.btn.btn-texto.btn-sm", { onclick: async () => {
            if (!(await confirmar("Nuevo código", `El código actual de ${m.nombre} dejará de funcionar.`, { boton: "Generar" }))) return;
            try { mostrarCodigo(ctx, "Código nuevo", m.nombre, await q(sb.rpc("d360_regenerar_codigo", { p_miembro: m.id })), cuenta.codigo); } catch (e) { ctx.toast(e.message, "mal"); }
          } }, "Código")] },
      ], miembros, { vacio: "Aún no registras docentes." })),
      h("p.tenue", "Las asignaturas y secciones de cada docente se asignan en «Grados y secciones» → «Asignación de docentes»."));
    return;
  }

  // Asistencia docente del día
  let dia = params.get("fecha") || hoyISO();
  const regs = await q(sb.from("asistencia_docentes").select("*").eq("cuenta_id", ctx.id).eq("fecha", dia));
  const R = Object.fromEntries(regs.map((r) => [r.miembro_id, r]));
  const hist = await q(sb.from("asistencia_docentes").select("miembro_id,estado").eq("cuenta_id", ctx.id).gte("fecha", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)));
  const marcar = async (m, estado) => {
    try { await q(sb.from("asistencia_docentes").upsert({ cuenta_id: ctx.id, miembro_id: m.id, fecha: dia, estado }, { onConflict: "miembro_id,fecha" })); R[m.id] = { estado }; ctx.toast(`${m.nombre}: ${estado}`); ctx.recargar(); }
    catch (e) { ctx.toast(e.message, "mal"); }
  };
  el.append(
    h("div", { style: "display:flex;gap:.6rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap" },
      h("input", { type: "date", value: dia, max: hoyISO(), style: "width:auto", onchange: (e) => { history.replaceState(null, "", `#/docentes?vista=asistencia&fecha=${e.target.value}`); ctx.recargar(); } }),
      h("strong", diaLargo(dia))),
    h("section.hoja", h("ul.pase", miembros.filter((m) => m.activo).map((m) => {
      const ausencias = hist.filter((x) => x.miembro_id === m.id && x.estado === "ausente").length;
      return h("li", h("span.nombre", m.nombre, h("div.tenue", { style: "font-weight:400" }, `${ausencias} ausencia(s) en 30 días`)),
        h("div.opc", [["presente", "P"], ["ausente", "A"], ["tarde", "T"], ["justificado", "J"]].map(([v, l]) =>
          h("button", { type: "button", dataset: { e: v }, "aria-pressed": String(R[m.id]?.estado === v), title: v, onclick: () => marcar(m, v) }, l))));
    }))));
}
