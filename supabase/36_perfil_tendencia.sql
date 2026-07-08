-- ════════════════════════════════════════════════════════════════
--  36 · Tendencia del perfil (últimos N días de una persona)
--  Alimenta la gráfica de evolución en el perfil que se abre al hacer
--  clic en un nombre. Misma autorización que perfil_dia.
--  Ejecutar después de 35.
-- ════════════════════════════════════════════════════════════════

create or replace function public.perfil_tendencia(p_user uuid, p_dias int default 14)
returns table (dia date, gestiones int, minutos int, casos int)
language plpgsql stable security definer set search_path = public as $$
declare v_mesa text;
begin
  select mesa into v_mesa from usuarios where id = p_user;
  if not (
    public.es_privilegiado()
    or (public.mi_rol() = 'senior' and public.grupo_de(v_mesa) = public.mi_grupo())
    or p_user = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;
  return query
  select d::date,
    coalesce((select count(*) from gestiones g where g.user_id = p_user and g.fecha = d::date), 0)::int,
    coalesce((select sum(g.minutos) from gestiones g where g.user_id = p_user and g.fecha = d::date), 0)::int,
    coalesce((select count(*) from asignaciones a where a.user_id = p_user and a.fecha = d::date), 0)::int
  from generate_series(current_date - (greatest(p_dias, 1) - 1), current_date, interval '1 day') d
  order by d;
end $$;
grant execute on function public.perfil_tendencia(uuid, int) to authenticated;

notify pgrst, 'reload schema';
