// Recuperación de clases: quien faltó a su grupo recupera la clase en otro
// grupo (del mismo curso, si hay) sin cambiar su matrícula. La dirección la
// agenda; el instructor del grupo que recibe marca si vino.
import { sb, q } from "../core/sb.js";
import { h, formularioModal, confirmar, fecha, hoyISO, sumarDias, nombreCompleto, DIAS } from "../core/ui.js";
import { numeroWhatsApp } from "../comun/reporte.js";

const EST = { agendada: ["ojo", "Agendada"], asistio: ["ok", "Vino"], no_vino: ["mal", "No vino"], cancelada: ["", "Cancelada"] };

// Próxima fecha (desde hoy) en que el grupo tiene clase según su horario
const proximaClase = (horarios, grupo) => {
  const dias = new Set(horarios.filter((x) => x.grupo_id === grupo).map((x) => x.dia));
  if (!dias.size) return hoyISO();
  for (let i = 0; i < 14; i++) { const f = sumarDias(hoyISO(), i); const d = ((new Date(f + "T12:00:00").getDay() + 6) % 7) + 1; if (dias.has(d)) return f; }
  return hoyISO();
};

export async function render(el, ctx) {
  const gest = ctx.esGestor;
  const desde = sumarDias(hoyISO(), -30);
  const [recs, ausencias, grupos, horarios] = await Promise.all([
    q(sb.from("recuperaciones").select("*, estudiantes(id,nombres,apellidos,telefono,contacto_telefono)").eq("cuenta_id", ctx.id).gte("fecha", sumarDias(hoyISO(), -45)).order("fecha")),
    gest ? q(sb.from("asistencias").select("estudiante_id,grupo_id,fecha,estado,estudiantes(id,nombres,apellidos,telefono,contacto_telefono)").eq("cuenta_id", ctx.id).eq("estado", "ausente").gte("fecha", desde).order("fecha", { ascending: false }).limit(300)) : [],
    ctx.datos.grupos(true),
    q(sb.from("horarios").select("grupo_id,dia,hora_inicio,hora_fin").eq("cuenta_id", ctx.id)),
  ]);
  const G = Object.fromEntries(grupos.map((g) => [g.id, g]));
  const abiertos = grupos.filter((g) => ["activo", "planificado"].includes(g.estado));
  const yaAgendada = new Set(recs.filter((r) => r.estado !== "cancelada").map((r) => `${r.estudiante_id}|${r.grupo_origen}|${r.fecha_falta}`));
  const pendientesFalta = ausencias.filter((a) => !yaAgendada.has(`${a.estudiante_id}|${a.grupo_id}|${a.fecha}`));
  const horarioTxt = (gid) => horarios.filter((x) => x.grupo_id === gid).sort((a, b) => a.dia - b.dia).map((x) => `${DIAS[x.dia].slice(0, 3)} ${x.hora_inicio.slice(0, 5)}`).join(", ");

  const agendar = (a) => {
    const origen = G[a.grupo_id];
    const opciones = [...abiertos.filter((g) => g.id !== a.grupo_id && origen?.curso_id && g.curso_id === origen.curso_id),
      ...abiertos.filter((g) => g.id !== a.grupo_id && !(origen?.curso_id && g.curso_id === origen.curso_id))];
    if (!opciones.length) { ctx.toast("No hay otro grupo abierto donde recuperar.", "mal"); return; }
    formularioModal(`Recuperación · ${nombreCompleto(a.estudiantes || {})}`, [
      { name: "grupo_destino", label: "Recupera en el grupo", type: "select", required: true, full: true,
        options: opciones.map((g) => [g.id, `${g.nombre}${horarioTxt(g.id) ? ` · ${horarioTxt(g.id)}` : ""}`]), value: opciones[0].id,
        help: `Faltó a «${origen?.nombre || "su grupo"}» el ${fecha(a.fecha)}. Primero aparecen los grupos del mismo curso.` },
      { name: "fecha", label: "Fecha", type: "date", required: true, value: proximaClase(horarios, opciones[0].id) },
      { name: "nota", label: "Nota", maxlength: 300, full: true, placeholder: "Ej.: Recupera el tema 4" },
    ], {}, async (d, cerrar) => {
      await q(sb.from("recuperaciones").insert({ cuenta_id: ctx.id, estudiante_id: a.estudiante_id, grupo_origen: a.grupo_id, fecha_falta: a.fecha, grupo_destino: d.grupo_destino, fecha: d.fecha, nota: d.nota?.trim() || null }));
      cerrar(); ctx.toast("Recuperación agendada. Avísale por WhatsApp."); ctx.recargar();
    }, { boton: "Agendar" });
    setTimeout(() => {
      const dlg = document.querySelector("dialog.modal:last-of-type");
      dlg?.querySelector('[name="grupo_destino"]')?.addEventListener("change", (e) => { dlg.querySelector('[name="fecha"]').value = proximaClase(horarios, e.target.value); });
    }, 0);
  };

  const avisar = (r) => {
    const n = numeroWhatsApp(r.estudiantes?.telefono || r.estudiantes?.contacto_telefono);
    if (!n) { ctx.toast("No tiene teléfono registrado.", "mal"); return; }
    const t = `Hola, te escribimos de ${ctx.cuenta.nombre}. ${r.estudiantes?.nombres?.split(" ")[0] || ""} puede recuperar su clase el ${fecha(r.fecha)} en el grupo «${G[r.grupo_destino]?.nombre || ""}»${horarioTxt(r.grupo_destino) ? ` (${horarioTxt(r.grupo_destino)})` : ""}. ¡Lo esperamos!`;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(t)}`, "_blank", "noopener");
  };
  const marcar = (r, v) => async () => { try { await q(sb.rpc("d360_recuperacion_marcar", { p_id: r.id, p_estado: v })); ctx.toast("Anotado"); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); } };

  const proximas = recs.filter((r) => r.estado === "agendada").sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pasadas = recs.filter((r) => r.estado !== "agendada").sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 30);
  const filaRec = (r) => h("li",
    h("div.crece", h("strong", nombreCompleto(r.estudiantes || {})),
      h("div.tenue", `${fecha(r.fecha)} en «${G[r.grupo_destino]?.nombre || "—"}»${r.grupo_origen ? ` · faltó a «${G[r.grupo_origen]?.nombre || "—"}»${r.fecha_falta ? ` el ${fecha(r.fecha_falta)}` : ""}` : ""}`),
      r.nota ? h("div.tenue", r.nota) : null),
    h(`span.estado.${EST[r.estado][0]}`, EST[r.estado][1]),
    h("div.acciones-cobro",
      r.estado === "agendada" && r.fecha <= hoyISO() && (gest || G[r.grupo_destino]) ? [h("button.btn.btn-sm", { type: "button", onclick: marcar(r, "asistio") }, "Vino"), h("button.btn.btn-sec.btn-sm", { type: "button", onclick: marcar(r, "no_vino") }, "No vino")] : null,
      r.estado === "agendada" && gest ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => avisar(r) }, "WhatsApp") : null,
      r.estado === "agendada" && gest ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: async () => {
        if (!(await confirmar("Cancelar recuperación", "¿Cancelar esta recuperación?", { boton: "Cancelar recuperación" }))) return;
        try { await q(sb.from("recuperaciones").update({ estado: "cancelada" }).eq("id", r.id)); ctx.recargar(); } catch (e) { ctx.toast(e.message, "mal"); }
      } }, "Cancelar") : null));

  el.append(
    ctx.titulo("Recuperaciones"),
    h("p.suave", gest ? "Quien faltó puede recuperar la clase en otro grupo sin cambiar su matrícula. El instructor del grupo que recibe lo ve al pasar lista y marca si vino."
      : "Estudiantes de otros grupos que vienen a recuperar una clase en los tuyos. Márcalos al pasar lista."),
    gest ? h("section.hoja", h("h2", `Faltaron y no han recuperado (${pendientesFalta.length})`),
      pendientesFalta.length ? h("ul.lista.lista-cobros", pendientesFalta.slice(0, 60).map((a) => h("li",
        h("div.crece", h("strong", nombreCompleto(a.estudiantes || {})), h("div.tenue", `Faltó a «${G[a.grupo_id]?.nombre || "—"}» el ${fecha(a.fecha)}`)),
        h("button.btn.btn-sm", { type: "button", onclick: () => agendar(a) }, "Agendar recuperación"))))
        : h("p.suave", "Nadie tiene clases pendientes de recuperar en los últimos 30 días.")) : null,
    h("section.hoja", h("h2", `Próximas (${proximas.length})`),
      proximas.length ? h("ul.lista.lista-cobros", proximas.map(filaRec)) : h("p.suave", "No hay recuperaciones agendadas.")),
    pasadas.length ? h("section.hoja", h("h2", "Recientes"), h("ul.lista.lista-cobros", pasadas.map(filaRec))) : null);
}
