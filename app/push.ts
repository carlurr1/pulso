"use server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ════════════════════════════════════════════════════════════════
//  Envío de Web Push (notificaciones aunque la pestaña esté cerrada).
//  Requiere en Vercel: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
//  y VAPID_SUBJECT (mailto:...). Sin ellas, todo degrada en silencio.
// ════════════════════════════════════════════════════════════════

function vapidOk() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

async function quienLlama() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("usuarios").select("id, rol, nombre, apellido").eq("id", user.id).single();
  return data as { id: string; rol: string; nombre: string; apellido: string | null } | null;
}

async function enviar(subs: { endpoint: string; p256dh: string; auth_key: string }[], payload: string) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:soporte@groupcos.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  const admin = createAdminClient();
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, payload);
    } catch (e: any) {
      // Suscripción vencida o revocada: se limpia sola.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await admin.from("push_subs").delete().eq("endpoint", s.endpoint).then(() => {}, () => {});
      }
    }
  }));
}

// Push a personas específicas (ej: te asignaron un caso, alerta directa).
export async function pushUsuarios(userIds: string[], titulo: string, cuerpo: string) {
  try {
    if (!vapidOk() || !userIds.length) return { ok: false };
    const yo = await quienLlama();
    if (!yo) return { ok: false };
    const admin = createAdminClient();
    const { data: subs } = await admin.from("push_subs").select("*").in("user_id", userIds.slice(0, 20));
    if (!subs?.length) return { ok: true, enviados: 0 };
    await enviar(subs, JSON.stringify({ titulo: titulo.slice(0, 80), cuerpo: cuerpo.slice(0, 160) }));
    return { ok: true, enviados: subs.length };
  } catch { return { ok: false }; }
}

// Push masivo al equipo (anuncios): solo coordinador/superadmin.
export async function pushEquipo(mesa: string | null, titulo: string, cuerpo: string) {
  try {
    if (!vapidOk()) return { ok: false };
    const yo = await quienLlama();
    if (!yo || (yo.rol !== "coordinador" && yo.rol !== "superadmin")) return { ok: false };
    const admin = createAdminClient();
    let q = admin.from("usuarios").select("id, mesa").eq("activo", true).in("rol", ["agente", "senior"]);
    const { data: usuarios } = await q;
    // Respeta el alcance del anuncio: mesa exacta o su grupo.
    let objetivo = (usuarios ?? []).map((u: any) => u.id);
    if (mesa) {
      const { data: mesas } = await admin.from("mesas").select("nombre, grupo");
      const delGrupo = new Set((mesas ?? []).filter((m: any) => m.nombre === mesa || m.grupo === mesa).map((m: any) => m.nombre));
      objetivo = (usuarios ?? []).filter((u: any) => delGrupo.has(u.mesa)).map((u: any) => u.id);
    }
    if (!objetivo.length) return { ok: true, enviados: 0 };
    const { data: subs } = await admin.from("push_subs").select("*").in("user_id", objetivo);
    if (!subs?.length) return { ok: true, enviados: 0 };
    await enviar(subs, JSON.stringify({ titulo: titulo.slice(0, 80), cuerpo: cuerpo.slice(0, 160) }));
    return { ok: true, enviados: subs.length };
  } catch { return { ok: false }; }
}
