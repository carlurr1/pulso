-- ════════════════════════════════════════════════════════════════
--  31 · Productividad con tiempo REAL disponible + pausa Backoffice
--  Modelo:
--   · Tiempo NETO disponible = turno (disponible_min del Excel, ya sin
--     almuerzo/break) − backoffice − baño.  (backoffice y baño son
--     tiempo en que la persona NO estaba disponible para lo medible.)
--   · Tiempo PRODUCTIVO = gestiones + capacitación + reunión interna.
--     (capacitación y reunión son funciones que pide ETB → suman.)
--   · Productividad = productivo / neto  (tope 100%).
--  Además: nueva pausa 'backoffice' y coordinadores fuera de "En línea".
--  Ejecutar después de 30.
-- ════════════════════════════════════════════════════════════════

-- Nueva pausa: backoffice.
alter table public.pausas drop constraint if exists pausas_tipo_check;
alter table public.pausas add constraint pausas_tipo_check
  check (tipo in ('break','almuerzo','reunion','capacitacion','bano','backoffice'));

-- Minutos de un conjunto de tipos de pausa, en un rango/persona/mesa.
create or replace function public.min_pausas(p_desde date, p_hasta date, p_user uuid, p_mesa text, p_tipos text[])
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(
           extract(epoch from (coalesce(p.fin, least(now(), p.inicio + interval '120 minutes')) - p.inicio)) / 60
         )::int, 0)
  from pausas p join usuarios u on u.id = p.user_id
  where p.fecha between p_desde and p_hasta
    and p.tipo = any(p_tipos)
    and (p_user is null or p.user_id = p_user)
    and public.mesa_ok(u.mesa, p_mesa);
$$;

-- Minutos productivos = gestiones + capacitación + reunión interna.
create or replace function public.min_productivo(p_desde date, p_hasta date, p_user uuid, p_mesa text)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select sum(g.minutos) from gestiones g
                   where g.fecha between p_desde and p_hasta
                     and (p_user is null or g.user_id = p_user) and public.mesa_ok(g.mesa, p_mesa)), 0)
       + public.min_pausas(p_desde, p_hasta, p_user, p_mesa, array['capacitacion','reunion']);
$$;

-- Minutos netos disponibles = turno − backoffice − baño.
create or replace function public.min_neto(p_desde date, p_hasta date, p_user uuid, p_mesa text)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0,
    coalesce((select sum(h.disponible_min) from horarios h join usuarios u on u.id = h.user_id
              where h.fecha between p_desde and p_hasta
                and (p_user is null or h.user_id = p_user) and public.mesa_ok(u.mesa, p_mesa)), 0)
    - public.min_pausas(p_desde, p_hasta, p_user, p_mesa, array['backoffice','bano']));
$$;

-- Productividad como % (null si no hay tiempo neto).
create or replace function public.prod_pct(p_desde date, p_hasta date, p_user uuid, p_mesa text)
returns int language sql stable security definer set search_path = public as $$
  select case when public.min_neto(p_desde, p_hasta, p_user, p_mesa) > 0
    then least(100, round(100.0 * public.min_productivo(p_desde, p_hasta, p_user, p_mesa)
                          / public.min_neto(p_desde, p_hasta, p_user, p_mesa)))::int
    else null end;
$$;

-- ── g_kpis con la nueva productividad ─────────────────────────────
create or replace function public.g_kpis(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (gestiones int, minutos int, asignados int, gestionados int, efectividad int, productividad int, alertas int, personas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  with g as (select * from gestiones ge where ge.fecha between p_desde and p_hasta
             and (p_user is null or ge.user_id = p_user) and public.mesa_ok(ge.mesa, p_mesa)),
       a as (select * from asignaciones az where az.fecha between p_desde and p_hasta
             and (p_user is null or az.user_id = p_user) and public.mesa_ok(az.mesa, p_mesa))
  select
    (select count(*) from g)::int,
    (select coalesce(sum(g.minutos),0) from g)::int,
    (select count(*) from a)::int,
    (select count(*) from a where a.estado='gestionado')::int,
    case when (select count(*) from a) > 0 then round(100.0*(select count(*) from a where a.estado='gestionado')/(select count(*) from a))::int else null end,
    public.prod_pct(p_desde, p_hasta, p_user, p_mesa),
    (select count(*) from g join gestiones_catalogo c on c.id=g.tipo_id where g.minutos > c.umbral_min*1.8)::int,
    (select count(distinct g.user_id) from g)::int;
end $$;

-- ── g_tendencia_kpi (productividad diaria con el nuevo modelo) ─────
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
    public.prod_pct(d::date, d::date, p_user, p_mesa)
  from generate_series(p_desde, p_hasta, interval '1 day') d order by d;
end $$;

-- ── g_por_mes (productividad mensual con el nuevo modelo) ──────────
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
    public.prod_pct(mm.m0, mm.m1, null, p_mesa)
  from meses mm order by mm.ym;
end $$;

-- ── Coordinadores fuera de "En línea" ─────────────────────────────
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
  where u.activo and u.rol in ('agente','senior')   -- coordinadores NO aparecen
    and case when public.es_privilegiado() then public.mesa_ok(u.mesa, p_mesa)
             else public.grupo_de(u.mesa) = public.mi_grupo() and u.id <> auth.uid() end
  order by u.nombre;
end $$;

notify pgrst, 'reload schema';
