"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { loginToEmail } from "@/lib/loginEmail";

export async function login(_prev: unknown, formData: FormData) {
  const usuario = String(formData.get("usuario") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!usuario || !password) return { error: "Escribe tu usuario y contraseña." };

  const sb = await createClient();
  // Resuelve el correo de acceso (soporta usuario o correo, y sigue
  // funcionando aunque el correo de auth haya cambiado a uno real).
  let email = loginToEmail(usuario);
  try {
    const { data: resuelto } = await sb.rpc("auth_email_de", { p_ident: usuario });
    if (resuelto) email = resuelto as string;
  } catch { /* fallback al correo técnico */ }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Usuario o contraseña incorrectos." };

  // Bloqueo de cuenta
  const { data: perfil } = await sb.from("usuarios").select("bloqueado").eq("id", data.user.id).single();
  if (perfil?.bloqueado) {
    await sb.auth.signOut();
    return { error: "Tu cuenta está bloqueada. Contacta a tu coordinador." };
  }
  redirect("/");
}

export async function logout() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/login");
}

// ── Autoservicio de contraseña por correo ─────────────────────────
//    La persona escribe su USUARIO o su CORREO. Si tiene un correo real
//    registrado, ponemos ese correo como email de acceso (para que el
//    enlace llegue) y le enviamos el correo de restablecimiento.
//    Siempre devolvemos el mismo mensaje: no revelamos si la cuenta existe.
export async function solicitarReset(_prev: unknown, formData: FormData): Promise<{ error?: string; msg?: string }> {
  const generico = { msg: "Si el usuario o correo existe, te enviamos un enlace para restablecer la contraseña. Revisa tu bandeja y la carpeta de spam." };
  const ident = String(formData.get("ident") ?? "").trim();
  if (!ident) return { error: "Escribe tu usuario o tu correo." };

  try {
    const sb = await createClient();
    // Resuelve el email de acceso actual (por usuario o correo).
    const { data: emailAcceso } = await sb.rpc("auth_email_de", { p_ident: ident });

    // Averigua el correo real de la persona (solo lectura server-side, con service role).
    // Igualdad exacta parametrizada en dos consultas — sin .or() con texto del usuario (evita inyección).
    const admin = createAdminClient();
    let fila: { id: string; email_real: string | null } | null = null;
    {
      const { data } = await admin
        .from("usuarios").select("id, email_real")
        .eq("activo", true).eq("login", ident.toUpperCase()).limit(1).maybeSingle();
      fila = data ?? null;
    }
    if (!fila) {
      const { data } = await admin
        .from("usuarios").select("id, email_real")
        .eq("activo", true).eq("email_real", ident.toLowerCase()).limit(1).maybeSingle();
      fila = data ?? null;
    }

    const emailReal = (fila?.email_real ?? "").trim();
    if (!fila?.id || !emailReal) return generico;   // sin correo real no podemos enviar nada

    // Si el email de acceso aún es el técnico, lo cambiamos al correo real
    // para que el enlace de recuperación llegue a una bandeja de verdad.
    if (!emailAcceso || String(emailAcceso).toLowerCase() !== emailReal.toLowerCase()) {
      await admin.auth.admin.updateUserById(fila.id, { email: emailReal, email_confirm: true }).catch(() => {});
    }

    // Base del sitio para el enlace de retorno.
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "https";
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? (host ? `${proto}://${host}` : "")).replace(/\/$/, "");

    await sb.auth.resetPasswordForEmail(emailReal, {
      redirectTo: base ? `${base}/auth/callback?next=/cambiar-password` : undefined,
    });
  } catch { /* nunca revelamos detalles del fallo */ }

  return generico;
}
