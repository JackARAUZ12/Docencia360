// Padres y tutores: quién tiene acceso al portal, a qué estudiantes está
// vinculado, códigos de acceso y estudiantes sin familia vinculada.
import { sb, q } from "../core/sb.js";
import { h, tabla, confirmar, fecha, nombreCompleto, formularioModal } from "../core/ui.js";
import { mostrarCodigo } from "../academia/instructores.js";

export async function render(el, ctx) {
  if (!ctx.f("portal_familias")) {
    el.append(ctx.titulo("Padres y tutores"), h("div.aviso.ojo", "El portal de familias está disponible desde el plan Avanzado. Con él, cada familia ve notas, asistencia, comunicados y pagos desde su teléfono."));
    return;
  }
  const [tutores, vinc, est, cuenta] = await Promise.all([
    q(sb.from("miembros").select("*").eq("cuenta_id", ctx.id).eq("rol", "tutor").order("nombre")),
    q(sb.from("tutores_estudiantes").select("miembro_id, estudiante_id, parentesco, estudiantes(nombres,apellidos)").eq("cuenta_id", ctx.id)),
    ctx.datos.estudiantes(true), q(sb.from("cuentas").select("codigo").eq("id", ctx.id).single()),
  ]);
  const conFamilia = new Set(vinc.map((v) => v.estudiante_id));
  const sinFamilia = est.filter((e) => e.estado === "activo" && !conFamilia.has(e.id));
  const accedieron = tutores.filter((t) => t.ultimo_acceso).length;

  const vincularOtro = (t) => formularioModal(`Vincular otro estudiante a ${t.nombre}`, [
    { name: "estudiante", label: "Estudiante", type: "select", required: true, full: true, placeholder: "Elige", options: est.filter((e) => e.estado === "activo").map((e) => [e.id, nombreCompleto(e)]) },
    { name: "parentesco", label: "Parentesco", type: "select", options: [["Madre", "Madre"], ["Padre", "Padre"], ["Tutor legal", "Tutor legal"], ["Abuelo/a", "Abuelo/a"], ["Otro", "Otro"]] },
  ], {}, async (d, cerrar) => {
    await q(sb.rpc("d360_vincular_tutor", { p_cuenta: ctx.id, p_estudiante: d.estudiante, p_nombre: t.nombre, p_telefono: t.telefono, p_parentesco: d.parentesco, p_tutor: t.id }));
    cerrar(); ctx.toast("Vinculado"); ctx.recargar();
  }, { boton: "Vincular" });

  el.append(ctx.titulo("Padres y tutores"),
    h("section.cifras",
      h("div.cifra", h("b", tutores.filter((t) => t.activo).length), h("span", "familias con acceso")),
      h("div.cifra", h("b", accedieron), h("span", "ya entraron al portal")),
      h("div.cifra" + (sinFamilia.length ? ".alerta" : ""), h("b", sinFamilia.length), h("span", "estudiantes sin familia vinculada"))),
    h("div.aviso", { style: "margin-top:1rem" }, `Cada familia entra con el código del colegio (${cuenta.codigo}) y su código personal. Para dar acceso, abre el expediente del estudiante y usa «Padres y tutores» → «Agregar».`),
    h("section.hoja", h("h2", "Familias con acceso"), tabla([
      { t: "Tutor", v: (t) => [h("strong", t.nombre), h("div.tenue", t.telefono || "")] },
      { t: "Estudiantes", v: (t) => vinc.filter((v) => v.miembro_id === t.id).map((v) => h("div", h("a", { href: `#/estudiantes/${v.estudiante_id}` }, nombreCompleto(v.estudiantes)), v.parentesco ? h("span.tenue", ` · ${v.parentesco}`) : null)) },
      { t: "Último acceso", v: (t) => t.ultimo_acceso ? fecha(t.ultimo_acceso) : h("span.estado.ojo", "Aún no entra") },
      { t: "", v: (t) => h("span.estado" + (t.activo ? ".ok" : ".mal"), t.activo ? "Activo" : "Sin acceso") },
      { t: "", clase: "acciones", v: (t) => [
        h("button.btn.btn-texto.btn-sm", { onclick: () => vincularOtro(t) }, "+ Estudiante"),
        h("button.btn.btn-texto.btn-sm", { onclick: async () => {
          if (!(await confirmar("Nuevo código", `El código actual de ${t.nombre} dejará de funcionar.`, { boton: "Generar" }))) return;
          try { mostrarCodigo(ctx, "Código nuevo para la familia", t.nombre, await q(sb.rpc("d360_regenerar_codigo", { p_miembro: t.id })), cuenta.codigo); } catch (e) { ctx.toast(e.message, "mal"); }
        } }, "Código"),
        h("button.btn.btn-texto.btn-sm", { onclick: async () => {
          try { await q(sb.rpc("d360_editar_miembro", { p_miembro: t.id, p_nombre: t.nombre, p_rol: "tutor", p_email: t.email, p_telefono: t.telefono, p_especialidad: null, p_activo: !t.activo })); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
        } }, t.activo ? "Desactivar" : "Activar")] },
    ], tutores, { vacio: "Aún no hay familias con acceso." })),
    sinFamilia.length ? h("section.hoja", h("h2", `Estudiantes sin familia vinculada (${sinFamilia.length})`),
      tabla([{ t: "Estudiante", v: (e) => h("a.fila-enlace", { href: `#/estudiantes/${e.id}` }, nombreCompleto(e)) },
             { t: "Contacto registrado", v: (e) => [e.contacto_nombre, e.contacto_telefono].filter(Boolean).join(" · ") || "—" }], sinFamilia.slice(0, 50))) : null);
}
