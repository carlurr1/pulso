/**
 * Construye el HTML (con SVG y CSS embebidos) de cada bloque del tablero, con
 * el estilo visual de la guía Silver/Bronce. Cada bloque capturable lleva el
 * atributo `data-capture="<nombre>"`; el generador lo recorta a PNG.
 */
import { eTb, PuntoSerie, SegmentoData } from "./tipos";

/* --------------------------- formato de números --------------------------- */

/** Formato colombiano: miles con "." y decimales con ",". */
function fmt(n: number, dec = 0): string {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(dec);
  const [ent, decp] = fixed.split(".");
  const entMiles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + (decp ? `${entMiles},${decp}` : entMiles);
}
const pct = (n: number, dec = 2) => `${fmt(n, dec)} %`;

/* ------------------------------ gráfica línea ------------------------------ */

/** Genera un path suave (Catmull-Rom → Bézier) que pasa por todos los puntos. */
function pathSuave(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : "";
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

type OpcGrafica = { clave: string; titulo: string; subtitulo?: string; puntos: PuntoSerie[]; ancho?: number; alto?: number };

export function graficaLinea({ clave, titulo, subtitulo, puntos, ancho = 620, alto = 340 }: OpcGrafica): string {
  const padX = 46;
  const padTop = subtitulo ? 78 : 58;
  const padBottom = 46;
  const w = ancho;
  const h = alto;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;

  const valores = puntos.map((p) => p.valor);
  const max = Math.max(1, ...valores);
  const min = Math.min(0, ...valores);
  const rango = max - min || 1;
  const escY = (v: number) => padTop + innerH - ((v - min) / (rango * 1.18)) * innerH;
  const escX = (i: number) =>
    puntos.length === 1 ? padX + innerW / 2 : padX + (i / (puntos.length - 1)) * innerW;

  const pts = puntos.map((p, i) => ({ x: escX(i), y: escY(p.valor) }));
  const linea = pathSuave(pts);
  const relleno = pts.length
    ? `${linea} L${pts[pts.length - 1].x},${padTop + innerH} L${pts[0].x},${padTop + innerH} Z`
    : "";

  const etiquetasX = puntos
    .map(
      (p, i) =>
        `<text x="${escX(i).toFixed(1)}" y="${(h - padBottom + 24).toFixed(1)}" text-anchor="middle" font-size="15" fill="${eTb.gris}">${p.etiqueta}</text>`
    )
    .join("");

  const etiquetasVal = puntos
    .map(
      (p, i) =>
        `<text x="${escX(i).toFixed(1)}" y="${(escY(p.valor) - 16).toFixed(1)}" text-anchor="middle" font-size="17" font-weight="700" fill="${eTb.navy}">${fmt(p.valor)}</text>`
    )
    .join("");

  const puntosCirc = pts
    .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="${eTb.linea}"/>`)
    .join("");

  return `
  <div class="grafica" data-capture="${clave}">
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${w}" height="${h}" fill="${eTb.blanco}"/>
      <text x="${padX}" y="34" font-size="24" font-weight="800" fill="${eTb.navy}">${titulo}</text>
      ${subtitulo ? `<text x="${padX}" y="60" font-size="15" font-weight="700" fill="${eTb.gris}">${subtitulo}</text>` : ""}
      <path d="${relleno}" fill="${eTb.lineaRelleno}" stroke="none"/>
      <path d="${linea}" fill="none" stroke="${eTb.linea}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${puntosCirc}
      ${etiquetasVal}
      ${etiquetasX}
    </svg>
  </div>`;
}

/* -------------------------------- KPI cards -------------------------------- */

function tile(label: string, valor: string, meta?: string): string {
  return `
    <div class="tile">
      <div class="tile-label">${label}</div>
      <div class="tile-num">${valor}</div>
      ${meta ? `<div class="tile-meta">${meta}</div>` : ""}
    </div>`;
}

export function bloqueKpis(d: SegmentoData): string {
  const k = d.indicadores;
  const ratio = k.casosCreadosLlamada > 0 ? k.llamadasAtendidas / k.casosCreadosLlamada : 0;

  return `
  <div class="panel kpis" data-capture="kpis">
    <div class="panel-head">
      <div>
        <div class="panel-title">Resultados ${d.segmento}</div>
        <div class="panel-sub">Corte ${k.corte || "—"}</div>
      </div>
      <img class="logo" src="__LOGO_ETB__" alt="eTb"/>
    </div>

    <div class="seccion-label">Indicadores de atención</div>
    <div class="tiles">
      ${tile("Nivel de servicio", pct(k.nivelServicio), `Meta: ${fmt(k.metaNS)}%`)}
      ${tile("Nivel de atención", pct(k.nivelAtencion), `Meta: ${fmt(k.metaNA)}%`)}
      ${tile("AHT", `${fmt(k.ahtSeg, 2)} seg`)}
      ${tile("Ofrecidas", fmt(k.ofrecidas))}
      ${tile("Atendidas", fmt(k.atendidas))}
      ${tile("Solicitudes Mail", fmt(k.solicitudesMail))}
    </div>

    <div class="dos-col">
      <div class="mini-tabla">
        <div class="mini-tit">Ratio de contacto telefónico</div>
        <table>
          <tr><td>Total llamadas atendidas</td><td class="der">${fmt(k.llamadasAtendidas)}</td></tr>
          <tr><td>Casos creados por llamada</td><td class="der">${fmt(k.casosCreadosLlamada)}</td></tr>
          <tr class="fila-total"><td>Ratio de contacto</td><td class="der">${fmt(ratio, 2)}</td></tr>
        </table>
      </div>

      <div class="operativos">
        <div class="seccion-label">Indicadores operativos</div>
        <div class="tiles">
          ${tile("Resolutividad", pct(k.resolutividad, 1), `Meta: ${fmt(k.metaResolutividad)}%`)}
          ${tile("TMS", `${k.tms || "—"} hr`, `Meta: ${k.metaTMS} hr`)}
          ${tile("TMS Telefónico N1", `${k.tmsTelefonicoN1 || "—"} hr`)}
          ${tile("TMS Correo N1", `${k.tmsCorreoN1 || "—"} hr`)}
          ${tile("TMS Nivel 2", `${k.tmsN2 || "—"} hr`)}
        </div>
      </div>
    </div>
  </div>`;
}

/* ------------------------- tablas (desglose / bolsa) ----------------------- */

/** Ordena y deduplica los "días" presentes en un conjunto de filas. */
function diasDe(filas: { dia: string }[]): string[] {
  const set = Array.from(new Set(filas.map((f) => f.dia).filter((x) => x !== "")));
  return set.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
}

export function bloqueDesglose(d: SegmentoData): string {
  const k = d.indicadores;
  const total = d.desglose.reduce((s, f) => s + f.cantidad, 0);
  const cofo = d.desglose.filter((f) => f.categoria.includes("COFO"));
  const otros = d.desglose.filter((f) => !f.categoria.includes("COFO"));

  const tablaCat = (nombre: string, filas: typeof d.desglose): string => {
    if (filas.length === 0) return "";
    const dias = diasDe(filas);
    const sub = filas.reduce((s, f) => s + f.cantidad, 0);
    const celda = (dia: string) => fmt(filas.filter((f) => f.dia === dia).reduce((s, f) => s + f.cantidad, 0));
    return `
      <div class="mini-tit">${nombre}</div>
      <table class="tabla-dias">
        <tr class="th"><td>Días</td>${dias.map((x) => `<th>${x}</th>`).join("")}<th>TOTAL</th></tr>
        <tr><td>${nombre}</td>${dias.map((x) => `<td>${celda(x)}</td>`).join("")}<td class="der b">${fmt(sub)}</td></tr>
      </table>`;
  };

  return `
  <div class="panel tabla" data-capture="desglose-n2">
    <div class="panel-title">Detalle casos falla técnica — ${d.segmento}</div>
    <div class="resumen-niveles">
      <div><span class="rn-num">${fmt(k.primerNivel)}</span><span class="rn-lbl">Primer nivel</span></div>
      <div><span class="rn-num">${fmt(k.segundoNivel || total)}</span><span class="rn-lbl">Segundo nivel</span></div>
    </div>
    ${tablaCat("COFO", cofo)}
    ${tablaCat("OTROS", otros)}
  </div>`;
}

export function bloqueBolsa(d: SegmentoData): string {
  if (d.bolsa.length === 0) return "";
  const dias = diasDe(d.bolsa);
  const estados = Array.from(new Set(d.bolsa.map((f) => f.estado).filter(Boolean)));
  const celda = (estado: string, dia: string) =>
    d.bolsa.filter((f) => f.estado === estado && f.dia === dia).reduce((s, f) => s + f.cantidad, 0);
  const totalEstado = (estado: string) => d.bolsa.filter((f) => f.estado === estado).reduce((s, f) => s + f.cantidad, 0);
  const totalDia = (dia: string) => d.bolsa.filter((f) => f.dia === dia).reduce((s, f) => s + f.cantidad, 0);
  const totalGeneral = d.bolsa.reduce((s, f) => s + f.cantidad, 0);

  return `
  <div class="panel tabla" data-capture="bolsa-inc">
    <div class="panel-title">Bolsa actual INC en gestión — ${d.segmento}</div>
    <table class="tabla-dias grande">
      <tr class="th"><td>Estado INC</td>${dias.map((x) => `<th>${x}</th>`).join("")}<th>Total</th></tr>
      ${estados
        .map(
          (e) =>
            `<tr><td class="izq">${e}</td>${dias
              .map((x) => `<td>${celda(e, x) || ""}</td>`)
              .join("")}<td class="der b">${fmt(totalEstado(e))}</td></tr>`
        )
        .join("")}
      <tr class="fila-total"><td class="izq">Total</td>${dias
        .map((x) => `<td>${fmt(totalDia(x))}</td>`)
        .join("")}<td class="der b">${fmt(totalGeneral)}</td></tr>
    </table>
  </div>`;
}

/* ------------------------------ página completa ---------------------------- */

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: ${eTb.texto}; background: ${eTb.grisClaro}; padding: 24px; }
  .segmento { margin-bottom: 40px; }
  .panel, .grafica { background: ${eTb.blanco}; border-radius: 10px; padding: 22px 26px; display: inline-block; vertical-align: top; margin: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .grafica { padding: 12px; }
  .panel-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .panel-title { font-size: 26px; font-weight: 800; color: ${eTb.navy}; }
  .panel-sub { font-size: 15px; font-weight: 700; color: ${eTb.navy}; opacity: .8; }
  .logo { height: 34px; }
  .seccion-label { font-size: 15px; font-weight: 700; color: ${eTb.gris}; text-transform: uppercase; letter-spacing: .5px; margin: 10px 0 8px; }
  .tiles { display: flex; flex-wrap: wrap; gap: 14px; }
  .tile { min-width: 128px; padding: 10px 14px; border-left: 4px solid ${eTb.cian}; background: #F7FAFB; border-radius: 6px; }
  .tile-label { font-size: 12.5px; font-weight: 700; color: ${eTb.gris}; }
  .tile-num { font-size: 30px; font-weight: 800; color: ${eTb.dorado}; line-height: 1.15; }
  .tile-meta { font-size: 11.5px; color: ${eTb.gris}; }
  .dos-col { display: flex; gap: 22px; align-items: flex-start; margin-top: 16px; }
  .mini-tabla table, .tabla-dias { border-collapse: collapse; }
  .mini-tit { font-size: 14px; font-weight: 700; color: ${eTb.navy}; margin: 6px 0; }
  .mini-tabla td { border: 1px solid ${eTb.grisClaro}; padding: 6px 12px; font-size: 14px; }
  .mini-tabla .der { text-align: right; font-weight: 700; }
  .fila-total td { background: ${eTb.navy}; color: ${eTb.blanco}; font-weight: 800; }
  .tabla-dias { margin: 8px 0 14px; }
  .tabla-dias td, .tabla-dias th { border: 1px solid ${eTb.grisClaro}; padding: 7px 12px; font-size: 14px; text-align: center; min-width: 34px; }
  .tabla-dias .th td, .tabla-dias .th th { background: ${eTb.navy}; color: ${eTb.blanco}; font-weight: 800; }
  .tabla-dias .izq { text-align: left; font-weight: 600; }
  .tabla-dias .der.b { font-weight: 800; }
  .resumen-niveles { display: flex; gap: 40px; margin: 8px 0 14px; }
  .rn-num { font-size: 40px; font-weight: 800; color: ${eTb.dorado}; margin-right: 10px; }
  .rn-lbl { font-size: 15px; font-weight: 700; color: ${eTb.gris}; }
`;

export function paginaSegmento(d: SegmentoData): string {
  return `
  <div class="segmento" data-segmento="${d.segmento}">
    ${bloqueKpis(d)}
    ${graficaLinea({ clave: "evolutivo-semanal", titulo: "Detalle casos falla técnica", subtitulo: "Evolutivo casos abiertos", puntos: d.evolutivo })}
    ${graficaLinea({ clave: "casos-finales-mes", titulo: "Comportamiento de casos finales por mes", puntos: d.casosMes })}
    ${bloqueDesglose(d)}
    ${bloqueBolsa(d)}
  </div>`;
}

export function paginaCompleta(segmentos: SegmentoData[], logoEtb: string): string {
  const cuerpo = segmentos.map(paginaSegmento).join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head>
  <body>${cuerpo.replace(/__LOGO_ETB__/g, logoEtb)}</body></html>`;
}
