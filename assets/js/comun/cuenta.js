// Mi cuenta: plan y suscripción, códigos de acceso, datos y asistentes.
import { sb, q } from "../core/sb.js";
import { h, tabla, formularioModal, confirmar, modal, fecha, dinero } from "../core/ui.js";

export async function render(el, ctx) {
  const [cuenta, sus, planes, pagos, miembros, cfg, resumen] = await Promise.all([
    q(sb.from("cuentas").select("*").eq("id", ctx.id).single()),
    q(sb.from("suscripciones").select("*").eq("cuenta_id", ctx.id).single()),
    q(sb.from("planes").select("*").eq("modalidad", ctx.modalidad).eq("activo", true).order("orden")),
    ["propietario", "director", "finanzas"].includes(ctx.rol) ? q(sb.from("pagos_suscripcion").select("*").eq("cuenta_id", ctx.id).order("creado", { ascending: false })) : [],
    q(sb.from("miembros").select("*").eq("cuenta_id", ctx.id).order("creado")),
    q(sb.from("config_global").select("clave,valor").like("clave", "publico.%")),
    q(sb.rpc("d360_resumen_panel", { p_cuenta: ctx.id })),
  ]);
  const plan = planes.find((p) => p.id === sus.plan_id) || {};
  const whatsapp = (cfg.find((c) => c.clave === "publico.contacto_whatsapp")?.valor || "").replace(/\D/g, "");
  const yo = miembros.find((m) => m.user_id === ctx.user.id);
  const asistentes = miembros.filter((m) => m.rol === "docente");
  const uso = (usado, max, txt) => h("li", h("div.crece", h("div.titulo", txt)), h("span.num", max == null ? `${usado} · sin límite` : `${usado} de ${max}`),
    max != null && usado >= max ? h("span.estado.mal", "Al límite") : null);
  const ESTADO = { prueba: ["info", "Prueba gratis"], activa: ["ok", "Activa"], vencida: ["ojo", "Vencida (en gracia)"], suspendida: ["mal", "Suspendida"], cancelada: ["mal", "Cancelada"] };

  const mostrarCodigo = (titulo, pin, nota) => modal(titulo, h("div",
    h("p", nota), h("p.etiqueta", "Código de la institución"), h("p", h("span.codigo-grande", cuenta.codigo)),
    h("p.etiqueta", "Código personal"), h("p", h("span.codigo-grande", pin)),
    h("p.tenue", "Por seguridad este código no se vuelve a mostrar. Entrégalo en persona o por un medio privado.")), [{ texto: "Listo" }]);

  el.append(
    ctx.titulo("Mi cuenta"),
    h("div.dos-col",
      h("div",
        h("section.hoja",
          h("div.hoja-titulo", h("h2", `Plan ${plan.nombre || ""}`), h("span.estado." + ESTADO[sus.estado][0], ESTADO[sus.estado][1])),
          h("p", sus.estado === "prueba" ? `Tu prueba gratis termina el ${fecha(sus.vence)}.` : `Pagado hasta el ${fecha(sus.vence)}.`,
            sus.dias_gracia ? h("span.tenue", ` Tienes ${sus.dias_gracia} días de gracia después del vencimiento.`) : null),
          h("ul.lista",
            uso(resumen.estudiantes_activos, plan.max_estudiantes, "Estudiantes activos"),
            uso(resumen.grupos_activos, plan.max_grupos, "Grupos activos"),
            ctx.modalidad === "profesor"
              ? (plan.max_docentes ? uso(asistentes.filter((a) => a.activo).length, plan.max_docentes, "Asistentes") : null)
              : [uso(asistentes.filter((a) => a.activo).length, plan.max_docentes, "Instructores"),
                 uso(miembros.filter((m) => m.activo && ["director", "subdirector", "coordinador", "administrativo", "finanzas"].includes(m.rol)).length, plan.max_admins, "Usuarios administrativos")])),
        h("section.hoja",
          h("div.hoja-titulo", h("h2", "Renovar o cambiar de plan")),
          h("p.suave", "El pago se hace por transferencia o depósito. Al confirmarlo, activamos tu plan el mismo día."),
          tabla([
            { t: "Plan", v: (p) => [h("strong", p.nombre), p.id === sus.plan_id ? h("span.estado.info", { style: "margin-left:.5rem" }, "Actual") : null, h("div.tenue", p.resumen)] },
            { t: "Estudiantes", v: (p) => p.max_estudiantes ?? "Sin límite", clase: "derecha" },
            { t: "Mensual", v: (p) => [dinero(p.precio_nio, "NIO"), h("div.tenue", dinero(p.precio_usd, "USD"))], clase: "derecha" },
          ], planes),
          whatsapp
            ? h("a.btn", { style: "margin-top:1rem", target: "_blank", rel: "noopener",
                href: `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, quiero renovar Docencia360. Cuenta: ${cuenta.nombre} (código ${cuenta.codigo}).`)}` }, "Solicitar por WhatsApp")
            : h("p.tenue", { style: "margin-top:1rem" }, `Para renovar, comunícate con Docencia360 indicando el código de tu cuenta: ${cuenta.codigo}.`)),
        pagos.length ? h("section.hoja", h("h2", "Historial de pagos"), tabla([
          { t: "Fecha", v: (p) => fecha(p.creado) },
          { t: "Período", v: (p) => `${fecha(p.periodo_desde)} – ${fecha(p.periodo_hasta)}` },
          { t: "Monto", v: (p) => dinero(p.monto, p.moneda), clase: "derecha" },
        ], pagos)) : null),
      h("div",
        h("section.hoja",
          h("h2", "Tus códigos de acceso"),
          h("p.etiqueta", "Código de la institución"), h("p", h("span.codigo-grande", cuenta.codigo)),
          h("p.suave", `Tu código personal termina en ··${yo?.codigo_ultimos ?? "--"}.`),
          h("button.btn.btn-sec", { onclick: async () => {
            if (!(await confirmar("Generar código nuevo", "Tu código actual dejará de funcionar.", { boton: "Generar" }))) return;
            try { const pin = await q(sb.rpc("d360_regenerar_codigo", { p_miembro: yo.id })); mostrarCodigo("Tu nuevo código", pin, "Guárdalo en un lugar seguro."); }
            catch (e) { ctx.toast(e.message, "mal"); }
          } }, "Generar un código nuevo")),
        ctx.esDueno ? h("section.hoja",
          h("div.hoja-titulo", h("h2", "Datos"), h("button.btn.btn-sec.btn-sm", { onclick: () => formularioModal("Datos de la cuenta", [
            { name: "nombre", label: ctx.modalidad === "profesor" ? "Nombre de tu espacio" : "Nombre de la institución", required: true, full: true, maxlength: 120 },
            { name: "telefono", label: "Teléfono", type: "tel" },
            { name: "moneda", label: "Moneda", type: "select", options: [["NIO", "Córdobas"], ["USD", "Dólares"]] },
            { name: "direccion", label: "Dirección", full: true },
          ], cuenta, async (d, cerrar) => { await q(sb.from("cuentas").update(d).eq("id", ctx.id)); cerrar(); ctx.toast("Guardado"); location.reload(); }) }, "Editar")),
          h("p", h("strong", cuenta.nombre), h("br"), h("span.suave", [cuenta.telefono, cuenta.email, cuenta.moneda === "USD" ? "Dólares" : "Córdobas"].filter(Boolean).join(" · ")))) : null,
        ctx.esDueno && ctx.modalidad === "profesor" ? h("section.hoja",
          h("div.hoja-titulo", h("h2", "Asistentes"),
            ctx.f("asistentes") ? h("button.btn.btn-sm", { onclick: () => formularioModal("Nuevo asistente", [
              { name: "nombre", label: "Nombre", required: true, full: true },
              { name: "telefono", label: "Teléfono", type: "tel" },
              { name: "email", label: "Correo", type: "email" },
            ], {}, async (d, cerrar) => {
              const r = await q(sb.rpc("d360_crear_miembro", { p_cuenta: ctx.id, p_nombre: d.nombre, p_rol: "docente", p_email: d.email, p_telefono: d.telefono }));
              cerrar(); mostrarCodigo("Asistente creado", r.codigo_personal, `${d.nombre} entra con estos códigos. Solo verá los grupos que le asignes.`);
              setTimeout(ctx.recargar, 400);
            }) }, "Agregar") : null),
          ctx.f("asistentes")
            ? (asistentes.length ? h("ul.lista", asistentes.map((a) => h("li",
                h("div.crece", h("div.titulo", a.nombre), h("div.tenue", a.ultimo_acceso ? `Último acceso: ${fecha(a.ultimo_acceso)}` : "Aún no entra")),
                h("span.estado" + (a.activo ? ".ok" : ".mal"), a.activo ? "Activo" : "Desactivado"),
                h("button.btn.btn-texto.btn-sm", { onclick: async () => {
                  try { const pin = await q(sb.rpc("d360_regenerar_codigo", { p_miembro: a.id })); mostrarCodigo(`Nuevo código de ${a.nombre}`, pin, "El código anterior ya no funciona."); } catch (e) { ctx.toast(e.message, "mal"); } } }, "Nuevo código"),
                h("button.btn.btn-texto.btn-sm", { onclick: async () => {
                  try { await q(sb.rpc("d360_editar_miembro", { p_miembro: a.id, p_nombre: a.nombre, p_rol: a.rol, p_email: a.email, p_telefono: a.telefono, p_especialidad: a.especialidad, p_activo: !a.activo })); ctx.recargar(); }
                  catch (e) { ctx.toast(e.message, "mal"); } } }, a.activo ? "Desactivar" : "Activar"))))
              : h("p.suave", "Un asistente puede pasar lista y calificar en los grupos que le asignes."))
            : h("p.suave", "Con el plan Premium puedes dar acceso a un asistente con su propio código.")) : null,
        h("section.hoja", h("h2", "Seguridad"),
          h("p.suave", "Por seguridad, la sesión se cierra sola tras un tiempo sin uso."),
          ctx.esDueno ? h("button.btn.btn-sec", { onclick: () => formularioModal("Cambiar contraseña", [
            { name: "clave", label: "Contraseña nueva", type: "password", required: true, help: "Mínimo 8 caracteres.", full: true },
          ], {}, async (d, cerrar) => {
            if ((d.clave || "").length < 8) throw new Error("Mínimo 8 caracteres.");
            const { error } = await sb.auth.updateUser({ password: d.clave }); if (error) throw error;
            cerrar(); ctx.toast("Contraseña actualizada");
          }) }, "Cambiar contraseña") : null)),
    ),
  );
}
