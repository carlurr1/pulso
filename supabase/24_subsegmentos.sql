-- ════════════════════════════════════════════════════════════════
--  24 · SUBSEGMENTOS (Premium 1..4, Silver n…) + CONTENEDOR GENERAL
--  · Cada subsegmento ES una mesa (hereda senior propio, compañeros,
--    métricas y RLS), agrupada bajo un GRUPO (Premium, Silver…).
--  · Los filtros gerenciales aceptan una mesa O un grupo completo.
--  · Contenedor general por mesa: un agente de Premium 2 que crea un
--    caso de Premium 3 lo envía al contenedor de Premium 3; el senior
--    de esa mesa lo asigna a su gente. Fin de semana: cualquiera del
--    grupo puede tomárselo a sí mismo.
--  Ejecutar después de 23.
-- ════════════════════════════════════════════════════════════════

-- ── Grupo de mesas ────────────────────────────────────────────────
alter table public.mesas add column if not exists grupo text;
update public.mesas set grupo = nombre where grupo is null;

-- Subsegmentos de Premium (Silver se agrega desde Configuración → Mesas
-- indicando el grupo SILVER, según cuántos sean).
insert into public.mesas (nombre, orden, grupo) values
  ('PREMIUM 1', 31, 'PREMIUM'), ('PREMIUM 2', 32, 'PREMIUM'),
  ('PREMIUM 3', 33, 'PREMIUM'), ('PREMIUM 4', 34, 'PREMIUM')
on conflict (nombre) do nothing;

create or replace function public.grupo_de(p_mesa text)
returns text language sql stable security definer set search_path = public
as $$ select coalesce(grupo, nombre) from public.mesas where nombre = p_mesa $$;

create or replace function public.mi_grupo()
returns text language sql stable security definer set search_path = public
as $$ select public.grupo_de(public.mi_mesa()) $$;

-- ¿La mesa de la fila pasa el filtro? (filtro null = todas;
--  el filtro puede ser una mesa exacta o un GRUPO completo)
create or replace function public.mesa_ok(p_fila text, p_filtro text)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_filtro is null
      or p_fila = p_filtro
      or exists (select 1 from public.mesas m where m.nombre = p_fila and m.grupo = p_filtro)
$$;

-- ── CONTENEDOR GENERAL por mesa ───────────────────────────────────
create table if not exists public.casos_pool (
  id           uuid primary key default gen_random_uuid(),
  mesa         text not null references public.mesas(nombre),
  numero_caso  text not null,
  creado_por   uuid references public.usuarios(id) on delete set null,
  estado       text not null default 'pendiente' check (estado in ('pendiente','asignado')),
  asignado_a   uuid references public.usuarios(id),
  asignado_por uuid references public.usuarios(id),
  created_at   timestamptz not null default now(),
  asignado_at  timestamptz
);
create index if not exists idx_pool_mesa on public.casos_pool (mesa, estado);
alter table public.casos_pool enable row level security;

-- Lo ven los privilegiados y cualquier miembro del GRUPO de esa mesa.
drop policy if exists pool_select on public.casos_pool;
create policy pool_select on public.casos_pool for select
  using (public.es_privilegiado() or public.grupo_de(mesa) = public.mi_grupo());
-- Cualquiera autenticado puede ENVIAR un caso a un contenedor.
drop policy if exists pool_insert on public.casos_pool;
create policy pool_insert on public.casos_pool for insert
  with check (creado_por = auth.uid());
-- La asignación/toma se hace SOLO vía RPC (abajo). Privilegiados pueden borrar.
drop policy if exists pool_delete on public.casos_pool;
create policy pool_delete on public.casos_pool for delete
  using (public.es_privilegiado());

