-- ════════════════════════════════════════════════════════════════
--  40 · MESA DE APOYO (MEN apoya a PREMIUM 3)
--  · Una mesa puede "apoyar" a otra (columna mesas.apoya_mesa). Regla
--    del negocio para MEN → PREMIUM 3:
--     - Horario NO hábil: los ingenieros de MEN VEN y TOMAN los casos
--       del contenedor de PREMIUM 3 (apoyo fuera de horario).
--     - Horario hábil: el senior de PREMIUM 3 VE a los de MEN y les
--       puede ASIGNAR casos de PREMIUM 3 (reparto y contenedor).
--  · Genérico y reutilizable: cualquier mesa con apoya_mesa = X hereda
--    la misma relación con X. No afecta a las demás mesas.
--  Ejecutar después de 39.
-- ════════════════════════════════════════════════════════════════

-- ── Columna de apoyo + emparejamiento MEN → PREMIUM 3 ──────────────
alter table public.mesas add column if not exists apoya_mesa text;
update public.mesas set apoya_mesa = 'PREMIUM 3' where nombre = 'MEN';

-- ¿La mesa p_apoyo apoya a la mesa p_mesa?
create or replace function public.apoya_a(p_apoyo text, p_mesa text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.mesas
    where nombre = p_apoyo and apoya_mesa = p_mesa and p_apoyo is not null and p_mesa is not null
  )
$$;
grant execute on function public.apoya_a(text, text) to anon, authenticated;

-- ── RLS: visibilidad ───────────────────────────────────────────────
-- Contenedor: MEN ve el contenedor de PREMIUM 3 SOLO en horario no hábil.
drop policy if exists pool_select on public.casos_pool;
create policy pool_select on public.casos_pool for select
  using (
    public.es_privilegiado()
    or fuera_horario
    or public.grupo_de(mesa) = public.mi_grupo()
    or (public.apoya_a(public.mi_mesa(), mesa) and not public.es_horario_habil())
  );

-- Usuarios: el senior/equipo de PREMIUM 3 ve a los usuarios de MEN
-- (la mesa de apoyo), para poder repartirles.
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select
  using (
    public.es_privilegiado()
    or id = auth.uid()
    or public.grupo_de(mesa) = public.mi_grupo()
    or public.apoya_a(mesa, public.mi_mesa())
  );

-- ── RLS: reparto (asignaciones) — senior de PREMIUM 3 → agentes de MEN ──
drop policy if exists asig_insert on public.asignaciones;
create policy asig_insert on public.asignaciones for insert
  with check (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior' and (
         (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa()
         or (public.mi_grupo_mixto()
             and public.grupo_de((select u.mesa from public.usuarios u where u.id = user_id)) = public.mi_grupo())
         or public.apoya_a((select u.mesa from public.usuarios u where u.id = user_id), public.mi_mesa())
       ))
  );

drop policy if exists asig_update on public.asignaciones;
create policy asig_update on public.asignaciones for update
  using (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior' and (
         (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa()
         or (public.mi_grupo_mixto()
             and public.grupo_de((select u.mesa from public.usuarios u where u.id = user_id)) = public.mi_grupo())
         or public.apoya_a((select u.mesa from public.usuarios u where u.id = user_id), public.mi_mesa())
       ))
  )
  with check (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior' and (
         (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa()
         or (public.mi_grupo_mixto()
             and public.grupo_de((select u.mesa from public.usuarios u where u.id = user_id)) = public.mi_grupo())
         or public.apoya_a((select u.mesa from public.usuarios u where u.id = user_id), public.mi_mesa())
       ))
  );

drop policy if exists asig_delete on public.asignaciones;
create policy asig_delete on public.asignaciones for delete
  using (
    public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior' and (
         (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa()
         or (public.mi_grupo_mixto()
             and public.grupo_de((select u.mesa from public.usuarios u where u.id = user_id)) = public.mi_grupo())
         or public.apoya_a((select u.mesa from public.usuarios u where u.id = user_id), public.mi_mesa())
       ))
  );

-- ── Asignación del contenedor (pool_asignar) — incorpora el apoyo ──
create or replace function public.pool_asignar(p_pool uuid, p_destino uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v record; permitido boolean; finde boolean; mixto boolean; d_mesa text;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  select * into v from casos_pool where id = p_pool and estado = 'pendiente' for update;
  if not found then raise exception 'Este caso ya fue tomado o asignado.'; end if;
  finde := extract(isodow from now() at time zone 'America/Bogota') in (6, 7);
  mixto := public.mi_grupo_mixto();
  select u.mesa into d_mesa from usuarios u where u.id = p_destino;
  permitido :=
    public.es_privilegiado()
    -- Horario no hábil: a mí mismo (sin importar la mesa del caso) o a
    -- alguien de mi propio grupo.
    or (v.fuera_horario and (
          p_destino = auth.uid()
          or public.grupo_de(d_mesa) = public.mi_grupo()
        ))
    -- Horario hábil · senior de la mesa del contenedor (o de su grupo, si
    -- es mixto), asignando a alguien del grupo del contenedor O a un agente
    -- de una mesa que apoya al contenedor (MEN apoya a Premium 3).
    or (not v.fuera_horario and public.mi_rol() = 'senior'
        and (public.mi_mesa() = v.mesa
             or (mixto and public.grupo_de(v.mesa) = public.mi_grupo()))
        and (public.grupo_de(d_mesa) = public.grupo_de(v.mesa)
             or public.apoya_a(d_mesa, v.mesa)))
    -- Horario hábil · tomárselo uno mismo: de mi mesa siempre; de otra mesa
    -- de mi grupo si es fin de semana o el grupo es mixto.
    or (not v.fuera_horario and p_destino = auth.uid() and (
          public.mi_mesa() = v.mesa
          or (public.grupo_de(v.mesa) = public.mi_grupo() and (finde or mixto))
        ))
    -- Apoyo fuera de horario: un agente de MEN se toma un caso del
    -- contenedor de Premium 3 (la mesa que apoya) en horario no hábil.
    or (p_destino = auth.uid()
        and public.apoya_a(public.mi_mesa(), v.mesa)
        and not public.es_horario_habil());
  if not permitido then
    raise exception 'No autorizado: este contenedor lo asigna el senior de la mesa o de su grupo (o tómalo tú mismo si es de tu mesa, de tu grupo en fin de semana/grupo mixto, o de tu mesa de apoyo fuera de horario).';
  end if;
  update casos_pool set estado = 'asignado', asignado_a = p_destino,
    asignado_por = auth.uid(), asignado_at = now() where id = p_pool;
  insert into asignaciones (user_id, numero_caso, asignado_por)
  values (p_destino, v.numero_caso, auth.uid())
  on conflict (fecha, user_id, numero_caso) do nothing;
end $$;

notify pgrst, 'reload schema';
