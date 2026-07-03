-- ════════════════════════════════════════════════════════════════
--  27 · Resumen ejecutivo estilo BI
--  · Metas de efectividad y productividad (para las tarjetas "Meta: X%").
--  · g_por_mes: comportamiento mensual (para la línea de tendencia y
--    las barras "casos por mes" del informe de cierre).
--  Ejecutar después de 26.
-- ════════════════════════════════════════════════════════════════

alter table public.config_operacion
  add column if not exists meta_efectividad   int not null default 85,
  add column if not exists meta_productividad int not null default 80;

-- Comportamiento por mes (hora de Colombia), hasta 12 meses.
create or replace function public.g_por_mes(p_desde date, p_hasta date, p_mesa text default null)
returns table (mes text, gestiones int, casos_cerrados int, minutos int, efectividad int, productividad int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with meses as (
    select to_char(d, 'YYYY-MM') ym, date_trunc('month', d)::date m0,
           (date_trunc('month', d) + interval '1 month - 1 day')::date m1
    from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') d
  )
  select
    to_char(mm.m0, 'Mon-YY'),
    coalesce((select count(*) from gestiones g where g.fecha between mm.m0 and mm.m1 and public.mesa_ok(g.mesa, p_mesa)), 0)::int,
    coalesce((select count(*) from asignaciones a where a.fecha between mm.m0 and mm.m1 and a.estado='gestionado' and public.mesa_ok(a.mesa, p_mesa)), 0)::int,
    coalesce((select sum(g.minutos) from gestiones g where g.fecha between mm.m0 and mm.m1 and public.mesa_ok(g.mesa, p_mesa)), 0)::int,
    (select case when count(*) > 0 then round(100.0 * count(*) filter (where a.estado='gestionado') / count(*))::int else null end
       from asignaciones a where a.fecha between mm.m0 and mm.m1 and public.mesa_ok(a.mesa, p_mesa)),
    (select case when sum(h.disponible_min) > 0
       then least(100, round(100.0 * coalesce((select sum(g.minutos) from gestiones g where g.fecha between mm.m0 and mm.m1 and public.mesa_ok(g.mesa, p_mesa)), 0) / sum(h.disponible_min)))::int
       else null end
       from horarios h join usuarios u on u.id = h.user_id
       where h.fecha between mm.m0 and mm.m1 and public.mesa_ok(u.mesa, p_mesa))
  from meses mm order by mm.ym;
end $$;

notify pgrst, 'reload schema';
