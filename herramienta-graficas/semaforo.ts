/**
 * Muestra los indicadores operativos por segmento calculados desde el semáforo,
 * para verificar los números antes de generar imágenes. Muestra el correo en
 * ambos modos (todos / solo electrónico) para decidir cuál usar.
 *
 *   npm run graficas:semaforo -- ./ETB_..._Semaforo_Soporte.xlsx
 */
import fs from "node:fs";
import { leerSemaforo } from "./leer-semaforo";

const ruta = process.argv[2];
if (!ruta || !fs.existsSync(ruta)) {
  console.error("Uso: npm run graficas:semaforo -- <semaforo.xlsx>");
  process.exit(1);
}

const todos = leerSemaforo(ruta, "todos");
const elect = leerSemaforo(ruta, "electronico");

if (todos.size === 0) {
  console.error("No encontré casos en la hoja BBDD (revisa la columna BASE/Segmento).");
  process.exit(1);
}

for (const [k, o] of todos) {
  const e = elect.get(k)!;
  console.log(`\n=== ${o.segmento} ===  (cerrados ${o.cerrados} · N1 ${o.n1} · N2 ${o.n2})`);
  console.log(`  Resolutividad (%SNU, Sin COFO): ${o.resolutividad.toFixed(1)} %`);
  console.log(`  TMS general (Sin COFO):         ${o.tms} hr`);
  console.log(`  TMS Telefónico N1:    ${o.tmsTelefonicoN1} hr   (n=${o.nTelefonico})`);
  console.log(`  TMS Correo N1:        ${o.tmsCorreoN1} hr   (n=${o.nCorreo}, incl. Automático)`);
  console.log(`     └ solo "electrónico": ${e.tmsCorreoN1} hr   (n=${e.nCorreo})`);
  console.log(`  TMS Nivel 2:          ${o.tmsN2} hr`);
}
