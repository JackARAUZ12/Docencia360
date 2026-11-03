// Equipo y accesos: personal administrativo con roles y códigos propios.
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, confirmar, fecha } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";
import { mostrarCodigo } from "./instructores.js";

export const ROLES = {
  propietario: ["Propietario", "Control total de la cuenta y del plan."],
  director: ["Dirección", "Todo, incluidos usuarios y datos de la institución."],
  subdirector: ["Subdirección", "Gestión académica y de usuarios (excepto dirección)."],
  coordinador: ["Coordinación académica", "Cursos, grupos, estudiantes, asistencia y notas."],
  administrativo: ["Administración", "Gestión académica más matrículas y cobros."],
  finanzas: ["Finanzas / caja", "Matrículas, cobros, pagos e informes financieros."],
  docente: ["Instructor", "Solo sus grupos: asistencia y evaluaciones."],
};

export async function render(el, ctx) {
  const [miembros, cuenta] = await Promise.all([
    q(sb.from("miembros").select("*").eq("cuenta_id", ctx.id).neq("rol", "docente").neq("rol", "tutor").order("creado")),
    q(sb.from("cuentas").select("codigo").eq("id", ctx.id).single()),
  ]);
  const puedeDirectivos = ["propietario", "director"].includes(ctx.rol);
  const opciones = Object.entries(ROLES).filter(([r]) => !["propietario", "docente"].includes(r) && (puedeDirectivos || !["director", "subdirector"].includes(r)))
    .map(([r, [t]]) => [r, t]);

  const nuevo = () => formularioModal("Nuevo usuario del equipo", [
    { name: "nombre", label: "Nombre completo", required: true, full: true },
    { name: "rol", label: "Rol", type: "select", required: true, options: opciones, full: true, help: "Define qué puede ver y hacer. Puedes cambiarlo después." },
    { name: "telefono", label: "Teléfono", type: "tel" },
    { name: "email", label: "Correo", type: "email" },
  ], { rol: "administrativo" }, async (d, cerrar) => {
    const r = await q(sb.rpc("d360_crear_miembro", { p_cuenta: ctx.id, p_nombre: d.nombre, p_rol: d.rol, p_email: d.email, p_telefono: d.telefono }));
    cerrar(); mostrarCodigo(ctx, "Usuario creado", d.nombre, r.codigo_personal, cuenta.codigo); setTimeout(ctx.recargar, 300);
  }, { boton: "Crear acceso" });

  const editar = (m) => formularioModal(`Editar · ${m.nombre}`, [
    { name: "nombre", label: "Nombre completo", required: true, full: true },
    m.rol === "propietario" ? null : { name: "rol", label: "Rol", type: "select", options: opciones },
    { name: "telefono", label: "Teléfono", type: "tel" },
    { name: "email", label: "Correo", type: "email" },
    m.rol === "propietario" ? null : { name: "activo", label: "Acceso activo", type: "checkbox" },
  ].filter(Boolean), m, async (d, cerrar) => {
    await q(sb.rpc("d360_editar_miembro", { p_miembro: m.id, p_nombre: d.nombre, p_rol: d.rol || m.rol, p_email: d.email, p_telefono: d.telefono, p_especialidad: m.especialidad, p_activo: m.rol === "propietario" ? true : d.activo, p_documento: m.documento }));
    cerrar(); ctx.toast("Guardado"); ctx.recargar();
  });

  el.append(
    ctx.titulo("Equipo y accesos", h("button.btn", { onclick: nuevo }, h("span", { html: ICONOS.mas_add }), "Nuevo usuario")),
    h("div.aviso", h("strong", `Código de la institución: ${cuenta.codigo}. `), "Cada persona entra con este código y su código personal. Los instructores se gestionan en «Instructores»."),
    h("section.hoja", tabla([
      { t: "Persona", v: (m) => [h("strong", m.nombre), h("div.tenue", [m.telefono, m.email].filter(Boolean).join(" · "))] },
      { t: "Rol", v: (m) => [ROLES[m.rol]?.[0] || m.rol, h("div.tenue", ROLES[m.rol]?.[1])] },
      { t: "Código", v: (m) => m.codigo_ultimos ? h("span.num", `··${m.codigo_ultimos}`) : "—" },
      { t: "Último acceso", v: (m) => m.ultimo_acceso ? fecha(m.ultimo_acceso) : h("span.tenue", "Nunca") },
      { t: "", v: (m) => h("span.estado" + (m.activo ? ".ok" : ".mal"), m.activo ? "Activo" : "Sin acceso") },
      { t: "", clase: "acciones", v: (m) => m.user_id === ctx.user.id ? h("span.tenue", "Tú") : [
        h("button.btn.btn-texto.btn-sm", { onclick: () => editar(m) }, "Editar"),
        m.rol === "propietario" ? null : h("button.btn.btn-texto.btn-sm", { onclick: async () => {
          if (!(await confirmar("Nuevo código", `El código actual de ${m.nombre} dejará de funcionar.`, { boton: "Generar" }))) return;
          try { const pin = await q(sb.rpc("d360_regenerar_codigo", { p_miembro: m.id })); mostrarCodigo(ctx, "Código nuevo", m.nombre, pin, cuenta.codigo); } catch (e) { ctx.toast(e.message, "mal"); }
        } }, "Nuevo código")] },
    ], miembros)),
    h("section.hoja", h("h2", "Qué puede hacer cada rol"),
      h("ul.lista", Object.entries(ROLES).map(([, [t, d]]) => h("li", h("div.crece", h("div.titulo", t), h("div.tenue", d)))))),
  );
}
