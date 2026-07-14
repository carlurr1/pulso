-- ════════════════════════════════════════════════════════════════
--  42 · AJUSTES: verse a uno mismo en línea · mover caso de bolsa ·
--        migración automática de la bolsa de horario no hábil
--  Ejecutar después de 41.
-- ════════════════════════════════════════════════════════════════

-- ── 1 · "En línea": el senior también se ve a sí mismo ─────────────
-- Antes el senior veía a su grupo MENOS a sí mismo; ahora se incluye
-- para poder vigilar su propio estado (p. ej. quedar en pausa sin querer).
create or replace function public.presencia_hoy(p_mesa text default null)
returns table (
  user_id uuid, nombre text, apellido text, cargo text, mesa text,
  en_linea boolean, ultimo timestamptz,
  minutos_logueado int, minutos_pc int, minutos_pausa int,
  pausa_tipo text, pausa_desde timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_privilegiado() or public.mi_rol() = 'senior') then
    raise exception 'No autorizado';
  end if;
  return query
  select u.id, u.nombre, u.apellido, u.cargo, u.mesa,
    coalesce((select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date) > now() - interval '3 minutes', false),
    (select max(s.ultimo_latido) from sesiones s where s.user_id = u.id and s.inicio::date = current_date),
    coalesce((select sum(extract(epoch from (coalesce(s.fin, s.ultimo_latido) - s.inicio)) / 60)::int from sesiones s where s.user_id = u.id and s.inicio::date = current_date), 0),
    coalesce((select (sum(s.activo_seg) / 60)::int from sesiones s where s.user_id = u.id and s.inicio::date = current_date), 0),
    coalesce((select sum(extract(epoch from (coalesce(p.fin, now()) - p.inicio)) / 60)::int from pausas p where p.user_id = u.id and p.fecha = current_date), 0),
    (select p.tipo from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null order by p.inicio desc limit 1),
    (select p.inicio from pausas p where p.user_id = u.id and p.fecha = current_date and p.fin is null order by p.inicio desc limit 1)
  from usuarios u
  where u.activo and u.rol in ('agente','senior')   -- coordinadores NO aparecen
    and case when public.es_privilegiado() then public.mesa_ok(u.mesa, p_mesa)
             else public.grupo_de(u.mesa) = public.mi_grupo() end   -- incluye al propio senior
  order by u.nombre;
end $$;

-- ── 2 · Mover un caso del pool a la bolsa de otra mesa ─────────────
-- Para casos mal ubicados (dejados en Élite pero son de otro segmento).
-- Lo puede hacer un senior o coordinación. Solo cambia la mesa; conserva
-- fuera_horario, así que si estaba en la bolsa de no hábil sigue visible
-- para todos, ahora etiquetado en la mesa correcta.
create or replace function public.pool_mover_mesa(p_pool uuid, p_mesa text)
returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  if not (public.es_privilegiado() or public.mi_rol() = 'senior') then
    raise exception 'No autorizado: solo un senior o coordinación puede mover un caso de bolsa.';
  end if;
  select * into v from casos_pool where id = p_pool and estado = 'pendiente' for update;
  if not found then raise exception 'Este caso ya fue tomado o asignado.'; end if;
  if not exists (select 1 from mesas where nombre = p_mesa) then
    raise exception 'La mesa destino no existe.';
  end if;
  update casos_pool set mesa = p_mesa where id = p_pool;
end $$;
grant execute on function public.pool_mover_mesa(uuid, text) to authenticated;

-- ── 3 · Migración automática de la bolsa de horario no hábil ───────
-- Si un caso lleva >5 horas en la bolsa compartida DESPUÉS de reabrir el
-- horario hábil (06:00 → 11:00) y nadie lo tomó, viaja al contenedor de su
-- mesa (fuera_horario = false) para que lo trabaje el equipo de esa mesa.
-- Solo en día hábil (Lun-Vie sin festivo): en fin de semana/festivo el caso
-- se queda en la bolsa. La deduplicación ya evita duplicados si el senior
-- alcanzó a asignarlo. Las mesas que retienen su contenedor (Silver) no
-- entran nunca a la bolsa, así que no aplica.
create or replace function public.migrar_no_habil_a_bolsa()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.es_horario_habil() then return 0; end if;                       -- solo día/horario hábil
  if (now() at time zone 'America/Bogota')::time < time '11:00' then return 0; end if;  -- ya pasaron 5h desde las 06:00
  update public.casos_pool
     set fuera_horario = false
   where estado = 'pendiente' and fuera_horario = true
     and not exists (select 1 from public.mesas m where m.nombre = casos_pool.mesa and m.retiene_no_habil);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.migrar_no_habil_a_bolsa() to authenticated;

-- Programación automática con pg_cron si está disponible (corre aunque nadie
-- tenga la app abierta). Si la extensión no está habilitada, se omite sin
-- error; la app igual la dispara al consultar el pool.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('migrar-no-habil', '0 * * * *', 'select public.migrar_no_habil_a_bolsa();');
  end if;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
