-- Un visitante sin sesión (anon) puede leer lo público: planes activos y claves «publico.»
\set ON_ERROR_STOP 1
update planes set activo = false where id = 'prof_premium';
insert into config_global(clave, valor, descripcion) values ('privado.prueba', '"secreto"', 'No público') on conflict (clave) do nothing;
set role anon; set request.jwt.claim.sub = '';
do $$ begin
  if (select count(*) from planes) = 0 then raise exception 'FALLO anon no lee planes'; end if;
  if exists(select 1 from planes where not activo) then raise exception 'FALLO anon ve planes inactivos'; end if;
  raise notice 'OK un visitante sin sesión lee los planes activos (y no los inactivos)';
  if (select count(*) from config_global where clave = 'publico.terminos_version') <> 1 then raise exception 'FALLO anon no lee la versión de los términos'; end if;
  if exists(select 1 from config_global where clave not like 'publico.%') then raise exception 'FALLO anon ve configuración privada'; end if;
  raise notice 'OK un visitante sin sesión lee la configuración pública (y no la privada)';
  begin perform d360_es_plataforma_admin(); raise exception 'FALLO anon ejecuta funciones';
  exception when insufficient_privilege then raise notice 'OK sigue sin poder ejecutar funciones (endurecimiento intacto)'; end;
end $$;
reset role;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a9','x@test');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a9';
do $$ begin
  if (select count(*) from planes) = 0 or exists(select 1 from planes where not activo) then raise exception 'FALLO usuario común y planes'; end if;
  if exists(select 1 from config_global where clave not like 'publico.%') then raise exception 'FALLO usuario común ve configuración privada'; end if;
  raise notice 'OK un usuario con sesión ve lo mismo que antes';
end $$;
