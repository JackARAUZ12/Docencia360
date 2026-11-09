-- Pruebas del registro con código de acceso (generado en el panel maestro)
\set ON_ERROR_STOP 1
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000f0','admin@test'),
  ('00000000-0000-0000-0000-0000000000f1','uno@test'),('00000000-0000-0000-0000-0000000000f2','dos@test'),
  ('00000000-0000-0000-0000-0000000000f3','tres@test');
insert into plataforma_admins(user_id) values ('00000000-0000-0000-0000-0000000000f0');
create temp table r(k text, v jsonb); grant all on r to authenticated, anon;

do $$ begin
  if not _d360_registro_requiere_codigo() then raise exception 'FALLO el registro con código no está activo por defecto'; end if;
  raise notice 'OK el registro exige código por defecto';
end $$;

-- Solo el administrador crea códigos y los ve
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ begin
  begin perform d360_admin_crear_codigo('profesor'); raise exception 'FALLO un usuario crea códigos';
  exception when insufficient_privilege then raise notice 'OK un usuario común no crea códigos'; end;
  begin perform * from d360_admin_codigos(); raise exception 'FALLO un usuario lista códigos';
  exception when insufficient_privilege then raise notice 'OK un usuario común no lista códigos'; end;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f0';
insert into r select 'P', d360_admin_crear_codigo('profesor', 'prof_basico', 1, null, 'Prueba profesor');
insert into r select 'L', d360_admin_crear_codigo(null, null, 2, null, 'Libre, dos usos');
insert into r select 'X', d360_admin_crear_codigo('academia', null, 1, null, null);
do $$ begin
  begin perform d360_admin_crear_codigo('colegio', 'prof_basico'); raise exception 'FALLO plan de otra modalidad';
  exception when raise_exception then raise notice 'OK no acepta un plan de otro tipo de cuenta'; end;
  begin perform d360_admin_crear_codigo('profesor', null, 1, current_date - 1); raise exception 'FALLO vencimiento pasado';
  exception when raise_exception then raise notice 'OK no acepta un vencimiento pasado'; end;
  if (select v->>'codigo' from r where k = 'P') !~ '^D360-[A-Z0-9]{4}-[A-Z0-9]{4}$' then raise exception 'FALLO formato'; end if;
  if (select count(*) from d360_admin_codigos()) <> 3 then raise exception 'FALLO listado'; end if;
  raise notice 'OK el administrador crea y lista códigos con formato D360-XXXX-XXXX';
end $$;

-- Una persona sin cuenta valida el código (anon), con límite de intentos
set role anon; set request.jwt.claim.sub = ''; set request.headers = '{"x-forwarded-for": "10.0.0.9"}';
do $$ declare res jsonb; begin
  begin perform 1 from codigos_registro; raise exception 'FALLO anon lee la tabla';
  exception when insufficient_privilege then raise notice 'OK nadie sin sesión puede leer la tabla de códigos'; end;
  res := d360_validar_codigo_registro(lower(replace((select v->>'codigo' from r where k = 'P'), '-', ' ')));
  if not (res->>'ok')::boolean or res->>'modalidad' <> 'profesor' or res->>'plan' <> 'prof_basico' then raise exception 'FALLO validar %', res; end if;
  raise notice 'OK valida un código bueno aunque venga en minúsculas o con espacios, y dice su tipo y plan';
  res := d360_validar_codigo_registro('D360-ZZZZ-ZZZZ');
  if (res->>'ok')::boolean or res->>'motivo' <> 'invalido' then raise exception 'FALLO inválido %', res; end if;
  for i in 1..7 loop res := d360_validar_codigo_registro('D360-ZZZZ-ZZZ' || i); end loop;
  if res->>'motivo' <> 'bloqueado' then raise exception 'FALLO no bloquea %', res; end if;
  res := d360_validar_codigo_registro((select v->>'codigo' from r where k = 'P'));
  if res->>'motivo' <> 'bloqueado' then raise exception 'FALLO bloqueo no se respeta %', res; end if;
  raise notice 'OK tras 8 intentos fallidos bloquea la IP 15 minutos';
end $$;
set request.headers = '{"x-forwarded-for": "10.0.0.10"}';
do $$ begin
  if not (d360_validar_codigo_registro((select v->>'codigo' from r where k = 'P'))->>'ok')::boolean then raise exception 'FALLO otra IP'; end if;
  raise notice 'OK el bloqueo es por IP: otra persona puede validar';
end $$;

