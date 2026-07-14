-- ════════════════════════════════════════════════════════════════
--  45 · ANÁLISIS DE CAPACIDAD (demanda vs. personal)
--  · Resumen para evaluar si la carga es acorde al número de personas:
--     - casos del periodo (distintos, sin reuniones/otros segmentos),
--     - minutos de gestión (demanda productiva),
--     - minutos disponibles del turno (capacidad, ya sin almuerzo/break),
--     - días con actividad y persona-días con horario.
--  · Con eso la app calcula casos/día, tiempo por caso, ocupación y las
--    personas necesarias para una meta de ocupación dada.
--  · Senior (su grupo) y coordinación. El detalle por TIPO de gestión sale
--    de g_por_tipo (solo privilegiados).
--  Ejecutar después de 44.
-- ════════════════════════════════════════════════════════════════

create or replace function public.carga_capacidad(p_desde date, p_hasta date, p_mesa text default null)
returns table (
  dias int, persona_dias int, personas int, casos int, gestiones int,
  min_gestion int, min_capacidad int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_privilegiado() or public.mi_rol() = 'senior') then
    raise exception 'No autorizado';
  end if;
  return query
  select
    -- días distintos con gestión (para promediar "por día")
    (select count(distinct g.fecha) from gestiones g
       where g.fecha between p_desde and p_hasta and public.mesa_ok(g.mesa, p_mesa))::int,
    -- persona-días con turno disponible (capacidad repartida)
    (select count(*) from (
       select distinct h.user_id, h.fecha from horarios h join usuarios u on u.id = h.user_id
       where h.fecha between p_desde and p_hasta and coalesce(h.disponible_min, 0) > 0
         and public.mesa_ok(u.mesa, p_mesa)) pd)::int,
    -- personas activas de la mesa/grupo
    (select count(*) from usuarios u
       where u.activo and u.rol in ('agente','senior') and public.mesa_ok(u.mesa, p_mesa))::int,
    -- casos distintos trabajados (excluye reuniones REU- y otros segmentos EXT-)
    (select count(distinct a.numero_caso) from asignaciones a
       where a.fecha between p_desde and p_hasta and public.mesa_ok(a.mesa, p_mesa)
         and a.numero_caso not like 'REU-%' and a.numero_caso not like 'EXT-%')::int,
    -- gestiones y minutos (demanda)
    (select count(*) from gestiones g
       where g.fecha between p_desde and p_hasta and public.mesa_ok(g.mesa, p_mesa))::int,
    (select coalesce(sum(g.minutos), 0) from gestiones g
       where g.fecha between p_desde and p_hasta and public.mesa_ok(g.mesa, p_mesa))::int,
    -- minutos disponibles del turno (capacidad neta)
    (select coalesce(sum(h.disponible_min), 0) from horarios h join usuarios u on u.id = h.user_id
       where h.fecha between p_desde and p_hasta and public.mesa_ok(u.mesa, p_mesa))::int;
end $$;
grant execute on function public.carga_capacidad(date, date, text) to authenticated;

notify pgrst, 'reload schema';
