-- ════════════════════════════════════════════════════════════════
--  38 · DEDUPLICACIÓN DE BOLSAS + BUSCADOR GLOBAL DE CASOS
--  · Problema: un caso podía "habitar en tres lados". Vivía pendiente
--    en `casos_pool` (bolsa de horario no hábil y contenedores premium)
--    y, al mismo tiempo, ya estar asignado a un ingeniero en
--    `asignaciones` (porque el senior lo repartió o se lo pasó directo
--    sacándolo de Salesforce, sin tocar la bolsa).
--  · Solución: en cuanto un caso entra a la bandeja de alguien (por
--    CUALQUIER vía que cree una fila en `asignaciones`), un trigger
--    cierra automáticamente las filas pendientes de `casos_pool` con
--    ese número. Así desaparece de las bolsas al instante.
--  · Un caso re-enviado a la bolsa DESPUÉS (nueva fila en casos_pool)
--    vuelve a aparecer: el cierre solo mira filas 'pendiente'.
--  · Además: `buscar_caso()` localiza un caso puntual (¿en qué bolsa
--    está? ¿quién lo tiene asignado, desde cuándo y en qué estado?).
--  Ejecutar después de 37.
-- ════════════════════════════════════════════════════════════════

-- ── Índices por número de caso (trigger de cierre + buscador global) ──
create index if not exists idx_pool_caso on public.casos_pool (numero_caso);
create index if not exists idx_asig_caso on public.asignaciones (numero_caso);

-- ── Cerrar la bolsa cuando el caso ya fue asignado ─────────────────
create or replace function public.asignacion_cierra_pool()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.casos_pool
     set estado       = 'asignado',
         asignado_a   = new.user_id,
         asignado_por = coalesce(new.asignado_por, asignado_por),
         asignado_at  = now()
   where numero_caso = new.numero_caso
     and estado = 'pendiente';
  return new;
end $$;

drop trigger if exists trg_asignacion_cierra_pool on public.asignaciones;
create trigger trg_asignacion_cierra_pool after insert on public.asignaciones
for each row execute function public.asignacion_cierra_pool();

-- ── Backfill: limpiar los duplicados que YA existen hoy ────────────
-- Toda bolsa pendiente cuyo caso ya esté asignado a alguien se cierra,
-- tomando la asignación más reciente como origen.
update public.casos_pool cp
   set estado       = 'asignado',
       asignado_a   = a.user_id,
       asignado_por = coalesce(a.asignado_por, cp.asignado_por),
       asignado_at  = coalesce(cp.asignado_at, now())
  from (
    select distinct on (az.numero_caso) az.numero_caso, az.user_id, az.asignado_por
    from public.asignaciones az
    order by az.numero_caso, az.fecha desc, az.created_at desc
  ) a
 where a.numero_caso = cp.numero_caso
   and cp.estado = 'pendiente';

-- ════════════════════════════════════════════════════════════════
--  BUSCADOR GLOBAL DE CASOS
--  Localiza un número de caso en toda la operación, saltando la RLS
--  (SECURITY DEFINER) para que un senior también ubique casos de otras
--  mesas. Solo senior y privilegiados.
-- ════════════════════════════════════════════════════════════════
create or replace function public.buscar_caso(p_caso text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_caso    text := trim(p_caso);
  v_cliente text;
  v_pool    jsonb;
  v_asig    jsonb;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  if not (public.es_privilegiado() or public.mi_rol() = 'senior') then
    raise exception 'No autorizado';
  end if;
  if v_caso = '' then
    return jsonb_build_object('caso', null, 'pool', '[]'::jsonb, 'asignaciones', '[]'::jsonb);
  end if;

  select c.cliente into v_cliente from public.casos_sf c where c.numero_caso = v_caso limit 1;

  -- ¿Sigue en alguna bolsa sin asignar? (horario no hábil o contenedor de mesa)
  select coalesce(jsonb_agg(t order by (t->>'created_at') desc), '[]'::jsonb) into v_pool
  from (
    select jsonb_build_object(
      'mesa',          cp.mesa,
      'fuera_horario', cp.fuera_horario,
      'created_at',    cp.created_at,
      'creador',       (select trim(u.nombre || ' ' || coalesce(u.apellido, ''))
                        from public.usuarios u where u.id = cp.creado_por)
    ) t
    from public.casos_pool cp
    where cp.numero_caso = v_caso and cp.estado = 'pendiente'
  ) s;

  -- ¿Quién lo tiene asignado? (más reciente primero)
  select coalesce(jsonb_agg(t order by (t->>'fecha') desc, (t->>'created_at') desc), '[]'::jsonb) into v_asig
  from (
    select jsonb_build_object(
      'ingeniero_id', a.user_id,
      'ingeniero',    (select trim(u.nombre || ' ' || coalesce(u.apellido, ''))
                       from public.usuarios u where u.id = a.user_id),
      'mesa',         (select u.mesa from public.usuarios u where u.id = a.user_id),
      'estado',       a.estado,
      'fecha',        a.fecha,
      'created_at',   a.created_at,
      'asignado_por', (select trim(u.nombre || ' ' || coalesce(u.apellido, ''))
                       from public.usuarios u where u.id = a.asignado_por)
    ) t
    from public.asignaciones a
    where a.numero_caso = v_caso
  ) s;

  return jsonb_build_object(
    'caso',         v_caso,
    'cliente',      v_cliente,
    'pool',         v_pool,
    'asignaciones', v_asig
  );
end $$;
grant execute on function public.buscar_caso(text) to authenticated;

notify pgrst, 'reload schema';
