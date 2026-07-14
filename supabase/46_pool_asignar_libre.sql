-- ════════════════════════════════════════════════════════════════
--  46 · ASIGNACIÓN LIBRE DESDE EL CONTENEDOR GENERAL
--  · En el "Contenedor general" cualquier senior (o coordinación) puede
--    asignar un caso a CUALQUIER ingeniero activo, sin la restricción de
--    mesa/grupo de pool_asignar. Sirve para cubrir a una mesa cuyo senior
--    no está (ej. un senior de Premium 3 pasa un caso a un ingeniero de
--    Premium 2).
--  · Solo desde esta vista (senior/coordinación); el reparto normal por
--    mesa/grupo sigue con sus reglas.
--  Ejecutar después de 45.
-- ════════════════════════════════════════════════════════════════

create or replace function public.pool_asignar_libre(p_pools uuid[], p_destino uuid)
returns int language plpgsql security definer set search_path = public as $$
declare pid uuid; v record; n int := 0;
begin
  if not (public.es_privilegiado() or public.mi_rol() = 'senior') then
    raise exception 'No autorizado';
  end if;
  if p_pools is null then return 0; end if;
  if not exists (select 1 from usuarios u where u.id = p_destino and u.activo and u.rol in ('agente','senior')) then
    raise exception 'Destino inválido';
  end if;
  foreach pid in array p_pools loop
    select * into v from casos_pool where id = pid and estado = 'pendiente' for update;
    if found then
      update casos_pool set estado = 'asignado', asignado_a = p_destino,
        asignado_por = auth.uid(), asignado_at = now() where id = pid;
      insert into asignaciones (user_id, numero_caso, asignado_por)
        values (p_destino, v.numero_caso, auth.uid())
        on conflict (fecha, user_id, numero_caso) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
grant execute on function public.pool_asignar_libre(uuid[], uuid) to authenticated;

-- Lista de TODOS los ingenieros activos (para el desplegable del contenedor
-- general): un senior normalmente solo ve su grupo, pero aquí necesita a
-- todos para poder repartir a cualquier mesa. Solo senior/coordinación.
create or replace function public.ingenieros_todos()
returns table (id uuid, nombre text, apellido text, cargo text, mesa text, rol text, activo boolean)
language sql stable security definer set search_path = public as $$
  select u.id, u.nombre, u.apellido, u.cargo, u.mesa, u.rol, u.activo
  from public.usuarios u
  where u.activo and u.rol in ('agente','senior')
    and (public.es_privilegiado() or public.mi_rol() = 'senior')
  order by u.mesa, u.nombre
$$;
grant execute on function public.ingenieros_todos() to authenticated;

notify pgrst, 'reload schema';
