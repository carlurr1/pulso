-- ════════════════════════════════════════════════════════════════
--  11 · Filtro por persona en las métricas gerenciales
--  Reemplaza las funciones g_* agregando un parámetro opcional p_user.
--  Si p_user es NULL → todo el equipo (como hasta ahora).
--  Ejecutar después de 07.
-- ════════════════════════════════════════════════════════════════

drop function if exists public.g_kpis(date, date);
drop function if exists public.g_por_tipo(date, date);
drop function if exists public.g_tendencia(date, date);
drop function if exists public.g_por_cliente(date, date);
drop function if exists public.g_por_tipo_caso(date, date);

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
    (select coalesce(sum(minutos),0) from g)::int,
    (select count(*) from a)::int,
    (select count(*) from a where estado='gestionado')::int,
    case when (select count(*) from a) > 0 then round(100.0*(select count(*) from a where estado='gestionado')/(select count(*) from a))::int else null end,
    case when (select m from disp) > 0 then least(100, round(100.0*(select coalesce(sum(minutos),0) from g)/(select m from disp)))::int else null end,
    (select count(*) from g join gestiones_catalogo c on c.id=g.tipo_id where g.minutos > c.umbral_min*1.8)::int,
    (select count(distinct user_id) from g)::int;
end $$;

create or replace function public.g_por_tipo(p_desde date, p_hasta date, p_user uuid default null)
returns table (nombre text, categoria text, total int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select c.nombre, c.categoria, count(g.id)::int, coalesce(sum(g.minutos),0)::int
  from gestiones g join gestiones_catalogo c on c.id=g.tipo_id
  where g.fecha between p_desde and p_hasta and (p_user is null or g.user_id = p_user)
  group by c.nombre, c.categoria order by count(g.id) desc;
end $$;

create or replace function public.g_tendencia(p_desde date, p_hasta date, p_user uuid default null)
returns table (dia date, gestiones int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select d::date,
    coalesce((select count(*) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user)),0)::int,
    coalesce((select sum(minutos) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user)),0)::int
  from generate_series(p_desde, p_hasta, interval '1 day') d order by d;
end $$;

create or replace function public.g_por_cliente(p_desde date, p_hasta date, p_user uuid default null)
returns table (cliente text, casos int, gestiones int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select coalesce(c.cliente,'(sin cliente)'),
    count(distinct g.numero_caso)::int, count(*)::int, coalesce(sum(g.minutos),0)::int
  from gestiones g left join casos_sf c on c.numero_caso=g.numero_caso
  where g.fecha between p_desde and p_hasta and (p_user is null or g.user_id=p_user)
  group by coalesce(c.cliente,'(sin cliente)')
  order by sum(g.minutos) desc nulls last limit 15;
end $$;

create or replace function public.g_por_tipo_caso(p_desde date, p_hasta date, p_user uuid default null)
returns table (etiqueta text, casos int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select coalesce(c.tipo,'(sin tipo)'),
    count(distinct g.numero_caso)::int, coalesce(sum(g.minutos),0)::int
  from gestiones g join casos_sf c on c.numero_caso=g.numero_caso
  where g.fecha between p_desde and p_hasta and (p_user is null or g.user_id=p_user)
  group by coalesce(c.tipo,'(sin tipo)')
  order by sum(g.minutos) desc nulls last limit 10;
end $$;
