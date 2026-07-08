/**
 * Crea el Excel de entrada (plantilla) con datos de ejemplo, ya listo para
 * editar. Los segmentos son Mayoristas, Distrito, Élite, Gold y Premium.
 *
 *   npm run graficas:plantilla            → escribe ./plantilla-comite.xlsx
 *   npm run graficas:plantilla -- ruta.xlsx
 *
 * El primer segmento (Mayoristas) trae los números exactos del corte
 * Silver/Bronce que sirvió de guía, para poder comparar el resultado visual.
 */
import * as XLSX from "xlsx";

const SEGMENTOS = ["Mayoristas", "Distrito", "Élite", "Gold", "Premium"];
const CORTE = "26 de junio de 2026";
const SEMANAS = ["Sem 5 May", "Sem 1 Jun", "Sem 2 Jun", "Sem 3 Jun", "Sem 4 Jun"];
const MESES = ["ene-26", "feb-26", "mar-26", "abr-26", "may-26", "jun-26"];

// Base = corte Silver/Bronce de la guía.
const BASE = {
  nivelServicio: 97.98,
  nivelAtencion: 98.75,
  ahtSeg: 644.01,
  ofrecidas: 401,
  atendidas: 396,
  solicitudesMail: 641,
  llamadasAtendidas: 396,
  casosCreadosLlamada: 206,
  resolutividad: 80.0,
  tms: "6:03:56",
  tmsTelefonicoN1: "7:34:21",
  tmsCorreoN1: "5:34:07",
  tmsN2: "10:52:01",
  primerNivel: 0,
  segundoNivel: 18,
  evolutivo: [30, 29, 23, 30, 18],
  casosMes: [67, 58, 35, 36, 30, 18],
};

// Factores por segmento (Mayoristas = 1, real de la guía).
const FACTOR: Record<string, number> = { Mayoristas: 1, Distrito: 0.7, Élite: 0.45, Gold: 1.3, Premium: 0.85 };

// Metas de casos por segmento (Resolutividad %SN1 y TMS). NS/NA son iguales
// para todos (80% / 95%) y se muestran general.
const METAS: Record<string, { resol: number; tms: string }> = {
  Élite: { resol: 87, tms: "10:30:00" },
  Distrito: { resol: 87, tms: "12:00:00" },
  Premium: { resol: 87, tms: "12:00:00" },
  Gold: { resol: 81, tms: "12:30:00" },
  Mayoristas: { resol: 70, tms: "11:30:00" },
};

const r = (n: number) => Math.round(n);

const indicadores = SEGMENTOS.map((seg) => {
  const f = FACTOR[seg];
  return {
    Segmento: seg,
    Campaña: seg, // nombre de la campaña en el reporte de llamadas del ACD
    Corte: CORTE,
    NivelServicio: +(Math.min(99.9, BASE.nivelServicio - (1 - f) * 4)).toFixed(2),
    NivelAtencion: +(Math.min(99.9, BASE.nivelAtencion - (1 - f) * 2)).toFixed(2),
    AHT: +(BASE.ahtSeg * (2 - f) * 0.5 + BASE.ahtSeg * 0.5).toFixed(2),
    Ofrecidas: r(BASE.ofrecidas * f),
    Atendidas: r(BASE.atendidas * f),
    SolicitudesMail: r(BASE.solicitudesMail * f),
    LlamadasAtendidas: r(BASE.atendidas * f),
    CasosCreadosLlamada: r(BASE.casosCreadosLlamada * f),
    Resolutividad: +(Math.min(99, BASE.resolutividad + (f - 1) * 6)).toFixed(1),
    TMS: BASE.tms,
    TMSTelefonicoN1: BASE.tmsTelefonicoN1,
    TMSCorreoN1: BASE.tmsCorreoN1,
    TMSN2: BASE.tmsN2,
    PrimerNivel: r(BASE.primerNivel * f),
    SegundoNivel: r(BASE.segundoNivel * f),
    MetaNS: 80,
    MetaNA: 95,
    MetaResolutividad: METAS[seg]?.resol ?? 78,
    MetaTMS: METAS[seg]?.tms ?? "18:00:00",
  };
});

const evolutivo = SEGMENTOS.flatMap((seg) =>
  SEMANAS.map((periodo, i) => ({ Segmento: seg, Periodo: periodo, Abiertos: r(BASE.evolutivo[i] * FACTOR[seg]) }))
);

const casosMes = SEGMENTOS.flatMap((seg) =>
  MESES.map((mes, i) => ({ Segmento: seg, Mes: mes, Casos: r(BASE.casosMes[i] * FACTOR[seg]) }))
);

// Desglose de segundo nivel (COFO / OTROS por días), escalado por segmento.
const OTROS_BASE: Record<string, number> = { "0": 1, "1": 7, "2": 2, "5": 1, "6": 1, "7": 3 };
const desglose = SEGMENTOS.flatMap((seg) => {
  const f = FACTOR[seg];
  const filas = [{ Segmento: seg, Categoria: "COFO", Dia: "1", Cantidad: Math.max(0, r(3 * f)) }];
  for (const [dia, c] of Object.entries(OTROS_BASE)) {
    filas.push({ Segmento: seg, Categoria: "OTROS", Dia: dia, Cantidad: Math.max(0, r(c * f)) });
  }
  return filas;
});

// Bolsa INC en gestión (estado × días) — ejemplo tomado del slide 3 de la guía.
const BOLSA_BASE: { estado: string; dia: string; cant: number }[] = [
  { estado: "N2 (OTROS)", dia: "1", cant: 6 },
  { estado: "N2 (OTROS)", dia: "2", cant: 1 },
  { estado: "N2 (OTROS)", dia: "5", cant: 1 },
  { estado: "N2 (OTROS)", dia: "7", cant: 2 },
  { estado: "En gestión AISV", dia: "1", cant: 2 },
  { estado: "En gestión AISV", dia: "2", cant: 1 },
  { estado: "En gestión ASC", dia: "1", cant: 1 },
  { estado: "En gestión ASC", dia: "6", cant: 1 },
  { estado: "En gestión ASC", dia: "7", cant: 2 },
  { estado: "Pendiente cierre N2", dia: "0", cant: 1 },
  { estado: "Pendiente cierre N2", dia: "2", cant: 1 },
  { estado: "Pendiente cierre N2", dia: "6", cant: 1 },
  { estado: "Pendiente cierre N2", dia: "7", cant: 1 },
];
const bolsa = SEGMENTOS.flatMap((seg) =>
  BOLSA_BASE.map((b) => ({ Segmento: seg, Estado: b.estado, Dia: b.dia, Cantidad: Math.max(0, r(b.cant * FACTOR[seg])) }))
);

const ruta = process.argv[2] || "plantilla-comite.xlsx";
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(indicadores), "Indicadores");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evolutivo), "Evolutivo");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(casosMes), "CasosMes");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(desglose), "Desglose");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bolsa), "BolsaINC");
XLSX.writeFile(wb, ruta);
console.log(`Plantilla creada: ${ruta}`);
console.log(`Hojas: Indicadores, Evolutivo, CasosMes, Desglose, BolsaINC`);
console.log(`Segmentos: ${SEGMENTOS.join(", ")}`);
