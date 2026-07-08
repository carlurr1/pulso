/**
 * Lee el libro de Excel de entrada y lo convierte en un `SegmentoData` por
 * segmento. El formato es "tidy" (una columna `Segmento` en cada hoja), de modo
 * que agregar/quitar segmentos es solo agregar/quitar filas.
 *
 * Hojas esperadas (los nombres y encabezados son flexibles: se normalizan
 * acentos y mayúsculas, y cada campo acepta varios alias):
 *
 *   Indicadores  — una fila por segmento con todos los KPIs y metas.
 *   Evolutivo    — Segmento | Periodo | Abiertos       (línea semanal)
 *   CasosMes     — Segmento | Mes     | Casos          (línea mensual)
 *   Desglose     — Segmento | Categoria(COFO/OTROS) | Dia | Cantidad
 *   BolsaINC     — Segmento | Estado  | Dia | Cantidad
 */
import * as XLSX from "xlsx";
import {
  BolsaFila,
  DesgloseFila,
  Indicadores,
  METAS_DEFECTO,
  PuntoSerie,
  SegmentoData,
} from "./tipos";
import { col, Fila, norm, num, txt } from "./util";

/** Segmento de una fila (varios alias). */
function segDe(fila: Fila): string {
  return txt(col(fila, "Segmento", "Segment", "Bolsa", "Cuenta"));
}

function hojaJSON(wb: XLSX.WorkBook, ...nombres: string[]): Fila[] {
  const normNombres = nombres.map(norm);
  const nombreReal = wb.SheetNames.find((n) => normNombres.includes(norm(n)));
  if (!nombreReal) return [];
  return XLSX.utils.sheet_to_json<Fila>(wb.Sheets[nombreReal], { defval: "" });
}

export function leerLibro(ruta: string): SegmentoData[] {
  const wb = XLSX.readFile(ruta);

  const filasInd = hojaJSON(wb, "Indicadores", "Indicators", "KPIs", "KPI");
  if (filasInd.length === 0) {
    throw new Error(
      `No encontré la hoja "Indicadores" en ${ruta}. ` +
        `Hojas presentes: ${wb.SheetNames.join(", ") || "(ninguna)"}`
    );
  }

  const evolutivo = hojaJSON(wb, "Evolutivo", "Evolution", "Semanal");
  const casosMes = hojaJSON(wb, "CasosMes", "CasosMensual", "Mensual", "PorMes");
  const desglose = hojaJSON(wb, "Desglose", "COFOOTROS", "SegundoNivel");
  const bolsa = hojaJSON(wb, "BolsaINC", "Bolsa", "INC");

  const porSegmento = (filas: Fila[], segmento: string) =>
    filas.filter((f) => norm(segDe(f)) === norm(segmento));

  const segmentos: SegmentoData[] = filasInd
    .filter((f) => segDe(f))
    .map((f) => {
      const segmento = segDe(f);

      const indicadores: Indicadores = {
        corte: txt(col(f, "Corte", "Fecha", "FechaCorte")),
        nivelServicio: num(col(f, "NivelServicio", "NS", "NivelDeServicio")),
        nivelAtencion: num(col(f, "NivelAtencion", "NA", "NivelDeAtencion")),
        ahtSeg: num(col(f, "AHT", "AHTseg", "AHTSegundos")),
        ofrecidas: num(col(f, "Ofrecidas", "Offered")),
        atendidas: num(col(f, "Atendidas", "Answered")),
        solicitudesMail: num(col(f, "SolicitudesMail", "Mail", "MailGestionadas", "SolicitudesMailGestionadas")),
        llamadasAtendidas: num(col(f, "LlamadasAtendidas", "TotalLlamadasAtendidas"), num(col(f, "Atendidas"))),
        casosCreadosLlamada: num(col(f, "CasosCreadosLlamada", "CasosCreadosPorLlamada", "CasosCreados")),
        resolutividad: num(col(f, "Resolutividad", "Resolutivity")),
        tms: txt(col(f, "TMS", "TMSTotal")),
        tmsTelefonicoN1: txt(col(f, "TMSTelefonicoN1", "TMSTelefonico", "TMSTelN1")),
        tmsCorreoN1: txt(col(f, "TMSCorreoN1", "TMSCorreo", "TMSMailN1")),
        tmsN2: txt(col(f, "TMSN2", "TMSNivel2")),
        primerNivel: num(col(f, "PrimerNivel", "N1")),
        segundoNivel: num(col(f, "SegundoNivel", "N2")),
        metaNS: num(col(f, "MetaNS"), METAS_DEFECTO.metaNS),
        metaNA: num(col(f, "MetaNA"), METAS_DEFECTO.metaNA),
        metaResolutividad: num(col(f, "MetaResolutividad", "MetaResol"), METAS_DEFECTO.metaResolutividad),
        metaTMS: txt(col(f, "MetaTMS"), METAS_DEFECTO.metaTMS),
      };

      const serie = (filas: Fila[], etiquetaAlias: string[], valorAlias: string[]): PuntoSerie[] =>
        porSegmento(filas, segmento).map((r) => ({
          etiqueta: txt(col(r, ...etiquetaAlias)),
          valor: num(col(r, ...valorAlias)),
        }));

      const desgloseSeg: DesgloseFila[] = porSegmento(desglose, segmento).map((r) => ({
        categoria: txt(col(r, "Categoria", "Categoría", "Tipo")).toUpperCase(),
        dia: txt(col(r, "Dia", "Día", "Dias", "Días")),
        cantidad: num(col(r, "Cantidad", "Total", "Casos")),
      }));

      const bolsaSeg: BolsaFila[] = porSegmento(bolsa, segmento).map((r) => ({
        estado: txt(col(r, "Estado", "EstadoINC", "Estado INC")),
        dia: txt(col(r, "Dia", "Día", "Dias", "Días")),
        cantidad: num(col(r, "Cantidad", "Total", "Casos")),
      }));

      return {
        segmento,
        campana: txt(col(f, "Campaña", "Campana", "Cola", "Skill")) || undefined,
        indicadores,
        evolutivo: serie(evolutivo, ["Periodo", "Semana", "Etiqueta"], ["Abiertos", "Casos", "Valor"]),
        casosMes: serie(casosMes, ["Mes", "Periodo", "Etiqueta"], ["Casos", "Valor", "Finales"]),
        desglose: desgloseSeg,
        bolsa: bolsaSeg,
      };
    });

  return segmentos;
}
