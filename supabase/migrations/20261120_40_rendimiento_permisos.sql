-- =====================================================================
-- DOCENCIA360 · 40 · Permisos de lectura rápidos con mucho volumen
-- Las reglas de lectura llamaban, fila por fila, a funciones que vuelven
-- a buscar el rol del usuario (d360_ve_estudiante, d360_es_finanzas…).
-- Con 2,000 estudiantes, la lista de asistencias o notas de un instructor
-- tardaba 5–9 s. Ahora cada consulta calcula UNA vez lo que el usuario
-- puede ver (sus cuentas por rol, los estudiantes y grupos de sus clases,
-- sus hijos) y compara contra esa lista.
-- QUIÉN VE QUÉ NO CAMBIA: mismas reglas, escritas de otra forma.
--   · dirección, coordinación, administración, caja → toda la cuenta
--   · docente/instructor/asistente → solo estudiantes y grupos asignados
--   · familia → solo sus hijos
-- Las reglas de escritura no se tocan.
-- =====================================================================

-- Cuentas donde soy personal activo con un rol dado (lo que antes resolvía d360_mi_rol fila por fila)
create or replace function public._d360_mis_cuentas_rol(p_roles text[])
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(cuenta_id), '{}') from miembros where user_id = auth.uid() and activo and rol = any(p_roles);
$$;
-- Ven a todos los estudiantes de la cuenta (todo el personal, menos docentes y familias)
create or replace function public._d360_c_todo() returns uuid[] language sql stable security definer set search_path = public as $$
  select _d360_mis_cuentas_rol(array['propietario','director','subdirector','coordinador','administrativo','finanzas']);
$$;
-- Personal (cualquiera menos familia)
create or replace function public._d360_c_personal() returns uuid[] language sql stable security definer set search_path = public as $$
  select _d360_mis_cuentas_rol(array['propietario','director','subdirector','coordinador','administrativo','finanzas','docente']);
$$;
create or replace function public._d360_c_finanzas() returns uuid[] language sql stable security definer set search_path = public as $$
  select _d360_mis_cuentas_rol(array['propietario','director','administrativo','finanzas']);
$$;
create or replace function public._d360_c_gestor() returns uuid[] language sql stable security definer set search_path = public as $$
  select _d360_mis_cuentas_rol(array['propietario','director','subdirector','coordinador','administrativo']);
$$;
-- Grupos donde soy docente asignado (cuentas donde mi rol es docente)
create or replace function public._d360_g_docente() returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct gd.grupo_id), '{}') from grupo_docentes gd join miembros m on m.id = gd.miembro_id
   where m.user_id = auth.uid() and m.activo and m.rol = 'docente' and gd.cuenta_id = m.cuenta_id;
$$;
-- Estudiantes que están (o estuvieron) en esos grupos
create or replace function public._d360_e_docente() returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct ge.estudiante_id), '{}') from grupo_estudiantes ge
   where ge.grupo_id = any(_d360_g_docente());
$$;
-- Mis hijos (familia) y los grupos donde están
create or replace function public._d360_e_tutor() returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct te.estudiante_id), '{}') from tutores_estudiantes te join miembros m on m.id = te.miembro_id
   where m.user_id = auth.uid() and m.activo;
$$;
create or replace function public._d360_g_tutor() returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct ge.grupo_id), '{}') from grupo_estudiantes ge where ge.estudiante_id = any(_d360_e_tutor());
$$;
create or replace function public._d360_mis_miembros() returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from miembros where user_id = auth.uid() and activo;
$$;
do $$ declare f text; begin
  foreach f in array array['_d360_mis_cuentas_rol(text[])','_d360_c_todo()','_d360_c_personal()','_d360_c_finanzas()','_d360_c_gestor()',
                           '_d360_g_docente()','_d360_e_docente()','_d360_e_tutor()','_d360_g_tutor()','_d360_mis_miembros()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- Estudiantes y todo lo que cuelga de un estudiante ----------
drop policy if exists leer on public.estudiantes;
create policy leer on public.estudiantes for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_todo())) or id in (select unnest(public._d360_e_docente()))
         or id in (select unnest(public._d360_e_tutor())) or (select public.d360_es_plataforma_admin()));

do $$
declare t text;
begin
  foreach t in array array['grupo_estudiantes','asistencias','calificaciones','boletin_comentarios','certificados','matriculas']
  loop
    execute format('drop policy if exists leer on public.%I', t);
    execute format($p$create policy leer on public.%I for select to authenticated
      using (cuenta_id in (select unnest(public._d360_c_todo())) or estudiante_id in (select unnest(public._d360_e_docente()))
             or estudiante_id in (select unnest(public._d360_e_tutor())))$p$, t);
  end loop;
end $$;

drop policy if exists leer on public.observaciones;
create policy leer on public.observaciones for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_todo())) or estudiante_id in (select unnest(public._d360_e_docente())));

drop policy if exists leer on public.tutores_estudiantes;
create policy leer on public.tutores_estudiantes for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_todo())) or estudiante_id in (select unnest(public._d360_e_docente()))
         or miembro_id in (select unnest(public._d360_mis_miembros())));

