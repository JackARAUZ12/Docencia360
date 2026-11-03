// Instructores: registro con código de acceso propio, grupos asignados y carga académica.
import { sb, q } from "../core/sb.js";
import { h, tabla, modal, formularioModal, confirmar, fecha } from "../core/ui.js";
import { ICONOS } from "../core/iconos.js";

export function mostrarCodigo(ctx, titulo, nombre, pin, codigoInst) {
  modal(titulo, h("div",
    h("p", `${nombre} entra a Docencia360 con estos dos códigos:`),
    h("p.etiqueta", "Código de la institución"), h("p", h("span.codigo-grande", codigoInst)),
    h("p.etiqueta", "Código personal"), h("p", h("span.codigo-grande", pin)),
    h("p.tenue", "Por seguridad, el código personal no se vuelve a mostrar. Entrégalo en persona o por un medio privado.")), [{ texto: "Listo" }]);
}

export async function render(el, ctx) {
  const [carga, miembros, cuenta, asignaciones] = await Promise.all([
    q(sb.rpc("d360_carga_instructores", { p_cuenta: ctx.id })),
    q(sb.from("miembros").select("*").eq("cuenta_id", ctx.id).eq("rol", "docente")),
    q(sb.from("cuentas").select("codigo").eq("id", ctx.id).single()),
    q(sb.from("grupo_docentes").select("miembro_id, grupos(id,nombre,estado)").eq("cuenta_id", ctx.id)),
  ]);
  const M = Object.fromEntries(miembros.map((m) => [m.id, m]));
  const gruposDe = (id) => asignaciones.filter((a) => a.miembro_id === id && a.grupos?.estado !== "finalizado").map((a) => a.grupos);

  const nuevo = () => formularioModal("Nuevo instructor", [
    { name: "nombre", label: "Nombre completo", required: true, full: true },
    { name: "especialidad", label: "Especialidad", placeholder: "Ej.: Inglés, Guitarra, Excel" },
    { name: "documento", label: "Cédula" },
    { name: "telefono", label: "Teléfono", type: "tel" },
    { name: "email", label: "Correo", type: "email" },
  ], {}, async (d, cerrar) => {
    const r = await q(sb.rpc("d360_crear_miembro", { p_cuenta: ctx.id, p_nombre: d.nombre, p_rol: "docente", p_email: d.email, p_telefono: d.telefono, p_especialidad: d.especialidad, p_documento: d.documento }));
    ctx.datos.invalidar("instructores"); cerrar();
    mostrarCodigo(ctx, "Instructor registrado", d.nombre, r.codigo_personal, cuenta.codigo);
    setTimeout(ctx.recargar, 300);
  }, { boton: "Registrar" });

  const editar = (m) => formularioModal(`Editar · ${m.nombre}`, [
    { name: "nombre", label: "Nombre completo", required: true, full: true },
    { name: "especialidad", label: "Especialidad" },
    { name: "documento", label: "Cédula" },
    { name: "telefono", label: "Teléfono", type: "tel" },
    { name: "email", label: "Correo", type: "email" },
    { name: "activo", label: "Acceso activo", type: "checkbox", help: "" },
  ], m, async (d, cerrar) => {
    await q(sb.rpc("d360_editar_miembro", { p_miembro: m.id, p_nombre: d.nombre, p_rol: "docente", p_email: d.email, p_telefono: d.telefono, p_especialidad: d.especialidad, p_activo: d.activo, p_documento: d.documento }));
    ctx.datos.invalidar("instructores"); cerrar(); ctx.toast("Guardado"); ctx.recargar();
  });

  const total = carga.filter((c) => c.activo);
  el.append(
    ctx.titulo("Instructores", h("button.btn", { onclick: nuevo }, h("span", { html: ICONOS.mas_add }), "Nuevo instructor")),
    h("section.cifras",
      h("div.cifra", h("b", total.length), h("span", "instructores activos")),
      h("div.cifra", h("b", total.reduce((s, c) => s + c.grupos, 0)), h("span", "grupos asignados")),
      h("div.cifra", h("b", total.reduce((s, c) => s + Number(c.horas_semana), 0).toFixed(1)), h("span", "horas de clase por semana")),
      h("div.cifra" + (total.some((c) => !c.grupos) ? ".alerta" : ""), h("b", total.filter((c) => !c.grupos).length), h("span", "sin grupo asignado"))),
    h("section.hoja", { style: "margin-top:1.25rem" },
      h("div.hoja-titulo", h("h2", "Carga académica")),
      tabla([
        { t: "Instructor", v: (c) => [h("strong", c.nombre), h("div.tenue", [c.especialidad, M[c.miembro_id]?.telefono].filter(Boolean).join(" · "))] },
        { t: "Grupos", v: (c) => gruposDe(c.miembro_id).map((g) => h("a", { href: `#/grupos/${g.id}`, style: "display:block" }, g.nombre)) },
        { t: "Estudiantes", v: (c) => c.estudiantes, clase: "derecha" },
        { t: "Horas/sem.", v: (c) => Number(c.horas_semana).toFixed(1), clase: "derecha" },
        { t: "Último acceso", v: (c) => M[c.miembro_id]?.ultimo_acceso ? fecha(M[c.miembro_id].ultimo_acceso) : h("span.tenue", "Nunca") },
        { t: "", v: (c) => h("span.estado" + (c.activo ? ".ok" : ".mal"), c.activo ? "Activo" : "Sin acceso") },
        { t: "", clase: "acciones", v: (c) => [
          h("button.btn.btn-texto.btn-sm", { onclick: () => editar(M[c.miembro_id]) }, "Editar"),
          h("button.btn.btn-texto.btn-sm", { onclick: async () => {
            if (!(await confirmar("Nuevo código", `El código actual de ${c.nombre} dejará de funcionar.`, { boton: "Generar" }))) return;
            try { const pin = await q(sb.rpc("d360_regenerar_codigo", { p_miembro: c.miembro_id })); mostrarCodigo(ctx, "Código nuevo", c.nombre, pin, cuenta.codigo); }
            catch (e) { ctx.toast(e.message, "mal"); }
          } }, "Nuevo código")] },
      ], carga, { vacio: "Aún no registras instructores." })),
    h("p.tenue", "Para asignar un instructor, abre el grupo en «Grupos» y márcalo en «Instructores del grupo». Cada instructor ve solo sus grupos: pasa lista y califica, sin acceso a finanzas."),
  );
}
