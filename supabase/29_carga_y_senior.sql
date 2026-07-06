-- ════════════════════════════════════════════════════════════════
--  29 · Carga de casos por persona + supervisión del senior
--  · carga_equipo: asignados/gestionados/pendientes por persona en un
--    rango — para la vista "Carga" (coordinadores y seniors).
--  · presencia_hoy e inasistencias_ahora ahora también para el SENIOR,
--    limitado a su grupo de mesa (supervisa a su equipo en línea).
--  · El senior puede enviar alertas a la gente de su grupo.
--  Ejecutar después de 28.
-- ════════════════════════════════════════════════════════════════

-- ── Carga de casos por persona ────────────────────────────────────
create or replace function public.carga_equipo(p_desde date, p_hasta date, p_mesa text default null)
returns table (user_id uuid, nombre text, apellido text, cargo text, mesa text,
               asignados int, gestionados int, pendientes int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_privilegiado() or public.mi_rol() = 'senior') then
    raise exception 'No autorizado';
  end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo, u.mesa,
    coalesce((select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta),0)::int,
    coalesce((select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta and a.estado='gestionado'),0)::int,
    coalesce((select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta and a.estado<>'gestionado'),0)::int,
    coalesce((select sum(g.minutos) from gestiones g where g.user_id=u.id and g.fecha between p_desde and p_hasta),0)::int
  from usuarios u
  where u.activo and u.rol in ('agente','senior')
    -- privilegiado: filtra por mesa/grupo; senior: SIEMPRE solo su grupo
    and case when public.es_privilegiado() then public.mesa_ok(u.mesa, p_mesa)
             else public.grupo_de(u.mesa) = public.mi_grupo() end
  order by 6 desc;
end $$;

-- ── Presencia: el senior ve a SU grupo ────────────────────────────
drop function if exists public.presencia_hoy(text);
create or replace function public.presencia_hoy(p_mesa text default null)
returns table (
  user_id uuid, nombre text, apellido text, cargo text, mesa text,
  en_linea boolean, ultimo timestamptz,
  minutos_logueado int, minutos_pc int, minutos_pausa int,
  pausa_tipo text, pausa_desde timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_privilegiado() or public.mi_rol() = 'senior') then
    raise exception 'No autorizado';
  end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo, u.mesa,
    coalesce((select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date) > now() - interval '3 minutes', false),
    (select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date),
    coalesce((select sum(extract(epoch from (coalesce(s.fin, s.ultimo_latido) - s.inicio)) / 60)::int from sesiones s where s.user_id = u.id and s.inicio::date = current_date), 0),
    coalesce((select (sum(s.activo_seg) / 60)::int from sesiones s where s.user_id = u.id and s.inicio::date = current_date), 0),
    coalesce((select sum(extract(epoch from (coalesce(p.fin, now()) - p.inicio)) / 60)::int from pausas p where p.user_id = u.id and p.fecha = current_date), 0),
    (select p.tipo from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null order by p.inicio desc limit 1),
    (select p.inicio from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null order by p.inicio desc limit 1)
  from usuarios u
  where u.activo and u.rol in ('agente','senior','coordinador')
    and case when public.es_privilegiado() then public.mesa_ok(u.mesa, p_mesa)
             else public.grupo_de(u.mesa) = public.mi_grupo() and u.id <> auth.uid() end
  order by u.nombre;
end $$;

-- ── Inasistencia digital: también para el senior (su grupo) ───────
create or replace function public.inasistencias_ahora(p_mesa text default null)
returns table (user_id uuid, nombre text, apellido text, cargo text, mesa text, minutos_sin int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_privilegiado() or public.mi_rol() = 'senior') then
    raise exception 'No autorizado';
  end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo, u.mesa,
    (extract(epoch from (now() - greatest(
      coalesce((select max(s.activo_cambio_at) from sesiones s where s.user_id = u.id and s.inicio::date = current_date), now() - interval '1 day'),
      coalesce((select max(p.fin) from pausas p where p.user_id = u.id and p.fecha = current_date), 'epoch'::timestamptz)
    ))) / 60)::int
  from usuarios u
  where u.activo and u.rol in ('agente','senior')
    and case when public.es_privilegiado() then public.mesa_ok(u.mesa, p_mesa)
             else public.grupo_de(u.mesa) = public.mi_grupo() and u.id <> auth.uid() end
    and coalesce((select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date) > now() - interval '3 minutes', false)
    and not exists (select 1 from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null)
    and greatest(
      coalesce((select max(s.activo_cambio_at) from sesiones s where s.user_id = u.id and s.inicio::date = current_date), now() - interval '1 day'),
      coalesce((select max(p.fin) from pausas p where p.user_id = u.id and p.fecha = current_date), 'epoch'::timestamptz)
    ) < now() - interval '30 minutes'
  order by 6 desc;
end $$;

-- ── El senior puede alertar a la gente de su grupo ────────────────
drop policy if exists alertas_insert on public.alertas;
create policy alertas_insert on public.alertas for insert
  with check (
    public.es_privilegiado()
    or (public.mi_rol() = 'senior'
        and public.grupo_de((select u.mesa from public.usuarios u where u.id = para_user_id)) = public.mi_grupo())
  );

notify pgrst, 'reload schema';
