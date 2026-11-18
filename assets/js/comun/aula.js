// Aula virtual (lado del profesor): avisos y materiales por grupo. Los
// estudiantes los ven al entrar a su aula (aula.html) con sus códigos.
import { sb, q } from "../core/sb.js";
import { h, confirmar, toast, fecha } from "../core/ui.js";
import { ruta } from "../core/sesion.js";
import { ICONOS } from "../core/iconos.js";

export async function render(el, ctx, { params }) {
  if (!ctx.f("portal_estudiantes")) {
    el.append(ctx.titulo("Aula virtual"),
      h("section.hoja",
        h("h2", "Un aula para cada estudiante"),
        h("p", "Cada estudiante entra con su código a su propia aula: ve sus tareas y exámenes, sube fotos o PDF de su trabajo, descarga tus materiales, lee tus avisos y revisa sus notas y asistencia."),
        h("p.suave", "Disponible en los planes Profesional y Premium."),
        ctx.mejora("Aula virtual")));
    return;
  }
  const grupos = (await ctx.gruposVisibles()).filter((g) => g.estado === "activo");
  if (!grupos.length) { el.append(ctx.titulo("Aula virtual"), h("div.vacio", h("p", "Primero crea un grupo con estudiantes."), h("a.btn", { href: "#/grupos" }, "Ir a Grupos"))); return; }
  let grupoId = grupos.some((g) => g.id === params.get("grupo")) ? params.get("grupo") : grupos[0].id;
  const cuerpo = h("div");
  const sel = h("select", { "aria-label": "Grupo", onchange: (e) => { grupoId = e.target.value; history.replaceState(null, "", `#/aula?grupo=${grupoId}`); pintar(); } },
    grupos.map((g) => h("option", { value: g.id, selected: g.id === grupoId }, g.nombre)));
  el.append(
    ctx.titulo("Aula virtual",
      ctx.esGestor ? h("a.btn.btn-sec", { href: "#/enlinea/accesos" }, "Códigos de estudiantes") : null,
      h("a.btn.btn-sec", { href: ruta(`aula.html?p=${ctx.cuenta.codigo}`), target: "_blank", rel: "noopener" }, "Abrir el aula como estudiante")),
    h("p.suave", "Lo que publiques aquí lo ven los estudiantes del grupo en su aula, junto con sus tareas, exámenes y notas. Entran con el código de tu espacio ",
      h("strong", ctx.cuenta.codigo), " y su código personal."),
    h("div.barra-filtros", sel), cuerpo);

  async function pintar() {
    cuerpo.replaceChildren(h("p.tenue", "Cargando…"));
    const [avisos, mats] = await Promise.all([
      q(sb.from("avisos_aula").select("*").eq("grupo_id", grupoId).order("creado", { ascending: false }).limit(50)),
      q(sb.from("materiales").select("*").eq("grupo_id", grupoId).order("creado", { ascending: false })),
    ]);
    cuerpo.replaceChildren(h("div.dos-col", seccionAvisos(avisos), seccionMateriales(mats)));
  }

  function seccionAvisos(avisos) {
    const texto = h("textarea", { rows: 3, maxLength: 2000, placeholder: "Ej.: Mañana hay examen de fracciones. Traer calculadora.", "aria-label": "Nuevo aviso" });
    const btn = h("button.btn", { type: "submit" }, "Publicar aviso");
    return h("section.hoja",
      h("h2", "Avisos"),
      h("form", { onsubmit: async (e) => {
        e.preventDefault();
        if (texto.value.trim().length < 2) return texto.focus();
        btn.disabled = true;
        try { await q(sb.from("avisos_aula").insert({ cuenta_id: ctx.id, grupo_id: grupoId, texto: texto.value.trim() })); toast("Aviso publicado"); pintar(); }
        catch (err) { toast(err.message, "mal"); btn.disabled = false; }
      } }, h("label.campo", h("span", "Nuevo aviso para el grupo"), texto), btn),
      avisos.length ? h("ul.lista", { style: "margin-top:1rem" }, avisos.map((v) => h("li",
        h("div.crece", h("div", { style: "white-space:pre-wrap;overflow-wrap:anywhere" }, v.texto), h("div.tenue", fecha(v.creado))),
        h("button.btn.btn-texto.btn-sm", { type: "button", onclick: async () => {
          if (!(await confirmar("Borrar aviso", "Los estudiantes ya no lo verán.", { boton: "Borrar", peligro: true }))) return;
          try { await q(sb.from("avisos_aula").delete().eq("id", v.id)); pintar(); } catch (err) { toast(err.message, "mal"); }
        } }, "Borrar")))) : h("p.suave", { style: "margin-top:1rem" }, "Todavía no hay avisos en este grupo."));
  }

  function seccionMateriales(mats) {
    const titulo = h("input", { maxLength: 140, placeholder: "Ej.: Guía de ejercicios unidad 3", "aria-label": "Título" });
    const desc = h("textarea", { rows: 2, maxLength: 2000, placeholder: "Indicaciones (opcional)", "aria-label": "Descripción" });
    const url = h("input", { type: "url", placeholder: "https://… (YouTube, Drive, página web)", "aria-label": "Enlace" });
    const archivo = h("input", { type: "file", accept: ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*", "aria-label": "Archivo" });
    const btn = h("button.btn", { type: "submit" }, "Publicar material");
    const err = h("div.aviso.mal.oculto", { role: "alert" });
    return h("section.hoja",
      h("h2", "Materiales"),
      h("form", { onsubmit: async (e) => {
        e.preventDefault(); err.classList.add("oculto");
        const t = titulo.value.trim(), u = url.value.trim(), f = archivo.files?.[0];
        if (t.length < 2) { titulo.focus(); return; }
        if (!u && !f && !desc.value.trim()) { err.textContent = "Agrega un enlace, un archivo o una descripción."; err.classList.remove("oculto"); return; }
        if (u && !/^https?:\/\//i.test(u)) { err.textContent = "El enlace debe empezar con http:// o https://"; err.classList.remove("oculto"); return; }
        btn.disabled = true; btn.textContent = f ? "Subiendo…" : "Publicando…";
        let subido = null;
        try {
          if (f) subido = await (await import("./archivos.js")).subirMaterial(ctx.id, f);
          await q(sb.from("materiales").insert({ cuenta_id: ctx.id, grupo_id: grupoId, titulo: t, descripcion: desc.value.trim() || null, url: u || null,
            archivo_path: subido?.path || null, archivo_nombre: subido?.nombre || null, archivo_tamano: subido?.tamano || null, archivo_tipo: subido?.tipo || null }));
          toast("Material publicado"); pintar();
        } catch (ex) {
          if (subido) await sb.storage.from("d360").remove([subido.path]);
          err.textContent = ex.message; err.classList.remove("oculto"); btn.disabled = false; btn.textContent = "Publicar material";
        }
      } },
        h("label.campo", h("span", "Título"), titulo),
        h("label.campo", h("span", "Descripción"), desc),
        h("label.campo", h("span", "Enlace (opcional)"), url),
        h("label.campo", h("span", "Archivo (opcional): PDF o foto, máximo 5 MB"), archivo),
        err, btn),
      mats.length ? h("ul.lista", { style: "margin-top:1rem" }, mats.map((m) => h("li",
        h("div.crece", h("strong", m.titulo), h("div.tenue", [m.archivo_nombre, m.url ? "enlace" : null, fecha(m.creado)].filter(Boolean).join(" · ")),
          m.descripcion ? h("div.tenue", { style: "white-space:pre-wrap" }, m.descripcion) : null),
        m.url ? h("a.btn.btn-texto.btn-sm", { href: m.url, target: "_blank", rel: "noopener noreferrer" }, "Enlace") : null,
        m.archivo_path ? h("button.btn.btn-texto.btn-sm", { type: "button", onclick: async () => {
          const v = window.open("", "_blank");
          try { const { urlParaProfesor } = await import("./archivos.js"); const u = await urlParaProfesor(m.archivo_path); if (v) v.location = u; else location.href = u; }
          catch (ex) { v?.close(); toast(ex.message, "mal"); }
        } }, "Abrir") : null,
        h("button.btn.btn-texto.btn-sm", { type: "button", onclick: async () => {
          if (!(await confirmar("Borrar material", "Los estudiantes ya no lo verán.", { boton: "Borrar", peligro: true }))) return;
          try {
            await q(sb.from("materiales").delete().eq("id", m.id));
            if (m.archivo_path) await sb.storage.from("d360").remove([m.archivo_path]);
            pintar();
          } catch (ex) { toast(ex.message, "mal"); }
        } }, "Borrar")))) : h("p.suave", { style: "margin-top:1rem" }, "Todavía no hay materiales en este grupo."));
  }

  pintar();
}
