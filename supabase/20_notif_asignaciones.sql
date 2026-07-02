-- ════════════════════════════════════════════════════════════════
--  20 · Notificaciones en vivo de asignaciones
--  Publica los INSERT de asignaciones por Realtime para que al agente
--  le llegue al instante "Fulano te pasó el caso #XXXX · Cliente"
--  cuando el senior le reparte o un compañero le traspasa un caso.
--  RLS aplica también al Realtime: cada quien solo recibe sus filas.
--  Ejecutar después de 19.
-- ════════════════════════════════════════════════════════════════

do $$ begin
  alter publication supabase_realtime add table public.asignaciones;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
