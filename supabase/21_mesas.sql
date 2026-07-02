-- ════════════════════════════════════════════════════════════════
--  21 · MULTI-MESA (Fase 1): Mayoristas, Gold, Premium, …
--  · Catálogo de mesas + mesa obligatoria en usuarios.
--  · La mesa se FOTOGRAFÍA en cada gestión/asignación al crearla,
--    para que el histórico respete las rotaciones de personal.
--  · Todos los RPC gerenciales aceptan p_mesa (null = todas).
--  · El senior solo puede asignar/reasignar dentro de SU mesa (RLS).
--  · equipo_estado (barra Compañeros) muestra solo la mesa propia.
--  · Los anuncios pueden dirigirse a una mesa o a toda la operación.
--  Ejecutar después de 20.
-- ════════════════════════════════════════════════════════════════

-- ── Catálogo de mesas ─────────────────────────────────────────────
create table if not exists public.mesas (
  nombre     text primary key,
  orden      int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.mesas enable row level security;
drop policy if exists mesas_select on public.mesas;
create policy mesas_select on public.mesas for select using (auth.uid() is not null);
drop policy if exists mesas_admin on public.mesas;
create policy mesas_admin on public.mesas for all
  using (public.es_admin()) with check (public.es_admin());

insert into public.mesas (nombre, orden) values
  ('MAYORISTAS', 1), ('GOLD', 2), ('PREMIUM', 3)
on conflict (nombre) do nothing;

-- Los usuarios actuales quedan en Mayoristas.
update public.usuarios set mesa = 'MAYORISTAS' where mesa is null;

-- ── Mesa del usuario autenticado ──────────────────────────────────
create or replace function public.mi_mesa()
returns text language sql stable security definer set search_path = public
as $$ select mesa from public.usuarios where id = auth.uid() $$;

-- ── Directorio visible: el equipo necesita ver nombres/cargos/mesa
--    (repartir, traspasos, compañeros). Formaliza lo que la operación
--    ya usa. Los datos sensibles siguen aparte (empleado_documento).
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select
  using (auth.uid() is not null);

-- ── Fotografía de la mesa en cada registro ────────────────────────
alter table public.asignaciones add column if not exists mesa text;
alter table public.gestiones    add column if not exists mesa text;
alter table public.anuncios     add column if not exists mesa text;   -- null = toda la operación

create or replace function public.stamp_mesa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.mesa is null then
    select u.mesa into new.mesa from public.usuarios u where u.id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_mesa_asig on public.asignaciones;
create trigger trg_mesa_asig before insert on public.asignaciones
  for each row execute function public.stamp_mesa();
drop trigger if exists trg_mesa_gest on public.gestiones;
create trigger trg_mesa_gest before insert on public.gestiones
  for each row execute function public.stamp_mesa();

-- Backfill del histórico con la mesa actual de cada persona.
update public.asignaciones a set mesa = u.mesa from public.usuarios u where u.id = a.user_id and a.mesa is null;
update public.gestiones    g set mesa = u.mesa from public.usuarios u where u.id = g.user_id and g.mesa is null;

create index if not exists idx_asignaciones_mesa on public.asignaciones (mesa, fecha);
create index if not exists idx_gestiones_mesa    on public.gestiones (mesa, fecha);

-- ── El senior solo opera dentro de su mesa (RLS) ──────────────────
drop policy if exists asig_insert on public.asignaciones;
create policy asig_insert on public.asignaciones for insert
  with check (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior'
        and (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa())
  );
drop policy if exists asig_update on public.asignaciones;
create policy asig_update on public.asignaciones for update
  using (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior'
        and (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa())
  )
  with check (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior'
        and (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa())
  );
drop policy if exists asig_delete on public.asignaciones;
create policy asig_delete on public.asignaciones for delete
  using (
    public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior'
        and (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa())
  );

-- ── Compañeros: cada quien ve solo su mesa (privilegiados ven todo) ─
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
  order by u.nombre;
end $$;

-- ════════════════════════════════════════════════════════════════
--  RPCs gerenciales con filtro de mesa (p_mesa null = todas).
--  gestiones/asignaciones filtran por su mesa FOTOGRAFIADA;
--  horarios/sesiones/pausas por la mesa ACTUAL de la persona.
-- ════════════════════════════════════════════════════════════════

drop function if exists public.g_kpis(date, date, uuid);
create or replace function public.g_kpis(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (gestiones int, minutos int, asignados int, gestionados int, efectividad int, productividad int, alertas int, personas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with g as (select * from gestiones ge where ge.fecha between p_desde and p_hasta
             and (p_user is null or ge.user_id = p_user) and (p_mesa is null or ge.mesa = p_mesa)),
       a as (select * from asignaciones az where az.fecha between p_desde and p_hasta
             and (p_user is null or az.user_id = p_user) and (p_mesa is null or az.mesa = p_mesa)),
       disp as (select coalesce(sum(h.disponible_min),0) m from horarios h
                join usuarios u on u.id = h.user_id
                where h.fecha between p_desde and p_hasta
                and (p_user is null or h.user_id = p_user) and (p_mesa is null or u.mesa = p_mesa))
  select
    (select count(*) from g)::int,
    (select coalesce(sum(g.minutos),0) from g)::int,
    (select count(*) from a)::int,
    (select count(*) from a where a.estado='gestionado')::int,
    case when (select count(*) from a) > 0 then round(100.0*(select count(*) from a where a.estado='gestionado')/(select count(*) from a))::int else null end,
    case when (select m from disp) > 0 then least(100, round(100.0*(select coalesce(sum(g.minutos),0) from g)/(select m from disp)))::int else null end,
    (select count(*) from g join gestiones_catalogo c on c.id=g.tipo_id where g.minutos > c.umbral_min*1.8)::int,
    (select count(distinct g.user_id) from g)::int;
end $$;

drop function if exists public.g_ranking(date, date);
create or replace function public.g_ranking(p_desde date, p_hasta date, p_mesa text default null)
returns table (user_id uuid, nombre text, apellido text, cargo text, grupo text, gestiones int, minutos int, asignados int, gestionados int, efectividad int, disponible int, carga int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo,
    case when u.cargo ilike '%senior%' then 'Senior' when u.cargo ilike '%analista%' then 'Analista'
         when u.cargo ilike '%junior%' then 'Junior' else 'Agente' end,
    coalesce((select count(*) from gestiones g where g.user_id=u.id and g.fecha between p_desde and p_hasta),0)::int,
    coalesce((select sum(g.minutos) from gestiones g where g.user_id=u.id and g.fecha between p_desde and p_hasta),0)::int,
    coalesce((select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta),0)::int,
    coalesce((select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta and a.estado='gestionado'),0)::int,
    case when (select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta) > 0
      then round(100.0*(select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta and a.estado='gestionado')
                 /(select count(*) from asignaciones a where a.user_id=u.id and a.fecha between p_desde and p_hasta))::int else null end,
    coalesce((select sum(h.disponible_min) from horarios h where h.user_id=u.id and h.fecha between p_desde and p_hasta),0)::int,
    case when coalesce((select sum(h.disponible_min) from horarios h where h.user_id=u.id and h.fecha between p_desde and p_hasta),0) > 0
      then least(150, round(100.0*coalesce((select sum(g.minutos) from gestiones g where g.user_id=u.id and g.fecha between p_desde and p_hasta),0)
                 /(select sum(h.disponible_min) from horarios h where h.user_id=u.id and h.fecha between p_desde and p_hasta)))::int else null end
  from usuarios u
  where u.activo and u.rol in ('agente','senior')
    and (p_mesa is null or u.mesa = p_mesa)
  order by 7 desc;
end $$;

drop function if exists public.g_por_rol(date, date);
create or replace function public.g_por_rol(p_desde date, p_hasta date, p_mesa text default null)
returns table (rol text, efectividad int, carga int, personas int, gestiones int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select r.grupo,
    round(avg(r.efectividad) filter (where r.efectividad is not null))::int,
    round(avg(r.carga) filter (where r.carga is not null))::int,
    count(*)::int, sum(r.gestiones)::int
  from public.g_ranking(p_desde, p_hasta, p_mesa) r
  group by r.grupo order by r.grupo;
end $$;

drop function if exists public.g_por_tipo(date, date, uuid);
create or replace function public.g_por_tipo(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (nombre text, categoria text, total int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select c.nombre, c.categoria, count(g.id)::int, coalesce(sum(g.minutos),0)::int
  from gestiones g join gestiones_catalogo c on c.id=g.tipo_id
  where g.fecha between p_desde and p_hasta
    and (p_user is null or g.user_id = p_user) and (p_mesa is null or g.mesa = p_mesa)
  group by c.nombre, c.categoria order by count(g.id) desc;
end $$;

drop function if exists public.g_tendencia_kpi(date, date, uuid);
create or replace function public.g_tendencia_kpi(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (dia date, gestiones int, minutos int, asignados int, gestionados int, efectividad int, productividad int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select d::date,
    coalesce((select count(*) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user) and (p_mesa is null or g.mesa=p_mesa)),0)::int,
    coalesce((select sum(g.minutos) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user) and (p_mesa is null or g.mesa=p_mesa)),0)::int,
    coalesce((select count(*) from asignaciones a where a.fecha=d::date and (p_user is null or a.user_id=p_user) and (p_mesa is null or a.mesa=p_mesa)),0)::int,
    coalesce((select count(*) from asignaciones a where a.fecha=d::date and a.estado='gestionado' and (p_user is null or a.user_id=p_user) and (p_mesa is null or a.mesa=p_mesa)),0)::int,
    case when (select count(*) from asignaciones a where a.fecha=d::date and (p_user is null or a.user_id=p_user) and (p_mesa is null or a.mesa=p_mesa)) > 0
      then round(100.0*(select count(*) from asignaciones a where a.fecha=d::date and a.estado='gestionado' and (p_user is null or a.user_id=p_user) and (p_mesa is null or a.mesa=p_mesa))
                 /(select count(*) from asignaciones a where a.fecha=d::date and (p_user is null or a.user_id=p_user) and (p_mesa is null or a.mesa=p_mesa)))::int
      else null end,
    case when coalesce((select sum(h.disponible_min) from horarios h join usuarios u on u.id=h.user_id
                        where h.fecha=d::date and (p_user is null or h.user_id=p_user) and (p_mesa is null or u.mesa=p_mesa)),0) > 0
      then least(100, round(100.0*coalesce((select sum(g.minutos) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user) and (p_mesa is null or g.mesa=p_mesa)),0)
                 /(select sum(h.disponible_min) from horarios h join usuarios u on u.id=h.user_id
                   where h.fecha=d::date and (p_user is null or h.user_id=p_user) and (p_mesa is null or u.mesa=p_mesa))))::int
      else null end
  from generate_series(p_desde, p_hasta, interval '1 day') d order by d;
end $$;

drop function if exists public.g_por_cliente(date, date, uuid);
create or replace function public.g_por_cliente(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (cliente text, casos int, gestiones int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select coalesce(c.cliente,'(sin cliente)'),
    count(distinct g.numero_caso)::int, count(*)::int, coalesce(sum(g.minutos),0)::int
  from gestiones g left join casos_sf c on c.numero_caso=g.numero_caso
  where g.fecha between p_desde and p_hasta
    and (p_user is null or g.user_id=p_user) and (p_mesa is null or g.mesa=p_mesa)
  group by coalesce(c.cliente,'(sin cliente)')
  order by sum(g.minutos) desc nulls last limit 15;
end $$;

drop function if exists public.g_top_casos(date, date, uuid);
create or replace function public.g_top_casos(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (numero_caso text, cliente text, gestiones int, personas int, dias int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select g.numero_caso, c.cliente,
         count(*)::int, count(distinct g.user_id)::int, count(distinct g.fecha)::int,
         coalesce(sum(g.minutos),0)::int
  from gestiones g
  left join casos_sf c on c.numero_caso = g.numero_caso
  where g.fecha between p_desde and p_hasta
    and (p_user is null or g.user_id = p_user) and (p_mesa is null or g.mesa = p_mesa)
    and g.numero_caso not like 'REU-%' and g.numero_caso not like 'EXT-%'
  group by g.numero_caso, c.cliente
  order by sum(g.minutos) desc
  limit 10;
end $$;

drop function if exists public.e_stats(date, date, uuid);
create or replace function public.e_stats(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
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
  with mm as (select id from usuarios uu where p_mesa is null or uu.mesa = p_mesa),
       s as (select * from sesiones se where se.inicio::date between p_desde and p_hasta
             and (p_user is null or se.user_id = p_user) and se.user_id in (select id from mm)),
       g as (select * from gestiones ge where ge.fecha between p_desde and p_hasta
             and (p_user is null or ge.user_id = p_user) and (p_mesa is null or ge.mesa = p_mesa)),
       pa as (select * from pausas pz where pz.fecha between p_desde and p_hasta
             and (p_user is null or pz.user_id = p_user) and pz.user_id in (select id from mm)),
       asg as (select * from asignaciones az where az.fecha between p_desde and p_hasta
             and (p_user is null or az.user_id = p_user) and (p_mesa is null or az.mesa = p_mesa))
  select
    coalesce((select sum(extract(epoch from (coalesce(s.fin, s.ultimo_latido) - s.inicio)) / 60)::int from s), 0),
    coalesce((select (sum(s.activo_seg) / 60)::int from s), 0),
    coalesce((select sum(extract(epoch from (coalesce(pa.fin, least(now(), pa.inicio + interval '60 minutes')) - pa.inicio)) / 60)::int from pa), 0),
    (select count(*) from g)::int,
    coalesce((select sum(g.minutos) from g), 0)::int,
    (select count(distinct x.user_id) from (select s.user_id from s union select g.user_id from g) x)::int,
    (select count(*) from (select distinct s.user_id, s.inicio::date from s union select distinct g.user_id, g.fecha from g) x)::int,
    (select count(*) from asg where asg.asignado_por = asg.user_id)::int,
    (select count(*) from asg where asg.asignado_por is not null and asg.asignado_por <> asg.user_id)::int;
end $$;

drop function if exists public.e_stats_dia(date, date, uuid);
create or replace function public.e_stats_dia(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (dia date, minutos_app int, minutos_pc int, gestiones int, minutos_gestion int, personas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select d::date,
    coalesce((select sum(extract(epoch from (coalesce(s.fin, s.ultimo_latido) - s.inicio)) / 60)::int from sesiones s
              where s.inicio::date = d::date and (p_user is null or s.user_id = p_user)
              and (p_mesa is null or exists (select 1 from usuarios u where u.id = s.user_id and u.mesa = p_mesa))), 0),
    coalesce((select (sum(s.activo_seg) / 60)::int from sesiones s
              where s.inicio::date = d::date and (p_user is null or s.user_id = p_user)
              and (p_mesa is null or exists (select 1 from usuarios u where u.id = s.user_id and u.mesa = p_mesa))), 0),
    coalesce((select count(*)::int from gestiones g where g.fecha = d::date and (p_user is null or g.user_id = p_user) and (p_mesa is null or g.mesa = p_mesa)), 0),
    coalesce((select sum(g.minutos)::int from gestiones g where g.fecha = d::date and (p_user is null or g.user_id = p_user) and (p_mesa is null or g.mesa = p_mesa)), 0),
    coalesce((select count(distinct s.user_id)::int from sesiones s
              where s.inicio::date = d::date and (p_user is null or s.user_id = p_user)
              and (p_mesa is null or exists (select 1 from usuarios u where u.id = s.user_id and u.mesa = p_mesa))), 0)
  from generate_series(p_desde, p_hasta, interval '1 day') d order by d;
end $$;

drop function if exists public.e_traspasos(date, date);
create or replace function public.e_traspasos(p_desde date, p_hasta date, p_mesa text default null)
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
    and (p_mesa is null or a.mesa = p_mesa)
  group by uo.nombre, uo.apellido, uo.cargo, ud.nombre, ud.apellido, ud.cargo
  order by count(*) desc
  limit 15;
end $$;

drop function if exists public.presencia_hoy();
create or replace function public.presencia_hoy(p_mesa text default null)
returns table (
  user_id uuid, nombre text, apellido text, cargo text, mesa text,
  en_linea boolean, ultimo timestamptz,
  minutos_logueado int, minutos_pc int, minutos_pausa int,
  pausa_tipo text, pausa_desde timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
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
    and (p_mesa is null or u.mesa = p_mesa)
  order by u.nombre;
end $$;

notify pgrst, 'reload schema';
