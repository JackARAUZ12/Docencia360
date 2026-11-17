-- Primeros pasos: el avance de la guía se guarda por usuario, solo con claves conocidas
\set ON_ERROR_STOP 1
update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000d1','uno@test'),('00000000-0000-0000-0000-0000000000d2','otro@test');
create temp table r(k text, v jsonb); grant all on r to authenticated, anon;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
insert into r select 'C', d360_crear_cuenta('profesor','Mis clases','Ana','prof_basico', p_terminos => '2026-11-05');
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); g jsonb; begin
  if d360_guia(c) <> '{}'::jsonb then raise exception 'FALLO guía inicial no vacía'; end if;
  raise notice 'OK una cuenta nueva empieza sin avance en la guía';
  g := d360_guia_guardar(c, '{"bienvenida":"hecha","ayudas":{"asistencia":true}}');
  g := d360_guia_guardar(c, '{"ayudas":{"notas":true,"MAL-clave":true,"otra":false},"oculta":true,"basura":"x","bienvenida":"cualquiera"}');
  if g->>'bienvenida' <> 'hecha' or not (g->'oculta')::boolean or not (g->'ayudas') ? 'asistencia' or not (g->'ayudas') ? 'notas'
     or (g->'ayudas') ? 'MAL-clave' or (g->'ayudas') ? 'otra' or g ? 'basura' then raise exception 'FALLO guardado %', g; end if;
  raise notice 'OK se guardan bienvenida, guía oculta y ayudas leídas; se ignoran claves y valores desconocidos';
  if d360_guia(c) <> g then raise exception 'FALLO lectura distinta'; end if;
  raise notice 'OK la guía guardada se lee igual desde otro equipo';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
do $$ declare c uuid := (select (v->>'cuenta_id')::uuid from r where k='C'); begin
  if d360_guia(c) <> '{}'::jsonb then raise exception 'FALLO otro usuario ve la guía ajena'; end if;
  begin perform d360_guia_guardar(c, '{"oculta":true}'); raise exception 'FALLO otro usuario guardó en cuenta ajena';
  exception when insufficient_privilege then raise notice 'OK nadie puede leer ni cambiar la guía de otra cuenta'; end;
end $$;
reset role; set role anon;
do $$ begin
  begin perform d360_guia(gen_random_uuid()); raise exception 'FALLO anon';
  exception when insufficient_privilege then raise notice 'OK sin sesión no se puede usar la guía'; end;
end $$;
