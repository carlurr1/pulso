/**
 * Lee el reporte de llamadas del ACD (formato "NS_SOPORTE": una fila por DÍA)
 * y lo agrega por campaña. Calcula tanto el promedio como el total de los días
 * con datos; quien consume (fusionarLlamadas) aplica el criterio del comité:
 *
 *   Ofrecidas, Atendidas  → TOTAL (suma de los días)
 *   NS, NA                → PROMEDIO diario, convertido a porcentaje (×100)
 *   AHT (HT)              → PROMEDIO diario del tiempo de operación (05_tmo)
 *
 * Los encabezados toleran acentos/mayúsculas y aceptan varios alias.
 */
import * as XLSX from "xlsx";
import { col, Fila, norm, num, txt } from "./util";

export type LlamadasAgregado = {
  campana: string;
  dias: number;
  // promedios (lo que pidió el comité)
  ofrecidas: number;
  atendidas: number;
  ns: number; // %
  na: number; // %
  aht: number; // segundos
  // totales / suma (alternativa)
  ofrecidasTotal: number;
  atendidasTotal: number;
};

const prom = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const suma = (a: number[]) => a.reduce((s, x) => s + x, 0);

/** NS/NA pueden venir como proporción (0–1) o ya como porcentaje (0–100). */
function aPorcentaje(v: number): number {
  return v <= 1.5 ? v * 100 : v;
}

export function leerLlamadas(ruta: string): Map<string, LlamadasAgregado> {
  const wb = XLSX.readFile(ruta);
  const mapa = new Map<string, LlamadasAgregado>();

  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils
      .sheet_to_json<Fila>(wb.Sheets[hoja], { defval: "" })
      .filter((f) => txt(col(f, "Campaña", "Campana", "Segmento", "Cola", "Skill")) && col(f, "Ofrecidas", "Offered") !== "");

    const porCampana = new Map<string, Fila[]>();
    for (const f of filas) {
      const c = txt(col(f, "Campaña", "Campana", "Segmento", "Cola", "Skill"));
      (porCampana.get(c) ?? porCampana.set(c, []).get(c)!).push(f);
    }

    for (const [campana, dias] of porCampana) {
      const of = dias.map((f) => num(col(f, "Ofrecidas", "Offered")));
      const at = dias.map((f) => num(col(f, "Atendidas", "Answered")));
      const ns = dias.map((f) => aPorcentaje(num(col(f, "NS", "NivelServicio", "NivelDeServicio"))));
      const na = dias.map((f) => aPorcentaje(num(col(f, "NA", "NivelAtencion", "NivelDeAtencion"))));
      // HT/AHT: tiempo de operación por día. En el export es "05_tmo"; hay alias.
      const ht = dias
        .map((f) => num(col(f, "05_tmo", "05tmo", "TMO", "AHT", "AHTseg", "HT")))
        .filter((x) => x > 0);

      mapa.set(norm(campana), {
        campana,
        dias: dias.length,
        ofrecidas: prom(of),
        atendidas: prom(at),
        ns: prom(ns),
        na: prom(na),
        aht: prom(ht),
        ofrecidasTotal: suma(of),
        atendidasTotal: suma(at),
      });
    }
  }

  return mapa;
}
