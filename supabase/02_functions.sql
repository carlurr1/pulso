-- ════════════════════════════════════════════════════════════════
--  02 · Funciones y triggers
-- ════════════════════════════════════════════════════════════════

-- ── Rol del usuario autenticado ───────────────────────────────────
--    SECURITY DEFINER → lee public.usuarios sin disparar RLS (evita recursión).
create or replace function public.mi_rol()
returns text
language sql stable security definer set search_path = public
as $$ select rol from public.usuarios where id = auth.uid() $$;

create or replace function public.es_privilegiado()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.mi_rol() in ('coordinador','superadmin') $$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.mi_rol() = 'superadmin' $$;

-- ── Cálculo automático de minutos disponibles del turno ───────────
--    Maneja turnos nocturnos (22:00–06:00) sumando 24h cuando fin <= inicio.
create or replace function public.calc_disponible()
returns trigger language plpgsql as $$
declare dur int;
begin
  if new.disponible_min is not null then
    return new;                                    -- el importador ya lo calculó (desde "th")
  end if;
  if new.turno_inicio is null or new.turno_fin is null then
    new.disponible_min := 0; return new;
  end if;
  dur := (extract(epoch from (new.turno_fin - new.turno_inicio)) / 60)::int;
  if dur <= 0 then dur := dur + 1440; end if;       -- cruce de medianoche
  new.disponible_min := dur - coalesce(new.almuerzo_min,0) - coalesce(new.break_min,0);
  return new;
end $$;

create trigger trg_calc_disponible
  before insert or update on public.horarios
  for each row execute function public.calc_disponible();

-- ── Cifrado de documento (cédula) usando una llave en Supabase Vault ──
--    Crea el secreto una sola vez (Dashboard → Project Settings → Vault):
--      nombre: pulso_pii_key   valor: <cadena aleatoria larga>
create or replace function public.guardar_documento(p_user uuid, p_doc text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare k text;
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'pulso_pii_key';
  insert into public.empleado_documento(user_id, documento_cifrado, actualizado_at)
  values (p_user, pgp_sym_encrypt(p_doc, k), now())
  on conflict (user_id) do update
    set documento_cifrado = excluded.documento_cifrado, actualizado_at = now();
end $$;

create or replace function public.leer_documento(p_user uuid)
returns text language plpgsql security definer set search_path = public, vault as $$
declare k text; v bytea;
begin
  if not public.es_admin() then raise exception 'No autorizado'; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'pulso_pii_key';
  select documento_cifrado into v from public.empleado_documento where user_id = p_user;
  if v is null then return null; end if;
  return pgp_sym_decrypt(v, k);
end $$;
