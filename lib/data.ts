"use client";
import { createClient } from "@/lib/supabase/client";
import type { Asignacion, Gestion, GestionTipo, MetricaPersona, Usuario } from "@/lib/types";

// ════════════════════════════════════════════════════════════════
//  Capa de datos. Cada función reemplaza una operación que en el
//  prototipo vivía en useState. RLS garantiza que cada rol solo
//  acceda a lo que le corresponde, así que aquí no repetimos chequeos.
// ════════════════════════════════════════════════════════════════
const hoy = () => new Date().toISOString().slice(0, 10);

// ── Sesión / perfil ───────────────────────────────────────────────
export async function getPerfil(): Promise<Usuario | null> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("usuarios").select("*").eq("id", user.id).single();
  return data as Usuario | null;
}

// ── Catálogo de gestiones ─────────────────────────────────────────
export async function getCatalogo(): Promise<GestionTipo[]> {
  const sb = createClient();
  const { data } = await sb.from("gestiones_catalogo").select("*").order("orden");
  return (data ?? []) as GestionTipo[];
}

// ── BANDEJA DEL DÍA (vista agente) ────────────────────────────────
export async function getMiBandeja(userId: string, fecha = hoy()): Promise<Asignacion[]> {
  const sb = createClient();
  const { data } = await sb.from("asignaciones").select("*")
    .eq("user_id", userId).eq("fecha", fecha).order("created_at");
  return (data ?? []) as Asignacion[];
}

export async function getMiActividad(userId: string, fecha = hoy()): Promise<Gestion[]> {
  // El agente ve sus entradas, NO un total acumulado (eso solo vía RPC privilegiado).
  const sb = createClient();
  const { data } = await sb.from("gestiones").select("*")
    .eq("user_id", userId).eq("fecha", fecha).order("registrado_at", { ascending: false });
  return (data ?? []) as Gestion[];
}

// Registrar una gestión sobre un caso ya asignado + marcar si sigue o se cierra.
export async function registrarGestion(opts: {
  userId: string; tipoId: string; numeroCaso: string; minutos: number;
  asignacionId?: string | null; seguir: boolean;
}) {
  const sb = createClient();
  const { data: g, error } = await sb.from("gestiones").insert({
    user_id: opts.userId, tipo_id: opts.tipoId, numero_caso: opts.numeroCaso,
    minutos: opts.minutos, asignacion_id: opts.asignacionId ?? null, fecha: hoy(),
  }).select().single();
  if (error) throw error;
  if (opts.asignacionId) {
    await sb.from("asignaciones")
      .update({ estado: opts.seguir ? "progreso" : "gestionado" })
      .eq("id", opts.asignacionId);
  }
  return g as Gestion;
}

// El agente agrega un caso que le llegó en el día.
export async function agregarCasoNuevo(opts: {
  userId: string; tipoId: string; numeroCaso: string; minutos: number; seguir: boolean;
}) {
  const sb = createClient();
  const { data: a, error } = await sb.from("asignaciones").insert({
    user_id: opts.userId, numero_caso: opts.numeroCaso, fecha: hoy(),
    estado: opts.seguir ? "progreso" : "gestionado", asignado_por: opts.userId,
  }).select().single();
  if (error) throw error;
  await registrarGestion({ ...opts, asignacionId: a.id });
  return a as Asignacion;
}

// Gestión sin caso asignado (ej. llamada de otro grupo) — igual lleva número de caso.
export async function registrarLibre(opts: {
  userId: string; tipoId: string; numeroCaso: string; minutos: number;
}) {
  return registrarGestion({ ...opts, asignacionId: null, seguir: false });
}

// ── REPARTIR SEGUIMIENTO (vista senior) ───────────────────────────
export async function getEquipo(): Promise<Usuario[]> {
  const sb = createClient();
  const { data } = await sb.from("usuarios").select("*")
    .eq("activo", true).order("nombre");
  return (data ?? []) as Usuario[];
}

export async function repartirSeguimiento(opts: {
  userId: string; seniorId: string; casos: string[]; fecha?: string;
}) {
  const sb = createClient();
  const fecha = opts.fecha ?? hoy();
  const filas = opts.casos.map((c) => ({
    user_id: opts.userId, numero_caso: c.trim(), fecha,
    estado: "pendiente" as const, asignado_por: opts.seniorId,
  }));
  // upsert evita duplicar un caso ya asignado ese día (índice único fecha+user+caso).
  const { error } = await sb.from("asignaciones")
    .upsert(filas, { onConflict: "fecha,user_id,numero_caso", ignoreDuplicates: true });
  if (error) throw error;
}

export async function quitarAsignacion(id: string) {
  const sb = createClient();
  await sb.from("asignaciones").delete().eq("id", id);
}

// ── DASHBOARDS (vista coordinador / superadmin) — solo vía RPC ─────
export async function getMetricasPersonas(fecha = hoy()): Promise<MetricaPersona[]> {
  const sb = createClient();
  const { data, error } = await sb.rpc("metricas_personas", { p_fecha: fecha });
  if (error) throw error;
  return (data ?? []) as MetricaPersona[];
}
export async function getMetricasPorRol(fecha = hoy()) {
  const sb = createClient();
  const { data } = await sb.rpc("metricas_por_rol", { p_fecha: fecha });
  return data ?? [];
}
export async function getGestionesPorTipo(fecha = hoy()) {
  const sb = createClient();
  const { data } = await sb.rpc("gestiones_por_tipo", { p_fecha: fecha });
  return data ?? [];
}
export async function getTendencia(dias = 7) {
  const sb = createClient();
  const { data } = await sb.rpc("tendencia", { p_dias: dias });
  return data ?? [];
}

// ── AUDITORÍA (vista coordinador) ─────────────────────────────────
export async function getGestionesDia(fecha = hoy()) {
  const sb = createClient();
  const { data } = await sb.from("gestiones")
    .select("*, usuarios(nombre,apellido), gestiones_catalogo(nombre,categoria,umbral_min)")
    .eq("fecha", fecha).order("registrado_at", { ascending: false });
  return data ?? [];
}

// ── CONFIGURACIÓN (superadmin) ────────────────────────────────────
export async function toggleGestion(id: string, activo: boolean) {
  const sb = createClient();
  await sb.from("gestiones_catalogo").update({ activo }).eq("id", id);
}
export async function agregarGestion(g: {
  nombre: string; categoria: string; umbral_min: number;
}) {
  const sb = createClient();
  const { data } = await sb.from("gestiones_catalogo").insert(g).select().single();
  return data;
}
export async function getUsuarios(): Promise<Usuario[]> {
  const sb = createClient();
  const { data } = await sb.from("usuarios").select("*").order("nombre");
  return (data ?? []) as Usuario[];
}

export async function getHorariosDia(fecha = hoy()) {
  const sb = createClient();
  const { data } = await sb.from("horarios")
    .select("*, usuarios(nombre,apellido,cargo)")
    .eq("fecha", fecha);
  return data ?? [];
}
