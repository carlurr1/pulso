/**
 * Modelo de datos del tablero de comité y paleta visual eTb.
 *
 * La herramienta genera, POR SEGMENTO, las imágenes PNG que se copian/pegan
 * en la presentación de comité (mismo estilo que el corte Silver/Bronce que
 * sirvió de guía). Segmentos objetivo: Mayoristas, Distrito, Élite, Gold,
 * Premium (Silver/Bronce lo saca otra área; aquí solo se usó como referencia).
 */

/** Colores extraídos del tema de la presentación eTb. */
export const eTb = {
  navy: "#00346D", // títulos y encabezados de tabla
  navyClaro: "#0E3875",
  cian: "#0094C0", // acento
  cianClaro: "#2AC3F3",
  naranja: "#FF6523", // marca eTb
  linea: "#2E6E8E", // color de las líneas de las gráficas (petróleo)
  lineaRelleno: "rgba(46,110,142,0.10)",
  dorado: "#8A7D1E", // números grandes de KPI (oliva/dorado)
  gris: "#7C8894",
  grisClaro: "#E6ECEE",
  texto: "#1E2124",
  blanco: "#FFFFFF",
} as const;

/** Un punto de una serie temporal (una etiqueta + su valor). */
export type PuntoSerie = { etiqueta: string; valor: number };

/** Fila del desglose de casos de segundo nivel (COFO / OTROS) por días. */
export type DesgloseFila = { categoria: string; dia: string; cantidad: number };

/** Fila de la bolsa de INC en gestión (estado × días). */
export type BolsaFila = { estado: string; dia: string; cantidad: number };

/** Indicadores numéricos (una fila por segmento en la hoja `Indicadores`). */
export type Indicadores = {
  corte: string;
  nivelServicio: number; // %
  nivelAtencion: number; // %
  ahtSeg: number; // segundos
  ofrecidas: number;
  atendidas: number;
  solicitudesMail: number;
  llamadasAtendidas: number;
  casosCreadosLlamada: number;
  resolutividad: number; // %
  tms: string; // hh:mm:ss
  tmsTelefonicoN1: string;
  tmsCorreoN1: string;
  tmsN2: string;
  primerNivel: number;
  segundoNivel: number;
  // metas (con valores por defecto si el Excel no las trae)
  metaNS: number;
  metaNA: number;
  metaResolutividad: number;
  metaTMS: string;
};

/** Todo lo que necesita un segmento para armar su tablero. */
export type SegmentoData = {
  segmento: string;
  /** Nombre de la campaña en el reporte de llamadas (para autocompletar KPIs). */
  campana?: string;
  indicadores: Indicadores;
  evolutivo: PuntoSerie[]; // "Detalle casos falla técnica" (semanal)
  casosMes: PuntoSerie[]; // "Comportamiento de casos finales por mes"
  desglose: DesgloseFila[]; // COFO / OTROS por días
  bolsa: BolsaFila[]; // bolsa INC en gestión por estado y días
};

/** Metas por defecto (las mismas que muestra la guía Silver/Bronce). */
export const METAS_DEFECTO = {
  metaNS: 80,
  metaNA: 95,
  metaResolutividad: 78,
  metaTMS: "18:00:00",
} as const;
