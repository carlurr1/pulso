-- ════════════════════════════════════════════════════════════════
--  17 · Pausas tipificadas y estado del equipo visible para todos
--  · Nuevos tipos de pausa: reunión interna y capacitación (con
--    botón propio, ya no se registran como "gestión").
--  · presencia_hoy ahora dice QUÉ pausa tiene abierta cada persona.
--  · equipo_estado(): estado simple (en línea / break / almuerzo /
--    reunión / capacitación / desconectado) visible para CUALQUIER
--    usuario autenticado — la barra de "Compañeros" del agente.
--    No expone tiempos ni métricas, solo el estado actual.
--  Ejecutar después de 16.
-- ════════════════════════════════════════════════════════════════

-- Amplía los tipos de pausa permitidos.
alter table public.pausas drop constraint if exists pausas_tipo_check;
alter table public.pausas add constraint pausas_tipo_check
  check (tipo in ('break','almuerzo','reunion','capacitacion'));

-- ── presencia_hoy con el tipo de pausa abierta ────────────────────
drop function if exists public.presencia_hoy();
create or replace function public.presencia_hoy()
returns table (
  user_id uuid, nombre text, apellido text, cargo text,
  en_linea boolean, ultimo timestamptz,
  minutos_logueado int, minutos_pc int, minutos_pausa int,
  pausa_tipo text, pausa_desde timestamptz
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
    coalesce((select sum(extract(epoch from (coalesce(p.fin, now()) - p.inicio)) / 60)::int from pausas p where p.user_id = u.id and p.fecha = current_date), 0),
    (select p.tipo from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null order by p.inicio desc limit 1),
    (select p.inicio from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null order by p.inicio desc limit 1)
  from usuarios u
  where u.activo and u.rol in ('agente','senior','coordinador')
  order by u.nombre;
end $$;

-- ── Estado del equipo, visible para todos los autenticados ────────
create or replace function public.equipo_estado()
returns table (user_id uuid, nombre text, apellido text, cargo text, estado text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo,
    coalesce(
      -- pausa abierta manda sobre "en línea"
      (select p.tipo from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null order by p.inicio desc limit 1),
      case when coalesce((select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date) > now() - interval '3 minutes', false)
           then 'online' else 'offline' end
    )
  from usuarios u
  where u.activo and u.rol in ('agente','senior')
  order by u.nombre;
end $$;

-- Refresca el caché de esquema del API.
notify pgrst, 'reload schema';
