"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginToEmail } from "@/lib/loginEmail";
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
export async function crearUsuario(input: {
  login: string; nombre: string; apellido: string; rol: Rol;
  cargo: string; password: string; code?: string; documento?: string;
}) {
  await exigirAdmin();
  const admin = createAdminClient();

  // 1) Crea la cuenta en Supabase Auth (email técnico, ya confirmado).
  const { data: authUser, error: e1 } = await admin.auth.admin.createUser({
    email: loginToEmail(input.login),
    password: input.password,
    email_confirm: true,
    user_metadata: { login: input.login },
  });
  if (e1 || !authUser.user) throw new Error(e1?.message ?? "No se pudo crear el usuario");

  // 2) Crea el perfil con su rol y cargo.
  const { error: e2 } = await admin.from("usuarios").insert({
    id: authUser.user.id, login: input.login, nombre: input.nombre,
    apellido: input.apellido, rol: input.rol, cargo: input.cargo, code: input.code ?? null,
  });
  if (e2) throw new Error(e2.message);

  // 3) (Opcional) Guarda la cédula cifrada vía RPC — nunca en claro.
  if (input.documento) {
    await admin.rpc("guardar_documento", { p_user: authUser.user.id, p_doc: input.documento });
  }
  return { id: authUser.user.id };
}

// ── Cambiar la contraseña de un miembro ───────────────────────────
export async function resetPassword(userId: string, nueva: string) {
  await exigirAdmin();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: nueva });
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
