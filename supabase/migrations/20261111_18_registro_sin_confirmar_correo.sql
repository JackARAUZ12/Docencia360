-- =====================================================================
-- DOCENCIA360 · 18 · Registro con código, sin confirmar el correo
-- El código de acceso que entrega el administrador ya prueba que la
-- persona está autorizada, así que no hace falta el correo de
-- confirmación: la función de servidor «registro-codigo» valida el
-- código, crea el usuario ya confirmado y crea la cuenta (gastando el
-- código con d360_crear_cuenta, igual que siempre).
-- Esta función solo la puede usar el servidor (service_role): recibe la
-- IP del visitante para el límite de intentos, que no se puede leer de
-- forma fiable cuando la llamada viene de otra función del servidor.
-- No cambia ninguna función existente.
-- =====================================================================
create or replace function public.d360_srv_validar_codigo(p_codigo text, p_origen text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_clave text := 'registro|' || coalesce(nullif(trim(p_origen), ''), 'sin-ip');
        v_min int; v_c codigos_registro; v_mot text; v_int acceso_intentos;
begin
  if not _d360_registro_requiere_codigo() then return jsonb_build_object('ok', true, 'requiere', false); end if;
  v_min := _d360_registro_bloqueado(v_clave);
  if v_min is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', v_min); end if;
  select * into v_c from codigos_registro where codigo = _d360_normalizar_codigo(p_codigo);
  v_mot := _d360_motivo_codigo(v_c);
  if v_mot is not null then
    v_int := _d360_registro_fallo(v_clave);
    if v_int.bloqueado_hasta is not null then return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', 15); end if;
    return jsonb_build_object('ok', false, 'motivo', v_mot);
  end if;
  delete from acceso_intentos where clave = v_clave;
  return jsonb_build_object('ok', true, 'requiere', true, 'codigo', v_c.codigo, 'modalidad', v_c.modalidad, 'plan', v_c.plan_id);
end $$;
revoke all on function public.d360_srv_validar_codigo(text, text) from public, anon, authenticated;
grant execute on function public.d360_srv_validar_codigo(text, text) to service_role;
