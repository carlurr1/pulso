-- ════════════════════════════════════════════════════════════════
--  26 · CORRECCIÓN CRÍTICA — Zona horaria de Colombia
--  Síntoma: a las 7:00 p.m. (medianoche UTC) la app "saltaba" al día
--  siguiente: bandejas reiniciadas, actividad en cero, cerrados
--  desaparecidos, y las gestiones nocturnas guardadas con la fecha
--  de MAÑANA. La base corre en UTC y todos los current_date /
--  ::date se evaluaban con el reloj UTC.
--  Este archivo: (1) fija la zona horaria de la base y del API a
--  America/Bogota, y (2) REPARA el histórico: re-fecha gestiones,
--  asignaciones y pausas según su hora real de Colombia.
--  Ejecutar después de 25. Es seguro re-ejecutarlo.
-- ════════════════════════════════════════════════════════════════

-- ── 1 · Reloj de la base en hora de Colombia ──────────────────────
--    Aplica a conexiones nuevas (el pool del API se recicla en minutos).
alter database postgres set timezone to 'America/Bogota';

-- Refuerzo por rol (si alguno no se puede alterar en este plan, se ignora:
-- el ajuste a nivel de base ya cubre todas las conexiones).
do $$ begin alter role authenticator set timezone to 'America/Bogota';
exception when others then null; end $$;
do $$ begin alter role authenticated set timezone to 'America/Bogota';
exception when others then null; end $$;
do $$ begin alter role service_role set timezone to 'America/Bogota';
exception when others then null; end $$;
do $$ begin alter role postgres set timezone to 'America/Bogota';
exception when others then null; end $$;

-- ── 2 · Reparación del histórico ──────────────────────────────────
--    Cada registro tiene su timestamp real (timestamptz): la fecha
--    correcta es la de ese instante EN COLOMBIA. Corrige todo lo que
--    quedó fechado "mañana" por registrarse después de las 7 p.m.

-- Gestiones: la fecha debe ser el día de Colombia de registrado_at.
update public.gestiones g
   set fecha = (g.registrado_at at time zone 'America/Bogota')::date
 where g.fecha <> (g.registrado_at at time zone 'America/Bogota')::date;

-- Pausas: idem con su hora de inicio.
update public.pausas p
   set fecha = (p.inicio at time zone 'America/Bogota')::date
 where p.fecha <> (p.inicio at time zone 'America/Bogota')::date;

-- Asignaciones: idem con created_at, cuidando el índice único
-- (fecha, user_id, numero_caso): si ya existe una fila del mismo caso
-- en la fecha correcta, esa fila se deja como está (no se pisa nada).
update public.asignaciones a
   set fecha = (a.created_at at time zone 'America/Bogota')::date
 where a.fecha <> (a.created_at at time zone 'America/Bogota')::date
   and not exists (
     select 1 from public.asignaciones b
      where b.user_id = a.user_id
        and b.numero_caso = a.numero_caso
        and b.fecha = (a.created_at at time zone 'America/Bogota')::date
        and b.id <> a.id
   );

-- ── 3 · Verificación (debe decir America/Bogota) ──────────────────
--    Ejecutar en una consulta NUEVA después de este archivo:
--      show timezone;
--      select current_date, now();

notify pgrst, 'reload schema';
