-- ════════════════════════════════════════════════════════════════
--  10 · DEMO — poblar UN MES de datos de ejemplo (opcional)
--  Genera horarios, casos, gestiones y "fotos" de Salesforce para los
--  últimos 30 días, además de sesiones y pausas de HOY. Ideal para la
--  presentación antes del despliegue real.
--  Al final está cómo LIMPIARLO.
-- ════════════════════════════════════════════════════════════════
do $$
declare
  u record; tipo uuid; d int; i int; n int; caso text; done boolean; cli text; dia date; finde boolean;
  clientes text[] := array['CLARO','TIGO','MOVISTAR','WOM','DIRECTV','ETB EMPRESAS','SKYNET','VIRGIN MOBILE','UNE','EMCALI'];
  tipos    text[] := array['Falla masiva','Consulta','Reclamo','Instalación','Soporte técnico'];
  prio     text[] := array['Alta','Media','Baja'];
begin
  for u in select id from public.usuarios where rol in ('agente','senior') and activo loop
    for d in 0..30 loop
      dia := current_date - d;
      finde := extract(dow from dia) in (0,6);   -- domingo/sábado

      -- Turno (los findes con menos disponible)
      insert into public.horarios(user_id, fecha, turno, turno_inicio, turno_fin, almuerzo_min, break_min, disponible_min)
        values (u.id, dia, '08:00-17:00', '08:00', '17:00', 60, 15, case when finde then 240 else 405 end)
        on conflict (user_id, fecha) do nothing;

      -- Casos del día (menos los findes)
      n := case when finde then 1 + floor(random()*3)::int else 5 + floor(random()*8)::int end;
      for i in 1..n loop
        select id into tipo from public.gestiones_catalogo where activo order by random() limit 1;
        caso := '0' || (10000000 + floor(random()*8999999))::bigint::text;
        done := random() < 0.66;
        cli  := clientes[1 + floor(random()*array_length(clientes,1))::int];

        insert into public.asignaciones(fecha, user_id, numero_caso, estado, asignado_por)
          values (dia, u.id, caso, case when done then 'gestionado' else 'pendiente' end, u.id)
          on conflict (fecha, user_id, numero_caso) do nothing;

        insert into public.casos_sf(numero_caso, cliente, estado, prioridad, tipo, actualizado_at)
          values (caso, cli, case when done then 'Cerrado' else 'Abierto' end,
                  prio[1 + floor(random()*3)::int], tipos[1 + floor(random()*array_length(tipos,1))::int], now())
          on conflict (numero_caso) do nothing;

        if done then
          insert into public.gestiones(user_id, tipo_id, numero_caso, minutos, fecha)
            values (u.id, tipo, caso, 6 + floor(random()*18)::int, dia);
        end if;
      end loop;
    end loop;

    -- Presencia de HOY: sesión + un almuerzo tomado
    insert into public.sesiones(user_id, inicio, ultimo_latido)
      values (u.id, now() - (interval '1 hour' * (2 + random()*5)), now() - (interval '1 minute' * floor(random()*4)));
    insert into public.pausas(user_id, fecha, tipo, inicio, fin)
      values (u.id, current_date, 'almuerzo', now() - interval '3 hours', now() - interval '2 hours');
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────
-- LIMPIAR el demo (descomenta y ejecuta cuando arranques en real):
-- delete from public.gestiones    where fecha >= current_date - 30;
-- delete from public.asignaciones where fecha >= current_date - 30;
-- delete from public.horarios     where fecha >= current_date - 30;
-- delete from public.pausas       where fecha >= current_date - 30;
-- delete from public.sesiones     where inicio >= current_date - 30;
-- delete from public.casos_sf;   -- ⚠️ borra TODAS las fotos SF (también reales)
-- ────────────────────────────────────────────────────────────────