-- ---------- Dinero ----------
drop policy if exists leer on public.cargos;
create policy leer on public.cargos for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_finanzas())) or estudiante_id in (select unnest(public._d360_e_tutor())));
drop policy if exists leer on public.pagos;
create policy leer on public.pagos for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_finanzas())) or estudiante_id in (select unnest(public._d360_e_tutor())));
drop policy if exists leer on public.movimientos;
create policy leer on public.movimientos for select to authenticated using (cuenta_id in (select unnest(public._d360_c_finanzas())));
drop policy if exists leer on public.interesados;
create policy leer on public.interesados for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_gestor())) or cuenta_id in (select unnest(public._d360_c_finanzas())));

-- ---------- Estructura académica ----------
drop policy if exists leer on public.evaluaciones;
create policy leer on public.evaluaciones for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_personal())) or grupo_id in (select unnest(public._d360_g_tutor())));
drop policy if exists leer on public.grupos;
create policy leer on public.grupos for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_personal())) or id in (select unnest(public._d360_g_tutor())) or (select public.d360_es_plataforma_admin()));
drop policy if exists leer on public.horarios;
create policy leer on public.horarios for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_personal())) or (select public.d360_es_plataforma_admin()));
drop policy if exists leer on public.cursos;
create policy leer on public.cursos for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_personal())) or (select public.d360_es_plataforma_admin()));
drop policy if exists leer on public.grupo_docentes;
create policy leer on public.grupo_docentes for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_personal())) or (select public.d360_es_plataforma_admin()));
drop policy if exists miembros_leer on public.miembros;
create policy miembros_leer on public.miembros for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_personal())) or user_id = (select auth.uid()) or (select public.d360_es_plataforma_admin()));

-- ---------- En línea ----------
drop policy if exists leer on public.actividades;
create policy leer on public.actividades for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_todo())) or grupo_id in (select unnest(public._d360_g_docente())));
drop policy if exists leer on public.entregas;
create policy leer on public.entregas for select to authenticated
  using ((cuenta_id in (select unnest(public._d360_c_todo())) or estudiante_id in (select unnest(public._d360_e_docente())))
         and exists(select 1 from actividades a where a.id = entregas.actividad_id
                    and (a.cuenta_id in (select unnest(public._d360_c_todo())) or a.grupo_id in (select unnest(public._d360_g_docente())))));

-- Índices para filtrar por estudiante y por grupo/fecha
create index if not exists asistencias_estudiante on public.asistencias(estudiante_id, fecha);
create index if not exists asistencias_cuenta_fecha on public.asistencias(cuenta_id, fecha);
create index if not exists calificaciones_estudiante on public.calificaciones(estudiante_id);
create index if not exists calificaciones_cuenta on public.calificaciones(cuenta_id);
create index if not exists cargos_estudiante on public.cargos(estudiante_id, vence);
create index if not exists cargos_cuenta_estado on public.cargos(cuenta_id, estado, vence);
create index if not exists pagos_cuenta_fecha on public.pagos(cuenta_id, fecha);
create index if not exists pagos_estudiante on public.pagos(estudiante_id);
create index if not exists grupo_estudiantes_estudiante on public.grupo_estudiantes(estudiante_id);
create index if not exists estudiantes_cuenta on public.estudiantes(cuenta_id);
create index if not exists matriculas_estudiante on public.matriculas(estudiante_id);
create index if not exists grupo_docentes_miembro on public.grupo_docentes(miembro_id);
create index if not exists miembros_usuario on public.miembros(user_id) where activo;

-- ---------- Reglas de escritura separadas de la lectura ----------
-- Una regla «para todo» (FOR ALL) también se evalúa al LEER, fila por fila.
-- Se divide en insertar / actualizar / borrar con exactamente las mismas
-- condiciones: escribir sigue igual y leer ya no paga ese costo.
do $$
declare t text; p record; chk text;
begin
  foreach t in array array['asistencias','calificaciones','estudiantes','grupo_estudiantes','matriculas','cargos','evaluaciones','grupos','horarios',
                           'cursos','grupo_docentes','boletin_comentarios','certificados','tutores_estudiantes','actividades','movimientos','interesados']
  loop
    for p in select policyname, qual, with_check from pg_policies where schemaname = 'public' and tablename = t and cmd = 'ALL' loop
      chk := coalesce(p.with_check, p.qual);
      execute format('drop policy %I on public.%I', p.policyname, t);
      execute format('create policy %I on public.%I for insert to authenticated with check (%s)', p.policyname || '_crear', t, chk);
      execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', p.policyname || '_editar', t, p.qual, chk);
      execute format('create policy %I on public.%I for delete to authenticated using (%s)', p.policyname || '_borrar', t, p.qual);
    end loop;
  end loop;
end $$;

-- Lo que esas reglas también dejaban leer: la asistencia y las notas de los grupos propios
drop policy if exists leer on public.asistencias;
create policy leer on public.asistencias for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_todo())) or estudiante_id in (select unnest(public._d360_e_docente()))
         or grupo_id in (select unnest(public._d360_g_docente())) or estudiante_id in (select unnest(public._d360_e_tutor())));
drop policy if exists leer on public.calificaciones;
create policy leer on public.calificaciones for select to authenticated
  using (cuenta_id in (select unnest(public._d360_c_todo())) or estudiante_id in (select unnest(public._d360_e_docente()))
         or evaluacion_id in (select e.id from public.evaluaciones e where e.grupo_id in (select unnest(public._d360_g_docente())))
         or estudiante_id in (select unnest(public._d360_e_tutor())));
