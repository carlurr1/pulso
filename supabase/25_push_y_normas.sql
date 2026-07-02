-- ════════════════════════════════════════════════════════════════
--  25 · Web Push (notificaciones con la pestaña cerrada) y
--       normas de pausas configurables
--  · push_subs: la "dirección de entrega" de cada navegador.
--  · config_operacion: umbrales de break/almuerzo editables desde
--    Configuración → Mesas (break queda en 30 min por defecto).
--  · e_pausas_norma ahora lee esos umbrales en vez de 15/60 fijos.
--  Ejecutar después de 24.
--  Además, generar las llaves VAPID y ponerlas en Vercel:
--    npx web-push generate-vapid-keys
--    NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>
--    VAPID_PRIVATE_KEY=<privateKey>
--    VAPID_SUBJECT=mailto:correo-de-contacto@tu-dominio.com
-- ════════════════════════════════════════════════════════════════

-- ── Suscripciones de Web Push (una por navegador/persona) ─────────
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references public.usuarios(id) on delete cascade,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_user on public.push_subs (user_id);
alter table public.push_subs enable row level security;
-- Cada quien registra y borra las suyas. El ENVÍO lo hace el servidor
-- con la service role (omite RLS), nunca el navegador de otro usuario.
drop policy if exists push_own on public.push_subs;
create policy push_own on public.push_subs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Normas de pausas (fila única) ─────────────────────────────────
create table if not exists public.config_operacion (
  id               int primary key default 1 check (id = 1),
  break_max_min    int not null default 30,
  almuerzo_max_min int not null default 60,
  actualizado_at   timestamptz not null default now()
);
insert into public.config_operacion (id) values (1) on conflict (id) do nothing;
alter table public.config_operacion enable row level security;
drop policy if exists cfg_select on public.config_operacion;
create policy cfg_select on public.config_operacion for select using (auth.uid() is not null);
drop policy if exists cfg_write on public.config_operacion;
create policy cfg_write on public.config_operacion for update
  using (public.es_privilegiado()) with check (public.es_privilegiado());

-- ── Pausas fuera de norma con umbrales configurables ──────────────
create or replace function public.e_pausas_norma(p_desde date, p_hasta date, p_user uuid default null, p_mesa text default null)
returns table (user_id uuid, nombre text, apellido text, cargo text,
               pausas int, minutos_pausa int, breaks_largos int, almuerzos_largos int, banos int, minutos_bano int)
language plpgsql stable security definer set search_path = public as $$
declare v_break int; v_alm int;
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  select break_max_min, almuerzo_max_min into v_break, v_alm from config_operacion where id = 1;
  v_break := coalesce(v_break, 30); v_alm := coalesce(v_alm, 60);
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
    count(*) filter (where pp.tipo = 'break' and pp.dur > v_break)::int,
    count(*) filter (where pp.tipo = 'almuerzo' and pp.dur > v_alm)::int,
    count(*) filter (where pp.tipo = 'bano')::int,
    round(coalesce(sum(pp.dur) filter (where pp.tipo = 'bano'), 0))::int
  from pp join usuarios u on u.id = pp.uid
  group by u.id, u.nombre, u.apellido, u.cargo
  order by (count(*) filter (where pp.tipo = 'break' and pp.dur > v_break)
          + count(*) filter (where pp.tipo = 'almuerzo' and pp.dur > v_alm)) desc, sum(pp.dur) desc;
end $$;

notify pgrst, 'reload schema';
