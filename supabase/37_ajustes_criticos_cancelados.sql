-- ════════════════════════════════════════════════════════════════
--  37 · Ajustes:
--   1) Casos CRÍTICOS: el senior puede marcar un caso al asignarlo
--      (o después) para que le aparezca en ROJO al analista y lo
--      revise primero.
--   2) Nueva gestión "CASOS CANCELADOS": permite pegar casos masivos
--      y cerrarlos todos de una vez.
--  Ejecutar después de 36.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Marca de caso crítico en la bandeja ────────────────────────
alter table public.asignaciones
  add column if not exists critico boolean not null default false;

-- Índice para ordenar/priorizar rápido las bandejas grandes.
create index if not exists idx_asignaciones_critico
  on public.asignaciones (user_id, fecha) where critico;

-- ── 2) Nueva gestión: CASOS CANCELADOS ────────────────────────────
--    Categoría 'casos'. Se usa con carga masiva + cierre (crear_casos_masivo
--    con p_cerrar = true), así que registra la gestión y cierra todos los
--    casos pegados de una sola vez.
insert into public.gestiones_catalogo (nombre, categoria, umbral_min, senior_only, orden)
select 'CASOS CANCELADOS', 'casos', 5, false, 23
where not exists (
  select 1 from public.gestiones_catalogo
  where upper(trim(nombre)) = 'CASOS CANCELADOS'
);

notify pgrst, 'reload schema';
