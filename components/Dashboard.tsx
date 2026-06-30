"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, Inbox, CalendarRange, Users, LogOut, Plus, Check, X, Phone,
  Mail, Wrench, KeyRound, ArrowUpRight, FileText, Settings2, AlertTriangle,
  TrendingUp, Search, ChevronRight, Upload, Eye, EyeOff, CircleDot,
  LayoutDashboard, ShieldCheck, Download, Printer, Clock,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Cell,
} from "recharts";
import * as XLSX from "xlsx";
import * as data from "@/lib/data";
import { crearUsuario, guardarHorarios, editarUsuario, bloquearUsuario, resetPassword } from "@/app/actions";
import { logout } from "@/app/login/actions";
import { CATS, type Usuario, type GestionTipo, type Categoria, type Rol } from "@/lib/types";

/* ─── helpers ─── */
const ICON: Record<Categoria, any> = {
  casos: FileText, comms: Mail, tecnico: Wrench, permisos: KeyRound,
  escal: ArrowUpRight, reunion: Users, interna: Settings2,
};
const hoy = () => new Date().toISOString().slice(0, 10);
const todayISO = hoy;
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
function Stat({ icon: Ico, value, label, color, pct }: any) {
  return (
    <div className="stat">
      <div className="statTop"><div className="statIco" style={{ background: color + "1A", color }}><Ico size={18} /></div></div>
      <div className="statVal" style={{ color }}>{value}</div>
      <div className="statLbl">{label}</div>
      {pct != null && <div className="statBar" style={{ width: pct + "%", background: color }} />}
    </div>
  );
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

  const reload = async () => {
    const [b, a] = await Promise.all([data.getMiBandeja(perfil.id), data.getMiActividad(perfil.id)]);
    setBandeja(b); setActividad(a); setLoading(false);
  };
  const reloadTurno = async () => {
    const [h, p] = await Promise.all([data.getMiHorarioHoy(perfil.id), data.getPausaActiva(perfil.id)]);
    setTurno(h); setPausa(p);
  };
  useEffect(() => { reload(); reloadTurno(); /* eslint-disable-next-line */ }, []);

  const salir = async (tipo: "break" | "almuerzo") => {
    setPausaBusy(true);
    try { await data.iniciarPausa(perfil.id, tipo); await reloadTurno(); fire(tipo === "break" ? "En break — tu tiempo está en pausa" : "En almuerzo — tu tiempo está en pausa"); }
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
  const lastGestOf = (id: string) => actividad.find((g) => g.asignacion_id === id);
  const tName = (id: string) => catalogo.find((c) => c.id === id)?.nombre ?? "—";
  const tCat = (id: string) => catalogo.find((c) => c.id === id)?.categoria ?? "casos";

  const onSave = async (m: any, tipoId: string, caso: string, min: number, seguir: boolean) => {
    try {
      if (m.nuevo) await data.agregarCasoNuevo({ userId: perfil.id, tipoId, numeroCaso: caso, minutos: min, seguir });
      else if (m.libre) await data.registrarLibre({ userId: perfil.id, tipoId, numeroCaso: caso, minutos: min });
      else await data.registrarGestion({ userId: perfil.id, tipoId, numeroCaso: caso, minutos: min, asignacionId: m.asignacion.id, seguir });
      setModal(null);
      fire(seguir ? "Gestión registrada — el caso sigue en tu bandeja" : "Gestión registrada");
      reload();
    } catch (e: any) { fire("Error: " + (e.message ?? "no se pudo guardar")); }
  };

  return (
    <>
      <div className="row-between">
        <div>
          <div className="eyebrow">Bandeja del día</div>
          <div className="h1">Tus casos de hoy</div>
          <div className="sub">Selecciona un caso y registra la gestión que hiciste. Si te llega un caso nuevo, agrégalo tú mismo.</div>
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
              <span className="pausachip"><CircleDot size={13} /> En {pausa.tipo === "almuerzo" ? "almuerzo" : "break"} desde {new Date(pausa.inicio).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
              <button className="btn primary sm" disabled={pausaBusy} onClick={volver}>Volví</button>
            </div>
          ) : (
            <>
              <button className="btn ghost sm" disabled={pausaBusy} onClick={() => salir("break")}>Salir a break</button>
              <button className="btn ghost sm" disabled={pausaBusy} onClick={() => salir("almuerzo")}>Salir a almuerzo</button>
            </>
          )}
        </div>
      </div>

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
          {loading && <div className="empty">Cargando…</div>}
          {!loading && bandeja.length === 0 && <div className="empty"><Inbox size={32} className="dim" /><div>Aún no tienes casos asignados hoy.<br />Tu senior los reparte a primera hora.</div></div>}
          <div className="col10">
            {bandeja.map((a) => {
              const lg = lastGestOf(a.id);
              return (
                <div key={a.id} className="casecard">
                  <div className="min0">
                    <div className="caseno">#{a.numero_caso}</div>
                    <div className="caseMeta">
                      {a.estado === "gestionado" ? <span className="chip done"><Check size={11} />Cerrado por hoy</span>
                        : a.estado === "progreso" ? <span className="chip prog"><CircleDot size={11} />En progreso</span>
                          : <span className="chip pend">Pendiente</span>}
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
                    <div className="mono actmeta">#{g.numero_caso} · {new Date(g.registrado_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {modal && <RegistrarModal modal={modal} catalogo={catalogo} incluirSenior={incluirSenior} onClose={() => setModal(null)} onSave={onSave} />}
    </>
  );
}

function RegistrarModal({ modal, catalogo, onClose, onSave, incluirSenior = false }: any) {
  const [tipoId, setTipoId] = useState<string | null>(null);
  const [caso, setCaso] = useState<string>(modal.asignacion?.numero_caso ?? "");
  const [min, setMin] = useState<string>("");
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const tipos = catalogo.filter((g: GestionTipo) => g.activo && (incluirSenior || !g.senior_only));
  const valid = tipoId && caso.trim() && min && +min > 0;
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
            <div className="grid minutosrow mt16">
              <div><label className="lbl">Número de caso</label>
                <input className="inp mono" value={caso} disabled={!!modal.asignacion} placeholder="0xxxxxxxx"
                  onChange={(e) => setCaso(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))} /></div>
              <div><label className="lbl">Minutos</label>
                <input className="inp mono" type="number" min={1} value={min} placeholder="10" onChange={(e) => setMin(e.target.value)} /></div>
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
            <button className="btn primary" disabled={!valid} onClick={() => setStep(2)}>Continuar</button>
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

  useEffect(() => { data.getEquipo().then((e) => { const ag = e.filter((u) => u.rol === "agente"); setEquipo(ag); setSel(ag[0]?.id ?? ""); }); }, []);
  useEffect(() => { if (sel) data.getMiBandeja(sel).then(setBandeja); }, [sel]);

  const target = equipo.find((u) => u.id === sel);
  const repartir = async () => {
    const casos = bulk.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!casos.length) return;
    try {
      await data.repartirSeguimiento({ userId: sel, seniorId: perfil.id, casos });
      setBulk(""); fire(`${casos.length} caso(s) asignados a ${target?.nombre}`);
      data.getMiBandeja(sel).then(setBandeja);
    } catch (e: any) { fire("Error: " + e.message); }
  };
  const quitar = async (id: string) => { await data.quitarAsignacion(id); data.getMiBandeja(sel).then(setBandeja); };

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
          <div className="card">
            <div className="row-between mb12"><div className="h2">Bandeja actual</div><span className="chip neutral">{bandeja.length} casos</span></div>
            {bandeja.length === 0 ? <div className="empty pad24">Sin casos asignados todavía.</div> :
              <div className="wrap8">
                {bandeja.map((a) => (
                  <div key={a.id} className="caseChip">
                    <span className="mono caseChipNo">#{a.numero_caso}</span>
                    {a.estado === "gestionado" ? <Check size={13} color="var(--ok)" /> : a.estado === "progreso" ? <CircleDot size={13} color="var(--warn)" /> : null}
                    {a.estado === "pendiente" && <button className="xbtn tiny" onClick={() => quitar(a.id)}><X size={12} /></button>}
                  </div>
                ))}
              </div>}
          </div>
        </div>
      </div>
    </>
  );
}

/* ════════════════ utilidades de rango y exportación ════════════════ */
const isoHace = (dias: number) => { const d = new Date(); d.setDate(d.getDate() - dias); return d.toISOString().slice(0, 10); };
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

/* ════════════════ VISTA COORDINADOR / TABLERO 360 ════════════════ */
function CoordView({ tab = "tablero" }: { tab?: "tablero" | "auditoria" }) {
  const [desde, setDesde] = useState(isoHace(6));
  const [hasta, setHasta] = useState(todayISO());
  const [kpis, setKpis] = useState<any>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [tend, setTend] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [tiposCaso, setTiposCaso] = useState<any[]>([]);
  const [gestDia, setGestDia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      try {
        const [k, rk, r, t, te, cl, tc, gd] = await Promise.all([
          data.gKpis(desde, hasta), data.gRanking(desde, hasta), data.gPorRol(desde, hasta),
          data.gPorTipo(desde, hasta), data.gTendencia(desde, hasta), data.gPorCliente(desde, hasta),
          data.gPorTipoCaso(desde, hasta), data.getGestionesDia(),
        ]);
        if (!vivo) return;
        setKpis(k); setRanking(rk); setRoles(r); setTipos(t); setTend(te); setClientes(cl); setTiposCaso(tc); setGestDia(gd);
      } finally { if (vivo) setLoading(false); }
    })();
    return () => { vivo = false; };
  }, [desde, hasta]);

  const porTipo = tipos.map((t) => ({ nombre: t.nombre.length > 22 ? t.nombre.slice(0, 20) + "…" : t.nombre, n: t.total, color: CATS[t.categoria as Categoria].color })).slice(0, 8);
  const tline = tend.map((d) => ({ dia: fmtFecha(d.dia), gestiones: d.gestiones, horas: +(d.minutos / 60).toFixed(1) }));
  const roleData = roles.map((r) => ({ rol: r.rol, efectividad: r.efectividad ?? 0, carga: r.carga ?? 0 }));
  const maxCli = Math.max(1, ...clientes.map((c) => c.minutos));

  const exportar = () => exportarExcel(`Pulso_${desde}_a_${hasta}`, [
    { nombre: "Resumen", filas: kpis ? [{ Desde: desde, Hasta: hasta, "Efectividad %": kpis.efectividad, "Productividad %": kpis.productividad, Gestiones: kpis.gestiones, "Tiempo (h)": +(kpis.minutos / 60).toFixed(1), Asignados: kpis.asignados, Gestionados: kpis.gestionados, Alertas: kpis.alertas }] : [] },
    { nombre: "Ranking", filas: ranking.map((r) => ({ Persona: firstLast(r.nombre, r.apellido), Cargo: r.cargo, Gestiones: r.gestiones, "Tiempo (h)": +(r.minutos / 60).toFixed(1), "Efectividad %": r.efectividad, "Carga %": r.carga })) },
    { nombre: "Por tipo", filas: tipos.map((t) => ({ Gestión: t.nombre, Cantidad: t.total, "Tiempo (h)": +(t.minutos / 60).toFixed(1) })) },
    { nombre: "Clientes", filas: clientes.map((c) => ({ Cliente: c.cliente, Casos: c.casos, Gestiones: c.gestiones, "Tiempo (h)": +(c.minutos / 60).toFixed(1) })) },
  ]);

  if (tab === "auditoria") {
    return (
      <>
        <div className="row-between end"><div><div className="eyebrow">Coordinación · Mayoristas</div><div className="h1">Auditoría de gestiones</div></div></div>
        <AuditTable gestiones={gestDia} />
      </>
    );
  }

  return (
    <div id="reporte">
      <div className="row-between end">
        <div><div className="eyebrow">Coordinación · Mayoristas</div><div className="h1">Tablero de operación</div></div>
        <div className="toolbar no-print">
          <RangoFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
          <button className="btn ghost sm" onClick={exportar}><Download size={14} />Excel</button>
          <button className="btn ghost sm" onClick={() => window.print()}><Printer size={14} />PDF</button>
        </div>
      </div>
      <div className="rango-print"><span className="sub small">Periodo: {fmtFecha(desde)} → {fmtFecha(hasta)}</span></div>

      {loading ? <div className="card mt20"><div className="empty">Cargando métricas…</div></div> : (
        <>
          <div className="grid six mt16">
            <Stat icon={TrendingUp} value={(kpis?.efectividad ?? 0) + "%"} label="Efectividad" color="#0098D6" pct={kpis?.efectividad ?? 0} />
            <Stat icon={Activity} value={(kpis?.productividad ?? "—") + (kpis?.productividad != null ? "%" : "")} label="Productividad" color="#6D5AE6" pct={kpis?.productividad ?? 0} />
            <Stat icon={Check} value={`${kpis?.gestionados ?? 0}/${kpis?.asignados ?? 0}`} label="Casos hechos / asignados" color="#26B07A" pct={kpis?.asignados ? (kpis.gestionados / kpis.asignados) * 100 : 0} />
            <Stat icon={Inbox} value={kpis?.gestiones ?? 0} label="Gestiones totales" color="#14B8C4" />
            <Stat icon={Clock} value={horas(kpis?.minutos ?? 0)} label="Tiempo registrado" color="#D858A0" />
            <Stat icon={AlertTriangle} value={kpis?.alertas ?? 0} label="Alertas de auditoría" color="#F2A33C" />
          </div>

          <div className="card mt15">
            <div className="row-between mb12"><div><div className="h2">Ranking del equipo</div><div className="sub small">Comparación por persona en el periodo. Ordenado por tiempo trabajado.</div></div></div>
            <div className="tblscroll">
              <table className="tbl">
                <thead><tr><th>#</th><th>Persona</th><th>Cargo</th><th>Gestiones</th><th>Tiempo</th><th>Efectividad</th><th>Carga</th></tr></thead>
                <tbody>
                  {ranking.filter((r) => r.gestiones > 0 || r.asignados > 0).map((r, i) => (
                    <tr key={r.user_id}>
                      <td className="mono soft">{i + 1}</td>
                      <td className="bold">{firstLast(r.nombre, r.apellido)}</td>
                      <td><span className="chip neutral">{r.cargo}</span></td>
                      <td className="mono">{r.gestiones}</td>
                      <td className="mono bold">{horas(r.minutos)}</td>
                      <td className="mono">{r.efectividad != null ? r.efectividad + "%" : "—"}</td>
                      <td>{r.carga != null ? <span className={"chip " + (r.carga >= 90 ? "alto" : r.carga >= 35 ? "bajo" : "sin")}>{r.carga}%</span> : <span className="faint">—</span>}</td>
                    </tr>
                  ))}
                  {ranking.every((r) => !r.gestiones && !r.asignados) && <tr><td colSpan={7}><div className="empty pad24">Sin actividad en el periodo seleccionado.</div></td></tr>}
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
            <div className="h2 mb14">Evolución en el tiempo</div>
            <div className="legend"><span className="legdot"><i style={{ background: "#0098D6" }} />Gestiones</span><span className="legdot"><i style={{ background: "#6D5AE6" }} />Horas</span></div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={tline} margin={{ left: -18 }}>
                <CartesianGrid vertical={false} stroke="#EEF1F6" />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "#5C6883" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} />
                <Line type="monotone" dataKey="gestiones" stroke="#0098D6" strokeWidth={2.5} dot={{ r: 2, fill: "#0098D6" }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="horas" stroke="#6D5AE6" strokeWidth={2.5} dot={{ r: 2, fill: "#6D5AE6" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="sub tiny mt6">Los fines de semana bajan por menor demanda entrante — es esperable, no es bajo rendimiento.</div>
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
              <div className="h2 mb4">Tiempo por tipo de caso <span className="sfbadge">Salesforce</span></div>
              <div className="sub small mb12">Qué clase de caso consume más horas.</div>
              {tiposCaso.length === 0 ? <div className="empty pad24">Sin datos de Salesforce todavía.</div> :
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={tiposCaso.map((t) => ({ nombre: (t.etiqueta || "").slice(0, 20), h: +(t.minutos / 60).toFixed(1) }))} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid horizontal={false} stroke="#EEF1F6" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#95A1B9" }} axisLine={false} tickLine={false} unit="h" />
                    <YAxis type="category" dataKey="nombre" width={120} tick={{ fontSize: 10.5, fill: "#5C6883" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E1E9F3", fontSize: 12 }} />
                    <Bar dataKey="h" name="Horas" fill="#14B8C4" radius={[0, 5, 5, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════ RESUMEN EJECUTIVO (para dirección) ════════════════ */
function ResumenView() {
  const [desde, setDesde] = useState(isoHace(6));
  const [hasta, setHasta] = useState(todayISO());
  const [kpis, setKpis] = useState<any>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      try {
        const [k, rk, cl, tp] = await Promise.all([
          data.gKpis(desde, hasta), data.gRanking(desde, hasta), data.gPorCliente(desde, hasta), data.gPorTipo(desde, hasta),
        ]);
        if (!vivo) return; setKpis(k); setRanking(rk); setClientes(cl); setTipos(tp);
      } finally { if (vivo) setLoading(false); }
    })();
    return () => { vivo = false; };
  }, [desde, hasta]);

  const top = [...ranking].filter((r) => r.gestiones > 0).slice(0, 3);
  const topCliente = clientes[0];
  const topTipo = tipos[0];

  return (
    <div id="reporte">
      <div className="row-between end">
        <div><div className="eyebrow">Resumen ejecutivo · Group COS para ETB</div><div className="h1">Operación Mayoristas</div></div>
        <div className="toolbar no-print">
          <RangoFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
          <button className="btn primary sm" onClick={() => window.print()}><Printer size={14} />Exportar PDF</button>
        </div>
      </div>
      <div className="rango-print"><span className="sub small">Periodo: {fmtFecha(desde)} → {fmtFecha(hasta)}</span></div>

      {loading ? <div className="card mt20"><div className="empty">Preparando resumen…</div></div> : (
        <>
          <div className="grid four mt16">
            <Stat icon={TrendingUp} value={(kpis?.efectividad ?? 0) + "%"} label="Efectividad del equipo" color="#0098D6" pct={kpis?.efectividad ?? 0} />
            <Stat icon={Activity} value={(kpis?.productividad ?? "—") + (kpis?.productividad != null ? "%" : "")} label="Productividad" color="#6D5AE6" pct={kpis?.productividad ?? 0} />
            <Stat icon={Inbox} value={kpis?.gestiones ?? 0} label="Gestiones realizadas" color="#26B07A" />
            <Stat icon={Clock} value={horas(kpis?.minutos ?? 0)} label="Tiempo productivo" color="#14B8C4" />
          </div>

          <div className="grid three mt15">
            <div className="card">
              <div className="eyebrow mb12">Top desempeño</div>
              {top.length === 0 ? <div className="sub">Sin datos.</div> : top.map((r, i) => (
                <div key={r.user_id} className="podio">
                  <span className={"podionum p" + i}>{i + 1}</span>
                  <div className="grow"><div className="pname">{firstLast(r.nombre, r.apellido)}</div><div className="sub tiny">{r.cargo}</div></div>
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

function AuditTable({ gestiones }: { gestiones: any[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<any>(null);
  const uName = (g: any) => g.usuarios ? firstLast(g.usuarios.nombre, g.usuarios.apellido) : "—";
  const rows = gestiones
    .map((g) => ({ ...g, alert: g.gestiones_catalogo && g.minutos > g.gestiones_catalogo.umbral_min * 1.8 }))
    .filter((g) => { const s = q.toLowerCase(); return !q || g.numero_caso.includes(q) || uName(g).toLowerCase().includes(s) || (g.gestiones_catalogo?.nombre ?? "").toLowerCase().includes(s); })
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
          <table className="tbl">
            <thead><tr><th>Persona</th><th>Gestión</th><th>Caso</th><th>Min.</th><th>Hora</th><th></th></tr></thead>
            <tbody>
              {rows.map((g) => {
                const cat = g.gestiones_catalogo?.categoria as Categoria;
                return (
                  <tr key={g.id} className={g.alert ? "row-alert" : ""}>
                    <td className="bold">{uName(g)}</td>
                    <td><span className="dotname"><span className="catdot" style={{ background: cat ? CATS[cat].color : "#ccc" }} />{g.gestiones_catalogo?.nombre ?? "—"}</span></td>
                    <td className="mono s12">#{g.numero_caso}</td>
                    <td className={"mono bold " + (g.alert ? "danger" : "")}>{g.minutos}{g.alert && <AlertTriangle size={12} className="inlineicon" />}</td>
                    <td className="mono soft s12">{hh(g.registrado_at)}</td>
                    <td><button className="btn ghost sm" onClick={() => setSel(g)}>Revisar</button></td>
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
            <div className="modalHead"><div><div className="h2">Detalle de la gestión</div><div className="mono sub mt3">Caso #{sel.numero_caso}</div></div><button className="xbtn" onClick={() => setSel(null)}><X size={16} /></button></div>
            <div className="modalBody">
              {[["Persona", uName(sel)], ["Gestión", sel.gestiones_catalogo?.nombre ?? "—"], ["Minutos declarados", sel.minutos + " min"], ["Tiempo típico", "≈ " + (sel.gestiones_catalogo?.umbral_min ?? "—") + " min"], ["Hora", hh(sel.registrado_at)]].map(([k, v]) => (
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
          {[["gestiones", "Gestiones"], ["usuarios", "Usuarios"], ["horarios", "Horarios"], ["presencia", "Presencia"]].map(([k, l]) =>
            <button key={k} className={"roleopt" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      </div>
      <div className="mt8">
        {tab === "gestiones" && <GestionConfig catalogo={catalogo} reload={reloadCatalogo} fire={fire} />}
        {tab === "usuarios" && <UserConfig fire={fire} />}
        {tab === "horarios" && <><HorarioConfig /><HorarioSemana /></>}
        {tab === "presencia" && <PresenciaView />}
      </div>
    </>
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

function UserConfig({ fire }: { fire: (m: string) => void }) {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any>(null);   // usuario en edición
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>({ nombre: "", apellido: "", login: "", code: "", cargo: "Agente", rol: "agente", password: "Cos2026*" });
  const reload = () => data.getUsuarios().then(setUsers);
  useEffect(() => { reload(); }, []);

  const add = async () => {
    if (!f.nombre.trim() || !f.login.trim()) { fire("Escribe al menos nombre y usuario."); return; }
    setBusy(true);
    try {
      const r = await crearUsuario(f);
      if (!r.ok) { fire(r.error ?? "No se pudo crear el usuario."); return; }
      setModal(false); setF({ nombre: "", apellido: "", login: "", code: "", cargo: "Agente", rol: "agente", password: "Cos2026*" }); fire("Usuario creado"); reload();
    } catch (e: any) { fire("Error inesperado: " + (e?.message ?? "")); }
    finally { setBusy(false); }
  };

  const abrirEdit = (u: Usuario) => setEdit({ id: u.id, nombre: u.nombre, apellido: u.apellido ?? "", code: u.code ?? "", cargo: u.cargo ?? "Agente", rol: u.rol, bloqueado: !!u.bloqueado, nuevaPass: "" });
  const guardarEdit = async () => {
    setBusy(true);
    try {
      await editarUsuario(edit.id, { nombre: edit.nombre, apellido: edit.apellido, code: edit.code, cargo: edit.cargo, rol: edit.rol });
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

  return (
    <>
      <div className="card nopad">
        <div className="tblhead">
          <div><div className="h2">Usuarios del equipo</div><div className="sub small">Crea accesos, edita rol/cargo/código, resetea claves y bloquea accesos. Las contraseñas se guardan cifradas — nadie las ve, ni tú.</div></div>
          <button className="btn primary" onClick={() => setModal(true)}><Plus size={16} />Nuevo usuario</button>
        </div>
        <div className="tblscroll">
          <table className="tbl">
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Código</th><th>Rol</th><th>Cargo</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => {
                const e = estadoUsuario(u);
                return (
                  <tr key={u.id}>
                    <td className="bold nameCell"><span className="uava xsmall">{initials(u)}</span>{u.nombre} {u.apellido}</td>
                    <td className="mono s12">{u.login}</td>
                    <td className="mono s12">{u.code || <span className="faint">—</span>}</td>
                    <td><span className="chip neutral">{u.rol}</span></td>
                    <td className="s12">{u.cargo}</td>
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
                    {["Agente", "Junior", "Junior ENEL", "Junior Back", "Junior Líder", "Analista", "Analista Proyectos", "Senior"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div></div>
              </div>
              <div className="sub tiny mt8">La contraseña temporal la cambiará la persona en su primer ingreso. El <b>código operativo</b> empareja con el Excel de horarios.</div>
            </div>
            <div className="modalFoot"><button className="btn ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn primary" disabled={busy} onClick={add}>{busy ? "Creando…" : "Crear usuario"}</button></div>
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
              <div className="mt12"><label className="lbl">Cargo (puesto real)</label>
                <select className="inp" value={edit.cargo} onChange={(e) => setEdit({ ...edit, cargo: e.target.value })}>
                  {["Agente", "Junior", "Junior ENEL", "Junior Back", "Junior Líder", "Analista", "Analista Proyectos", "Senior"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>

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
function PresenciaView() {
  const [filas, setFilas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const cargar = () => data.getPresencia().then((d) => { setFilas(d); setLoading(false); });
  useEffect(() => { cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t); }, []);
  const enLinea = filas.filter((f) => f.en_linea).length;

  return (
    <div className="card nopad">
      <div className="tblhead">
        <div><div className="h2">Equipo · presencia de hoy</div><div className="sub small">Tiempo que cada persona ha estado con la app abierta y cuánto break/almuerzo lleva. Se actualiza solo.</div></div>
        <span className="chip done"><span className="liveblip" /> {enLinea} en línea</span>
      </div>
      <div className="tblscroll">
        <table className="tbl">
          <thead><tr><th>Persona</th><th>Cargo</th><th>Estado</th><th>Última conexión</th><th>Tiempo logueado</th><th>En pausa</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6}><div className="empty">Cargando…</div></td></tr>}
            {!loading && filas.map((f) => (
              <tr key={f.user_id}>
                <td className="bold nameCell"><span className="uava xsmall">{(f.nombre?.[0] ?? "") + (f.apellido?.[0] ?? "")}</span>{f.nombre} {f.apellido}</td>
                <td className="s12">{f.cargo}</td>
                <td>{f.en_linea ? <span className="chip done"><span className="liveblip" /> En línea</span> : <span className="chip sin">Desconectado</span>}</td>
                <td className="mono s12">{f.ultimo ? new Date(f.ultimo).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : <span className="faint">—</span>}</td>
                <td className="mono bold primary">{fmtMin(f.minutos_logueado || 0)}</td>
                <td className="mono s12">{f.minutos_pausa ? fmtMin(f.minutos_pausa) : <span className="faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      if (!map.has(id)) map.set(id, { nombre: h.usuarios ? `${h.usuarios.nombre} ${h.usuarios.apellido ?? ""}` : "—", cargo: h.usuarios?.cargo ?? "", dias: {} as any });
      const d = (new Date(h.fecha + "T12:00:00").getDay() + 6) % 7;
      map.get(id).dias[d] = h;
    });
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [filas]);

  return (
    <div className="card nopad mt15">
      <div className="tblhead">
        <div><div className="h2">Horario semanal · Mayoristas</div><div className="sub small">Turno de cada persona por día. Cámbiate de semana con la fecha.</div></div>
        <input type="date" className="inp dateinp" value={monday} onChange={(e) => { const d = new Date(e.target.value + "T12:00:00"); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); setMonday(d.toISOString().slice(0, 10)); }} />
      </div>
      <div className="tblscroll">
        {loading ? <div className="empty pad24">Cargando…</div> : personas.length === 0 ? <div className="empty pad24">No hay horarios cargados para esta semana.</div> :
          <table className="tbl horsem">
            <thead><tr><th className="stickyc">Persona</th>{DIAS.map((d, i) => <th key={i} className="diacol">{d}<br /><span className="faint tiny">{new Date(_addDays(monday, i) + "T12:00:00").getDate()}</span></th>)}</tr></thead>
            <tbody>
              {personas.map((p, i) => (
                <tr key={i}>
                  <td className="stickyc bold s12">{p.nombre}<div className="sub tiny">{p.cargo}</div></td>
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

/* ════════════════ SHELL ════════════════ */
type NavItem = { key: string; label: string; icon: any };
const NAV: Record<Rol, NavItem[]> = {
  agente: [{ key: "bandeja", label: "Mi bandeja", icon: Inbox }],
  senior: [
    { key: "repartir", label: "Repartir seguimiento", icon: CalendarRange },
    { key: "bandeja", label: "Mi bandeja", icon: Inbox },
  ],
  coordinador: [
    { key: "tablero", label: "Tablero", icon: LayoutDashboard },
    { key: "auditoria", label: "Auditoría", icon: ShieldCheck },
    { key: "resumen", label: "Resumen ejecutivo", icon: FileText },
  ],
  superadmin: [
    { key: "tablero", label: "Tablero", icon: LayoutDashboard },
    { key: "auditoria", label: "Auditoría", icon: ShieldCheck },
    { key: "resumen", label: "Resumen ejecutivo", icon: FileText },
    { key: "config", label: "Configuración", icon: Settings2 },
  ],
};

export default function Dashboard({ perfil }: { perfil: Usuario }) {
  const [catalogo, setCatalogo] = useState<GestionTipo[]>([]);
  const [vista, setVista] = useState<Rol>(perfil.rol);
  const [section, setSection] = useState<string>(NAV[perfil.rol][0].key);
  const [toast, setToast] = useState<string | null>(null);
  const reloadCatalogo = () => data.getCatalogo().then(setCatalogo);
  useEffect(() => { reloadCatalogo(); }, []);

  // Presencia: abre una sesión, late cada minuto y la cierra al salir.
  useEffect(() => {
    let id: string | null = null;
    let timer: any;
    (async () => {
      id = await data.iniciarSesion();
      if (id) timer = setInterval(() => data.latido(id!), 60000);
    })();
    const cerrar = () => { if (id) data.cerrarSesion(id); };
    window.addEventListener("beforeunload", cerrar);
    return () => { clearInterval(timer); window.removeEventListener("beforeunload", cerrar); cerrar(); };
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);
  const fire = (m: string) => setToast(m);
  const esPriv = perfil.rol === "superadmin" || perfil.rol === "coordinador";
  const greet = new Date().getHours() < 12 ? "Buenos días" : new Date().getHours() < 19 ? "Buenas tardes" : "Buenas noches";

  // Cambiar de perspectiva (Admin/Coord/Senior/Agente) reinicia a su primera sección.
  const cambiarVista = (r: Rol) => { setVista(r); setSection(NAV[r][0].key); };
  const items = NAV[vista] ?? [];

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="brandmark-logo"><img src="/pulso-mark.png" alt="Pulso" /></div>
          <div><div className="brandname">Pulso</div><div className="brandsub">Group COS · ETB Mayoristas</div></div>
        </div>
        <div className="navlbl">Operación</div>
        {items.map((it) => (
          <button key={it.key} className={"nav" + (section === it.key ? " on" : "")} onClick={() => setSection(it.key)}>
            <it.icon size={17} /><span>{it.label}</span>
          </button>
        ))}
        <div className="sidefoot">
          <div className="cosbadge col-start">
            <span className="cosbadge-lbl">Operación a cargo de</span>
            <img src="/groupcos.png" alt="Group Cos" height={17} />
          </div>
          <div className="uchip"><div className="uava">{initials(perfil)}</div><div className="min0"><div className="uname">{perfil.nombre} {perfil.apellido}</div><div className="ucargo">{perfil.cargo}</div></div></div>
          <button className="signout" onClick={() => logout()}><LogOut size={15} /><span>Cerrar sesión</span></button>
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
          <div className="topbar-cliente"><span className="cliente-lbl">Cliente</span><img src="/etb.png" alt="eTb" height={26} /></div>
        </header>

        <div className="content">
          {vista === "agente" && <AgentView perfil={perfil} catalogo={catalogo} fire={fire} />}
          {vista === "senior" && section === "repartir" && <SeniorView perfil={perfil} fire={fire} />}
          {vista === "senior" && section === "bandeja" && <AgentView perfil={perfil} catalogo={catalogo} fire={fire} incluirSenior />}
          {vista === "coordinador" && section === "tablero" && <CoordView tab="tablero" />}
          {vista === "coordinador" && section === "auditoria" && <CoordView tab="auditoria" />}
          {vista === "coordinador" && section === "resumen" && <ResumenView />}
          {vista === "superadmin" && section === "tablero" && <CoordView tab="tablero" />}
          {vista === "superadmin" && section === "auditoria" && <CoordView tab="auditoria" />}
          {vista === "superadmin" && section === "resumen" && <ResumenView />}
          {vista === "superadmin" && section === "config" && <ConfigView catalogo={catalogo} reloadCatalogo={reloadCatalogo} fire={fire} />}
        </div>
      </div>
      {toast && <div className="toast"><Check size={16} color="#2BD0C3" />{toast}</div>}
    </div>
  );
}
