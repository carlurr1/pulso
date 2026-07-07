-- ════════════════════════════════════════════════════════════════
--  34 · Distrito + Élite = un solo grupo MIXTO
--  · Comparten grupo → cada senior ve al otro equipo en "En línea",
--    "Carga del equipo" y perfiles (igual que Premium agrupa subsegmentos).
--  · Además quedan marcados como grupo MIXTO: un senior de ese grupo
--    puede repartir/asignar casos a agentes del OTRO. Premium y los demás
--    NO cambian: cada senior sigue repartiendo solo a su propia mesa.
--  Ejecutar después de 33.
-- ════════════════════════════════════════════════════════════════

-- Grupo compartido para todas las mesas de élite y distrito (incluye subsegmentos).
update public.mesas
   set grupo = 'ELITE Y DISTRITO'
 where nombre ilike 'ELITE%' or nombre ilike 'DISTRITO%';

-- Marca de "grupo mixto": los seniors reparten a TODO el grupo, no solo a su mesa.
alter table public.mesas add column if not exists grupo_mixto boolean not null default false;
update public.mesas set grupo_mixto = true
 where nombre ilike 'ELITE%' or nombre ilike 'DISTRITO%';

-- ¿El grupo de quien llama es mixto?
create or replace function public.mi_grupo_mixto()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(bool_or(grupo_mixto), false) from public.mesas where grupo = public.mi_grupo()
$$;
grant execute on function public.mi_grupo_mixto() to anon, authenticated;

-- ── Reparto/asignación: senior a su MESA siempre; y a todo su GRUPO si es mixto ──
drop policy if exists asig_insert on public.asignaciones;
create policy asig_insert on public.asignaciones for insert
  with check (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior' and (
         (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa()
         or (public.mi_grupo_mixto()
             and public.grupo_de((select u.mesa from public.usuarios u where u.id = user_id)) = public.mi_grupo())
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
       ))
  )
  with check (
    user_id = auth.uid()
    or public.mi_rol() in ('coordinador','superadmin')
    or (public.mi_rol() = 'senior' and (
         (select u.mesa from public.usuarios u where u.id = user_id) = public.mi_mesa()
         or (public.mi_grupo_mixto()
             and public.grupo_de((select u.mesa from public.usuarios u where u.id = user_id)) = public.mi_grupo())
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
       ))
  );

-- ── Contenedor general: senior de grupo mixto también puede asignar
--    casos del contenedor de la otra mesa del grupo a su gente ──────
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
    -- senior de la mesa del contenedor (o de su grupo, si es mixto),
    -- asignando a alguien del grupo del contenedor
    or (public.mi_rol() = 'senior'
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
