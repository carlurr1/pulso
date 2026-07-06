-- ════════════════════════════════════════════════════════════════
--  30 · Perfil de persona (al hacer clic desde "En línea")
--  Devuelve en un solo JSON: datos de la persona, su horario del día,
--  sus casos del día (con estado y cliente) y sus gestiones del día.
--  Autorizado a privilegiados (cualquiera) y al senior (solo su grupo).
--  Ejecutar después de 29.
-- ════════════════════════════════════════════════════════════════

create or replace function public.perfil_dia(p_user uuid, p_fecha date default current_date)
returns json
language plpgsql stable security definer set search_path = public as $$
declare v_mesa text; v_out json;
begin
  select mesa into v_mesa from usuarios where id = p_user;
  if not (
    public.es_privilegiado()
    or (public.mi_rol() = 'senior' and public.grupo_de(v_mesa) = public.mi_grupo())
    or p_user = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  select json_build_object(
    'usuario', (select json_build_object('id', u.id, 'nombre', u.nombre, 'apellido', u.apellido,
                        'cargo', u.cargo, 'mesa', u.mesa, 'login', u.login, 'code', u.code)
                from usuarios u where u.id = p_user),
    'horario', (select json_build_object('turno', h.turno, 'disponible_min', h.disponible_min)
                from horarios h where h.user_id = p_user and h.fecha = p_fecha),
    'casos', (select coalesce(json_agg(json_build_object(
                        'numero_caso', a.numero_caso, 'estado', a.estado,
                        'cliente', c.cliente, 'fecha', a.fecha) order by a.created_at), '[]'::json)
              from asignaciones a left join casos_sf c on c.numero_caso = a.numero_caso
              where a.user_id = p_user and a.fecha = p_fecha),
    'gestiones', (select coalesce(json_agg(json_build_object(
                        'numero_caso', g.numero_caso, 'minutos', g.minutos,
                        'tipo', gc.nombre, 'registrado_at', g.registrado_at) order by g.registrado_at desc), '[]'::json)
                  from gestiones g left join gestiones_catalogo gc on gc.id = g.tipo_id
                  where g.user_id = p_user and g.fecha = p_fecha),
    'resumen', (select json_build_object(
                        'gestiones', count(*), 'minutos', coalesce(sum(g.minutos),0))
                from gestiones g where g.user_id = p_user and g.fecha = p_fecha)
  ) into v_out;
  return v_out;
end $$;

notify pgrst, 'reload schema';