-- Crear cuenta: sin código no se puede; el código fija tipo y plan; se gasta
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ declare res jsonb; p text := (select v->>'codigo' from r where k = 'P'); begin
  res := d360_crear_cuenta('profesor','Sin código','Uno','prof_basico', p_terminos => '2026-11-05');
  if res->>'error' is null or exists(select 1 from cuentas where nombre = 'Sin código') then raise exception 'FALLO crea sin código %', res; end if;
  raise notice 'OK sin código de acceso no se crea la cuenta';
  begin perform d360_crear_cuenta('academia','Otra modalidad','Uno','acad_inicial', p_terminos => '2026-11-05', p_codigo => p);
    raise exception 'FALLO usa código de otra modalidad';
  exception when raise_exception then raise notice 'OK un código de profesor no sirve para una academia'; end;
  res := d360_crear_cuenta('profesor','Con código','Uno','prof_premium', p_terminos => '2026-11-05', p_codigo => p);
  if res->>'cuenta_id' is null then raise exception 'FALLO no crea %', res; end if;
  if (select plan_id from suscripciones where cuenta_id = (res->>'cuenta_id')::uuid) <> 'prof_basico' then raise exception 'FALLO el plan no salió del código'; end if;
  raise notice 'OK crea la cuenta y el plan sale del código, no del navegador';
  if (select usos from codigos_registro where codigo = p) <> 1
     or (select codigo_registro_id from cuentas where id = (res->>'cuenta_id')::uuid) is null then raise exception 'FALLO no consume'; end if;
  raise notice 'OK el código queda gastado y la cuenta recuerda con qué código se creó';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
do $$ declare res jsonb; begin
  res := d360_crear_cuenta('profesor','Reuso','Dos','prof_basico', p_terminos => '2026-11-05', p_codigo => (select v->>'codigo' from r where k = 'P'));
  if res->>'motivo' <> 'usado' then raise exception 'FALLO reusa %', res; end if;
  raise notice 'OK un código de un solo uso no sirve dos veces';
  -- Código libre de dos usos: la persona elige tipo y plan
  res := d360_crear_cuenta('colegio','Colegio Libre','Dos','col_avanzado', p_terminos => '2026-11-05', p_codigo => (select v->>'codigo' from r where k = 'L'));
  if res->>'cuenta_id' is null or (select plan_id from suscripciones where cuenta_id = (res->>'cuenta_id')::uuid) <> 'col_avanzado' then raise exception 'FALLO libre %', res; end if;
  raise notice 'OK un código libre deja elegir tipo de cuenta y plan';
end $$;

-- Desactivar y borrar
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f0';
do $$ declare x uuid := (select (v->>'id')::uuid from r where k = 'X'); p uuid := (select (v->>'id')::uuid from r where k = 'P'); begin
  perform d360_admin_codigo_activo(x, false);
  if (select estado from d360_admin_codigos() where id = x) <> 'desactivado' then raise exception 'FALLO desactivar'; end if;
  begin perform d360_admin_borrar_codigo(p); raise exception 'FALLO borra usado';
  exception when raise_exception then raise notice 'OK un código ya usado no se borra (queda en el historial)'; end;
  perform d360_admin_borrar_codigo(x);
  if exists(select 1 from codigos_registro where id = x) then raise exception 'FALLO no borra'; end if;
  if (select jsonb_array_length(cuentas) from d360_admin_codigos() where id = p) <> 1 then raise exception 'FALLO cuentas del código'; end if;
  raise notice 'OK desactiva, borra los no usados y muestra qué cuentas se crearon con cada código';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f3';
do $$ declare res jsonb; begin
  res := d360_crear_cuenta('academia','Desactivado','Tres','acad_inicial', p_terminos => '2026-11-05', p_codigo => 'D360-AAAA-AAAA');
  if res->>'motivo' <> 'invalido' then raise exception 'FALLO %', res; end if;
  raise notice 'OK un código inexistente no crea cuenta';
end $$;

-- Con el requisito apagado en Parámetros, el registro funciona como antes
reset role; update config_global set valor = 'false' where clave = 'publico.registro_con_codigo';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f3';
do $$ declare res jsonb; begin
  res := d360_crear_cuenta('academia','Sin requisito','Tres','acad_inicial', p_terminos => '2026-11-05');
  if res->>'cuenta_id' is null then raise exception 'FALLO sin requisito %', res; end if;
  raise notice 'OK si el administrador apaga el requisito, se puede registrar sin código';
end $$;
