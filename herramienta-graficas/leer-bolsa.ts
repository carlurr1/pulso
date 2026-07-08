/**
 * Lee la bolsa de INC (archivo Bolsa_*.xlsx, hoja `BOLSA`) y arma, por segmento,
 * la tabla "Bolsa actual INC en gestión" (ESTADO × días abiertos).
 *
 *   Filtro: RESPONSABLE = "OTROS" (columna BM) — es la bolsa de OTROS.
 *   Filas   = ESTADO del incidente.
 *   Columnas (antigüedad) = DIAS_ABIERTO.
 *   Segmento = base de clientes (NIT → Segmento); si el NIT no está, respaldo
 *              con el mapa del semáforo. El encabezado real está en la 2ª fila.
 */
import * as XLSX from "xlsx";
import { nitNorm } from "./leer-clientes";
import { BolsaFila } from "./tipos";
import { norm } from "./util";

export type OpcionesBolsa = {
  responsable?: string; // por defecto "OTROS"
  /** Devuelve la clave de segmento para un NIT, o undefined si no se conoce. */
  segmentoDeNit: (nit: string) => string | undefined;
};

type Resultado = {
  porSegmento: Map<string, BolsaFila[]>;
  total: number;
  clasificados: number;
  sinSegmento: number;
};

export function leerBolsa(ruta: string, opciones: OpcionesBolsa): Resultado {
  const wb = XLSX.readFile(ruta);
  const hoja = wb.Sheets[wb.SheetNames.find((n) => norm(n) === "bolsa") || wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: "" });

  // El encabezado real es la fila con "ID_DE_LA_INCIDENCIA" (normalmente la 2ª).
  let headerRow = grid.findIndex((f) => (f || []).some((c) => norm(c) === "iddelaincidencia"));
  if (headerRow < 0) headerRow = 1;
  const header = (grid[headerRow] || []).map((h) => String(h).trim());
  const idx = (nombre: string) => header.findIndex((h) => h === nombre);

  const iResp = idx("RESPONSABLE");
  const iEstado = idx("ESTADO");
  const iDias = idx("DIAS_ABIERTO");
  const iNit = idx("NIT");

  const responsable = (opciones.responsable || "OTROS").toUpperCase();
  const conteo = new Map<string, Map<string, number>>(); // seg → (estado|dia → n)
  let total = 0;
  let clasificados = 0;

  for (let r = headerRow + 1; r < grid.length; r++) {
    const fila = grid[r] || [];
    if (!fila.some((c) => c !== "")) continue;
    if (String(fila[iResp]).trim().toUpperCase() !== responsable) continue;
    total++;

    const seg = opciones.segmentoDeNit(nitNorm(fila[iNit])) || "sinsegmento";
    if (seg !== "sinsegmento") clasificados++;

    const estado = String(fila[iEstado]).trim() || "SIN ESTADO";
    const dia = String(fila[iDias]).trim() || "-";
    const clave = `${estado}||${dia}`;
    const m = conteo.get(seg) ?? conteo.set(seg, new Map()).get(seg)!;
    m.set(clave, (m.get(clave) || 0) + 1);
  }

  const porSegmento = new Map<string, BolsaFila[]>();
  for (const [seg, m] of conteo) {
    const filas: BolsaFila[] = [];
    for (const [clave, cantidad] of m) {
      const [estado, dia] = clave.split("||");
      filas.push({ estado, dia, cantidad });
    }
    porSegmento.set(seg, filas);
  }

  return { porSegmento, total, clasificados, sinSegmento: total - clasificados };
}
