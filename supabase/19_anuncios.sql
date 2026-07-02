-- ════════════════════════════════════════════════════════════════
--  19 · Anuncios anclados con confirmación de lectura
--  El coordinador/superadmin publica un anuncio para todo el equipo
--  (ej. "Recuerden la evaluación mensual"). A cada agente/senior le
--  sale una ventana BLOQUEANTE al conectarse (o al instante si está
--  conectado) y no se quita hasta que confirme con "Enterado" o con
--  una respuesta escrita si el anuncio la exige. El coordinador ve
--  quién confirmó y qué respondió.
--  Ejecutar después de 18.
-- ════════════════════════════════════════════════════════════════

create table public.anuncios (
  id                 uuid primary key default gen_random_uuid(),
  de_user_id         uuid references public.usuarios(id) on delete set null,
  de_nombre          text,
  mensaje            text not null,
  requiere_respuesta boolean not null default false,
  activo             boolean not null default true,
  created_at         timestamptz not null default now()
);

create table public.anuncio_confirmaciones (
  anuncio_id    uuid not null references public.anuncios(id) on delete cascade,
  user_id       uuid not null references public.usuarios(id) on delete cascade,
  respuesta     text,
  confirmado_at timestamptz not null default now(),
  primary key (anuncio_id, user_id)
);

alter table public.anuncios enable row level security;
alter table public.anuncio_confirmaciones enable row level security;

-- Todos los autenticados VEN los anuncios; solo privilegiados los crean/gestionan.
create policy anuncios_select on public.anuncios for select
  using (auth.uid() is not null);
create policy anuncios_write on public.anuncios for all
  using (public.es_privilegiado()) with check (public.es_privilegiado());

-- Cada quien confirma lo suyo (una vez); las respuestas las ve el
-- propio autor de la confirmación y los privilegiados.
create policy conf_select on public.anuncio_confirmaciones for select
  using (user_id = auth.uid() or public.es_privilegiado());
create policy conf_insert on public.anuncio_confirmaciones for insert
  with check (user_id = auth.uid());

-- Realtime: el anuncio nuevo llega al instante a quien esté conectado.
alter publication supabase_realtime add table public.anuncios;

notify pgrst, 'reload schema';
