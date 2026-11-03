-- =====================================================================
-- DOCENCIA360 · Limpieza de la versión anterior (agosto 2026),
-- autorizada por el propietario. Solo afecta objetos sin prefijo d360.
-- Se conserva el usuario de Auth del propietario.
-- =====================================================================
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.access_codes, public.account_access, public.activities, public.activity_access_codes,
  public.activity_answers, public.activity_attempts, public.activity_question_options,
  public.activity_questions, public.anonymous_activity_attempts, public.attendance_records,
  public.attendance_sessions, public.class_announcements, public.class_members,
  public.class_resources, public.class_roster, public.class_schedules, public.class_sessions,
  public.classes, public.lesson_plans, public.planning_units, public.profiles,
  public.student_roster, public.subjects, public.teacher_settings
cascade;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname !~ '^(_?d360_|t_limite_|t_cupo_grupo|t_conflicto_horario|t_recibo|t_saldo_cargo|t_auditar)'
  loop
    execute format('drop function if exists %s cascade', f.firma);
  end loop;
end $$;

drop type if exists public.user_role cascade;

drop policy if exists class_resources_teacher_upload on storage.objects;
drop policy if exists class_resources_teacher_delete on storage.objects;
drop policy if exists class_resources_public_read   on storage.objects;
drop policy if exists branding_teacher_upload       on storage.objects;
drop policy if exists branding_teacher_delete       on storage.objects;
drop policy if exists branding_public_read          on storage.objects;

delete from supabase_migrations.schema_migrations where version < '20261102';
