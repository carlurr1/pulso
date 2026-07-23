-- ════════════════════════════════════════════════════════════════
--  48 · SEMÁFORO DE GESTIÓN (flujo diario + distribución por antigüedad)
--  · flujo_diario: por día, cuántos casos ingresaron, se cerraron y
--    cuántos quedan pendientes (backlog) al final del día.
--  · distribucion_antiguedad: los casos ABIERTOS hoy, por estado y por
--    días de antigüedad (para el pivote tipo semáforo).
--  · "Ingreso" = primera asignación del caso; "cierre" = fecha de la
--    última gestión del caso ya gestionado. Excluye reuniones (REU-) y
--    otros segmentos (EXT-). Solo coordinación.
--  Ejecutar después de 47.
-- ════════════════════════════════════════════════════════════════

create or replace function public.flujo_diario(p_desde date, p_hasta date, p_mesa text default null)
returns table (dia date, ingresos int, cierres int, pendientes int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with casos as (
    select a.numero_caso, min(a.fecha) as entrada, bool_or(a.estado = 'gestionado') as cerrado
    from asignaciones a
    where public.mesa_ok(a.mesa, p_mesa)
      and a.numero_caso not like 'REU-%' and a.numero_caso not like 'EXT-%'
    group by a.numero_caso
  ),
  cerr as (
    select a.numero_caso, max(g.registrado_at)::date as cierre
    from asignaciones a join gestiones g on g.asignacion_id = a.id
    where a.estado = 'gestionado' and public.mesa_ok(a.mesa, p_mesa)
    group by a.numero_caso
  ),
  f as (
    select c.numero_caso, c.entrada,
           case when c.cerrado then ce.cierre else null end as cierre
    from casos c left join cerr ce on ce.numero_caso = c.numero_caso
  )
  select d::date,
    (select count(*) from f where f.entrada = d::date)::int,
    (select count(*) from f where f.cierre = d::date)::int,
    (select count(*) from f where f.entrada <= d::date and (f.cierre is null or f.cierre > d::date))::int
  from generate_series(p_desde, p_hasta, interval '1 day') d
  order by d;
end $$;
grant execute on function public.flujo_diario(date, date, text) to authenticated;

create or replace function public.distribucion_antiguedad(p_mesa text default null)
returns table (estado text, dias int, casos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with abiertos as (
    select a.numero_caso, min(a.fecha) as entrada,
      case when bool_or(a.estado = 'progreso') then 'progreso' else 'pendiente' end as estado
    from asignaciones a
    where public.mesa_ok(a.mesa, p_mesa)
      and a.numero_caso not like 'REU-%' and a.numero_caso not like 'EXT-%'
    group by a.numero_caso
    having not bool_or(a.estado = 'gestionado')
  )
  select ab.estado, (current_date - ab.entrada)::int as dias, count(*)::int
  from abiertos ab
  group by ab.estado, (current_date - ab.entrada)
  order by dias;
end $$;
grant execute on function public.distribucion_antiguedad(text) to authenticated;

notify pgrst, 'reload schema';
