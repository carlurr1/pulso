/**
 * Muestra la agregación (promedio y total) del reporte diario de llamadas del
 * ACD, por campaña. Útil para verificar los números antes de generar imágenes.
 *
 *   npm run graficas:llamadas -- ./NS_SOPORTE.xls
 */
import fs from "node:fs";
import { leerLlamadas } from "./leer-llamadas";

const ruta = process.argv[2];
if (!ruta || !fs.existsSync(ruta)) {
  console.error("Uso: npm run graficas:llamadas -- <archivo.xls>");
  process.exit(1);
}

const mapa = leerLlamadas(ruta);
if (mapa.size === 0) {
  console.error("No encontré filas de llamadas (revisa las columnas Campaña/Ofrecidas).");
  process.exit(1);
}

for (const a of mapa.values()) {
  console.log(`\nCampaña: ${a.campana}  (${a.dias} días con datos)`);
  console.log("  Lo que va al comité:");
  console.log(`    Ofrecidas ${a.ofrecidasTotal} · Atendidas ${a.atendidasTotal}   (TOTAL del período)`);
  console.log(`    NS ${a.ns.toFixed(2)}% · NA ${a.na.toFixed(2)}% · AHT ${a.aht.toFixed(2)} seg   (PROMEDIO diario)`);
}
