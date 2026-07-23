"use client";
import { createClient } from "@/lib/supabase/client";
import { enriquecerCasos } from "@/app/actions";
import type { Asignacion, Gestion, GestionTipo, MetricaPersona, Usuario } from "@/lib/types";

// ════════════════════════════════════════════════════════════════
//  Capa de datos. Cada función reemplaza una operación que en el
//  prototipo vivía en useState. RLS garantiza que cada rol solo
//  acceda a lo que le corresponde, así que aquí no repetimos chequeos.
// ════════════════════════════════════════════════════════════════
// "Hoy" SIEMPRE en hora de Colombia. Con toISOString() (UTC), a las 7 p.m.
// la app saltaba al día siguiente: bandejas vacías, actividad en cero y
// gestiones guardadas con la fecha de mañana.
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

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
export async function getBandejaEquipo(desde: string, hasta: string, personaId?: string | null, mesa?: string | null) {
  const sb = createClient();
  let q = sb.from("asignaciones").select("*")
    .gte("fecha", desde).lte("fecha", hasta)
    .order("fecha", { ascending: false }).order("created_at", { ascending: false });
  if (personaId) q = q.eq("user_id", personaId);
  if (mesa) q = q.eq("mesa", mesa);
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
export async function getEquipo(mesa?: string | null): Promise<Usuario[]> {
  const sb = createClient();
  let q = sb.from("usuarios").select("*").eq("activo", true).order("nombre");
  if (mesa) q = q.eq("mesa", mesa);
  const { data } = await q;
  return (data ?? []) as Usuario[];
}

// Agentes a los que un senior puede repartir: su propia mesa; y todo el
// grupo cuando ese grupo es MIXTO (ej. Élite + Distrito). Premium y demás
// siguen limitados a la mesa propia.
export async function getEquipoRepartir(miMesa?: string | null): Promise<Usuario[]> {
  const mesas = await getMesas().catch(() => [] as any[]);
  const miGrupo = (mesas.find((m: any) => m.nombre === miMesa)?.grupo) || miMesa;
  const grupoMesas = mesas.filter((m: any) => (m.grupo || m.nombre) === miGrupo);
  const mixto = grupoMesas.some((m: any) => m.grupo_mixto);
  let base: Usuario[];
  if (mixto && grupoMesas.length) {
    const nombres = new Set(grupoMesas.map((m: any) => m.nombre));
    const todos = await getEquipo(null);
    base = todos.filter((u) => u.rol === "agente" && u.mesa && nombres.has(u.mesa));
  } else {
    const propia = await getEquipo(miMesa);
    base = propia.filter((u) => u.rol === "agente");
  }
  // Mesas de APOYO: agentes de otra mesa que apoya a la mía (ej. MEN apoya a
  // Premium 3). En horario hábil el senior también les reparte casos.
  const apoyo = new Set(mesas.filter((m: any) => m.apoya_mesa === miMesa).map((m: any) => m.nombre));
  if (apoyo.size) {
    const todos = await getEquipo(null);
    for (const u of todos) {
      if (u.rol === "agente" && u.mesa && apoyo.has(u.mesa) && !base.some((b) => b.id === u.id)) base.push(u);
    }
  }
  return base;
}

// La mesa que MI mesa apoya (ej. MEN → PREMIUM 3). Usada por la vista de
// horario no hábil para mostrar también el contenedor de esa mesa.
export async function getMesaApoyo(miMesa?: string | null): Promise<string | null> {
  const mesas = await getMesas().catch(() => [] as any[]);
  return (mesas.find((m: any) => m.nombre === miMesa)?.apoya_mesa) ?? null;
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

// Reasignar un caso a otra persona (corregir un traspaso equivocado).
// Funciona sin importar el estado — si ya tenía gestión, la UI pide
// confirmación antes de llamar esto (ver Dashboard.tsx).
export async function reasignarCaso(opts: { asignacionId: string; destinoId: string; porId: string }) {
  const sb = createClient();
  const { error } = await sb.from("asignaciones")
    .update({ user_id: opts.destinoId, asignado_por: opts.porId, estado: "pendiente" })
    .eq("id", opts.asignacionId);
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

// ── Mesas (contenedores: Mayoristas, Gold, Premium…) ─────────────
export async function getMesas() {
  const sb = createClient();
  const { data } = await sb.from("mesas").select("*").order("orden");
  return data ?? [];
}
export async function agregarMesa(nombre: string, grupo?: string) {
  const sb = createClient();
  const n = nombre.toUpperCase().trim();
  const { error } = await sb.from("mesas").insert({ nombre: n, orden: 99, grupo: (grupo || n).toUpperCase().trim() });
  if (error) throw error;
}

// ── Festivos de Colombia (usados por es_horario_habil() en la base) ─
export async function getFestivos() {
  const sb = createClient();
  const { data } = await sb.from("festivos").select("*").order("fecha");
  return data ?? [];
}
export async function agregarFestivo(fecha: string, nombre: string) {
  const sb = createClient();
  const { error } = await sb.from("festivos").insert({ fecha, nombre: nombre.trim() });
  if (error) throw error;
}
export async function eliminarFestivo(fecha: string) {
  const sb = createClient();
  const { error } = await sb.from("festivos").delete().eq("fecha", fecha);
  if (error) throw error;
}

// Dispara (a lo sumo cada 5 min por pestaña) la migración de la bolsa de
// horario no hábil al contenedor de cada mesa cuando ya pasaron 5h del
// inicio del horario hábil. Idempotente y barata; la base decide si aplica.
let _ultimaMigracionNoHabil = 0;
function dispararMigracionNoHabil() {
  const now = Date.now();
  if (now - _ultimaMigracionNoHabil < 5 * 60 * 1000) return;
  _ultimaMigracionNoHabil = now;
  createClient().rpc("migrar_no_habil_a_bolsa").then(() => {}, () => {});
}

// Mover un caso pendiente del pool a la bolsa de otra mesa (senior/priv).
// Para casos mal ubicados que hay que reenrutar a otro segmento.
export async function poolMoverMesa(poolId: string, mesa: string) {
  const sb = createClient();
  const { error } = await sb.rpc("pool_mover_mesa", { p_pool: poolId, p_mesa: mesa });
  if (error) throw new Error(error.message);
}

// Coordinación: empuja YA toda la bolsa de horario no hábil a los
// contenedores de cada mesa (sin esperar a las 11:00). Devuelve cuántos
// viajaron. La deduplicación evita duplicar los que el senior ya asignó.
export async function enviarNoHabilAContenedores(): Promise<number> {
  const sb = createClient();
  const { data, error } = await sb.rpc("migrar_no_habil_manual");
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// Asignar/tomar VARIOS casos del contenedor de una vez. destinoId = mi id
// para "tomármelos". Devuelve cuántos se asignaron (salta los ya tomados).
export async function poolAsignarMasivo(poolIds: string[], destinoId: string): Promise<number> {
  const sb = createClient();
  const { data, error } = await sb.rpc("pool_asignar_masivo", { p_pools: poolIds, p_destino: destinoId });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// Mover VARIOS casos del contenedor a la bolsa de otra mesa de una vez.
export async function poolMoverMasivo(poolIds: string[], mesa: string): Promise<number> {
  const sb = createClient();
  const { data, error } = await sb.rpc("pool_mover_masivo", { p_pools: poolIds, p_mesa: mesa });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// Asignación LIBRE (contenedor general): un senior/coordinación asigna casos
// a cualquier ingeniero activo, sin restricción de mesa/grupo.
export async function poolAsignarLibre(poolIds: string[], destinoId: string): Promise<number> {
  const sb = createClient();
  const { data, error } = await sb.rpc("pool_asignar_libre", { p_pools: poolIds, p_destino: destinoId });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// Todos los ingenieros activos (para el desplegable del contenedor general),
// incluso los de otras mesas — un senior no los ve por RLS, este RPC sí.
export async function getIngenierosTodos(): Promise<Usuario[]> {
  const sb = createClient();
  const { data, error } = await sb.rpc("ingenieros_todos");
  if (error) throw new Error(error.message);
  return (data ?? []) as Usuario[];
}

// ── Contenedor general por mesa (casos cruzados entre subsegmentos) ─
// Pendientes visibles para mí (RLS: mi grupo, o todo si soy privilegiado).
export async function getPoolPendientes() {
  const sb = createClient();
  dispararMigracionNoHabil();
  const { data } = await sb.from("casos_pool").select("*").eq("estado", "pendiente").order("created_at");
  const filas = (data ?? []) as any[];
  if (!filas.length) return [];
  const ids = [...new Set(filas.map((p) => p.creado_por).filter(Boolean))];
  const { data: us } = ids.length ? await sb.from("usuarios").select("id, nombre, apellido").in("id", ids) : { data: [] as any[] };
  const umap = new Map((us ?? []).map((u: any) => [u.id, u]));
  const numeros = [...new Set(filas.map((p) => p.numero_caso))];
  const { data: casos } = await sb.from("casos_sf").select("numero_caso, cliente").in("numero_caso", numeros);
  const cmap = new Map((casos ?? []).map((c: any) => [c.numero_caso, c.cliente]));
  filas.forEach((p) => { p.creador = p.creado_por ? umap.get(p.creado_por) ?? null : null; p.cliente = cmap.get(p.numero_caso) ?? null; });
  return filas;
}
// Casos que llegaron fuera de horario hábil (noche, fin de semana, festivo):
// visibles para cualquiera, sin importar mesa/grupo (ver RLS de casos_pool).
export async function getPoolNoHabil() {
  const todos = await getPoolPendientes();
  return todos.filter((p: any) => p.fuera_horario === true);
}
// Asignar (senior) o tomarse (agente) un caso del contenedor. Las reglas
// (mesa propia, senior de la mesa, fin de semana en el grupo) las valida la base.
export async function poolAsignar(poolId: string, destinoId: string) {
  const sb = createClient();
  const { error } = await sb.rpc("pool_asignar", { p_pool: poolId, p_destino: destinoId });
  if (error) throw new Error(error.message);
}
// Crear un caso y enviarlo al contenedor de otra mesa: la creación cuenta
// como mi gestión, el caso queda en el contenedor hasta que lo asignen.
export async function crearYEnviarPool(opts: {
  userId: string; tipoId: string; numeroCaso: string; minutos: number; mesa: string;
}) {
  const sb = createClient();
  await registrarGestion({ userId: opts.userId, tipoId: opts.tipoId, numeroCaso: opts.numeroCaso, minutos: opts.minutos, asignacionId: null, seguir: false });
  const { error } = await sb.from("casos_pool").insert({ mesa: opts.mesa, numero_caso: opts.numeroCaso, creado_por: opts.userId });
  if (error) throw error;
  if (!opts.numeroCaso.startsWith("REU-")) enriquecerCasos([opts.numeroCaso]).catch(() => {});
}
// Metas de gestiones/día por mesa (semáforo del ranking).
export async function getMetas(): Promise<Record<string, number>> {
  const sb = createClient();
  const { data } = await sb.from("metas_mesa").select("*");
  return Object.fromEntries((data ?? []).map((m: any) => [m.mesa, m.gestiones_dia]));
}
export async function guardarMeta(mesa: string, gestionesDia: number) {
  const sb = createClient();
  const { error } = await sb.from("metas_mesa").upsert({ mesa, gestiones_dia: gestionesDia, actualizado_at: new Date().toISOString() });
  if (error) throw error;
}
// ¿Los agentes de esta mesa pueden repartir seguimiento entre ellos?
// (Todos los segmentos sí, menos Básicos, que queda solo para el senior.)
export async function guardarRepartoAgente(mesa: string, reparteAgente: boolean) {
  const sb = createClient();
  const { error } = await sb.from("mesas").update({ reparte_agente: reparteAgente }).eq("nombre", mesa);
  if (error) throw error;
}

// ── Supervisión avanzada ──────────────────────────────────────────
// Personas en línea SIN pausa y SIN actividad de PC hace >30 min.
export async function getInasistencias(mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("inasistencias_ahora", { p_mesa: mesa || null });
  return data ?? [];
}
export async function ePausasNorma(desde: string, hasta: string, user?: string | null, mesa?: string | null) {
  const sb = createClient();
  const { data, error } = await sb.rpc("e_pausas_norma", { p_desde: desde, p_hasta: hasta, p_user: user ?? null, p_mesa: mesa || null });
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function eResolucion(desde: string, hasta: string, mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("e_resolucion", { p_desde: desde, p_hasta: hasta, p_mesa: mesa || null });
  return data ?? [];
}
export async function ePorHora(desde: string, hasta: string, user?: string | null, mesa?: string | null) {
  const sb = createClient();
  const { data, error } = await sb.rpc("e_por_hora", { p_desde: desde, p_hasta: hasta, p_user: user ?? null, p_mesa: mesa || null });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Gerencial (rango de fechas + persona y mesa opcionales) ───────
export async function gKpis(desde: string, hasta: string, user?: string | null, mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_kpis", { p_desde: desde, p_hasta: hasta, p_user: user ?? null, p_mesa: mesa || null });
  return (data?.[0]) ?? null;
}
export async function gRanking(desde: string, hasta: string, mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_ranking", { p_desde: desde, p_hasta: hasta, p_mesa: mesa || null });
  return data ?? [];
}
export async function gPorRol(desde: string, hasta: string, mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_por_rol", { p_desde: desde, p_hasta: hasta, p_mesa: mesa || null });
  return data ?? [];
}
export async function gPorTipo(desde: string, hasta: string, user?: string | null, mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_por_tipo", { p_desde: desde, p_hasta: hasta, p_user: user ?? null, p_mesa: mesa || null });
  return data ?? [];
}
// Tendencia diaria con los mismos KPIs del encabezado (efectividad/productividad).
export async function gTendenciaKpi(desde: string, hasta: string, user?: string | null, mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_tendencia_kpi", { p_desde: desde, p_hasta: hasta, p_user: user ?? null, p_mesa: mesa || null });
  return data ?? [];
}

// ── Estadísticas de supervisión (tiempo app/PC, traspasos) ────────
//    Estas SÍ lanzan el error de Supabase: la vista lo muestra tal cual
//    para poder diagnosticar (función faltante, caché, tipos, etc.).
export async function eStats(desde: string, hasta: string, user?: string | null, mesa?: string | null) {
  const sb = createClient();
  const { data, error } = await sb.rpc("e_stats", { p_desde: desde, p_hasta: hasta, p_user: user ?? null, p_mesa: mesa || null });
  if (error) throw new Error(error.message);
  return (data as any[])?.[0] ?? null;
}
export async function eStatsDia(desde: string, hasta: string, user?: string | null, mesa?: string | null) {
  const sb = createClient();
  const { data, error } = await sb.rpc("e_stats_dia", { p_desde: desde, p_hasta: hasta, p_user: user ?? null, p_mesa: mesa || null });
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function eTraspasos(desde: string, hasta: string, mesa?: string | null) {
  const sb = createClient();
  const { data, error } = await sb.rpc("e_traspasos", { p_desde: desde, p_hasta: hasta, p_mesa: mesa || null });
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function gPorCliente(desde: string, hasta: string, user?: string | null, mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_por_cliente", { p_desde: desde, p_hasta: hasta, p_user: user ?? null, p_mesa: mesa || null });
  return data ?? [];
}
// Top de casos que más tiempo acumulan en el periodo (reincidencia).
export async function gTopCasos(desde: string, hasta: string, user?: string | null, mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_top_casos", { p_desde: desde, p_hasta: hasta, p_user: user ?? null, p_mesa: mesa || null });
  return data ?? [];
}

// ── Presencia / sesiones ──────────────────────────────────────────
// Multisesión: un mismo usuario puede tener varias sesiones activas a la
// vez (varias pestañas/equipos); no se cierran entre sí.
export async function iniciarSesion(): Promise<string | null> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("sesiones").insert({ user_id: user.id }).select("id").single();
  return data?.id ?? null;
}
// Devuelve false si esta sesión fue cerrada por otra apertura (desplazada).
export async function latido(id: string, activoSeg?: number): Promise<boolean> {
  const sb = createClient();
  const upd: Record<string, unknown> = { ultimo_latido: new Date().toISOString() };
  if (typeof activoSeg === "number") upd.activo_seg = activoSeg;
  const { data } = await sb.from("sesiones").update(upd).eq("id", id).is("fin", null).select("id");
  return (data ?? []).length > 0;
}
export async function cerrarSesion(id: string) {
  const sb = createClient();
  await sb.from("sesiones").update({ fin: new Date().toISOString() }).eq("id", id);
}
export async function getPresencia(mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("presencia_hoy", { p_mesa: mesa || null });
  return data ?? [];
}
// Perfil de una persona en un día (horario + casos + gestión).
export async function perfilDia(userId: string, fecha = hoy()) {
  const sb = createClient();
  const { data, error } = await sb.rpc("perfil_dia", { p_user: userId, p_fecha: fecha });
  if (error) throw new Error(error.message);
  return data as any;
}
export async function perfilTendencia(userId: string, dias = 14) {
  const sb = createClient();
  const { data, error } = await sb.rpc("perfil_tendencia", { p_user: userId, p_dias: dias });
  if (error) throw new Error(error.message);
  return (data ?? []) as { dia: string; gestiones: number; minutos: number; casos: number }[];
}
// Carga de casos por persona (coordinador: toda la operación con filtro
// de mesa; senior: siempre su grupo — lo decide la base).
export async function cargaEquipo(desde: string, hasta: string, mesa?: string | null) {
  const sb = createClient();
  const { data, error } = await sb.rpc("carga_equipo", { p_desde: desde, p_hasta: hasta, p_mesa: mesa || null });
  if (error) throw new Error(error.message);
  return data ?? [];
}
// Análisis de capacidad: demanda (casos, minutos de gestión) vs. capacidad
// (minutos disponibles del turno) y personal, para evaluar si la carga es
// acorde al número de personas.
export type Capacidad = {
  dias: number; persona_dias: number; personas: number; casos: number;
  gestiones: number; min_gestion: number; min_capacidad: number;
};
export async function cargaCapacidad(desde: string, hasta: string, mesa?: string | null): Promise<Capacidad | null> {
  const sb = createClient();
  const { data, error } = await sb.rpc("carga_capacidad", { p_desde: desde, p_hasta: hasta, p_mesa: mesa || null });
  if (error) throw new Error(error.message);
  return (data?.[0] as Capacidad) ?? null;
}

// ── Semáforo de gestión (coordinación) ────────────────────────────
export async function flujoDiario(desde: string, hasta: string, mesa?: string | null) {
  const sb = createClient();
  const { data, error } = await sb.rpc("flujo_diario", { p_desde: desde, p_hasta: hasta, p_mesa: mesa || null });
  if (error) throw new Error(error.message);
  return (data ?? []) as { dia: string; ingresos: number; cierres: number; pendientes: number }[];
}
export async function distribucionAntiguedad(mesa?: string | null) {
  const sb = createClient();
  const { data, error } = await sb.rpc("distribucion_antiguedad", { p_mesa: mesa || null });
  if (error) throw new Error(error.message);
  return (data ?? []) as { estado: string; dias: number; casos: number }[];
}

// ── Pausas (break / almuerzo) ─────────────────────────────────────
export async function getPausaActiva(userId: string) {
  const sb = createClient();
  const { data } = await sb.from("pausas").select("*").eq("user_id", userId).eq("fecha", hoy()).is("fin", null).order("inicio", { ascending: false }).limit(1).maybeSingle();
  return data;
}
export type PausaTipo = "break" | "almuerzo" | "reunion" | "capacitacion" | "bano" | "backoffice";
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
  // Trae la mesa de la persona para poder filtrar por segmento/grupo en la vista.
  // RLS limita las filas según el rol (agente→suyo, senior→su grupo, priv→todos).
  const { data } = await sb.from("horarios")
    .select("*, usuarios(nombre, apellido, cargo, mesa)")
    .gte("fecha", desde).lte("fecha", hasta).order("fecha");
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

// ── Web Push: registrar la suscripción de ESTE navegador ──────────
export async function guardarPushSub(userId: string, sub: PushSubscription) {
  const sb = createClient();
  const j = sub.toJSON() as any;
  if (!j?.endpoint || !j?.keys?.p256dh || !j?.keys?.auth) return;
  await sb.from("push_subs").upsert({
    endpoint: j.endpoint, user_id: userId, p256dh: j.keys.p256dh, auth_key: j.keys.auth,
  }, { onConflict: "endpoint" });
}

// ── Normas de pausas (umbrales configurables) ─────────────────────
export async function getConfigOperacion() {
  const sb = createClient();
  const { data } = await sb.from("config_operacion").select("*").eq("id", 1).maybeSingle();
  return (data as any) ?? { break_max_min: 30, almuerzo_max_min: 60, meta_efectividad: 85, meta_productividad: 80 };
}
export async function guardarConfigOperacion(campos: {
  break_max_min?: number; almuerzo_max_min?: number; meta_efectividad?: number; meta_productividad?: number;
}) {
  const sb = createClient();
  const { error } = await sb.from("config_operacion")
    .update({ ...campos, actualizado_at: new Date().toISOString() }).eq("id", 1);
  if (error) throw error;
}
// Comportamiento mensual (informe de cierre estilo BI).
export async function gPorMes(desde: string, hasta: string, mesa?: string | null) {
  const sb = createClient();
  const { data } = await sb.rpc("g_por_mes", { p_desde: desde, p_hasta: hasta, p_mesa: mesa || null });
  return data ?? [];
}

// ── Notificaciones de asignaciones (en vivo) ──────────────────────
export function suscribirAsignaciones(userId: string, canal: string, cb: (a: any) => void) {
  const sb = createClient();
  const ch = sb
    .channel(`asig-${canal}-${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "asignaciones", filter: `user_id=eq.${userId}` }, (payload) => cb(payload.new))
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
export async function getClienteCaso(numeroCaso: string): Promise<string | null> {
  const sb = createClient();
  const { data } = await sb.from("casos_sf").select("cliente").eq("numero_caso", numeroCaso).maybeSingle();
  return (data as any)?.cliente ?? null;
}

// Buscador global (senior/privilegiado): localiza un caso puntual en toda la
// operación y devuelve si sigue en una bolsa y/o quién lo tiene asignado,
// desde cuándo y en qué estado. Salta la RLS vía RPC SECURITY DEFINER.
export type CasoUbicacion = {
  caso: string | null;
  cliente: string | null;
  pool: { mesa: string; fuera_horario: boolean; created_at: string; creador: string | null }[];
  asignaciones: {
    ingeniero_id: string; ingeniero: string | null; mesa: string | null;
    estado: string; fecha: string; created_at: string; asignado_por: string | null;
  }[];
};
export async function buscarCaso(numeroCaso: string): Promise<CasoUbicacion> {
  const sb = createClient();
  const { data, error } = await sb.rpc("buscar_caso", { p_caso: numeroCaso.trim() });
  if (error) throw new Error(error.message);
  return data as CasoUbicacion;
}

// Bolsa actual (casos abiertos + arrastre) de cualquier ingeniero, para la
// vista Distribución Ingenieros. RLS: senior ve a todos; privilegiado también.
export async function bolsaIngeniero(userId: string): Promise<Asignacion[]> {
  return getMiBandeja(userId);
}

// ── ANUNCIOS ANCLADOS (con confirmación de lectura) ───────────────
export async function crearAnuncio(mensaje: string, requiereRespuesta: boolean, deNombre: string, mesa?: string | null) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("anuncios").insert({
    de_user_id: user?.id ?? null, de_nombre: deNombre, mensaje, requiere_respuesta: requiereRespuesta,
    mesa: mesa || null,   // null = toda la operación
  });
  if (error) throw error;
}
export async function desactivarAnuncio(id: string) {
  const sb = createClient();
  const { error } = await sb.from("anuncios").update({ activo: false }).eq("id", id);
  if (error) throw error;
}
// Borra el anuncio y sus confirmaciones (cascade). Solo privilegiados (RLS).
export async function borrarAnuncio(id: string) {
  const sb = createClient();
  const { error } = await sb.from("anuncios").delete().eq("id", id);
  if (error) throw error;
}
// Anuncios activos que YO aún no he confirmado (para la ventana bloqueante).
// Solo los de mi mesa o los de toda la operación (mesa null).
export async function getAnunciosPendientes(userId: string, miMesa?: string | null) {
  const sb = createClient();
  const [{ data: activos }, { data: mias }] = await Promise.all([
    sb.from("anuncios").select("*").eq("activo", true).order("created_at"),
    sb.from("anuncio_confirmaciones").select("anuncio_id").eq("user_id", userId),
  ]);
  const vistas = new Set((mias ?? []).map((c: any) => c.anuncio_id));
  return (activos ?? []).filter((a: any) => !vistas.has(a.id) && (!a.mesa || !miMesa || a.mesa === miMesa));
}
export async function confirmarAnuncio(anuncioId: string, userId: string, respuesta?: string | null) {
  const sb = createClient();
  const { error } = await sb.from("anuncio_confirmaciones").insert({
    anuncio_id: anuncioId, user_id: userId, respuesta: respuesta?.trim() || null,
  });
  if (error && (error as any).code !== "23505") throw error;   // confirmación repetida: ignorar
}
export function suscribirAnuncios(onAnuncio: (a: any) => void) {
  const sb = createClient();
  const ch = sb
    .channel("anuncios")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "anuncios" }, (payload) => onAnuncio(payload.new))
    .subscribe();
  return () => { sb.removeChannel(ch); };
}
// Gestión (coordinador): anuncios recientes con sus confirmaciones y respuestas.
export async function getAnunciosConEstado() {
  const sb = createClient();
  const { data: anuncios } = await sb.from("anuncios").select("*").order("created_at", { ascending: false }).limit(10);
  const lista = anuncios ?? [];
  if (!lista.length) return [];
  const ids = lista.map((a: any) => a.id);
  const { data: confs } = await sb.from("anuncio_confirmaciones").select("*").in("anuncio_id", ids);
  const { data: equipo } = await sb.from("usuarios").select("id, nombre, apellido, mesa")
    .eq("activo", true).in("rol", ["agente", "senior"]);
  const umap = new Map((equipo ?? []).map((u: any) => [u.id, u]));
  return lista.map((a: any) => ({
    ...a,
    // El total esperado depende del alcance del anuncio (mesa o toda la operación).
    total_equipo: (equipo ?? []).filter((u: any) => !a.mesa || u.mesa === a.mesa).length,
    confirmaciones: (confs ?? [])
      .filter((c: any) => c.anuncio_id === a.id)
      .map((c: any) => ({ ...c, usuario: umap.get(c.user_id) ?? null }))
      .sort((x: any, y: any) => x.confirmado_at.localeCompare(y.confirmado_at)),
  }));
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
