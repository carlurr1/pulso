-- ════════════════════════════════════════════════════════════════
--  13 · CORRECCIÓN — cifras del tablero en cero
--  Arregla un choque de nombres ("minutos") que hacía fallar g_kpis,
--  g_ranking y g_tendencia (por eso los KPIs y el ranking salían en 0).
--  Ejecutar UNA vez. Es seguro: solo reemplaza funciones.
-- ════════════════════════════════════════════════════════════════

create or replace function public.g_kpis(p_desde date, p_hasta date, p_user uuid default null)
returns table (gestiones int, minutos int, asignados int, gestionados int, efectividad int, productividad int, alertas int, personas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with g as (select * from gestiones where fecha between p_desde and p_hasta and (p_user is null or user_id = p_user)),
       a as (select * from asignaciones where fecha between p_desde and p_hasta and (p_user is null or user_id = p_user)),
       disp as (select coalesce(sum(disponible_min),0) m from horarios where fecha between p_desde and p_hasta and (p_user is null or user_id = p_user))
  select
    (select count(*) from g)::int,
    (select coalesce(sum(g.minutos),0) from g)::int,
    (select count(*) from a)::int,
    (select count(*) from a where a.estado='gestionado')::int,
    case when (select count(*) from a) > 0 then round(100.0*(select count(*) from a where a.estado='gestionado')/(select count(*) from a))::int else null end,
    case when (select m from disp) > 0 then least(100, round(100.0*(select coalesce(sum(g.minutos),0) from g)/(select m from disp)))::int else null end,
    (select count(*) from g join gestiones_catalogo c on c.id=g.tipo_id where g.minutos > c.umbral_min*1.8)::int,
    (select count(distinct g.user_id) from g)::int;
end $$;

create or replace function public.g_ranking(p_desde date, p_hasta date)
returns table (user_id uuid, nombre text, apellido text, cargo text, grupo text, gestiones int, minutos int, asignados int, gestionados int, efectividad int, disponible int, carga int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo,
    case when u.cargo ilike '%senior%' then 'Senior' when u.cargo ilike '%analista%' then 'Analista'
         when u.cargo ilike '%junior%' then 'Junior' else 'Agente' end,
    coalesce((select count(*) from gestiones g where g.user_id=u.id and g.fecha between p_desde and p_hasta),0)::int,
    coalesce((select sum(g.minutos) from gestiones g where g.user_id=u.id and g.fecha between p_desde and p_hasta),0)::int,
    coalesce((select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta),0)::int,
    coalesce((select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta and a.estado='gestionado'),0)::int,
    case when (select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta) > 0
      then round(100.0*(select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta and a.estado='gestionado')
                 /(select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta))::int else null end,
    coalesce((select sum(disponible_min) from horarios h where h.user_id=u.id and h.fecha between p_desde and p_hasta),0)::int,
    case when coalesce((select sum(disponible_min) from horarios h where h.user_id=u.id and h.fecha between p_desde and p_hasta),0) > 0
      then least(150, round(100.0*coalesce((select sum(g.minutos) from gestiones g where g.user_id=u.id and g.fecha between p_desde and p_hasta),0)
                 /(select sum(disponible_min) from horarios h where h.user_id=u.id and h.fecha between p_desde and p_hasta)))::int else null end
  from usuarios u
  where u.activo and u.rol in ('agente','senior')
  order by 7 desc;
end $$;

create or replace function public.g_tendencia(p_desde date, p_hasta date, p_user uuid default null)
returns table (dia date, gestiones int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select d::date,
    coalesce((select count(*) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user)),0)::int,
    coalesce((select sum(g.minutos) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user)),0)::int
  from generate_series(p_desde, p_hasta, interval '1 day') d order by d;
end $$;
