-- ════════════════════════════════════════════════════════════════
--  23 · Paquete de supervisión avanzada
--  · Inasistencia digital: detecta gente con la app abierta pero sin
--    actividad en el PC hace más de 30 min dentro del turno.
--  · Pausas fuera de norma (break >15, almuerzo >60, baño recurrente).
--  · Tiempo de resolución por cliente (asignación → último cierre).
--  · Gestiones por hora del día (mapa de calor).
--  · Metas de gestiones/día por mesa (semáforo en el ranking).
--  Ejecutar después de 22.
-- ════════════════════════════════════════════════════════════════

-- ── Última vez que el PC registró actividad (para inasistencia) ───
alter table public.sesiones add column if not exists activo_cambio_at timestamptz not null default now();

create or replace function public.marca_actividad()
returns trigger language plpgsql as $$
begin
  if new.activo_seg > coalesce(old.activo_seg, 0) then
    new.activo_cambio_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_actividad on public.sesiones;
create trigger trg_actividad before update on public.sesiones
  for each row execute function public.marca_actividad();

-- ── Inasistencia digital AHORA: en línea, sin pausa abierta y sin
--    actividad de PC hace más de 30 minutos ─────────────────────────
create or replace function public.inasistencias_ahora(p_mesa text default null)
returns table (user_id uuid, nombre text, apellido text, cargo text, mesa text, minutos_sin int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo, u.mesa,
    (extract(epoch from (now() - greatest(
      coalesce((select max(s.activo_cambio_at) from sesiones s where s.user_id = u.id and s.inicio::date = current_date), now() - interval '1 day'),
      coalesce((select max(p.fin) from pausas p where p.user_id = u.id and p.fecha = current_date), 'epoch'::timestamptz)
    ))) / 60)::int
  from usuarios u
  where u.activo and u.rol in ('agente','senior')
    and (p_mesa is null or u.mesa = p_mesa)
    -- en línea ahora
    and coalesce((select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date) > now() - interval '3 minutes', false)
    -- sin pausa abierta
    and not exists (select 1 from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null)
    -- sin actividad de PC (ni fin de pausa) hace más de 30 min
    and greatest(
      coalesce((select max(s.activo_cambio_at) from sesiones s where s.user_id = u.id and s.inicio::date = current_date), now() - interval '1 day'),
      coalesce((select max(p.fin) from pausas p where p.user_id = u.id and p.fecha = current_date), 'epoch'::timestamptz)
    ) < now() - interval '30 minutes'
  order by 6 desc;
end $$;

-- ── Pausas fuera de norma en el periodo ───────────────────────────
create or replace function public.e_pausas_norma(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (user_id uuid, nombre text, apellido text, cargo text,
               pausas int, minutos_pausa int, breaks_largos int, almuerzos_largos int, banos int, minutos_bano int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with pp as (
    select p.user_id uid, p.tipo,
      extract(epoch from (coalesce(p.fin, least(now(), p.inicio + interval '60 minutes')) - p.inicio)) / 60 as dur
    from pausas p join usuarios u on u.id = p.user_id
    where p.fecha between p_desde and p_hasta
      and (p_user is null or p.user_id = p_user)
      and (p_mesa is null or u.mesa = p_mesa)
  )
  select u.id, u.nombre, u.apellido, u.cargo,
    count(*)::int,
    round(sum(pp.dur))::int,
    count(*) filter (where pp.tipo = 'break' and pp.dur > 15)::int,
    count(*) filter (where pp.tipo = 'almuerzo' and pp.dur > 60)::int,
    count(*) filter (where pp.tipo = 'bano')::int,
    round(coalesce(sum(pp.dur) filter (where pp.tipo = 'bano'), 0))::int
  from pp join usuarios u on u.id = pp.uid
  group by u.id, u.nombre, u.apellido, u.cargo
  order by (count(*) filter (where pp.tipo = 'break' and pp.dur > 15)
          + count(*) filter (where pp.tipo = 'almuerzo' and pp.dur > 60)) desc, sum(pp.dur) desc;
end $$;

-- ── Tiempo de resolución por cliente ──────────────────────────────
--    De la creación de la asignación al último registro de gestión
--    del caso cerrado. Solo casos reales (excluye REU-/EXT-).
create or replace function public.e_resolucion(p_desde date, p_hasta date, p_mesa text default null)
returns table (cliente text, casos int, prom_dias numeric, max_dias int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with cerrados as (
    select a.numero_caso, a.created_at,
      (select max(g.registrado_at) from gestiones g where g.asignacion_id = a.id) as cierre
    from asignaciones a
    where a.estado = 'gestionado' and a.fecha between p_desde and p_hasta
      and (p_mesa is null or a.mesa = p_mesa)
      and a.numero_caso not like 'REU-%' and a.numero_caso not like 'EXT-%'
  )
  select coalesce(c.cliente, '(sin cliente)'),
    count(*)::int,
    round((avg(extract(epoch from (x.cierre - x.created_at)) / 86400))::numeric, 1),
    ceil(max(extract(epoch from (x.cierre - x.created_at)) / 86400))::int
  from cerrados x
  left join casos_sf c on c.numero_caso = x.numero_caso
  where x.cierre is not null
  group by coalesce(c.cliente, '(sin cliente)')
  order by 3 desc
  limit 12;
end $$;

-- ── Gestiones por hora del día (hora de Colombia) ─────────────────
create or replace function public.e_por_hora(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (hora int, gestiones int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select extract(hour from g.registrado_at at time zone 'America/Bogota')::int,
         count(*)::int, coalesce(sum(g.minutos), 0)::int
  from gestiones g
  where g.fecha between p_desde and p_hasta
    and (p_user is null or g.user_id = p_user)
    and (p_mesa is null or g.mesa = p_mesa)
  group by 1 order by 1;
end $$;

-- ── Metas de gestiones por día, por mesa ──────────────────────────
create table if not exists public.metas_mesa (
  mesa           text primary key references public.mesas(nombre) on delete cascade,
  gestiones_dia  int not null default 0,
  actualizado_at timestamptz not null default now()
);
alter table public.metas_mesa enable row level security;
drop policy if exists metas_select on public.metas_mesa;
create policy metas_select on public.metas_mesa for select using (auth.uid() is not null);
drop policy if exists metas_write on public.metas_mesa;
create policy metas_write on public.metas_mesa for all
  using (public.es_privilegiado()) with check (public.es_privilegiado());

notify pgrst, 'reload schema';