-- Asignar (senior/privilegiado) o tomarse (agente) un caso del contenedor.
create or replace function public.pool_asignar(p_pool uuid, p_destino uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v record; permitido boolean; finde boolean;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  select * into v from casos_pool where id = p_pool and estado = 'pendiente' for update;
  if not found then raise exception 'Este caso ya fue tomado o asignado.'; end if;
  finde := extract(isodow from now() at time zone 'America/Bogota') in (6, 7);
  permitido :=
    public.es_privilegiado()
    -- senior de la mesa del contenedor, asignando a alguien de esa mesa
    or (public.mi_rol() = 'senior' and public.mi_mesa() = v.mesa
        and (select u.mesa from usuarios u where u.id = p_destino) = v.mesa)
    -- tomárselo uno mismo: de su propia mesa siempre; de otra mesa del
    -- grupo solo el fin de semana
    or (p_destino = auth.uid() and (
          public.mi_mesa() = v.mesa
          or (public.grupo_de(v.mesa) = public.mi_grupo() and finde)
        ));
  if not permitido then
    raise exception 'No autorizado: este contenedor lo asigna el senior de la mesa (o tómalo tú mismo si es de tu mesa, o de tu grupo en fin de semana).';
  end if;
  update casos_pool set estado = 'asignado', asignado_a = p_destino,
    asignado_por = auth.uid(), asignado_at = now() where id = p_pool;
  insert into asignaciones (user_id, numero_caso, asignado_por)
  values (p_destino, v.numero_caso, auth.uid())
  on conflict (fecha, user_id, numero_caso) do nothing;
end $$;

-- ════════════════════════════════════════════════════════════════
--  Filtros gerenciales: ahora aceptan mesa o GRUPO (via mesa_ok).
--  Mismas firmas — solo cambian los cuerpos.
-- ════════════════════════════════════════════════════════════════

create or replace function public.g_kpis(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (gestiones int, minutos int, asignados int, gestionados int, efectividad int, productividad int, alertas int, personas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with g as (select * from gestiones ge where ge.fecha between p_desde and p_hasta
             and (p_user is null or ge.user_id = p_user) and public.mesa_ok(ge.mesa, p_mesa)),
       a as (select * from asignaciones az where az.fecha between p_desde and p_hasta
             and (p_user is null or az.user_id = p_user) and public.mesa_ok(az.mesa, p_mesa)),
       disp as (select coalesce(sum(h.disponible_min),0) m from horarios h
                join usuarios u on u.id = h.user_id
                where h.fecha between p_desde and p_hasta
                and (p_user is null or h.user_id = p_user) and public.mesa_ok(u.mesa, p_mesa))
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
    and public.mesa_ok(u.mesa, p_mesa)
  order by 7 desc;
end $$;

create or replace function public.g_por_tipo(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (nombre text, categoria text, total int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select c.nombre, c.categoria, count(g.id)::int, coalesce(sum(g.minutos),0)::int
  from gestiones g join gestiones_catalogo c on c.id=g.tipo_id
  where g.fecha between p_desde and p_hasta
    and (p_user is null or g.user_id = p_user) and public.mesa_ok(g.mesa, p_mesa)
  group by c.nombre, c.categoria order by count(g.id) desc;
end $$;

create or replace function public.g_tendencia_kpi(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (dia date, gestiones int, minutos int, asignados int, gestionados int, efectividad int, productividad int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select d::date,
    coalesce((select count(*) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user) and public.mesa_ok(g.mesa, p_mesa)),0)::int,
    coalesce((select sum(g.minutos) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user) and public.mesa_ok(g.mesa, p_mesa)),0)::int,
    coalesce((select count(*) from asignaciones a where a.fecha=d::date and (p_user is null or a.user_id=p_user) and public.mesa_ok(a.mesa, p_mesa)),0)::int,
    coalesce((select count(*) from asignaciones a where a.fecha=d::date and a.estado='gestionado' and (p_user is null or a.user_id=p_user) and public.mesa_ok(a.mesa, p_mesa)),0)::int,
    case when (select count(*) from asignaciones a where a.fecha=d::date and (p_user is null or a.user_id=p_user) and public.mesa_ok(a.mesa, p_mesa)) > 0
      then round(100.0*(select count(*) from asignaciones a where a.fecha=d::date and a.estado='gestionado' and (p_user is null or a.user_id=p_user) and public.mesa_ok(a.mesa, p_mesa))
                 /(select count(*) from asignaciones a where a.fecha=d::date and (p_user is null or a.user_id=p_user) and public.mesa_ok(a.mesa, p_mesa)))::int
      else null end,
    case when coalesce((select sum(h.disponible_min) from horarios h join usuarios u on u.id=h.user_id
                        where h.fecha=d::date and (p_user is null or h.user_id=p_user) and public.mesa_ok(u.mesa, p_mesa)),0) > 0
      then least(100, round(100.0*coalesce((select sum(g.minutos) from gestiones g where g.fecha=d::date and (p_user is null or g.user_id=p_user) and public.mesa_ok(g.mesa, p_mesa)),0)
                 /(select sum(h.disponible_min) from horarios h join usuarios u on u.id=h.user_id
                   where h.fecha=d::date and (p_user is null or h.user_id=p_user) and public.mesa_ok(u.mesa, p_mesa))))::int
      else null end
  from generate_series(p_desde, p_hasta, interval '1 day') d order by d;
end $$;

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
    and (p_user is null or g.user_id=p_user) and public.mesa_ok(g.mesa, p_mesa)
  group by coalesce(c.cliente,'(sin cliente)')
  order by sum(g.minutos) desc nulls last limit 15;
end $$;

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
    and (p_user is null or g.user_id = p_user) and public.mesa_ok(g.mesa, p_mesa)
    and g.numero_caso not like 'REU-%' and g.numero_caso not like 'EXT-%'
  group by g.numero_caso, c.cliente
  order by sum(g.minutos) desc
  limit 10;
end $$;

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
  with mm as (select id from usuarios uu where public.mesa_ok(uu.mesa, p_mesa)),
       s as (select * from sesiones se where se.inicio::date between p_desde and p_hasta
             and (p_user is null or se.user_id = p_user) and se.user_id in (select id from mm)),
       g as (select * from gestiones ge where ge.fecha between p_desde and p_hasta
             and (p_user is null or ge.user_id = p_user) and public.mesa_ok(ge.mesa, p_mesa)),
       pa as (select * from pausas pz where pz.fecha between p_desde and p_hasta
             and (p_user is null or pz.user_id = p_user) and pz.user_id in (select id from mm)),
       asg as (select * from asignaciones az where az.fecha between p_desde and p_hasta
             and (p_user is null or az.user_id = p_user) and public.mesa_ok(az.mesa, p_mesa))
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

create or replace function public.e_stats_dia(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (dia date, minutos_app int, minutos_pc int, gestiones int, minutos_gestion int, personas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select d::date,
    coalesce((select sum(extract(epoch from (coalesce(s.fin, s.ultimo_latido) - s.inicio)) / 60)::int from sesiones s join usuarios u on u.id = s.user_id
              where s.inicio::date = d::date and (p_user is null or s.user_id = p_user) and public.mesa_ok(u.mesa, p_mesa)), 0),
    coalesce((select (sum(s.activo_seg) / 60)::int from sesiones s join usuarios u on u.id = s.user_id
              where s.inicio::date = d::date and (p_user is null or s.user_id = p_user) and public.mesa_ok(u.mesa, p_mesa)), 0),
    coalesce((select count(*)::int from gestiones g where g.fecha = d::date and (p_user is null or g.user_id = p_user) and public.mesa_ok(g.mesa, p_mesa)), 0),
    coalesce((select sum(g.minutos)::int from gestiones g where g.fecha = d::date and (p_user is null or g.user_id = p_user) and public.mesa_ok(g.mesa, p_mesa)), 0),
    coalesce((select count(distinct s.user_id)::int from sesiones s join usuarios u on u.id = s.user_id
              where s.inicio::date = d::date and (p_user is null or s.user_id = p_user) and public.mesa_ok(u.mesa, p_mesa)), 0)
  from generate_series(p_desde, p_hasta, interval '1 day') d order by d;
end $$;

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
    and public.mesa_ok(a.mesa, p_mesa)
  group by uo.nombre, uo.apellido, uo.cargo, ud.nombre, ud.apellido, ud.cargo
  order by count(*) desc
  limit 15;
end $$;

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
    and public.mesa_ok(u.mesa, p_mesa)
  order by u.nombre;
end $$;

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
    and public.mesa_ok(u.mesa, p_mesa)
    and coalesce((select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date) > now() - interval '3 minutes', false)
    and not exists (select 1 from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null)
    and greatest(
      coalesce((select max(s.activo_cambio_at) from sesiones s where s.user_id = u.id and s.inicio::date = current_date), now() - interval '1 day'),
      coalesce((select max(p.fin) from pausas p where p.user_id = u.id and p.fecha = current_date), 'epoch'::timestamptz)
    ) < now() - interval '30 minutes'
  order by 6 desc;
end $$;

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
      and public.mesa_ok(u.mesa, p_mesa)
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
      and public.mesa_ok(a.mesa, p_mesa)
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
    and public.mesa_ok(g.mesa, p_mesa)
  group by 1 order by 1;
end $$;

notify pgrst, 'reload schema';
