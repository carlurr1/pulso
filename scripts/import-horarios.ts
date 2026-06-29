/**
 * Importa el Excel de turnos a la tabla `horarios`.
 *
 *   npx tsx scripts/import-horarios.ts ./Turnos.xlsx 2026-06-08 ROTACION
 *
 *   arg1 = ruta del .xlsx
 *   arg2 = fecha del LUNES de esa semana (YYYY-MM-DD)
 *   arg3 = nombre de la hoja (opcional; por defecto la primera)
 *
 * Mapea cada persona por su LOGIN operativo (columna "Login": 1646, ETBSOP236…)
 * contra usuarios.code. El tiempo disponible se toma de la columna "th"
 * (horas trabajadas como fracción de día), que ya descuenta el almuerzo:
 *   disponible_min = round(th * 24 * 60).
 *
 * Requiere en el entorno: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const [, , archivo, lunesStr, hojaArg] = process.argv;
if (!archivo || !lunesStr) {
  console.error("Uso: npx tsx scripts/import-horarios.ts <archivo.xlsx> <YYYY-MM-DD lunes> [hoja]");
  process.exit(1);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const fechaDia = (lunes: string, offset: number) => {
  const d = new Date(lunes + "T12:00:00");
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const parseTurno = (s: unknown) => {
  const m = String(s ?? "").match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (!m) return { ini: null, fin: null, turno: null as string | null };
  const pad = (t: string) => (t.length === 4 ? "0" + t : t);
  return { ini: pad(m[1]), fin: pad(m[2]), turno: `${pad(m[1])}-${pad(m[2])}` };
};

async function run() {
  const wb = XLSX.readFile(archivo);
  const hoja = hojaArg ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[hoja], { header: 1 });

  // Trae el mapa code → user_id.
  const { data: users } = await sb.from("usuarios").select("id, code, login");
  const byCode = new Map((users ?? []).map((u) => [String(u.code), u.id]));

  // Columnas (formato hoja ROTACION): A..G = Servicio,Mesa,Rol,Cédula,Nombre,Apellido,Login.
  // Luego, por día, tres columnas: [turno, almuerzo, th]. 7 días = LUN..DOM.
  const LOGIN_COL = 6;
  const DAY0 = 7;          // primera columna de "LUNES"
  const STEP = 3;          // turno, almuerzo, th

  const filas: any[] = [];
  let saltadas = 0;

  for (const row of rows) {
    const login = row?.[LOGIN_COL];
    if (login == null || login === "Login") continue;
    const uid = byCode.get(String(login));
    if (!uid) { saltadas++; continue; }

    for (let dia = 0; dia < 7; dia++) {
      const base = DAY0 + dia * STEP;
      const turnoRaw = row[base];
      const th = Number(row[base + 2]);
      if (!turnoRaw || !th || Number.isNaN(th)) continue;     // descanso ese día
      const { ini, fin, turno } = parseTurno(turnoRaw);
      filas.push({
        user_id: uid,
        fecha: fechaDia(lunesStr, dia),
        turno,
        turno_inicio: ini,
        turno_fin: fin,
        almuerzo_min: 0,
        break_min: 15,
        disponible_min: Math.round(th * 24 * 60),
      });
    }
  }

  if (!filas.length) { console.error("No se generaron filas. Revisa la hoja/columnas."); return; }
  const { error } = await sb.from("horarios").upsert(filas, { onConflict: "user_id,fecha" });
  if (error) throw error;
  console.log(`✓ ${filas.length} horarios cargados. ${saltadas} filas sin usuario (code no encontrado).`);
}
run().catch((e) => { console.error(e); process.exit(1); });
