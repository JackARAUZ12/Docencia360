// Interesados: quien pregunta por un curso (en persona, WhatsApp, Facebook o
// por el enlace de inscripción en línea). Se le escribe, se le agenda una clase
// de prueba y se matricula en un paso. Así se ve cuántos terminan inscritos.
import { sb, q } from "../core/sb.js";
import { h, modal, formularioModal, confirmar, fecha, fechaCorta, hoyISO, dinero, toast } from "../core/ui.js";
import { ruta } from "../core/sesion.js";
import { numeroWhatsApp } from "../comun/reporte.js";

const ORIGEN = { manual: "En persona", en_linea: "Inscripción en línea", whatsapp: "WhatsApp", facebook: "Facebook / Instagram", recomendacion: "Recomendación", visita: "Visita", otro: "Otro" };
const ESTADO = { nuevo: ["info", "Nuevo"], contactado: ["ojo", "Contactado"], prueba: ["ojo", "Clase de prueba"], matriculado: ["ok", "Matriculado"], descartado: ["mal", "Descartado"] };
const VISTAS = [["atender", "Por atender"], ["prueba", "En prueba"], ["matriculado", "Matriculados"], ["descartado", "Descartados"], ["todos", "Todos"]];
const hace = (iso) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };

export async function render(el, ctx, { params }) {
  const [lista, cursos, grupos, insc] = await Promise.all([
    q(sb.from("interesados").select("*").eq("cuenta_id", ctx.id).order("creado", { ascending: false }).limit(500)),
    ctx.datos.cursos(true), ctx.datos.grupos(true),
    q(sb.from("inscripcion_publica").select("*").eq("cuenta_id", ctx.id).maybeSingle()),
  ]);
  const C = Object.fromEntries(cursos.map((c) => [c.id, c])), G = Object.fromEntries(grupos.map((g) => [g.id, g]));
  const abiertos = grupos.filter((g) => ["activo", "planificado"].includes(g.estado));
  let vista = VISTAS.some(([v]) => v === params.get("vista")) ? params.get("vista") : "atender";
  const desde90 = Date.now() - 90 * 864e5;
  const ult = lista.filter((x) => new Date(x.creado).getTime() >= desde90);
  const conv = ult.length ? Math.round((ult.filter((x) => x.estado === "matriculado").length / ult.length) * 100) : null;
  const mesActual = hoyISO().slice(0, 7);

  const guardar = (x) => formularioModal(x ? `Editar · ${x.nombre}` : "Nuevo interesado", [
    { name: "nombre", label: "Nombre", required: true, full: true, maxlength: 120 },
    { name: "telefono", label: "Teléfono / WhatsApp", type: "tel", maxlength: 30 },
    { name: "email", label: "Correo", type: "email", maxlength: 120 },
    { name: "curso_id", label: "Curso que le interesa", type: "select", placeholder: "Aún no sabe", options: cursos.filter((c) => c.activo || c.id === x?.curso_id).map((c) => [c.id, c.nombre]) },
    { name: "origen", label: "¿Cómo llegó?", type: "select", required: true, options: Object.entries(ORIGEN).filter(([k]) => k !== "en_linea" || x?.origen === "en_linea"), value: "whatsapp" },
    { name: "nota", label: "Nota", type: "textarea", full: true, max: 1000, placeholder: "Ej.: Quiere horario de noche; pregunta por descuento de hermanos" },
  ], x, async (d, cerrar) => {
    const fila = { nombre: d.nombre.trim(), telefono: d.telefono?.trim() || null, email: d.email?.trim() || null, curso_id: d.curso_id || null, origen: d.origen, nota: d.nota?.trim() || null, actualizado: new Date().toISOString() };
    if (x) await q(sb.from("interesados").update(fila).eq("id", x.id)); else await q(sb.from("interesados").insert({ ...fila, cuenta_id: ctx.id }));
    cerrar(); ctx.toast("Guardado"); ctx.recargar();
  }, { boton: "Guardar" });

  const cambiar = async (x, cambios, msj) => {
    try { await q(sb.from("interesados").update({ ...cambios, actualizado: new Date().toISOString() }).eq("id", x.id)); if (msj) ctx.toast(msj); ctx.recargar(); }
    catch (e) { ctx.toast(e.message, "mal"); }
  };

  const whatsapp = (x) => {
    const n = numeroWhatsApp(x.telefono);
    if (!n) { toast("Este interesado no tiene teléfono.", "mal"); return; }
    const curso = C[x.curso_id]?.nombre;
    const texto = x.estado === "prueba" && x.prueba_fecha
      ? `Hola ${x.nombre.split(" ")[0]}, te escribimos de ${ctx.cuenta.nombre}. Te esperamos en tu clase de prueba${curso ? ` de ${curso}` : ""} el ${fecha(x.prueba_fecha)}${G[x.prueba_grupo_id] ? ` (${G[x.prueba_grupo_id].nombre})` : ""}. ¡Te esperamos!`
      : `Hola ${x.nombre.split(" ")[0]}, te escribimos de ${ctx.cuenta.nombre}${curso ? ` por tu interés en ${curso}` : ""}. ¿Te podemos ayudar con horarios y precios?`;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    if (x.estado === "nuevo") cambiar(x, { estado: "contactado" });
  };

  const prueba = (x) => formularioModal(`Clase de prueba · ${x.nombre}`, [
    { name: "prueba_grupo_id", label: "Grupo", type: "select", required: true, full: true, placeholder: "Elige el grupo",
      options: [...abiertos.filter((g) => !x.curso_id || g.curso_id === x.curso_id), ...abiertos.filter((g) => x.curso_id && g.curso_id !== x.curso_id)].map((g) => [g.id, g.nombre]), value: x.grupo_id || "" },
    { name: "prueba_fecha", label: "Fecha", type: "date", required: true, value: x.prueba_fecha || hoyISO() },
  ], {}, async (d, cerrar) => {
    await q(sb.from("interesados").update({ estado: "prueba", prueba_grupo_id: d.prueba_grupo_id, prueba_fecha: d.prueba_fecha, prueba_resultado: null, actualizado: new Date().toISOString() }).eq("id", x.id));
    cerrar(); ctx.toast("Clase de prueba agendada. Avísale por WhatsApp."); ctx.recargar();
  }, { boton: "Agendar" });

  const matricular = (x) => {
    const partes = x.nombre.trim().split(/\s+/);
    const nombres = partes.length > 2 ? partes.slice(0, 2).join(" ") : partes[0];
    const apellidos = partes.slice(nombres.split(" ").length).join(" ");
    const sugerido = x.prueba_grupo_id || x.grupo_id || abiertos.find((g) => g.curso_id === x.curso_id)?.id || "";
    const cursoDe = (gid) => C[G[gid]?.curso_id] || {};
    formularioModal(`Matricular · ${x.nombre}`, [
      { name: "nombres", label: "Nombres", required: true, value: nombres },
      { name: "apellidos", label: "Apellidos", value: apellidos },
      { name: "grupo", label: "Grupo", type: "select", required: true, full: true, placeholder: "Elige el grupo", options: abiertos.map((g) => [g.id, `${g.nombre}${C[g.curso_id] ? ` · ${C[g.curso_id].nombre}` : ""}`]), value: sugerido },
      { name: "monto_matricula", label: `Matrícula (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", required: true, value: cursoDe(sugerido).precio_matricula ?? 0 },
      { name: "mensualidad", label: `Mensualidad (${ctx.cuenta.moneda})`, type: "number", min: 0, step: "0.01", required: true, value: cursoDe(sugerido).mensualidad ?? 0 },
      { name: "meses", label: "Mensualidades a generar", type: "number", min: 0, max: 36, required: true, value: 3 },
      { name: "dia", label: "Día de pago", type: "number", min: 1, max: 28, required: true, value: 5 },
      { name: "descuento", label: "Descuento (%)", type: "number", min: 0, max: 100, step: "0.5", value: 0 },
    ], {}, async (d, cerrar) => {
      const r = await q(sb.rpc("d360_interesado_matricular", { p_interesado: x.id, p_nombres: d.nombres, p_apellidos: d.apellidos || "", p_grupo: d.grupo,
        p_monto_matricula: Number(d.monto_matricula) || 0, p_mensualidad: Number(d.mensualidad) || 0, p_meses: Number(d.meses) || 0, p_dia_pago: Number(d.dia) || 5, p_descuento_pct: Number(d.descuento) || 0 }));
      cerrar(); ctx.datos.invalidar("estudiantes", "grupos");
      ctx.toast(`¡${d.nombres} quedó matriculado! ${r.cargos} cobro(s) generados.`);
      ctx.ir(`#/estudiantes/${r.estudiante_id}`);
    }, { boton: "Matricular" });
    // Al cambiar de grupo, propone los precios de su curso
    setTimeout(() => {
      const dlg = document.querySelector("dialog.modal:last-of-type");
      dlg?.querySelector('[name="grupo"]')?.addEventListener("change", (e) => {
        const c = cursoDe(e.target.value);
        if (c.id) { dlg.querySelector('[name="monto_matricula"]').value = c.precio_matricula ?? 0; dlg.querySelector('[name="mensualidad"]').value = c.mensualidad ?? 0; }
      });
    }, 0);
  };

  const enlaceInscripcion = async () => {
    let tok = insc?.token;
    try { if (!tok || !insc.activo) tok = await q(sb.rpc("d360_inscripcion_enlace", { p_cuenta: ctx.id })); } catch (e) { ctx.toast(e.message, "mal"); return; }
    const url = new URL(ruta(`inscripcion.html?a=${tok}`), location.href).href;
    const { svgQR } = await import("../comun/enlinea.js");
    const qr = h("div.qr-chico", { html: await svgQR(url) });
    const mensaje = h("textarea", { rows: 3, maxLength: 500, placeholder: "Ej.: ¡La primera clase de prueba es gratis! Te llamamos para confirmar tu cupo." }, insc?.mensaje || "");
    const precios = h("input", { type: "checkbox", checked: insc ? insc.precios : true });
    const texto = `¡Inscríbete en ${ctx.cuenta.nombre}! Elige tu curso y horario aquí: ${url}`;
    modal("Inscripción en línea", h("div.inscripcion-cfg",
      h("p.suave", "Comparte este enlace o el QR en tus redes, WhatsApp o un afiche. Quien lo llene aparece aquí como «Inscripción en línea» y te llega un aviso."),
      h("div.enlace-insc", h("input", { value: url, readOnly: true, "aria-label": "Enlace de inscripción", onfocus: (e) => e.target.select() })),
      h("div", { style: "display:flex;gap:.5rem;flex-wrap:wrap;margin:.6rem 0 1rem" },
        h("button.btn.btn-sm", { type: "button", onclick: async () => { try { await navigator.clipboard.writeText(url); toast("Enlace copiado"); } catch { toast("Copia el enlace manualmente", "mal"); } } }, "Copiar enlace"),
        h("a.btn.btn-sec.btn-sm", { href: `https://wa.me/?text=${encodeURIComponent(texto)}`, target: "_blank", rel: "noopener" }, "Compartir por WhatsApp"),
        h("a.btn.btn-sec.btn-sm", { href: url, target: "_blank", rel: "noopener" }, "Ver cómo se ve")),
      qr,
      h("label.campo", h("span", "Mensaje de bienvenida"), mensaje),
      h("label.check", precios, " Mostrar precios de matrícula y mensualidad"),
      h("p.tenue", "Solo se muestran los cursos marcados como «Disponible» y sus grupos abiertos, con horario. Nunca se muestran datos de tus estudiantes.")), [
      { texto: "Desactivar enlace", clase: "btn-texto", onclick: async (cerrar) => {
        if (!(await confirmar("Desactivar inscripción en línea", "El enlace dejará de funcionar hasta que lo vuelvas a activar.", { boton: "Desactivar" }))) return false;
        await q(sb.from("inscripcion_publica").update({ activo: false }).eq("cuenta_id", ctx.id)); cerrar(); ctx.toast("Inscripción en línea desactivada"); ctx.recargar(); return false;
      } },
      { texto: "Cambiar enlace", clase: "btn-sec", onclick: async (cerrar) => {
        if (!(await confirmar("Cambiar enlace", "El enlace actual y su QR dejarán de funcionar. Úsalo si se compartió donde no debía.", { boton: "Cambiar" }))) return false;
        await q(sb.rpc("d360_inscripcion_enlace", { p_cuenta: ctx.id, p_nuevo: true })); cerrar(); ctx.recargar(); setTimeout(() => document.querySelector("[data-insc]")?.click(), 600); return false;
      } },
      { texto: "Guardar", onclick: async (cerrar) => {
        try { await q(sb.from("inscripcion_publica").update({ mensaje: mensaje.value.trim() || null, precios: precios.checked }).eq("cuenta_id", ctx.id)); cerrar(); ctx.toast("Guardado"); ctx.recargar(); }
        catch (e) { ctx.toast(e.message, "mal"); }
        return false;
      } },
    ]).el?.classList.add("ancho");
  };

  const filtrar = (v) => lista.filter((x) => v === "todos" || (v === "atender" ? ["nuevo", "contactado"].includes(x.estado) : x.estado === v));
  const cont = h("div");
  const segs = h("div.segmentos", { role: "group", "aria-label": "Etapa" }, VISTAS.map(([v, t]) => h("button", { type: "button", "aria-pressed": String(v === vista),
    onclick: (e) => { vista = v; segs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); pintar(); } }, `${t} (${filtrar(v).length})`)));

  function item(x) {
    const curso = C[x.curso_id]?.nombre, grupo = G[x.grupo_id]?.nombre;
    const pruebaTxt = x.estado === "prueba" && x.prueba_fecha ? `Prueba: ${fecha(x.prueba_fecha)}${G[x.prueba_grupo_id] ? ` · ${G[x.prueba_grupo_id].nombre}` : ""}${x.prueba_resultado ? ` · ${x.prueba_resultado === "asistio" ? "vino" : "no vino"}` : ""}` : null;
    const pendientePrueba = x.estado === "prueba" && !x.prueba_resultado && x.prueba_fecha && x.prueba_fecha <= hoyISO();
    const abierto = !["matriculado", "descartado"].includes(x.estado);
    return h("li",
      h("div.crece",
        h("div", h("strong", x.nombre), " ", h(`span.estado.${ESTADO[x.estado][0]}`, ESTADO[x.estado][1])),
        h("div.tenue", [curso || "Curso sin definir", grupo, ORIGEN[x.origen], hace(x.creado)].filter(Boolean).join(" · ")),
        pruebaTxt ? h("div", { style: "font-size:.92rem" }, pruebaTxt) : null,
        x.datos?.responsable ? h("div.tenue", `Responsable: ${x.datos.responsable}`) : null,
        x.datos?.quiere_prueba && x.estado === "nuevo" ? h("div.tenue", "Pidió una clase de prueba") : null,
        x.nota ? h("div.tenue", { style: "white-space:pre-line" }, x.nota) : null),
      h("div.acciones-cobro",
        x.telefono && abierto ? h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => whatsapp(x) }, "WhatsApp") : null,
        pendientePrueba ? [h("button.btn.btn-sm", { type: "button", onclick: () => cambiar(x, { prueba_resultado: "asistio" }, "Anotado: vino a la prueba") }, "Vino"),
          h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => cambiar(x, { prueba_resultado: "no_vino" }, "Anotado: no vino") }, "No vino")] : null,
        abierto && x.estado !== "prueba" ? h("button.btn.btn-sec.btn-sm", { type: "button", onclick: () => prueba(x) }, "Clase de prueba") : null,
        abierto ? h("button.btn.btn-sm", { type: "button", onclick: () => matricular(x) }, "Matricular") : null,
        x.estado === "matriculado" && x.estudiante_id ? h("a.btn.btn-sec.btn-sm", { href: `#/estudiantes/${x.estudiante_id}` }, "Ver ficha") : null,
        h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => guardar(x) }, "Editar"),
        abierto ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: async () => {
          if (await confirmar("Descartar", `¿Descartar a ${x.nombre}? Lo puedes recuperar desde «Descartados».`, { boton: "Descartar" })) cambiar(x, { estado: "descartado" }, "Descartado");
        } }, "Descartar") : x.estado === "descartado" ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => cambiar(x, { estado: "contactado" }, "Recuperado") }, "Recuperar") : null));
  }
  function pintar() {
    const vis = filtrar(vista);
    cont.replaceChildren(h("section.hoja", vis.length ? h("ul.lista.lista-cobros.lista-interesados", vis.map(item))
      : h("div.vacio", h("p", vista === "atender" ? "No hay interesados por atender." : "No hay interesados en esta etapa."),
        vista === "atender" ? h("p.suave", "Anota a quien pregunta por WhatsApp o en recepción, o comparte tu enlace de inscripción en línea.") : null)));
  }

  el.append(
    ctx.titulo("Interesados",
      h("button.btn.btn-sec", { dataset: { insc: "1" }, onclick: enlaceInscripcion }, insc?.activo ? "Enlace de inscripción" : "Activar inscripción en línea"),
      h("button.btn", { onclick: () => guardar(null) }, "Nuevo interesado")),
    h("section.cifras",
      h("div.cifra", h("b", lista.filter((x) => x.estado === "nuevo").length), h("span", "nuevos sin contactar")),
      h("div.cifra", h("b", lista.filter((x) => x.estado === "prueba" && !x.prueba_resultado).length), h("span", "con clase de prueba")),
      h("div.cifra", h("b", lista.filter((x) => x.estado === "matriculado" && x.actualizado?.slice(0, 7) === mesActual).length), h("span", "matriculados este mes")),
      h("div.cifra", h("b", conv == null ? "—" : `${conv}%`), h("span", "se inscriben (90 días)"))),
    h("div", { style: "margin:1.25rem 0 1rem" }, segs),
    cont);
  pintar();
}
