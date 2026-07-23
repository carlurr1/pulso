"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Inbox, CalendarRange, Users, LogOut, Plus, Check, X, Phone,
  Mail, Wrench, KeyRound, ArrowUpRight, FileText, Settings2, AlertTriangle,
  TrendingUp, Search, ChevronRight, Upload, Eye, EyeOff, CircleDot,
  LayoutDashboard, ShieldCheck, Download, Printer, Clock, Bell, ArrowRight, ListChecks, Trash2, Sun, Moon, Boxes,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Cell, AreaChart, Area, Brush,
} from "recharts";
import * as XLSX from "xlsx";
import * as data from "@/lib/data";
import { crearUsuario, crearUsuariosMasivo, guardarHorarios, editarUsuario, bloquearUsuario, resetPassword, eliminarUsuario } from "@/app/actions";
import { pushUsuarios, pushEquipo } from "@/app/push";
import { logout } from "@/app/login/actions";
import { CATS, type Usuario, type GestionTipo, type Categoria, type Rol } from "@/lib/types";

/* ─── helpers ─── */
const ICON: Record<Categoria, any> = {
  casos: FileText, comms: Mail, tecnico: Wrench, permisos: KeyRound,
  escal: ArrowUpRight, reunion: Users, interna: Settings2,
};
// "Hoy" SIEMPRE en hora de Colombia (con UTC, a las 7 p.m. saltaba al día siguiente).
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const todayISO = hoy;
const APP_VERSION = "1.0.3";
const PAUSA_LBL: Record<string, string> = { break: "Break", almuerzo: "Almuerzo", reunion: "Reunión interna", capacitacion: "Capacitación", bano: "Baño", backoffice: "Backoffice" };
const ESTADO_CHIP: Record<string, string> = { online: "done", offline: "sin", break: "medio", almuerzo: "medio", reunion: "bajo", capacitacion: "bajo", bano: "medio", backoffice: "medio" };
const initials = (u: { nombre: string; apellido?: string | null }) =>
  (u.nombre[0] + (u.apellido?.[0] ?? "")).toUpperCase();
const firstLast = (n: string, a?: string | null) => `${n} ${(a ?? "").split(" ")[0]}`.trim();
const dayLabel = (iso: string) =>
  ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][new Date(iso + "T12:00:00").getDay()];

