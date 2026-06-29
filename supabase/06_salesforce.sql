-- ════════════════════════════════════════════════════════════════
--  06 · Integración Salesforce (foto del caso + métricas por cliente)
--  Ejecutar después de 01–05. Requiere las variables SF_* en Vercel.
-- ════════════════════════════════════════════════════════════════

-- Foto (snapshot) del caso traída de Salesforce. Una fila por número de caso.
create table public.casos_sf (
  numero_caso     text primary key,
  cliente         text,
  estado          text,
  prioridad       text,
  tipo            text,
  motivo          text,
  origen          text,
  fecha_creacion  timestamptz,
  fecha_cierre    timestamptz,
  escalado        boolean,
  owner           text,
  actualizado_at  timestamptz not null default now()
);

alter table public.casos_sf enable row level security;

-- Cualquier usuario autenticado puede ver el cliente de un caso (dato de negocio,
-- útil incluso para el agente en su bandeja). La ESCRITURA ocurre solo desde la
-- Server Action con service role, que omite RLS — por eso no hay policy de insert.
create policy casos_sf_select on public.casos_sf for select
  using (auth.uid() is not null);

-- ── Ranking de clientes por tiempo invertido ──────────────────────
--    Cruza el esfuerzo de Pulso (minutos) con el cliente de Salesforce.
create or replace function public.metricas_por_cliente(p_dias int default 7)
returns table (cliente text, casos int, gestiones int, minutos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_privilegiado() then raise exception 'No autorizado'; end if;
  return query
  select coalesce(c.cliente, '(sin cliente)'),
         count(distinct g.numero_caso)::int,
         count(*)::int,
         coalesce(sum(g.minutos), 0)::int
  from gestiones g
  left join casos_sf c on c.numero_caso = g.numero_caso
  where g.fecha >= current_date - (p_dias - 1)
  group by coalesce(c.cliente, '(sin cliente)')
  order by sum(g.minutos) desc nulls last
  limit 12;
end $$;
