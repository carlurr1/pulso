-- ════════════════════════════════════════════════════════════════
--  41 · CONTENEDOR PROPIO EN HORARIO NO HÁBIL (Silver)
--  · Por defecto, un caso creado fuera de horario hábil se marca
--    `fuera_horario = true` y va a la BOLSA COMPARTIDA de horario no
--    hábil, visible y tomable por cualquiera.
--  · Silver no tiene personal: si sus casos caen en la bolsa compartida,
--    nadie los toma. Se quiere que se queden en el CONTENEDOR GENERAL DE
--    SILVER (como en horario hábil), no en la bolsa compartida.
--  · Se agrega el flag `mesas.retiene_no_habil`: las mesas marcadas NO
--    mandan sus casos fuera de horario a la bolsa compartida; los
--    conservan en su propio contenedor. Se activa para SILVER.
--  Ejecutar después de 40.
-- ════════════════════════════════════════════════════════════════

alter table public.mesas add column if not exists retiene_no_habil boolean not null default false;
update public.mesas set retiene_no_habil = true where nombre = 'SILVER';

-- La marca de "fuera de horario" ya no aplica a las mesas que retienen su
-- propio contenedor (así no entran a la bolsa compartida de horario no hábil).
create or replace function public.casos_pool_set_horario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.fuera_horario := (not public.es_horario_habil(new.created_at))
    and not exists (
      select 1 from public.mesas m where m.nombre = new.mesa and m.retiene_no_habil
    );
  return new;
end $$;
-- El trigger trg_casos_pool_horario (migración 37) ya apunta a esta función.

-- Backfill: los casos pendientes de mesas que retienen y hoy están en la
-- bolsa compartida vuelven a su contenedor (fuera_horario = false).
update public.casos_pool cp
   set fuera_horario = false
 where cp.estado = 'pendiente'
   and cp.fuera_horario = true
   and exists (select 1 from public.mesas m where m.nombre = cp.mesa and m.retiene_no_habil);

notify pgrst, 'reload schema';
