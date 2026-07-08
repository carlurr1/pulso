/**
 * Lee el semáforo de soporte y calcula los INDICADORES OPERATIVOS por segmento.
 *
 * IMPORTANTE — el comité muestra los indicadores **Sin COFO**. El "Sin COFO" del
 * semáforo NO corresponde a la columna COFO de la BBDD (allí casi no hay COFO=1),
 * sino a un cálculo hecho en las tablas dinámicas. Por eso:
 *
 *   Resolutividad (%SNU)  → se LEE de la hoja `SN1`, bloque "Sin COFO" (%SNU).
 *   TMS general           → se LEE de la hoja `TMS`, bloque "Sin COFO" (Promedio de TMS).
 *
 * El desglose de TMS que las tablas no traen se CALCULA desde la hoja `BBDD`:
 *
 *   Nivel 1 (HDP) = área de solución empieza por "HDP" (≡ Escalado 0).
 *   TMS Telefónico N1 = promedio TMS de N1 con Origen = Teléfono.
 *   TMS Correo N1     = promedio TMS de N1 con Origen = Correo.
 *   TMS Nivel 2       = promedio TMS de los escalados (área ≠ HDP).
 *
 * La columna/valor TMS viene en DÍAS; se muestra como h:mm:ss (×24).
 */
import * as XLSX from "xlsx";
import { col, Fila, norm, num, txt } from "./util";

export type OperativoSegmento = {
  segmento: string;
  cerrados: number;
  n1: number;
  n2: number;
  resolutividad: number; // % (Sin COFO, leído del semáforo)
  tms: string; // h:mm:ss (Sin COFO, leído del semáforo)
  tmsTelefonicoN1: string;
  tmsCorreoN1: string;
  tmsN2: string;
  nTelefonico: number;
  nCorreo: number;
};

export type CorreoModo = "todos" | "electronico";

/** Quita el prefijo "N." del segmento y normaliza (sin acentos). */
export function claveSegmento(s: unknown): string {
  return norm(String(s ?? "").replace(/^\s*\d+\s*\.?\s*/, ""));
}

const esHDP = (area: unknown) => norm(area).startsWith("hdp");
const esTelefono = (origen: unknown) => /tel[eé]fono|llamada/i.test(String(origen));
const esCorreo = (origen: unknown, modo: CorreoModo) =>
  modo === "electronico" ? /correo\s*electr/i.test(String(origen)) : /correo/i.test(String(origen));

/** Convierte un promedio en DÍAS a texto "h:mm:ss" (horas totales). */
export function diasAHms(dias: number): string {
  if (!Number.isFinite(dias) || dias <= 0) return "0:00:00";
  const totalSeg = Math.round(dias * 24 * 3600);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const prom = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Mapa NIT → clave de segmento a partir de la BBDD del semáforo. Sirve como
 * respaldo para clasificar la bolsa de INC cuando un NIT no está en la base de
 * clientes. Solo dígitos en la llave.
 */
export function mapaNitSegmento(ruta: string): Map<string, string> {
  const wb = XLSX.readFile(ruta);
  const nombreHoja = wb.SheetNames.find((n) => norm(n) === "bbdd") || wb.SheetNames[0];
  const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets[nombreHoja], { defval: "" });
  const m = new Map<string, string>();
  for (const f of filas) {
    const nit = String(col(f, "Número de Identificación", "Numero de Identificacion", "NIT") ?? "")
      .replace(/\.0+$/, "")
      .replace(/[^0-9]/g, "");
    const seg = txt(col(f, "Segmento"));
    if (nit && seg && !/sinmesa|novan/.test(norm(seg)) && !m.has(nit)) m.set(nit, claveSegmento(seg));
  }
  return m;
}

/* --------- lectura de las tablas dinámicas oficiales (Sin COFO) ---------- */

type Grid = unknown[][];
const gridDe = (wb: XLSX.WorkBook, hoja: string): Grid =>
  wb.Sheets[hoja] ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, defval: "" }) : [];

/** Busca la primera celda cuyo texto normalizado cumpla el predicado. */
function buscar(grid: Grid, pred: (t: string) => boolean, desdeCol = 0): { r: number; c: number } | null {
  for (let r = 0; r < grid.length; r++) {
    const fila = grid[r] || [];
    for (let c = desdeCol; c < fila.length; c++) {
      if (pred(norm(fila[c]))) return { r, c };
    }
  }
  return null;
}

/** Lee pares (segmento → valor) de una tabla, dado el encabezado y sus columnas. */
function leerTablaSeg(grid: Grid, headerRow: number, segCol: number, valCol: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let r = headerRow + 1; r < grid.length; r++) {
    const seg = txt((grid[r] || [])[segCol]);
    if (!seg || norm(seg) === "totalgeneral") break;
    const v = num((grid[r] || [])[valCol]);
    if (Number.isFinite(v)) m.set(claveSegmento(seg), v);
  }
  return m;
}

