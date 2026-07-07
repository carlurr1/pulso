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
  cargo: string; password: string; code?: string; documento?: string; mesa?: string; email_real?: string;
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
    mesa: input.mesa || "MAYORISTAS", email_real: input.email_real?.trim().toLowerCase() || null,
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

// ── Carga MASIVA de usuarios (Excel/CSV pegado) ───────────────────
//    Crea muchos de una vez. Devuelve el resultado fila por fila para
//    mostrar qué entró y qué falló, sin detener el resto.
export async function crearUsuariosMasivo(filas: {
  login: string; nombre: string; apellido?: string; rol?: Rol;
  cargo?: string; code?: string; mesa?: string; password?: string; documento?: string; email_real?: string;
}[]): Promise<{ ok: boolean; error?: string; resultados?: { login: string; ok: boolean; error?: string }[] }> {
  try { await exigirAdmin(); } catch { return { ok: false, error: "No autorizado. Vuelve a iniciar sesión como superadmin." }; }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel." };
  }
  const admin = createAdminClient();
  const resultados: { login: string; ok: boolean; error?: string }[] = [];

  // Para auto-generar el usuario cuando la columna Usuario viene vacía:
  // se arma con la inicial del nombre + el primer apellido (ej. JECHEVERRI),
  // y si ya existe se le agrega un número. Evita choques con los ya creados.
  const usados = new Set<string>();
  const { data: existentes } = await admin.from("usuarios").select("login");
  (existentes ?? []).forEach((u: any) => usados.add(String(u.login).toLowerCase()));
  const autoLogin = (nombre: string, apellido: string, code: string) => {
    const ini = slugLogin(nombre).charAt(0);
    const ape = slugLogin((apellido || "").split(" ")[0]);
    let base = (ini + ape) || slugLogin(code) || slugLogin(nombre);
    if (!base) return "";
    let cand = base, i = 1;
    while (usados.has(cand)) { i++; cand = base + i; }
    usados.add(cand);
    return cand;
  };

  for (const f of filas) {
    let login = String(f.login ?? "").trim();
    if (!login) login = autoLogin(f.nombre ?? "", f.apellido ?? "", f.code ?? "");   // usuario automático
    if (!slugLogin(login)) { resultados.push({ login: login || "(vacío)", ok: false, error: "no pude generar usuario (falta nombre o cédula)" }); continue; }
    usados.add(login.toLowerCase());
    const pass = (f.password && f.password.length >= 6) ? f.password : "Cos2026*";
    try {
      const { data: authUser, error: e1 } = await admin.auth.admin.createUser({
        email: loginToEmail(login), password: pass, email_confirm: true, user_metadata: { login },
      });
      if (e1 || !authUser?.user) {
        const m = (e1?.message ?? "").toLowerCase();
        const dup = m.includes("already") || m.includes("registered") || m.includes("exist") || m.includes("duplicate");
        resultados.push({ login, ok: false, error: dup ? "ya existe" : (e1?.message ?? "no se pudo crear el acceso") });
        continue;
      }
      const { error: e2 } = await admin.from("usuarios").insert({
        id: authUser.user.id, login: login.toUpperCase(), nombre: f.nombre?.trim() || login,
        apellido: f.apellido?.trim() || null, rol: f.rol || "agente", cargo: f.cargo?.trim() || "Agente",
        code: f.code ? String(f.code).trim() : null, mesa: f.mesa?.trim().toUpperCase() || "MAYORISTAS",
        email_real: f.email_real?.trim().toLowerCase() || null,
      });
      if (e2) {
        await admin.auth.admin.deleteUser(authUser.user.id).catch(() => {});
        resultados.push({ login, ok: false, error: (e2 as any).code === "23505" ? "usuario o código repetido" : e2.message });
        continue;
      }
      if (f.documento) {
        try { await admin.rpc("guardar_documento", { p_user: authUser.user.id, p_doc: String(f.documento).trim() }); } catch { /* opcional */ }
      }
      resultados.push({ login, ok: true });
    } catch (e: any) {
      resultados.push({ login, ok: false, error: e?.message ?? "error inesperado" });
    }
  }
  return { ok: true, resultados };
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
//    Devuelve { ok, error } (no lanza) para poder mostrar mensajes claros:
//    en producción Next.js oculta el texto de los errores lanzados y los
//    reemplaza por uno genérico ("Server Components render…").
export async function editarUsuario(userId: string, campos: {
  nombre?: string; apellido?: string; code?: string; rol?: Rol; cargo?: string; login?: string; mesa?: string; email_real?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try { await exigirAdmin(); } catch { return { ok: false, error: "No autorizado. Vuelve a iniciar sesión como superadmin." }; }
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { ...campos };
  if (campos.login) patch.login = campos.login.toUpperCase();
  if (campos.email_real !== undefined) patch.email_real = campos.email_real.trim().toLowerCase() || null;
  const { error } = await admin.from("usuarios").update(patch).eq("id", userId);
  if (error) {
    const m = (error.message || "").toLowerCase();
    // Caso típico: aún no se corrió la migración 33 → la columna no existe.
    if (m.includes("email_real") || m.includes("schema cache") || m.includes("column")) {
      return { ok: false, error: "Falta correr la migración 33 en Supabase: el campo de correo aún no existe en la base de datos. Córrela en SQL Editor y vuelve a intentar." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ── Eliminar un usuario por completo ──────────────────────────────
//    Borra la cuenta de acceso; el perfil y sus datos se van en cascada.
//    Si tiene actividad que otros dependen (casos que asignó), la base lo
//    impide: en ese caso conviene bloquearlo en vez de borrarlo.
export async function eliminarUsuario(userId: string): Promise<{ ok: boolean; error?: string }> {
  try { await exigirAdmin(); } catch { return { ok: false, error: "No autorizado. Vuelve a iniciar sesión como superadmin." }; }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel." };
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    const m = (error.message || "").toLowerCase();
    if (m.includes("foreign key") || m.includes("violates") || m.includes("constraint")) {
      return { ok: false, error: "No se puede eliminar: este usuario ya tiene actividad registrada (casos que asignó, etc.). Mejor bloquéalo." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
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
