-- ════════════════════════════════════════════════════════════════
--  14 · Top de casos que más tiempo consumen (tablero gerencial)
--  Reemplaza en el tablero a g_por_tipo_caso: el campo Type de los
--  casos en el Salesforce de ETB viene vacío, así que agrupar por
--  tipo no aporta. Este top detecta reincidencia: casos puntuales
--  que acumulan horas, cuántas gestiones/personas/días llevan.
--  Ejecutar después de 13.
-- ════════════════════════════════════════════════════════════════

create or replace function public.g_top_casos(p_desde date, p_hasta date, p_user uuid default null)
returns table (numero_caso text, cliente text, gestiones int, personas int, dias int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select g.numero_caso,
         c.cliente,
         count(*)::int,
         count(distinct g.user_id)::int,
         count(distinct g.fecha)::int,
         coalesce(sum(g.minutos),0)::int
  from gestiones g
  left join casos_sf c on c.numero_caso = g.numero_caso
  where g.fecha between p_desde and p_hasta
    and (p_user is null or g.user_id = p_user)
    and g.numero_caso not like 'REU-%'   -- reuniones/internas
    and g.numero_caso not like 'EXT-%'   -- otro segmento
  group by g.numero_caso, c.cliente
  order by sum(g.minutos) desc
  limit 10;
end $$;
