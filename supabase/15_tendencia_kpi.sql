-- ════════════════════════════════════════════════════════════════
--  15 · Tendencia diaria de efectividad y productividad
--  Reemplaza en el tablero a la gráfica de gestiones/horas: mezclaba
--  dos escalas distintas en un eje. Efectividad y productividad son
--  porcentajes comparables día a día, con las MISMAS fórmulas que
--  g_kpis (13_fix.sql) pero calculadas por fecha.
--  Ejecutar después de 14.
-- ════════════════════════════════════════════════════════════════

create or replace function public.g_tendencia_kpi(p_desde date, p_hasta date, p_user uuid default null)
returns table (dia date, gestiones int, minutos int, asignados int, gestionados int, efectividad int, productividad int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select d::date,
    coalesce((select count(*) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user)),0)::int,
    coalesce((select sum(g.minutos) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user)),0)::int,
    coalesce((select count(*) from asignaciones a where a.fecha=d::date and (p_user is null or a.user_id=p_user)),0)::int,
    coalesce((select count(*) from asignaciones a where a.fecha=d::date and a.estado='gestionado' and (p_user is null or a.user_id=p_user)),0)::int,
    -- Efectividad del día: % de casos asignados ese día que quedaron gestionados.
    case when (select count(*) from asignaciones a where a.fecha=d::date and (p_user is null or a.user_id=p_user)) > 0
      then round(100.0*(select count(*) from asignaciones a where a.fecha=d::date and a.estado='gestionado' and (p_user is null or a.user_id=p_user))
                 /(select count(*) from asignaciones a where a.fecha=d::date and (p_user is null or a.user_id=p_user)))::int
      else null end,
    -- Productividad del día: % del tiempo disponible del turno que quedó registrado.
    case when coalesce((select sum(h.disponible_min) from horarios h where h.fecha=d::date and (p_user is null or h.user_id=p_user)),0) > 0
      then least(100, round(100.0*coalesce((select sum(g.minutos) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user)),0)
                 /(select sum(h.disponible_min) from horarios h where h.fecha=d::date and (p_user is null or h.user_id=p_user))))::int
      else null end
  from generate_series(p_desde, p_hasta, interval '1 day') d order by d;
end $$;
