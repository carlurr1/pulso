-- ════════════════════════════════════════════════════════════════
--  08 · Estado de cuentas (cambio de clave obligatorio, bloqueo)
--  Ejecutar después de 01–07.
-- ════════════════════════════════════════════════════════════════

alter table public.usuarios
  add column if not exists debe_cambiar_pass boolean not null default true,
  add column if not exists bloqueado boolean not null default false,
  add column if not exists pass_cambiada_at timestamptz;

-- El superadmin actual no necesita cambiar su clave en el primer ingreso.
update public.usuarios set debe_cambiar_pass = false where rol = 'superadmin';

-- Cada usuario marca su propia clave como cambiada (sin tocar la de otros).
create or replace function public.marcar_pass_cambiada()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.usuarios
  set debe_cambiar_pass = false, pass_cambiada_at = now()
  where id = auth.uid();
end $$;
