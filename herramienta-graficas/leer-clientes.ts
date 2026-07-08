/**
 * Lee la base de clientes (NIT → Segmento) para clasificar la bolsa de INC.
 *
 * En la base "IVR AXEDE / UEN EMPRESAS", el segmento del comité se deriva de la
 * columna `AGENTE_SEGUIMIENTO` (ej. "AGENTE ELITE DISTRITO" → Distrito), que
 * concuerda 98,9% con la segmentación del semáforo — mucho mejor que
 * `SEGMENTO_UEN` (79%) o `SEGMENTO` (12%). Si ese campo no existe, se intenta con
 * `SEGMENTO_UEN` / `Segmento`.
 */
import * as XLSX from "xlsx";
import { col, Fila, norm } from "./util";

/** Normaliza un NIT a solo dígitos (quita puntos, guiones, espacios y ".0"). */
export function nitNorm(v: unknown): string {
  return String(v ?? "")
    .replace(/\.0+$/, "")
    .replace(/[^0-9]/g, "");
}

/**
 * Deriva la clave de segmento del comité a partir de cualquier texto que la
 * contenga (nombre de la célula/agente/segmento). Devuelve "" si no aplica
 * (hogar/residencial u otros que no van al comité). El orden importa: "ELITE"
 * aparece en todos los "AGENTE ELITE …", así que va de último.
 */
export function clasificarSegmento(texto: unknown): string {
  const t = String(texto ?? "").toUpperCase();
  if (/HOGAR|\bMEN\b|RESIDEN/.test(t)) return "";
  if (/DISTR/.test(t)) return "distrito";
  if (/MAYOR/.test(t)) return "mayoristas";
  if (/PREMI/.test(t)) return "premium";
  if (/GOLD/.test(t)) return "gold";
  if (/SILVE/.test(t)) return "silver";
  if (/ELITE|[ée]lite/.test(t)) return "elite";
  return "";
}

export function leerClientes(ruta: string): Map<string, string> {
  const wb = XLSX.readFile(ruta);
  const mapa = new Map<string, string>();
  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets[hoja], { defval: "" });
    for (const f of filas) {
      const nit = nitNorm(
        col(f, "ID_IDENTIFICACION", "NIT", "Número de Identificación", "Numero de Identificacion", "Identificacion", "Documento")
      );
      if (!nit || mapa.has(nit)) continue;
      const seg =
        clasificarSegmento(col(f, "AGENTE_SEGUIMIENTO", "Agente Seguimiento", "Celula", "CELULA_HDP")) ||
        clasificarSegmento(col(f, "SEGMENTO_UEN", "Segmento UEN", "Segmento", "Segment"));
      if (seg) mapa.set(nit, seg);
    }
  }
  return mapa;
}
