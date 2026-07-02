-- ════════════════════════════════════════════════════════════════
--  18 · Nuevo tipo de pausa: Baño
--  Ejecutar después de 17.
-- ════════════════════════════════════════════════════════════════

alter table public.pausas drop constraint if exists pausas_tipo_check;
alter table public.pausas add constraint pausas_tipo_check
  check (tipo in ('break','almuerzo','reunion','capacitacion','bano'));

notify pgrst, 'reload schema';
