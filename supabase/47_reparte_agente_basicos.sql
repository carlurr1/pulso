-- ════════════════════════════════════════════════════════════════
--  47 · REPARTO ENTRE AGENTES (funcional) + activar en Básicos
--  · El flag mesas.reparte_agente daba la pestaña "Repartir seguimiento"
--    a los agentes, pero las reglas (RLS de asignaciones y pool_asignar)
--    nunca permitieron que un AGENTE asignara a un colega: solo el senior.
--  · Aquí se agrega esa cláusula: en una mesa con reparte_agente, sus
--    agentes pueden repartir/asignar casos a colegas de SU MISMA mesa
--    (en horario hábil; en no hábil ya se podía por la rama de grupo).
--  · Se activa reparte_agente en Básicos (antes solo lo tenía Premium 1).
--  Ejecutar después de 46.
-- ════════════════════════════════════════════════════════════════

-- ¿Mi mesa reparte entre agentes?
create or replace function public.mi_reparte_agente()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select reparte_agente from public.mesas where nombre = public.mi_mesa()), false)
$$;
grant execute on function public.mi_reparte_agente() to anon, authenticated;

-- ── RLS asignaciones: + agentes de una mesa con reparte a colegas de su mesa ──
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
    or (public.mi_reparte_agente()
        and (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa())
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
    or (public.mi_reparte_agente()
        and (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa())
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
    or (public.mi_reparte_agente()
        and (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa())
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
    or (public.mi_reparte_agente()
        and (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa())
  );

-- ── pool_asignar: + agente de mesa con reparto asigna a colega de su mesa ──
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
    or (v.fuera_horario and (
          p_destino = auth.uid()
          or public.grupo_de(d_mesa) = public.mi_grupo()
        ))
    or (not v.fuera_horario and public.mi_rol() = 'senior'
        and (public.mi_mesa() = v.mesa
             or (mixto and public.grupo_de(v.mesa) = public.mi_grupo()))
        and (public.grupo_de(d_mesa) = public.grupo_de(v.mesa)
             or public.apoya_a(d_mesa, v.mesa)))
    or (not v.fuera_horario and p_destino = auth.uid() and (
          public.mi_mesa() = v.mesa
          or (public.grupo_de(v.mesa) = public.mi_grupo() and (finde or mixto))
        ))
    or (p_destino = auth.uid()
        and public.apoya_a(public.mi_mesa(), v.mesa)
        and not public.es_horario_habil())
    -- Reparto entre agentes: un agente de una mesa con reparte_agente asigna
    -- un caso de SU mesa a un colega de SU mesa (horario hábil).
    or (not v.fuera_horario and public.mi_reparte_agente()
        and public.mi_mesa() = v.mesa and d_mesa = public.mi_mesa());
  if not permitido then
    raise exception 'No autorizado: este contenedor lo asigna el senior de la mesa o de su grupo (o tómalo tú mismo si es de tu mesa, de tu grupo en fin de semana/grupo mixto, o de tu mesa de apoyo fuera de horario).';
  end if;
  update casos_pool set estado = 'asignado', asignado_a = p_destino,
    asignado_por = auth.uid(), asignado_at = now() where id = p_pool;
  insert into asignaciones (user_id, numero_caso, asignado_por)
  values (p_destino, v.numero_caso, auth.uid())
  on conflict (fecha, user_id, numero_caso) do nothing;
end $$;

-- ── Activar el reparto entre agentes en Básicos ────────────────────
update public.mesas set reparte_agente = true where nombre ilike 'b_sicos';

notify pgrst, 'reload schema';
