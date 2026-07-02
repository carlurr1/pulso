"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginToEmail, slugLogin } from "@/lib/loginEmail";
import { consultarCasos } from "@/lib/sfCaso";
import type { Rol } from "@/lib/types";

// Verifica que quien llama sea superadmin antes de cualquier acción sensible.
async function exigirAdmin() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Sin sesión");
  const { data } = await sb.from("usuarios").select("rol").eq("id", user.id).single();
  if (data?.rol !== "superadmin") throw new Error("No autorizado");
}

// ── Crear un usuario del equipo con su acceso genérico ─────────────
//    Devuelve { ok, error } en vez de lanzar, para mostrar mensajes claros
//    y no romper la pantalla.
export async function crearUsuario(input: {
  login: string; nombre: string; apellido: string; rol: Rol;
  cargo: string; password: string; code?: string; documento?: string; mesa?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try { await exigirAdmin(); } catch { return { ok: false, error: "No autorizado. Vuelve a iniciar sesión como superadmin." }; }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel (Settings → Environment Variables)." };
  }
  if (!input.password || input.password.length < 6) {
    return { ok: false, error: "La contraseña temporal debe tener al menos 6 caracteres." };
  }
  if (!slugLogin(input.login)) {
    return { ok: false, error: "El usuario debe tener letras o números (sin espacios ni símbolos). Ej: JDAVID o JUANDAVID." };
  }
  const admin = createAdminClient();

  // 1) Crea la cuenta en Supabase Auth (email técnico, ya confirmado).
  const { data: authUser, error: e1 } = await admin.auth.admin.createUser({
    email: loginToEmail(input.login),
    password: input.password,
    email_confirm: true,
    user_metadata: { login: input.login },
  });
  if (e1 || !authUser?.user) {
    const m = (e1?.message ?? "").toLowerCase();
    if (m.includes("already") || m.includes("registered") || m.includes("exist") || m.includes("duplicate")) {
      return { ok: false, error: `Ya existe un usuario con el acceso "${input.login.toUpperCase()}". Usa otro nombre de usuario.` };
    }
    return { ok: false, error: e1?.message ?? "No se pudo crear el acceso." };
  }

  // 2) Crea el perfil. Si falla, deshace el usuario de Auth (evita huérfanos).
  const { error: e2 } = await admin.from("usuarios").insert({
    id: authUser.user.id, login: input.login.toUpperCase(), nombre: input.nombre,
    apellido: input.apellido, rol: input.rol, cargo: input.cargo, code: input.code || null,
    mesa: input.mesa || "MAYORISTAS",
  });
  if (e2) {
    await admin.auth.admin.deleteUser(authUser.user.id).catch(() => {});
    if ((e2 as any).code === "23505") return { ok: false, error: "Ese usuario o código ya está en uso por otra persona." };
    return { ok: false, error: e2.message };
  }

  // 3) (Opcional) Guarda la cédula cifrada vía RPC — nunca en claro.
  if (input.documento) {
    try { await admin.rpc("guardar_documento", { p_user: authUser.user.id, p_doc: input.documento }); } catch { /* el documento es opcional */ }
  }
  return { ok: true, id: authUser.user.id };
}

// ── Cambiar la contraseña de un miembro (queda temporal: debe cambiarla) ──
export async function resetPassword(userId: string, nueva: string) {
  await exigirAdmin();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: nueva });
  if (error) throw new Error(error.message);
  await admin.from("usuarios").update({ debe_cambiar_pass: true, pass_cambiada_at: null }).eq("id", userId);
}

// ── Editar perfil de un usuario ───────────────────────────────────
export async function editarUsuario(userId: string, campos: {
  nombre?: string; apellido?: string; code?: string; rol?: Rol; cargo?: string; login?: string; mesa?: string;
}) {
  await exigirAdmin();
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { ...campos };
  if (campos.login) patch.login = campos.login.toUpperCase();
  const { error } = await admin.from("usuarios").update(patch).eq("id", userId);
  if (error) throw new Error(error.message);
}

// ── Bloquear / desbloquear acceso ─────────────────────────────────
export async function bloquearUsuario(userId: string, bloquear: boolean) {
  await exigirAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("usuarios").update({ bloqueado: bloquear }).eq("id", userId);
  if (error) throw new Error(error.message);
}

// ── Guardar horarios parseados del Excel (ver scripts/import-horarios.ts) ──
export async function guardarHorarios(filas: {
  user_id: string; fecha: string; turno: string;
  almuerzo_min: number; break_min: number; disponible_min: number;
}[]) {
  await exigirAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("horarios")
    .upsert(filas, { onConflict: "user_id,fecha" });
  if (error) throw new Error(error.message);
  return { insertados: filas.length };
}

// ── Enriquecer casos con datos de Salesforce (foto en casos_sf) ────
//    Se llama al asignar o agregar casos. Es tolerante a fallos: si SF
//    no está configurado o el caso no existe, no rompe el flujo principal.
export async function enriquecerCasos(numeros: string[]) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, reason: "sin-sesion" };
  if (!process.env.SF_USERNAME) return { ok: false, reason: "sf-no-configurado" };
  try {
    const casos = await consultarCasos(numeros);
    if (!casos.length) return { ok: true, encontrados: 0 };
    const admin = createAdminClient();
    const filas = casos.map((c) => ({ ...c, actualizado_at: new Date().toISOString() }));
    const { error } = await admin.from("casos_sf").upsert(filas, { onConflict: "numero_caso" });
    if (error) return { ok: false, error: error.message };
    return { ok: true, encontrados: casos.length };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "error consultando Salesforce" };
  }
}
