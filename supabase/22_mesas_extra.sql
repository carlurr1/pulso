-- ════════════════════════════════════════════════════════════════
--  22 · Mesas adicionales del Help Desk: Silver, Elite y Distrito
--  (Equivale a agregarlas desde Configuración → Mesas; es idempotente,
--  si ya existen no hace nada.) Ejecutar después de 21.
-- ════════════════════════════════════════════════════════════════

insert into public.mesas (nombre, orden) values
  ('SILVER', 4), ('ELITE', 5), ('DISTRITO', 6)
on conflict (nombre) do nothing;
