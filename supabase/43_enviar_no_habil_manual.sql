-- ════════════════════════════════════════════════════════════════
--  43 · ENVÍO MANUAL DE LA BOLSA NO HÁBIL A LOS CONTENEDORES
--  · La migración automática (42) mueve la bolsa a los contenedores a
--    partir de las 11:00 en día hábil. Este disparador MANUAL permite al
--    coordinador empujar TODO lo que esté en la bolsa a los contenedores
--    de cada mesa cuando quiera, sin esperar.
--  · Misma regla de deduplicación ya existente: si el senior ya asignó un
--    caso, su fila del pool ya está 'asignado' (trigger 38) y no aparece,
--    así que no se duplica. Solo viajan los que siguen pendientes.
--  · Solo coordinador / superadmin.
--  Ejecutar después de 42.
-- ════════════════════════════════════════════════════════════════

create or replace function public.migrar_no_habil_manual()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.es_privilegiado() then
    raise exception 'No autorizado: solo coordinación puede enviar la bolsa a los contenedores.';
  end if;
  update public.casos_pool
     set fuera_horario = false
   where estado = 'pendiente' and fuera_horario = true
     and not exists (select 1 from public.mesas m where m.nombre = casos_pool.mesa and m.retiene_no_habil);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.migrar_no_habil_manual() to authenticated;

notify pgrst, 'reload schema';
