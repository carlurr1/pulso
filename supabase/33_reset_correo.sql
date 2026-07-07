-- ════════════════════════════════════════════════════════════════
--  33 · Autoservicio de contraseña por correo
--  · usuarios.email_real: el correo real de la persona (para el enlace).
--  · auth_email_de(ident): devuelve el correo de acceso (auth) a partir
--    del USUARIO o del CORREO. El login lo usa para seguir funcionando
--    aunque el correo de acceso pase de técnico a real tras un reset.
--  Ejecutar después de 32.
--
--  ⚠️ Además, en Supabase → Authentication → URL Configuration:
--     · "Site URL":       https://TU-DOMINIO
--     · "Redirect URLs":  agregar  https://TU-DOMINIO/auth/callback
--     (opcional) configurar SMTP propio en Auth → Emails para volumen.
--
--  Nota (multi-dispositivo): el flujo PKCE por defecto funciona cuando la
--  persona abre el correo en el MISMO navegador donde pidió el reset. Para
--  que el enlace sirva también en otro equipo, edita la plantilla de
--  "Reset Password" (Auth → Emails) y usa un enlace tipo:
--     {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/cambiar-password
--  La ruta /auth/callback ya soporta ambos casos (code y token_hash).
-- ════════════════════════════════════════════════════════════════

alter table public.usuarios add column if not exists email_real text;

-- Resuelve el email de acceso (auth) por usuario o por correo real.
-- SECURITY DEFINER para poder leer auth.users; se usa antes de iniciar sesión.
create or replace function public.auth_email_de(p_ident text)
returns text
language sql stable security definer set search_path = public, auth as $$
  select au.email
  from public.usuarios u
  join auth.users au on au.id = u.id
  where u.activo
    and (upper(u.login) = upper(trim(p_ident))
         or lower(coalesce(u.email_real,'')) = lower(trim(p_ident)))
  limit 1
$$;
grant execute on function public.auth_email_de(text) to anon, authenticated;

notify pgrst, 'reload schema';