/* ─── piezas visuales ─── */
function PulseLine() {
  return (
    <svg width="100%" height="34" viewBox="0 0 300 34" preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <path d="M0,17 L60,17 L70,17 L78,4 L86,30 L94,17 L150,17 L160,17 L168,9 L176,25 L184,17 L300,17"
        fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round"
        strokeDasharray="6 8" style={{ animation: "dash 18s linear infinite", opacity: .85 }} />
    </svg>
  );
}
function Stat({ icon: Ico, value, label, color, pct, delta, deltaDir }: any) {
  return (
    <div className="stat">
      <div className="statTop"><div className="statIco" style={{ background: color + "1A", color }}><Ico size={18} /></div></div>
      <div className="statVal" style={{ color }}>{value}</div>
      <div className="statLbl">{label}</div>
      {delta != null && <div className={"statDelta " + (deltaDir ?? "flat")}>{deltaDir === "up" ? "▲" : deltaDir === "down" ? "▼" : "•"} {delta}</div>}
      {pct != null && <div className="statBar" style={{ width: pct + "%", background: color }} />}
    </div>
  );
}
// ─── Serie diaria con selector de tipo (Área/Líneas/Barras) y deslizador ───
//     Se usa en toda gráfica cuyo eje X son días. El tipo inicial es
//     automático (barras con 1-2 días, área con rangos) y el usuario lo
//     cambia con los chips. Con más de 10 días aparece un brush abajo
//     para escoger/mover la ventana visible.
let _chartSeq = 0;
function SerieDiaria({ data: rows, series, unit = "", height = 220, domain }: {
  data: any[];
  series: { key: string; name: string; color: string }[];
  unit?: string; height?: number; domain?: [number, number];
}) {
  const [uid] = useState(() => ++_chartSeq);
  const [tipo, setTipo] = useState<"area" | "lineas" | "barras" | null>(null);
  const t = tipo ?? (rows.length <= 2 ? "barras" : "area");
  const conBrush = rows.length > 10;
  // OJO: array, no <Fragment> — Recharts no detecta ejes/tooltip dentro de un Fragment.
  const ejes = [
    <CartesianGrid key="grid" vertical={false} stroke="#EEF1F6" />,
    <XAxis key="x" dataKey="dia" tick={{ fontSize: 11, fill: "#5C6883" }} axisLine={false} tickLine={false} />,
    <YAxis key="y" domain={domain} unit={unit} tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} />,
    <Tooltip key="tip" contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} formatter={(v: any) => (v != null ? v + unit : "—")} />,
    ...(conBrush ? [<Brush key="brush" dataKey="dia" height={20} stroke="#0098D6" fill="#F4F7FB" travellerWidth={8} />] : []),
  ];
  return (
    <div>
      <div className="row-end mb6 no-print">
        <div className="rolepick">
          {([["area", "Área"], ["lineas", "Líneas"], ["barras", "Barras"]] as const).map(([k, l]) => (
            <button key={k} className={"roleopt" + (t === k ? " on" : "")} onClick={() => setTipo(k)}>{l}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        {t === "barras" ? (
          <BarChart data={rows} margin={{ left: -18 }}>
            {ejes}
            {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[5, 5, 0, 0]} maxBarSize={44} />)}
          </BarChart>
        ) : t === "lineas" ? (
          <LineChart data={rows} margin={{ left: -18 }}>
            {ejes}
            {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={{ r: 2, fill: s.color }} activeDot={{ r: 5 }} />)}
          </LineChart>
        ) : (
          <AreaChart data={rows} margin={{ left: -18 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`grad${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            {ejes}
            {series.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} fill={`url(#grad${uid}-${s.key})`} dot={false} activeDot={{ r: 5 }} />)}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
const SERIES_EFPROD = [
  { key: "efectividad", name: "Efectividad", color: "#0098D6" },
  { key: "productividad", name: "Productividad", color: "#6D5AE6" },
];

// Tarjeta KPI estilo BI: número grande, meta con semáforo y delta vs anterior.
function KpiBI({ icon: Ico, value, label, color, meta, cumple, delta, deltaDir }: any) {
  return (
    <div className="kpibi">
      <div className="kpibi-top">
        <span className="kpibi-ico" style={{ background: color + "18", color }}><Ico size={16} /></span>
        <span className="kpibi-label">{label}</span>
      </div>
      <div className="kpibi-val" style={{ color }}>{value}</div>
      <div className="kpibi-foot">
        {meta != null && (
          <span className={"kpibi-meta " + (cumple ? "ok" : "bad")}>
            {cumple ? "▲" : "▼"} Meta: {meta}
          </span>
        )}
        {delta != null && <span className={"kpibi-delta " + (deltaDir ?? "flat")}>{deltaDir === "up" ? "↑" : deltaDir === "down" ? "↓" : ""} {delta}</span>}
      </div>
    </div>
  );
}

// Delta vs periodo anterior. invert=true cuando subir es MALO (ej. alertas).
function calcDelta(cur: number | null | undefined, prev: number | null | undefined, unit = "", invert = false) {
  if (cur == null || prev == null) return {};
  const d = Math.round(cur - prev);
  const dir = d === 0 ? "flat" : (d > 0) !== invert ? "up" : "down";
  return { delta: `${d > 0 ? "+" : ""}${d}${unit} vs anterior`, deltaDir: dir };
}
// Rango anterior del mismo tamaño que [desde, hasta] (termina el día antes de "desde").
function rangoAnterior(desde: string, hasta: string): [string, string] {
  const d1 = new Date(desde + "T12:00:00"), d2 = new Date(hasta + "T12:00:00");
  const dias = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 864e5) + 1);
  const pHasta = new Date(d1.getTime() - 864e5), pDesde = new Date(d1.getTime() - dias * 864e5);
  return [pDesde.toISOString().slice(0, 10), pHasta.toISOString().slice(0, 10)];
}
function DemandChip({ level }: { level: string }) {
  const map: any = { ALTO: "alto", MEDIO: "medio", BAJO: "bajo", "SIN DEMANDA": "sin" };
  return <span className={"chip " + map[level]}>Demanda {level === "SIN DEMANDA" ? "nula" : level.toLowerCase()}</span>;
}

/* ════════════════ VISTA AGENTE ════════════════ */
function AgentView({ perfil, catalogo, fire, incluirSenior = false }: { perfil: Usuario; catalogo: GestionTipo[]; fire: (m: string) => void; incluirSenior?: boolean }) {
  const [bandeja, setBandeja] = useState<any[]>([]);
  const [actividad, setActividad] = useState<any[]>([]);
  const [modal, setModal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [turno, setTurno] = useState<any>(null);
  const [pausa, setPausa] = useState<any>(null);
  const [pausaBusy, setPausaBusy] = useState(false);
  const [equipo, setEquipo] = useState<Usuario[]>([]);

  const reload = async () => {
    const [b, a] = await Promise.all([data.getMiBandeja(perfil.id), data.getMiActividad(perfil.id)]);
    setBandeja(b); setActividad(a); setLoading(false);
  };
  const reloadTurno = async () => {
    const [h, p] = await Promise.all([data.getMiHorarioHoy(perfil.id), data.getPausaActiva(perfil.id)]);
    setTurno(h); setPausa(p);
  };
  useEffect(() => { reload(); reloadTurno(); data.getEquipo(perfil.mesa).then(setEquipo).catch(() => {}); /* eslint-disable-next-line */ }, []);

  // La bandeja se refresca sola cuando me reparten o me pasan un caso.
  useEffect(() => data.suscribirAsignaciones(perfil.id, "bandeja", () => { reload(); }), [perfil.id]);

  // Estado de los compañeros (en línea / pausa / desconectado), refresca solo.
  const [companeros, setCompaneros] = useState<any[]>([]);
  useEffect(() => {
    const load = () => data.getEquipoEstado().then(setCompaneros).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  // Contenedor de MI grupo: mi mesa (o todo el grupo si es mixto) + la mesa
  // que apoyo (ej. MEN → Premium 3). Solo esos casos, no toda la operación.
  const [pool, setPool] = useState<any[]>([]);
  const [mesas, setMesas] = useState<any[]>([]);
  const [personas, setPersonas] = useState<Usuario[]>([]);
  const [mixto, setMixto] = useState(false);
  const scopeRef = useRef<Set<string>>(new Set(perfil.mesa ? [perfil.mesa] : []));
  const puedeMasivo = perfil.rol !== "agente";   // senior/coordinación reparten y mueven
  const reloadPool = () => data.getPoolPendientes()
    .then((l: any[]) => setPool(l.filter((p) => scopeRef.current.has(p.mesa)))).catch(() => {});
  useEffect(() => {
    data.getMesas().then((ms: any[]) => {
      setMesas(ms.filter((m) => !m.oculta));
      const miGrupo = ms.find((m) => m.nombre === perfil.mesa)?.grupo || perfil.mesa;
      const grupo = ms.filter((m) => (m.grupo || m.nombre) === miGrupo);
      const esMixto = grupo.some((m) => m.grupo_mixto);
      const base = esMixto ? grupo.map((m) => m.nombre) : (perfil.mesa ? [perfil.mesa] : []);
      const apoya = ms.find((m) => m.nombre === perfil.mesa)?.apoya_mesa;
      scopeRef.current = new Set([...base, ...(apoya ? [apoya] : [])]);
      setMixto(esMixto);
      reloadPool();
    }).catch(() => reloadPool());
    if (puedeMasivo) data.getEquipoRepartir(perfil.mesa).then(setPersonas).catch(() => {});
    const t = setInterval(reloadPool, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  const salir = async (tipo: data.PausaTipo) => {
    setPausaBusy(true);
    try { await data.iniciarPausa(perfil.id, tipo); await reloadTurno(); fire(`En ${PAUSA_LBL[tipo].toLowerCase()} — tu tiempo está en pausa`); }
    catch (e: any) { fire("Error: " + (e.message ?? "")); }
    finally { setPausaBusy(false); }
  };
  const volver = async () => {
    setPausaBusy(true);
    try { await data.terminarPausa(perfil.id); await reloadTurno(); fire("¡De vuelta! Tu tiempo sigue contando."); }
    catch (e: any) { fire("Error: " + (e.message ?? "")); }
    finally { setPausaBusy(false); }
  };

  const pend = bandeja.filter((a) => a.estado !== "gestionado").length;
  const done = bandeja.filter((a) => a.estado === "gestionado").length;

  // Filtro de la lista de casos (pedido por los analistas/juniors).
  const [filtroCaso, setFiltroCaso] = useState<"todos" | "pendiente" | "progreso" | "gestionado" | "atrasado">("todos");
  const casosVisibles = bandeja.filter((a) =>
    filtroCaso === "todos" ? true :
    filtroCaso === "atrasado" ? (a.fecha < hoy() && a.estado !== "gestionado") :
    a.estado === filtroCaso);
  const lastGestOf = (id: string) => actividad.find((g) => g.asignacion_id === id);
  const tName = (id: string) => catalogo.find((c) => c.id === id)?.nombre ?? "—";
  const tCat = (id: string) => catalogo.find((c) => c.id === id)?.categoria ?? "casos";

  const onSave = async (m: any, tipoId: string, caso: string, min: number, seguir: boolean, destinoId?: string | null,
                        masivoPayload?: { casos: string[]; cerrar: boolean }) => {
    try {
      // Gestión sin caso EN LOTE (bolsa de otros): registra la misma gestión en varios casos.
      if (m.libre && masivoPayload && masivoPayload.casos.length) {
        for (const c of masivoPayload.casos) {
          await data.registrarLibre({ userId: perfil.id, tipoId, numeroCaso: c, minutos: min });
        }
        setModal(null);
        fire(`${masivoPayload.casos.length} gestión(es) registrada(s)`);
        reload();
        return;
      }
      // Creación masiva: N creaciones a mi nombre + N casos a la bandeja del destino.
      if (masivoPayload && masivoPayload.casos.length && destinoId && destinoId !== "__ext__" && !destinoId.startsWith("pool:")) {
        const n = await data.crearCasosMasivo({ destinoId, tipoId, casos: masivoPayload.casos, minutos: min, cerrar: masivoPayload.cerrar });
        const dest = equipo.find((u) => u.id === destinoId);
        setModal(null);
        fire(`${n} caso(s) creados — ${masivoPayload.cerrar ? "cerrados" : "en la bandeja de"} ${dest ? dest.nombre : (destinoId === perfil.id ? "ti" : "el analista")}`);
        reload();
        return;
      }
      const cat = tCat(tipoId);
      const sinCaso = cat === "reunion" || cat === "interna";
      // Reuniones/internas no llevan caso: se les asigna un id interno único (no visible al usuario).
      const numeroCaso = sinCaso ? `REU-${Date.now()}` : caso;
      const seguirReal = sinCaso ? false : seguir;
      // Enviar al contenedor de otra mesa: la creación cuenta como mi gestión,
      // el caso queda en el contenedor hasta que el senior de esa mesa lo asigne.
      if (destinoId && destinoId.startsWith("pool:")) {
        const mesaDest = destinoId.slice(5);
        const lista = masivoPayload && masivoPayload.casos.length ? masivoPayload.casos : [numeroCaso];
        for (const c of lista) {
          await data.crearYEnviarPool({ userId: perfil.id, tipoId, numeroCaso: c, minutos: min, mesa: mesaDest });
        }
        setModal(null);
        fire(`${lista.length} caso(s) creado(s) y enviado(s) al contenedor de ${mesaLabel(mesaDest)}`);
        reload(); reloadPool();
        return;
      }
      // Otro segmento (no mayoristas): solo cuenta la creación, no queda en ninguna bandeja.
      if (destinoId === "__ext__") {
        const lista = masivoPayload && masivoPayload.casos.length ? masivoPayload.casos : [numeroCaso];
        for (const c of lista) {
          await data.crearOtroSegmento({ userId: perfil.id, tipoId, minutos: min, numeroCaso: c });
        }
        setModal(null);
        fire(`Creación registrada — ${lista.length} caso(s) de otro segmento (no quedan en bandeja)`);
        reload();
        return;
      }
      // Traspaso: creo el caso (cuenta como mi gestión) pero queda en la bandeja de otra persona.
      if (destinoId && destinoId !== perfil.id) {
        await data.crearYTraspasar({ userId: perfil.id, destinoId, tipoId, numeroCaso, minutos: min });
        pushUsuarios([destinoId], "Te pasaron un caso", `${perfil.nombre} te pasó el caso #${numeroCaso}`).catch(() => {});
        const dest = equipo.find((u) => u.id === destinoId);
        setModal(null);
        fire("Caso creado y pasado a " + (dest ? dest.nombre : "el analista"));
        reload();
        return;
      }
      if (m.nuevo) await data.agregarCasoNuevo({ userId: perfil.id, tipoId, numeroCaso, minutos: min, seguir: seguirReal });
      else if (m.libre) await data.registrarLibre({ userId: perfil.id, tipoId, numeroCaso, minutos: min });
      else await data.registrarGestion({ userId: perfil.id, tipoId, numeroCaso, minutos: min, asignacionId: m.asignacion.id, seguir: seguirReal });
      setModal(null);
      fire(seguirReal ? "Gestión registrada — el caso sigue en tu bandeja" : "Gestión registrada");
      reload();
    } catch (e: any) { fire("Error: " + (e.message ?? "no se pudo guardar")); }
  };

  return (
    <>
      <div className="row-between">
        <div>
          <div className="eyebrow">Bandeja del día</div>
          <div className="h1">Tus casos de hoy</div>
          <div className="sub">Selecciona un caso y registra la gestión que hiciste. Si te llega un caso nuevo, agrégalo tú mismo. Los casos pendientes de días anteriores siguen aquí hasta que los gestiones.</div>
        </div>
        <div className="gap9">
          <button className="btn ghost" onClick={() => setModal({ libre: true })}><Phone size={15} />Gestión sin caso asignado</button>
          <button className="btn primary" onClick={() => setModal({ nuevo: true })}><Plus size={16} />Agregar caso nuevo</button>
        </div>
      </div>

      <div className="card turnocard mt20">
        <div className="turnoinfo">
          <div className="turnoico"><Clock size={20} /></div>
          <div>
            <div className="eyebrow">Tu turno de hoy</div>
            {turno ? (
              <div className="turnotxt">{turno.turno ?? "—"} <span className="faint">·</span> disponible <b>{turno.disponible_min ? (turno.disponible_min / 60).toFixed(1) + "h" : "—"}</b></div>
            ) : <div className="turnotxt faint">Tu turno aún no está cargado. Tu coordinador lo sube desde el Excel.</div>}
          </div>
        </div>
        <div className="turnoacc">
          {pausa ? (
            <div className="enpausa">
              <span className="pausachip"><CircleDot size={13} /> {PAUSA_LBL[pausa.tipo] ?? "Pausa"} desde {new Date(pausa.inicio).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
              <button className="btn primary sm" disabled={pausaBusy} onClick={volver}>Volví</button>
            </div>
          ) : (
            <>
              <button className="btn ghost sm" disabled={pausaBusy} onClick={() => salir("break")}>Break</button>
              <button className="btn ghost sm" disabled={pausaBusy} onClick={() => salir("almuerzo")}>Almuerzo</button>
              <button className="btn ghost sm" disabled={pausaBusy} onClick={() => salir("bano")}>Baño</button>
              <button className="btn ghost sm" disabled={pausaBusy} onClick={() => salir("backoffice")}>Backoffice</button>
              <button className="btn ghost sm" disabled={pausaBusy} onClick={() => salir("reunion")}>Reunión interna</button>
              <button className="btn ghost sm" disabled={pausaBusy} onClick={() => salir("capacitacion")}>Capacitación</button>
            </>
          )}
        </div>
      </div>

      {pool.length > 0 && (
        <div className="mt15">
          <div className="row-between mb10"><div className="h2">Contenedor {mixto ? "de tu grupo" : "general"}</div><span className="chip medio">{pool.length} sin asignar</span></div>
          <div className="sub small mb10">
            {puedeMasivo
              ? "Casos sin asignar de tu grupo. Marca los que quieras y asígnalos a alguien, muévelos a otra bolsa o tómatelos."
              : "Casos enviados al contenedor de tu grupo. Marca los que quieras y tómatelos."}
          </div>
          <ContenedorPool
            perfil={perfil} pool={pool} personas={personas} mesas={mesas}
            onReload={() => { reload(); reloadPool(); }} fire={fire}
            permitirAsignarOtro={puedeMasivo} permitirMover={puedeMasivo}
          />
        </div>
      )}

      {companeros.length > 1 && (
        <div className="card mt15">
          <div className="row-between mb10">
            <div className="h2">Compañeros</div>
            <span className="chip done"><span className="liveblip" /> {companeros.filter((c) => c.estado === "online").length} en línea</span>
          </div>
          <div className="teamstrip">
            {companeros.filter((c) => c.user_id !== perfil.id).map((c) => (
              <div key={c.user_id} className="mate" title={c.cargo ?? ""}>
                <span className="uava xsmall">{(c.nombre?.[0] ?? "") + (c.apellido?.[0] ?? "")}</span>
                <span className="matename">{firstLast(c.nombre, c.apellido)}</span>
                <span className={"chip s11 " + (ESTADO_CHIP[c.estado] ?? "sin")}>
                  {c.estado === "online" ? "En línea" : c.estado === "offline" ? "Desconectado" : PAUSA_LBL[c.estado] ?? c.estado}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid two mt15 mb20">
        <div className="card tight statline">
          <div className="statIco big dangerbg"><Inbox size={20} /></div>
          <div><div className="statVal danger sm">{pend}</div><div className="statLbl">Por gestionar</div></div>
        </div>
        <div className="card tight statline">
          <div className="statIco big okbg"><Check size={20} /></div>
          <div><div className="statVal ok sm">{done}</div><div className="statLbl">Cerrados por hoy</div></div>
        </div>
      </div>

      <div className="grid sidebarLayout">
        <div className="card">
          <div className="row-between mb14"><div className="h2">Casos asignados</div><span className="chip neutral">{bandeja.length} en total</span></div>
          <div className="rolepick mb14">
            {([
              ["todos", `Todos (${bandeja.length})`],
              ["pendiente", `Pendientes (${bandeja.filter((a) => a.estado === "pendiente").length})`],
              ["progreso", `En progreso (${bandeja.filter((a) => a.estado === "progreso").length})`],
              ["gestionado", `Cerrados (${bandeja.filter((a) => a.estado === "gestionado").length})`],
              ["atrasado", `Atrasados (${bandeja.filter((a) => a.fecha < hoy() && a.estado !== "gestionado").length})`],
            ] as [typeof filtroCaso, string][]).map(([v, label]) => (
              <button key={v} className={"roleopt" + (filtroCaso === v ? " on" : "")} onClick={() => setFiltroCaso(v)}>{label}</button>
            ))}
          </div>
          {loading && <div className="empty">Cargando…</div>}
          {!loading && bandeja.length === 0 && <div className="empty"><Inbox size={32} className="dim" /><div>Aún no tienes casos asignados hoy.<br />Tu senior los reparte a primera hora.</div></div>}
          {!loading && bandeja.length > 0 && casosVisibles.length === 0 && <div className="empty pad24">Sin casos en este filtro.</div>}
          <div className="col10">
            {casosVisibles.map((a) => {
              const lg = lastGestOf(a.id);
              return (
                <div key={a.id} className="casecard">
                  <div className="min0">
                    <div className="caseno">#{a.numero_caso}</div>
                    {(a as any).cliente && <div className="caseCli">{(a as any).cliente}</div>}
                    <div className="caseMeta">
                      {a.estado === "gestionado" ? <span className="chip done"><Check size={11} />Cerrado por hoy</span>
                        : a.estado === "progreso" ? <span className="chip prog"><CircleDot size={11} />En progreso</span>
                          : <span className="chip pend">Pendiente</span>}
                      {a.fecha < hoy() && (
                        <span className="chip late"><AlertTriangle size={11} />
                          Atrasado · {dayLabel(a.fecha)} {new Date(a.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                        </span>
                      )}
                      {lg && <span className="faint">· Última: {tName(lg.tipo_id)}</span>}
                    </div>
                  </div>
                  {a.estado !== "gestionado"
                    ? <button className="btn primary sm" onClick={() => setModal({ asignacion: a })}>Registrar gestión</button>
                    : <button className="btn ghost sm" onClick={() => setModal({ asignacion: a })}>Reabrir</button>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="h2 mb6">Tu actividad de hoy</div>
          <div className="sub small mb14">Registro de lo que has trabajado. (Los totales los revisa tu coordinador.)</div>
          {actividad.length === 0 && <div className="empty pad24">Sin gestiones registradas todavía.</div>}
          <div className="col9">
            {actividad.map((g) => {
              const c = CATS[tCat(g.tipo_id) as Categoria]; const Ico = ICON[tCat(g.tipo_id) as Categoria];
              return (
                <div key={g.id} className="actrow">
                  <div className="actico" style={{ background: c.color + "1A", color: c.color }}><Ico size={15} /></div>
                  <div className="min0 grow">
                    <div className="actname">{tName(g.tipo_id)}</div>
                    <div className="mono actmeta">#{g.numero_caso.replace(/^(EXT|REU)-/, "")} · {new Date(g.registrado_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {modal && <RegistrarModal modal={modal} catalogo={catalogo} incluirSenior={incluirSenior} equipo={equipo} yoId={perfil.id}
        mesasPool={mesas.filter((m: any) => m.nombre !== perfil.mesa)} onClose={() => setModal(null)} onSave={onSave} />}
    </>
  );
}

function RegistrarModal({ modal, catalogo, onClose, onSave, incluirSenior = false, equipo = [], yoId, mesasPool = [] }: any) {
  const [tipoId, setTipoId] = useState<string | null>(null);
  const [caso, setCaso] = useState<string>(modal.asignacion?.numero_caso ?? "");
  const [min, setMin] = useState<string>("");
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [destino, setDestino] = useState<string>("");
  const [masivo, setMasivo] = useState(false);
  const [bulkCaso, setBulkCaso] = useState("");
  const [cerrar, setCerrar] = useState(false);
  const casosMasivos = bulkCaso.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const tipos = catalogo.filter((g: GestionTipo) => g.activo && (incluirSenior || !g.senior_only));
  // Reuniones y gestiones internas no corresponden a un caso: no se pide número.
  const catSel = tipos.find((g: GestionTipo) => g.id === tipoId)?.categoria;
  const sinCaso = catSel === "reunion" || catSel === "interna";
  // Creación de caso: al ser un caso NUEVO, puede quedarse en mi bandeja o pasárselo a otra persona.
  const nombreSel = tipos.find((g: GestionTipo) => g.id === tipoId)?.nombre?.toUpperCase().trim();
  const esCreacion = modal.nuevo && nombreSel === "CREACIÓN DE CASO";
  const otros = equipo.filter((u: Usuario) => u.id !== yoId);
  const valid = tipoId && (sinCaso || (masivo ? casosMasivos.length > 0 : caso.trim())) && min && +min > 0;
  const title = modal.nuevo ? "Agregar caso nuevo" : modal.libre ? "Gestión sin caso asignado" : "Registrar gestión";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <div className="h2">{title}</div>
            {modal.asignacion && <div className="mono sub mt3">Caso #{modal.asignacion.numero_caso}</div>}
            {modal.libre && <div className="sub small mt3">Ej: te llamaron por un caso de otro grupo. Igual lo registras con su número.</div>}
          </div>
          <button className="xbtn" onClick={onClose}><X size={16} /></button>
        </div>
        {step === 1 ? (
          <div className="modalBody">
            <label className="lbl">¿Qué gestión hiciste?</label>
            <div className="gtgrid">
              {tipos.map((g: GestionTipo) => {
                const c = CATS[g.categoria]; const Ico = ICON[g.categoria];
                return (
                  <button key={g.id} className={"gtopt" + (tipoId === g.id ? " on" : "")} onClick={() => setTipoId(g.id)}>
                    <Ico size={15} style={{ flexShrink: 0, color: tipoId === g.id ? "var(--primary)" : c.color }} />
                    <span className="gtlbl">{g.nombre}<br /><span className="gtcat">{c.label}</span></span>
                  </button>
                );
              })}
            </div>
            {(esCreacion || (modal.libre && !sinCaso)) && (
              <label className="lbl mt16" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={masivo} onChange={(e) => setMasivo(e.target.checked)} />
                {esCreacion ? "Creación masiva (varios casos de una vez)" : "Varios casos (pego varios y registro esta gestión en todos)"}
              </label>
            )}
            <div className={"grid mt16" + (sinCaso || masivo ? "" : " minutosrow")}>
              {!sinCaso && (masivo ? (
                <div><label className="lbl">Números de caso — uno por línea o separados por coma</label>
                  <textarea className="inp mono" value={bulkCaso} placeholder={"012345678\n012345679"} onChange={(e) => setBulkCaso(e.target.value)} />
                  {casosMasivos.length > 0 && <div className="sub small mt3">{casosMasivos.length} caso(s) detectado(s)</div>}
                </div>
              ) : (
                <div><label className="lbl">Número de caso</label>
                  <input className="inp mono" value={caso} disabled={!!modal.asignacion} placeholder="0xxxxxxxx"
                    onChange={(e) => setCaso(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))} /></div>
              ))}
              <div><label className="lbl">Minutos{masivo ? " (por cada caso)" : ""}</label>
                <input className="inp mono" type="number" min={1} value={min} placeholder="10" onChange={(e) => setMin(e.target.value)} /></div>
            </div>
          </div>
        ) : esCreacion ? (
          <div className="modalBody center pad30">
            <div className="bigico"><Activity size={26} /></div>
            <div className="h2">¿A quién le queda este caso?</div>
            <div className="sub mb22">La creación cuenta como tu gestión ({min} min). Elige dónde queda el caso para seguimiento.</div>
            <div className="destcol">
              <button className={"destopt" + (destino === yoId ? " on" : "")} onClick={() => setDestino(yoId)}>
                <span className="destlbl">Asignar a mí</span>
                <span className="destsub">Queda en mi bandeja para seguimiento</span>
              </button>
              <button className={"destopt" + (destino === "__ext__" ? " on" : "")} onClick={() => setDestino("__ext__")}>
                <span className="destlbl">Otro segmento</span>
                <span className="destsub">No es de tu segmento — solo cuenta la creación, no queda en bandeja</span>
              </button>
              <div className="destdiv">o pásaselo a un analista</div>
              <select className="inp" value={otros.some((u: Usuario) => u.id === destino) ? destino : ""} onChange={(e) => setDestino(e.target.value)}>
                <option value="">Selecciona un analista…</option>
                {otros.map((u: Usuario) => (
                  <option key={u.id} value={u.id}>{u.nombre}{u.apellido ? " " + u.apellido : ""}{u.cargo ? " · " + u.cargo : ""}</option>
                ))}
              </select>
              {mesasPool.length > 0 && (
                <>
                  <div className="destdiv">o envíalo al contenedor de otra mesa</div>
                  <select className="inp" value={String(destino).startsWith("pool:") ? destino : ""} onChange={(e) => setDestino(e.target.value)}>
                    <option value="">Selecciona la mesa del caso…</option>
                    {mesasPool.map((m: any) => (
                      <option key={m.nombre} value={"pool:" + m.nombre}>Contenedor de {mesaLabel(m.nombre)}</option>
                    ))}
                  </select>
                  <div className="sub tiny mt3">El senior de esa mesa lo verá en su contenedor y lo asignará a su equipo.</div>
                </>
              )}
              {masivo && (
                <label className="destopt" style={{ cursor: "pointer" }}>
                  <span className="destlbl" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={cerrar} onChange={(e) => setCerrar(e.target.checked)} />
                    Crear y cerrar
                  </span>
                  <span className="destsub">Entran ya como gestionados — no quedan pendientes en la bandeja</span>
                </label>
              )}
            </div>
            <div className="gap10 center-row mt16">
              <button className="btn ghost" disabled={busy} onClick={() => setStep(1)}>Atrás</button>
              <button className="btn primary" disabled={busy || !destino} onClick={async () => { setBusy(true); await onSave(modal, tipoId, caso.trim(), +min, destino === yoId, destino, masivo ? { casos: casosMasivos, cerrar } : undefined); }}>Confirmar<ChevronRight size={15} /></button>
            </div>
          </div>
        ) : (
          <div className="modalBody center pad30">
            <div className="bigico"><Activity size={26} /></div>
            <div className="h2">¿Vas a trabajar más este caso hoy?</div>
            <div className="sub mb22">Si sigues, el caso queda activo en tu bandeja para agregarle más gestiones después.</div>
            <div className="gap10 center-row">
              <button className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); await onSave(modal, tipoId, caso.trim(), +min, false); }}><Check size={15} />No, cerrar por hoy</button>
              <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await onSave(modal, tipoId, caso.trim(), +min, true); }}>Sí, sigo con él<ChevronRight size={15} /></button>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="modalFoot">
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
            <button className="btn primary" disabled={!valid || busy} onClick={async () => {
              if (sinCaso) { setBusy(true); await onSave(modal, tipoId, "", +min, false); }
              // Gestión sin caso en lote (bolsa de otros): registra la gestión en todos los casos pegados.
              else if (modal.libre && masivo) { setBusy(true); await onSave(modal, tipoId, "", +min, false, null, { casos: casosMasivos, cerrar: false }); }
              else setStep(2);
            }}>{modal.libre && masivo ? `Registrar en ${casosMasivos.length || ""} caso(s)` : "Continuar"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════ VISTA SENIOR ════════════════ */
function SeniorView({ perfil, fire }: { perfil: Usuario; fire: (m: string) => void }) {
  const [equipo, setEquipo] = useState<Usuario[]>([]);
  const [sel, setSel] = useState<string>("");
  const [bandeja, setBandeja] = useState<any[]>([]);
  const [bulk, setBulk] = useState("");

  // El senior reparte dentro de su mesa; y a todo el grupo si es mixto (Élite+Distrito).
  useEffect(() => { data.getEquipoRepartir(perfil.mesa).then((ag) => { setEquipo(ag); setSel(ag[0]?.id ?? ""); }); }, [perfil.mesa]);
  useEffect(() => { if (sel) data.getMiBandeja(sel).then(setBandeja); }, [sel]);

  const target = equipo.find((u) => u.id === sel);
  const repartir = async () => {
    const casos = bulk.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!casos.length) return;
    try {
      await data.repartirSeguimiento({ userId: sel, seniorId: perfil.id, casos });
      pushUsuarios([sel], "Nuevos casos en tu bandeja", `${perfil.nombre} te asignó ${casos.length} caso(s)`).catch(() => {});
      setBulk(""); fire(`${casos.length} caso(s) asignados a ${target?.nombre}`);
      data.getMiBandeja(sel).then(setBandeja);
    } catch (e: any) { fire("Error: " + e.message); }
  };
  const quitar = async (a: any) => {
    if (a.estado !== "pendiente" && !confirm(`El caso #${a.numero_caso} ya tiene gestión registrada. ¿Quitarlo de la bandeja de todas formas?`)) return;
    await data.quitarAsignacion(a.id);
    data.getMiBandeja(sel).then(setBandeja);
  };

  // Contenedor general: mi mesa; y todas las mesas de mi grupo si es MIXTO
  // (Élite+Distrito se apoyan en cualquier horario).
  const [pool, setPool] = useState<any[]>([]);
  const [mixto, setMixto] = useState(false);
  const [mesasAll, setMesasAll] = useState<any[]>([]);
  const grupoMesasRef = useRef<Set<string>>(new Set(perfil.mesa ? [perfil.mesa] : []));
  const reloadPool = () => data.getPoolPendientes().then((l: any[]) => setPool(l.filter((p) => grupoMesasRef.current.has(p.mesa)))).catch(() => {});
  useEffect(() => {
    data.getMesas().then((ms: any[]) => {
      setMesasAll(ms.filter((m) => !m.oculta));
      const miGrupo = ms.find((m) => m.nombre === perfil.mesa)?.grupo || perfil.mesa;
      const grupo = ms.filter((m) => (m.grupo || m.nombre) === miGrupo);
      const esMixto = grupo.some((m) => m.grupo_mixto);
      grupoMesasRef.current = new Set(esMixto ? grupo.map((m) => m.nombre) : (perfil.mesa ? [perfil.mesa] : []));
      setMixto(esMixto);
      reloadPool();
    }).catch(() => {});
    const t = setInterval(reloadPool, 60000); return () => clearInterval(t); /* eslint-disable-next-line */
  }, [perfil.mesa]);
  const asignarPool = async (poolId: string, destinoId: string) => {
    if (!destinoId) return;
    try {
      await data.poolAsignar(poolId, destinoId);
      const d = equipo.find((u) => u.id === destinoId);
      if (destinoId !== perfil.id) pushUsuarios([destinoId], "Caso del contenedor asignado", `${perfil.nombre} te asignó un caso del contenedor`).catch(() => {});
      fire("Caso del contenedor asignado a " + (destinoId === perfil.id ? "ti" : d ? d.nombre : "el analista"));
      reloadPool();
      if (destinoId === sel) data.getMiBandeja(sel).then(setBandeja);
    } catch (e: any) { fire("Error: " + (e.message ?? "no se pudo asignar")); }
  };
  const moverPool = async (poolId: string, mesaDestino: string) => {
    if (!mesaDestino) return;
    try {
      const p = pool.find((x) => x.id === poolId);
      await data.poolMoverMesa(poolId, mesaDestino);
      fire(`Caso ${p ? "#" + p.numero_caso : ""} movido a la bolsa de ${mesaLabel(mesaDestino)}`);
      reloadPool();
    } catch (e: any) { fire("Error: " + (e.message ?? "no se pudo mover")); }
  };

  const [reasignando, setReasignando] = useState<string | null>(null);
  const reasignar = async (a: any, destinoId: string) => {
    if (!destinoId || destinoId === sel) { setReasignando(null); return; }
    if (a.estado !== "pendiente" && !confirm(`El caso #${a.numero_caso} ya tiene gestión registrada. ¿Reasignarlo de todas formas?`)) {
      setReasignando(null);
      return;
    }
    try {
      await data.reasignarCaso({ asignacionId: a.id, destinoId, porId: perfil.id });
      const dest = equipo.find((u) => u.id === destinoId);
      fire("Caso reasignado a " + (dest ? dest.nombre : "el analista"));
      setReasignando(null);
      data.getMiBandeja(sel).then(setBandeja);
    } catch (e: any) { fire("Error: " + (e.message ?? "no se pudo reasignar")); }
  };

  return (
    <>
      <div className="eyebrow">Senior</div>
      <div className="h1">Repartir seguimiento del día</div>
      <div className="sub mb20">Asigna los casos de seguimiento a cada persona. Cuando entren, ya los verán en su bandeja.</div>
      <div className="grid seniorLayout">
        <div className="card selfstart">
          <div className="h2 mb12">Equipo de hoy</div>
          <div className="col6">
            {equipo.map((u) => (
              <button key={u.id} className={"nav navlight" + (sel === u.id ? " navon" : "")} onClick={() => setSel(u.id)}>
                <span className="navperson"><span className="uava small">{initials(u)}</span><span className="navname">{firstLast(u.nombre, u.apellido)}</span></span>
              </button>
            ))}
          </div>
        </div>
        <div className="col15">
          <div className="card">
            <div className="h2 mb4">Asignar a {target ? firstLast(target.nombre, target.apellido) : ""}</div>
            <div className="sub small mb12">Pega los números de caso — uno por línea, o separados por coma.</div>
            <textarea className="inp" value={bulk} placeholder={"012345678\n012345679"} onChange={(e) => setBulk(e.target.value)} />
            <div className="row-end mt12"><button className="btn primary" disabled={!bulk.trim()} onClick={repartir}><Plus size={16} />Asignar a la bandeja</button></div>
          </div>

          {pool.length > 0 && (
            <div className="card mt15">
              <div className="row-between mb10"><div className="h2">{mixto ? "Contenedor general de tu grupo" : "Contenedor general de tu mesa"}</div><span className="chip medio">{pool.length} sin asignar</span></div>
              <div className="sub small mb10">{mixto ? "Casos enviados a las mesas de tu grupo (Élite y Distrito se apoyan). Asígnalos a tu equipo." : `Casos que otras mesas enviaron a ${perfil.mesa ? mesaLabel(perfil.mesa) : "tu mesa"}. Asígnalos a tu equipo.`}</div>
              <div className="col9">
                {pool.map((p: any) => (
                  <div key={p.id} className="casecard">
                    <div className="min0">
                      <div className="caseno">#{p.numero_caso}</div>
                      {p.cliente && <div className="caseCli">{p.cliente}</div>}
                      <div className="caseMeta">
                        {mixto && <span className="chip bajo s11">{mesaLabel(p.mesa)}</span>}
                        {p.creador && <span className="faint">{mixto ? "· " : ""}envió {firstLast(p.creador.nombre, p.creador.apellido)}</span>}
                        <span className="faint">· {new Date(p.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                      </div>
                    </div>
                    <div className="gap9 center-row">
                      <select className="inp dateinp" defaultValue="" onChange={(e) => { moverPool(p.id, e.target.value); e.currentTarget.value = ""; }} title="Reenrutar a otra bolsa">
                        <option value="">Mover a bolsa de…</option>
                        {mesasAll.filter((m) => m.nombre !== p.mesa).map((m) => <option key={m.nombre} value={m.nombre}>{mesaLabel(m.nombre)}</option>)}
                      </select>
                      <select className="inp dateinp" defaultValue="" onChange={(e) => asignarPool(p.id, e.target.value)}>
                        <option value="">Asignar a…</option>
                        {equipo.map((u) => <option key={u.id} value={u.id}>{firstLast(u.nombre, u.apellido)}</option>)}
                        <option value={perfil.id}>Yo ({perfil.nombre})</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="card">
            <div className="row-between mb12"><div className="h2">Bandeja actual</div><span className="chip neutral">{bandeja.length} casos</span></div>
            {bandeja.length === 0 ? <div className="empty pad24">Sin casos asignados todavía.</div> :
              <div className="wrap8">
                {bandeja.map((a) => (
                  <div key={a.id} className="caseChip">
                    <span className="mono caseChipNo">#{a.numero_caso}</span>
                    {(a as any).cliente && <span className="caseChipCli">{(a as any).cliente}</span>}
                    {a.estado === "gestionado" ? <Check size={13} color="var(--ok)" /> : a.estado === "progreso" ? <CircleDot size={13} color="var(--warn)" /> : null}
                    {reasignando !== a.id && (
                      <button className="xbtn tiny" title="Pasar a otro analista" onClick={() => setReasignando(a.id)}><ArrowRight size={12} /></button>
                    )}
                    <button className="xbtn tiny" title="Quitar" onClick={() => quitar(a)}><X size={12} /></button>
                    {reasignando === a.id && (
                      <select className="inp reasignSel" autoFocus defaultValue="" onChange={(e) => reasignar(a, e.target.value)} onBlur={() => setReasignando(null)}>
                        <option value="">Pasar a…</option>
                        {equipo.filter((u) => u.id !== sel).map((u) => (
                          <option key={u.id} value={u.id}>{firstLast(u.nombre, u.apellido)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>}
          </div>
        </div>
      </div>
    </>
  );
}

// Bolsa de casos creados fuera de horario hábil (noche, fin de semana,
// festivo). A diferencia del contenedor por mesa, esta la ve y la toma
// cualquier autenticado sin importar su mesa/grupo (ver RLS de casos_pool).
function PoolNoHabilView({ perfil, fire }: { perfil: Usuario; fire: (m: string) => void }) {
  const [pool, setPool] = useState<any[]>([]);
  const [equipo, setEquipo] = useState<Usuario[]>([]);
  const [mesas, setMesas] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const puedeMover = perfil.rol !== "agente";   // senior/coordinación pueden reenrutar
  // Mesa que la mía apoya (ej. MEN → PREMIUM 3): fuera de horario también
  // se muestra su contenedor (la RLS solo lo deja ver en horario no hábil).
  const apoyaMesaRef = useRef<string | null>(null);
  const reload = () => data.getPoolPendientes()
    .then((l: any[]) => setPool(l.filter((p) => p.fuera_horario === true || (apoyaMesaRef.current && p.mesa === apoyaMesaRef.current))))
    .catch(() => {});
  useEffect(() => {
    data.getMesaApoyo(perfil.mesa).then((m) => { apoyaMesaRef.current = m; reload(); }).catch(() => reload());
    // Todo mi grupo (la RLS acota: un senior ve a su grupo completo; en un
    // grupo mixto como Élite+Distrito, ambas mesas).
    data.getEquipo(null)
      .then((eq) => setEquipo(eq.filter((u) => u.id !== perfil.id && (u.rol === "agente" || u.rol === "senior"))))
      .catch(() => {});
    if (puedeMover) data.getMesas().then((m: any[]) => setMesas(m.filter((x) => !x.oculta))).catch(() => {});
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  const asignar = async (poolId: string, destinoId: string) => {
    if (!destinoId) return;
    setBusy(poolId);
    try {
      const caso = pool.find((p) => p.id === poolId);
      await data.poolAsignar(poolId, destinoId);
      const d = equipo.find((u) => u.id === destinoId);
      if (destinoId !== perfil.id) {
        pushUsuarios([destinoId], "Caso fuera de horario asignado",
          `${perfil.nombre} te asignó el caso ${caso ? "#" + caso.numero_caso : ""} de la bolsa de horario no hábil`).catch(() => {});
      }
      fire(`Caso ${caso ? "#" + caso.numero_caso : ""} asignado a ` + (destinoId === perfil.id ? "ti" : d ? d.nombre : "el analista"));
      reload();
    } catch (e: any) {
      fire("Error: " + (e.message ?? "no se pudo asignar"));
    } finally {
      setBusy(null);
    }
  };

  const mover = async (poolId: string, mesaDestino: string) => {
    if (!mesaDestino) return;
    setBusy(poolId);
    try {
      const caso = pool.find((p) => p.id === poolId);
      await data.poolMoverMesa(poolId, mesaDestino);
      fire(`Caso ${caso ? "#" + caso.numero_caso : ""} movido a la bolsa de ${mesaLabel(mesaDestino)}`);
      reload();
    } catch (e: any) {
      fire("Error: " + (e.message ?? "no se pudo mover"));
    } finally {
      setBusy(null);
    }
  };

  // Coordinación: empujar YA toda la bolsa a los contenedores de cada mesa.
  const esPrivPool = perfil.rol === "coordinador" || perfil.rol === "superadmin";
  const noHabilCount = pool.filter((p) => p.fuera_horario === true).length;
  const [enviando, setEnviando] = useState(false);
  const enviarTodo = async () => {
    if (!confirm(`Vas a enviar ${noHabilCount} caso(s) de la bolsa de horario no hábil al contenedor de su mesa. Los que un senior ya haya asignado no se duplican. ¿Continuar?`)) return;
    setEnviando(true);
    try {
      const n = await data.enviarNoHabilAContenedores();
      fire(`${n} caso(s) enviados a sus contenedores.`);
      reload();
    } catch (e: any) {
      fire("Error: " + (e.message ?? "no se pudo enviar"));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="row-between end">
        <div>
          <div className="eyebrow">Bolsa</div>
          <div className="h1">Casos horario no hábil</div>
        </div>
        {esPrivPool && noHabilCount > 0 && (
          <button className="btn primary" disabled={enviando} onClick={enviarTodo}>
            <ArrowRight size={15} />{enviando ? "Enviando…" : `Enviar ${noHabilCount} a sus contenedores`}
          </button>
        )}
      </div>
      <div className="sub mb20">
        Casos creados fuera del horario de atención (noche entre semana, fin de semana o festivo).
        Cualquiera puede tomarlos, sin importar su mesa — asígnalos a ti mismo o a alguien de tu equipo.
      </div>
      <div className="card">
        {pool.length === 0 ? (
          <div className="empty pad24">No hay casos en la bolsa de horario no hábil.</div>
        ) : (
          <div className="col9">
            {pool.map((p: any) => (
              <div key={p.id} className="casecard">
                <div className="min0">
                  <div className="caseno">#{p.numero_caso}</div>
                  {p.cliente && <div className="caseCli">{p.cliente}</div>}
                  <div className="caseMeta">
                    <span className="chip bajo s11">{mesaLabel(p.mesa)}</span>
                    {p.creador && <span className="faint">· envió {firstLast(p.creador.nombre, p.creador.apellido)}</span>}
                    <span className="faint">· {new Date(p.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                  </div>
                </div>
                <div className="gap9 center-row">
                  {puedeMover && (
                    <select className="inp dateinp" disabled={busy === p.id} defaultValue="" onChange={(e) => { mover(p.id, e.target.value); e.currentTarget.value = ""; }} title="Reenrutar a otra bolsa">
                      <option value="">Mover a bolsa de…</option>
                      {mesas.filter((m) => m.nombre !== p.mesa).map((m) => <option key={m.nombre} value={m.nombre}>{mesaLabel(m.nombre)}</option>)}
                    </select>
                  )}
                  <select className="inp dateinp" disabled={busy === p.id} defaultValue="" onChange={(e) => asignar(p.id, e.target.value)}>
                    <option value="">Asignar a…</option>
                    <option value={perfil.id}>Yo ({perfil.nombre})</option>
                    {equipo.map((u) => <option key={u.id} value={u.id}>{firstLast(u.nombre, u.apellido)}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ════════════════ CONTENEDOR (multiselección + acciones masivas) ════════════════ */
// Lista reutilizable del pool con checks, filtros (mesa/caso/cliente) y barra
// de acciones masivas: tomar a mí, asignar a una persona, mover a otra bolsa.
function ContenedorPool({
  perfil, pool, personas, mesas, onReload, fire, permitirAsignarOtro, permitirMover, asignacionLibre = false,
}: {
  perfil: Usuario; pool: any[]; personas: Usuario[]; mesas: any[];
  onReload: () => void; fire: (m: string) => void;
  permitirAsignarOtro: boolean; permitirMover: boolean; asignacionLibre?: boolean;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [fMesa, setFMesa] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const mesasEnPool = useMemo(() => [...new Set(pool.map((p) => p.mesa))].sort(), [pool]);
  const filtrado = pool.filter((p) => {
    if (fMesa && p.mesa !== fMesa) return false;
    if (q && !sinTildes(`${p.numero_caso} ${p.cliente ?? ""} ${mesaLabel(p.mesa)}`).includes(sinTildes(q))) return false;
    return true;
  });
  const idsFiltrados = filtrado.map((p) => p.id);
  const seleccion = idsFiltrados.filter((id) => sel.has(id));
  const todos = filtrado.length > 0 && seleccion.length === filtrado.length;
  const toggle = (id: string) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleTodos = () => setSel(todos ? new Set() : new Set(idsFiltrados));

  // Agrupa las personas por mesa para el desplegable de "asignar a".
  const porMesa = useMemo(() => {
    const m = new Map<string, Usuario[]>();
    personas.forEach((u) => { const k = u.mesa || "—"; (m.get(k) ?? m.set(k, []).get(k)!).push(u); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [personas]);

  const correr = async (fn: () => Promise<number>, verbo: string) => {
    setBusy(true);
    try {
      const n = await fn();
      fire(`${n} caso(s) ${verbo}.`);
      setSel(new Set());
      onReload();
    } catch (e: any) { fire("Error: " + (e.message ?? "")); }
    finally { setBusy(false); }
  };
  // En el contenedor general la asignación es LIBRE (cualquier ingeniero, sin
  // restricción de mesa); en "Mi bandeja" respeta las reglas por grupo.
  const asignarRpc = (ids: string[], destino: string) =>
    asignacionLibre ? data.poolAsignarLibre(ids, destino) : data.poolAsignarMasivo(ids, destino);
  const tomarSel = (ids: string[]) => correr(() => asignarRpc(ids, perfil.id), "tomados por ti");
  const asignarSel = (destinoId: string) => {
    const d = personas.find((u) => u.id === destinoId);
    correr(() => asignarRpc(seleccion, destinoId), `asignados a ${d ? firstLast(d.nombre, d.apellido) : "la persona"}`);
    if (destinoId !== perfil.id && seleccion.length) pushUsuarios([destinoId], "Casos del contenedor asignados", `${perfil.nombre} te asignó ${seleccion.length} caso(s)`).catch(() => {});
  };
  const moverSel = (mesaDest: string) => correr(() => data.poolMoverMasivo(seleccion, mesaDest), `movidos a la bolsa de ${mesaLabel(mesaDest)}`);

  return (
    <div className="card nopad">
      <div className="tblhead">
        <div className="gap9 center-row">
          <label className="checkall"><input type="checkbox" checked={todos} onChange={toggleTodos} disabled={!filtrado.length} /> Todos</label>
          {mesasEnPool.length > 1 && (
            <select className="inp dateinp" value={fMesa} onChange={(e) => setFMesa(e.target.value)}>
              <option value="">Todas las mesas</option>
              {mesasEnPool.map((m) => <option key={m} value={m}>{mesaLabel(m)}</option>)}
            </select>
          )}
        </div>
        <div className="searchwrap"><Search size={15} className="searchico" /><input className="inp searchinp" placeholder="Buscar caso o cliente…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      {seleccion.length > 0 && (
        <div className="selbar">
          <span className="chip neutral">{seleccion.length} seleccionado(s)</span>
          <div className="gap9 center-row wrap">
            <button className="btn primary sm" disabled={busy} onClick={() => tomarSel(seleccion)}>Tomármelos ({seleccion.length})</button>
            {permitirAsignarOtro && (
              <select className="inp dateinp" disabled={busy} defaultValue="" onChange={(e) => { const v = e.target.value; e.currentTarget.value = ""; if (v) asignarSel(v); }}>
                <option value="">Asignar a…</option>
                {porMesa.map(([m, us]) => (
                  <optgroup key={m} label={mesaLabel(m)}>
                    {us.map((u) => <option key={u.id} value={u.id}>{firstLast(u.nombre, u.apellido)}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
            {permitirMover && (
              <select className="inp dateinp" disabled={busy} defaultValue="" onChange={(e) => { const v = e.target.value; e.currentTarget.value = ""; if (v) moverSel(v); }} title="Mover a otra bolsa">
                <option value="">Mover a bolsa de…</option>
                {mesas.map((m) => <option key={m.nombre} value={m.nombre}>{mesaLabel(m.nombre)}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      <div className="col9 pad14">
        {filtrado.length === 0 ? <div className="empty pad24">Sin casos para este filtro.</div> :
          filtrado.map((p: any) => (
            <div key={p.id} className={"casecard selectable" + (sel.has(p.id) ? " on" : "")}>
              <label className="casecheck"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} /></label>
              <div className="min0 grow">
                <div className="caseno">#{p.numero_caso}</div>
                {p.cliente && <div className="caseCli">{p.cliente}</div>}
                <div className="caseMeta">
                  <span className="chip bajo s11">{mesaLabel(p.mesa)}</span>
                  {p.creador && <span className="faint">· envió {firstLast(p.creador.nombre, p.creador.apellido)}</span>}
                  {p.created_at && <span className="faint">· {new Date(p.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>}
                </div>
              </div>
              <button className="btn ghost sm" disabled={busy} onClick={() => tomarSel([p.id])}>Tomármelo</button>
            </div>
          ))}
      </div>
    </div>
  );
}

// Pestaña "Contenedor general": todos los casos sin asignar visibles (según
// RLS: coordinación ve todo; senior ve su grupo). Silver queda oculto.
function ContenedorGeneralView({ perfil, fire }: { perfil: Usuario; fire: (m: string) => void }) {
  const priv = perfil.rol === "coordinador" || perfil.rol === "superadmin";
  const [pool, setPool] = useState<any[]>([]);
  const [personas, setPersonas] = useState<Usuario[]>([]);
  const [mesas, setMesas] = useState<any[]>([]);
  const ocultasRef = useRef<Set<string>>(new Set());   // mesas que retienen (Silver): invisibles aquí
  const reload = () => data.getPoolPendientes()
    .then((l: any[]) => setPool(l.filter((p) => !ocultasRef.current.has(p.mesa))))
    .catch(() => {});
  useEffect(() => {
    data.getMesas().then((ms: any[]) => {
      ocultasRef.current = new Set(ms.filter((m) => m.retiene_no_habil).map((m) => m.nombre));
      setMesas(ms.filter((m) => !m.oculta));
      reload();
    }).catch(() => reload());
    // Todos los ingenieros (incluye otras mesas) para poder repartir libremente.
    data.getIngenierosTodos()
      .then((l) => setPersonas(l.filter((u) => u.activo && (u.rol === "agente" || u.rol === "senior"))))
      .catch(() => {});
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      <div className="row-between end">
        <div><div className="eyebrow">{priv ? "Coordinación · Help Desk" : "Senior · tu grupo"}</div><div className="h1">Contenedor general</div></div>
        <span className="chip medio">{pool.length} sin asignar</span>
      </div>
      <div className="sub small mt3 mb16">Casos que están en los contenedores y nadie ha tomado. Marca los que quieras y asígnalos a una persona, muévelos a otra bolsa o tómatelos.</div>
      <ContenedorPool perfil={perfil} pool={pool} personas={personas} mesas={mesas} onReload={reload} fire={fire} permitirAsignarOtro permitirMover asignacionLibre />
    </div>
  );
}

/* ════════════════ utilidades de rango y exportación ════════════════ */
// Resta días partiendo del "hoy" de Colombia (no del reloj UTC).
const isoHace = (dias: number) => { const d = new Date(hoy() + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - dias); return d.toISOString().slice(0, 10); };
const fmtFecha = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
const horas = (min: number) => (min / 60).toFixed(1) + "h";

function RangoFechas({ desde, hasta, setDesde, setHasta }: any) {
  const preset = (d: number) => { setDesde(isoHace(d)); setHasta(todayISO()); };
  return (
    <div className="rango no-print">
      <div className="rolepick">
        <button className="roleopt" onClick={() => preset(0)}>Hoy</button>
        <button className="roleopt" onClick={() => preset(6)}>7 días</button>
        <button className="roleopt" onClick={() => preset(29)}>30 días</button>
      </div>
      <input type="date" className="inp dateinp" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
      <span className="faint">→</span>
      <input type="date" className="inp dateinp" value={hasta} min={desde} max={todayISO()} onChange={(e) => setHasta(e.target.value)} />
    </div>
  );
}

function exportarExcel(nombre: string, hojas: { nombre: string; filas: any[] }[]) {
  const wb = XLSX.utils.book_new();
  hojas.forEach((h) => {
    const ws = XLSX.utils.json_to_sheet(h.filas.length ? h.filas : [{ "": "Sin datos" }]);
    XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
  });
  XLSX.writeFile(wb, `${nombre}.xlsx`);
}

/* ── Selector de mesa (Todas / Mayoristas / Gold / Premium…) ── */
const mesaLabel = (m: string) => m.charAt(0) + m.slice(1).toLowerCase();

// Quita tildes y baja a minúsculas para buscar sin importar acentos.
const sinTildes = (s: string) => (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
// ¿El texto buscado aparece en alguno de los campos (nombre, apellido…)?
const matchNombre = (q: string, ...campos: (string | null | undefined)[]) => {
  const t = sinTildes(q).trim();
  if (!t) return true;
  const hay = sinTildes(campos.filter(Boolean).join(" "));
  return t.split(/\s+/).every((p) => hay.includes(p));   // todas las palabras deben aparecer
};

// Abrir el perfil de una persona desde cualquier lista (nombre clicable).
const PerfilCtx = createContext<(u: { id: string; nombre: string }) => void>(() => {});
function PersonaLink({ id, nombre, clip = false }: { id?: string | null; nombre: string; clip?: boolean }) {
  const abrir = useContext(PerfilCtx);
  if (!id) return <>{nombre}</>;
  return (
    <button type="button" className={"plink" + (clip ? " cellclip" : "")} title={"Ver perfil de " + nombre} onClick={() => abrir({ id, nombre })}>
      {nombre}
    </button>
  );
}

// Buscador con lupa, reutilizable en las listas de personas.
function BuscaNombre({ value, setValue, placeholder = "Buscar por nombre…" }: { value: string; setValue: (v: string) => void; placeholder?: string }) {
  return (
    <div className="buscanombre">
      <Search size={14} />
      <input className="buscanombre-inp" value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
      {value && <button className="buscanombre-x" onClick={() => setValue("")} title="Limpiar"><X size={13} /></button>}
    </div>
  );
}

function MesaSelector({ mesa, setMesa }: { mesa: string; setMesa: (m: string) => void }) {
  const [todas, setTodas] = useState<any[]>([]);
  useEffect(() => { data.getMesas().then(setTodas).catch(() => {}); }, []);
  const mesas = todas.filter((m: any) => !m.oculta);   // las de prueba no salen en el filtro
  if (mesas.length < 2) return null;   // con una sola mesa no hay nada que filtrar
  // Grupos con más de una mesa (ej. PREMIUM con Premium 1..4): opción "todo el grupo".
  const grupos = [...new Set(mesas.map((m: any) => m.grupo || m.nombre))]
    .filter((g) => mesas.filter((m: any) => (m.grupo || m.nombre) === g).length > 1);
  return (
    <select className="inp dateinp" value={mesa} onChange={(e) => setMesa(e.target.value)}>
      <option value="">Todas las mesas</option>
      {grupos.map((g: string) => <option key={"g:" + g} value={g}>{mesaLabel(g)} · todo el grupo</option>)}
      {mesas.filter((m: any) => !grupos.includes(m.nombre)).map((m: any) => (
        <option key={m.nombre} value={m.nombre}>{mesaLabel(m.nombre)}</option>
      ))}
    </select>
  );
}

/* ════════════════ VISTA COORDINADOR / TABLERO 360 ════════════════ */
function CoordView({ tab = "tablero" }: { tab?: "tablero" | "auditoria" }) {
  const [desde, setDesde] = useState(todayISO());
  const [hasta, setHasta] = useState(todayISO());
  const [mesa, setMesa] = useState("");
  const [kpis, setKpis] = useState<any>(null);
  const [kpisPrev, setKpisPrev] = useState<any>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [tend, setTend] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [topCasos, setTopCasos] = useState<any[]>([]);
  const [resolucion, setResolucion] = useState<any[]>([]);
  const [gestDia, setGestDia] = useState<any[]>([]);
  const [equipo, setEquipo] = useState<any[]>([]);
  const [metas, setMetas] = useState<Record<string, number>>({});
  const [persona, setPersona] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    data.getUsuarios().then((l) => setEquipo(l.filter((u: any) => u.rol === "agente" || u.rol === "senior")));
    data.getMetas().then(setMetas).catch(() => {});
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      const p = persona || null;
      try {
        const m = mesa || null;
        const [pDesde, pHasta] = rangoAnterior(desde, hasta);
        const [k, kp, rk, r, t, te, cl, tc, rs, gd] = await Promise.all([
          data.gKpis(desde, hasta, p, m), data.gKpis(pDesde, pHasta, p, m),
          data.gRanking(desde, hasta, m), data.gPorRol(desde, hasta, m),
          data.gPorTipo(desde, hasta, p, m), data.gTendenciaKpi(desde, hasta, p, m), data.gPorCliente(desde, hasta, p, m),
          data.gTopCasos(desde, hasta, p, m), data.eResolucion(desde, hasta, m), data.getGestionesDia(),
        ]);
        if (!vivo) return;
        setKpis(k); setKpisPrev(kp); setRanking(rk); setRoles(r); setTipos(t); setTend(te); setClientes(cl); setTopCasos(tc); setResolucion(rs); setGestDia(gd);
      } finally { if (vivo) setLoading(false); }
    })();
    return () => { vivo = false; };
  }, [desde, hasta, persona, mesa]);

  // Semáforo de metas: promedio de gestiones/día del periodo vs la meta de la mesa.
  const diasPeriodo = Math.max(1, Math.round((new Date(hasta + "T12:00:00").getTime() - new Date(desde + "T12:00:00").getTime()) / 864e5) + 1);
  const mesaDe = (userId: string) => equipo.find((u: any) => u.id === userId)?.mesa as string | undefined;
  const metaChip = (r: any) => {
    const meta = metas[mesa || mesaDe(r.user_id) || ""] ?? 0;
    if (!meta) return <span className="faint">—</span>;
    const prom = r.gestiones / diasPeriodo;
    const cls = prom >= meta ? "done" : prom >= meta * 0.7 ? "medio" : "alto";
    return <span className={"chip " + cls}>{prom.toFixed(1)}/{meta}</span>;
  };

  const porTipo = tipos.map((t) => ({ nombre: t.nombre.length > 22 ? t.nombre.slice(0, 20) + "…" : t.nombre, n: t.total, color: CATS[t.categoria as Categoria].color })).slice(0, 8);
  const tline = tend.map((d) => ({ dia: fmtFecha(d.dia), efectividad: d.efectividad, productividad: d.productividad, gestiones: d.gestiones }));
  const roleData = roles.map((r) => ({ rol: r.rol, efectividad: r.efectividad ?? 0, carga: r.carga ?? 0 }));
  const maxCli = Math.max(1, ...clientes.map((c) => c.minutos));
  const maxCaso = Math.max(1, ...topCasos.map((c) => c.minutos));

  const exportar = () => exportarExcel(`Pulso_${desde}_a_${hasta}`, [
    { nombre: "Resumen", filas: kpis ? [{ Desde: desde, Hasta: hasta, "Efectividad %": kpis.efectividad, "Productividad %": kpis.productividad, Gestiones: kpis.gestiones, "Tiempo (h)": +(kpis.minutos / 60).toFixed(1), Asignados: kpis.asignados, Gestionados: kpis.gestionados, Alertas: kpis.alertas }] : [] },
    { nombre: "Ranking", filas: ranking.map((r) => ({ Persona: firstLast(r.nombre, r.apellido), Cargo: r.cargo, Gestiones: r.gestiones, "Tiempo (h)": +(r.minutos / 60).toFixed(1), "Efectividad %": r.efectividad, "Carga %": r.carga })) },
    { nombre: "Por tipo", filas: tipos.map((t) => ({ Gestión: t.nombre, Cantidad: t.total, "Tiempo (h)": +(t.minutos / 60).toFixed(1) })) },
    { nombre: "Clientes", filas: clientes.map((c) => ({ Cliente: c.cliente, Casos: c.casos, Gestiones: c.gestiones, "Tiempo (h)": +(c.minutos / 60).toFixed(1) })) },
    { nombre: "Top casos", filas: topCasos.map((c) => ({ Caso: c.numero_caso, Cliente: c.cliente ?? "", Gestiones: c.gestiones, Personas: c.personas, "Días": c.dias, "Tiempo (h)": +(c.minutos / 60).toFixed(1) })) },
    { nombre: "Tendencia", filas: tend.map((d) => ({ "Día": d.dia, "Efectividad %": d.efectividad ?? "", "Productividad %": d.productividad ?? "", Gestiones: d.gestiones, "Tiempo (h)": +(d.minutos / 60).toFixed(1) })) },
  ]);

  if (tab === "auditoria") {
    return (
      <>
        <div className="row-between end"><div><div className="eyebrow">Coordinación · Help Desk</div><div className="h1">Auditoría de gestiones</div></div></div>
        <AuditTable gestiones={gestDia} />
      </>
    );
  }

  return (
    <div id="reporte">
      <div className="row-between end">
        <div><div className="eyebrow">Coordinación · Help Desk</div><div className="h1">Tablero de operación</div></div>
        <div className="toolbar no-print">
          <MesaSelector mesa={mesa} setMesa={setMesa} />
          <select className="inp dateinp" value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">Todo el equipo</option>
            {equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre} {u.apellido}</option>)}
          </select>
          <RangoFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
          <button className="btn ghost sm" onClick={exportar}><Download size={14} />Excel</button>
          <button className="btn ghost sm" onClick={() => window.print()}><Printer size={14} />PDF</button>
        </div>
      </div>
      <div className="rango-print"><span className="sub small">Periodo: {fmtFecha(desde)} → {fmtFecha(hasta)}{persona ? " · " + (equipo.find((u) => u.id === persona)?.nombre ?? "") : ""}</span></div>

      {loading ? <div className="card mt20"><div className="empty">Cargando métricas…</div></div> : (
        <>
          <div className="grid six mt16">
            <Stat icon={TrendingUp} value={(kpis?.efectividad ?? 0) + "%"} label="Efectividad" color="#0098D6" pct={kpis?.efectividad ?? 0}
              {...calcDelta(kpis?.efectividad, kpisPrev?.efectividad, "%")} />
            <Stat icon={Activity} value={(kpis?.productividad ?? "—") + (kpis?.productividad != null ? "%" : "")} label="Productividad" color="#6D5AE6" pct={kpis?.productividad ?? 0}
              {...calcDelta(kpis?.productividad, kpisPrev?.productividad, "%")} />
            <Stat icon={Check} value={`${kpis?.gestionados ?? 0}/${kpis?.asignados ?? 0}`} label="Casos hechos / asignados" color="#26B07A" pct={kpis?.asignados ? (kpis.gestionados / kpis.asignados) * 100 : 0}
              {...calcDelta(kpis?.gestionados, kpisPrev?.gestionados)} />
            <Stat icon={Inbox} value={kpis?.gestiones ?? 0} label="Gestiones totales" color="#14B8C4"
              {...calcDelta(kpis?.gestiones, kpisPrev?.gestiones)} />
            <Stat icon={Clock} value={horas(kpis?.minutos ?? 0)} label="Tiempo registrado" color="#D858A0"
              {...calcDelta(kpis?.minutos != null ? kpis.minutos / 60 : null, kpisPrev?.minutos != null ? kpisPrev.minutos / 60 : null, "h")} />
            <Stat icon={AlertTriangle} value={kpis?.alertas ?? 0} label="Alertas de auditoría" color="#F2A33C"
              {...calcDelta(kpis?.alertas, kpisPrev?.alertas, "", true)} />
          </div>
          <div className="sub tiny mt6 no-print">Comparado contra el periodo anterior del mismo tamaño ({diasPeriodo === 1 ? "ayer" : `${diasPeriodo} días previos`}).</div>

          <div className="card mt15">
            <div className="row-between mb12"><div><div className="h2">Ranking del equipo</div><div className="sub small">Comparación por persona en el periodo. Ordenado por tiempo trabajado.</div></div></div>
            <div className="tblscroll">
              <table className="tbl">
                <thead><tr><th>#</th><th>Persona</th><th>Cargo</th><th>Gestiones</th><th>Tiempo</th><th>Efectividad</th><th>Carga</th><th title="Promedio de gestiones/día vs la meta de su mesa">Meta</th></tr></thead>
                <tbody>
                  {ranking.filter((r) => (persona ? r.user_id === persona : (r.gestiones > 0 || r.asignados > 0))).map((r, i) => (
                    <tr key={r.user_id}>
                      <td className="mono soft">{i + 1}</td>
                      <td className="bold"><PersonaLink id={r.user_id} nombre={firstLast(r.nombre, r.apellido)} /></td>
                      <td><span className="chip neutral">{r.cargo}</span></td>
                      <td className="mono">{r.gestiones}</td>
                      <td className="mono bold">{horas(r.minutos)}</td>
                      <td className="mono">{r.efectividad != null ? r.efectividad + "%" : "—"}</td>
                      <td>{r.carga != null ? <span className={"chip " + (r.carga >= 90 ? "alto" : r.carga >= 35 ? "bajo" : "sin")}>{r.carga}%</span> : <span className="faint">—</span>}</td>
                      <td>{metaChip(r)}</td>
                    </tr>
                  ))}
                  {ranking.every((r) => !r.gestiones && !r.asignados) && <tr><td colSpan={8}><div className="empty pad24">Sin actividad en el periodo seleccionado.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid two mt15">
            <div className="card">
              <div className="h2 mb4">Efectividad y carga por rol</div>
              <div className="sub small mb10">¿Quién rinde más y quién está más cargado: agentes, juniors o analistas?</div>
              <div className="legend"><span className="legdot"><i style={{ background: "#0098D6" }} />Efectividad</span><span className="legdot"><i style={{ background: "#F2A33C" }} />Carga</span></div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={roleData} margin={{ left: -16 }}>
                  <CartesianGrid vertical={false} stroke="#EEF1F6" />
                  <XAxis dataKey="rol" tick={{ fontSize: 11, fill: "#5C6883" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} />
                  <Bar dataKey="efectividad" name="Efectividad" fill="#0098D6" radius={[5, 5, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="carga" name="Carga" fill="#F2A33C" radius={[5, 5, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="h2 mb4">Gestiones por tipo</div>
              <div className="sub small mb10">En qué se está yendo el trabajo del equipo.</div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={porTipo} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid horizontal={false} stroke="#EEF1F6" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="nombre" width={140} tick={{ fontSize: 10.5, fill: "#5C6883" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} />
                  <Bar dataKey="n" name="Gestiones" radius={[0, 5, 5, 0]} maxBarSize={18}>{porTipo.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card mt15">
            <div className="h2 mb4">Efectividad y productividad diarias</div>
            <div className="sub small mb10">Los mismos indicadores del encabezado, día a día: casos gestionados sobre asignados, y tiempo registrado sobre el disponible del turno.</div>
            <div className="legend"><span className="legdot"><i style={{ background: "#0098D6" }} />Efectividad</span><span className="legdot"><i style={{ background: "#6D5AE6" }} />Productividad</span></div>
            <SerieDiaria data={tline} series={SERIES_EFPROD} unit="%" domain={[0, 100]} />
            <div className="sub tiny mt6">Los días sin asignaciones o sin horario cargado no puntúan ni a favor ni en contra.</div>
          </div>

          <div className="grid two mt15">
            <div className="card">
              <div className="h2 mb4">Top clientes por tiempo <span className="sfbadge">Salesforce</span></div>
              <div className="sub small mb12">¿Con qué cliente nos demoramos más?</div>
              {clientes.length === 0 ? <div className="empty pad24">Sin casos enriquecidos con Salesforce todavía.</div> :
                <div className="col9">
                  {clientes.slice(0, 8).map((c, i) => (
                    <div key={i}>
                      <div className="row-between mb5"><span className="pname">{c.cliente}</span><span className="mono soft s12">{horas(c.minutos)} · {c.casos} casos</span></div>
                      <div className="prog"><div className="progfill" style={{ width: (c.minutos / maxCli) * 100 + "%", background: "var(--primary)" }} /></div>
                    </div>
                  ))}
                </div>}
            </div>
            <div className="card">
              <div className="h2 mb4">Casos que más tiempo consumen</div>
              <div className="sub small mb12">Reincidencia: casos puntuales que acumulan horas — candidatos a revisar o escalar.</div>
              {topCasos.length === 0 ? <div className="empty pad24">Sin gestiones en el periodo.</div> :
                <div className="col9">
                  {topCasos.slice(0, 8).map((c: any) => (
                    <div key={c.numero_caso}>
                      <div className="row-between mb5">
                        <span className="pname">#{c.numero_caso}{c.cliente && <span className="faint"> · {c.cliente}</span>}</span>
                        <span className="mono soft s12">{horas(c.minutos)} · {c.gestiones} gest. · {c.dias} {c.dias === 1 ? "día" : "días"}</span>
                      </div>
                      <div className="prog"><div className="progfill" style={{ width: (c.minutos / maxCaso) * 100 + "%", background: "#14B8C4" }} /></div>
                    </div>
                  ))}
                </div>}
            </div>
          </div>

          <div className="card mt15">
            <div className="h2 mb4">Tiempo de resolución por cliente <span className="sfbadge">Salesforce</span></div>
            <div className="sub small mb10">Días entre la asignación del caso y su último registro de gestión al cerrarlo. El dato que le puedes reportar a ETB.</div>
            {resolucion.length === 0 ? <div className="empty pad24">Sin casos cerrados en el periodo.</div> :
              <div className="tblscroll">
                <table className="tbl">
                  <thead><tr><th>Cliente</th><th>Casos cerrados</th><th>Promedio (días)</th><th>Máximo (días)</th></tr></thead>
                  <tbody>
                    {resolucion.map((r: any, i: number) => (
                      <tr key={i}>
                        <td className="bold s12">{r.cliente}</td>
                        <td className="mono">{r.casos}</td>
                        <td className="mono bold">{r.prom_dias}</td>
                        <td className="mono">{r.max_dias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════ RESUMEN EJECUTIVO (para dirección) ════════════════ */
function ResumenView() {
  const [desde, setDesde] = useState(todayISO());
  const [hasta, setHasta] = useState(todayISO());
  const [mesa, setMesa] = useState("");
  const [kpis, setKpis] = useState<any>(null);
  const [kpisPrev, setKpisPrev] = useState<any>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [tend, setTend] = useState<any[]>([]);
  const [resolucion, setResolucion] = useState<any[]>([]);
  const [porMesa, setPorMesa] = useState<any[]>([]);
  const [porMes, setPorMes] = useState<any[]>([]);
  const [cfg, setCfg] = useState<any>({ meta_efectividad: 85, meta_productividad: 80 });
  const [equipo, setEquipo] = useState<any[]>([]);
  const [persona, setPersona] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    data.getUsuarios().then((l) => setEquipo(l.filter((u: any) => u.rol === "agente" || u.rol === "senior")));
    data.getConfigOperacion().then(setCfg).catch(() => {});
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      const p = persona || null;
      const m = mesa || null;
      try {
        const [pDesde, pHasta] = rangoAnterior(desde, hasta);
        // Comportamiento mensual: 6 meses hasta el mes de "hasta".
        const mesDesde = new Date(hasta + "T12:00:00Z"); mesDesde.setUTCDate(1); mesDesde.setUTCMonth(mesDesde.getUTCMonth() - 5);
        const [k, kp, rk, cl, tp, te, rs, mm, mesas] = await Promise.all([
          data.gKpis(desde, hasta, p, m), data.gKpis(pDesde, pHasta, p, m),
          data.gRanking(desde, hasta, m), data.gPorCliente(desde, hasta, p, m), data.gPorTipo(desde, hasta, p, m),
          data.gTendenciaKpi(desde, hasta, p, m), data.eResolucion(desde, hasta, m),
          data.gPorMes(mesDesde.toISOString().slice(0, 10), hasta, m).catch(() => []),
          data.getMesas().catch(() => []),
        ]);
        if (!vivo) return;
        setKpis(k); setKpisPrev(kp); setRanking(rk); setClientes(cl); setTipos(tp); setTend(te); setResolucion(rs); setPorMes(mm);
        // Comparativo entre segmentos (todos los grupos, aunque haya una mesa
        // seleccionada; solo se omite al filtrar por una persona puntual).
        const visibles = (mesas as any[]).filter((x: any) => !x.oculta);
        if (!p && visibles.length > 1) {
          const grupos = [...new Set(visibles.map((x: any) => x.grupo || x.nombre))];
          const kpisG = await Promise.all(grupos.map((g) => data.gKpis(desde, hasta, null, g).catch(() => null)));
          if (!vivo) return;
          setPorMesa(grupos.map((g, i) => ({
            grupo: g,
            mesa: mesaLabel(g),
            efectividad: kpisG[i]?.efectividad ?? 0,
            productividad: kpisG[i]?.productividad ?? 0,
            gestiones: kpisG[i]?.gestiones ?? 0,
            gestionados: kpisG[i]?.gestionados ?? 0,
            asignados: kpisG[i]?.asignados ?? 0,
            personas: kpisG[i]?.personas ?? 0,
            minutos: kpisG[i]?.minutos ?? 0,
            alertas: kpisG[i]?.alertas ?? 0,
          })).filter((x) => x.gestiones > 0 || x.efectividad > 0 || x.asignados > 0));
        } else setPorMesa([]);
      } finally { if (vivo) setLoading(false); }
    })();
    return () => { vivo = false; };
  }, [desde, hasta, persona, mesa]);

  const top = [...ranking].filter((r) => (persona ? r.user_id === persona : r.gestiones > 0)).slice(0, 3);
  const topCliente = clientes[0];
  const topTipo = tipos[0];
  const tline = tend.map((d) => ({ dia: fmtFecha(d.dia), efectividad: d.efectividad, productividad: d.productividad }));
  const porTipo = tipos.slice(0, 8).map((t: any) => ({
    nombre: t.nombre.length > 20 ? t.nombre.slice(0, 18) + "…" : t.nombre,
    horas: +(t.minutos / 60).toFixed(1), color: CATS[t.categoria as Categoria]?.color ?? "#0098D6",
  }));
  const topClientes = clientes.slice(0, 6);
  const maxCliR = Math.max(1, ...topClientes.map((c: any) => c.minutos));

  return (
    <div id="reporte">
      <div className="row-between end">
        <div><div className="eyebrow">Resumen ejecutivo · Group COS para ETB</div><div className="h1">Operación Help Desk</div></div>
        <div className="toolbar no-print">
          <MesaSelector mesa={mesa} setMesa={setMesa} />
          <select className="inp dateinp" value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">Todo el equipo</option>
            {equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre} {u.apellido}</option>)}
          </select>
          <RangoFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
          <button className="btn primary sm" onClick={() => window.print()}><Printer size={14} />Exportar PDF</button>
        </div>
      </div>
      <div className="rango-print"><span className="sub small">Periodo: {fmtFecha(desde)} → {fmtFecha(hasta)}{persona ? " · " + (equipo.find((u) => u.id === persona)?.nombre ?? "") : ""}</span></div>

      {loading ? <div className="card mt20"><div className="empty">Preparando resumen…</div></div> : (
        <>
          <div className="bandlbl mt16">Indicadores de gestión</div>
          <div className="grid six mt8">
            <KpiBI icon={TrendingUp} value={(kpis?.efectividad ?? 0) + "%"} label="Efectividad" color="#0098D6"
              meta={(cfg.meta_efectividad ?? 85) + "%"} cumple={(kpis?.efectividad ?? 0) >= (cfg.meta_efectividad ?? 85)}
              {...calcDelta(kpis?.efectividad, kpisPrev?.efectividad, "%")} />
            <KpiBI icon={Activity} value={(kpis?.productividad ?? "—") + (kpis?.productividad != null ? "%" : "")} label="Productividad" color="#6D5AE6"
              meta={(cfg.meta_productividad ?? 80) + "%"} cumple={(kpis?.productividad ?? 0) >= (cfg.meta_productividad ?? 80)}
              {...calcDelta(kpis?.productividad, kpisPrev?.productividad, "%")} />
            <KpiBI icon={Check} value={`${kpis?.gestionados ?? 0}/${kpis?.asignados ?? 0}`} label="Casos hechos / asignados" color="#2BA36F"
              {...calcDelta(kpis?.gestionados, kpisPrev?.gestionados)} />
            <KpiBI icon={Inbox} value={kpis?.gestiones ?? 0} label="Gestiones realizadas" color="#26B07A"
              {...calcDelta(kpis?.gestiones, kpisPrev?.gestiones)} />
            <KpiBI icon={Clock} value={horas(kpis?.minutos ?? 0)} label="Tiempo productivo" color="#14B8C4"
              {...calcDelta(kpis?.minutos != null ? kpis.minutos / 60 : null, kpisPrev?.minutos != null ? kpisPrev.minutos / 60 : null, "h")} />
            <KpiBI icon={AlertTriangle} value={kpis?.alertas ?? 0} label="Alertas de auditoría" color="#F2A33C"
              {...calcDelta(kpis?.alertas, kpisPrev?.alertas, "", true)} />
          </div>

          {porMes.length > 1 && (
            <>
              <div className="bandlbl mt16">Comportamiento mensual</div>
              <div className="grid two mt8">
                <div className="card">
                  <div className="h2 mb4">Casos cerrados por mes</div>
                  <div className="sub small mb10">Tendencia de cierres en los últimos meses.</div>
                  <ResponsiveContainer width="100%" height={210}>
                    <AreaChart data={porMes.map((x: any) => ({ mes: x.mes, casos: x.casos_cerrados }))} margin={{ left: -18 }}>
                      <defs><linearGradient id="gradMes" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0098D6" stopOpacity={0.28} /><stop offset="100%" stopColor="#0098D6" stopOpacity={0.02} /></linearGradient></defs>
                      <CartesianGrid vertical={false} stroke="#EEF1F6" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#5C6883" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} />
                      <Area type="monotone" dataKey="casos" name="Casos cerrados" stroke="#0098D6" strokeWidth={2.5} fill="url(#gradMes)" dot={{ r: 3, fill: "#0098D6" }} activeDot={{ r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <div className="h2 mb4">Efectividad y productividad por mes</div>
                  <div className="sub small mb10">Evolución de los dos indicadores clave.</div>
                  <div className="legend"><span className="legdot"><i style={{ background: "#0098D6" }} />Efectividad</span><span className="legdot"><i style={{ background: "#6D5AE6" }} />Productividad</span></div>
                  <ResponsiveContainer width="100%" height={210}>
                    <LineChart data={porMes.map((x: any) => ({ mes: x.mes, efectividad: x.efectividad, productividad: x.productividad }))} margin={{ left: -18 }}>
                      <CartesianGrid vertical={false} stroke="#EEF1F6" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#5C6883" }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} formatter={(v: any) => (v != null ? v + "%" : "—")} />
                      <Line type="monotone" dataKey="efectividad" name="Efectividad" stroke="#0098D6" strokeWidth={2.5} dot={{ r: 2, fill: "#0098D6" }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="productividad" name="Productividad" stroke="#6D5AE6" strokeWidth={2.5} dot={{ r: 2, fill: "#6D5AE6" }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {porMesa.length > 1 && (
            <>
              <div className="bandlbl mt16">Comparativo entre segmentos</div>
              <div className="card mt8">
                <div className="h2 mb4">Efectividad y productividad por segmento</div>
                <div className="sub small mb10">Cada mesa o grupo en el periodo{mesa ? " · resaltado el segmento seleccionado" : ""}.</div>
                <div className="legend"><span className="legdot"><i style={{ background: "#0098D6" }} />Efectividad</span><span className="legdot"><i style={{ background: "#6D5AE6" }} />Productividad</span></div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={porMesa} margin={{ left: -16 }}>
                    <CartesianGrid vertical={false} stroke="#EEF1F6" />
                    <XAxis dataKey="mesa" tick={{ fontSize: 11, fill: "#5C6883" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} />
                    <Bar dataKey="efectividad" name="Efectividad" fill="#0098D6" radius={[5, 5, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="productividad" name="Productividad" fill="#6D5AE6" radius={[5, 5, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card nopad mt15">
                <div className="tblscroll">
                  <table className="tbl">
                    <thead><tr><th>Segmento</th><th>Efectividad</th><th>Productividad</th><th>Gestiones</th><th>Hechos / Asig.</th><th>Personas</th><th>Tiempo</th><th>Alertas</th></tr></thead>
                    <tbody>
                      {[...porMesa].sort((a: any, b: any) => (b.productividad ?? 0) - (a.productividad ?? 0)).map((s: any) => {
                        const sel = !!mesa && s.grupo === mesa;
                        const chipEf = s.efectividad >= (cfg.meta_efectividad ?? 85) ? "done" : s.efectividad >= 50 ? "medio" : "alto";
                        const chipPr = s.productividad >= (cfg.meta_productividad ?? 80) ? "done" : s.productividad >= 50 ? "medio" : "alto";
                        return (
                          <tr key={s.grupo} style={sel ? { background: "rgba(0,152,214,0.08)" } : undefined}>
                            <td className="bold">{s.mesa}{sel && <span className="chip bajo s11" style={{ marginLeft: 6 }}>Seleccionado</span>}</td>
                            <td><span className={"chip " + chipEf + " s11"}>{s.efectividad}%</span></td>
                            <td><span className={"chip " + chipPr + " s11"}>{s.productividad}%</span></td>
                            <td className="mono">{s.gestiones}</td>
                            <td className="mono">{s.gestionados}/{s.asignados}</td>
                            <td className="mono">{s.personas}</td>
                            <td className="mono">{horas(s.minutos)}</td>
                            <td>{s.alertas > 0 ? <span className="chip alto s11">{s.alertas}</span> : <span className="faint">0</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {tline.length > 0 && (
            <div className="card mt15">
              <div className="h2 mb4">Evolución del periodo</div>
              <div className="sub small mb10">Efectividad y productividad diarias.</div>
              <div className="legend"><span className="legdot"><i style={{ background: "#0098D6" }} />Efectividad</span><span className="legdot"><i style={{ background: "#6D5AE6" }} />Productividad</span></div>
              <SerieDiaria data={tline} series={SERIES_EFPROD} unit="%" domain={[0, 100]} height={200} />
            </div>
          )}

          <div className="grid three mt15">
            <div className="card">
              <div className="eyebrow mb12">Top desempeño</div>
              {top.length === 0 ? <div className="sub">Sin datos.</div> : top.map((r, i) => (
                <div key={r.user_id} className="podio">
                  <span className={"podionum p" + i}>{i + 1}</span>
                  <div className="grow"><div className="pname"><PersonaLink id={r.user_id} nombre={firstLast(r.nombre, r.apellido)} /></div><div className="sub tiny">{r.cargo}</div></div>
                  <div className="mono bold primary">{horas(r.minutos)}</div>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="eyebrow mb12">Cliente que más demanda <span className="sfbadge">SF</span></div>
              {topCliente ? <><div className="bignum">{topCliente.cliente}</div><div className="sub">{horas(topCliente.minutos)} en {topCliente.casos} caso(s)</div></> : <div className="sub">Sin datos de Salesforce.</div>}
            </div>
            <div className="card">
              <div className="eyebrow mb12">Gestión más frecuente</div>
              {topTipo ? <><div className="bignum">{topTipo.nombre}</div><div className="sub">{topTipo.total} veces · {horas(topTipo.minutos)}</div></> : <div className="sub">Sin datos.</div>}
            </div>
          </div>

          <div className="bandlbl mt16">Análisis operativo</div>
          <div className="grid two mt8">
            <div className="card">
              <div className="h2 mb4">En qué se va el trabajo</div>
              <div className="sub small mb10">Horas por tipo de gestión en el periodo.</div>
              {porTipo.length === 0 ? <div className="empty pad24">Sin gestiones en el periodo.</div> :
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={porTipo} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid horizontal={false} stroke="#EEF1F6" />
                    <XAxis type="number" unit="h" tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 10.5, fill: "#5C6883" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} formatter={(v: any) => v + "h"} />
                    <Bar dataKey="horas" name="Horas" radius={[0, 5, 5, 0]} maxBarSize={18}>
                      {porTipo.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>}
            </div>
            <div className="card">
              <div className="h2 mb4">Top clientes por tiempo <span className="sfbadge">SF</span></div>
              <div className="sub small mb10">¿Con qué cliente nos demoramos más?</div>
              {topClientes.length === 0 ? <div className="empty pad24">Sin casos enriquecidos con Salesforce.</div> :
                <div className="col9">
                  {topClientes.map((c: any, i: number) => (
                    <div key={i}>
                      <div className="row-between mb5"><span className="pname">{c.cliente}</span><span className="mono soft s12">{horas(c.minutos)} · {c.casos} caso(s)</span></div>
                      <div className="prog"><div className="progfill" style={{ width: (c.minutos / maxCliR) * 100 + "%", background: "var(--primary)" }} /></div>
                    </div>
                  ))}
                </div>}
            </div>
          </div>

          {resolucion.length > 0 && (
            <div className="card mt15">
              <div className="eyebrow mb12">Tiempo de resolución por cliente</div>
              <div className="tblscroll">
                <table className="tbl">
                  <thead><tr><th>Cliente</th><th>Casos cerrados</th><th>Promedio (días)</th><th>Máximo (días)</th></tr></thead>
                  <tbody>
                    {resolucion.slice(0, 6).map((r: any, i: number) => (
                      <tr key={i}>
                        <td className="bold s12">{r.cliente}</td>
                        <td className="mono">{r.casos}</td>
                        <td className="mono bold">{r.prom_dias}</td>
                        <td className="mono">{r.max_dias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {top.length > 0 && !persona && (
            <div className="card mt15">
              <div className="h2 mb4">Detalle por analista</div>
              <div className="sub small mb10">Rendimiento individual en el periodo, ordenado por tiempo trabajado.</div>
              <div className="tblscroll">
                <table className="tbl">
                  <thead><tr><th>#</th><th>Analista</th><th>Cargo</th><th>Gestiones</th><th>Tiempo</th><th>Efectividad</th></tr></thead>
                  <tbody>
                    {ranking.filter((r) => r.gestiones > 0 || r.asignados > 0).slice(0, 15).map((r, i) => (
                      <tr key={r.user_id}>
                        <td className="mono soft">{i + 1}</td>
                        <td className="bold"><PersonaLink id={r.user_id} nombre={firstLast(r.nombre, r.apellido)} /></td>
                        <td><span className="chip neutral s11">{r.cargo}</span></td>
                        <td className="mono">{r.gestiones}</td>
                        <td className="mono bold">{horas(r.minutos)}</td>
                        <td className="mono">{r.efectividad != null ? r.efectividad + "%" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card mt15">
            <div className="eyebrow mb12">Cumplimiento de la bandeja</div>
            <div className="row-between mb6"><span className="sub">Casos gestionados de los asignados</span><span className="mono bold">{kpis?.gestionados ?? 0} / {kpis?.asignados ?? 0}</span></div>
            <div className="prog big"><div className="progfill" style={{ width: (kpis?.asignados ? (kpis.gestionados / kpis.asignados) * 100 : 0) + "%", background: "var(--ok)" }} /></div>
            <div className="sub tiny mt8">Generado por Pulso · Group COS — {new Date().toLocaleDateString("es-CO")}</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════ BANDEJA DEL EQUIPO (admin) ════════════════ */
const ESTADO_META: Record<string, { label: string; chip: string }> = {
  pendiente:  { label: "Pendiente",   chip: "pend" },
  progreso:   { label: "En progreso", chip: "prog" },
  gestionado: { label: "Gestionado",  chip: "done" },
};
function BandejaEquipoView() {
  const [desde, setDesde] = useState(todayISO());
  const [hasta, setHasta] = useState(todayISO());
  const [equipo, setEquipo] = useState<any[]>([]);
  const [persona, setPersona] = useState<string>("");
  const [mesa, setMesa] = useState("");
  const [filas, setFilas] = useState<any[]>([]);
  const [filtro, setFiltro] = useState<"todos" | "faltan" | "pendiente" | "progreso" | "gestionado">("faltan");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { data.getUsuarios().then((l: any[]) => setEquipo(l.filter((u) => u.rol === "agente" || u.rol === "senior"))); }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      try {
        const d = await data.getBandejaEquipo(desde, hasta, persona || null, mesa || null);
        if (vivo) setFilas(d);
      } finally { if (vivo) setLoading(false); }
    })();
    return () => { vivo = false; };
  }, [desde, hasta, persona, mesa]);

  const total = filas.length;
  const faltan = filas.filter((f) => f.estado !== "gestionado").length;
  const hechos = total - faltan;

  const rows = filas.filter((f) => {
    const okEstado =
      filtro === "todos" ? true :
      filtro === "faltan" ? f.estado !== "gestionado" :
      f.estado === filtro;
    if (!okEstado) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    const nom = f.usuario ? `${f.usuario.nombre} ${f.usuario.apellido ?? ""}`.toLowerCase() : "";
    return f.numero_caso.toLowerCase().includes(s) || nom.includes(s) || (f.cliente ?? "").toLowerCase().includes(s);
  });

  const FiltroBtn = ({ v, children }: { v: typeof filtro; children: any }) => (
    <button className={"roleopt" + (filtro === v ? " on" : "")} onClick={() => setFiltro(v)}>{children}</button>
  );

  return (
    <div>
      <div className="row-between end">
        <div><div className="eyebrow">Coordinación · Help Desk</div><div className="h1">Bandeja del equipo</div></div>
        <div className="toolbar">
          <MesaSelector mesa={mesa} setMesa={setMesa} />
          <select className="inp dateinp" value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">Todo el equipo</option>
            {equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre} {u.apellido}</option>)}
          </select>
          <RangoFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
        </div>
      </div>
      <div className="sub small mt3">Periodo: {fmtFecha(desde)} → {fmtFecha(hasta)}{persona ? " · " + (equipo.find((u) => u.id === persona)?.nombre ?? "") : ""}</div>

      <div className="grid three mt16">
        <div className="card"><div className="eyebrow mb6">Casos asignados</div><div className="bignum">{total}</div></div>
        <div className="card"><div className="eyebrow mb6">Faltan por gestionar</div><div className="bignum" style={{ color: "var(--warn)" }}>{faltan}</div></div>
        <div className="card"><div className="eyebrow mb6">Gestionados</div><div className="bignum" style={{ color: "var(--ok)" }}>{hechos}</div></div>
      </div>

      <div className="card nopad mt15">
        <div className="tblhead">
          <div className="rolepick">
            <FiltroBtn v="todos">Todos</FiltroBtn>
            <FiltroBtn v="faltan">Faltan</FiltroBtn>
            <FiltroBtn v="pendiente">Pendiente</FiltroBtn>
            <FiltroBtn v="progreso">En progreso</FiltroBtn>
            <FiltroBtn v="gestionado">Gestionado</FiltroBtn>
          </div>
          <div className="searchwrap"><Search size={15} className="searchico" /><input className="inp searchinp" placeholder="Buscar caso, persona o cliente…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="tblscroll">
          <table className="tbl">
            <thead><tr><th>Caso</th><th>Cliente</th><th>Persona</th><th>Cargo</th><th>Origen</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="empty">Cargando…</div></td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7}><div className="empty">Sin casos para este filtro.</div></td></tr>}
              {!loading && rows.map((f) => {
                const em = ESTADO_META[f.estado] ?? { label: f.estado, chip: "sin" };
                return (
                  <tr key={f.id}>
                    <td className="mono s12">#{f.numero_caso.replace(/^EXT-/, "")}</td>
                    <td className="s12">{f.numero_caso.startsWith("EXT-") ? <span className="chip neutral s11">Otro segmento</span> : (f.cliente ?? <span className="faint">—</span>)}</td>
                    <td className="bold nameCell"><span className="uava xsmall">{(f.usuario?.nombre?.[0] ?? "") + (f.usuario?.apellido?.[0] ?? "")}</span><PersonaLink id={f.user_id} nombre={f.usuario ? `${f.usuario.nombre} ${f.usuario.apellido ?? ""}` : "—"} /></td>
                    <td className="s12">{f.usuario?.cargo ?? "—"}</td>
                    <td className="s12">
                      {!f.asignado_por ? <span className="faint">—</span>
                        : f.asignado_por === f.user_id ? <span className="chip neutral s11">Propio</span>
                          : f.asignador ? <span title={f.asignador.cargo ?? ""}>{firstLast(f.asignador.nombre, f.asignador.apellido)}</span>
                            : <span className="faint">—</span>}
                    </td>
                    <td className="mono s12">{fmtFecha(f.fecha)}</td>
                    <td><span className={"chip " + em.chip}>{em.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ════════════════ ESTADÍSTICAS (supervisión de tiempos y flujo) ════════════════ */
function EstadisticasView() {
  const [desde, setDesde] = useState(todayISO());
  const [hasta, setHasta] = useState(todayISO());
  const [equipo, setEquipo] = useState<any[]>([]);
  const [persona, setPersona] = useState<string>("");
  const [mesa, setMesa] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [statsPrev, setStatsPrev] = useState<any>(null);
  const [dias, setDias] = useState<any[]>([]);
  const [traspasos, setTraspasos] = useState<any[]>([]);
  const [porHora, setPorHora] = useState<any[]>([]);
  const [pausasNorma, setPausasNorma] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => { data.getUsuarios().then((l: any[]) => setEquipo(l.filter((u) => u.rol === "agente" || u.rol === "senior"))); }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      try {
        const [pDesde, pHasta] = rangoAnterior(desde, hasta);
        const [s, sp, d, t, ph, pn] = await Promise.all([
          data.eStats(desde, hasta, persona || null, mesa || null),
          data.eStats(pDesde, pHasta, persona || null, mesa || null).catch(() => null),
          data.eStatsDia(desde, hasta, persona || null, mesa || null),
          data.eTraspasos(desde, hasta, mesa || null),
          data.ePorHora(desde, hasta, persona || null, mesa || null),
          data.ePausasNorma(desde, hasta, persona || null, mesa || null),
        ]);
        if (!vivo) return;
        setStats(s); setStatsPrev(sp); setDias(d); setTraspasos(t); setPorHora(ph); setPausasNorma(pn); setErr("");
      } catch (e: any) {
        if (vivo) { setErr(e?.message ?? "Error consultando Supabase"); setStats(null); }
      } finally { if (vivo) setLoading(false); }
    })();
    return () => { vivo = false; };
  }, [desde, hasta, persona, mesa]);

  // Promedios del periodo anterior para el comparativo.
  const pdPrev = Math.max(1, statsPrev?.persona_dias ?? 0);
  const promPrev = (campo: string) => (statsPrev?.[campo] != null && statsPrev.persona_dias > 0 ? statsPrev[campo] / pdPrev : null);

  // Umbrales de pausas (configurables en Configuración → Mesas).
  const [cfg, setCfg] = useState<any>({ break_max_min: 30, almuerzo_max_min: 60 });
  useEffect(() => { data.getConfigOperacion().then(setCfg).catch(() => {}); }, []);

  // Promedios por persona-día trabajado (día con sesión o gestiones).
  const pd = Math.max(1, stats?.persona_dias ?? 0);
  const promMin = (total: number) => fmtMin(Math.round((total ?? 0) / pd));
  const aprovechamiento = stats?.minutos_app > 0 ? Math.round((100 * (stats?.minutos_pc ?? 0)) / stats.minutos_app) : null;

  // Serie diaria en horas promedio por persona conectada ese día.
  const linea = dias.map((d) => {
    const pp = d.personas || 0;
    return {
      dia: fmtFecha(d.dia),
      app: pp ? +(d.minutos_app / pp / 60).toFixed(1) : null,
      pc: pp ? +(d.minutos_pc / pp / 60).toFixed(1) : null,
      registrado: pp ? +(d.minutos_gestion / pp / 60).toFixed(1) : null,
      gestiones: pp ? +(d.gestiones / pp).toFixed(1) : null,
    };
  });

  const exportar = () => exportarExcel(`Pulso_estadisticas_${desde}_a_${hasta}`, [
    { nombre: "Resumen", filas: stats ? [{ Desde: desde, Hasta: hasta, "Prom. app/día": promMin(stats.minutos_app), "Prom. PC activo/día": promMin(stats.minutos_pc), "Aprovechamiento %": aprovechamiento ?? "", "Prom. gestiones/día": +((stats.gestiones ?? 0) / pd).toFixed(1), "Prom. registrado/día": promMin(stats.minutos_gestion), "Prom. pausas/día": promMin(stats.minutos_pausa), "Persona-días": stats.persona_dias, "Casos propios": stats.casos_propios, "Casos recibidos": stats.casos_recibidos }] : [] },
    { nombre: "Por día", filas: dias.map((d) => ({ "Día": d.dia, Personas: d.personas, "App (h)": +(d.minutos_app / 60).toFixed(1), "PC activo (h)": +(d.minutos_pc / 60).toFixed(1), Gestiones: d.gestiones, "Registrado (h)": +(d.minutos_gestion / 60).toFixed(1) })) },
    { nombre: "Flujo de casos", filas: traspasos.map((t) => ({ De: firstLast(t.de_nombre, t.de_apellido), Para: firstLast(t.para_nombre, t.para_apellido), Casos: t.casos })) },
  ]);

  return (
    <div>
      <div className="row-between end">
        <div><div className="eyebrow">Coordinación · Help Desk</div><div className="h1">Estadísticas</div></div>
        <div className="toolbar">
          <MesaSelector mesa={mesa} setMesa={setMesa} />
          <select className="inp dateinp" value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">Todo el equipo</option>
            {equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre} {u.apellido}</option>)}
          </select>
          <RangoFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
          <button className="btn ghost sm" onClick={exportar}><Download size={14} />Excel</button>
        </div>
      </div>
      <div className="sub small mt3">Promedios por persona por día trabajado. Periodo: {fmtFecha(desde)} → {fmtFecha(hasta)}{persona ? " · " + (equipo.find((u) => u.id === persona)?.nombre ?? "") : ""}</div>

      {loading ? <div className="card mt20"><div className="empty">Cargando estadísticas…</div></div> : err ? (
        <div className="card mt20"><div className="empty">
          <AlertTriangle size={28} className="dim" />
          <div><b>No se pudieron cargar las estadísticas.</b><br />
            <span className="mono s12">{err}</span><br />
            <span className="sub small">Si dice que la función no existe, re-ejecuta <b>16_estadisticas.sql</b> en Supabase → SQL Editor y recarga esta página.</span>
          </div>
        </div></div>
      ) : !stats ? <div className="card mt20"><div className="empty">Sin actividad registrada en el periodo seleccionado.</div></div> : (
        <>
          <div className="grid six mt16">
            <Stat icon={Clock} value={promMin(stats.minutos_app)} label="Tiempo en la app · prom./día" color="#0098D6"
              {...calcDelta((stats.minutos_app ?? 0) / pd, promPrev("minutos_app"), "m")} />
            <Stat icon={Activity} value={promMin(stats.minutos_pc)} label="Gestión en el PC · prom./día" color="#14B8C4"
              {...calcDelta((stats.minutos_pc ?? 0) / pd, promPrev("minutos_pc"), "m")} />
            <Stat icon={TrendingUp} value={aprovechamiento != null ? aprovechamiento + "%" : "—"} label="PC activo vs tiempo en app" color="#6D5AE6" pct={aprovechamiento ?? 0}
              {...calcDelta(aprovechamiento, statsPrev?.minutos_app > 0 ? Math.round((100 * (statsPrev?.minutos_pc ?? 0)) / statsPrev.minutos_app) : null, "%")} />
            <Stat icon={ListChecks} value={+((stats.gestiones ?? 0) / pd).toFixed(1)} label="Gestiones · prom./día" color="#26B07A"
              {...calcDelta((stats.gestiones ?? 0) / pd, promPrev("gestiones"))} />
            <Stat icon={FileText} value={promMin(stats.minutos_gestion)} label="Tiempo registrado · prom./día" color="#D858A0"
              {...calcDelta((stats.minutos_gestion ?? 0) / pd, promPrev("minutos_gestion"), "m")} />
            <Stat icon={CircleDot} value={promMin(stats.minutos_pausa)} label="Pausas · prom./día" color="#F2A33C"
              {...calcDelta((stats.minutos_pausa ?? 0) / pd, promPrev("minutos_pausa"), "m", true)} />
          </div>
          <div className="sub tiny mt6">Comparado contra el periodo anterior del mismo tamaño.</div>

          <div className="card mt15">
            <div className="h2 mb4">Tiempos por día</div>
            <div className="sub small mb10">Horas promedio por persona conectada: en la app, activa en el PC y registrada en gestiones. Las tres deberían moverse juntas — una brecha grande entre app y PC activo, o entre PC activo y registrado, es señal para revisar.</div>
            <div className="legend">
              <span className="legdot"><i style={{ background: "#0098D6" }} />En la app</span>
              <span className="legdot"><i style={{ background: "#14B8C4" }} />Activo en el PC</span>
              <span className="legdot"><i style={{ background: "#D858A0" }} />Registrado en gestiones</span>
            </div>
            <SerieDiaria data={linea} height={230} unit="h" series={[
              { key: "app", name: "En la app", color: "#0098D6" },
              { key: "pc", name: "Activo en el PC", color: "#14B8C4" },
              { key: "registrado", name: "Registrado", color: "#D858A0" },
            ]} />
          </div>

          <div className="grid two mt15">
            <div className="card">
              <div className="h2 mb4">Gestiones por día</div>
              <div className="sub small mb10">Promedio de gestiones registradas por persona conectada.</div>
              <SerieDiaria data={linea} series={[{ key: "gestiones", name: "Gestiones/persona", color: "#26B07A" }]} />
            </div>
            <div className="card">
              <div className="h2 mb4">Flujo de casos: quién asigna a quién</div>
              <div className="sub small mb10">
                Repartos y traspasos del periodo{stats.casos_propios != null && <> · <b>{stats.casos_propios}</b> casos creados por el propio analista, <b>{stats.casos_recibidos}</b> recibidos de otra persona</>}.
              </div>
              {traspasos.length === 0 ? <div className="empty pad24">Sin repartos ni traspasos en el periodo.</div> :
                <div className="tblscroll">
                  <table className="tbl">
                    <thead><tr><th>De</th><th></th><th>Para</th><th>Casos</th></tr></thead>
                    <tbody>
                      {traspasos.map((t, i) => (
                        <tr key={i}>
                          <td className="bold s12">{firstLast(t.de_nombre, t.de_apellido)}<div className="sub tiny">{t.de_cargo}</div></td>
                          <td><ArrowRight size={14} className="dim" /></td>
                          <td className="bold s12">{firstLast(t.para_nombre, t.para_apellido)}<div className="sub tiny">{t.para_cargo}</div></td>
                          <td className="mono bold">{t.casos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
            </div>
          </div>

          <div className="grid two mt15">
            <div className="card">
              <div className="h2 mb4">Gestiones por hora del día</div>
              <div className="sub small mb10">A qué horas se concentra el trabajo — los valles de media jornada que el promedio diario esconde.</div>
              {porHora.length === 0 ? <div className="empty pad24">Sin gestiones en el periodo.</div> :
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={porHora.map((h: any) => ({ hora: `${String(h.hora).padStart(2, "0")}h`, gestiones: h.gestiones }))} margin={{ left: -22 }}>
                    <CartesianGrid vertical={false} stroke="#EEF1F6" />
                    <XAxis dataKey="hora" tick={{ fontSize: 10, fill: "#5C6883" }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} />
                    <Bar dataKey="gestiones" name="Gestiones" fill="#0098D6" radius={[4, 4, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>}
            </div>
            <div className="card">
              <div className="h2 mb4">Pausas fuera de norma</div>
              <div className="sub small mb10">Breaks de más de {cfg.break_max_min} min, almuerzos de más de {cfg.almuerzo_max_min}, y frecuencia de baño. Los umbrales se editan en Configuración → Mesas.</div>
              {pausasNorma.length === 0 ? <div className="empty pad24">Sin pausas registradas en el periodo.</div> :
                <div className="tblscroll">
                  <table className="tbl">
                    <thead><tr><th>Persona</th><th>Pausas</th><th>Total</th><th>Breaks &gt;{cfg.break_max_min}m</th><th>Almuerzos &gt;{cfg.almuerzo_max_min}m</th><th>Baño</th></tr></thead>
                    <tbody>
                      {pausasNorma.map((p: any) => (
                        <tr key={p.user_id}>
                          <td className="bold s12">{firstLast(p.nombre, p.apellido)}<div className="sub tiny">{p.cargo}</div></td>
                          <td className="mono">{p.pausas}</td>
                          <td className="mono">{fmtMin(p.minutos_pausa)}</td>
                          <td>{p.breaks_largos > 0 ? <span className="chip alto">{p.breaks_largos}</span> : <span className="faint">0</span>}</td>
                          <td>{p.almuerzos_largos > 0 ? <span className="chip alto">{p.almuerzos_largos}</span> : <span className="faint">0</span>}</td>
                          <td className="mono">{p.banos > 0 ? `${p.banos} · ${fmtMin(p.minutos_bano)}` : <span className="faint">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AuditTable({ gestiones }: { gestiones: any[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<any>(null);
  const uName = (g: any) => g.usuarios ? firstLast(g.usuarios.nombre, g.usuarios.apellido) : "—";
  const rows = gestiones
    .map((g) => ({ ...g, alert: g.gestiones_catalogo && g.minutos > g.gestiones_catalogo.umbral_min * 1.8 }))
    .filter((g) => { const s = q.toLowerCase(); return !q || g.numero_caso.includes(q) || uName(g).toLowerCase().includes(s) || (g.cliente ?? "").toLowerCase().includes(s) || (g.gestiones_catalogo?.nombre ?? "").toLowerCase().includes(s); })
    .sort((a, b) => (Number(b.alert) - Number(a.alert)) || b.registrado_at.localeCompare(a.registrado_at));
  const hh = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <>
      <div className="card mt20 nopad">
        <div className="tblhead">
          <div><div className="h2">Auditoría de gestiones · hoy</div><div className="sub small">Cada gestión con su tiempo declarado. Las filas en rojo superan el tiempo típico — revísalas.</div></div>
          <div className="searchwrap"><Search size={15} className="searchico" /><input className="inp searchinp" placeholder="Buscar caso, persona, gestión…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="tblscroll">
          <table className="tbl tbl-audit">
            <colgroup>
              <col style={{ width: "17%" }} /><col style={{ width: "22%" }} /><col style={{ width: "130px" }} />
              <col /><col style={{ width: "74px" }} /><col style={{ width: "66px" }} /><col style={{ width: "108px" }} />
            </colgroup>
            <thead><tr><th>Persona</th><th>Gestión</th><th>Caso</th><th>Cliente</th><th className="num">Min.</th><th className="num">Hora</th><th></th></tr></thead>
            <tbody>
              {rows.map((g) => {
                const cat = g.gestiones_catalogo?.categoria as Categoria;
                const nomG = g.gestiones_catalogo?.nombre ?? "—";
                return (
                  <tr key={g.id} className={g.alert ? "row-alert" : ""}>
                    <td className="bold"><PersonaLink id={g.user_id} nombre={uName(g)} clip /></td>
                    <td><span className="dotname"><span className="catdot" style={{ background: cat ? CATS[cat].color : "#ccc" }} /><span className="cellclip" title={nomG}>{nomG}</span></span></td>
                    <td className="mono s12">#{g.numero_caso.replace(/^EXT-/, "")}</td>
                    <td className="s12">{g.numero_caso.startsWith("EXT-") ? <span className="chip neutral s11">Otro segmento</span> : (g.cliente ? <span className="cellclip" title={g.cliente}>{g.cliente}</span> : <span className="faint">—</span>)}</td>
                    <td className={"mono bold num " + (g.alert ? "danger" : "")}>{g.alert && <AlertTriangle size={12} className="inlineicon" />}{g.minutos}</td>
                    <td className="mono soft s12 num">{hh(g.registrado_at)}</td>
                    <td className="colacc"><button className="btn ghost sm" onClick={() => setSel(g)}>Revisar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {sel && (
        <div className="overlay" onClick={() => setSel(null)}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead"><div><div className="h2">Detalle de la gestión</div><div className="mono sub mt3">Caso #{sel.numero_caso?.replace(/^(EXT|REU)-/, "")}</div></div><button className="xbtn" onClick={() => setSel(null)}><X size={16} /></button></div>
            <div className="modalBody">
              {[["Persona", uName(sel)], ["Gestión", sel.gestiones_catalogo?.nombre ?? "—"], ["Cliente", sel.numero_caso?.startsWith("EXT-") ? "Otro segmento" : (sel.cliente ?? "—")], ["Minutos declarados", sel.minutos + " min"], ["Tiempo típico", "≈ " + (sel.gestiones_catalogo?.umbral_min ?? "—") + " min"], ["Hora", hh(sel.registrado_at)]].map(([k, v]) => (
                <div key={k} className="detrow"><span className="detk">{k}</span><span className="detv">{v}</span></div>
              ))}
              {sel.alert && <div className="warnbox"><AlertTriangle size={16} className="warnicon" /><span>El tiempo supera lo habitual para esta gestión. Puede ser legítimo (permisos, llamada con técnico) o un registro a revisar con la persona.</span></div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════ CONFIGURACIÓN (superadmin) ════════════════ */
function ConfigView({ catalogo, reloadCatalogo, fire }: { catalogo: GestionTipo[]; reloadCatalogo: () => void; fire: (m: string) => void }) {
  const [tab, setTab] = useState("gestiones");
  return (
    <>
      <div className="row-between end">
        <div><div className="eyebrow">Superadministración · Group COS</div><div className="h1">Configuración</div></div>
        <div className="rolepick">
          {[["gestiones", "Gestiones"], ["usuarios", "Usuarios"], ["mesas", "Mesas"], ["horarios", "Horarios"], ["festivos", "Festivos"]].map(([k, l]) =>
            <button key={k} className={"roleopt" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      </div>
      <div className="mt8">
        {tab === "gestiones" && <GestionConfig catalogo={catalogo} reload={reloadCatalogo} fire={fire} />}
        {tab === "usuarios" && <UserConfig fire={fire} />}
        {tab === "mesas" && <MesaConfig fire={fire} />}
        {tab === "horarios" && <><HorarioConfig /><HorarioSemana /></>}
        {tab === "festivos" && <FestivosConfig fire={fire} />}
      </div>
    </>
  );
}

// Festivos de Colombia: la base los usa para saber si un caso llegó en
// horario hábil (ver es_horario_habil() en 37_horario_no_habil.sql).
function FestivosConfig({ fire }: { fire: (m: string) => void }) {
  const [festivos, setFestivos] = useState<any[]>([]);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);
  const cargar = () => data.getFestivos().then(setFestivos).catch(() => {});
  useEffect(() => { cargar(); }, []);
  const agregar = async () => {
    if (!fecha || !nombre.trim()) return;
    setBusy(true);
    try { await data.agregarFestivo(fecha, nombre); setFecha(""); setNombre(""); fire("Festivo agregado"); cargar(); }
    catch (e: any) { fire("Error: " + (e.message ?? "no se pudo agregar")); }
    finally { setBusy(false); }
  };
  const quitar = async (f: string) => {
    if (!confirm("¿Quitar este festivo?")) return;
    try { await data.eliminarFestivo(f); fire("Festivo eliminado"); cargar(); }
    catch (e: any) { fire("Error: " + (e.message ?? "no se pudo eliminar")); }
  };
  return (
    <div className="card nopad">
      <div className="tblhead">
        <div><div className="h2">Festivos de Colombia</div><div className="sub small">Se usan para calcular el horario hábil (bolsa de casos fuera de horario). Agrega los de cada año nuevo cuando se conozcan.</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="inp" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: 160 }} />
          <input className="inp" placeholder="Nombre del festivo" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: 220 }} />
          <button className="btn primary" disabled={busy || !fecha || !nombre.trim()} onClick={agregar}><Plus size={16} />Agregar</button>
        </div>
      </div>
      <div className="tblscroll">
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>Nombre</th><th></th></tr></thead>
          <tbody>
            {festivos.map((f: any) => (
              <tr key={f.fecha}>
                <td className="mono">{new Date(f.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</td>
                <td>{f.nombre}</td>
                <td><button className="xbtn tiny" title="Quitar" onClick={() => quitar(f.fecha)}><X size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GestionConfig({ catalogo, reload, fire }: { catalogo: GestionTipo[]; reload: () => void; fire: (m: string) => void }) {
  const [modal, setModal] = useState(false);
  const [nombre, setNombre] = useState(""); const [cat, setCat] = useState<Categoria>("casos"); const [umbral, setUmbral] = useState("15");
  const toggle = async (id: string, activo: boolean) => { await data.toggleGestion(id, activo); reload(); };
  const add = async () => {
    if (!nombre.trim()) return;
    await data.agregarGestion({ nombre: nombre.toUpperCase(), categoria: cat, umbral_min: +umbral });
    setModal(false); setNombre(""); fire("Gestión agregada al catálogo"); reload();
  };
  return (
    <>
      <div className="card nopad">
        <div className="tblhead">
          <div><div className="h2">Catálogo de gestiones</div><div className="sub small">Activa, desactiva o agrega tipos. El "tiempo típico" define cuándo se marca una alerta.</div></div>
          <button className="btn primary" onClick={() => setModal(true)}><Plus size={16} />Nueva gestión</button>
        </div>
        <div className="tblscroll">
          <table className="tbl">
            <thead><tr><th>Gestión</th><th>Categoría</th><th>Tiempo típico</th><th>Estado</th></tr></thead>
            <tbody>
              {catalogo.map((g) => (
                <tr key={g.id}>
                  <td className="bold">{g.nombre}{g.senior_only && <span className="chip neutral ml8">Senior</span>}</td>
                  <td><span className="dotname"><span className="catdot" style={{ background: CATS[g.categoria].color }} />{CATS[g.categoria].label}</span></td>
                  <td className="mono">{g.umbral_min} min</td>
                  <td><button className={"chip " + (g.activo ? "done" : "neutral")} onClick={() => toggle(g.id, !g.activo)}>{g.activo ? <><Check size={11} />Activa</> : "Inactiva"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <div className="overlay" onClick={() => setModal(false)}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead"><div className="h2">Nueva gestión</div><button className="xbtn" onClick={() => setModal(false)}><X size={16} /></button></div>
            <div className="modalBody">
              <label className="lbl">Nombre</label>
              <input className="inp" value={nombre} placeholder="EJ. VALIDACIÓN DE ENLACE" onChange={(e) => setNombre(e.target.value)} />
              <div className="grid two mt12">
                <div><label className="lbl">Categoría</label>
                  <select className="inp" value={cat} onChange={(e) => setCat(e.target.value as Categoria)}>
                    {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select></div>
                <div><label className="lbl">Tiempo típico (min)</label><input className="inp mono" type="number" value={umbral} onChange={(e) => setUmbral(e.target.value)} /></div>
              </div>
              <div className="sub tiny mt8">Las categorías <b>Reuniones</b> y <b>Gestión interna</b> no piden número de caso — úsalas para evaluaciones, preturnos, capacitaciones y demás. Igual cuentan como tiempo productivo.</div>
            </div>
            <div className="modalFoot"><button className="btn ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn primary" onClick={add}>Agregar</button></div>
          </div>
        </div>
      )}
    </>
  );
}

function estadoUsuario(u: Usuario): { txt: string; cls: string } {
  if (u.bloqueado) return { txt: "Bloqueado", cls: "alto" };
  if (u.debe_cambiar_pass) return { txt: "Clave temporal", cls: "medio" };
  return { txt: "Activa", cls: "done" };
}

const CARGOS = ["Agente", "Junior", "Junior ENEL", "Junior Back", "Junior Líder", "Analista", "Analista Proyectos", "Senior", "Coordinador"];

function MesaConfig({ fire }: { fire: (m: string) => void }) {
  const [mesas, setMesas] = useState<any[]>([]);
  const [nueva, setNueva] = useState("");
  const [grupoNuevo, setGrupoNuevo] = useState("");
  const [busy, setBusy] = useState(false);
  const [metas, setMetas] = useState<Record<string, number>>({});
  const cargar = () => { data.getMesas().then(setMesas).catch(() => {}); data.getMetas().then(setMetas).catch(() => {}); };
  useEffect(() => { cargar(); }, []);
  const agregar = async () => {
    if (!nueva.trim()) return;
    setBusy(true);
    try { await data.agregarMesa(nueva, grupoNuevo.trim() || undefined); setNueva(""); setGrupoNuevo(""); fire("Mesa agregada"); cargar(); }
    catch (e: any) { fire("Error: " + (e.message ?? "no se pudo agregar")); }
    finally { setBusy(false); }
  };
  const guardarMeta = async (mesa: string, valor: string) => {
    const n = Math.max(0, parseInt(valor || "0", 10) || 0);
    setMetas((prev) => ({ ...prev, [mesa]: n }));
    try { await data.guardarMeta(mesa, n); fire(`Meta de ${mesaLabel(mesa)}: ${n} gestiones/día`); }
    catch (e: any) { fire("Error: " + (e.message ?? "no se pudo guardar")); }
  };
  const toggleReparto = async (mesa: string, valor: boolean) => {
    setMesas((prev) => prev.map((m: any) => (m.nombre === mesa ? { ...m, reparte_agente: valor } : m)));
    try { await data.guardarRepartoAgente(mesa, valor); fire(`${mesaLabel(mesa)}: reparto de agentes ${valor ? "activado" : "desactivado"}`); }
    catch (e: any) { fire("Error: " + (e.message ?? "no se pudo guardar")); cargar(); }
  };
  // Normas de pausas (umbral de break y almuerzo).
  const [cfg, setCfg] = useState<any>(null);
  useEffect(() => { data.getConfigOperacion().then(setCfg).catch(() => {}); }, []);
  const guardarNorma = async (campo: "break_max_min" | "almuerzo_max_min" | "meta_efectividad" | "meta_productividad", valor: string) => {
    const n = Math.max(0, parseInt(valor || "0", 10) || 0);
    const nuevo = { ...cfg, [campo]: n };
    setCfg(nuevo);
    try { await data.guardarConfigOperacion({ [campo]: n }); fire("Configuración actualizada"); }
    catch (e: any) { fire("Error: " + (e.message ?? "no se pudo guardar")); }
  };
  return (
    <div className="card">
      <div className="h2 mb4">Mesas del Help Desk</div>
      <div className="sub small mb12">Los contenedores de la operación (Mayoristas, Gold, Premium…). Cada usuario pertenece a una mesa; los seniors y la barra de compañeros quedan encerrados en la suya. La <b>meta</b> es el objetivo de gestiones por día por persona — alimenta el semáforo del ranking (0 = sin meta).</div>
      <div className="col9 mb12">
        {mesas.map((m: any) => (
          <div key={m.nombre} className="casecard">
            <div>
              <div className="caseno">{mesaLabel(m.nombre)}</div>
              {m.grupo && m.grupo !== m.nombre && <span className="chip neutral s11">Grupo {mesaLabel(m.grupo)}</span>}
            </div>
            <div className="gap9" style={{ alignItems: "center" }}>
              <label className="sub tiny">Meta gestiones/día</label>
              <input className="inp mono" style={{ width: 80 }} type="number" min={0}
                defaultValue={metas[m.nombre] ?? 0}
                key={m.nombre + (metas[m.nombre] ?? 0)}
                onBlur={(e) => { if (+e.target.value !== (metas[m.nombre] ?? 0)) guardarMeta(m.nombre, e.target.value); }} />
              <label className="sub tiny" style={{ marginLeft: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={m.reparte_agente === true} onChange={(e) => toggleReparto(m.nombre, e.target.checked)} />
                Agentes reparten seguimiento
              </label>
            </div>
          </div>
        ))}
      </div>
      <div className="gap9">
        <input className="inp upper" value={nueva} placeholder="NUEVA MESA (EJ. SILVER 1)" onChange={(e) => setNueva(e.target.value.toUpperCase())} />
        <input className="inp upper" style={{ maxWidth: 200 }} value={grupoNuevo} placeholder="GRUPO (EJ. SILVER)" onChange={(e) => setGrupoNuevo(e.target.value.toUpperCase())} />
        <button className="btn primary" disabled={busy || !nueva.trim()} onClick={agregar}><Plus size={16} />Agregar</button>
      </div>
      <div className="sub tiny mt8">El <b>grupo</b> une subsegmentos (ej. Premium 1..4 bajo PREMIUM): habilita el filtro "todo el grupo", el contenedor compartido y la auto-asignación de fin de semana. Si lo dejas vacío, la mesa es su propio grupo. Las mesas no se eliminan desde aquí para no dejar usuarios huérfanos.</div>

      {cfg && (
        <>
          <div className="divider" />
          <div className="h2 mb4">Normas de pausas</div>
          <div className="sub small mb10">A partir de estos minutos, la pausa cuenta como "fuera de norma" en Estadísticas.</div>
          <div className="gap9" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <label className="sub small">Break máximo (min)</label>
            <input className="inp mono" style={{ width: 80 }} type="number" min={1}
              defaultValue={cfg.break_max_min} key={"b" + cfg.break_max_min}
              onBlur={(e) => { if (+e.target.value !== cfg.break_max_min) guardarNorma("break_max_min", e.target.value); }} />
            <label className="sub small" style={{ marginLeft: 14 }}>Almuerzo máximo (min)</label>
            <input className="inp mono" style={{ width: 80 }} type="number" min={1}
              defaultValue={cfg.almuerzo_max_min} key={"a" + cfg.almuerzo_max_min}
              onBlur={(e) => { if (+e.target.value !== cfg.almuerzo_max_min) guardarNorma("almuerzo_max_min", e.target.value); }} />
          </div>
          <div className="h2 mb4 mt16">Metas del informe</div>
          <div className="sub small mb10">Objetivos que aparecen como "Meta: X%" en el Resumen ejecutivo (semáforo verde/rojo).</div>
          <div className="gap9" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <label className="sub small">Meta efectividad (%)</label>
            <input className="inp mono" style={{ width: 80 }} type="number" min={0} max={100}
              defaultValue={cfg.meta_efectividad ?? 85} key={"me" + cfg.meta_efectividad}
              onBlur={(e) => { if (+e.target.value !== cfg.meta_efectividad) guardarNorma("meta_efectividad", e.target.value); }} />
            <label className="sub small" style={{ marginLeft: 14 }}>Meta productividad (%)</label>
            <input className="inp mono" style={{ width: 80 }} type="number" min={0} max={100}
              defaultValue={cfg.meta_productividad ?? 80} key={"mp" + cfg.meta_productividad}
              onBlur={(e) => { if (+e.target.value !== cfg.meta_productividad) guardarNorma("meta_productividad", e.target.value); }} />
          </div>
        </>
      )}
    </div>
  );
}

function UserConfig({ fire }: { fire: (m: string) => void }) {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);   // usuario en edición
  const [busy, setBusy] = useState(false);
  const [mesas, setMesas] = useState<any[]>([]);
  const [f, setF] = useState<any>({ nombre: "", apellido: "", login: "", code: "", cargo: "Agente", rol: "agente", password: "Cos2026*", mesa: "MAYORISTAS", email_real: "" });
  const [masivo, setMasivo] = useState(false);
  const [pegado, setPegado] = useState("");
  const [resMasivo, setResMasivo] = useState<any[] | null>(null);
  const reload = () => data.getUsuarios().then(setUsers);
  useEffect(() => { reload(); data.getMesas().then(setMesas).catch(() => {}); }, []);

  // Carga masiva: pega filas separadas por TAB (desde Excel) o coma.
  // Columnas: Usuario, Nombre, Apellido, Cargo, Rol, Mesa, Código/Cédula, Correo
  // No recortamos la línea completa (eso borraría el primer TAB y correría las
  // columnas cuando "Usuario" viene vacío); solo saltamos líneas en blanco.
  const parseMasivo = (txt: string) => txt.split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => {
    const c = l.split(/\t|,|;/).map((x) => x.trim());
    return { login: c[0] ?? "", nombre: c[1] ?? "", apellido: c[2] ?? "", cargo: c[3] || "Agente", rol: (c[4] || "agente").toLowerCase() as Rol, mesa: (c[5] || "MAYORISTAS").toUpperCase(), code: c[6] ?? "", email_real: c[7] ?? "" };
  }).filter((r) => r.nombre || r.login);   // basta con nombre; el usuario puede autogenerarse
  const filasMasivo = parseMasivo(pegado);
  const cargarMasivo = async () => {
    if (!filasMasivo.length) { fire("Pega al menos una fila."); return; }
    setBusy(true); setResMasivo(null);
    try {
      const r = await crearUsuariosMasivo(filasMasivo);
      if (!r.ok) { fire(r.error ?? "No se pudo cargar."); return; }
      setResMasivo(r.resultados ?? []);
      const ok = (r.resultados ?? []).filter((x) => x.ok).length;
      fire(`${ok} de ${filasMasivo.length} usuarios creados`); reload();
    } catch (e: any) { fire("Error: " + (e?.message ?? "")); }
    finally { setBusy(false); }
  };

  const add = async () => {
    if (!f.nombre.trim() || !f.login.trim()) { fire("Escribe al menos nombre y usuario."); return; }
    setBusy(true);
    try {
      const r = await crearUsuario(f);
      if (!r.ok) { fire(r.error ?? "No se pudo crear el usuario."); return; }
      setModal(false); setF({ nombre: "", apellido: "", login: "", code: "", cargo: "Agente", rol: "agente", password: "Cos2026*", mesa: "MAYORISTAS", email_real: "" }); fire("Usuario creado"); reload();
    } catch (e: any) { fire("Error inesperado: " + (e?.message ?? "")); }
    finally { setBusy(false); }
  };

  const abrirEdit = (u: Usuario) => setEdit({ id: u.id, nombre: u.nombre, apellido: u.apellido ?? "", code: u.code ?? "", cargo: u.cargo ?? "Agente", rol: u.rol, mesa: u.mesa ?? "MAYORISTAS", email_real: (u as any).email_real ?? "", bloqueado: !!u.bloqueado, nuevaPass: "" });
  const guardarEdit = async () => {
    setBusy(true);
    try {
      const r = await editarUsuario(edit.id, { nombre: edit.nombre, apellido: edit.apellido, code: edit.code, cargo: edit.cargo, rol: edit.rol, mesa: edit.mesa, email_real: edit.email_real });
      if (!r.ok) { fire("Error: " + (r.error ?? "no se pudo guardar")); return; }
      setEdit(null); fire("Usuario actualizado"); reload();
    } catch (e: any) { fire("Error: " + (e.message ?? "no se pudo guardar")); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    const np = edit.nuevaPass.trim() || "Cos2026*";
    setBusy(true);
    try { await resetPassword(edit.id, np); fire(`Clave temporal puesta: ${np}. La cambiará al entrar.`); setEdit({ ...edit, nuevaPass: "" }); reload(); }
    catch (e: any) { fire("Error: " + (e.message ?? "")); }
    finally { setBusy(false); }
  };
  const toggleBloqueo = async () => {
    setBusy(true);
    try { await bloquearUsuario(edit.id, !edit.bloqueado); setEdit({ ...edit, bloqueado: !edit.bloqueado }); fire(edit.bloqueado ? "Acceso desbloqueado" : "Acceso bloqueado"); reload(); }
    catch (e: any) { fire("Error: " + (e.message ?? "")); }
    finally { setBusy(false); }
  };
  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar a ${edit.nombre} ${edit.apellido ?? ""}? Esta acción no se puede deshacer. Si tiene historial, mejor bloquéalo.`)) return;
    setBusy(true);
    try {
      const r = await eliminarUsuario(edit.id);
      if (!r.ok) { fire(r.error ?? "No se pudo eliminar."); return; }
      setEdit(null); fire("Usuario eliminado"); reload();
    } catch (e: any) { fire("Error: " + (e.message ?? "")); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="card nopad">
        <div className="tblhead">
          <div><div className="h2">Usuarios del equipo</div><div className="sub small">Crea accesos, edita rol/cargo/código, resetea claves y bloquea accesos. Las contraseñas se guardan cifradas — nadie las ve, ni tú.</div></div>
          <div className="gap9">
            <BuscaNombre value={q} setValue={setQ} placeholder="Buscar usuario…" />
            <button className="btn ghost" onClick={() => { setMasivo(true); setResMasivo(null); }}><Upload size={15} />Carga masiva</button>
            <button className="btn primary" onClick={() => setModal(true)}><Plus size={16} />Nuevo usuario</button>
          </div>
        </div>
        <div className="tblscroll">
          <table className="tbl">
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Código</th><th>Rol</th><th>Cargo</th><th>Mesa</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {users.filter((u) => matchNombre(q, u.nombre, u.apellido, u.login, u.code)).map((u) => {
                const e = estadoUsuario(u);
                return (
                  <tr key={u.id}>
                    <td className="bold nameCell"><span className="uava xsmall">{initials(u)}</span>{u.nombre} {u.apellido}</td>
                    <td className="mono s12">{u.login}</td>
                    <td className="mono s12">{u.code || <span className="faint">—</span>}</td>
                    <td><span className="chip neutral">{u.rol}</span></td>
                    <td className="s12">{u.cargo}</td>
                    <td><span className="chip bajo s11">{u.mesa ? mesaLabel(u.mesa) : "—"}</span></td>
                    <td><span className={"chip " + e.cls}>{e.txt}</span></td>
                    <td><button className="btn ghost sm" onClick={() => abrirEdit(u)}>Editar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="overlay" onClick={() => setModal(false)}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead"><div className="h2">Nuevo usuario</div><button className="xbtn" onClick={() => setModal(false)}><X size={16} /></button></div>
            <div className="modalBody">
              <div className="grid two">
                <div><label className="lbl">Nombre</label><input className="inp" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
                <div><label className="lbl">Apellido</label><input className="inp" value={f.apellido} onChange={(e) => setF({ ...f, apellido: e.target.value })} /></div>
              </div>
              <div className="grid two mt12">
                <div><label className="lbl">Usuario</label><input className="inp mono upper" value={f.login} placeholder="JDAVID" onChange={(e) => setF({ ...f, login: e.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, "") })} /></div>
                <div><label className="lbl">Código operativo</label><input className="inp mono" value={f.code} placeholder="ETBSOP236" onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
              </div>
              <div className="grid two mt12">
                <div><label className="lbl">Contraseña temporal</label><input className="inp mono" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
                <div><label className="lbl">Rol (permisos)</label>
                  <select className="inp" value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value as Rol })}>
                    {["agente", "senior", "coordinador", "superadmin"].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select></div>
              </div>
              <div className="grid two mt12">
                <div><label className="lbl">Cargo (puesto real)</label>
                  <select className="inp" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })}>
                    {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div><label className="lbl">Mesa / Segmento</label>
                  <select className="inp" value={f.mesa} onChange={(e) => setF({ ...f, mesa: e.target.value })}>
                    {mesas.map((m: any) => <option key={m.nombre} value={m.nombre}>{mesaLabel(m.nombre)}</option>)}
                  </select></div>
              </div>
              <div className="mt12">
                <label className="lbl">Correo (para restablecer contraseña)</label>
                <input className="inp" type="email" value={f.email_real} placeholder="persona@empresa.com" onChange={(e) => setF({ ...f, email_real: e.target.value })} />
              </div>
              <div className="sub tiny mt8">La contraseña temporal la cambiará la persona en su primer ingreso. El <b>código operativo</b> empareja con el Excel de horarios. La <b>mesa</b> define su contenedor: bandeja, compañeros y métricas. El <b>correo</b> permite que la persona recupere su clave sola desde la pantalla de acceso.</div>
            </div>
            <div className="modalFoot"><button className="btn ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn primary" disabled={busy} onClick={add}>{busy ? "Creando…" : "Crear usuario"}</button></div>
          </div>
        </div>
      )}

      {masivo && (
        <div className="overlay" onClick={() => setMasivo(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modalHead"><div className="h2">Carga masiva de usuarios</div><button className="xbtn" onClick={() => setMasivo(false)}><X size={16} /></button></div>
            <div className="modalBody">
              <div className="sub small mb10">
                Copia las filas desde tu Excel y pégalas aquí. Una persona por línea, columnas en este orden
                (separadas por tabulación o coma):
              </div>
              <div className="sub tiny mono mb10" style={{ background: "var(--surface-2)", padding: "8px 10px", borderRadius: 8 }}>
                Usuario · Nombre · Apellido · Cargo · Rol · Mesa · Código/Cédula · Correo
              </div>
              <div className="sub tiny mb10">
                <b>Usuario</b> puedes dejarlo vacío: se genera solo (inicial del nombre + apellido, ej. Juan Echeverri → JECHEVERRI).
                El <b>Código/Cédula</b> es lo que cruza con el Excel de horarios.
                El <b>Correo</b> (opcional) permite que la persona recupere su clave sola.
              </div>
              <textarea className="inp mono" rows={8} value={pegado} placeholder={"JDAVID\tJuan\tDavid\tAnalista\tagente\tPREMIUM 1\t1032456789\tjuan@empresa.com\nMLOPEZ\tMaría\tLópez\tSenior\tsenior\tPREMIUM 1\t52123456\tmaria@empresa.com"} onChange={(e) => setPegado(e.target.value)} />
              {filasMasivo.length > 0 && <div className="sub small mt6">{filasMasivo.length} fila(s) detectada(s). La contraseña temporal será <b>Cos2026*</b> (la cambian al entrar).</div>}
              {resMasivo && (
                <div className="mt12" style={{ maxHeight: 200, overflow: "auto" }}>
                  {resMasivo.map((r, i) => (
                    <div key={i} className="sub small" style={{ padding: "3px 0" }}>
                      {r.ok ? <span className="chip done s11">OK</span> : <span className="chip alto s11">Error</span>}{" "}
                      <b className="mono">{r.login}</b>{r.error && <span className="faint"> — {r.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modalFoot">
              <button className="btn ghost" onClick={() => setMasivo(false)}>Cerrar</button>
              <button className="btn primary" disabled={busy || !filasMasivo.length} onClick={cargarMasivo}>{busy ? "Cargando…" : `Crear ${filasMasivo.length || ""} usuario(s)`}</button>
            </div>
          </div>
        </div>
      )}

      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead"><div className="h2">Editar usuario</div><button className="xbtn" onClick={() => setEdit(null)}><X size={16} /></button></div>
            <div className="modalBody">
              <div className="grid two">
                <div><label className="lbl">Nombre</label><input className="inp" value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></div>
                <div><label className="lbl">Apellido</label><input className="inp" value={edit.apellido} onChange={(e) => setEdit({ ...edit, apellido: e.target.value })} /></div>
              </div>
              <div className="grid two mt12">
                <div><label className="lbl">Código operativo</label><input className="inp mono" value={edit.code} placeholder="ETBSOP236" onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></div>
                <div><label className="lbl">Rol (permisos)</label>
                  <select className="inp" value={edit.rol} onChange={(e) => setEdit({ ...edit, rol: e.target.value })}>
                    {["agente", "senior", "coordinador", "superadmin"].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select></div>
              </div>
              <div className="grid two mt12">
                <div><label className="lbl">Cargo (puesto real)</label>
                  <select className="inp" value={edit.cargo} onChange={(e) => setEdit({ ...edit, cargo: e.target.value })}>
                    {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div><label className="lbl">Mesa / Segmento</label>
                  <select className="inp" value={edit.mesa} onChange={(e) => setEdit({ ...edit, mesa: e.target.value })}>
                    {mesas.map((m: any) => <option key={m.nombre} value={m.nombre}>{mesaLabel(m.nombre)}</option>)}
                  </select></div>
              </div>
              <div className="mt12">
                <label className="lbl">Correo (para restablecer contraseña)</label>
                <input className="inp" type="email" value={edit.email_real} placeholder="persona@empresa.com" onChange={(e) => setEdit({ ...edit, email_real: e.target.value })} />
              </div>

              <div className="divider" />
              <label className="lbl">Seguridad</label>
              <div className="seglinea">
                <div><div className="bold s13">Resetear contraseña</div><div className="sub tiny">Le pones una clave temporal; la cambiará al entrar.</div></div>
              </div>
              <div className="grid two mt8" style={{ marginTop: 8 }}>
                <input className="inp mono" value={edit.nuevaPass} placeholder="Cos2026*" onChange={(e) => setEdit({ ...edit, nuevaPass: e.target.value })} />
                <button className="btn ghost" disabled={busy} onClick={reset}>Resetear clave</button>
              </div>
              <div className="seglinea mt12" style={{ marginTop: 12 }}>
                <div><div className="bold s13">{edit.bloqueado ? "Cuenta bloqueada" : "Acceso activo"}</div><div className="sub tiny">{edit.bloqueado ? "No puede iniciar sesión." : "Puede iniciar sesión normalmente."}</div></div>
                <button className={"btn " + (edit.bloqueado ? "primary" : "ghost")} disabled={busy} onClick={toggleBloqueo}>{edit.bloqueado ? "Desbloquear" : "Bloquear"}</button>
              </div>
              <div className="seglinea mt12" style={{ marginTop: 12 }}>
                <div><div className="bold s13" style={{ color: "var(--danger)" }}>Eliminar usuario</div><div className="sub tiny">Borra la cuenta y sus datos. Úsalo para duplicados o accesos por error. No se puede deshacer.</div></div>
                <button className="btn danger-outline" disabled={busy} onClick={eliminar}><Trash2 size={14} />Eliminar</button>
              </div>
            </div>
            <div className="modalFoot"><button className="btn ghost" onClick={() => setEdit(null)}>Cerrar</button><button className="btn primary" disabled={busy} onClick={guardarEdit}>{busy ? "Guardando…" : "Guardar cambios"}</button></div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Lector del Excel de turnos (en el navegador) ── */
const _norm = (s: any) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function _parseDur(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") { if (v > 0 && v < 1) return Math.round(v * 1440); if (v >= 1 && v <= 24) return Math.round(v * 60); return 0; }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m ? (+m[1]) * 60 + (+m[2]) : 0;
}
function _fmtHM(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "number" && v >= 0 && v < 1) { const t = Math.round(v * 1440); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}
function _turno(row: any[], thCol: number): string | null {
  const t2 = row[thCol - 2];
  if (typeof t2 === "string") { const r = t2.match(/\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/); if (r) return r[0].replace(/\s/g, ""); }
  const ent = _fmtHM(row[thCol - 3]); const sal = _fmtHM(row[thCol - 2]);
  return ent && sal ? `${ent}-${sal}` : null;
}
const _addDays = (iso: string, d: number) => { const x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const _mondayActual = () => { const d = new Date(); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return d.toISOString().slice(0, 10); };
function _findUser(login: any, nom: any, ape: any, users: Usuario[]): Usuario | null {
  const code = String(login ?? "").trim().toLowerCase();
  if (code) { const byc = users.find((u) => u.code && String(u.code).trim().toLowerCase() === code); if (byc) return byc; }
  const full = _norm(`${nom} ${ape}`);
  let u = users.find((x) => _norm(`${x.nombre} ${x.apellido}`) === full); if (u) return u;
  const exAp = _norm(ape).split(" ")[0]; const exNo = _norm(nom).split(" ")[0];
  u = users.find((x) => { const an = _norm(x.apellido).split(" ")[0]; const nn = _norm(x.nombre).split(" ")[0]; return !!an && an === exAp && (nn === exNo || exNo.startsWith(nn) || nn.startsWith(exNo)); });
  return u ?? null;
}
function _parseHoja(rows: any[][], monday: string, users: Usuario[]) {
  let hr = -1, loginCol = -1, nombreCol = -1, apellidoCol = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i]; if (!r) continue;
    const idx = r.findIndex((c) => _norm(c) === "login");
    if (idx >= 0) { hr = i; loginCol = idx; nombreCol = r.findIndex((c) => _norm(c) === "nombre"); apellidoCol = r.findIndex((c) => _norm(c) === "apellido"); break; }
  }
  if (hr < 0) throw new Error("No encontré la fila de encabezados (con 'Login'). Revisa que sea la hoja de turnos.");
  const thCols = rows[hr].map((c, i) => (_norm(c) === "th" ? i : -1)).filter((i) => i >= 0).slice(0, 7);
  if (!thCols.length) throw new Error("No encontré columnas 'th' (horas trabajadas) en esta hoja.");
  const filas: any[] = []; const matched = new Set<string>(); const sinMatch = new Set<string>();
  for (let i = hr + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const login = r[loginCol], nom = r[nombreCol], ape = r[apellidoCol];
    if (!nom && !login) continue;
    const u = _findUser(login, nom, ape, users);
    if (!u) { sinMatch.add(String(nom || login).trim()); continue; }
    thCols.forEach((tc, d) => {
      const min = _parseDur(r[tc]); if (min <= 0) return;
      filas.push({ user_id: u.id, fecha: _addDays(monday, d), turno: _turno(r, tc), almuerzo_min: 0, break_min: 15, disponible_min: min });
      matched.add(u.id);
    });
  }
  return { filas, personas: matched.size, sinMatch: [...sinMatch] };
}

function HorarioConfig() {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [filas, setFilas] = useState<any[]>([]);
  const [hojas, setHojas] = useState<string[]>([]);
  const [hoja, setHoja] = useState("");
  const [wb, setWb] = useState<any>(null);
  const [monday, setMonday] = useState(_mondayActual());
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [archivo, setArchivo] = useState("");

  const cargarTabla = () => data.getHorariosDia().then(setFilas);
  useEffect(() => { data.getUsuarios().then(setUsers); cargarTabla(); }, []);

  const onFile = async (file: File) => {
    setError(""); setRes(null); setArchivo(file.name);
    try {
      const buf = await file.arrayBuffer();
      const libro = XLSX.read(buf, { type: "array" });
      setWb(libro); setHojas(libro.SheetNames);
      // auto-elige la primera hoja con encabezado Login + th
      let elegida = libro.SheetNames[0];
      for (const sn of libro.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<any[]>(libro.Sheets[sn], { header: 1, raw: true, defval: null });
        const hasLogin = rows.slice(0, 10).some((r) => r?.some((c: any) => _norm(c) === "login"));
        const hasTh = rows.slice(0, 10).some((r) => r?.some((c: any) => _norm(c) === "th"));
        if (hasLogin && hasTh) { elegida = sn; break; }
      }
      setHoja(elegida);
    } catch (e: any) { setError("No pude leer el archivo: " + (e?.message ?? "")); }
  };

  const procesar = () => {
    setError(""); setRes(null);
    try {
      const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[hoja], { header: 1, raw: true, defval: null });
      const out = _parseHoja(rows, monday, users);
      if (!out.filas.length) { setError("No se generaron horarios. Revisa la hoja y que los nombres/códigos coincidan con tus usuarios."); return; }
      setRes(out);
    } catch (e: any) { setError(e?.message ?? "Error procesando el archivo"); }
  };

  const guardar = async () => {
    if (!res?.filas?.length) return;
    setBusy(true);
    try { await guardarHorarios(res.filas); cargarTabla(); setRes({ ...res, guardado: true }); }
    catch (e: any) { setError("Error al guardar: " + (e?.message ?? "")); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid horLayout">
      <div className="card selfstart">
        <div className="h2 mb4">Cargar horarios desde Excel</div>
        <div className="sub small mb14">Sube el mismo .xlsx de turnos. La app lee la columna <b>th</b> (horas trabajadas) de cada día y calcula el tiempo disponible. Empareja a cada persona por su <b>código</b> o, si no lo tiene, por su nombre.</div>

        <label className="uploadbox uploadlabel">
          <Upload size={26} className="uploadico" />
          <div className="uploadt">{archivo || "Haz clic para elegir el .xlsx"}</div>
          <div className="sub tiny">o arrástralo aquí</div>
          <input type="file" accept=".xlsx,.xls" className="hidden-file" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>

        {hojas.length > 0 && (
          <div className="grid two mt12">
            <div><label className="lbl">Hoja</label>
              <select className="inp" value={hoja} onChange={(e) => { setHoja(e.target.value); setRes(null); }}>
                {hojas.map((h) => <option key={h} value={h}>{h}</option>)}
              </select></div>
            <div><label className="lbl">Lunes de la semana</label>
              <input type="date" className="inp" value={monday} onChange={(e) => { setMonday(e.target.value); setRes(null); }} /></div>
          </div>
        )}

        {wb && <button className="btn ghost mt12" onClick={procesar} style={{ width: "100%", justifyContent: "center" }}>Procesar archivo</button>}
        {error && <div className="errbox mt12">{error}</div>}

        {res && (
          <div className="mt12">
            <div className="okbox">✓ {res.filas.length} horarios listos para {res.personas} persona(s).</div>
            {res.sinMatch.length > 0 && (
              <div className="warnbox mt8" style={{ marginTop: 8 }}>
                <AlertTriangle size={15} className="warnicon" />
                <span>No emparejé a: {res.sinMatch.slice(0, 8).join(", ")}{res.sinMatch.length > 8 ? "…" : ""}. Agrega su <b>código operativo</b> al crear el usuario para que calce exacto.</span>
              </div>
            )}
            {res.guardado
              ? <div className="okbox mt8" style={{ marginTop: 8 }}>Horarios guardados. La productividad y la carga ya usan estos datos.</div>
              : <button className="btn primary mt12" disabled={busy} onClick={guardar} style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>{busy ? "Guardando…" : `Cargar ${res.filas.length} horarios`}</button>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="h2 mb12">Disponibilidad de hoy (calculada)</div>
        {filas.length === 0 ? <div className="empty pad24">Aún no hay horarios cargados para hoy.</div> :
          <table className="tbl">
            <thead><tr><th>Persona</th><th>Turno</th><th>Disponible</th></tr></thead>
            <tbody>
              {filas.map((h) => (
                <tr key={h.id}>
                  <td className="bold s12">{h.usuarios ? firstLast(h.usuarios.nombre, h.usuarios.apellido) : "—"}</td>
                  <td className="mono s12">{h.turno ?? "—"}</td>
                  <td className="mono bold primary">{h.disponible_min ? (h.disponible_min / 60).toFixed(1) + "h" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  );
}

/* ════════════════ PRESENCIA (admin) ════════════════ */
const fmtMin = (m: number) => { const h = Math.floor(m / 60); const r = m % 60; return h > 0 ? `${h}h ${r}m` : `${r}m`; };
/* ════════════════ ANUNCIOS ANCLADOS (gestión del coordinador) ════════════════ */
function AnunciosPanel({ perfil }: { perfil: Usuario }) {
  const [lista, setLista] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [reqResp, setReqResp] = useState(false);
  const [mesaDest, setMesaDest] = useState("");
  const [mesas, setMesas] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const cargar = () => data.getAnunciosConEstado().then(setLista).catch(() => {});
  useEffect(() => { cargar(); data.getMesas().then(setMesas).catch(() => {}); const t = setInterval(cargar, 60000); return () => clearInterval(t); }, []);

  const publicar = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    try {
      await data.crearAnuncio(msg.trim(), reqResp, `${perfil.nombre} ${perfil.apellido ?? ""}`.trim(), mesaDest || null);
      pushEquipo(mesaDest || null, `Anuncio de ${perfil.nombre}`, msg.trim()).catch(() => {});
      setMsg(""); setReqResp(false); setMesaDest(""); cargar();
    } catch { /* RLS: solo privilegiados */ }
    finally { setBusy(false); }
  };
  const retirar = async (id: string) => { await data.desactivarAnuncio(id).catch(() => {}); cargar(); };
  const borrar = async (id: string) => {
    if (!confirm("¿Eliminar este anuncio y sus confirmaciones? No se puede deshacer.")) return;
    await data.borrarAnuncio(id).catch(() => {}); cargar();
  };
  const hh = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="card mb14">
      <div className="h2 mb4">Anuncio anclado para el equipo</div>
      <div className="sub small mb10">Le sale en ventana emergente a cada agente al conectarse (o al instante si está en línea) y no se quita hasta que confirme. Aquí ves quién ya lo vio y qué respondió.</div>
      <textarea className="inp" rows={3} maxLength={1000} placeholder="Ej: Recuerden que mañana es la evaluación mensual a las 9 a.m."
        value={msg} onChange={(e) => setMsg(e.target.value)} />
      <div className="sub tiny" style={{ textAlign: "right" }}>{msg.length}/1000</div>
      <div className="row-between mt8">
        <label className="sub small" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={reqResp} onChange={(e) => setReqResp(e.target.checked)} />
          Exigir respuesta escrita (no basta con "Enterado")
        </label>
        <div className="gap9">
          {mesas.length > 1 && (
            <select className="inp dateinp" value={mesaDest} onChange={(e) => setMesaDest(e.target.value)}>
              <option value="">Toda la operación</option>
              {mesas.map((m: any) => <option key={m.nombre} value={m.nombre}>Solo {mesaLabel(m.nombre)}</option>)}
            </select>
          )}
          <button className="btn primary sm" disabled={busy || !msg.trim()} onClick={publicar}>Publicar anuncio</button>
        </div>
      </div>

      {lista.length > 0 && (
        <div className="col9 mt12">
          {lista.map((a) => (
            <div key={a.id} className="casecard" style={{ alignItems: "flex-start" }}>
              <div className="min0 grow">
                <div className="s12" style={{ fontWeight: 600 }}>{a.mensaje}</div>
                <div className="caseMeta mt3">
                  {a.activo ? <span className="chip done">Activo</span> : <span className="chip sin">Retirado</span>}
                  {a.requiere_respuesta && <span className="chip bajo">Con respuesta</span>}
                  <span className="chip neutral s11">{a.mesa ? mesaLabel(a.mesa) : "Toda la operación"}</span>
                  <span className="faint">· {hh(a.created_at)} · <b>{a.confirmaciones.length}/{a.total_equipo}</b> confirmaron</span>
                </div>
                {abierto === a.id && (
                  <div className="mt8">
                    {a.confirmaciones.length === 0 && <div className="sub small">Nadie lo ha confirmado todavía.</div>}
                    {a.confirmaciones.map((c: any) => (
                      <div key={c.user_id} className="sub small" style={{ padding: "3px 0" }}>
                        <b>{c.usuario ? firstLast(c.usuario.nombre, c.usuario.apellido) : "—"}</b>
                        <span className="faint"> · {hh(c.confirmado_at)}</span>
                        {c.respuesta && <> — "{c.respuesta}"</>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="gap9">
                <button className="btn ghost sm" onClick={() => setAbierto(abierto === a.id ? null : a.id)}>
                  {abierto === a.id ? "Ocultar" : "Ver confirmaciones"}
                </button>
                {a.activo && <button className="btn ghost sm" onClick={() => retirar(a.id)}>Retirar</button>}
                <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={() => borrar(a.id)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PresenciaView({ perfil }: { perfil: Usuario }) {
  const [filas, setFilas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerta, setAlerta] = useState<any>(null);   // { user, nombre }
  const [msg, setMsg] = useState("Te necesito un momento, por favor.");
  const [enviando, setEnviando] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [mesa, setMesa] = useState("");
  const [q, setQ] = useState("");
  const [inasistencias, setInasistencias] = useState<any[]>([]);
  const cargar = () => {
    data.getPresencia(mesa || null).then((d) => { setFilas(d); setLoading(false); });
    data.getInasistencias(mesa || null).then(setInasistencias).catch(() => {});
  };
  useEffect(() => { cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [mesa]);
  const inasistente = (userId: string) => inasistencias.find((x) => x.user_id === userId);
  const privPres = perfil.rol === "coordinador" || perfil.rol === "superadmin";
  const [perfilUser, setPerfilUser] = useState<{ id: string; nombre: string } | null>(null);
  const enLinea = filas.filter((f) => f.en_linea).length;

  const enviar = async () => {
    if (!msg.trim()) return;
    setEnviando(true);
    try {
      await data.enviarAlerta(alerta.user, msg.trim(), `${perfil.nombre} ${perfil.apellido ?? ""}`.trim());
      pushUsuarios([alerta.user], `Alerta de ${perfil.nombre}`, msg.trim()).catch(() => {});
      setOkMsg(`Alerta enviada a ${alerta.nombre}.`); setAlerta(null);
      setTimeout(() => setOkMsg(""), 3000);
    } catch (e: any) { setOkMsg("Error: " + (e.message ?? "")); }
    finally { setEnviando(false); }
  };

  return (
    <>
    {privPres && <AnunciosPanel perfil={perfil} />}
    {inasistencias.length > 0 && (
      <div className="card mb14" style={{ borderLeft: "4px solid var(--danger)" }}>
        <div className="h2 mb4"><AlertTriangle size={16} style={{ verticalAlign: "-3px" }} /> Inasistencia digital detectada</div>
        <div className="sub small">
          Con la app abierta pero <b>sin actividad en el PC hace más de 30 minutos</b> y sin pausa registrada:{" "}
          {inasistencias.map((x: any, i: number) => (
            <span key={x.user_id}><b>{firstLast(x.nombre, x.apellido)}</b> ({fmtMin(x.minutos_sin)}){i < inasistencias.length - 1 ? ", " : "."}</span>
          ))}
          {" "}Puedes enviarles una alerta desde la tabla.
        </div>
      </div>
    )}
    <div className="card nopad">
      <div className="tblhead">
        <div><div className="h2">Equipo · presencia de hoy</div><div className="sub small">Quién está conectado, su tiempo en la app, su tiempo activo en el PC y sus pausas. Puedes enviar una alerta al instante. Se actualiza solo.</div></div>
        <div className="gap9">
          <BuscaNombre value={q} setValue={setQ} />
          {privPres && <MesaSelector mesa={mesa} setMesa={setMesa} />}
          <span className="chip done"><span className="liveblip" /> {enLinea} en línea</span>
        </div>
      </div>
      {okMsg && <div className="okbox" style={{ margin: "0 18px 12px" }}>{okMsg}</div>}
      <div className="tblscroll">
        <table className="tbl">
          <thead><tr><th>Persona</th><th>Cargo</th><th>Estado</th><th>Última conexión</th><th>Tiempo en la app</th><th>Gestión en el PC</th><th>En pausa</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8}><div className="empty">Cargando…</div></td></tr>}
            {!loading && filas.filter((f) => matchNombre(q, f.nombre, f.apellido)).map((f) => (
              <tr key={f.user_id}>
                <td className="bold nameCell">
                  <button className="linkperson" onClick={() => setPerfilUser({ id: f.user_id, nombre: firstLast(f.nombre, f.apellido) })} title="Ver perfil del día">
                    <span className="uava xsmall">{(f.nombre?.[0] ?? "") + (f.apellido?.[0] ?? "")}</span>{f.nombre} {f.apellido}
                    {f.user_id === perfil.id && <span className="chip bajo s11" style={{ marginLeft: 6 }}>Tú</span>}
                  </button>
                </td>
                <td className="s12">{f.cargo}</td>
                <td>
                  {f.pausa_tipo ? (
                    <span className={"chip " + (ESTADO_CHIP[f.pausa_tipo] ?? "medio")} title={f.pausa_desde ? "Desde " + new Date(f.pausa_desde).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false }) : ""}>
                      <CircleDot size={11} /> {PAUSA_LBL[f.pausa_tipo] ?? f.pausa_tipo}
                    </span>
                  ) : inasistente(f.user_id) ? (
                    <span className="chip alto" title="App abierta, PC sin actividad y sin pausa registrada">
                      <AlertTriangle size={11} /> Inactivo {fmtMin(inasistente(f.user_id).minutos_sin)}
                    </span>
                  ) : f.en_linea ? <span className="chip done"><span className="liveblip" /> En línea</span> : <span className="chip sin">Desconectado</span>}
                </td>
                <td className="mono s12">{f.ultimo ? new Date(f.ultimo).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : <span className="faint">—</span>}</td>
                <td className="mono bold primary">{fmtMin(f.minutos_logueado || 0)}</td>
                <td className="mono bold">{f.minutos_pc ? fmtMin(f.minutos_pc) : <span className="faint">—</span>}</td>
                <td className="mono s12">{f.minutos_pausa ? fmtMin(f.minutos_pausa) : <span className="faint">—</span>}</td>
                <td>{f.user_id === perfil.id ? <span className="faint s12">—</span> : <button className="btn ghost sm" onClick={() => { setMsg("Te necesito un momento, por favor."); setAlerta({ user: f.user_id, nombre: `${f.nombre} ${f.apellido ?? ""}` }); }}><Bell size={13} />Alerta</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {alerta && (
        <div className="overlay" onClick={() => setAlerta(null)}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead"><div className="h2">Enviar alerta a {alerta.nombre}</div><button className="xbtn" onClick={() => setAlerta(null)}><X size={16} /></button></div>
            <div className="modalBody">
              <div className="sub small mb12">Le llegará al instante en su pantalla.</div>
              <div className="chipsrow">
                {["Te necesito un momento, por favor.", "Llámame cuando puedas.", "Revisa tu bandeja, hay un caso urgente."].map((m) => (
                  <button key={m} className="quickmsg" onClick={() => setMsg(m)}>{m}</button>
                ))}
              </div>
              <label className="lbl mt12">Mensaje</label>
              <textarea className="inp" rows={3} value={msg} maxLength={400} onChange={(e) => setMsg(e.target.value)} />
            </div>
            <div className="modalFoot"><button className="btn ghost" onClick={() => setAlerta(null)}>Cancelar</button><button className="btn primary" disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Enviar alerta"}</button></div>
          </div>
        </div>
      )}
      {perfilUser && <PerfilPersona user={perfilUser} onClose={() => setPerfilUser(null)} />}
    </div>
    </>
  );
}

/* ── Perfil de una persona (modal): horario, casos y gestión del día ── */
function PerfilPersona({ user, onClose }: { user: { id: string; nombre: string }; onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tend, setTend] = useState<{ dia: string; gestiones: number; minutos: number; casos: number }[]>([]);
  useEffect(() => { data.perfilDia(user.id).then((r) => { setD(r); setLoading(false); }).catch(() => setLoading(false)); }, [user.id]);
  useEffect(() => { data.perfilTendencia(user.id, 14).then(setTend).catch(() => setTend([])); }, [user.id]);
  const tendChart = tend.map((t) => ({ dia: t.dia.slice(8, 10) + "/" + t.dia.slice(5, 7), gestiones: t.gestiones }));
  const hh = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
  const casos = d?.casos ?? []; const gest = d?.gestiones ?? [];
  const pend = casos.filter((c: any) => c.estado !== "gestionado").length;
  const hechos = casos.length - pend;

  // Gráfica 1: minutos por tipo de gestión (las 6 con más tiempo).
  const porTipo = Object.values(gest.reduce((acc: any, g: any) => {
    const k = g.tipo || "—"; (acc[k] ??= { tipo: k, min: 0 }); acc[k].min += g.minutos || 0; return acc;
  }, {})).sort((a: any, b: any) => b.min - a.min).slice(0, 6) as any[];
  // Gráfica 2: número de gestiones por hora del día.
  const porHoraMap = gest.reduce((acc: any, g: any) => {
    if (!g.registrado_at) return acc;
    const h = new Date(g.registrado_at).getHours(); acc[h] = (acc[h] || 0) + 1; return acc;
  }, {} as Record<number, number>);
  const porHora = Object.keys(porHoraMap).map(Number).sort((a, b) => a - b)
    .map((h) => ({ hora: String(h).padStart(2, "0") + "h", gestiones: porHoraMap[h] }));
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modalHead">
          <div>
            <div className="h2">{user.nombre}</div>
            {d?.usuario && <div className="sub small mt3">{d.usuario.cargo}{d.usuario.mesa ? " · " + mesaLabel(d.usuario.mesa) : ""}{d.horario?.turno ? " · Turno " + d.horario.turno : ""}</div>}
          </div>
          <button className="xbtn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modalBody">
          {loading ? <div className="empty pad24">Cargando…</div> : !d ? <div className="empty pad24">Sin datos.</div> : (
            <>
              <div className="grid three mb14">
                <div className="card tight"><div className="statVal sm" style={{ color: "var(--danger)" }}>{pend}</div><div className="statLbl">Por gestionar</div></div>
                <div className="card tight"><div className="statVal sm" style={{ color: "var(--ok)" }}>{hechos}</div><div className="statLbl">Cerrados hoy</div></div>
                <div className="card tight"><div className="statVal sm" style={{ color: "var(--primary)" }}>{horas(d.resumen?.minutos ?? 0)}</div><div className="statLbl">{d.resumen?.gestiones ?? 0} gestiones</div></div>
              </div>
              {gest.length > 0 && (
                <div className="grid two mb14">
                  <div className="card tight">
                    <div className="h2 mb6" style={{ fontSize: 13 }}>Tiempo por tipo de gestión (min)</div>
                    <ResponsiveContainer width="100%" height={Math.max(120, 26 + porTipo.length * 30)}>
                      <BarChart data={porTipo} layout="vertical" margin={{ left: 4, right: 12 }}>
                        <CartesianGrid horizontal={false} stroke="#EEF1F6" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="tipo" width={96} tick={{ fontSize: 10, fill: "#5C6883" }} axisLine={false} tickLine={false} interval={0} />
                        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E1E9F3", fontSize: 12 }} />
                        <Bar dataKey="min" name="Minutos" fill="#0098D6" radius={[0, 4, 4, 0]} maxBarSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="card tight">
                    <div className="h2 mb6" style={{ fontSize: 13 }}>Gestiones por hora</div>
                    <ResponsiveContainer width="100%" height={Math.max(120, 26 + porTipo.length * 30)}>
                      <BarChart data={porHora} margin={{ left: -18, right: 8, top: 6 }}>
                        <CartesianGrid vertical={false} stroke="#EEF1F6" />
                        <XAxis dataKey="hora" tick={{ fontSize: 9, fill: "#95A1B9" }} axisLine={false} tickLine={false} interval={0} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E1E9F3", fontSize: 12 }} />
                        <Bar dataKey="gestiones" name="Gestiones" fill="#26B07A" radius={[4, 4, 0, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {tendChart.some((t) => t.gestiones > 0) && (
                <div className="card tight mb14">
                  <div className="h2 mb6" style={{ fontSize: 13 }}>Evolución · gestiones por día (últimas 2 semanas)</div>
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={tendChart} margin={{ left: -20, right: 8, top: 6 }}>
                      <defs>
                        <linearGradient id="gTend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0098D6" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#0098D6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#EEF1F6" />
                      <XAxis dataKey="dia" tick={{ fontSize: 9, fill: "#95A1B9" }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #E1E9F3", fontSize: 12 }} />
                      <Area type="monotone" dataKey="gestiones" name="Gestiones" stroke="#0098D6" strokeWidth={2} fill="url(#gTend)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="h2 mb6" style={{ fontSize: 14 }}>Casos del día</div>
              {casos.length === 0 ? <div className="sub small mb14">Sin casos asignados hoy.</div> :
                <div className="col9 mb14">
                  {casos.map((c: any, i: number) => (
                    <div key={i} className="row-between" style={{ padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                      <span className="s12"><b className="mono">#{c.numero_caso.replace(/^(EXT|REU)-/, "")}</b>{c.cliente && <span className="faint"> · {c.cliente}</span>}</span>
                      <span className={"chip " + (ESTADO_META[c.estado]?.chip ?? "sin")}>{ESTADO_META[c.estado]?.label ?? c.estado}</span>
                    </div>
                  ))}
                </div>}
              <div className="h2 mb6" style={{ fontSize: 14 }}>Gestiones registradas</div>
              {gest.length === 0 ? <div className="sub small">Sin gestiones registradas hoy.</div> :
                <div className="col9">
                  {gest.map((g: any, i: number) => (
                    <div key={i} className="row-between" style={{ padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                      <span className="s12">{g.tipo ?? "—"} <span className="faint mono">#{g.numero_caso.replace(/^(EXT|REU)-/, "")}</span></span>
                      <span className="mono soft s12">{g.minutos}m · {hh(g.registrado_at)}</span>
                    </div>
                  ))}
                </div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════ HORARIO SEMANAL (bonito) ════════════════ */
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
function HorarioSemana() {
  const [monday, setMonday] = useState(_mondayActual());
  const [filas, setFilas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const hasta = _addDays(monday, 6);
    data.getHorariosSemana(monday, hasta).then((d) => { setFilas(d); setLoading(false); });
  }, [monday]);

  const personas = useMemo(() => {
    const map = new Map<string, any>();
    filas.forEach((h: any) => {
      const id = h.user_id;
      if (!map.has(id)) map.set(id, { nombre: h.usuarios ? `${h.usuarios.nombre} ${h.usuarios.apellido ?? ""}` : "—", cargo: h.usuarios?.cargo ?? "", mesa: h.usuarios?.mesa ?? null, dias: {} as any });
      const d = (new Date(h.fecha + "T12:00:00").getDay() + 6) % 7;
      map.get(id).dias[d] = h;
    });
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [filas]);

  return (
    <div className="card nopad mt15">
      <div className="tblhead">
        <div><div className="h2">Horario semanal · Help Desk</div><div className="sub small">Turno de cada persona por día. Cámbiate de semana con la fecha.</div></div>
        <input type="date" className="inp dateinp" value={monday} onChange={(e) => { const d = new Date(e.target.value + "T12:00:00"); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); setMonday(d.toISOString().slice(0, 10)); }} />
      </div>
      <div className="tblscroll">
        {loading ? <div className="empty pad24">Cargando…</div> : personas.length === 0 ? <div className="empty pad24">No hay horarios cargados para esta semana.</div> :
          <table className="tbl horsem">
            <thead><tr><th className="stickyc">Persona</th>{DIAS.map((d, i) => <th key={i} className="diacol">{d}<br /><span className="faint tiny">{new Date(_addDays(monday, i) + "T12:00:00").getDate()}</span></th>)}</tr></thead>
            <tbody>
              {personas.map((p, i) => (
                <tr key={i}>
                  <td className="stickyc bold s12">{p.nombre}<div className="sub tiny">{p.cargo}{p.mesa ? <> · <span className="chip bajo s11">{mesaLabel(p.mesa)}</span></> : ""}</div></td>
                  {DIAS.map((_, d) => {
                    const h = p.dias[d];
                    return <td key={d} className="diacell">{h ? <span className="turnopill">{h.turno ?? ((h.disponible_min / 60).toFixed(1) + "h")}</span> : <span className="descanso">—</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  );
}

/* ════════════════ CARGA DE CASOS (senior y coordinación) ════════════════ */
function CargaView({ perfil }: { perfil: Usuario }) {
  const [desde, setDesde] = useState(todayISO());
  const [hasta, setHasta] = useState(todayISO());
  const [mesa, setMesa] = useState("");
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cap, setCap] = useState<data.Capacidad | null>(null);
  const [porTipo, setPorTipo] = useState<any[]>([]);
  const [meta, setMeta] = useState(85);   // meta de ocupación (%)
  const priv = perfil.rol === "coordinador" || perfil.rol === "superadmin";

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    const m = priv ? (mesa || null) : null;
    data.cargaEquipo(desde, hasta, m)
      .then((d) => { if (vivo) { setFilas(d); setLoading(false); } })
      .catch(() => { if (vivo) setLoading(false); });
    data.cargaCapacidad(desde, hasta, m).then((c) => { if (vivo) setCap(c); }).catch(() => { if (vivo) setCap(null); });
    data.gPorTipo(desde, hasta, null, m).then((t) => { if (vivo) setPorTipo(t); }).catch(() => { if (vivo) setPorTipo([]); });
    return () => { vivo = false; };
    /* eslint-disable-next-line */
  }, [desde, hasta, mesa]);

  // ── Cálculos de capacidad ──────────────────────────────────────
  const dias = Math.max(1, cap?.dias ?? 0);
  const casosDia = cap ? (cap.casos / dias) : 0;
  const ahtCaso = cap && cap.casos ? cap.min_gestion / cap.casos : 0;         // min por caso
  const demandaH = (cap?.min_gestion ?? 0) / 60;
  const capacidadH = (cap?.min_capacidad ?? 0) / 60;
  const ocupacion = cap && cap.min_capacidad ? (cap.min_gestion / cap.min_capacidad) * 100 : null;
  const capPersonaDia = cap && cap.persona_dias ? cap.min_capacidad / cap.persona_dias : 0;   // min/persona/día
  const personasActuales = cap ? (cap.persona_dias / dias) : 0;               // promedio de personas/día
  const personasNecesarias = capPersonaDia > 0 ? (cap!.min_gestion / dias) / (capPersonaDia * (meta / 100)) : null;
  const faltanHorarios = !cap || cap.min_capacidad === 0;
  const veredicto = faltanHorarios ? "sin-horario"
    : personasNecesarias == null ? "sin-horario"
    : personasNecesarias <= personasActuales + 0.05 ? "ok" : "alto";

  const activos = filas.filter((f: any) => f.asignados > 0 || f.minutos > 0);
  const totalAsig = activos.reduce((s: number, f: any) => s + f.asignados, 0);
  const promedio = activos.length ? totalAsig / activos.length : 0;
  const vistos = activos.filter((f: any) => matchNombre(q, f.nombre, f.apellido));
  const chart = vistos.map((f: any) => ({
    nombre: firstLast(f.nombre, f.apellido),
    asignados: f.asignados, gestionados: f.gestionados,
  }));

  return (
    <div>
      <div className="row-between end">
        <div><div className="eyebrow">{priv ? "Coordinación · Help Desk" : "Senior · tu grupo"}</div><div className="h1">Carga de casos</div></div>
        <div className="toolbar">
          <BuscaNombre value={q} setValue={setQ} />
          {priv && <MesaSelector mesa={mesa} setMesa={setMesa} />}
          <RangoFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
        </div>
      </div>
      <div className="sub small mt3">Periodo: {fmtFecha(desde)} → {fmtFecha(hasta)} · {activos.length} persona(s) con carga · promedio <b>{promedio.toFixed(1)}</b> casos asignados por persona</div>

      {cap && (
        <div className="card mt15">
          <div className="row-between end mb4">
            <div className="h2">Análisis de carga · ¿alcanza el personal?</div>
            <label className="metaocup">Meta de ocupación
              <input type="number" className="inp dateinp metaslider" min={50} max={100} value={meta} onChange={(e) => setMeta(Math.min(100, Math.max(50, +e.target.value || 85)))} />%
            </label>
          </div>
          <div className="sub small mb12">Demanda (tiempo de gestión) frente a la capacidad (turnos disponibles) del periodo. La ocupación es cuánto del tiempo disponible se va en gestión; con la meta se estiman las personas necesarias.</div>

          <div className="capverdict" style={{ borderLeftColor: veredicto === "ok" ? "var(--ok)" : veredicto === "alto" ? "var(--danger)" : "var(--warn)" }}>
            {veredicto === "sin-horario" ? (
              <span>No se puede evaluar el personal: faltan <b>horarios cargados</b> de esta mesa en el periodo (sin turnos no hay capacidad con qué comparar).</span>
            ) : veredicto === "ok" ? (
              <span><b>Carga adecuada.</b> Con ~{personasActuales.toFixed(1)} persona(s)/día se cubre la demanda a una ocupación meta del {meta}% (se necesitarían ~{personasNecesarias!.toFixed(1)}).</span>
            ) : (
              <span><b>Sobrecarga.</b> La demanda pide ~{personasNecesarias!.toFixed(1)} persona(s)/día al {meta}% de ocupación y hay ~{personasActuales.toFixed(1)}. Faltarían ~{Math.max(0, personasNecesarias! - personasActuales).toFixed(1)}.</span>
            )}
          </div>

          <div className="grid six mt12">
            <div className="card capkpi"><div className="eyebrow mb6">Casos por día</div><div className="bignum">{casosDia.toFixed(1)}</div><div className="sub tiny">{cap.casos} en {dias} día(s)</div></div>
            <div className="card capkpi"><div className="eyebrow mb6">Tiempo por caso</div><div className="bignum">{ahtCaso.toFixed(0)}<span className="capu"> min</span></div><div className="sub tiny">promedio (AHT)</div></div>
            <div className="card capkpi"><div className="eyebrow mb6">Demanda</div><div className="bignum">{demandaH.toFixed(0)}<span className="capu"> h</span></div><div className="sub tiny">tiempo de gestión</div></div>
            <div className="card capkpi"><div className="eyebrow mb6">Capacidad</div><div className="bignum">{capacidadH.toFixed(0)}<span className="capu"> h</span></div><div className="sub tiny">turnos disponibles</div></div>
            <div className="card capkpi"><div className="eyebrow mb6">Ocupación</div><div className="bignum" style={{ color: ocupacion != null && ocupacion > meta ? "var(--danger)" : "var(--ink)" }}>{ocupacion != null ? Math.round(ocupacion) + "%" : "—"}</div><div className="sub tiny">de lo disponible</div></div>
            <div className="card capkpi"><div className="eyebrow mb6">Personas / día</div><div className="bignum">{personasActuales.toFixed(1)}{personasNecesarias != null && <span className="capu"> / {personasNecesarias.toFixed(1)}</span>}</div><div className="sub tiny">actual / necesarias</div></div>
          </div>

          {porTipo.length > 0 && (
            <div className="mt15">
              <div className="h2 mb4" style={{ fontSize: 15 }}>Tiempo por tipo de gestión</div>
              <div className="sub small mb10">Creación, escalamiento, seguimiento… cuántas veces y cuánto toma cada una.</div>
              <div className="tblscroll">
                <table className="tbl">
                  <thead><tr><th>Tipo</th><th>Veces</th><th>Tiempo promedio</th><th>Tiempo total</th></tr></thead>
                  <tbody>
                    {porTipo.map((t: any, i: number) => (
                      <tr key={i}>
                        <td className="bold">{t.nombre}</td>
                        <td className="mono">{t.total}</td>
                        <td className="mono">{t.total ? Math.round(t.minutos / t.total) : 0} min</td>
                        <td className="mono">{(t.minutos / 60).toFixed(1)} h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? <div className="card mt20"><div className="empty">Cargando…</div></div> : activos.length === 0 ? (
        <div className="card mt20"><div className="empty">Sin casos asignados en el periodo.</div></div>
      ) : (
        <>
          <div className="card mt15">
            <div className="h2 mb4">Comparativo de cargas</div>
            <div className="sub small mb10">Casos asignados vs gestionados por persona — para repartir parejo. La línea punteada es el promedio de asignación.</div>
            <div className="legend"><span className="legdot"><i style={{ background: "#0098D6" }} />Asignados</span><span className="legdot"><i style={{ background: "#26B07A" }} />Gestionados</span></div>
            <ResponsiveContainer width="100%" height={Math.max(180, 40 + chart.length * 42)}>
              <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 16 }} barGap={2}>
                <CartesianGrid horizontal={false} stroke="#EEF1F6" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="nombre" width={140} tick={{ fontSize: 11, fill: "#5C6883" }} axisLine={false} tickLine={false} interval={0} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} />
                <Bar dataKey="asignados" name="Asignados" fill="#0098D6" radius={[0, 4, 4, 0]} maxBarSize={13} />
                <Bar dataKey="gestionados" name="Gestionados" fill="#26B07A" radius={[0, 4, 4, 0]} maxBarSize={13} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card nopad mt15">
            <div className="tblscroll">
              <table className="tbl">
                <thead><tr><th>Persona</th><th>Cargo</th>{priv && !mesa && <th>Mesa</th>}<th>Asignados</th><th>Gestionados</th><th>Pendientes</th><th>Avance</th><th>Tiempo</th></tr></thead>
                <tbody>
                  {vistos.map((f: any) => {
                    const pct = f.asignados ? Math.round((f.gestionados / f.asignados) * 100) : null;
                    return (
                      <tr key={f.user_id}>
                        <td className="bold nameCell"><span className="uava xsmall">{(f.nombre?.[0] ?? "") + (f.apellido?.[0] ?? "")}</span><PersonaLink id={f.user_id} nombre={firstLast(f.nombre, f.apellido)} /></td>
                        <td className="s12">{f.cargo}</td>
                        {priv && !mesa && <td><span className="chip bajo s11">{f.mesa ? mesaLabel(f.mesa) : "—"}</span></td>}
                        <td className="mono bold">{f.asignados}</td>
                        <td className="mono">{f.gestionados}</td>
                        <td>{f.pendientes > 0 ? <span className="chip pend">{f.pendientes}</span> : <span className="faint">0</span>}</td>
                        <td>{pct != null ? <span className={"chip " + (pct >= 80 ? "done" : pct >= 50 ? "medio" : "alto")}>{pct}%</span> : <span className="faint">—</span>}</td>
                        <td className="mono">{horas(f.minutos)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════ DISTRIBUCIÓN INGENIEROS ════════════════ */
// Selecciona un ingeniero y ve su bolsa ACTUAL de casos (abiertos + arrastre),
// con cliente, estado, desde cuándo y quién se lo asignó. Senior ve a su grupo;
// coordinación/admin ve toda la operación con filtro de mesa.
function DistribucionView({ perfil, fire }: { perfil: Usuario; fire: (m: string) => void }) {
  const priv = perfil.rol === "coordinador" || perfil.rol === "superadmin";
  const [equipo, setEquipo] = useState<Usuario[]>([]);
  const [cargas, setCargas] = useState<Record<string, { abiertos: number; asignados: number }>>({});
  const [mesa, setMesa] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>("");
  const [bandeja, setBandeja] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Lista de ingenieros según el rol.
  useEffect(() => {
    let vivo = true;
    (priv ? data.getUsuarios() : data.getEquipo(null))
      .then((l) => {
        if (!vivo) return;
        const ing = l.filter((u) => (u.rol === "agente" || u.rol === "senior") && u.activo && (!priv || !mesa || u.mesa === mesa));
        setEquipo(ing);
        setSel((s) => (s && ing.some((u) => u.id === s) ? s : (ing[0]?.id ?? "")));
      })
      .catch(() => {});
    return () => { vivo = false; };
    /* eslint-disable-next-line */
  }, [mesa]);

  // Conteo de bolsa abierta por persona (últimos 30 días de arrastre) para el badge.
  const reloadCargas = () => data.cargaEquipo(isoHace(30), todayISO(), priv ? (mesa || null) : null)
    .then((d: any[]) => setCargas(Object.fromEntries(d.map((f) => [f.user_id, { abiertos: f.pendientes, asignados: f.asignados }]))))
    .catch(() => {});
  useEffect(() => { reloadCargas(); /* eslint-disable-next-line */ }, [mesa]);

  // Bolsa detallada del ingeniero seleccionado.
  const reloadBandeja = () => {
    if (!sel) { setBandeja([]); return; }
    setLoading(true);
    data.bolsaIngeniero(sel).then((b) => setBandeja(b)).catch(() => setBandeja([])).finally(() => setLoading(false));
  };
  useEffect(() => { reloadBandeja(); /* eslint-disable-next-line */ }, [sel]);

  const target = equipo.find((u) => u.id === sel);
  const vistos = equipo.filter((u) => matchNombre(q, u.nombre, u.apellido));
  const abiertos = bandeja.filter((a) => a.estado !== "gestionado");
  const cerrados = bandeja.length - abiertos.length;

  return (
    <div>
      <div className="row-between end">
        <div>
          <div className="eyebrow">{priv ? "Coordinación · Help Desk" : "Senior · tu grupo"}</div>
          <div className="h1">Distribución Ingenieros</div>
        </div>
        <div className="toolbar">
          {priv && <MesaSelector mesa={mesa} setMesa={setMesa} />}
          <button className="btn ghost" onClick={() => { reloadCargas(); reloadBandeja(); }}><Activity size={15} />Actualizar</button>
        </div>
      </div>
      <div className="sub small mt3 mb20">Selecciona un ingeniero para ver su bolsa actual de casos: quién se los asignó, desde cuándo y en qué estado.</div>

      <div className="grid seniorLayout">
        <div className="card selfstart">
          <div className="mb10"><BuscaNombre value={q} setValue={setQ} placeholder="Buscar ingeniero…" /></div>
          <div className="col6">
            {vistos.length === 0 && <div className="empty pad24">Sin ingenieros.</div>}
            {vistos.map((u) => {
              const c = cargas[u.id];
              return (
                <button key={u.id} className={"nav navlight" + (sel === u.id ? " navon" : "")} onClick={() => setSel(u.id)}>
                  <span className="navperson"><span className="uava small">{initials(u)}</span><span className="navname">{firstLast(u.nombre, u.apellido)}</span></span>
                  {c && c.abiertos > 0 && <span className="chip pend s11">{c.abiertos}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="col15">
          <div className="card">
            <div className="row-between mb12">
              <div className="h2">Bolsa de {target ? firstLast(target.nombre, target.apellido) : "—"}</div>
              <div className="gap10 center-row">
                <span className="chip pend">{abiertos.length} abiertos</span>
                {cerrados > 0 && <span className="chip done">{cerrados} gestionados</span>}
              </div>
            </div>
            {loading ? <div className="empty pad24">Cargando…</div>
              : bandeja.length === 0 ? <div className="empty pad24">Este ingeniero no tiene casos en su bolsa.</div>
              : (
                <div className="tblscroll">
                  <table className="tbl">
                    <thead><tr><th>Caso</th><th>Cliente</th><th>Estado</th><th>Desde</th><th>Origen</th></tr></thead>
                    <tbody>
                      {bandeja.map((a: any) => {
                        const em = ESTADO_META[a.estado] ?? { label: a.estado, chip: "sin" };
                        const desde = a.created_at
                          ? new Date(a.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
                          : fmtFecha(a.fecha);
                        return (
                          <tr key={a.id}>
                            <td className="mono s12">#{a.numero_caso.replace(/^EXT-/, "")}</td>
                            <td className="s12">{a.numero_caso.startsWith("EXT-") ? <span className="chip neutral s11">Otro segmento</span> : (a.cliente ?? <span className="faint">—</span>)}</td>
                            <td><span className={"chip " + em.chip}>{em.label}</span></td>
                            <td className="mono s12">{desde}</td>
                            <td className="s12">{!a.asignado_por ? <span className="faint">—</span> : a.asignado_por === a.user_id ? <span className="chip neutral s11">Propio</span> : <span className="chip bajo s11">Repartido</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════ BUSCADOR GLOBAL DE CASOS (barra superior) ════════════════ */
// Pega un número de caso → localiza dónde está: en qué bolsa sigue sin asignar,
// o quién lo tiene asignado, desde cuándo y en qué estado. Senior/privilegiado.
function BuscadorCaso() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<data.CasoUbicacion | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 40); }, [open]);

  const buscar = async () => {
    const caso = q.trim();
    if (!caso) return;
    setBusy(true); setErr(""); setRes(null);
    try { setRes(await data.buscarCaso(caso)); }
    catch (e: any) { setErr(e.message ?? "No se pudo buscar"); }
    finally { setBusy(false); }
  };

  const cerrar = () => { setOpen(false); setQ(""); setRes(null); setErr(""); };
  const fmt = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const vacio = res && res.pool.length === 0 && res.asignaciones.length === 0;

  return (
    <div className="notifwrap">
      <button className="notifbtn" title="Buscar un caso" onClick={() => setOpen(true)}><Search size={17} /></button>
      {open && (
        <div className="overlay alta" onClick={cerrar}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modalBody">
            <div className="row-between mb12">
              <div className="h2">Buscar caso</div>
              <button className="xbtn" onClick={cerrar}><X size={16} /></button>
            </div>
            <div className="searchwrap mb12">
              <Search size={15} className="searchico" />
              <input ref={inputRef} className="inp searchinp" placeholder="Pega el número de caso… ej. 20202020"
                value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") buscar(); }} />
              <button className="btn primary" disabled={!q.trim() || busy} onClick={buscar}>{busy ? "Buscando…" : "Buscar"}</button>
            </div>

            {err && <div className="empty pad24" style={{ color: "var(--danger, #E5484D)" }}>{err}</div>}

            {res && !err && (
              <div className="col9">
                <div className="row-between">
                  <div className="caseno">#{res.caso}</div>
                  {res.cliente && <span className="chip bajo s11">{res.cliente}</span>}
                </div>

                {vacio && <div className="empty pad24">No aparece en ninguna bolsa ni asignado a nadie hoy.</div>}

                {res.pool.map((p, i) => (
                  <div key={"p" + i} className="casecard">
                    <div className="min0">
                      <div className="bold s13">{p.fuera_horario ? "En la bolsa de horario no hábil" : "En el contenedor de " + mesaLabel(p.mesa)}</div>
                      <div className="caseMeta">
                        <span className="chip medio s11">Sin asignar</span>
                        {p.creador && <span className="faint">· envió {p.creador}</span>}
                        <span className="faint">· desde {fmt(p.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {res.asignaciones.map((a, i) => {
                  const em = ESTADO_META[a.estado] ?? { label: a.estado, chip: "sin" };
                  return (
                    <div key={"a" + i} className="casecard">
                      <div className="min0">
                        <div className="bold s13">{a.ingeniero ?? "—"}{a.mesa && <span className="faint"> · {mesaLabel(a.mesa)}</span>}</div>
                        <div className="caseMeta">
                          <span className={"chip " + em.chip + " s11"}>{em.label}</span>
                          <span className="faint">· desde {fmt(a.created_at)}</span>
                          {a.asignado_por && <span className="faint">· asignó {a.asignado_por}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════ HORARIOS (todos los roles) ════════════════ */
function HorariosView({ perfil }: { perfil: Usuario }) {
  const [monday, setMonday] = useState(_mondayActual());
  const [filas, setFilas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesa, setMesa] = useState("");
  const [turno, setTurno] = useState("");
  const [q, setQ] = useState("");
  const soloYo = perfil.rol === "agente";
  const priv = perfil.rol === "coordinador" || perfil.rol === "superadmin";

  useEffect(() => {
    setLoading(true);
    data.getHorariosSemana(monday, _addDays(monday, 6)).then((d) => { setFilas(d); setLoading(false); }).catch(() => setLoading(false));
  }, [monday]);

  // Turnos distintos presentes (para el filtro por turno).
  const turnos = useMemo(() => [...new Set(filas.map((h: any) => h.turno).filter(Boolean))].sort(), [filas]);

  const personas = useMemo(() => {
    const map = new Map<string, any>();
    filas.forEach((h: any) => {
      if (mesa && (h.usuarios?.mesa !== mesa)) return;   // filtro por mesa exacta (priv)
      if (turno && h.turno !== turno) return;
      const id = h.user_id;
      if (!map.has(id)) map.set(id, { id, nombre: h.usuarios ? `${h.usuarios.nombre} ${h.usuarios.apellido ?? ""}` : "—", cargo: h.usuarios?.cargo ?? "", mesa: h.usuarios?.mesa ?? "", dias: {} as any });
      const d = (new Date(h.fecha + "T12:00:00").getDay() + 6) % 7;
      map.get(id).dias[d] = h;
    });
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [filas, mesa, turno]);

  const personasVistas = personas.filter((p) => matchNombre(q, p.nombre));

  const semLabel = `${fmtFecha(monday)} → ${fmtFecha(_addDays(monday, 6))}`;
  const titulo = soloYo ? "Mi horario semanal" : perfil.rol === "senior" ? "Horarios de tu grupo" : "Horarios de la operación";

  // Vista personal (agente): tarjetas por día, más amable que una tabla de una fila.
  if (soloYo) {
    const mios: Record<number, any> = {};
    filas.forEach((h: any) => { if (h.user_id === perfil.id) mios[(new Date(h.fecha + "T12:00:00").getDay() + 6) % 7] = h; });
    return (
      <div>
        <div className="row-between end">
          <div><div className="eyebrow">Mi turno · {perfil.mesa ? mesaLabel(perfil.mesa) : "Help Desk"}</div><div className="h1">{titulo}</div></div>
          <input type="date" className="inp dateinp" value={monday} onChange={(e) => { const d = new Date(e.target.value + "T12:00:00"); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); setMonday(d.toISOString().slice(0, 10)); }} />
        </div>
        <div className="sub small mt3">Semana: {semLabel}</div>
        {loading ? <div className="card mt20"><div className="empty">Cargando…</div></div> : (
          <div className="grid diasgrid mt16">
            {DIAS.map((dl, d) => {
              const h = mios[d]; const fecha = _addDays(monday, d);
              return (
                <div key={d} className={"diacard" + (h ? "" : " descanso")}>
                  <div className="diacard-d">{dl} <span className="faint">{new Date(fecha + "T12:00:00").getDate()}</span></div>
                  {h ? <>
                    <div className="diacard-turno">{h.turno ?? "—"}</div>
                    <div className="sub tiny">{h.disponible_min ? (h.disponible_min / 60).toFixed(1) + "h disponibles" : ""}</div>
                  </> : <div className="sub tiny mt6">Descanso</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Vista senior / coordinador / admin: grid semanal con filtros.
  return (
    <div>
      <div className="row-between end">
        <div><div className="eyebrow">Coordinación · Help Desk</div><div className="h1">{titulo}</div></div>
        <div className="toolbar">
          <BuscaNombre value={q} setValue={setQ} />
          {priv && <MesaSelector mesa={mesa} setMesa={setMesa} />}
          {turnos.length > 1 && (
            <select className="inp dateinp" value={turno} onChange={(e) => setTurno(e.target.value)}>
              <option value="">Todos los turnos</option>
              {turnos.map((t: any) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <input type="date" className="inp dateinp" value={monday} onChange={(e) => { const d = new Date(e.target.value + "T12:00:00"); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); setMonday(d.toISOString().slice(0, 10)); }} />
        </div>
      </div>
      <div className="sub small mt3">Semana: {semLabel} · <b>{personasVistas.length}</b> persona(s)</div>

      <div className="card nopad mt15">
        <div className="tblscroll">
          {loading ? <div className="empty pad24">Cargando…</div> : personasVistas.length === 0 ? <div className="empty pad24">No hay horarios cargados para esta semana{mesa || turno || q ? " con ese filtro" : ""}.</div> :
            <table className="tbl horsem">
              <thead><tr><th className="stickyc">Persona</th>{priv && !mesa && <th>Mesa</th>}{DIAS.map((d, i) => <th key={i} className="diacol">{d}<br /><span className="faint tiny">{new Date(_addDays(monday, i) + "T12:00:00").getDate()}</span></th>)}</tr></thead>
              <tbody>
                {personasVistas.map((p, i) => (
                  <tr key={i}>
                    <td className="stickyc bold s12"><PersonaLink id={p.id} nombre={p.nombre} /><div className="sub tiny">{p.cargo}</div></td>
                    {priv && !mesa && <td><span className="chip bajo s11">{p.mesa ? mesaLabel(p.mesa) : "—"}</span></td>}
                    {DIAS.map((_, d) => {
                      const h = p.dias[d];
                      return <td key={d} className="diacell">{h ? <span className="turnopill">{h.turno ?? ((h.disponible_min / 60).toFixed(1) + "h")}</span> : <span className="descanso">—</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>}
        </div>
      </div>
    </div>
  );
}

/* ════════════════ SHELL ════════════════ */
type NavItem = { key: string; label: string; icon: any };
const NAV: Record<Rol, NavItem[]> = {
  agente: [
    { key: "bandeja", label: "Mi bandeja", icon: Inbox },
    { key: "no_habil", label: "Casos horario no hábil", icon: Moon },
    { key: "horario", label: "Mi horario", icon: CalendarRange },
  ],
  senior: [
    { key: "repartir", label: "Repartir seguimiento", icon: CalendarRange },
    { key: "bandeja", label: "Mi bandeja", icon: Inbox },
    { key: "no_habil", label: "Casos horario no hábil", icon: Moon },
    { key: "contenedor", label: "Contenedor general", icon: Boxes },
    { key: "carga", label: "Carga del equipo", icon: TrendingUp },
    { key: "distribucion", label: "Distribución Ingenieros", icon: Users },
    { key: "presencia", label: "En línea", icon: CircleDot },
    { key: "horario", label: "Horarios del grupo", icon: Clock },
  ],
  coordinador: [
    { key: "tablero", label: "Tablero", icon: LayoutDashboard },
    { key: "auditoria", label: "Auditoría", icon: ShieldCheck },
    { key: "bandeja_equipo", label: "Bandeja del equipo", icon: ListChecks },
    { key: "no_habil", label: "Casos horario no hábil", icon: Moon },
    { key: "contenedor", label: "Contenedor general", icon: Boxes },
    { key: "carga", label: "Carga", icon: TrendingUp },
    { key: "distribucion", label: "Distribución Ingenieros", icon: Users },
    { key: "presencia", label: "En línea", icon: CircleDot },
    { key: "estadisticas", label: "Estadísticas", icon: Activity },
    { key: "horario", label: "Horarios", icon: Clock },
    { key: "resumen", label: "Resumen ejecutivo", icon: FileText },
  ],
  superadmin: [
    { key: "tablero", label: "Tablero", icon: LayoutDashboard },
    { key: "auditoria", label: "Auditoría", icon: ShieldCheck },
    { key: "bandeja_equipo", label: "Bandeja del equipo", icon: ListChecks },
    { key: "no_habil", label: "Casos horario no hábil", icon: Moon },
    { key: "contenedor", label: "Contenedor general", icon: Boxes },
    { key: "carga", label: "Carga", icon: TrendingUp },
    { key: "distribucion", label: "Distribución Ingenieros", icon: Users },
    { key: "presencia", label: "En línea", icon: CircleDot },
    { key: "estadisticas", label: "Estadísticas", icon: Activity },
    { key: "horario", label: "Horarios", icon: Clock },
    { key: "resumen", label: "Resumen ejecutivo", icon: FileText },
    { key: "config", label: "Configuración", icon: Settings2 },
  ],
};

export default function Dashboard({ perfil }: { perfil: Usuario }) {
  const [catalogo, setCatalogo] = useState<GestionTipo[]>([]);
  const [vista, setVista] = useState<Rol>(perfil.rol);
  // Rol "efectivo": un admin/coordinador que previsualiza la vista Agente o
  // Senior ve lo mismo que ellos (incluida la campana). Un agente/senior real
  // usa siempre su propio rol.
  const rolEfectivo: Rol = (perfil.rol === "superadmin" || perfil.rol === "coordinador") ? vista : perfil.rol;
  const [section, setSection] = useState<string>(NAV[perfil.rol][0].key);
  const [toast, setToast] = useState<string | null>(null);
  const [alertaIn, setAlertaIn] = useState<any>(null);
  const reloadCatalogo = () => data.getCatalogo().then(setCatalogo);
  useEffect(() => { reloadCatalogo(); }, []);

  // Candado del permiso de Idle Detection para roles operativos: si el permiso
  // está en 'prompt' o 'denied', la app queda bloqueada hasta concederlo.
  // Con la política IdleDetectionAllowedForUrls aplicada en los equipos
  // (ver docs/medicion-tiempo-activo.md) el permiso llega 'granted' y este
  // candado nunca aparece.
  const [idleGate, setIdleGate] = useState<"pedir" | "denegado" | null>(null);
  const idlePedirRef = useRef<(() => Promise<void>) | null>(null);

  // Presencia: abre una sesión y late cada minuto mientras la pestaña esté
  // abierta y el equipo encendido — aunque el agente trabaje en otra app o
  // pestaña. El latido corre en un Web Worker porque el navegador congela los
  // setInterval del hilo principal cuando la pestaña queda en segundo plano.
  //
  // Además, en navegadores Chromium mide el TIEMPO ACTIVO EN EL PC con la
  // Idle Detection API: solo activo/inactivo + pantalla bloqueada, nunca lee
  // teclas ni mouse. Requiere permiso (se pide en el primer clic). En Firefox
  // o Safari simplemente no mide esa parte y las demás siguen igual.
  useEffect(() => {
    let id: string | null = null;
    let worker: Worker | null = null;
    let blobUrl: string | null = null;
    let fallbackTimer: any = null;
    let idleDetector: any = null;
    let idleController: AbortController | null = null;
    let pedirPermiso: any = null;

    // Acumulador de tiempo ACTIVO en el PC (ms).
    let activoMs = 0;
    let activoDesde: number | null = null;
    const activoAhora = () => (activoDesde ? activoMs + (Date.now() - activoDesde) : activoMs);
    const marcarActivo = (activo: boolean) => {
      const now = Date.now();
      if (activo && activoDesde === null) activoDesde = now;
      else if (!activo && activoDesde !== null) { activoMs += now - activoDesde; activoDesde = null; }
    };
    const beat = () => {
      if (idleDetector) marcarActivo(idleDetector.userState === "active" && idleDetector.screenState !== "locked");
      if (id) data.latido(id, Math.floor(activoAhora() / 1000)).catch(() => {});
    };

    const iniciarDetector = async () => {
      const IdleDet = (window as any).IdleDetector;
      try {
        idleController = new AbortController();
        idleDetector = new IdleDet();
        idleDetector.addEventListener("change", beat);
        await idleDetector.start({ threshold: 60000, signal: idleController.signal });
        beat();
      } catch { idleDetector = null; }
    };
    const configurarIdle = async () => {
      const IdleDet = (window as any).IdleDetector;
      if (!IdleDet) return;                       // navegador sin soporte (Firefox/Safari)
      let estado = "prompt";
      try { estado = (await (navigator as any).permissions.query({ name: "idle-detection" })).state; } catch {}
      if (estado === "granted") { iniciarDetector(); setIdleGate(null); return; }
      const conCandado = perfil.rol === "agente" || perfil.rol === "senior";
      if (!conCandado) {
        if (estado === "denied") return;
        pedirPermiso = async () => {               // 'prompt': pedir permiso en el primer clic (gesto)
          try { if ((await IdleDet.requestPermission()) === "granted") iniciarDetector(); } catch {}
        };
        window.addEventListener("click", pedirPermiso, { once: true });
        return;
      }
      // Rol operativo: la app se bloquea hasta que el permiso quede concedido.
      idlePedirRef.current = async () => {
        let r = "denied";
        try { r = await IdleDet.requestPermission(); } catch {}
        if (r === "granted") { setIdleGate(null); iniciarDetector(); }
        else setIdleGate("denegado");
      };
      setIdleGate(estado === "denied" ? "denegado" : "pedir");
    };

    (async () => {
      id = await data.iniciarSesion();
      if (!id) return;
      beat(); // primer latido inmediato
      try {
        // Reloj en worker: su setInterval NO se estrangula en segundo plano.
        const src = "let t=setInterval(function(){postMessage(0)},60000);onmessage=function(e){if(e.data==='stop')clearInterval(t)}";
        blobUrl = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
        worker = new Worker(blobUrl);
        worker.onmessage = beat;
      } catch {
        // Fallback (navegador sin Worker): temporizador normal en primer plano.
        fallbackTimer = setInterval(beat, 60000);
      }
      configurarIdle();
    })();

    // Al volver a la pestaña, late de una para recuperar "En línea" al instante.
    const onVis = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVis);

    const cerrar = () => { if (id) data.cerrarSesion(id); };
    window.addEventListener("beforeunload", cerrar);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", cerrar);
      if (pedirPermiso) window.removeEventListener("click", pedirPermiso);
      idlePedirRef.current = null;
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (worker) { worker.postMessage("stop"); worker.terminate(); }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (idleController) idleController.abort();
      cerrar();
    };
  }, []);

  // Web Push: suscribe este navegador para recibir notificaciones aunque
  // la pestaña esté cerrada. Pide el permiso en el primer clic (gesto).
  useEffect(() => {
    const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!clave || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const b64ToU8 = (b64: string) => {
      const pad = "=".repeat((4 - (b64.length % 4)) % 4);
      const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
      return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
    };
    const suscribir = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription()
          ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(clave) });
        await data.guardarPushSub(perfil.id, sub);
      } catch { /* sin push: la app sigue igual */ }
    };
    if (Notification.permission === "granted") { suscribir(); return; }
    if (Notification.permission === "denied") return;
    const pedir = async () => { try { if ((await Notification.requestPermission()) === "granted") suscribir(); } catch {} };
    window.addEventListener("click", pedir, { once: true });
    return () => window.removeEventListener("click", pedir);
  }, [perfil.id]);

  // Alertas en tiempo real (las que me envía el admin/coordinador).
  // Sonido: un único AudioContext reutilizado y "desbloqueado" en el primer
  // gesto del usuario (los navegadores callan el audio hasta que interactúa).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const getCtx = () => {
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
    }
    return audioCtxRef.current;
  };
  useEffect(() => {
    const unlock = () => { const c = getCtx(); if (c && c.state === "suspended") c.resume().catch(() => {}); };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);
  const beep = (doble = false) => {
    try {
      const ctx = getCtx(); if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const t0 = ctx.currentTime;
      const tono = (inicio: number, freq: number) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = "sine"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.001, inicio); g.gain.exponentialRampToValueAtTime(0.3, inicio + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, inicio + 0.45);
        o.start(inicio); o.stop(inicio + 0.45);
      };
      tono(t0, 880);
      if (doble) tono(t0 + 0.28, 1174.7);   // segundo tono más agudo para mensajes masivos
    } catch { /* sin sonido si el navegador lo bloquea */ }
  };
  useEffect(() => {
    let off: (() => void) | undefined;
    (async () => {
      const pend = await data.getAlertasNoLeidas(perfil.id);
      if (pend.length) setAlertaIn(pend[0]);
      off = data.suscribirAlertas(perfil.id, (a) => { setAlertaIn(a); beep(); });
    })();
    return () => { off?.(); };
  }, [perfil.id]);
  const cerrarAlerta = () => { if (alertaIn) data.marcarAlertaLeida(alertaIn.id); setAlertaIn(null); };

  // Campanita: casos que me reparten/traspasan + mensajes masivos (anuncios).
  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [noLeidas, setNoLeidas] = useState(0);
  const seenNotifRef = useRef<Set<string>>(new Set());
  const pushNotif = (id: string, texto: string, tipo: "caso" | "masivo") => {
    if (seenNotifRef.current.has(id)) return;   // evita duplicados si el evento llega dos veces
    seenNotifRef.current.add(id);
    setNotifs((prev) => [{ id, texto, tipo, at: new Date().toISOString() }, ...prev].slice(0, 20));
    setNoLeidas((n) => n + 1);
  };

  // Anuncios anclados: ventana bloqueante hasta confirmar (solo equipo operativo).
  const [anuncios, setAnuncios] = useState<any[]>([]);
  const [respAnuncio, setRespAnuncio] = useState("");
  const [confirmandoAn, setConfirmandoAn] = useState(false);
  useEffect(() => {
    if (rolEfectivo !== "agente" && rolEfectivo !== "senior") return;
    let off: (() => void) | undefined;
    (async () => {
      const pend = await data.getAnunciosPendientes(perfil.id, perfil.mesa).catch(() => []);
      if (pend.length) setAnuncios(pend);
      off = data.suscribirAnuncios((a) => {
        if (!a?.activo) return;
        if (a.mesa && perfil.mesa && a.mesa !== perfil.mesa) return;   // anuncio de otra mesa
        setAnuncios((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]));
        pushNotif(a.id, a.mensaje || "Nuevo mensaje masivo", "masivo");
        beep(true);
      });
    })();
    return () => { off?.(); };
  }, [perfil.id, rolEfectivo]);
  const anuncioActual = anuncios[0] ?? null;

  // Notificaciones de casos que me reparten o me traspasan (en vivo).
  useEffect(() => {
    if (rolEfectivo !== "agente" && rolEfectivo !== "senior") return;
    return data.suscribirAsignaciones(perfil.id, "notif", async (a: any) => {
      if (!a.asignado_por || a.asignado_por === perfil.id) return;   // lo agregué yo mismo
      // Breve espera para que el enriquecimiento de Salesforce alcance a guardar el cliente.
      await new Promise((r) => setTimeout(r, 2500));
      let de: string | null = null; let cli: string | null = null;
      try {
        const u = (await data.getEquipoEstado()).find((x) => x.user_id === a.asignado_por);
        if (u) de = firstLast(u.nombre, u.apellido);
      } catch {}
      try { cli = await data.getClienteCaso(a.numero_caso); } catch {}
      const texto = `${de ? de + " te pasó" : "Te asignaron"} el caso #${a.numero_caso}${cli ? " · " + cli : ""}`;
      pushNotif(a.id, texto, "caso");
      fire(texto); beep();
    });
  }, [perfil.id, rolEfectivo]);

  const confirmarAnuncio = async () => {
    if (!anuncioActual || (anuncioActual.requiere_respuesta && !respAnuncio.trim())) return;
    setConfirmandoAn(true);
    try {
      await data.confirmarAnuncio(anuncioActual.id, perfil.id, respAnuncio);
      setAnuncios((prev) => prev.slice(1)); setRespAnuncio("");
    } catch (e: any) { fire("Error: " + (e.message ?? "no se pudo confirmar")); }
    finally { setConfirmandoAn(false); }
  };

  // PWA: el aviso de instalación se captura temprano en el layout (window.__pwaPrompt).
  const [instalable, setInstalable] = useState<any>(null);
  useEffect(() => {
    const sync = () => setInstalable((window as any).__pwaPrompt ?? null);
    sync();
    window.addEventListener("pwa-available", sync);
    window.addEventListener("appinstalled", sync);
    return () => { window.removeEventListener("pwa-available", sync); window.removeEventListener("appinstalled", sync); };
  }, []);
  const instalar = async () => {
    const p = (window as any).__pwaPrompt;
    if (!p) return;
    p.prompt(); await p.userChoice;
    (window as any).__pwaPrompt = null; setInstalable(null);
  };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);
  const fire = (m: string) => setToast(m);
  const esPriv = perfil.rol === "superadmin" || perfil.rol === "coordinador";
  const greet = new Date().getHours() < 12 ? "Buenos días" : new Date().getHours() < 19 ? "Buenas tardes" : "Buenas noches";

  // ¿La mesa del usuario permite que los agentes repartan seguimiento?
  // (Todos los segmentos sí, MENOS Básicos, que queda solo para el senior.)
  const [repartoAgente, setRepartoAgente] = useState(false);
  useEffect(() => {
    data.getMesas().then((ms: any[]) => {
      const m = ms.find((x) => x.nombre === perfil.mesa);
      setRepartoAgente(m?.reparte_agente === true);
    }).catch(() => {});
  }, []);

  // Cambiar de perspectiva (Admin/Coord/Senior/Agente) reinicia a su primera sección.
  const cambiarVista = (r: Rol) => { setVista(r); setSection(NAV[r][0].key); };

  // El agente de un segmento habilitado ve además "Repartir seguimiento".
  const items = (vista === "agente" && repartoAgente)
    ? [{ key: "repartir", label: "Repartir seguimiento", icon: CalendarRange }, ...NAV.agente]
    : (NAV[vista] ?? []);

  const [perfilUser, setPerfilUser] = useState<{ id: string; nombre: string } | null>(null);
  const [tema, setTema] = useState<"light" | "dark">("light");
  useEffect(() => { setTema((document.documentElement.getAttribute("data-theme") as "light" | "dark") || "light"); }, []);
  const toggleTema = () => {
    const n = tema === "dark" ? "light" : "dark";
    setTema(n); document.documentElement.setAttribute("data-theme", n);
    try { localStorage.setItem("pulso-theme", n); } catch { /* ignore */ }
  };

  return (
    <PerfilCtx.Provider value={setPerfilUser}>
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="brandmark-logo"><img src="/pulso-mark.png" alt="Pulso" /></div>
          <div><div className="brandname">Pulso</div><div className="brandsub">Group COS · ETB Help Desk</div></div>
        </div>
        <div className="navlbl">Operación</div>
        {items.map((it) => (
          <button key={it.key} className={"nav" + (section === it.key ? " on" : "")} onClick={() => setSection(it.key)}>
            <it.icon size={17} /><span>{it.label}</span>
          </button>
        ))}
        <div className="sidefoot">
          <button className="signout" onClick={toggleTema}>{tema === "dark" ? <Sun size={15} /> : <Moon size={15} />}<span>{tema === "dark" ? "Modo claro" : "Modo oscuro"}</span></button>
          {instalable && <button className="signout instbtn" onClick={instalar}><Download size={15} /><span>Instalar app</span></button>}
          <div className="cosbadge col-start">
            <span className="cosbadge-lbl">Operación a cargo de</span>
            <img src="/groupcos.png" alt="Group Cos" height={17} />
          </div>
          <div className="uchip"><div className="uava">{initials(perfil)}</div><div className="min0"><div className="uname">{perfil.nombre} {perfil.apellido}</div><div className="ucargo">{perfil.cargo}</div></div></div>
          <button className="signout" onClick={() => logout()}><LogOut size={15} /><span>Cerrar sesión</span></button>
          <div className="appcredit">Developed by Carlos Urrego · 2026 · Versión {APP_VERSION}</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div><div className="hello">{greet}, {perfil.nombre}</div><div className="helloSub">{new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</div></div>
          <div className="pulsewrap"><div className="pulsedot"><span className="liveblip" />EN VIVO</div><PulseLine /></div>
          {esPriv ? (
            <div className="rolepick">
              {(perfil.rol === "superadmin" ? (["superadmin", "coordinador", "senior", "agente"] as Rol[]) : (["coordinador", "senior", "agente"] as Rol[])).map((r) => (
                <button key={r} className={"roleopt" + (vista === r ? " on" : "")} onClick={() => cambiarVista(r)}>{({ superadmin: "Admin", coordinador: "Coord.", senior: "Senior", agente: "Agente" } as any)[r]}</button>
              ))}
            </div>
          ) : <div className="chip neutral">{perfil.cargo}</div>}
          {perfil.rol !== "agente" && <BuscadorCaso />}
          {(rolEfectivo === "agente" || rolEfectivo === "senior") && (
            <div className="notifwrap">
              <button className="notifbtn" title="Notificaciones" onClick={() => { setNotifOpen(!notifOpen); setNoLeidas(0); }}>
                <Bell size={17} />
                {noLeidas > 0 && <span className="notifbadge">{noLeidas}</span>}
              </button>
              {notifOpen && (
                <div className="notifpanel">
                  <div className="h2 mb6" style={{ fontSize: 13 }}>Notificaciones</div>
                  {notifs.length === 0 && <div className="sub small">Nada nuevo por ahora. Aquí verás los casos que te repartan o te pasen y los mensajes masivos.</div>}
                  {notifs.map((n) => (
                    <div key={n.id} className="notifitem">
                      <div className="s12">
                        {n.tipo === "masivo" && <span className="chip bajo s11" style={{ marginRight: 6 }}>Masivo</span>}
                        {n.texto}
                      </div>
                      <div className="sub tiny">{new Date(n.at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="topbar-cliente"><span className="cliente-lbl">Cliente</span><img src="/etb.png" alt="eTb" height={26} /></div>
        </header>

        <div className="content">
          {vista === "agente" && section === "horario" && <HorariosView perfil={perfil} />}
          {vista === "agente" && section === "no_habil" && <PoolNoHabilView perfil={perfil} fire={fire} />}
          {vista === "agente" && section === "repartir" && repartoAgente && <SeniorView perfil={perfil} fire={fire} />}
          {vista === "agente" && section !== "horario" && section !== "repartir" && section !== "no_habil" && <AgentView perfil={perfil} catalogo={catalogo} fire={fire} />}
          {vista === "senior" && section === "repartir" && <SeniorView perfil={perfil} fire={fire} />}
          {vista === "senior" && section === "bandeja" && <AgentView perfil={perfil} catalogo={catalogo} fire={fire} incluirSenior />}
          {vista === "senior" && section === "no_habil" && <PoolNoHabilView perfil={perfil} fire={fire} />}
          {vista === "senior" && section === "contenedor" && <ContenedorGeneralView perfil={perfil} fire={fire} />}
          {vista === "senior" && section === "carga" && <CargaView perfil={perfil} />}
          {vista === "senior" && section === "distribucion" && <DistribucionView perfil={perfil} fire={fire} />}
          {vista === "senior" && section === "presencia" && <PresenciaView perfil={perfil} />}
          {vista === "senior" && section === "horario" && <HorariosView perfil={perfil} />}
          {vista === "coordinador" && section === "tablero" && <CoordView tab="tablero" />}
          {vista === "coordinador" && section === "auditoria" && <CoordView tab="auditoria" />}
          {vista === "coordinador" && section === "bandeja_equipo" && <BandejaEquipoView />}
          {vista === "coordinador" && section === "no_habil" && <PoolNoHabilView perfil={perfil} fire={fire} />}
          {vista === "coordinador" && section === "contenedor" && <ContenedorGeneralView perfil={perfil} fire={fire} />}
          {vista === "coordinador" && section === "carga" && <CargaView perfil={perfil} />}
          {vista === "coordinador" && section === "distribucion" && <DistribucionView perfil={perfil} fire={fire} />}
          {vista === "coordinador" && section === "presencia" && <PresenciaView perfil={perfil} />}
          {vista === "coordinador" && section === "estadisticas" && <EstadisticasView />}
          {vista === "coordinador" && section === "horario" && <HorariosView perfil={perfil} />}
          {vista === "coordinador" && section === "resumen" && <ResumenView />}
          {vista === "superadmin" && section === "tablero" && <CoordView tab="tablero" />}
          {vista === "superadmin" && section === "auditoria" && <CoordView tab="auditoria" />}
          {vista === "superadmin" && section === "bandeja_equipo" && <BandejaEquipoView />}
          {vista === "superadmin" && section === "no_habil" && <PoolNoHabilView perfil={perfil} fire={fire} />}
          {vista === "superadmin" && section === "contenedor" && <ContenedorGeneralView perfil={perfil} fire={fire} />}
          {vista === "superadmin" && section === "carga" && <CargaView perfil={perfil} />}
          {vista === "superadmin" && section === "distribucion" && <DistribucionView perfil={perfil} fire={fire} />}
          {vista === "superadmin" && section === "presencia" && <PresenciaView perfil={perfil} />}
          {vista === "superadmin" && section === "estadisticas" && <EstadisticasView />}
          {vista === "superadmin" && section === "horario" && <HorariosView perfil={perfil} />}
          {vista === "superadmin" && section === "resumen" && <ResumenView />}
          {vista === "superadmin" && section === "config" && <ConfigView catalogo={catalogo} reloadCatalogo={reloadCatalogo} fire={fire} />}
        </div>
      </div>
      {toast && <div className="toast"><Check size={16} color="#2BD0C3" />{toast}</div>}
      {idleGate && (
        <div className="overlay alta gate">
          <div className="alertcard">
            <div className="alertico" style={{ animation: "none" }}><ShieldCheck size={30} /></div>
            {idleGate === "pedir" ? (
              <>
                <div className="gatetitle">Activa la medición de tiempo activo</div>
                <div className="gatemsg">
                  Pulso registra tu tiempo activo en el equipo para calcular la productividad del turno.
                  Pulsa <b>Activar</b> y luego <b>Permitir</b> en el aviso del navegador.
                  Solo detecta si estás activo o ausente — nunca lee lo que escribes ni lo que ves.
                </div>
                <button className="btn primary block" onClick={() => idlePedirRef.current?.()}>Activar medición</button>
              </>
            ) : (
              <>
                <div className="gatetitle">El permiso quedó bloqueado</div>
                <div className="gatemsg">
                  El navegador tiene bloqueada la detección de actividad para Pulso.
                  Haz clic en el <b>candado</b> junto a la dirección → <b>Configuración del sitio</b> →
                  busca <b>Uso del dispositivo</b> (detección de inactividad) → <b>Permitir</b>, y recarga.
                </div>
                <button className="btn primary block" onClick={() => location.reload()}>Ya lo permití — recargar</button>
              </>
            )}
          </div>
        </div>
      )}
      {alertaIn && (
        <div className="overlay alta" onClick={cerrarAlerta}>
          <div className="alertcard" onClick={(e) => e.stopPropagation()}>
            <div className="alertico"><Bell size={30} /></div>
            <div className="alerttitle">Alerta de {alertaIn.de_nombre || "Coordinación"}</div>
            <div className="alertmsg">{alertaIn.mensaje}</div>
            <button className="btn primary block" onClick={cerrarAlerta}>Entendido</button>
          </div>
        </div>
      )}
      {anuncioActual && (
        <div className="overlay alta">
          <div className="alertcard">
            <div className="alertico" style={{ animation: "none" }}><Bell size={30} /></div>
            <div className="alerttitle">Anuncio de {anuncioActual.de_nombre || "Coordinación"}</div>
            <div className="alertmsg">{anuncioActual.mensaje}</div>
            {anuncioActual.requiere_respuesta && (
              <textarea className="inp mb12" rows={3} maxLength={500} placeholder="Escribe tu respuesta…"
                value={respAnuncio} onChange={(e) => setRespAnuncio(e.target.value)} style={{ textAlign: "left" }} />
            )}
            <button className="btn primary block" disabled={confirmandoAn || (anuncioActual.requiere_respuesta && !respAnuncio.trim())} onClick={confirmarAnuncio}>
              {anuncioActual.requiere_respuesta ? "Enviar respuesta" : "Enterado"}
            </button>
            {anuncios.length > 1 && <div className="sub tiny mt6">Tienes {anuncios.length - 1} anuncio(s) más por confirmar.</div>}
          </div>
        </div>
      )}
    </div>
    {perfilUser && <PerfilPersona user={perfilUser} onClose={() => setPerfilUser(null)} />}
    </PerfilCtx.Provider>
  );
}
