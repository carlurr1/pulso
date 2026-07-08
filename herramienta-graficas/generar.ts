/**
 * Genera las imágenes PNG del tablero de comité, por segmento, a partir de un
 * Excel de entrada.
 *
 *   npm run graficas -- <ruta-del-excel> [carpeta-de-salida]
 *   npm run graficas -- ./datos_comite_junio.xlsx ./salida
 *
 * Salida:  <carpeta>/<Segmento>/<visual>.png
 *   kpis.png · evolutivo-semanal.png · casos-finales-mes.png
 *   desglose-n2.png · bolsa-inc.png
 *
 * Cada PNG se renderiza a 3x (nítido al pegar en PowerPoint).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { leerLibro } from "./leer-excel";
import { paginaCompleta } from "./plantilla";

const ESCALA = 3; // deviceScaleFactor → PNG de alta resolución

/** Ubica el Chromium: variable de entorno o el preinstalado en /opt/pw-browsers. */
function rutaChromium(): string | undefined {
  const env = process.env.PLAYWRIGHT_CHROMIUM || process.env.CHROMIUM_PATH;
  if (env && fs.existsSync(env)) return env;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    const dir = fs
      .readdirSync(base)
      .filter((d) => d.startsWith("chromium-"))
      .sort()
      .pop();
    if (dir) {
      const exe = path.join(base, dir, "chrome-linux", "chrome");
      if (fs.existsSync(exe)) return exe;
    }
  } catch {
    /* usa el que resuelva playwright por defecto */
  }
  return undefined;
}

/** Convierte el logo eTb a data-URI para embeberlo (sin depender de red). */
function logoDataUri(): string {
  const p = path.join(process.cwd(), "public", "etb.png");
  if (!fs.existsSync(p)) return "";
  return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
}

async function main() {
  const [, , archivo, salidaArg] = process.argv;
  if (!archivo) {
    console.error("Uso: npm run graficas -- <ruta-del-excel> [carpeta-de-salida]");
    process.exit(1);
  }
  if (!fs.existsSync(archivo)) {
    console.error(`No existe el archivo: ${archivo}`);
    process.exit(1);
  }

  const salida = path.resolve(salidaArg || "salida");
  const segmentos = leerLibro(archivo);
  if (segmentos.length === 0) {
    console.error("El Excel no tiene segmentos en la hoja 'Indicadores'.");
    process.exit(1);
  }
  console.log(`Segmentos encontrados: ${segmentos.map((s) => s.segmento).join(", ")}`);

  const html = paginaCompleta(segmentos, logoDataUri());

  const exe = rutaChromium();
  const navegador = await chromium.launch({
    executablePath: exe,
    args: ["--no-sandbox", "--force-color-profile=srgb"],
  });
  const pagina = await navegador.newPage({ deviceScaleFactor: ESCALA });
  await pagina.setViewportSize({ width: 1400, height: 900 });
  await pagina.setContent(html, { waitUntil: "networkidle" });

  let total = 0;
  for (const seg of segmentos) {
    const carpeta = path.join(salida, seg.segmento.replace(/[^\w áéíóúñÁÉÍÓÚÑ-]/g, "_"));
    fs.mkdirSync(carpeta, { recursive: true });
    const raiz = pagina.locator(`[data-segmento="${seg.segmento}"]`);
    const bloques = raiz.locator("[data-capture]");
    const n = await bloques.count();
    for (let i = 0; i < n; i++) {
      const bloque = bloques.nth(i);
      const clave = (await bloque.getAttribute("data-capture")) || `bloque-${i}`;
      const destino = path.join(carpeta, `${clave}.png`);
      await bloque.screenshot({ path: destino });
      total++;
      console.log(`  ✓ ${path.relative(process.cwd(), destino)}`);
    }
  }

  await navegador.close();
  console.log(`\nListo: ${total} imágenes en ${path.relative(process.cwd(), salida)}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
