-- ════════════════════════════════════════════════════════════════
--  32 · Usuarios de prueba (capacitación) que NO impactan métricas
--  Estrategia: una mesa OCULTA. Cualquier usuario en una mesa oculta
--  (y sus gestiones/pausas/sesiones) queda fuera de TODO cálculo,
--  porque cada función de métricas ya filtra con mesa_ok(). Solo se
--  ve si explícitamente filtras por esa mesa.
--  Ejecutar después de 31.
-- ════════════════════════════════════════════════════════════════

alter table public.mesas add column if not exists oculta boolean not null default false;

-- Mesa de capacitación (oculta). Asigna los usuarios de prueba a ella.
insert into public.mesas (nombre, orden, grupo, oculta) values ('PRUEBAS', 90, 'PRUEBAS', true)
on conflict (nombre) do update set oculta = true;

-- mesa_ok con exclusión de mesas ocultas cuando el filtro es "Todas".
create or replace function public.mesa_ok(p_fila text, p_filtro text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_filtro is null
      then not exists (select 1 from public.mesas m where m.nombre = p_fila and m.oculta)
    else p_fila = p_filtro
      or exists (select 1 from public.mesas m where m.nombre = p_fila and m.grupo = p_filtro)
  end
$$;

-- "Compañeros" (equipo_estado) también excluye mesas ocultas.
create or replace function public.equipo_estado()
returns table (user_id uuid, nombre text, apellido text, cargo text, estado text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo,
    coalesce(
      (select p.tipo from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null order by p.inicio desc limit 1),
      case when coalesce((select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date) > now() - interval '3 minutes', false)
           then 'online' else 'offline' end
    )
  from usuarios u
  where u.activo and u.rol in ('agente','senior')
    and (public.es_privilegiado() or u.mesa = public.mi_mesa())
    and not exists (select 1 from public.mesas m where m.nombre = u.mesa and m.oculta)
  order by u.nombre;
end $$;

notify pgrst, 'reload schema';
