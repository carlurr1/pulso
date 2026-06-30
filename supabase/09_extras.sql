-- ════════════════════════════════════════════════════════════════
--  09 · Pausas (break/almuerzo) y Sesiones (presencia / tiempo logueado)
--  Ejecutar después de 01–08.
-- ════════════════════════════════════════════════════════════════

-- ── Pausas: break y almuerzo ──────────────────────────────────────
create table public.pausas (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  fecha   date not null default current_date,
  tipo    text not null check (tipo in ('break','almuerzo')),
  inicio  timestamptz not null default now(),
  fin     timestamptz
);
alter table public.pausas enable row level security;
create policy pausas_select on public.pausas for select using (user_id = auth.uid() or public.es_privilegiado());
create policy pausas_insert on public.pausas for insert with check (user_id = auth.uid());
create policy pausas_update on public.pausas for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Sesiones: para medir tiempo logueado y presencia ──────────────
create table public.sesiones (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.usuarios(id) on delete cascade,
  inicio        timestamptz not null default now(),
  ultimo_latido timestamptz not null default now(),
  fin           timestamptz
);
alter table public.sesiones enable row level security;
create policy sesiones_select on public.sesiones for select using (user_id = auth.uid() or public.es_privilegiado());
create policy sesiones_insert on public.sesiones for insert with check (user_id = auth.uid());
create policy sesiones_update on public.sesiones for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Presencia de hoy (solo privilegiados): en línea, tiempo logueado, pausas ──
create or replace function public.presencia_hoy()
returns table (
  user_id uuid, nombre text, apellido text, cargo text,
  en_linea boolean, ultimo timestamptz, minutos_logueado int, minutos_pausa int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo,
    coalesce((select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date) > now() - interval '3 minutes', false),
    (select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date),
    coalesce((select sum(extract(epoch from (coalesce(s.fin, s.ultimo_latido) - s.inicio)) / 60)::int from sesiones s where s.user_id = u.id and s.inicio::date = current_date), 0),
    coalesce((select sum(extract(epoch from (coalesce(p.fin, now()) - p.inicio)) / 60)::int from pausas p where p.user_id = u.id and p.fecha = current_date), 0)
  from usuarios u
  where u.activo and u.rol in ('agente','senior','coordinador')
  order by u.nombre;
end $$;
