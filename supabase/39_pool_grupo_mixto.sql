-- ════════════════════════════════════════════════════════════════
--  39 · pool_asignar: restaurar grupo MIXTO (Élite + Distrito)
--  · La migración 37 (horario no hábil) reescribió pool_asignar y, sin
--    querer, perdió el soporte de grupo mixto que había agregado la 34.
--    Efecto: en horario hábil, un senior de Élite no podía asignar casos
--    del contenedor de Distrito (ni al revés), y un junior no podía
--    tomarse un caso de la otra mesa del grupo → "No autorizado".
--  · Élite y Distrito se apoyan en CUALQUIER horario, así que aquí:
--     - el senior de un grupo mixto asigna a cualquiera de su grupo,
--       casos de cualquier mesa del grupo;
--     - cualquiera del grupo mixto puede tomarse un caso de la otra mesa
--       del grupo sin esperar al fin de semana;
--     - se conserva la bolsa de horario no hábil (fuera_horario) de la 37.
--  · Premium y los demás NO cambian: cada senior sigue en su mesa.
--  Ejecutar después de 38.
-- ════════════════════════════════════════════════════════════════

create or replace function public.pool_asignar(p_pool uuid, p_destino uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v record; permitido boolean; finde boolean; mixto boolean;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  select * into v from casos_pool where id = p_pool and estado = 'pendiente' for update;
  if not found then raise exception 'Este caso ya fue tomado o asignado.'; end if;
  finde := extract(isodow from now() at time zone 'America/Bogota') in (6, 7);
  mixto := public.mi_grupo_mixto();
  permitido :=
    public.es_privilegiado()
    -- Horario no hábil: a mí mismo (sin importar la mesa del caso) o a
    -- alguien de mi propio grupo.
    or (v.fuera_horario and (
          p_destino = auth.uid()
          or public.grupo_de((select u.mesa from usuarios u where u.id = p_destino)) = public.mi_grupo()
        ))
    -- Horario hábil · senior de la mesa del contenedor (o de su grupo, si
    -- es mixto), asignando a alguien del grupo del contenedor.
    or (not v.fuera_horario and public.mi_rol() = 'senior'
        and (public.mi_mesa() = v.mesa
             or (mixto and public.grupo_de(v.mesa) = public.mi_grupo()))
        and public.grupo_de((select u.mesa from usuarios u where u.id = p_destino)) = public.grupo_de(v.mesa))
    -- Horario hábil · tomárselo uno mismo: de mi mesa siempre; de otra mesa
    -- de mi grupo si es fin de semana O el grupo es mixto (Élite+Distrito
    -- se apoyan en cualquier horario).
    or (not v.fuera_horario and p_destino = auth.uid() and (
          public.mi_mesa() = v.mesa
          or (public.grupo_de(v.mesa) = public.mi_grupo() and (finde or mixto))
        ));
  if not permitido then
    raise exception 'No autorizado: este contenedor lo asigna el senior de la mesa o de su grupo (o tómalo tú mismo si es de tu mesa, o de tu grupo en fin de semana o grupo mixto).';
  end if;
  update casos_pool set estado = 'asignado', asignado_a = p_destino,
    asignado_por = auth.uid(), asignado_at = now() where id = p_pool;
  insert into asignaciones (user_id, numero_caso, asignado_por)
  values (p_destino, v.numero_caso, auth.uid())
  on conflict (fecha, user_id, numero_caso) do nothing;
end $$;

notify pgrst, 'reload schema';
