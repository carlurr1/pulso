-- ════════════════════════════════════════════════════════════════
--  10 · DEMO — poblar datos de ejemplo para HOY (opcional)
--  Crea horarios, casos, gestiones, sesiones, pausas y "fotos" de
--  Salesforce de ejemplo para TODOS los agentes/senior activos.
--  Ejecútalo para ver el tablero, la presencia y los clientes con vida.
--  Al final está cómo LIMPIARLO antes de arrancar en real.
-- ════════════════════════════════════════════════════════════════
do $$
declare
  u record; tipo uuid; i int; n int; caso text; done boolean; cli text;
  clientes text[] := array['CLARO','TIGO','MOVISTAR','WOM','DIRECTV','ETB EMPRESAS','SKYNET','VIRGIN MOBILE'];
  tipos    text[] := array['Falla masiva','Consulta','Reclamo','Instalación','Soporte técnico'];
  prio     text[] := array['Alta','Media','Baja'];
begin
  for u in select id from public.usuarios where rol in ('agente','senior') and activo loop
    -- Turno del día
    insert into public.horarios(user_id, fecha, turno, turno_inicio, turno_fin, almuerzo_min, break_min, disponible_min)
      values (u.id, current_date, '08:00-17:00', '08:00', '17:00', 60, 15, 405)
      on conflict (user_id, fecha) do nothing;

    -- Sesión (estuvo logueado unas horas, "en línea" hace pocos minutos)
    insert into public.sesiones(user_id, inicio, ultimo_latido)
      values (u.id, now() - (interval '1 hour' * (2 + random()*5)), now() - (interval '1 minute' * floor(random()*4)));

    -- Un almuerzo ya tomado
    insert into public.pausas(user_id, fecha, tipo, inicio, fin)
      values (u.id, current_date, 'almuerzo', now() - interval '3 hours', now() - interval '2 hours');

    -- Casos del día + gestiones + foto de Salesforce
    n := 5 + floor(random()*7)::int;
    for i in 1..n loop
      select id into tipo from public.gestiones_catalogo where activo order by random() limit 1;
      caso := '0' || (10000000 + floor(random()*8999999))::bigint::text;
      done := random() < 0.62;
      cli  := clientes[1 + floor(random()*array_length(clientes,1))::int];

      insert into public.asignaciones(fecha, user_id, numero_caso, estado, asignado_por)
        values (current_date, u.id, caso, case when done then 'gestionado' else 'pendiente' end, u.id)
        on conflict (fecha, user_id, numero_caso) do nothing;

      insert into public.casos_sf(numero_caso, cliente, estado, prioridad, tipo, actualizado_at)
        values (caso, cli, case when done then 'Cerrado' else 'Abierto' end,
                prio[1 + floor(random()*3)::int], tipos[1 + floor(random()*array_length(tipos,1))::int], now())
        on conflict (numero_caso) do nothing;

      if done then
        insert into public.gestiones(user_id, tipo_id, numero_caso, minutos, fecha)
          values (u.id, tipo, caso, 6 + floor(random()*18)::int, current_date);
      end if;
    end loop;
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────
-- LIMPIAR los datos de ejemplo (descomenta y ejecuta cuando arranques en real):
-- delete from public.gestiones    where fecha = current_date;
-- delete from public.asignaciones where fecha = current_date;
-- delete from public.pausas       where fecha = current_date;
-- delete from public.sesiones     where inicio::date = current_date;
-- delete from public.casos_sf;   -- ⚠️ borra TODAS las fotos SF (también reales)
-- ────────────────────────────────────────────────────────────────
