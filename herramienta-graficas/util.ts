/** Utilidades compartidas para leer hojas de Excel con encabezados flexibles. */

export type Fila = Record<string, unknown>;

/** Quita acentos, espacios y símbolos, y pasa a minúsculas (para comparar encabezados). */
export function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/** Valor de la primera columna cuyo encabezado coincida con alguno de los alias. */
export function col(fila: Fila, ...alias: string[]): unknown {
  const normAlias = alias.map(norm);
  for (const clave of Object.keys(fila)) {
    if (normAlias.includes(norm(clave))) return fila[clave];
  }
  return undefined;
}

/** Convierte a número admitiendo coma decimal ("97,98") y espacios. */
export function num(v: unknown, def = 0): number {
  if (v === undefined || v === null || v === "") return def;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : def;
}

export function txt(v: unknown, def = ""): string {
  if (v === undefined || v === null) return def;
  return String(v).trim() || def;
}
