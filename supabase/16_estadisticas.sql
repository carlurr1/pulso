-- ════════════════════════════════════════════════════════════════
--  16 · Estadísticas de supervisión (tiempo en app / PC, traspasos)
--  Nueva sección "Estadísticas" del panel de coordinación:
--  promedios por persona-día de tiempo en la app, tiempo activo en
--  el PC, gestiones y pausas; serie diaria; y flujo de asignaciones
--  (quién reparte/traspasa a quién).
--  También CONSOLIDA cambios que estaban solo en la base de datos:
--  la columna sesiones.activo_seg y presencia_hoy con minutos_pc.
--  Ejecutar después de 15. Es seguro re-ejecutarlo.
-- ════════════════════════════════════════════════════════════════

-- Tiempo activo en el PC (segundos), acumulado por sesión desde la app.
alter table public.sesiones add column if not exists activo_seg int not null default 0;

-- ── Totales del periodo (para las tarjetas KPI) ───────────────────
create or replace function public.e_stats(p_desde date, p_hasta date, p_user uuid default null)
returns table (
  minutos_app int, minutos_pc int, minutos_pausa int,
  gestiones int, minutos_gestion int,
  personas int, persona_dias int,
  casos_propios int, casos_recibidos int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with s as (select * from sesiones se where se.inicio::date between p_desde and p_hasta and (p_user is null or se.user_id = p_user)),
       g as (select * from gestiones ge where ge.fecha between p_desde and p_hasta and (p_user is null or ge.user_id = p_user)),
       pa as (select * from pausas pz where pz.fecha between p_desde and p_hasta and (p_user is null or pz.user_id = p_user)),
       asg as (select * from asignaciones az where az.fecha between p_desde and p_hasta and (p_user is null or az.user_id = p_user))
  select
    coalesce((select sum(extract(epoch from (coalesce(s.fin, s.ultimo_latido) - s.inicio)) / 60)::int from s), 0),
    coalesce((select (sum(s.activo_seg) / 60)::int from s), 0),
    -- Pausas sin cerrar: se cuentan máximo 60 min para no inflar el histórico.
    coalesce((select sum(extract(epoch from (coalesce(pa.fin, least(now(), pa.inicio + interval '60 minutes')) - pa.inicio)) / 60)::int from pa), 0),
    (select count(*) from g)::int,
    coalesce((select sum(g.minutos) from g), 0)::int,
    (select count(distinct x.user_id) from (select s.user_id from s union select g.user_id from g) x)::int,
    (select count(*) from (select distinct s.user_id, s.inicio::date from s union select distinct g.user_id, g.fecha from g) x)::int,
    (select count(*) from asg where asg.asignado_por = asg.user_id)::int,
    (select count(*) from asg where asg.asignado_por is not null and asg.asignado_por <> asg.user_id)::int;
end $$;

-- ── Serie diaria (para las gráficas) ──────────────────────────────
create or replace function public.e_stats_dia(p_desde date, p_hasta date, p_user uuid default null)
returns table (dia date, minutos_app int, minutos_pc int, gestiones int, minutos_gestion int, personas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select d::date,
    coalesce((select sum(extract(epoch from (coalesce(s.fin, s.ultimo_latido) - s.inicio)) / 60)::int from sesiones s where s.inicio::date = d::date and (p_user is null or s.user_id = p_user)), 0),
    coalesce((select (sum(s.activo_seg) / 60)::int from sesiones s where s.inicio::date = d::date and (p_user is null or s.user_id = p_user)), 0),
    coalesce((select count(*)::int from gestiones g where g.fecha = d::date and (p_user is null or g.user_id = p_user)), 0),
    coalesce((select sum(g.minutos)::int from gestiones g where g.fecha = d::date and (p_user is null or g.user_id = p_user)), 0),
    coalesce((select count(distinct s.user_id)::int from sesiones s where s.inicio::date = d::date and (p_user is null or s.user_id = p_user)), 0)
  from generate_series(p_desde, p_hasta, interval '1 day') d order by d;
end $$;

-- ── Flujo de asignaciones: quién reparte/traspasa a quién ─────────
create or replace function public.e_traspasos(p_desde date, p_hasta date)
returns table (de_nombre text, de_apellido text, de_cargo text, para_nombre text, para_apellido text, para_cargo text, casos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select uo.nombre, uo.apellido, uo.cargo, ud.nombre, ud.apellido, ud.cargo, count(*)::int
  from asignaciones a
  join usuarios uo on uo.id = a.asignado_por
  join usuarios ud on ud.id = a.user_id
  where a.fecha between p_desde and p_hasta
    and a.asignado_por is not null and a.asignado_por <> a.user_id
  group by uo.nombre, uo.apellido, uo.cargo, ud.nombre, ud.apellido, ud.cargo
  order by count(*) desc
  limit 15;
end $$;

-- ── Consolida presencia_hoy con el tiempo activo en PC ────────────
--    (la app ya lee minutos_pc; esta versión lo devuelve oficialmente)
drop function if exists public.presencia_hoy();
create or replace function public.presencia_hoy()
returns table (
  user_id uuid, nombre text, apellido text, cargo text,
  en_linea boolean, ultimo timestamptz,
  minutos_logueado int, minutos_pc int, minutos_pausa int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo,
    coalesce((select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date) > now() - interval '3 minutes', false),
    (select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date),
    coalesce((select sum(extract(epoch from (coalesce(s.fin, s.ultimo_latido) - s.inicio)) / 60)::int from sesiones s where s.user_id = u.id and s.inicio::date = current_date), 0),
    coalesce((select (sum(s.activo_seg) / 60)::int from sesiones s where s.user_id = u.id and s.inicio::date = current_date), 0),
    coalesce((select sum(extract(epoch from (coalesce(p.fin, now()) - p.inicio)) / 60)::int from pausas p where p.user_id = u.id and p.fecha = current_date), 0)
  from usuarios u
  where u.activo and u.rol in ('agente','senior','coordinador')
  order by u.nombre;
end $$;
