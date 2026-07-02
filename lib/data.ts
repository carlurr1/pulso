"use client";
import { createClient } from "@/lib/supabase/client";
import { enriquecerCasos } from "@/app/actions";
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
//    Incluye el ARRASTRE: los casos de días anteriores que sigan en
//    pendiente/progreso permanecen en la bandeja hasta que se gestionen
//    (ventana de 30 días para acotar la consulta).
export async function getMiBandeja(userId: string, fecha = hoy()): Promise<Asignacion[]> {
  const sb = createClient();
  const desde = new Date(new Date(fecha + "T12:00:00").getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const { data } = await sb.from("asignaciones").select("*")
    .eq("user_id", userId).gte("fecha", desde).lte("fecha", fecha)
    .or(`fecha.eq.${fecha},estado.neq.gestionado`)
    .order("fecha").order("created_at");
  let filas = (data ?? []) as Asignacion[];
  // Si el mismo caso fue re-asignado hoy, mostrar solo la copia más reciente.
  const masReciente = new Map<string, string>();
  filas.forEach((a) => {
    const prev = masReciente.get(a.numero_caso);
    if (!prev || a.fecha > prev) masReciente.set(a.numero_caso, a.fecha);
  });
  filas = filas.filter((a) => a.fecha === masReciente.get(a.numero_caso));
  if (filas.length) {
    const numeros = filas.map((a) => a.numero_caso).filter((n) => n && !n.startsWith("REU-"));
    if (numeros.length) {
      const { data: casos } = await sb.from("casos_sf").select("numero_caso, cliente").in("numero_caso", numeros);
      const mapa = new Map((casos ?? []).map((c: any) => [c.numero_caso, c.cliente]));
      filas.forEach((a) => { (a as any).cliente = mapa.get(a.numero_caso) ?? null; });
    }
  }
  return filas;
}

// Bandeja de TODO el equipo en un rango: cada caso asignado, a quién y su
// estado. Solo privilegiados (RLS lo restringe). Enriquece cliente (Salesforce).
export async function getBandejaEquipo(desde: string, hasta: string, personaId?: string | null) {
  const sb = createClient();
  let q = sb.from("asignaciones").select("*")
    .gte("fecha", desde).lte("fecha", hasta)
    .order("fecha", { ascending: false }).order("created_at", { ascending: false });
  if (personaId) q = q.eq("user_id", personaId);
  const { data } = await q;
  const filas = (data ?? []) as any[];
  if (!filas.length) return [];
  // Persona de cada asignación + quién la asignó (origen del caso).
  const ids = [...new Set(filas.flatMap((a) => [a.user_id, a.asignado_por].filter(Boolean)))];
  const { data: us } = await sb.from("usuarios").select("id, nombre, apellido, cargo").in("id", ids);
  const umap = new Map((us ?? []).map((u: any) => [u.id, u]));
  // Cliente por caso (Salesforce), ignorando reuniones/internas (REU-).
  const numeros = [...new Set(filas.map((a) => a.numero_caso).filter((n: string) => n && !n.startsWith("REU-")))];
  let cmap = new Map<string, string>();
  if (numeros.length) {
    const { data: casos } = await sb.from("casos_sf").select("numero_caso, cliente").in("numero_caso", numeros);
    cmap = new Map((casos ?? []).map((c: any) => [c.numero_caso, c.cliente]));
  }
  filas.forEach((a) => {
    a.usuario = umap.get(a.user_id) ?? null;
    a.asignador = a.asignado_por ? (umap.get(a.asignado_por) ?? null) : null;
    a.cliente = cmap.get(a.numero_caso) ?? null;
  });
  return filas;
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
  if (!opts.numeroCaso.startsWith("REU-")) enriquecerCasos([opts.numeroCaso]).catch(() => {});
  return a as Asignacion;
}

// Gestión sin caso asignado (ej. llamada de otro grupo) — igual lleva número de caso.
export async function registrarLibre(opts: {
  userId: string; tipoId: string; numeroCaso: string; minutos: number;
}) {
  return registrarGestion({ ...opts, asignacionId: null, seguir: false });
}

// Crear un caso y traspasarlo: la CREACIÓN cuenta como gestión de quien lo crea (userId),
// pero el caso NO queda en su bandeja: se deja pendiente en la bandeja del destinatario (destinoId).
export async function crearYTraspasar(opts: {
  userId: string; destinoId: string; tipoId: string; numeroCaso: string; minutos: number;
}) {
  const sb = createClient();
  // Creación + traspaso en el servidor (con auditoría): funciona para cualquier
  // rol sin abrir la tabla de asignaciones a escritura directa.
  const caso = opts.numeroCaso.trim();
  const { error } = await sb.rpc("crear_y_traspasar", {
    p_destino: opts.destinoId, p_tipo: opts.tipoId, p_caso: caso, p_minutos: opts.minutos,
  });
  if (error) throw error;
  if (!caso.startsWith("REU-")) enriquecerCasos([caso]).catch(() => {});
}

// Creación MASIVA: una sola llamada crea N gestiones de creación a mi nombre
// y deja los N casos en la bandeja del destino (pendientes o ya cerrados).
// Atómico en el servidor (RPC crear_casos_masivo). No borra ni pisa nada.
export async function crearCasosMasivo(opts: {
  destinoId: string; tipoId: string; casos: string[]; minutos: number; cerrar?: boolean;
}) {
  const sb = createClient();
  const casos = [...new Set(opts.casos.map((c) => c.trim()).filter(Boolean))];
  const { data, error } = await sb.rpc("crear_casos_masivo", {
    p_destino: opts.destinoId,
    p_tipo: opts.tipoId,
    p_casos: casos,
    p_minutos: opts.minutos,
    p_cerrar: opts.cerrar ?? false,
  });
  if (error) throw error;
  enriquecerCasos(casos.filter((c) => !c.startsWith("REU-"))).catch(() => {});
  return (data as number) ?? casos.length;
}

// Crear un caso de OTRO SEGMENTO (no mayoristas): la creación cuenta como gestión de quien la hace,
// pero el caso NO entra a ninguna bandeja ni se enriquece con Salesforce. Se marca con prefijo EXT-.
export async function crearOtroSegmento(opts: {
  userId: string; tipoId: string; numeroCaso: string; minutos: number;
}) {
  return registrarGestion({
    userId: opts.userId, tipoId: opts.tipoId,
    numeroCaso: "EXT-" + opts.numeroCaso,
    minutos: opts.minutos, asignacionId: null, seguir: false,
  });
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
  // Trae la foto del caso desde Salesforce en segundo plano (no bloquea la UI).
  enriquecerCasos(opts.casos).catch(() => {});
}

export async function quitarAsignacion(id: string) {
  const sb = createClient();
  await sb.from("asignaciones").delete().eq("id", id);
}

// Reasignar un caso pendiente a otra persona (corregir un traspaso equivocado).
// Solo mueve la bandeja; no crea ni toca gestiones. Se usa cuando el caso aún no se ha trabajado.
export async function reasignarCaso(opts: { asignacionId: string; destinoId: string; porId: string }) {
  const sb = createClient();
  const { error } = await sb.from("asignaciones")
    .update({ user_id: opts.destinoId, asignado_por: opts.porId, estado: "pendiente" })
    .eq("id", opts.asignacionId)
    .eq("estado", "pendiente"); // solo si sigue pendiente (no trabajado)
  if (error) throw error;
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
export async function getMetricasPorCliente(dias = 7) {
  const sb = createClient();
  const { data } = await sb.rpc("metricas_por_cliente", { p_dias: dias });
  return data ?? [];
}

// ── Gerencial (rango de fechas + persona opcional) ───────────────
export async function gKpis(desde: string, hasta: string, user?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_kpis", { p_desde: desde, p_hasta: hasta, p_user: user ?? null });
  return (data?.[0]) ?? null;
}
export async function gRanking(desde: string, hasta: string) {
  const sb = createClient();
  const { data } = await sb.rpc("g_ranking", { p_desde: desde, p_hasta: hasta });
  return data ?? [];
}
export async function gPorRol(desde: string, hasta: string) {
  const sb = createClient();
  const { data } = await sb.rpc("g_por_rol", { p_desde: desde, p_hasta: hasta });
  return data ?? [];
}
export async function gPorTipo(desde: string, hasta: string, user?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_por_tipo", { p_desde: desde, p_hasta: hasta, p_user: user ?? null });
  return data ?? [];
}
// Tendencia diaria con los mismos KPIs del encabezado (efectividad/productividad).
export async function gTendenciaKpi(desde: string, hasta: string, user?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_tendencia_kpi", { p_desde: desde, p_hasta: hasta, p_user: user ?? null });
  return data ?? [];
}

// ── Estadísticas de supervisión (tiempo app/PC, traspasos) ────────
//    Estas SÍ lanzan el error de Supabase: la vista lo muestra tal cual
//    para poder diagnosticar (función faltante, caché, tipos, etc.).
export async function eStats(desde: string, hasta: string, user?: string | null) {
  const sb = createClient();
  const { data, error } = await sb.rpc("e_stats", { p_desde: desde, p_hasta: hasta, p_user: user ?? null });
  if (error) throw new Error(error.message);
  return (data as any[])?.[0] ?? null;
}
export async function eStatsDia(desde: string, hasta: string, user?: string | null) {
  const sb = createClient();
  const { data, error } = await sb.rpc("e_stats_dia", { p_desde: desde, p_hasta: hasta, p_user: user ?? null });
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function eTraspasos(desde: string, hasta: string) {
  const sb = createClient();
  const { data, error } = await sb.rpc("e_traspasos", { p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function gPorCliente(desde: string, hasta: string, user?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_por_cliente", { p_desde: desde, p_hasta: hasta, p_user: user ?? null });
  return data ?? [];
}
// Top de casos que más tiempo acumulan en el periodo (reincidencia).
export async function gTopCasos(desde: string, hasta: string, user?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_top_casos", { p_desde: desde, p_hasta: hasta, p_user: user ?? null });
  return data ?? [];
}

// ── Presencia / sesiones ──────────────────────────────────────────
export async function iniciarSesion(): Promise<string | null> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("sesiones").insert({ user_id: user.id }).select("id").single();
  return data?.id ?? null;
}
export async function latido(id: string, activoSeg?: number) {
  const sb = createClient();
  const upd: Record<string, unknown> = { ultimo_latido: new Date().toISOString() };
  if (typeof activoSeg === "number") upd.activo_seg = activoSeg;
  await sb.from("sesiones").update(upd).eq("id", id);
}
export async function cerrarSesion(id: string) {
  const sb = createClient();
  await sb.from("sesiones").update({ fin: new Date().toISOString() }).eq("id", id);
}
export async function getPresencia() {
  const sb = createClient();
  const { data } = await sb.rpc("presencia_hoy");
  return data ?? [];
}

// ── Pausas (break / almuerzo) ─────────────────────────────────────
export async function getPausaActiva(userId: string) {
  const sb = createClient();
  const { data } = await sb.from("pausas").select("*").eq("user_id", userId).eq("fecha", hoy()).is("fin", null).order("inicio", { ascending: false }).limit(1).maybeSingle();
  return data;
}
export type PausaTipo = "break" | "almuerzo" | "reunion" | "capacitacion" | "bano";
export async function iniciarPausa(userId: string, tipo: PausaTipo) {
  const sb = createClient();
  // cierra cualquier pausa abierta antes de abrir otra
  await sb.from("pausas").update({ fin: new Date().toISOString() }).eq("user_id", userId).eq("fecha", hoy()).is("fin", null);
  const { error } = await sb.from("pausas").insert({ user_id: userId, tipo });
  if (error) throw error;
}
// Estado simple del equipo (en línea / pausa / desconectado) — visible para todos.
export async function getEquipoEstado() {
  const sb = createClient();
  const { data } = await sb.rpc("equipo_estado");
  return (data ?? []) as { user_id: string; nombre: string; apellido: string | null; cargo: string | null; estado: string }[];
}
export async function terminarPausa(userId: string) {
  const sb = createClient();
  const { error } = await sb.from("pausas").update({ fin: new Date().toISOString() }).eq("user_id", userId).eq("fecha", hoy()).is("fin", null);
  if (error) throw error;
}
export async function getMiHorarioHoy(userId: string) {
  const sb = createClient();
  const { data } = await sb.from("horarios").select("*").eq("user_id", userId).eq("fecha", hoy()).maybeSingle();
  return data;
}
export async function getHorariosSemana(desde: string, hasta: string) {
  const sb = createClient();
  const { data } = await sb.from("horarios").select("*, usuarios(nombre, apellido, cargo)").gte("fecha", desde).lte("fecha", hasta).order("fecha");
  return data ?? [];
}

// ── Alertas en tiempo real ────────────────────────────────────────
export async function enviarAlerta(paraUserId: string, mensaje: string, deNombre: string) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("alertas").insert({ para_user_id: paraUserId, de_user_id: user?.id ?? null, de_nombre: deNombre, mensaje });
  if (error) throw error;
}
export async function getAlertasNoLeidas(userId: string) {
  const sb = createClient();
  const { data } = await sb.from("alertas").select("*").eq("para_user_id", userId).eq("leida", false).order("created_at", { ascending: false });
  return data ?? [];
}
export async function marcarAlertaLeida(id: string) {
  const sb = createClient();
  await sb.from("alertas").update({ leida: true }).eq("id", id);
}
export function suscribirAlertas(userId: string, onAlerta: (a: any) => void) {
  const sb = createClient();
  const ch = sb
    .channel("alertas-" + userId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "alertas", filter: `para_user_id=eq.${userId}` }, (payload) => onAlerta(payload.new))
    .subscribe();
  return () => { sb.removeChannel(ch); };
}

// ── AUDITORÍA (vista coordinador) ─────────────────────────────────
export async function getGestionesDia(fecha = hoy()) {
  const sb = createClient();
  const { data } = await sb.from("gestiones")
    .select("*, usuarios(nombre,apellido), gestiones_catalogo(nombre,categoria,umbral_min)")
    .eq("fecha", fecha).order("registrado_at", { ascending: false });
  const filas = data ?? [];
  if (filas.length) {
    const numeros = [...new Set(filas.map((g: any) => g.numero_caso).filter((n: string) => n && !n.startsWith("REU-")))];
    if (numeros.length) {
      const { data: casos } = await sb.from("casos_sf").select("numero_caso, cliente").in("numero_caso", numeros);
      const mapa = new Map((casos ?? []).map((c: any) => [c.numero_caso, c.cliente]));
      filas.forEach((g: any) => { g.cliente = mapa.get(g.numero_caso) ?? null; });
    }
  }
  return filas;
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
