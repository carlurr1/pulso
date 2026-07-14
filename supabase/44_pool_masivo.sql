-- ════════════════════════════════════════════════════════════════
--  44 · ACCIONES MASIVAS SOBRE EL CONTENEDOR
--  · Asignar/tomar y mover VARIOS casos del pool de una sola vez.
--  · Reusan pool_asignar y pool_mover_mesa (misma autorización), y son
--    tolerantes: saltan los que ya fueron tomados o no autorizados, y
--    devuelven cuántos sí se aplicaron.
--  Ejecutar después de 43.
-- ════════════════════════════════════════════════════════════════

create or replace function public.pool_asignar_masivo(p_pools uuid[], p_destino uuid)
returns int language plpgsql security definer set search_path = public as $$
declare pid uuid; n int := 0;
begin
  if p_pools is null then return 0; end if;
  foreach pid in array p_pools loop
    begin
      perform public.pool_asignar(pid, p_destino);
      n := n + 1;
    exception when others then null;   -- salta ya-tomados / no-autorizados
    end;
  end loop;
  return n;
end $$;
grant execute on function public.pool_asignar_masivo(uuid[], uuid) to authenticated;

create or replace function public.pool_mover_masivo(p_pools uuid[], p_mesa text)
returns int language plpgsql security definer set search_path = public as $$
declare pid uuid; n int := 0;
begin
  if p_pools is null then return 0; end if;
  foreach pid in array p_pools loop
    begin
      perform public.pool_mover_mesa(pid, p_mesa);
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  return n;
end $$;
grant execute on function public.pool_mover_masivo(uuid[], text) to authenticated;

notify pgrst, 'reload schema';
