// Cambio de nivel: al terminar un curso (p. ej. Inglés A1), los estudiantes
// elegidos pasan al grupo del siguiente nivel en un solo paso: su matrícula
// actual queda completada, se emite el certificado si se pide y quedan
// matriculados en el grupo nuevo con sus mensualidades (y su descuento).
import { sb, q } from "../core/sb.js";
import { h, modal, dinero, nombreCompleto, toast } from "../core/ui.js";

export async function pasarNivel(ctx, g, activos) {
  const [grupoCompleto, cursos, grupos] = await Promise.all([
    q(sb.from("grupos").select("id,nombre,curso_id").eq("id", g.id).single()),
    ctx.datos.cursos(true), ctx.datos.grupos(true),
  ]);
  const cursoAct = cursos.find((c) => c.id === grupoCompleto.curso_id);
  const sig = cursos.find((c) => c.id === cursoAct?.siguiente_curso_id);
  const abiertos = grupos.filter((x) => x.id !== g.id && ["activo", "planificado"].includes(x.estado));
  if (!abiertos.length) { toast("Primero abre el grupo del siguiente nivel en «Grupos».", "mal"); return; }
  const recomendados = sig ? abiertos.filter((x) => x.curso_id === sig.id) : [];
  const otros = abiertos.filter((x) => !recomendados.includes(x));
  const cursoDe = (x) => cursos.find((c) => c.id === x.curso_id);

  const elegidos = new Set(activos.map((m) => m.estudiante_id));
  const cuenta = h("strong");
  const marcarCuenta = () => { cuenta.textContent = `${elegidos.size} de ${activos.length} estudiante(s)`; };
  const lista = h("ul.lista.banco-elegir", activos.map((m) => h("li", h("label", { style: "display:flex;gap:.6rem;align-items:center;cursor:pointer;width:100%" },
    h("input", { type: "checkbox", checked: true, style: "width:20px;height:20px;flex:none", onchange: (e) => { e.target.checked ? elegidos.add(m.estudiante_id) : elegidos.delete(m.estudiante_id); marcarCuenta(); } }),
    h("span", nombreCompleto(m.estudiantes || {}))))));
  marcarCuenta();
  const destino = h("select", { "aria-label": "Grupo del siguiente nivel", required: true },
    h("option", { value: "" }, "Elige el grupo"),
    recomendados.length ? h("optgroup", { label: `Siguiente nivel: ${sig.nombre}` }, recomendados.map((x) => h("option", { value: x.id }, x.nombre))) : null,
    otros.length ? h("optgroup", { label: "Otros grupos abiertos" }, otros.map((x) => h("option", { value: x.id }, `${x.nombre}${cursoDe(x) ? ` · ${cursoDe(x).nombre}` : ""}`))) : null);
  if (recomendados.length === 1) destino.value = recomendados[0].id;
  const precio = h("p.tenue");
  const pintarPrecio = () => { const c = cursoDe(abiertos.find((x) => x.id === destino.value) || {});
    precio.textContent = c ? `Mensualidad del nuevo curso: ${dinero(c.mensualidad, ctx.cuenta.moneda)}${Number(c.precio_matricula) ? ` · matrícula ${dinero(c.precio_matricula, ctx.cuenta.moneda)}` : ""}. Se mantiene el descuento que tenía cada estudiante.` : ""; };
  destino.addEventListener("change", pintarPrecio); pintarPrecio();
  const meses = h("input", { type: "number", min: 0, max: 36, value: Math.max(1, Math.round((sig?.duracion_semanas || 8) / 4.3)), style: "max-width:7rem", "aria-label": "Mensualidades a generar" });
  const dia = h("input", { type: "number", min: 1, max: 28, value: 5, style: "max-width:7rem", "aria-label": "Día de pago" });
  const cobrarMat = h("input", { type: "checkbox" });
  const puedeCert = ctx.f("certificados") && cursoAct?.certifica;
  const certificar = h("input", { type: "checkbox", checked: !!puedeCert, disabled: !puedeCert });
  const err = h("div.aviso.mal.oculto", { role: "alert" });

  const m = modal("Pasar al siguiente nivel", h("div",
    h("p.suave", `Desde «${g.nombre}»${cursoAct ? ` (${cursoAct.nombre})` : ""}. Su matrícula actual queda como completada y se matriculan en el grupo nuevo con sus cobros.`),
    !sig ? h("div.aviso.ojo", "Este curso no tiene «Siguiente nivel». Puedes elegir cualquier grupo abierto, o definirlo en «Cursos y programas».") : null,
    err,
    h("label.campo", h("span", "Grupo del siguiente nivel"), destino), precio,
    h("div.fila", h("label.campo", h("span", "Mensualidades a generar"), meses), h("label.campo", h("span", "Día de pago"), dia)),
    h("label.check", cobrarMat, " Cobrar matrícula del nuevo curso"),
    h("label.check", certificar, puedeCert ? ` Emitir certificado de «${cursoAct.nombre}»` : " Emitir certificado (este curso no entrega certificado o tu plan no lo incluye)"),
    h("h3", { style: "margin-top:1rem" }, "Estudiantes que pasan"), h("p", cuenta), lista), [
    { texto: "Cancelar", clase: "btn-sec" },
    { texto: "Pasar de nivel", onclick: async (cerrar) => {
      err.classList.add("oculto");
      if (!destino.value) { err.textContent = "Elige el grupo del siguiente nivel."; err.classList.remove("oculto"); return false; }
      if (!elegidos.size) { err.textContent = "Elige al menos un estudiante."; err.classList.remove("oculto"); return false; }
      try {
        const r = await q(sb.rpc("d360_promover", { p_grupo_origen: g.id, p_estudiantes: [...elegidos], p_grupo_destino: destino.value,
          p_meses: Number(meses.value) || 0, p_dia_pago: Number(dia.value) || 5, p_cobrar_matricula: cobrarMat.checked, p_certificar: certificar.checked && !!puedeCert }));
        cerrar(); ctx.datos.invalidar("grupos", "estudiantes");
        ctx.toast(`${r.promovidos} estudiante(s) pasaron de nivel${r.certificados ? ` · ${r.certificados} certificado(s) emitidos` : ""}`);
        ctx.ir(`#/grupos/${destino.value}`);
      } catch (e) { err.textContent = e.message; err.classList.remove("oculto"); }
      return false;
    } },
  ]);
  m.el?.classList.add("ancho");
}
