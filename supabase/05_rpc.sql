-- ════════════════════════════════════════════════════════════════
--  05 · RPC de métricas (cálculo en el servidor)
--  Estas funciones son la ÚNICA forma de obtener totales/agregados.
--  Se ejecutan solo para roles privilegiados → el agente jamás obtiene
--  un acumulado de su tiempo (que es lo que lleva a inflar minutos).
-- ════════════════════════════════════════════════════════════════

-- ── Métricas por persona para una fecha ───────────────────────────
create or replace function public.metricas_personas(p_fecha date default current_date)
returns table (
  user_id uuid, nombre text, apellido text, cargo text, grupo text,
  asignados int, gestionados int, efectividad int,
  minutos int, disponible int, productividad int,
  llamadas int, demanda text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with base as (
    select u.id, u.nombre, u.apellido, u.cargo,
      case
        when u.cargo ilike '%senior%'   then 'Senior'
        when u.cargo ilike '%analista%' then 'Analista'
        when u.cargo ilike '%junior%'   then 'Junior'
        else 'Agente' end as grupo,
      (select count(*) from asignaciones a where a.user_id=u.id and a.fecha=p_fecha) as asg,
      (select count(*) from asignaciones a where a.user_id=u.id and a.fecha=p_fecha and a.estado='gestionado') as ges,
      coalesce((select sum(g.minutos) from gestiones g where g.user_id=u.id and g.fecha=p_fecha),0) as mins,
      coalesce((select h.disponible_min from horarios h where h.user_id=u.id and h.fecha=p_fecha),480) as disp,
      (select count(*) from gestiones g join gestiones_catalogo c on c.id=g.tipo_id
        where g.user_id=u.id and g.fecha=p_fecha and c.nombre ilike 'RECEPCIÓN DE LLAMADA%') as llam
    from usuarios u
    where u.activo and u.rol in ('agente','senior')
  )
  select b.id, b.nombre, b.apellido, b.cargo, b.grupo,
    b.asg::int, b.ges::int,
    case when b.asg>0 then round(100.0*b.ges/b.asg)::int else null end,
    b.mins::int, b.disp::int,
    least(100, round(100.0*b.mins/nullif(b.disp,0)))::int,
    b.llam::int,
    case
      when (b.asg + b.llam) >= 9 then 'ALTO'
      when (b.asg + b.llam) >= 5 then 'MEDIO'
      when (b.asg + b.llam) >= 1 then 'BAJO'
      else 'SIN DEMANDA' end
  from base b
  order by b.nombre;
end $$;

-- ── Resumen por rol (efectividad / productividad promedio) ─────────
create or replace function public.metricas_por_rol(p_fecha date default current_date)
returns table (rol text, efectividad int, productividad int, personas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select m.grupo,
    round(avg(m.efectividad) filter (where m.efectividad is not null))::int,
    round(avg(m.productividad))::int,
    count(*)::int
  from public.metricas_personas(p_fecha) m
  group by m.grupo order by m.grupo;
end $$;

-- ── Gestiones por tipo en el día ──────────────────────────────────
create or replace function public.gestiones_por_tipo(p_fecha date default current_date)
returns table (nombre text, categoria text, total int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select c.nombre, c.categoria, count(g.id)::int
  from gestiones g join gestiones_catalogo c on c.id = g.tipo_id
  where g.fecha = p_fecha
  group by c.nombre, c.categoria order by count(g.id) desc;
end $$;

-- ── Tendencia: gestiones por día (últimos N días) ─────────────────
create or replace function public.tendencia(p_dias int default 7)
returns table (dia date, total int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select d::date, coalesce((select count(*) from gestiones g where g.fecha = d::date),0)::int
  from generate_series(current_date - (p_dias-1), current_date, interval '1 day') d
  order by d;
end $$;
