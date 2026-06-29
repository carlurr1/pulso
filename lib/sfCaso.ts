import { sfLogin, sfQuery } from "./salesforce";

// Campos ESTÁNDAR del objeto Case (existen en cualquier org de Salesforce).
// Si más adelante quieres NIT o Grupo (campos personalizados __c), se añaden aquí.
const CASE_FIELDS =
  "CaseNumber, Status, Priority, Type, Reason, Origin, CreatedDate, ClosedDate, IsEscalated, Account.Name, Owner.Name";

export interface CasoSF {
  numero_caso: string;
  cliente: string | null;
  estado: string | null;
  prioridad: string | null;
  tipo: string | null;
  motivo: string | null;
  origen: string | null;
  fecha_creacion: string | null;
  fecha_cierre: string | null;
  escalado: boolean | null;
  owner: string | null;
}

// Consulta uno o varios casos por número en una sola llamada (un solo login).
export async function consultarCasos(numeros: string[]): Promise<CasoSF[]> {
  const limpios = [...new Set(numeros.map((n) => n.trim()).filter(Boolean))];
  if (!limpios.length) return [];
  const session = await sfLogin();
  const inList = limpios.map((n) => `'${n.replace(/'/g, "")}'`).join(",");
  const soql = `SELECT ${CASE_FIELDS} FROM Case WHERE CaseNumber IN (${inList})`;
  const { records } = await sfQuery(session, soql);
  return records.map((r: any) => ({
    numero_caso: String(r.CaseNumber),
    cliente: r.Account?.Name ?? null,
    estado: r.Status ?? null,
    prioridad: r.Priority ?? null,
    tipo: r.Type ?? null,
    motivo: r.Reason ?? null,
    origen: r.Origin ?? null,
    fecha_creacion: r.CreatedDate ?? null,
    fecha_cierre: r.ClosedDate ?? null,
    escalado: typeof r.IsEscalated === "boolean" ? r.IsEscalated : null,
    owner: r.Owner?.Name ?? null,
  }));
}
