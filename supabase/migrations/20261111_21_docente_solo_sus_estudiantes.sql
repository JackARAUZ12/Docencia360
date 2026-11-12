-- =====================================================================
-- DOCENCIA360 · 21 · Un docente/asistente solo lee a SUS estudiantes
-- Problema: las reglas de lectura usaban d360_es_personal(), que vale
-- para cualquier persona del equipo (también docentes y asistentes).
-- Así, un docente podía leer por la API los expedientes, notas,
-- asistencia, observaciones, matrículas, certificados y familiares de
-- TODOS los estudiantes de la cuenta. La pantalla filtraba, el servidor
-- no. La política de privacidad promete «un docente ve sus grupos».
-- Solución: d360_ve_estudiante(cuenta, estudiante):
--   · dirección, coordinación, administración, caja → todos (como antes)
--   · docente/asistente → solo estudiantes inscritos (o que estuvieron)
--     en grupos donde está asignado (grupo_docentes)
--   · familia y externos → no (tienen sus propias reglas)
-- Las escrituras no cambian (ya estaban restringidas por grupo), salvo
-- crear observaciones, que ahora exige ver al estudiante.
-- =====================================================================
create or replace function public.d360_ve_estudiante(p_cuenta uuid, p_estudiante uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when r is null or r = 'tutor' then false
    when r = 'docente' then exists(
      select 1 from grupo_estudiantes ge
      join grupo_docentes gd on gd.grupo_id = ge.grupo_id
      join miembros m on m.id = gd.miembro_id
      where ge.cuenta_id = p_cuenta and ge.estudiante_id = p_estudiante
        and m.cuenta_id = p_cuenta and m.user_id = auth.uid() and m.activo)
    else true end
  from (select public.d360_mi_rol(p_cuenta) as r) x;
$$;
revoke all on function public.d360_ve_estudiante(uuid, uuid) from public, anon;
grant execute on function public.d360_ve_estudiante(uuid, uuid) to authenticated;

drop policy if exists leer on public.estudiantes;
create policy leer on public.estudiantes for select to authenticated
  using (public.d360_ve_estudiante(cuenta_id, id) or public.d360_es_tutor_de(id) or public.d360_es_plataforma_admin());

do $$
declare t text;
begin
  foreach t in array array['grupo_estudiantes','asistencias','calificaciones','boletin_comentarios','certificados','matriculas']
  loop
    execute format('drop policy if exists leer on public.%I', t);
    execute format($p$create policy leer on public.%I for select to authenticated
      using (public.d360_ve_estudiante(cuenta_id, estudiante_id) or public.d360_es_tutor_de(estudiante_id))$p$, t);
  end loop;
end $$;

drop policy if exists leer on public.observaciones;
create policy leer on public.observaciones for select to authenticated
  using (public.d360_ve_estudiante(cuenta_id, estudiante_id));
drop policy if exists crear on public.observaciones;
create policy crear on public.observaciones for insert to authenticated
  with check (public.d360_ve_estudiante(cuenta_id, estudiante_id) and public.d360_cuenta_operativa(cuenta_id) and autor = auth.uid());

drop policy if exists leer on public.tutores_estudiantes;
create policy leer on public.tutores_estudiantes for select to authenticated
  using (public.d360_ve_estudiante(cuenta_id, estudiante_id) or miembro_id = public.d360_mi_miembro(cuenta_id));

-- Asesor de seguridad: ruta de búsqueda fija también en esta función auxiliar
alter function public._d360_normalizar_codigo(text) set search_path = public;
