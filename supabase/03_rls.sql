-- ════════════════════════════════════════════════════════════════
--  03 · Row Level Security (control de acceso por rol)
--  Regla de oro: el agente solo ve y crea LO SUYO. Nunca toca lo ajeno
--  ni puede editar/borrar lo ya registrado. Los totales agregados solo
--  se calculan vía RPC para roles privilegiados (ver 05_rpc.sql).
-- ════════════════════════════════════════════════════════════════

alter table public.usuarios            enable row level security;
alter table public.gestiones_catalogo  enable row level security;
alter table public.asignaciones         enable row level security;
alter table public.gestiones            enable row level security;
alter table public.horarios             enable row level security;
alter table public.empleado_documento   enable row level security;

-- ── usuarios ──────────────────────────────────────────────────────
create policy usuarios_select on public.usuarios for select
  using (id = auth.uid() or public.es_privilegiado());
create policy usuarios_admin  on public.usuarios for all
  using (public.es_admin()) with check (public.es_admin());

-- ── catálogo de gestiones ─────────────────────────────────────────
create policy catalogo_select on public.gestiones_catalogo for select
  using (activo = true or public.es_privilegiado());
create policy catalogo_admin  on public.gestiones_catalogo for all
  using (public.es_admin()) with check (public.es_admin());

-- ── asignaciones (bandeja del día) ────────────────────────────────
create policy asig_select on public.asignaciones for select
  using (user_id = auth.uid() or public.es_privilegiado() or public.mi_rol() = 'senior');
-- El senior reparte; el agente puede crear su propio "caso nuevo".
create policy asig_insert on public.asignaciones for insert
  with check (user_id = auth.uid() or public.mi_rol() in ('senior','coordinador','superadmin'));
-- El agente cambia el estado de SUS casos; senior/coordinación cualquiera.
create policy asig_update on public.asignaciones for update
  using (user_id = auth.uid() or public.mi_rol() in ('senior','coordinador','superadmin'))
  with check (user_id = auth.uid() or public.mi_rol() in ('senior','coordinador','superadmin'));
create policy asig_delete on public.asignaciones for delete
  using (public.mi_rol() in ('senior','coordinador','superadmin'));

-- ── gestiones (bitácora) ──────────────────────────────────────────
create policy gest_select on public.gestiones for select
  using (user_id = auth.uid() or public.es_privilegiado());
create policy gest_insert on public.gestiones for insert
  with check (user_id = auth.uid() or public.es_privilegiado());
-- Integridad: lo registrado no se edita ni se borra desde el agente.
create policy gest_update on public.gestiones for update
  using (public.es_privilegiado()) with check (public.es_privilegiado());
create policy gest_delete on public.gestiones for delete
  using (public.es_privilegiado());

-- ── horarios ──────────────────────────────────────────────────────
create policy hor_select on public.horarios for select
  using (user_id = auth.uid() or public.es_privilegiado() or public.mi_rol() = 'senior');
create policy hor_write  on public.horarios for all
  using (public.mi_rol() in ('senior','coordinador','superadmin'))
  with check (public.mi_rol() in ('senior','coordinador','superadmin'));

-- ── documento (PII) → solo superadmin, y de hecho solo vía RPC ─────
create policy doc_admin on public.empleado_documento for all
  using (public.es_admin()) with check (public.es_admin());
