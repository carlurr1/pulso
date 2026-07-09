-- ════════════════════════════════════════════════════════════════
--  37 · BOLSA DE HORARIO NO HÁBIL
--  · Los casos que entran al contenedor general (casos_pool) fuera de
--    horario hábil (lunes a viernes 6:00 a.m.–5:00 p.m., festivos y
--    fines de semana excluidos) quedan marcados `fuera_horario = true`.
--  · Esas filas las ve y las toma CUALQUIER autenticado (no solo su
--    grupo de mesas), a sí mismo o a alguien de su propio equipo.
--  · Tabla `festivos`: catálogo editable de días festivos de Colombia,
--    para que `es_horario_habil()` los excluya del horario hábil.
--  · De paso activa "Repartir seguimiento" para los agentes de PREMIUM 1
--    (flag `mesas.reparte_agente`, ya existente).
--  Ejecutar después de 36.
-- ════════════════════════════════════════════════════════════════

-- ── Festivos de Colombia (editable desde Configuración) ────────────
create table if not exists public.festivos (
  fecha  date primary key,
  nombre text not null
);
alter table public.festivos enable row level security;
drop policy if exists festivos_select on public.festivos;
create policy festivos_select on public.festivos for select using (auth.uid() is not null);
drop policy if exists festivos_admin on public.festivos;
create policy festivos_admin on public.festivos for all
  using (public.es_admin()) with check (public.es_admin());

-- Festivos oficiales de Colombia 2026 (incluye el nuevo festivo del 13 de
-- julio — Virgen de Chiquinquirá, Ley 2578 de 2026). Cargar los de años
-- siguientes desde Configuración → Festivos cuando se conozcan.
insert into public.festivos (fecha, nombre) values
  ('2026-01-01', 'Año Nuevo'),
  ('2026-01-12', 'Reyes Magos'),
  ('2026-03-23', 'San José'),
  ('2026-04-02', 'Jueves Santo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-18', 'Ascensión del Señor'),
  ('2026-06-08', 'Corpus Christi'),
  ('2026-06-15', 'Sagrado Corazón'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-13', 'Virgen de Chiquinquirá'),
  ('2026-07-20', 'Independencia'),
  ('2026-08-07', 'Batalla de Boyacá'),
  ('2026-08-17', 'Asunción de la Virgen'),
  ('2026-10-12', 'Día de la Raza'),
  ('2026-11-02', 'Todos los Santos'),
  ('2026-11-16', 'Independencia de Cartagena'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-25', 'Navidad')
on conflict (fecha) do nothing;

-- ── ¿Es horario hábil? (lunes a viernes, 6:00 a.m.–5:00 p.m., sin festivos) ──
create or replace function public.es_horario_habil(p_ts timestamptz default now())
returns boolean language sql stable security definer set search_path = public as $$
  select
    extract(isodow from p_ts at time zone 'America/Bogota') between 1 and 5
    and (p_ts at time zone 'America/Bogota')::time >= time '06:00'
    and (p_ts at time zone 'America/Bogota')::time <  time '17:00'
    and not exists (
      select 1 from public.festivos f
      where f.fecha = (p_ts at time zone 'America/Bogota')::date
    )
$$;

-- ── Marca automática en el contenedor general ───────────────────────
alter table public.casos_pool add column if not exists fuera_horario boolean not null default false;

create or replace function public.casos_pool_set_horario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.fuera_horario := not public.es_horario_habil(new.created_at);
  return new;
end $$;
drop trigger if exists trg_casos_pool_horario on public.casos_pool;
create trigger trg_casos_pool_horario before insert on public.casos_pool
for each row execute function public.casos_pool_set_horario();

-- ── RLS: las filas fuera de horario las ve cualquier autenticado ───
drop policy if exists pool_select on public.casos_pool;
create policy pool_select on public.casos_pool for select
  using (public.es_privilegiado() or fuera_horario or public.grupo_de(mesa) = public.mi_grupo());

-- ── pool_asignar: rama sin restricción de mesa/grupo para fuera_horario ──
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
    -- Horario no hábil: cualquiera puede asignarlo a sí mismo o a alguien
    -- de SU PROPIO equipo, sin importar la mesa original del caso.
    or (v.fuera_horario and (
          p_destino = auth.uid()
          or (select u.mesa from usuarios u where u.id = p_destino) = public.mi_mesa()
        ))
    -- Contenedor normal (horario hábil): reglas de siempre.
    or (not v.fuera_horario and public.mi_rol() = 'senior' and public.mi_mesa() = v.mesa
        and (select u.mesa from usuarios u where u.id = p_destino) = v.mesa)
    or (not v.fuera_horario and p_destino = auth.uid() and (
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

-- ── Activa "Repartir seguimiento" para los agentes de PREMIUM 1 ─────
-- (la columna ya existe en producción vía Configuración → Mesas, pero
-- no estaba en ninguna migración rastreada; se agrega por si acaso).
alter table public.mesas add column if not exists reparte_agente boolean not null default false;
update public.mesas set reparte_agente = true where nombre = 'PREMIUM 1';

notify pgrst, 'reload schema';
