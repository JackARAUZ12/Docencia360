// Bienvenida guiada de la academia (la primera vez que entra la dueña):
// 1. su primer curso con precios → 2. su primer grupo con días, hora e
// instructor → 3. sus estudiantes (pegando la lista) → 4. matrículas con
// cobros → listo. Todo se guarda de verdad en cada paso; se puede saltar.
import { sb, q, mensajeError } from "../core/sb.js";
import { h, DIAS } from "../core/ui.js";

export async function bienvenidaAcademia(ctx, { forzar = false } = {}) {
  if (!ctx.esDueno || (!forzar && (ctx.guia?.bienvenida || ctx.cuenta.es_demo))) return;
  const nombre = (ctx.cuenta.miembro_nombre || "").split(" ")[0];
  const est = { curso: null, grupo: null, grupoNombre: "", agregados: 0, matriculados: 0, instructorCodigo: null, instructorNombre: "" };
  const fin = ctx.f("finanzas");
  const dlg = h("dialog.modal.bienvenida", { "aria-labelledby": "bv-titulo" });
  const cuerpo = h("div.bv-cuerpo");
  const puntos = h("ol.bv-puntos", { "aria-hidden": "true" }, [1, 2, 3, 4].map(() => h("li")));
  dlg.append(h("div.bv-cabeza", puntos, h("button.btn.btn-texto.btn-sm", { type: "button", onclick: () => salir("omitida") }, "Saltar por ahora")), cuerpo);
  document.body.append(dlg);
  dlg.showModal();
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); salir("omitida"); });

  const salir = async (como, destino) => {
    dlg.close(); dlg.remove();
    await ctx.guiaGuardar({ bienvenida: como });
    ctx.datos.invalidar();
    if (como === "omitida") ctx.toast("Puedes seguir los primeros pasos desde el botón de abajo.");
    if (destino) ctx.ir(destino); else ctx.recargar();
  };
  const marcar = (n) => [...puntos.children].forEach((li, i) => li.classList.toggle("activo", i <= n));
  const caja = () => h("div.aviso.mal.oculto", { role: "alert" });
  const error = (c, e) => { c.textContent = mensajeError(e); c.classList.remove("oculto"); };
  const M = ctx.cuenta.moneda === "USD" ? "US$" : "C$";

  // 1 · Primer curso
  const paso1 = () => {
    marcar(0);
    const nom = h("input", { required: true, maxLength: 120, placeholder: "Ej.: Inglés A1, Guitarra, Excel básico", autocomplete: "off" });
    const men = h("input", { type: "number", min: 0, step: "0.01", placeholder: "0", inputMode: "decimal" });
    const mat = h("input", { type: "number", min: 0, step: "0.01", placeholder: "0", inputMode: "decimal" });
    const err = caja(); const btn = h("button.btn", { type: "submit" }, "Continuar");
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, `¡Bienvenida${nombre ? ", " + nombre : ""}!`),
      h("p.suave", "En 4 pasos cortos dejamos lista tu academia: tu primer curso, su grupo, tus estudiantes y sus cobros. Todo lo puedes cambiar después."),
      h("form.bv-form", { onsubmit: async (e) => {
        e.preventDefault(); if (nom.value.trim().length < 2) return nom.focus();
        btn.disabled = true; err.classList.add("oculto");
        try {
          est.curso = await q(sb.from("cursos").insert({ cuenta_id: ctx.id, nombre: nom.value.trim(), mensualidad: Number(men.value) || 0, precio_matricula: Number(mat.value) || 0, activo: true }).select("id,nombre,mensualidad,precio_matricula").single());
          ctx.datos.invalidar("cursos"); paso2();
        } catch (ex) { error(err, ex); btn.disabled = false; }
      } },
        h("label.campo", h("span", "¿Qué curso das?"), nom),
        fin ? h("div.bv-horas", h("label.campo", h("span", `Mensualidad (${M})`), men), h("label.campo", h("span", `Matrícula (${M})`), mat)) : null,
        err, h("div.bv-pie", btn)));
    nom.focus();
  };

  // 2 · Primer grupo con días, hora e instructor
  const paso2 = async () => {
    marcar(1);
    const instructores = await q(sb.from("miembros").select("id,nombre").eq("cuenta_id", ctx.id).eq("rol", "docente").eq("activo", true).order("nombre")).catch(() => []);
    const nom = h("input", { required: true, maxLength: 100, value: est.curso.nombre, placeholder: `${est.curso.nombre} · sábado mañana` });
    const dias = h("div.bv-dias", [1, 2, 3, 4, 5, 6, 7].map((d) => h("label.bv-dia", h("input", { type: "checkbox", value: d }), h("span", DIAS[d].slice(0, 3)))));
    const ini = h("input", { type: "time", value: "18:00" }), finH = h("input", { type: "time", value: "19:30" });
    const inst = h("select", { "aria-label": "Instructor" },
      h("option", { value: "" }, "Lo asigno después"),
      instructores.map((m) => h("option", { value: m.id }, m.nombre)),
      h("option", { value: "nuevo" }, "+ Registrar un instructor nuevo"));
    const nuevoInst = h("input", { maxLength: 120, placeholder: "Nombre del instructor", hidden: true, "aria-label": "Nombre del instructor nuevo" });
    inst.addEventListener("change", () => { nuevoInst.hidden = inst.value !== "nuevo"; if (!nuevoInst.hidden) nuevoInst.focus(); });
    const err = caja(); const btn = h("button.btn", { type: "submit" }, "Crear el grupo");
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "Su primer grupo"),
      h("p.suave", "Un grupo es el curso en un horario, por ejemplo «Inglés A1 · sábado mañana». Con el horario, el sistema avisa a qué hora pasar lista y calcula las horas del instructor."),
      h("form.bv-form", { onsubmit: async (e) => {
        e.preventDefault();
        const marcados = [...dias.querySelectorAll("input:checked")].map((x) => Number(x.value));
        if (!nom.value.trim()) return nom.focus();
        if (marcados.length && (!ini.value || !finH.value || finH.value <= ini.value)) return error(err, new Error("La hora de fin debe ser después de la de inicio."));
        if (inst.value === "nuevo" && nuevoInst.value.trim().length < 2) return nuevoInst.focus();
        btn.disabled = true; err.classList.add("oculto");
        try {
          let miembro = inst.value && inst.value !== "nuevo" ? inst.value : null;
          if (inst.value === "nuevo") {
            const r = await q(sb.rpc("d360_crear_miembro", { p_cuenta: ctx.id, p_nombre: nuevoInst.value.trim(), p_rol: "docente", p_email: null, p_telefono: null, p_especialidad: est.curso.nombre, p_documento: null }));
            miembro = r.miembro_id; est.instructorCodigo = r.codigo_personal; est.instructorNombre = nuevoInst.value.trim();
          }
          const g = await q(sb.from("grupos").insert({ cuenta_id: ctx.id, nombre: nom.value.trim().replace(/[\s·\-–]+$/, ""), curso_id: est.curso.id, estado: "activo" }).select("id,nombre").single());
          est.grupo = g.id; est.grupoNombre = g.nombre;
          if (miembro) await q(sb.from("grupo_docentes").insert({ cuenta_id: ctx.id, grupo_id: g.id, miembro_id: miembro }));
          if (marcados.length) await q(sb.from("horarios").insert(marcados.map((d) => ({ cuenta_id: ctx.id, grupo_id: g.id, miembro_id: miembro, dia: d, hora_inicio: ini.value, hora_fin: finH.value }))));
          ctx.datos.invalidar("grupos", "instructores"); paso3();
        } catch (ex) { error(err, ex); btn.disabled = false; }
      } },
        h("label.campo", h("span", "Nombre del grupo"), nom),
        h("fieldset.campo", h("legend", "Días de clase (opcional)"), dias),
        h("div.bv-horas", h("label.campo", h("span", "Empieza"), ini), h("label.campo", h("span", "Termina"), finH)),
        h("label.campo", h("span", "¿Quién da la clase?"), inst), nuevoInst,
        err, h("div.bv-pie", btn)));
    nom.focus(); nom.setSelectionRange(nom.value.length, nom.value.length);
  };

  // 3 · Estudiantes (pegar la lista)
  const paso3 = () => {
    marcar(2);
    const area = h("textarea", { rows: 7, placeholder: "Ana Sofía López\nCarlos Pérez Ruiz\nMaría José Gutiérrez" });
    const cuenta = h("span.tenue", "0 estudiantes");
    const lineas = () => area.value.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 1);
    area.addEventListener("input", () => { const n = lineas().length; cuenta.textContent = `${n} estudiante${n === 1 ? "" : "s"}`; });
    const err = caja(); const btn = h("button.btn", { type: "submit" }, "Agregar al grupo");
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "Tus estudiantes"),
      h("p.suave", `Escribe o pega la lista de «${est.grupoNombre}»: un nombre por línea (desde WhatsApp, Word o Excel). Si son muchos, también puedes importar un Excel después desde «Estudiantes».`),
      h("form.bv-form", { onsubmit: async (e) => {
        e.preventDefault();
        const { separarNombre } = await import("../comun/importar.js");
        const filas = lineas().map((l, i) => ({ ...separarNombre(l), _fila: i + 1 }));
        if (!filas.length) return area.focus();
        btn.disabled = true; err.classList.add("oculto");
        try {
          const r = await q(sb.rpc("d360_importar_estudiantes", { p_cuenta: ctx.id, p_filas: filas, p_grupo: est.grupo }));
          est.agregados = r.inscritos ?? r.creados ?? 0; ctx.datos.invalidar("estudiantes");
          est.agregados && fin ? paso4() : paso5();
        } catch (ex) { error(err, ex); btn.disabled = false; }
      } },
        h("label.campo", h("span", "Lista de estudiantes"), area),
        h("p.tenue", "También sirve «Apellidos, Nombres». ", cuenta),
        err,
        h("div.bv-pie", h("button.btn.btn-sec", { type: "button", onclick: paso5 }, "Lo hago después"), btn)));
    area.focus();
  };

  // 4 · Matrículas con cobros
  const paso4 = () => {
    marcar(3);
    const meses = h("input", { type: "number", min: 1, max: 12, value: 3, style: "max-width:7rem" });
    const dia = h("input", { type: "number", min: 1, max: 28, value: 5, style: "max-width:7rem" });
    const avance = h("p.tenue");
    const err = caja(); const btn = h("button.btn", { type: "submit" }, `Matricular a los ${est.agregados}`);
    const precio = [Number(est.curso.precio_matricula) ? `matrícula ${M}${Number(est.curso.precio_matricula).toLocaleString("es-NI")}` : null,
      Number(est.curso.mensualidad) ? `mensualidad ${M}${Number(est.curso.mensualidad).toLocaleString("es-NI")}` : null].filter(Boolean).join(" y ");
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "Matrículas y cobros"),
      h("p.suave", `Matriculamos a los ${est.agregados} estudiantes en «${est.grupoNombre}»${precio ? ` con ${precio}` : ""}. Los cobros se generan solos y luego solo tocas «Cobrar».`),
      h("form.bv-form", { onsubmit: async (e) => {
        e.preventDefault(); btn.disabled = true; err.classList.add("oculto");
        try {
          const ge = await q(sb.from("grupo_estudiantes").select("estudiante_id").eq("grupo_id", est.grupo).eq("estado", "activo"));
          let i = 0;
          for (const x of ge) {
            i++; avance.textContent = `Matriculando ${i} de ${ge.length}…`;
            try {
              await q(sb.rpc("d360_matricular", { p_cuenta: ctx.id, p_estudiante: x.estudiante_id, p_curso: est.curso.id, p_grupo: est.grupo, p_fecha: null,
                p_monto_matricula: Number(est.curso.precio_matricula) || 0, p_mensualidad: Number(est.curso.mensualidad) || 0, p_meses: Number(meses.value) || 1, p_dia_pago: Number(dia.value) || 5 }));
              est.matriculados++;
            } catch (_) { /* si ya estaba matriculado, se sigue con el siguiente */ }
          }
          paso5();
        } catch (ex) { error(err, ex); btn.disabled = false; }
      } },
        h("div.bv-horas", h("label.campo", h("span", "Mensualidades a generar"), meses), h("label.campo", h("span", "Día de pago"), dia)),
        avance, err,
        h("div.bv-pie", h("button.btn.btn-sec", { type: "button", onclick: paso5 }, "Lo hago después"), btn)));
  };

  // Listo
  const paso5 = () => {
    marcar(3);
    cuerpo.replaceChildren(
      h("h2", { id: "bv-titulo" }, "¡Tu academia está lista!"),
      h("ul.bv-resumen",
        h("li", "✓ Curso «", est.curso?.nombre || "", "»"),
        est.grupo ? h("li", "✓ Grupo «", est.grupoNombre, "»") : null,
        est.agregados ? h("li", `✓ ${est.agregados} estudiante(s) agregados`) : h("li.tenue", "Aún sin estudiantes: agrégalos desde «Estudiantes» cuando quieras."),
        est.matriculados ? h("li", `✓ ${est.matriculados} matrícula(s) con sus cobros`) : null),
      est.instructorCodigo ? h("div.aviso.info", h("strong", `Códigos de ${est.instructorNombre}: `), `academia ${ctx.cuenta.codigo || ""} · personal `, h("strong", est.instructorCodigo),
        ". Entrégalo en persona; no se vuelve a mostrar.") : null,
      h("p.suave", "El botón «Primeros pasos» te acompaña con lo que falta."),
      h("div.bv-pie",
        h("button.btn.btn-sec", { type: "button", onclick: () => salir("hecha") }, "Ir a Inicio"),
        est.matriculados ? h("button.btn", { type: "button", onclick: () => salir("hecha", "#/finanzas") }, "Cobrar la primera matrícula")
          : est.grupo ? h("button.btn", { type: "button", onclick: () => salir("hecha", `#/asistencia?grupo=${est.grupo}`) }, "Pasar la primera lista") : null));
  };

  paso1();
}
