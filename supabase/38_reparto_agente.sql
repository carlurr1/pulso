-- ════════════════════════════════════════════════════════════════
--  38 · Reparto de seguimiento para ANALISTAS/AGENTES
--   · Los agentes (junior/analistas) pueden repartirse el seguimiento
--     entre ellos desde el mismo contenedor del senior, y asignar los
--     casos del contenedor general que les pasan otras mesas.
--   · EXCEPCIÓN: el segmento BÁSICOS sigue siendo SOLO del senior.
--   · Alcance del agente = el mismo del senior de su mesa: su mesa, y
--     todo el grupo si el grupo es mixto (Élite + Distrito).
--  Ejecutar después de 37.
-- ════════════════════════════════════════════════════════════════

-- ── Bandera por mesa: ¿los agentes de esta mesa pueden repartir? ───
alter table public.mesas
  add column if not exists reparte_agente boolean not null default true;

-- Básicos queda solo para el senior (no importa may/min ni acento).
update public.mesas
   set reparte_agente = false
 where nombre ilike '%basico%' or nombre ilike '%básico%'
    or grupo  ilike '%basico%' or grupo  ilike '%básico%';

-- ¿La mesa del que llama permite que sus agentes repartan?
create or replace function public.mi_mesa_reparte_agente()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select reparte_agente from public.mesas where nombre = public.mi_mesa()), false)
$$;
grant execute on function public.mi_mesa_reparte_agente() to anon, authenticated;

-- Alcance de asignación (idéntico para senior y agente): la mesa del
-- destinatario es la mía, o —si mi grupo es mixto— del mismo grupo.
create or replace function public.puede_asignar_a(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (select u.mesa from public.usuarios u where u.id = p_target) = public.mi_mesa()
      or (public.mi_grupo_mixto()
          and public.grupo_de((select u.mesa from public.usuarios u where u.id = p_target)) = public.mi_grupo())
$$;
grant execute on function public.puede_asignar_a(uuid) to anon, authenticated;

-- ── SELECT: el agente habilitado ve la bandeja de su grupo ────────
drop policy if exists asig_select on public.asignaciones;
create policy asig_select on public.asignaciones for select
  using (
    user_id = auth.uid()
    or public.es_privilegiado()
    or public.mi_rol() = 'senior'
    or (public.mi_rol() = 'agente' and public.mi_mesa_reparte_agente()
        and public.grupo_de((select u.mesa from public.usuarios u where u.id = asignaciones.user_id)) = public.mi_grupo())
  );

-- ── INSERT / UPDATE / DELETE: senior siempre; agente si su mesa lo permite ──
drop policy if exists asig_insert on public.asignaciones;
create policy asig_insert on public.asignaciones for insert
  with check (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior' and public.puede_asignar_a(user_id))
    or (public.mi_rol() = 'agente' and public.mi_mesa_reparte_agente() and public.puede_asignar_a(user_id))
  );

drop policy if exists asig_update on public.asignaciones;
create policy asig_update on public.asignaciones for update
  using (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior' and public.puede_asignar_a(user_id))
    or (public.mi_rol() = 'agente' and public.mi_mesa_reparte_agente() and public.puede_asignar_a(user_id))
  )
  with check (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior' and public.puede_asignar_a(user_id))
    or (public.mi_rol() = 'agente' and public.mi_mesa_reparte_agente() and public.puede_asignar_a(user_id))
  );

drop policy if exists asig_delete on public.asignaciones;
create policy asig_delete on public.asignaciones for delete
  using (
    public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior' and public.puede_asignar_a(user_id))
    or (public.mi_rol() = 'agente' and public.mi_mesa_reparte_agente() and public.puede_asignar_a(user_id))
  );

-- ── Contenedor general: el agente habilitado también puede asignar ──
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
    -- senior de la mesa del contenedor (o de su grupo, si es mixto)
    or (public.mi_rol() = 'senior'
        and (public.mi_mesa() = v.mesa
             or (public.mi_grupo_mixto() and public.grupo_de(v.mesa) = public.mi_grupo()))
        and public.grupo_de((select u.mesa from usuarios u where u.id = p_destino)) = public.grupo_de(v.mesa))
    -- agente habilitado (mesa que reparte): igual alcance que su senior
    or (public.mi_rol() = 'agente' and public.mi_mesa_reparte_agente()
        and (public.mi_mesa() = v.mesa
             or (public.mi_grupo_mixto() and public.grupo_de(v.mesa) = public.mi_grupo()))
        and public.grupo_de((select u.mesa from usuarios u where u.id = p_destino)) = public.grupo_de(v.mesa))
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

notify pgrst, 'reload schema';