/** %SNU (Resolutividad Sin COFO) desde la hoja SN1. */
function leerResolutividad(wb: XLSX.WorkBook): Map<string, number> {
  const grid = gridDe(wb, wb.SheetNames.find((n) => norm(n) === "sn1") || "SN1");
  const snu = buscar(grid, (t) => t.includes("snu")); // encabezado ".%SNU"
  if (!snu) return new Map();
  const filaHead = grid[snu.r] || [];
  // columna "Segmento" a la izquierda del %SNU en la misma fila de encabezados
  let segCol = -1;
  for (let c = snu.c; c >= 0; c--) if (norm(filaHead[c]) === "segmento") { segCol = c; break; }
  if (segCol < 0) return new Map();
  const m = leerTablaSeg(grid, snu.r, segCol, snu.c);
  // %SNU viene como fracción (0–1) → porcentaje
  for (const [k, v] of m) m.set(k, v <= 1.5 ? v * 100 : v);
  return m;
}

/** Promedio de TMS Sin COFO (en días) desde la hoja TMS. */
function leerTMSGeneral(wb: XLSX.WorkBook): Map<string, number> {
  const grid = gridDe(wb, wb.SheetNames.find((n) => norm(n) === "tms") || "TMS");
  const lbl = buscar(grid, (t) => t.includes("sincofo")); // etiqueta "SN1 Sin COFO"
  const desdeCol = lbl ? lbl.c : 0; // el bloque Sin COFO está a la derecha
  const tms = buscar(grid, (t) => t === "promediodetms", desdeCol);
  if (!tms) return new Map();
  const filaHead = grid[tms.r] || [];
  let segCol = -1;
  for (let c = tms.c; c >= desdeCol; c--) if (norm(filaHead[c]) === "segmento") { segCol = c; break; }
  if (segCol < 0) return new Map();
  return leerTablaSeg(grid, tms.r, segCol, tms.c);
}

/* -------------------- desglose TMS calculado desde BBDD ------------------- */

export function leerSemaforo(ruta: string, modoCorreo: CorreoModo = "todos"): Map<string, OperativoSegmento> {
  const wb = XLSX.readFile(ruta);

  const resolOficial = leerResolutividad(wb);
  const tmsOficial = leerTMSGeneral(wb);

  const nombreHoja = wb.SheetNames.find((n) => norm(n) === "bbdd") || wb.SheetNames[0];
  const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets[nombreHoja], { defval: "" });
  // Cerrados, excluyendo COFO=1 (equivale a "Sin COFO"; en la BBDD son poquísimos).
  const cerrados = filas.filter((f) => norm(col(f, "BASE")) === "cerrados" && String(col(f, "COFO")).trim() !== "1");

  const porSegmento = new Map<string, Fila[]>();
  for (const f of cerrados) {
    const seg = txt(col(f, "Segmento", "Segment"));
    if (!seg) continue;
    const k = claveSegmento(seg);
    (porSegmento.get(k) ?? porSegmento.set(k, []).get(k)!).push(f);
  }

  const tms = (f: Fila) => num(col(f, "TMS"));
  const areaCol = (f: Fila) => col(f, "BaseCerradosAreaSolucion", "Area Solucion", "AreaSolucion");
  const origenCol = (f: Fila) => col(f, "Origen del caso", "Origen");
  const conTMS = (arr: Fila[]) => arr.map(tms).filter((x) => x > 0);

  const resultado = new Map<string, OperativoSegmento>();
  for (const [k, g] of porSegmento) {
    const n1 = g.filter((f) => esHDP(areaCol(f)));
    const n2 = g.filter((f) => !esHDP(areaCol(f)) && txt(areaCol(f)) !== "");
    const tel = n1.filter((f) => esTelefono(origenCol(f)));
    const cor = n1.filter((f) => esCorreo(origenCol(f), modoCorreo));

    // Resolutividad y TMS general: valores oficiales del semáforo (Sin COFO).
    // Si no se pudieron leer, se calculan desde BBDD como respaldo.
    const resol =
      resolOficial.get(k) ?? (g.length ? (n1.length / g.length) * 100 : 0);
    const tmsGen = tmsOficial.has(k) ? diasAHms(tmsOficial.get(k)!) : diasAHms(prom(conTMS(g)));

    resultado.set(k, {
      segmento: txt(col(g[0], "Segmento")),
      cerrados: g.length,
      n1: n1.length,
      n2: n2.length,
      resolutividad: resol,
      tms: tmsGen,
      tmsTelefonicoN1: diasAHms(prom(conTMS(tel))),
      tmsCorreoN1: diasAHms(prom(conTMS(cor))),
      tmsN2: diasAHms(prom(conTMS(n2))),
      nTelefonico: tel.length,
      nCorreo: cor.length,
    });
  }

  return resultado;
}
