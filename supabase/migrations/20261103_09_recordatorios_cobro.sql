-- =====================================================================
-- DOCENCIA360 · 09 · Recordatorio diario de cobros próximos a vencer
-- (academias y colegios con finanzas). Se ejecuta junto a la tarea diaria.
-- =====================================================================
create or replace function public.d360_recordatorios_cobro()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notificaciones(cuenta_id, tipo, titulo, cuerpo, enlace, clave)
  select c.cuenta_id, 'cobro', 'Cobros por vencer',
         count(*) || ' cobro(s) vencen el ' || to_char(current_date + 3, 'DD/MM') || ' por un total de '
           || to_char(sum(c.monto - c.descuento - c.pagado), 'FM999G999G990D00') || '. Avisa a las familias.',
         '#/finanzas?vista=cobrar', 'porvencer-' || (current_date + 3)
  from cargos c
  where c.estado in ('pendiente','parcial') and c.vence = current_date + 3
  group by c.cuenta_id
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.d360_recordatorios_cobro() from public, anon, authenticated;

-- 06:10 UTC (00:10 en Nicaragua), después de la tarea diaria general
select cron.schedule('d360-recordatorios-cobro', '10 6 * * *', $$select public.d360_recordatorios_cobro()$$);
