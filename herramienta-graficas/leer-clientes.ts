/**
 * Lee una base de clientes (NIT → Segmento) para clasificar la bolsa de INC.
 * Acepta cualquier hoja que tenga una columna de identificación (NIT / Número de
 * Identificación / Documento) y una de Segmento.
 */
import * as XLSX from "xlsx";
import { claveSegmento } from "./leer-semaforo";
import { col, Fila, norm } from "./util";

/** Normaliza un NIT a solo dígitos (quita puntos, guiones, espacios y ".0"). */
export function nitNorm(v: unknown): string {
  return String(v ?? "")
    .replace(/\.0+$/, "")
    .replace(/[^0-9]/g, "");
}

export function leerClientes(ruta: string): Map<string, string> {
  const wb = XLSX.readFile(ruta);
  const mapa = new Map<string, string>();
  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets[hoja], { defval: "" });
    for (const f of filas) {
      const nit = nitNorm(col(f, "NIT", "Número de Identificación", "Numero de Identificacion", "Identificacion", "Documento", "Cedula"));
      const seg = String(col(f, "Segmento", "Segment", "Mesa", "Esquema de Atención") ?? "").trim();
      if (nit && seg && !/sinmesa|novan/.test(norm(seg))) {
        if (!mapa.has(nit)) mapa.set(nit, claveSegmento(seg));
      }
    }
  }
  return mapa;
}
