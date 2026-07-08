/**
 * Lee el semáforo de soporte (hoja `BBDD`, una fila por caso) y calcula los
 * INDICADORES OPERATIVOS por segmento, con la receta validada contra las tablas
 * dinámicas oficiales del semáforo:
 *
 *   Filtro base: BASE = "Cerrados".
 *   Nivel 1 (HDP)  = área de solución empieza por "HDP"  (≡ Escalado = 0).
 *   Nivel 2        = área de solución distinta de HDP     (≡ Escalado = 1).
 *
 *   Resolutividad (%SN1) = N1 / total, SOLO "Sin Falla Masiva".     (meta 78%)
 *   TMS general          = promedio de la columna TMS (días), TODOS los cerrados.
 *   TMS Telefónico N1    = promedio TMS de casos N1 con origen "Teléfono".
 *   TMS Correo N1        = promedio TMS de casos N1 con origen "Correo".
 *   TMS Nivel 2          = promedio TMS de casos N2.
 *
 * La columna TMS viene en DÍAS; se muestra como h:mm:ss (×24), igual que la
 * presentación de comité.
 */
import * as XLSX from "xlsx";
import { col, Fila, norm, num, txt } from "./util";

export type OperativoSegmento = {
  segmento: string; // nombre normalizado (Élite, Premium, Mayoristas, Gold, Distrito…)
  cerrados: number;
  n1: number;
  n2: number;
  resolutividad: number; // %
  tms: string; // h:mm:ss
  tmsTelefonicoN1: string;
  tmsCorreoN1: string;
  tmsN2: string;
  // diagnóstico
  nTelefonico: number;
  nCorreo: number;
};

/** Modo de conteo del correo (ver profiling del ACD/semáforo). */
export type CorreoModo = "todos" | "electronico";

/** Quita el prefijo "N." del segmento del semáforo y normaliza (sin acentos). */
export function claveSegmento(s: unknown): string {
  return norm(String(s ?? "").replace(/^\s*\d+\s*\.?\s*/, ""));
}

const esHDP = (area: unknown) => norm(area).startsWith("hdp");
const esTelefono = (origen: unknown) => /tel[eé]fono|llamada/i.test(String(origen));
const esCorreo = (origen: unknown, modo: CorreoModo) =>
  modo === "electronico" ? /correo\s*electr/i.test(String(origen)) : /correo/i.test(String(origen));

/** Convierte un promedio en DÍAS a texto "h:mm:ss" (horas totales, no días). */
export function diasAHms(dias: number): string {
  if (!Number.isFinite(dias) || dias <= 0) return "0:00:00";
  const totalSeg = Math.round(dias * 24 * 3600);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const prom = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function leerSemaforo(ruta: string, modoCorreo: CorreoModo = "todos"): Map<string, OperativoSegmento> {
  const wb = XLSX.readFile(ruta);
  const nombreHoja = wb.SheetNames.find((n) => norm(n) === "bbdd") || wb.SheetNames[0];
  const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets[nombreHoja], { defval: "" });

  const cerrados = filas.filter((f) => norm(col(f, "BASE")) === "cerrados");

  const porSegmento = new Map<string, Fila[]>();
  for (const f of cerrados) {
    const seg = txt(col(f, "Segmento", "Segment"));
    if (!seg) continue;
    const k = claveSegmento(seg);
    (porSegmento.get(k) ?? porSegmento.set(k, []).get(k)!).push(f);
  }

  const resultado = new Map<string, OperativoSegmento>();
  const tms = (f: Fila) => num(col(f, "TMS"));
  const areaCol = (f: Fila) => col(f, "BaseCerradosAreaSolucion", "Area Solucion", "AreaSolucion");
  const origenCol = (f: Fila) => col(f, "Origen del caso", "Origen");
  const sinFallaMasiva = (f: Fila) => norm(col(f, "Falla Masiva")) === "sinfallamasiva";
  const conTMS = (arr: Fila[]) => arr.map(tms).filter((x) => x > 0);

  for (const [k, g] of porSegmento) {
    // Resolutividad (%SN1): solo casos sin falla masiva (como el semáforo oficial).
    const sinFM = g.filter(sinFallaMasiva);
    const n1SinFM = sinFM.filter((f) => esHDP(areaCol(f))).length;
    const resolutividad = sinFM.length ? (n1SinFM / sinFM.length) * 100 : 0;

    // TMS: sobre todos los cerrados.
    const n1 = g.filter((f) => esHDP(areaCol(f)));
    const n2 = g.filter((f) => !esHDP(areaCol(f)) && txt(areaCol(f)) !== "");
    const tel = n1.filter((f) => esTelefono(origenCol(f)));
    const cor = n1.filter((f) => esCorreo(origenCol(f), modoCorreo));

    resultado.set(k, {
      segmento: txt(col(g[0], "Segmento")),
      cerrados: g.length,
      n1: n1.length,
      n2: n2.length,
      resolutividad,
      tms: diasAHms(prom(conTMS(g))),
      tmsTelefonicoN1: diasAHms(prom(conTMS(tel))),
      tmsCorreoN1: diasAHms(prom(conTMS(cor))),
      tmsN2: diasAHms(prom(conTMS(n2))),
      nTelefonico: tel.length,
      nCorreo: cor.length,
    });
  }

  return resultado;
}
