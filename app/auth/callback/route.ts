import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Aterrizaje de los enlaces de correo (recuperar contraseña).
// Supabase manda a esta ruta con un `code` (flujo PKCE, mismo navegador)
// o un `token_hash` (flujo OTP, sirve incluso en otro dispositivo).
// Aquí canjeamos ese dato por una sesión (deja las cookies) y mandamos
// a /cambiar-password para que la persona cree su clave nueva.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next") || "/cambiar-password";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type"); // recovery | signup | email_change …

  const sb = await createClient();
  let ok = false;
  try {
    if (tokenHash && type) {
      const { error } = await sb.auth.verifyOtp({ type: type as any, token_hash: tokenHash });
      ok = !error;
    } else if (code) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      ok = !error;
    }
  } catch { ok = false; }

  const dest = url.clone();
  dest.search = "";
  dest.pathname = ok ? next : "/login";
  if (!ok) dest.searchParams.set("reset", "error");
  return NextResponse.redirect(dest);
}
