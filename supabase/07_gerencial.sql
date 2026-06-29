-- ════════════════════════════════════════════════════════════════
--  07 · Métricas gerenciales con rango de fechas
--  Todas exigen rol privilegiado. Base del tablero 360 del admin.
--  Ejecutar después de 01–06.
-- ════════════════════════════════════════════════════════════════

-- ── KPIs globales del periodo ─────────────────────────────────────
create or replace function public.g_kpis(p_desde date, p_hasta date)
returns table (
  gestiones int, minutos int, asignados int, gestionados int,
  efectividad int, productividad int, alertas int, personas int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with g as (
    select * from gestiones where fecha between p_desde and p_hasta
  ), a as (
    select * from asignaciones where fecha between p_desde and p_hasta
  ), disp as (
    select coalesce(sum(disponible_min),0) m from horarios where fecha between p_desde and p_hasta
  )
  select
    (select count(*) from g)::int,
    (select coalesce(sum(minutos),0) from g)::int,
    (select count(*) from a)::int,
    (select count(*) from a where estado='gestionado')::int,
    case when (select count(*) from a) > 0
      then round(100.0*(select count(*) from a where estado='gestionado')/(select count(*) from a))::int else null end,
    case when (select m from disp) > 0
      then least(100, round(100.0*(select coalesce(sum(minutos),0) from g)/(select m from disp)))::int else null end,
    (select count(*) from g join gestiones_catalogo c on c.id=g.tipo_id where g.minutos > c.umbral_min*1.8)::int,
    (select count(distinct user_id) from g)::int;
end $$;

-- ── Ranking de personas (comparación + carga + cumplimiento) ──────
create or replace function public.g_ranking(p_desde date, p_hasta date)
returns table (
  user_id uuid, nombre text, apellido text, cargo text, grupo text,
  gestiones int, minutos int, asignados int, gestionados int,
  efectividad int, disponible int, carga int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo,
    case when u.cargo ilike '%senior%' then 'Senior'
         when u.cargo ilike '%analista%' then 'Analista'
         when u.cargo ilike '%junior%' then 'Junior' else 'Agente' end,
    coalesce((select count(*) from gestiones g where g.user_id=u.id and g.fecha between p_desde and p_hasta),0)::int,
    coalesce((select sum(minutos) from gestiones g where g.user_id=u.id and g.fecha between p_desde and p_hasta),0)::int,
    coalesce((select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta),0)::int,
    coalesce((select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta and a.estado='gestionado'),0)::int,
    case when (select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta) > 0
      then round(100.0*(select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta and a.estado='gestionado')
                 /(select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta))::int else null end,
    coalesce((select sum(disponible_min) from horarios h where h.user_id=u.id and h.fecha between p_desde and p_hasta),0)::int,
    case when coalesce((select sum(disponible_min) from horarios h where h.user_id=u.id and h.fecha between p_desde and p_hasta),0) > 0
      then least(150, round(100.0*coalesce((select sum(minutos) from gestiones g where g.user_id=u.id and g.fecha between p_desde and p_hasta),0)
                 /(select sum(disponible_min) from horarios h where h.user_id=u.id and h.fecha between p_desde and p_hasta)))::int else null end
  from usuarios u
  where u.activo and u.rol in ('agente','senior')
  order by 7 desc;  -- por minutos
end $$;

-- ── Por rol (cargo) ───────────────────────────────────────────────
create or replace function public.g_por_rol(p_desde date, p_hasta date)
returns table (rol text, efectividad int, carga int, personas int, gestiones int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select r.grupo,
    round(avg(r.efectividad) filter (where r.efectividad is not null))::int,
    round(avg(r.carga) filter (where r.carga is not null))::int,
    count(*)::int, sum(r.gestiones)::int
  from public.g_ranking(p_desde, p_hasta) r
  group by r.grupo order by r.grupo;
end $$;

-- ── Gestiones por tipo ────────────────────────────────────────────
create or replace function public.g_por_tipo(p_desde date, p_hasta date)
returns table (nombre text, categoria text, total int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select c.nombre, c.categoria, count(g.id)::int, coalesce(sum(g.minutos),0)::int
  from gestiones g join gestiones_catalogo c on c.id=g.tipo_id
  where g.fecha between p_desde and p_hasta
  group by c.nombre, c.categoria order by count(g.id) desc;
end $$;

-- ── Tendencia diaria (gestiones + minutos) ────────────────────────
create or replace function public.g_tendencia(p_desde date, p_hasta date)
returns table (dia date, gestiones int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select d::date,
    coalesce((select count(*) from gestiones g where g.fecha=d::date),0)::int,
    coalesce((select sum(minutos) from gestiones g where g.fecha=d::date),0)::int
  from generate_series(p_desde, p_hasta, interval '1 day') d
  order by d;
end $$;

-- ── Por cliente (Salesforce) ──────────────────────────────────────
create or replace function public.g_por_cliente(p_desde date, p_hasta date)
returns table (cliente text, casos int, gestiones int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select coalesce(c.cliente,'(sin cliente)'),
    count(distinct g.numero_caso)::int, count(*)::int, coalesce(sum(g.minutos),0)::int
  from gestiones g left join casos_sf c on c.numero_caso=g.numero_caso
  where g.fecha between p_desde and p_hasta
  group by coalesce(c.cliente,'(sin cliente)')
  order by sum(g.minutos) desc nulls last limit 15;
end $$;

-- ── Por tipo / prioridad del caso (Salesforce) ────────────────────
create or replace function public.g_por_tipo_caso(p_desde date, p_hasta date)
returns table (etiqueta text, casos int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select coalesce(c.tipo,'(sin tipo)'),
    count(distinct g.numero_caso)::int, coalesce(sum(g.minutos),0)::int
  from gestiones g join casos_sf c on c.numero_caso=g.numero_caso
  where g.fecha between p_desde and p_hasta
  group by coalesce(c.tipo,'(sin tipo)')
  order by sum(g.minutos) desc nulls last limit 10;
end $$;
