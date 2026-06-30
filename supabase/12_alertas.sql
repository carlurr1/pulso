-- ════════════════════════════════════════════════════════════════
--  12 · Alertas en tiempo real ("Te necesito")
--  El admin/coordinador envía un aviso corto a una persona y le llega
--  al instante. Ejecutar después de 01–11.
-- ════════════════════════════════════════════════════════════════

create table public.alertas (
  id           uuid primary key default gen_random_uuid(),
  para_user_id uuid not null references public.usuarios(id) on delete cascade,
  de_user_id   uuid references public.usuarios(id) on delete set null,
  de_nombre    text,
  mensaje      text not null,
  leida        boolean not null default false,
  created_at   timestamptz not null default now()
);
create index alertas_para_idx on public.alertas (para_user_id, leida);

alter table public.alertas enable row level security;

-- El destinatario ve y marca como leídas las suyas; los privilegiados ven todas.
create policy alertas_select on public.alertas for select
  using (para_user_id = auth.uid() or public.es_privilegiado());
-- Solo privilegiados (admin/coordinador) pueden enviar alertas.
create policy alertas_insert on public.alertas for insert
  with check (public.es_privilegiado());
-- El destinatario marca como leída la suya.
create policy alertas_update on public.alertas for update
  using (para_user_id = auth.uid()) with check (para_user_id = auth.uid());

-- Habilita Realtime para que la alerta llegue al instante.
alter publication supabase_realtime add table public.alertas;
